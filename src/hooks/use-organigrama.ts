"use client";

// Datos del organigrama (docs/organigrama/modulo.md). Directo a Supabase desde el navegador:
// todo pasa por RPC (supabase/migrations/20261012000003_organigrama.sql), que chequean el
// permiso del módulo «organigrama» adentro y hacen cada guardado de una vez (atómico).
//
//   org_leer()                          todo lo que pinta la pantalla, en una sola lectura
//   org_crear_borrador()                abre el borrador (copia de la vigente)
//   org_guardar_borrador(id, cambios)   upsert/borrado de nodos + notas internas
//   org_publicar(id, nota, cambios)     el borrador pasa a ser la vigente
//   org_descartar_borrador(id)
//   org_guardar_ocupantes(cambios)      asignaciones (inmediatas, no pasan por el borrador)
//   org_sembrar(filas)                  «Empezar desde la estructura base» si no hay nada
//
// El estado optimista y la cola de guardado viven en el proveedor
// (src/components/organigrama/proveedor.tsx): este archivo solo habla con la base.

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { desdeServidor, type CambiosNodos, type CambiosOcupantes, type FilaNodo, type LecturaOrg } from "@/lib/organigrama/datos";
import type { Cambio } from "@/lib/organigrama/tipos";

export const CLAVE_ORGANIGRAMA = ["organigrama"] as const;

/** El mensaje de la base (los RAISE están escritos para leerse) o uno genérico. */
function fallo(error: { message?: string } | null): never {
  throw new Error(error?.message?.trim() || "No se pudo hablar con el servidor.");
}

export function useOrganigrama() {
  return useQuery({
    queryKey: CLAVE_ORGANIGRAMA,
    queryFn: async () => {
      // Cuándo SALIÓ el pedido: una respuesta pedida antes del último cambio local puede no
      // traerlo, y el proveedor no la usa para pisar lo que se ve (vuelve a pedir).
      const pedidoEn = Date.now();
      const { data, error } = await createClient().rpc("org_leer");
      if (error) fallo(error);
      return { ...desdeServidor(data as LecturaOrg), pedidoEn };
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export async function crearBorradorOrg(): Promise<string> {
  const { data, error } = await createClient().rpc("org_crear_borrador");
  if (error) fallo(error);
  return data as string;
}

export async function guardarBorradorOrg(version: string, cambios: CambiosNodos): Promise<void> {
  const { error } = await createClient().rpc("org_guardar_borrador", { p_version: version, p_cambios: cambios });
  if (error) fallo(error);
}

export async function publicarOrg(version: string, nota: string, cambios: Cambio[]): Promise<number> {
  const { data, error } = await createClient().rpc("org_publicar", { p_version: version, p_nota: nota, p_cambios: cambios });
  if (error) fallo(error);
  return data as number;
}

export async function descartarBorradorOrg(version: string): Promise<void> {
  const { error } = await createClient().rpc("org_descartar_borrador", { p_version: version });
  if (error) fallo(error);
}

export async function guardarOcupantesOrg(cambios: CambiosOcupantes): Promise<void> {
  const { error } = await createClient().rpc("org_guardar_ocupantes", { p_cambios: cambios });
  if (error) fallo(error);
}

export async function sembrarOrg(filas: FilaNodo[]): Promise<void> {
  const { error } = await createClient().rpc("org_sembrar", { p_filas: filas });
  if (error) fallo(error);
}
