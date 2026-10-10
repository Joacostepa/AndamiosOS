"use client";

// La hoja lateral "Ausencias" (sheetAus): las vigentes el día que se mira, las próximas y
// las terminadas hace poco. Las que vienen de la asistencia de Odoo ("según la asistencia")
// se completan con "Cargar hasta cuándo" o se cierran con "Ya tiene el alta". Arriba,
// "Nueva ausencia" (de todo el día o parcial: llega / se retira a las…).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Ausencia, DiaHoja, TipoAusencia } from "@/lib/hoja-dia/tipos";
import { TIPOS_AUSENCIA, TIPO_AUSENCIA_TXT } from "@/lib/hoja-dia/tipos";
import { addDia, cNombre, fechaLarga, hojaDe, leerHora, nombreDe } from "@/lib/hoja-dia/estado";
import { ausenciasPorGrupo, rangoAusencia } from "@/lib/hoja-dia/vista-cuadrillas";
import { CLAVE_HOJA, useAccionAusencia } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { ChipOpcion } from "@/components/hoja-dia/comunes/menu-flotante";
import { Caja, HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { PRI } from "@/components/hoja-dia/comunes/boton-coral";

const CAMPO = "h-9 w-full rounded-[7px] border border-input bg-hd-card2 px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-11 max-md:text-[15px]";

type Form = { pid: string; tipo: TipoAusencia; desde: string; hasta: string; sinAlta: boolean; parcial: "" | "llega" | "retira"; hora: string };

export function HojaAusencias({ abierta, onCerrar, dia }: { abierta: boolean; onCerrar: () => void; dia: DiaHoja }) {
  const fecha = dia.fecha;
  const aus = useAccionAusencia(fecha);
  const [form, setForm] = useState<Form | null>(null);
  const [horaMal, setHoraMal] = useState(false);
  const [hastaDe, setHastaDe] = useState<string | null>(null);
  const [hastaValor, setHastaValor] = useState(addDia(fecha, 3));
  const desde = addDia(fecha, -21);
  // Las terminadas hace poco no vienen en el día: se piden aparte (las guardadas).
  const terminadas = useQuery({
    queryKey: [...CLAVE_HOJA, "ausencias", desde],
    queryFn: async () => {
      const r = await fetch(`/api/hoja-dia/ausencias?desde=${desde}`);
      if (!r.ok) throw new Error(`Error ${r.status}`);
      return ((await r.json()) as { ausencias: Ausencia[] }).ausencias;
    },
    enabled: abierta,
    staleTime: 30_000,
  });
  const g = ausenciasPorGrupo(dia, terminadas.data ?? []);
  const personas = [...dia.personas].filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const clave = (a: Ausencia) => a.id ?? `asis-${a.personaId}-${a.desde}`;

  const fila = (a: Ausencia, pasada = false) => {
    const k = clave(a);
    const c = hojaDe(dia, a.personaId);
    return (
      <div key={k} className="flex flex-wrap items-center gap-2.5 border-b py-2 text-[13px] last:border-b-0">
        <span className="min-w-[200px] flex-1">
          <b className="font-semibold">{nombreDe(dia, a.personaId)}</b> · {TIPO_AUSENCIA_TXT[a.tipo]}
          <div className="text-xs text-muted-foreground">
            {rangoAusencia(a)}
            {a.origen === "asistencia" ? " · según la asistencia de Odoo" : " · cargada en la hoja"}
            {c != null && ` · está en la ${cNombre(dia, c)}`}
          </div>
          {a.nota && <div className="text-xs text-muted-foreground">{a.nota}</div>}
        </span>
        {pasada ? null : a.id == null ? (
          hastaDe === k ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <input type="date" aria-label="Hasta cuándo" min={fecha} value={hastaValor} onChange={(e) => setHastaValor(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-[13px]" autoFocus />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  aus.mutate({ accion: "crear", personaId: a.personaId, desde: a.desde, hasta: hastaValor, tipo: a.tipo, origen: "asistencia", fechaVista: fecha });
                  setHastaDe(null);
                }}
              >
                Guardar
              </Button>
            </span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setHastaDe(k)}>Cargar hasta cuándo</Button>
              <Button size="sm" variant="outline" onClick={() => aus.mutate({ accion: "alta", fecha, personaId: a.personaId, desde: a.desde, tipo: a.tipo, fechaVista: fecha })}>
                Ya tiene el alta
              </Button>
            </span>
          )
        ) : (
          <Button size="sm" variant="ghost" title="Sólo si se cargó por error" onClick={() => aus.mutate({ accion: "anular", ausenciaId: a.id!, fechaVista: fecha })}>
            Anular
          </Button>
        )}
      </div>
    );
  };

  const guardar = () => {
    if (!form) return;
    let hora: string | null = null;
    if (form.parcial) {
      hora = leerHora(form.hora);
      if (!hora) {
        setHoraMal(true);
        return;
      }
    }
    aus.mutate(
      {
        accion: "crear",
        personaId: form.pid,
        desde: form.desde,
        hasta: form.sinAlta ? null : form.parcial ? form.desde : form.hasta < form.desde ? form.desde : form.hasta,
        tipo: form.tipo,
        horaDesde: form.parcial === "llega" ? hora : null,
        horaHasta: form.parcial === "retira" ? hora : null,
        fechaVista: fecha,
      },
      { onSuccess: () => setForm(null) },
    );
  };

  return (
    <HojaLateral abierta={abierta} onCerrar={onCerrar} titulo="Ausencias" sub="Las previstas, de todo el personal. Las cargás vos o RRHH; las del día llegan por teléfono.">
      {form ? (
        <Caja titulo="Nueva ausencia">
          <div className="grid gap-2.5">
            <label className="grid gap-1 text-[13px]">
              <span className="text-xs text-muted-foreground">Persona</span>
              <select className={CAMPO} value={form.pid} onChange={(e) => setForm({ ...form, pid: e.target.value })}>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-[13px]">
              <span className="text-xs text-muted-foreground">Motivo</span>
              <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-1.5">
                {TIPOS_AUSENCIA.map(([k, l]) => (
                  <ChipOpcion key={k} role="radio" aria-checked={form.tipo === k} activo={form.tipo === k} onClick={() => setForm({ ...form, tipo: k })}>
                    {l}
                  </ChipOpcion>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
              <label className="grid gap-1 text-[13px]">
                <span className="text-xs text-muted-foreground">Desde</span>
                <input type="date" className={CAMPO} value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
              </label>
              <label className="grid gap-1 text-[13px]">
                <span className="text-xs text-muted-foreground">Hasta (incluido)</span>
                <input type="date" className={CAMPO} value={form.hasta} min={form.desde} disabled={form.sinAlta || !!form.parcial} onChange={(e) => setForm({ ...form, hasta: e.target.value })} />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="size-4 accent-foreground" checked={form.sinAlta} onChange={(e) => setForm({ ...form, sinAlta: e.target.checked })} />
              Sin fecha de alta
            </label>
            <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
              <label className="grid gap-1 text-[13px]">
                <span className="text-xs text-muted-foreground">¿Todo el día?</span>
                <select className={CAMPO} value={form.parcial} onChange={(e) => setForm({ ...form, parcial: e.target.value as Form["parcial"] })}>
                  <option value="">Todo el día</option>
                  <option value="llega">Llega a las…</option>
                  <option value="retira">Se retira a las…</option>
                </select>
              </label>
              <label className="grid gap-1 text-[13px]">
                <span className="text-xs text-muted-foreground">Hora</span>
                <input
                  inputMode="numeric"
                  className={CAMPO}
                  value={form.hora}
                  disabled={!form.parcial}
                  aria-invalid={horaMal || undefined}
                  onChange={(e) => {
                    setForm({ ...form, hora: e.target.value });
                    setHoraMal(false);
                  }}
                />
                {horaMal && <span className="text-xs text-hd-rojo">Hora no válida</span>}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Lo que cargues acá es lo previsto. Lo que pasó lo sigue cargando RRHH en la asistencia de Odoo.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
              <Button className={PRI} onClick={guardar} disabled={aus.isPending}>Guardar ausencia</Button>
            </div>
          </div>
        </Caja>
      ) : (
        <div>
          <Button variant="outline" onClick={() => setForm({ pid: personas[0]?.id ?? "", tipo: "enfermedad", desde: fecha, hasta: fecha, sinAlta: false, parcial: "", hora: "14:00" })}>
            Nueva ausencia
          </Button>
        </div>
      )}
      <Caja titulo={<>Vigentes el {fechaLarga(fecha)} <span className="text-xs font-normal text-muted-foreground">({g.vigentes.length})</span></>}>
        {g.vigentes.length ? <div>{g.vigentes.map((a) => fila(a))}</div> : <p className="text-xs text-muted-foreground">Nadie.</p>}
      </Caja>
      <Caja titulo={<>Próximas <span className="text-xs font-normal text-muted-foreground">({g.proximas.length})</span></>}>
        {g.proximas.length ? <div>{g.proximas.map((a) => fila(a))}</div> : <p className="text-xs text-muted-foreground">Nada cargado para más adelante.</p>}
      </Caja>
      {g.terminadas.length > 0 && (
        <Caja titulo={<>Terminadas <span className="text-xs font-normal text-muted-foreground">({g.terminadas.length})</span></>}>
          <div>{g.terminadas.map((a) => fila(a, true))}</div>
        </Caja>
      )}
    </HojaLateral>
  );
}
