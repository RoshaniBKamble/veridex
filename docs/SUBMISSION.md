# VERIDEX — World's Fair 2026 submission kit

## Problem
Web3 teams approve releases in one set of tools (repo, CI, audits) and operate production in another (deploy scripts, explorers, multisigs). Nothing continuously answers: *does what is live onchain still correspond to what the team approved?* Upgrades, admin changes and redeploys can silently diverge from the approved release.

## Insight / differentiation
Security monitors watch transactions; provenance tools sign builds; explorers show state. VERIDEX's hypothesis is the **link**: a single evidence chain from release evidence → approval → signed attestation → versioned expected state → observed chain state, with deterministic drift rules and incidents that carry that whole chain as evidence. We do not claim monitoring, simulation or provenance are new individually.

## Target customers
Buyers: founders/CTOs, protocol engineering leads, security leads. Users: smart-contract, release and security engineers. Later: auditors, enterprises, ecosystem programs.

## Demo script (≤ 3 min)
1. (0:00) Landing → "Launch demo", sign in. Founder cockpit: trust score 100 with transparent weights.
2. (0:25) Demo environment → open release v2.4.0: 5 evidence items with SHA-256 hashes, sealed manifest, 2 approvals, Ed25519 attestation → click Verify.
3. (0:55) Open deployment: expected vs observed table, all MATCH. Show Integrations: Ethereum + Solana LIVE with block/slot; Aave/Jupiter references verified live.
4. (1:20) Trust Graph 3D: repo → … → production.
5. (1:35) Click **SIMULATE DRIFT** (labelled SIMULATED). Banner: CRITICAL PRODUCTION DRIFT. Comparisons show implementation / bytecode / proxy_admin mismatches; INC opened automatically.
6. (2:05) Incident: approved vs observed, why it matters, investigation steps, linked evidence, timeline; optional AI explanation labelled as hypothesis. Acknowledge → Investigate.
7. (2:35) Trust Graph shows the red incident path; founder score drops with explanation. Reset demo → re-verified, incident resolved.

## Pitch video outline (2–3 min)
Hook (the question) → why it's unanswered today → 60-second product walkthrough of drift → how it works (c14n+SHA-256, Ed25519, RPC adapters, deterministic rules) → honesty matrix → market & business model → ask (pilot teams).

## Business model (hypothesis — not validated)
Developer free · Team ~$399/mo · Protocol Ops ~$1,500/mo · Enterprise custom. Paid value: continuous verification, more projects/seats, retention, permission monitoring, incident workflow, API, SSO, onchain anchoring.

## Go-to-market
1. Start with EVM + Solana protocol teams shipping upgradeable contracts (highest drift risk).
2. Low-friction onboarding: register a deployment and baseline in minutes, no code changes.
3. Distribution: security/audit firms (post-audit "verify what shipped"), ecosystem grant programs, hackathon/accelerator cohorts, Foundry/Anchor community content.
4. Expand: CI ingestion (GitHub Actions), reproducible-build verification, onchain anchoring, governance/multisig integrations.

## Demand-validation plan
- 20 interviews with protocol CTOs/security leads: How do you confirm production matches the approved release today? Last time it didn't? Who owns it? Budget line?
- 5 design-partner pilots: register real deployments, measure time-to-first-verification and drift events surfaced.
- Success signals: weekly active verification, request for CI integration, willingness to pay at Team tier.

## Claims that still require evidence
- That teams experience this gap often enough to pay for it.
- Pricing levels and willingness to pay.
- That trust-on-first-use baselines are acceptable to security teams.
- Coverage adequacy of current checks for real-world upgrade patterns.
- No customers, users, traction or revenue exist yet.

## Disclosure
Built during the competition period on the Emergent full-stack template (React/FastAPI/MongoDB). Public RPC endpoints are third-party. Demo entities are fictional.
