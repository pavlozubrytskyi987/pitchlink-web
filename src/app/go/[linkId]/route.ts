import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getLink } from "@/lib/links";
import { getClickCounter, incrementClick, initClickCounter } from "@/lib/program";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { relayerWallet, serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";

// GET /go/:id
// Looks up the destination, logs an on-chain click via Next's after() so the
// visitor is redirected immediately, then 302. The relayer signs + pays.
// Rate-limited per client IP so the relayer's devnet balance can't be
// drained by a click flood (each increment costs the relayer a tx fee).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;
  const link = await getLink(linkId);
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const withinBudget = rateLimit(`go:${clientIp(req)}`, 30, 60_000);

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
      const sig = await incrementClick(conn, relayer, linkId).catch(
        async (firstError: unknown) => {
          // One retry with ~1s backoff covers transient RPC 429s. Still
          // best-effort: a double failure is logged, never fabricated -
          // the UI only ever reads the confirmed on-chain count.
          console.warn(`[pitchlink] incrementClick ${linkId} failed, retrying once`, firstError);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return incrementClick(conn, relayer, linkId);
        },
      );
      console.log(`[pitchlink] click ${linkId} -> ${sig}`);
    } catch (error) {
      // Visitor is already gone. Log for debugging; the counter simply
      // undercounts transient failures rather than inventing events.
      console.error(`[pitchlink] incrementClick ${linkId} failed after retry`, error);
    }
  };
  if (withinBudget) {
    try {
      after(fireClick());
    } catch {
      // after() unavailable: fall back to best-effort.
      void fireClick();
    }
  } else {
    console.warn(`[pitchlink] click ${linkId} skipped: rate limited`);
  }

  return NextResponse.redirect(link.destination, { status: 302 });
}
