import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  AlertTriangle,
  Bike,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Printer,
  Settings,
  Users,
  UserRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { useRestaurantName } from "../lib/restaurant";
import { useAutoPrintOnNewOrders } from "../lib/autoPrint";
import sigmaLogo from "../assets/sigma-logo.png";

// Telas de operação do dia a dia — ficam no topo do menu, é o que o staff
// mais usa. Impressora/Configurações são setup/manutenção, não operação, por
// isso moraram num grupo separado lá embaixo (perto de Sair), não misturadas
// aqui — ver secondaryNavItems.
const primaryNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/garcom", label: "Garçom", icon: UserRound },
  { to: "/motoboy", label: "Motoboy", icon: Bike },
  { to: "/clientes", label: "Clientes", icon: Users },
];

const secondaryNavItems = [
  { to: "/impressora", label: "Impressora", icon: Printer },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

// Celular: a barra de baixo só cabe o que é usado toda hora — Motoboy junta
// com Impressora/Configurações no menu lateral (aberto pelo hambúrguer),
// senão a barra de baixo fica apertada demais com 8 ícones.
const mobileBottomNavItems = primaryNavItems.filter((item) => item.to !== "/motoboy");
const mobileDrawerNavItems = [
  primaryNavItems.find((item) => item.to === "/motoboy")!,
  ...secondaryNavItems,
];

export function RestaurantLayout() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const restaurantName = useRestaurantName(restaurantId);
  // Montado aqui (fora do <Outlet/>), não em Pedidos.tsx, justamente pra som
  // e impressão automática funcionarem em qualquer tela — não só com o
  // board de pedidos aberto.
  const { printWarning } = useAutoPrintOnNewOrders(restaurantId, restaurantName);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Barra de cima só no celular — a lateral (abaixo) assume no desktop.
          Fixa no topo (sticky) pra ficar sempre visível — cabeçalhos de
          página (Pedidos, por ex.) grudam logo abaixo dela usando a mesma
          altura (h-14) como referência de top-14. */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <img src={sigmaLogo} alt="" className="h-6 w-6" />
          <h1 className="text-base font-bold">Sigma PDV</h1>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {/* Menu lateral do celular: some das telas (Motoboy, Impressora,
          Configurações) que não cabem confortavelmente na barra de baixo.
          Sempre montado (não só quando aberto) pra transição de slide
          funcionar tanto na entrada quanto na saída. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!drawerOpen}
        className={`fixed inset-0 z-50 flex flex-col bg-card p-4 transition-transform duration-200 ease-out md:hidden ${
          drawerOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <img src={sigmaLogo} alt="" className="h-7 w-7" />
            <h1 className="text-lg font-bold">Sigma PDV</h1>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-1">
          {mobileDrawerNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium ${
                  isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => {
            setDrawerOpen(false);
            supabase.auth.signOut();
          }}
          className="flex items-center gap-3 rounded-xl border-t border-border px-3 py-3 pt-4 text-base font-medium text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          Sair
        </button>
      </div>

      {/* Fixo no desktop (md:fixed) pra não rolar junto com o conteúdo — o
          <main> ao lado ganha md:ml-60 pra abrir espaço, já que um elemento
          fixed sai do fluxo normal do flex. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src={sigmaLogo} alt="" className="h-7 w-7" />
          <h1 className="text-lg font-bold">Sigma PDV</h1>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {primaryNavItems.map(({ to, label, icon: Icon }) => (
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

        {/* Setup/manutenção — separado da operação do dia a dia por uma
            linha, agrupado perto de Sair. */}
        <div className="space-y-1 border-t border-border pt-3">
          {secondaryNavItems.map(({ to, label, icon: Icon }) => (
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
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto p-4 pb-24 md:ml-60 md:p-8 md:pb-8">
        {printWarning && (
          <p className="mb-4 flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {printWarning}
          </p>
        )}
        <Outlet />
      </main>

      {/* Navegação de baixo só no celular — dedo alcança fácil, mesmo padrão de apps de POS */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
        <div className="grid grid-cols-5">
          {mobileBottomNavItems.map(({ to, label, icon: Icon }) => (
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
