import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Minus, Plus, X } from "lucide-react";
import type { CartItem } from "../lib/CartContext";
import type { OrderType } from "../lib/OrderChannelContext";
import { useNeighborhoods } from "../lib/neighborhoods";
import { addressIcon, type CustomerAddress } from "../lib/customerAddresses";
import type { DeliveryDetails, PaymentMethod } from "../lib/orderCheckout";
import { trackInitiateCheckout } from "../lib/metaPixel";

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
  addresses,
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
  addresses: CustomerAddress[];
  onCustomerNameChange: (value: string) => void;
  onTableLabelChange: (value: string) => void;
  onDeliveryDetailsChange: (details: DeliveryDetails) => void;
  onClose: () => void;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onConfirm: () => void;
}) {
  const { neighborhoods } = useNeighborhoods(orderType === "delivery" ? restaurantId : null);
  // Fechado só quando já existe um endereço salvo pré-selecionado — recolhe
  // pra um resumo com "Trocar" em vez do formulário sempre aberto (igual ao
  // app de referência). "Novo endereço" continua com o form sempre visível,
  // sem recolher enquanto digita.
  const [addressPickerOpen, setAddressPickerOpen] = useState(deliveryDetails.selectedSavedAddressId == null);
  // MesaCardapio pode pré-selecionar o endereço salvo depois que esse
  // componente já montou (a lista de endereços carrega de forma
  // assíncrona) — sem isso o resumo compacto só apareceria depois que o
  // cliente tocasse manualmente num endereço, perdendo o ganho de abrir já
  // recolhido.
  const prevSelectedIdRef = useRef(deliveryDetails.selectedSavedAddressId);
  useEffect(() => {
    if (prevSelectedIdRef.current == null && deliveryDetails.selectedSavedAddressId != null) {
      setAddressPickerOpen(false);
    }
    prevSelectedIdRef.current = deliveryDetails.selectedSavedAddressId;
  }, [deliveryDetails.selectedSavedAddressId]);

  // Etapa de revisão antes de confirmar de verdade (igual referência do
  // iFood: "Revisar pedido" leva pra um resumo só-leitura, e o pedido só sai
  // dali). Reseta sempre que o carrinho fecha, senão a próxima abertura
  // pularia direto pra revisão com o carrinho já esvaziado do pedido
  // anterior — esse componente nunca desmonta entre abrir/fechar.
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    if (!open) setReviewing(false);
  }, [open]);

  if (!open) return null;

  const selectedNeighborhood = neighborhoods.find((n) => n.id === deliveryDetails.neighborhoodId) ?? null;
  const deliveryFee = selectedNeighborhood?.delivery_fee ?? 0;
  const total = subtotal + (orderType === "delivery" ? deliveryFee : 0);

  const selectedAddress =
    deliveryDetails.selectedSavedAddressId != null
      ? (addresses.find((a) => a.id === deliveryDetails.selectedSavedAddressId) ?? null)
      : null;
  const resolvedAddressText = selectedAddress ? selectedAddress.address_text : deliveryDetails.addressText.trim();

  const changeForNum = deliveryDetails.changeFor === "" ? null : Number(deliveryDetails.changeFor);
  const changeForInvalid = deliveryDetails.wantsChange && (changeForNum == null || Number.isNaN(changeForNum) || changeForNum < total);

  // Guarda de novo com "> price" na hora de exibir (não só ao adicionar) —
  // se o preço mudou no meio do caminho (checkCartPrices/syncPrices), o
  // originalPrice congelado no item pode ter ficado obsoleto.
  const savings = items.reduce((sum, item) => {
    if (item.originalPrice == null || item.originalPrice <= item.price) return sum;
    return sum + (item.originalPrice - item.price) * item.quantity;
  }, 0);

  const paymentLabel = PAYMENT_METHODS.find((m) => m.value === deliveryDetails.paymentMethod)?.label ?? "";

  const canConfirm =
    items.length > 0 &&
    !submitting &&
    !!customerName.trim() &&
    (orderType === "dine_in"
      ? !!tableLabel.trim() && !!deliveryDetails.paymentMethod && !changeForInvalid
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
        <div className="flex items-center gap-1 border-b border-border px-5 py-4">
          {reviewing && (
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => setReviewing(false)}
              className="press -ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          <h2 className="flex-1 text-lg font-bold">{reviewing ? "Revisar pedido" : "Seu pedido"}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="press shrink-0 rounded-full p-2 hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {error && <p className="px-5 pt-4 text-sm font-medium text-red-600">{error}</p>}

        {reviewing ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Itens</h3>
              <ul className="space-y-2.5">
                {items.map((item) => {
                  const addonsPerUnit = item.addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0);
                  return (
                    <li key={item.lineId} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold">{item.quantity}x </span>
                        {item.name}
                        {item.addons.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {item.addons.map((addon) => `${addon.quantity}x ${addon.name}`).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold">{currency((item.price + addonsPerUnit) * item.quantity)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-5 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {orderType === "dine_in" ? "Mesa" : orderType === "pickup" ? "Retirada" : "Entrega"}
              </h3>
              {orderType === "dine_in" && <p className="text-sm">Mesa {tableLabel}</p>}
              {orderType === "pickup" && <p className="text-sm">Retirar no balcão</p>}
              {orderType === "delivery" && (
                <>
                  <p className="text-sm">{resolvedAddressText}</p>
                  {selectedNeighborhood && <p className="text-xs text-muted-foreground">{selectedNeighborhood.name}</p>}
                </>
              )}
            </div>

            {(orderType === "delivery" || orderType === "dine_in") && (
              <div className="mt-5 space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pagamento</h3>
                <p className="text-sm">{paymentLabel}</p>
                {deliveryDetails.wantsChange && deliveryDetails.changeFor && (
                  <p className="text-xs text-muted-foreground">Troco para {currency(Number(deliveryDetails.changeFor))}</p>
                )}
              </div>
            )}

            <div className="mt-5 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cliente</h3>
              <p className="text-sm">{customerName}</p>
            </div>
          </div>
        ) : (
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
                    <div className="press flex shrink-0 items-center gap-1 rounded-full bg-primary/10 p-1">
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() => onDecrement(item.lineId)}
                        className="grid h-9 w-9 place-items-center rounded-full bg-white text-primary shadow-xs"
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </button>
                      <span className="min-w-[1.5ch] text-center text-sm font-bold">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Aumentar quantidade"
                        onClick={() => onIncrement(item.lineId)}
                        className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {items.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className={orderType === "dine_in" ? "grid grid-cols-2 gap-2" : ""}>
                <input
                  value={customerName}
                  onChange={(e) => onCustomerNameChange(e.target.value)}
                  placeholder="Seu nome"
                  aria-label="Seu nome"
                  className="min-w-0 rounded-xl border border-border px-3 py-2.5 text-sm"
                />
                {orderType === "dine_in" && (
                  <input
                    value={tableLabel}
                    onChange={(e) => onTableLabelChange(e.target.value)}
                    placeholder="Número da mesa"
                    aria-label="Número da mesa"
                    className="min-w-0 rounded-xl border border-border px-3 py-2.5 text-sm"
                  />
                )}
              </div>

              {orderType === "delivery" && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Endereço de entrega
                    </label>
                    {!addressPickerOpen && resolvedAddressText ? (
                      (() => {
                        const Icon = addressIcon(selectedAddress?.label ?? null);
                        return (
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-border py-2 pl-3 pr-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{selectedAddress?.label || "Endereço"}</p>
                                <p className="truncate text-xs text-muted-foreground">{resolvedAddressText}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAddressPickerOpen(true)}
                              className="press shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold text-primary hover:bg-primary/10"
                            >
                              Trocar
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-2">
                        {addresses.map((address) => {
                          const Icon = addressIcon(address.label);
                          return (
                            <button
                              key={address.id}
                              type="button"
                              onClick={() => {
                                update({ selectedSavedAddressId: address.id });
                                setAddressPickerOpen(false);
                              }}
                              className={`press flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${
                                deliveryDetails.selectedSavedAddressId === address.id
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="min-w-0 truncate">
                                {address.label && <span className="mr-1 font-semibold">{address.label}:</span>}
                                {address.address_text}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => update({ selectedSavedAddressId: null })}
                          className={`press block w-full rounded-xl border px-3 py-3 text-left text-sm ${
                            deliveryDetails.selectedSavedAddressId == null
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          Novo endereço
                        </button>
                        {deliveryDetails.selectedSavedAddressId == null && (
                          <>
                            <textarea
                              value={deliveryDetails.addressText}
                              onChange={(e) => update({ addressText: e.target.value })}
                              placeholder="Rua, número, complemento"
                              rows={2}
                              className="w-full resize-none rounded-xl border border-border px-3 py-2.5 text-sm"
                            />
                            {/* Nome do endereço é opcional — não bloqueia o
                                checkout, só facilita reconhecer da próxima vez. */}
                            <div className="flex flex-wrap gap-1.5">
                              {["Casa", "Trabalho", "Outro"].map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => update({ newAddressLabel: option })}
                                  className={`press rounded-full border px-3.5 py-2 text-xs font-medium ${
                                    deliveryDetails.newAddressLabel === option
                                      ? "border-primary bg-primary/10"
                                      : "border-border hover:bg-muted"
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                            <input
                              value={deliveryDetails.newAddressLabel}
                              onChange={(e) => update({ newAddressLabel: e.target.value })}
                              placeholder="Nome do endereço (opcional)"
                              aria-label="Nome do endereço"
                              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Bairro
                    </label>
                    <select
                      value={deliveryDetails.neighborhoodId}
                      onChange={(e) => update({ neighborhoodId: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                    >
                      <option value="">Selecione…</option>
                      {neighborhoods.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} — {currency(n.delivery_fee)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Pagamento é perguntado pra mesa também, não só delivery —
                  antes só aparecia no bloco de entrega; troco só faz sentido
                  em dinheiro, mas isso vale pra mesa igual. */}
              {(orderType === "delivery" || orderType === "dine_in") && (
                <div className="space-y-3 rounded-xl border border-border p-3">
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
                          className={`press flex-1 rounded-full px-3 py-3 text-xs font-bold ${
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
                        <label className="flex items-center gap-2.5 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={deliveryDetails.wantsChange}
                            onChange={(e) => update({ wantsChange: e.target.checked, changeFor: e.target.checked ? deliveryDetails.changeFor : "" })}
                            className="h-5 w-5 rounded border-border"
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
                            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
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
        </div>
        )}

        {/* Rodapé curto e sempre fixo (só totais + botão) — o resto (itens +
            formulário de entrega) rola junto acima. Antes o formulário inteiro
            vivia aqui fora da área de scroll; num celular baixo (ex. iPhone
            SE) com o formulário de delivery todo aberto isso passava de
            680px de altura sozinho e empurrava "Confirmar pedido" pra fora
            da tela, sem nenhum scroll pra alcançar — bug real, não só
            estético. */}
        <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
            {savings > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-success">Economia</span>
                <span className="font-semibold text-success">{currency(savings)}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (reviewing) {
                onConfirm();
              } else {
                trackInitiateCheckout(total);
                setReviewing(true);
              }
            }}
            className="press w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {submitting ? "Enviando…" : reviewing ? "Confirmar pedido" : "Revisar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
