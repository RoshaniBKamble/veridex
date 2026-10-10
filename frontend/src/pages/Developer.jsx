import { useState } from "react";
import { Link } from "react-router-dom";
import { Hash as HashIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { apiError, ago, post } from "@/lib/api";
import { Hash, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Table, Td, inputCls } from "@/components/vx/Controls";

function HashTool() {
  const [text, setText] = useState('{\n  "framework": "forge test",\n  "passed": 412,\n  "failed": 0\n}');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const run = async () => {
    setErr(""); setRes(null);
    try { setRes(await post("/tools/hash", { payload: JSON.parse(text) })); }
    catch (e) { setErr(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : apiError(e)); }
  };
  return (
    <Panel eyebrow="veridex-c14n-v1" title="Canonical SHA-256 calculator" testId="hash-tool">
      <textarea data-testid="hash-tool-input" rows={6} className={`${inputCls} font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <Btn variant="primary" icon={HashIcon} onClick={run} data-testid="hash-tool-run">Canonicalize & hash</Btn>
        {err && <span data-testid="hash-tool-error" className="text-xs text-red-300">{err}</span>}
      </div>
      {res && (
        <div className="mt-4 space-y-2" data-testid="hash-tool-result">
          <Hash value={res.hash} short={false} />
          <pre className="overflow-x-auto rounded border border-white/[0.06] bg-[#0B0E14] p-3 font-mono text-[11px] text-slate-400">{res.canonical}</pre>
          <div className="font-mono text-[10px] text-slate-500">{res.bytes} canonical bytes · keys sorted · NFC · floats rejected</div>
        </div>
      )}
    </Panel>
  );
}

export default function Developer() {
  const { projectId } = useAuth();
  const { data: deps, isLoading } = useApi(["deployments", projectId], `/projects/${projectId}/deployments`);
  const { data: drift = [] } = useApi(["drift", projectId], `/projects/${projectId}/drift-events`);
  const { data: audit = [] } = useApi(["audit", projectId], `/projects/${projectId}/audit?limit=25`);
  return (
    <div data-testid="developer-page">
      <PageHeader eyebrow="Developer command center" title="Evidence, state and verification internals"
        description="Raw comparisons, hashes and observation sources behind every verdict." />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel eyebrow="Expected vs observed" title="Deployment comparisons" bodyClass="p-0">
          {isLoading ? <div className="p-5"><Loading /></div> : (
            <Table head={["Deployment", "Field", "Status", "Observed", "Source"]} testId="dev-comparisons-table">
              {deps.flatMap((d) => d.comparisons.map((c) => (
                <tr key={d.id + c.field} className="vx-row">
                  <Td><Link to={`/app/deployments/${d.id}`} className="vx-link text-xs">{d.label.slice(0, 24)}</Link></Td>
                  <Td className="font-mono text-xs">{c.field}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="max-w-[200px] truncate font-mono text-[11px]">{String(c.observed ?? "—")}</Td>
                  <Td className="max-w-[220px] truncate font-mono text-[10.5px] text-slate-500">{c.source}</Td>
                </tr>
              )))}
            </Table>
          )}
        </Panel>
        <HashTool />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="Drift engine" title="Recent drift events" bodyClass="p-0">
          <Table head={["Field", "Severity", "Status", "Detected"]} testId="dev-drift-table">
            {drift.slice(0, 10).map((e) => (
              <tr key={e.id} className="vx-row">
                <Td className="font-mono text-xs">{e.field}{e.simulated && <StatusBadge status="SIMULATED" className="ml-2" />}</Td>
                <Td><StatusBadge status={e.severity} /></Td><Td><StatusBadge status={e.status} /></Td>
                <Td className="font-mono text-[11px] text-slate-500">{ago(e.detected_at)}</Td>
              </tr>
            ))}
          </Table>
          {!drift.length && <div className="p-5 text-xs text-slate-500">No drift recorded. Use the Demo environment to simulate a controlled change.</div>}
        </Panel>
        <Panel eyebrow="Audit history" title="Activity log" bodyClass="p-0">
          <div className="max-h-[380px] overflow-y-auto" data-testid="audit-log">
            {audit.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2.5 text-xs">
                <span className="w-16 shrink-0 font-mono text-[10.5px] text-slate-500">{ago(a.created_at)}</span>
                <span className="font-mono text-emerald-300/80">{a.action}</span>
                <span className="truncate text-slate-500">{a.actor}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
