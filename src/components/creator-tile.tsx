"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import type { Creator } from "@/data/creators";
import { subscribe } from "@/lib/ticker";

export type TileLive = {
  /** Highest bid in SOL from the on-chain auction; null = no bids yet. */
  currentBidSol: number | null;
  /** Unix seconds the on-chain auction closes; null falls back to nextVideoAt. */
  auctionEndsAt: number | null;
  watchers: number;
  /** Change `id` to flash a new bid on the tile and count up to amountSol. */
  lastBid: { id: number; amountSol: number } | null;
  /** Devnet tx signature of the latest on-chain bid; absent for seeded data. */
  bidSignature?: string | null;
};

type Props = {
  creator: Creator;
  live: TileLive;
  /** Mount the <video> element (near the viewport). */
  mountVideo?: boolean;
  /** Tile is on screen: play the clip and run the ticker. */
  active?: boolean;
  /** False under prefers-reduced-motion: static sparkline and counter. */
  animate?: boolean;
};

const SPARK_W = 100;
const SPARK_H = 30;
const SPARK_PAD = 4;
const STEP_MS = 1600;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sparkPaths(
  v: number[],
  head: number,
  frac: number,
  lo: number,
  hi: number,
) {
  const n = v.length - 1;
  const dx = SPARK_W / n;
  const span = hi - lo || 1;
  const y = (val: number) =>
    SPARK_PAD + (1 - (val - lo) / span) * (SPARK_H - SPARK_PAD * 2);
  let line = "";
  for (let i = 0; i <= n; i++) {
    line += `${i ? "L" : "M"}${((i - frac) * dx).toFixed(2)},${y(v[i]).toFixed(2)}`;
  }
  const headY = y(head);
  line += `L${SPARK_W},${headY.toFixed(2)}`;
  const area = `${line}L${SPARK_W},${SPARK_H}L${(-frac * dx).toFixed(2)},${SPARK_H}Z`;
  return { line, area, headY };
}

function staticSpark(momentum: number[]) {
  return sparkPaths(
    momentum,
    momentum[momentum.length - 1],
    0,
    Math.min(...momentum),
    Math.max(...momentum),
  );
}

type Sim = {
  v: number[];
  next: number;
  frac: number;
  lo: number;
  hi: number;
  rnd: () => number;
  drift: number;
  level: number;
  noise: number;
  spike: number;
  headLabel: string;
};

function createSim(creator: Creator): Sim {
  const rnd = mulberry32(hashString(creator.slug));
  const v = creator.momentum.slice();
  const drift = creator.trendPct / 100 / v.length;
  const sim: Sim = {
    v,
    next: 0,
    frac: rnd(),
    lo: Math.min(...v),
    hi: Math.max(...v),
    rnd,
    drift,
    level: v[v.length - 1],
    noise: 0,
    spike: 0,
    headLabel: "",
  };
  sim.next = nextPoint(sim);
  return sim;
}

function nextPoint(sim: Sim): number {
  // Same shape as the seeded history: drifting level, noise, decaying post spikes.
  sim.level *= 1 + sim.drift;
  sim.noise = sim.noise * 0.75 + (sim.rnd() - 0.5) * 0.12;
  if (sim.rnd() < 0.07) sim.spike += 0.15 + sim.rnd() * 0.5;
  const value = sim.level * (1 + sim.noise) * (1 + sim.spike);
  sim.spike *= 0.6;
  return value;
}

