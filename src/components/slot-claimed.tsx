"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import type { SlotClaim } from "@/components/claim-context";
import { CREATORS } from "@/data/creators";
import {
  campaignForAuction,
  setupCampaign,
  type CampaignDto,
} from "@/lib/campaign-client";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";

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
 * the settlement proof and the tracked-link handoff.
 *
 * The tracked link is no longer minted silently with a hardcoded
 * destination. The WINNER configures their campaign (brand, destination,
 * logo) and authorizes it with a wallet signature; the server verifies the
 * signature AND the on-chain win before minting. Visitors without the
 * winner's wallet see the read-only state.
 */
export function SlotClaimed({
  claim,
  logoUrl,
}: {
  claim: SlotClaim;
  logoUrl: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const creator = creatorFor(claim);
  const preview = claim.auction === "PREVIEW";

  const wallet = useWallet();
  const connected = wallet.publicKey?.toBase58() ?? null;
  const isWinner = connected === claim.winner;

  const [campaign, setCampaign] = useState<CampaignDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState("");
  const [destination, setDestination] = useState("");
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    campaignForAuction(claim.auction).then((row) => {
      if (!alive) return;
      setCampaign(row);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [claim.auction]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function submit() {
    if (!wallet.signMessage || !connected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setupCampaign({
        wallet: connected,
        auction: claim.auction,
        brandName: brandName.trim(),
        destination: destination.trim(),
        logoUrl: logo.trim() || undefined,
        signMessage: (m) => wallet.signMessage!(m),
      });
      const row = await campaignForAuction(claim.auction);
      setCampaign(
        row ?? {
          linkId: result.linkId,
          shortUrl: result.shortUrl,
          auction: claim.auction,
          creator: claim.creator,
          wallet: connected,
          brandName: brandName.trim(),
          destination: destination.trim(),
          logoUrl: logo.trim() || null,
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "campaign setup failed");
    } finally {
      setBusy(false);
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

  const linkUrl = campaign
    ? new URL(campaign.shortUrl, window.location.origin).toString()
    : null;

  return (
    <div className="claim-root pointer-events-none fixed inset-0 z-20 overflow-hidden">
      <div aria-hidden className="claim-scrim absolute inset-0" />

      <div className="absolute inset-x-0 top-[4.5rem] flex justify-center px-4">
        <div className="claim-stamp text-center">
          <p className="flex items-center justify-center gap-2.5 text-[28px] font-semibold leading-none tracking-[-0.025em] sm:text-[36px]">
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
            <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em]">
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
          {loading ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <span className="live-dot size-[5px] rounded-full bg-accent" />
                Loading campaign
              </p>
              <div className="claim-shimmer mt-2.5 h-[42px] rounded-[10px] border border-hairline bg-wash" />
            </>
          ) : campaign && linkUrl ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                {campaign.brandName}: tracked link
              </p>
              <div className="claim-link mt-2.5 flex items-center gap-2">
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate rounded-[10px] border border-hairline-strong bg-wash px-3.5 py-2.5 font-mono text-[13px] text-ink transition-colors hover:border-ink"
                >
                  {linkUrl.replace(/^https?:\/\//, "")}
                </a>
                <button
                  type="button"
                  onClick={() => void copy(linkUrl)}
                  className="h-[42px] shrink-0 rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-ash">
                Each visit through this link submits a Solana transaction that
                updates a public counter.
              </p>
            </>
          ) : isWinner ? (
            <>
              <p className="text-[13px] font-medium">Set up your campaign</p>
              <p className="mt-1 text-[12.5px] leading-snug text-ash">
                You won this slot. Configure the brand destination, then sign
                with your wallet to generate the tracked link.
              </p>
              <div className="mt-3 space-y-2">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Brand name"
                  maxLength={40}
                  className="w-full rounded-[10px] border border-hairline-strong bg-wash px-3.5 py-2.5 text-[13px] outline-none placeholder:text-ash focus:border-ink"
                />
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="https://your-site.com/?ref={linkId}"
                  className="w-full rounded-[10px] border border-hairline-strong bg-wash px-3.5 py-2.5 font-mono text-[12.5px] outline-none placeholder:text-ash focus:border-ink"
                />
                <input
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="Logo image URL (optional)"
                  className="w-full rounded-[10px] border border-hairline-strong bg-wash px-3.5 py-2.5 font-mono text-[12.5px] outline-none placeholder:text-ash focus:border-ink"
                />
                <button
                  type="button"
                  disabled={busy || !brandName.trim() || !destination.trim()}
                  onClick={() => void submit()}
                  className="h-[42px] w-full rounded-full bg-ink text-[14px] font-medium text-paper transition-colors hover:bg-[#262626] disabled:opacity-40"
                >
                  {busy ? "Sign in your wallet…" : "Sign & create tracked link"}
                </button>
                {error ? <p className="text-[12.5px] text-[#b3402e]">{error}</p> : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium">Tracked link</p>
              <p className="mt-2.5 rounded-[10px] border border-dashed border-hairline-strong px-3.5 py-2.5 text-[13px] text-graphite">
                The winner{" "}
                <span className="font-mono text-[12.5px]">{shortAddress(claim.winner)}</span>{" "}
                can connect their wallet to configure the campaign and generate
                the tracked link.
              </p>
            </>
          )}

          <p className="mt-2 border-t border-hairline pt-2.5 text-[12px] leading-snug text-ash">
            Solana verifies the auction&rsquo;s recorded financial actions.
            Recorded redirect events are not the same as verified customers.
          </p>
        </div>
      </div>
    </div>
  );
}
