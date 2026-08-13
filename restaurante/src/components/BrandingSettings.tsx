import { useState } from "react";
import { ExternalLink, Pipette } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import type { Branding } from "../lib/branding";

const DEFAULT_COLOR = "#F04464";

const PRESET_COLORS = [
  "#F04464",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#84CC16",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#0F172A",
];

export function BrandingSettings({
  restaurantId,
  branding,
  previewUrl,
  onSave,
}: {
  restaurantId: string;
  branding: Branding | null;
  previewUrl: string | null;
  onSave: (input: Branding) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(branding?.display_name ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(branding?.logo_url ?? null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(branding?.favicon_url ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState<string>(branding?.primary_color ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await onSave({
      display_name: displayName.trim() || null,
      logo_url: logoUrl,
      favicon_url: faviconUrl,
      primary_color: primaryColor,
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">Aparência</h3>
          <p className="text-sm text-muted-foreground">O que o cliente vê no cardápio pelo QR Code da mesa.</p>
        </div>
        <a
          href={previewUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!previewUrl}
          title={previewUrl ? undefined : "Crie uma mesa primeiro pra gerar o link"}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold ${
            previewUrl ? "hover:bg-muted" : "pointer-events-none opacity-40"
          }`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver como o cliente vê
        </a>
      </div>

      <div className="space-y-4 rounded-xl border border-border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Nome do restaurante</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Como aparece pro cliente"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
        </div>

        <ImageUploadField
          label="Logo"
          restaurantId={restaurantId}
          kind="branding"
          value={logoUrl}
          onChange={setLogoUrl}
          onUploadingChange={setImageUploading}
        />

        <div>
          <ImageUploadField
            label="Favicon (ícone da aba do navegador)"
            restaurantId={restaurantId}
            kind="branding"
            value={faviconUrl}
            onChange={setFaviconUrl}
            onUploadingChange={setImageUploading}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Ideal: imagem quadrada, PNG.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Cor principal</label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setPrimaryColor(color)}
                aria-label={`Escolher cor ${color}`}
                className={`h-9 w-9 shrink-0 rounded-full transition ${
                  primaryColor.toLowerCase() === color.toLowerCase()
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              title="Escolher outra cor"
            >
              <Pipette className="h-4 w-4" aria-hidden />
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{primaryColor}</p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || imageUploading}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-60"
      >
        {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar aparência"}
      </button>
    </div>
  );
}
