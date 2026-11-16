import { clusterApiUrl } from "@solana/web3.js";

export const DEFAULT_PROGRAM_ID =
  "EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD";

export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() || DEFAULT_PROGRAM_ID;

export const rpcIsQuickNode = Boolean(
  process.env.NEXT_PUBLIC_QUICKNODE_DEVNET_URL?.trim(),
);

export function rpcEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_QUICKNODE_DEVNET_URL?.trim();
  return url || clusterApiUrl("devnet");
}
