import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Fingerprint, FileCheck2, KeyRound, Radar, Siren, GitCommitHorizontal } from "lucide-react";
import { get } from "@/lib/api";
import { Logo } from "@/components/vx/Logo";
import { StatusBadge } from "@/components/vx/Primitives";
import { TrustGraph } from "@/components/graph/TrustGraph";
import { LandingSections } from "@/pages/LandingSections";

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0E14]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-6">
        <Logo />
        <nav className="hidden gap-6 text-[13px] text-slate-400 md:flex">
          {[["#how", "How it works"], ["#capabilities", "Capabilities"], ["#honesty", "Live vs demo"], ["#pricing", "Pricing"]].map(([h, l]) => (
            <a key={h} href={h} className="transition-colors duration-150 hover:text-slate-100">{l}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/login" data-testid="landing-signin-link" className="text-[13px] text-slate-300 hover:text-white">Sign in</Link>
          <Link to="/login?next=/app/demo" data-testid="landing-nav-demo-btn" className="rounded-md bg-emerald-500 px-3.5 py-2 text-[13px] font-medium text-[#04120c] transition-colors duration-150 hover:bg-emerald-400">Launch demo</Link>
        </div>
      </div>
    </header>
  );
}

const STEPS = [
  [GitCommitHorizontal, "Intended", "What the team meant to release: commit, build, tests, review."],
  [Fingerprint, "Evidenced", "Evidence canonicalized and SHA-256 hashed into a release manifest."],
  [FileCheck2, "Approved", "Named approvers sign off on the exact manifest hash."],
  [KeyRound, "Attested", "Ed25519-signed statement binds evidence, approvals and release."],
  [Radar, "Observed", "Adapters read bytecode, proxy slots and authorities from the chain."],
  [Siren, "Compared", "Deterministic expected-vs-observed rules raise drift and incidents."],
];

export default function Landing() {
  const { data: graph, isError } = useQuery({ queryKey: ["public-graph"], queryFn: () => get("/public/demo-graph"), retry: 1 });
  return (
    <div className="min-h-screen bg-[#07090D] text-slate-200">
      <Nav />
      <section className="vx-grid vx-noise relative overflow-hidden border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-20 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-6 inline-flex items-center gap-2 rounded border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300">
              Release integrity · Onchain verification
            </div>
            <h1 className="text-4xl font-semibold leading-[1.05] text-slate-50 sm:text-5xl lg:text-6xl" data-testid="landing-headline">
              Verify what you build.<br /><span className="text-emerald-400">Prove what you deploy.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">
              VERIDEX connects release evidence, cryptographic provenance, approvals and attestations to the state your contracts and programs actually expose onchain — and opens an evidence-backed incident the moment production stops matching what your team approved.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/login?next=/app/demo" data-testid="landing-launch-demo-btn" className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-3 text-sm font-medium text-[#04120c] transition-colors duration-150 hover:bg-emerald-400">
                Launch the drift demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login?mode=register" data-testid="landing-register-btn" className="inline-flex items-center gap-2 rounded-md border border-white/15 px-5 py-3 text-sm text-slate-200 transition-colors duration-150 hover:border-white/30">
                Register a project
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/[0.06] pt-6 font-mono text-[11px] text-slate-500">
              <div><div className="text-slate-200">SHA-256</div>canonical evidence</div>
              <div><div className="text-slate-200">Ed25519</div>signed attestations</div>
              <div><div className="text-slate-200">EVM + Solana</div>live RPC reads</div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.15 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="vx-eyebrow">Trust graph · live from demo records</div>
              <StatusBadge status="DEMO" label="Demo project" />
            </div>
            {graph ? <TrustGraph graph={graph} height={430} compact interactive={false} /> :
              <div className="grid h-[430px] place-items-center rounded-lg border border-white/[0.08] px-6 text-center font-mono text-xs text-slate-500" data-testid="landing-graph-placeholder">
                {isError ? "Demo graph unavailable — the API could not be reached. Sign in to view project records." : "Loading graph…"}
              </div>}
            <p className="font-mono text-[10.5px] text-slate-600">Every node is a stored record: repository → evidence → manifest → approval → attestation → deployment → chain → authority → production.</p>
          </motion.div>
        </div>
      </section>

      <section id="how" className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl">
            <div className="vx-eyebrow mb-3 text-emerald-400/80">The gap</div>
            <h2 className="text-2xl font-semibold text-slate-50 sm:text-3xl">Six questions your tooling answers in six different places.</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">Repos, CI, audits, deploy scripts, explorers and multisigs each hold one piece. VERIDEX links them into one evidence chain with one verdict per deployment.</p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([Icon, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="bg-[#0B0E14] p-7">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-emerald-400" />
                  <span className="font-mono text-[11px] text-slate-600">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-6 text-lg font-medium text-slate-100">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      <LandingSections graph={graph} />
    </div>
  );
}
