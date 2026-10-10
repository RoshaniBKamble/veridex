import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAction, useApi } from "@/lib/hooks";
import { post } from "@/lib/api";
import { Empty, ErrorNote, Loading, PageHeader, Panel, StatusBadge } from "@/components/vx/Primitives";
import { Btn, Field, inputCls } from "@/components/vx/Controls";

function CreateProject({ onDone }) {
  const [f, setF] = useState({ name: "", repository: "", description: "", required_approvals: 1 });
  const { run, busy } = useAction();
  const submit = async (e) => {
    e.preventDefault();
    const p = await run("create", () => post("/projects", { ...f, required_approvals: Number(f.required_approvals) }), "Project registered");
    if (p) onDone(p);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2" data-testid="create-project-form">
      <Field label="Project name"><input data-testid="project-name-input" required minLength={2} className={inputCls} value={f.name} onChange={set("name")} /></Field>
      <Field label="Repository" hint="Reference only — no GitHub connection is made"><input data-testid="project-repo-input" required className={inputCls} placeholder="github.com/org/repo" value={f.repository} onChange={set("repository")} /></Field>
      <Field label="Description"><input data-testid="project-desc-input" className={inputCls} value={f.description} onChange={set("description")} /></Field>
      <Field label="Required approvals"><input data-testid="project-approvals-input" type="number" min={1} max={5} className={inputCls} value={f.required_approvals} onChange={set("required_approvals")} /></Field>
      <div className="md:col-span-2"><Btn type="submit" variant="primary" loading={busy === "create"} data-testid="create-project-submit">Register project</Btn></div>
    </form>
  );
}

export default function Projects() {
  const { data = [], isLoading, error } = useApi("projects", "/projects");
  const [open, setOpen] = useState(false);
  const { setProjectId } = useAuth();
  const nav = useNavigate();
  return (
    <div data-testid="projects-page">
      <PageHeader eyebrow="Workspace" title="Projects" description="Each project groups releases, evidence, deployments and incidents."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setOpen(!open)} data-testid="new-project-btn" aria-expanded={open}>{open ? "Close form" : "New project"}</Btn>} />
      {open && <Panel title="Register a project" className="mb-6"><CreateProject onDone={(p) => { setProjectId(p.id); nav(`/app/projects/${p.id}`); }} /></Panel>}
      {isLoading ? <Loading /> : error ? <ErrorNote error="Could not load projects." /> : !data.length ? <Empty title="No projects yet">Register a project to begin collecting release evidence.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <Link key={p.id} to={`/app/projects/${p.id}`} onClick={() => setProjectId(p.id)} data-testid={`project-card-${p.id}`}
              className="vx-panel block p-6 transition-colors duration-150 hover:border-emerald-500/25">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-medium text-slate-100">{p.name}</h3>
                {p.is_demo && <StatusBadge status="DEMO" />}
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{p.repository}</div>
              <p className="mt-3 line-clamp-2 text-xs text-slate-400" title={p.description || undefined}>{p.description || "No description"}</p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-slate-400">
                <span>{p.release_count} releases</span><span>{p.deployment_count} deployments</span>
                <span className={p.open_incidents ? "text-red-400" : ""}>{p.open_incidents} incidents</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
