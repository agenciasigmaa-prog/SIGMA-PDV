import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import sigmaLogo from "../assets/sigma-logo.png";

export function Welcome() {
  const { profile } = useSession();
  const [restaurantName, setRestaurantName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.restaurant_id) return;
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", profile.restaurant_id)
      .single()
      .then(({ data }) => setRestaurantName(data?.name ?? null));
  }, [profile?.restaurant_id]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <img src={sigmaLogo} alt="" className="mb-4 h-12 w-12" />
      <h1 className="mb-2 text-2xl font-bold">
        {restaurantName ? `Bem-vindo, ${restaurantName}!` : "Cadastro concluído!"}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Sua conta já está ativa. Comece cadastrando o cardápio do seu restaurante.
      </p>
    </div>
  );
}
