"use client";

// Organigrama (docs/organigrama/modulo.md). Los datos viven en Supabase (tablas org_*) y los
// trae el proveedor; lo que se cambia acá se ve al instante y se guarda en segundo plano.
//
// Mismo esqueleto que el pañol: migas, h1, acciones y pestañas como links (una ruta por
// pestaña). El layout no se vuelve a montar al cambiar de pestaña, así que el estado (borrador
// abierto, búsqueda, historial de guardado) sobrevive a la navegación.
//
// UN SOLO CORAL POR PANTALLA: en el mapa, «Imprimir» y «Editar estructura» son outline; el
// coral aparece en la barra del borrador («Publicar versión») o en la ficha de una vacante.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogosOrganigrama } from "@/components/organigrama/dialogos";
import { EstadoCarga } from "@/components/organigrama/estados";
import { HojasOrganigrama } from "@/components/organigrama/hojas";
import { ProveedorOrganigrama, useOrg } from "@/components/organigrama/proveedor";
import { nombreCompleto, pendientes } from "@/lib/organigrama/arbol";
import { hoyBA } from "@/lib/organigrama/datos";
import { cn } from "@/lib/utils";

const MAPA = "/organigrama";
const LIENZO = "/organigrama/lienzo";

function activa(href: string, pathname: string): boolean {
  return href === MAPA ? pathname === MAPA : pathname === href || pathname.startsWith(`${href}/`);
}

function Marco({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { puedeEditar, enBorrador, dispatch, usuario, datosVigentes, carga, guardando } = useOrg();
  const enImprimir = pathname.startsWith("/organigrama/imprimir");
  const enMapa = pathname === MAPA;
  const listo = carga === "listo";
  const revisar = puedeEditar && listo ? pendientes(datosVigentes, hoyBA()).accionables : 0;
  const forma = pathname.startsWith(LIENZO) ? "lienzo" : pathname.startsWith("/organigrama/personas") ? "lista" : "mapa";

  const pestanas = [
    { href: LIENZO, titulo: "Lienzo" },
    { href: MAPA, titulo: "Mapa" },
    { href: "/organigrama/personas", titulo: "Personas" },
    ...(puedeEditar
      ? [
          { href: "/organigrama/revisar", titulo: `Para revisar${revisar ? ` (${revisar})` : ""}` },
          { href: "/organigrama/versiones", titulo: "Versiones" },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 print:hidden">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted-foreground">
            Personal y Flota › Organigrama{enImprimir && " › Imprimir"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Organigrama</h1>
        </div>
        <p role="status" className="ml-auto text-[12.5px] text-muted-foreground empty:hidden max-sm:order-last">
          {guardando ? "Guardando…" : ""}
        </p>
        {enMapa && listo && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-9 max-sm:h-10" nativeButton={false} render={<Link href="/organigrama/imprimir" />}>
              <Printer aria-hidden /> Imprimir
            </Button>
            {puedeEditar && !enBorrador && (
              <Button
                variant="outline"
                className="h-9 max-md:hidden"
                onClick={() => dispatch({ tipo: "entrar", autor: usuario ? nombreCompleto(usuario) : "Editor" })}
              >
                <Pencil aria-hidden /> Editar estructura
              </Button>
            )}
          </div>
        )}
      </header>

      {!enImprimir && (
        <nav aria-label="Secciones del organigrama" className="-mx-1 overflow-x-auto border-b">
          <ul className="flex min-w-max gap-1 px-1">
            {pestanas.map((p) => {
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
      )}

      {listo ? children : <EstadoCarga forma={forma} />}

      <Suspense fallback={null}>
        <HojasOrganigrama />
      </Suspense>
      <DialogosOrganigrama />
    </div>
  );
}

export default function OrganigramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorOrganigrama>
      <Marco>{children}</Marco>
    </ProveedorOrganigrama>
  );
}
