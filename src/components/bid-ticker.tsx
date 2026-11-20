"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  formatAgo,
  subscribeFeed,
  type BidEntry,
} from "@/lib/bid-feed";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { explorerTx, shortAddress } from "@/lib/explorer";
import { subscribe as subscribeTicker } from "@/lib/ticker";

const SPEED_PX_PER_SEC = 38;

function formatSol(sol: number): string {
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function RealChip({ entry, now }: { entry: BidEntry; now: number }) {
  return (
    <a
      href={explorerTx(entry.signature)}
      target="_blank"
      rel="noopener noreferrer"
      title="Verified on Solana devnet. Opens the transaction on Solana Explorer."
      className="group/chip flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-5 text-[13px] leading-none text-ink"
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
        {shortAddress(entry.signature)}
        <ExternalIcon className="size-3" />
      </span>
    </a>
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

  useEffect(() => setMounted(true), []);
  useEffect(() => subscribeFeed(setEntries), []);

  // Slow re-tick of relative times (1 Hz) — cheap, keeps "Xs ago" accurate.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Marquee driven by the shared rAF ticker. Only runs if there's something to show.
  useLayoutEffect(() => {
    if (!mounted || !entries.length) return;
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
  }, [mounted, entries.length]);

  const empty = !entries.length;

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
        <div className="relative h-full min-w-0 flex-1 overflow-hidden border-l border-hairline">
          {empty ? (
            <p className="flex h-full items-center pl-5 text-[13px] text-ash">
              Watching for new bids — each confirmed bid appears here with its Explorer link.
            </p>
          ) : (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-paper to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-paper to-transparent" />
              <div
                ref={trackRef}
                className="flex h-full items-center will-change-transform"
                aria-label="Recent on-chain bids"
              >
                <div
                  ref={copyRef}
                  className="flex shrink-0 items-center divide-x divide-hairline"
                >
                  {entries.map((e) => (
                    <RealChip key={e.id} entry={e} now={now} />
                  ))}
                </div>
                <div
                  className="flex shrink-0 items-center divide-x divide-hairline border-l border-hairline"
                  aria-hidden
                  inert
                >
                  {entries.map((e) => (
                    <RealChip key={`dup-${e.id}`} entry={e} now={now} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
