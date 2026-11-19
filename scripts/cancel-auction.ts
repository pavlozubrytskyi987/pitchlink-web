// Cancels the caller's auction (returns rent to creator, closes PDA).
// Only works while highest_bid == 0. Signs with ANCHOR_WALLET or
// ~/.config/solana/id.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { auctionPda, cancelAuction } from "../src/lib/program";

function loadKeypair(): Keypair {
  const fromEnv = process.env.ANCHOR_WALLET?.trim();
  const file = fromEnv
    ? path.resolve(fromEnv.replace(/^~(?=$|\/)/, os.homedir()))
    : path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const wallet = new Wallet(loadKeypair());
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const signature = await cancelAuction(conn, wallet);
  console.log(JSON.stringify({
    status: "cancelled",
    signature,
    auction: auctionPda(wallet.publicKey).toBase58(),
    creator: wallet.publicKey.toBase58(),
  }, null, 2));
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
