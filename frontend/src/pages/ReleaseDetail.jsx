import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, FileLock2, Plus, ShieldCheck, Stamp, XCircle } from "lucide-react";
import { useAction, useApi } from "@/lib/hooks";
import { fmtTime, get, post } from "@/lib/api";
import { ErrorNote, Hash, KV, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Field, Table, Td, inputCls } from "@/components/vx/Controls";
import { WorkflowStepper } from "@/components/vx/Workflow";
import { RegisterDeployment } from "@/components/vx/RegisterDeployment";

const TEMPLATES = {
  source_commit: { repository: "github.com/org/repo", commit: "", branch: "main", signed_commit: true },
  build_artifact: { toolchain: "foundry / solc 0.8.24", contract: "", runtime_bytecode_keccak256: "" },
  test_report: { framework: "forge test", passed: 0, failed: 0 },
  security_review: { reviewer: "", scope: [], open_findings: 0 },
  deployment_manifest: { network: "", address: "" },
  other: {},
};

function AddEvidence({ release }) {
  const [type, setType] = useState("source_commit");
  const [title, setTitle] = useState("");
  const [payload, setPayload] = useState(JSON.stringify({ ...TEMPLATES.source_commit, commit: release.commit }, null, 2));
  const [err, setErr] = useState("");
  const { run, busy } = useAction();
  const pick = (t) => { setType(t); setPayload(JSON.stringify(TEMPLATES[t], null, 2)); };
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    let obj;
    try { obj = JSON.parse(payload); } catch (ex) { return setErr(`Invalid JSON: ${ex.message}`); }
    await run("ev", () => post(`/releases/${release.id}/evidence`, { type, title: title || type.replace("_", " "), payload: obj }), (r) => `Evidence hashed: ${r.hash.slice(0, 20)}…`);
  };
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="add-evidence-form">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Type">
          <select data-testid="evidence-type-select" className={inputCls} value={type} onChange={(e) => pick(e.target.value)}>
            {release.evidence_types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Title"><input data-testid="evidence-title-input" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CI test run #128" /></Field>
      </div>
      <Field label="Payload (JSON metadata — never source code or secrets)" hint="Integers, strings, booleans, null, arrays, objects. Floats are rejected for deterministic hashing.">
        <textarea data-testid="evidence-payload-input" rows={6} className={`${inputCls} font-mono text-xs`} value={payload} onChange={(e) => setPayload(e.target.value)} />
      </Field>
      {err && <div className="text-xs text-red-300" data-testid="evidence-error">{err}</div>}
      <Btn type="submit" icon={Plus} loading={busy === "ev"} data-testid="add-evidence-submit">Add & hash evidence</Btn>
    </form>
  );
}

function Attestation({ att }) {
  const [v, setV] = useState(null);
  const { run, busy } = useAction();
  return (
    <Panel eyebrow="Ed25519" title="Attestation" testId="attestation-panel"
      action={<Btn icon={ShieldCheck} loading={busy === "v"} data-testid="verify-attestation-btn" onClick={async () => setV(await run("v", () => get(`/attestations/${att.id}/verify`), null))}>Verify</Btn>}>
      <KV k="Attestation">{att.id}</KV>
      <KV k="Statement hash"><Hash value={att.statement_hash} /></KV>
      <KV k="Signer key">{att.key_id}</KV>
      <KV k="Signature"><span className="break-all font-mono text-[10.5px] text-slate-400">{att.signature}</span></KV>
      <KV k="Anchor"><StatusBadge status={att.anchor_status} /> <span className="mt-1 block text-[11px] text-slate-500">{att.anchor_note}</span></KV>
      {v && (
        <div className="mt-4 rounded border border-white/[0.07] p-3" data-testid="attestation-verify-result">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={v.valid ? "VERIFIED" : "FAILED"} label={v.valid ? "Attestation valid" : "Attestation invalid"} />
            <StatusBadge status={v.signature_ok ? "MATCH" : "MISMATCH"} label={`signature ${v.signature_ok ? "ok" : "bad"}`} />
            <StatusBadge status={v.statement_hash_ok ? "MATCH" : "MISMATCH"} label={`statement ${v.statement_hash_ok ? "ok" : "bad"}`} />
          </div>
          <div className="mt-2 space-y-1">{v.evidence.map((e) => <div key={e.id} className="flex justify-between font-mono text-[11px]"><span className="text-slate-400">{e.type}</span><StatusBadge status={e.ok ? "MATCH" : "MISMATCH"} /></div>)}</div>
        </div>
      )}
    </Panel>
  );
}

