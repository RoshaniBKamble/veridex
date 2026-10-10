import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAction, useApi } from "@/lib/hooks";
import { ago, post } from "@/lib/api";
import { Empty, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Table, Td } from "@/components/vx/Controls";
import { cn } from "@/lib/utils";

export default function Findings() {
  const { projectId } = useAuth();
  const [filter, setFilter] = useState("OPEN");
  const { data = [], isLoading } = useApi(["findings", projectId], `/projects/${projectId}/findings`);
  const { run } = useAction();
  const rows = data.filter((f) => filter === "ALL" || f.status === filter);
  return (
    <div data-testid="findings-page">
      <PageHeader eyebrow="Security intelligence" title="Findings"
        description="Deterministic rule results over VERIDEX records: integrity failures, state mismatches, missing evidence, unattested deployments, stale or unavailable observations and authority changes. This is not a vulnerability scan or audit."
        actions={["OPEN", "ACKNOWLEDGED", "RESOLVED", "ALL"].map((s) => (
          <button key={s} data-testid={`findings-filter-${s.toLowerCase()}`} onClick={() => setFilter(s)}
            className={cn("rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors duration-150", filter === s ? "border-emerald-500/40 text-emerald-300" : "border-white/10 text-slate-500 hover:text-slate-300")}>{s}</button>
        ))} />
      <Panel bodyClass="p-0">
        {isLoading ? <div className="p-5"><Loading /></div> : !rows.length ? <div className="p-5"><Empty title={`No ${filter.toLowerCase()} findings`} /></div> : (
          <Table head={["Severity", "Finding · rule", "Evidence", "Recommended action", "Status", "Action"]} testId="findings-table">
            {rows.map((f) => (
              <tr key={f.id} className="vx-row" data-testid={`finding-row-${f.rule}`}>
                <Td><StatusBadge status={f.severity} /></Td>
                <Td className="text-xs text-slate-200"><div className="min-w-[180px] max-w-[300px]">{f.title}{f.simulated && <StatusBadge status="SIMULATED" className="ml-2" />}<div className="mt-1 break-all font-mono text-[10px] text-slate-500">{f.rule} · {f.kind}</div><div className="font-mono text-[10px] text-slate-500">{f.entity_type} · {ago(f.last_seen_at)}</div></div></Td>
                <Td className="font-mono text-[10.5px] text-slate-400"><div className="min-w-[140px] max-w-[240px] break-all">{Object.entries(f.evidence || {}).map(([k, v]) => { const s = String(Array.isArray(v) ? v.join(", ") : v); return <div key={k} title={s.length > 60 ? s : undefined}>{k}: {s.length > 60 ? `${s.slice(0, 60)}…` : s}</div>; })}</div></Td>
                <Td className="text-[11px] text-slate-400"><div className="min-w-[160px] max-w-[280px]">{f.recommended_action}</div></Td>
                <Td><StatusBadge status={f.status} /></Td>
                <Td>{f.status === "OPEN" ? <Btn variant="ghost" data-testid={`ack-finding-${f.id}`} onClick={() => run("a", () => post(`/findings/${f.id}/status`, { status: "ACKNOWLEDGED" }), "Finding acknowledged")}>Acknowledge</Btn> : <span className="text-xs text-slate-600">—</span>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
