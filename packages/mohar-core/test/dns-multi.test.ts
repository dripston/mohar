import { describe, expect, it } from "vitest";
import { makeDohResolver } from "../src";

/** One domain, several issuer identities (a ministry portal hosting several offices, or a free DNS host with one TXT slot). */
const A = "0x367eab3eF1cB7097334dAEB682c6673d23C9Ba0f";
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const C = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const doh = (data: string) =>
  makeDohResolver([{ name: "stub", url: () => "https://stub/" }], {
    fetchImpl: (async () => new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data }] }), { status: 200 })) as typeof fetch,
  });

describe("DNS TXT listing several identities", () => {
  it("matches any identity in a comma-separated list, case-insensitively", async () => {
    const r = doh(`"mohar-issuer=${A}, ${B.toLowerCase()}"`);
    expect((await r("x.org", B as any)).status).toBe("match");
    expect((await r("x.org", A as any)).status).toBe("match");
    expect((await r("x.org", C as any)).status).toBe("mismatch");
  });

  it("a prefix or substring of an identity is not a match", async () => {
    const r = doh(`"mohar-issuer=${A.slice(0, 20)},${A}x"`);
    expect((await r("x.org", A as any)).status).toBe("mismatch");
  });

  it("the single-identity form still works", async () => {
    expect((await doh(`"mohar-issuer=${A}"`)("x.org", A as any)).status).toBe("match");
  });
});
