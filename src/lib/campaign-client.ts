"use client";

// Client half of the winner campaign flow. The winner signs a server-issued
// challenge with their wallet (proof of key ownership, replay-protected by a
// single-use nonce); the server additionally checks on-chain that the wallet
// won the settled auction before minting the tracked link.

import bs58 from "bs58";

export type CampaignDto = {
  linkId: string;
  auction: string;
  creator: string;
  wallet: string;
  brandName: string;
  destination: string;
  logoUrl: string | null;
  shortUrl: string;
};

export async function fetchCampaigns(): Promise<CampaignDto[]> {
  try {
    const res = await fetch("/api/campaigns");
    if (!res.ok) return [];
    const rows = (await res.json()) as CampaignDto[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function campaignForAuction(auction: string): Promise<CampaignDto | null> {
  const rows = await fetchCampaigns();
  return rows.find((c) => c.auction === auction) ?? null;
}

type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export async function setupCampaign(args: {
  wallet: string;
  auction: string;
  brandName: string;
  destination: string;
  logoUrl?: string;
  signMessage: SignMessage;
}): Promise<{ linkId: string; shortUrl: string }> {
  const challengeRes = await fetch("/api/campaigns/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: args.wallet, auction: args.auction }),
  });
  if (!challengeRes.ok) {
    const body = (await challengeRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "could not issue challenge");
  }
  const { message, nonce } = (await challengeRes.json()) as { message: string; nonce: string };

  const signature = await args.signMessage(new TextEncoder().encode(message));

  const res = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: args.wallet,
      auction: args.auction,
      nonce,
      message,
      signature: bs58.encode(signature),
      brandName: args.brandName,
      destination: args.destination,
      logoUrl: args.logoUrl || undefined,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    linkId?: string;
    shortUrl?: string;
    error?: string;
  };
  if (!res.ok || !body.linkId || !body.shortUrl) {
    throw new Error(body.error ?? "campaign setup failed");
  }
  return { linkId: body.linkId, shortUrl: body.shortUrl };
}
