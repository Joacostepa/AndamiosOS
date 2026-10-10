"use client";

import { nombreCompleto, usePersonasPanol } from "@/hooks/use-panol";
import { cn } from "@/lib/utils";

// Selectores de personas y cuadrillas para la oficina del pañol. REUSABLES.
//
//   <SelectorPersona value={quien} onChange={setQuien} vacio="Todas las personas" />
//   <SelectorCuadrilla value={id} onChange={setId} vacio="Todas las cuadrillas" />
//
// Leen solos usePersonasPanol() (Legajos + externas + cuadrillas). La persona viaja como
// { tipo, id }, que es lo que piden los filtros y el `quien` de un vale. Las dadas de baja
// se ofrecen al final ("Ya no están"): el historial las sigue nombrando.

export type QuienPanol = { tipo: "persona" | "externa"; id: string };

const CLASE = "h-9 w-full min-w-0 rounded-md border bg-background px-2.5 text-[13px] disabled:opacity-50";

export function SelectorPersona({
  value,
  onChange,
  vacio = "Elegí una persona",
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: QuienPanol | null;
  onChange: (q: QuienPanol | null) => void;
  vacio?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const { data } = usePersonasPanol();
  const personas = data?.personas ?? [];
  const clave = value ? `${value.tipo}:${value.id}` : "";
  const grupo = (tipo: "persona" | "externa", activo: boolean) =>
    personas.filter((p) => p.tipo === tipo && p.activo === activo)
      .sort((a, b) => a.apellido.localeCompare(b.apellido, "es") || a.nombre.localeCompare(b.nombre, "es"));
  const opciones = (l: typeof personas) =>
    l.map((p) => (
      <option key={`${p.tipo}:${p.id}`} value={`${p.tipo}:${p.id}`}>
        {nombreCompleto(p)}{p.tipo === "externa" && p.detalle ? ` (${p.detalle})` : ""}
      </option>
    ));
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={clave}
      onChange={(e) => {
        const [tipo, pid] = e.target.value.split(":");
        onChange(pid ? { tipo: tipo as QuienPanol["tipo"], id: pid } : null);
      }}
      className={cn(CLASE, className)}
    >
      <option value="">{vacio}</option>
      <optgroup label="Legajos">{opciones(grupo("persona", true))}</optgroup>
      {grupo("externa", true).length > 0 && <optgroup label="Externas">{opciones(grupo("externa", true))}</optgroup>}
      {[...grupo("persona", false), ...grupo("externa", false)].length > 0 && (
        <optgroup label="Ya no están">{opciones([...grupo("persona", false), ...grupo("externa", false)])}</optgroup>
      )}
    </select>
  );
}

export function SelectorCuadrilla({
  value,
  onChange,
  vacio = "Elegí una cuadrilla",
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  vacio?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const { data } = usePersonasPanol();
  const capataz = (rid: string | null) => {
    const p = rid ? data?.personas.find((x) => x.tipo === "persona" && x.id === rid) : null;
    return p ? ` · ${nombreCompleto(p)}` : "";
  };
  return (
    <select id={id} aria-label={ariaLabel} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={cn(CLASE, className)}>
      <option value="">{vacio}</option>
      {(data?.cuadrillas ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}{capataz(c.responsableId)}{c.activo ? "" : " (disuelta)"}
        </option>
      ))}
    </select>
  );
}
