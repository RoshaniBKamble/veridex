import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "@/lib/api";

const AuthCtx = createContext(null);
export const DEMO_PROJECT = "prj_demo_aurora";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [projectId, setProjectIdState] = useState(localStorage.getItem("vx_project") || DEMO_PROJECT);

  useEffect(() => {
    if (!tokenStore.get()) return setUser(false);
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => { tokenStore.clear(); setUser(false); });
  }, []);

  const signIn = useCallback((data) => { tokenStore.set(data.access_token); setUser(data.user); }, []);
  const signOut = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    tokenStore.clear();
    setUser(false);
  }, []);
  const setProjectId = useCallback((id) => { localStorage.setItem("vx_project", id); setProjectIdState(id); }, []);

  return <AuthCtx.Provider value={{ user, signIn, signOut, projectId, setProjectId }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
