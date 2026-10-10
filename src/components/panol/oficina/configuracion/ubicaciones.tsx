"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useCrearRaices, useGuardarUbicacion } from "@/hooks/use-panol-config";
import type { Articulo, Saldo, TipoUbicacion, Ubicacion } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";
import { SELECT, Seccion } from "./ui";

// Ubicaciones del pañol: el árbol Pañol › Estantería › Estante › Cajón (docs §2).
//
// NO SE BORRA NADA: una ubicación tiene historial (movimientos con "u:<id>"), así que se
// desactiva, y desactivar se deshace desde el aviso. Lo que no se puede es desactivar una
// ubicación que todavía tiene algo: stock, lo que vive ahí, o ubicaciones activas adentro.
// Dejarla "vacía en los papeles" con cosas adentro es perderlas de vista.

export const TITULO_UBICACION: Record<TipoUbicacion, string> = {
  panol: "Pañol", deposito: "Depósito", estanteria: "Estantería", estante: "Estante", cajon: "Cajón",
};

/** Qué puede ir adentro de cada cosa. El primero es el que se propone. */
const ADENTRO: Record<TipoUbicacion, TipoUbicacion[]> = {
  panol: ["estanteria", "estante", "cajon"],
  deposito: ["estanteria", "estante", "cajon"],
  estanteria: ["estante", "cajon"],
  estante: ["cajon"],
  cajon: [],
};

const EJEMPLO: Record<TipoUbicacion, string> = {
  panol: "Pañol", deposito: "Depósito", estanteria: "Estantería E3", estante: "Estante 2", cajon: "E3-2-04",
};

type Dialogo =
  | { modo: "alta"; padre: Ubicacion | null; tipos: TipoUbicacion[] }
  | { modo: "editar"; ubicacion: Ubicacion };

const ordenar = (a: Ubicacion, b: Ubicacion) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es", { numeric: true });

