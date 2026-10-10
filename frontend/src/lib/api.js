import axios from "axios";

export const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TOKEN_KEY = "vx_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 45000 });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((d) => (d && typeof d.msg === "string" ? `${(d.loc || []).slice(-1)[0] || ""} ${d.msg}`.trim() : JSON.stringify(d))).join("; ");
  return detail.msg || String(detail);
}

export const get = (url) => api.get(url).then((r) => r.data);
export const post = (url, body) => api.post(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);

export const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "—");
export const ago = (ts) => {
  if (!ts) return "never";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
