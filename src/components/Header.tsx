import { ArrowLeft, Search, ShoppingCart, User } from "lucide-react";

// Header muda de cara ao rolar a página (ou ao tocar na lupa): em vez da
// logo/nome cortados pela metade quando o topo já saiu de vista, mostra uma
// barra de busca de verdade, com uma seta que limpa a busca e volta pro
// topo — troca de estado, não duas barras empilhadas.
export function Header({
  restaurantName,
  logoUrl,
  cartCount,
  onCartClick,
  onAccountClick,
  showSearch,
  searchQuery,
  onSearchChange,
  onExpandSearch,
  onCollapseSearch,
}: {
  restaurantName: string;
  logoUrl: string | null;
  cartCount: number;
  onCartClick: () => void;
  onAccountClick: () => void;
  showSearch: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onExpandSearch: () => void;
  onCollapseSearch: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
        {showSearch ? (
          <>
            <button
              type="button"
              aria-label="Fechar busca"
              onClick={onCollapseSearch}
              className="press grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={`Buscar em ${restaurantName}`}
                aria-label={`Buscar em ${restaurantName}`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </>
        ) : (
          <>
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
              aria-label="Buscar no cardápio"
              onClick={onExpandSearch}
              className="press grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              <Search className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label="Minha conta"
          onClick={onAccountClick}
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-muted"
        >
          <User className="h-5 w-5" aria-hidden />
        </button>
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
