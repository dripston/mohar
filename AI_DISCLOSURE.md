# AI_DISCLOSURE.md

Mohar was built with **Claude (Anthropic) as the coding agent**, directed by the team phase by phase from `PLAN.md` / `PLAN_V2.md`. Sub-agents were used for parts of the UI.

| Part | AI role | Human check |
|---|---|---|
| Contracts, TypeScript core, web app, tests | Written by the AI agent | Every behaviour is covered by a test that was run; cryptography is cross-checked between TypeScript and Solidity (golden vectors) |
| Review pass (`REVIEW.md`) and truth audit (`VERIFY.md`) | AI audited its own earlier work, red test before each fix | The team reads the findings |
| Seed data, demo issuers | Synthetic. Caste, income and marks are invented. Demo issuers are labelled demo | n/a |
| **Verdicts** | **AI never decides a verdict.** A certificate is VERIFIED or not by deterministic code (hashes, signatures, chain state) | Any future AI-assisted extraction (e.g. reading a scanned document) must end in a human confirm step |

No AI model runs at verification time in the current build.

## Phase 12: AI assists (runtime AI, as opposed to AI that helped write the code)

| Feature | Model / provider | What is sent | What the model may do | What a human must do |
|---|---|---|---|---|
| Scheme text to checklist (`/scheme`, Officer tab) | `openai/gpt-oss-120b` via the Groq API, called from our server route `/api/ai/scheme` | Only the eligibility text the officer pasted (max 6,000 chars). No certificates, no personal data | Propose a checklist JSON | Read it, edit it, press Confirm. Output is validated against the scheme schema first and never auto-applied |
| Legacy digitisation (`/issuer/digitise`) | Text: `openai/gpt-oss-120b`; scans: `qwen/qwen3.8-27b` (vision), both via Groq, route `/api/ai/extract` | The pasted text or the scan the issuer chose (max 4 MB). Real paper certificates can contain personal data: the issuer is choosing to send it to this provider | List what is printed | Check and tick every row. Nothing is signed or anchored on that page; the CSV goes through the normal Bulk issue preview |

Rules enforced in code and tested (`packages/mohar-core/test/fuzz.test.ts`, `apps/web/e2e/ai.spec.ts`):
- The AI never produces or changes a verdict. The verification modules do not import the AI module (a test reads their source). A checklist the AI wrote still goes through chain reads and Merkle math.
- Malformed, oversized or schema-breaking output is rejected, not repaired. Unknown keys are dropped.
- The API key (`GROQ_API_KEY`) is a server-side environment variable, never in the browser bundle or the repo. If it is unset the routes answer 503 and the rest of the app is unaffected.
- The verify page itself calls no AI and no Mohar server: the "nothing sent to our server" test covers it.
- Model names are configurable (`GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL`); model output quality was spot-checked on two examples, not benchmarked.
