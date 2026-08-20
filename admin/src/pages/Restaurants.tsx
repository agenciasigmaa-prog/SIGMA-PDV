import { useMemo, useState } from "react";
import { LogIn, Pencil, Plus, Search, UserPlus } from "lucide-react";
import { EditRestaurantModal } from "../components/EditRestaurantModal";
import { ManualRestaurantModal } from "../components/ManualRestaurantModal";
import { NewRestaurantModal } from "../components/NewRestaurantModal";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  filterRestaurants,
  type Restaurant,
  type RestaurantStatus,
} from "../lib/restaurant";
import { useRestaurants } from "../lib/useRestaurants";

export function Restaurants() {
  const { restaurants, loading, reload, setStatus } = useRestaurants();
  const [showNewRestaurant, setShowNewRestaurant] = useState(false);
  const [showManualRestaurant, setShowManualRestaurant] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [search, setSearch] = useState("");
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const filteredRestaurants = useMemo(() => filterRestaurants(restaurants, search), [restaurants, search]);

  // Abre o painel do restaurante numa aba nova, já logado como o dono —
  // gera um magic link de uso único via admin-impersonate-restaurant (nunca
  // vê/usa a senha real do dono) e navega direto pra ele. Fica registrado em
  // admin_action_log do lado da function, pra suporte ter rastro.
  async function handleImpersonate(restaurant: Restaurant) {
    setImpersonateError(null);
    setImpersonatingId(restaurant.id);
    const { data, error } = await supabase.functions.invoke("admin-impersonate-restaurant", {
      body: { restaurant_id: restaurant.id },
    });
    setImpersonatingId(null);
    if (error) {
      setImpersonateError(await describeFunctionError(error));
      return;
    }
    window.open((data as { action_link: string }).action_link, "_blank", "noopener");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Restaurantes</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManualRestaurant(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
          >
            <UserPlus className="h-4 w-4" aria-hidden /> Adicionar manualmente
          </button>
          <button
            onClick={() => setShowNewRestaurant(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105"
          >
            <Plus className="h-4 w-4" aria-hidden /> Novo restaurante
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-full bg-muted px-4 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, contato ou e-mail..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {impersonateError && (
        <p className="mb-4 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">{impersonateError}</p>
      )}

      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Última atividade</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!loading && restaurants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhum restaurante cadastrado ainda.</td>
              </tr>
            )}
            {!loading && restaurants.length > 0 && filteredRestaurants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhum restaurante encontrado pra "{search}".</td>
              </tr>
            )}
            {filteredRestaurants.map((restaurant) => (
              <tr key={restaurant.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{restaurant.name}</td>
                <td className="px-4 py-3">
                  <select
                    value={restaurant.status}
                    onChange={(event) => setStatus(restaurant.id, event.target.value as RestaurantStatus)}
                    className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold ${STATUS_BADGE_CLASS[restaurant.status]}`}
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{restaurant.contact_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(restaurant.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {restaurant.last_order_at ? new Date(restaurant.last_order_at).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleImpersonate(restaurant)}
                    disabled={impersonatingId === restaurant.id}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    aria-label={`Entrar como suporte em ${restaurant.name}`}
                    title="Entrar como suporte"
                  >
                    <LogIn className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => setEditingRestaurant(restaurant)}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Editar ${restaurant.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRestaurant && (
        <EditRestaurantModal
          restaurant={editingRestaurant}
          onClose={() => setEditingRestaurant(null)}
          onSaved={reload}
        />
      )}

      {showNewRestaurant && (
        <NewRestaurantModal onClose={() => setShowNewRestaurant(false)} onCreated={reload} />
      )}

      {showManualRestaurant && (
        <ManualRestaurantModal onClose={() => setShowManualRestaurant(false)} onCreated={reload} />
      )}
    </div>
  );
}
