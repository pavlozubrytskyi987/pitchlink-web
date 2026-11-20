// Read-only: list recent transactions touching the demo auction PDA.
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";

async function main() {
  const pda = process.argv[2];
  if (!pda) throw new Error("usage: demo-sigs <auction-pda>");
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const sigs = await conn.getSignaturesForAddress(new PublicKey(pda), { limit: 10 });
  for (const s of sigs) {
    console.log(s.signature, s.err ? "ERR" : "ok", new Date((s.blockTime ?? 0) * 1000).toISOString());
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
