export type Category = {
  id: string;
  restaurant_id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
  allow_half_and_half: boolean;
  half_and_half_pricing: "higher_price" | "average";
};

export type Product = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  original_price: number | null;
  prep_minutes: number | null;
  most_ordered: boolean;
  active: boolean;
  sold_out: boolean;
  sort_order: number;
};
