import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { fmtTime } from "@/lib/api";
import { Empty, Hash, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Table, Td } from "@/components/vx/Controls";
import { EntityLink } from "@/components/vx/Workflow";
import { CreateReleaseForm } from "@/components/vx/CreateReleaseForm";

export default function Releases() {
  const { projectId } = useAuth();
  const { data: project } = useApi(["project", projectId], `/projects/${projectId}`);
  const { data = [], isLoading } = useApi(["releases", projectId], `/projects/${projectId}/releases`);
  const canWrite = project && ["owner", "approver", "engineer"].includes(project.my_role);
  return (
    <div data-testid="releases-page">
      <PageHeader eyebrow="Provenance" title="Releases & evidence"
        description="A release moves draft → sealed (manifest hashed) → approved → attested. Evidence becomes immutable once sealed." />
      {canWrite && <Panel eyebrow="New" title="Create a release" className="mb-6"><CreateReleaseForm projectId={projectId} /></Panel>}
      <Panel title="Release history" bodyClass="p-0">
        {isLoading ? <div className="p-5"><Loading /></div> : !data.length ? <div className="p-5"><Empty title="No releases" /></div> : (
          <Table head={["Version", "Status", "Commit", "Branch", "Evidence", "Approvals", "Manifest hash", "Created"]} testId="releases-table">
            {data.map((r) => (
              <tr key={r.id} className="vx-row">
                <Td><EntityLink to={`/app/releases/${r.id}`} testId={`release-row-${r.version}`}>{r.version}</EntityLink></Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="font-mono text-[11px]" title={r.commit}>{r.commit.slice(0, 10)}</Td>
                <Td className="text-xs">{r.branch}</Td>
                <Td className="font-mono text-xs">{r.evidence_ids.length}</Td>
                <Td className="font-mono text-xs">{r.approval_ids.length}</Td>
                <Td>{r.manifest_hash ? <Hash value={r.manifest_hash} /> : <span className="font-mono text-xs text-slate-500">—</span>}</Td>
                <Td className="text-xs text-slate-500">{fmtTime(r.created_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
