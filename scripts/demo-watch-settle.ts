// Watch the round-2 auction until settled, then print the winner + payout evidence.
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { fetchAuctionByAddress } from "../src/lib/program";

const PDA = new PublicKey("5tNfJVLKKrRHmeGaReCGx2qUAZkqaB2BykA1rTmgPWd8");

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const deadline = Date.now() + 15 * 60 * 1000;
  for (;;) {
    const a = await fetchAuctionByAddress(conn, PDA).catch(() => null);
    if (a?.settled) {
      // find the settle tx: newest signature touching the auction
      const sigs = await conn.getSignaturesForAddress(PDA, { limit: 5 });
      console.log("SETTLED", JSON.stringify({
        winner: a.highestBidder.toBase58(),
        amountSol: Number(a.highestBid) / 1e9,
        settleSig: sigs[0]?.signature ?? null,
      }));
      return;
    }
    if (Date.now() > deadline) { console.log("TIMEOUT_WAITING_FOR_SETTLE"); return; }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
