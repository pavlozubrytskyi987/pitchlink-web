import { NextRequest, NextResponse } from "next/server";
import { getLink } from "@/lib/links";
import { clickCounterPda, getClickCounter } from "@/lib/program";
import { serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";

// GET /api/links/:id -> link + real on-chain click count.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;
  const link = getLink(linkId);
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const counter = await getClickCounter(serverConnection(), linkId).catch(() => null);
  return NextResponse.json({
    id: link.id,
    destination: link.destination,
    creator: link.creator,
    createdAt: link.createdAt,
    shortUrl: `/go/${link.id}`,
    clicks: counter ? Number(counter.count) : 0,
    clickCounter: clickCounterPda(linkId).toBase58(),
  });
}
