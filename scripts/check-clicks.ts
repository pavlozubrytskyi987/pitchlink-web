import { Connection } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { clickCounterPda, getClickCounter } from "../src/lib/program";

async function main() {
  const linkId = process.argv[2];
  if (!linkId) throw new Error("usage: check-clicks <linkId>");
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const pda = clickCounterPda(linkId);
  const counter = await getClickCounter(conn, linkId);
  console.log(JSON.stringify({
    linkId,
    pda: pda.toBase58(),
    exists: !!counter,
    count: counter ? Number(counter.count) : null,
    creator: counter?.creator?.toBase58() ?? null,
  }, null, 2));
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
