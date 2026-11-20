// Read-only: show B's bid tx balance movements (A's atomic refund inside).
import { Connection } from "@solana/web3.js";
import { rpcEndpoint } from "../src/lib/config";

const SIG =
  process.argv[2] ??
  "2f72yJ8p1HdjyTzMMdW97tKzumsLUnKjUa7NbEwEfAqpsPerRbKDNuXkVxNBcM3Rad4pgFpsSuR8QWv7qV65fpTx";

async function main() {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const tx = await conn.getParsedTransaction(SIG, { maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log("NOT FOUND"); return; }
  console.log("status:", tx.meta?.err ? "FAILED" : "confirmed ok", " slot:", tx.slot);
  const keys = tx.transaction.message.accountKeys;
  tx.meta?.preBalances.forEach((pre, i) => {
    const diff = tx.meta!.postBalances[i] - pre;
    if (diff === 0) return;
    const k = keys[i];
    console.log(
      `  ${diff > 0 ? "+" : ""}${(diff / 1e9).toFixed(6)} SOL  ${k.pubkey.toBase58().slice(0, 8)}…${k.pubkey.toBase58().slice(-4)}${k.signer ? " (signer=B)" : ""}`,
    );
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
