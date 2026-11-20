// Tracked-link store. Each link maps a short id -> destination + creator
// (whose on-chain conversion this link credits). Persistence lives in
// src/lib/store.ts (Vercel Blob in production, local JSON in dev). The
// SOURCE OF TRUTH for the click count is the on-chain ClickCounter PDA.
// This store holds no counts.
//
// Server-only: links are minted from an API route and read from server
// routes. Clients ask /api/links/:id (list/read) or hit /go/:id to click.

import "server-only";

import { randomBytes } from "node:crypto";
import { readStore, updateStore, type TrackedLinkRow } from "@/lib/store";

export type TrackedLink = TrackedLinkRow;

// Short ids only. The on-chain ClickCounter PDA is seeded by this id
// zero-padded to 16 bytes (program.ts::linkIdBytes), so keep ids compact.
const ID_LEN = 8;
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function nanoid(size = ID_LEN): string {
  const bytes = randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

export async function createLink(destination: string, creator: string): Promise<TrackedLink> {
  const link: TrackedLink = {
    id: nanoid(),
    destination,
    creator,
    createdAt: new Date().toISOString(),
  };
  await updateStore((data) => {
    while (data.links.some((l) => l.id === link.id)) link.id = nanoid();
    data.links.push(link);
  });
  return link;
}

export async function getLink(id: string): Promise<TrackedLink | undefined> {
  const data = await readStore();
  return data.links.find((l) => l.id === id);
}

export async function setLinkDestination(
  id: string,
  destination: string,
): Promise<TrackedLink | undefined> {
  let updated: TrackedLink | undefined;
  await updateStore((data) => {
    const existing = data.links.find((l) => l.id === id);
    if (!existing) return;
    existing.destination = destination;
    updated = { ...existing };
  });
  return updated;
}

export async function listLinks(): Promise<TrackedLink[]> {
  const data = await readStore();
  return [...data.links].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
