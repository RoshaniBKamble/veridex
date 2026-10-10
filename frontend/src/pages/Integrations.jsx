import { useState } from "react";
import { RefreshCcw, ScanSearch } from "lucide-react";
import { useAction, useApi } from "@/lib/hooks";
import { ago, post } from "@/lib/api";
import { Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Field, inputCls } from "@/components/vx/Controls";

function Inspector({ networks }) {
  const [nid, setNid] = useState("ethereum-mainnet");
  const [addr, setAddr] = useState("0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2");
  const [res, setRes] = useState(null);
  const { run, busy } = useAction();
  return (
    <Panel eyebrow="Read-only" title="Live state inspector" testId="live-inspector">
      <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
        <Field label="Network">
          <select data-testid="inspector-network-select" className={inputCls} value={nid} onChange={(e) => { setNid(e.target.value); setAddr(e.target.value === "solana-mainnet" ? "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" : ""); }}>
            {networks.filter((n) => n.family !== "demo-evm").map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </Field>
        <Field label="Address / program ID"><input data-testid="inspector-address-input" className={`${inputCls} font-mono text-xs`} value={addr} onChange={(e) => setAddr(e.target.value)} /></Field>
        <Btn variant="primary" icon={ScanSearch} loading={busy === "i"} data-testid="inspector-run-btn" onClick={async () => setRes(await run("i", () => post(`/networks/${nid}/inspect`, { address: addr.trim() })))}>Inspect</Btn>
      </div>
      {res && (
        <div className="mt-5 rounded border border-white/[0.07]" data-testid="inspector-result">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 font-mono text-[11px] text-slate-400">
            <StatusBadge status={res.mode} /> {res.block_ref} {res.rpc_host && `· via ${res.rpc_host}`} {res.error && <span className="text-amber-300">{res.error}</span>}
          </div>
          {Object.entries(res.fields).map(([k, f]) => (
            <div key={k} className="grid grid-cols-[180px_1fr_auto] gap-3 border-b border-white/[0.04] px-4 py-2 text-xs last:border-0">
              <span className="font-mono text-slate-400">{k}</span>
              <span className="break-all font-mono text-[11px] text-slate-200">{f.value ?? "—"}<span className="block text-[10px] text-slate-500">{f.source}</span></span>
              <StatusBadge status={f.status === "OBSERVED" ? "LIVE" : f.status} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function Integrations() {
  const { data = [], isLoading } = useApi("networks", "/networks");
  const { run, busy } = useAction();
  return (
    <div data-testid="integrations-page">
      <PageHeader eyebrow="Blockchain adapters" title="Integrations"
        description="Each adapter reports exactly what it can observe. Unconfigured networks are UNAVAILABLE, never assumed healthy."
        actions={<Btn icon={RefreshCcw} loading={busy === "c"} data-testid="check-networks-btn" onClick={() => run("c", () => post("/networks/check"), "Connectivity re-checked")}>Check all</Btn>} />
      {isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((n) => (
            <Panel key={n.id} eyebrow={n.family} title={n.name} testId={`network-card-${n.id}`} action={<StatusBadge status={n.label} pulse={n.label === "LIVE"} />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px] text-slate-400">
                <span>Env var</span><span className="text-slate-200">{n.env_var || "—"}</span>
                <span>RPC host</span><span className="text-slate-200">{n.rpc_host || "not configured"}</span>
                <span>Identity</span><span className="text-slate-200">{n.expected_identity}</span>
                <span>Last success</span><span className="text-slate-200">{ago(n.last_success_at)} {n.last_ref && `· ${n.last_ref}`}</span>
                <span>Latency</span><span className="text-slate-200">{n.latency_ms != null ? `${n.latency_ms} ms` : "—"}</span>
              </div>
              {n.last_error && <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200">{n.last_error}</div>}
              {n.setup && <div className="mt-3 rounded border border-white/10 px-3 py-2 text-[11px] text-slate-400">Setup: {n.setup}</div>}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><div className="vx-eyebrow mb-1.5">Supported checks</div>{n.supported_checks.map((c) => <div key={c} className="font-mono text-[11px] text-emerald-300/80">✓ {c}</div>)}</div>
                <div><div className="vx-eyebrow mb-1.5">Not supported</div>{n.unsupported_checks.map((c) => <div key={c} className="text-[11px] text-slate-500">— {c}</div>)}</div>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <div className="mt-6"><Inspector networks={data} /></div>
    </div>
  );
}
