// Tracked-link store. Each link maps a short id -> destination + creator
// (whose on-chain conversion this link credits). Local JSON cache at
// .pitchlink/links.json for dev persistence; the SOURCE OF TRUTH for the
// click count is the on-chain ClickCounter PDA. This file holds no counts.
//
// Server-only: links are minted from an API route and read from server
// routes. Clients ask /api/links/:id (list/read) or hit /go/:id to click.

import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface TrackedLink {
  id: string;
  /** Where visitors are sent (http/https). */
  destination: string;
  /** Creator (base58) whose on-chain conversion this link credits. */
  creator: string;
  createdAt: string;
}

// Short ids only. The on-chain ClickCounter PDA is seeded by this id
// zero-padded to 16 bytes (program.ts::linkIdBytes), so keep ids compact.
const ID_LEN = 8;
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const STORE_DIR = path.resolve(process.cwd(), ".pitchlink");
const STORE_PATH = path.join(STORE_DIR, "links.json");

let links: Map<string, TrackedLink> | null = null;

function load(): Map<string, TrackedLink> {
  if (links) return links;
  links = new Map();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const rows = JSON.parse(raw) as TrackedLink[];
    for (const row of rows) links.set(row.id, row);
  } catch {
    // First run or unreadable; start fresh.
  }
  return links;
}

function flush() {
  if (!links) return;
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify([...links.values()], null, 2));
  } catch (error) {
    console.warn("[pitchlink] could not persist link store", error);
  }
}

function nanoid(size = ID_LEN): string {
  const bytes = randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

export function createLink(destination: string, creator: string): TrackedLink {
  const store = load();
  let id = nanoid();
  while (store.has(id)) id = nanoid();

  const link: TrackedLink = {
    id,
    destination,
    creator,
    createdAt: new Date().toISOString(),
  };
  store.set(id, link);
  flush();
  return link;
}

export function getLink(id: string): TrackedLink | undefined {
  return load().get(id);
}

export function setLinkDestination(id: string, destination: string): TrackedLink | undefined {
  const store = load();
  const existing = store.get(id);
  if (!existing) return undefined;
  const updated: TrackedLink = { ...existing, destination };
  store.set(id, updated);
  flush();
  return updated;
}

export function listLinks(): TrackedLink[] {
  return [...load().values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
