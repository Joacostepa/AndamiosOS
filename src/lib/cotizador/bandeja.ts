// Modelo A — bandeja / pantalla de protección peatonal, por metro lineal.
//
// Reglas (criterio §2.2 y §4.5): primer mes todo incluido en un renglón; mínimo facturable
// (la medida real va en el texto, el mínimo en el importe); concertina a un % del metro de la
// bandeja, sobre los mismos metros facturables; gestoría sólo en CABA; renovación de obra.
// La bandeja de 6 m es un RANGO: el valor lo elige el vendedor y el motor lo controla.

import { nuevaLinea, numero, pesos, type Aviso, type Linea, type Pendiente, type Resultado, type Seccion, type Tarifas } from "./tipos.ts";

export type EntradaBandeja = {
  /** Metros lineales reales (suma de los frentes; en esquina, las dos caras). */
  metros: number;
  /** Altura de la bandeja en metros. 3 es la estándar. */
  altura: number;
  /** $/m.l. elegido: obligatorio para 6 m (rango) y para alturas sin tarifa. */
  precioMl?: number;
  /** Por qué el precio se aparta de la tarifa (va a la nota de la orden). */
  motivoPrecio?: string;
  /**
   * Bonificación declarada, en % (criterio §4.6): se muestra como descuento sobre la lista y
   * la renovación se sigue calculando sobre lista. Lleva motivo, como cualquier desvío.
   */
  bonificacionPct?: number;
  concertina: Seccion | "no";
  gestoria: Seccion | "no";
  enCaba: boolean;
};

type TarifaAltura = { tipo: "fijo"; valor: number } | { tipo: "rango"; min: number; max: number } | null;

function tarifaPorAltura(altura: number, t: Tarifas): TarifaAltura {
  if (altura === 3) return { tipo: "fijo", valor: t.bandeja.m3 };
  if (altura === 6) return { tipo: "rango", min: t.bandeja.m6.min, max: t.bandeja.m6.max };
  if (altura === 8) return { tipo: "fijo", valor: t.bandeja.m8 };
  return null;
}

