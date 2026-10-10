import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Loading } from "@/components/vx/Primitives";
import AppShell from "@/components/vx/AppShell";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";

const Founder = lazy(() => import("@/pages/Founder"));
const Developer = lazy(() => import("@/pages/Developer"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const Releases = lazy(() => import("@/pages/Releases"));
const ReleaseDetail = lazy(() => import("@/pages/ReleaseDetail"));
const EvidenceDetail = lazy(() => import("@/pages/EvidenceDetail"));
const Deployments = lazy(() => import("@/pages/Deployments"));
const DeploymentDetail = lazy(() => import("@/pages/DeploymentDetail"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Permissions = lazy(() => import("@/pages/Permissions"));
const Findings = lazy(() => import("@/pages/Findings"));
const DriftEvents = lazy(() => import("@/pages/DriftEvents"));
const Incidents = lazy(() => import("@/pages/Incidents"));
const IncidentDetail = lazy(() => import("@/pages/IncidentDetail"));
const TrustGraphPage = lazy(() => import("@/pages/TrustGraphPage"));
const Settings = lazy(() => import("@/pages/Settings"));
const Demo = lazy(() => import("@/pages/Demo"));

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="p-10"><Loading label="Checking session" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const PAGES = [
  ["founder", Founder], ["developer", Developer], ["projects", Projects], ["projects/:id", ProjectDetail],
  ["releases", Releases], ["releases/:id", ReleaseDetail], ["evidence/:id", EvidenceDetail],
  ["deployments", Deployments], ["deployments/:id", DeploymentDetail], ["integrations", Integrations],
  ["permissions", Permissions], ["findings", Findings], ["drift", DriftEvents], ["incidents", Incidents],
  ["incidents/:id", IncidentDetail], ["graph", TrustGraphPage], ["settings", Settings], ["demo", Demo],
];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/app" element={<Protected><AppShell /></Protected>}>
            <Route index element={<Navigate to="/app/founder" replace />} />
            {PAGES.map(([path, C]) => (
              <Route key={path} path={path} element={<Suspense fallback={<Loading />}><C /></Suspense>} />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#10141D", border: "1px solid rgba(255,255,255,0.1)", color: "#E2E8F0", fontFamily: "IBM Plex Sans" } }} />
    </AuthProvider>
  );
}
