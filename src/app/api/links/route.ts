import { NextResponse } from "next/server";
import { listLinks } from "@/lib/links";
import { getClickCounter } from "@/lib/program";
import { serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";

// POST /api/links is closed. Open minting let anyone attach any destination
// to any creator. Tracked links are now minted exclusively through
// POST /api/campaigns, which requires a wallet-signed challenge AND an
// on-chain check that the signer won the settled auction.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Open link minting is disabled. Use POST /api/campaigns with a winner-signed challenge.",
    },
    { status: 403 },
  );
}

// GET /api/links -> list with real on-chain click counts.
export async function GET() {
  const rows = await listLinks();
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
