// Settles the current hero auction on devnet (any signer works after end_ts).
// Signs with ~/.config/solana/id.json (or ANCHOR_WALLET). Pass the creator
// pubkey as argv[2]; defaults to the HERO wallet.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { auctionPda, getAuction, settleAuction } from "../src/lib/program";

function loadKeypair(): Keypair {
  const fromEnv = process.env.ANCHOR_WALLET?.trim();
  const file = fromEnv
    ? path.resolve(fromEnv.replace(/^~(?=$|\/)/, os.homedir()))
    : path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const creatorArg = process.argv[2] ?? "HijGXNG2mLfq62rQrbWmJco3Sser37ad8xDdCbChFoPD";
  const creator = new PublicKey(creatorArg);
  const wallet = new Wallet(loadKeypair());
  const connection = new Connection(rpcEndpoint(), "confirmed");
  const pda = auctionPda(creator);
  const before = await getAuction(connection, creator);
  if (!before) throw new Error("no auction for " + creator.toBase58());
  if (before.settled) {
    console.log(JSON.stringify({ status: "already settled", auction: pda.toBase58() }, null, 2));
    return;
  }
  const signature = await settleAuction(connection, wallet, creator);
  console.log(JSON.stringify({ status: "settled", signature, auction: pda.toBase58() }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