export function cotizarBandeja(e: EntradaBandeja, t: Tarifas): Resultado<{ facturables: number; precioMl: number | null }> {
  const avisos: Aviso[] = [];
  const pendientes: Pendiente[] = [];
  const lineas: Linea[] = [];

  if (!(e.metros > 0)) {
    return { lineas, avisos: [{ nivel: "bloqueo", codigo: "metros", texto: "Faltan los metros lineales de la bandeja." }], pendientes, renovacionPct: t.renovacionObraPct };
  }

  const facturables = Math.max(e.metros, t.bandeja.minimoMl);
  const tarifa = tarifaPorAltura(e.altura, t);
  let precio: number | null = null;
  let desvio: Linea["desvio"];

  if (tarifa?.tipo === "fijo") {
    precio = e.precioMl ?? tarifa.valor;
    if (e.precioMl !== undefined && e.precioMl !== tarifa.valor) {
      if (!e.motivoPrecio?.trim()) {
        avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `La tarifa de bandeja de ${e.altura} m es ${pesos(tarifa.valor)}/m.l.: para usar ${pesos(e.precioMl)} hace falta el motivo (va a la nota de la orden).` });
      } else {
        desvio = { tarifa: `${pesos(tarifa.valor)}/m.l.`, motivo: e.motivoPrecio.trim() };
      }
    }
  } else if (tarifa?.tipo === "rango") {
    if (e.precioMl === undefined) {
      pendientes.push({
        codigo: "precio_bandeja_6m",
        pregunta: `La bandeja de 6 m va entre ${pesos(tarifa.min)} y ${pesos(tarifa.max)} por m.l.: manda el volumen (más metros, más bajo), la complejidad del apoyo y el contexto comercial. ¿Qué valor usamos?`,
      });
    } else {
      precio = e.precioMl;
      if (precio < tarifa.min || precio > tarifa.max) {
        if (!e.motivoPrecio?.trim()) {
          avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `${pesos(precio)}/m.l. está fuera del rango de 6 m (${pesos(tarifa.min)} – ${pesos(tarifa.max)}): el criterio pide preguntar, y el motivo va a la nota de la orden.` });
        } else {
          desvio = { tarifa: `${pesos(tarifa.min)} – ${pesos(tarifa.max)}/m.l.`, motivo: e.motivoPrecio.trim() };
        }
      }
    }
  } else if (e.precioMl === undefined) {
    pendientes.push({
      codigo: "precio_bandeja_altura",
      pregunta: `No hay tarifa de bandeja para ${numero(e.altura)} m de altura (hay de 3, 6 y 8 m). ¿Qué $/m.l. usamos?`,
    });
  } else {
    precio = e.precioMl;
    avisos.push({ nivel: "advertencia", codigo: "altura_sin_tarifa", texto: `Altura de ${numero(e.altura)} m sin tarifa: se usa ${pesos(precio)}/m.l. como lo definió el vendedor.` });
    if (e.motivoPrecio?.trim()) desvio = { tarifa: "sin tarifa para esa altura", motivo: e.motivoPrecio.trim() };
  }

  const alMinimo = facturables > e.metros;
  if (alMinimo) {
    avisos.push({
      nivel: "info",
      codigo: "minimo_ml",
      texto: `Frente de ${numero(e.metros)} m.l.: se factura el mínimo de ${numero(t.bandeja.minimoMl)} m.l. En el texto va la medida real y el mínimo se declara en el alcance.`,
    });
  }

  let descuentoPct: number | undefined;
  if (e.bonificacionPct) {
    if (e.bonificacionPct < 0 || e.bonificacionPct >= 100) {
      avisos.push({ nivel: "bloqueo", codigo: "bonificacion", texto: "La bonificación tiene que estar entre 0 y 100 %." });
    } else if (!e.motivoPrecio?.trim()) {
      avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `Una bonificación del ${numero(e.bonificacionPct)} % necesita el motivo (va a la nota de la orden).` });
    } else {
      descuentoPct = e.bonificacionPct;
      desvio = desvio ?? { tarifa: `${pesos(precio ?? 0)}/m.l. de lista`, motivo: e.motivoPrecio.trim() };
    }
  }

  if (precio !== null) {
    lineas.push(
      nuevaLinea({
        id: "bandeja",
        grupo: "bandeja",
        seccion: "base",
        producto: "bandeja_ml",
        descripcion: `Bandeja de protección peatonal de ${numero(e.altura)} m — ${numero(e.metros)} m.l.${alMinimo ? ` (se factura el mínimo de ${numero(t.bandeja.minimoMl)} m.l.)` : ""}, primer mes todo incluido`,
        cantidad: facturables,
        precioUnitario: precio,
        descuentoPct,
        unicaVez: false,
        calculo: `${numero(facturables)} m.l. × ${pesos(precio)}/m.l.${alMinimo ? ` (mínimo facturable; real ${numero(e.metros)} m.l.)` : ""}${descuentoPct ? ` − ${numero(descuentoPct)} % de bonificación sobre lista` : ""}`,
        desvio,
      }),
    );

    if (e.concertina !== "no") {
      const precioConcertina = Math.round((precio * t.bandeja.concertinaPct) / 100);
      lineas.push(
        nuevaLinea({
          id: "bandeja:concertina",
          grupo: "bandeja",
          seccion: e.concertina,
          producto: "concertina_ml",
          descripcion: `Alambre tipo concertina perimetral — ${numero(e.metros)} m.l.${alMinimo ? ` (mínimo ${numero(t.bandeja.minimoMl)} m.l.)` : ""}`,
          cantidad: facturables,
          precioUnitario: precioConcertina,
          unicaVez: false,
          calculo: `${numero(facturables)} m.l. × ${pesos(precioConcertina)} (${numero(t.bandeja.concertinaPct)} % del metro de bandeja)`,
        }),
      );
    }
  }

  if (e.gestoria !== "no") {
    if (e.enCaba) {
      lineas.push(
        nuevaLinea({
          id: "gestoria",
          grupo: "bandeja",
          seccion: e.gestoria,
          producto: "gestoria_permiso",
          descripcion: "Gestión del permiso de implantación de andamio en vía pública (GCBA)",
          cantidad: 1,
          precioUnitario: t.complementarios.gestoriaCaba,
          unicaVez: true,
          calculo: `monto fijo ${pesos(t.complementarios.gestoriaCaba)} (sólo CABA)`,
        }),
      );
    } else {
      avisos.push({
        nivel: "advertencia",
        codigo: "gestoria_fuera_caba",
        texto: "Fuera de CABA la gestoría cambia de ítem y probablemente de valor (La Plata → Municipalidad): si no está confirmada, queda afuera.",
      });
    }
  }

  return { lineas, avisos, pendientes, renovacionPct: t.renovacionObraPct, detalle: { facturables, precioMl: precio } };
}
