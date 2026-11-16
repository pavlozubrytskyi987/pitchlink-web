// Opens a Chef Dima auction on devnet.
// Signs with the local devnet creator wallet (~/.config/solana/id.json,
// or ANCHOR_WALLET). One auction PDA exists per creator, so this wallet
// must not already have an auction account.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { auctionPda, initializeAuction } from "../src/lib/program";

const HOURS = 48;

function creatorKeypair(): Keypair {
  const fromEnv = process.env.ANCHOR_WALLET?.trim();
  const file = fromEnv
    ? path.resolve(fromEnv.replace(/^~(?=$|\/)/, os.homedir()))
    : path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const wallet = new Wallet(creatorKeypair());
  const connection = new Connection(rpcEndpoint(), "confirmed");
  const endTs = Math.floor(Date.now() / 1000) + HOURS * 60 * 60;
  const auction = auctionPda(wallet.publicKey);

  const signature = await initializeAuction(connection, wallet, endTs);

  console.log(
    JSON.stringify(
      {
        signature,
        creator: wallet.publicKey.toBase58(),
        auction: auction.toBase58(),
        endTs,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
