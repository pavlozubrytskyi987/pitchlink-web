/**
 * Records one 0.05 SOL devnet bid against a live Pitchlink auction.
 *
 * The bidder secret is written only to walkthrough/bidder.json, which is
 * gitignored. This script intentionally refuses to act without --execute.
 */
import fs from "node:fs";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { getAuction, placeBid } from "../src/lib/program";

const BID_LAMPORTS = 50_000_000;
const AIRDROP_LAMPORTS = Math.floor(0.5 * LAMPORTS_PER_SOL);
const creatorArg = process.argv[2];
const execute = process.argv.includes("--execute");

if (!creatorArg) {
  throw new Error("usage: bid-and-verify <creator-pubkey> [--execute]");
}

async function main() {
  const creator = new PublicKey(creatorArg);
  const connection = new Connection(rpcEndpoint(), "confirmed");
  const auction = await getAuction(connection, creator);
  const nowTs = Math.floor(Date.now() / 1000);

  if (!auction) throw new Error(`No auction for ${creator.toBase58()}`);
  if (auction.settled) throw new Error("Auction is already settled");
  if (auction.endTs <= nowTs) throw new Error("Auction has already ended");
  if (auction.highestBid > BigInt(0)) {
    throw new Error(`Auction already has a bid of ${auction.highestBid} lamports`);
  }

  const summary = {
    mode: execute ? "execute" : "dry-run",
    creator: creator.toBase58(),
    auction: auction.publicKey.toBase58(),
    endTs: auction.endTs,
    nowTs,
    bidLamports: BID_LAMPORTS,
    bidSol: BID_LAMPORTS / LAMPORTS_PER_SOL,
  };

  if (!execute) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const walkthroughDir = path.join(process.cwd(), "walkthrough");
  fs.mkdirSync(walkthroughDir, { recursive: true });
  const keypairPath = path.join(walkthroughDir, "bidder.json");
  if (fs.existsSync(keypairPath)) {
    throw new Error(`${keypairPath} already exists; refusing to reuse a bidder keypair`);
  }

  const bidder = Keypair.generate();
  fs.writeFileSync(keypairPath, JSON.stringify(Array.from(bidder.secretKey)), { mode: 0o600 });
  const airdropSignature = await connection.requestAirdrop(bidder.publicKey, AIRDROP_LAMPORTS);
  await connection.confirmTransaction(airdropSignature, "confirmed");

  const creatorBalanceBefore = await connection.getBalance(creator, "confirmed");
  const bidSignature = await placeBid(
    connection,
    new Wallet(bidder),
    creator,
    BID_LAMPORTS,
  );
  const after = await getAuction(connection, creator);

  console.log(JSON.stringify({
    ...summary,
    bidder: bidder.publicKey.toBase58(),
    bidderKeypair: "walkthrough/bidder.json (gitignored)",
    airdropSignature,
    bidSignature,
    bidExplorer: `https://explorer.solana.com/tx/${bidSignature}?cluster=devnet`,
    creatorBalanceBefore,
    highestBidAfter: after?.highestBid.toString() ?? null,
    highestBidderAfter: after?.highestBidder.toBase58() ?? null,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
