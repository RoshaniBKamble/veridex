import { useState } from "react";
import { Radar } from "lucide-react";
import { useAction } from "@/lib/hooks";
import { post } from "@/lib/api";
import { Btn, Field, inputCls } from "@/components/vx/Controls";

const NETS = [["ethereum-mainnet", "Ethereum Mainnet"], ["solana-mainnet", "Solana Mainnet-Beta"], ["base-mainnet", "Base (needs BASE_RPC_URL)"], ["arbitrum-one", "Arbitrum One (needs ARBITRUM_RPC_URL)"]];

export function RegisterDeployment({ release }) {
  const [f, setF] = useState({ network: "ethereum-mainnet", address: "", label: "", baseline: true, expected: "" });
  const [err, setErr] = useState("");
  const { run, busy } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    let expected = null;
    if (f.expected.trim()) {
      try { expected = JSON.parse(f.expected); } catch (ex) { return setErr(`Expected state must be JSON: ${ex.message}`); }
    }
    await run("dep", () => post(`/releases/${release.id}/deployments`, { network: f.network, address: f.address.trim(), label: f.label, expected, baseline_from_observation: f.baseline }),
      (d) => `Deployment registered · ${d.verification_status}`);
  };
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="register-deployment-form">
      <div className="vx-eyebrow">Register deployment</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Network">
          <select data-testid="deployment-network-select" className={inputCls} value={f.network} onChange={set("network")}>
            {NETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Address / program ID"><input data-testid="deployment-address-input" required className={`${inputCls} font-mono text-xs`} value={f.address} onChange={set("address")} /></Field>
        <Field label="Label"><input data-testid="deployment-label-input" required minLength={2} className={inputCls} value={f.label} onChange={set("label")} /></Field>
      </div>
      <Field label="Declared expected state (optional JSON)" hint='e.g. {"owner":"0x…","implementation":"0x…"}. Declared values override the baseline.'>
        <textarea data-testid="deployment-expected-input" rows={2} className={`${inputCls} font-mono text-xs`} value={f.expected} onChange={set("expected")} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" data-testid="deployment-baseline-checkbox" checked={f.baseline} onChange={set("baseline")} className="accent-emerald-500" />
        Baseline remaining fields from the current live observation (trust-on-first-use — labelled as such)
      </label>
      {err && <div className="text-xs text-red-300">{err}</div>}
      <Btn type="submit" variant="primary" icon={Radar} loading={busy === "dep"} data-testid="register-deployment-submit">Register & verify</Btn>
    </form>
  );
}
