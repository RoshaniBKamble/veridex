import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FlaskConical, RefreshCcw, ScanSearch } from "lucide-react";
import { useAction, useApi } from "@/lib/hooks";
import { fmtTime, post } from "@/lib/api";
import { ErrorNote, Hash, KV, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, inputCls } from "@/components/vx/Controls";

export default function EvidenceDetail() {
  const { id } = useParams();
  const { data: e, isLoading, error } = useApi(["evidence", id], `/evidence/${id}`);
  const [check, setCheck] = useState(null);
  const [content, setContent] = useState("");
  const [cmp, setCmp] = useState(null);
  const { run, busy } = useAction();
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error="Evidence not found or access denied." />;
  const verifyContent = async () => {
    let obj;
    try { obj = JSON.parse(content); } catch (ex) { return setCmp({ error: `Invalid JSON: ${ex.message}` }); }
    setCmp(await run("vc", () => post(`/evidence/${id}/verify-content`, { payload: obj })));
  };
  return (
    <div data-testid="evidence-detail-page">
      <PageHeader eyebrow={`Evidence · ${e.type}`} title={e.title}
        actions={<><StatusBadge status={e.label} /><StatusBadge status={e.integrity_status} testId="evidence-integrity-badge" /></>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Panel eyebrow={e.canonicalization} title="Canonical form (exact hashed bytes)">
            <pre data-testid="evidence-canonical" className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border border-white/[0.06] bg-[#0B0E14] p-4 font-mono text-[11px] text-slate-300">{e.canonical_form}</pre>
            <div className="mt-2 font-mono text-[10.5px] text-slate-500">{e.canonical_size} bytes recorded at creation</div>
          </Panel>
          <Panel eyebrow="Independent check" title="Verify a copy of this evidence">
            <textarea data-testid="verify-content-input" rows={5} className={`${inputCls} font-mono text-xs`} placeholder="Paste the JSON you hold" value={content} onChange={(x) => setContent(x.target.value)} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Btn icon={ScanSearch} onClick={verifyContent} loading={busy === "vc"} data-testid="verify-content-btn">Compare hash</Btn>
              {cmp?.error && <span className="text-xs text-red-300">{cmp.error}</span>}
              {cmp && !cmp.error && <span data-testid="verify-content-result"><StatusBadge status={cmp.match ? "MATCH" : "MISMATCH"} /> <span className="ml-2 font-mono text-[11px] text-slate-400">{cmp.submitted_hash}</span></span>}
            </div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Integrity">
            <KV k="Recorded hash"><Hash value={e.hash} short={false} testId="evidence-hash" /></KV>
            <KV k="Last recomputed">{e.last_recomputed_hash ? <Hash value={e.last_recomputed_hash} /> : "—"}</KV>
            <KV k="Last verified">{fmtTime(e.last_verified_at)}</KV>
            <KV k="Release"><Link className="vx-link" to={`/app/releases/${e.release_id}`}>{e.release?.version}</Link></KV>
            <KV k="Source URI">{e.source_uri || "—"}</KV>
            <KV k="Added by">{e.created_by}</KV>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="primary" icon={RefreshCcw} loading={busy === "v"} data-testid="verify-evidence-btn" onClick={async () => setCheck(await run("v", () => post(`/evidence/${id}/verify`), (r) => `Integrity ${r.status}`))}>Recompute hash</Btn>
              {e.label === "DEMO" && <Btn variant="demo" icon={FlaskConical} loading={busy === "t"} data-testid="tamper-evidence-btn" onClick={() => run("t", () => post(`/evidence/${id}/tamper-demo`), "SIMULATED: stored evidence modified without re-hashing")}>Simulate tampering</Btn>}
            </div>
            {check && <div className="mt-3" data-testid="evidence-verify-result"><StatusBadge status={check.status} /></div>}
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">A matching hash proves the stored record is unchanged relative to the recorded reference. It does not prove the described build or code is correct or secure.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
