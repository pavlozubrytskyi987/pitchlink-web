"use client";

/**
 * Demo override: `?auction=<base58 PDA>` points the live surfaces (auction
 * panel, homepage card, history filter) at a specific auction account.
 * Read-only — it changes what the UI watches, never any on-chain state.
 * Added for the recorded 3-minute demo while an earlier unsettled auction
 * still exists (findAuction would otherwise always prefer the later endTs).
 */
export function auctionOverride(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("auction");
  return value && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? value : null;
}
