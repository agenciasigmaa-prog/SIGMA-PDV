import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, LogOut, Trash2, User, X, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { useTableContext } from "../lib/TableContext";
import { addressIcon, useCustomerAddresses } from "../lib/customerAddresses";
import { useOrderHistory } from "../lib/orderHistory";
import { DEMAND_REASON_LABEL, type MyOrder, type MyOrderStatus } from "../lib/myOrder";
import type { OrderType } from "../lib/OrderChannelContext";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

// Tempo padrão de deslocamento depois que o motoboy sai, só pra dar uma
// estimativa de chegada — não vem de dado real por bairro (ver CLAUDE.md
// "Ordering flow") nem é cobrado de ninguém, é só texto exibido pro cliente.
const DELIVERY_TRANSIT_BASELINE_MINUTES = 30;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function addMinutes(iso: string, minutes: number): Date {
  return new Date(new Date(iso).getTime() + minutes * 60_000);
}

const STEP_LABELS: Record<OrderType, [string, string, string, string]> = {
  dine_in: ["Recebido", "Em preparo", "Pronto", "Entregue"],
  pickup: ["Recebido", "Em preparo", "Pronto pra retirar", "Retirado"],
  delivery: ["Recebido", "Em preparo", "Saiu pra entrega", "Entregue"],
};

const CHANNEL_LABEL: Record<OrderType, string> = { dine_in: "Mesa", pickup: "Retirada", delivery: "Entrega" };

const STATUS_LABEL: Record<MyOrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STEP_STATUSES: MyOrderStatus[] = ["received", "preparing", "ready", "completed"];

