// Galería de plantillas agrupada como la pide JS: Fachadas · Bandejas y pórticos · Torres ·
// Interiores y escaleras · Especiales. Sale SOLA del registro de tipologías: una tipología
// nueva registrada en _nuevas.ts aparece acá sin tocar la pantalla.

import { presetsGaleria, type PresetGaleria } from "@/lib/tecnica/modelo";
import {
  ArrowDownToLine, Boxes, Building2, CircleDot, Footprints, GalleryVerticalEnd, Grid3x3, LayoutPanelTop,
  Layers, MoveVertical, PanelTop, Rows3, SquareStack, TowerControl, Truck, Warehouse, type LucideIcon,
} from "lucide-react";

export type GrupoGaleria = "fachadas" | "bandejas" | "torres" | "interiores" | "especiales";

export const GRUPOS: { id: GrupoGaleria; etiqueta: string }[] = [
  { id: "fachadas", etiqueta: "Fachadas" },
  { id: "bandejas", etiqueta: "Bandejas y pórticos" },
  { id: "torres", etiqueta: "Torres" },
  { id: "interiores", etiqueta: "Interiores y escaleras" },
  { id: "especiales", etiqueta: "Especiales" },
];

/** Tipologías de interior/escalera (las categorías del núcleo no distinguen interiores). */
const INTERIORES = /patio|hueco|sobre_escalera|interior/i;

export function grupoDePreset(p: Pick<PresetGaleria, "tipologia" | "categoria">): GrupoGaleria {
  if (INTERIORES.test(p.tipologia)) return "interiores";
  switch (p.categoria) {
    case "fachada": return "fachadas";
    case "bandeja":
    case "portico": return "bandejas";
    case "torre": return "torres";
    default: return "especiales";
  }
}

export function galeriaAgrupada(): { id: GrupoGaleria; etiqueta: string; presets: PresetGaleria[] }[] {
  const todos = presetsGaleria().flatMap((g) => g.presets);
  return GRUPOS.map((g) => ({ ...g, presets: todos.filter((p) => grupoDePreset(p) === g.id) })).filter((g) => g.presets.length);
}

const ICONOS: Record<string, LucideIcon> = {
  fachada: Building2, pantalla: PanelTop, voladizo: LayoutPanelTop, bastidor: Rows3, torre: TowerControl,
  escalera: Footprints, portico: GalleryVerticalEnd, camion: Truck, libre: Grid3x3, bandeja: Layers,
  colgante: ArrowDownToLine, envolvente: CircleDot, patio: Warehouse, movil: MoveVertical, plataforma: SquareStack,
};

export function iconoDe(icono: string | undefined, tipologia?: string): LucideIcon {
  if (icono && ICONOS[icono]) return ICONOS[icono];
  for (const [k, v] of Object.entries(ICONOS)) if (icono?.includes(k) || tipologia?.includes(k)) return v;
  return Boxes;
}
