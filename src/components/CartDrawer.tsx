import { Minus, Plus, X } from "lucide-react";
import type { CartItem } from "../lib/CartContext";
import type { OrderType } from "../lib/OrderChannelContext";
import { useNeighborhoods } from "../lib/neighborhoods";
import { useCustomerAddresses } from "../lib/customerAddresses";
import type { DeliveryDetails, PaymentMethod } from "../lib/orderCheckout";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Dinheiro" },
  { value: "card", label: "Cartão" },
  { value: "pix", label: "Pix" },
];

export function CartDrawer({
  open,
  restaurantId,
  orderType,
  items,
  subtotal,
  submitting,
  error,
  customerName,
  tableLabel,
  deliveryDetails,
  onCustomerNameChange,
  onTableLabelChange,
  onDeliveryDetailsChange,
  onClose,
  onIncrement,
  onDecrement,
  onConfirm,
}: {
  open: boolean;
  restaurantId: string;
  orderType: OrderType;
  items: CartItem[];
  subtotal: number;
  submitting: boolean;
  error: string | null;
  customerName: string;
  tableLabel: string;
  deliveryDetails: DeliveryDetails;
  onCustomerNameChange: (value: string) => void;
  onTableLabelChange: (value: string) => void;
  onDeliveryDetailsChange: (details: DeliveryDetails) => void;
  onClose: () => void;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onConfirm: () => void;
}) {
  const { neighborhoods } = useNeighborhoods(orderType === "delivery" ? restaurantId : null);
  const { addresses } = useCustomerAddresses();

  if (!open) return null;

  const selectedNeighborhood = neighborhoods.find((n) => n.id === deliveryDetails.neighborhoodId) ?? null;
  const deliveryFee = selectedNeighborhood?.delivery_fee ?? 0;
  const total = subtotal + (orderType === "delivery" ? deliveryFee : 0);

  const resolvedAddressText =
    deliveryDetails.selectedSavedAddressId != null
      ? (addresses.find((a) => a.id === deliveryDetails.selectedSavedAddressId)?.address_text ?? "")
      : deliveryDetails.addressText.trim();

  const changeForNum = deliveryDetails.changeFor === "" ? null : Number(deliveryDetails.changeFor);
  const changeForInvalid = deliveryDetails.wantsChange && (changeForNum == null || Number.isNaN(changeForNum) || changeForNum < total);

  const canConfirm =
    items.length > 0 &&
    !submitting &&
    !!customerName.trim() &&
    (orderType === "dine_in"
      ? !!tableLabel.trim()
      : orderType === "delivery"
        ? !!resolvedAddressText && !!deliveryDetails.neighborhoodId && !!deliveryDetails.paymentMethod && !changeForInvalid
        : true);

  function update(partial: Partial<DeliveryDetails>) {
    onDeliveryDetailsChange({ ...deliveryDetails, ...partial });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar carrinho"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex h-full w-full max-w-md flex-col bg-background shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">Seu pedido</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="press rounded-full p-2 hover:bg-muted">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">Seu carrinho está vazio.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => {
                const addonsPerUnit = item.addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0);
                return (
                  <li key={item.lineId} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{item.name}</div>
                      {item.comboChoices && item.comboChoices.length > 0 && (
                        <ul className="mt-0.5">
                          {item.comboChoices.map((choice) => (
                            <li key={choice.groupId} className="text-xs text-muted-foreground">
                              {choice.groupName}: {choice.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.removedIngredients && item.removedIngredients.length > 0 && (
                        <ul className="mt-0.5">
                          {item.removedIngredients.map((ingredient) => (
                            <li key={ingredient.ingredientId} className="text-xs text-muted-foreground">
                              Sem {ingredient.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.addons.length > 0 && (
                        <ul className="mt-0.5">
                          {item.addons.map((addon) => (
                            <li key={addon.addonId} className="text-xs text-muted-foreground">
                              + {addon.quantity}x {addon.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">{currency(item.price + addonsPerUnit)}</div>
                    </div>
                    <div className="press flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-1 py-1">
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() => onDecrement(item.lineId)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-white text-primary shadow-xs"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <span className="min-w-[1ch] text-center text-sm font-bold">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Aumentar quantidade"
                        onClick={() => onIncrement(item.lineId)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}
          {items.length > 0 && (
            <div className="mb-3 space-y-3">
              <div className={orderType === "dine_in" ? "grid grid-cols-2 gap-2" : ""}>
                <input
                  value={customerName}
                  onChange={(e) => onCustomerNameChange(e.target.value)}
                  placeholder="Seu nome"
                  aria-label="Seu nome"
                  className="min-w-0 rounded-xl border border-border px-3 py-2 text-sm"
                />
                {orderType === "dine_in" && (
                  <input
                    value={tableLabel}
                    onChange={(e) => onTableLabelChange(e.target.value)}
                    placeholder="Número da mesa"
                    aria-label="Número da mesa"
                    className="min-w-0 rounded-xl border border-border px-3 py-2 text-sm"
                  />
                )}
              </div>

              {orderType === "delivery" && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Endereço de entrega
                    </label>
                    <div className="space-y-1.5">
                      {addresses.map((address) => (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => update({ selectedSavedAddressId: address.id })}
                          className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${
                            deliveryDetails.selectedSavedAddressId === address.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {address.label && <span className="mr-1 font-semibold">{address.label}:</span>}
                          {address.address_text}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => update({ selectedSavedAddressId: null })}
                        className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${
                          deliveryDetails.selectedSavedAddressId == null
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        Novo endereço
                      </button>
                      {deliveryDetails.selectedSavedAddressId == null && (
                        <textarea
                          value={deliveryDetails.addressText}
                          onChange={(e) => update({ addressText: e.target.value })}
                          placeholder="Rua, número, complemento"
                          rows={2}
                          className="w-full resize-none rounded-xl border border-border px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Bairro
                    </label>
                    <select
                      value={deliveryDetails.neighborhoodId}
                      onChange={(e) => update({ neighborhoodId: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      <option value="">Selecione…</option>
                      {neighborhoods.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} — {currency(n.delivery_fee)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Forma de pagamento
                    </label>
                    <div className="flex gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() =>
                            update({
                              paymentMethod: method.value,
                              wantsChange: method.value === "cash" ? deliveryDetails.wantsChange : false,
                              changeFor: method.value === "cash" ? deliveryDetails.changeFor : "",
                            })
                          }
                          className={`flex-1 rounded-full px-3 py-2 text-xs font-bold ${
                            deliveryDetails.paymentMethod === method.value
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                    {deliveryDetails.paymentMethod === "cash" && (
                      <div className="mt-2 space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={deliveryDetails.wantsChange}
                            onChange={(e) => update({ wantsChange: e.target.checked, changeFor: e.target.checked ? deliveryDetails.changeFor : "" })}
                            className="h-4 w-4 rounded border-border"
                          />
                          Precisa de troco?
                        </label>
                        {deliveryDetails.wantsChange && (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={deliveryDetails.changeFor}
                            onChange={(e) => update({ changeFor: e.target.value })}
                            placeholder="Troco pra quanto? Ex.: 100"
                            aria-label="Troco pra quanto"
                            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                          />
                        )}
                        {changeForInvalid && deliveryDetails.changeFor !== "" && (
                          <p className="text-xs text-destructive">O troco precisa ser maior ou igual ao total do pedido.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{currency(subtotal)}</span>
            </div>
            {orderType === "delivery" && selectedNeighborhood && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxa de entrega</span>
                <span className="font-semibold">{currency(deliveryFee)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-base font-bold">{currency(total)}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="press w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Confirmar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
