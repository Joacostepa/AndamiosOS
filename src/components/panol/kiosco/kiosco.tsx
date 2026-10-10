"use client";

// El kiosco del pañol: el celular o la tablet fijos y compartidos (docs §5).
//
// Cada operación empieza en «¿Quién sos?» y vuelve ahí al terminar, al tocar «No soy X» o
// tras un minuto sin uso (sesion.tsx). Los flujos se montan con la identidad como `key`:
// cuando cambia quién está parado enfrente, el vale a medio armar del anterior desaparece
// con él, que es lo que tiene que pasar en un equipo compartido.

import { useState } from "react";
import { LogOut, Package, TriangleAlert } from "lucide-react";
import { descartarPendiente, useDatosKiosco, useEnLinea, usePendientes, useVaciarPendientes } from "@/hooks/use-panol-kiosco";
import { contar } from "@/lib/panol/kiosco";
import { useKiosco } from "./sesion";
import { QuienSos } from "./quien-sos";
import { Inicio, type Gesto } from "./inicio";
import { FlujoRetiro } from "./retiro";
import { FlujoHerramienta } from "./herramienta";
import { FlujoCuadrilla } from "./cuadrilla";
import { Aviso, BarraSinConexion, Pantalla } from "./ui";

export function Kiosco() {
  const { identidad, salir } = useKiosco();
  const datos = useDatosKiosco();
  const enLinea = useEnLinea();
  const pendientes = usePendientes();
  useVaciarPendientes();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-foreground text-background">
            <Package className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold">Pañol</p>
            <p className="text-sm text-muted-foreground">Kiosco</p>
          </div>
        </div>
        {identidad && (
          <button type="button" onClick={salir} className="flex h-14 items-center gap-2 rounded-lg border border-input px-4 text-base font-semibold">
            <LogOut className="size-5" aria-hidden />
            No soy {identidad.nombre.split(" ")[0]}
          </button>
        )}
      </header>
      {!enLinea && <BarraSinConexion />}
      <Pendientes pendientes={pendientes} />
      {datos.error && !datos.cat.articulos.length ? (
        <Pantalla>
          <Aviso tono="bloqueo">No pude cargar el catálogo del pañol: {datos.error.message}. Revisá la señal y recargá la página.</Aviso>
        </Pantalla>
      ) : identidad ? (
        <Sesion key={identidad.token} datos={datos} />
      ) : (
        <QuienSos datos={datos} />
      )}
    </div>
  );
}

function Sesion({ datos }: { datos: ReturnType<typeof useDatosKiosco> }) {
  const { identidad, salir } = useKiosco();
  const [gesto, setGesto] = useState<Gesto | null>(null);
  const [unidadInicial, setUnidadInicial] = useState<string | null>(null);
  if (!identidad) return null;
  const inicio = () => {
    setGesto(null);
    setUnidadInicial(null);
  };
  const comun = { identidad, datos, onInicio: inicio, onTerminar: salir };

  if (gesto === "retiro" || gesto === "sobrante") {
    return (
      <FlujoRetiro
        key={gesto}
        modo={gesto}
        {...comun}
        onUnidad={(id) => {
          setUnidadInicial(id);
          setGesto("herramienta");
        }}
      />
    );
  }
  if (gesto === "herramienta") return <FlujoHerramienta unidadInicial={unidadInicial} {...comun} />;
  if (gesto === "cuadrilla") return <FlujoCuadrilla {...comun} />;
  return <Inicio identidad={identidad} onElegir={setGesto} />;
}

/** Vales guardados sin señal: cuántos esperan, y los que la base rechazó al reintentar. */
function Pendientes({ pendientes }: { pendientes: ReturnType<typeof usePendientes> }) {
  const esperando = pendientes.filter((p) => !p.rechazo);
  const rechazados = pendientes.filter((p) => p.rechazo);
  if (!pendientes.length) return null;
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-2">
      {esperando.length > 0 && (
        <p className="text-base font-semibold text-amber-900 dark:text-amber-200">
          {contar(esperando.length, "vale guardado", "vales guardados")} en este equipo: se confirman solos cuando vuelva la señal.
        </p>
      )}
      {rechazados.map((p) => (
        <div key={p.vale.clientUuid} className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-900 dark:text-red-100">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 text-base">
            <p className="font-semibold">No se pudo confirmar un vale de {p.quien}: {p.resumen}</p>
            <p>{p.rechazo} Hay que cargarlo de nuevo.</p>
          </div>
          <button type="button" onClick={() => descartarPendiente(p.vale.clientUuid)} className="h-14 shrink-0 rounded-lg border border-current px-4 font-semibold">
            Entendido
          </button>
        </div>
      ))}
    </div>
  );
}
