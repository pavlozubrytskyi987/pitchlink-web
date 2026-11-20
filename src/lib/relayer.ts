// Server-side relayer: signs init_click_counter and increment_click on behalf
// of visitors. Loaded lazily and only in Node (server-only guarded).
//
// Key material comes from (in priority order):
//   1. RELAYER_SECRET_KEY — base58 or JSON-array secret key. This is the
//      Vercel/serverless path: no filesystem involved, never exposed to the
//      browser bundle (no NEXT_PUBLIC_ prefix).
//   2. RELAYER_KEYPAIR — path to a local keypair JSON (dev only).

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
import bs58 from "bs58";
import { rpcEndpoint } from "@/lib/config";
import type { PitchlinkWallet } from "@/lib/program";

function secretFromEnv(): Uint8Array | null {
  const raw = process.env.RELAYER_SECRET_KEY?.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("[")) {
      return Uint8Array.from(JSON.parse(raw) as number[]);
    }
    return bs58.decode(raw);
  } catch {
    throw new Error("RELAYER_SECRET_KEY is neither a JSON array nor base58");
  }
}

function keypairPath(): string {
  const env = process.env.RELAYER_KEYPAIR?.trim();
  if (!env) {
    throw new Error(
      "No relayer key: set RELAYER_SECRET_KEY (base58/JSON) or RELAYER_KEYPAIR (file path).",
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
  const fromEnv = secretFromEnv();
  if (fromEnv) {
    cachedKeypair = Keypair.fromSecretKey(fromEnv);
    return cachedKeypair;
  }
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
