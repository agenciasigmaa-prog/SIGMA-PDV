import { QrCode } from "lucide-react";

export function Home() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground"
          style={{ backgroundImage: "var(--gradient-primary)" }}
        >
          <QrCode className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-lg font-bold">Acesse pelo QR Code da sua mesa</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O cardápio e o pedido ficam disponíveis a partir do QR Code na sua mesa.
        </p>
      </div>
    </div>
  );
}
