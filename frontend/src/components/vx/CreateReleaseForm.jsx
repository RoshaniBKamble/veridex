import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAction } from "@/lib/hooks";
import { post } from "@/lib/api";
import { Btn, Field, inputCls } from "@/components/vx/Controls";

export function CreateReleaseForm({ projectId }) {
  const [f, setF] = useState({ version: "", commit: "", branch: "main", notes: "" });
  const { run, busy } = useAction();
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const r = await run("rel", () => post(`/projects/${projectId}/releases`, f), "Release created");
    if (r) nav(`/app/releases/${r.id}`);
  };
  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-4" data-testid="create-release-form">
      <Field label="Version"><input data-testid="release-version-input" required className={inputCls} placeholder="v1.0.0" value={f.version} onChange={set("version")} /></Field>
      <Field label="Commit SHA" hint="7–64 hex characters"><input data-testid="release-commit-input" required pattern="[0-9a-fA-F]{7,64}" className={`${inputCls} font-mono`} value={f.commit} onChange={set("commit")} /></Field>
      <Field label="Branch"><input data-testid="release-branch-input" className={inputCls} value={f.branch} onChange={set("branch")} /></Field>
      <Field label="Notes"><input data-testid="release-notes-input" className={inputCls} value={f.notes} onChange={set("notes")} /></Field>
      <div className="md:col-span-4"><Btn type="submit" variant="primary" icon={Plus} loading={busy === "rel"} data-testid="create-release-submit">Create release</Btn></div>
    </form>
  );
}
