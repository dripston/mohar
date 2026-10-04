import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { certificateRegistryAbi, issuerRegistryAbi } from "./abi.generated";

export interface Deployment {
  chainId: number;
  network: string;
  issuerRegistry: Address;
  certificateRegistry: Address;
  rootAuthority?: Address;
  deployBlock?: number;
  /** ordered public RPC endpoints (first = preferred). The verifier needs two agreeing answers for a verdict. */
  rpcUrls?: string[];
  explorer?: string;
}

/** Mirrors `CertificateRegistry.State`. */
export const STATE = ["NotFound", "Active", "Suspended", "Revoked", "Expired", "IssuerRevoked"] as const;
export type CertState = (typeof STATE)[number];

export interface ChainCert {
  state: CertState;
  signer: Address;
  issuer: Address;
  issuedAt: number;
  expiresAt: number;
  reason: number;
  updatedAt: number;
}

export interface ChainIssuer {
  identity: Address;
  name: string;
  domain: string;
  registeredAt: number;
  domainCheckedAt: number;
  keyRevokedFrom: number;
  keyRevokeReason: number;
}

export class ChainUnreachable extends Error {
  constructor(public errors: string[]) {
    super(`Could not reach the chain: ${errors.join("; ")}`);
  }
}

const bigSafe = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export interface Reader {
  deployment: Deployment;
  /** how many independent providers answered identically for the last call (1 = single source) */
  agreement: { providers: number; agreed: number };
  getIssuerByKey(key: Address): Promise<ChainIssuer | null>;
  getCert(rid: Hex): Promise<ChainCert>;
  getBatchCert(batchRoot: Hex, documentRoot: Hex, expiresAt: number, proof: Hex[]): Promise<ChainCert>;
  findByShortCode(bytes8: Hex): Promise<{ certId: Hex; issuer: Address; signer: Address; expiresAt: number } | null>;
}

const toNum = (x: bigint | number) => Number(x);

function normCert(v: { state: number; cert: any }): ChainCert {
  return {
    state: STATE[v.state] ?? "NotFound",
    signer: v.cert.signer,
    issuer: v.cert.issuer,
    issuedAt: toNum(v.cert.issuedAt),
    expiresAt: toNum(v.cert.expiresAt),
    reason: Number(v.cert.reason),
    updatedAt: toNum(v.cert.updatedAt),
  };
}

/**
 * Chain reader over an ordered list of RPC endpoints. Each read is sent to up to `fanout` providers.
 * Results must agree: two matching answers count as verified, one answer is returned flagged as "single source",
 * zero answers throws {@link ChainUnreachable}. A disagreement throws too, because a split is never a verdict.
 */
export function makeReader(deployment: Deployment, clients: PublicClient[], fanout = 3): Reader {
  const agreement = { providers: 0, agreed: 0 };
  const quorum = async <T>(fn: (c: PublicClient) => Promise<T>): Promise<T> => {
    const pool = clients.slice(0, fanout);
    const settled = await Promise.allSettled(pool.map(fn));
    const ok: T[] = [];
    const errors: string[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") ok.push(s.value);
      else errors.push((s.reason as Error)?.message?.split("\n")[0] ?? String(s.reason));
    }
    agreement.providers = pool.length;
    if (ok.length === 0) throw new ChainUnreachable(errors);
    const groups = new Map<string, { v: T; n: number }>();
    for (const v of ok) {
      const k = JSON.stringify(v, bigSafe);
      const g = groups.get(k);
      if (g) g.n++;
      else groups.set(k, { v, n: 1 });
    }
    const best = [...groups.values()].sort((a, b) => b.n - a.n)[0]!;
    if (groups.size > 1 && best.n < 2) throw new ChainUnreachable(["providers disagree, refusing to give a verdict"]);
    agreement.agreed = best.n;
    return best.v;
  };

  const certAddr = deployment.certificateRegistry;
  const regAddr = deployment.issuerRegistry;

  return {
    deployment,
    agreement,
    async getIssuerByKey(key) {
      return quorum(async (c) => {
        const identity = (await c.readContract({ address: regAddr, abi: issuerRegistryAbi, functionName: "identityOf", args: [key] })) as Address;
        if (/^0x0{40}$/.test(identity)) return null;
        const [issuer, k] = await Promise.all([
          c.readContract({ address: regAddr, abi: issuerRegistryAbi, functionName: "getIssuer", args: [identity] }),
          c.readContract({ address: regAddr, abi: issuerRegistryAbi, functionName: "getKey", args: [key] }),
        ]);
        return {
          identity,
          name: issuer.name,
          domain: issuer.domain,
          registeredAt: toNum(issuer.registeredAt),
          domainCheckedAt: toNum(issuer.domainCheckedAt),
          keyRevokedFrom: toNum(k.revokedFrom),
          keyRevokeReason: Number(k.reason),
        } satisfies ChainIssuer;
      });
    },
    async getCert(rid) {
      return quorum(async (c) =>
        normCert(await c.readContract({ address: certAddr, abi: certificateRegistryAbi, functionName: "getCert", args: [rid] })),
      );
    },
    async getBatchCert(batchRoot, documentRoot, expiresAt, proof) {
      return quorum(async (c) =>
        normCert(
          await c.readContract({
            address: certAddr,
            abi: certificateRegistryAbi,
            functionName: "getBatchCert",
            args: [batchRoot, documentRoot, BigInt(expiresAt), proof],
          }),
        ),
      );
    },
    async findByShortCode(bytes8) {
      return quorum(async (c) => {
        const logs = await c.getContractEvents({
          address: certAddr,
          abi: certificateRegistryAbi,
          eventName: "Issued",
          args: { shortCode: bytes8 },
          fromBlock: BigInt(deployment.deployBlock ?? 0),
          toBlock: "latest",
        });
        const l = logs[0];
        if (!l) return null;
        return {
          certId: l.args.certId as Hex,
          issuer: l.args.issuer as Address,
          signer: l.args.signer as Address,
          expiresAt: toNum(l.args.expiresAt as bigint),
        };
      });
    },
  };
}

/** One viem client per RPC URL, 4 s timeout each. */
export function clientsFromUrls(urls: string[], timeoutMs = 4000): PublicClient[] {
  return urls.map((u) => createPublicClient({ transport: http(u, { timeout: timeoutMs, retryCount: 0 }) }) as PublicClient);
}
