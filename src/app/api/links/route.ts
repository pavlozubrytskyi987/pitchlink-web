import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createLink, listLinks } from "@/lib/links";
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
    const url = new URL(destination);
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

  const link = createLink(destination, creator.toBase58());

  // Init the on-chain counter. Harmless if the PDA happens to already exist.
  try {
    const existing = await getClickCounter(serverConnection(), link.id);
    if (!existing) {
      const sig = await initClickCounter(
        serverConnection(),
        relayerWallet(),
        link.id,
        creator,
      );
      console.log(`[pitchlink] init ClickCounter for ${link.id}:`, sig);
    }
  } catch (error) {
    console.error("[pitchlink] initClickCounter failed", error);
    return NextResponse.json(
      {
        error: "link saved but on-chain counter init failed; try again",
        detail: error instanceof Error ? error.message : String(error),
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
