// Server-side relayer: signs init_click_counter and increment_click on behalf
// of visitors. Loaded lazily and only in Node (server-only guarded).
// The keypair path comes from RELAYER_KEYPAIR in .env (gitignored).

import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { rpcEndpoint } from "@/lib/config";
import type { PitchlinkWallet } from "@/lib/program";

function keypairPath(): string {
  const env = process.env.RELAYER_KEYPAIR?.trim();
  if (!env) {
    throw new Error(
      "RELAYER_KEYPAIR not set. Point it at a funded devnet keypair JSON.",
    );
  }
  const resolved = env.startsWith("~/")
    ? path.join(os.homedir(), env.slice(2))
    : env;
  return path.resolve(resolved);
}

let cachedKeypair: Keypair | null = null;
export function relayerKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  const raw = fs.readFileSync(keypairPath(), "utf8");
  cachedKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  return cachedKeypair;
}

let cachedConnection: Connection | null = null;
export function serverConnection(): Connection {
  if (!cachedConnection) {
    cachedConnection = new Connection(rpcEndpoint(), "confirmed");
  }
  return cachedConnection;
}

export function relayerWallet(): PitchlinkWallet {
  const kp = relayerKeypair();
  return {
    publicKey: kp.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof VersionedTransaction) {
        tx.sign([kp]);
      } else {
        (tx as Transaction).partialSign(kp);
      }
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) {
          tx.sign([kp]);
        } else {
          (tx as Transaction).partialSign(kp);
        }
      }
      return txs;
    },
  };
}

export function relayerPubkey(): PublicKey {
  return relayerKeypair().publicKey;
}
