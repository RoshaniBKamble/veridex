import { useMemo } from "react";
import { LAYERS, STATUS_COLOR, layout2d } from "./graphUtils";

export default function TrustGraph2D({ graph, selected, onSelect, path, height = 560 }) {
  const { pos, width, height: h } = useMemo(() => layout2d(graph.nodes), [graph.nodes]);
  return (
    <div className="w-full overflow-auto pt-10" style={{ maxHeight: height }} data-testid="trust-graph-2d">
      <div className="px-3 pb-1 font-mono text-[10px] text-slate-500 sm:hidden">Scroll horizontally to explore all layers →</div>
      <svg viewBox={`0 0 ${width} ${h + 30}`} width={width} height={h + 30} className="block max-w-none" role="img" aria-label="Trust graph (2D)">
        <style>{`@keyframes vxdash{to{stroke-dashoffset:-20}} .vx-path{stroke-dasharray:6 4;animation:vxdash .8s linear infinite}`}</style>
        {LAYERS.map((l, i) => (
          <text key={l} x={50 + i * 132} y={18} textAnchor="middle" className="fill-slate-500 font-mono" fontSize="9" letterSpacing="1.5">{l.toUpperCase()}</text>
        ))}
        {graph.edges.map((e) => {
          const a = pos[e.source], b = pos[e.target];
          if (!a || !b) return null;
          const onP = path.edges.has(`${e.source}>${e.target}`);
          const mx = (a[0] + b[0]) / 2;
          return <path key={`${e.source}>${e.target}`} d={`M${a[0]},${a[1] + 20} C${mx},${a[1] + 20} ${mx},${b[1] + 20} ${b[0]},${b[1] + 20}`}
            fill="none" stroke={onP ? "#EF4444" : STATUS_COLOR[e.status] || "#334155"} strokeOpacity={onP ? 1 : 0.35} strokeWidth={onP ? 2 : 1} className={onP ? "vx-path" : ""} />;
        })}
        {graph.nodes.map((n) => {
          const [x, y] = pos[n.id];
          const c = STATUS_COLOR[n.status] || STATUS_COLOR.unknown;
          const sel = selected?.id === n.id;
          return (
            <g key={n.id} transform={`translate(${x},${y + 20})`} onClick={() => onSelect(n)} className="cursor-pointer" data-testid={`graph2d-node-${n.id}`}
              tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(n)} role="button" aria-label={`${n.type} ${n.label}`}>
              <title>{`${n.label} · ${n.status}`}</title>
              {n.demo && <circle r={12} fill="none" stroke="#8B5CF6" strokeOpacity={0.6} strokeDasharray="2 2" />}
              <circle r={sel ? 9 : 7} fill={c} fillOpacity={0.2} stroke={c} strokeWidth={sel ? 2.5 : 1.5} />
              <text y={22} textAnchor="middle" fontSize="9" className={n.status === "critical" ? "fill-red-300 font-mono" : "fill-slate-300 font-mono"}>
                {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
