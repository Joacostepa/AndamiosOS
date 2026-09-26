// Ítems complementarios con valor en Parámetros: flete, ingeniería, S&H, gestoría y media sombra.
//
// Van como líneas propias y, salvo la media sombra, son de ÚNICA VEZ: quedan fuera de la base
// de la renovación (criterio §3.5, §4.1). Cuando el parámetro es un rango, el monto lo elige el
// vendedor y el motor controla que caiga adentro; si no cae, hace falta el motivo.

import { nuevaLinea, numero, pesos, type Aviso, type Linea, type Rango, type Resultado, type Seccion, type Tarifas } from "./tipos.ts";

export type TipoComplementario = "flete" | "ingenieria" | "syh" | "gestoria" | "media_sombra";

export type EntradaComplementario = {
  tipo: TipoComplementario;
  seccion: Seccion;
  /** Monto elegido (rangos) o monto manual. En media sombra, los m². */
  monto?: number;
  metros2?: number;
  /** Flete: a dónde. */
  zona?: "gba_cercano" | "caba" | "la_plata" | "otra";
  enCaba?: boolean;
  motivo?: string;
  /** Opcionales: "por mes", "por jornada". */
  unidad?: string;
  /** Producto de Odoo si no es el de siempre (la media sombra va con el de la estructura). */
  producto?: string;
};

const PRODUCTO: Record<TipoComplementario, string> = {
  flete: "traslado",
  ingenieria: "ingenieria",
  syh: "seguridad_higiene",
  gestoria: "gestoria_permiso",
  // En Odoo la media sombra no tiene producto propio: va con el de la estructura, y en las
  // órdenes reales casi siempre es el de fachada por m² (156), que además tiene la unidad.
  media_sombra: "fachada_m2",
};

const DESCRIPCION: Record<TipoComplementario, string> = {
  flete: "Servicio de traslado (envío y retiro)",
  ingenieria: "Ingeniería: memoria de cálculo, planos y firma profesional",
  syh: "Servicio de Seguridad e Higiene en obra",
  gestoria: "Gestión del permiso de implantación de andamio en vía pública (GCBA)",
  media_sombra: "Cobertura en tela media sombra",
};

function controlarRango(monto: number, r: Rango, nombre: string, motivo: string | undefined, avisos: Aviso[]): Linea["desvio"] {
  if (monto >= r.min && monto <= r.max) return undefined;
  if (!motivo?.trim()) {
    avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `${nombre}: ${pesos(monto)} está fuera del rango habitual (${pesos(r.min)} – ${pesos(r.max)}). Hace falta el motivo.` });
    return undefined;
  }
  return { tarifa: `${pesos(r.min)} – ${pesos(r.max)}`, motivo: motivo.trim() };
}

export function cotizarComplementario(e: EntradaComplementario, t: Tarifas): Resultado {
  const avisos: Aviso[] = [];
  const c = t.complementarios;
  let precio: number | null = null;
  let cantidad = 1;
  let calculo = "";
  let desvio: Linea["desvio"];
  const pendientes: Resultado["pendientes"] = [];

  switch (e.tipo) {
    case "gestoria":
      if (e.enCaba === false) {
        avisos.push({ nivel: "bloqueo", codigo: "gestoria_fuera_caba", texto: "La gestoría del permiso de GCBA es sólo para CABA. Fuera de CABA el ítem cambia: si no está confirmado, queda afuera." });
        break;
      }
      precio = c.gestoriaCaba;
      calculo = `monto fijo ${pesos(precio)} (sólo CABA)`;
      break;
    case "flete": {
      const fijo = e.zona === "gba_cercano" ? c.fleteGbaCercano : e.zona === "la_plata" ? c.fleteLaPlata : null;
      if (fijo !== null) {
        precio = e.monto ?? fijo;
        if (e.monto !== undefined && e.monto !== fijo) {
          if (!e.motivo?.trim()) avisos.push({ nivel: "bloqueo", codigo: "motivo_precio", texto: `El flete a esa zona es ${pesos(fijo)}: para usar ${pesos(e.monto)} hace falta el motivo.` });
          else desvio = { tarifa: pesos(fijo), motivo: e.motivo.trim() };
        }
        calculo = `flete ${e.zona === "la_plata" ? "La Plata" : "GBA cercano"}`;
      } else if (e.monto === undefined) {
        pendientes.push({
          codigo: "monto_flete",
          pregunta: e.zona === "caba"
            ? `El flete en CABA va de ${pesos(c.fleteCaba.min)} a ${pesos(c.fleteCaba.max)} según volumen y acceso. ¿Cuánto?`
            : "¿Cuánto es el flete? (fuera del AMBA se calcula por distancia y viajes: Quequén fue $5.200.000, 4 semis ida y vuelta $7.200.000)",
        });
      } else {
        precio = e.monto;
        if (e.zona === "caba") desvio = controlarRango(precio, c.fleteCaba, "Flete CABA", e.motivo, avisos);
        else if (e.motivo?.trim()) desvio = { tarifa: "sin tarifa para esa zona", motivo: e.motivo.trim() };
        calculo = e.zona === "caba" ? "flete CABA" : "flete a otra zona";
      }
      break;
    }
    case "ingenieria":
      if (e.monto === undefined) {
        pendientes.push({ codigo: "monto_ingenieria", pregunta: `Ingeniería: va de ${pesos(c.ingenieriaTorreSimple)} (torre simple) a ${pesos(c.ingenieria.max)} lo habitual (${pesos(c.ingenieria.min)} – ${pesos(c.ingenieria.max)}). ¿Cuánto?` });
      } else {
        precio = e.monto;
        desvio = controlarRango(precio, { min: c.ingenieriaTorreSimple, max: c.ingenieria.max }, "Ingeniería", e.motivo, avisos);
        calculo = "ingeniería, única vez";
      }
      break;
    case "syh":
      if (e.monto === undefined) {
        pendientes.push({ codigo: "monto_syh", pregunta: `Seguridad e Higiene va de ${pesos(c.syh.min)} a ${pesos(c.syh.max)} según jornadas (en obras chicas se aclara y no va como línea). ¿Cuánto?` });
      } else {
        precio = e.monto;
        desvio = controlarRango(precio, c.syh, "Seguridad e Higiene", e.motivo, avisos);
        calculo = "S&H, única vez";
      }
      break;
    case "media_sombra":
      if (!(e.metros2 && e.metros2 > 0)) {
        pendientes.push({ codigo: "m2_media_sombra", pregunta: "¿Cuántos m² de media sombra?" });
      } else {
        cantidad = e.metros2;
        precio = c.mediaSombraM2;
        calculo = `${numero(cantidad)} m² × ${pesos(precio)}/m²`;
        avisos.push({ nivel: "info", codigo: "media_sombra_viento", texto: "La media sombra sube la carga de viento y puede exigir anclajes adicionales: decirlo en la propuesta." });
      }
      break;
  }

  const lineas: Linea[] = [];
  if (precio !== null) {
    lineas.push(
      nuevaLinea({
        id: e.tipo,
        grupo: "complementario",
        seccion: e.seccion,
        producto: e.producto ?? PRODUCTO[e.tipo],
        descripcion: DESCRIPCION[e.tipo],
        cantidad,
        precioUnitario: precio,
        unicaVez: e.tipo !== "media_sombra",
        unidad: e.unidad,
        calculo,
        desvio,
      }),
    );
  }
  return { lineas, avisos, pendientes };
}
