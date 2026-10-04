import type { Address } from "viem";

/**
 * Domain proof: the issuer's domain must publish a TXT record `mohar-issuer=0x<identity address>`.
 * Looked up over DNS-over-HTTPS with provider fallback. A failed lookup is "unreachable", never "mismatch".
 */
export type DnsResult =
  | { status: "match"; provider: string }
  | { status: "mismatch"; provider: string; found: string[] }
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
        const res = await f(p.url(domain), { headers: { accept: "application/dns-json" }, signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
        const txts = (body.Answer ?? []).filter((a) => a.type === 16).map((a) => cleanTxt(a.data));
        const ours = txts.filter((t) => t.toLowerCase().startsWith(TXT_PREFIX));
        if (ours.some((t) => t.toLowerCase() === expectedTxt(identity).toLowerCase())) {
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
