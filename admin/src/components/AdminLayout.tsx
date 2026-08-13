import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ClipboardList, LayoutDashboard, LayoutGrid, LogOut, Plus, Receipt, Store } from "lucide-react";
import { supabase } from "../lib/supabase";
import sigmaLogo from "../assets/sigma-logo.png";
import { NewRestaurantModal } from "./NewRestaurantModal";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kanban", label: "Kanban", icon: LayoutGrid },
  { to: "/restaurantes", label: "Restaurantes", icon: Store },
  { to: "/pedidos", label: "Pedidos", icon: Receipt },
  { to: "/auditoria", label: "Auditoria", icon: ClipboardList },
];

export function AdminLayout() {
  const [showNewRestaurant, setShowNewRestaurant] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src={sigmaLogo} alt="" className="h-7 w-7" />
          <h1 className="text-lg font-bold">Sigma PDV</h1>
        </div>
        <button
          onClick={() => setShowNewRestaurant(true)}
          className="mb-4 flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo restaurante
        </button>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </button>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">
        <Outlet />
      </main>

      {showNewRestaurant && <NewRestaurantModal onClose={() => setShowNewRestaurant(false)} />}
    </div>
  );
}
