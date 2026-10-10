import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bot, CheckCircle2, Eye, Search } from "lucide-react";
import { useAction, useApi } from "@/lib/hooks";
import { API_BASE, fmtTime, post, tokenStore } from "@/lib/api";
import { ErrorNote, Hash, KV, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, inputCls } from "@/components/vx/Controls";

function AiPanel({ inc }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true); setText("");
    try {
      const res = await fetch(`${API_BASE}/incidents/${inc.id}/ai-explain`, { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` } });
      if (!res.ok) { setText((await res.json()).detail || "AI unavailable"); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setText((t) => t + dec.decode(value, { stream: true }));
      }
    } catch (e) { setText(`AI request failed: ${e.message}`); } finally { setBusy(false); }
  };
  const prev = inc.ai_explanations[0]?.text;
  return (
    <Panel eyebrow="Optional · AI-generated hypothesis" title="Investigation assistant" testId="ai-panel"
      action={inc.ai_available && <Btn variant="demo" icon={Bot} loading={busy} data-testid="ai-explain-btn" onClick={ask}>Explain</Btn>}>
      {!inc.ai_available && <div className="text-xs text-slate-500">AI provider not configured. Deterministic analysis above remains the source of truth.</div>}
      {(text || prev) && <div data-testid="ai-explanation" className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">{text || prev}</div>}
      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">AI output is grounded in this incident's stored records but may be wrong. It cannot approve releases, alter policies or change expected state.</p>
    </Panel>
  );
}

export default function IncidentDetail() {
  const { id } = useParams();
  const { data: inc, isLoading, error } = useApi(["incident", id], `/incidents/${id}`);
  const [note, setNote] = useState("");
  const { run, busy } = useAction();
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error="Incident not found or access denied." />;
  const a = inc.analysis;
  const canWrite = ["owner", "approver", "engineer"].includes(inc.my_role);
  const act = (status, label, Icon, variant = "outline") => (
    <Btn key={status} variant={variant} icon={Icon} loading={busy === status} data-testid={`incident-${status.toLowerCase()}-btn`}
      onClick={() => run(status, () => post(`/incidents/${id}/status`, { status, note }), `Incident ${status.toLowerCase()}`).then(() => setNote(""))}>{label}</Btn>
  );
  return (
    <div data-testid="incident-detail-page">
      <PageHeader eyebrow={`${inc.project.name} · ${inc.number}`} title={inc.title} description={inc.summary}
        actions={<><StatusBadge status={inc.severity} /><StatusBadge status={inc.status} testId="incident-status-badge" pulse={inc.status === "OPEN"} />{inc.simulated && <StatusBadge status="SIMULATED" />}</>} />
      {inc.simulated && <div className="mb-6 rounded-md border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3 text-xs text-violet-200">This incident was produced by a controlled demo-state change. It is not a real attack or real blockchain transaction.</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Panel eyebrow="What changed" title="Expected vs observed" testId="incident-drift-list">
            {!inc.drift_events.length && <div className="text-xs text-slate-500">No drift events are linked to this incident.</div>}
            {inc.drift_events.map((e) => (
              <div key={e.id} className="mb-3 min-w-0 rounded border border-red-500/25 bg-red-500/[0.04] p-4 last:mb-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all font-mono text-sm text-slate-100">{e.field}</span><StatusBadge status={e.severity} /></div>
                <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
                  <div className="min-w-0"><div className="vx-eyebrow mb-1">Approved</div><div className="break-all font-mono text-[11px] text-emerald-300">{String(e.expected ?? "—")}</div></div>
                  <div className="min-w-0"><div className="vx-eyebrow mb-1">Observed</div><div className="break-all font-mono text-[11px] text-red-300">{String(e.observed ?? "—")}</div></div>
                </div>
                <div className="mt-3 text-xs text-slate-300">{e.why}</div>
                <div className="mt-2 break-words font-mono text-[10.5px] text-slate-500">{e.source} · {fmtTime(e.detected_at)} · expected-state v{e.expected_version} · seen {e.occurrences}×</div>
              </div>
            ))}
          </Panel>
          <Panel eyebrow="Deterministic · rule-based" title="Analysis & investigation steps" testId="incident-analysis">
            <div className="vx-eyebrow mb-2">Observed facts</div>
            <ul className="mb-4 space-y-1.5 text-xs text-slate-300">{a.facts.map((f) => <li key={f} className="break-words font-mono text-[11px]">• {f}</li>)}</ul>
            <div className="grid gap-4 md:grid-cols-2">
              <div><div className="vx-eyebrow mb-2">Still matching</div><div className="flex flex-wrap gap-1.5">{a.still_matching.map((f) => <StatusBadge key={f} status="MATCH" label={f} />)}</div></div>
              <div><div className="vx-eyebrow mb-2">Not verifiable</div><div className="flex flex-wrap gap-1.5">{a.not_verifiable.length ? a.not_verifiable.map((f) => <StatusBadge key={f} status="UNSUPPORTED" label={f} />) : <span className="text-xs text-slate-500">none</span>}</div></div>
            </div>
            <div className="vx-eyebrow mb-2 mt-5">Investigate next</div>
            <ol className="space-y-2 text-sm text-slate-300">{a.investigation_steps.map((s, i) => <li key={s} className="flex gap-3"><span className="font-mono text-xs text-emerald-500">{String(i + 1).padStart(2, "0")}</span>{s}</li>)}</ol>
            <p className="mt-4 text-[11px] text-slate-500">{a.limitations}</p>
          </Panel>
          <AiPanel inc={inc} />
        </div>
        <div className="min-w-0 space-y-6">
          {canWrite && inc.status !== "RESOLVED" && (
            <Panel title="Response" testId="incident-actions">
              <textarea data-testid="incident-note-input" rows={2} className={inputCls} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-3 flex flex-wrap gap-2">
                {inc.status === "OPEN" && act("ACKNOWLEDGED", "Acknowledge", Eye)}
                {inc.status !== "INVESTIGATING" && act("INVESTIGATING", "Investigate", Search)}
                {act("RESOLVED", "Resolve", CheckCircle2, "primary")}
                <Btn variant="ghost" data-testid="incident-add-note-btn" disabled={!note} onClick={() => run("n", () => post(`/incidents/${id}/notes`, { note }), "Note added").then(() => setNote(""))}>Add note</Btn>
              </div>
            </Panel>
          )}
          <Panel title="Linked records" testId="incident-linked-records">
            <KV k="Deployment"><Link className="vx-link" to={`/app/deployments/${inc.deployment_id}`}>{inc.deployment?.label}</Link></KV>
            <KV k="Network">{inc.deployment?.network_name}</KV>
            <KV k="Release"><Link className="vx-link" to={`/app/releases/${inc.release_id}`}>{inc.release?.version}</Link></KV>
            <KV k="Manifest"><Hash value={inc.release?.manifest_hash} /></KV>
            <KV k="Attestation">{inc.attestation ? <Hash value={inc.attestation.statement_hash} /> : "—"}</KV>
            <div className="vx-eyebrow mb-2 mt-4">Approved evidence</div>
            {!inc.evidence.length && <div className="text-xs text-slate-500">No evidence linked.</div>}
            {inc.evidence.map((e) => (
              <Link key={e.id} to={`/app/evidence/${e.id}`} data-testid={`incident-evidence-${e.type}`} className="flex items-center justify-between gap-2 border-b border-white/[0.04] py-2 text-xs hover:text-emerald-300">
                <span className="min-w-0 break-words">{e.title}</span><StatusBadge status={e.integrity_status} />
              </Link>
            ))}
          </Panel>
          <Panel title="Timeline" testId="incident-timeline">
            <ol className="relative space-y-4 border-l border-white/10 pl-4">
              {inc.timeline.map((t, i) => (
                <li key={i} className="text-xs">
                  <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border border-white/20 bg-[#10141D]" />
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={t.type === "CREATED" ? "OPEN" : t.type} label={t.type} /><span className="font-mono text-[10.5px] text-slate-500">{fmtTime(t.at)}</span></div>
                  <div className="mt-1 break-words text-slate-300">{t.note || "—"}</div>
                  <div className="font-mono text-[10px] text-slate-500">{t.actor}</div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
