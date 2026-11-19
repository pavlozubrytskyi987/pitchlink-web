import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getLink } from "@/lib/links";
import { getClickCounter, incrementClick, initClickCounter } from "@/lib/program";
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
      const conn = serverConnection();
      const relayer = relayerWallet();
      // Lazy-init the counter PDA if mint-time init was skipped (e.g. RPC 429).
      const existing = await getClickCounter(conn, linkId).catch(() => null);
      if (!existing) {
        try {
          const creatorKey = new PublicKey(link.creator);
          const initSig = await initClickCounter(conn, relayer, linkId, creatorKey);
          console.log(`[pitchlink] lazy init ClickCounter for ${linkId}:`, initSig);
        } catch (initErr) {
          console.error(`[pitchlink] lazy initClickCounter ${linkId} failed`, initErr);
          return;
        }
      }
      const sig = await incrementClick(conn, relayer, linkId);
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
