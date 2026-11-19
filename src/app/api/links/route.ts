import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createLink, listLinks, setLinkDestination } from "@/lib/links";
import { getClickCounter, initClickCounter } from "@/lib/program";
import { relayerWallet, serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";

// POST /api/links { destination, creator } -> { id, shortUrl, destination }
// Mints a tracked link AND initializes its on-chain ClickCounter PDA so the
// first click doesn't fail. If the PDA already exists for this id (reuse after
// a store reset), we skip the init.
export async function POST(req: NextRequest) {
  let body: { destination?: string; creator?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const destination = body.destination?.trim();
  if (!destination) {
    return NextResponse.json({ error: "destination is required" }, { status: 400 });
  }
  try {
    // Allow the {linkId} template token during URL validation; the real id
    // is substituted below once we know it.
    const probe = destination.replace("{linkId}", "placeholder");
    const url = new URL(probe);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { error: "destination must be a valid http/https URL" },
      { status: 400 },
    );
  }

  const creatorText = body.creator?.trim();
  if (!creatorText) {
    return NextResponse.json({ error: "creator is required" }, { status: 400 });
  }
  let creator: PublicKey;
  try {
    creator = new PublicKey(creatorText);
  } catch {
    return NextResponse.json({ error: "creator must be a base58 pubkey" }, { status: 400 });
  }

  let link = createLink(destination, creator.toBase58());
  if (destination.includes("{linkId}")) {
    const resolved = destination.replaceAll("{linkId}", link.id);
    link = setLinkDestination(link.id, resolved) ?? link;
  }

  // Init the on-chain counter. Harmless if the PDA happens to already exist.
  // Public devnet RPC 429s fairly often, so we retry a few times with backoff.
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const existing = await getClickCounter(serverConnection(), link.id);
      if (existing) {
        lastErr = null;
        break;
      }
      const sig = await initClickCounter(
        serverConnection(),
        relayerWallet(),
        link.id,
        creator,
      );
      console.log(`[pitchlink] init ClickCounter for ${link.id}:`, sig);
      lastErr = null;
      break;
    } catch (error) {
      lastErr = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[pitchlink] initClickCounter attempt ${attempt} failed:`, msg);
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastErr) {
    return NextResponse.json(
      {
        error: "link saved but on-chain counter init failed; try again",
        detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    id: link.id,
    destination: link.destination,
    creator: link.creator,
    shortUrl: `/go/${link.id}`,
  });
}

// GET /api/links -> list with real on-chain click counts.
export async function GET() {
  const rows = listLinks();
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const counter = await getClickCounter(serverConnection(), row.id).catch(() => null);
      return {
        id: row.id,
        destination: row.destination,
        creator: row.creator,
        createdAt: row.createdAt,
        shortUrl: `/go/${row.id}`,
        clicks: counter ? Number(counter.count) : 0,
      };
    }),
  );
  return NextResponse.json(enriched);
}
