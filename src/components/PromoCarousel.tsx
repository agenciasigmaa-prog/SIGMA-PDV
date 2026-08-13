import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PromoBanner } from "../lib/promoBanners";

export function PromoCarousel({ banners, onSelect }: { banners: PromoBanner[]; onSelect: (banner: PromoBanner) => void }) {
  const [active, setActive] = useState(0);

  if (banners.length === 0) return null;

  return (
    <section aria-label="Promoções" className="-mx-4 md:mx-0">
      <div className="relative overflow-hidden md:rounded-3xl">
        <div
          className="flex transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {banners.map((banner) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => onSelect(banner)}
              className="relative flex min-h-[150px] w-full shrink-0 items-center overflow-hidden bg-muted p-5 text-left text-white md:min-h-[200px] md:rounded-3xl"
            >
              <img src={banner.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
              <div className="relative z-10 max-w-[72%]">
                <h3 className="text-xl font-bold leading-tight md:text-3xl">{banner.title}</h3>
                {banner.subtitle && <p className="mt-1 text-sm text-white/95 md:text-base">{banner.subtitle}</p>}
                <span className="press mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-foreground shadow-card">
                  {banner.cta_label} <ChevronRight className="h-3 w-3" aria-hidden />
                </span>
              </div>
            </button>
          ))}
        </div>
        {banners.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                aria-label={`Ir para promoção ${index + 1}`}
                onClick={() => setActive(index)}
                className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                  index === active ? "w-5 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
