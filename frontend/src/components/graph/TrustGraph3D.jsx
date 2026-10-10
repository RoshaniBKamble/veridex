import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { STATUS_COLOR, layout3d } from "./graphUtils";

function bounds(pos) {
  const pts = Object.values(pos);
  if (!pts.length) return { cx: 0, cy: 0, halfW: 8, halfH: 4 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, halfW: (maxX - minX) / 2 + 1.4, halfH: (maxY - minY) / 2 + 1.4 };
}

function FitCamera({ b, fitKey, controls }) {
  const { camera, size, scene } = useThree();
  useEffect(() => {
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));
    const dist = Math.max(b.halfH / Math.tan(vFov / 2), b.halfW / (Math.tan(vFov / 2) * aspect)) * 1.08;
    camera.position.set(b.cx, b.cy + dist * 0.12, dist);
    camera.lookAt(b.cx, b.cy, 0);
    camera.updateProjectionMatrix();
    if (scene.fog) { scene.fog.near = dist * 1.15; scene.fog.far = dist * 2.6; }
    if (controls.current) { controls.current.target.set(b.cx, b.cy, 0); controls.current.maxDistance = dist * 2.5; controls.current.update(); }
  }, [b, fitKey, size.width, size.height, camera, scene, controls]);
  return null;
}

function NodeMesh({ n, pos, selected, onPath, onSelect, showLabel }) {
  const ref = useRef();
  const [hover, setHover] = useState(false);
  const c = STATUS_COLOR[n.status] || STATUS_COLOR.unknown;
  const size = n.type === "incident" ? 0.34 : ["release", "deployment", "attestation"].includes(n.type) ? 0.28 : 0.2;
  const above = n.layer % 2 === 1;
  useFrame((s) => {
    if (!ref.current) return;
    const pulse = n.status === "critical" ? 1 + Math.sin(s.clock.elapsedTime * 4) * 0.14 : 1;
    ref.current.scale.setScalar(pulse * (selected || hover ? 1.3 : 1));
    ref.current.rotation.y += 0.004;
  });
  return (
    <group position={pos}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(n); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}>
        <icosahedronGeometry args={[size, 1]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={selected || onPath || hover ? 1.1 : 0.45} roughness={0.35} metalness={0.25} flatShading />
      </mesh>
      {n.demo && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 1.7, 0.014, 8, 48]} />
          <meshBasicMaterial color="#8B5CF6" transparent opacity={0.55} />
        </mesh>
      )}
      {(showLabel || selected || onPath || hover) && (
        <Html center position={[0, above ? size + 0.42 : -size - 0.42, 0]} style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
          <div className={`whitespace-nowrap rounded bg-[#07090D]/75 px-1 font-mono text-[10px] ${n.status === "critical" ? "text-red-300" : selected || hover ? "text-slate-100" : "text-slate-300"}`}>
            {hover || selected ? n.label : n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
          </div>
        </Html>
      )}
    </group>
  );
}

function Edge({ a, b, color, onPath }) {
  const ref = useRef();
  useFrame((_, d) => { if (onPath && ref.current?.material) ref.current.material.dashOffset -= d * 0.8; });
  return <Line ref={ref} points={[a, b]} color={color} lineWidth={onPath ? 2.6 : 1} dashed={onPath} dashSize={0.18} gapSize={0.1} transparent opacity={onPath ? 1 : 0.32} />;
}

export default function TrustGraph3D({ graph, selected, onSelect, path, height = 560, compact, dense, fitKey = 0 }) {
  const pos = useMemo(() => layout3d(graph.nodes), [graph.nodes]);
  const b = useMemo(() => bounds(pos), [pos]);
  const controls = useRef();
  return (
    <div style={{ height }} className="w-full touch-none" data-testid="trust-graph-3d" role="img" aria-label="Trust graph (3D). Drag to orbit, scroll or pinch to zoom, click a node to inspect it.">
      <Canvas camera={{ position: [0, 2.5, compact ? 19 : 17], fov: 50, near: 0.1, far: 400 }} dpr={[1, 1.75]} onPointerMissed={() => onSelect(null)} resize={{ debounce: 100 }}>
        <color attach="background" args={["#07090D"]} />
        <fog attach="fog" args={["#07090D", 18, 36]} />
        <FitCamera b={b} fitKey={fitKey} controls={controls} />
        <ambientLight intensity={0.45} />
        <pointLight position={[0, 8, 10]} intensity={60} color="#9fe7ff" />
        <pointLight position={[-10, -6, -6]} intensity={30} color="#8B5CF6" />
        <gridHelper args={[60, 60, "#1C2331", "#10151e"]} position={[0, -6, 0]} />
        {graph.edges.map((e) => {
          const a = pos[e.source], bb = pos[e.target];
          if (!a || !bb) return null;
          const onP = path.edges.has(`${e.source}>${e.target}`);
          return <Edge key={`${e.source}>${e.target}`} a={a} b={bb} onPath={onP} color={onP ? "#EF4444" : STATUS_COLOR[e.status] || "#334155"} />;
        })}
        {graph.nodes.map((n) => (
          <NodeMesh key={n.id} n={n} pos={pos[n.id]} selected={selected?.id === n.id} onPath={path.nodes.has(n.id)}
            onSelect={onSelect} showLabel={!compact && !dense && ["release", "deployment", "incident", "blockchain"].includes(n.type)} />
        ))}
        <OrbitControls ref={controls} enableDamping dampingFactor={0.08} minDistance={3} maxDistance={80} autoRotate={compact} autoRotateSpeed={0.35} />
      </Canvas>
    </div>
  );
}
