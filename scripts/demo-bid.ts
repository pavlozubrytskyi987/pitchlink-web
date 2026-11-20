// Places ONE scripted bid on the demo auction from a local devnet keypair.
// Used for Advertiser A in the recorded demo; Advertiser B bids via the UI
// with manual Phantom approval. Real devnet transaction, no shortcuts.
//
//   DEMO_BID_SOL=0.05 npx tsx scripts/demo-bid.ts <creator-pubkey> [keypair-path]
//
// Default keypair: ~/.config/solana/pitchlink-demo.json (Advertiser A).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { fetchAuctionByAddress, auctionPda, placeBid } from "../src/lib/program";

const creatorArg = process.argv[2];
if (!creatorArg) {
  throw new Error("usage: demo-bid <creator-pubkey> [keypair-path]");
}
const keypairPath =
  process.argv[3] ?? path.join(os.homedir(), ".config", "solana", "pitchlink-demo.json");
const bidSol = Number(process.env.DEMO_BID_SOL ?? "0.05");

async function main() {
  const creator = new PublicKey(creatorArg);
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8")) as number[];
  const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(secret)));
  const connection = new Connection(rpcEndpoint(), "confirmed");

  const auctionAddress = auctionPda(creator);
  const auction = await fetchAuctionByAddress(connection, auctionAddress);
  if (!auction) throw new Error("no auction for that creator");
  if (auction.settled) throw new Error("already settled");
  if (auction.endTs <= Math.floor(Date.now() / 1000)) throw new Error("already ended");

  const lamports = BigInt(Math.round(bidSol * LAMPORTS_PER_SOL));
  if (lamports <= auction.highestBid) {
    throw new Error(`bid must exceed ${auction.highestBid} lamports`);
  }

  const signature = await placeBid(connection, wallet, creator, lamports);
  console.log(JSON.stringify({
    signature,
    bidder: wallet.publicKey.toBase58(),
    amountSol: bidSol,
    auction: auctionAddress.toBase58(),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
