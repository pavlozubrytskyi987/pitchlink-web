"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import type { Creator } from "@/data/creators";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";
import type { HeroAuction } from "@/lib/use-hero-auction";

const LABEL = "text-[12.5px] text-graphite";

/**
 * Compact homepage card for the single live sponsorship. Real data only:
 * identity from the creator directory, auction state from the on-chain
 * account, redirect count from the ClickCounter PDAs. No thumbnail, no
 * invented metrics.
 */
export function SponsorshipCard({
  creator,
  chain,
  clicks,
  bidSignature,
}: {
  creator: Creator;
  chain: HeroAuction | null;
  clicks: number | null;
  bidSignature: string | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasBid = Boolean(chain && chain.currentBidSol > 0);
  const remaining = chain && now !== null ? chain.endsAt - now : null;
  const status = !chain
    ? null
    : chain.settled
      ? "settled"
      : remaining !== null && remaining <= 0
        ? "ended"
        : "live";

  return (
    <article className="max-w-[760px] rounded-[14px] border border-hairline bg-paper p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={creator.avatarUrl}
            alt=""
            className="size-10 shrink-0 rounded-full border border-hairline object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-tight">{creator.name}</p>
            <p className="truncate text-[12.5px] text-graphite">{creator.handle}</p>
          </div>
        </div>
        {status ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
              status === "live"
                ? "border-accent/30 text-accent"
                : "border-hairline-strong text-graphite"
            }`}
          >
            {status === "live" ? (
              <span className="live-dot size-[5px] rounded-full bg-accent" />
            ) : null}
            {status === "live" ? "Live auction" : status === "settled" ? "Settled" : "Ended"}
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-[22px] font-semibold leading-snug tracking-[-0.02em]">
        Sponsor {creator.name}&rsquo;s next video
      </h3>
      <p className="mt-1 text-[13.5px] text-graphite">
        {creator.niche} · Placement: video sponsorship
      </p>

      <ul className="mt-4 space-y-1.5 text-[13.5px] leading-[1.5] text-graphite">
        <li className="flex gap-2.5">
          <span className="mt-[8px] size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
          <span>Sponsor placement in the creator&rsquo;s next video</span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-[8px] size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
          <span>Tracked advertiser link — confirmed visits update a public on-chain counter</span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-[8px] size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
          <span>Public auction records, inspectable on Solana Explorer</span>
        </li>
      </ul>

      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-hairline pt-4">
        <div>
          <p className={LABEL}>Highest bid</p>
          <p className="mt-1 text-[20px] font-semibold leading-none tracking-[-0.02em]">
            {chain && hasBid ? (
              <>
                {chain.currentBidSol.toLocaleString("en-US", { maximumFractionDigits: 3 })}{" "}
                <span className="text-[12.5px] font-normal text-graphite">SOL</span>
              </>
            ) : (
              <span className="text-[15px] font-medium text-ash">No bids yet</span>
            )}
          </p>
        </div>
        <div>
          <p className={LABEL}>{status === "live" ? "Closes in" : "Status"}</p>
          <p className="mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-[-0.02em]">
            {status === "live" && remaining !== null ? (
              formatCountdown(remaining)
            ) : status === "settled" ? (
              <span className="text-[15px] font-medium text-accent">Settled</span>
            ) : status === "ended" ? (
              <span className="text-[15px] font-medium text-graphite">Ended</span>
            ) : (
              <span className="text-[15px] font-medium text-ash">—</span>
            )}
          </p>
        </div>
        <div>
          <p className={LABEL}>Recorded redirect events</p>
          <p className="mt-1 text-[20px] font-semibold leading-none tracking-[-0.02em]">
            {clicks === null ? (
              <span className="text-[15px] font-medium text-ash">—</span>
            ) : (
              clicks.toLocaleString("en-US")
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/auction"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
        >
          View auction
          <span aria-hidden>→</span>
        </Link>
        {chain ? (
          <a
            href={explorerAddress(chain.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-[12.5px] text-accent"
            title="Auction account on Solana Explorer (devnet)"
          >
            <CheckIcon className="size-3 shrink-0" />
            <span className="font-mono text-[12px] underline decoration-accent/30 underline-offset-4 group-hover:decoration-accent">
              {shortAddress(chain.address)}
            </span>
            <ExternalIcon className="size-3 shrink-0" />
          </a>
        ) : null}
        {bidSignature ? (
          <a
            href={explorerTx(bidSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-[12.5px] text-accent"
            title="Latest bid on Solana Explorer (devnet)"
          >
            <span>Latest bid</span>
            <span className="font-mono text-[12px] underline decoration-accent/30 underline-offset-4 group-hover:decoration-accent">
              {shortAddress(bidSignature)}
            </span>
            <ExternalIcon className="size-3 shrink-0" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Ended";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
