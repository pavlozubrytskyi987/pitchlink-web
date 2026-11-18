// Shared store of REAL on-chain bids for the market ticker. Each entry carries
// a tx signature and opens on Solana Explorer. No simulated activity.

export type BidEntry = {
  /** Stable key for list reconciliation and ticker animation. */
  id: string;
  /** Short display pubkey, e.g. "4Rj1…wTNN". */
  bidder: string;
  amountSol: number;
  creatorSlug: string;
  creatorName: string;
  /** Unix seconds when this bid landed on-chain. */
  ts: number;
  /** Devnet tx signature (required: every entry is real). */
  signature: string;
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

/** Most recent on-chain bid for a creator slug. */
export function latestRealBidFor(slug: string): BidEntry | null {
  for (const e of entries) {
    if (e.creatorSlug === slug) return e;
  }
  return null;
}

export function pushRealBid(entry: BidEntry) {
  if (entries.some((e) => e.id === entry.id)) return;
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

// Dev-only global so pushRealBid can be exercised from a devtools console
// without a real wallet. No-op in production builds.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (
    window as unknown as { __pitchlinkPushRealBid?: typeof pushRealBid }
  ).__pitchlinkPushRealBid = pushRealBid;
}

export function formatAgo(secondsAgo: number): string {
  if (secondsAgo < 5) return "now";
  if (secondsAgo < 60) return `${Math.floor(secondsAgo)}s ago`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}
