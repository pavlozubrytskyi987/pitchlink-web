"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import type { Creator } from "@/data/creators";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";
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
  /** Real on-chain click count for this creator's tracked links; null = no data. */
  onchainClicks?: number | null;
  /** Devnet auction account (PDA) backing this tile, when it is real. */
  auctionAddress?: string | null;
  /** True once the on-chain auction has paid out. */
  settled?: boolean;
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

const LABEL = "text-[12.5px] text-graphite";

type SparkInit = ReturnType<typeof staticSpark>;

/** Simulated views/day line. The tile's rAF loop writes into these refs. */
function Sparkline({
  initial,
  initialHead,
  lineRef,
  areaRef,
  dotRef,
  headRef,
}: {
  initial: SparkInit;
  initialHead: number;
  lineRef: React.RefObject<SVGPathElement | null>;
  areaRef: React.RefObject<SVGPathElement | null>;
  dotRef: React.RefObject<HTMLSpanElement | null>;
  headRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-ash">Views a day, 30 days</p>
        <p className="text-[12.5px] text-graphite">
          <span ref={headRef} suppressHydrationWarning>
            {compact(initialHead)}
          </span>
        </p>
      </div>
      <div className="relative" style={{ height: SPARK_H }}>
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          aria-hidden
          className="spark-svg block size-full overflow-hidden"
        >
          <path ref={areaRef} d={initial.area} fill="#000" fillOpacity="0.035" />
          <path
            ref={lineRef}
            d={initial.line}
            fill="none"
            stroke="#000"
            strokeOpacity="0.55"
            strokeWidth="1.1"
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
  // The live tile waits for its real end time instead of showing a guess.
  const countdownTarget =
    live.auctionEndsAt ?? (isLive ? null : creator.nextVideoAt);
  const endedLabel = isLive ? (live.settled ? "Settled" : "Ended") : "Dropping";
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
        const remaining =
          countdownTarget === null ? null : countdownTarget - second;
        const cd = countdownRef.current;
        if (cd && remaining !== null) {
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

  // Only real footage gets the media slot; seeded creators get a plate.
  const realMedia = !creator.posterUrl.startsWith("data:");

  return (
    <article className="tile relative flex flex-col text-ink">
      {live.lastBid ? (
        <span
          key={live.lastBid.id}
          aria-hidden
          className="tile-bid-ring pointer-events-none absolute -inset-2.5 z-10 rounded-[14px]"
        />
      ) : null}

      <div className="relative isolate aspect-[5/4] overflow-hidden rounded-[10px] bg-wash">
        {realMedia ? (
          <>
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
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
            <p className="font-serif text-[26px] italic leading-none tracking-[-0.01em] sm:text-[34px]">
              {creator.niche}
            </p>
          </div>
        )}
        {isLive ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-accent shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
            <span className="live-dot size-[5px] rounded-full bg-accent" />
            Live auction
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col pt-4">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <h3 className="truncate font-serif text-[21px] leading-tight tracking-[-0.015em] sm:text-[24px]">
            {creator.name}
          </h3>
          <p className="hidden shrink-0 text-[12.5px] text-ash sm:block">
            {compact(creator.followers)} followers
          </p>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-graphite">
          {realMedia ? `${creator.niche}, ${creator.handle}` : creator.handle}
        </p>

        {/* Conversion slot: integer click count from the on-chain ClickCounter
            PDA, live via the clickRecorded event (via live.onchainClicks). */}
        <div
          className="conv-slot mt-5 border-t border-ink pt-3"
          data-empty={live.onchainClicks == null || live.onchainClicks === 0}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className={LABEL}>Clicks on-chain</p>
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#c4c1ba]">
              {live.onchainClicks == null ? "no link yet" : "live"}
            </p>
          </div>
          <p className="mt-0.5 text-[17px] font-semibold leading-none tracking-normal text-[#b3b0aa] sm:text-[19px]">
            {live.onchainClicks == null
              ? "—"
              : live.onchainClicks.toLocaleString("en-US")}
          </p>
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-ash">
          Verified clicks through this creator&rsquo;s tracked link, counted on Solana.
        </p>

        <div className="mt-5">
          <Sparkline
            initial={initial}
            initialHead={creator.momentum[creator.momentum.length - 1]}
            lineRef={lineRef}
            areaRef={areaRef}
            dotRef={dotRef}
            headRef={headRef}
          />
        </div>

        {isLive ? (
          <div className="mt-5 border-t border-hairline pt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
              <p className={LABEL}>Current bid</p>
              <p className={`${LABEL} text-right`}>Closes in</p>
                <p
                  className={`mt-1.5 whitespace-nowrap font-serif text-[28px] leading-none tracking-[-0.02em] sm:text-[32px] ${live.lastBid ? "bid-pop" : ""}`}
                  key={live.lastBid?.id ?? "initial"}
                >
                  <span ref={bidRef} suppressHydrationWarning>
                    {live.currentBidSol === null
                      ? "—"
                      : formatSol(live.currentBidSol)}
                  </span>{" "}
                  <span className="font-sans text-[13px] tracking-normal text-graphite">
                    SOL
                  </span>
                </p>
                <p className="countdown-live text-right text-[15px] tabular-nums" data-urgent-color>
                  <span ref={countdownRef} suppressHydrationWarning>
                    --:--:--
                  </span>
                </p>
            </div>
            {live.bidSignature || live.auctionAddress ? (
              <a
                href={
                  live.bidSignature
                    ? explorerTx(live.bidSignature)
                    : explorerAddress(live.auctionAddress!)
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Opens Solana Explorer (devnet)"
                className="group/proof mt-3 flex min-w-0 items-center gap-1.5 text-[12.5px] text-accent"
              >
                <CheckIcon className="size-3 shrink-0" />
                <span className="shrink-0">Verified on Solana</span>
                <span className="hidden truncate font-mono text-[12px] underline decoration-accent/30 underline-offset-4 group-hover/proof:decoration-accent sm:inline">
                  {shortAddress(live.bidSignature ?? live.auctionAddress!)}
                </span>
                <ExternalIcon className="size-3 shrink-0" />
              </a>
            ) : null}
            <Link
              href={creator.auctionCreatorPubkey ? "/auction" : `/creator/${creator.slug}`}
              className="mt-4 flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
            >
              Place bid
            </Link>
            <p className="mt-2.5 text-[12.5px] text-ash">
              {live.watchers} brands
              watching
            </p>
          </div>
        ) : (
          <div className="mt-5 border-t border-hairline pt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
              <p className={`${LABEL} hidden sm:block`}>Auction</p>
              <p className={`${LABEL} sm:text-right`}>Next video in</p>
              <p className="mt-1.5 hidden truncate text-[14px] sm:block">Opens soon</p>
              <p className="text-[14px] tabular-nums sm:mt-1.5 sm:text-right">
                <span ref={countdownRef} suppressHydrationWarning>
                  --:--:--
                </span>
              </p>
            </div>
            <p className="mt-2.5 text-[12.5px] text-ash">
              {live.watchers} brands
              watching
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export const CreatorTile = memo(CreatorTileImpl);
