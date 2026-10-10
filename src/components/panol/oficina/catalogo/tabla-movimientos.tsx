"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/permisos-via-publica/ui";
import { useCatalogoPanol } from "@/hooks/use-panol";
import { formatoCantidad, formatoPesos, useNombreLugar, useNombreQuien, type MovimientoFila } from "@/hooks/use-panol-catalogo";
import { enPanol, TIPO_MOVIMIENTO } from "@/lib/panol/estado";
import { cn } from "@/lib/utils";
import { DialogoAnular } from "./dialogo-motivo";
import { cuando } from "./formato";

// El historial, de solo lectura (la ficha del artículo, la de la herramienta y Movimientos).
// Cada fila dice cuándo, qué, cuánto, quién y para dónde; lo anulado queda tachado con su
// marca y la anulación dice qué anula. "Anular" sólo para encargados, y nunca sobre una
// anulación ni sobre algo ya anulado (la base también lo rechaza).
//
// LA CANTIDAD LLEVA SIGNO RESPECTO DEL PAÑOL: +100 entró a un estante, −20 salió de él. Lo
// que va de afuera a afuera (pasó de mano, faltante → pérdida) va sin signo.

const VUELTA = { bien: "volvió bien", con_falla: "volvió con falla", incompleta: "volvió incompleta" } as const;

function signo(m: MovimientoFila): string {
  const entra = enPanol(m.hacia) && !enPanol(m.desde);
  const sale = enPanol(m.desde) && !enPanol(m.hacia);
  const n = formatoCantidad(m.cantidad);
  return entra ? `+${n}` : sale ? `−${n}` : n;
}

export function TablaMovimientos({
  filas,
  anulados,
  puedeAnular,
  conArticulo = false,
  vacio = "Todavía no hay movimientos.",
}: {
  filas: MovimientoFila[];
  anulados: Set<string>;
  puedeAnular: boolean;
  /** Muestra la columna del artículo (Movimientos); en una ficha sobra. */
  conArticulo?: boolean;
  vacio?: string;
}) {
  const cat = useCatalogoPanol();
  const nombre = useNombreLugar();
  const quien = useNombreQuien();
  const [anular, setAnular] = useState<{ id: string; descripcion: string } | null>(null);
  const articulos = useMemo(() => new Map((cat.data?.articulos ?? []).map((a) => [a.id, a])), [cat.data]);
  const unidades = useMemo(() => new Map((cat.data?.unidades ?? []).map((u) => [u.id, u])), [cat.data]);
  const variantes = useMemo(() => new Map((cat.data?.variantes ?? []).map((v) => [v.id, v])), [cat.data]);
  const porId = useMemo(() => new Map(filas.map((m) => [m.id, m])), [filas]);

  function donde(m: MovimientoFila): string {
    const ot = m.odoo_ot_id ? `OT ${m.odoo_ot_id}` : null;
    const partes: (string | null)[] = [];
    switch (m.tipo) {
      case "retiro":
        partes.push(ot ?? "Sin obra · Taller/Depósito", m.cuadrilla_id ? nombre(`c:${m.cuadrilla_id}`) : null);
        break;
      case "prestamo":
        partes.push(`A ${nombre(m.hacia)}`, ot, m.vence_el ? `vuelve el ${m.vence_el.slice(8, 10)}/${m.vence_el.slice(5, 7)}` : null);
        break;
      case "sobrante":
        partes.push(`Volvió de ${ot ?? "Taller/Depósito"}`);
        break;
      case "devolucion":
        partes.push(`De ${nombre(m.desde)}`, m.estado_vuelta ? VUELTA[m.estado_vuelta] : null, m.motivo ? `«${m.motivo}»` : null);
        break;
      case "ingreso":
        partes.push(
          m.vale?.proveedor || "Proveedor sin cargar",
          m.costo_unitario !== null ? `${formatoPesos(Number(m.costo_unitario))} por unidad` : null,
          m.vale?.comprobante ? `remito ${m.vale.comprobante}` : null,
        );
        break;
      case "anulacion": {
        const o = m.anula_a ? porId.get(m.anula_a) : null;
        partes.push(o ? `Anula «${TIPO_MOVIMIENTO[o.tipo].toLowerCase()} del ${cuando(o.created_at)}»` : "Anula un movimiento anterior", m.motivo ? `motivo: ${m.motivo}` : null);
        break;
      }
      case "revision":
        partes.push(m.nuevo_estado ? `Quedó ${m.nuevo_estado.replace(/_/g, " ")}` : null, m.motivo);
        break;
      default:
        partes.push(`${nombre(m.desde)} → ${nombre(m.hacia)}`, ot, m.motivo, m.denuncia ? `denuncia ${m.denuncia}` : null);
    }
    return partes.filter(Boolean).join(" · ");
  }

  if (filas.length === 0) return <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{vacio}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-[13px]">
        <thead className="text-left text-[12px] text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">Cuándo</th>
            <th className="px-3 py-2 font-medium">Qué</th>
            {conArticulo && <th className="px-3 py-2 font-medium">Artículo</th>}
            <th className="px-3 py-2 text-right font-medium">Cantidad</th>
            <th className="px-3 py-2 font-medium">Quién</th>
            <th className="px-3 py-2 font-medium">Para / de dónde</th>
            {puedeAnular && <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => {
            const anulado = anulados.has(m.id);
            const art = articulos.get(m.articulo_id);
            const uni = m.unidad_id ? unidades.get(m.unidad_id) : null;
            const talle = m.variante_id ? variantes.get(m.variante_id)?.nombre : null;
            const tipo = TIPO_MOVIMIENTO[m.tipo];
            return (
              <tr key={m.id} className={cn("border-b last:border-0 align-top", anulado && "text-muted-foreground")}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{cuando(m.created_at)}</td>
                <td className="px-3 py-2">
                  <span className={cn(anulado && "line-through")}>{tipo}</span>
                  {anulado && <Chip className="ml-1.5">Anulado</Chip>}
                  {m.vale?.sin_encargado && !anulado && <span className="block text-[12px] text-muted-foreground">sin nadie a cargo</span>}
                </td>
                {conArticulo && (
                  <td className="px-3 py-2">
                    {art ? (
                      <Link href={uni ? `/deposito/panol/herramientas/${uni.id}` : `/deposito/panol/stock/${art.id}`} className="underline-offset-2 hover:underline">
                        {art.nombre}{uni ? ` #${uni.numero}` : ""}
                      </Link>
                    ) : "—"}
                    {talle && <span className="text-muted-foreground"> · talle {talle}</span>}
                  </td>
                )}
                <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", anulado && "line-through")}>
                  {uni && !conArticulo ? `#${uni.numero}` : `${signo(m)} ${art?.unidad ?? ""}`}
                  {talle && !conArticulo && <span className="block text-[12px] text-muted-foreground">talle {talle}</span>}
                </td>
                <td className="px-3 py-2">{quien(m.quien_tipo, m.quien_id)}</td>
                <td className="px-3 py-2 text-foreground/80">{donde(m)}</td>
                {puedeAnular && (
                  <td className="px-3 py-1.5 text-right">
                    {m.tipo !== "anulacion" && !anulado && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Anular ${tipo.toLowerCase()} del ${cuando(m.created_at)}`}
                        onClick={() => setAnular({ id: m.id, descripcion: `${tipo} de ${signo(m)} ${art?.unidad ?? ""} del ${cuando(m.created_at)} (${quien(m.quien_tipo, m.quien_id)})` })}
                      >
                        Anular
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <DialogoAnular movimiento={anular} onOpenChange={(o) => !o && setAnular(null)} />
    </div>
  );
}
