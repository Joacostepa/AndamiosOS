"use client";

// Pantalla Socios 🔒 (§5.5, maqueta renderSocios): banda de "sin pasar a dólares", las tres
// cifras, por socio (contra la proporción acordada si hay política), los dos gráficos,
// Contingencias (colapsado) y el registro de aperturas. Todo llega del servidor ya
// calculado; acá sólo se formatea en la moneda elegida.

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilaCifras, MarcaConfianza, TarjetaCifra, useDireccion, useFormato } from "@/components/direccion";
import { flarga, fcorta, fmtMon, horaBA, diaBA, mesNombre, montoEn, nf, pct } from "@/lib/direccion/formato";
import type { DetalleSocios } from "@/lib/direccion/calculo/socios";
import type { DesvioSocio, PoliticaRetiros, SocioClave } from "@/lib/direccion/calculo/socios-reglas";
import type { Cifra, Monto, ResultadoPantalla } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { GraficoAcumulado, GraficoRetirosMes } from "./graficos";
import { DialogoPolitica } from "./politica";

export type PoliticaParaVista = {
  disponible: boolean;
  vigente: { version: number; contenido: PoliticaRetiros; fecha: string; autor: string | null } | null;
  desvios: DesvioSocio[] | null;
};

type Props = {
  resultado: ResultadoPantalla<DetalleSocios>;
  politica: PoliticaParaVista;
  aperturas: { nombre: string | null; fecha: string }[];
};

function Seccion({ titulo, children, className }: { titulo?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card p-4", className)}>
      {titulo && <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>}
      {children}
    </section>
  );
}

const mesTitulo = mesNombre;

function Banda({ d }: { d: DetalleSocios }) {
  if (!d.mesesSinDolarizar.length) return null;
  const meses = d.mesesSinDolarizar.map(mesTitulo);
  const lista = meses.length > 1 ? `${meses.slice(0, -1).join(", ")} y ${meses[meses.length - 1]}` : meses[0];
  const u = d.ultimaDolarizacion;
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg bg-(--dir-neutro-bg) px-3 py-2.5 text-[13px] text-(--dir-neutro-text)">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <b>◐ Incompleto:</b> {lista[0].toUpperCase() + lista.slice(1)} no {meses.length > 1 ? "tienen" : "tiene"} el asiento que {meses.length > 1 ? "los" : "lo"} pasa a dólares en Odoo (
        {d.socios.map((s, i) => (
          <span key={s.clave}>
            {i > 0 && ", "}
            {s.corto} {fmtMon(s.pendienteDolarizar.ars, "ARS")}
          </span>
        ))}
        ). Dirección {meses.length > 1 ? "los" : "lo"} calcula igual desde las cuentas en pesos, al dólar de cada movimiento.
        {u && ` Última dolarización: ${mesTitulo(u.mes)}${u.cargada ? `, cargada el ${fcorta(u.cargada)}` : ""}${u.por ? ` por ${u.por}` : ""}.`}
      </span>
    </div>
  );
}

function Cifras({ r }: { r: ResultadoPantalla<DetalleSocios> }) {
  const f = useFormato();
  const d = r.detalle;
  const porId = (id: string) => r.cifras.find((c) => c.id === id);
  const retiros = porId("retiros_anio");
  const base = porId("retiros_resultado");
  // Retiros / resultado en la moneda elegida (en pesos de cada mes, o en dólares).
  const rr = d.retSobreRes;
  const p = rr ? (f.moneda === "USD" ? rr.pctUsd : rr.pctArs) : null;
  const resultado: Cifra | undefined = base && (p != null ? { ...base, valor: { tipo: "pct", n: p, decimales: 1 } } : base);
  const caja = porId("retiros_caja");
  return (
    <FilaCifras>
      {retiros && <TarjetaCifra cifra={retiros} titulo={`Retirado en ${d.anio}`} />}
      {resultado && <TarjetaCifra cifra={resultado} titulo={`Retiros / resultado${rr ? ` ${rr.etiqueta}` : ""}`} sinDesglose />}
      {caja && <TarjetaCifra cifra={caja} titulo="Retiros / caja generada" sinDesglose />}
    </FilaCifras>
  );
}

