import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const V = {
  primary: "bg-emerald-500 text-[#04120c] hover:bg-emerald-400 border-emerald-400",
  outline: "border-white/15 text-slate-200 hover:border-white/30 hover:bg-white/[0.04]",
  danger: "border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  demo: "border-violet-500/50 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
  ghost: "border-transparent text-slate-400 hover:text-slate-100",
};

export function Btn({ variant = "outline", loading, icon: Icon, children, className, ...rest }) {
  return (
    <button {...rest} disabled={loading || rest.disabled}
      className={cn("inline-flex items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50", V[variant], className)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Table({ head, children, testId }) {
  const ref = useRef(null);
  const [scroll, setScroll] = useState({ can: false, atEnd: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScroll({ can: el.scrollWidth > el.clientWidth + 2, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", measure); };
  }, [children]);
  return (
    <div className="relative">
      <div ref={ref} className="overflow-x-auto" data-testid={testId} data-scrollable={scroll.can || undefined}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07]">
              {head.map((h, i) => <th key={h || i} className="whitespace-nowrap px-3 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-slate-500">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
        </table>
      </div>
      {scroll.can && !scroll.atEnd && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#10141D] to-transparent" />
      )}
      {scroll.can && <div className="px-3 py-1.5 font-mono text-[10px] text-slate-600" data-testid="table-scroll-hint">Scroll horizontally for more columns →</div>}
    </div>
  );
}

export const Td = ({ children, className, ...r }) => <td {...r} className={cn("px-2.5 py-3 align-top text-slate-300", className)}>{children}</td>;

export function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-md border border-white/10 bg-[#0B0E14] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors duration-150 focus:border-emerald-500/50 focus:outline-none";
