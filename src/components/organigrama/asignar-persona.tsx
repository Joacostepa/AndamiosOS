"use client";

// Asignar una persona a un puesto (o un puesto a una persona, desde «Activos sin puesto»).
//
// DECISIÓN: la ocupación NO pasa por el borrador. Es inmediata, con «Deshacer» en el toast: la
// gente cambia todas las semanas y la estructura dos veces por año; si se mezclan, nadie publica.
//
// Las personas salen de Legajos (gente de obra) y de los usuarios (oficina). Para alguien de
// afuera (una empresa, un contratista) se escribe el nombre: queda como ocupante «Externo» con
// nombre libre, sin crear ningún legajo.

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { areaDe, nodoDe, nombreCompleto, ocupantesVigentes, personaDe, puestosDeArea, hijos, raiz } from "@/lib/organigrama/arbol";
import { idExternoLibre } from "@/lib/organigrama/datos";
import { seUbicaAMano } from "@/lib/organigrama/lienzo";
import type { Modalidad } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { AvatarPersona } from "./fila-ocupante";
import { useOrg } from "./proveedor";

export function AsignarPersona({ nodo, persona, reemplaza, onCerrar }: { nodo?: string; persona?: string; reemplaza?: string; onCerrar: () => void }) {
  const { datos, asignar } = useOrg();
  const [elegido, setElegido] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>("titular");
  const [externo, setExterno] = useState("");
  const n = nodoDe(datos.nodos, nodo);
  const p = personaDe(datos.personas, persona);
  const reemplazado = personaDe(datos.personas, datos.ocupantes.find((o) => o.id === reemplaza)?.persona);

  // Modo «a este puesto, ¿quién?»: activos que todavía no lo ocupan.
  const yaEstan = new Set(n ? ocupantesVigentes(datos, n.clave).map((o) => o.persona) : []);
  const candidatos = datos.personas
    .filter((x) => x.activo && seUbicaAMano(x.id) && !yaEstan.has(x.id))
    .sort((a, b) => (a.apellido || a.nombre).localeCompare(b.apellido || b.nombre));

  // Modo «a esta persona, ¿qué puesto?»: los de la estructura vigente, por área.
  const dg = raiz(datos.nodos);
  const opcionesPuesto = dg
    ? [dg, ...hijos(datos.nodos, dg.clave).flatMap((a) => [a, ...puestosDeArea(datos.nodos, a.clave).map((x) => x.nodo)])].filter(
        (x) => x.fuenteOcupantes !== "cuadrillas",
      )
    : [];

  const nombreExterno = externo.trim();
  const confirmar = () => {
    if (n && nombreExterno) {
      asignar(n.clave, idExternoLibre(nombreExterno), modalidad, reemplaza);
      onCerrar();
      return;
    }
    if (!elegido) return;
    if (n) asignar(n.clave, elegido, modalidad, reemplaza);
    else if (p) asignar(elegido, p.id, modalidad);
    onCerrar();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{n ? `Asignar persona a ${n.titulo}` : `Asignar un puesto a ${p ? nombreCompleto(p) : ""}`}</DialogTitle>
          <DialogDescription>
            {reemplazado
              ? `Reemplaza a ${nombreCompleto(reemplazado)}, que deja el puesto hoy. `
              : ""}
            Es inmediato: no pasa por el borrador.
          </DialogDescription>
        </DialogHeader>

        <Command className="rounded-md! border">
          <CommandInput placeholder={n ? "Buscar persona…" : "Buscar puesto…"} />
          <CommandList className="max-h-64">
            <CommandEmpty>No hay resultados.</CommandEmpty>
            <CommandGroup>
              {n
                ? candidatos.map((x) => (
                    <CommandItem
                      key={x.id}
                      value={`${nombreCompleto(x)} ${x.id}`}
                      onSelect={() => {
                        setElegido(x.id);
                        setExterno("");
                      }}
                      className="min-h-10"
                    >
                      <AvatarPersona persona={x} />
                      <span className="flex-1">{nombreCompleto(x)}</span>
                      <span className="text-[12px] text-muted-foreground">{x.origen === "externo" ? "Externo" : x.origen === "usuario" ? "Usuario" : "Legajo"}</span>
                      {elegido === x.id && <Check aria-label="Elegida" className="size-4" />}
                    </CommandItem>
                  ))
                : opcionesPuesto.map((x) => (
                    <CommandItem key={x.clave} value={`${x.titulo} ${x.clave}`} onSelect={() => setElegido(x.clave)} className="min-h-10">
                      <span className="flex-1">
                        {x.titulo}
                        {x.tipo === "puesto" && <span className="block text-[12px] text-muted-foreground">{areaDe(datos.nodos, x.clave)?.titulo}</span>}
                      </span>
                      {elegido === x.clave && <Check aria-label="Elegido" className="size-4" />}
                    </CommandItem>
                  ))}
            </CommandGroup>
          </CommandList>
        </Command>

        {n && (
          <div className="grid gap-1.5">
            <label htmlFor="ocupante-externo" className="text-[13px] font-medium">
              ¿Es de afuera? <span className="font-normal text-muted-foreground">Empresa o contratista, sin legajo</span>
            </label>
            <Input
              id="ocupante-externo"
              value={externo}
              maxLength={120}
              onChange={(e) => {
                setExterno(e.target.value);
                if (e.target.value.trim()) setElegido(null);
              }}
              placeholder="Ej.: Servicios Edilicios Sur"
              className="h-10"
            />
          </div>
        )}

        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-[13px] font-medium">Modalidad</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["titular", "interino"] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  "flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border text-[13.5px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  modalidad === m ? "border-foreground font-semibold" : "text-muted-foreground",
                )}
              >
                <input type="radio" name="modalidad" value={m} checked={modalidad === m} onChange={() => setModalidad(m)} className="sr-only" />
                {m === "titular" ? "Titular" : "Interino"}
              </label>
            ))}
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="h-9 max-sm:h-10" disabled={!elegido && !(n && nombreExterno)} onClick={confirmar}>
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
