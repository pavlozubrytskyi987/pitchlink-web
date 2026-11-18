// Shared store of recent activity for the market ticker.
//
// Real on-chain bids come in through `pushRealBid` (the /auction page after a
// bid, and the board's read of the hero auction's history). They carry a tx
// signature and render as verified entries with an Explorer link.
//
// Simulated entries are "watching" events on upcoming auctions only. They
// carry no SOL amount and render dimmed with a SIM tag, so nothing simulated
// can be mistaken for a bid.

import { CREATORS, type Creator } from "@/data/creators";

export type BidEntry = {
  /** Stable key for list reconciliation and ticker animation. */
  id: string;
  /** "bid" = a real on-chain bid; "watch" = simulated interest. */
  kind?: "bid" | "watch";
  /** Short display pubkey, e.g. "4Rj1…wTNN". */
  bidder: string;
  /** SOL amount for real bids; 0 for simulated watch events. */
  amountSol: number;
  creatorSlug: string;
  creatorName: string;
  /** Unix seconds when this happened. */
  ts: number;
  /** Devnet tx signature; null for simulated entries. */
  signature: string | null;
};

const MAX_SIMULATED = 24;

type Listener = (entries: BidEntry[]) => void;

let entries: BidEntry[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn(entries);
}

export function subscribeFeed(fn: Listener): () => void {
  listeners.add(fn);
  fn(entries);
  return () => {
    listeners.delete(fn);
  };
}

export function getFeedSnapshot(): BidEntry[] {
  return entries;
}

/** Most recent on-chain bid (if any) for a creator slug. */
export function latestRealBidFor(slug: string): BidEntry | null {
  for (const e of entries) {
    if (e.signature !== null && e.creatorSlug === slug) return e;
  }
  return null;
}

/** Real entries are never evicted; only the oldest simulated ones are. */
function trim(list: BidEntry[]): BidEntry[] {
  let simulated = 0;
  return list.filter((e) => e.signature !== null || ++simulated <= MAX_SIMULATED);
}

function prepend(entry: BidEntry) {
  if (entries.some((e) => e.id === entry.id)) return;
  entries = trim([entry, ...entries]);
  emit();
}

export function pushSeededBid(entry: BidEntry) {
  prepend({ ...entry, kind: "watch", amountSol: 0, signature: null });
}

export function pushRealBid(
  entry: Omit<BidEntry, "signature" | "kind"> & { signature: string },
) {
  prepend({ ...entry, kind: "bid" });
}

// Dev-only global so pushRealBid can be exercised from a devtools console
// without a real wallet. No-op in production builds.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (
    window as unknown as { __pitchlinkPushRealBid?: typeof pushRealBid }
  ).__pitchlinkPushRealBid = pushRealBid;
}

// --- simulated entries ------------------------------------------------------

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randFrom<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function randomBidder(rnd: () => number): string {
  const pick = (n: number) => {
    let out = "";
    for (let i = 0; i < n; i++)
      out += BASE58[Math.floor(rnd() * BASE58.length)];
    return out;
  };
  return `${pick(4)}…${pick(4)}`;
}

/** Simulated interest only ever targets auctions that are not open yet. */
function upcoming(creators: Creator[]): Creator[] {
  const soon = creators.filter((c) => c.status !== "live");
  return soon.length ? soon : creators;
}

export function makeSeededBid(
  rnd: () => number,
  creators: Creator[] = CREATORS,
  now: number = Math.floor(Date.now() / 1000),
  maxAgeSec: number = 180,
): BidEntry {
  const creator = randFrom(rnd, upcoming(creators));
  return {
    id: `seed-${now}-${Math.floor(rnd() * 1e9).toString(36)}`,
    kind: "watch",
    bidder: randomBidder(rnd),
    amountSol: 0,
    creatorSlug: creator.slug,
    creatorName: creator.name,
    ts: now - Math.floor(rnd() * maxAgeSec),
    signature: null,
  };
}

export function seedInitialFeed(
  rnd: () => number = Math.random,
  count: number = 14,
  creators: Creator[] = CREATORS,
) {
  const now = Math.floor(Date.now() / 1000);
  const batch: BidEntry[] = [];
  for (let i = 0; i < count; i++)
    batch.push(makeSeededBid(rnd, creators, now, 300));
  batch.sort((a, b) => b.ts - a.ts);
  // Keep any real entries that arrived before the ticker mounted.
  entries = trim([...entries.filter((e) => e.signature !== null), ...batch]);
  emit();
}

export function formatAgo(secondsAgo: number): string {
  if (secondsAgo < 5) return "now";
  if (secondsAgo < 60) return `${Math.floor(secondsAgo)}s ago`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}
