// Known-brand registry. Maps a devnet bidder wallet (base58) to its brand.
// Used anywhere a bid is displayed to swap the raw address for a logo+name.
// Unknown wallets keep the truncated-address rendering — never invent branding.

export type Brand = {
  name: string;
  /** Path under /public — rendered with a plain <img>. */
  logo: string;
};

/**
 * Add the SABG bidder wallet below once it places a real on-chain bid.
 * Keys MUST be base58 pubkeys as produced by the wallet adapter.
 */
export const KNOWN_BIDDERS: Record<string, Brand> = {
  "4Rj1CUXrKbDyb7dEM3SXpSYmY3aqymKLitYkppjpwTNN": {
    name: "SABG",
    logo: "/brands/sabg.png",
  },
};

export const SABG: Brand = { name: "SABG", logo: "/brands/sabg.png" };

/** Returns the brand for a bidder wallet, or null if unmapped. */
export function brandFor(wallet: string | null | undefined): Brand | null {
  if (!wallet) return null;
  return KNOWN_BIDDERS[wallet] ?? null;
}
