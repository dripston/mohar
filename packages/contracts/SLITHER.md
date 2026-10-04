# Slither triage

Command: `slither . --filter-paths "lib|test|script"` (slither-analyzer, solc 0.8.26). Result: **0 High, 0 Critical**.

| Severity | Detector | Count | Verdict |
|---|---|---|---|
| Medium | `incorrect-equality` | 6 | False positive. Comparisons are against enum values (`Status.Revoked`, `Status.None`) and `issuedAt == 0` as an "unset" sentinel, not against balances or timestamps an attacker can nudge. |
| Medium | `unused-return` | 1 | False positive. `ECDSA.tryRecover` returns `(address, error, bytes32)`; we use the first two and ignore the digest-length helper value. The error is checked explicitly. |
| Low | `timestamp` | 7 | Intentional. Expiry and key-revocation cutoffs are defined in terms of block time; a validator's few seconds of skew cannot change which side of a day-scale boundary a certificate falls on. |
| Info | `unindexed-event-address` | 2 | Accepted. Indexed topics are limited to three; the indexed fields were chosen for lookup (certId, shortCode, issuer). |

Re-run after any contract change and update this table.
