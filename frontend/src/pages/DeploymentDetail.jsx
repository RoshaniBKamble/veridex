import { Link, useParams } from "react-router-dom";
import { Anchor, FlaskConical, Radar, RotateCcw } from "lucide-react";
import { useAction, useApi } from "@/lib/hooks";
import { ago, fmtTime, post } from "@/lib/api";
import { ErrorNote, Hash, KV, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Table, Td } from "@/components/vx/Controls";
import { cn } from "@/lib/utils";

const val = (v) => (v == null ? "—" : String(v));
const isHash = (v) => typeof v === "string" && (v.startsWith("sha256:") || /^0x[0-9a-f]{64}$/.test(v));

export function ComparisonTable({ rows }) {
  return (
    <Table head={["Field", "Expected", "Observed", "Status", "Severity", "Source / limitation"]} testId="comparison-table">
      {rows.map((c) => (
        <tr key={c.field} className={cn("vx-row", c.status === "MISMATCH" && "bg-red-500/[0.05]")} data-testid={`comparison-row-${c.field}`}>
          <Td className="font-mono text-xs text-slate-200">{c.field}</Td>
          <Td className="max-w-[220px]">{isHash(c.expected) ? <Hash value={c.expected} /> : <span className="break-all font-mono text-[11px]">{val(c.expected)}</span>}</Td>
          <Td className="max-w-[220px]">{isHash(c.observed) ? <Hash value={c.observed} className={c.status === "MISMATCH" ? "border-red-500/40 bg-red-950/30 text-red-300" : ""} /> : <span className={cn("break-all font-mono text-[11px]", c.status === "MISMATCH" && "text-red-300")}>{val(c.observed)}</span>}</Td>
          <Td><StatusBadge status={c.status} /></Td>
          <Td>{c.status === "MISMATCH" ? <StatusBadge status={c.severity} /> : <span className="text-xs text-slate-600">—</span>}</Td>
          <Td className="max-w-[260px] text-[11px] text-slate-500"><div className="font-mono">{c.source || "—"}</div>{c.limitation && <div className="mt-1 text-amber-300/80">{c.limitation}</div>}{c.status === "MISMATCH" && <div className="mt-1 text-slate-400">{c.why}</div>}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default function DeploymentDetail() {
  const { id } = useParams();
  const { data: d, isLoading, error } = useApi(["deployment", id], `/deployments/${id}`, { refetchInterval: 20000 });
  const { run, busy } = useAction();
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error="Deployment not found or access denied." />;
  const canWrite = ["owner", "approver", "engineer"].includes(d.my_role);
  const canApprove = ["owner", "approver"].includes(d.my_role);
  const ns = d.network_status;
  return (
    <div data-testid="deployment-detail-page">
      <PageHeader eyebrow={`${d.project.name} · deployment`} title={d.label}
        description={`${d.network_name} · ${d.address}`}
        actions={<>
          <StatusBadge status={d.verification_status || "NEVER"} pulse={d.verification_status === "DRIFT"} testId="deployment-status-badge" />
          <StatusBadge status={d.observation_mode || "UNKNOWN"} />
          {canWrite && <Btn variant="primary" icon={Radar} loading={busy === "v"} data-testid="verify-deployment-btn" onClick={() => run("v", () => post(`/deployments/${id}/verify`), (r) => `Verification: ${r.status} (${r.mode})`)}>Verify now</Btn>}
          {d.simulated && canWrite && <>
            <Btn variant="danger" icon={FlaskConical} loading={busy === "s"} data-testid="simulate-drift-btn" onClick={() => run("s", () => post(`/deployments/${id}/simulate-drift`), "SIMULATED drift injected — re-verified")}>Simulate drift</Btn>
            <Btn variant="demo" icon={RotateCcw} loading={busy === "r"} data-testid="reset-drift-btn" onClick={() => run("r", () => post(`/deployments/${id}/reset-demo`), "Demo state reset to approved baseline")}>Reset demo</Btn>
          </>}
          {!d.simulated && canApprove && <Btn icon={Anchor} loading={busy === "b"} data-testid="rebaseline-btn" onClick={() => window.confirm("Replace expected state with the current observation? This accepts the current chain state as approved.") && run("b", () => post(`/deployments/${id}/baseline`), "Expected state re-baselined (new version)")}>Re-baseline</Btn>}
        </>} />
      {d.simulated && <div className="mb-6 rounded-md border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3 text-xs text-violet-200" data-testid="simulated-notice">SIMULATED deployment: observed state comes from an in-process simulator. No real chain, transaction or signature is involved.</div>}
      <Panel eyebrow={`Expected state v${d.expected.version} · ${d.expected.source}`} title="Expected vs observed" bodyClass="p-0" className="mb-6"
        action={<div className="text-right font-mono text-[10.5px] text-slate-500">checked {ago(d.last_check_at)}<br />{d.last_block_ref || "no observation"}</div>}>
        {d.last_error && <div className="border-b border-white/[0.06] px-5 py-3 text-xs text-amber-300">Observation unavailable: {d.last_error}. Missing data is not treated as drift.</div>}
        <ComparisonTable rows={d.comparisons} />
      </Panel>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Identity & provenance">
          <KV k="Release"><Link className="vx-link" to={`/app/releases/${d.release_id}`}>{d.release?.version}</Link> <StatusBadge status={d.release?.status} /></KV>
          <KV k="Manifest">{d.release?.manifest_hash ? <Hash value={d.release.manifest_hash} /> : "—"}</KV>
          <KV k="Attestation">{d.attestation ? <Hash value={d.attestation.statement_hash} /> : <StatusBadge status="UNAVAILABLE" label="not attested" />}</KV>
          <KV k="Freshness"><StatusBadge status={d.freshness} /> <span className="ml-1 text-xs text-slate-500">{fmtTime(d.last_observed_at)}</span></KV>
          <KV k="Integration"><StatusBadge status={ns.label} /> <span className="ml-1 font-mono text-[11px] text-slate-500">{ns.rpc_host}</span></KV>
        </Panel>
        <Panel eyebrow="Authority" title="Permission observations" bodyClass="p-0">
          <div className="max-h-80 overflow-y-auto">
            {d.permissions.map((p) => (
              <div key={p.id} className="border-b border-white/[0.05] px-5 py-3 text-xs">
                <div className="flex items-center justify-between"><span className="font-mono text-slate-300">{p.field}</span><StatusBadge status={p.review_status} /></div>
                <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{p.previous && <span className="text-slate-600 line-through">{p.previous} </span>}{p.value}</div>
                <div className="mt-1 text-[10.5px] text-slate-500">{p.verification} · {ago(p.observed_at)}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Response" title="Drift & incidents" bodyClass="p-0">
          {d.incidents.map((i) => (
            <Link key={i.id} to={`/app/incidents/${i.id}`} data-testid={`deployment-incident-${i.id}`} className="block border-b border-white/[0.05] px-5 py-3 transition-colors duration-150 hover:bg-white/[0.02]">
              <div className="flex items-center justify-between"><span className="font-mono text-xs text-slate-200">{i.number}</span><StatusBadge status={i.status} /></div>
              <div className="mt-1 text-[11px] text-slate-500">{i.title}</div>
            </Link>
          ))}
          {d.drift_events.slice(0, 6).map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-white/[0.05] px-5 py-2.5 text-xs"><span className="font-mono">{e.field}</span><span className="flex gap-2"><StatusBadge status={e.severity} /><StatusBadge status={e.status} /></span></div>
          ))}
          {!d.incidents.length && !d.drift_events.length && <div className="p-5 text-xs text-slate-500">No drift recorded for this deployment.</div>}
        </Panel>
      </div>
      <Panel title="Expected-state history & observations" className="mt-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">{d.expected_history.map((x) => <div key={x.id} className="font-mono text-[11px] text-slate-400">v{x.version} · {x.source} · {x.created_by} · {fmtTime(x.created_at)}</div>)}</div>
          <div className="space-y-2">{d.observations.map((o) => <div key={o.id} className="flex gap-2 font-mono text-[11px] text-slate-400"><StatusBadge status={o.mode} />{o.block_ref || o.error} · {ago(o.observed_at)}</div>)}</div>
        </div>
      </Panel>
    </div>
  );
}
