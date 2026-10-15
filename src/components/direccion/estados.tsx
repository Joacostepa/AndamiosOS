"use client";

// Estados vacíos y de error (§7.7): nunca una pantalla en blanco ni un 0 en lugar de un
// dato que falta. Y el registro de la lectura de cada pantalla para el encabezado.

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Database, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { instanteCorto } from "@/lib/direccion/formato";
import type { Lectura, PantallaId, TcDia } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDireccion } from "./contexto";

const ICONOS = { datos: Database, candado: Lock, ok: CircleCheck } as const;

/**
 * Estado vacío. `positivo` = algo bueno ("Nada para decidir", "Todos los datos al día"):
 * va en verde con ✓ y en una línea.
 */
export function EstadoVacio({
  titulo,
  texto,
  icono = "datos",
  acciones,
  positivo,
  className,
}: {
  titulo: string;
  texto?: string;
  icono?: keyof typeof ICONOS;
  acciones?: React.ReactNode;
  positivo?: boolean;
  className?: string;
}) {
  if (positivo) {
    return (
      <div className={cn("flex items-center gap-2 px-0.5 py-1.5 text-[13px] font-semibold text-(--dir-bien)", className)}>
        <CircleCheck className="size-4" aria-hidden /> {titulo}
        {texto && <span className="font-normal text-muted-foreground">· {texto}</span>}
      </div>
    );
  }
  const Icono = ICONOS[icono];
  return (
    <div className={cn("flex flex-col items-center gap-3 px-5 py-14 text-center text-muted-foreground", className)}>
      <Icono className="size-8" aria-hidden />
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
      {texto && <p className="max-w-[46ch]">{texto}</p>}
      {acciones && <div className="flex flex-wrap justify-center gap-2">{acciones}</div>}
    </div>
  );
}

function BotonReintentar({ primario }: { primario?: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <Button variant={primario ? "default" : "outline"} size="sm" onClick={() => empezar(() => router.refresh())} disabled={pendiente} className="max-md:h-11">
      <RefreshCw className={cn(pendiente && "animate-spin")} aria-hidden /> Reintentar
    </Button>
  );
}

/** "No pudimos leer Odoo (14:32). Mostramos los datos del jue 15/10 04:00." + Reintentar. */
export function BandaOdooCaido({ hora, desde }: { hora: string; desde: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2.5 rounded-lg border border-(--tb-ambar-borde) bg-(--dir-aten-bg) px-3 py-2 text-[13px] text-(--dir-aten)">
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">
        No pudimos leer Odoo ({hora}). Mostramos los datos del <b>{instanteCorto(desde)}</b>.
      </span>
      <BotonReintentar />
    </div>
  );
}

/** Sin datos (Odoo caído y sin snapshot): "Todavía no hay datos. Odoo no respondió." */
export function EstadoSinDatos({ motivo }: { motivo: string }) {
  return (
    <EstadoVacio
      titulo={motivo}
      texto="Cuando Odoo vuelva a responder, los datos aparecen solos."
      acciones={
        <>
          <BotonReintentar primario />
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/direccion/datos" />} className="max-md:h-11">
            Datos y definiciones
          </Button>
        </>
      }
    />
  );
}

/**
 * Cada página la renderiza con lo que leyó: alimenta "Datos de Odoo al…" y el dólar del
 * encabezado. No pinta nada.
 */
export function LecturaPantalla({ pantalla, lectura, tc }: { pantalla: PantallaId; lectura: Lectura | null; tc: TcDia | null }) {
  const { setLectura } = useDireccion();
  const clave = `${pantalla}|${lectura?.tomadoAt ?? ""}|${lectura?.fuente ?? ""}|${tc?.fecha ?? ""}`;
  useEffect(() => {
    const vieja = !!lectura && Date.now() - new Date(lectura.tomadoAt).getTime() > 26 * 3600 * 1000;
    setLectura({ pantalla, lectura, tc, vacia: !lectura, vieja });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, setLectura]);
  return null;
}
