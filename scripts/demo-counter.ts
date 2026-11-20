import { Connection } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { getClickCounter, clickCounterPda } from "../src/lib/program";

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const linkId = process.argv[2] ?? "KeKwU8g5";
  const counter = await getClickCounter(conn, linkId);
  console.log(JSON.stringify({
    linkId,
    pda: clickCounterPda(linkId).toBase58(),
    count: counter ? Number(counter.count) : null,
    creator: counter?.creator.toBase58() ?? null,
  }));
}
main().catch((e) => { console.error(e); process.exit(1); });
