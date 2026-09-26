"use client";

import { useState } from "react";
import { Loader2, MessageCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActualizarVendedor, useVendedores, type Vendedor } from "@/hooks/use-parametros-cotizacion";

// Quién usa el asistente comercial: el nombre que sale como "Vendedor asignado" en la propuesta
// y el WhatsApp con el que le escribe al asistente.
//
// EL WHATSAPP LO CARGA UN ADMIN (el servidor lo exige): con ese número se le habla al asistente
// COMO esa persona, y puede guardar presupuestos en Odoo en su nombre.

/** 5491155551234 → +54 9 11 5555-1234 (sólo para mostrar; fuera de CABA el área no se separa). */
function mostrarTelefono(t: string | null): string {
  if (!t) return "";
  if (/^54911\d{8}$/.test(t)) return `+54 9 11 ${t.slice(5, 9)}-${t.slice(9)}`;
  if (t.startsWith("549")) return `+54 9 ${t.slice(3)}`;
  return `+${t}`;
}

export function Vendedores({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, error } = useVendedores();
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudieron leer los vendedores"}</p>;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        Las personas con acceso al asistente comercial. El WhatsApp va con código de país y el 9 (54 9 11 5555 1234): con ese número le escribe al asistente; un número que no esté acá no recibe respuesta.
      </p>
      {!data.whatsappConfigurado && (
        <p className="flex items-center gap-2 rounded-md border border-orange-500/40 px-3 py-2 text-[12px] text-orange-400">
          <TriangleAlert className="size-3.5 shrink-0" /> El número de WhatsApp del asistente todavía no está conectado: se pueden cargar los teléfonos, pero no va a contestar hasta que se configure.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[12px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 font-medium">Nombre en la propuesta</th>
              <th className="px-3 py-2 font-medium">WhatsApp</th>
              <th className="px-3 py-2 font-medium">Odoo</th>
              {puedeEditar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.vendedores.map((v) => (
              <FilaVendedor key={`${v.usuarioId}:${v.actualizado ?? ""}`} v={v} puedeEditar={puedeEditar} puedeCargarWhatsapp={data.puedeCargarWhatsapp} />
            ))}
            {!data.vendedores.length && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nadie tiene todavía el módulo del asistente comercial.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaVendedor({ v, puedeEditar, puedeCargarWhatsapp }: { v: Vendedor; puedeEditar: boolean; puedeCargarWhatsapp: boolean }) {
  // Arranca de las props al montar: la fila tiene key con la fecha de actualización, así que
  // después de guardar se vuelve a montar con lo que quedó en la base.
  const actualizar = useActualizarVendedor();
  const [nombre, setNombre] = useState(v.nombreEnPropuesta ?? "");
  const [whatsapp, setWhatsapp] = useState(() => mostrarTelefono(v.whatsapp));
  const cambioNombre = nombre.trim() !== (v.nombreEnPropuesta ?? "");
  const cambioWhatsapp = whatsapp.replace(/\D/g, "") !== (v.whatsapp ?? "");

  function guardar() {
    actualizar.mutate(
      {
        usuarioId: v.usuarioId,
        ...(cambioNombre ? { nombreEnPropuesta: nombre.trim() || null } : {}),
        ...(cambioWhatsapp && puedeCargarWhatsapp ? { whatsapp: whatsapp.trim() || null } : {}),
      },
      { onSuccess: () => toast.success(`Guardado: ${v.nombre}`), onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <tr>
      <td className="px-3 py-2">
        <div className="font-medium">{v.nombre}</div>
        <div className="text-[12px] text-muted-foreground">{v.email}{v.nivel === "ver" ? " · sólo lectura" : ""}</div>
      </td>
      <td className="px-3 py-2">
        {puedeEditar ? (
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={v.nombre} className="h-8 min-w-44" />
        ) : (
          v.nombreEnPropuesta ?? <span className="text-muted-foreground">{v.nombre}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {puedeEditar && puedeCargarWhatsapp ? (
          <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+54 9 11 5555-1234" inputMode="tel" className="h-8 min-w-44" />
        ) : v.whatsapp ? (
          <span className="flex items-center gap-1.5"><MessageCircle className="size-3.5 text-muted-foreground" />{mostrarTelefono(v.whatsapp)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-[12px] text-muted-foreground">{v.vinculadoOdoo ? "Vinculado" : "Se vincula al usarlo"}</td>
      {puedeEditar && (
        <td className="px-3 py-2 text-right">
          <Button size="sm" variant="outline" disabled={(!cambioNombre && !cambioWhatsapp) || actualizar.isPending} onClick={guardar}>
            {actualizar.isPending && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </td>
      )}
    </tr>
  );
}
