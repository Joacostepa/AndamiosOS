"use client";

import { Input } from "@/components/ui/input";
import type { CambioParametro, FilaParametro } from "@/hooks/use-panol-config";
import type { ClaveParametro } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";
import { Seccion, fechaHora } from "./ui";

// Parámetros del pañol (pan_parametros). Los cambia sólo un admin —la RLS lo frena igual—;
// los demás los ven en lectura, porque saber "a los cuántos días un faltante pasa a pérdida"
// le sirve a todos. Cada cambio deja una fila en el historial (lo escribe el trigger), y el
// historial no se edita.

type Texto = { nombre: string; antes: string; despues: string; unidad: string; min: number; max: number; ayuda?: string };

export const TEXTO_PARAMETRO: Record<ClaveParametro, Texto> = {
  aviso_inspeccion_dias: { nombre: "Anticipación de avisos de inspección", antes: "Avisar las inspecciones de seguridad con", despues: "días de anticipación", unidad: "días", min: 1, max: 180 },
  vencida_aviso_horas: { nombre: "Aviso de préstamo vencido", antes: "Préstamo vencido: avisar pasadas", despues: "horas", unidad: "h", min: 1, max: 720 },
  faltante_perdida_dias: { nombre: "Faltante a pérdida", antes: "Un faltante pasa a pérdida a los", despues: "días (lo confirma un encargado)", unidad: "días", min: 1, max: 365 },
  conteo_umbral_pct: { nombre: "Umbral de conteo", antes: "Un conteo pide aprobación si la diferencia supera el", despues: "%", unidad: "%", min: 1, max: 100, ayuda: "Va a «Ajustes por aprobar». Lo aprueba otro encargado, no quien contó." },
  kiosco_inactividad_seg: { nombre: "Inactividad del kiosco", antes: "El kiosco vuelve a «¿Quién sos?» tras", despues: "segundos sin uso", unidad: "s", min: 15, max: 600 },
  deshacer_seg: { nombre: "Deshacer en el kiosco", antes: "Un vale se puede deshacer desde el kiosco hasta", despues: "segundos después", unidad: "s", min: 5, max: 3600 },
};

const GRUPOS: { id: string; titulo: string; ayuda?: string; claves: ClaveParametro[] }[] = [
  {
    id: "h-avisos", titulo: "Avisos y plazos",
    ayuda: "A los encargados les llega a la bandeja y al canal de Slack del pañol; a la persona o al capataz, por WhatsApp al teléfono del legajo.",
    claves: ["aviso_inspeccion_dias", "vencida_aviso_horas", "faltante_perdida_dias"],
  },
  { id: "h-conteo", titulo: "Conteo", claves: ["conteo_umbral_pct"] },
  { id: "h-kiosco-param", titulo: "Kiosco", claves: ["kiosco_inactividad_seg", "deshacer_seg"] },
];

export type Borrador = Partial<Record<ClaveParametro, string>>;

/** Los cambios válidos del borrador respecto de lo guardado. */
export function cambiosDe(borrador: Borrador, guardado: FilaParametro[]): Partial<Record<ClaveParametro, number>> {
  const out: Partial<Record<ClaveParametro, number>> = {};
  for (const f of guardado) {
    const crudo = borrador[f.clave];
    if (crudo === undefined || crudo.trim() === "") continue;
    const n = Number(crudo);
    const t = TEXTO_PARAMETRO[f.clave];
    if (!Number.isInteger(n) || (t && (n < t.min || n > t.max))) continue;
    if (n !== f.valor) out[f.clave] = n;
  }
  return out;
}

export function invalidosDe(borrador: Borrador): ClaveParametro[] {
  return (Object.entries(borrador) as [ClaveParametro, string][]).filter(([k, v]) => {
    const n = Number(v);
    const t = TEXTO_PARAMETRO[k];
    return v.trim() === "" || !Number.isInteger(n) || (t && (n < t.min || n > t.max));
  }).map(([k]) => k);
}

export function Parametros({
  parametros, historial, nombreDe, borrador, onCambio, puedeEditar,
}: {
  parametros: FilaParametro[];
  historial: CambioParametro[];
  nombreDe: (userId: string | null) => string;
  borrador: Borrador;
  onCambio: (clave: ClaveParametro, valor: string) => void;
  puedeEditar: boolean;
}) {
  const porClave = new Map(parametros.map((p) => [p.clave, p]));
  const invalidos = new Set(invalidosDe(borrador));

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {GRUPOS.map((g) => (
          <Seccion key={g.id} id={g.id} titulo={g.titulo} ayuda={g.ayuda}>
            <div className="space-y-3 px-4 py-3">
              {g.claves.map((clave) => {
                const fila = porClave.get(clave);
                if (!fila) return null;
                const t = TEXTO_PARAMETRO[clave];
                const valor = borrador[clave] ?? String(fila.valor);
                const cambiado = borrador[clave] !== undefined && valor !== String(fila.valor);
                return (
                  <div key={clave}>
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span>{t.antes}</span>
                      {puedeEditar ? (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={t.min}
                          max={t.max}
                          value={valor}
                          aria-invalid={invalidos.has(clave) || undefined}
                          onChange={(e) => onCambio(clave, e.target.value)}
                          className={cn("h-8 w-20 text-right font-mono", cambiado && "border-2 border-foreground")}
                        />
                      ) : (
                        <strong className="font-mono">{fila.valor}</strong>
                      )}
                      <span>{t.despues}</span>
                    </label>
                    {invalidos.has(clave) && (
                      <p className="mt-1 text-[12px] text-red-700 dark:text-red-300">Tiene que ser un número entero entre {t.min} y {t.max}.</p>
                    )}
                    {t.ayuda && <p className="mt-1 text-[12px] text-muted-foreground">{t.ayuda}</p>}
                  </div>
                );
              })}
            </div>
          </Seccion>
        ))}
      </div>
      {!puedeEditar && (
        <p className="text-[12px] text-muted-foreground">Los parámetros los cambia un administrador. Acá se ven en lectura.</p>
      )}

      <Seccion id="h-historial" titulo="Historial de cambios" ayuda="Cada cambio de un parámetro queda acá, con quién y cuándo. No se edita.">
        {historial.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">Todavía no se cambió ningún parámetro: rigen los valores iniciales.</p>
        ) : (
          <ol className="divide-y">
            {historial.map((h) => {
              const t = TEXTO_PARAMETRO[h.clave];
              return (
                <li key={h.id} className="flex flex-wrap gap-x-3 px-4 py-2 text-[13px]">
                  <span className="font-mono text-[12px] text-muted-foreground">{fechaHora(h.at)}</span>
                  <span>
                    <strong className="font-medium">{nombreDe(h.por)}</strong> · {t?.nombre ?? h.clave}: de {h.antes ?? "—"} a {h.despues} {t?.unidad ?? ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Seccion>
    </>
  );
}
