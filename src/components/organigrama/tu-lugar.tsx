"use client";

// «Tu lugar»: tu puesto, tu cuadrilla y a quién reportás, con el botón de llamar. Sale del
// legajo vinculado al usuario (personal.user_id) o, si es de oficina, de su usuario.
// Solo para lectores: los editores vienen a otra cosa.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { nombreCompleto, personaDe, puestosDePersona, quienResponde } from "@/lib/organigrama/arbol";
import type { Persona } from "@/lib/organigrama/tipos";
import { BotonLlamar, useEnlaces } from "./fila-ocupante";
import { useOrg } from "./proveedor";

export function TuLugar() {
  const { datos, usuario, puedeEditar } = useOrg();
  const enlaces = useEnlaces();
  if (!usuario || puedeEditar) return null;
  const puestos = puestosDePersona(datos, usuario.id);
  const p = puestos[0];
  if (!p) return null;

  // A quién reporta: el operario, a su capataz; el resto, a quien responde por el puesto de arriba.
  let jefe: Persona | undefined;
  if (p.cuadrilla && p.cuadrilla.capataz !== usuario.id) jefe = personaDe(datos.personas, p.cuadrilla.capataz);
  else if (p.nodo.dependeDe) jefe = quienResponde(datos, p.nodo.dependeDe)?.personas[0];
  const plantel = p.cuadrilla && p.cuadrilla.capataz === usuario.id ? p.cuadrilla.plantel.length : 0;

  return (
    <section aria-label="Tu lugar" className="rounded-md border bg-card px-3 py-3">
      <h2 className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Tu lugar</h2>
      <Link href={enlaces.puesto(p.nodo.clave)} scroll={false} className="mt-1 flex min-h-11 items-center gap-2 hover:underline">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{p.detalle ?? p.nodo.titulo}</span>
          <span className="block text-[12.5px] text-muted-foreground">
            {p.detalle ? p.nodo.titulo : p.nodo.rol}
            {plantel > 0 && ` · ${plantel} en tu cuadrilla`}
            {puestos.length > 1 && ` · también ${puestos.slice(1).map((x) => x.nodo.titulo).join(", ")}`}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
      {jefe && (
        <div className="mt-1 flex items-center gap-2 border-t pt-2 text-[13.5px]">
          <span className="min-w-0 flex-1">
            Reportás a{" "}
            <Link href={enlaces.persona(jefe.id)} scroll={false} className="font-medium underline-offset-2 hover:underline">
              {nombreCompleto(jefe)}
            </Link>
          </span>
          <BotonLlamar persona={jefe} />
        </div>
      )}
    </section>
  );
}
