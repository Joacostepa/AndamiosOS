// Lo que leyó la IA, puesto en el formulario. Puro (lo usa la pantalla; tiene tests).
//
// REGLA: la IA llena sólo los campos vacíos. Si un dato choca con lo que ya está cargado, no lo
// pisa: vuelve como un cambio para que el vendedor lo aplique o lo descarte. Así una captura
// pegada después, o una corrección escrita («sacá el técnico»), nunca cambia nada sola.

import { idFila, productoParaConcepto, type Estado3, type FilaDesglose, type Formulario } from "./formulario.ts";
import type { CampoIA, PropuestaIA } from "./interpretar.ts";

export type Cambio = { campo: string; de: string; a: string; aplicar: (f: Formulario) => Formulario };

export const ETIQUETAS: Record<CampoIA, string> = {
  razonSocial: "Razón social", cuit: "CUIT", contacto: "Dirigido a", celular: "Celular", email: "Correo", domicilio: "Domicilio",
  direccion: "Dirección de la obra", metros: "Metros lineales", alturaBandeja: "Altura de la bandeja", precioMl: "Precio por m.l.",
  frentes: "Frentes", alturaFachada: "Altura de la fachada", precioM2: "Precio por m²", jornadasArmado: "Jornadas de armado",
  jornadasDesarme: "Jornadas de desarme", plazoDias: "Plazo", trabajo: "Trabajo", esquina: "Esquina", concertina: "Concertina",
  gestoria: "Gestoría del permiso", syh: "Técnico de SyH", memoria: "Memoria de cálculo", mediaSombra: "Media sombra", render: "Render",
};

const num = (s: string): number | null => {
  const limpio = s.replace(/[$\s]/g, "");
  const n = Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio) ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const estado = (s: string): Estado3 | null => (s === "base" || s === "opcional" || s === "no" ? s : null);
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(" + ") : String(v));

type Acceso = { leer: (f: Formulario) => unknown; poner: (f: Formulario, v: unknown) => Formulario; parsear: (s: string) => unknown; vacio?: (f: Formulario) => boolean };

const cli = (k: keyof Formulario["cliente"]): Acceso => ({
  leer: (f) => f.cliente[k], parsear: (s) => s.trim(), poner: (f, v) => ({ ...f, cliente: { ...f.cliente, [k]: v } }),
});

const ACCESOS: Record<CampoIA, Acceso> = {
  razonSocial: cli("razonSocial"), cuit: cli("cuit"), contacto: cli("contacto"), celular: cli("celular"), email: cli("email"), domicilio: cli("domicilio"),
  direccion: { leer: (f) => f.obra.direccion, parsear: (s) => s.trim(), poner: (f, v) => ({ ...f, obra: { ...f.obra, direccion: v as string } }) },
  esquina: { leer: (f) => f.obra.esquina, parsear: (s) => s.trim(), poner: (f, v) => ({ ...f, obra: { ...f.obra, esquina: v as string } }) },
  metros: { leer: (f) => f.bandeja.metros, parsear: num, poner: (f, v) => ({ ...f, bandeja: { ...f.bandeja, metros: v as number } }) },
  // La altura arranca en 3: cuenta como vacía mientras nadie la tocó.
  alturaBandeja: { leer: (f) => f.bandeja.altura, parsear: num, poner: (f, v) => ({ ...f, bandeja: { ...f.bandeja, altura: v as number } }), vacio: (f) => f.bandeja.altura === 3 && !f.bandeja.metros },
  precioMl: { leer: (f) => f.bandeja.precioMl, parsear: num, poner: (f, v) => ({ ...f, bandeja: { ...f.bandeja, precioMl: v as number } }) },
  frentes: {
    leer: (f) => (f.fachada.frentes.length ? f.fachada.frentes : null),
    parsear: (s) => { const xs = s.split("+").map((x) => num(x.trim())).filter((x): x is number => x !== null && x > 0); return xs.length ? xs : null; },
    poner: (f, v) => ({ ...f, fachada: { ...f.fachada, frentes: v as number[] } }),
  },
  alturaFachada: { leer: (f) => f.fachada.altura, parsear: num, poner: (f, v) => ({ ...f, fachada: { ...f.fachada, altura: v as number } }) },
  precioM2: { leer: (f) => f.fachada.precioM2, parsear: num, poner: (f, v) => ({ ...f, fachada: { ...f.fachada, precioM2: v as number } }) },
  jornadasArmado: { leer: (f) => f.jornadas.armado, parsear: num, poner: (f, v) => ({ ...f, jornadas: { ...f.jornadas, armado: v as number } }) },
  jornadasDesarme: { leer: (f) => f.jornadas.desarme, parsear: num, poner: (f, v) => ({ ...f, jornadas: { ...f.jornadas, desarme: v as number } }) },
  plazoDias: { leer: (f) => f.plazoDias, parsear: num, poner: (f, v) => ({ ...f, plazoDias: v as number }), vacio: (f) => f.plazoDias === 30 },
  trabajo: { leer: (f) => f.desglose.trabajo, parsear: (s) => s.trim(), poner: (f, v) => ({ ...f, desglose: { ...f.desglose, trabajo: v as string } }) },
  // Los estados arrancan en su valor por defecto: la IA los cambia sólo si lo pidieron.
  concertina: { leer: (f) => f.bandeja.concertina, parsear: estado, poner: (f, v) => ({ ...f, bandeja: { ...f.bandeja, concertina: v as Estado3 } }), vacio: () => false },
  gestoria: {
    leer: (f) => (f.tipo === "fachada" ? f.fachada.gestoria : f.bandeja.gestoria), parsear: estado, vacio: () => false,
    poner: (f, v) => (f.tipo === "fachada" ? { ...f, fachada: { ...f.fachada, gestoria: v as Estado3 } } : { ...f, bandeja: { ...f.bandeja, gestoria: v as Estado3 } }),
  },
  syh: { leer: (f) => f.syh, parsear: estado, poner: (f, v) => ({ ...f, syh: v as Estado3 }), vacio: () => false },
  memoria: { leer: (f) => f.memoria, parsear: estado, poner: (f, v) => ({ ...f, memoria: v as Estado3 }), vacio: () => false },
  mediaSombra: { leer: (f) => f.fachada.mediaSombra, parsear: (s) => s === "si", poner: (f, v) => ({ ...f, fachada: { ...f.fachada, mediaSombra: v as boolean } }), vacio: (f) => !f.fachada.mediaSombra },
  render: {
    leer: (f) => f.render.eleccion, vacio: (f) => !f.render.eleccion,
    parsear: (s) => (s === "ninguno" ? "ninguno" : null),
    poner: (f, v) => ({ ...f, render: { eleccion: v as "ninguno", renderId: null, path: null } }),
  },
};

