import { Link } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { ago } from "@/lib/api";
import { Empty, ErrorNote, Loading, PageHeader, Panel, Stat, StatusBadge } from "@/components/vx/Primitives";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function TrustScore({ trust }) {
  const s = trust.score;
  const tone = s == null ? "text-slate-400" : s >= 85 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <Panel eyebrow="Composite" title="Trust posture" testId="trust-score-panel"
      action={<TooltipProvider><Tooltip><TooltipTrigger aria-label="How it is calculated"><Info className="h-4 w-4 text-slate-500" /></TooltipTrigger>
        <TooltipContent className="max-w-xs border-white/10 bg-[#161B26] text-xs">{trust.formula}. {trust.disclaimer}</TooltipContent></Tooltip></TooltipProvider>}>
      <div className="flex items-end gap-3">
        <div data-testid="trust-score-metric" className={cn("font-mono text-5xl font-semibold", tone)}>{s == null ? "—" : s}</div>
        <div className="pb-2 font-mono text-xs text-slate-500">/ 100</div>
      </div>
      <div className="mt-6 space-y-3">
        {trust.components.map((c) => (
          <div key={c.key} data-testid={`trust-component-${c.key}`}>
            <div className="flex justify-between text-xs"><span className="text-slate-300">{c.label}</span><span className="font-mono text-slate-400">{c.points} / {c.weight}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-white/[0.05]">
              <div className={cn("h-full rounded transition-[width] duration-700", c.value >= 0.85 ? "bg-emerald-500" : c.value >= 0.5 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${c.value * 100}%` }} />
            </div>
            <div className="mt-1 text-[11px] leading-snug text-slate-500">{c.explain}</div>
          </div>
        ))}
      </div>
      <p className="mt-5 border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">{trust.disclaimer}</p>
    </Panel>
  );
}

export default function Founder() {
  const { projectId } = useAuth();
  const { data, isLoading, error } = useApi(["overview", projectId], `/projects/${projectId}/overview`, { refetchInterval: 20000 });
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error="Could not load overview. Select a project you have access to." />;
  const f = data.findings_by_severity;
  return (
    <div data-testid="founder-page">
      <PageHeader eyebrow="Founder / CTO command center" title={data.project.name}
        description="Is production running exactly what your team approved? Business-readable posture derived from the same records engineers inspect."
        actions={data.project.is_demo && <StatusBadge status="DEMO" label="Demo project" />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open incidents" value={data.open_incidents.length} tone={data.open_incidents.length ? "crit" : "ok"} testId="stat-open-incidents" sub="Linked to drift events" />
        <Stat label="Open drift events" value={data.open_drift} tone={data.open_drift ? "crit" : "ok"} testId="stat-open-drift" />
        <Stat label="Open findings" value={data.open_findings} tone={f.CRITICAL ? "crit" : data.open_findings ? "warn" : "ok"} testId="stat-open-findings" sub={Object.entries(f).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(" · ") || "none"} />
        <Stat label="Verification freshness" value={`${data.freshness.FRESH}/${data.deployments.length}`} tone={data.freshness.STALE || data.freshness.NEVER ? "warn" : "ok"} testId="stat-freshness" sub="Deployments observed within window" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <TrustScore trust={data.trust} />
        <div className="space-y-6">
          <Panel eyebrow="What to do next" title="Recommended actions" testId="recommended-actions">
            {data.recommended_actions.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {data.recommended_actions.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <StatusBadge status={a.priority} />
                    <Link to={a.link} className="flex-1 text-sm text-slate-200 hover:text-emerald-300">{a.text}</Link>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                  </li>
                ))}
              </ul>
            ) : <Empty title="Nothing requires action">All deployments verified and fresh.</Empty>}
          </Panel>
          <Panel eyebrow="Production" title="Deployment health" testId="deployment-health">
            <div className="grid gap-3 md:grid-cols-2">
              {data.deployments.map((d) => (
                <Link key={d.id} to={`/app/deployments/${d.id}`} data-testid={`founder-deployment-${d.id}`}
                  className={cn("rounded-md border p-4 transition-colors duration-150 hover:bg-white/[0.02]", d.verification_status === "DRIFT" ? "border-red-500/40" : "border-white/[0.07]")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm text-slate-100">{d.label}</div>
                    <StatusBadge status={d.verification_status || "NEVER"} pulse={d.verification_status === "DRIFT"} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10.5px] text-slate-500">
                    <span>{d.network_name}</span><span>· release {d.release_version}</span><span>· {ago(d.last_observed_at)}</span>
                  </div>
                  <div className="mt-2 flex gap-2"><StatusBadge status={d.observation_mode || "UNKNOWN"} /><StatusBadge status={d.freshness} /></div>
                </Link>
              ))}
            </div>
          </Panel>
          <Panel eyebrow="Releases" title="Recent releases">
            <div className="flex flex-wrap gap-3">
              {data.recent_releases.map((r) => (
                <Link key={r.id} to={`/app/releases/${r.id}`} className="rounded-md border border-white/[0.07] px-4 py-3 transition-colors duration-150 hover:border-white/20">
                  <div className="font-mono text-sm text-slate-100">{r.version}</div>
                  <div className="mt-1.5"><StatusBadge status={r.status} /></div>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
