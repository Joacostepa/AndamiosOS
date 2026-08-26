// Feriados nacionales argentinos para el tablero.
//
// FUENTE: api.argentinadatos.com — gratis, sin API key, y la única de las dos candidatas
// que sirve acá. La genérica (date.nager.at) se pierde los PUENTES TURÍSTICOS —tres en
// 2026: 23/03, 10/07 y 07/12— que son justamente días en los que no va nadie a trabajar,
// y además discrepa en los trasladables (pone Güemes 2027 el 21/06 en vez del 17/06).
//
// LÍMITE DE CUALQUIER FUENTE: los puentes se fijan por decreto y no existen hasta que
// sale. 2027 hoy no tiene ninguno cargado; van a aparecer cuando el Gobierno los publique.
//
// DECISIÓN: el feriado en el tablero es SÓLO una marca visual. No cambia la capacidad de
// la cuadrilla ni el reparto de una obra de varias jornadas, que siguen tratando el
// feriado como día hábil (a diferencia del domingo, que sí se saltea). Está decidido así
// a propósito: si mañana se quiere que además frene la planificación, los tres lugares
// que hay que tocar son siguienteDiaLaboral, capacidadDelRango y el colapso de columna.

export type Feriado = {
  fecha: string;
  nombre: string;
  /** inamovible · trasladable · puente. Para el tablero los tres son lo mismo. */
  tipo: string;
};

/**
 * Respaldo local: lo que devolvía la API al 25/08/2026.
 *
 * No es la fuente de verdad, es el piso. El tablero es la pantalla que más se usa y no
 * puede quedarse sin feriados porque un servicio de terceros esté caído; con esto, lo
 * peor que pasa es que falte un puente decretado después de esta fecha.
 */
const RESPALDO: Feriado[] = [
  { fecha: "2026-01-01", nombre: "Año nuevo", tipo: "inamovible" },
  { fecha: "2026-02-16", nombre: "Carnaval", tipo: "inamovible" },
  { fecha: "2026-02-17", nombre: "Carnaval", tipo: "inamovible" },
  { fecha: "2026-03-23", nombre: "Puente turístico no laborable", tipo: "puente" },
  { fecha: "2026-03-24", nombre: "Día Nacional de la Memoria por la Verdad y la Justicia", tipo: "inamovible" },
  { fecha: "2026-04-02", nombre: "Día del Veterano y de los Caídos en la Guerra de Malvinas", tipo: "inamovible" },
  { fecha: "2026-04-03", nombre: "Viernes Santo", tipo: "inamovible" },
  { fecha: "2026-05-01", nombre: "Día del Trabajador", tipo: "inamovible" },
  { fecha: "2026-05-25", nombre: "Día de la Revolución de Mayo", tipo: "inamovible" },
  { fecha: "2026-06-15", nombre: "Paso a la Inmortalidad del General Martín Güemes (17/6)", tipo: "trasladable" },
  { fecha: "2026-06-20", nombre: "Paso a la Inmortalidad del General Manuel Belgrano", tipo: "inamovible" },
  { fecha: "2026-07-09", nombre: "Día de la Independencia", tipo: "inamovible" },
  { fecha: "2026-07-10", nombre: "Puente turístico no laborable", tipo: "puente" },
  { fecha: "2026-08-17", nombre: "Paso a la Inmortalidad del Gral. José de San Martín", tipo: "trasladable" },
  { fecha: "2026-10-12", nombre: "Día del Respeto a la Diversidad Cultural", tipo: "trasladable" },
  { fecha: "2026-11-23", nombre: "Día de la Soberanía Nacional (20/11)", tipo: "trasladable" },
  { fecha: "2026-12-07", nombre: "Puente turístico no laborable", tipo: "puente" },
  { fecha: "2026-12-08", nombre: "Día de la Inmaculada Concepción de María", tipo: "inamovible" },
  { fecha: "2026-12-25", nombre: "Navidad", tipo: "inamovible" },
  { fecha: "2027-01-01", nombre: "Año nuevo", tipo: "inamovible" },
  { fecha: "2027-02-08", nombre: "Carnaval", tipo: "inamovible" },
  { fecha: "2027-02-09", nombre: "Carnaval", tipo: "inamovible" },
  { fecha: "2027-03-24", nombre: "Día Nacional de la Memoria por la Verdad y la Justicia", tipo: "inamovible" },
  { fecha: "2027-03-26", nombre: "Viernes Santo", tipo: "inamovible" },
  { fecha: "2027-04-02", nombre: "Día del Veterano y de los Caídos en la Guerra de Malvinas", tipo: "inamovible" },
  { fecha: "2027-05-01", nombre: "Día del Trabajador", tipo: "inamovible" },
  { fecha: "2027-05-25", nombre: "Día de la Revolución de Mayo", tipo: "inamovible" },
  { fecha: "2027-06-17", nombre: "Paso a la Inmortalidad del General Martín Güemes", tipo: "trasladable" },
  { fecha: "2027-06-20", nombre: "Paso a la Inmortalidad del General Manuel Belgrano", tipo: "inamovible" },
  { fecha: "2027-07-09", nombre: "Día de la Independencia", tipo: "inamovible" },
  { fecha: "2027-08-17", nombre: "Paso a la Inmortalidad del Gral. José de San Martín", tipo: "trasladable" },
  { fecha: "2027-10-12", nombre: "Día del Respeto a la Diversidad Cultural", tipo: "trasladable" },
  { fecha: "2027-11-20", nombre: "Día de la Soberanía Nacional", tipo: "trasladable" },
  { fecha: "2027-12-08", nombre: "Día de la Inmaculada Concepción de María", tipo: "inamovible" },
  { fecha: "2027-12-25", nombre: "Navidad", tipo: "inamovible" },
];

