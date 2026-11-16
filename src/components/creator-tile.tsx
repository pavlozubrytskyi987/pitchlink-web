"use client";

import { Fragment, memo, useEffect, useRef, useState } from "react";
import type { Creator } from "@/data/creators";
import { subscribe } from "@/lib/ticker";

export type TileLive = {
  /** Highest bid in SOL from the on-chain auction; null = no live auction. */
  currentBidSol: number | null;
  /** Unix seconds the on-chain auction closes; null = no live auction. */
  auctionEndsAt: number | null;
  watchers: number;
  /** Change `id` to flash a new bid on the tile. */
  lastBid: { id: number; amountSol: number } | null;
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
const SPARK_H = 46;
const SPARK_PAD = 5;
const STEP_MS = 1600;
const ODO_UNIT_EM = 1.15;
const ODO_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

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
  impressions: number;
  impressionsPerMs: number;
  rnd: () => number;
  drift: number;
  level: number;
  noise: number;
  spike: number;
  headLabel: string;
  odoCache: number[];
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
    impressions: creator.totalImpressions,
    impressionsPerMs: v[v.length - 1] / 9000 / 1000,
    rnd,
    drift,
    level: v[v.length - 1],
    noise: 0,
    spike: 0,
    headLabel: "",
    odoCache: [],
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

function writeOdometer(cols: HTMLElement[], cache: number[], value: number) {
  for (let k = 0; k < cols.length; k++) {
    const p = 10 ** k;
    const digit = Math.floor(value / p) % 10;
    // A wheel only turns while the wheel to its right rolls from 9 to 0.
    const roll = k === 0 ? value % 1 : Math.max(0, (value % p) - (p - 1));
    const pos = Math.round((digit + roll) * 100) / 100;
    if (cache[k] !== pos) {
      cache[k] = pos;
      cols[k].style.transform =
        `translate3d(0,${(-pos * ODO_UNIT_EM).toFixed(3)}em,0)`;
    }
  }
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

function Odometer({
  value,
  rootRef,
}: {
  value: number;
  rootRef: React.Ref<HTMLSpanElement>;
}) {
  const chars = Math.floor(value).toString().split("");
  return (
    <span
      ref={rootRef}
      role="img"
      aria-label={`${Math.floor(value).toLocaleString("en-US")} impressions`}
      className="odo"
    >
      {chars.map((ch, i) => {
        const place = chars.length - 1 - i;
        return (
          <Fragment key={place}>
            <span className="odo-window" aria-hidden>
              <span
                data-place={place}
                className="odo-col"
                style={{
                  transform: `translate3d(0,${-Number(ch) * ODO_UNIT_EM}em,0)`,
                  willChange: place < 3 ? "transform" : undefined,
                }}
              >
                {ODO_DIGITS.map((d, j) => (
                  <span key={j}>{d}</span>
                ))}
              </span>
            </span>
            {place > 0 && place % 3 === 0 ? <span aria-hidden>,</span> : null}
          </Fragment>
        );
      })}
    </span>
  );
}

const LABEL =
  "text-[9px] font-medium uppercase tracking-[0.14em] text-[#a09d96]";
const CHIP =
  "rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold backdrop-blur-sm";

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
  const odoRef = useRef<HTMLSpanElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const simRef = useRef<Sim | null>(null);
  const [videoOn, setVideoOn] = useState(false);

  const isLive = live.currentBidSol !== null && live.auctionEndsAt !== null;
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
    const cols: HTMLElement[] = [];
    odoRef.current
      ?.querySelectorAll<HTMLElement>("[data-place]")
      .forEach((el) => {
        cols[Number(el.dataset.place)] = el;
      });
    let lastSecond = -1;

    return subscribe((dt) => {
      const second = Math.floor(Date.now() / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        if (countdownRef.current) {
          countdownRef.current.textContent = formatCountdown(
            countdownTarget - second,
            endedLabel,
          );
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

      sim.impressions +=
        sim.impressionsPerMs * dt * (1 + 0.6 * Math.sin(sim.impressions / 37));
      writeOdometer(cols, sim.odoCache, sim.impressions);
    });
  }, [active, animate, creator, countdownTarget, endedLabel]);

  const gradientId = `spark-fill-${creator.slug}`;

  return (
    <article className="tile group relative flex flex-col rounded-[20px] border border-[#e9e7e2] bg-[#f5f4f2] p-1.5 text-[#1c1c1c] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-[#d9d6cf] hover:shadow-[0_16px_36px_rgba(28,28,28,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {live.lastBid ? (
        <span
          key={live.lastBid.id}
          aria-hidden
          className="tile-bid-ring pointer-events-none absolute -inset-px z-10 rounded-[20px]"
        />
      ) : null}

      <div className="relative isolate aspect-[4/5] overflow-hidden rounded-[14px] bg-[#e6e4df]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creator.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className="absolute inset-0 -z-10 size-full object-cover"
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
            className={`absolute inset-0 -z-10 size-full object-cover transition-opacity duration-500 ${videoOn ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}
        <div className="flex items-center justify-between gap-2 p-2">
          {isLive ? (
            <span
              className={`${CHIP} flex items-center gap-1.5 tracking-[0.1em]`}
            >
              <span className="live-dot size-1.5 rounded-full bg-[#ff3b30]" />
              LIVE
            </span>
          ) : (
            <span className={`${CHIP} tracking-[0.1em] text-[#8d8d8d]`}>
              SOON
            </span>
          )}
          <span
            className={`${CHIP} text-[11px] tabular-nums ${creator.trendPct < 0 ? "text-[#c4320a]" : "text-[var(--accent-ink)]"}`}
          >
            {creator.trendPct < 0 ? "▼" : "▲"} {Math.abs(creator.trendPct)}%
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 px-1.5 pb-1.5 pt-2.5 sm:gap-2.5 sm:px-2 sm:pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={creator.avatarUrl}
            alt=""
            className="size-7 shrink-0 rounded-full sm:size-8"
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight sm:text-sm">
              {creator.name}
            </p>
            <p className="truncate text-[11px] leading-tight text-[#8d8d8d]">
              {creator.niche} · {compact(creator.followers)} followers
            </p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className={LABEL}>Views / day · 30d</p>
            <p className="text-[11px] font-semibold tabular-nums">
              <span ref={headRef} suppressHydrationWarning>
                {compact(creator.momentum[creator.momentum.length - 1])}
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
                  <stop
                    offset="0"
                    stopColor="var(--accent)"
                    stopOpacity="0.16"
                  />
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
                  stroke="#1c1c1c"
                  strokeOpacity="0.07"
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path
                ref={areaRef}
                d={initial.area}
                fill={`url(#${gradientId})`}
              />
              <path
                ref={lineRef}
                d={initial.line}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.75"
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

        <div>
          <p className={LABEL}>Impressions</p>
          <p className="mt-0.5 text-[17px] font-semibold tracking-tight sm:text-[19px]">
            <Odometer value={creator.totalImpressions} rootRef={odoRef} />
          </p>
        </div>

        <div className="flex items-end justify-between gap-2 border-t border-[#e6e4df] pt-2">
          <div className="min-w-0">
            <p className={LABEL}>{isLive ? "Current bid" : "Auction"}</p>
            <p className="truncate text-[12px] font-semibold tabular-nums sm:text-[13px]">
              {isLive ? (
                <>
                  {formatSol(live.currentBidSol!)}{" "}
                  <span className="text-[#8d8d8d]">SOL</span>
                </>
              ) : (
                "Opens soon"
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={LABEL}>{isLive ? "Ends in" : "Next video"}</p>
            <p
              className={`text-[12px] font-semibold tabular-nums sm:text-[13px] ${isLive ? "text-[var(--accent-ink)]" : ""}`}
            >
              <span ref={countdownRef} suppressHydrationWarning>
                --:--:--
              </span>
            </p>
          </div>
        </div>

        <div className="relative h-4 overflow-hidden text-[11px] leading-4">
          <p className="flex items-center gap-1.5 text-[#8d8d8d]">
            <span className="live-dot size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <span className="truncate">
              <span className="tabular-nums text-[#1c1c1c]">
                {live.watchers}
              </span>{" "}
              brands watching
            </span>
          </p>
          {live.lastBid ? (
            <p
              key={live.lastBid.id}
              className="bid-flash absolute inset-0 truncate bg-[#f5f4f2] font-semibold text-[var(--accent-ink)]"
            >
              New bid · {formatSol(live.lastBid.amountSol)} SOL
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export const CreatorTile = memo(CreatorTileImpl);
