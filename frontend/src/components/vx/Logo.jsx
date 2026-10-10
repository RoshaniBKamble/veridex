export function Logo({ className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="veridex-logo">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <path d="M16 2 L29 9.5 V22.5 L16 30 L3 22.5 V9.5 Z" fill="none" stroke="#10B981" strokeWidth="1.6" />
        <path d="M9 12 L16 22 L23 12" fill="none" stroke="#E2E8F0" strokeWidth="2.2" strokeLinecap="square" />
        <circle cx="16" cy="9" r="1.6" fill="#0EA5E9" />
      </svg>
      <span className="font-['Outfit'] text-[17px] font-semibold tracking-[0.2em] text-slate-50">VERIDEX</span>
    </div>
  );
}
