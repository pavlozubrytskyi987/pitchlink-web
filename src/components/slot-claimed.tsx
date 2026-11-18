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
    getOrMintTrackedLink(claim.auction, destination, claim.creator).then((result) => {
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
        className="claim-pill absolute left-4 top-16 z-20 inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-[13px] text-accent shadow-[0_1px_3px_rgb(0_0_0/0.08)] transition-colors hover:text-ink"
      >
        <CheckIcon className="size-3" />
        Slot claimed. Show tracked link
      </button>
    );
  }

  return (
    <div className="claim-root pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div aria-hidden className="claim-scrim absolute inset-0" />

      <div className="absolute inset-x-0 top-[4.5rem] flex justify-center px-4">
        <div className="claim-stamp text-center">
          <p className="flex items-center justify-center gap-2.5 font-serif text-[34px] leading-none tracking-[-0.02em] sm:text-[46px]">
            <span className="grid size-6 place-items-center rounded-full bg-accent text-paper sm:size-7">
              <CheckIcon className="size-3.5 sm:size-4" />
            </span>
            Slot claimed
          </p>
          <span aria-hidden className="claim-rule mx-auto mt-3 block h-px w-full bg-ink" />
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
            className="claim-lock absolute left-1/2 top-[41%] size-24 rounded-full border border-accent"
          />
        </>
      ) : null}

      <div
        role="status"
        aria-live="polite"
        className="claim-card pointer-events-auto absolute inset-x-4 bottom-[4.5rem] mx-auto max-w-[440px] rounded-[14px] border border-hairline bg-paper p-5 shadow-[0_28px_70px_-30px_rgb(0_0_0/0.35)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12.5px] text-graphite">
              {preview
                ? "Winning bid (preview)"
                : `Winning bid${creator ? `, ${creator.name}` : ""}`}
            </p>
            <p className="mt-1.5 font-serif text-[36px] leading-none tracking-[-0.025em]">
              {formatSol(claim.amountSol)}{" "}
              <span className="font-sans text-[14px] tracking-normal text-graphite">SOL</span>
            </p>
            <p className="mt-2 truncate text-[13px] text-graphite">
              <span className="font-mono text-[12.5px] text-ink">{shortAddress(claim.winner)}</span>{" "}
              won. Paid to{" "}
              {creator ? creator.name : <span className="font-mono">{shortAddress(claim.creator)}</span>}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide"
            className="-mr-1.5 -mt-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ash transition-colors hover:bg-wash hover:text-ink"
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!preview ? (
          <a
            href={
              claim.settleSignature
                ? explorerTx(claim.settleSignature)
                : explorerAddress(claim.auction)
            }
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-3 inline-flex items-center gap-1.5 text-[13px] text-accent"
          >
            <CheckIcon className="size-3" />
            Settled on Solana
            <span className="font-mono text-[12px] underline decoration-accent/30 underline-offset-4 group-hover:decoration-accent">
              {shortAddress(claim.settleSignature ?? claim.auction)}
            </span>
            <ExternalIcon className="size-3" />
          </a>
        ) : null}

        <div className="mt-4 border-t border-hairline pt-4">
          <p className="flex items-center gap-1.5 text-[13px] font-medium">
            {link.status === "ready" ? (
              <>Tracked link generated</>
            ) : link.status === "loading" ? (
              <>
                <span className="live-dot size-[5px] rounded-full bg-accent" />
                Generating tracked link
              </>
            ) : (
              "Tracked link"
            )}
          </p>

          {link.status === "ready" ? (
            <div className="claim-link mt-2.5 flex items-center gap-2">
              <a
                href={link.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate rounded-[10px] border border-hairline-strong bg-wash px-3.5 py-2.5 font-mono text-[13px] text-ink transition-colors hover:border-ink"
              >
                {link.link.url.replace(/^https?:\/\//, "")}
              </a>
              <button
                type="button"
                onClick={() => void copy(link.link.url)}
                className="h-[42px] shrink-0 rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : link.status === "loading" ? (
            <div className="claim-shimmer mt-2.5 h-[42px] rounded-[10px] border border-hairline bg-wash" />
          ) : (
            <p className="mt-2.5 rounded-[10px] border border-dashed border-hairline-strong px-3.5 py-2.5 text-[13px] text-graphite">
              The link service isn&rsquo;t connected on this build yet.
            </p>
          )}

          <p className="mt-2.5 text-[12.5px] leading-snug text-ash">
            Each click through this link is recorded on Solana and becomes{" "}
            {creator ? `${creator.name}’s` : "the creator’s"} conversion.
          </p>
        </div>
      </div>
    </div>
  );
}
