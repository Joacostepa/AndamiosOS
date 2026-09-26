// De las filas de la planilla de precios de alquiler a piezas.
//
// La planilla que llega (JUN26) tiene unas filas de encabezado —"LISTA DE PRECIOS",
// "VIGENCIA <fecha>", "IMPUESTOS …"— y después la tabla CODIGO | DESCRIPCION | PRECIO UNIT.
// No se asume en qué fila empieza: se busca la fila de títulos, porque la próxima lista puede
// venir con una línea más arriba y un índice fijo la leería corrida sin avisar.
//
// Puro: sin base ni Node, para poder probarlo solo.

export type PiezaLista = { codigo: string; descripcion: string; precio: number };

export type ListaInterpretada = {
  piezas: PiezaLista[];
  /** Fecha de vigencia si la planilla la trae (YYYY-MM-DD). */
  vigencia: string | null;
  /** Filas que parecían piezas pero no se pudieron leer, para mostrarlas antes de guardar. */
  descartadas: { fila: number; motivo: string; contenido: string }[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** Número de serie de fecha de Excel (días desde 1899-12-30) → YYYY-MM-DD. */
export function fechaDeSerieExcel(serie: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serie) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** "1.141,95", "1141.95", "$ 8.598,95" → número. null si no es un precio. */
export function leerPrecio(crudo: string): number | null {
  let s = crudo.replace(/[$\s]/g, "");
  if (!s) return null;
  // Con coma decimal a la argentina ("1.141,95"): los puntos son miles.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function interpretarListaAlquiler(filas: string[][]): ListaInterpretada {
  let vigencia: string | null = null;
  for (const fila of filas.slice(0, 15)) {
    const i = fila.findIndex((c) => norm(c) === "VIGENCIA");
    if (i >= 0) {
      const valor = fila.slice(i + 1).find((c) => c !== "");
      if (valor && /^\d{5}(\.\d+)?$/.test(valor)) vigencia = fechaDeSerieExcel(Number(valor));
      else if (valor && /^\d{4}-\d{2}-\d{2}/.test(valor)) vigencia = valor.slice(0, 10);
      break;
    }
  }

  const titulos = filas.findIndex((f) => {
    const n = f.map(norm);
    return n.some((c) => c.startsWith("CODIGO")) && n.some((c) => c.startsWith("DESCRIP")) && n.some((c) => c.startsWith("PRECIO"));
  });
  if (titulos < 0) {
    throw new Error("No encontré la fila de títulos (CODIGO · DESCRIPCION · PRECIO) en la primera hoja");
  }
  const t = filas[titulos].map(norm);
  const cCodigo = t.findIndex((c) => c.startsWith("CODIGO"));
  const cDesc = t.findIndex((c) => c.startsWith("DESCRIP"));
  const cPrecio = t.findIndex((c) => c.startsWith("PRECIO"));

  const piezas: PiezaLista[] = [];
  const descartadas: ListaInterpretada["descartadas"] = [];
  const vistos = new Set<string>();

  filas.slice(titulos + 1).forEach((fila, k) => {
    const nFila = titulos + k + 2; // 1-based, como la ve Excel
    const codigo = (fila[cCodigo] ?? "").trim();
    const descripcion = (fila[cDesc] ?? "").trim();
    const precioCrudo = (fila[cPrecio] ?? "").trim();
    if (!codigo && !descripcion && !precioCrudo) return;
    const contenido = [codigo, descripcion, precioCrudo].filter(Boolean).join(" · ");
    if (!codigo) return void descartadas.push({ fila: nFila, motivo: "sin código", contenido });
    if (!descripcion) return void descartadas.push({ fila: nFila, motivo: "sin descripción", contenido });
    const precio = leerPrecio(precioCrudo);
    if (precio === null) return void descartadas.push({ fila: nFila, motivo: "precio ilegible", contenido });
    if (vistos.has(codigo)) return void descartadas.push({ fila: nFila, motivo: "código repetido", contenido });
    vistos.add(codigo);
    piezas.push({ codigo, descripcion, precio });
  });

  if (piezas.length === 0) throw new Error("La planilla no tiene piezas con código, descripción y precio");
  return { piezas, vigencia, descartadas };
}

/** Ajuste masivo por %: redondea al centavo, como la lista original. */
export function ajustarLista(piezas: PiezaLista[], porcentaje: number): PiezaLista[] {
  const f = 1 + porcentaje / 100;
  return piezas.map((p) => ({ ...p, precio: Math.round(p.precio * f * 100) / 100 }));
}
