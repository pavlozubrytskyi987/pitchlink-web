import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { fetchAuctionByAddress } from "../src/lib/program";

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const a = await fetchAuctionByAddress(
    conn,
    new PublicKey(process.argv[2] ?? "F7exRbkd4dnWhQqx6pAfznGunFSwSY16m1mSCK7MtrU3"),
  );
  console.log(JSON.stringify({
    highest: Number(a?.highestBid ?? 0) / 1e9,
    bidder: a?.highestBidder?.toBase58() ?? null,
    endTs: a?.endTs ?? null,
    now: Math.floor(Date.now() / 1000),
    settled: a?.settled ?? null,
  }));
}
main().catch((e) => { console.error(e); process.exit(1); });
