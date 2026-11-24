
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import OnboardingPage from "./pages/OnboardingPage";
import Workspace from "./pages/Workspace";

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center text-muted">
        Loading…
      </div>
    );
  }

  if (!user) return <Login />;

  if (!user.account_type) return <OnboardingPage />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/app" element={<Workspace />} />
      <Route path="/app/:slug" element={<Workspace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}