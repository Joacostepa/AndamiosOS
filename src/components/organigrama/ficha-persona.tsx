"use client";

// La ficha de persona (?persona=<id>): sus puestos, a quién reporta y quién le reporta.
//
// OJO: solo datos de contacto LABORALES (teléfono y, si es usuario, email). Nunca DNI,
// domicilio ni salud: para eso está Legajos, con su propio permiso.

import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Caja, HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { Aviso, Chip } from "@/components/permisos-via-publica/ui";
import { Button } from "@/components/ui/button";
import {
  areaDe,
  estadoPuesto,
  fechaCorta,
  hijos,
  jefesDe,
  nombreCompleto,
  personaDe,
  puestosDePersona,
  telefonoInternacional,
  UMBRAL_SOBRECARGA,
} from "@/lib/organigrama/arbol";
import type { Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { clasesArea } from "./colores-area";
import { AvatarPersona, BotonLlamar, useEnlaces } from "./fila-ocupante";
import { useOrg } from "./proveedor";
import { personasDe } from "./tarjeta-puesto";

const ORIGEN: Record<Persona["origen"], string> = { legajo: "Legajo", usuario: "Usuario de la app", externo: "Externo" };

function ListaPersonas({ personas }: { personas: Persona[] }) {
  const enlaces = useEnlaces();
  return (
    <>
      {personas.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link href={enlaces.persona(p.id)} scroll={false} className="font-medium underline-offset-2 hover:underline">
            {nombreCompleto(p)}
          </Link>
        </span>
      ))}
    </>
  );
}

export function FichaPersona({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { datos, puedeEditar, abrir } = useOrg();
  const enlaces = useEnlaces();
  const persona = personaDe(datos.personas, id);

  if (!persona) {
    return (
      <HojaLateral abierta onCerrar={onCerrar} titulo="Persona no encontrada">
        <Aviso tono="bloqueo" titulo="Esa persona no está en el organigrama">
          <Link href="/organigrama/personas" className="font-medium underline">
            Ver todas las personas
          </Link>
        </Aviso>
      </HojaLateral>
    );
  }

  const puestos = puestosDePersona(datos, persona.id);
  const claves = new Set(puestos.map((p) => p.nodo.clave));

  // Reporta a: jefesDe (el operario, a su capataz). Le reportan: los ocupantes de los puestos
  // de abajo (y las vacantes), o el plantel si es capataz.
  const jefes = jefesDe(datos, persona.id);
  const aCargo = new Map<string, { persona?: Persona; vacante?: string }>();
  for (const p of puestos) {
    if (p.cuadrilla) {
      if (p.cuadrilla.capataz === persona.id) {
        for (const x of p.cuadrilla.plantel) {
          const pp = personaDe(datos.personas, x);
          if (pp) aCargo.set(pp.id, { persona: pp });
        }
      }
      continue;
    }
    for (const h of hijos(datos.nodos, p.nodo.clave)) {
      if (claves.has(h.clave)) continue;
      const ps = personasDe(datos, h.clave).filter((x) => x.id !== persona.id);
      if (estadoPuesto(datos, h.clave).vacante && !ps.length) aCargo.set(`vacante-${h.clave}`, { vacante: h.titulo });
      for (const x of ps) aCargo.set(x.id, { persona: x });
    }
  }
  const primeraArea = puestos[0] ? areaDe(datos.nodos, puestos[0].nodo.clave) : undefined;
  const carga = claves.size;

  return (
    <HojaLateral
      abierta
      onCerrar={onCerrar}
      titulo={
        <span className="inline-flex items-center gap-2.5">
          <AvatarPersona persona={persona} size="default" />
          <span className={cn(!persona.activo && "line-through")}>{nombreCompleto(persona)}</span>
        </span>
      }
      sub={[ORIGEN[persona.origen], persona.empresa, primeraArea?.titulo].filter(Boolean).join(" · ")}
      pie={
        puedeEditar && persona.origen === "legajo" ? (
          <Button variant="outline" className="h-9 max-sm:h-10" nativeButton={false} render={<Link href="/personal" />}>
            Ver legajo <ArrowUpRight aria-hidden />
          </Button>
        ) : undefined
      }
    >
      {!persona.activo && (
        <Aviso tono="bloqueo" titulo={`Dado de baja en Legajos${persona.bajaEl ? ` el ${fechaCorta(persona.bajaEl, true)}` : ""}.`}>
          {carga > 0 ? `Sigue figurando en ${carga === 1 ? "1 puesto" : `${carga} puestos`}. Hay que quitarlo o asignar un reemplazo.` : "Ya no ocupa ningún puesto."}
        </Aviso>
      )}

      {persona.activo && (persona.telefono || persona.email) && (
        <div className="flex flex-wrap gap-2">
          <BotonLlamar persona={persona} conNumero />
          {persona.telefono && (
            <Button
              variant="outline"
              className="h-9 max-sm:h-10"
              nativeButton={false}
              render={<a href={`https://wa.me/${telefonoInternacional(persona.telefono).slice(1)}`} target="_blank" rel="noreferrer" />}
            >
              <MessageCircle aria-hidden /> WhatsApp
            </Button>
          )}
          {persona.email && <span className="self-center text-[13px] text-muted-foreground">{persona.email}</span>}
        </div>
      )}

      <Caja
        titulo={
          <>
            Puestos ({carga})
            {carga >= UMBRAL_SOBRECARGA && <Chip tono="aviso">{carga} puestos</Chip>}
          </>
        }
      >
        {puestos.length ? (
          <ul className="grid gap-1">
            {puestos.map((p) => {
              const a = areaDe(datos.nodos, p.nodo.clave);
              return (
                <li key={`${p.nodo.clave}-${p.detalle ?? ""}`}>
                  <Link
                    href={enlaces.puesto(p.nodo.clave)}
                    scroll={false}
                    className="flex min-h-10 items-center gap-2 rounded-md px-1 text-[13.5px] hover:bg-muted/60"
                  >
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", clasesArea(a?.color).punto)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.detalle ?? p.nodo.titulo}</span>
                      {p.detalle && <span className="block text-[12px] text-muted-foreground">{p.nodo.titulo}</span>}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">{p.modalidad === "interino" ? "Interino" : "Titular"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono="neutro">Sin puesto en el organigrama</Chip>
            {puedeEditar && persona.activo && (
              <Button variant="outline" className="h-9 max-sm:h-10" onClick={() => abrir({ tipo: "asignar", persona: persona.id })}>
                Asignar a un puesto
              </Button>
            )}
          </div>
        )}
      </Caja>

      {puestos.length > 0 && (
        <div className="grid gap-1 px-1 text-[13px]">
          <p>
            <span className="text-muted-foreground">Reporta a: </span>
            {jefes.length ? <ListaPersonas personas={jefes} /> : <span className="text-muted-foreground">—</span>}
          </p>
          <p>
            <span className="text-muted-foreground">Le reportan: </span>
            {aCargo.size ? (
              [...aCargo.entries()].map(([k, v], i) => (
                <span key={k}>
                  {i > 0 && ", "}
                  {v.persona ? (
                    <Link href={enlaces.persona(v.persona.id)} scroll={false} className="font-medium underline-offset-2 hover:underline">
                      {nombreCompleto(v.persona)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{v.vacante} (vacante)</span>
                  )}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
      )}
    </HojaLateral>
  );
}
