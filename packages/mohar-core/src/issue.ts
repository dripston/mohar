import type { Account, Address, Chain, Hex, PublicClient, Transport, WalletClient } from "viem";
import { certificateRegistryAbi } from "./abi.generated";
import type { Deployment } from "./chain";
import type { JsonValue } from "./canonical";
import { buildBatch, buildDocument, type BuiltDocument } from "./merkle";
import { issueBatchTypedData, issueTypedData } from "./eip712";
import type { ProofFile } from "./types";

type Wallet = WalletClient<Transport, Chain | undefined, Account>;

/** `credential.expiresOn` (ISO date, end of that day UTC) -> unix seconds, 0 when absent. */
export function expiryFromDocument(doc: { credential?: { expiresOn?: string | null } }): number {
  const e = doc.credential?.expiresOn;
  if (!e) return 0;
  const t = Date.parse(`${e}T23:59:59Z`);
  if (Number.isNaN(t)) throw new Error(`bad credential.expiresOn: ${e}`);
  return Math.floor(t / 1000);
}

export interface PreparedCert {
  built: BuiltDocument;
  expiresAt: number;
}

export function prepareCertificate(doc: JsonValue & { credential?: any }): PreparedCert {
  return { built: buildDocument(doc), expiresAt: expiryFromDocument(doc as any) };
}

export function singleProofFile(
  deployment: Deployment,
  signer: Address,
  p: PreparedCert,
  txHash?: Hex,
): ProofFile {
  return {
    format: "mohar-proof/1",
    chainId: deployment.chainId,
    signer,
    documentRoot: p.built.documentRoot,
    expiresAt: p.expiresAt,
    anchor: { kind: "single" },
    fields: p.built.fields,
    partial: false,
    txHash,
  };
}

export interface PreparedBatch {
  batchRoot: Hex;
  certs: PreparedCert[];
  proofs: Hex[][];
}

export function prepareBatch(docs: (JsonValue & { credential?: any })[]): PreparedBatch {
  const certs = docs.map(prepareCertificate);
  const { batchRoot, proofs } = buildBatch(certs.map((c) => ({ documentRoot: c.built.documentRoot, expiresAt: c.expiresAt })));
  return { batchRoot, certs, proofs };
}

export function batchProofFiles(deployment: Deployment, signer: Address, b: PreparedBatch, txHash?: Hex): ProofFile[] {
  return b.certs.map((c, i) => ({
    format: "mohar-proof/1" as const,
    chainId: deployment.chainId,
    signer,
    documentRoot: c.built.documentRoot,
    expiresAt: c.expiresAt,
    anchor: { kind: "batch" as const, batchRoot: b.batchRoot, proof: b.proofs[i]! },
    fields: c.built.fields,
    partial: false,
    txHash,
  }));
}

// ------------------------------------------------------------------ on-chain writes

export interface Writer {
  wallet: Wallet;
  publicClient: PublicClient;
  deployment: Deployment;
}

async function nonceOf(w: Writer, signer: Address): Promise<bigint> {
  return w.publicClient.readContract({
    address: w.deployment.certificateRegistry,
    abi: certificateRegistryAbi,
    functionName: "nonces",
    args: [signer],
  });
}

export type IssueStep = "hashing" | "signing" | "pending" | "confirmed";

/** Sign (EIP-712) and anchor a single certificate. `onStep` drives the "Sign & Anchor" progress UI. */
export async function anchorSingle(w: Writer, p: PreparedCert, onStep: (s: IssueStep, detail?: string) => void = () => {}) {
  const signer = w.wallet.account.address;
  onStep("hashing");
  const nonce = await nonceOf(w, signer);
  onStep("signing");
  const signature = await w.wallet.signTypedData(
    issueTypedData(w.deployment.chainId, w.deployment.certificateRegistry, {
      issuer: signer,
      root: p.built.documentRoot,
      expiresAt: BigInt(p.expiresAt),
      nonce,
    }),
  );
  const hash = await w.wallet.writeContract({
    address: w.deployment.certificateRegistry,
    abi: certificateRegistryAbi,
    functionName: "issue",
    args: [signer, p.built.documentRoot, BigInt(p.expiresAt), signature],
    chain: w.wallet.chain,
  });
  onStep("pending", hash);
  const receipt = await w.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("issuance transaction reverted");
  onStep("confirmed", hash);
  return { txHash: hash, gasUsed: receipt.gasUsed, signer };
}

export async function anchorBatch(w: Writer, b: PreparedBatch, onStep: (s: IssueStep, detail?: string) => void = () => {}) {
  const signer = w.wallet.account.address;
  onStep("hashing");
  const nonce = await nonceOf(w, signer);
  onStep("signing");
  const signature = await w.wallet.signTypedData(
    issueBatchTypedData(w.deployment.chainId, w.deployment.certificateRegistry, {
      issuer: signer,
      batchRoot: b.batchRoot,
      count: b.certs.length,
      nonce,
    }),
  );
  const hash = await w.wallet.writeContract({
    address: w.deployment.certificateRegistry,
    abi: certificateRegistryAbi,
    functionName: "issueBatch",
    args: [signer, b.batchRoot, b.certs.length, signature],
    chain: w.wallet.chain,
  });
  onStep("pending", hash);
  const receipt = await w.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("batch transaction reverted");
  onStep("confirmed", hash);
  return {
    txHash: hash,
    gasUsed: receipt.gasUsed,
    gasPerCert: Number(receipt.gasUsed) / b.certs.length,
    signer,
  };
}

/** Lifecycle actions for a cert (single, or a batch member given its batch context). */
export type CertRef =
  | { kind: "single"; certId: Hex }
  | { kind: "batch"; batchRoot: Hex; documentRoot: Hex; expiresAt: number; proof: Hex[] };

async function send(w: Writer, functionName: string, args: readonly unknown[]) {
  const hash = await w.wallet.writeContract({
    address: w.deployment.certificateRegistry,
    abi: certificateRegistryAbi,
    functionName: functionName as any,
    args: args as any,
    chain: w.wallet.chain,
  });
  const receipt = await w.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}

export const revokeCert = (w: Writer, ref: CertRef, reason: number) =>
  ref.kind === "single"
    ? send(w, "revoke", [ref.certId, reason])
    : send(w, "revokeFromBatch", [ref.batchRoot, ref.documentRoot, BigInt(ref.expiresAt), ref.proof, reason]);

export const suspendCert = (w: Writer, ref: CertRef) =>
  ref.kind === "single"
    ? send(w, "suspend", [ref.certId])
    : send(w, "suspendFromBatch", [ref.batchRoot, ref.documentRoot, BigInt(ref.expiresAt), ref.proof]);

export async function reinstateCert(w: Writer, ref: CertRef) {
  const rid =
    ref.kind === "single"
      ? ref.certId
      : await w.publicClient.readContract({
          address: w.deployment.certificateRegistry,
          abi: certificateRegistryAbi,
          functionName: "batchRid",
          args: [ref.batchRoot, ref.documentRoot],
        });
  return send(w, "reinstate", [rid]);
}
