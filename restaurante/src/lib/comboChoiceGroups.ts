import { supabase } from "./supabase";

export type ComboChoiceOptionLine = { product_id: string; name: string };
export type ComboChoiceGroupLine = { id: string; name: string; options: ComboChoiceOptionLine[] };

export async function loadComboChoiceGroups(productId: string): Promise<ComboChoiceGroupLine[]> {
  const { data } = await supabase
    .from("combo_choice_groups")
    .select("id, name, sort_order, combo_choice_options(option_product_id, sort_order, products(id, name))")
    .eq("product_id", productId)
    .order("sort_order");

  return ((data ?? []) as unknown as {
    id: string;
    name: string;
    combo_choice_options: { sort_order: number; products: { id: string; name: string } }[];
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    options: [...row.combo_choice_options]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((opt) => ({ product_id: opt.products.id, name: opt.products.name })),
  }));
}

// Delete-all + insert-all, mesmo padrão de saveComboItems/saveProductIngredients
// — mas em duas etapas porque tem dois níveis (grupo -> opções), precisa do
// id gerado do grupo antes de inserir as opções dele.
export async function saveComboChoiceGroups(productId: string, groups: ComboChoiceGroupLine[]): Promise<void> {
  await supabase.from("combo_choice_groups").delete().eq("product_id", productId);

  for (const [groupIndex, group] of groups.entries()) {
    if (!group.name.trim() || group.options.length === 0) continue;
    const { data: inserted, error } = await supabase
      .from("combo_choice_groups")
      .insert({ product_id: productId, name: group.name.trim(), sort_order: groupIndex })
      .select("id")
      .single();
    if (error || !inserted) continue;

    await supabase.from("combo_choice_options").insert(
      group.options.map((option, optionIndex) => ({
        group_id: inserted.id,
        option_product_id: option.product_id,
        sort_order: optionIndex,
      })),
    );
  }
}
