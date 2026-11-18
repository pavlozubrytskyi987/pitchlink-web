"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChainStatus } from "@/components/chain-status";

export function SiteHeader({
  crumb,
  detail,
}: {
  /** Page name after "Pitchlink /". */
  crumb?: string;
  /** Muted suffix, hidden on phones. */
  detail?: string;
}) {
  const { connected, disconnect } = useWallet();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <nav className="flex min-w-0 items-center gap-2 text-[14px]" aria-label="Breadcrumb">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={24} height={24} className="size-6" />
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-fg">
              Pitchlink
            </span>
          </Link>
          {crumb ? (
            <>
              <span className="text-fg-3" aria-hidden>
                /
              </span>
              <span className="truncate text-fg-2">
                {crumb}
                {detail ? (
                  <span className="hidden text-fg-3 sm:inline"> · {detail}</span>
                ) : null}
              </span>
            </>
          ) : null}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:block">
            <ChainStatus compact />
          </span>
          {ready ? (
            <>
              <WalletMultiButton />
              {connected ? (
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="hidden h-9 rounded-full border border-line-strong px-3 text-[13px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg sm:block"
                >
                  Disconnect
                </button>
              ) : null}
            </>
          ) : (
            <div className="h-9 w-[132px] rounded-full bg-fg/90" aria-hidden />
          )}
        </div>
      </div>
    </header>
  );
}
