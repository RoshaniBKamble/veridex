import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/vx/Logo";
import { StatusBadge } from "@/components/vx/Primitives";

const CAPS = [
  ["Provenance", "Deterministic canonical JSON (veridex-c14n-v1) and SHA-256 over every evidence record. Changed evidence is detected on every check."],
  ["Attestation", "Ed25519-signed statements bind the manifest hash, evidence references and approvals. Verifiable by anyone holding the public key."],
  ["Deployment verification", "EVM: chain ID, runtime bytecode keccak, EIP-1967 implementation + admin, owner(). Solana: cluster, loader, ProgramData, upgrade authority, deploy slot."],
  ["Permissions", "Every privileged authority observation is stored with its source, block/slot and timestamp. Changes become reviewable events — not automatic accusations."],
  ["Drift → incident", "Mismatches create deduplicated drift events and one linked incident per deployment, with expected vs observed values and investigation steps."],
  ["Investigation", "Deterministic analysis always available. Optional AI explanations are grounded in stored records and labelled as hypotheses."],
];

const MATRIX = [
  ["Ethereum mainnet reads (public RPC)", "LIVE"], ["Solana mainnet-beta reads (public RPC)", "LIVE"],
  ["SHA-256 canonical hashing & integrity checks", "VERIFIED"], ["Ed25519 attestation signing / verification", "VERIFIED"],
  ["Base / Arbitrum adapters (same EVM adapter)", "UNAVAILABLE"], ["Onchain attestation anchoring (registry contract)", "UNAVAILABLE"],
  ["Aurora demo project + drift simulation", "SIMULATED"], ["GitHub / CI ingestion", "UNAVAILABLE"],
];

const PLANS = [
  ["Developer", "$0", "1 project, 2 deployments, manual verification, 14-day evidence retention."],
  ["Team", "$399 / mo", "10 projects, scheduled verification, multi-approver workflows, incident timeline, 1-year retention."],
  ["Protocol Ops", "$1,500 / mo", "Continuous monitoring, permission change review, API access, audit export, multi-chain adapters."],
  ["Enterprise", "Custom", "SSO, policy controls, dedicated RPC, onchain anchoring, extended retention, support SLAs."],
];

