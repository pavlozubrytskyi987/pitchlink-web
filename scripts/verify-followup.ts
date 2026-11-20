// Read-only: timestamp the 0.06 bid on the hero auction + retry historical count.
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { getAllBids, getBids } from "../src/lib/program";

const AUCTION = "3ZTZVsqn3czjaHCNcE1yJwYnYcowd4nAjoFBLXvqd9mA";

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const bids = await getBids(conn, new PublicKey(AUCTION));
  console.log("bids on live auction:", bids.length);
  for (const b of bids) {
    const sigs = await conn.getSignaturesForAddress(b.bidder, { limit: 5 });
    console.log({
      bidder: b.bidder.toBase58(),
      amountSol: Number(b.amount) / 1e9,
      signature: b.signature,
    });
  }
  // blockTime for the bid tx
  if (bids[0]) {
    const tx = await conn.getParsedTransaction(bids[0].signature, {
      maxSupportedTransactionVersion: 0,
    });
    console.log(
      "bid confirmed at:",
      tx?.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "?",
    );
  }
  const all = await getAllBids(conn).catch((e) => {
    console.log("getAllBids failed:", String(e).slice(0, 120));
    return null;
  });
  if (all) console.log("historical BidPlaced events:", all.length);
  console.log("DONE");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