const estaVacio = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Un formulario sin nada cargado todavía (se le puede cambiar el tipo sin preguntar). */
export function formularioEnBlanco(f: Formulario): boolean {
  return !f.cliente.razonSocial && !f.obra.direccion && !f.bandeja.metros && !f.fachada.frentes.length && !f.desglose.filas.length;
}

export function aplicarPropuesta(f0: Formulario, p: PropuestaIA, semilla: string): { formulario: Formulario; cambios: Cambio[]; completados: number } {
  let f = f0;
  const cambios: Cambio[] = [];
  let completados = 0;
  if (p.tipo && p.tipo !== f.tipo) {
    if (formularioEnBlanco(f)) f = { ...f, tipo: p.tipo };
    else cambios.push({ campo: "Tipo", de: f.tipo, a: p.tipo, aplicar: (x) => ({ ...x, tipo: p.tipo! }) });
  }
  const ia = { ...f.ia };
  for (const c of p.campos) {
    const acc = ACCESOS[c.campo];
    if (!acc) continue;
    const valor = acc.parsear(c.valor);
    if (valor === null || valor === undefined || valor === "") continue;
    const actual = acc.leer(f);
    const vacio = acc.vacio ? acc.vacio(f) : estaVacio(actual);
    if (vacio) {
      f = acc.poner(f, valor);
      ia[c.campo] = { cita: c.cita.slice(0, 380), deducido: c.deducido };
      completados++;
    } else if (!igual(actual, valor)) {
      const marca = { cita: c.cita.slice(0, 380), deducido: c.deducido };
      cambios.push({ campo: ETIQUETAS[c.campo], de: texto(actual), a: texto(valor), aplicar: (x) => ({ ...acc.poner(x, valor), ia: { ...x.ia, [c.campo]: marca } }) });
    }
  }
  // Renglones del desglosado: los nuevos se suman; un cambio a uno que ya está, se propone.
  const nuevas: FilaDesglose[] = [];
  p.filas.forEach((r, i) => {
    const existente = r.reemplaza ? f.desglose.filas.find((x) => x.concepto.trim().toLowerCase() === r.reemplaza!.trim().toLowerCase()) : undefined;
    if (existente) {
      if (r.monto !== null && r.monto !== existente.precio) {
        const id = existente.id;
        cambios.push({
          campo: existente.concepto, de: existente.precio === null ? "—" : `$ ${existente.precio.toLocaleString("es-AR")}`, a: `$ ${Math.round(r.monto).toLocaleString("es-AR")}`,
          aplicar: (x) => ({ ...x, desglose: { ...x.desglose, filas: x.desglose.filas.map((y) => (y.id === id ? { ...y, precio: Math.round(r.monto!), cantidad: 1 } : y)) } }),
        });
      }
      return;
    }
    if (f.desglose.filas.some((x) => x.concepto.trim().toLowerCase() === r.concepto.trim().toLowerCase() && x.precio === r.monto)) return;
    const id = idFila(`${semilla}-${i + 1}`);
    nuevas.push({ id, concepto: r.concepto.trim(), cantidad: 1, precio: r.monto === null ? null : Math.round(r.monto), porPeriodo: r.porPeriodo, seccion: "base", producto: productoParaConcepto(r.concepto, r.porPeriodo) });
    ia[`fila:${id}`] = { cita: r.concepto.slice(0, 380), deducido: false };
    completados++;
  });
  if (nuevas.length) f = { ...f, desglose: { ...f.desglose, filas: [...f.desglose.filas, ...nuevas] } };
  f = { ...f, ia };
  return { formulario: f, cambios, completados };
}
