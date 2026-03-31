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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  children?: { title: string; href: string }[];
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
