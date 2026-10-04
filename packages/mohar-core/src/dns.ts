import type { Address } from "viem";

/**
 * Domain proof: the issuer's domain must publish a TXT record `mohar-issuer=0x<identity address>`.
 * Looked up over DNS-over-HTTPS with provider fallback. A failed lookup is "unreachable", never "mismatch".
 */
export type DnsResult =
  | { status: "match"; provider: string; /** true = a local stand-in zone, NOT real DNS (anvil demo only) */ demo?: boolean }
  | { status: "mismatch"; provider: string; found: string[]; demo?: boolean }
  | { status: "unreachable"; errors: string[] };

export interface DohProvider {
  name: string;
  url: (domain: string) => string;
}

export const DEFAULT_DOH: DohProvider[] = [
  {
    name: "cloudflare-dns.com",
    url: (d) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=TXT`,
  },
  { name: "dns.google", url: (d) => `https://dns.google/resolve?name=${encodeURIComponent(d)}&type=TXT` },
];

export type DnsResolver = (domain: string, identity: Address) => Promise<DnsResult>;

export const TXT_PREFIX = "mohar-issuer=";

export function expectedTxt(identity: Address): string {
  return `${TXT_PREFIX}${identity}`;
}

/** TXT `data` comes back quoted and sometimes split in chunks: `"mohar-issuer=" "0xabc"`. */
function cleanTxt(data: string): string {
  return data.replace(/"\s+"/g, "").replace(/^"|"$/g, "");
}

export function makeDohResolver(
  providers: DohProvider[] = DEFAULT_DOH,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): DnsResolver {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const f = opts.fetchImpl ?? fetch;
  return async (domain, identity) => {
    const errors: string[] = [];
    for (const p of providers) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        let res: Response;
        try {
          res = await f(p.url(domain), { headers: { accept: "application/dns-json" }, signal: ctl.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { Status?: number; Answer?: { type: number; data: string }[] };
        // Only NOERROR (0) and NXDOMAIN (3) are real answers. SERVFAIL, REFUSED, etc. mean "the resolver failed",
        // which must never be read as "this domain has no matching record".
        if (body.Status !== undefined && body.Status !== 0 && body.Status !== 3) throw new Error(`DNS status ${body.Status}`);
        const txts = (body.Answer ?? []).filter((a) => a.type === 16).map((a) => cleanTxt(a.data));
        const ours = txts.filter((t) => t.toLowerCase().startsWith(TXT_PREFIX));
        // one record may list several identities: mohar-issuer=0xA,0xB (exact entries only, never a prefix match)
        const want = identity.toLowerCase();
        const listed = ours.flatMap((t) => t.slice(TXT_PREFIX.length).split(",").map((x) => x.trim().toLowerCase()));
        if (listed.includes(want)) {
          return { status: "match", provider: p.name };
        }
        return { status: "mismatch", provider: p.name, found: ours };
      } catch (e) {
        errors.push(`${p.name}: ${(e as Error).message}`);
      }
    }
    return { status: "unreachable", errors };
  };
}
