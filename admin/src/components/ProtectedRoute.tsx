import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../lib/useSession";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useSession();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  if (!session) return <Navigate to="/login" replace />;

  if (profile && profile.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <p className="mb-2 text-lg font-semibold">Acesso não autorizado</p>
          <p className="text-sm text-muted-foreground">Esta conta não tem permissão de administrador.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
