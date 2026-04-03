"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type ChatterEntry = {
  id: string;
  tipo: "nota" | "cambio";
  contenido: string;
  autor: string;
  fecha: string;
  detalles?: { campo: string; antes: string; despues: string }[];
};

// Labels for field names to show human-readable changes
const FIELD_LABELS: Record<string, string> = {
  estado: "Estado", titulo: "Título", descripcion_servicio: "Descripción",
  condiciones: "Condiciones", condicion_pago: "Condición de pago",
  total: "Total", subtotal: "Subtotal", nombre: "Nombre",
  direccion: "Dirección", tipo_obra: "Tipo de obra",
  monto_estimado: "Monto estimado", probabilidad: "Probabilidad",
  fecha_cierre_estimada: "Fecha cierre", motivo_perdida: "Motivo pérdida",
};

// Fields to skip (internal, noisy)
const SKIP_FIELDS = new Set([
  "updated_at", "created_at", "id", "codigo", "metadata",
  "iva_monto", "iva_porcentaje", "version", "generado_por_ia",
]);

function parseAuditChanges(antes: any, despues: any): { campo: string; antes: string; despues: string }[] {
  if (!antes || !despues) return [];
  const changes: { campo: string; antes: string; despues: string }[] = [];
  const allKeys = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    const a = antes[key];
    const d = despues[key];
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      const label = FIELD_LABELS[key] || key.replace(/_/g, " ");
      changes.push({
        campo: label,
        antes: a != null ? String(a) : "—",
        despues: d != null ? String(d) : "—",
      });
    }
  }
  return changes;
}

export function useChatterFeed(entidadTipo: string, entidadId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["chatter", entidadTipo, entidadId],
    queryFn: async () => {
      const entries: ChatterEntry[] = [];

      // 1. Audit log entries
      const { data: audits } = await supabase
        .from("audit_log")
        .select("*, user_profiles:usuario_id(nombre, apellido)")
        .eq("entidad_tipo", entidadTipo)
        .eq("entidad_id", entidadId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (audits) {
        for (const a of audits) {
          const changes = parseAuditChanges(a.datos_anteriores, a.datos_nuevos);
          if (changes.length === 0 && a.accion === "UPDATE") continue;

          const autor = a.user_profiles
            ? `${(a.user_profiles as any).nombre} ${(a.user_profiles as any).apellido}`
            : "Sistema";

          let contenido = "";
          if (a.accion === "INSERT") contenido = "Creó el registro";
          else if (a.accion === "DELETE") contenido = "Eliminó el registro";
          else if (changes.length > 0) {
            contenido = changes.map((c) => `${c.campo}: ${c.antes} → ${c.despues}`).join("\n");
          }

          if (contenido) {
            entries.push({
              id: a.id,
              tipo: "cambio",
              contenido,
              autor,
              fecha: a.created_at,
              detalles: changes.length > 0 ? changes : undefined,
            });
          }
        }
      }

      // 2. Comunicaciones (notas manuales)
      const { data: notas } = await supabase
        .from("comunicaciones")
        .select("*, user_profiles:autor_id(nombre, apellido)")
        .eq("entidad_tipo", entidadTipo)
        .eq("entidad_id", entidadId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (notas) {
        for (const n of notas) {
          const autor = n.user_profiles
            ? `${(n.user_profiles as any).nombre} ${(n.user_profiles as any).apellido}`
            : "Usuario";
          entries.push({
            id: n.id,
            tipo: "nota",
            contenido: n.asunto ? `${n.asunto}\n${n.contenido}` : n.contenido,
            autor,
            fecha: n.created_at,
          });
        }
      }

      // Sort all by date desc
      entries.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      return entries;
    },
    enabled: !!entidadId,
  });
}

export function useCreateNota() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      entidad_tipo: string;
      entidad_id: string;
      contenido: string;
      asunto?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("comunicaciones").insert({
        entidad_tipo: data.entidad_tipo,
        entidad_id: data.entidad_id,
        obra_id: data.entidad_tipo === "obras" ? data.entidad_id : null,
        tipo: "nota",
        asunto: data.asunto || "Nota",
        contenido: data.contenido,
        autor_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter", vars.entidad_tipo, vars.entidad_id] });
      qc.invalidateQueries({ queryKey: ["comunicaciones"] });
    },
  });
}
