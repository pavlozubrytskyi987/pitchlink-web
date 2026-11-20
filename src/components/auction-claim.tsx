"use client";

import { useClaim } from "@/components/claim-context";
import { SlotClaimed } from "@/components/slot-claimed";
import { brandDisplayFor, useDynamicBrands } from "@/lib/use-brands";

/**
 * Renders the post-settlement claim reveal over the auction page. The
 * winning brand's logo comes from the on-chain-bidder registry - never a
 * fabricated upload.
 */
export function AuctionClaim() {
  const { claim } = useClaim();
  const dynamicBrands = useDynamicBrands();
  if (!claim) return null;
  const brand = brandDisplayFor(claim.winner, dynamicBrands);
  return <SlotClaimed claim={claim} logoUrl={brand?.logo ?? null} />;
}
