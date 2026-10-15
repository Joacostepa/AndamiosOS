"use client";

// Vista de Ventas (§5.2, maqueta "7.3 VENTAS"): fila de cifras, facturado neto por mes con la
// banda de ritmo, Qué facturamos + Comercial, Vendido según Odoo (colapsado), ¿Ganamos? y la
// nota al pie. El selector de período lo pone la página arriba (SelectorPeriodo).

import { mesNombre } from "@/lib/direccion/formato";
import type { DetalleVentas } from "@/lib/direccion/calculo/ventas-armar";
import type { Cifra, ResultadoPantalla } from "@/lib/direccion/tipos";
import { useFormato } from "../contexto";
import { FilaCifras, TarjetaCifra } from "../tarjetas";
import { GraficoMeses } from "./grafico-meses";
import { AccionComercial, AvisoGris, Caja, Composicion, Ganamos, Vendido } from "./secciones";

const TITULOS: Record<string, string> = {
  facturado: "Facturado neto",
  nc: "Notas de crédito reales",
  renovacion: "Renovaciones",
  resultado: "Resultado de gestión",
};

export function VistaVentas({ resultado }: { resultado: ResultadoPantalla<DetalleVentas> }) {
  const f = useFormato();
  const d = resultado.detalle;
  // Las comparaciones de las cifras vienen en USD; en pesos se usan las de detalle.comparacionesArs.
  const conMoneda = (c: Cifra): Cifra => (f.moneda === "ARS" && c.id && d.comparacionesArs[c.id] ? { ...c, comparaciones: d.comparacionesArs[c.id] } : c);
  const sinAnioAnterior = d.periodo.vsOpciones.find((o) => o.valor === "anioAnterior")?.disponible === false;
  return (
    <>
      <FilaCifras>
        {resultado.cifras.map((c) => (
          <TarjetaCifra key={c.id ?? c.kpi} cifra={conMoneda(c)} titulo={c.id ? TITULOS[c.id] : undefined} sinDesglose={c.valor.tipo === "sin_dato" && !c.nodo} />
        ))}
      </FilaCifras>

      <Caja
        titulo={
          <>
            Facturado neto por mes <span className="font-medium tracking-normal normal-case">({f.moneda} sin IVA)</span>
          </>
        }
        der={<span className="max-md:hidden">Tocá un mes para elegirlo</span>}
      >
        <GraficoMeses detalle={d} />
        {f.moneda === "ARS" && <div className="mt-2"><AvisoGris>En pesos corrientes la serie crece por inflación: para comparar meses, mirala en USD.</AvisoGris></div>}
      </Caja>

      <div className="grid grid-cols-1 items-start gap-3 min-[1000px]:grid-cols-2">
        <Composicion c={d.composicion} />
        <AccionComercial c={d.comercial} />
      </div>

      <Vendido v={d.vendido} />
      <Ganamos g={d.ganamos} />

      <div className="flex flex-col gap-1 border-t border-dashed pt-2.5 text-xs text-muted-foreground">
        <span>
          <b className="font-semibold">Venta = facturado neto posteado</b> (facturas − notas de crédito). Las órdenes confirmadas no son venta. En USD, cada factura al dólar de su fecha.
        </span>
        {sinAnioAnterior && (
          <span>
            No hay año anterior: la operación en Odoo empieza en {mesNombre(d.periodo.inicio)} {d.periodo.inicio.slice(0, 4)} (la comparación aparece sola en {mesNombre(d.periodo.inicio)}).
          </span>
        )}
      </div>
    </>
  );
}
