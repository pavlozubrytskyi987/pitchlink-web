// Watch the demo auction until a second bid (B) lands, then print evidence.
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { fetchAuctionByAddress, getBids } from "../src/lib/program";

const PDA = new PublicKey("5tNfJVLKKrRHmeGaReCGx2qUAZkqaB2BykA1rTmgPWd8");

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const deadline = Date.now() + 4 * 60 * 1000;
  for (;;) {
    const a = await fetchAuctionByAddress(conn, PDA).catch(() => null);
    if (a && a.highestBid > BigInt(50_000_000)) {
      const bids = await getBids(conn, PDA).catch(() => []);
      console.log("B_LANDED", JSON.stringify({
        highestSol: Number(a.highestBid) / 1e9,
        bidder: a.highestBidder.toBase58(),
        bids: bids.map((b) => ({ sig: b.signature, sol: Number(b.amount) / 1e9 })),
      }));
      return;
    }
    if (Date.now() > deadline) {
      console.log("TIMEOUT_WAITING_FOR_B");
      return;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