const URL = "https://api.argentinadatos.com/v1/feriados";

/** Un año, pedido a la API. Devuelve null si no contesta o contesta cualquier cosa. */
async function delAnio(anio: number): Promise<Feriado[] | null> {
  try {
    // El cacheado lo hace Next: los feriados de un año cambian a lo sumo cuando se
    // decreta un puente, así que una vez por día es de sobra y saca la llamada externa
    // del camino de cada apertura del tablero.
    const res = await fetch(`${URL}/${anio}`, { next: { revalidate: 86_400 } });
    if (!res.ok) return null;
    const crudo: unknown = await res.json();
    if (!Array.isArray(crudo)) return null;

    const feriados = crudo
      .filter((f): f is { fecha: string; nombre?: string; tipo?: string } =>
        !!f && typeof f === "object" && typeof (f as { fecha?: unknown }).fecha === "string",
      )
      .map((f) => ({
        fecha: f.fecha,
        nombre: typeof f.nombre === "string" ? f.nombre : "Feriado",
        tipo: typeof f.tipo === "string" ? f.tipo : "inamovible",
      }));
    // Una respuesta vacía es sospechosa —todo año tiene feriados— así que se trata como
    // "no contestó" y manda el respaldo.
    return feriados.length > 0 ? feriados : null;
  } catch {
    return null;
  }
}

/**
 * Los feriados que caen dentro del rango, con el respaldo local como piso.
 *
 * El rango del tablero cruza el fin de año sin avisar, así que se resuelve por AÑO y
 * después se recorta: pedir "desde/hasta" a la API no es una opción, sólo publica por año.
 */
export async function feriadosDelRango(desde: string, hasta: string): Promise<Feriado[]> {
  const anioDesde = Number(desde.slice(0, 4));
  const anioHasta = Number(hasta.slice(0, 4));
  const anios = Array.from({ length: anioHasta - anioDesde + 1 }, (_, i) => anioDesde + i);

  const porAnio = await Promise.all(
    anios.map(async (a) => (await delAnio(a)) ?? RESPALDO.filter((f) => f.fecha.startsWith(String(a)))),
  );

  return porAnio
    .flat()
    .filter((f) => f.fecha >= desde && f.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
