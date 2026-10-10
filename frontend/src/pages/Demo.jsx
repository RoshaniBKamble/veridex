import { Link } from "react-router-dom";
import { FlaskConical, RotateCcw, DatabaseZap } from "lucide-react";
import { DEMO_PROJECT, useAuth } from "@/context/AuthContext";
import { useAction, useApi } from "@/lib/hooks";
import { post } from "@/lib/api";
import { Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn } from "@/components/vx/Controls";
import { ComparisonTable } from "@/pages/DeploymentDetail";
import { TrustGraph } from "@/components/graph/TrustGraph";

const DEMO_DEP = "dep_demo_vault";

export default function Demo() {
  const { projectId, setProjectId } = useAuth();
  const onDemo = projectId === DEMO_PROJECT;
  const { data: dep, isLoading } = useApi(["deployment", DEMO_DEP], `/deployments/${DEMO_DEP}`);
  const { data: rel } = useApi(["release", dep?.release_id], dep ? `/releases/${dep.release_id}` : null);
  const { data: graph } = useApi(["graph", DEMO_PROJECT], `/projects/${DEMO_PROJECT}/graph`);
  const { run, busy } = useAction();
  if (isLoading) return <Loading />;
  const openInc = dep.incidents.find((i) => i.status !== "RESOLVED");
  const testEv = rel?.evidence.find((e) => e.type === "test_report");
  const steps = [
    ["Open the project", <Link className="vx-link" to={`/app/projects/${DEMO_PROJECT}`}>Aurora Lending Protocol</Link>],
    ["Inspect the approved release", <Link className="vx-link" data-testid="demo-release-link" to={`/app/releases/${dep.release_id}`}>{dep.release.version} · {dep.release.status}</Link>],
    ["View evidence & hashes", testEv ? <Link className="vx-link" to={`/app/evidence/${testEv.id}`}>{rel.evidence.length} evidence records</Link> : "…"],
    ["Inspect approval & attestation", <span className="font-mono text-xs text-slate-400">{rel?.approvals.length} approvals · {rel?.attestation?.key_id}</span>],
    ["Open the deployment", <Link className="vx-link" to={`/app/deployments/${DEMO_DEP}`}>{dep.label}</Link>],
    ["View the Trust Graph", <Link className="vx-link" to="/app/graph" onClick={() => setProjectId(DEMO_PROJECT)}>Open graph</Link>],
  ];
  return (
    <div data-testid="demo-page">
      <PageHeader eyebrow="Demo environment · SIMULATED" title="Controlled drift demonstration"
        description="Aurora Lending Protocol is fictional. Its chain is an in-process simulator. SIMULATE DRIFT changes the simulated proxy implementation, implementation bytecode and proxy admin — then VERIDEX re-observes and compares against the approved expected state. Nothing here is a real attack or transaction."
        actions={!onDemo && <Btn data-testid="demo-switch-project-btn" onClick={() => setProjectId(DEMO_PROJECT)}>Switch to demo project</Btn>} />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Panel eyebrow="Walkthrough" title="Inspect before you break it">
            <ol className="space-y-3">
              {steps.map(([t, c], i) => (
                <li key={t} className="flex gap-3 text-sm"><span className="font-mono text-xs text-emerald-500">{String(i + 1).padStart(2, "0")}</span><div><div className="text-slate-200">{t}</div><div className="mt-0.5 text-xs">{c}</div></div></li>
              ))}
            </ol>
          </Panel>
          <Panel eyebrow="Controls" title="Demo actions" testId="demo-controls">
            <div className="flex items-center justify-between rounded border border-white/[0.07] px-3 py-2.5 text-xs">
              <span className="text-slate-400">Simulated deployment</span><StatusBadge status={dep.verification_status} pulse={dep.verification_status === "DRIFT"} testId="demo-deployment-status" />
            </div>
            <div className="mt-4 grid gap-2">
              <Btn variant="danger" icon={FlaskConical} loading={busy === "s"} data-testid="simulate-drift-btn" onClick={() => { setProjectId(DEMO_PROJECT); run("s", () => post(`/deployments/${DEMO_DEP}/simulate-drift`), "SIMULATED drift injected — incident opened"); }}>SIMULATE DRIFT</Btn>
              <Btn variant="demo" icon={RotateCcw} loading={busy === "r"} data-testid="reset-drift-btn" onClick={() => run("r", () => post(`/deployments/${DEMO_DEP}/reset-demo`), "Demo state reset · re-verified")}>Reset demo state</Btn>
              {testEv && <Btn variant="demo" icon={FlaskConical} loading={busy === "t"} data-testid="demo-tamper-btn" onClick={() => run("t", () => post(`/evidence/${testEv.id}/tamper-demo`), "SIMULATED: test report altered after approval")}>Tamper approved evidence</Btn>}
              <Btn variant="ghost" icon={DatabaseZap} loading={busy === "x"} data-testid="demo-reseed-btn" onClick={() => window.confirm("Rebuild the entire demo project from scratch?") && run("x", () => post("/demo/reseed"), "Demo project re-seeded")}>Rebuild demo data</Btn>
            </div>
            {openInc && <Link to={`/app/incidents/${openInc.id}`} data-testid="demo-open-incident-link" className="mt-4 block rounded border border-red-500/40 bg-red-500/[0.06] px-3 py-2.5 text-xs text-red-200">{openInc.number} opened → investigate evidence</Link>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel eyebrow={`Expected v${dep.expected.version} vs ${dep.last_block_ref}`} title="Verification result" bodyClass="p-0"><ComparisonTable rows={dep.comparisons} /></Panel>
          {graph && <TrustGraph graph={graph} height={420} />}
        </div>
      </div>
    </div>
  );
}
