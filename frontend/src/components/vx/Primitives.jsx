import { motion } from "framer-motion";
import { Copy, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TONES = {
  ok: "text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.08]",
  warn: "text-amber-400 border-amber-500/30 bg-amber-500/[0.08]",
  crit: "text-red-400 border-red-500/40 bg-red-500/[0.12]",
  demo: "text-violet-300 border-violet-500/30 bg-violet-500/[0.08]",
  info: "text-sky-400 border-sky-500/30 bg-sky-500/[0.08]",
  muted: "text-slate-400 border-white/10 bg-white/[0.03]",
};
const MAP = {
  LIVE: "ok", CONNECTED: "ok", VERIFIED: "ok", MATCH: "ok", attested: "ok", RESOLVED: "ok", FRESH: "ok",
  OBSERVED_ONCHAIN: "ok", OFFCHAIN_SIGNED: "info", approve: "ok", BASELINE: "info",
  DEMO: "demo", SIMULATED: "demo",
  PARTIAL: "warn", STALE: "warn", sealed: "info", approved: "info", draft: "muted", ACKNOWLEDGED: "warn",
  INVESTIGATING: "warn", MEDIUM: "warn", HIGH: "warn", LOW: "info", INFO: "muted", REVIEW_REQUIRED: "warn",
  DRIFT: "crit", MISMATCH: "crit", CRITICAL: "crit", FAILED: "crit", OPEN: "crit", rejected: "crit", reject: "crit",
  UNAVAILABLE: "muted", UNKNOWN: "muted", UNSUPPORTED: "muted", NEVER: "muted", USER_SUPPLIED: "info",
};
const GRAPH = { ok: "ok", warn: "warn", critical: "crit", pending: "info", unknown: "muted" };

export const toneOf = (s) => MAP[s] || GRAPH[s] || "muted";

export function StatusBadge({ status, label, pulse, className, testId }) {
  const tone = toneOf(status);
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider", TONES[tone], className)}>
      <span className={cn("relative h-1.5 w-1.5 rounded-full bg-current", pulse && "vx-dot-pulse")} />
      {label || String(status ?? "—").replaceAll("_", " ")}
    </span>
  );
}

export function Hash({ value, short = true, className, testId }) {
  if (!value) return <span className="font-mono text-xs text-slate-500">—</span>;
  const shown = short && value.length > 26 ? `${value.slice(0, 16)}…${value.slice(-8)}` : value;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value);
    toast.success(value.startsWith("sha256:") ? "SHA-256 copied to clipboard" : "Copied to clipboard");
  };
  return (
    <button type="button" onClick={copy} title={value} data-testid={testId}
      className={cn("group inline-flex max-w-full items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-950/30 px-2 py-0.5 font-mono text-[11px] tracking-wide text-emerald-300/95 transition-colors duration-150 hover:border-emerald-400/40", className)}>
      <span className="truncate break-all">{shown}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
    </button>
  );
}

export function Panel({ title, eyebrow, action, children, className, testId, bodyClass }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      data-testid={testId} className={cn("vx-panel", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div>
            {eyebrow && <div className="vx-eyebrow mb-1">{eyebrow}</div>}
            {title && <h3 className="text-[15px] font-medium text-slate-100">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClass)}>{children}</div>
    </motion.section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <div className="vx-eyebrow mb-2 text-emerald-400/80">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, testId }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-6 py-12 text-center">
      <Inbox className="mb-3 h-6 w-6 text-slate-600" />
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {children && <div className="mt-1 max-w-md text-xs text-slate-500">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Loading records" }) {
  return (
    <div className="flex items-center gap-2 py-10 font-mono text-xs text-slate-500" data-testid="loading-indicator">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  );
}

export function ErrorNote({ error }) {
  return <div data-testid="error-note" className="rounded border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">{error}</div>;
}

export function KV({ k, children }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-white/[0.05] py-2 text-sm last:border-0">
      <div className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className="min-w-0 break-words text-slate-200">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "muted", testId }) {
  const color = { ok: "text-emerald-400", warn: "text-amber-400", crit: "text-red-400", info: "text-sky-400", muted: "text-slate-100", demo: "text-violet-300" }[tone];
  return (
    <div data-testid={testId} className="vx-panel px-5 py-4">
      <div className="vx-eyebrow">{label}</div>
      <div className={cn("mt-2 font-mono text-2xl font-semibold", color)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
