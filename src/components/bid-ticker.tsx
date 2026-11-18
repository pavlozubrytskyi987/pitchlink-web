"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  formatAgo,
  makeSeededBid,
  pushSeededBid,
  seedInitialFeed,
  subscribeFeed,
  type BidEntry,
} from "@/lib/bid-feed";
import { CheckIcon } from "@/components/icons";
import { explorerTx, shortAddress } from "@/lib/explorer";
import { subscribe as subscribeTicker } from "@/lib/ticker";

const SPEED_PX_PER_SEC = 38;

// Deterministic PRNG so first-paint HTML matches hydration.
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

function formatSol(sol: number): string {
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

const CHIP =
  "flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] leading-none";

function RealChip({ entry, now }: { entry: BidEntry; now: number }) {
  const signature = entry.signature!;
  return (
    <a
      href={explorerTx(signature)}
      target="_blank"
      rel="noopener noreferrer"
      title="Verified devnet transaction. Opens Solana Explorer."
      className={`${CHIP} group/chip border-live/30 bg-live/[0.07] text-fg transition-colors hover:border-live/60 hover:bg-live/[0.12]`}
    >
      <span className="flex items-center gap-1 rounded-full bg-live px-1.5 py-[3px] text-[9px] font-bold tracking-[0.1em] text-canvas">
        <CheckIcon className="size-2.5" />
        ON-CHAIN
      </span>
      <span className="font-mono text-[11px] text-fg-2">{entry.bidder}</span>
      <span>
        bid{" "}
        <span className="font-semibold tabular-nums">
          {formatSol(entry.amountSol)} SOL
        </span>{" "}
        on <span className="font-semibold">{entry.creatorName}</span>
      </span>
      <span className="text-[11px] text-fg-3">
        {formatAgo(Math.max(0, now - entry.ts))}
      </span>
      <span className="font-mono text-[11px] text-live-ink group-hover/chip:underline">
        tx {shortAddress(signature)} ↗
      </span>
    </a>
  );
}

function SimChip({ entry, now }: { entry: BidEntry; now: number }) {
  return (
    <span
      className={`${CHIP} border-line bg-raised text-fg-3`}
      title="Simulated activity, not on-chain"
    >
      <span className="rounded-full border border-line-strong px-1.5 py-[2px] text-[8.5px] font-semibold tracking-[0.12em] text-fg-3">
        SIM
      </span>
      <span className="font-mono text-[11px]">{entry.bidder}</span>
      <span>
        watching{" "}
        <Link
          href={`/creator/${entry.creatorSlug}`}
          className="font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline"
        >
          {entry.creatorName}
        </Link>
      </span>
      <span className="text-[11px]">
        {formatAgo(Math.max(0, now - entry.ts))}
      </span>
    </span>
  );
}

function Chip({ entry, now }: { entry: BidEntry; now: number }) {
  return entry.signature ? (
    <RealChip entry={entry} now={now} />
  ) : (
    <SimChip entry={entry} now={now} />
  );
}

export function BidTicker() {
  const [entries, setEntries] = useState<BidEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);

  // Client-side init so SSR HTML is stable (empty) and first paint matches.
  useEffect(() => {
    const rnd = mulberry32(Math.floor(Math.random() * 0x7fffffff));
    seedInitialFeed(rnd);
    setMounted(true);
  }, []);

  useEffect(() => subscribeFeed(setEntries), []);

  // Push a new simulated watch event every 5–9 s. One shared interval.
  useEffect(() => {
    if (!mounted) return;
    let timeoutId = 0;
    const tick = () => {
      pushSeededBid(makeSeededBid(Math.random));
      timeoutId = window.setTimeout(tick, 5000 + Math.random() * 4000);
    };
    timeoutId = window.setTimeout(tick, 5000 + Math.random() * 4000);
    return () => window.clearTimeout(timeoutId);
  }, [mounted]);

  // Slow re-tick of relative times (1 Hz) — cheap, keeps "Xs ago" accurate.
  useEffect(() => {
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Marquee driven by the shared rAF ticker. Moves the track via transform;
  // when the first copy has fully scrolled off the left, wrap by its width.
  useLayoutEffect(() => {
    if (!mounted) return;
    return subscribeTicker((dt) => {
      if (pausedRef.current) return;
      const track = trackRef.current;
      const copy = copyRef.current;
      if (!track || !copy) return;
      const copyW = copy.scrollWidth;
      if (copyW === 0) return;
      offsetRef.current -= (SPEED_PX_PER_SEC * dt) / 1000;
      if (offsetRef.current <= -copyW) offsetRef.current += copyW;
      track.style.transform = `translate3d(${offsetRef.current.toFixed(2)}px,0,0)`;
    });
  }, [mounted]);

  const latestReal = entries.find((e) => e.signature !== null) ?? null;

  return (
    <div
      className="relative border-t border-line bg-canvas/60"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
    >
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-1.5 sm:px-6">
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-3">
          <span className="live-dot size-1.5 rounded-full bg-live" />
          <span className="hidden sm:inline">Market</span>
          <span className="sm:hidden">Live</span>
        </div>
        {latestReal ? (
          <div className="hidden shrink-0 items-center gap-2 border-r border-line pr-3 lg:flex">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-3">
              Latest on-chain
            </span>
            <RealChip entry={latestReal} now={now} />
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-canvas to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-canvas to-transparent" />
          <div
            ref={trackRef}
            className="flex items-center gap-2 will-change-transform"
            aria-label="Recent market activity"
          >
            {mounted && entries.length ? (
              <>
                <div ref={copyRef} className="flex shrink-0 items-center gap-2 pr-2">
                  {entries.map((e) => (
                    <Chip key={e.id} entry={e} now={now} />
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2 pr-2" aria-hidden inert>
                  {entries.map((e) => (
                    <Chip key={`dup-${e.id}`} entry={e} now={now} />
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[26px]" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
