import {
  Frame,
  LayoutPanelTop,
  Anchor,
  Spline,
  ShieldCheck,
  PanelBottom,
  ArrowUpDown,
  Link2,
  Wrench,
  Package,
  type LucideIcon,
} from "lucide-react";

// Categorías del catálogo de piezas (ENUM categoria_pieza en catalogo_piezas).
// El spec usa íconos Tabler; acá se mapean a sus equivalentes en lucide-react.
type CategoriaMeta = { label: string; icon: LucideIcon; orden: number };

const CATEGORIAS: Record<string, CategoriaMeta> = {
  marco: { label: "Marcos y tubos", icon: Frame, orden: 1 },
  plataforma: { label: "Tablones y plataformas", icon: LayoutPanelTop, orden: 2 },
  base: { label: "Bases y husillos", icon: Anchor, orden: 3 },
  diagonal: { label: "Crucetas y diagonales", icon: Spline, orden: 4 },
  barandilla: { label: "Barandillas y seguridad", icon: ShieldCheck, orden: 5 },
  rodapie: { label: "Rodapiés", icon: PanelBottom, orden: 6 },
  escalera: { label: "Escaleras", icon: ArrowUpDown, orden: 7 },
  conector: { label: "Conectores", icon: Link2, orden: 8 },
  anclaje: { label: "Anclajes", icon: Anchor, orden: 9 },
  accesorio: { label: "Accesorios y fijaciones", icon: Wrench, orden: 10 },
  otro: { label: "Otros", icon: Package, orden: 99 },
};

const FALLBACK: CategoriaMeta = { label: "Otros", icon: Package, orden: 100 };

export function iconoDeCategoria(categoria: string): LucideIcon {
  return CATEGORIAS[categoria]?.icon ?? FALLBACK.icon;
}

export function labelDeCategoria(categoria: string): string {
  return CATEGORIAS[categoria]?.label ?? categoria;
}

export function ordenDeCategoria(categoria: string): number {
  return CATEGORIAS[categoria]?.orden ?? FALLBACK.orden;
}

// Ordena una lista de categorías (las del catálogo) según el orden sugerido.
export function ordenarCategorias(categorias: string[]): string[] {
  return [...categorias].sort(
    (a, b) => ordenDeCategoria(a) - ordenDeCategoria(b) || a.localeCompare(b),
  );
}
