// Proves the place_bid atomic refund on devnet with throwaway wallets.
//
//   1. Fresh throwaway creator + bidder A + bidder B keypairs, funded from
//      ANCHOR_WALLET (never touches the production demo auction).
//   2. Creator opens a 10-minute auction on the throwaway PDA.
//   3. A bids 0.05 SOL.
//   4. B bids 0.06 SOL — the single transaction under test.
//   5. Reads that tx's pre/post balances: A must gain exactly +0.05 SOL,
//      B must lose 0.06 (+fee), treasury must net +0.01 SOL.
//
// Run: ANCHOR_WALLET=~/.config/solana/pitchlink-demo2.json \
//        npx tsx scripts/test-atomic-refund.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import {
  auctionPda,
  getAuction,
  initializeAuction,
  placeBid,
  treasuryPda,
} from "../src/lib/program";

const BID_A = BigInt(0.05 * LAMPORTS_PER_SOL); // 50_000_000
const BID_B = BigInt(0.06 * LAMPORTS_PER_SOL); // 60_000_000
const FUND = {
  creator: BigInt(0.01 * LAMPORTS_PER_SOL),
  a: BigInt(0.052 * LAMPORTS_PER_SOL),
  b: BigInt(0.062 * LAMPORTS_PER_SOL),
};

function loadKeypair(): Keypair {
  const fromEnv = process.env.ANCHOR_WALLET?.trim();
  const file = fromEnv
    ? path.resolve(fromEnv.replace(/^~(?=$|\/)/, os.homedir()))
    : path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function sol(lamports: bigint | number): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

/** Index of `key` in a confirmed tx's account key list (legacy or v0). */
function accountIndex(tx: unknown, key: PublicKey): number {
  const message = (tx as { transaction: { message: unknown } }).transaction.message as {
    accountKeys?: PublicKey[];
    staticAccountKeys?: PublicKey[];
  };
  const keys = message.staticAccountKeys ?? message.accountKeys ?? [];
  return keys.findIndex((k) => k.equals(key));
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const funder = loadKeypair();
  const creator = Keypair.generate();
  const bidderA = Keypair.generate();
  const bidderB = Keypair.generate();

  console.log("Throwaway wallets (created for this test only):");
  console.log(`  creator : ${creator.publicKey.toBase58()}`);
  console.log(`  bidder A: ${bidderA.publicKey.toBase58()}`);
  console.log(`  bidder B: ${bidderB.publicKey.toBase58()}`);

  const funderBalance = BigInt(await conn.getBalance(funder.publicKey));
  const needed = FUND.creator + FUND.a + FUND.b + BigInt(10_000);
  if (funderBalance < needed) {
    fail(`funder ${funder.publicKey.toBase58()} has ${sol(funderBalance)} SOL, needs ~${sol(needed)}`);
  }

  // 1. Fund the three throwaways in ONE transaction.
  const fundTx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: creator.publicKey, lamports: Number(FUND.creator) }),
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: bidderA.publicKey, lamports: Number(FUND.a) }),
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: bidderB.publicKey, lamports: Number(FUND.b) }),
  );
  const fundSig = await sendAndConfirmTransaction(conn, fundTx, [funder]);
  console.log(`\nFunded throwaways: ${fundSig}`);

  // 2. Fresh test auction on the throwaway creator PDA.
  const endTs = Math.floor(Date.now() / 1000) + 600;
  const initSig = await initializeAuction(conn, new Wallet(creator), endTs);
  const auction = auctionPda(creator.publicKey);
  const treasury = treasuryPda(auction);
  console.log(`Test auction: ${auction.toBase58()} (init tx ${initSig})`);

  // 3. Bidder A bids 0.05 SOL.
  const aBefore = BigInt(await conn.getBalance(bidderA.publicKey));
  const sigA = await placeBid(conn, new Wallet(bidderA), creator.publicKey, BID_A);
  console.log(`\nA bid 0.05 SOL: ${sigA}`);

  // 4. Bidder B bids 0.06 SOL — the atomic-refund transaction under test.
  const sigB = await placeBid(conn, new Wallet(bidderB), creator.publicKey, BID_B);
  console.log(`B bid 0.06 SOL: ${sigB}`);

  // 5. Inspect the single outbid transaction's balance deltas.
  const txB = await conn.getTransaction(sigB, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!txB?.meta) fail("could not fetch confirmed tx for B's bid");
  if (txB.meta.err) fail(`B's bid tx failed on-chain: ${JSON.stringify(txB.meta.err)}`);

  const iA = accountIndex(txB, bidderA.publicKey);
  const iB = accountIndex(txB, bidderB.publicKey);
  const iT = accountIndex(txB, treasury);
  if (iA < 0 || iB < 0 || iT < 0) fail("expected accounts missing from B's bid tx");

  const dA = BigInt(txB.meta.postBalances[iA]) - BigInt(txB.meta.preBalances[iA]);
  const dB = BigInt(txB.meta.postBalances[iB]) - BigInt(txB.meta.preBalances[iB]);
  const dT = BigInt(txB.meta.postBalances[iT]) - BigInt(txB.meta.preBalances[iT]);

  // 6. Final on-chain state.
  const state = await getAuction(conn, creator.publicKey);
  const aAfter = BigInt(await conn.getBalance(bidderA.publicKey));

  const checks = {
    "A refunded exactly +0.05 SOL inside B's single tx": dA === BID_A,
    "B debited 0.06 SOL + fee inside the same tx": dB === -(BID_B + BigInt(txB.meta.fee)),
    "Treasury nets +0.01 SOL (0.06 in, 0.05 out) in the same tx": dT === BID_B - BID_A,
    "A's wallet balance restored to pre-bid level (minus its own bid fee)": aAfter === aBefore - BigInt(5000),
    "highest_bidder is now B": !!state && state.highestBidder.equals(bidderB.publicKey),
    "highest_bid is now 0.06 SOL": !!state && state.highestBid === BID_B,
  };

  const passed = Object.values(checks).every(Boolean);

  console.log("\n--- RESULTS ---");
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }
  console.log("\nBalance deltas inside B's single bid transaction:");
  console.log(`  bidder A : ${dA >= 0 ? "+" : ""}${sol(dA)} SOL`);
  console.log(`  bidder B : ${sol(dB)} SOL (includes ${txB.meta.fee} lamport fee)`);
  console.log(`  treasury : +${sol(dT)} SOL`);

  console.log(
    JSON.stringify(
      {
        atomicRefund: passed,
        outbidTransaction: sigB,
        explorer: explorerTx(sigB),
        bidATransaction: { signature: sigA, explorer: explorerTx(sigA) },
        auction: auction.toBase58(),
        treasury: treasury.toBase58(),
      },
      null,
      2,
    ),
  );

  if (!passed) process.exit(1);
  console.log("\nATOMIC REFUND CONFIRMED: one transaction escrows B's bid AND refunds A in full.");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
