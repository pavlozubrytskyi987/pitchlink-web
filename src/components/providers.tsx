"use client";

import { useMemo } from "react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { LogoDraftProvider } from "@/components/logo-draft";
import { rpcEndpoint } from "@/lib/config";

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => rpcEndpoint(), []);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <LogoDraftProvider>{children}</LogoDraftProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