export function Ubicaciones({
  ubicaciones, articulos, saldos, puedeEditar,
}: {
  ubicaciones: Ubicacion[];
  articulos: Articulo[];
  saldos: Saldo[];
  puedeEditar: boolean;
}) {
  const guardar = useGuardarUbicacion();
  const raices = useCrearRaices();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [verInactivas, setVerInactivas] = useState(false);

  const hijos = new Map<string | null, Ubicacion[]>();
  for (const u of ubicaciones) {
    const k = u.padre_id;
    hijos.set(k, [...(hijos.get(k) ?? []), u]);
  }
  for (const l of hijos.values()) l.sort(ordenar);
  const visibles = (padre: string | null) => (hijos.get(padre) ?? []).filter((u) => verInactivas || u.activo);
  const inactivas = ubicaciones.filter((u) => !u.activo).length;

  const viven = (id: string) => articulos.filter((a) => a.activo && a.ubicacion_id === id).length;

  /** Por qué no se puede desactivar, o null si se puede. */
  function frenoParaDesactivar(u: Ubicacion): string | null {
    if ((hijos.get(u.id) ?? []).some((h) => h.activo)) return "Primero desactivá lo que tiene adentro.";
    if (saldos.some((s) => s.lugar === `u:${u.id}` && s.cantidad !== 0)) return "Tiene stock: movelo o contalo antes de desactivarla.";
    const n = viven(u.id);
    if (n > 0) return `${n === 1 ? "Un artículo vive" : `${n} artículos viven`} acá: cambiales la ubicación antes.`;
    return null;
  }

  function cambiarActivo(u: Ubicacion, activo: boolean) {
    if (!activo) {
      const freno = frenoParaDesactivar(u);
      if (freno) return toast.error(`No se puede desactivar ${u.nombre}`, { description: freno });
    }
    guardar.mutate(
      { id: u.id, activo },
      {
        onSuccess: () =>
          toast.success(activo ? `${u.nombre} está activa de nuevo` : `${u.nombre} quedó desactivada`, {
            action: { label: "Deshacer", onClick: () => guardar.mutate({ id: u.id, activo: !activo }) },
          }),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
      },
    );
  }

  /** Sube o baja una ubicación entre sus hermanas. Renumera de a 10 para que no haya empates. */
  async function mover(u: Ubicacion, delta: -1 | 1) {
    const hermanas = [...(hijos.get(u.padre_id) ?? [])];
    const i = hermanas.findIndex((h) => h.id === u.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= hermanas.length) return;
    [hermanas[i], hermanas[j]] = [hermanas[j], hermanas[i]];
    try {
      await Promise.all(
        hermanas.map((h, k) => (h.orden === k * 10 ? null : guardar.mutateAsync({ id: h.id, orden: k * 10 }))),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el orden");
    }
  }

  function crearRaices() {
    raices.mutate(undefined, {
      onSuccess: () => toast.success("Listo: Pañol y Depósito creados. Ahora sumales las estanterías."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo crear"),
    });
  }

  // Una función y no un componente: un componente definido adentro de otro se vuelve a
  // montar en cada render.
  function nodo(u: Ubicacion, nivel: number): React.ReactNode {
    const adentro = visibles(u.id);
    const hermanas = hijos.get(u.padre_id) ?? [];
    const pos = hermanas.findIndex((h) => h.id === u.id);
    const n = viven(u.id);
    return (
      <li key={u.id}>
        <div
          className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-3 hover:bg-muted/40", !u.activo && "text-muted-foreground")}
          style={{ paddingLeft: `${1 + nivel * 1.5}rem` }}
        >
          <span className="min-w-0 flex-1">
            <span className={cn("text-[14px]", nivel === 0 ? "font-semibold" : "font-medium", !u.activo && "line-through")}>{u.nombre}</span>
            <span className="ml-2 text-[12px] text-muted-foreground">
              {TITULO_UBICACION[u.tipo]}
              {n > 0 && ` · ${n} ${n === 1 ? "artículo" : "artículos"}`}
              {!u.activo && " · desactivada"}
            </span>
          </span>
          {puedeEditar && (
            <span className="flex flex-wrap items-center gap-1">
              {u.activo && (
                <>
                  <Button variant="ghost" size="icon-sm" aria-label={`Subir ${u.nombre}`} disabled={pos <= 0 || guardar.isPending} onClick={() => void mover(u, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Bajar ${u.nombre}`} disabled={pos >= hermanas.length - 1 || guardar.isPending} onClick={() => void mover(u, 1)}>
                    <ArrowDown />
                  </Button>
                  {ADENTRO[u.tipo].length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setDialogo({ modo: "alta", padre: u, tipos: ADENTRO[u.tipo] })}>
                      <Plus /> {TITULO_UBICACION[ADENTRO[u.tipo][0]]}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setDialogo({ modo: "editar", ubicacion: u })}>Editar</Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => cambiarActivo(u, !u.activo)} disabled={guardar.isPending}>
                {u.activo ? "Desactivar" : "Reactivar"}
              </Button>
            </span>
          )}
        </div>
        {adentro.length > 0 && (
          <ul>
            {adentro.map((h) => nodo(h, nivel + 1))}
          </ul>
        )}
      </li>
    );
  }

  const arriba = visibles(null);

  return (
    <Seccion
      id="h-ubicaciones"
      titulo="Ubicaciones"
      ayuda="El árbol del pañol y del depósito: estanterías, estantes y cajones. Cada estante y cada cajón lleva su QR. Lo que tiene historial no se borra: se desactiva."
      accion={
        <div className="flex flex-wrap items-center gap-2">
          {inactivas > 0 && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <input type="checkbox" className="size-4" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
              Ver desactivadas ({inactivas})
            </label>
          )}
          {ubicaciones.length > 0 && (
            <Link href="/deposito/panol/etiquetas?tipo=cajones&solo=nuevas" className="text-[13px] underline-offset-2 hover:underline">
              Imprimir etiquetas
            </Link>
          )}
        </div>
      }
    >
      {ubicaciones.length === 0 ? (
        <EmptyState icon={MapPin} title="Todavía no hay ubicaciones" description="Empezá por el pañol y el depósito; después les sumás las estanterías, los estantes y los cajones.">
          {puedeEditar ? (
            <Button variant="outline" onClick={crearRaices} disabled={raices.isPending}>
              {raices.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Crear «Pañol» y «Depósito»
            </Button>
          ) : (
            <p className="text-[13px] text-muted-foreground">Las crea un encargado del pañol.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <ul className="py-1">
            {arriba.map((u) => nodo(u, 0))}
          </ul>
          {puedeEditar && (
            <div className="border-t px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => setDialogo({ modo: "alta", padre: null, tipos: ["panol", "deposito"] })}>
                <Plus /> Otro pañol o depósito
              </Button>
            </div>
          )}
        </>
      )}

      {dialogo && (
        <DialogoUbicacion
          key={dialogo.modo === "editar" ? dialogo.ubicacion.id : `alta-${dialogo.padre?.id ?? "raiz"}`}
          dialogo={dialogo}
          ordenSiguiente={((hijos.get(dialogo.modo === "alta" ? dialogo.padre?.id ?? null : null) ?? []).reduce((m, h) => Math.max(m, h.orden), -10)) + 10}
          onCerrar={() => setDialogo(null)}
        />
      )}
    </Seccion>
  );
}

function DialogoUbicacion({ dialogo, ordenSiguiente, onCerrar }: { dialogo: Dialogo; ordenSiguiente: number; onCerrar: () => void }) {
  const guardar = useGuardarUbicacion();
  const [nombre, setNombre] = useState(dialogo.modo === "editar" ? dialogo.ubicacion.nombre : "");
  const [tipo, setTipo] = useState<TipoUbicacion>(dialogo.modo === "editar" ? dialogo.ubicacion.tipo : dialogo.tipos[0]);

  const titulo = dialogo.modo === "editar"
    ? `Editar ${dialogo.ubicacion.nombre}`
    : dialogo.padre ? `Agregar adentro de ${dialogo.padre.nombre}` : "Agregar un pañol o depósito";

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return;
    const datos = dialogo.modo === "editar"
      ? { id: dialogo.ubicacion.id, nombre: limpio }
      : { padre_id: dialogo.padre?.id ?? null, nombre: limpio, tipo, orden: ordenSiguiente };
    guardar.mutate(datos, {
      onSuccess: () => {
        toast.success(dialogo.modo === "editar" ? "Ubicación guardada" : `${limpio} creada. Su QR queda en Etiquetas › Sólo las nuevas.`);
        onCerrar();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar"),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>Un nombre corto, como está escrito en la estantería: es lo que va debajo del QR.</DialogDescription>
          </DialogHeader>
          {dialogo.modo === "alta" && dialogo.tipos.length > 1 && (
            <label className="grid gap-1 text-[13px]">
              Qué es
              <select className={SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as TipoUbicacion)}>
                {dialogo.tipos.map((t) => <option key={t} value={t}>{TITULO_UBICACION[t]}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-[13px]">
            Nombre
            <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={`Ej. ${EJEMPLO[tipo]}`} maxLength={60} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" variant="secondary" disabled={!nombre.trim() || guardar.isPending}>
              {guardar.isPending && <Loader2 className="animate-spin" />} {dialogo.modo === "editar" ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
