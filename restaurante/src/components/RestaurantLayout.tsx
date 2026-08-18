import { NavLink, Outlet } from "react-router-dom";
import { AlertTriangle, Bike, ClipboardList, LayoutDashboard, LogOut, Printer, Users, UserRound, UtensilsCrossed } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { useRestaurantName } from "../lib/restaurant";
import { useAutoPrintOnNewOrders } from "../lib/autoPrint";
import sigmaLogo from "../assets/sigma-logo.png";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/garcom", label: "Garçom", icon: UserRound },
  { to: "/motoboy", label: "Motoboy", icon: Bike },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/impressora", label: "Impressora", icon: Printer },
];

export function RestaurantLayout() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const restaurantName = useRestaurantName(restaurantId);
  // Montado aqui (fora do <Outlet/>), não em Pedidos.tsx, justamente pra som
  // e impressão automática funcionarem em qualquer tela — não só com o
  // board de pedidos aberto.
  const { printWarning } = useAutoPrintOnNewOrders(restaurantId, restaurantName);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Barra de cima só no celular — a lateral (abaixo) assume no desktop */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <img src={sigmaLogo} alt="" className="h-6 w-6" />
          <h1 className="text-base font-bold">Sigma PDV</h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          aria-label="Sair"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src={sigmaLogo} alt="" className="h-7 w-7" />
          <h1 className="text-lg font-bold">Sigma PDV</h1>
        </div>
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

      <main className="flex-1 overflow-x-auto p-4 pb-24 md:p-8 md:pb-8">
        {printWarning && (
          <p className="mb-4 flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {printWarning}
          </p>
        )}
        <Outlet />
      </main>

      {/* Navegação de baixo só no celular — dedo alcança fácil, mesmo padrão de apps de POS */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
        <div className="grid grid-cols-7">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
