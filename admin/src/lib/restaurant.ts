export type RestaurantStatus = "onboarding" | "active" | "suspended" | "cancelled";

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  last_order_at: string | null;
};

export const STATUS_LABEL: Record<RestaurantStatus, string> = {
  onboarding: "Onboarding",
  active: "Ativo",
  suspended: "Suporte/Risco",
  cancelled: "Inativo",
};

export const STATUS_ORDER: RestaurantStatus[] = ["onboarding", "active", "suspended", "cancelled"];

export const STATUS_BADGE_CLASS: Record<RestaurantStatus, string> = {
  onboarding: "bg-accent/20 text-accent-foreground",
  active: "bg-success/15 text-success",
  suspended: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export const STATUS_DOT_CLASS: Record<RestaurantStatus, string> = {
  onboarding: "bg-accent",
  active: "bg-success",
  suspended: "bg-destructive",
  cancelled: "bg-muted-foreground",
};

export function nextStatus(status: RestaurantStatus): RestaurantStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  return index < STATUS_ORDER.length - 1 ? STATUS_ORDER[index + 1] : null;
}

export function filterRestaurants(restaurants: Restaurant[], query: string): Restaurant[] {
  const q = query.trim().toLowerCase();
  if (!q) return restaurants;
  return restaurants.filter(
    (restaurant) =>
      restaurant.name.toLowerCase().includes(q) ||
      restaurant.contact_name?.toLowerCase().includes(q) ||
      restaurant.contact_email?.toLowerCase().includes(q),
  );
}
