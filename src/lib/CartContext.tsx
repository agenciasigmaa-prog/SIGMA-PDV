import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Product } from "./menu";
import type { RemovableIngredient } from "./removableIngredients";

export type CartAddon = { addonId: string; name: string; price: number; quantity: number };
export type CartHalfFlavor = { productId: string; name: string; price: number };
export type CartComboChoice = { groupId: string; groupName: string; productId: string; name: string };

export type CartItem = {
  lineId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  addons: CartAddon[];
  halfFlavor?: { productId: string; name: string };
  comboChoices?: CartComboChoice[];
  removedIngredients?: RemovableIngredient[];
};

type AddItemOptions = {
  addons?: CartAddon[];
  halfFlavor?: CartHalfFlavor;
  comboChoices?: CartComboChoice[];
  removedIngredients?: RemovableIngredient[];
  quantity?: number;
};

type CartValue = {
  items: CartItem[];
  addItem: (product: Product, options?: AddItemOptions) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  syncPrices: (updates: { lineId: string; price: number }[], removeLineIds: string[]) => void;
  clear: () => void;
  subtotal: number;
  totalCount: number;
};

const CartContext = createContext<CartValue | null>(null);

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within a CartProvider");
  return value;
}

function storageKey(restaurantId: string) {
  return `sigma:cart:${restaurantId}`;
}

// Duas linhas do mesmo produto só se juntam se tiverem exatamente os mesmos
// adicionais na mesma quantidade — "burger com bacon" e "burger sem bacon"
// são pedidos diferentes, não podem virar uma linha só.
function addonSignature(addons: CartAddon[]): string {
  return [...addons]
    .sort((a, b) => a.addonId.localeCompare(b.addonId))
    .map((a) => `${a.addonId}:${a.quantity}`)
    .join(",");
}

function comboChoiceSignature(choices: CartComboChoice[]): string {
  return [...choices]
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map((c) => `${c.groupId}:${c.productId}`)
    .join(",");
}

function removedIngredientsSignature(removed: RemovableIngredient[]): string {
  return [...removed]
    .map((r) => r.ingredientId)
    .sort()
    .join(",");
}

export function CartProvider({ restaurantId, children }: { restaurantId: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const raw = localStorage.getItem(storageKey(restaurantId));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  });

  useEffect(() => {
    localStorage.setItem(storageKey(restaurantId), JSON.stringify(items));
  }, [restaurantId, items]);

  function addItem(product: Product, options: AddItemOptions = {}) {
    const { addons = [], halfFlavor, comboChoices = [], removedIngredients = [], quantity = 1 } = options;
    setItems((prev) => {
      const signature = addonSignature(addons);
      const choiceSignature = comboChoiceSignature(comboChoices);
      const removedSignature = removedIngredientsSignature(removedIngredients);
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId === product.id &&
          addonSignature(item.addons) === signature &&
          (item.halfFlavor?.productId ?? null) === (halfFlavor?.productId ?? null) &&
          comboChoiceSignature(item.comboChoices ?? []) === choiceSignature &&
          removedIngredientsSignature(item.removedIngredients ?? []) === removedSignature,
      );
      if (existingIndex >= 0) {
        return prev.map((item, index) =>
          index === existingIndex ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: product.id,
          name: halfFlavor ? `${product.name} / ${halfFlavor.name}` : product.name,
          price: halfFlavor ? halfFlavor.price : product.price,
          quantity,
          addons,
          halfFlavor: halfFlavor ? { productId: halfFlavor.productId, name: halfFlavor.name } : undefined,
          comboChoices: comboChoices.length > 0 ? comboChoices : undefined,
          removedIngredients: removedIngredients.length > 0 ? removedIngredients : undefined,
        },
      ];
    });
  }

  function setQuantity(lineId: string, quantity: number) {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.lineId !== lineId)
        : prev.map((item) => (item.lineId === lineId ? { ...item, quantity } : item)),
    );
  }

  // Aplicado só depois que o cliente confirma o aviso de preço mudado — nunca
  // dispara sozinho, é sempre o resultado de uma ação explícita do usuário.
  // Casa por lineId (não productId): duas linhas do mesmo produto podem ter
  // preços diferentes hoje (meio a meio com sabores diferentes), então uma
  // chave por productId trocaria/removeria a linha errada.
  function syncPrices(updates: { lineId: string; price: number }[], removeLineIds: string[]) {
    setItems((prev) =>
      prev
        .filter((item) => !removeLineIds.includes(item.lineId))
        .map((item) => {
          const update = updates.find((u) => u.lineId === item.lineId);
          return update ? { ...item, price: update.price } : item;
        }),
    );
  }

  function clear() {
    setItems([]);
  }

  // addons[].quantity é "quantidade por unidade do produto" — por isso
  // multiplica pela quantidade da linha, igual o servidor faz.
  const subtotal = items.reduce((sum, item) => {
    const addonsPerUnit = item.addons.reduce((s, addon) => s + addon.price * addon.quantity, 0);
    return sum + (item.price + addonsPerUnit) * item.quantity;
  }, 0);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, setQuantity, syncPrices, clear, subtotal, totalCount }}>
      {children}
    </CartContext.Provider>
  );
}
