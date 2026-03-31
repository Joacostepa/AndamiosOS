import {
  Building2, Users, Wrench, Package, Truck, UserCheck, BarChart3, Bell,
  Settings, FileText, ClipboardList, Ruler, Calculator, Calendar, HardHat,
  PackagePlus, AlertTriangle, Shield, Search, Car, Hammer, MessageSquare,
  Target, MapPin, DollarSign, Fingerprint, Bot, Building, ListOrdered,
  type LucideIcon,
} from "lucide-react";

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
      { title: "Oportunidades", href: "/comercial/oportunidades", icon: Target },
      { title: "Relevamientos", href: "/comercial/relevamientos", icon: MapPin },
      { title: "Cotizaciones", href: "/comercial/cotizaciones", icon: DollarSign },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Obras", href: "/obras", icon: Building2 },
      { title: "Clientes", href: "/clientes", icon: Users },
      { title: "Planificacion", href: "/planificacion", icon: Calendar },
    ],
  },
  {
    label: "Oficina Tecnica",
    items: [
      { title: "Proyectos", href: "/oficina-tecnica/proyectos", icon: Ruler },
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
      { title: "Permisos", href: "/permisos", icon: Shield },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Alertas", href: "/alertas", icon: Bell },
      {
        title: "Configuracion", href: "/configuracion", icon: Settings,
        subItems: [
          { title: "Agentes IA", href: "/configuracion/agentes-ia" },
          { title: "Datos empresa", href: "/configuracion/empresa" },
          { title: "Lista de precios", href: "/configuracion/lista-precios" },
        ],
      },
    ],
  },
];
