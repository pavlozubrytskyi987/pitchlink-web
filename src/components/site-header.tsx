"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChainStatus } from "@/components/chain-status";

export function SiteHeader({
  crumb,
  children,
}: {
  /** Page name shown after the wordmark. */
  crumb?: string;
  /** Rendered under the bar, inside the sticky header (the board's ticker). */
  children?: React.ReactNode;
}) {
  const { connected, disconnect } = useWallet();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-paper/92 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-5 sm:px-8">
        <nav className="flex min-w-0 items-center gap-3" aria-label="Breadcrumb">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              width={20}
              height={20}
              className="size-5 brightness-0"
            />
            <span className="text-[20px] font-semibold leading-none tracking-[-0.02em]">
              Pitchlink
            </span>
          </Link>
          {crumb ? (
            <>
              <span className="h-4 w-px bg-hairline-strong" aria-hidden />
              <span className="truncate text-[14px] text-graphite">{crumb}</span>
            </>
          ) : null}
        </nav>
        <div className="flex shrink-0 items-center gap-5">
          <span className="hidden sm:block">
            <ChainStatus />
          </span>
          <div className="flex items-center gap-2">
            {ready ? (
              <>
                <WalletMultiButton />
                {connected ? (
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    className="hidden h-[38px] rounded-full border border-hairline-strong px-4 text-[14px] text-graphite transition-colors hover:border-ink hover:text-ink sm:block"
                  >
                    Disconnect
                  </button>
                ) : null}
              </>
            ) : (
              <div className="h-[38px] w-[136px] rounded-full bg-ink" aria-hidden />
            )}
          </div>
        </div>
      </div>
      {children}
    </header>
  );
}
