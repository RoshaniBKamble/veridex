import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { ago } from "@/lib/api";
import { Empty, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Table, Td } from "@/components/vx/Controls";
import { EntityLink } from "@/components/vx/Workflow";

export default function Permissions() {
  const { projectId } = useAuth();
  const { data = [], isLoading } = useApi(["permissions", projectId], `/projects/${projectId}/permissions`);
  return (
    <div data-testid="permissions-page">
      <PageHeader eyebrow="Authority intelligence" title="Permissions & privileged authority"
        description="Only values observed onchain (or in the simulator) are recorded, each with its source and timestamp. Expected values are configured expectations. A change is a reviewable event, not proof of compromise." />
      <Panel bodyClass="p-0">
        {isLoading ? <div className="p-5"><Loading /></div> : !data.length ? <div className="p-5"><Empty title="No authority observations yet" /></div> : (
          <Table head={["Deployment", "Authority", "Observed", "Previous", "Expected (configured)", "Verification", "Review", "Observed at"]} testId="permissions-table">
            {data.map((p) => (
              <tr key={p.id} className="vx-row">
                <Td><EntityLink to={`/app/deployments/${p.deployment_id}`}>{p.deployment_label?.slice(0, 26)}</EntityLink></Td>
                <Td className="font-mono text-xs">{p.field}</Td>
                <Td className="max-w-[180px] break-all font-mono text-[11px]">{p.value}</Td>
                <Td className="max-w-[160px] break-all font-mono text-[11px] text-slate-500">{p.previous || "—"}</Td>
                <Td className="max-w-[160px] break-all font-mono text-[11px] text-slate-400">{p.expected || "not configured"}</Td>
                <Td><StatusBadge status={p.verification === "SIMULATED" ? "SIMULATED" : "OBSERVED_ONCHAIN"} label={p.verification.replace("_", " ")} /></Td>
                <Td><StatusBadge status={p.review_status} /></Td>
                <Td className="font-mono text-[11px] text-slate-500">{ago(p.observed_at)}<div className="text-[10px]">{p.source}</div></Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
