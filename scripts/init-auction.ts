// Opens a fresh hero auction on devnet.
// Signs with the local devnet creator wallet (~/.config/solana/id.json,
// or ANCHOR_WALLET). One auction PDA exists per creator, so this wallet
// must not already have an auction account.
//
// Duration: set DURATION_MINUTES env to override; default 5 minutes for the
// live demo. The on-chain program has no min-bid field; the 0.05 SOL floor
// lives in the frontend input.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { auctionPda, initializeAuction } from "../src/lib/program";

const DEFAULT_MINUTES = 5;
const DURATION_MINUTES = Number(process.env.DURATION_MINUTES ?? DEFAULT_MINUTES);

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
  if (!Number.isFinite(DURATION_MINUTES) || DURATION_MINUTES <= 0) {
    throw new Error(`invalid DURATION_MINUTES=${process.env.DURATION_MINUTES}`);
  }
  const endTs = Math.floor(Date.now() / 1000) + Math.round(DURATION_MINUTES * 60);
  const auction = auctionPda(wallet.publicKey);

  const signature = await initializeAuction(connection, wallet, endTs);

  console.log(
    JSON.stringify(
      {
        signature,
        creator: wallet.publicKey.toBase58(),
        auction: auction.toBase58(),
        endTs,
        durationMinutes: DURATION_MINUTES,
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
