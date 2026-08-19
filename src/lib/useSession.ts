import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type CustomerProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

// Sessão do cliente no storefront — versão enxuta do useSession() de
// admin/restaurante (sem role/restaurant_id: todo mundo aqui é 'customer',
// o perfil não é escopado por restaurante). isRealCustomer centraliza a
// checagem "sessão real, não anônima" que antes vivia duplicada/inline em
// customerAddresses.ts e MesaCardapio.tsx.
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, address")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data as CustomerProfile | null);
        setLoading(false);
      });
  }, [session]);

  const isRealCustomer = !!session && session.user.is_anonymous === false;

  return { session, profile, loading, isRealCustomer };
}
