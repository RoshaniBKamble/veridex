# VERIDEX

**Verify what you build. Prove what you deploy.**
Verifiable trust infrastructure for onchain applications: release evidence → canonical SHA-256 provenance → approvals → Ed25519 attestation → deployment registration → live chain-state inspection → expected-vs-observed drift detection → linked incidents.

> Central question: *Is my production Web3 application running exactly what my team approved?*

## Architecture

```
React (CRA + Tailwind + framer-motion + R3F)  ──HTTPS /api──▶  FastAPI (backend/server.py)
                                                                 ├─ veridex/auth.py         JWT (bcrypt) + project roles (owner/approver/engineer/viewer)
                                                                 ├─ veridex/workflow.py     projects · releases · evidence · seal · approvals · attestations · deployments
                                                                 ├─ veridex/crypto.py       veridex-c14n-v1 canonical JSON · SHA-256 · Ed25519 sign/verify
                                                                 ├─ veridex/chains.py       adapter layer: EVM JSON-RPC · Solana JSON-RPC · simulated demo chain
                                                                 ├─ veridex/drift.py        expected-vs-observed engine · drift events · permissions · incidents
                                                                 ├─ veridex/findings.py     deterministic findings · transparent trust score · next actions
                                                                 ├─ veridex/graph.py        Trust Graph from stored records
                                                                 ├─ veridex/ai.py           optional Claude explanations + deterministic analysis
                                                                 └─ veridex/seed.py         DEMO project + SIMULATE DRIFT / reset / tamper
                                                                         │
                                                                   MongoDB (MONGO_URL / DB_NAME)
contracts/VeridexAttestationRegistry.sol  — compiled with solc-js 0.8.24, unit-tested on py-evm (not deployed)
```

Note: the platform template provides MongoDB rather than PostgreSQL; relationships are enforced in the service layer via IDs (`project_id`, `release_id`, `deployment_id`, …).

## Run

```bash
cp backend/.env.example backend/.env    # fill secrets
pip install -r backend/requirements.txt
uvicorn server:app --app-dir backend --port 8001
cd frontend && yarn install && yarn start   # REACT_APP_BACKEND_URL=http://localhost:8001
```
API docs: `/api/docs`. The demo project is seeded on first start.

## Tests

```bash
cd backend && python -m pytest tests/test_core.py -n 0        # 13 tests: canonicalization, hashing, Ed25519, drift rules
cd contracts && yarn install && node compile.js && cd .. && python -m pytest contracts/test_registry.py -p no:xdist   # 7 tests
```

## Live vs demo matrix

| Capability | Status |
|---|---|
| Ethereum mainnet reads (chainId, eth_getCode keccak, EIP-1967 impl/admin slots, owner()) via `ETHEREUM_RPC_URL` | **LIVE** (public RPC, read-only) |
| Solana mainnet-beta reads (genesis→cluster, loader, ProgramData, upgrade authority, deploy slot) via `SOLANA_RPC_URL` | **LIVE** (public RPC, read-only) |
| Base / Arbitrum (same EVM adapter) | **UNAVAILABLE** until `BASE_RPC_URL` / `ARBITRUM_RPC_URL` set |
| Canonical SHA-256 evidence hashing + re-verification | Implemented & unit-tested |
| Ed25519 attestation signing + verification | Implemented & unit-tested (offchain; key in env) |
| Onchain anchoring of attestations | **Not deployed** — contract compiled & tested locally only |
| Aurora Lending Protocol project, its evidence, approvals and simulated chain | **DEMO / SIMULATED** |
| Live reference deployments (Aave V3 Pool, Jupiter v6) | LIVE reads of third-party contracts, baseline = trust-on-first-use; not owned by the demo team |
| GitHub / CI ingestion, wallet signatures, payments | Not implemented |
| AI investigation (Claude Sonnet 4.5) | Optional; deterministic analysis always available |

## Known limitations
- A hash proves integrity relative to a recorded reference; it does not prove code is safe, nor that a build matches source (no reproducible-build verification yet).
- Solana program binary hash, AccessControl role enumeration, multisig signer sets and non-EIP-1967 proxies are not observed.
- Verification is on-demand (plus page refresh); no background scheduler yet.
- Single attestor key per deployment of VERIDEX; no HSM/KMS.

See `docs/SUBMISSION.md` for pitch, demo script, GTM and validation plan.
