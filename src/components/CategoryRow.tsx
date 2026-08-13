import type { Category } from "../lib/menu";

export function CategoryRow({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-bold md:text-xl">Categorias</h2>
      </div>
      <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-6 md:gap-4 md:overflow-visible md:px-0">
        {categories.map((category) => (
          <a
            key={category.id}
            href={`#categoria-${category.id}`}
            className="group press flex w-24 shrink-0 flex-col items-center gap-2 md:w-auto"
          >
            <div className="h-20 w-20 overflow-hidden rounded-2xl bg-muted shadow-xs ring-1 ring-border transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-card group-hover:ring-primary md:h-24 md:w-24">
              {category.image_url ? (
                <img src={category.image_url} alt={category.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
            </div>
            <span className="text-center text-xs font-semibold leading-tight">{category.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