export function LandingSections({ graph }) {
  const demo = graph?.deployments?.find((d) => d.network === "veridex-demo-evm");
  const rows = (demo?.comparisons || []).filter((c) => c.field !== "release_attestation").slice(0, 5);
  return (
    <>
      <section className="border-b border-white/[0.06] bg-[#0B0E14]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="vx-eyebrow mb-3 text-red-400/80">The killer moment</div>
            <h2 className="text-2xl font-semibold text-slate-50 sm:text-3xl">When production stops matching the approval, you know — with evidence.</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">In the demo, a clearly labelled SIMULATE DRIFT action swaps the proxy implementation and admin in a simulated chain. VERIDEX re-observes, compares against the versioned expected state, raises drift events, opens a linked incident and traces the path on the Trust Graph.</p>
            <Link to="/login?next=/app/demo" data-testid="landing-drift-demo-cta" className="mt-8 inline-flex rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-red-200 transition-colors duration-150 hover:bg-red-500/20">Run the simulation</Link>
          </div>
          <div className="vx-panel overflow-hidden">
            <div className="flex items-center gap-3 border-b border-red-500/30 bg-[#1a0b0d] px-5 py-3">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-red-400">Critical production drift</span>
              <StatusBadge status="SIMULATED" className="ml-auto" />
            </div>
            <div className="px-5 py-4 text-sm text-slate-300">Production no longer matches the approved state.</div>
            <div className="grid grid-cols-[130px_1fr_1fr] gap-x-4 border-t border-white/[0.06] px-5 py-3 font-mono text-[10.5px] uppercase tracking-wider text-slate-500">
              <span>Field</span><span>Approved</span><span>Observed after simulation</span>
            </div>
            {(rows.length ? rows : [{ field: "implementation", expected: "0x5f3c…6e20" }, { field: "proxy_admin", expected: "0x9a1e…8a01" }]).map((r) => {
              const drifted = ["implementation", "implementation_code_hash", "proxy_admin"].includes(r.field);
              return (
                <div key={r.field} className="grid grid-cols-[130px_1fr_1fr] gap-x-4 border-t border-white/[0.04] px-5 py-2.5 font-mono text-[11px]">
                  <span className="text-slate-400">{r.field}</span>
                  <span className="truncate text-emerald-300/90">{String(r.expected).slice(0, 18)}…</span>
                  <span className={drifted ? "text-red-300" : "text-emerald-300/90"}>{drifted ? "changed → MISMATCH" : "unchanged → MATCH"}</span>
                </div>
              );
            })}
            <div className="border-t border-white/[0.06] px-5 py-3 text-[11px] text-slate-500">Approved values shown are the real DEMO expected-state record. Observed column illustrates the simulation outcome.</div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="vx-eyebrow mb-3 text-sky-400/80">Capabilities</div>
          <h2 className="max-w-2xl text-2xl font-semibold text-slate-50 sm:text-3xl">Release integrity, not another dashboard.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {CAPS.map(([t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="vx-panel p-6 transition-colors duration-200 hover:border-emerald-500/25">
                <h3 className="text-base font-medium text-slate-100">{t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-16 grid gap-6 lg:grid-cols-2">
            <div className="vx-panel p-7">
              <div className="vx-eyebrow mb-2">For founders & CTOs</div>
              <p className="text-sm leading-relaxed text-slate-300">One posture view: which releases are attested, which deployments are verified and how fresh that verification is — with a transparent, weighted score and the next action to take.</p>
            </div>
            <div className="vx-panel p-7">
              <div className="vx-eyebrow mb-2">For engineers</div>
              <p className="text-sm leading-relaxed text-slate-300">Hashes, canonical forms, block numbers, storage slots, signatures and observation sources. Every verdict is reproducible from the records behind it.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="honesty" className="border-b border-white/[0.06] bg-[#0B0E14]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="vx-eyebrow mb-3 text-amber-400/80">Live vs demo</div>
            <h2 className="text-2xl font-semibold text-slate-50 sm:text-3xl">We label everything.</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">A hash establishes integrity relative to a trusted reference — it does not prove code is safe. VERIDEX never fabricates transactions, signatures, scans or confirmations. Unconfigured integrations say UNAVAILABLE.</p>
          </div>
          <div className="vx-panel divide-y divide-white/[0.05]" data-testid="landing-honesty-matrix">
            {MATRIX.map(([k, s]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm"><span className="text-slate-300">{k}</span><StatusBadge status={s} /></div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="vx-eyebrow mb-3 text-violet-300/80">Pricing hypothesis</div>
              <h2 className="text-2xl font-semibold text-slate-50 sm:text-3xl">Plans we intend to validate with pilots.</h2>
            </div>
            <StatusBadge status="UNKNOWN" label="Not validated — no payments implemented" />
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map(([n, p, d], i) => (
              <div key={n} className={`vx-panel p-6 ${i === 1 ? "border-emerald-500/30" : ""}`} data-testid={`pricing-plan-${n.toLowerCase().replace(" ", "-")}`}>
                <div className="vx-eyebrow">{n}</div>
                <div className="mt-3 font-mono text-2xl text-slate-50">{p}</div>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">{d}</p>
                <div className="mt-6 flex items-center gap-2 text-xs text-slate-500"><Check className="h-3.5 w-3.5 text-emerald-500" />Hypothesis</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="vx-grid">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-6 py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-xl text-2xl font-semibold text-slate-50 sm:text-3xl">Know whether production is what you approved.</h2>
          <div className="flex gap-3">
            <Link to="/login?next=/app/demo" data-testid="footer-cta-demo" className="rounded-md bg-emerald-500 px-5 py-3 text-sm font-medium text-[#04120c] hover:bg-emerald-400">Launch demo</Link>
            <Link to="/login?mode=register" data-testid="footer-cta-register" className="rounded-md border border-white/15 px-5 py-3 text-sm text-slate-200 hover:border-white/30">Register a project</Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-white/[0.06] bg-[#0B0E14]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Logo />
          <div className="flex flex-wrap gap-6 font-mono text-[11px] text-slate-500">
            <a href={`${process.env.REACT_APP_BACKEND_URL}/api/docs`} target="_blank" rel="noreferrer" data-testid="footer-api-docs" className="hover:text-slate-300">API docs</a>
            <a href="#honesty" className="hover:text-slate-300">Limitations</a>
            <a href="#pricing" className="hover:text-slate-300">Pricing hypothesis</a>
            <span>© 2026 VERIDEX · Not a security guarantee</span>
          </div>
        </div>
      </footer>
    </>
  );
}
