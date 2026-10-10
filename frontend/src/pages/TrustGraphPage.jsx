import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { ErrorNote, Loading, PageHeader } from "@/components/vx/Primitives";
import { TrustGraph } from "@/components/graph/TrustGraph";

export default function TrustGraphPage() {
  const { projectId } = useAuth();
  const { data, isLoading, error } = useApi(["graph", projectId], `/projects/${projectId}/graph`, { refetchInterval: 15000 });
  return (
    <div data-testid="trust-graph-page">
      <PageHeader eyebrow="Signature view" title="Trust graph"
        description="Repository → commit → release → evidence → manifest → approval → attestation → deployment → chain → contract → authority → production → incident. Nodes are stored records; colour reflects their current verification status. Drag to orbit, scroll to zoom, click to inspect." />
      {isLoading ? <Loading /> : error ? <ErrorNote error="Could not load graph." /> : <TrustGraph graph={data} height={620} />}
    </div>
  );
}
