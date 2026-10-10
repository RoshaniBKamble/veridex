import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/vx/Logo";
import { Btn, Field, inputCls } from "@/components/vx/Controls";
import { LOGIN, REGISTER } from "@/constants/testIds";

export default function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  if (user) return <Navigate to={params.get("next") || "/app/founder"} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && form.password !== form.confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const body = mode === "login" ? { email: form.email, password: form.password } : { name: form.name, email: form.email, password: form.password };
      const { data } = await api.post(`/auth/${mode}`, body);
      signIn(data);
      nav(params.get("next") || (mode === "register" ? "/app/projects" : "/app/founder"));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vx-grid relative grid min-h-screen bg-[#07090D] lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-white/[0.06] p-12 lg:flex">
        <Link to="/"><Logo /></Link>
        <div className="max-w-md">
          <div className="vx-eyebrow mb-4 text-emerald-400/80">Release integrity workflow</div>
          <h2 className="text-3xl font-semibold leading-tight text-slate-50">Is production running exactly what your team approved?</h2>
          <ol className="mt-8 space-y-3 font-mono text-xs text-slate-400">
            {["Collect release evidence", "Canonicalize + SHA-256", "Approve the manifest", "Ed25519 attestation", "Observe chain state", "Detect drift → incident"].map((s, i) => (
              <li key={s} className="flex items-center gap-3"><span className="text-emerald-500">{String(i + 1).padStart(2, "0")}</span>{s}</li>
            ))}
          </ol>
        </div>
        <div className="font-mono text-[10px] text-slate-600">Demo records are clearly labelled DEMO / SIMULATED.</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="vx-panel w-full max-w-sm space-y-5 p-8" data-testid="auth-form">
          <div className="lg:hidden"><Logo /></div>
          <div>
            <h1 className="text-xl font-semibold text-slate-50">{mode === "login" ? "Sign in" : "Create your account"}</h1>
            <p className="mt-1 text-xs text-slate-500">{mode === "login" ? "Access your verification workspace." : "Register, then create a project or explore the demo."}</p>
          </div>
          {mode === "register" && <Field label="Name"><input data-testid={REGISTER.nameInput} className={inputCls} value={form.name} onChange={set("name")} required /></Field>}
          <Field label="Email"><input data-testid={mode === "login" ? LOGIN.emailInput : REGISTER.emailInput} type="email" className={inputCls} value={form.email} onChange={set("email")} required /></Field>
          <Field label="Password" hint={mode === "register" ? "Minimum 8 characters" : null}>
            <input data-testid={mode === "login" ? LOGIN.passwordInput : REGISTER.passwordInput} type="password" className={inputCls} value={form.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1} />
          </Field>
          {mode === "register" && <Field label="Confirm password"><input data-testid={REGISTER.passwordConfirmInput} type="password" className={inputCls} value={form.confirm} onChange={set("confirm")} required /></Field>}
          {error && <div data-testid="auth-error" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          <Btn type="submit" variant="primary" loading={busy} className="w-full" data-testid={mode === "login" ? LOGIN.submitButton : REGISTER.submitButton}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Btn>
          <button type="button" data-testid={mode === "login" ? LOGIN.registerLink : REGISTER.loginLink} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="w-full text-center text-xs text-slate-400 transition-colors duration-150 hover:text-emerald-300">
            {mode === "login" ? "No account? Register" : "Already registered? Sign in"}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
