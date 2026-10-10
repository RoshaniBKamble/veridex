export const STATUS_COLOR = { ok: "#10B981", warn: "#F59E0B", critical: "#EF4444", pending: "#0EA5E9", unknown: "#64748B" };

export const TYPE_LABEL = {
  repository: "Repository", commit: "Commit", release: "Release", source_commit: "Source evidence",
  build_artifact: "Build evidence", test_report: "Test evidence", security_review: "Security evidence",
  deployment_manifest: "Deployment plan", other: "Evidence", artifact: "Release manifest", approval: "Approval",
  attestation: "Attestation", deployment: "Deployment", blockchain: "Blockchain", contract: "Contract / program",
  permissions: "Permissions", production: "Production state", incident: "Incident",
};

export const LAYERS = ["Repo", "Commit", "Release", "Evidence", "Manifest", "Approval", "Attestation", "Deployment", "Chain", "Contract", "Authority", "Production", "Incident"];

export function pathSets(graph, focusIncident) {
  const paths = graph?.incident_paths || [];
  const active = focusIncident ? paths.filter((p) => p.incident_id === focusIncident) : paths;
  const nodes = new Set(active.flatMap((p) => p.nodes));
  const edges = new Set();
  active.forEach((p) => p.nodes.forEach((n, i) => i && edges.add(`${p.nodes[i - 1]}>${n}`)));
  return { nodes, edges };
}

export function layout3d(nodes) {
  const byLayer = {};
  nodes.forEach((n) => (byLayer[n.layer] = byLayer[n.layer] || []).push(n));
  const pos = {};
  Object.entries(byLayer).forEach(([layer, list]) => {
    const spacing = Math.min(1.25, 8 / Math.max(1, list.length - 1));
    list.forEach((n, i) => {
      const off = i - (list.length - 1) / 2;
      pos[n.id] = [(Number(layer) - 6) * 2.0, off * spacing, (i % 2 ? 1 : -1) * Math.min(1.4, list.length * 0.12)];
    });
  });
  return pos;
}

export function layout2d(nodes, colW = 132, rowH = 46) {
  const byLayer = {};
  nodes.forEach((n) => (byLayer[n.layer] = byLayer[n.layer] || []).push(n));
  const maxRows = Math.max(1, ...Object.values(byLayer).map((l) => l.length));
  const height = maxRows * rowH + 80;
  const pos = {};
  Object.entries(byLayer).forEach(([layer, list]) => {
    list.forEach((n, i) => {
      pos[n.id] = [50 + Number(layer) * colW, height / 2 + (i - (list.length - 1) / 2) * rowH];
    });
  });
  return { pos, width: 100 + 12 * colW, height };
}
