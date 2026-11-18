"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import type { SlotClaim } from "@/components/logo-draft";
import { CREATORS } from "@/data/creators";
import { getOrMintTrackedLink, type TrackedLink } from "@/lib/claim-link";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";

type LinkState =
  | { status: "loading" }
  | { status: "ready"; link: TrackedLink }
  | { status: "offline" };

function creatorFor(claim: SlotClaim) {
  return (
    CREATORS.find((c) => c.auctionCreatorPubkey === claim.creator) ??
    CREATORS.find((c) => c.status === "live") ??
    null
  );
}

function formatSol(sol: number): string {
  return sol.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * The win moment, layered over the product stage:
 * stamp → winning logo flies in and locks onto the placement → card with
 * the settlement proof and the freshly generated tracked link.
 */
export function SlotClaimed({
  claim,
  logoUrl,
}: {
  claim: SlotClaim;
  logoUrl: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [link, setLink] = useState<LinkState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const creator = creatorFor(claim);
  const preview = claim.auction === "PREVIEW";

  useEffect(() => {
    let alive = true;
    setLink({ status: "loading" });
    const destination = new URL(
      `/creator/${creator?.slug ?? ""}`,
      window.location.origin,
    ).toString();
    // Let the reveal land before the link appears.
    const started = Date.now();
    getOrMintTrackedLink(claim.auction, destination).then((result) => {
      const wait = Math.max(0, 1700 - (Date.now() - started));
      window.setTimeout(() => {
        if (!alive) return;
        setLink(result ? { status: "ready", link: result } : { status: "offline" });
      }, wait);
    });
    return () => {
      alive = false;
    };
  }, [claim.auction, creator?.slug]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="claim-pill absolute left-3 top-14 z-20 flex items-center gap-1.5 rounded-full border border-live/40 bg-canvas/80 px-3 py-1.5 text-[11.5px] font-semibold text-live-ink backdrop-blur-md transition-colors hover:border-live/70"
      >
        <CheckIcon className="size-3" />
        Slot claimed · tracked link
      </button>
    );
  }

  return (
    <div className="claim-root pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div aria-hidden className="claim-scrim absolute inset-0" />

      <div className="absolute inset-x-0 top-16 flex flex-col items-center gap-2 px-4 text-center">
        <div className="claim-stamp flex items-center gap-2.5 rounded-full border border-live/50 bg-canvas/70 px-4 py-2 backdrop-blur-md sm:px-5">
          <span className="grid size-5 place-items-center rounded-full bg-live text-canvas sm:size-6">
            <CheckIcon className="size-3 sm:size-3.5" />
          </span>
          <span className="text-[15px] font-bold tracking-[0.22em] text-fg sm:text-[19px]">
            SLOT CLAIMED
          </span>
        </div>
      </div>

      {logoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            aria-hidden
            className="claim-logo absolute left-1/2 top-[41%] h-auto w-[22%] max-w-[180px] object-contain"
          />
          <span
            aria-hidden
            className="claim-lock absolute left-1/2 top-[41%] size-24 rounded-full border-2 border-live"
          />
        </>
      ) : null}

      <div
        role="status"
        aria-live="polite"
        className="claim-card pointer-events-auto absolute inset-x-3 bottom-[4.25rem] mx-auto max-w-[460px] rounded-[18px] border border-line-strong bg-panel/95 p-3.5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-live-ink">
              {preview
                ? "Winning bid · preview"
                : `${creator ? `${creator.name} · ` : ""}settled on devnet`}
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
              {formatSol(claim.amountSol)}{" "}
              <span className="text-[13px] font-medium text-fg-3">SOL</span>
            </p>
            <p className="mt-1.5 truncate text-[12px] text-fg-3">
              <span className="font-mono text-fg-2">{shortAddress(claim.winner)}</span>{" "}
              wins · paid to{" "}
              {creator ? creator.name : <span className="font-mono">{shortAddress(claim.creator)}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!preview ? (
              <a
                href={
                  claim.settleSignature
                    ? explorerTx(claim.settleSignature)
                    : explorerAddress(claim.auction)
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[11.5px] text-fg-2 transition-colors hover:border-live/50 hover:text-fg"
              >
                {claim.settleSignature ? "Settle tx" : "Auction"}
                <ExternalIcon className="size-3" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Hide"
              className="grid size-7 place-items-center rounded-full text-fg-3 transition-colors hover:bg-panel-2 hover:text-fg"
            >
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-2">
            {link.status === "ready" ? (
              <>
                <CheckIcon className="size-3 text-live-ink" />
                Tracked link generated
              </>
            ) : link.status === "loading" ? (
              <>
                <span className="live-dot size-1.5 rounded-full bg-live" />
                Generating tracked link…
              </>
            ) : (
              "Tracked link"
            )}
          </p>

          {link.status === "ready" ? (
            <div className="claim-link mt-2 flex items-center gap-1.5">
              <a
                href={link.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate rounded-[10px] border border-live/35 bg-live/[0.07] px-3 py-2 font-mono text-[12.5px] text-live-ink hover:underline"
              >
                {link.link.url.replace(/^https?:\/\//, "")}
              </a>
              <button
                type="button"
                onClick={() => void copy(link.link.url)}
                className="h-[34px] shrink-0 rounded-[10px] bg-live px-3 text-[12px] font-semibold text-canvas transition-colors hover:bg-live-ink"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : link.status === "loading" ? (
            <div className="claim-shimmer mt-2 h-[34px] rounded-[10px] border border-line bg-panel-2" />
          ) : (
            <p className="mt-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-[12px] text-fg-3">
              Link service isn&rsquo;t connected on this build yet.
            </p>
          )}

          <p className="mt-2 text-[11.5px] leading-snug text-fg-3">
            Every click through this link is counted on Solana. That count
            becomes {creator ? `${creator.name}’s` : "the creator’s"} conversion.
          </p>
        </div>
      </div>
    </div>
  );
}
