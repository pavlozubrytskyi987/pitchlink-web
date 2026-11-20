"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ExternalIcon } from "@/components/icons";
import { brandFor } from "@/data/brands";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";
import { findAuction, getAllBids, type BidRecord } from "@/lib/program";

const LAMPORTS = 1_000_000_000;

function formatSol(lamports: bigint): string {
  const sol = Number(lamports) / LAMPORTS;
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/**
 * Historical BidPlaced events across every auction the program ever ran.
 * Reads straight from devnet — no local cache, no seeded entries. Empty
 * state is the honest answer when nothing is on-chain yet.
 */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|Too many requests|rate[- ]?limit/i.test(msg)) {
    return "Devnet RPC rate-limited. Try again in a moment.";
  }
  return msg.split("\n")[0]?.slice(0, 160) ?? "Something went wrong";
}

export function PastBids() {
  const { connection } = useConnection();
  const [bids, setBids] = useState<BidRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([getAllBids(connection), findAuction(connection)])
      .then(([rows, live]) => {
        // Keep the label honest: bids on the live auction are shown in the
        // panel above, so this history lists only earlier auctions.
        const liveKey = live?.publicKey.toBase58();
        if (alive) {
          setBids(
            liveKey
              ? rows.filter((r) => r.auction?.toBase58() !== liveKey)
              : rows,
          );
        }
      })
      .catch((err) => {
        if (alive) setError(friendlyError(err));
      });
    return () => {
      alive = false;
    };
  }, [connection, attempt]);

  return (
    <section className="mx-auto w-full max-w-[1320px] px-5 pb-16 sm:px-8">
      <details className="group mt-8 border-t border-hairline pt-2">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 pt-4 [&::-webkit-details-marker]:hidden">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] transition-colors hover:text-accent sm:text-[22px]">
            Historical devnet bids
          </h2>
          <span className="flex items-baseline gap-3">
            {bids?.length ? (
              <span className="text-[12px] tabular-nums text-ash">
                {bids.length}
              </span>
            ) : null}
            <span className="text-ash transition-transform group-open:rotate-45">
              +
            </span>
          </span>
        </summary>
        <p className="mt-1 text-[12.5px] text-ash">
          Confirmed bids from earlier auctions run by this program — not bids on
          the auction shown above.
        </p>

      {bids === null && !error ? (
        <p className="mt-6 text-[13px] text-ash">Loading…</p>
      ) : error ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-ash">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="text-[13px] text-accent underline-offset-4 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : bids && bids.length === 0 ? (
        <p className="mt-6 text-[13px] text-ash">No bids on-chain yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {bids!.map((bid) => {
            const bidder = bid.bidder.toBase58();
            const brand = brandFor(bidder);
            return (
              <li
                key={bid.signature}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {brand ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={brand.logo}
                      alt=""
                      className="size-8 shrink-0 rounded-[6px] bg-ink object-contain p-1"
                    />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-[6px] bg-wash font-mono text-[10px] uppercase tracking-[0.05em] text-ash">
                      {bidder.slice(0, 2)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">
                      {brand ? brand.name : (
                        <a
                          href={explorerAddress(bidder)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[13px] hover:text-accent"
                        >
                          {shortAddress(bidder)}
                        </a>
                      )}
                    </p>
                    {brand ? (
                      <a
                        href={explorerAddress(bidder)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-[11.5px] text-ash hover:text-ink"
                      >
                        {shortAddress(bidder)}
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-4">
                  <span className="whitespace-nowrap text-[14px] tabular-nums">
                    {formatSol(bid.amount)} SOL
                  </span>
                  {bid.auction ? (
                    <a
                      href={explorerAddress(bid.auction.toBase58())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden text-[12px] text-ash hover:text-ink sm:inline"
                      title="Auction account"
                    >
                      {shortAddress(bid.auction.toBase58())}
                    </a>
                  ) : null}
                  <a
                    href={explorerTx(bid.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-1 text-[12px] text-accent"
                  >
                    <span className="font-mono">{shortAddress(bid.signature)}</span>
                    <ExternalIcon className="size-3" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </details>
    </section>
  );
}
