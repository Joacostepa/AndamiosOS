"use client";

// Encabezado del sector (§7.1): la pregunta de la pantalla, "Datos de Odoo al…", el dólar,
// el toggle de moneda (en la URL) y "Actualizar ahora". Debajo, las pestañas (escritorio);
// en el celular las reemplaza la barra inferior. Sticky al hacer scroll.
//
// Las acciones propias de una pantalla (Compartir, Reunión en La semana) las pone la página,
// debajo del encabezado. El selector de período de Ventas va DENTRO del encabezado, en el hueco
// #dir-encabezado-extra (con un portal desde la página): si quedara afuera, al hacer scroll
// pasaría por detrás del encabezado sticky y se vería encimado.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fdia, hoyBA, instanteCorto, nf, textoSemana } from "@/lib/direccion/formato";
import { seccionDeRuta, seccionesVisibles } from "@/lib/direccion/secciones";
import type { Moneda } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDireccion, useMoneda, useQueryMoneda } from "./contexto";
import { MENSAJE_SIN_SOCIOS } from "@/lib/direccion/permisos";

export function ToggleMoneda({ className }: { className?: string }) {
  const [moneda, setMoneda] = useMoneda();
  // "ARS de hoy" queda oculto hasta que haya IPC cargado (revisión E23).
  const opciones: Moneda[] = ["USD", "ARS"];
  return (
    <div role="group" aria-label="Moneda" className={cn("inline-flex rounded-md border p-0.5 text-xs", className)}>
      {opciones.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={moneda === m}
          onClick={() => setMoneda(m)}
          className={cn("min-h-7 rounded px-2.5 font-semibold max-md:min-h-11 max-md:px-3.5", moneda === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function BotonActualizar() {
  const { lectura } = useDireccion();
  const router = useRouter();
  const pathname = usePathname();
  const [pidiendo, setPidiendo] = useState(false);
  const [refrescando, empezar] = useTransition();
  const pantalla = lectura.pantalla ?? seccionDeRuta(pathname).id;
  const girando = pidiendo || refrescando;

  async function actualizar() {
    setPidiendo(true);
    try {
      const r = await fetch(`/api/direccion/actualizar?pantalla=${pantalla}`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast(j.error ?? "No se pudo actualizar.");
        return;
      }
      // Las cifras anteriores quedan a la vista mientras se relee (no se vacía la pantalla).
      empezar(() => router.refresh());
    } finally {
      setPidiendo(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={actualizar} disabled={girando} title="Actualizar ahora (relee Odoo)" aria-label="Actualizar ahora" className="max-md:size-11">
        <RefreshCw className={cn(girando && "animate-spin")} aria-hidden />
      </Button>
      {girando && <span className="sr-only" role="status">Actualizando…</span>}
    </>
  );
}

function LineaDatos() {
  const { lectura, tcLayout } = useDireccion();
  const pathname = usePathname();
  const seccion = seccionDeRuta(pathname);
  const hoy = hoyBA();
  const tc = lectura.tc ?? tcLayout;
  const l = lectura.lectura;
  const vieja = lectura.vieja;
  const partes: React.ReactNode[] = [];
  if (seccion.id === "semana") partes.push(<span key="s">{textoSemana(hoy)}</span>);
  else if (seccion.fotoDeHoy) partes.push(<span key="h">Hoy, <b className="font-semibold text-foreground">{fdia(hoy)}</b></span>);
  if (l) {
    partes.push(
      l.odooCaido || vieja ? (
        <span key="d" className="rounded-full bg-(--dir-aten-bg) px-2 py-px font-semibold text-(--dir-aten)">Datos del {instanteCorto(l.tomadoAt)}</span>
      ) : (
        <span key="d">Datos de Odoo al <b className="font-semibold text-foreground">{instanteCorto(l.tomadoAt)}</b></span>
      ),
    );
  }
  partes.push(
    <span key="tc">
      Dólar <b className="font-semibold text-foreground tabular-nums">{tc ? nf(tc.valor, 2) : "Sin dato"}</b>
    </span>,
  );
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
      {partes.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-2.5">
          {i > 0 && <span aria-hidden>·</span>}
          {p}
        </span>
      ))}
    </div>
  );
}

export function PestanasDireccion() {
  const { conSocios } = useDireccion();
  const pathname = usePathname();
  const qMoneda = useQueryMoneda();
  const activa = seccionDeRuta(pathname).id;
  return (
    <nav aria-label="Secciones de Dirección" className="-mb-px mt-2.5 overflow-x-auto max-md:hidden">
      <ul className="flex min-w-max gap-0.5">
        {seccionesVisibles(conSocios).map((s) => (
          <li key={s.id}>
            <Link
              href={`${s.href}${qMoneda}`}
              aria-current={activa === s.id ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 pt-2 pb-[9px] text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                activa === s.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.titulo}
              {s.socios && <Lock className="size-3" aria-hidden />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function EncabezadoDireccion() {
  const pathname = usePathname();
  const seccion = seccionDeRuta(pathname);
  return (
    <header className="sticky top-0 z-20 -mx-6 -mt-6 border-b bg-background/92 px-6 pt-4 backdrop-blur-md max-md:px-4 max-md:pb-2.5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <h1 className="text-xl font-semibold tracking-tight">{seccion.pregunta}</h1>
        {seccion.socios && (
          <span className="inline-flex items-center gap-1 rounded-full bg-(--dir-aten-bg) px-2 py-0.5 text-[11.5px] font-semibold text-(--dir-aten)">
            <Lock className="size-3" aria-hidden /> Sólo socios · se registra quién abre esta pantalla
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {seccion.id !== "datos" && <ToggleMoneda />}
          <BotonActualizar />
        </div>
      </div>
      <LineaDatos />
      <div id="dir-encabezado-extra" className="mt-2.5 empty:hidden" />
      <PestanasDireccion />
    </header>
  );
}

/** Toast "No tenés acceso a esa sección." cuando el proxy o la página rebotan a La semana. */
export function AvisoSinAcceso() {
  const q = useSearchParams();
  const motivo = q.get("motivo");
  useEffect(() => {
    if (motivo !== "sin-acceso") return;
    toast(MENSAJE_SIN_SOCIOS);
    const url = new URL(window.location.href);
    url.searchParams.delete("motivo");
    window.history.replaceState(null, "", url.toString());
  }, [motivo]);
  return null;
}
