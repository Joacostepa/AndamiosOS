"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type UserProfile = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: "admin" | "operativo" | "deposito" | "campo";
  activo: boolean;
  telefono: string | null;
};

export function useUser() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      return profile as UserProfile | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
