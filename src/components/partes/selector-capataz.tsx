"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { normalizar } from "@/lib/tablero/titulo";
import { cn } from "@/lib/utils";
import type { Empleado } from "@/lib/tablero/tipos-parte";

// Buscador de capataz. Reemplaza al desplegable, que obligaba a recorrer la lista entera
// de empleados a ojo para encontrar un apellido.
//
// SE BUSCA SIN ACENTOS NI MAYÚSCULAS. La lista viene de la base de empleados de Odoo,
// donde los nombres están cargados como cada uno los escribió: "GONZALEZ" y "González"
// conviven. Un filtro literal haría que escribir "gonzalez" no encuentre a "González", y
// el que carga el parte concluiría —razonablemente— que la persona no está en el sistema.
// Se usa el mismo normalizador que el buscador del tablero, así que el criterio es uno.
//
// LOS CAPATACES QUEDAN ARRIBA sin filtrar a nadie: la lista ya viene ordenada por escala
// desde Odoo, y ese orden se respeta. Filtrar por escala escondería al oficial que hoy
// está a cargo porque falta el capataz, que es justo el día en que importa registrarlo.

export function SelectorCapataz({
  empleados,
  valor,
  onCambio,
  cargando,
  error,
  onReintentar,
  deshabilitado = false,
}: {
  empleados: Empleado[];
  /** Id del empleado como string, "" si no hay ninguno elegido. */
  valor: string;
  onCambio: (id: string) => void;
  cargando: boolean;
  error: boolean;
  onReintentar: () => void;
  /** El form del tablero muestra el parte en lectura hasta que se pide editarlo. */
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const elegido = empleados.find((e) => String(e.id) === valor);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return empleados;
    // Todos los términos tienen que aparecer, en cualquier orden: "juan gomez" encuentra
    // a "GOMEZ, Juan Carlos". Buscar la frase entera fallaría con el apellido primero,
    // que es justamente como está cargada la base.
    const terminos = q.split(/\s+/);
    return empleados.filter((e) => {
      const heno = normalizar(`${e.nombre} ${e.escala ?? ""}`);
      return terminos.every((t) => heno.includes(t));
    });
  }, [empleados, busqueda]);

  if (error) {
    return (
      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-start text-[12px] font-normal text-muted-foreground"
          disabled
        >
          No se pudo traer la lista
        </Button>
        <span className="block text-[10px]" style={{ color: "#B42318" }}>
          No se pudo traer la lista de empleados de Odoo. Sin capataz no se puede guardar
          el parte.{" "}
          <button type="button" onClick={onReintentar} className="underline underline-offset-2">
            Reintentar
          </button>
        </span>
      </div>
    );
  }

  return (
    <Popover open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) setBusqueda(""); }}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between px-2 text-[12px] font-normal"
            disabled={deshabilitado}
          />
        }
      >
        <span className={cn("truncate", !elegido && "text-muted-foreground")}>
          {cargando && !elegido ? "Cargando…" : (elegido?.nombre ?? "Quién estuvo a cargo")}
        </span>
        {cargando && !elegido ? (
          <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin opacity-50" />
        ) : (
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 gap-0 p-0">
        {/* shouldFilter={false}: el filtrado lo hace `filtrados` con el normalizador de
            acentos. El de cmdk es literal y dejaría "González" fuera de "gonzalez". */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o apellido…"
            value={busqueda}
            onValueChange={setBusqueda}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>
              <span className="block px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nadie con ese nombre entre los {empleados.length} empleados.
              </span>
            </CommandEmpty>
            <CommandGroup>
              {filtrados.map((e) => (
                <CommandItem
                  key={e.id}
                  // El value es el id y no el nombre: hay homónimos, y con el nombre como
                  // clave cmdk trataría a dos personas distintas como la misma opción.
                  value={String(e.id)}
                  onSelect={() => {
                    onCambio(String(e.id));
                    setAbierto(false);
                    setBusqueda("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5 shrink-0",
                      String(e.id) === valor ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{e.nombre}</span>
                  {e.escala && (
                    <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
                      {e.escala}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
