"use client";

import { useLogoDraft } from "@/components/logo-draft";
import { SlotClaimed } from "@/components/slot-claimed";
import { brandFor } from "@/data/brands";

/**
 * Renders the post-settlement claim reveal over the auction page. The
 * winning brand's logo comes from the on-chain-bidder registry — never a
 * fabricated upload.
 */
export function AuctionClaim() {
  const { claim } = useLogoDraft();
  if (!claim) return null;
  const brand = brandFor(claim.winner);
  return <SlotClaimed claim={claim} logoUrl={brand?.logo ?? null} />;
}
