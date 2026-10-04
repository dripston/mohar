"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, http, type Account, type Address, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Writer } from "@mohar/core";
import { chain, deployment, DEV_ISSUER_KEY, DEV_ROOT_KEY } from "./config";

type Wallet = WalletClient<Transport, Chain | undefined, Account>;
export type WalletKind = "injected" | "dev-issuer" | "dev-root";

interface WalletState {
  address?: Address;
  kind?: WalletKind;
  wallet?: Wallet;
  /** a ready-to-use Writer for @mohar/core issuance/lifecycle calls */
  writer?: Writer;
  error?: string;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
}

const Ctx = createContext<WalletState | null>(null);

export const publicClient = createPublicClient({ chain, transport: http(deployment.rpcUrls![0]) }) as PublicClient;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet>();
  const [kind, setKind] = useState<WalletKind>();
  const [error, setError] = useState<string>();

  const connect = useCallback(async (k: WalletKind) => {
    setError(undefined);
    try {
      if (k === "injected") {
        const eth = (window as any).ethereum;
        if (!eth) throw new Error("No browser wallet found. Install MetaMask, or use the demo wallet on the local network.");
        const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
        const hexId = `0x${chain.id.toString(16)}`;
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
        } catch {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: hexId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: deployment.rpcUrls, blockExplorerUrls: deployment.explorer ? [deployment.explorer] : [] }],
          });
        }
        setWallet(createWalletClient({ account: address!, chain, transport: custom(eth) }) as Wallet);
      } else {
        const account = privateKeyToAccount(k === "dev-root" ? DEV_ROOT_KEY : DEV_ISSUER_KEY);
        setWallet(createWalletClient({ account, chain, transport: http(deployment.rpcUrls![0]) }) as Wallet);
      }
      setKind(k);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(undefined);
    setKind(undefined);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address: wallet?.account.address,
      kind,
      wallet,
      writer: wallet ? { wallet, publicClient, deployment } : undefined,
      error,
      connect,
      disconnect,
    }),
    [wallet, kind, error, connect, disconnect],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
