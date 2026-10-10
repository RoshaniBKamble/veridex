import { Component, lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Layers } from "lucide-react";
import { StatusBadge, Hash } from "@/components/vx/Primitives";
import TrustGraph2D from "./TrustGraph2D";
import { STATUS_COLOR, TYPE_LABEL, pathSets } from "./graphUtils";
import { cn } from "@/lib/utils";

const TrustGraph3D = lazy(() => import("./TrustGraph3D"));

const webglOk = () => {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
};

class GLBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-slate-500">
      {[["ok", "Verified"], ["pending", "Pending"], ["warn", "Partial"], ["critical", "Drift / failed"], ["unknown", "Unavailable"]].map(([k, l]) => (
        <span key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[k] }} />{l}</span>
      ))}
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-violet-400" />Demo record</span>
    </div>
  );
}

function NodeDetail({ node, interactive }) {
  if (!node) return <div className="text-xs leading-relaxed text-slate-500">Select a node to inspect the stored record behind it. Red dashed edges trace the path from approved release to an open incident.</div>;
  return (
    <div className="space-y-3" data-testid="graph-node-detail">
      <div className="vx-eyebrow">{TYPE_LABEL[node.type] || node.type}</div>
      <div className="text-sm font-medium text-slate-100">{node.label}</div>
      <div className="flex flex-wrap gap-2"><StatusBadge status={node.status} />{node.demo && <StatusBadge status="DEMO" />}</div>
      {node.sub && (node.sub.startsWith("sha256") ? <Hash value={node.sub.replace("…", "")} /> : <div className="break-all font-mono text-[11px] text-slate-400">{node.sub}</div>)}
      {interactive && node.link && <Link to={node.link} data-testid="graph-node-open-link" className="vx-link inline-block font-mono text-xs">Open record →</Link>}
    </div>
  );
}

export function TrustGraph({ graph, height = 560, compact = false, interactive = true }) {
  const [mode, setMode] = useState(() => (webglOk() ? "3d" : "2d"));
  const [selected, setSelected] = useState(null);
  const path = useMemo(() => pathSets(graph), [graph]);
  const fallback = <TrustGraph2D graph={graph} selected={selected} onSelect={setSelected} path={path} height={height} />;
  return (
    <div className={cn("grid gap-4", !compact && "xl:grid-cols-[1fr_280px]")} data-testid="trust-graph">
      <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-[#07090D]">
        <div className="absolute left-3 top-3 z-10 flex rounded border border-white/10 bg-[#0B0E14]/90 p-0.5 backdrop-blur">
          {[["3d", Box, "3D"], ["2d", Layers, "2D"]].map(([m, Icon, l]) => (
            <button key={m} data-testid={`graph-mode-${m}`} onClick={() => setMode(m)} disabled={m === "3d" && !webglOk()}
              className={cn("flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors duration-150 disabled:opacity-30",
                mode === m ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-slate-200")}>
              <Icon className="h-3 w-3" />{l}
            </button>
          ))}
        </div>
        {path.nodes.size > 0 && (
          <div className="absolute right-3 top-3 z-10 rounded border border-red-500/40 bg-red-950/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-red-300" data-testid="graph-incident-path-indicator">
            Incident path highlighted
          </div>
        )}
        {mode === "3d" ? (
          <GLBoundary fallback={fallback}>
            <Suspense fallback={<div style={{ height }} className="grid place-items-center font-mono text-xs text-slate-500">Initialising WebGL…</div>}>
              <TrustGraph3D graph={graph} selected={selected} onSelect={setSelected} path={path} height={height} compact={compact} />
            </Suspense>
          </GLBoundary>
        ) : fallback}
        <div className="border-t border-white/[0.06] px-4 py-2.5"><Legend /></div>
      </div>
      {!compact && <div className="vx-panel p-5"><NodeDetail node={selected} interactive={interactive} /></div>}
      {compact && selected && <div className="vx-panel p-4"><NodeDetail node={selected} interactive={interactive} /></div>}
    </div>
  );
}
