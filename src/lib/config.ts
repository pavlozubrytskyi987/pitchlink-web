import { clusterApiUrl } from "@solana/web3.js";

export const DEFAULT_PROGRAM_ID =
  "EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD";

export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() || DEFAULT_PROGRAM_ID;

export const rpcIsQuickNode = Boolean(
  process.env.NEXT_PUBLIC_QUICKNODE_DEVNET_URL?.trim(),
);

/**
 * RPC endpoint resolution.
 *
 * Server code (relayer, API routes, scripts) prefers SOLANA_RPC_URL, which is
 * never inlined into the browser bundle — a token-bearing endpoint stays
 * server-only. The browser falls back to NEXT_PUBLIC_QUICKNODE_DEVNET_URL,
 * which is public by design (restrict it in the QuickNode dashboard), then to
 * the rate-limited public devnet RPC.
 */
export function rpcEndpoint(): string {
  if (typeof window === "undefined") {
    const serverUrl = process.env.SOLANA_RPC_URL?.trim();
    if (serverUrl) return serverUrl;
  }
  const url = process.env.NEXT_PUBLIC_QUICKNODE_DEVNET_URL?.trim();
  return url || clusterApiUrl("devnet");
}
