# AUTHORITY.md: what the root authority can do, and what a stolen key can do

The **root authority** (role `ROOT_AUTHORITY` on `IssuerRegistry`) is the one trusted party in Mohar. In the real
world it would be a ministry or regulator. In the demo we play that role and say so. This page states exactly what that
role can and cannot do, so nobody has to guess.

## What the root authority CAN do

| Action | Function | Effect | Visible as |
|---|---|---|---|
| List an issuer (name, domain, type, "listed by" text) | `registerIssuer` | The issuer's keys can sign certificates from now on | `IssuerRegistered` |
| Change an issuer's type or listing source | `setIssuerType` | Changes what schemes accept that issuer for | `IssuerClassified` |
| Record that it re-checked the issuer's DNS proof | `attestDomain` | Updates the on-chain fallback when live DNS cannot be read | `DomainAttested` |
| Revoke an issuer key from a chosen time | `revokeIssuer` | Certificates that key issued at or after that time become `ISSUER_REVOKED`. Earlier ones stay valid. The time can only be moved earlier, never later | `KeyRevoked` |
| Rotate an issuer to a new key | `rotateIssuerKey` | Old key revoked from now, new key takes over. Old certificates stay valid, new key may manage them | `KeyRotated` |
| Add or remove another root | `grantRole` / `revokeRole` | The last root cannot be removed (no lock-out) | `RoleGranted` / `RoleRevoked` |
| Pause or unpause **issuance** | `pause` / `unpause` | New `issue` / `issueBatch` calls fail. Nothing else changes | `Paused` / `Unpaused` |

## What the root authority CANNOT do

- **Cannot create, edit or delete a certificate.** Only an accredited issuer key can sign one.
- **Cannot revoke, suspend or reinstate a certificate.** Those are issuer actions (`_controlled`: the caller must be a currently valid key of the issuing identity). The authority can only invalidate an *issuer key*.
- **Cannot block verification or revocation.** `pause` stops issuance only; tests prove revoke, suspend, reinstate and every read keep working while paused.
- **Cannot rewrite history silently.** Every registry change is an event with the block time. A revocation cannot be moved later, so it cannot be quietly "un-revoked" by backdating.
- **Cannot see or learn personal data.** None is on chain.

## What a STOLEN authority key can do (blast radius)

An attacker holding a root key can:

1. **List a fake issuer** and then issue "valid" certificates from it. Mohar cannot know an institute is fake; it only knows the authority said it is real. The listing is public and timestamped, so the damage is visible and attributable, and a second root can revoke the fake from the moment it was listed.
2. **Revoke honest issuer keys** (denial of service on a university's future and, with a back-dated cutoff, on its past certificates).
3. **Pause issuance** (denial of service on new certificates only).
4. **Add attacker roots / remove honest roots**, taking over the authority permanently. The last-root guard stops total lock-out, but not takeover.

An attacker **cannot** forge a certificate for an existing real issuer, change a certificate's content, or revoke an individual certificate.

## Mitigations

| Mitigation | Status |
|---|---|
| Every power is evented and public, so abuse is detectable | **Done** (tested: `test_everyRegistryChange_emits`) |
| Back-dating limited to *earlier* only | **Done** |
| Pause never blocks revoke or verify | **Done** (tested: `test_pause_blocksIssuance_butNeverRevokeSuspendReinstateOrReads`) |
| Root held by a **Safe multisig** (e.g. 2-of-3) instead of one key | **Not done in code, and not needed in code**: `ROOT_AUTHORITY` is just an address, so a Safe can hold it. Production setup: deploy with `root = <Safe address>`. Demo uses a single key and says so. |
| Timelock on `registerIssuer` / `grantRole` so a stolen key cannot act instantly | **Not implemented.** A new listing would sit "pending" for N hours before it is valid. Roadmap. |
| Off-chain: authority publishes its list and the DNS proof procedure | Roadmap |

## Honest limit

If the real authority lists a fake institute, Mohar cannot catch that. What Mohar adds is that the list is public and
auditable, and that one revocation with a cutoff date flips everything the fake institute issued after that date, in seconds.
