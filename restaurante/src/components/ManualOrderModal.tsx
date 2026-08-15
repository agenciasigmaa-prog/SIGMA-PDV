import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ManualProduct = { id: string; name: string; price: number; category_id: string | null };
type ManualCategory = { id: string; name: string };
type CartLine = { product_id: string; name: string; price: number; quantity: number };

// Pedido lançado pelo staff (telefone, balcão, esqueceu de escanear o QR
// etc.) — sem adicional/combo/meio a meio nesta primeira versão, só produto
// + quantidade, que é o essencial pra "lançar pedido manualmente".
export function ManualOrderModal({
  restaurantId,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [categories, setCategories] = useState<ManualCategory[]>([]);
  const [products, setProducts] = useState<ManualProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "pickup" | "delivery">("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPickupCode, setCreatedPickupCode] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));
    supabase
      .from("products")
      .select("id, name, price, category_id")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .eq("sold_out", false)
      .order("sort_order")
      .then(({ data }) => setProducts((data ?? []).map((p) => ({ ...p, price: Number(p.price) }))));
  }, [restaurantId]);

  const visibleProducts = useMemo(() => {
    let list = activeCategory === "all" ? products : products.filter((p) => p.category_id === activeCategory);
    const query = search.trim().toLowerCase();
    if (query) list = list.filter((p) => p.name.toLowerCase().includes(query));
    return list;
  }, [products, activeCategory, search]);

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart]);

  function addProduct(product: ManualProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === product.id);
      if (existing) {
        return prev.map((l) => (l.product_id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => (l.product_id === productId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0),
    );
  }

  async function handleSubmit() {
    if (cart.length === 0 || !customerName.trim() || submitting) return;
    if (orderType === "dine_in" && !tableLabel.trim()) return;
    if (orderType === "delivery" && !deliveryAddress.trim()) return;
    setSubmitting(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("place-dine-in-order", {
      body: {
        restaurant_id: restaurantId,
        customer_name: customerName.trim(),
        order_type: orderType,
        ...(orderType === "dine_in" ? { table_label: tableLabel.trim() } : {}),
        ...(orderType === "delivery" ? { delivery_address: deliveryAddress.trim() } : {}),
        items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      },
    });
    if (fnError) {
      setError(await describeFunctionError(fnError));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (orderType === "pickup" && data?.pickup_code) {
      setCreatedPickupCode(data.pickup_code);
      return;
    }
    onCreated();
  }

  if (createdPickupCode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-elevated">
          <p className="mb-2 text-sm text-muted-foreground">Código de retirada</p>
          <p className="mb-6 text-5xl font-bold tabular-nums">{createdPickupCode}</p>
          <button
            onClick={onCreated}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-bold">Novo pedido manual</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto"
              className="w-full rounded-xl border border-border py-2.5 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCategory("all")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                  activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="mb-4 divide-y divide-border rounded-xl border border-border">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span>{product.name}</span>
                <span className="font-bold">{currency(product.price)}</span>
              </button>
            ))}
            {visibleProducts.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum produto disponível</p>
            )}
          </div>

          {cart.length > 0 && (
            <div className="mb-4 divide-y divide-border rounded-xl border border-border">
              {cart.map((line) => (
                <div key={line.product_id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{line.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQuantity(line.product_id, -1)}
                      aria-label="Diminuir quantidade"
                      className="rounded-full border border-border p-1 hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" aria-hidden />
                    </button>
                    <span className="w-4 text-center font-bold">{line.quantity}</span>
                    <button
                      onClick={() => changeQuantity(line.product_id, 1)}
                      aria-label="Aumentar quantidade"
                      className="rounded-full border border-border p-1 hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  <span className="w-20 shrink-0 text-right font-bold">{currency(line.price * line.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2 flex gap-1 rounded-full bg-muted p-1">
            <button
              onClick={() => setOrderType("dine_in")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                orderType === "dine_in" ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              Mesa
            </button>
            <button
              onClick={() => setOrderType("pickup")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                orderType === "pickup" ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              Retirada
            </button>
            <button
              onClick={() => setOrderType("delivery")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                orderType === "delivery" ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              Entrega
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nome do cliente"
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
            />
            {orderType === "dine_in" && (
              <input
                type="text"
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                placeholder="Número da mesa"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              />
            )}
            {orderType === "delivery" && (
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Endereço de entrega"
                rows={2}
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              />
            )}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold">Total</span>
            <span className="font-bold">{currency(total)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={
              cart.length === 0 ||
              !customerName.trim() ||
              (orderType === "dine_in" && !tableLabel.trim()) ||
              (orderType === "delivery" && !deliveryAddress.trim()) ||
              submitting
            }
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105 disabled:opacity-40"
          >
            {submitting ? "Lançando..." : "Lançar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
