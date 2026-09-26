"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  CambioParametro,
  ListaAlquiler,
  Parametro,
  PiezaAlquiler,
  ProductoOdoo,
  Render,
  VersionCriterio,
} from "@/lib/parametros-cotizacion/tipos";
import type { ListaInterpretada } from "@/lib/parametros-cotizacion/lista-alquiler";

// Parámetros de cotización. Todo va contra /api/comercial/parametros: las escrituras las
// hacen funciones de la base que chequean el permiso y dejan el historial, así que acá no
// hay nada optimista — lo que se ve es lo que quedó guardado.

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

const BASE = "/api/comercial/parametros";

export type ResumenParametros = {
  parametros: Parametro[];
  productos: ProductoOdoo[];
  listaVigente: { id: string; nombre: string; vigente_desde: string | null; piezas: number } | null;
  criterioVigente: { version: number; created_at: string } | null;
};

export function useParametrosCotizacion() {
  return useQuery({
    queryKey: ["parametros-cotizacion"],
    queryFn: () => pedir<ResumenParametros>(BASE),
    staleTime: 30 * 1000,
  });
}

/** Todo lo que cambia algo de acá invalida lo mismo: el resumen y el historial. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["parametros-cotizacion"] });
    qc.invalidateQueries({ queryKey: ["parametros-cotizacion-historial"] });
  };
}

export type CambioValor = {
  clave: string;
  valor?: number | null;
  valor_min?: number | null;
  valor_max?: number | null;
  texto?: string | null;
  vigente_desde?: string | null;
  motivo: string;
};

export function useActualizarParametro() {
  const invalidar = useInvalidar();
  return useMutation<{ parametro: Parametro }, Error, CambioValor>({
    mutationFn: (body) => pedir(BASE, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidar,
  });
}

export function useHistorialParametros() {
  return useQuery({
    queryKey: ["parametros-cotizacion-historial"],
    queryFn: async () => (await pedir<{ cambios: CambioParametro[] }>(`${BASE}/historial`)).cambios,
    staleTime: 30 * 1000,
  });
}

// ── Criterio ──────────────────────────────────────────────────────────────────

export type CriterioConVersiones = {
  criterio: { version: number; contenido: string; notas: string | null; created_at: string };
  versiones: VersionCriterio[];
};

export function useCriterio(version?: number) {
  return useQuery({
    queryKey: ["parametros-cotizacion-criterio", version ?? "vigente"],
    queryFn: () => pedir<CriterioConVersiones>(`${BASE}/criterio${version ? `?version=${version}` : ""}`),
    staleTime: 60 * 1000,
  });
}

export function useGuardarCriterio() {
  const qc = useQueryClient();
  const invalidar = useInvalidar();
  return useMutation<{ version: number }, Error, { contenido: string; notas: string }>({
    mutationFn: (body) => pedir(`${BASE}/criterio`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidar();
      qc.invalidateQueries({ queryKey: ["parametros-cotizacion-criterio"] });
    },
  });
}

// ── Lista de alquiler ─────────────────────────────────────────────────────────

export type ListasYPiezas = {
  listas: (ListaAlquiler & { piezas: number })[];
  seleccionada: string | null;
  piezas: PiezaAlquiler[];
};

export function useListaAlquiler(id: string | null) {
  return useQuery({
    queryKey: ["parametros-cotizacion-lista", id ?? "vigente"],
    queryFn: () => pedir<ListasYPiezas>(`${BASE}/lista-alquiler${id ? `?id=${encodeURIComponent(id)}` : ""}`),
    staleTime: 60 * 1000,
  });
}

function useInvalidarListas() {
  const qc = useQueryClient();
  const invalidar = useInvalidar();
  return () => {
    invalidar();
    qc.invalidateQueries({ queryKey: ["parametros-cotizacion-lista"] });
  };
}

/** Lee el .xlsx en el servidor y devuelve lo que entendió, sin guardar. */
export function useVistaPreviaLista() {
  return useMutation<{ vista: ListaInterpretada }, Error, File>({
    mutationFn: (archivo) => {
      const form = new FormData();
      form.set("archivo", archivo);
      form.set("vista", "1");
      return pedir(`${BASE}/lista-alquiler`, { method: "POST", body: form });
    },
  });
}

