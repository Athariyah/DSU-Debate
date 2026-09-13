import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { apiFetch } from "../../api/httpClient";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch("/admin/auth/me", { auth: true })
      .then(() => {
        if (mounted) setAuthenticated(true);
      })
      .catch(() => {
        if (mounted) setAuthenticated(false);
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return <div className="grid h-full place-items-center text-sm text-white/50">Проверка доступа…</div>;
  }
  if (!authenticated) {
    const destination = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/profile?redirect=${encodeURIComponent(destination)}`} replace />;
  }
  return <>{children}</>;
}
