export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Excluir",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-elevated">
        <h3 className="mb-2 text-lg font-bold">{title}</h3>
        <p className="mb-6 text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-bold hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground hover:brightness-105"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
