// Modelo B — estructura en fachada, por m².
//
// Reglas (criterio §2.1, §3.2): superficie = desarrollo (suma de frentes) × altura; primer mes
// todo incluido en UN renglón; en estructuras altas el precio se escalona por altura y se
// PROMEDIA en el mismo renglón (Joaquín pidió que no se vea partido); el encuadre se pregunta:
//   A — rango por complejidad: el $/m² sale de lo que la obra requiere, sin descuento visible;
//   B — lista con bonificación declarada: se ve el valor de lista y el descuento, y la
//       renovación se calcula sobre lista.

import { alMultiplo, alCentavo, nuevaLinea, numero, pesos, type Aviso, type Linea, type Pendiente, type Rango, type Resultado, type Seccion, type Tarifas } from "./tipos.ts";

export type CategoriaFachada = "licitacion" | "estandar" | "escaleras" | "completa" | "compleja" | "especial";

export const CATEGORIAS_FACHADA: Record<CategoriaFachada, string> = {
  licitacion: "piso de licitación (gestoría e ingeniería absorbidas)",
  estandar: "estándar: bandeja en PB, 1–2 filas de tablones",
  escaleras: "con núcleo de escaleras, 2 filas completas, media sombra",
  completa: "completa (bandeja + media sombra + 2 filas) o superficie chica",
  compleja: "interior, patio, acceso comprometido o fases",
  especial: "fuera del AMBA o patrimonial",
};

export type EntradaFachada = {
  /** Metros lineales de cada cara (en esquina, cada cara por separado). */
  frentes: number[];
  altura: number;
  encuadre: "A" | "B";
  /** Encuadre A: qué rango aplica. */
  categoria?: CategoriaFachada;
  /** Encuadre A: el $/m² elegido (obligatorio cuando la categoría es un rango). */
  precioM2?: number;
  /** Encuadre B: bonificación sobre la lista, en %. */
  bonificacionPct?: number;
  motivoPrecio?: string;
  /** Escalonamiento: hasta qué altura va el tramo bajo y cuánto sube el alto.
   *  null = se preguntó y no va escalonado · undefined = no se preguntó. */
  escalonado?: { alturaCorte: number; salto: "A" | "B" | number } | null;
  gestoria: Seccion | "no";
  enCaba: boolean;
};

function rangoDe(c: CategoriaFachada, t: Tarifas): Rango | number {
  switch (c) {
    case "licitacion": return t.fachada.licitacion;
    case "estandar": return t.fachada.estandar;
    case "escaleras": return t.fachada.escaleras;
    case "completa": return t.fachada.completa;
    case "compleja": return t.fachada.compleja;
    case "especial": return t.fachada.especial;
  }
}

const textoRango = (r: Rango | number) => (typeof r === "number" ? pesos(r) : `${pesos(r.min)} – ${pesos(r.max)}`);

