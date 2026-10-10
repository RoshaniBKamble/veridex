import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { fmtTime } from "@/lib/api";
import { Empty, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Table, Td } from "@/components/vx/Controls";
import { EntityLink } from "@/components/vx/Workflow";

export default function Incidents() {
  const { projectId } = useAuth();
  const { data = [], isLoading } = useApi(["incidents", projectId], `/projects/${projectId}/incidents`, { refetchInterval: 15000 });
  return (
    <div data-testid="incidents-page">
      <PageHeader eyebrow="Response" title="Incident center"
        description="Incidents are created automatically for CRITICAL or HIGH drift — at most one open incident per deployment. Each links release, attestation, evidence, drift events and the observation." />
      <Panel bodyClass="p-0">
        {isLoading ? <div className="p-5"><Loading /></div> : !data.length ? <div className="p-5"><Empty title="No incidents" /></div> : (
          <Table head={["Incident", "Severity", "Status", "Title", "Drift events", "Opened", "Updated"]} testId="incidents-table">
            {data.map((i) => (
              <tr key={i.id} className="vx-row">
                <Td><EntityLink to={`/app/incidents/${i.id}`} testId={`incident-link-${i.number}`}>{i.number}</EntityLink>{i.simulated && <StatusBadge status="SIMULATED" className="ml-2" />}</Td>
                <Td><StatusBadge status={i.severity} /></Td>
                <Td><StatusBadge status={i.status} pulse={i.status === "OPEN"} /></Td>
                <Td className="text-xs text-slate-200"><div className="min-w-[180px] max-w-[360px]">{i.title}</div></Td>
                <Td className="font-mono text-xs">{i.drift_event_ids.length}</Td>
                <Td className="text-xs text-slate-500">{fmtTime(i.created_at)}</Td>
                <Td className="text-xs text-slate-500">{fmtTime(i.updated_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
