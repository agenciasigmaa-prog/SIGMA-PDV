import { useEffect, useState } from "react";
import { ExternalLink, LayoutGrid, List, Search } from "lucide-react";
import { CategoriesManager } from "../components/CategoriesManager";
import { CategoryAddonsModal } from "../components/CategoryAddonsModal";
import { CategoryFormModal } from "../components/CategoryFormModal";
import { CategorySection } from "../components/CategorySection";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BrandingSettings } from "../components/BrandingSettings";
import { PromoBannerFormModal } from "../components/PromoBannerFormModal";
import { PromoBannersManager } from "../components/PromoBannersManager";
import { ProductPanel } from "../components/ProductPanel";
import { ProductSimulator } from "../components/ProductSimulator";
import { useMenu } from "../lib/useMenu";
import {
  useIngredients,
  saveProductIngredients,
  loadProductIngredientLines,
  type ProductIngredientLine,
} from "../lib/ingredients";
import { useAddonGroups } from "../lib/addonGroups";
import { useBranding } from "../lib/branding";
import { usePromoBanners } from "../lib/promoBanners";
import { saveProductImages } from "../lib/productImages";
import { saveComboItems } from "../lib/comboItems";
import { saveComboChoiceGroups } from "../lib/comboChoiceGroups";
import { useSession } from "../lib/useSession";
import { usePreviewLink } from "../lib/previewLink";
import { filterProducts, type CategoryFilter } from "../lib/productFilters";
import type { Category, Product } from "../lib/menu";
import type { PromoBanner } from "../lib/promoBanners";

