import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** Nome do restaurante do usuário logado — usado no cabeçalho das comandas
 * impressas e como fallback amigável antes da consulta terminar. */
export function useRestaurantName(restaurantId: string | null): string {
  const [name, setName] = useState("Restaurante");

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        if (data?.name) setName(data.name);
      });
  }, [restaurantId]);

  return name;
}
