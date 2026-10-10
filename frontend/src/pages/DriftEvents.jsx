import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { fmtTime } from "@/lib/api";
import { Empty, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Table, Td } from "@/components/vx/Controls";
import { EntityLink } from "@/components/vx/Workflow";

export default function DriftEvents() {
  const { projectId } = useAuth();
  const { data = [], isLoading } = useApi(["drift", projectId], `/projects/${projectId}/drift-events`, { refetchInterval: 15000 });
  return (
    <div data-testid="drift-page">
      <PageHeader eyebrow="Drift engine" title="Drift events"
        description="One event per (deployment, field, observed value). Repeat observations increment occurrences instead of creating duplicate alerts. UNAVAILABLE or UNSUPPORTED data never produces a drift event." />
      <Panel bodyClass="p-0">
        {isLoading ? <div className="p-5"><Loading /></div> : !data.length ? <div className="p-5"><Empty title="No drift detected">Production matches expected state for every observable field.</Empty></div> : (
          <Table head={["Detected", "Field", "Expected", "Observed", "Severity", "Seen", "Status", "Deployment"]} testId="drift-table">
            {data.map((e) => (
              <tr key={e.id} className="vx-row">
                <Td className="font-mono text-[11px] text-slate-500">{fmtTime(e.detected_at)}</Td>
                <Td className="font-mono text-xs">{e.field}{e.simulated && <StatusBadge status="SIMULATED" className="ml-2" />}</Td>
                <Td className="font-mono text-[11px] text-emerald-300/80"><div className="min-w-[120px] max-w-[200px] break-all">{String(e.expected ?? "—")}</div></Td>
                <Td className="font-mono text-[11px] text-red-300"><div className="min-w-[120px] max-w-[200px] break-all">{String(e.observed ?? "—")}</div></Td>
                <Td><StatusBadge status={e.severity} /></Td>
                <Td className="font-mono text-xs">{e.occurrences}×</Td>
                <Td><StatusBadge status={e.status} /></Td>
                <Td><EntityLink to={`/app/deployments/${e.deployment_id}`}>open</EntityLink></Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
