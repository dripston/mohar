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

/** Mirrors `IssuerRegistry.IssuerType`. */
export const ISSUER_TYPES = ["OTHER", "INSTITUTE", "REVENUE_OFFICE", "EMPLOYER"] as const;
export type IssuerKind = (typeof ISSUER_TYPES)[number];
export const ISSUER_TYPE_LABEL: Record<IssuerKind, string> = {
  OTHER: "Other issuer",
  INSTITUTE: "Institute",
  REVENUE_OFFICE: "Revenue office",
  EMPLOYER: "Employer",
};

export interface ChainIssuer {
  identity: Address;
  issuerType: IssuerKind;
  /** who vouches for this listing, set by the root authority (free text) */
  accreditationSource: string;
  name: string;
  domain: string;
  registeredAt: number;
  domainCheckedAt: number;
  keyRevokedFrom: number;
  keyRevokeReason: number;
}

/** Why a read could not produce an answer. Drives distinct, non-alarming UI states. */
export type UnreachableKind = "down" | "split" | "stale";

export class ChainUnreachable extends Error {
  constructor(
    public errors: string[],
    public kind: UnreachableKind = "down",
  ) {
    super(`Could not reach the chain: ${errors.join("; ")}`);
  }
}

const bigSafe = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

/** What the verifier knows about the providers it asked, surfaced to the UI. */
export interface Agreement {
  /** providers asked */
  providers: number;
  /** providers that gave the winning answer */
  agreed: number;
  /** providers that answered at all */
  answered: number;
  /** providers excluded because their head block was behind the others */
  stale: number;
  /** providers that errored / timed out */
  down: number;
  /** providers that answered something different from the majority */
  dissent: number;
  /**
   * true when more than one provider is configured but fewer than two could vouch for the answer
   * (single source). A lone RPC can lie, so the UI must say so.
   */
  degraded: boolean;
  /** block the answer was read at, and that block's timestamp: chain time, never browser time */
  block?: { number: number; timestamp: number };
}

