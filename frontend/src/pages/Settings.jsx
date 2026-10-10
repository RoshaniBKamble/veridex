import { useApi } from "@/lib/hooks";
import { ErrorNote, Hash, KV, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";

export default function Settings() {
  const { data, isLoading, error } = useApi("settings", "/settings");
  if (isLoading) return <Loading />;
  if (error || !data) return <div data-testid="settings-page"><PageHeader eyebrow="System" title="Settings & configuration" /><ErrorNote error="Could not load configuration status from the API." /></div>;
  return (
    <div data-testid="settings-page">
      <PageHeader eyebrow="System" title="Settings & configuration" description="Secrets live only in server-side environment variables. This page shows whether they are set — never their values." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="Attestation signer" title="Ed25519 attestor key">
          <KV k="Key ID"><span className="font-mono text-xs">{data.attestor.key_id}</span></KV>
          <KV k="Public key"><Hash value={data.attestor.public_key} short={false} testId="attestor-public-key" /></KV>
          <KV k="Private key">{data.attestor.private_key_storage}</KV>
        </Panel>
        <Panel eyebrow={data.canonicalization.version} title="Canonicalization rules">
          <ul className="space-y-1.5 text-xs text-slate-300">{data.canonicalization.rules.map((r) => <li key={r}>• {r}</li>)}</ul>
        </Panel>
        <Panel title="Environment" testId="env-status">
          {Object.entries(data.env).map(([k, v]) => <KV key={k} k={k}><StatusBadge status={v ? "CONNECTED" : "UNAVAILABLE"} label={v ? "set" : "not set"} /></KV>)}
          <KV k="Stale after">{data.stale_after_minutes} minutes</KV>
        </Panel>
        <Panel title="AI & contracts">
          <KV k="AI provider"><StatusBadge status={data.ai.configured ? "CONNECTED" : "UNAVAILABLE"} /><span className="font-mono text-[11px] text-slate-400">{data.ai.model}</span></KV>
          <KV k="AI policy">{data.ai.policy}</KV>
          <KV k="Registry"><span className="break-all font-mono text-xs">{data.registry_contract.path}</span></KV>
          <KV k="Status"><StatusBadge status="VERIFIED" label="compiled & unit-tested locally" /><StatusBadge status="UNAVAILABLE" label="not deployed" /></KV>
          <KV k="API docs"><a className="vx-link" href={`${process.env.REACT_APP_BACKEND_URL}/api/docs`} target="_blank" rel="noreferrer">/api/docs (OpenAPI)</a></KV>
        </Panel>
      </div>
    </div>
  );
}
