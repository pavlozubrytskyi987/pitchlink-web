// Shared store of recent bids for the market-activity ticker.
//
// Seeded entries are demo fluff. Real on-chain bids come in through
// `pushRealBid` from wherever the auction listener lives (the existing
// /auction page, or whatever Cursor wires up), carry a tx signature, and
// render with the ⚡ live marker + Explorer link.

import { CREATORS, type Creator } from "@/data/creators";

export type BidEntry = {
  /** Stable key for list reconciliation and ticker animation. */
  id: string;
  /** Short display pubkey, e.g. "4Rj1...wTNN". */
  bidder: string;
  amountSol: number;
  creatorSlug: string;
  creatorName: string;
  /** Unix seconds when this bid was placed. */
  ts: number;
  /** Devnet tx signature; null for seeded entries. */
  signature: string | null;
};

const MAX_ENTRIES = 40;

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

function prepend(entry: BidEntry) {
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

export function pushSeededBid(entry: BidEntry) {
  prepend({ ...entry, signature: null });
}

export function pushRealBid(
  entry: Omit<BidEntry, "signature"> & { signature: string },
) {
  prepend(entry);
}

// --- seeded entries ---------------------------------------------------------

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
  return `${pick(4)}...${pick(4)}`;
}

function randomAmountSol(rnd: () => number): number {
  // Skew toward small bids, occasional larger ones. Matches the Chef Dima
  // hero price range (0.4–1.5 SOL) with some outliers.
  const raw = 0.05 + Math.pow(rnd(), 2) * 1.45;
  return Math.round(raw * 100) / 100;
}

export function makeSeededBid(
  rnd: () => number,
  creators: Creator[] = CREATORS,
  now: number = Math.floor(Date.now() / 1000),
  maxAgeSec: number = 180,
): BidEntry {
  const creator = randFrom(rnd, creators);
  return {
    id: `seed-${now}-${Math.floor(rnd() * 1e9).toString(36)}`,
    bidder: randomBidder(rnd),
    amountSol: randomAmountSol(rnd),
    creatorSlug: creator.slug,
    creatorName: creator.name,
    ts: now - Math.floor(rnd() * maxAgeSec),
    signature: null,
  };
}

export function seedInitialFeed(
  rnd: () => number = Math.random,
  count: number = 18,
  creators: Creator[] = CREATORS,
) {
  const now = Math.floor(Date.now() / 1000);
  const batch: BidEntry[] = [];
  for (let i = 0; i < count; i++)
    batch.push(makeSeededBid(rnd, creators, now, 300));
  batch.sort((a, b) => b.ts - a.ts);
  entries = batch;
  emit();
}

export function formatAgo(secondsAgo: number): string {
  if (secondsAgo < 5) return "now";
  if (secondsAgo < 60) return `${Math.floor(secondsAgo)}s ago`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}
