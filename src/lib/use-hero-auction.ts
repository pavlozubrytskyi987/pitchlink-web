"use client";

// Read-only view of the hero creator's real devnet auction for the board:
// current highest bid, end time, settled flag, plus its bid history pushed
// into the market ticker as verified entries. Re-reads whenever the auction
// account changes, so a bid placed from any device shows up here.
//
// program.ts is imported lazily so Anchor stays out of the board's first
// load. Nothing here signs or sends a transaction.

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import type { Creator } from "@/data/creators";
import { getFeedSnapshot, pushRealBid } from "@/lib/bid-feed";
import { auctionOverride } from "@/lib/demo-auction";
import { shortAddress } from "@/lib/explorer";

export type HeroAuction = {
  address: string;
  /** Creator the auction pays out to (drives click-count lookup). */
  creator: string;
  /** 0 when nobody has bid yet. */
  currentBidSol: number;
  endsAt: number;
  settled: boolean;
  highestBidder: string | null;
};

const LAMPORTS_PER_SOL = 1_000_000_000;

function toSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function useHeroAuction(hero: Creator | undefined): HeroAuction | null {
  const { connection } = useConnection();
  const [state, setState] = useState<HeroAuction | null>(null);
  const creatorKey = hero?.auctionCreatorPubkey ?? null;
  const slug = hero?.slug;
  const name = hero?.name;

  useEffect(() => {
    if (!creatorKey || !slug || !name) return;
    let alive = true;
    let unwatch: (() => void) | undefined;

    (async () => {
      const program = await import("@/lib/program");
      const override = auctionOverride();

      const readAuction = async () => {
        const auction = override
          ? await program.fetchAuctionByAddress(connection, new PublicKey(override))
          : await program.getAuction(connection, new PublicKey(creatorKey));
        if (!alive || !auction) return auction;
        const hasBid = auction.highestBid > BigInt(0);
        setState({
          address: auction.publicKey.toBase58(),
          creator: auction.creator.toBase58(),
          currentBidSol: toSol(auction.highestBid),
          endsAt: auction.endTs,
          settled: auction.settled,
          highestBidder: hasBid ? auction.highestBidder.toBase58() : null,
        });
        return auction;
      };

      const readBids = async (auction: PublicKey) => {
        const bids = await program.getBids(connection, auction);
        if (!alive) return;
        const seen = new Set(getFeedSnapshot().map((e) => e.id));
        // Oldest first: the feed prepends, so the newest ends up in front.
        for (const bid of bids.slice().reverse()) {
          const id = `onchain-${bid.signature}`;
          if (seen.has(id)) continue;
          pushRealBid({
            id,
            bidder: shortAddress(bid.bidder.toBase58()),
            amountSol: toSol(bid.amount),
            creatorSlug: slug,
            creatorName: name,
            ts: bid.ts,
            signature: bid.signature,
          });
        }
      };

      const auction = await readAuction();
      if (!alive || !auction) return;
      unwatch = program.watchAuctionAccount(connection, auction.publicKey, () => {
        void readAuction().catch(() => {});
        void readBids(auction.publicKey).catch(() => {});
      });
      await readBids(auction.publicKey);
    })().catch((error: unknown) => {
      console.warn("[pitchlink] hero auction read failed", error);
    });

    return () => {
      alive = false;
      unwatch?.();
    };
  }, [connection, creatorKey, name, slug]);

  return state;
}
