import { useEffect, useRef } from "react";

// Abas de categoria fixas logo abaixo do header, estilo iFood — a aba ativa
// acompanha a seção visível ao rolar (scroll-spy via IntersectionObserver) e
// tocar numa aba rola até a seção correspondente. Substituiu a navegação em
// tela cheia por categoria (grade → tela dedicada): o cliente prefere rolar
// uma lista contínua com atalho de aba, não trocar de tela a cada categoria.
export function CategoryTabs({
  categories,
  activeCategoryId,
  onSelect,
}: {
  categories: { id: string; name: string }[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string) => void;
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!activeCategoryId) return;
    tabRefs.current[activeCategoryId]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeCategoryId]);

  if (categories.length === 0) return null;

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur-xl md:mx-0 md:px-6">
      <div className="scrollbar-none flex gap-2 overflow-x-auto py-3">
        {categories.map((category) => (
          <button
            key={category.id}
            ref={(el) => {
              tabRefs.current[category.id] = el;
            }}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`press shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              activeCategoryId === category.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}
