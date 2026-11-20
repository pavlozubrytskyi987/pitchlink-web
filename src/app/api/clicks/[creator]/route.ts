import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { listLinks } from "@/lib/links";
import { clickCounterPda, getClickCounter } from "@/lib/program";
import { serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";

// GET /api/clicks/:creator -> aggregated real on-chain clicks across every
// tracked link that credits this creator. The response also lists the
// contributing link ids + their ClickCounter PDAs so a client can subscribe
// via the ClickRecorded event listener or deep-link to Explorer.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ creator: string }> },
) {
  const { creator } = await params;
  try {
    new PublicKey(creator);
  } catch {
    return NextResponse.json({ error: "creator must be a base58 pubkey" }, { status: 400 });
  }

  const owned = (await listLinks()).filter((l) => l.creator === creator);
  const details = await Promise.all(
    owned.map(async (link) => {
      const counter = await getClickCounter(serverConnection(), link.id).catch(() => null);
      return {
        id: link.id,
        counter: clickCounterPda(link.id).toBase58(),
        clicks: counter ? Number(counter.count) : 0,
      };
    }),
  );
  const clicks = details.reduce((sum, d) => sum + d.clicks, 0);
  return NextResponse.json({ creator, clicks, links: details });
}
