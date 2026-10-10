"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Tablet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Chip } from "@/components/permisos-via-publica/ui";
import { nombreCompleto, type PersonaPanol } from "@/hooks/use-panol";
import { useVincularLegajo, type UsuarioPanol } from "@/hooks/use-panol-config";
import { Cuenta, SELECT, Seccion, fechaHora } from "./ui";

// Encargados y kiosco (docs §5). No hay "pañolero": está a cargo quien tiene Pañol en
// "editar" (o es admin) Y tiene su legajo vinculado, porque en el kiosco se identifica con
// la credencial de su legajo y es el legajo el que lo lleva a su usuario. Sin legajo, en la
// oficina puede todo, pero en el kiosco es un operario más.
//
// El permiso NO se da acá: se da por persona en Configuración › Usuarios. Duplicarlo sería
// tener dos lugares que pueden contradecirse.

const USUARIOS = "/configuracion/usuarios";

export function Encargados({
  usuarios, personas, esAdmin,
}: {
  usuarios: UsuarioPanol[];
  personas: PersonaPanol[];
  esAdmin: boolean;
}) {
  const [vinculando, setVinculando] = useState<UsuarioPanol | null>(null);
  const encargados = usuarios.filter((u) => u.encargado).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const legajoDe = (userId: string) => personas.find((p) => p.tipo === "persona" && p.userId === userId) ?? null;
  const sinLegajo = encargados.filter((u) => !legajoDe(u.id));

  return (
    <Seccion
      id="h-encargados"
      titulo={<>Encargados del pañol <Cuenta n={encargados.length} /></>}
      ayuda="Permiso «editar» en Pañol (o administrador) y legajo vinculado. Si no hay nadie, el kiosco sigue en autoservicio y todo queda registrado."
      accion={<Link href={USUARIOS} className="text-[13px] underline-offset-2 hover:underline">El permiso se da en Usuarios</Link>}
    >
      {encargados.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          Nadie tiene Pañol en «editar». Dáselo a quien corresponda en <Link href={USUARIOS} className="underline">Configuración › Usuarios</Link>.
        </p>
      ) : (
        <ul className="divide-y">
          {encargados.map((u) => {
            const legajo = legajoDe(u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="min-w-0 flex-1 text-[14px] font-medium">
                  {u.nombre}
                  <span className="ml-1 text-[12px] font-normal text-muted-foreground">· {u.esAdmin ? "administrador" : u.email}</span>
                </span>
                {legajo ? (
                  <span className="inline-flex items-center gap-1 text-[13px] text-emerald-800 dark:text-emerald-300">
                    <Check aria-hidden className="size-3.5" strokeWidth={3} /> Legajo de {nombreCompleto(legajo)}
                  </span>
                ) : (
                  <Chip tono="aviso">Falta vincular el legajo</Chip>
                )}
                {esAdmin ? (
                  <Button variant={legajo ? "ghost" : "outline"} size="sm" onClick={() => setVinculando(u)}>
                    {legajo ? "Cambiar" : "Vincular legajo"}
                  </Button>
                ) : (
                  !legajo && <span className="text-[12px] text-muted-foreground">Lo vincula un administrador</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sinLegajo.length > 0 && (
        <p className="border-t px-4 py-2 text-[12px] text-muted-foreground">
          Sin legajo vinculado, {sinLegajo.length === 1 ? sinLegajo[0].nombre : "ellos"} no {sinLegajo.length === 1 ? "puede" : "pueden"} identificarse como encargado en el kiosco.
        </p>
      )}
      {vinculando && (
        <DialogoLegajo usuario={vinculando} personas={personas} actual={legajoDe(vinculando.id)} onCerrar={() => setVinculando(null)} />
      )}
    </Seccion>
  );
}

function DialogoLegajo({
  usuario, personas, actual, onCerrar,
}: {
  usuario: UsuarioPanol;
  personas: PersonaPanol[];
  actual: PersonaPanol | null;
  onCerrar: () => void;
}) {
  const vincular = useVincularLegajo();
  const [elegido, setElegido] = useState(actual?.id ?? "");
  // Los legajos activos libres, más el que ya tiene (para poder dejarlo como está).
  const opciones = personas
    .filter((p) => p.tipo === "persona" && p.activo && (!p.userId || p.userId === usuario.id))
    .sort((a, b) => a.apellido.localeCompare(b.apellido, "es"));

  function guardar(personalId: string | null) {
    vincular.mutate(
      { userId: usuario.id, personalId },
      {
        onSuccess: () => {
          const p = personas.find((x) => x.id === personalId);
          toast.success(p ? `Legajo de ${nombreCompleto(p)} vinculado a ${usuario.nombre}` : `${usuario.nombre} quedó sin legajo vinculado`, {
            action: { label: "Deshacer", onClick: () => vincular.mutate({ userId: usuario.id, personalId: actual?.id ?? null }) },
          });
          onCerrar();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo vincular"),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Legajo de {usuario.nombre}</DialogTitle>
          <DialogDescription>Con su legajo vinculado, cuando se identifica en el kiosco con su credencial o su PIN se le habilita lo de encargado.</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-[13px]">
          Legajo
          <select className={SELECT} value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">Elegí un legajo…</option>
            {opciones.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}{p.detalle ? ` · ${p.detalle}` : ""}</option>)}
          </select>
        </label>
        <DialogFooter>
          {actual && (
            <Button variant="ghost" className="mr-auto" disabled={vincular.isPending} onClick={() => guardar(null)}>Desvincular</Button>
          )}
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="secondary" disabled={!elegido || elegido === actual?.id || vincular.isPending} onClick={() => guardar(elegido)}>
            {vincular.isPending && <Loader2 className="animate-spin" />} Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Kiosco({ usuarios, ultimoKiosco }: { usuarios: UsuarioPanol[]; ultimoKiosco: Map<string, string> }) {
  const kioscos = usuarios.filter((u) => u.kiosco);
  return (
    <Seccion
      id="h-kiosco"
      titulo={<>Kiosco <Cuenta n={kioscos.length} /></>}
      ayuda={
        <>
          El celular o la tablet del pañol queda logueado con un usuario que tiene <strong>sólo</strong> «Kiosco del pañol». Ese usuario
          registra movimientos a nombre de quien se identifica; no es encargado: no recibe avisos, no aprueba y no entra a la oficina.
          Se crea en <Link href={USUARIOS} className="underline">Configuración › Usuarios</Link>.
        </>
      }
    >
      {kioscos.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          Todavía no hay usuario de kiosco. Creá uno en Usuarios con el perfil que quieras y dejale sólo «Kiosco del pañol» en «editar».
        </p>
      ) : (
        <ul className="divide-y">
          {kioscos.map((u) => {
            const ultimo = ultimoKiosco.get(u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <Tablet aria-hidden className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-[14px] font-medium">
                  {u.nombre} <span className="text-[12px] font-normal text-muted-foreground">· {u.email}</span>
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {ultimo ? `Último movimiento ${fechaHora(ultimo)}` : "Sin movimientos todavía"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}
