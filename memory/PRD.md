# VERIDEX — PRD

## Original problem statement
Build VERIDEX ("Verify what you build. Prove what you deploy.") — verifiable trust infrastructure for onchain apps: project → release → evidence → canonicalization + SHA-256 → approval → cryptographic attestation → deployment registration → blockchain-state inspection → expected-vs-observed comparison → drift detection → incident → evidence-backed investigation → recovery/ack. Killer demo with SIMULATE DRIFT and "CRITICAL PRODUCTION DRIFT" banner. Ethereum + Solana adapters (Base/Arbitrum extensible), permissions intelligence, findings, optional AI, 3D Trust Graph with 2D fallback, founder & developer command centers, premium dark design, honest LIVE/DEMO/SIMULATED/UNAVAILABLE labelling, submission docs. Plus repo cleanup / VERIDEX branding.

## User choices
JWT email/password auth · Claude Sonnet 4.5 via Emergent key (deterministic fallback) · public RPCs (publicnode ETH, Solana mainnet-beta) · Solidity registry compiled + tested locally, not deployed.

## Architecture
FastAPI (`backend/veridex/*` modular services) + MongoDB; React CRA + Tailwind + framer-motion + @react-three/fiber/drei; contracts/ with solc-js compile + py-evm tests.

## Implemented (2026-10-10)
- Auth (bcrypt, JWT bearer+cookie, lockout by email), project roles enforced server-side
- Full release workflow, c14n-v1 SHA-256 evidence, sealed manifests, multi-approval, Ed25519 attestations + verify
- Adapters: EVM (chainId, code keccak, EIP-1967 impl/admin, impl code hash, owner()), Solana (cluster, loader, ProgramData, upgrade authority, deploy slot), simulated demo chain; integration status + live inspector
- Drift engine (MATCH/MISMATCH/UNAVAILABLE/UNSUPPORTED), versioned expected state, TOFU baseline, dedup drift events, auto incidents w/ transitions + timeline + notes, permission observations, deterministic findings, transparent trust score, recommended actions
- Demo project seed (Aurora, fictional) + live public references (Aave V3 Pool, Jupiter v6); simulate drift / reset / tamper / reseed
- 20 frontend pages incl. landing, founder/developer centers, 3D/2D Trust Graph, incident AI streaming
- Tests: 13 core unit + 7 contract tests + 31 API tests (testing agent) passing; frontend all routes verified
- Docs: README (live vs demo matrix), docs/SUBMISSION.md, backend/.env.example

## Backlog
- P0: scheduled continuous verification (cron), GitHub/CI evidence ingestion
- P1: onchain anchoring to testnet registry, Base/Arbitrum RPC config, AccessControl role enumeration, Solana program binary hash, audit export
- P2: reproducible-build verification, multisig signer inspection, SSO/enterprise, Slack/email alerting
