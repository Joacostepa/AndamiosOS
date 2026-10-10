"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

// La oficina del pañol: encabezado y pestañas, iguales en todas sus pantallas (maqueta
// Oficina-Bandeja). El layout no se vuelve a montar al pasar de una pestaña a otra, así que
// el encabezado no parpadea.
//
// UN SOLO CORAL POR PANTALLA: "Ingreso de compra" va en el encabezado sólo en la Bandeja,
// que es donde no hay otra acción principal. Cada pestaña tiene la suya (en Stock, el alta
// de un artículo) y dos corales juntos dejan de decir cuál es la próxima acción.

const PESTANAS: { href: string; titulo: string }[] = [
  { href: "/deposito/panol", titulo: "Bandeja" },
  { href: "/deposito/panol/stock", titulo: "Stock" },
  { href: "/deposito/panol/herramientas", titulo: "Herramientas" },
  { href: "/deposito/panol/afuera", titulo: "Qué hay afuera" },
  { href: "/deposito/panol/movimientos", titulo: "Movimientos" },
  { href: "/deposito/panol/consumo", titulo: "Consumo" },
  { href: "/deposito/panol/etiquetas", titulo: "Etiquetas" },
  { href: "/deposito/panol/configuracion", titulo: "Configuración" },
];

const BANDEJA = "/deposito/panol";

function activa(href: string, pathname: string): boolean {
  return href === BANDEJA ? pathname === BANDEJA : pathname === href || pathname.startsWith(`${href}/`);
}

export default function PanolLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: perfil } = useUser();
  const encargado = !!perfil?.activo && (perfil.rol === "admin" || perfil.permisos?.panol === "editar");
  const enBandeja = pathname === BANDEJA;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted-foreground">Depósito y Logística › Pañol</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pañol</h1>
        </div>
        {enBandeja && encargado && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-9 max-sm:h-10" nativeButton={false} render={<Link href="/deposito/panol/etiquetas" />}>
              <Printer aria-hidden /> Imprimir etiquetas
            </Button>
            <Button className="h-9 max-sm:h-10" nativeButton={false} render={<Link href="/deposito/panol/stock?ingreso=1" />}>
              <Plus aria-hidden /> Ingreso de compra
            </Button>
          </div>
        )}
      </header>

      <nav aria-label="Secciones del pañol" className="-mx-1 overflow-x-auto border-b">
        <ul className="flex min-w-max gap-1 px-1">
          {PESTANAS.map((p) => {
            const actual = activa(p.href, pathname);
            return (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={actual ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-[13.5px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    actual ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.titulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
