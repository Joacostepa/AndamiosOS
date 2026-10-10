"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCrearPrueba, useGestores, useGuardarGestores } from "@/hooks/use-permisos-via-publica";
import type { ListaPermisos } from "@/lib/permisos-via-publica/lista";
import { QueSaleSolo, cuantosConBoton } from "./modo-supervisado";

// Configuración de la lista de permisos (rediseño 09/10): lo que antes estaba arriba de la
// bandeja —el modo supervisado y "Probar el circuito"— más quiénes pueden tocar lo que no se
// deshace. Son ajustes, no trabajo del día.

export function Configuracion({ lista }: { lista: ListaPermisos }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const crearPrueba = useCrearPrueba();
  const conBoton = cuantosConBoton(lista.supervision);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)} className="max-sm:h-10">
        <Settings2 className="size-4" /> Configuración
        {conBoton > 0 && <span className="text-muted-foreground">· {conBoton} con botón</span>}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Configuración de permisos</DialogTitle>
            <DialogDescription>Qué sale solo, quiénes pueden presentar y armar la encomienda, y la prueba del circuito.</DialogDescription>
          </DialogHeader>

          <section className="space-y-2">
            <h3 className="text-[14px] font-semibold">Qué sale solo</h3>
            <QueSaleSolo supervision={lista.supervision} puedeEditar={lista.yo.puedeEditar} />
            <p className="text-[12px] text-muted-foreground">
              Todos los mails van con copia a la vendedora y a quien inició el trámite, y las respuestas le llegan a la vendedora.
            </p>
          </section>

          <Gestores esAdmin={lista.yo.esAdmin} />

          <section className="space-y-2">
            <h3 className="text-[14px] font-semibold">Probar el circuito</h3>
            <p className="text-[12px] text-muted-foreground">Crea un trámite de prueba: los mails llegan a tu casilla y nunca se presenta.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={crearPrueba.isPending || !lista.yo.puedeEditar}
              onClick={() =>
                crearPrueba.mutate(undefined, {
                  onSuccess: (r) => {
                    toast.success(r.linkEnviado ? "Prueba creada: te llegó el link a tu mail" : "Prueba creada, pero el mail no salió: usá el link de la ficha");
                    router.push(`/permisos-via-publica/tramites/${r.tramiteId}`);
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo crear la prueba"),
                })
              }
            >
              {crearPrueba.isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Probar el circuito
            </Button>
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Quiénes pueden armar la encomienda, presentar en TAD y empezar de cero. Sin nadie marcado, cualquiera que edite. */
function Gestores({ esAdmin }: { esAdmin: boolean }) {
  const consulta = useGestores(true);
  const guardar = useGuardarGestores();
  const actuales = consulta.data?.gestores ?? [];

  function alternar(email: string, si: boolean) {
    const nuevos = si ? [...new Set([...actuales, email])] : actuales.filter((m) => m !== email);
    guardar.mutate(nuevos, {
      onSuccess: (r) => toast.success(r.gestores.length ? "Gestores guardados" : "Sin gestores: cualquiera que edite puede presentar y armar la encomienda"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="text-[14px] font-semibold">Quiénes presentan y arman la encomienda</h3>
      <p className="text-[12px] text-muted-foreground">
        Armar la encomienda (el robot la paga), presentar en TAD y empezar de cero no se deshacen. Los administradores siempre pueden.
        {actuales.length === 0 ? " Hoy no hay nadie marcado: puede cualquiera que edite el módulo." : ""}
        {!esAdmin && " Sólo un administrador lo cambia."}
      </p>
      {consulta.isLoading ? (
        <p className="text-[12px] text-muted-foreground">Cargando…</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(consulta.data?.candidatos ?? []).filter((c) => !c.admin).map((c) => (
            <li key={c.email} className="px-3 py-2">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={actuales.includes(c.email)}
                  disabled={!esAdmin || guardar.isPending}
                  onChange={(ev) => alternar(c.email, ev.target.checked)}
                />
                <span className="font-medium">{c.nombre}</span>
                <span className="text-[12px] text-muted-foreground">{c.email}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
