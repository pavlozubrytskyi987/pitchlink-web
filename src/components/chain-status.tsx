"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ExternalIcon } from "@/components/icons";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";

/** Current devnet slot, live from the RPC: proof the page is on-chain now. */
function useSlot(): number | null {
  const { connection } = useConnection();
  const [slot, setSlot] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let lastPaint = 0;
    let lastEvent = Date.now();
    const show = (next: number) => {
      const t = Date.now();
      lastEvent = t;
      if (!alive || t - lastPaint < 450) return;
      lastPaint = t;
      setSlot(next);
    };
    connection.getSlot().then(show, () => {});
    let subId: number | null = null;
    try {
      subId = connection.onSlotChange((info) => show(info.slot));
    } catch {
      subId = null;
    }
    // Websocket fallback: poll if the subscription goes quiet.
    const poll = window.setInterval(() => {
      if (Date.now() - lastEvent > 4000)
        connection.getSlot().then(show, () => {});
    }, 4000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      if (subId !== null) void connection.removeSlotChangeListener(subId);
    };
  }, [connection]);

  return slot;
}

/** "● Live on Solana devnet · slot 523,504,209" */
export function ChainStatus({ compact = false }: { compact?: boolean }) {
  const slot = useSlot();
  return (
    <a
      href="https://explorer.solana.com/?cluster=devnet"
      target="_blank"
      rel="noopener noreferrer"
      title="Connected to Solana devnet. Opens Solana Explorer."
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border border-live/25 bg-live/[0.06] text-live-ink transition-colors hover:border-live/50 ${
        compact ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12.5px]"
      }`}
    >
      <span className="relative flex size-2">
        <span className="live-dot absolute inset-0 rounded-full bg-live/60 blur-[3px]" />
        <span className="relative size-2 rounded-full bg-live" />
      </span>
      <span className="font-semibold">
        {compact ? "Devnet" : "Live on Solana devnet"}
      </span>
      {!compact ? (
        <span className="hidden font-mono text-[11px] tabular-nums text-fg-3 sm:inline">
          slot{" "}
          <span className="text-fg-2" suppressHydrationWarning>
            {slot === null ? "…" : slot.toLocaleString("en-US")}
          </span>
        </span>
      ) : null}
    </a>
  );
}

/** Mono address chip that opens Explorer. */
export function ProofLink({
  label,
  address,
  tx = false,
}: {
  label: string;
  address: string;
  tx?: boolean;
}) {
  return (
    <a
      href={tx ? explorerTx(address) : explorerAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label}: ${address}. Opens Solana Explorer.`}
      className="group/proof inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-raised px-3 text-[12.5px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2"
    >
      <span>{label}</span>
      <span className="font-mono text-[11.5px] text-fg-2 group-hover/proof:text-fg group-hover/proof:underline group-hover/proof:underline-offset-2">
        {shortAddress(address)}
      </span>
      <ExternalIcon className="size-3 text-fg-3 group-hover/proof:text-live-ink" />
    </a>
  );
}
