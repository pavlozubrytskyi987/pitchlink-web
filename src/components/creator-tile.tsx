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
  /** Unix seconds the on-chain auction closes; null = not open. */
  auctionEndsAt: number | null;
  /** Change `id` to flash a new bid on the tile and count up to amountSol. */
  lastBid: { id: number; amountSol: number } | null;
  /** Devnet tx signature of the latest on-chain bid; absent for seeded data. */
  bidSignature?: string | null;
  /** Real on-chain click count across this creator's tracked links; null = no link yet. */
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
  /** Tile is on screen: play the clip. */
  active?: boolean;
  /** False under prefers-reduced-motion: no animated counters. */
  animate?: boolean;
};

const LABEL = "text-[12.5px] text-graphite";

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

function CreatorTileImpl({
  creator,
  live,
  mountVideo = true,
  active = true,
  animate = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const bidRef = useRef<HTMLSpanElement>(null);
  const bidDisplayedRef = useRef<number>(live.currentBidSol ?? 0);
  const [videoOn, setVideoOn] = useState(false);

  const isLive = creator.status === "live";
  const countdownTarget = live.auctionEndsAt;
  const endedLabel = live.settled ? "Settled" : "Ended";
  const realMedia = !creator.posterUrl.startsWith("data:");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => setVideoOn(false));
    else video.pause();
  }, [active, mountVideo]);

  useEffect(() => {
    if (!active || !isLive) return;
    let lastSecond = -1;
    return subscribe((dt) => {
      const second = Math.floor(Date.now() / 1000);
      if (second !== lastSecond && countdownTarget !== null) {
        lastSecond = second;
        const remaining = countdownTarget - second;
        const cd = countdownRef.current;
        if (cd) {
          cd.textContent = formatCountdown(remaining, endedLabel);
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
    });
  }, [active, animate, countdownTarget, endedLabel, isLive, live.currentBidSol]);

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
            <p className="text-[22px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">
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
          <h3 className="truncate text-[18px] font-semibold leading-tight tracking-[-0.015em] sm:text-[20px]">
            {creator.name}
          </h3>
          <p className="hidden shrink-0 text-[12.5px] text-ash sm:block">
            {creator.handle}
          </p>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-graphite">
          {creator.niche}
        </p>

        {/* Conversion slot: integer click count from the on-chain ClickCounter
            PDA, live via the clickRecorded event (via live.onchainClicks).
            Styled from .conv-slot CSS so the bound value line never moves. */}
        <div
          className="conv-slot mt-5 border-t border-ink pt-3"
          data-empty={live.onchainClicks == null || live.onchainClicks === 0}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className={LABEL}>Recorded redirect events</p>
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
          These records show counter updates on Solana. They don&rsquo;t
          independently verify human traffic or customer acquisition.
        </p>

        {isLive ? (
          <div className="mt-5 border-t border-hairline pt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
              <p className={LABEL}>Current bid</p>
              <p className={`${LABEL} text-right`}>Closes in</p>
              <p
                className={`mt-1.5 whitespace-nowrap text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[30px] ${live.lastBid ? "bid-pop" : ""}`}
                key={live.lastBid?.id ?? "initial"}
              >
                {live.currentBidSol !== null && live.currentBidSol > 0 ? (
                  <>
                    <span ref={bidRef} suppressHydrationWarning>
                      {formatSol(live.currentBidSol)}
                    </span>{" "}
                    <span className="font-sans text-[13px] tracking-normal text-graphite">
                      SOL
                    </span>
                  </>
                ) : (
                  <span className="text-[15px] font-medium tracking-normal text-ash">
                    {live.currentBidSol === null ? "—" : "No bids yet"}
                  </span>
                )}
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
          </div>
        ) : (
          <div className="mt-5 border-t border-hairline pt-3">
            <p className={LABEL}>Auction</p>
            <p className="mt-1.5 text-[14px]">Opens soon</p>
          </div>
        )}
      </div>
    </article>
  );
}

export const CreatorTile = memo(CreatorTileImpl);
