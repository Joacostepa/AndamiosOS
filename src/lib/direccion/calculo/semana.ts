// Calculador de La semana (/direccion). ¿Cómo estamos y qué hay que decidir?
//
// No lee Odoo directo: toma el resultado cacheado de las otras pantallas (ctx.pantalla) y
// sus resumen<Area>(), y arma con semana-armar.ts (puro, con test):
//  · la narrativa (2 fijas + hasta 2 candidatas por prioridad; retiros sólo en el pie);
//  · las 7 tarjetas (retiros `reservado`);
//  · "Para decidir" (todas las decisiones de las áreas, ordenadas);
//  · el panel de Calidad (registro de Datos).
// Las áreas se leen en paralelo; si una falla, su parte queda "Sin dato" con el motivo. Si no
// responde NINGUNA de las operativas (Odoo caído), tira: servidor.ts muestra el último
// snapshot con la banda "No pudimos leer Odoo".
//
// Socios se calcula siempre en la caché compartida (como toda pantalla) y lo que se toma de
// ahí va `reservado`: el servidor lo recorta a quien no tiene direccion-socios.

import { definirCalculador, type CtxCalculo } from "./contrato.ts";
import { EscrituraProhibidaError, motivoPublico } from "../odoo-lectura.ts";
import { resumenCaja, type DetalleCaja, type ResumenCaja } from "./caja.ts";
import type { Cifra } from "../tipos.ts";
import { resumenCobranzas, type DetalleCobranzas } from "./cobranzas.ts";
import { resumenCalle, type DetalleCalle } from "./calle.ts";
import { resumenVentas } from "./ventas.ts";
import { resumenSocios, type DetalleSocios } from "./socios.ts";
import { resumenCalidad, type DetalleDatos } from "./datos.ts";
import { armarSemana, combinarSemana, topLlamar, type DetalleSemana, type Parte } from "./semana-armar.ts";
import { filtrarReservado } from "../reservado.ts";

export type { DetalleSemana } from "./semana-armar.ts";

type ParteConError<T> = Parte<T> & { error?: unknown };

async function parte<T>(p: Promise<T>): Promise<ParteConError<T>> {
  try {
    return { ok: true, v: await p };
  } catch (e) {
    if (e instanceof EscrituraProhibidaError) throw e; // un bug, no una caída de Odoo
    console.warn("[direccion] semana · parte:", e instanceof Error ? e.message : e);
    return { ok: false, motivo: motivoPublico(e), error: e };
  }
}

async function calcular(ctx: CtxCalculo) {
  const [caja, ventas, cobranzas, calle, socios, calidad] = await Promise.all([
    // Caja en dos versiones: con los retiros en el flujo (socios) y sin ellos (el resto).
    parte(
      ctx.pantalla<DetalleCaja>("caja").then((r) => {
        const chequesPropios = r.cifras.find((c) => c.kpi === "cheques_propios") ?? null;
        return {
          socios: { ...resumenCaja(filtrarReservado(r, true)), chequesPropios },
          publico: { ...resumenCaja(filtrarReservado(r, false)), chequesPropios },
        };
      }),
    ),
    parte(resumenVentas(ctx)),
    parte(
      ctx.pantalla<DetalleCobranzas>("cobranzas").then((r) => ({
        ...resumenCobranzas(r),
        llamar: topLlamar(r.detalle?.clientes ?? []),
      })),
    ),
    parte(ctx.pantalla<DetalleCalle>("calle").then((r) => resumenCalle(r))),
    parte(ctx.pantalla<DetalleSocios>("socios").then((r) => ({ ...resumenSocios(r), anio: r.detalle.anio }))),
    parte(ctx.pantalla<DetalleDatos>("datos").then((r) => resumenCalidad(r))),
  ]);

  // Odoo caído: no respondió ninguna operativa. Que tire, así se usa el último snapshot.
  const operativas: ParteConError<unknown>[] = [caja, ventas, cobranzas, calle];
  if (operativas.every((x) => !x.ok)) throw operativas.find((x) => x.error)?.error ?? new Error("No respondió ninguna pantalla.");

  const base = { hoy: ctx.hoy, ventas, cobranzas, calle, socios, calidad };
  type ResumenCajaSemana = ResumenCaja & { chequesPropios: Cifra | null };
  const cajaDe = (k: "socios" | "publico"): Parte<ResumenCajaSemana> => (caja.ok ? { ok: true, v: caja.v[k] } : { ok: false, motivo: caja.motivo });
  return combinarSemana(armarSemana({ ...base, caja: cajaDe("socios") }), armarSemana({ ...base, caja: cajaDe("publico") }));
}

export const calculador = definirCalculador<DetalleSemana>({ pantalla: "semana", calcular });
