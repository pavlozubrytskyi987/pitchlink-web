"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ExternalIcon } from "@/components/icons";
import { explorerAddress, shortAddress } from "@/lib/explorer";

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

function LiveDot() {
  return (
    <span className="relative inline-flex size-[7px] shrink-0">
      <span className="live-dot absolute inset-0 rounded-full bg-accent/40" />
      <span className="relative m-auto size-[5px] rounded-full bg-accent" />
    </span>
  );
}

/** Header indicator: "● Solana devnet". */
export function ChainStatus() {
  return (
    <a
      href="https://explorer.solana.com/?cluster=devnet"
      target="_blank"
      rel="noopener noreferrer"
      title="Connected to Solana devnet. Opens Solana Explorer."
      className="inline-flex items-center gap-2 text-[13px] text-graphite transition-colors hover:text-ink"
    >
      <LiveDot />
      Solana devnet
    </a>
  );
}

function ProofRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5">
      <dt className="text-graphite">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${address}. Opens Solana Explorer.`}
      className="group inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
    >
      {shortAddress(address)}
      <ExternalIcon className="size-3 text-ash group-hover:text-accent" />
    </a>
  );
}

/** Ledger of the live, checkable facts behind the board. */
export function ProofList({
  programId,
  auctionAddress,
}: {
  programId: string;
  auctionAddress: string | null;
}) {
  const slot = useSlot();
  return (
    <dl className="w-full border-t border-ink text-[13.5px]">
      <ProofRow label="Network">
        <span className="inline-flex items-center gap-2">
          <LiveDot />
          Solana devnet
        </span>
      </ProofRow>
      <ProofRow label="Current slot">
        <span suppressHydrationWarning>
          {slot === null ? "…" : slot.toLocaleString("en-US")}
        </span>
      </ProofRow>
      <ProofRow label="Program">
        <AddressLink address={programId} />
      </ProofRow>
      <ProofRow label="Live auction">
        {auctionAddress ? (
          <AddressLink address={auctionAddress} />
        ) : (
          <span className="text-ash">Reading…</span>
        )}
      </ProofRow>
    </dl>
  );
}
