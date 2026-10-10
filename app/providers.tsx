"use client";

import { ReactNode, useMemo } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

// devnet固定。wallets=[] でも Phantom などは Wallet Standard で自動検出される。
export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet"),
    []
  );
  return (
    <ConnectionProvider endpoint={endpoint}>
            <WalletProvider
        wallets={[]}
        autoConnect
        onError={(e) => {
          // ユーザーがウォレットで「拒否」したのはエラーではないので静かに無視
          if (/reject/i.test(e.message)) return;
          console.warn(e);
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
