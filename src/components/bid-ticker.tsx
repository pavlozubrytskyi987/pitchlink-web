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
import { subscribe as subscribeTicker } from "@/lib/ticker";

const SPEED_PX_PER_SEC = 42;

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

function Chip({ entry, now }: { entry: BidEntry; now: number }) {
  const real = entry.signature !== null;
  const ago = Math.max(0, now - entry.ts);
  const base =
    "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] leading-none";
  const look = real
    ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[#1c1c1c]"
    : "border-[#e9e7e2] bg-[#f5f4f2] text-[#5f5d58]";
  return (
    <span className={`${base} ${look}`}>
      {real ? (
        <span
          className="live-dot shrink-0 text-[10px] font-semibold tracking-[0.1em] text-[var(--accent-ink)]"
          title="On-chain bid"
        >
          ⚡ LIVE
        </span>
      ) : (
        <span
          className="size-1.5 shrink-0 rounded-full bg-[#c8c6c0]"
          aria-hidden
        />
      )}
      <span className="font-mono text-[11px] tabular-nums text-[#8d8d8d]">
        {entry.bidder}
      </span>
      <span>
        bid{" "}
        <span className="font-semibold tabular-nums text-[#1c1c1c]">
          {entry.amountSol.toFixed(2)} SOL
        </span>{" "}
        on{" "}
        <Link
          href={`/creator/${entry.creatorSlug}`}
          className="font-semibold text-[#1c1c1c] underline-offset-2 hover:underline"
        >
          {entry.creatorName}
        </Link>
      </span>
      <span className="text-[11px] text-[#a09d96]">{formatAgo(ago)}</span>
      {real && entry.signature ? (
        <a
          href={`https://explorer.solana.com/tx/${entry.signature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[11px] font-medium text-[var(--accent-ink)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          view on Explorer ↗
        </a>
      ) : null}
    </span>
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
    seedInitialFeed(rnd, 18);
    setMounted(true);
  }, []);

  useEffect(() => subscribeFeed(setEntries), []);

  // Push a new seeded bid every 4–7 s. One shared interval.
  useEffect(() => {
    if (!mounted) return;
    let timeoutId = 0;
    const tick = () => {
      pushSeededBid(makeSeededBid(Math.random));
      timeoutId = window.setTimeout(tick, 4000 + Math.random() * 3000);
    };
    timeoutId = window.setTimeout(tick, 4000 + Math.random() * 3000);
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

  return (
    <div
      className="relative border-b border-[#f0efec] bg-white"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
    >
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2 sm:px-6">
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d8d8d]">
          <span className="live-dot size-1.5 rounded-full bg-[var(--accent)]" />
          <span className="hidden sm:inline">Live market activity</span>
          <span className="sm:hidden">Live</span>
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent" />
          <div
            ref={trackRef}
            className="flex items-center gap-2 will-change-transform"
            aria-label="Recent bids"
          >
            {mounted && entries.length ? (
              <>
                <div ref={copyRef} className="flex shrink-0 items-center gap-2">
                  {entries.map((e) => (
                    <Chip key={e.id} entry={e} now={now} />
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2" aria-hidden>
                  {entries.map((e) => (
                    <Chip key={`dup-${e.id}`} entry={e} now={now} />
                  ))}
                </div>
              </>
            ) : (
              <div className="h-7" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
