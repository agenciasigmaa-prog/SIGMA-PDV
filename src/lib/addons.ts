export type AddonGroup = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  sort_order: number;
  required: boolean;
};

export type Addon = {
  id: string;
  group_id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
};
