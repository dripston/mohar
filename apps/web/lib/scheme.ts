import { clientsFromUrls, makeReader, memoDns, type VerifyDeps } from "@mohar/core";
import { deployment } from "./config";
import { dnsResolver } from "./verifier";

/**
 * Deps for screening many applications: one pinned chain snapshot (every verdict is judged at the same block),
 * JSON-RPC batching (many reads per HTTP request), cached issuer lookups and one DNS lookup per issuer.
 */
export function bulkDeps(): VerifyDeps {
  return {
    reader: makeReader(deployment, clientsFromUrls(deployment.rpcUrls ?? [], 8000, { batch: true }), 3, { pinMs: 120_000 }),
    dns: memoDns(dnsResolver),
  };
}

/** Same pipeline, one application, fresh reader. */
export function singleDeps(): VerifyDeps {
  return {
    reader: makeReader(deployment, clientsFromUrls(deployment.rpcUrls ?? [])),
    dns: dnsResolver,
  };
}