function Stepper({ orderType, status }: { orderType: OrderType; status: MyOrderStatus }) {
  const labels = STEP_LABELS[orderType];
  const currentIndex = Math.max(0, STEP_STATUSES.indexOf(status));

  return (
    <div className="flex items-start">
      {labels.map((label, index) => {
        const done = index <= currentIndex;
        const isLast = index === labels.length - 1;
        return (
          <div key={label} className={`flex ${isLast ? "" : "flex-1"} flex-col items-center`}>
            <div className="flex w-full items-center">
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </div>
              {!isLast && <div className={`h-0.5 flex-1 ${index < currentIndex ? "bg-primary" : "bg-muted"}`} />}
            </div>
            <p className={`mt-1.5 max-w-[72px] text-center text-[11px] font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ChannelDetails({ order }: { order: MyOrder }) {
  if (order.orderType === "dine_in") {
    return (
      <p className="rounded-xl border border-border p-3 text-sm">
        <span className="text-muted-foreground">Mesa: </span>
        <span className="font-bold">{order.tableLabel}</span>
      </p>
    );
  }

  if (order.orderType === "pickup") {
    const prepMinutes = order.items.reduce((max, item) => (item.prepMinutes != null ? Math.max(max, item.prepMinutes) : max), 0);
    return (
      <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
        <p className="text-muted-foreground">Código de retirada</p>
        <p className="text-2xl font-black tracking-widest text-primary">{order.pickupCode}</p>
        {(order.status === "received" || order.status === "preparing") && prepMinutes > 0 && (
          <p className="text-xs text-muted-foreground">Previsão de ficar pronto às {formatTime(addMinutes(order.createdAt, prepMinutes))}</p>
        )}
        {order.status === "ready" && <p className="text-xs font-medium text-foreground">Pronto pra retirar desde {formatTime(new Date(order.statusChangedAt))}</p>}
        {order.status === "completed" && <p className="text-xs text-muted-foreground">Retirado às {formatTime(new Date(order.statusChangedAt))}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <p>
        <span className="text-muted-foreground">Endereço: </span>
        {order.deliveryAddressText}
        {order.neighborhoodName ? ` — ${order.neighborhoodName}` : ""}
      </p>
      {order.status === "ready" && (
        <>
          <p className="text-xs font-medium text-foreground">Motoboy saiu às {formatTime(new Date(order.statusChangedAt))}</p>
          <p className="text-xs text-muted-foreground">
            Previsão de chegada até{" "}
            {formatTime(addMinutes(order.statusChangedAt, DELIVERY_TRANSIT_BASELINE_MINUTES + (order.demandExtraMinutes ?? 0)))}
          </p>
        </>
      )}
      {order.status === "completed" && <p className="text-xs text-muted-foreground">Entregue às {formatTime(new Date(order.statusChangedAt))}</p>}
      {order.demandExtraMinutes != null && order.demandExtraMinutes > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-accent/20 px-2.5 py-2 text-xs font-medium text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Entrega pode demorar mais hoje por causa de {order.demandReason ? DEMAND_REASON_LABEL[order.demandReason] : "alta demanda"}.
        </p>
      )}
    </div>
  );
}

function HistoryRow({ order }: { order: MyOrder }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-3 text-sm">
      <div>
        <p className="font-semibold">
          {CHANNEL_LABEL[order.orderType]} · {dateLabel(order.createdAt)}
        </p>
        <p className="text-xs text-muted-foreground">{STATUS_LABEL[order.status]}</p>
      </div>
      <p className="font-bold">{currency(order.total)}</p>
    </div>
  );
}

function OrdersSection({
  order,
  orderLoading,
  history,
  historyLoading,
}: {
  order: MyOrder | null;
  orderLoading: boolean;
  history: MyOrder[];
  historyLoading: boolean;
}) {
  // O pedido em andamento também aparece na query de histórico (que não tem
  // filtro nenhum) — tira ele da lista de baixo pra não mostrar duas vezes.
  const pastOrders = history.filter((h) => h.id !== order?.id);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-sm font-bold">Pedido em andamento</h3>
        {orderLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!orderLoading && !order && <p className="text-sm text-muted-foreground">Nenhum pedido em andamento nesta loja.</p>}

        {!orderLoading && order && order.status === "cancelled" && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-3 text-sm font-medium text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Este pedido foi cancelado.
          </div>
        )}

        {!orderLoading && order && order.status !== "cancelled" && (
          <div className="space-y-1">
            <Stepper orderType={order.orderType} status={order.status} />
            {order.status === "completed" && (
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                {order.orderType === "pickup" ? "Retirado — obrigado pela preferência!" : "Entregue — obrigado pela preferência!"}
              </div>
            )}
          </div>
        )}

        {!orderLoading && order && (
          <>
            <div className="mt-5">
              <ChannelDetails order={order} />
            </div>
            <div className="mt-4 divide-y divide-border rounded-xl border border-border text-sm">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate">
                    {item.quantity}x {item.name}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-sm font-bold">Total: {currency(order.total)}</p>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold">Histórico de pedidos</h3>
        {historyLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!historyLoading && pastOrders.length === 0 && (
          <p className="text-sm text-muted-foreground">Você ainda não tem outros pedidos nesta loja.</p>
        )}
        {!historyLoading && pastOrders.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border">
            {pastOrders.map((past) => (
              <HistoryRow key={past.id} order={past} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonalDataSection({
  profileId,
  initialName,
  initialPhone,
  onPhoneSaved,
}: {
  profileId: string;
  initialName: string;
  initialPhone: string;
  onPhoneSaved?: (phone: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() }).eq("id", profileId);
    setSaving(false);
    setMessage("Salvo.");
    // Só dispara "telefone completo" quando o campo realmente tem valor —
    // salvar com telefone vazio não deve destravar um pedido pendente. Manda
    // o valor salvo direto (não só um sinal "salvou") porque quem ouve isso
    // (MesaCardapio.tsx) usa esse telefone imediatamente pra retomar
    // submitOrder() — o profile do useSession() de lá é uma instância
    // separada da deste componente e só se atualiza reagindo a mudança de
    // sessão, não a esse update; ler profile?.phone ali logo em seguida
    // pegaria o valor antigo (null) por causa dessa closure desatualizada.
    if (phone.trim() && onPhoneSaved) onPhoneSaved(phone.trim());
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Dados pessoais</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Telefone"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="press rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setMessage(null);
    if (!password || password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setMessage("Senha alterada.");
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Senha</h3>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Nova senha"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirmar senha"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <button
        onClick={handleSave}
        disabled={saving || !password}
        className="press rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando..." : "Trocar senha"}
      </button>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Componente-wrapper só porque JSX não aceita `{addressIcon(x)}` direto como
// tag — precisa de um identificador de componente.
function AddressRowIcon({ label }: { label: string | null }) {
  const Icon = addressIcon(label);
  return <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

const ADDRESS_LABEL_OPTIONS = ["Casa", "Trabalho", "Outro"];

function AddressesSection({
  addresses,
  onSave,
  onUpdate,
  onDelete,
}: {
  addresses: { id: string; label: string | null; address_text: string }[];
  onSave: (text: string, label: string | null) => Promise<void>;
  onUpdate: (id: string, patch: { label?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  async function handleAdd() {
    if (!newText.trim()) return;
    await onSave(newText, newLabel || null);
    setNewText("");
    setNewLabel("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Endereços salvos</h3>

      {addresses.map((address) => (
        <div key={address.id} className="rounded-xl border border-border p-2.5">
          {editingId === address.id ? (
            <div className="space-y-1.5">
              <input
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                placeholder="Nome do endereço"
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    await onUpdate(address.id, { label: editingLabel.trim() || null });
                    setEditingId(null);
                  }}
                  className="press rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="press rounded-full border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <AddressRowIcon label={address.label} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{address.label || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{address.address_text}</p>
                </div>
              </div>
              <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => {
                    setEditingId(address.id);
                    setEditingLabel(address.label ?? "");
                  }}
                  className="press rounded-full px-2.5 py-2 text-[11px] font-bold text-primary hover:bg-primary/10"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(address.id)}
                  aria-label="Apagar endereço"
                  className="press grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="space-y-1.5 rounded-xl border border-border p-2.5">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Rua, número, complemento"
            rows={2}
            className="w-full resize-none rounded-lg border border-border px-2.5 py-1.5 text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {ADDRESS_LABEL_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setNewLabel(option)}
                className={`press rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                  newLabel === option ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nome do endereço (opcional)"
            className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="press rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              Salvar endereço
            </button>
            <button
              onClick={() => setAdding(false)}
              className="press rounded-full border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="press w-full rounded-full border border-border py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          + Adicionar endereço
        </button>
      )}
    </div>
  );
}

function ProfileSection({
  profile,
  phoneRequiredNotice,
  addresses,
  onPhoneSaved,
  onSaveAddress,
  onUpdateAddress,
  onDeleteAddress,
}: {
  profile: { id: string; full_name: string | null; phone: string | null; email: string | null };
  phoneRequiredNotice?: "checkout" | "signup" | null;
  addresses: { id: string; label: string | null; address_text: string }[];
  onPhoneSaved?: (phone: string) => void;
  onSaveAddress: (text: string, label: string | null) => Promise<void>;
  onUpdateAddress: (id: string, patch: { label?: string | null }) => Promise<void>;
  onDeleteAddress: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {phoneRequiredNotice && (
        <div className="rounded-xl bg-accent/20 px-4 py-3 text-sm font-medium text-foreground">
          {phoneRequiredNotice === "signup"
            ? "Bem-vindo! Só falta seu telefone pra você conseguir pedir."
            : "Precisamos do seu telefone pra confirmar o pedido."}
        </div>
      )}
      <PersonalDataSection profileId={profile.id} initialName={profile.full_name ?? ""} initialPhone={profile.phone ?? ""} onPhoneSaved={onPhoneSaved} />
      <div className="space-y-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">E-mail</h3>
        <p className="text-sm">{profile.email ?? "—"}</p>
      </div>
      <PasswordSection />
      <AddressesSection addresses={addresses} onSave={onSaveAddress} onUpdate={onUpdateAddress} onDelete={onDeleteAddress} />
    </div>
  );
}

type Section = "profile" | "orders";

// Tela cheia "Minha conta" — substitui os antigos CustomerProfileSheet
// (bottom sheet) e MyOrderSheet (painel lateral), que eram duas telas
// separadas cada uma com seu ícone no Header. Agora é uma única tela cheia
// com navegação: abas no celular (largura curta, só 2 itens cabem bem no
// topo), menu lateral fixo no desktop (mesmo padrão de tela de conta
// "estilo app de configurações"). `section` é controlado pelo pai
// (MesaCardapio.tsx) — clicar no ícone de conta ou no de "Meu pedido" no
// Header troca a seção sem precisar fechar e reabrir a tela.
export function AccountOverlay({
  section,
  onSectionChange,
  onClose,
  order,
  orderLoading,
  phoneRequiredNotice,
  onPhoneSaved,
}: {
  section: Section;
  onSectionChange: (section: Section) => void;
  onClose: () => void;
  order: MyOrder | null;
  orderLoading: boolean;
  phoneRequiredNotice?: "checkout" | "signup" | null;
  onPhoneSaved?: (phone: string) => void;
}) {
  const { restaurantId } = useTableContext();
  const { profile, isRealCustomer, session } = useSession();
  const { addresses, saveAddress, updateAddress, deleteAddress, reload: reloadAddresses } = useCustomerAddresses();
  const { orders: history, loading: historyLoading } = useOrderHistory(restaurantId, isRealCustomer ? (session?.user.id ?? null) : null);

  if (!isRealCustomer || !profile) return null;

  const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Meu perfil", icon: User },
    { id: "orders", label: "Meu pedido", icon: ClipboardList },
  ];

  function handleSignOut() {
    supabase.auth.signOut();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-6">
        <h2 className="text-lg font-bold">Minha conta</h2>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="press grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Abas no celular — vira menu lateral a partir do sm: (ver <nav> abaixo). */}
      <div className="flex border-b border-border sm:hidden">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`flex-1 border-b-2 py-3 text-sm font-bold ${
              section === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="hidden w-56 shrink-0 flex-col justify-between border-r border-border p-4 sm:flex">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold ${
                    section === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleSignOut}
            className="press flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4.5 w-4.5" aria-hidden />
            Sair
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-xl">
            {section === "profile" && (
              <ProfileSection
                profile={profile}
                phoneRequiredNotice={phoneRequiredNotice}
                addresses={addresses}
                onPhoneSaved={onPhoneSaved}
                onSaveAddress={async (text, label) => {
                  await saveAddress(text, label);
                  reloadAddresses();
                }}
                onUpdateAddress={async (id, patch) => {
                  await updateAddress(id, patch);
                  reloadAddresses();
                }}
                onDeleteAddress={async (id) => {
                  await deleteAddress(id);
                  reloadAddresses();
                }}
              />
            )}
            {section === "orders" && (
              <OrdersSection order={order} orderLoading={orderLoading} history={history} historyLoading={historyLoading} />
            )}

            {/* Sair mora no menu lateral no desktop; no celular (sem coluna
                lateral) vira um botão no fim do conteúdo. */}
            <button
              onClick={handleSignOut}
              className="press mt-8 block w-full rounded-full border border-border py-3 text-sm font-bold text-muted-foreground hover:bg-muted sm:hidden"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
