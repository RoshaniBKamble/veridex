import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAction, useApi } from "@/lib/hooks";
import { fmtTime, post } from "@/lib/api";
import { ErrorNote, KV, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Table, Td, inputCls } from "@/components/vx/Controls";
import { EntityLink } from "@/components/vx/Workflow";
import { CreateReleaseForm } from "@/components/vx/CreateReleaseForm";

function Members({ p }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("approver");
  const { run, busy } = useAction();
  return (
    <Panel eyebrow="Team" title="Members & roles">
      <div className="space-y-2">
        {p.members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between text-sm"><span className="text-slate-200">{m.name} <span className="font-mono text-[11px] text-slate-500">{m.email}</span></span><StatusBadge status="INFO" label={m.role} /></div>
        ))}
      </div>
      {!p.is_demo && p.my_role === "owner" && (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run("m", () => post(`/projects/${p.id}/members`, { email, role }), "Member added"); }}>
          <input data-testid="member-email-input" required placeholder="registered user email" className={`${inputCls} max-w-xs`} value={email} onChange={(e) => setEmail(e.target.value)} />
          <select data-testid="member-role-select" className={`${inputCls} w-36`} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="approver">approver</option><option value="engineer">engineer</option><option value="viewer">viewer</option>
          </select>
          <Btn type="submit" loading={busy === "m"} data-testid="member-add-btn">Add</Btn>
        </form>
      )}
      <p className="mt-4 text-[11px] text-slate-500">Owners and approvers can approve and attest. Engineers can add evidence, register deployments and verify. Authorisation is enforced by the API.</p>
    </Panel>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { data: p, isLoading, error } = useApi(["project", id], `/projects/${id}`);
  const { data: releases = [] } = useApi(["releases", id], `/projects/${id}/releases`);
  const { data: deps = [] } = useApi(["deployments", id], `/projects/${id}/deployments`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error="Project not found or access denied." />;
  const canWrite = ["owner", "approver", "engineer"].includes(p.my_role);
  return (
    <div data-testid="project-detail-page">
      <PageHeader eyebrow="Project" title={p.name} description={p.description} actions={<>{p.is_demo && <StatusBadge status="DEMO" />}<StatusBadge status="INFO" label={`role: ${p.my_role}`} /></>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {canWrite && <Panel eyebrow="Step 1" title="Create a release"><CreateReleaseForm projectId={id} /></Panel>}
          <Panel title="Releases" bodyClass="p-0">
            <Table head={["Version", "Status", "Commit", "Evidence", "Manifest", "Created"]} testId="project-releases-table">
              {releases.map((r) => (
                <tr key={r.id} className="vx-row">
                  <Td><EntityLink to={`/app/releases/${r.id}`} testId={`release-link-${r.id}`}>{r.version}</EntityLink></Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="font-mono text-[11px]">{r.commit.slice(0, 10)}</Td>
                  <Td className="font-mono text-xs">{r.evidence_ids.length}</Td>
                  <Td className="font-mono text-[11px] text-emerald-300/80">{r.manifest_hash ? r.manifest_hash.slice(0, 18) + "…" : "—"}</Td>
                  <Td className="text-xs text-slate-500">{fmtTime(r.created_at)}</Td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Deployments" bodyClass="p-0">
            <Table head={["Label", "Network", "Release", "Status", "Mode"]}>
              {deps.map((d) => (
                <tr key={d.id} className="vx-row">
                  <Td><EntityLink to={`/app/deployments/${d.id}`}>{d.label}</EntityLink></Td>
                  <Td className="text-xs">{d.network_name}</Td><Td className="font-mono text-xs">{d.release_version}</Td>
                  <Td><StatusBadge status={d.verification_status || "NEVER"} /></Td><Td><StatusBadge status={d.observation_mode || "UNKNOWN"} /></Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Details">
            <KV k="Project ID"><span className="font-mono text-xs">{p.id}</span></KV>
            <KV k="Repository"><span className="font-mono text-xs">{p.repository}</span></KV>
            <KV k="Approvals req.">{p.required_approvals}</KV>
            <KV k="Created">{fmtTime(p.created_at)}</KV>
          </Panel>
          <Members p={p} />
        </div>
      </div>
    </div>
  );
}
