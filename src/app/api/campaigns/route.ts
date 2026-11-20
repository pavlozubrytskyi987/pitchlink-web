import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { campaignForAuction, consumeNonce, listCampaigns, saveCampaign } from "@/lib/campaigns";
import { createLink, setLinkDestination } from "@/lib/links";
import { fetchAuctionByAddress, getClickCounter, initClickCounter } from "@/lib/program";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { relayerWallet, serverConnection } from "@/lib/relayer";
import { isSafeHttpUrl, isSafeLogoUrl } from "@/lib/url-check";

export const runtime = "nodejs";

// GET /api/campaigns -> public campaign registry (advertiser-provided brand
// config; NOT on-chain-verified identity). The UI merges this over the
// static known-bidder fallback.
export async function GET() {
  const campaigns = await listCampaigns();
  return NextResponse.json(
    campaigns.map((c) => ({
      linkId: c.linkId,
      auction: c.auction,
      creator: c.creator,
      wallet: c.wallet,
      brandName: c.brandName,
      destination: c.destination,
      logoUrl: c.logoUrl,
      createdAt: c.createdAt,
      shortUrl: `/go/${c.linkId}`,
    })),
  );
}

// POST /api/campaigns
// Winner-only campaign setup. Body:
//   { wallet, auction, nonce, signature (base58), brandName, destination, logoUrl? }
// Authorization: (1) single-use nonce from /api/campaigns/challenge, consumed
// here; (2) ed25519 signature over the exact challenge message by `wallet`;
// (3) on-chain check that the auction is settled and `wallet` is the highest
// bidder. Only then is the tracked link minted and its counter initialized.
export async function POST(req: NextRequest) {
  if (!rateLimit(`campaigns:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  let body: {
    wallet?: string;
    auction?: string;
    nonce?: string;
    message?: string;
    signature?: string;
    brandName?: string;
    destination?: string;
    logoUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const brandName = body.brandName?.trim() ?? "";
  if (brandName.length < 1 || brandName.length > 40) {
    return NextResponse.json({ error: "brandName must be 1-40 characters" }, { status: 400 });
  }
  const destination = body.destination?.trim() ?? "";
  if (!isSafeHttpUrl(destination, { allowTemplate: true })) {
    return NextResponse.json(
      { error: "destination must be a public http/https URL" },
      { status: 400 },
    );
  }
  const logoUrl = body.logoUrl?.trim() || null;
  if (logoUrl && !isSafeLogoUrl(logoUrl)) {
    return NextResponse.json(
      { error: "logoUrl must be a public http/https image URL" },
      { status: 400 },
    );
  }

  let wallet: PublicKey;
  let auctionKey: PublicKey;
  try {
    wallet = new PublicKey(body.wallet ?? "");
    auctionKey = new PublicKey(body.auction ?? "");
  } catch {
    return NextResponse.json({ error: "wallet/auction must be base58 pubkeys" }, { status: 400 });
  }
  const nonce = body.nonce?.trim() ?? "";
  const signature = body.signature?.trim() ?? "";
  if (!nonce || !signature) {
    return NextResponse.json({ error: "nonce and signature are required" }, { status: 400 });
  }

  // 1) Replay protection: the nonce must be unconsumed and unexpired.
  if (!(await consumeNonce(nonce))) {
    return NextResponse.json({ error: "challenge expired or already used" }, { status: 401 });
  }

  // 2) Signature over the exact issued challenge message. The client echoes
  // the message it signed; it must match the issued format exactly (first
  // four lines bind auction, wallet and nonce; line five is the expiry).
  const expectedPrefix = [
    "Pitchlink campaign setup",
    `Auction: ${auctionKey.toBase58()}`,
    `Wallet: ${wallet.toBase58()}`,
    `Nonce: ${nonce}`,
    "Expires: ",
  ].join("\n");
  const clientMessage = (body as { message?: string }).message;
  if (typeof clientMessage !== "string" || !clientMessage.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "message does not match the issued challenge" }, { status: 400 });
  }
  const toVerify = clientMessage;
  let sigBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(signature);
  } catch {
    return NextResponse.json({ error: "signature must be base58" }, { status: 400 });
  }
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(toVerify),
    sigBytes,
    wallet.toBytes(),
  );
  if (!ok) {
    return NextResponse.json({ error: "signature verification failed" }, { status: 401 });
  }

  // 3) On-chain winner check: settled AND this wallet is the highest bidder.
  const conn = serverConnection();
  const auction = await fetchAuctionByAddress(conn, auctionKey).catch(() => null);
  if (!auction) {
    return NextResponse.json({ error: "auction account not found" }, { status: 404 });
  }
  if (!auction.settled) {
    return NextResponse.json({ error: "auction is not settled yet" }, { status: 409 });
  }
  if (!auction.highestBidder || !auction.highestBidder.equals(wallet)) {
    return NextResponse.json(
      { error: "connected wallet did not win this auction" },
      { status: 403 },
    );
  }

  // One campaign per auction: a re-setup by the same winner updates in place
  // (new link); a different wallet can never pass the winner check above.
  const existing = await campaignForAuction(auctionKey.toBase58());

  // Mint the tracked link and initialize its on-chain counter.
  let link = await createLink(destination, auction.creator.toBase58());
  if (destination.includes("{linkId}")) {
    const resolved = destination.replaceAll("{linkId}", link.id);
    link = (await setLinkDestination(link.id, resolved)) ?? link;
  }
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const existingCounter = await getClickCounter(conn, link.id);
      if (existingCounter) {
        lastErr = null;
        break;
      }
      const sig = await initClickCounter(conn, relayerWallet(), link.id, auction.creator);
      console.log(`[pitchlink] init ClickCounter for ${link.id}:`, sig);
      lastErr = null;
      break;
    } catch (error) {
      lastErr = error;
      console.warn(`[pitchlink] initClickCounter attempt ${attempt} failed:`, error);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastErr) {
    return NextResponse.json(
      { error: "link saved but on-chain counter init failed; retry", detail: String(lastErr) },
      { status: 502 },
    );
  }

  const campaign = {
    linkId: link.id,
    auction: auctionKey.toBase58(),
    creator: auction.creator.toBase58(),
    wallet: wallet.toBase58(),
    brandName,
    destination: link.destination,
    logoUrl,
    createdAt: new Date().toISOString(),
  };
  await saveCampaign(campaign);

  return NextResponse.json({
    ...campaign,
    shortUrl: `/go/${link.id}`,
    replaced: Boolean(existing),
  });
}
