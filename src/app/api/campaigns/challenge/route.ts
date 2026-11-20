import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { issueNonce } from "@/lib/campaigns";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/campaigns/challenge { wallet, auction }
// Issues a single-use, 5-minute nonce embedded in the exact message the
// winner's wallet must sign to configure a campaign. Replay-protected:
// the nonce is consumed at setup time (see ../route.ts).
export async function POST(req: NextRequest) {
  if (!rateLimit(`challenge:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  let body: { wallet?: string; auction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    new PublicKey(body.wallet ?? "");
    new PublicKey(body.auction ?? "");
  } catch {
    return NextResponse.json(
      { error: "wallet and auction must be base58 pubkeys" },
      { status: 400 },
    );
  }
  const { nonce, expiresAt } = await issueNonce();
  const message = [
    "Pitchlink campaign setup",
    `Auction: ${body.auction}`,
    `Wallet: ${body.wallet}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
  ].join("\n");
  return NextResponse.json({ message, nonce, expiresAt });
}
