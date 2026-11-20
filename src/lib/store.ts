// Durable app store: tracked links, winner campaign configs, spent auth
// nonces. Serverless-safe: on Vercel it persists to Vercel Blob
// (BLOB_READ_WRITE_TOKEN); in local dev it falls back to .pitchlink/store.json
// (gitignored). One JSON document, read-modify-write - demo scale, not a
// high-concurrency design. Counts are NEVER stored here; the on-chain
// ClickCounter PDA remains the only source of truth for redirect events.
//
// Seeding: LINKS_SEED_JSON (JSON array of TrackedLink) and
// CAMPAIGNS_SEED_JSON (JSON array of Campaign) are merged on first load so a
// fresh deployment can ship the legitimately-claimed demo campaign without a
// mint transaction.

import "server-only";

import fs from "node:fs";
import path from "node:path";

export interface TrackedLinkRow {
  id: string;
  destination: string;
  creator: string;
  createdAt: string;
}

export interface CampaignRow {
  /** Tracked link id backing this campaign (1:1). */
  linkId: string;
  /** Auction PDA the winner claimed. */
  auction: string;
  /** Auction creator (base58) the link credits. */
  creator: string;
  /** Winning advertiser wallet (base58) - verified on-chain at setup. */
  wallet: string;
  brandName: string;
  destination: string;
  logoUrl: string | null;
  createdAt: string;
}

interface StoreShape {
  links: TrackedLinkRow[];
  campaigns: CampaignRow[];
  /** Single-use auth nonces: nonce -> expiry ISO. */
  nonces: Record<string, string>;
}

const EMPTY: StoreShape = { links: [], campaigns: [], nonces: {} };

const LOCAL_DIR = path.resolve(process.cwd(), ".pitchlink");
const LOCAL_PATH = path.join(LOCAL_DIR, "store.json");
const BLOB_PATH = "pitchlink/store.json";

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

// --- backend reads/writes -------------------------------------------------

async function readRaw(): Promise<StoreShape> {
  if (useBlob()) {
    try {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
      const blob = blobs.find((b) => b.pathname === BLOB_PATH);
      if (!blob) return structuredClone(EMPTY);
      const res = await fetch(blob.url, { cache: "no-store" });
      if (!res.ok) return structuredClone(EMPTY);
      return { ...structuredClone(EMPTY), ...(await res.json()) };
    } catch (error) {
      console.warn("[pitchlink] blob store read failed", error);
      return structuredClone(EMPTY);
    }
  }
  try {
    const raw = fs.readFileSync(LOCAL_PATH, "utf8");
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeRaw(data: StoreShape): Promise<void> {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATH, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      // Store rows change on every mint/click-adjacent write; never cache.
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    });
    return;
  }
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn("[pitchlink] local store write failed", error);
  }
}

// --- cached accessor + seeding --------------------------------------------

let cache: { data: StoreShape; at: number } | null = null;
const CACHE_MS = 5_000;

function seeded(data: StoreShape): StoreShape {
  try {
    const links = JSON.parse(process.env.LINKS_SEED_JSON ?? "[]") as TrackedLinkRow[];
    for (const row of Array.isArray(links) ? links : []) {
      if (row?.id && !data.links.some((l) => l.id === row.id)) data.links.push(row);
    }
  } catch {
    console.warn("[pitchlink] LINKS_SEED_JSON is not valid JSON");
  }
  try {
    const campaigns = JSON.parse(process.env.CAMPAIGNS_SEED_JSON ?? "[]") as CampaignRow[];
    for (const row of Array.isArray(campaigns) ? campaigns : []) {
      if (row?.linkId && !data.campaigns.some((c) => c.linkId === row.linkId)) {
        data.campaigns.push(row);
      }
    }
  } catch {
    console.warn("[pitchlink] CAMPAIGNS_SEED_JSON is not valid JSON");
  }
  return data;
}

export async function readStore(): Promise<StoreShape> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = seeded(await readRaw());
  cache = { data, at: Date.now() };
  return data;
}

/** Mutate the store and persist. Serialized per instance. */
let writing: Promise<void> = Promise.resolve();
export async function updateStore(mutate: (data: StoreShape) => void): Promise<void> {
  const run = writing.then(async () => {
    const data = await readStore();
    mutate(data);
    await writeRaw(data);
    cache = { data, at: Date.now() };
  });
  writing = run.catch(() => {});
  return run;
}
