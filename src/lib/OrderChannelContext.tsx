import { createContext, useContext, useState, type ReactNode } from "react";
import { Bike, ShoppingBag, Utensils } from "lucide-react";

export type OrderType = "dine_in" | "pickup" | "delivery";

const OrderChannelContext = createContext<OrderType | null>(null);

export function useOrderChannel(): OrderType {
  const value = useContext(OrderChannelContext);
  if (!value) throw new Error("useOrderChannel must be used within an OrderChannelGate");
  return value;
}

function storageKey(restaurantId: string) {
  return `sigma:order-channel:${restaurantId}`;
}

function readStored(restaurantId: string): OrderType | null {
  const stored = sessionStorage.getItem(storageKey(restaurantId));
  return stored === "dine_in" || stored === "pickup" || stored === "delivery" ? stored : null;
}

const CHANNEL_OPTIONS: { type: OrderType; label: string; description: string; icon: typeof Utensils }[] = [
  { type: "dine_in", label: "Comer no local", description: "Você já está na mesa do restaurante", icon: Utensils },
  { type: "pickup", label: "Retirar no balcão", description: "Você vai buscar o pedido pessoalmente", icon: ShoppingBag },
  { type: "delivery", label: "Delivery", description: "Receber em casa ou no trabalho", icon: Bike },
];

// Pergunta uma vez por sessão do navegador (sessionStorage, diferente do
// carrinho que usa localStorage) — assim um refresh no meio da compra não
// pergunta de novo, mas abrir o link outra hora pergunta. Só sabemos o
// restaurantId aqui porque quem monta isso (Mesa.tsx) já esperou o
// TableProvider resolver slug/UUID antes.
export function OrderChannelGate({
  restaurantId,
  restaurantName,
  logoUrl,
  children,
}: {
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
  children: ReactNode;
}) {
  const [orderType, setOrderType] = useState<OrderType | null>(() => readStored(restaurantId));

  function selectChannel(type: OrderType) {
    sessionStorage.setItem(storageKey(restaurantId), type);
    setOrderType(type);
  }

  if (!orderType) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Mesma marca do header do cardápio (logo + nome) — sem isso a tela
            parece desconectada do resto do app, sem explicar onde o cliente
            está nem em qual restaurante. */}
        <div className="border-b border-border px-4 py-5 md:px-6">
          <div className="mx-auto flex max-w-sm items-center gap-3">
            <div
              className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl text-base font-black text-primary-foreground"
              style={logoUrl ? undefined : { backgroundImage: "var(--gradient-primary)" }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                restaurantName.charAt(0).toUpperCase()
              )}
            </div>
            <span className="min-w-0 truncate text-base font-bold tracking-tight">{restaurantName}</span>
          </div>
        </div>

        <div className="grid flex-1 place-items-center px-6 py-8">
          <div className="w-full max-w-sm">
            <h1 className="text-lg font-bold">Vamos montar seu pedido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pra começar, como você quer receber?</p>
            <div className="mt-6 space-y-3">
              {CHANNEL_OPTIONS.map(({ type, label, description, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectChannel(type)}
                  className="press surface-card flex w-full items-center gap-4 p-4 text-left hover:ring-1 hover:ring-primary"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <OrderChannelContext.Provider value={orderType}>{children}</OrderChannelContext.Provider>;
}
