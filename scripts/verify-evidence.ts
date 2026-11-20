/**
 * READ-ONLY evidence verification for the demo video QA.
 * Sends no transactions. Verifies:
 *  1. Live auction PDA state (hero creator)
 *  2. Treasury (escrow) PDA balance
 *  3. Historical atomic-refund tx balance movements
 *  4. Historical settlement tx balance movements
 *  5. ClickCounter PDA count + historical increment tx
 *  6. Historical bid count (what the UI lists)
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import {
  auctionPda,
  treasuryPda,
  getAuction,
  getClickCounter,
  clickCounterPda,
  getAllBids,
} from "../src/lib/program";

const HERO_CREATOR = "3na5fsd9VtLb3JzGbYg75dRXPw3a4vLpafh7R8VpuK3x";
const EXPECTED_AUCTION = "3ZTZVsqn3czjaHCNcE1yJwYnYcowd4nAjoFBLXvqd9mA";
const REFUND_TX =
  "3ZNiLSkx3Lfz3TQA3irZcuV7ShqqEsHzGsVhJr52tRjFCXEtW5qUDXQM5tQFC1hMp968Pu1mhNcDnthiWgXQRARc";
const SETTLE_TX =
  "45safFAyiajhaC973JG4fNtSczKeGcXsjbeSVuGWZupTSJKRLzYsdWNzpmcQp6e1jzzXjnect3L2SjyWDndWE3mn";
const COUNTER_TX =
  "2tdRZSzvXsrrw62QwkTbWHQPQ1pUviHcp5x9mmRUZJBxBNrWd9r9DZnTxkcLS1cPW43FsQSPwfiBxxBZdQVd9F6u";
const LINK_ID = "fxaVGVzo";
const LAMPORTS = 1_000_000_000;

function fmt(n: number) {
  return `${(n / LAMPORTS).toFixed(n % LAMPORTS === 0 ? 0 : 4)} SOL`;
}

async function txBalances(conn: Connection, sig: string, label: string) {
  const tx = await conn.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) {
    console.log(`${label}: NOT FOUND`);
    return;
  }
  console.log(`\n=== ${label}`);
  console.log("status:", tx.meta?.err ? `FAILED ${JSON.stringify(tx.meta.err)}` : "confirmed ok");
  console.log("slot:", tx.slot, " blockTime:", tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "?");
  const keys = tx.transaction.message.accountKeys;
  tx.meta?.preBalances.forEach((pre, i) => {
    const post = tx.meta!.postBalances[i];
    const diff = post - pre;
    if (diff === 0) return;
    const key = keys[i];
    const addr = key.pubkey.toBase58();
    console.log(
      `  ${diff > 0 ? "+" : ""}${fmt(diff).replace(" SOL", "")} SOL  ${addr.slice(0, 8)}…${addr.slice(-4)}${key.signer ? " (signer)" : ""}`,
    );
  });
}

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");

  // 1. Auction PDA
  const creator = new PublicKey(HERO_CREATOR);
  const pda = auctionPda(creator);
  console.log("=== Live auction PDA");
  console.log("derived PDA:", pda.toBase58());
  console.log("matches UI address:", pda.toBase58() === EXPECTED_AUCTION);
  const a = await getAuction(conn, creator);
  if (!a) {
    console.log("STATE: no auction account!");
  } else {
    const now = Math.floor(Date.now() / 1000);
    console.log(
      JSON.stringify(
        {
          creator: a.creator.toBase58(),
          highestBidLamports: a.highestBid.toString(),
          highestBidSol: Number(a.highestBid) / LAMPORTS,
          highestBidder: a.highestBidder?.toBase58() ?? null,
          endTs: Number(a.endTs),
          endsAt: new Date(Number(a.endTs) * 1000).toISOString(),
          secondsRemaining: Number(a.endTs) - now,
          settled: a.settled,
        },
        null,
        2,
      ),
    );

    // 2. Treasury / escrow
    const treasury = treasuryPda(a.publicKey);
    const bal = await conn.getBalance(treasury);
    console.log("\n=== Treasury (escrow) PDA");
    console.log("address:", treasury.toBase58());
    console.log("balance:", fmt(bal), bal === 0 ? "(empty — no bids escrowed)" : "");
    console.log("owner:", (await conn.getAccountInfo(treasury))?.owner.toBase58() ?? "none");
  }

  // 3–5. Historical transactions
  await txBalances(conn, REFUND_TX, "Atomic refund tx (0.06 bid in, 0.05 refund out, same tx)");
  await txBalances(conn, SETTLE_TX, "Settlement tx (treasury pays creator 0.05)");
  await txBalances(conn, COUNTER_TX, "ClickCounter increment tx");

  // ClickCounter current state
  const counter = await getClickCounter(conn, LINK_ID);
  console.log("\n=== ClickCounter PDA (current on-chain state)");
  console.log("derived PDA:", clickCounterPda(LINK_ID).toBase58());
  console.log(counter ? `count: ${counter.count}  creator: ${counter.creator.toBase58()}` : "NOT FOUND");

  // Historical bids the UI lists
  const bids = await getAllBids(conn);
  console.log("\n=== Historical BidPlaced events:", bids.length);

  console.log("\nVERIFY_DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