const TABS = [
  { id: "produtos", label: "Produtos" },
  { id: "categorias", label: "Categorias" },
  { id: "simulador", label: "Simulador" },
  { id: "aparencia", label: "Aparência" },
  { id: "banners", label: "Banners" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function Cardapio() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const {
    categories,
    products,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    createProduct,
    updateProduct,
    duplicateProduct,
    deleteProduct,
    reorderProducts,
  } = useMenu(restaurantId);
  const { ingredients: ingredientCatalog, reload: reloadIngredients } = useIngredients(restaurantId);
  const {
    groups: addonGroups,
    addons,
    createGroup,
    updateGroup,
    deleteGroup,
    createAddon,
    updateAddon,
    deleteAddon,
  } = useAddonGroups(restaurantId);
  const { url: previewUrl, loading: previewLoading } = usePreviewLink(restaurantId);
  const { branding, save: saveBranding } = useBranding(restaurantId);
  const {
    banners,
    createBanner,
    updateBanner,
    deleteBanner,
    moveBanner,
  } = usePromoBanners(restaurantId);

  const [tab, setTab] = useState<Tab>("produtos");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">(
    () => (localStorage.getItem("sigma:produtos-view") as "list" | "grid") ?? "list",
  );

  useEffect(() => {
    localStorage.setItem("sigma:produtos-view", viewMode);
  }, [viewMode]);

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [addonsCategory, setAddonsCategory] = useState<Category | null>(null);

  const [productModal, setProductModal] = useState<{
    product?: Product;
    defaultCategoryId: string | null;
    initialName?: string;
    initialIngredientLines?: ProductIngredientLine[];
  } | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const [bannerModal, setBannerModal] = useState<{ banner?: PromoBanner } | null>(null);
  const [deletingBanner, setDeletingBanner] = useState<PromoBanner | null>(null);

  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const isFiltering = search.trim() !== "" || categoryFilter !== "all";
  const filteredProducts = filterProducts(products, { search, categoryFilter });
  const uncategorized = filteredProducts
    .filter((p) => p.category_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (!restaurantId) return null;

  const affectedByDelete = deletingCategory
    ? products.filter((p) => p.category_id === deletingCategory.id).length
    : 0;

  async function handleDuplicateProduct(product: Product) {
    const lines = await loadProductIngredientLines(product.id);
    const newId = await duplicateProduct(product);
    if (lines.length > 0) await saveProductIngredients(restaurantId!, newId, lines);
  }

  // Duplica a categoria, todos os produtos dela (com ingredientes) e os
  // grupos de adicionais dela — senão a cópia perderia configuração que
  // hoje pertence à categoria, não ao produto.
  async function handleDuplicateCategory(category: Category) {
    const newCategoryId = await createCategory({
      name: `${category.name} (cópia)`,
      image_url: category.image_url,
      allow_half_and_half: category.allow_half_and_half,
      half_and_half_pricing: category.half_and_half_pricing,
    });

    for (const product of products.filter((p) => p.category_id === category.id)) {
      const lines = await loadProductIngredientLines(product.id);
      const newProductId = await duplicateProduct(product, newCategoryId);
      if (lines.length > 0) await saveProductIngredients(restaurantId!, newProductId, lines);
    }

    for (const group of addonGroups.filter((g) => g.category_id === category.id)) {
      const newGroupId = await createGroup(newCategoryId, group.name, group.required);
      for (const addon of addons.filter((a) => a.group_id === group.id)) {
        await createAddon(newGroupId, { name: addon.name, price: addon.price, active: addon.active });
      }
    }
  }

  return (
    <div>
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Cardápio</h2>
          {!previewLoading && (
            <a
              href={previewUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!previewUrl}
              title={previewUrl ? undefined : "Crie uma mesa primeiro pra gerar o link de pré-visualização"}
              className={`flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold ${
                previewUrl ? "hover:bg-muted" : "pointer-events-none opacity-40"
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver como o cliente vê
            </a>
          )}
        </div>
        <div className="scrollbar-none -mx-4 flex items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 px-4 sm:mx-0 sm:inline-flex sm:w-fit sm:px-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold ${
                tab === t.id ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : categories.length === 0 && products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Seu cardápio ainda está vazio.</p>
          <button
            onClick={() => setCreatingCategory(true)}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-105"
          >
            Criar primeira categoria
          </button>
        </div>
      ) : tab === "categorias" ? (
        <CategoriesManager
          categories={categories}
          products={products}
          onCreate={() => setCreatingCategory(true)}
          onEdit={setEditingCategory}
          onDuplicate={handleDuplicateCategory}
          onDelete={setDeletingCategory}
          onReorder={reorderCategories}
          onManageAddons={setAddonsCategory}
        />
      ) : tab === "simulador" ? (
        <ProductSimulator
          catalog={ingredientCatalog}
          onSendToMenu={({ name, ingredientLines }) => {
            setProductModal({ defaultCategoryId: null, initialName: name, initialIngredientLines: ingredientLines });
            setTab("produtos");
          }}
        />
      ) : tab === "aparencia" ? (
        <BrandingSettings
          restaurantId={restaurantId}
          branding={branding}
          previewUrl={previewUrl}
          onSave={(input) => saveBranding(restaurantId, input)}
        />
      ) : tab === "banners" ? (
        <PromoBannersManager
          banners={banners}
          categories={categories}
          onCreate={() => setBannerModal({})}
          onEdit={(banner) => setBannerModal({ banner })}
          onDelete={setDeletingBanner}
          onMoveUp={(banner) => moveBanner(banner.id, "up")}
          onMoveDown={(banner) => moveBanner(banner.id, "down")}
          onToggleActive={(banner) => updateBanner(banner.id, { active: !banner.active })}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto por nome..."
                className="w-full rounded-xl border border-border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-border px-3 py-2 text-sm sm:w-56"
            >
              <option value="all">Todas as categorias</option>
              <option value="uncategorized">Sem categoria</option>
              {sortedCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="Ver em lista"
                className={`rounded-lg p-1.5 ${viewMode === "list" ? "bg-card shadow-card" : "text-muted-foreground"}`}
              >
                <List className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Ver em cards"
                className={`rounded-lg p-1.5 ${viewMode === "grid" ? "bg-card shadow-card" : "text-muted-foreground"}`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {isFiltering && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filteredProducts.length} produto{filteredProducts.length === 1 ? "" : "s"} encontrado
                {filteredProducts.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                }}
                className="font-semibold text-primary hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {isFiltering && filteredProducts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          ) : (
            <>
              {sortedCategories.map((category) => {
                const categoryProducts = filteredProducts.filter((p) => p.category_id === category.id);
                if (isFiltering && categoryProducts.length === 0) return null;
                return (
                  <CategorySection
                    key={category.id}
                    title={category.name}
                    imageUrl={category.image_url}
                    products={categoryProducts}
                    view={viewMode}
                    dragEnabled={!isFiltering}
                    onAddProduct={() => setProductModal({ defaultCategoryId: category.id })}
                    onEditProduct={(product) => setProductModal({ product, defaultCategoryId: category.id })}
                    onDuplicateProduct={handleDuplicateProduct}
                    onDeleteProduct={(product) => setDeletingProduct(product)}
                    onReorder={reorderProducts}
                    onToggleProductActive={(product) => updateProduct(product.id, { active: !product.active })}
                    onToggleProductSoldOut={(product) => updateProduct(product.id, { sold_out: !product.sold_out })}
                    onToggleProductMostOrdered={(product) =>
                      updateProduct(product.id, { most_ordered: !product.most_ordered })
                    }
                  />
                );
              })}

              {uncategorized.length > 0 && (
                <CategorySection
                  title="Sem categoria"
                  imageUrl={null}
                  products={uncategorized}
                  view={viewMode}
                  dragEnabled={!isFiltering}
                  onAddProduct={() => setProductModal({ defaultCategoryId: null })}
                  onEditProduct={(product) => setProductModal({ product, defaultCategoryId: null })}
                  onDuplicateProduct={handleDuplicateProduct}
                  onDeleteProduct={(product) => setDeletingProduct(product)}
                  onReorder={reorderProducts}
                  onToggleProductActive={(product) => updateProduct(product.id, { active: !product.active })}
                  onToggleProductSoldOut={(product) => updateProduct(product.id, { sold_out: !product.sold_out })}
                  onToggleProductMostOrdered={(product) =>
                    updateProduct(product.id, { most_ordered: !product.most_ordered })
                  }
                />
              )}
            </>
          )}
        </div>
      )}

      {creatingCategory && (
        <CategoryFormModal
          restaurantId={restaurantId}
          onClose={() => setCreatingCategory(false)}
          onSave={createCategory}
        />
      )}

      {editingCategory && (
        <CategoryFormModal
          restaurantId={restaurantId}
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={(input) => updateCategory(editingCategory.id, input)}
        />
      )}

      {deletingCategory && (
        <ConfirmDialog
          title={`Excluir "${deletingCategory.name}"?`}
          message={
            affectedByDelete > 0
              ? `${affectedByDelete} produto(s) desta categoria ficarão sem categoria.`
              : "Essa ação não pode ser desfeita."
          }
          onCancel={() => setDeletingCategory(null)}
          onConfirm={() => {
            deleteCategory(deletingCategory.id);
            setDeletingCategory(null);
          }}
        />
      )}

      {addonsCategory && (
        <CategoryAddonsModal
          category={addonsCategory}
          groups={addonGroups.filter((g) => g.category_id === addonsCategory.id)}
          addons={addons}
          onClose={() => setAddonsCategory(null)}
          onCreateGroup={(name) => createGroup(addonsCategory.id, name)}
          onUpdateGroup={(id, patch) => updateGroup(id, patch)}
          onDeleteGroup={(id) => deleteGroup(id)}
          onCreateAddon={(groupId, input) => createAddon(groupId, input)}
          onUpdateAddon={(id, input) => updateAddon(id, input)}
          onDeleteAddon={(id) => deleteAddon(id)}
        />
      )}

      {bannerModal && (
        <PromoBannerFormModal
          restaurantId={restaurantId}
          categories={categories}
          banner={bannerModal.banner}
          onClose={() => setBannerModal(null)}
          onSave={(input) =>
            bannerModal.banner ? updateBanner(bannerModal.banner.id, input) : createBanner(restaurantId, input)
          }
        />
      )}

      {deletingBanner && (
        <ConfirmDialog
          title={`Excluir "${deletingBanner.title}"?`}
          message="Essa ação não pode ser desfeita."
          onCancel={() => setDeletingBanner(null)}
          onConfirm={() => {
            deleteBanner(deletingBanner.id);
            setDeletingBanner(null);
          }}
        />
      )}

      {productModal && (
        <ProductPanel
          restaurantId={restaurantId}
          categories={categories}
          ingredientCatalog={ingredientCatalog}
          productCatalog={products}
          product={productModal.product}
          defaultCategoryId={productModal.defaultCategoryId}
          initialName={productModal.initialName}
          initialIngredientLines={productModal.initialIngredientLines}
          onClose={() => setProductModal(null)}
          onSave={async ({ ingredientLines, images, comboItems, comboChoiceGroups, ...productInput }) => {
            const productId = productModal.product
              ? (await updateProduct(productModal.product.id, productInput), productModal.product.id)
              : await createProduct({ ...productInput, sold_out: false });
            await saveProductIngredients(restaurantId, productId, ingredientLines);
            await saveProductImages(productId, images);
            await saveComboItems(productId, comboItems);
            await saveComboChoiceGroups(productId, comboChoiceGroups);
            await reloadIngredients();
          }}
        />
      )}

      {deletingProduct && (
        <ConfirmDialog
          title={`Excluir "${deletingProduct.name}"?`}
          message="Essa ação não pode ser desfeita."
          onCancel={() => setDeletingProduct(null)}
          onConfirm={() => {
            deleteProduct(deletingProduct.id);
            setDeletingProduct(null);
          }}
        />
      )}
    </div>
  );
}
