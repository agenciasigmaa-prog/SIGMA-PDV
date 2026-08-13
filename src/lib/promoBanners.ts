export type PromoBanner = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  image_url: string;
  title: string;
  subtitle: string | null;
  cta_label: string;
  active: boolean;
  sort_order: number;
};
