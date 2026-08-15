import { ShoppingCart } from "lucide-react";

export function Header({
  restaurantName,
  logoUrl,
  cartCount,
  onCartClick,
}: {
  restaurantName: string;
  logoUrl: string | null;
  cartCount: number;
  onCartClick: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-black text-primary-foreground"
          style={logoUrl ? undefined : { backgroundImage: "var(--gradient-primary)" }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            restaurantName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold tracking-tight">{restaurantName}</div>
        </div>
        <button
          type="button"
          aria-label="Carrinho"
          onClick={onCartClick}
          className="press relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-card hover:brightness-105"
        >
          <ShoppingCart className="h-5 w-5" aria-hidden />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
