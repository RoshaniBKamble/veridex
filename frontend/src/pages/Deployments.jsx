import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { ago } from "@/lib/api";
import { Empty, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Table, Td } from "@/components/vx/Controls";
import { EntityLink } from "@/components/vx/Workflow";

export default function Deployments() {
  const { projectId } = useAuth();
  const { data = [], isLoading } = useApi(["deployments", projectId], `/projects/${projectId}/deployments`, { refetchInterval: 20000 });
  return (
    <div data-testid="deployments-page">
      <PageHeader eyebrow="Production" title="Deployment verification"
        description="Each deployment carries a versioned expected state. Verification observes the chain and compares field by field. Register new deployments from an attested release." />
      <Panel bodyClass="p-0">
        {isLoading ? <div className="p-5"><Loading /></div> : !data.length ? <div className="p-5"><Empty title="No deployments">Open a release and register a deployment.</Empty></div> : (
          <Table head={["Deployment", "Network", "Release", "Verification", "Mode", "Freshness", "Last observed", "Block / slot"]} testId="deployments-table">
            {data.map((d) => (
              <tr key={d.id} className="vx-row">
                <Td><EntityLink to={`/app/deployments/${d.id}`} testId={`deployment-link-${d.id}`}>{d.label}</EntityLink><div className="mt-1 font-mono text-[10.5px] text-slate-500">{d.address.slice(0, 22)}…</div></Td>
                <Td className="text-xs">{d.network_name}</Td>
                <Td className="font-mono text-xs">{d.release_version}</Td>
                <Td><StatusBadge status={d.verification_status || "NEVER"} pulse={d.verification_status === "DRIFT"} /></Td>
                <Td><StatusBadge status={d.observation_mode || "UNKNOWN"} /></Td>
                <Td><StatusBadge status={d.freshness} /></Td>
                <Td className="font-mono text-[11px] text-slate-500">{ago(d.last_observed_at)}</Td>
                <Td className="font-mono text-[11px] text-slate-500">{d.last_block_ref || "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
