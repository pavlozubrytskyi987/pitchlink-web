"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

export function SiteHeader() {
  const { connected, disconnect } = useWallet();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <div className="min-w-0">
        <a href="/" className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-[#1c1c1c]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={22} height={22} className="size-[22px]" />
          Pitchlink
        </a>
        <p className="text-[13px] text-[#8d8d8d]">Logo on the piece · Solana devnet</p>
      </div>
      <div className="flex items-center gap-2">
        {ready ? (
          <>
            <WalletMultiButton />
            {connected ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                className="h-[38px] rounded-full border border-[#e6e4df] bg-white px-3 text-sm text-[#1c1c1c]"
              >
                Disconnect
              </button>
            ) : null}
          </>
        ) : (
          <div className="h-[38px] w-[132px] rounded-full bg-[#161616]" aria-hidden />
        )}
      </div>
    </header>
  );
}
