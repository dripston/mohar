import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { bytesToHex, encodeAbiParameters, keccak256, type Hex } from "viem";
import { COUNT_PATH, type DisclosedField } from "./types";
import { flatten, type FlatField, type JsonValue } from "./canonical";

/** Leaf layout, mirrored byte-for-byte by OpenZeppelin's StandardMerkleTree and MerkleProof in Solidity. */
export const FIELD_LEAF_ENCODING = ["string", "string", "bytes32"];
export const BATCH_LEAF_ENCODING = ["bytes32", "uint64"];

type FieldLeaf = [string, string, Hex];
type BatchLeaf = [Hex, bigint];

export function randomSalt(rng?: (n: number) => Uint8Array): Hex {
  const b = rng ? rng(32) : crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(b);
}

/** keccak256(keccak256(abi.encode(path, value, salt))): the OZ "standard leaf" hash. */
export function fieldLeafHash(path: string, value: string, salt: Hex): Hex {
  const inner = keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "bytes32" }], [path, value, salt]),
  );
  return keccak256(inner);
}

export interface BuiltDocument {
  documentRoot: Hex;
  fields: Record<string, DisclosedField>;
}

/**
 * Build the per-field salted Merkle tree for a document.
 * An extra leaf `meta.fieldCount` commits to how many fields the document has, so a
 * verifier holding a "full" file can tell when someone quietly dropped a field.
 */
export function buildDocument(
  doc: JsonValue,
  opts: { salts?: Record<string, Hex>; rng?: (n: number) => Uint8Array } = {},
): BuiltDocument {
  const flat = flatten(doc);
  if (flat.some((f) => f.path === COUNT_PATH)) throw new Error(`${COUNT_PATH} is reserved`);
  const all: FlatField[] = [...flat, { path: COUNT_PATH, value: JSON.stringify(String(flat.length)) }];
  const leaves: FieldLeaf[] = all.map((f) => [f.path, f.value, opts.salts?.[f.path] ?? randomSalt(opts.rng)]);
  const tree = StandardMerkleTree.of(leaves, FIELD_LEAF_ENCODING);
  const fields: Record<string, DisclosedField> = {};
  for (const [i, leaf] of tree.entries()) {
    fields[leaf[0]] = { value: leaf[1], salt: leaf[2], proof: tree.getProof(i) as Hex[] };
  }
  return { documentRoot: tree.root as Hex, fields };
}

/** Does one disclosed field belong to `documentRoot`? */
export function verifyField(documentRoot: Hex, path: string, f: DisclosedField): boolean {
  try {
    return StandardMerkleTree.verify(documentRoot, FIELD_LEAF_ENCODING, [path, f.value, f.salt], f.proof);
  } catch {
    return false;
  }
}

export interface FieldDiff {
  path: string;
  ok: boolean;
}

/** Check every disclosed field against the root, so a forged value is pinpointed rather than just "invalid". */
export function diffFields(documentRoot: Hex, fields: Record<string, DisclosedField>): FieldDiff[] {
  return Object.keys(fields)
    .sort()
    .map((path) => ({ path, ok: verifyField(documentRoot, path, fields[path]!) }));
}

/** Selective disclosure: keep only `reveal` paths (plus the count leaf). Hidden fields vanish, the root still matches. */
export function discloseFields(fields: Record<string, DisclosedField>, reveal: string[]): Record<string, DisclosedField> {
  const out: Record<string, DisclosedField> = {};
  for (const p of new Set([...reveal, COUNT_PATH])) {
    const f = fields[p];
    if (!f) throw new Error(`discloseFields: unknown field ${p}`);
    out[p] = f;
  }
  return out;
}

// ---------------------------------------------------------------- batches

export interface BatchEntry {
  documentRoot: Hex;
  expiresAt: number | bigint;
}

export interface BuiltBatch {
  batchRoot: Hex;
  /** same order as the input entries */
  proofs: Hex[][];
}

/** Many certificates, one root. The leaf binds expiry, so expiry is as trustworthy as the root itself. */
export function buildBatch(entries: BatchEntry[]): BuiltBatch {
  if (entries.length === 0) throw new Error("buildBatch: empty batch");
  const leaves: BatchLeaf[] = entries.map((e) => [e.documentRoot, BigInt(e.expiresAt)]);
  const seen = new Set(leaves.map((l) => l[0]));
  if (seen.size !== leaves.length) throw new Error("buildBatch: duplicate documentRoot in batch");
  const tree = StandardMerkleTree.of(leaves, BATCH_LEAF_ENCODING);
  const proofs: Hex[][] = new Array(entries.length);
  for (const [treeIdx, leaf] of tree.entries()) {
    const inputIdx = leaves.findIndex((l) => l[0] === leaf[0]);
    proofs[inputIdx] = tree.getProof(treeIdx) as Hex[];
  }
  return { batchRoot: tree.root as Hex, proofs };
}

export function verifyInBatch(batchRoot: Hex, documentRoot: Hex, expiresAt: number | bigint, proof: Hex[]): boolean {
  try {
    return StandardMerkleTree.verify(batchRoot, BATCH_LEAF_ENCODING, [documentRoot, BigInt(expiresAt)], proof);
  } catch {
    return false;
  }
}

/** The leaf hash Solidity computes in `verifyInBatch`: keccak(keccak(abi.encode(root, expiresAt))). */
export function batchLeafHash(documentRoot: Hex, expiresAt: number | bigint): Hex {
  return keccak256(
    keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [documentRoot, BigInt(expiresAt)])),
  );
}
