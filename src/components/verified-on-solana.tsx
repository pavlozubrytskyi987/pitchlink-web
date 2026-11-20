"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ExternalIcon } from "@/components/icons";
import { PROGRAM_ID } from "@/lib/config";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";
import type { BidRecord } from "@/lib/program";

const LIFECYCLE = [
  {
    title: "Advertiser bids SOL",
    body: "place_bid moves lamports from the bidder into the auction's treasury PDA.",
  },
  {
    title: "Funds enter program-controlled escrow",
    body: "The treasury is a program-derived account. No person holds the bid.",
  },
  {
    title: "A higher bid atomically refunds the previous bidder",
    body: "The same transaction escrows the new bid and returns the old one.",
  },
  {
    title: "Settlement pays the creator",
    body: "After the deadline anyone can call settle_auction; the program pays escrow to the creator.",
  },
  {
    title: "Tracked-link visits update a public counter",
    body: "Each redirect submits a transaction; confirmed increments update a public ClickCounter PDA.",
  },
];

/**
 * Real, previously confirmed devnet transactions from this deployed program.
 * Signatures only — if one were unavailable, the item would be omitted
 * rather than faked.
 */
const PROOFS: { title: string; body: string; signature: string }[] = [
  {
    title: "Atomic outbid refund",
    body: "One transaction escrows a 0.06 SOL bid and refunds the previous 0.05 SOL bid in full.",
    signature:
      "3ZNiLSkx3Lfz3TQA3irZcuV7ShqqEsHzGsVhJr52tRjFCXEtW5qUDXQM5tQFC1hMp968Pu1mhNcDnthiWgXQRARc",
  },
  {
    title: "Creator settlement",
    body: "After expiry, the treasury PDA pays the 0.05 SOL winning bid to the creator.",
    signature:
      "45safFAyiajhaC973JG4fNtSczKeGcXsjbeSVuGWZupTSJKRLzYsdWNzpmcQp6e1jzzXjnect3L2SjyWDndWE3mn",
  },
  {
    title: "ClickCounter increment",
    body: "A tracked-link redirect confirms a counter update on the link's ClickCounter PDA.",
    signature:
      "2tdRZSzvXsrrw62QwkTbWHQPQ1pUviHcp5x9mmRUZJBxBNrWd9r9DZnTxkcLS1cPW43FsQSPwfiBxxBZdQVd9F6u",
  },
];

type LinkRow = { id: string; creator: string; clicks: number };

/**
 * "Verified on Solana" — the transaction lifecycle plus the real, checkable
 * addresses behind it. Every link opens devnet Explorer; nothing is mocked.
 */
