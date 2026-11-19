import { Connection } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";
import { clickCounterPda } from "../src/lib/program";

async function main() {
  const linkId = process.argv[2];
  const limit = Number(process.argv[3] ?? "10");
  if (!linkId) throw new Error("usage: last-clicks <linkId> [limit]");
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const pda = clickCounterPda(linkId);
  const sigs = await conn.getSignaturesForAddress(pda, { limit });
  console.log(JSON.stringify({
    linkId,
    pda: pda.toBase58(),
    count: sigs.length,
    signatures: sigs.map((s) => ({
      sig: s.signature,
      slot: s.slot,
      err: s.err,
      blockTime: s.blockTime,
      explorer: `https://explorer.solana.com/tx/${s.signature}?cluster=devnet`,
    })),
  }, null, 2));
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
