import {
  Building2,
  Users,
  Wrench,
  Package,
  Truck,
  UserCheck,
  BarChart3,
  Bell,
  Settings,
  FileText,
  ClipboardList,
  Ruler,
  Calculator,
  Calendar,
  HardHat,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    items: [
      {
        title: "Inicio",
        href: "/",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Operaciones",
    items: [
      {
        title: "Obras",
        href: "/obras",
        icon: Building2,
      },
      {
        title: "Clientes",
        href: "/clientes",
        icon: Users,
      },
      {
        title: "Planificacion",
        href: "/planificacion",
        icon: Calendar,
      },
    ],
  },
  {
    label: "Oficina Tecnica",
    items: [
      {
        title: "Proyectos",
        href: "/oficina-tecnica/proyectos",
        icon: Ruler,
      },
      {
        title: "Computos",
        href: "/oficina-tecnica/computos",
        icon: Calculator,
      },
    ],
  },
  {
    label: "Deposito y Logistica",
    items: [
      {
        title: "Stock",
        href: "/deposito/stock",
        icon: Package,
      },
      {
        title: "Catalogo de Piezas",
        href: "/deposito/catalogo",
        icon: Wrench,
      },
      {
        title: "Movimientos",
        href: "/deposito/movimientos",
        icon: ClipboardList,
      },
      {
        title: "Remitos",
        href: "/logistica/remitos",
        icon: FileText,
      },
      {
        title: "Entregas / Retiros",
        href: "/logistica/entregas",
        icon: Truck,
      },
    ],
  },
  {
    label: "Campo",
    items: [
      {
        title: "Partes de Obra",
        href: "/partes",
        icon: HardHat,
      },
      {
        title: "Solicitudes Extra",
        href: "/solicitudes-extra",
        icon: PackagePlus,
      },
    ],
  },
  {
    label: "Personal",
    items: [
      {
        title: "Legajos",
        href: "/personal",
        icon: UserCheck,
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        title: "Alertas",
        href: "/alertas",
        icon: Bell,
      },
      {
        title: "Configuracion",
        href: "/configuracion",
        icon: Settings,
      },
    ],
  },
];
