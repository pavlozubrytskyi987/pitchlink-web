"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ExternalIcon } from "@/components/icons";
import { brandFor } from "@/data/brands";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";
import { getAllBids, type BidRecord } from "@/lib/program";

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
export function PastBids() {
  const { connection } = useConnection();
  const [bids, setBids] = useState<BidRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    getAllBids(connection)
      .then((rows) => {
        if (alive) setBids(rows);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [connection]);

  return (
    <section className="mx-auto w-full max-w-[1320px] px-5 pb-16 sm:px-8">
      <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-6">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] sm:text-[22px]">
          Past bids
        </h2>
        {bids?.length ? (
          <p className="text-[12px] tabular-nums text-ash">{bids.length}</p>
        ) : null}
      </div>
      <p className="mt-1 text-[12.5px] text-ash">
        Every BidPlaced event from the Pitchlink program on devnet, newest first.
      </p>

      {bids === null && !error ? (
        <p className="mt-6 text-[13px] text-ash">Loading…</p>
      ) : error ? (
        <p className="mt-6 text-[13px] text-ash">Could not load past bids: {error}</p>
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
                    <span className="grid size-8 shrink-0 place-items-center rounded-[6px] bg-wash text-[10px] font-medium uppercase tracking-[0.1em] text-ash">
                      ?
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">
                      {brand ? brand.name : "Unknown bidder"}
                    </p>
                    <a
                      href={explorerAddress(bidder)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-mono text-[11.5px] text-ash hover:text-ink"
                    >
                      {shortAddress(bidder)}
                    </a>
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
    </section>
  );
}
