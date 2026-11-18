import { randomBytes } from "crypto";

export interface TrackedLink {
  id: string;
  destination: string;
  clicks: number;
  createdAt: string;
}

// In-memory store for the cloak MVP.
// TODO: replace with persistent DB (or on-chain program state) once integrated.
const links = new Map<string, TrackedLink>();

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function nanoid(size = 8): string {
  const bytes = randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

export function createLink(destination: string): TrackedLink {
  let id = nanoid();
  while (links.has(id)) {
    id = nanoid();
  }

  const link: TrackedLink = {
    id,
    destination,
    clicks: 0,
    createdAt: new Date().toISOString(),
  };

  links.set(id, link);
  return link;
}

export function getLink(id: string): TrackedLink | undefined {
  return links.get(id);
}

export function listLinks(): TrackedLink[] {
  return Array.from(links.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function recordClick(id: string): Promise<TrackedLink | undefined> {
  const link = links.get(id);
  if (!link) return undefined;

  link.clicks += 1;

  // TODO: on-chain click-increment call goes here.
  // Example (tomorrow):
  // await program.methods.click(link.id).accounts({ ... }).rpc();
  // Keep the above async so the redirect is not blocked.

  console.log(`[cloak] click recorded`, {
    id: link.id,
    destination: link.destination,
    clicks: link.clicks,
    ts: new Date().toISOString(),
  });

  return link;
}
