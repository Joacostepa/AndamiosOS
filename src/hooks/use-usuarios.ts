"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Permisos, Rol } from "@/lib/auth/acceso";

export type UsuarioAdmin = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  /** null = la cuenta existe en Supabase Auth pero no tiene perfil. */
  rol: Rol | null;
  activo: boolean;
  permisos: Permisos;
  debeCambiarClave: boolean;
  ultimoIngreso: string | null;
  alta: string;
  sinPerfil: boolean;
};

export type DatosUsuario = {
  nombre: string;
  apellido: string;
  telefono: string | null;
  rol: Rol;
  permisos: Permisos;
};

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

const CLAVE = ["usuarios"];

export function useUsuarios() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async () => (await pedir<{ usuarios: UsuarioAdmin[] }>("/api/usuarios")).usuarios,
  });
}

/** Alta. Devuelve la contraseña temporal, que se muestra UNA vez. */
export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosUsuario & { email: string }) =>
      pedir<{ id: string; clave: string }>("/api/usuarios", { method: "POST", body: JSON.stringify(datos) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useEditarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Partial<DatosUsuario> & { activo?: boolean } }) =>
      pedir<{ ok: true }>(`/api/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(cambios) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLAVE });
      qc.invalidateQueries({ queryKey: ["user-profile"] });
    },
  });
}

/** Genera una contraseña temporal nueva. Devuelve la clave, que se muestra UNA vez. */
export function useResetearClave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pedir<{ clave: string }>(`/api/usuarios/${id}/clave`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}
