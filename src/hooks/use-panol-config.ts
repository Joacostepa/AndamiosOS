"use client";

// Pañol › Configuración y Etiquetas: lo que no es del día a día —ubicaciones, parámetros,
// encargados, kiosco, credenciales y personas externas— y los códigos QR.
//
// Igual que use-panol.ts, va directo a Supabase: el catálogo (ubicaciones, externas) lo
// editan los encargados por tabla y la RLS es la que frena; los parámetros sólo los cambia
// un admin (también RLS). Los códigos y los PIN van por RPC. Lo único que pasa por una ruta
// propia es vincular un legajo, porque `personal` lo editan admin/operativo por rol y no
// los encargados del pañol (ver /api/panol/encargados).

import { useMutation, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useInvalidarPanol } from "@/hooks/use-panol";
import type { ClaveParametro, PersonaExterna, PersonaTipo, TipoUbicacion, Ubicacion } from "@/lib/panol/tipos";
import type { CodigoMin, TipoCodigo } from "@/lib/panol/etiquetas";

function falla(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ─── Ubicaciones (todas, también las desactivadas) ──────────────────────────

export function useUbicacionesTodas() {
  return useQuery({
    queryKey: ["panol", "config", "ubicaciones"],
    queryFn: async () => {
      const { data, error } = await createClient().from("pan_ubicaciones").select("*").order("orden").order("nombre");
      falla(error);
      return (data ?? []) as Ubicacion[];
    },
  });
}

export function useGuardarUbicacion() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (
      u: { id?: string; padre_id?: string | null; nombre?: string; tipo?: TipoUbicacion; orden?: number; activo?: boolean },
    ) => {
      const db = createClient();
      if (u.id) {
        const { id, ...cambios } = u;
        const { data, error } = await db.from("pan_ubicaciones").update(cambios).eq("id", id).select("id");
        falla(error);
        // Sin fila devuelta = la RLS no lo dejó (no es encargado), no un "guardado" mudo.
        if (!data?.length) throw new Error("No se guardó: sólo un encargado del pañol edita las ubicaciones.");
        return id;
      }
      const { data, error } = await db.from("pan_ubicaciones").insert(u).select("id").single();
      falla(error);
      return data!.id as string;
    },
    onSettled: invalidar,
  });
}

/** "Pañol" y "Depósito" de una, para arrancar desde cero. */
export function useCrearRaices() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async () => {
      const { error } = await createClient().from("pan_ubicaciones").insert([
        { nombre: "Pañol", tipo: "panol", orden: 0 },
        { nombre: "Depósito", tipo: "deposito", orden: 10 },
      ]);
      falla(error);
    },
    onSettled: invalidar,
  });
}

// ─── Parámetros ─────────────────────────────────────────────────────────────

export type FilaParametro = { clave: ClaveParametro; valor: number; descripcion: string; updated_at: string; updated_by: string | null };
export type CambioParametro = { id: string; clave: ClaveParametro; antes: number | null; despues: number; por: string | null; at: string };

export function useParametrosConfig() {
  return useQuery({
    queryKey: ["panol", "config", "parametros"],
    queryFn: async () => {
      const db = createClient();
      const [p, h] = await Promise.all([
        db.from("pan_parametros").select("*"),
        db.from("pan_parametros_historial").select("*").order("at", { ascending: false }).limit(30),
      ]);
      falla(p.error);
      falla(h.error);
      return {
        parametros: ((p.data ?? []) as FilaParametro[]).map((f) => ({ ...f, valor: Number(f.valor) })),
        historial: ((h.data ?? []) as CambioParametro[]).map((f) => ({
          ...f, antes: f.antes == null ? null : Number(f.antes), despues: Number(f.despues),
        })),
      };
    },
  });
}

export function useGuardarParametros() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (cambios: Partial<Record<ClaveParametro, number>>) => {
      const db = createClient();
      // De a uno: el trigger deja una fila de historial por cada parámetro que cambia.
      for (const [clave, valor] of Object.entries(cambios)) {
        const { data, error } = await db.from("pan_parametros").update({ valor }).eq("clave", clave).select("clave");
        falla(error);
        if (!data?.length) throw new Error("No se guardó: sólo un administrador cambia los parámetros del pañol.");
      }
    },
    onSettled: invalidar,
  });
}

// ─── Usuarios: encargados y kiosco ──────────────────────────────────────────

export type UsuarioPanol = {
  id: string;
  nombre: string;
  email: string;
  esAdmin: boolean;
  /** Pañol en "editar" (o admin): está a cargo. */
  encargado: boolean;
  /** Sólo el kiosco: el usuario del dispositivo compartido. */
  kiosco: boolean;
};

