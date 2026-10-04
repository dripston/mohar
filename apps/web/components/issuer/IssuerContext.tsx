"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChainIssuer, Writer } from "@mohar/core";
import { useWallet } from "@/lib/wallet";
import { newReader } from "@/lib/verifier";

type Status = "disconnected" | "loading" | "ready" | "error";

interface IssuerState {
  status: Status;
  address?: `0x${string}`;
  issuer: ChainIssuer | null;
  /** registered AND the signing key is not revoked as of now */
  accredited: boolean;
  keyRevoked: boolean;
  error?: string;
  writer?: Writer;
  refresh: () => void;
}

const Ctx = createContext<IssuerState | null>(null);

export function IssuerProvider({ children }: { children: ReactNode }) {
  const { address, writer } = useWallet();
  const [issuer, setIssuer] = useState<ChainIssuer | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!address) {
      setStatus("disconnected");
      setIssuer(null);
      return;
    }
    let live = true;
    setStatus("loading");
    setError(undefined);
    newReader()
      .getIssuerByKey(address)
      .then((i) => {
        if (!live) return;
        setIssuer(i);
        setStatus("ready");
      })
      .catch((e) => {
        if (!live) return;
        setError(e?.message ?? "Could not read the issuer registry.");
        setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [address, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const keyRevoked = !!issuer && issuer.keyRevokedFrom > 0 && issuer.keyRevokedFrom <= Math.floor(Date.now() / 1000);
  const value = useMemo<IssuerState>(
    () => ({ status, address, issuer, accredited: status === "ready" && !!issuer && !keyRevoked, keyRevoked, error, writer, refresh }),
    [status, address, issuer, keyRevoked, error, writer, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIssuer(): IssuerState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIssuer outside IssuerProvider");
  return v;
}
