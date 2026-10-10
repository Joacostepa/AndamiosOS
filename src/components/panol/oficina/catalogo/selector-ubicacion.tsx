"use client";

import type { Ubicacion } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";

// Selector de ubicaciones del pañol, en árbol. REUSABLE: lo usan el catálogo, el ingreso de
// compra y el alta de unidades; cualquier pantalla de la oficina lo puede usar igual.
//
//   <SelectorUbicacion ubicaciones={cat.ubicaciones} value={id} onChange={setId}
//                      vacio="Todas las ubicaciones" />
//
// Es un <select> nativo con sangría por nivel ("Pañol", "  E3", "    Estante 2"), no un
// combobox: con ~cien ubicaciones se encuentra igual, anda con teclado y en el celular abre
// la rueda del sistema. `vacio` agrega la opción sin ubicación (valor null).
//
// `rutaUbicacion` y `ubicacionesEnArbol` son las mismas cuentas sin pantalla.

const SANGRIA = "   ";

/** Las ubicaciones activas en orden de árbol (padre, hijos por `orden`), con su nivel. */
export function ubicacionesEnArbol(ubicaciones: readonly Ubicacion[]): { u: Ubicacion; nivel: number }[] {
  const activas = ubicaciones.filter((u) => u.activo);
  const ids = new Set(activas.map((u) => u.id));
  const hijos = new Map<string | null, Ubicacion[]>();
  for (const u of activas) {
    // Un hijo cuyo padre está inactivo sube a la raíz: que no desaparezca del selector.
    const padre = u.padre_id && ids.has(u.padre_id) ? u.padre_id : null;
    hijos.set(padre, [...(hijos.get(padre) ?? []), u]);
  }
  for (const l of hijos.values()) l.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const salida: { u: Ubicacion; nivel: number }[] = [];
  const visitar = (padre: string | null, nivel: number) => {
    for (const u of hijos.get(padre) ?? []) {
      salida.push({ u, nivel });
      visitar(u.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return salida;
}

/** "Pañol › E3 › Estante 2 › Cajón E3-2-04". null si no existe. */
export function rutaUbicacion(ubicaciones: readonly Ubicacion[], id: string | null | undefined): string | null {
  if (!id) return null;
  const porId = new Map(ubicaciones.map((u) => [u.id, u]));
  const partes: string[] = [];
  let actual = porId.get(id);
  let vueltas = 0;
  while (actual && vueltas++ < 20) {
    partes.unshift(actual.nombre);
    actual = actual.padre_id ? porId.get(actual.padre_id) : undefined;
  }
  return partes.length ? partes.join(" › ") : null;
}

export function SelectorUbicacion({
  ubicaciones,
  value,
  onChange,
  vacio,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  ubicaciones: readonly Ubicacion[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Texto de la opción "sin ubicación" (null). Sin esto, no se ofrece. */
  vacio?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const arbol = ubicacionesEnArbol(ubicaciones);
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn("h-9 w-full min-w-0 rounded-md border bg-background px-2.5 text-[13px] disabled:opacity-50", className)}
    >
      {(vacio !== undefined || !value) && <option value="">{vacio ?? "Elegí una ubicación"}</option>}
      {arbol.map(({ u, nivel }) => (
        <option key={u.id} value={u.id}>
          {SANGRIA.repeat(nivel)}{u.nombre}
        </option>
      ))}
    </select>
  );
}
