import { hashTypedData, recoverTypedDataAddress, type Address, type Hex } from "viem";

/**
 * EIP-712 typed data for issuance. The domain pins chainId + verifying contract, and each
 * message carries the issuer and a per-signer nonce, so a signature cannot be replayed on
 * another chain, another deployment, or twice on the same one (EIP-712 itself gives no replay protection).
 */
export const EIP712_NAME = "Mohar";
export const EIP712_VERSION = "1";

export const ISSUE_TYPES = {
  Issue: [
    { name: "issuer", type: "address" },
    { name: "root", type: "bytes32" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const ISSUE_BATCH_TYPES = {
  IssueBatch: [
    { name: "issuer", type: "address" },
    { name: "batchRoot", type: "bytes32" },
    { name: "count", type: "uint32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export function moharDomain(chainId: number, verifyingContract: Address) {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract } as const;
}

export interface IssueMessage {
  issuer: Address;
  root: Hex;
  expiresAt: bigint;
  nonce: bigint;
}
export interface IssueBatchMessage {
  issuer: Address;
  batchRoot: Hex;
  count: number;
  nonce: bigint;
}

/** Argument object for viem's `walletClient.signTypedData`. */
export function issueTypedData(chainId: number, contract: Address, message: IssueMessage) {
  return { domain: moharDomain(chainId, contract), types: ISSUE_TYPES, primaryType: "Issue" as const, message };
}

export function issueBatchTypedData(chainId: number, contract: Address, message: IssueBatchMessage) {
  return {
    domain: moharDomain(chainId, contract),
    types: ISSUE_BATCH_TYPES,
    primaryType: "IssueBatch" as const,
    message,
  };
}

export const hashIssue = (chainId: number, contract: Address, m: IssueMessage) =>
  hashTypedData(issueTypedData(chainId, contract, m));
export const hashIssueBatch = (chainId: number, contract: Address, m: IssueBatchMessage) =>
  hashTypedData(issueBatchTypedData(chainId, contract, m));

/** Off-chain re-verification of an issuance signature (used by tests and by the Forgery Playground). */
export async function recoverIssuer(
  chainId: number,
  contract: Address,
  m: IssueMessage,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({ ...issueTypedData(chainId, contract, m), signature });
}
