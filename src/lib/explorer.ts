import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/config";

const CLUSTER = "?cluster=devnet";

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}${CLUSTER}`;
}

export function shortAddress(value: string, size = 4): string {
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

/** Same seeds as auctionPda() in program.ts, without pulling Anchor into
    the board bundle. */
export function auctionAddress(creator: string): string {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("auction"), new PublicKey(creator).toBuffer()],
    new PublicKey(PROGRAM_ID),
  )[0].toBase58();
}
