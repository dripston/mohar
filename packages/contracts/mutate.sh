#!/usr/bin/env bash
# Poor man's mutation test: break the contracts in ways that SHOULD be caught, and check the suite goes red.
# Usage: bash mutate.sh    (restores the originals at the end, even on failure)
set -u
export PATH="$PATH:/c/Users/rehaan/.foundry/bin"
cd "$(dirname "$0")"
cp src/CertificateRegistry.sol /tmp/CR.orig && cp src/IssuerRegistry.sol /tmp/IR.orig
restore() { cp /tmp/CR.orig src/CertificateRegistry.sol; cp /tmp/IR.orig src/IssuerRegistry.sol; }
trap restore EXIT

run() { # name file sed-expression
  restore
  sed -i "$3" "$2"
  if cmp -s "$2" "/tmp/$( [ "$2" = src/CertificateRegistry.sol ] && echo CR || echo IR ).orig"; then echo "NOOP    $1 (mutation did not apply)"; return; fi
  forge build >/tmp/mut.build 2>&1 || { echo "BROKEN  $1 (does not compile: not a real kill)"; return; }
  if forge test >/tmp/mut.out 2>&1; then echo "SURVIVED $1   <-- tests did NOT notice"; else echo "KILLED   $1 ($(grep -cE '^\[FAIL' /tmp/mut.out) failing)"; fi
}

run "expiry boundary >= to >"                     src/CertificateRegistry.sol 's/block.timestamp >= c.expiresAt/block.timestamp > c.expiresAt/'
run "cutoff boundary < to <="                     src/IssuerRegistry.sol      's/t < k.revokedFrom/t <= k.revokedFrom/'
run "nonce not incremented on issue"              src/CertificateRegistry.sol '0,/nonces\[signer\]++;/s//nonces[signer] += 0;/'
run "controller check removed"                    src/CertificateRegistry.sol 's/registry.identityOf(msg.sender) != c.issuer ||/false ||/'
run "revoked can be un-revoked (transition)"      src/CertificateRegistry.sol 's/if (c.status == Status.Revoked) revert BadTransition();/ /'
run "pause also blocks nothing (issue)"           src/CertificateRegistry.sol '0,/if (paused) revert IsPaused();/s//if (paused \&\& false) revert IsPaused();/'
run "signer check removed"                        src/CertificateRegistry.sol 's/|| rec != signer//'
run "record not namespaced by identity"           src/CertificateRegistry.sol 's/return keccak256(abi.encode(identity, documentRoot));/return keccak256(abi.encode(address(0), documentRoot));/'
run "revoke reason bound loosened"                src/CertificateRegistry.sol 's/reason < 1 || reason > 5/reason > 200/'
run "revocation may be moved later"               src/IssuerRegistry.sol      's/effectiveFrom >= k.revokedFrom) revert CannotLoosenRevocation/false) revert CannotLoosenRevocation/'
run "key revocation not checked at issue time"    src/CertificateRegistry.sol 's/if (!registry.isKeyValidAt(signer, at)) revert KeyNotActive();/ /'
run "issuer-revoked state ignored"                src/CertificateRegistry.sol 's/if (!registry.isKeyValidAt(c.signer, c.issuedAt)) return State.IssuerRevoked;/ /'
run "anyone can set issuer type"                  src/IssuerRegistry.sol      's/function setIssuerType(address issuer, IssuerType issuerType, string calldata accreditationSource) external onlyRoot/function setIssuerType(address issuer, IssuerType issuerType, string calldata accreditationSource) external/'
run "anyone can pause"                            src/CertificateRegistry.sol '0,/if (!registry.isRoot(msg.sender)) revert NotRoot();/s//if (false) revert NotRoot();/'