export function cotizarFachada(e: EntradaFachada, t: Tarifas): Resultado<{ desarrollo: number; superficie: number; precioM2: number | null; precioBajo: number | null; precioAlto: number | null }> {
  const avisos: Aviso[] = [];
  const pendientes: Pendiente[] = [];
  const lineas: Linea[] = [];

  const desarrollo = alCentavo(e.frentes.reduce((a, b) => a + b, 0));
  const superficie = alCentavo(desarrollo * e.altura);
  if (!(desarrollo > 0) || !(e.altura > 0)) {
    return { lineas, avisos: [{ nivel: "bloqueo", codigo: "medidas", texto: "Faltan los frentes o la altura de la fachada." }], pendientes, renovacionPct: t.renovacionObraPct };
  }

  if (e.altura > 250 || desarrollo > 2000) {
    avisos.push({ nivel: "bloqueo", codigo: "medida_absurda", texto: `${numero(desarrollo)} m.l. × ${numero(e.altura)} m no parece real (el edificio más alto del país ronda los 235 m): verificá la medida antes de calcular.` });
  }

  // ── Precio base ($/m² del tramo bajo, o único) ──────────────────────────────
  let base: number | null = null;
  let desvio: Linea["desvio"];
  let descuentoPct: number | undefined;

  if (e.encuadre === "B") {
    base = t.fachada.lista;
    if (e.bonificacionPct !== undefined && e.bonificacionPct !== 0) {
      if (e.bonificacionPct < 0 || e.bonificacionPct >= 100) {
        avisos.push({ nivel: "bloqueo", codigo: "bonificacion", texto: "La bonificación tiene que estar entre 0 y 100 %." });
      } else {
        descuentoPct = e.bonificacionPct;
      }
    }
    if (e.precioM2 !== undefined && e.precioM2 !== base) {
      avisos.push({ nivel: "advertencia", codigo: "encuadre_b_precio", texto: `En el encuadre B se muestra la lista (${pesos(base)}/m²) y el descuento: el precio pedido se ignora, ajustá la bonificación.` });
    }
  } else {
    if (!e.categoria) {
      pendientes.push({
        codigo: "categoria_fachada",
        pregunta: "¿Qué tipo de fachada es? Define el rango de $/m².",
        opciones: Object.entries(CATEGORIAS_FACHADA).map(([k, v]) => `${k}: ${v} (${textoRango(rangoDe(k as CategoriaFachada, t))})`),
      });
    } else {
      const r = rangoDe(e.categoria, t);
      if (typeof r === "number") {
        base = e.precioM2 ?? r;
        if (e.precioM2 !== undefined && e.precioM2 !== r) {
          if (!e.motivoPrecio?.trim()) avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `La categoría ${e.categoria} va a ${pesos(r)}/m²: para usar ${pesos(e.precioM2)} hace falta el motivo.` });
          else desvio = { tarifa: `${pesos(r)}/m²`, motivo: e.motivoPrecio.trim() };
        }
      } else if (e.precioM2 === undefined) {
        pendientes.push({
          codigo: "precio_fachada",
          pregunta: `Fachada ${CATEGORIAS_FACHADA[e.categoria]}: va entre ${pesos(r.min)} y ${pesos(r.max)} por m². ¿Qué valor usamos?`,
        });
      } else {
        base = e.precioM2;
        if (base < r.min || base > r.max) {
          if (!e.motivoPrecio?.trim()) avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `${pesos(base)}/m² está fuera del rango ${textoRango(r)}: hace falta el motivo (va a la nota de la orden).` });
          else desvio = { tarifa: `${textoRango(r)}/m²`, motivo: e.motivoPrecio.trim() };
        }
      }
    }
  }

  // ── Escalonamiento por altura ─────────────────────────────────────────────
  let precio = base;
  let precioAlto: number | null = null;
  let nota = "";
  if (e.escalonado === undefined && e.altura >= 15) {
    pendientes.push({
      codigo: "escalonado",
      pregunta: `Con ${numero(e.altura)} m de altura, ¿el precio va escalonado? El tramo alto sube +${numero(t.fachada.saltoAPct)} % (altura moderada, acceso normal), +${numero(t.fachada.saltoBPct)} % (edificio alto con caída marcada de rendimiento) u otro que defina Joaquín. Se promedia en un solo renglón.`,
      opciones: [`A: +${numero(t.fachada.saltoAPct)} %`, `B: +${numero(t.fachada.saltoBPct)} %`, "Otro %", "No va escalonado"],
    });
  }
  if (e.escalonado && base !== null) {
    const { alturaCorte, salto } = e.escalonado;
    const saltoPct = salto === "A" ? t.fachada.saltoAPct : salto === "B" ? t.fachada.saltoBPct : salto;
    if (!(alturaCorte > 0 && alturaCorte < e.altura)) {
      avisos.push({ nivel: "bloqueo", codigo: "escalonado", texto: `El corte del escalonamiento (${numero(alturaCorte)} m) tiene que estar entre 0 y la altura (${numero(e.altura)} m).` });
    } else {
      precioAlto = Math.round(base * (1 + saltoPct / 100));
      const alto = e.altura - alturaCorte;
      // Promedio ponderado por altura, redondeado a $100: es un valor que se lee en la
      // propuesta, y con cantidades de dos decimales evita centavos en Odoo.
      precio = alMultiplo((base * alturaCorte + precioAlto * alto) / e.altura, 100);
      nota = ` (escalonado: hasta ${numero(alturaCorte)} m a ${pesos(base)}/m², de ${numero(alturaCorte)} a ${numero(e.altura)} m a ${pesos(precioAlto)}/m², promedio ${pesos(precio)}/m²)`;
    }
  }

  if (precio !== null) {
    const caras = e.frentes.length > 1 ? ` en ${e.frentes.length} caras` : "";
    lineas.push(
      nuevaLinea({
        id: "fachada",
        grupo: "fachada",
        seccion: "base",
        producto: "fachada_m2",
        descripcion: `Estructura multidireccional en fachada — ${numero(superficie)} m² (${numero(desarrollo)} m.l.${caras} × ${numero(e.altura)} m), primer mes todo incluido${nota}`,
        cantidad: superficie,
        precioUnitario: precio,
        descuentoPct,
        unicaVez: false,
        calculo: `${numero(superficie)} m² × ${pesos(precio)}/m²${descuentoPct ? ` − ${numero(descuentoPct)} % de bonificación sobre lista` : ""}${nota}`,
        desvio,
      }),
    );
  }

  if (e.frentes.length > 1) {
    avisos.push({ nivel: "info", codigo: "esquina", texto: "Esquina / dos caras: cuenta mínimo 1 jornada de armado adicional (criterio §6). Confirmá que el técnico la incluyó." });
  }

  if (e.gestoria !== "no") {
    if (e.enCaba) {
      lineas.push(
        nuevaLinea({
          id: "gestoria",
          grupo: "fachada",
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
      avisos.push({ nivel: "advertencia", codigo: "gestoria_fuera_caba", texto: "Fuera de CABA la gestoría cambia de ítem y probablemente de valor: si no está confirmada, queda afuera." });
    }
  }

  return {
    lineas,
    avisos,
    pendientes,
    renovacionPct: t.renovacionObraPct,
    detalle: { desarrollo, superficie, precioM2: precio, precioBajo: base, precioAlto },
  };
}
