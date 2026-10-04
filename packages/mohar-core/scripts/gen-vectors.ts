/**
 * Writes cross-language test vectors for the Solidity suite:
 *   pnpm --filter @mohar/core vectors
 * Foundry then re-derives every hash/proof/signature on-chain, so TS and Solidity can never drift apart.
 */
import { writeFileSync } from "node:fs";
import { keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildBatch,
  buildDocument,
  certId,
  COUNT_PATH,
  flatten,
  issueBatchTypedData,
  issueTypedData,
  shortCodeBytes8,
  type JsonValue,
} from "../src";

const ISSUER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // anvil #1
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const CHAIN_ID = 31337;
const acct = privateKeyToAccount(ISSUER_KEY);

const saltFor = (path: string): Hex => keccak256(toHex(`salt:${path}`));
const doc: JsonValue = {
  version: "mohar/1",
  issuer: { address: acct.address, domain: "acharya.ac.in", name: "Acharya Institute" },
  recipient: { name: "Rehaan N", email: "rehaan@example.com" },
  credential: { title: "B.E. AI Engineering", grade: "8.34", issuedOn: "2028-06-01", expiresOn: null },
};
const paths = [...flatten(doc).map((f) => f.path), COUNT_PATH];
const built = buildDocument(doc, { salts: Object.fromEntries(paths.map((p) => [p, saltFor(p)])) });

const batchDocs = Array.from({ length: 7 }, (_, i) => ({
  documentRoot: keccak256(toHex(`batch-doc-${i}`)),
  expiresAt: i % 2 === 0 ? 0 : 4_000_000_000 + i,
}));
const batch = buildBatch(batchDocs);

const issueMsg = { issuer: acct.address, root: built.documentRoot, expiresAt: 0n, nonce: 0n };
const batchMsg = { issuer: acct.address, batchRoot: batch.batchRoot, count: batchDocs.length, nonce: 1n };
const issueSig = await acct.signTypedData(issueTypedData(CHAIN_ID, CONTRACT, issueMsg));
const batchSig = await acct.signTypedData(issueBatchTypedData(CHAIN_ID, CONTRACT, batchMsg));

const out = {
  chainId: CHAIN_ID,
  contract: CONTRACT,
  signer: acct.address,
  documentRoot: built.documentRoot,
  certId: certId(built.documentRoot),
  shortCodeBytes8: shortCodeBytes8(certId(built.documentRoot)),
  fields: Object.entries(built.fields).map(([path, f]) => ({ path, value: f.value, salt: f.salt, proof: f.proof })),
  batchRoot: batch.batchRoot,
  batch: batchDocs.map((d, i) => ({ documentRoot: d.documentRoot, expiresAt: d.expiresAt, proof: batch.proofs[i] })),
  issueSig,
  batchSig,
};
writeFileSync(new URL("../../contracts/test/vectors/vectors.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote vectors:", out.documentRoot, out.batchRoot);
