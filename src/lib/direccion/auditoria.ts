// El registro de accesos y cambios de Dirección (direccion_auditoria, diseno.md §10.4).
//
// Lo escribe SÓLO el servidor, con la service role: los usuarios no tienen INSERT en la
// tabla (si no, cualquiera podría fabricar filas "abrir_socios" o "actualizar:*", que
// invalidan el snapshot de todos). `usuario` es siempre el de la sesión que ya chequeó la
// ruta. Nunca rompe: sin la tabla (migración sin aplicar), no registra. SÓLO SERVIDOR.

import { createAdminClient } from "@/lib/supabase/admin";
import { esTablaFaltante } from "./supabase.ts";

export type AccionAuditoria =
  | "abrir_socios" | "politica" | "meta" | "dueno" | "config" | "aviso_cargar" | "aviso_cerrar" | "permiso_socios"
  // Dar o sacar Sistemas · Revisión (src/lib/auth/explicitos-servidor.ts; CHECK en 20261022000001).
  | "permiso_sistemas"
  | `actualizar:${string}`;

export async function registrarAuditoria(usuario: string, accion: AccionAuditoria, detalle: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await createAdminClient().from("direccion_auditoria").insert({ usuario, accion, detalle });
    if (error && !esTablaFaltante(error)) console.warn("[direccion] auditoría:", error.message);
  } catch (e) {
    console.warn("[direccion] auditoría:", e instanceof Error ? e.message : e);
  }
}
