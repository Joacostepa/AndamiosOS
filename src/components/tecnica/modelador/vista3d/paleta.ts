// Paleta de la vista 3D. El fondo, el texto, la selección (primary) y los errores (destructive)
// salen de los tokens de Andamios OS (globals.css); los colores por familia de pieza son la
// paleta aprobada en la maqueta, en versión clara y oscura (es la única excepción a "sin hex").

import type { Familia, Pieza } from "@/lib/tecnica/modelo";

export interface Paleta {
  oscuro: boolean;
  fondo: string;
  suelo: string;
  grilla1: string;
  grilla2: string;
  texto: string;
  sel: string;
  hover: string;
  err: string;
  aviso: string;
  volumen: string;
  volumenBorde: string;
  hueco: string;
  /** ejes al mover un volumen, como SketchUp: rojo a lo largo, verde hacia el fondo, azul vertical; magenta = ejes del terreno */
  ejeRojo: string;
  ejeVerde: string;
  ejeAzul: string;
  ejeMundo: string;
  ajuste: string;
  sinCodigo: string;
  fam: Record<GrupoColor, string>;
}

export type GrupoColor =
  | "vertical" | "horizontal" | "baranda" | "diagonal" | "plataforma" | "fenolico" | "rodapie" | "base" | "anclaje"
  | "mensula" | "viga" | "escalera" | "bastidor" | "rienda" | "cano" | "accesorio" | "esfera" | "cubierta" | "lona" | "rueda";

const FAM_OSCURO: Record<GrupoColor, string> = {
  vertical: "#c3c9d2", horizontal: "#7f8897", baranda: "#d3a23e", diagonal: "#5a8bc6", plataforma: "#8d7a64",
  fenolico: "#b58b57", rodapie: "#6f5f4d", base: "#59626e", anclaje: "#3dbb8c", mensula: "#b383db", viga: "#d8b54a",
  escalera: "#3fb5ae", bastidor: "#9fb4ca", rienda: "#5a8bc6", cano: "#e0a34f", accesorio: "#dfe3e8", esfera: "#ff8a3d",
  cubierta: "#2c5a46", lona: "#cfd5dc", rueda: "#3a3f47",
};
const FAM_CLARO: Record<GrupoColor, string> = {
  vertical: "#4f5966", horizontal: "#7c8592", baranda: "#c08712", diagonal: "#2d6bb3", plataforma: "#9b8366",
  fenolico: "#a87a43", rodapie: "#7a654c", base: "#3a424d", anclaje: "#1b9a6a", mensula: "#8a4cc0", viga: "#b68a10",
  escalera: "#1b8d87", bastidor: "#5b7895", rienda: "#2d6bb3", cano: "#b86a12", accesorio: "#9aa3ad", esfera: "#e8651a",
  cubierta: "#2f5a47", lona: "#9aa3ad", rueda: "#2b2f35",
};

export const LEYENDA: [GrupoColor, string][] = [
  ["vertical", "Verticales"], ["horizontal", "Horizontales"], ["baranda", "Barandas"], ["diagonal", "Diagonales"],
  ["plataforma", "Plataformas"], ["anclaje", "Anclajes"], ["mensula", "Ménsulas"], ["viga", "Vigas"], ["escalera", "Accesos"],
  ["cano", "Caño y grampa"],
];

const GRUPO: Partial<Record<Familia, GrupoColor>> = {
  vertical: "vertical", horizontal: "horizontal", baranda: "baranda", diagonal: "diagonal", diagonal_planta: "diagonal",
  tablon: "plataforma", tablon_escotilla: "plataforma", rodapie: "rodapie", fenolico: "fenolico",
  base_fija: "base", base_regulable: "base", collarin: "base", rueda: "rueda", rueda_freno: "rueda", estabilizador: "base",
  anclaje: "anclaje", mensula: "mensula", viga_celosia: "viga", viga_puente: "viga", zanca: "escalera",
  escalera_interior: "escalera", baranda_escalera: "escalera", bastidor: "bastidor", bastidor_baranda: "baranda",
  rienda_h: "rienda", rienda_d: "rienda", modulo_kit: "bastidor", cano: "cano", grampa_fija: "cano",
  grampa_giratoria: "cano", manguito: "cano", lona: "lona", media_sombra: "cubierta", chapa: "lona",
  colgador: "anclaje", recubrimiento: "accesorio", esfera: "esfera", defensa: "accesorio", accesorio: "accesorio",
};

export const grupoColor = (p: Pieza): GrupoColor => GRUPO[p.familia] ?? "horizontal";

/** Familias que se dibujan como plano (cerramientos y placas). */
export const ES_LAMINA = new Set<Familia>(["lona", "media_sombra", "chapa", "fenolico"]);
/** Familias que se dibujan como caja (tablones, rodapiés). */
export const ES_CAJA = new Set<Familia>(["tablon", "tablon_escotilla", "rodapie"]);

/** Convierte cualquier color CSS (incluido oklch) a #rrggbb pintando un pixel. */
function aHex(css: string, respaldo: string): string {
  if (!css) return respaldo;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return respaldo;
    g.fillStyle = respaldo;
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
    return `#${[r, gg, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return respaldo;
  }
}

function token(nombre: string, respaldo: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return aHex(v, respaldo);
}

export function leerPaleta(): Paleta {
  const oscuro = document.documentElement.classList.contains("dark");
  const fondo = token("--background", oscuro ? "#18191b" : "#f7f7f7");
  return {
    oscuro,
    fondo,
    suelo: oscuro ? "#1d1e21" : "#e6e8eb",
    grilla1: oscuro ? "#2c2e33" : "#cfd2d6",
    grilla2: oscuro ? "#24262a" : "#dadcdf",
    texto: token("--foreground", oscuro ? "#f2f2f2" : "#222222"),
    sel: token("--primary", "#d9531f"),
    hover: oscuro ? "#ffffff" : "#111111",
    err: token("--destructive", "#e01e1e"),
    aviso: "#e0a020",
    volumen: oscuro ? "#5b6170" : "#b9bec6",
    volumenBorde: oscuro ? "#8a91a0" : "#8d939c",
    hueco: oscuro ? "#3b82f6" : "#2563eb",
    ejeRojo: oscuro ? "#ff5c5c" : "#d32020",
    ejeVerde: oscuro ? "#3ddc6a" : "#13923a",
    ejeAzul: oscuro ? "#4d8dff" : "#1d55d6",
    ejeMundo: oscuro ? "#e05cf0" : "#b0249e",
    ajuste: oscuro ? "#e0a34f" : "#b86a12",
    sinCodigo: oscuro ? "#ff6b6b" : "#c62828",
    fam: oscuro ? FAM_OSCURO : FAM_CLARO,
  };
}

/** Paleta clara para la imagen exportada (fondo blanco). */
export function paletaExport(base: Paleta): Paleta {
  return { ...base, oscuro: false, fondo: "#ffffff", suelo: "#f3f4f6", volumen: "#d9dce0", volumenBorde: "#b0b5bc", fam: FAM_CLARO };
}