function formatCountdown(seconds: number, endedLabel: string): string {
  if (seconds <= 0) return endedLabel;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatSol(sol: number): string {
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function compact(n: number): string {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

const LABEL =
  "text-[9px] font-medium uppercase tracking-[0.14em] text-fg-3";
const CHIP =
  "rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/85 ring-1 ring-white/10 backdrop-blur-md";

type SparkInit = ReturnType<typeof staticSpark>;

function ChainIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.7.7M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.5 8.8a2.6 2.6 0 0 0 3.7 3.7l.7-.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Simulated views/day line. The tile's rAF loop writes into these refs. */
function Sparkline({
  slug,
  initial,
  initialHead,
  animate,
  lineRef,
  areaRef,
  dotRef,
  headRef,
}: {
  slug: string;
  initial: SparkInit;
  initialHead: number;
  animate: boolean;
  lineRef: React.RefObject<SVGPathElement | null>;
  areaRef: React.RefObject<SVGPathElement | null>;
  dotRef: React.RefObject<HTMLSpanElement | null>;
  headRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const gradientId = `spark-fill-${slug}`;
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <p className={LABEL}>Views / day · 30d</p>
        <p className="text-[10.5px] font-medium tabular-nums text-fg-2">
          <span ref={headRef} suppressHydrationWarning>
            {compact(initialHead)}
          </span>
        </p>
      </div>
      <div
        className={`relative ${animate ? "spark-reveal" : ""}`}
        style={{ height: SPARK_H }}
      >
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          aria-hidden
          className="spark-svg block size-full overflow-hidden"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.14" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[1 / 3, 2 / 3].map((f) => (
            <line
              key={f}
              x1="0"
              x2={SPARK_W}
              y1={SPARK_H * f}
              y2={SPARK_H * f}
              stroke="#ffffff"
              strokeOpacity="0.06"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path ref={areaRef} d={initial.area} fill={`url(#${gradientId})`} />
          <path
            ref={lineRef}
            d={initial.line}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.85"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          ref={dotRef}
          aria-hidden
          className="spark-dot absolute right-0 top-0"
          style={{
            transform: `translate3d(0,${initial.headY.toFixed(2)}px,0)`,
          }}
        />
      </div>
    </div>
  );
}

function CreatorTileImpl({
  creator,
  live,
  mountVideo = true,
  active = true,
  animate = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const simRef = useRef<Sim | null>(null);
  const bidRef = useRef<HTMLSpanElement>(null);
  const bidDisplayedRef = useRef<number>(live.currentBidSol ?? 0);
  const [videoOn, setVideoOn] = useState(false);

  const isLive = creator.status === "live";
  const countdownTarget = live.auctionEndsAt ?? creator.nextVideoAt;
  const endedLabel = isLive ? "Ended" : "Dropping";
  const initial = staticSpark(creator.momentum);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => setVideoOn(false));
    else video.pause();
  }, [active, mountVideo]);

  useEffect(() => {
    if (!active) return;
    const sim = (simRef.current ??= createSim(creator));
    let lastSecond = -1;

    return subscribe((dt) => {
      const second = Math.floor(Date.now() / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        const remaining = countdownTarget - second;
        const cd = countdownRef.current;
        if (cd) {
          cd.textContent = formatCountdown(remaining, endedLabel);
          if (isLive)
            cd.dataset.urgent = remaining > 0 && remaining < 3600 ? "1" : "";
        }
      }

      // Ease the big bid number up to the live target.
      if (bidRef.current && live.currentBidSol !== null) {
        const target = live.currentBidSol;
        const cur = bidDisplayedRef.current;
        if (Math.abs(target - cur) > 0.0005) {
          const k = 1 - Math.exp(-dt / 180);
          const next = cur + (target - cur) * k;
          bidDisplayedRef.current = next;
          bidRef.current.textContent = formatSol(next);
        }
      }

      if (!animate) return;

      sim.frac += dt / STEP_MS;
      if (sim.frac >= 1) {
        sim.frac -= 1;
        sim.v.push(sim.next);
        sim.v.shift();
        sim.next = nextPoint(sim);
      }
      const n = sim.v.length - 1;
      const head = sim.v[n] + (sim.next - sim.v[n]) * sim.frac;
      let lo = head;
      let hi = head;
      for (let i = 0; i <= n; i++) {
        if (sim.v[i] < lo) lo = sim.v[i];
        if (sim.v[i] > hi) hi = sim.v[i];
      }
      // Ease the y-range so the line never jumps when a point scrolls off.
      const k = 1 - Math.exp(-dt / 350);
      sim.lo += (lo - sim.lo) * k;
      sim.hi += (hi - sim.hi) * k;
      const paths = sparkPaths(sim.v, head, sim.frac, sim.lo, sim.hi);
      lineRef.current?.setAttribute("d", paths.line);
      const headLabel = compact(head);
      if (headLabel !== sim.headLabel && headRef.current) {
        sim.headLabel = headLabel;
        headRef.current.textContent = headLabel;
      }
      areaRef.current?.setAttribute("d", paths.area);
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(0,${paths.headY.toFixed(2)}px,0)`;
      }
    });
  }, [
    active,
    animate,
    creator,
    countdownTarget,
    endedLabel,
    isLive,
    live.currentBidSol,
  ]);

  return (
    <article
      className={`tile group relative flex flex-col rounded-[18px] border p-1.5 text-fg transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        isLive
          ? "border-live/30 bg-raised shadow-[0_0_0_1px_rgb(20_241_149/0.06),0_24px_60px_-28px_rgb(20_241_149/0.45)] hover:border-live/50"
          : "border-line bg-raised hover:border-line-strong hover:shadow-[0_20px_44px_-18px_rgb(0_0_0/0.8)]"
      }`}
    >
      {live.lastBid ? (
        <span
          key={live.lastBid.id}
          aria-hidden
          className="tile-bid-ring pointer-events-none absolute -inset-px z-10 rounded-[18px]"
        />
      ) : null}

      <div className="relative isolate aspect-[5/4] overflow-hidden rounded-[13px] bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creator.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className="absolute inset-0 -z-10 size-full object-cover object-[50%_22%]"
        />
        {mountVideo ? (
          <video
            ref={videoRef}
            src={creator.clipUrl}
            poster={creator.posterUrl}
            muted
            playsInline
            loop
            preload="metadata"
            aria-hidden
            tabIndex={-1}
            onPlaying={() => setVideoOn(true)}
            onPause={() => setVideoOn(false)}
            onError={() => setVideoOn(false)}
            className={`absolute inset-0 -z-10 size-full object-cover object-[50%_22%] transition-opacity duration-500 ${videoOn ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}
        {/* Bottom scrim keeps the chips and clip legible on bright posters. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[5] bg-gradient-to-b from-black/35 via-transparent to-black/25"
        />
        <div className="flex items-center justify-between gap-2 p-2">
          {isLive ? (
            <span className="live-badge flex items-center gap-1.5 rounded-full bg-live px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-canvas">
              <span className="live-dot size-1.5 rounded-full bg-canvas" />
              LIVE AUCTION
            </span>
          ) : (
            <span className={`${CHIP} tracking-[0.1em]`}>SOON</span>
          )}
          <span
            className={`${CHIP} text-[10.5px] tabular-nums ${creator.trendPct < 0 ? "!text-alert" : "!text-live-ink"}`}
            title="Views / day, 30-day trend"
          >
            {creator.trendPct < 0 ? "▼" : "▲"} {Math.abs(creator.trendPct)}%
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 px-0.5 pb-1 pt-2.5 sm:gap-2.5 sm:px-1">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={creator.avatarUrl}
            alt=""
            className="size-7 shrink-0 rounded-full ring-1 ring-white/10 sm:size-8"
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] sm:text-[14px]">
              {creator.name}
            </p>
            <p className="truncate text-[11px] leading-tight text-fg-3">
              {creator.niche} · {compact(creator.followers)} followers
            </p>
          </div>
        </div>

        {/* Conversion slot: fills with real on-chain click-counter data.
            Until then, a muted placeholder instead of invented numbers. */}
        <div
          className="conv-slot rounded-t-[12px] border border-b-0 border-live/20 bg-gradient-to-b from-live/[0.08] to-live/[0.02] px-2.5 pb-2 pt-2"
          data-empty={creator.conversionPct === null}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className={LABEL}>Conversion</p>
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#c4c1ba]">
              no data yet
            </p>
          </div>
          <p className="mt-0.5 text-[17px] font-semibold leading-none tracking-normal text-[#b3b0aa] sm:text-[19px]">
            {creator.conversionPct !== null
              ? `${creator.conversionPct.toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <p className="-mt-2 flex items-center gap-1.5 rounded-b-[12px] border border-t-0 border-live/20 bg-live/[0.03] px-2.5 pb-1.5 pt-1 text-[10px] leading-tight text-fg-3 sm:-mt-2.5">
          <ChainIcon className="size-3 shrink-0 text-live/70" />
          <span className="truncate">
            Tracked clicks on Solana, not followers
          </span>
        </p>

        <Sparkline
          slug={creator.slug}
          initial={initial}
          initialHead={creator.momentum[creator.momentum.length - 1]}
          animate={animate}
          lineRef={lineRef}
          areaRef={areaRef}
          dotRef={dotRef}
          headRef={headRef}
        />

        {isLive ? (
          <div className="rounded-[12px] border border-line bg-panel p-2 sm:p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className={LABEL}>Current bid</p>
              <p className={LABEL}>Ends in</p>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p
                className={`text-[19px] font-semibold tabular-nums tracking-[-0.02em] sm:text-[22px] ${live.lastBid ? "bid-pop" : ""}`}
                key={live.lastBid?.id ?? "initial"}
              >
                <span ref={bidRef} suppressHydrationWarning>
                  {formatSol(live.currentBidSol ?? 0)}
                </span>{" "}
                <span className="text-[12px] font-medium text-fg-3">SOL</span>
              </p>
              <p
                className="font-mono text-[12px] font-medium tabular-nums text-fg-2 countdown-live"
                data-urgent-color
              >
                <span ref={countdownRef} suppressHydrationWarning>
                  --:--:--
                </span>
              </p>
            </div>
            {live.bidSignature ? (
              <a
                href={`https://explorer.solana.com/tx/${live.bidSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-live-ink hover:underline"
              >
                view on Explorer ↗
              </a>
            ) : null}
            <Link
              href={`/creator/${creator.slug}`}
              className="mt-2 flex h-[34px] items-center justify-center rounded-full bg-live text-[12.5px] font-semibold text-canvas transition-[background-color,transform] hover:bg-live-ink active:scale-[0.98]"
            >
              Place bid
            </Link>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fg-3">
              <span className="live-dot size-1.5 shrink-0 rounded-full bg-live" />
              <span className="truncate">
                <span className="tabular-nums text-fg-2">
                  {live.watchers}
                </span>{" "}
                brands watching
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-2 border-t border-line pt-2">
              <div className="min-w-0">
                <p className={LABEL}>Auction</p>
                <p className="truncate text-[12px] font-semibold text-fg-2 sm:text-[13px]">
                  Opens soon
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={LABEL}>Next video</p>
                <p className="font-mono text-[11.5px] font-medium tabular-nums text-fg-2 sm:text-[12px]">
                  <span ref={countdownRef} suppressHydrationWarning>
                    --:--:--
                  </span>
                </p>
              </div>
            </div>
            <div className="relative h-4 overflow-hidden text-[11px] leading-4">
              <p className="flex items-center gap-1.5 text-fg-3">
                <span className="live-dot size-1.5 shrink-0 rounded-full bg-live/70" />
                <span className="truncate">
                  <span className="tabular-nums text-fg-2">
                    {live.watchers}
                  </span>{" "}
                  brands watching
                </span>
              </p>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export const CreatorTile = memo(CreatorTileImpl);