export default function ReleaseDetail() {
  const { id } = useParams();
  const { data: r, isLoading, error } = useApi(["release", id], `/releases/${id}`);
  const [comment, setComment] = useState("");
  const { run, busy } = useAction();
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error="Release not found or access denied." />;
  const role = r.my_role;
  const canWrite = ["owner", "approver", "engineer"].includes(role);
  const canApprove = ["owner", "approver"].includes(role);
  const approvesCount = r.approvals.filter((a) => a.decision === "approve").length;
  const missing = r.required_evidence.filter((t) => !r.evidence.some((e) => e.type === t));
  return (
    <div data-testid="release-detail-page">
      <PageHeader eyebrow={`${r.project.name} · release`} title={r.version} description={r.notes}
        actions={<>{r.project.is_demo && <StatusBadge status="DEMO" />}<StatusBadge status={r.status} testId="release-status-badge" /></>} />
      <div className="mb-6"><WorkflowStepper release={r} deployments={r.deployments} /></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Panel eyebrow="Evidence" title={`Evidence (${r.evidence.length})`} bodyClass="p-0"
            action={r.status === "draft" && canWrite && (
              <Btn variant="primary" icon={FileLock2} loading={busy === "seal"} data-testid="seal-release-btn" disabled={missing.length > 0}
                onClick={() => run("seal", () => post(`/releases/${id}/seal`), (x) => `Sealed · manifest ${x.manifest_hash.slice(0, 18)}…`)}>Seal manifest</Btn>)}>
            <Table head={["Type", "Title", "SHA-256", "Integrity", "Label"]} testId="evidence-table">
              {r.evidence.map((e) => (
                <tr key={e.id} className="vx-row">
                  <Td className="font-mono text-xs">{e.type}</Td>
                  <Td><Link to={`/app/evidence/${e.id}`} className="vx-link text-xs" data-testid={`evidence-link-${e.type}`}>{e.title}</Link></Td>
                  <Td><Hash value={e.hash} /></Td>
                  <Td><StatusBadge status={e.integrity_status} /></Td>
                  <Td><StatusBadge status={e.label} /></Td>
                </tr>
              ))}
            </Table>
            {missing.length > 0 && <div className="border-t border-white/[0.06] px-5 py-3 text-xs text-amber-300" data-testid="missing-evidence-note">Required before sealing: {missing.join(", ")}</div>}
          </Panel>
          {r.status === "draft" && canWrite && <Panel eyebrow="Collect" title="Add evidence"><AddEvidence release={r} /></Panel>}
          <Panel eyebrow="Production" title="Deployments of this release" bodyClass="p-0">
            <Table head={["Label", "Network", "Address", "Status"]}>
              {r.deployments.map((d) => (
                <tr key={d.id} className="vx-row">
                  <Td><Link className="vx-link text-xs" to={`/app/deployments/${d.id}`}>{d.label}</Link></Td>
                  <Td className="text-xs">{d.network}</Td><Td className="font-mono text-[11px]">{d.address.slice(0, 18)}…</Td>
                  <Td><StatusBadge status={d.verification_status || "NEVER"} /></Td>
                </tr>
              ))}
            </Table>
            {canWrite && <div className="border-t border-white/[0.06] p-5"><RegisterDeployment release={r} /></div>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Manifest">
            <KV k="Commit"><span className="font-mono text-xs">{r.commit}</span></KV>
            <KV k="Branch">{r.branch}</KV>
            <KV k="Manifest hash">{r.manifest_hash ? <Hash value={r.manifest_hash} testId="manifest-hash" /> : "Not sealed"}</KV>
            <KV k="Sealed">{fmtTime(r.sealed_at)}</KV>
          </Panel>
          <Panel eyebrow={`${approvesCount} / ${r.project.required_approvals} required`} title="Approvals" testId="approvals-panel">
            {r.approvals.map((a) => (
              <div key={a.id} className="mb-3 rounded border border-white/[0.06] p-3 text-xs">
                <div className="flex items-center justify-between"><span className="text-slate-200">{a.approver_name}</span><StatusBadge status={a.decision} /></div>
                <div className="mt-1 text-slate-500">{a.comment || "—"} · {fmtTime(a.created_at)}</div>
                <div className="mt-1.5"><Hash value={a.manifest_hash} /></div>
              </div>
            ))}
            {r.status === "sealed" && canApprove && (
              <div className="space-y-2">
                <input data-testid="review-comment-input" className={inputCls} placeholder="Review comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex gap-2">
                  <Btn variant="primary" icon={BadgeCheck} loading={busy === "ap"} data-testid="approve-release-btn" onClick={() => run("ap", () => post(`/releases/${id}/review`, { decision: "approve", comment }), "Approval recorded against manifest hash")}>Approve</Btn>
                  <Btn variant="danger" icon={XCircle} loading={busy === "rj"} data-testid="reject-release-btn" onClick={() => run("rj", () => post(`/releases/${id}/review`, { decision: "reject", comment }), "Release rejected")}>Reject</Btn>
                </div>
              </div>
            )}
            {r.status === "approved" && canApprove && (
              <Btn variant="primary" icon={Stamp} className="w-full" loading={busy === "at"} data-testid="attest-release-btn" onClick={() => run("at", () => post(`/releases/${id}/attest`), "Attestation signed (Ed25519, offchain)")}>Issue attestation</Btn>
            )}
            {r.status === "draft" && <div className="text-xs text-slate-500">Seal the manifest to open reviews.</div>}
          </Panel>
          {r.attestation && <Attestation att={r.attestation} />}
        </div>
      </div>
    </div>
  );
}
