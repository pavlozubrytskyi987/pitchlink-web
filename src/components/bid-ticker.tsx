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
import { CheckIcon, ExternalIcon } from "@/components/icons";
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

const ITEM =
  "flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-5 text-[13px] leading-none";

function RealChip({ entry, now }: { entry: BidEntry; now: number }) {
  const signature = entry.signature!;
  return (
    <a
      href={explorerTx(signature)}
      target="_blank"
      rel="noopener noreferrer"
      title="Verified on Solana devnet. Opens the transaction on Solana Explorer."
      className={`${ITEM} group/chip text-ink`}
    >
      <CheckIcon className="size-3 shrink-0 translate-y-[1px] text-accent" />
      <span className="font-mono text-[12px] text-graphite">{entry.bidder}</span>
      <span>
        bid{" "}
        <span className="font-medium">
          {formatSol(entry.amountSol)} SOL
        </span>{" "}
        on {entry.creatorName}
      </span>
      <span className="text-ash">{formatAgo(Math.max(0, now - entry.ts))}</span>
      <span className="inline-flex items-center gap-1 font-mono text-[12px] text-accent underline decoration-accent/30 underline-offset-4 group-hover/chip:decoration-accent">
        {shortAddress(signature)}
        <ExternalIcon className="size-3" />
      </span>
    </a>
  );
}

function SimChip({ entry, now }: { entry: BidEntry; now: number }) {
  return (
    <span className={`${ITEM} text-ash`} title="Simulated activity, not on-chain">
      <span className="text-[12px] italic">simulated</span>
      <span className="font-mono text-[12px]">{entry.bidder}</span>
      <span>
        watching{" "}
        <Link
          href={`/creator/${entry.creatorSlug}`}
          className="text-graphite underline-offset-4 hover:text-ink hover:underline"
        >
          {entry.creatorName}
        </Link>
      </span>
      <span>{formatAgo(Math.max(0, now - entry.ts))}</span>
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
      className="relative border-t border-hairline"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
    >
      <div className="mx-auto flex h-10 max-w-[1320px] items-center px-5 sm:px-8">
        <span className="shrink-0 pr-5 text-[13px] text-graphite">Market</span>
        {latestReal ? (
          <div className="hidden shrink-0 items-center border-l border-hairline lg:flex">
            <RealChip entry={latestReal} now={now} />
          </div>
        ) : null}
        <div className="relative h-full min-w-0 flex-1 overflow-hidden border-l border-hairline">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-paper to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-paper to-transparent" />
          <div
            ref={trackRef}
            className="flex h-full items-center will-change-transform"
            aria-label="Recent market activity"
          >
            {mounted && entries.length ? (
              <>
                <div
                  ref={copyRef}
                  className="flex shrink-0 items-center divide-x divide-hairline"
                >
                  {entries.map((e) => (
                    <Chip key={e.id} entry={e} now={now} />
                  ))}
                </div>
                <div
                  className="flex shrink-0 items-center divide-x divide-hairline border-l border-hairline"
                  aria-hidden
                  inert
                >
                  {entries.map((e) => (
                    <Chip key={`dup-${e.id}`} entry={e} now={now} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
