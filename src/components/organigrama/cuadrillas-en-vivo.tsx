"use client";

// Las cuadrillas debajo de Montajes: capataz → plantel, leídas «en vivo» (en la app real, de
// cuadrillas + cuadrilla_personal + pan_personas_externas). No se copia nada al organigrama:
// Configuración › Cuadrillas sigue siendo la única fuente.

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Caja } from "@/components/hoja-dia/comunes/hoja-lateral";
import { Chip } from "@/components/permisos-via-publica/ui";
import { nombreCompleto, personaDe } from "@/lib/organigrama/arbol";
import type { Cuadrilla, Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { AvatarPersona, BotonLlamar, GrupoAvatares, useEnlaces } from "./fila-ocupante";
import { useOrg } from "./proveedor";

function FilaCuadrilla({ cuadrilla }: { cuadrilla: Cuadrilla }) {
  const { datos } = useOrg();
  const enlaces = useEnlaces();
  const [abierta, setAbierta] = useState(false);
  const capataz = personaDe(datos.personas, cuadrilla.capataz);
  const plantel = cuadrilla.plantel.map((id) => personaDe(datos.personas, id)).filter((p): p is Persona => !!p);
  const externos = plantel.filter((p) => p.origen === "externo").length;
  const id = `plantel-${cuadrilla.id}`;

  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={id}
          onClick={() => setAbierta((x) => !x)}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierta && "rotate-180")} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">
              {cuadrilla.nombre} · Capataz {capataz ? nombreCompleto(capataz) : "sin asignar"}
            </span>
            <span className="block text-[12.5px] text-muted-foreground">
              {plantel.length - externos} operarios{externos > 0 && ` + ${externos} externo${externos > 1 ? "s" : ""}`}
            </span>
          </span>
          <GrupoAvatares personas={plantel} max={4} enlazar={false} />
        </button>
        {capataz && <BotonLlamar persona={capataz} />}
      </div>
      {abierta && (
        <ul id={id} className="mt-1 ml-6 grid gap-1">
          {plantel.map((p) => (
            <li key={p.id} className="flex min-h-10 items-center gap-2 text-[13px]">
              <AvatarPersona persona={p} />
              <Link href={enlaces.persona(p.id)} scroll={false} className="min-w-0 flex-1 truncate hover:underline">
                {nombreCompleto(p)}
              </Link>
              {p.origen === "externo" && <Chip tono="neutro">Externo{p.empresa ? ` · ${p.empresa}` : ""}</Chip>}
              <BotonLlamar persona={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CuadrillasEnVivo() {
  const { datos } = useOrg();
  return (
    <Caja
      titulo={
        <>
          Cuadrillas <span className="text-[12px] font-normal text-muted-foreground">(en vivo, de Configuración › Cuadrillas)</span>
        </>
      }
    >
      <div>
        {datos.cuadrillas.map((c) => (
          <FilaCuadrilla key={c.id} cuadrilla={c} />
        ))}
      </div>
    </Caja>
  );
}
