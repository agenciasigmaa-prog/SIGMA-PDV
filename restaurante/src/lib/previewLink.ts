const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL;

// Não existe mais mesa fixa por QR — o link é por restaurante (só abre o
// cardápio); a mesa é digitada pelo cliente na hora de confirmar o pedido.
// Fica disponível assim que o restaurante existe, sem precisar cadastrar
// nada antes.
export function usePreviewLink(restaurantId: string | null) {
  const url = restaurantId && STOREFRONT_URL ? `${STOREFRONT_URL}/loja/${restaurantId}` : null;
  return { url, loading: false };
}
