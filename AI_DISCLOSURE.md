# AI_DISCLOSURE.md

Mohar was built with **Claude (Anthropic) as the coding agent**, directed by the team phase by phase from `PLAN.md` / `PLAN_V2.md`. Sub-agents were used for parts of the UI.

| Part | AI role | Human check |
|---|---|---|
| Contracts, TypeScript core, web app, tests | Written by the AI agent | Every behaviour is covered by a test that was run; cryptography is cross-checked between TypeScript and Solidity (golden vectors) |
| Review pass (`REVIEW.md`) and truth audit (`VERIFY.md`) | AI audited its own earlier work, red test before each fix | The team reads the findings |
| Seed data, demo issuers | Synthetic. Caste, income and marks are invented. Demo issuers are labelled demo | n/a |
| **Verdicts** | **AI never decides a verdict.** A certificate is VERIFIED or not by deterministic code (hashes, signatures, chain state) | Any future AI-assisted extraction (e.g. reading a scanned document) must end in a human confirm step |

No AI model runs at verification time in the current build.
