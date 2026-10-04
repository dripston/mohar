import { describe, expect, it } from "vitest";
import { anchorSingle, prepareCertificate, revokeCert } from "../src";

/** A load-balanced RPC can return the OLD nonce right after our transaction. The signer must retry, not give up. */
describe("stale nonce from a lagging RPC node", () => {
  it("re-signs with the fresh nonce after BadSignature", async () => {
    const signer = "0x1111111111111111111111111111111111111111";
    let sends = 0;
    const nonces: bigint[] = [];
    const w: any = {
      deployment: { chainId: 84532, certificateRegistry: "0x2222222222222222222222222222222222222222" },
      publicClient: {
        getBlock: async () => ({ number: 10n }),
        // first read is stale (0), later reads are fresh (1)
        readContract: async () => (nonces.length === 0 ? 0n : 1n),
        waitForTransactionReceipt: async () => ({ status: "success", gasUsed: 1n, blockNumber: 5n }),
      },
      wallet: {
        account: { address: signer },
        chain: undefined,
        signTypedData: async (td: any) => {
          nonces.push(td.message.nonce);
          return `0x${"ab".repeat(65)}`;
        },
        writeContract: async () => {
          sends++;
          if (sends === 1) throw new Error('The contract function "issue" reverted. Error: BadSignature()');
          return `0x${"cd".repeat(32)}`;
        },
      },
    };
    const p = prepareCertificate({ version: "mohar/1", issuer: { address: signer }, credential: { title: "t", expiresOn: null } } as any);
    const r = await anchorSingle(w, p);
    expect(sends).toBe(2);
    expect(nonces).toEqual([0n, 1n]);
    expect(r.txHash).toMatch(/^0x/);
  });

  it("retries a lifecycle action when a lagging node says UnknownBatch", async () => {
    let calls = 0;
    const w: any = {
      deployment: { chainId: 84532, certificateRegistry: "0x2222222222222222222222222222222222222222" },
      publicClient: { waitForTransactionReceipt: async () => ({ status: "success", blockNumber: 1n }) },
      wallet: {
        chain: undefined,
        writeContract: async () => {
          if (++calls < 3) throw new Error("revokeFromBatch reverted. Error: UnknownBatch()");
          return `0x${"ef".repeat(32)}`;
        },
      },
    };
    const h = await revokeCert(w, { kind: "single", rid: `0x${"00".repeat(32)}` }, 1);
    expect(calls).toBe(3);
    expect(h).toMatch(/^0x/);
  });
});
