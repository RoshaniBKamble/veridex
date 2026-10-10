import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [["draft", "Evidence"], ["sealed", "Sealed manifest"], ["approved", "Approved"], ["attested", "Attested"], ["deployed", "Deployed"], ["verified", "Verified"]];

export function WorkflowStepper({ release, deployments = [] }) {
  const order = ["draft", "sealed", "approved", "attested"];
  let idx = order.indexOf(release?.status);
  if (release?.status === "rejected") idx = 1;
  if (idx === 3 && deployments.length) idx = 4;
  if (idx === 4 && deployments.some((d) => d.verification_status === "VERIFIED")) idx = 5;
  const drift = deployments.some((d) => d.verification_status === "DRIFT");
  return (
    <ol className="grid grid-cols-3 gap-2 md:grid-cols-6" data-testid="workflow-stepper">
      {STEPS.map(([k, label], i) => {
        const done = i < idx || (i === idx && i > 0 && k !== "draft" && i === 5);
        const cur = i === idx;
        const red = drift && i >= 4;
        return (
          <li key={k} className={cn("rounded-md border px-3 py-2.5", red ? "border-red-500/40 bg-red-500/[0.06]" : done || i < idx ? "border-emerald-500/30 bg-emerald-500/[0.05]" : cur ? "border-sky-500/40 bg-sky-500/[0.06]" : "border-white/[0.07]")}>
            <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
              {i < idx ? <Check className="h-3 w-3 text-emerald-400" /> : <span>{String(i + 1).padStart(2, "0")}</span>}
              {red && <span className="text-red-400">DRIFT</span>}
            </div>
            <div className="mt-1 text-xs text-slate-200">{label}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function EntityLink({ to, children, testId }) {
  return <Link to={to} data-testid={testId} className="vx-link font-mono text-xs">{children}</Link>;
}
