import {
  clientsFromUrls,
  makeDohResolver,
  makeReader,
  verifyByCode,
  verifyCertificate,
  type DnsResolver,
  type Reader,
  type VerifyInput,
  type VerifyResult,
} from "@mohar/core";
import { deployment, DEV_WALLET_ENABLED } from "./config";

/**
 * Local demo zone: stands in for DNS on the Anvil network, where acharya.ac.in has no real TXT record.
 * On a real network (NEXT_PUBLIC_NETWORK=base-sepolia) this is bypassed and DNS-over-HTTPS is used.
 * The provider name "local-demo-zone" is shown in the checklist, so nobody mistakes it for real DNS.
 */
const DEMO_ZONE: Record<string, string[]> = {
  // anvil #1 (the demo issuer) and anvil #2 (used by e2e fixtures for the revoked-with-cutoff issuer)
  "acharya.ac.in": ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"],
  ...(process.env.NEXT_PUBLIC_DEV_DNS_JSON ? JSON.parse(process.env.NEXT_PUBLIC_DEV_DNS_JSON) : {}),
};

export const demoDnsResolver: DnsResolver = async (domain, identity) => {
  const ids = (DEMO_ZONE[domain] ?? []).map((a) => a.toLowerCase());
  return ids.includes(identity.toLowerCase())
    ? { status: "match", provider: "local-demo-zone", demo: true }
    : { status: "mismatch", provider: "local-demo-zone", found: [], demo: true };
};

/**
 * The stand-in zone is only ever allowed on the local Anvil chain (31337). Even if someone ships a build with the
 * dev flag on, a real network falls through to DNS-over-HTTPS. Results from the stand-in are marked `demo`, which
 * the checklist prints as "DEMO ONLY".
 */
const useDemoZone = DEV_WALLET_ENABLED && deployment.chainId === 31337;
export const dnsResolver: DnsResolver = useDemoZone ? demoDnsResolver : makeDohResolver();

/** A fresh reader per verification, so the "providers agreed" numbers belong to that run only. */
export function newReader(): Reader {
  return makeReader(deployment, clientsFromUrls(deployment.rpcUrls ?? []));
}

export function verify(input: VerifyInput): Promise<VerifyResult> {
  return verifyCertificate(input, { reader: newReader(), dns: dnsResolver });
}

export function verifyCode(bytes8: `0x${string}`): Promise<VerifyResult & { needsLink?: boolean }> {
  return verifyByCode(bytes8, { reader: newReader(), dns: dnsResolver });
}