function BarraSocio({ total, dividendos, acordado, max, etiqueta }: { total: number; dividendos: number; acordado: number | null; max: number; etiqueta: string }) {
  const neto = total - dividendos;
  const ancho = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  return (
    <div role="img" aria-label={etiqueta} className="relative mt-1.5 h-4 rounded-[3px] bg-muted">
      <i className="absolute inset-y-0 left-0 rounded-l-[3px] bg-(--dir-serie)" style={{ width: ancho(neto) }} />
      {dividendos > 0 && <i className="dir-trama absolute inset-y-0 border border-(--dir-serie) text-muted-foreground" style={{ left: ancho(neto), width: ancho(dividendos) }} />}
      {acordado != null && <i className="absolute -inset-y-1 w-[3px] bg-foreground" style={{ left: ancho(acordado) }} />}
    </div>
  );
}

function PorSocio({ d, politica, onPolitica, puedeCargar }: { d: DetalleSocios; politica: PoliticaParaVista; onPolitica: () => void; puedeCargar: boolean }) {
  const f = useFormato();
  const n = (m: Monto | null | undefined) => montoEn(m, f.moneda, f.tc) ?? 0;
  const pol = politica.vigente;
  const desvio = (k: SocioClave) => politica.desvios?.find((x) => x.clave === k) ?? null;
  const max = Math.max(1, ...d.socios.map((s) => n(s.anio.total)), ...(politica.desvios ?? []).map((x) => n(x.acordado))) * 1.1;
  const tope = pol?.contenido.topeResultadoPct ?? null;
  const pctRes = d.retSobreRes ? (f.moneda === "USD" ? d.retSobreRes.pctUsd : d.retSobreRes.pctArs) : null;

  return (
    <Seccion titulo={`Por socio${pol ? ", contra la proporción acordada" : ""}`}>
      {d.socios.map((s) => {
        const x = desvio(s.clave);
        return (
          <div key={s.clave} className="border-t py-2 first:border-t-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
              <b className="min-w-[150px]">{s.nombre}</b>
              <span>{d.anio}: <b className="tabular-nums">{f.mon(s.anio.total)}</b></span>
              <span className="text-muted-foreground">dividendos {f.mon(s.anio.dividendos)}</span>
              {d.mesesSinDolarizar.length > 0 && <span className="text-muted-foreground">pendiente de pasar a dólares en Odoo {f.mon(s.pendienteDolarizar)}</span>}
              {x && (
                <>
                  <span>acordado <b className="tabular-nums">{f.mon(x.acordado)}</b></span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums", x.enLinea ? "bg-(--dir-neutro-bg) text-(--dir-neutro-text)" : n(x.desvio) > 0 ? "bg-(--dir-mal-bg) text-(--dir-mal)" : "bg-(--dir-bien-bg) text-(--dir-bien)")}>
                    desvío {f.mon(x.desvio)}
                  </span>
                </>
              )}
            </div>
            <BarraSocio
              total={n(s.anio.total)}
              dividendos={n(s.anio.dividendos)}
              acordado={x ? n(x.acordado) : null}
              max={max}
              etiqueta={`${s.corto}: ${f.mon(s.anio.total)} en ${d.anio}${x ? `, acordado ${f.mon(x.acordado)}` : ""}`}
            />
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        <span><i aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-(--dir-serie) align-middle" />retiros netos</span>
        <span><i aria-hidden className="dir-trama mr-1 inline-block size-2.5 rounded-sm border border-(--dir-serie) align-middle" />dividendos pagados</span>
        {pol && <span><i aria-hidden className="mr-1 inline-block h-2.5 w-[3px] bg-foreground align-middle" />acordado</span>}
      </div>

      <div className="mt-2 grid gap-1 border-t pt-2 text-[13px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span><b>Sin asignar (cuenta 1608)</b> <small className="text-muted-foreground">desde el balance inicial</small></span>
          <span className="tabular-nums">{f.mon(d.sinAsignar)} <MarcaConfianza nivel="ver" /></span>
        </div>
        {Math.abs(d.dividendosPendientes.ars) >= 1 && (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span><b>Dividendos declarados sin pagar</b> <small className="text-muted-foreground">cuenta 2.1.5.01.00</small></span>
            <span className="tabular-nums">{f.mon(d.dividendosPendientes)}</span>
          </div>
        )}
      </div>

      {pol ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2 text-[13px] text-(--dir-bien)">
          <span className="flex-1">
            ✓ Política cargada{pol.autor ? <> por <b>{pol.autor}</b></> : ""} el {flarga(diaBA(pol.fecha))}: Jorge {nf(pol.contenido.proporcionJorge)} % · Gabriel {nf(100 - pol.contenido.proporcionJorge)} %
            {tope != null && ` · tope ${nf(tope)} % del resultado`}
            {pol.contenido.topeCajaPct != null && ` · tope ${nf(pol.contenido.topeCajaPct)} % de la caja generada`}
            {pol.contenido.frecuencia && ` · se compensa ${pol.contenido.frecuencia}`}. Versión {pol.version}.
            {tope != null && pctRes != null && (
              <span className={cn("ml-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", pctRes > tope ? "bg-(--dir-mal-bg) text-(--dir-mal)" : "bg-(--dir-bien-bg) text-(--dir-bien)")}>
                {pct(pctRes, 1)} del resultado {pctRes > tope ? "· sobre el tope" : "· dentro del tope"}
              </span>
            )}
          </span>
          {puedeCargar && <Button variant="outline" size="sm" onClick={onPolitica} className="max-md:h-11">Cambiar política</Button>}
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-1.5 rounded-lg bg-(--dir-neutro-bg) px-3 py-2.5 text-[13px] text-(--dir-neutro-text)">
          <b>Falta la regla</b>
          <span>Para medir desvíos hace falta la proporción acordada y los topes. Hasta que los socios la definan por escrito, esta pantalla muestra retiros sin comparar. No se compara a una persona con la otra.</span>
          {puedeCargar && <Button variant="outline" size="sm" onClick={onPolitica} className="max-md:h-11">Cargar política de retiros</Button>}
          {!politica.disponible && <span className="text-xs">Todavía no se puede guardar la política: falta terminar la instalación.</span>}
        </div>
      )}
    </Seccion>
  );
}

function Contingencias({ d, hasta }: { d: DetalleSocios; hasta: string }) {
  const lista = (filas: { nombre: string; pct: number | null }[]) =>
    filas.length ? filas.map((c, i) => <span key={c.nombre}>{i > 0 && " · "}{c.nombre} <b>{pct(c.pct)}</b></span>) : <span>Sin facturación</span>;
  return (
    <details className="group rounded-lg border bg-card p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold md:min-h-0 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="transition-transform group-open:rotate-90">›</span> Contingencias
      </summary>
      {d.circuitos ? (
        <>
          <p className="mt-2.5 mb-1 text-[13px]">Facturación por circuito, {mesTitulo(d.mesActual)} al {fcorta(hasta)}: {lista(d.circuitos.mes)}</p>
          <p className="text-[13px]">Últimos 12 meses: {lista(d.circuitos.doce)}</p>
        </>
      ) : (
        <p className="mt-2.5 text-[13px] text-muted-foreground">Sin dato · {d.motivoCircuitos}</p>
      )}
      <p className="mt-1.5 text-[12.5px] text-muted-foreground">Para tratar con el contador. No se muestra en ninguna otra pantalla, ni en la narrativa, ni en el modo reunión.</p>
    </details>
  );
}

function Aperturas({ aperturas }: { aperturas: Props["aperturas"] }) {
  return (
    <Seccion titulo="Registro de aperturas">
      {aperturas.length ? (
        <ul className="divide-y text-[13px]">
          {aperturas.map((a, i) => (
            <li key={`${a.fecha}-${i}`} className="flex items-baseline justify-between gap-2 py-1.5">
              <span><b>{a.nombre ?? "Usuario sin nombre"}</b> <small className="text-muted-foreground">abrió Socios</small></span>
              <span className="tabular-nums text-muted-foreground">{fcorta(diaBA(a.fecha))} {horaBA(a.fecha)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">Todavía no hay aperturas registradas (el registro empieza cuando termine la instalación).</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Cada apertura y cada cambio de política quedan registrados con quién y cuándo.</p>
    </Seccion>
  );
}

export function VistaSocios({ resultado, politica, aperturas }: Props) {
  const d = resultado.detalle;
  const { puedeEditar, conSocios } = useDireccion();
  const [dialogo, setDialogo] = useState(false);
  const puedeCargar = puedeEditar && conSocios && politica.disponible;
  return (
    <div className="space-y-4">
      <Banda d={d} />
      <Cifras r={resultado} />
      <PorSocio d={d} politica={politica} onPolitica={() => setDialogo(true)} puedeCargar={puedeCargar} />
      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoRetirosMes d={d} />
        <GraficoAcumulado d={d} />
      </div>
      <Contingencias d={d} hasta={diaBA(resultado.lectura.tomadoAt)} />
      <Aperturas aperturas={aperturas} />
      {puedeCargar && <DialogoPolitica key={politica.vigente?.version ?? 0} abierto={dialogo} onCambio={setDialogo} actual={politica.vigente?.contenido ?? null} />}
    </div>
  );
}
