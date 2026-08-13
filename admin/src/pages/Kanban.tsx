import { ChevronRight } from "lucide-react";
import {
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  STATUS_ORDER,
  nextStatus,
  type Restaurant,
} from "../lib/restaurant";
import { useRestaurants } from "../lib/useRestaurants";

function RestaurantCard({ restaurant, onAdvance }: { restaurant: Restaurant; onAdvance: () => void }) {
  const next = nextStatus(restaurant.status);
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card">
      <p className="font-semibold">{restaurant.name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{restaurant.contact_name ?? "Sem contato definido"}</p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Criado em {new Date(restaurant.created_at).toLocaleDateString("pt-BR")}
      </p>
      {next && (
        <button
          onClick={onAdvance}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border border-border py-1.5 text-xs font-semibold hover:bg-muted"
        >
          Mover para {STATUS_LABEL[next]} <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Kanban() {
  const { restaurants, loading, setStatus } = useRestaurants();

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">Kanban de clientes</h2>
      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {STATUS_ORDER.map((status) => {
            const items = restaurants.filter((restaurant) => restaurant.status === status);
            return (
              <div key={status} className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                  <h3 className="text-sm font-bold">{STATUS_LABEL[status]}</h3>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Nenhum restaurante aqui
                    </p>
                  )}
                  {items.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      onAdvance={() => {
                        const next = nextStatus(restaurant.status);
                        if (next) setStatus(restaurant.id, next);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
