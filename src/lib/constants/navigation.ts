import {
  Building2, Users, Wrench, Package, Truck, UserCheck, BarChart3, Bell,
  Settings, FileText, ClipboardList, Calculator, Calendar, HardHat,
  PackagePlus, AlertTriangle, Search, Car, Hammer, MessageSquare,
  MapPin, Fingerprint, Bot, Building, ListOrdered, ShieldCheck, FileBarChart,
  type LucideIcon,
} from "lucide-react";

import { puedeAbrir, type Acceso } from "@/lib/auth/acceso";

export type NavSubItem = { title: string; href: string };
export type NavItem = { title: string; href: string; icon: LucideIcon; subItems?: NavSubItem[] };
export type NavGroup = { label?: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    items: [{ title: "Inicio", href: "/", icon: BarChart3 }],
  },
  {
    label: "Comercial",
    items: [
      { title: "Clientes", href: "/clientes", icon: Users },
      { title: "Relevamientos", href: "/comercial/relevamientos", icon: MapPin },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Obras", href: "/obras", icon: Building2 },
      { title: "Ordenes de Trabajo", href: "/ordenes-trabajo", icon: ListOrdered },
      { title: "Habilitaciones", href: "/habilitaciones", icon: ShieldCheck },
      { title: "Informes de obra", href: "/informes-obra", icon: FileBarChart },
      { title: "Mapa de Obras", href: "/mapa-obras", icon: MapPin },
      { title: "Planificacion", href: "/planificacion", icon: Calendar },
    ],
  },
  {
    label: "Oficina Tecnica",
    items: [
      { title: "Computos", href: "/oficina-tecnica/computos", icon: Calculator },
    ],
  },
  {
    label: "Deposito y Logistica",
    items: [
      { title: "Stock", href: "/deposito/stock", icon: Package },
      { title: "Catalogo de Piezas", href: "/deposito/catalogo", icon: Wrench },
      { title: "Movimientos", href: "/deposito/movimientos", icon: ClipboardList },
      { title: "Remitos", href: "/logistica/remitos", icon: FileText },
      { title: "Insumos", href: "/deposito/insumos", icon: Hammer },
    ],
  },
  {
    label: "Campo",
    items: [
      { title: "Partes de Obra", href: "/partes", icon: HardHat },
      { title: "Solicitudes Extra", href: "/solicitudes-extra", icon: PackagePlus },
      { title: "Incidentes", href: "/incidentes", icon: AlertTriangle },
      { title: "Inspecciones", href: "/inspecciones", icon: Search },
    ],
  },
  {
    label: "Personal y Flota",
    items: [
      { title: "Legajos", href: "/personal", icon: UserCheck },
      { title: "Fichadas", href: "/fichadas", icon: Fingerprint },
      { title: "Vehiculos", href: "/vehiculos", icon: Car },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Alertas", href: "/alertas", icon: Bell },
      {
        title: "Configuracion", href: "/configuracion", icon: Settings,
        subItems: [
          { title: "Cuadrillas", href: "/configuracion/cuadrillas" },
          { title: "Agentes IA", href: "/configuracion/agentes-ia" },
          { title: "Datos empresa", href: "/configuracion/empresa" },
          { title: "Lista de precios", href: "/configuracion/lista-precios" },
          { title: "Fletes por zona", href: "/configuracion/fletes" },
          { title: "Precios fachadas", href: "/configuracion/precios-fachadas" },
          { title: "Imágenes referencia", href: "/configuracion/imagenes" },
          { title: "Usuarios", href: "/configuracion/usuarios" },
        ],
      },
    ],
  },
];

/**
 * El menú que le corresponde a quien entra.
 *
 * Filtra con la MISMA función con la que el proxy bloquea las rutas (acceso.ts), así el
 * menú no puede prometer una pantalla que después rebota. Los sub-ítems se filtran igual
 * —Usuarios es sólo de admin aunque Configuración no lo sea— y los grupos que quedan sin
 * ítems desaparecen enteros: un encabezado "Depósito y Logística" con nada debajo es peor
 * que no estar.
 */
export function navegacionPara(acceso: Acceso | null): NavGroup[] {
  return navigation
    .map((g) => ({
      ...g,
      items: g.items
        .map((i) => (i.subItems ? { ...i, subItems: i.subItems.filter((s) => puedeAbrir(acceso, s.href)) } : i))
        .filter((i) => puedeAbrir(acceso, i.href) && (!i.subItems || i.subItems.length > 0)),
    }))
    .filter((g) => g.items.length > 0);
}
