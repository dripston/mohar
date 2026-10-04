// Builds TESTING.md from real test output. Run after the three suites:
//   forge test  |  pnpm --filter @mohar/core test  |  pnpm --filter @mohar/web e2e
// node scripts/make-testing-md.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const chainRows = read("packages/mohar-core/test-results/attack-matrix.json");
const e2eRows = read("apps/web/test-results/e2e-matrix.json");
const forge = existsSync("docs/forge-summary.txt") ? readFileSync("docs/forge-summary.txt", "utf8").trim() : "";

const mark = (p) => (p ? "PASS" : "FAIL");
const table = (rows, shots) =>
  [
    shots ? "| ID | Attack / scenario | Expected | Actual | Result | Evidence |" : "| ID | Attack / scenario | Expected | Actual | Result |",
    shots ? "|---|---|---|---|---|---|" : "|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.attack} | \`${r.expected}\` | \`${r.actual}\` | ${mark(r.pass)} |` +
        (shots ? ` ${r.screenshot ? `[screenshot](${r.screenshot})` : ""} |` : ""),
    ),
  ].join("\n");

const sortRows = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const total = (rows) => `${rows.filter((r) => r.pass).length}/${rows.length} passing`;

let md = `# TESTING

Everything here was run against a **live local EVM chain (Anvil) with the real, deployed contracts**. The only simulated component is DNS on the local network (a labelled \`local-demo-zone\`).

Reproduce: \`powershell -File scripts/dev-chain.ps1\`, then \`forge test\` (packages/contracts), \`pnpm --filter @mohar/core test\`, \`pnpm --filter @mohar/web e2e\`, then \`node scripts/make-testing-md.mjs\`.

## Suites

| Suite | What it proves |
|---|---|
| Foundry (\`packages/contracts/test\`) | Unit tests per function, 1000-run fuzz tests, stateful invariants (revoked never Active, non-issuers never succeed, cutoff splits history), TS<->Solidity cross-language vectors |
| Vitest unit (\`mohar-core/test/core.test.ts\`) | Canonical JSON, golden vectors (same input, same root), Merkle proofs, selective disclosure, short codes, link/QR formats, EIP-712 binding |
| Vitest attack matrix (\`attack-matrix.test.ts\`) | Full verification pipeline on a live chain for every attack below |
| Playwright (\`apps/web/e2e\`) | The same verdicts through the real UI, plus issuer/holder/admin flows and a phone viewport |

`;
if (forge) md += `### Foundry output\n\n\`\`\`\n${forge}\n\`\`\`\n\n`;
if (chainRows) {
  md += `## Attack matrix: protocol level (${total(chainRows.rows)})\n\nChain id ${chainRows.chainId}, CertificateRegistry \`${chainRows.contract}\`, run at ${chainRows.ranAt}.\n\n${table(sortRows(chainRows.rows))}\n\n`;
}
if (e2eRows) {
  md += `## Attack matrix: through the UI (${total(e2eRows)})\n\nEach row has a screenshot taken by Playwright at the moment of the assertion.\n\n${table(sortRows(e2eRows), true)}\n\n`;
}
md += `## Coverage of the required attacks

| Required case | Where |
|---|---|
| Tampered field | A1, A1b, A2, E3 |
| Swapped issuer | A3, A4b |
| Replayed signature | A5, A5b (contract-level, plus Foundry \`test_issue_replayIsImpossible\`) |
| Revoked certificate | A6, E6 |
| Revoked issuer before / after cutoff | A9a, A9b, E9a, E9b |
| Expired | A8, E8 |
| Unknown ID | A11, A20b, E11 |
| Malformed QR | A12, A12b, E13 |
| Wrong chain | A13, E12 |
| Forged PDF | A14, E4 |
| Fake issuer wallet | A4 |
| Suspend / reinstate | A7, A7b |
| Key rotation | A10a, A10b |
| Batch issuance, revoke one member | A15a-e, E10 |
| Selective disclosure | A16, A16b, E14 |
| DNS failure degrades, DNS mismatch fails | A17, A17b |
| RPC down / fallback | A18, A19 |
| Backend unreachable | E15 |
`;
writeFileSync("TESTING.md", md);
console.log("TESTING.md written");
