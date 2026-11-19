import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { auctionPda, getAuction } from "../src/lib/program";

async function main() {
  const creator = new PublicKey(
    process.argv[2] ?? "HijGXNG2mLfq62rQrbWmJco3Sser37ad8xDdCbChFoPD",
  );
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const pda = auctionPda(creator);
  console.log("auction PDA:", pda.toBase58());
  const a = await getAuction(conn, creator);
  if (!a) {
    console.log("STATE: no auction account");
    return;
  }
  console.log(JSON.stringify({
    address: a.publicKey.toBase58(),
    creator: a.creator.toBase58(),
    endTs: Number(a.endTs),
    nowTs: Math.floor(Date.now() / 1000),
    highestBid: a.highestBid.toString(),
    highestBidder: a.highestBidder?.toBase58() ?? null,
    settled: a.settled,
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
