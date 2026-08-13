import { useEffect, useState, type ChangeEvent } from "react";

function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Digita só números, formata como dinheiro (R$ 29,90) igual campo de valor de
// app de banco — sem setinhas de number input, sem precisar acertar "." vs ",".
export function CurrencyInput({
  value,
  onChange,
  placeholder = "R$ 0,00",
  required,
  className = "",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [cents, setCents] = useState(value != null ? Math.round(value * 100) : 0);

  useEffect(() => {
    setCents(value != null ? Math.round(value * 100) : 0);
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digitsOnly = event.target.value.replace(/\D/g, "");
    const nextCents = digitsOnly ? Number(digitsOnly) : 0;
    setCents(nextCents);
    onChange(nextCents > 0 ? nextCents / 100 : null);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={cents > 0 ? centsToDisplay(cents) : ""}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}