export function useImportarLista() {
  const invalidar = useInvalidarListas();
  return useMutation<
    { piezas: number; id: string },
    Error,
    { archivo: File; id: string; nombre: string; vigente_desde: string | null; activar: boolean }
  >({
    mutationFn: ({ archivo, id, nombre, vigente_desde, activar }) => {
      const form = new FormData();
      form.set("archivo", archivo);
      form.set("id", id);
      form.set("nombre", nombre);
      if (vigente_desde) form.set("vigente_desde", vigente_desde);
      form.set("activar", activar ? "1" : "0");
      return pedir(`${BASE}/lista-alquiler`, { method: "POST", body: form });
    },
    onSuccess: invalidar,
  });
}

export function useAjustarLista() {
  const invalidar = useInvalidarListas();
  return useMutation<
    { piezas: number; id: string },
    Error,
    { origen: string; id: string; nombre: string; porcentaje: number; vigente_desde: string | null; activar: boolean; motivo: string }
  >({
    mutationFn: (body) => pedir(`${BASE}/lista-alquiler`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidar,
  });
}

export function useActivarLista() {
  const invalidar = useInvalidarListas();
  return useMutation<{ ok: true }, Error, { id: string; motivo: string }>({
    mutationFn: (body) => pedir(`${BASE}/lista-alquiler`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidar,
  });
}

// ── Productos de Odoo ─────────────────────────────────────────────────────────

export function useVerificarProductos() {
  const invalidar = useInvalidar();
  return useMutation<{ ok: number; mal: number; productos: ProductoOdoo[] }, Error, void>({
    mutationFn: () => pedir(`${BASE}/productos`, { method: "POST" }),
    onSuccess: invalidar,
  });
}

// ── Renders ───────────────────────────────────────────────────────────────────

export function useRenders() {
  return useQuery({
    queryKey: ["parametros-cotizacion-renders"],
    queryFn: async () => (await pedir<{ renders: Render[] }>(`${BASE}/renders`)).renders,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSubirRender() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, { archivo: File; tipo: string; nombre: string; por_defecto: boolean }>({
    mutationFn: async ({ archivo, tipo, nombre, por_defecto }) => {
      const ext = (archivo.name.split(".").pop() ?? "").toLowerCase();
      const extension = ext === "jpeg" ? "jpg" : ext;
      const destino = await pedir<{ path: string; token: string }>(`${BASE}/renders`, {
        method: "POST",
        body: JSON.stringify({ accion: "subir", extension }),
      });
      const { error } = await createClient()
        .storage.from("comercial")
        .uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: archivo.type || undefined });
      if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
      return pedir(`${BASE}/renders`, {
        method: "POST",
        body: JSON.stringify({ accion: "registrar", tipo, nombre, path: destino.path, por_defecto }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parametros-cotizacion-renders"] }),
  });
}

export function useRenderPorDefecto() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => pedir(`${BASE}/renders`, { method: "PATCH", body: JSON.stringify({ id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parametros-cotizacion-renders"] }),
  });
}

export function useBorrarRender() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => pedir(`${BASE}/renders?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parametros-cotizacion-renders"] }),
  });
}

// ── Vendedores ────────────────────────────────────────────────────────────────

export type Vendedor = {
  usuarioId: string;
  nombre: string;
  email: string;
  nivel: "ver" | "editar";
  nombreEnPropuesta: string | null;
  whatsapp: string | null;
  vinculadoOdoo: boolean;
  actualizado: string | null;
};

export function useVendedores() {
  return useQuery({
    queryKey: ["parametros-cotizacion-vendedores"],
    queryFn: () => pedir<{ vendedores: Vendedor[]; whatsappConfigurado: boolean; puedeCargarWhatsapp: boolean }>(`${BASE}/vendedores`),
  });
}

export function useActualizarVendedor() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { usuarioId: string; nombreEnPropuesta?: string | null; whatsapp?: string | null }>({
    mutationFn: (cambio) => pedir(`${BASE}/vendedores`, { method: "PATCH", body: JSON.stringify(cambio) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parametros-cotizacion-vendedores"] }),
  });
}
