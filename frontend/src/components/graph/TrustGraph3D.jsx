import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { STATUS_COLOR, layout3d } from "./graphUtils";

function NodeMesh({ n, pos, selected, onPath, onSelect, showLabel }) {
  const ref = useRef();
  const c = STATUS_COLOR[n.status] || STATUS_COLOR.unknown;
  const size = n.type === "incident" ? 0.34 : ["release", "deployment", "attestation"].includes(n.type) ? 0.28 : 0.2;
  useFrame((s) => {
    if (!ref.current) return;
    const pulse = n.status === "critical" ? 1 + Math.sin(s.clock.elapsedTime * 4) * 0.14 : 1;
    ref.current.scale.setScalar(pulse * (selected ? 1.3 : 1));
    ref.current.rotation.y += 0.004;
  });
  return (
    <group position={pos}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(n); }}
        onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "auto")}>
        <icosahedronGeometry args={[size, 1]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={selected || onPath ? 1.1 : 0.45} roughness={0.35} metalness={0.25} flatShading />
      </mesh>
      {n.demo && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 1.7, 0.014, 8, 48]} />
          <meshBasicMaterial color="#8B5CF6" transparent opacity={0.55} />
        </mesh>
      )}
      {(showLabel || selected || onPath) && (
        <Html center distanceFactor={10} position={[0, -size - 0.34, 0]} style={{ pointerEvents: "none" }}>
          <div className={`whitespace-nowrap font-mono text-[10px] ${n.status === "critical" ? "text-red-300" : "text-slate-300"}`}>{n.label}</div>
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

export default function TrustGraph3D({ graph, selected, onSelect, path, height = 560, compact }) {
  const pos = useMemo(() => layout3d(graph.nodes), [graph.nodes]);
  return (
    <div style={{ height }} className="w-full" data-testid="trust-graph-3d">
      <Canvas camera={{ position: [0, 2.5, compact ? 19 : 17], fov: 50 }} dpr={[1, 1.75]} onPointerMissed={() => onSelect(null)}>
        <color attach="background" args={["#07090D"]} />
        <fog attach="fog" args={["#07090D", 18, 36]} />
        <ambientLight intensity={0.45} />
        <pointLight position={[0, 8, 10]} intensity={60} color="#9fe7ff" />
        <pointLight position={[-10, -6, -6]} intensity={30} color="#8B5CF6" />
        <gridHelper args={[44, 44, "#1C2331", "#10151e"]} position={[0, -6, 0]} />
        {graph.edges.map((e) => {
          const a = pos[e.source], b = pos[e.target];
          if (!a || !b) return null;
          const onP = path.edges.has(`${e.source}>${e.target}`);
          return <Edge key={`${e.source}>${e.target}`} a={a} b={b} onPath={onP} color={onP ? "#EF4444" : STATUS_COLOR[e.status] || "#334155"} />;
        })}
        {graph.nodes.map((n) => (
          <NodeMesh key={n.id} n={n} pos={pos[n.id]} selected={selected?.id === n.id} onPath={path.nodes.has(n.id)}
            onSelect={onSelect} showLabel={!compact && ["release", "deployment", "attestation", "incident", "blockchain", "production"].includes(n.type)} />
        ))}
        <OrbitControls enableDamping dampingFactor={0.08} minDistance={5} maxDistance={30} autoRotate={compact} autoRotateSpeed={0.35} />
      </Canvas>
    </div>
  );
}
