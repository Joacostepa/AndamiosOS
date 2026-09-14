"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Permisos, Rol } from "@/lib/auth/acceso";

export type UserProfile = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  activo: boolean;
  telefono: string | null;
  permisos: Permisos;
  debe_cambiar_clave: boolean;
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