export interface Reader {
  deployment: Deployment;
  agreement: Agreement;
  getIssuerByKey(key: Address): Promise<ChainIssuer | null>;
  getCert(rid: Hex): Promise<ChainCert>;
  getBatchCert(identity: Address, batchRoot: Hex, documentRoot: Hex, expiresAt: number, proof: Hex[]): Promise<ChainCert>;
  /** Resolve a short code on chain. `ambiguous`: more than one certificate shares the code. */
  findByShortCode(bytes8: Hex): Promise<{ rid: Hex; ambiguous: boolean; cert: ChainCert } | null>;
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

/** A provider whose newest block is more than this many seconds behind the best head is "stale". */
export const STALE_SECS = 120;

/**
 * Chain reader over an ordered list of RPC endpoints.
 *
 * Every read is pinned to ONE block so providers are compared like-for-like and so contract time checks
 * (expiry, key cut-offs) run on that block's timestamp, never the browser clock:
 *   1. ask each provider for its head; providers more than {@link STALE_SECS} behind the best are dropped as stale;
 *   2. read at the lowest head among the fresh ones (every fresh provider has it);
 *   3. >= 2 identical answers = quorum. One answer when several providers are configured = `degraded` (flagged,
 *      still returned). Several answers with no majority = `split` (never a verdict). Nothing = `down`.
 */
export interface ReaderOptions {
  /**
   * Bulk mode: take ONE head snapshot and reuse it for `pinMs`, so thousands of reads cost one round of head
   * lookups, every verdict in the run is judged at the same block, and issuer lookups are cached.
   */
  pinMs?: number;
}

export function makeReader(deployment: Deployment, clients: PublicClient[], fanout = 3, opts: ReaderOptions = {}): Reader {
  const agreement: Agreement = { providers: 0, agreed: 0, answered: 0, stale: 0, down: 0, dissent: 0, degraded: false };
  const pool = clients.slice(0, fanout);

  let pinned: { at: number; heads: PromiseSettledResult<{ number: bigint; timestamp: bigint }>[] } | undefined;
  let pinning: Promise<PromiseSettledResult<{ number: bigint; timestamp: bigint }>[]> | undefined;
  const headsOf = async () => {
    const fetchHeads = () => Promise.allSettled(pool.map((c) => c.getBlock({ blockTag: "latest" })));
    if (!opts.pinMs) return fetchHeads();
    if (pinned && Date.now() - pinned.at < opts.pinMs) return pinned.heads;
    pinning ??= fetchHeads().then((h) => {
      pinned = { at: Date.now(), heads: h };
      issuerCache.clear();
      pinning = undefined;
      return h;
    });
    return pinning;
  };
  const issuerCache = new Map<string, Promise<ChainIssuer | null>>();

  const quorum = async <T>(fn: (c: PublicClient, blockNumber: bigint) => Promise<T>): Promise<T> => {
    const errors: string[] = [];
    const msg = (r: unknown) => (r as Error)?.message?.split("\n")[0] ?? String(r);

    const heads = await headsOf();
    const live: { i: number; number: bigint; timestamp: number }[] = [];
    heads.forEach((h, i) => {
      if (h.status === "fulfilled") live.push({ i, number: h.value.number, timestamp: Number(h.value.timestamp) });
      else errors.push(msg(h.reason));
    });
    agreement.providers = pool.length;
    agreement.down = pool.length - live.length;
    agreement.stale = 0;
    agreement.dissent = 0;
    agreement.answered = 0;
    agreement.agreed = 0;
    if (live.length === 0) throw new ChainUnreachable(errors, "down");

    const bestTs = Math.max(...live.map((h) => h.timestamp));
    const fresh = live.filter((h) => h.timestamp >= bestTs - STALE_SECS);
    agreement.stale = live.length - fresh.length;
    const at = fresh.reduce((m, h) => (h.number < m.number ? h : m));

    const settled = await Promise.allSettled(fresh.map((h) => fn(pool[h.i]!, at.number)));
    const ok: T[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") ok.push(s.value);
      else errors.push(msg(s.reason));
    }
    agreement.down = pool.length - ok.length - agreement.stale;
    agreement.answered = ok.length;
    if (ok.length === 0) throw new ChainUnreachable(errors, "down");

    const groups = new Map<string, { v: T; n: number }>();
    for (const v of ok) {
      const k = JSON.stringify(v, bigSafe);
      const g = groups.get(k);
      if (g) g.n++;
      else groups.set(k, { v, n: 1 });
    }
    const best = [...groups.values()].sort((a, b) => b.n - a.n)[0]!;
    if (groups.size > 1 && best.n < 2) {
      throw new ChainUnreachable(["providers gave different answers and none had a majority"], "split");
    }
    agreement.agreed = best.n;
    agreement.dissent = ok.length - best.n;
    agreement.degraded = pool.length > 1 && best.n < 2;
    agreement.block = { number: Number(at.number), timestamp: at.timestamp };
    return best.v;
  };

  const readIssuer = (key: Address): Promise<ChainIssuer | null> =>
    quorum(async (c, blockNumber) => {
        const identity = (await c.readContract({
          address: regAddr,
          abi: issuerRegistryAbi,
          functionName: "identityOf",
          args: [key],
          blockNumber,
        })) as Address;
        if (/^0x0{40}$/.test(identity)) return null;
        const [issuer, k] = await Promise.all([
          c.readContract({ address: regAddr, abi: issuerRegistryAbi, functionName: "getIssuer", args: [identity], blockNumber }),
          c.readContract({ address: regAddr, abi: issuerRegistryAbi, functionName: "getKey", args: [key], blockNumber }),
        ]);
        return {
          identity,
          issuerType: ISSUER_TYPES[Number(issuer.issuerType)] ?? "OTHER",
          accreditationSource: issuer.accreditationSource,
          name: issuer.name,
          domain: issuer.domain,
          registeredAt: toNum(issuer.registeredAt),
          domainCheckedAt: toNum(issuer.domainCheckedAt),
          keyRevokedFrom: toNum(k.revokedFrom),
          keyRevokeReason: Number(k.reason),
        } satisfies ChainIssuer;
      });

  const certAddr = deployment.certificateRegistry;
  const regAddr = deployment.issuerRegistry;

  return {
    deployment,
    agreement,
    getIssuerByKey(key) {
      if (!opts.pinMs) return readIssuer(key);
      const k = key.toLowerCase();
      let p = issuerCache.get(k);
      if (!p) {
        p = readIssuer(key);
        issuerCache.set(k, p);
        p.catch(() => issuerCache.delete(k));
      }
      return p;
    },
    async getCert(rid) {
      return quorum(async (c, blockNumber) =>
        normCert(
          await c.readContract({ address: certAddr, abi: certificateRegistryAbi, functionName: "getCert", args: [rid], blockNumber }),
        ),
      );
    },
    async getBatchCert(identity, batchRoot, documentRoot, expiresAt, proof) {
      return quorum(async (c, blockNumber) =>
        normCert(
          await c.readContract({
            address: certAddr,
            abi: certificateRegistryAbi,
            functionName: "getBatchCert",
            args: [identity, batchRoot, documentRoot, BigInt(expiresAt), proof],
            blockNumber,
          }),
        ),
      );
    },
    async findByShortCode(bytes8) {
      return quorum(async (c, blockNumber) => {
        const [rid, ambiguous] = await c.readContract({
          address: certAddr,
          abi: certificateRegistryAbi,
          functionName: "resolveCode",
          args: [bytes8],
          blockNumber,
        });
        if (/^0x0{64}$/.test(rid)) return null;
        const cert = normCert(
          await c.readContract({ address: certAddr, abi: certificateRegistryAbi, functionName: "getCert", args: [rid], blockNumber }),
        );
        return { rid: rid as Hex, ambiguous, cert };
      });
    },
  };
}

/** One viem client per RPC URL, 4 s timeout each. */
export function clientsFromUrls(urls: string[], timeoutMs = 4000, opts: { batch?: boolean } = {}): PublicClient[] {
  // `batch`: JSON-RPC batching, many reads in one HTTP request. Used by the bulk screener.
  return urls.map(
    (u) =>
      createPublicClient({
        transport: http(u, { timeout: timeoutMs, retryCount: 0, ...(opts.batch ? { batch: { wait: 8, batchSize: 100 } } : {}) }),
      }) as PublicClient,
  );
}
