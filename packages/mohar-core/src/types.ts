import type { Address, Hex } from "viem";

export const DOC_VERSION = "mohar/1" as const;

export interface MoharDocument {
  version: typeof DOC_VERSION;
  issuer: { address: Address; domain: string; name: string };
  recipient: { name: string; email?: string; [k: string]: string | undefined };
  credential: {
    title: string;
    issuedOn: string;
    expiresOn: string | null;
    grade?: string;
    [k: string]: string | null | undefined;
  };
  [k: string]: unknown;
}

/** One disclosed field: its plaintext, its salt and a Merkle proof to the document root. */
export interface DisclosedField {
  value: string; // canonical JSON of the primitive
  salt: Hex;
  proof: Hex[];
}

/** Where the document root is anchored on chain. */
export type Anchor = { kind: "single" } | { kind: "batch"; batchRoot: Hex; proof: Hex[] };

/** Advisory label a holder attaches to a share. Links can be copied, so none of this is enforced, only displayed. */
export interface ShareMeta {
  purpose?: string;
  recipient?: string;
  /** unix seconds */
  validUntil?: number;
}

export interface ProofFile {
  format: "mohar-proof/1";
  chainId: number;
  /** key that signed the EIP-712 issuance (checked against the registry on chain) */
  signer: Address;
  documentRoot: Hex;
  /** unix seconds, 0 = never. Bound on chain (single: stored; batch: inside the batch leaf). */
  expiresAt: number;
  anchor: Anchor;
  /** path -> disclosed field. A full file lists every field, a partial one only what the holder chose. */
  fields: Record<string, DisclosedField>;
  /** true when the holder withheld fields; the verdict is then labelled "partial" */
  partial: boolean;
  txHash?: Hex;
  share?: ShareMeta;
}

/** Reserved leaf committing to the number of real fields. */
export const COUNT_PATH = "meta.fieldCount";