export function VerifiedOnSolana({
  auctionAddress,
  creatorPubkey,
}: {
  auctionAddress: string | null;
  creatorPubkey: string | null;
}) {
  const { connection } = useConnection();
  const [recent, setRecent] = useState<BidRecord[]>([]);
  const [clickCounter, setClickCounter] = useState<{
    pda: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const program = await import("@/lib/program");
      const bids = await program.getAllBids(connection, 12).catch(() => []);
      if (alive) setRecent(bids.slice(0, 3));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [connection]);

  useEffect(() => {
    if (!creatorPubkey) return;
    let alive = true;
    (async () => {
      const res = await fetch("/api/links");
      if (!res.ok) return;
      const rows = (await res.json()) as LinkRow[];
      const row = rows.find((r) => r.creator === creatorPubkey);
      if (!row) return;
      const program = await import("@/lib/program");
      if (alive) {
        setClickCounter({
          pda: program.clickCounterPda(row.id).toBase58(),
          count: row.clicks ?? 0,
        });
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [creatorPubkey]);

  return (
    <section aria-label="Verified on Solana" className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-4">
        <h2 className="text-[24px] font-semibold leading-none tracking-[-0.025em] sm:text-[28px]">
          Verified on Solana
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ash">
          Devnet
        </span>
      </div>

      <ol className="mt-2 grid gap-px border-b border-hairline sm:grid-cols-5">
        {LIFECYCLE.map((step, i) => (
          <li
            key={step.title}
            className="py-5 sm:py-6 sm:pr-6 [&+li]:border-t [&+li]:border-hairline sm:[&+li]:border-l sm:[&+li]:border-t-0 sm:[&+li]:pl-5"
          >
            <span className="text-[13px] font-medium tabular-nums text-ash">
              {i + 1}
            </span>
            <p className="mt-2 text-[14px] font-medium leading-snug">{step.title}</p>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-graphite">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <p className="text-[12.5px] uppercase tracking-[0.12em] text-ash">
          Proof — historical devnet transactions from this deployed program
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PROOFS.map((proof) => (
            <a
              key={proof.signature}
              href={explorerTx(proof.signature)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this transaction on Solana Explorer (devnet)"
              className="group min-w-0 rounded-[12px] border border-hairline bg-paper p-4 transition-colors hover:border-accent/40"
            >
              <p className="flex items-center justify-between gap-2 text-[14px] font-medium text-ink">
                {proof.title}
                <ExternalIcon className="size-3.5 shrink-0 text-ash group-hover:text-accent" />
              </p>
              <p className="mt-1.5 text-[12.5px] leading-[1.55] text-graphite">
                {proof.body}
              </p>
              <p className="mt-2.5 truncate font-mono text-[11.5px] text-ash underline decoration-hairline-strong underline-offset-4 group-hover:text-accent group-hover:decoration-accent">
                {proof.signature}
              </p>
            </a>
          ))}
        </div>
      </div>

      {recent.length > 0 ? (
        <div className="mt-6">
          <p className="text-[12.5px] uppercase tracking-[0.12em] text-ash">
            Recent confirmed transactions
          </p>
          <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
            {recent.map((bid) => (
              <li key={bid.signature}>
                <a
                  href={explorerTx(bid.signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 py-2.5 text-[13.5px]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="text-graphite">
                      Bid from{" "}
                      <span className="font-mono text-[12.5px] text-ink">
                        {shortAddress(bid.bidder.toBase58())}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">
                      {(Number(bid.amount) / 1e9).toLocaleString("en-US", {
                        maximumFractionDigits: 4,
                      })}{" "}
                      SOL
                    </span>
                    <span className="font-mono text-[12px] text-ash group-hover:text-accent">
                      {shortAddress(bid.signature, 6)}
                    </span>
                    <ExternalIcon className="size-3 text-ash group-hover:text-accent" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="group mt-6 rounded-[12px] border border-hairline bg-wash">
        <summary className="cursor-pointer list-none px-4 py-3.5 text-[14px] font-medium text-ink transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
          Technical details
          <span className="float-right text-ash transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-hairline px-4 py-4">
          <dl className="divide-y divide-hairline text-[13px]">
            <DetailRow label="Program ID">
              <AddressLink address={PROGRAM_ID} />
            </DetailRow>
            <DetailRow label="Network">
              <span className="text-graphite">Solana devnet</span>
            </DetailRow>
            <DetailRow label="Auction PDA">
              {auctionAddress ? (
                <AddressLink address={auctionAddress} />
              ) : (
                <span className="text-ash">No live auction</span>
              )}
            </DetailRow>
            <DetailRow label="Escrow account">
              {auctionAddress ? (
                <EscrowLink auctionAddress={auctionAddress} />
              ) : (
                <span className="text-ash">—</span>
              )}
            </DetailRow>
            <DetailRow label="ClickCounter PDA">
              {clickCounter ? (
                <span className="flex items-center gap-2">
                  <AddressLink address={clickCounter.pda} />
                  <span className="tabular-nums text-ash">
                    {clickCounter.count} events
                  </span>
                </span>
              ) : (
                <span className="text-ash">No tracked link yet</span>
              )}
            </DetailRow>
          </dl>
          <div className="mt-4 space-y-2 border-t border-hairline pt-4 text-[13px] leading-[1.6] text-graphite">
            <p>
              <span className="font-medium text-ink">V1 — today:</span>{" "}
              the deployed Solana program enforces the current auction,
              escrow, refund, and settlement rules.
            </p>
            <p>
              <span className="font-medium text-ink">V2 — planned:</span>{" "}
              composable conversion verification using trusted advertiser
              program state. Not implemented yet.
            </p>
            <p>
              <span className="font-medium text-ink">Long term:</span>{" "}
              portable creator performance history, owned by the creator and
              readable by any sponsor.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-graphite">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink underline decoration-hairline-strong underline-offset-4 hover:text-accent hover:decoration-accent"
    >
      {shortAddress(address)}
      <ExternalIcon className="size-3 text-ash group-hover:text-accent" />
    </a>
  );
}

/** Treasury PDA derived client-side from the auction address. */
function EscrowLink({ auctionAddress }: { auctionAddress: string }) {
  const [treasury, setTreasury] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ PublicKey }, program] = await Promise.all([
        import("@solana/web3.js"),
        import("@/lib/program"),
      ]);
      if (alive) {
        setTreasury(
          program.treasuryPda(new PublicKey(auctionAddress)).toBase58(),
        );
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [auctionAddress]);
  return treasury ? (
    <AddressLink address={treasury} />
  ) : (
    <span className="text-ash">Deriving…</span>
  );
}
