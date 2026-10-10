import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity, AlertOctagon, Boxes, Cable, FileCheck2, FlaskConical, Gauge, KeyRound, LogOut,
  Menu, Network, Rocket, Settings as Cog, ShieldCheck, Siren, TerminalSquare, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/lib/hooks";
import { Logo } from "@/components/vx/Logo";
import { DriftBanner } from "@/components/vx/DriftBanner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOGOUT } from "@/constants/testIds";
import { cn } from "@/lib/utils";

const NAV = [
  ["Command", [["founder", "Founder cockpit", Gauge, "nav-founder-cockpit"], ["developer", "Developer ops", TerminalSquare, "nav-developer-ops"], ["demo", "Demo environment", FlaskConical, "nav-demo"]]],
  ["Provenance", [["projects", "Projects", Boxes, "nav-projects"], ["releases", "Releases & evidence", FileCheck2, "nav-releases"], ["graph", "Trust graph", Network, "nav-trust-graph"]]],
  ["Production", [["deployments", "Deployments", Rocket, "nav-deployments"], ["permissions", "Permissions", KeyRound, "nav-permissions"], ["integrations", "Integrations", Cable, "nav-integrations"]]],
  ["Response", [["drift", "Drift events", Activity, "nav-drift"], ["findings", "Findings", ShieldCheck, "nav-findings"], ["incidents", "Incidents", Siren, "nav-incidents"]]],
  ["System", [["settings", "Settings", Cog, "nav-settings"]]],
];

function Sidebar({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-6 px-3 py-5">
      {NAV.map(([group, items]) => (
        <div key={group}>
          <div className="vx-eyebrow mb-2 px-3 text-[10px]">{group}</div>
          {items.map(([to, label, Icon, tid]) => (
            <NavLink key={to} to={`/app/${to}`} data-testid={tid} onClick={onNavigate}
              className={({ isActive }) => cn("group flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors duration-150",
                isActive ? "bg-emerald-500/[0.08] text-emerald-300" : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200")}>
              <Icon className="h-4 w-4 opacity-80" /> {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function ProjectSwitcher() {
  const { projectId, setProjectId } = useAuth();
  const { data = [] } = useApi("projects", "/projects");
  const current = data.find((p) => p.id === projectId);
  return (
    <Select value={projectId} onValueChange={setProjectId}>
      <SelectTrigger data-testid="project-switcher" aria-label="Active project" title={current ? `${current.name}${current.is_demo ? " · DEMO" : ""}` : undefined}
        className="h-9 w-[200px] min-w-0 border-white/10 bg-[#0B0E14] font-mono text-xs sm:w-[290px] [&>span]:truncate">
        <SelectValue placeholder="Select project" />
      </SelectTrigger>
      <SelectContent className="border-white/10 bg-[#10141D]">
        {data.map((p) => (
          <SelectItem key={p.id} value={p.id} data-testid={`project-option-${p.id}`} className="text-xs">
            {p.name}{p.is_demo ? " · DEMO" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function AppShell() {
  const { user, signOut, projectId } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: incidents = [] } = useApi(["incidents", projectId], `/projects/${projectId}/incidents`, { refetchInterval: 15000, retry: false });
  const openCount = incidents.filter((i) => i.status !== "RESOLVED").length;

  return (
    <div className="min-h-screen bg-[#07090D] text-slate-200">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 overflow-y-auto border-r border-white/[0.07] bg-[#0B0E14] lg:block">
        <div className="flex h-16 items-center border-b border-white/[0.07] px-6"><Logo /></div>
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 overflow-y-auto border-r border-white/10 bg-[#0B0E14]" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-between px-5"><Logo /><button data-testid="mobile-nav-close" aria-label="Close navigation" onClick={() => setOpen(false)} className="rounded p-1 text-slate-300 hover:text-white"><X className="h-5 w-5" /></button></div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B0E14]/90 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="lg:hidden" data-testid="mobile-nav-open" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <ProjectSwitcher />
            <button data-testid="topbar-incidents" onClick={() => nav("/app/incidents")} aria-label={`${openCount} open incidents`}
              className={cn("ml-auto flex shrink-0 items-center gap-2 rounded border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider sm:px-3",
                openCount ? "border-red-500/40 text-red-300" : "border-white/10 text-slate-500")}>
              <AlertOctagon className="h-3.5 w-3.5" /> {openCount}<span className="hidden sm:inline"> open incident{openCount === 1 ? "" : "s"}</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="hidden text-right md:block">
                <div className="text-xs text-slate-200" data-testid="current-user-name">{user?.name}</div>
                <div className="font-mono text-[10px] text-slate-500">{user?.email}</div>
              </div>
              <button data-testid={LOGOUT.button} onClick={async () => { await signOut(); nav("/"); }}
                className="rounded border border-white/10 p-2 text-slate-400 transition-colors duration-150 hover:text-slate-100" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          <DriftBanner incidents={incidents} />
        </header>
        <main className="vx-grid min-h-[calc(100vh-4rem)] overflow-x-clip px-4 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto min-w-0 max-w-[1400px]"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}