export function useUsuariosPanol() {
  return useQuery({
    queryKey: ["panol", "config", "usuarios"],
    queryFn: async () => {
      const db = createClient();
      const [u, v] = await Promise.all([
        db.from("user_profiles").select("id, nombre, apellido, email, rol, activo, permisos").eq("activo", true),
        // El último movimiento de cada kiosco, para ver de un vistazo si el dispositivo anda.
        db.from("pan_vales").select("registrado_por, created_at, dispositivo").eq("origen", "kiosco")
          .order("created_at", { ascending: false }).limit(300),
      ]);
      falla(u.error);
      const usuarios: UsuarioPanol[] = (u.data ?? []).map((f) => {
        const permisos = (f.permisos ?? {}) as Record<string, string>;
        const esAdmin = f.rol === "admin";
        const encargado = esAdmin || permisos.panol === "editar";
        return {
          id: f.id as string,
          nombre: `${f.nombre ?? ""} ${f.apellido ?? ""}`.trim() || (f.email as string),
          email: f.email as string,
          esAdmin,
          encargado,
          kiosco: !encargado && permisos["panol-kiosco"] === "editar",
        };
      });
      const ultimoKiosco = new Map<string, string>();
      for (const f of v.data ?? []) {
        if (f.registrado_por && !ultimoKiosco.has(f.registrado_por)) ultimoKiosco.set(f.registrado_por, f.created_at);
      }
      return { usuarios, ultimoKiosco };
    },
  });
}

/** Vincular (o desvincular, con personalId null) el legajo de un usuario. */
export function useVincularLegajo() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (args: { userId: string; personalId: string | null }) => {
      const res = await fetch("/api/panol/encargados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cuerpo.error ?? `Error ${res.status}`);
    },
    onSettled: invalidar,
  });
}

// ─── Códigos QR ─────────────────────────────────────────────────────────────

/** Los códigos activos, para saber qué tiene etiqueta y cuál nunca se imprimió. */
export function useCodigosPanol() {
  return useQuery({
    queryKey: ["panol", "codigos"],
    queryFn: async () => {
      const { data, error } = await createClient().from("pan_codigos")
        .select("codigo, tipo, entidad_id, activo, impreso_at").eq("activo", true);
      falla(error);
      return (data ?? []) as CodigoMin[];
    },
  });
}

/** El código activo de algo; lo crea si no tiene. Con `reimprimir`, anula el anterior. */
export async function codigoDe(tipo: TipoCodigo, entidadId: string, reimprimir = false): Promise<string> {
  const { data, error } = await createClient().rpc("pan_codigo", {
    p_tipo: tipo, p_entidad: entidadId, p_reimprimir: reimprimir,
  });
  if (error) throw new Error(/SOLO_ENCARGADO/.test(error.message) ? "Sólo un encargado del pañol genera códigos." : error.message);
  return data as string;
}

export function useReimprimir() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: (a: { tipo: TipoCodigo; id: string }) => codigoDe(a.tipo, a.id, true),
    onSettled: invalidar,
  });
}

/**
 * Marca los códigos como impresos, para que salgan de "Sólo las nuevas".
 *
 * pan_codigos no tiene UPDATE para nadie (a propósito: un código no se edita), así que
 * esto necesita la RPC pan_marcar_impresos, que todavía NO está en la migración. Mientras
 * no exista, se ignora: la descarga no puede fallar por no poder anotar que se imprimió.
 * Devuelve si pudo marcar.
 */
export async function marcarImpresos(codigos: string[]): Promise<boolean> {
  if (!codigos.length) return true;
  const { error } = await createClient().rpc("pan_marcar_impresos", { p_codigos: codigos });
  if (!error) return true;
  const noExiste = error.code === "PGRST202" || error.code === "42883" || /pan_marcar_impresos/.test(error.message);
  if (!noExiste) console.warn("No se pudieron marcar las etiquetas como impresas:", error.message);
  return false;
}

// ─── Credenciales y PIN ─────────────────────────────────────────────────────

export type EstadoCredencial = { persona_tipo: PersonaTipo; persona_id: string; tiene_pin: boolean; pin_at: string | null };

export function useCredencialesEstado() {
  return useQuery({
    queryKey: ["panol", "config", "credenciales"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("pan_credenciales_estado");
      falla(error);
      return (data ?? []) as EstadoCredencial[];
    },
  });
}

export function useGenerarPin() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (a: { tipo: PersonaTipo; id: string }) => {
      const { data, error } = await createClient().rpc("pan_generar_pin", { p_persona_tipo: a.tipo, p_persona_id: a.id });
      if (error) throw new Error(/SOLO_ENCARGADO/.test(error.message) ? "Sólo un encargado del pañol genera PIN." : error.message);
      return data as string;
    },
    onSettled: invalidar,
  });
}

// ─── Personas externas ──────────────────────────────────────────────────────

export type AltaExterna = Pick<PersonaExterna, "nombre" | "apellido" | "dni" | "empresa" | "cuadrilla_id" | "telefono">;

export function useGuardarExterna() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (x: Partial<AltaExterna> & { id?: string; activo?: boolean }) => {
      const db = createClient();
      if (x.id) {
        const { id, ...cambios } = x;
        const { data, error } = await db.from("pan_personas_externas").update(cambios).eq("id", id).select("id");
        falla(error);
        if (!data?.length) throw new Error("No se guardó: sólo un encargado del pañol edita las personas externas.");
        return id;
      }
      const { data, error } = await db.from("pan_personas_externas").insert(x).select("id").single();
      if (error?.code === "23505") throw new Error("Ya hay una persona externa con ese DNI.");
      falla(error);
      return data!.id as string;
    },
    onSettled: invalidar,
  });
}
