"use client";

// Agregar y sacar gente de la obra, desde el panel de la OT.
//
// NO TIENE QUERY PROPIA: los contactos vienen dentro de la ficha de la OT
// (useDetalleOt), porque se leen de la venta que esa ficha ya estaba leyendo. Una query
// aparte sería una llamada más para un dato que ya viene en la mano.
//
// Por eso lo que se invalida al escribir es la ficha, no una caché de contactos.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

const URL_API = "/api/planificacion/contactos-obra";

export type NuevoContacto = {
  ventaId: number;
  nombre: string;
  rol?: string | null;
  telefono?: string | null;
  email?: string | null;
};

export function useAgregarContactoObra(otId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: NuevoContacto) =>
      pedir<{ id: number }>(URL_API, { method: "POST", body: JSON.stringify(datos) }),
    // NO es optimista, a diferencia del resto del tablero: acá la escritura es un
    // formulario que se completa y se envía una vez, no una ráfaga de arrastres. Esperar
    // el segundo que tarda Odoo es honesto —el contacto aparece cuando existe de verdad—
    // y evita tener que deshacer una fila falsa si el alta falla.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tablero-ot-detalle", otId] });
      toast.success("Contacto agregado a la obra");
    },
    onError: (e: Error) => toast.error("No se pudo agregar el contacto", { description: e.message }),
  });
}

export function useBorrarContactoObra(otId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      pedir<{ ok: true }>(URL_API, { method: "DELETE", body: JSON.stringify({ id }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tablero-ot-detalle", otId] });
      toast.success("Contacto quitado de la obra");
    },
    onError: (e: Error) => toast.error("No se pudo quitar el contacto", { description: e.message }),
  });
}
