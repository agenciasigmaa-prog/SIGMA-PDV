import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { Product } from "../lib/menu";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Aberto ANTES da ficha de produto (ProductDetailSheet) quando a categoria
// permite meio a meio — dois passos num só componente (mais simples que dois
// componentes trocando de mount): primeiro "inteira ou meio a meio?", e só
// se meio a meio for escolhido, a lista de sabores (produtos da mesma
// categoria, sempre sem o item que a pessoa tocou — pedir meio a meio do
// mesmo sabor duas vezes não faz sentido).
export function HalfAndHalfChoiceDialog({
  product,
  options,
  onClose,
  onChooseWhole,
  onChooseHalf,
}: {
  product: Product;
  options: Product[];
  onClose: () => void;
  onChooseWhole: () => void;
  onChooseHalf: (flavor: Product) => void;
}) {
  const [step, setStep] = useState<"choice" | "flavor">("choice");

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:px-6">
      <div className="surface-card flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl sm:pb-6">
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="mb-1 flex items-center gap-1 px-5 pt-3.5 sm:px-6 sm:pt-6">
          {step === "flavor" && (
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => setStep("choice")}
              className="press -ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          <h2 className="flex-1 truncate text-lg font-bold">{step === "choice" ? product.name : "Escolha o outro sabor"}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="press shrink-0 grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </div>

        {step === "choice" ? (
          <div className="space-y-2 px-5 pb-2 pt-3 sm:px-6">
            <p className="mb-1 text-sm text-muted-foreground">Como você quer esse item?</p>
            <button
              type="button"
              onClick={onChooseWhole}
              className="press flex w-full flex-col items-start gap-0.5 rounded-2xl border border-border px-4 py-3.5 text-left hover:bg-muted"
            >
              <span className="text-sm font-bold">Inteira</span>
              <span className="text-xs text-muted-foreground">Só {product.name}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep("flavor")}
              className="press flex w-full flex-col items-start gap-0.5 rounded-2xl border border-border px-4 py-3.5 text-left hover:bg-muted"
            >
              <span className="text-sm font-bold">Meio a meio</span>
              <span className="text-xs text-muted-foreground">Metade {product.name}, metade outro sabor</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2 px-5 pb-2 pt-3 sm:px-6">
            <p className="mb-1 text-xs text-muted-foreground">Metade {product.name} + metade de:</p>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChooseHalf(option)}
                className="press flex w-full items-center gap-3 rounded-2xl border border-border px-3 py-3 text-left hover:bg-muted"
              >
                {option.image_url ? (
                  <img src={option.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-xl" style={{ backgroundImage: "var(--gradient-primary)" }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{option.name}</p>
                  <p className="text-xs text-muted-foreground">{currency(option.price)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
