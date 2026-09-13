import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAdminAuthenticated } from "../../api/debates";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!isAdminAuthenticated()) {
    return <Navigate to={`/profile?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
