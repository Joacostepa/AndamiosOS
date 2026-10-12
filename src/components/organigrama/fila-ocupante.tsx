"use client";

// Piezas de persona que se repiten en todo el módulo: el avatar con iniciales, el botón de
// llamar y la fila de un ocupante en la ficha de puesto. Sin fotos en la fase 1.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, UserRound, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/permisos-via-publica/ui";
import {
  diasEntre,
  fechaCorta,
  iniciales,
  mesAnio,
  nombreCompleto,
  personaDe,
  puestosDePersona,
  telefonoInternacional,
} from "@/lib/organigrama/arbol";
import { HOY } from "@/lib/organigrama/datos-maqueta";
import type { Nodo, Ocupante, Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { useOrg } from "./proveedor";

/** Los links de las hojas laterales se arman sobre la pestaña actual (?puesto= / ?persona=). */
export function useEnlaces() {
  const pathname = usePathname();
  const base = pathname.startsWith("/organigrama/imprimir") ? "/organigrama" : pathname;
  return {
    puesto: (clave: string) => `${base}?puesto=${encodeURIComponent(clave)}`,
    persona: (id: string) => `${base}?persona=${encodeURIComponent(id)}`,
    cerrar: base,
  };
}

export function AvatarPersona({ persona, size = "sm", className }: { persona: Persona; size?: "sm" | "default" | "lg"; className?: string }) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={cn("font-medium", !persona.activo && "line-through")}>{iniciales(persona)}</AvatarFallback>
    </Avatar>
  );
}

export function AvatarVacio() {
  return (
    <Avatar size="sm">
      <AvatarFallback className="border border-dashed border-muted-foreground/60 bg-transparent">
        <UserRound aria-hidden className="size-3.5 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Avatares de ocupantes; cada uno es un link a su ficha (?persona=). Como la tarjeta entera
 * es un link estirado, los avatares van con `relative z-10` para quedar arriba.
 */
export function GrupoAvatares({ personas, max = 3, enlazar = true }: { personas: Persona[]; max?: number; enlazar?: boolean }) {
  const enlaces = useEnlaces();
  if (!personas.length) return <AvatarVacio />;
  const visibles = personas.slice(0, max);
  const resto = personas.length - visibles.length;
  return (
    // -space-x-1 (no -2): con avatares chicos, las iniciales tienen que leerse enteras.
    <AvatarGroup className="-space-x-1">
      {visibles.map((p) =>
        enlazar ? (
          <Link
            key={p.id}
            href={enlaces.persona(p.id)}
            scroll={false}
            data-slot="avatar"
            aria-label={`Ver a ${nombreCompleto(p)}`}
            title={nombreCompleto(p)}
            className="relative z-10 rounded-full ring-2 ring-card focus-visible:outline-2 focus-visible:outline-ring"
          >
            <AvatarPersona persona={p} />
          </Link>
        ) : (
          <AvatarPersona key={p.id} persona={p} />
        ),
      )}
      {resto > 0 && <AvatarGroupCount className="size-6 text-[11px]">+{resto}</AvatarGroupCount>}
    </AvatarGroup>
  );
}

export function BotonLlamar({ persona, conNumero = false }: { persona: Persona; conNumero?: boolean }) {
  if (!persona.telefono) return null;
  const href = `tel:${telefonoInternacional(persona.telefono)}`;
  if (conNumero) {
    return (
      <Button variant="outline" className="h-9 max-sm:h-10" nativeButton={false} render={<a href={href} />}>
        <Phone aria-hidden /> {persona.telefono}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-9 shrink-0 max-sm:size-10"
      nativeButton={false}
      render={<a href={href} aria-label={`Llamar a ${nombreCompleto(persona)} (${persona.telefono})`} />}
    >
      <Phone aria-hidden />
    </Button>
  );
}

/** Una persona en la caja «Quién lo ocupa». */
export function FilaOcupante({ ocupante, nodo }: { ocupante: Ocupante; nodo: Nodo }) {
  const { datos, puedeEditar, quitar, abrir } = useOrg();
  const enlaces = useEnlaces();
  const persona = personaDe(datos.personas, ocupante.persona);
  if (!persona) return null;
  const otros = puestosDePersona(datos, persona.id).filter((x) => x.nodo.clave !== nodo.clave);
  const titularEn = otros.filter((x) => x.modalidad === "titular");
  const desdeCuadrilla = ocupante.id.startsWith("cuadrilla-");
  const baja = !persona.activo;

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b py-2.5 last:border-b-0">
      <AvatarPersona persona={persona} size="default" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={enlaces.persona(persona.id)}
            scroll={false}
            className={cn("text-[13.5px] font-medium hover:underline", baja && "text-muted-foreground line-through")}
          >
            {nombreCompleto(persona)}
          </Link>
          {baja && <Chip tono="bloqueo">Dado de baja en Legajos{persona.bajaEl ? ` el ${fechaCorta(persona.bajaEl)}` : ""}</Chip>}
          {ocupante.modalidad === "interino" && (
            <Chip tono="neutro">
              Interino desde {fechaCorta(ocupante.desde)} · {diasEntre(ocupante.desde, HOY)} días
            </Chip>
          )}
          {persona.origen === "externo" && <Chip tono="neutro">Externo{persona.empresa ? ` · ${persona.empresa}` : ""}</Chip>}
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {desdeCuadrilla
            ? `Capataz · ${datos.cuadrillas.find((c) => `cuadrilla-${c.id}` === ocupante.id)?.nombre ?? "cuadrilla"}`
            : ocupante.modalidad === "titular"
              ? `Titular · desde ${mesAnio(ocupante.desde)}`
              : titularEn.length
                ? `Titular en: ${titularEn.map((x) => x.nodo.titulo).join(", ")}`
                : "Interino"}
        </p>
        {otros.length > 0 && ocupante.modalidad === "titular" && (
          <p className="text-[12.5px] text-muted-foreground">
            También:{" "}
            {otros.map((x, i) => (
              <span key={x.nodo.clave}>
                {i > 0 && ", "}
                <Link href={enlaces.puesto(x.nodo.clave)} scroll={false} className="underline-offset-2 hover:underline">
                  {x.nodo.titulo}
                </Link>
              </span>
            ))}
          </p>
        )}
        {baja && puedeEditar && !desdeCuadrilla && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" className="h-9 max-sm:h-10" onClick={() => quitar(ocupante.id)}>
              Quitar del puesto
            </Button>
            <Button variant="outline" className="h-9 max-sm:h-10" onClick={() => abrir({ tipo: "asignar", nodo: nodo.clave, reemplaza: ocupante.id })}>
              Asignar reemplazo
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {!baja && <BotonLlamar persona={persona} />}
        {puedeEditar && !baja && !desdeCuadrilla && (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 max-sm:size-10"
            onClick={() => quitar(ocupante.id)}
            aria-label={`Quitar a ${nombreCompleto(persona)} de ${nodo.titulo}`}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
