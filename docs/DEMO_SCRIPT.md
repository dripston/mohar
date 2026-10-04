# Mohar: pitch video script

One story from start to finish: **Kavya, a first-generation ST student, applies for a scholarship. A fake institute is trying to collect the same money. Mohar protects her and stops the fraud.**
Each feature appears at the moment the story needs it.

Two columns per scene: **SAY** (word for word, adjust to your voice) and **DO** (your hands while you talk).
Target length: about 6 minutes. Times are cumulative.

---

## Before you press record (checklist)

- [ ] I've confirmed the scholarship samples are live: `https://mohar-theta.vercel.app/demo` → section "Scholarship samples" shows files.
- [ ] `GROQ_API_KEY` is set in Vercel (scene 3 and scene 9 use AI). If not, skip those two DO lines; the story still works.
- [ ] Browser: one window, zoom 110%, bookmarks bar hidden, notifications off. Press **Alt+B** on /demo for projector mode (it persists across pages).
- [ ] MetaMask on **Base Sepolia** with two accounts imported:
  - **Authority (root)**: the deployer key from `.env`, 0x5673…6F37.
  - **Institute**: the scholarship institute key from `.seed-keys.base-sepolia.json`, 0x41d4…1581. It needs a little Sepolia ETH, so send 0.002 from the root account first.
- [ ] From /demo, pre-download into one folder: `student-enrolment.json`, `student-caste.json`, `student-income.json`, the **tampered** sample, the **fake institute** sample, `applications.zip`.
- [ ] Open these tabs in order (left to right): Landing `/`, `/issuer`, `/scheme`, `/bulk`, `/issuer/admin`, `/demo`, BaseScan of the CertificateRegistry `0x7A08A61DaE82f1bEdE7003fc83B8B09D26030135`.
- [ ] Phone: on **mobile data** (Wi-Fi off), camera app open, screen brightness up.
- [ ] Do one warm-up scan and one warm-up verify so RPCs are warm.

> ⚠️ The audit in scene 7 (revoking the fake institute) can be done **once** on Base Sepolia. It cannot be undone. Rehearse it on `pnpm demo:local` first. If a take goes wrong after the audit, re-record the remaining scenes and edit them together. Do not redo the audit.

---

## Scene 1: The hook (0:00 to 0:35). Tab: Landing `/`

**SAY:**
"Every year India pays out crores in scholarships to students from SC, ST and low-income families. And every year, a chunk of that money disappears.
In one government audit, **830 of 1,572 institutions checked were alleged to be fake or non-operational.** That money was meant for students like Kavya.
The problem isn't that we lack certificates. It's that **nobody can check one in seconds**: not the officer, not the college, not the student."

**DO:** Start at the top of the landing page. Scroll slowly to the Scholarship section and let the "830 / 1,572" stat and the animated audit grid be on screen when you say the number. Stop scrolling on the 4-step cards.

---

## Scene 2: Who we are (0:35 to 0:55). Still landing

**SAY:**
"This is Mohar. *Mohar* means seal. Institutes and government offices seal certificates on a public blockchain. Anyone can check that seal from a phone, with no login, no database to trust, and no call to Mohar's servers.
Let me show you Kavya's journey: from getting her documents, to applying, to an officer who has to screen thousands of applications."

**DO:** Scroll past the personas section (Issuer, Student, Officer, Verifier, Authority) while you say "Kavya's journey". Then switch to the `/issuer` tab.

---

## Scene 3: The seal: issuing (0:55 to 1:50). Tab: `/issuer`

**SAY:**
"First, the people who are allowed to issue. Kavya's institute logs in with its wallet. Mohar checks two things before it trusts the institute: that a government authority registered it on-chain, and that its **website domain publicly vouches for the key** through DNS. Even if someone steals the look of a college, they can't fake its domain.
The institute picks the **Enrolment** template. Every field is sealed separately with a random salt. That matters later: Kavya can reveal one field without revealing the rest.
It signs, and the certificate is anchored on Base. That's a real transaction, a fraction of a rupee.
A university doing this for a whole class uses **bulk issuance**: thousands of certificates in **one** transaction using a Merkle tree.
And for the old paper certificates in a cupboard? **Digitise.** AI reads the scanned paper and drafts the fields, but a human checks every field before anything is sealed. AI never decides anything in Mohar."

