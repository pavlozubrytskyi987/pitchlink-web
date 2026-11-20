// Winner campaign configs: the brand identity + destination a VERIFIED
// winning advertiser set for a settled auction. Authorization is a
// Phantom-signed, single-use nonce challenge plus an on-chain winner check
// (see src/app/api/campaigns). Stored alongside links in src/lib/store.ts.
//
// These rows are off-chain configuration. The UI must present them as
// advertiser-provided, never as on-chain-verified identity.

import "server-only";

import { randomBytes } from "node:crypto";
import { readStore, updateStore, type CampaignRow } from "@/lib/store";

export type Campaign = CampaignRow;

export async function listCampaigns(): Promise<Campaign[]> {
  const data = await readStore();
  return [...data.campaigns].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function campaignForAuction(auction: string): Promise<Campaign | undefined> {
  const data = await readStore();
  return data.campaigns.find((c) => c.auction === auction);
}

export async function campaignForWallet(wallet: string): Promise<Campaign | undefined> {
  const data = await readStore();
  return data.campaigns.find((c) => c.wallet === wallet);
}

export async function saveCampaign(row: Campaign): Promise<void> {
  await updateStore((data) => {
    const i = data.campaigns.findIndex((c) => c.auction === row.auction);
    if (i >= 0) data.campaigns[i] = row;
    else data.campaigns.push(row);
  });
}

// --- single-use auth nonces ------------------------------------------------

const NONCE_TTL_MS = 5 * 60 * 1000;

export async function issueNonce(): Promise<{ nonce: string; expiresAt: string }> {
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
  await updateStore((data) => {
    const now = Date.now();
    for (const [n, exp] of Object.entries(data.nonces)) {
      if (Date.parse(exp) <= now) delete data.nonces[n];
    }
    data.nonces[nonce] = expiresAt;
  });
  return { nonce, expiresAt };
}

/** Consumes the nonce: true exactly once per issued, unexpired nonce. */
export async function consumeNonce(nonce: string): Promise<boolean> {
  let ok = false;
  await updateStore((data) => {
    const exp = data.nonces[nonce];
    if (exp && Date.parse(exp) > Date.now()) {
      delete data.nonces[nonce];
      ok = true;
    }
  });
  return ok;
}
