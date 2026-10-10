import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ArrowRight } from "lucide-react";

export function DriftBanner({ incidents = [] }) {
  const crit = incidents.find((i) => i.severity === "CRITICAL" && i.status !== "RESOLVED");
  return (
    <AnimatePresence>
      {crit && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          data-testid="critical-drift-banner" role="alert"
          className="vx-scan relative overflow-hidden border-b border-red-500/40 bg-[#1a0b0d]">
          <div className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <div className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-red-400">
                  Critical production drift {crit.simulated && <span className="ml-2 rounded border border-violet-500/40 px-1.5 py-px text-[10px] text-violet-300">SIMULATED</span>}
                </div>
                <div className="text-sm text-red-100/90">Production no longer matches the approved state. <span className="text-red-200/60">{crit.number} · {crit.summary}</span></div>
              </div>
            </div>
            <Link to={`/app/incidents/${crit.id}`} data-testid="drift-banner-open-incident"
              className="inline-flex shrink-0 items-center gap-1.5 rounded border border-red-500/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-red-200 transition-colors duration-150 hover:bg-red-500/10">
              Open incident <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