**DO:**
1. Connect MetaMask with the **Institute** account. Point at the issuer badge and its domain `mohar-demo.duckdns.org` when you say "DNS".
2. Click the **Enrolment** template chip. Type an applicant ID (e.g. `KAVYA-2026-001`) and a course.
3. Click Issue → confirm in MetaMask. While it confirms, keep talking. When it's done, point at the verify code / QR.
4. Click into **Bulk issuance** (`/issuer/bulk`) for 3 seconds: just show the page.
5. Click **Digitise** (`/issuer/digitise`), drop any scanned certificate image, show the drafted fields with the "confirm" step. Don't seal it.

*(If MetaMask isn't set up: show the template picker and the form, say "this one was issued earlier, on-chain", and move on.)*

---

## Scene 4: Kavya applies: privacy (1:50 to 2:45). Tab: `/scheme` → Student

**SAY:**
"Now Kavya. She has three sealed documents: enrolment from her institute, caste and income from the revenue office.
Today, she'd photocopy all three and hand over her **exact family income, her address, her caste certificate**, everything, to an office she has never met.
With Mohar, she drops them in, and Mohar shows her **exactly what leaves her phone and what stays.** The officer learns only what the scheme needs: *enrolled: yes. ST category: yes. Income under 2.5 lakh: yes.* Not the income itself. Not her address.
Those yes/no answers aren't Kavya's claims. **The revenue office sealed them**, so she can't edit them.
She downloads one file, a `.mohar` bundle, and submits it."

**DO:**
1. Click the **Student** tab. Drop the three `student-*.json` files together.
2. Slowly point at the two columns: **Shared** (left) vs **Hidden** (right). Hover over "income" in the hidden column when you say "not the income itself".
3. Click **Download bundle**.

---

## Scene 5: The officer: one application (2:45 to 3:35). Same page → Officer

**SAY:**
"I'm now the scholarship officer. I drop Kavya's bundle in.
In about a second, Mohar has checked every seal against the chain, confirmed each issuer is the **right kind** of issuer (enrolment from an institute, caste from a revenue office), and checked the scheme's rules. **Eligible.** Every requirement ticked, with the issuer behind each one.
Now someone tries to cheat. This applicant edited their income certificate, changing ₹4 lakh to look under the limit.
**Invalid.** Income: **tampered.** One changed character breaks the seal. No human had to spot it."

**DO:**
1. Click the **Officer** tab. Drop the bundle you just downloaded → green **ELIGIBLE** hero. Point at the three requirement cards.
2. Drop the **tampered** sample → red **INVALID**. Point at the income card showing **TAMPERED**.

---

## Scene 6: Thousands of applications (3:35 to 4:20). Tab: `/bulk`

**SAY:**
"But officers don't get one application. They get thousands, right before a deadline.
So here's this district's full batch. Mohar screens all of them **in the browser**. The applications never leave this laptop.
Look at the summary: most are eligible. Some are revoked, suspended, expired, from the wrong kind of issuer, missing a document. It even catches the **same applicant applying twice**.
Each row tells the officer *why*, and the whole thing exports to a spreadsheet for the record.
But notice this row. **This one passes.** It's from an institute that's registered, has a domain, and seals properly. Everything checks out… because the institute itself is the fraud."

**DO:**
1. Drop `applications.zip`. Let the progress bar and throughput counter run. Don't talk over the finish, let the numbers land.
2. Click two summary buttons (e.g. **INVALID**, then **NOT ELIGIBLE**) to filter. Expand one row to show the reason.
3. Point at the **duplicate** badge.
4. Click **Download CSV** (just the click).
5. Clear the filter, find the **fake-institute** row (shows ELIGIBLE), and hover on it as you say "this one passes".

---

## Scene 7: The audit: the twist (4:20 to 5:10). Tab: `/issuer/admin`

**SAY:**
"This is the 830-out-of-1,572 problem. On paper, a fake institute looks real.
Then the audit happens. The authority finds the institute is fake. In Mohar, the authority revokes that institute's key **with a cut-off date**, set back to when the fraud began. Everything it sealed after that date is void. Every other issuer's certificates? Untouched.
One transaction.
Back to the officer. Same batch, screen again…
**These rows just flipped.** Mohar even tells the officer exactly which applications changed since the last screen. The money stops *before* it is paid out, not three years later in an audit report."

**DO:**
1. Switch MetaMask to the **Authority** account.
2. In the registry, find **Demo Fake Institute** (key 0x5dA8…C096). Click revoke, set the cut-off to the value shown on /demo ("The audit" card). Confirm in MetaMask.
3. Back to the `/bulk` tab. Drop `applications.zip` again.
4. Point at the **"Changed since last screen"** card and at the rows now showing **INVALID · ISSUER_REVOKED**.

---

## Scene 8: Trustless: the judges' phone (5:10 to 5:45). Tab: `/demo`

**SAY:**
"Everything so far ran in a browser. But do you have to trust *our* website?
No. This is a real certificate on a phone, on mobile data. I scan it. The phone reads the blockchain directly, through several independent nodes that must agree, pinned to one block. **Verified.**
Here's one that was revoked. Here's one that expired. Here's one whose issuer's key was compromised and cut off. Here's a batch where **one** certificate was revoked and its classmates are still fine.
And any verifier can download a **privacy receipt**: proof they checked, without storing the student's data.
And if you don't believe any of it, the transactions are public, on BaseScan."

**DO:**
1. On /demo, point your phone at the **Valid certificate** QR → show the phone screen to the camera: green VERIFIED.
2. Scan quickly in order: **Revoked → Expired → Issuer key revoked → Batch member (revoked, siblings unaffected)**. Two seconds each on the phone.
3. On the laptop, open the Valid one, click the **receipt** button, then the **share** panel (show the label + expiry).
4. Switch to the BaseScan tab for 3 seconds: verified contract, real transactions.

---

## Scene 9: AI with a human in charge (5:45 to 6:05). Tab: `/scheme`

**SAY:**
"One last thing. New scholarship schemes come out every year. An officer types the rules in plain English; AI drafts the checklist. The officer reviews it and **confirms**. AI drafts. Humans decide. The verdict itself never touches AI."

**DO:** Open the scheme drafter, type *"ST students enrolled in an institute with family income under 2.5 lakh"*, click Draft, point at the drafted requirements, click **Confirm**.

---

## Scene 10: Close (6:05 to 6:30). Tab: Landing `/`

**SAY:**
"Kavya got her scholarship, without handing over her life story. The officer screened thousands of applications in seconds. A fake institute was stopped the moment the audit landed, before the money left.
Mohar: seals that anyone can check, privacy for the student, and every verdict publicly verifiable.
We've tested it hard: an attack matrix run live on Base Sepolia, a fuzzed core, and the contracts verified on BaseScan. We've also written down our honest limits in SECURITY.md.
Thank you."

**DO:** Back on the landing hero. Hold for 2 seconds, stop recording.

---

## Feature coverage map (every feature has a home)

| Feature | Scene |
|---|---|
| Problem / fraud stat | 1 |
| On-chain issuer registry + DNS domain binding | 3 |
| Credential templates, per-field salted seals, EIP-712 signing | 3 |
| Batch anchoring (bulk issuance) | 3 |
| AI digitise (human confirms) | 3 |
| Selective disclosure (shared vs hidden), attested yes/no flags | 4 |
| `.mohar` bundle | 4 |
| Scheme checklist, issuer-type check, reason codes | 5 |
| Tamper detection | 5 |
| Bulk screening, in-browser privacy, duplicates, CSV, reasons per row | 6 |
| Authority revocation with cut-off, "changed since last screen" | 7 |
| Phone scan over mobile data, quorum RPC (no Mohar server) | 8 |
| All verdict states: verified, revoked, expired, issuer-revoked, batch sibling | 8 |
| Privacy receipt, share links with label and expiry | 8 |
| Public audit trail (BaseScan) | 8 |
| AI scheme drafter (human confirms) | 9 |
| Tests and honest limits | 10 |

**Offline backup:** if the network dies on stage, run `pnpm demo:local`. It starts the same story on a local chain at `localhost:3000/demo`.

## Never say
- "Legally valid" or "government approved". Say "designed for".
- "Zero knowledge". The flags are *sealed yes/no answers*, not ZK proofs.
- "The fake institutes": say "**alleged** fake or non-operational".
- That the demo issuers are real. They are labelled DEMO.
