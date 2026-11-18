import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getLink } from "@/lib/links";
import { incrementClick } from "@/lib/program";
import { relayerWallet, serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";

// GET /go/:id
// Looks up the destination, logs an on-chain click via Next's after() so the
// visitor is redirected immediately, then 302. The relayer signs + pays.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;
  const link = getLink(linkId);
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const fireClick = async () => {
    try {
      const sig = await incrementClick(serverConnection(), relayerWallet(), linkId);
      console.log(`[pitchlink] click ${linkId} -> ${sig}`);
    } catch (error) {
      // Visitor is already gone. Log for debugging; don't retry here.
      console.error(`[pitchlink] incrementClick ${linkId} failed`, error);
    }
  };
  try {
    after(fireClick());
  } catch {
    // after() unavailable: fall back to best-effort.
    void fireClick();
  }

  return NextResponse.redirect(link.destination, { status: 302 });
}
