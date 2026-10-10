"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { useAcceso } from "@/components/providers/acceso-provider";
import { useCatalogoPanol, usePersonasPanol } from "@/hooks/use-panol";
import {
  useCodigosPanol, useCredencialesEstado, useGuardarParametros, useParametrosConfig, useUbicacionesTodas, useUsuariosPanol,
} from "@/hooks/use-panol-config";
import { esAdmin as esAdminDe, nivelEn } from "@/lib/auth/acceso";
import type { ClaveParametro } from "@/lib/panol/tipos";
import { Credenciales } from "./credenciales";
import { Encargados, Kiosco } from "./encargados";
import { Externas } from "./externas";
import { Parametros, cambiosDe, invalidosDe, type Borrador } from "./parametros";
import { Seccion } from "./ui";
import { Ubicaciones } from "./ubicaciones";

// Configuración del pañol. Es una pantalla de ajustes, no de trabajo: lo que se toca una
// vez y se olvida. Un solo botón coral, "Guardar cambios", y sólo para los parámetros
// (que son números que se editan juntos y se guardan juntos); todo lo demás —ubicaciones,
// legajos, credenciales, externas— se guarda en el momento y se deshace desde el aviso.
//
// Quién toca qué: los parámetros, sólo un admin; ubicaciones, credenciales y externas, un
// encargado (Pañol en "editar"); vincular un legajo, un admin. Quien sólo ve, ve todo en
// lectura. La pantalla esconde los botones; la que frena de verdad es la base (RLS y RPC).

const INDICE = [
  ["h-ubicaciones", "Ubicaciones"],
  ["h-avisos", "Parámetros"],
  ["h-inspecciones", "Inspecciones"],
  ["h-encargados", "Encargados"],
  ["h-kiosco", "Kiosco"],
  ["h-credenciales", "Credenciales"],
  ["h-externas", "Personas externas"],
] as const;

export function PantallaConfiguracion() {
  const acceso = useAcceso();
  const esAdmin = esAdminDe(acceso);
  const encargado = esAdmin || nivelEn(acceso, "panol") === "editar";

  const ubicaciones = useUbicacionesTodas();
  const catalogo = useCatalogoPanol();
  const personas = usePersonasPanol();
  const parametros = useParametrosConfig();
  const usuarios = useUsuariosPanol();
  const codigos = useCodigosPanol();
  const credenciales = useCredencialesEstado();
  const guardar = useGuardarParametros();
  const [borrador, setBorrador] = useState<Borrador>({});

  const consultas = [ubicaciones, catalogo, personas, parametros, usuarios, codigos, credenciales];
  if (consultas.some((c) => c.isLoading)) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const error = consultas.find((c) => c.error)?.error;
  if (error) {
    return (
      <Aviso tono="bloqueo" titulo="No se pudo leer la configuración del pañol">
        {error instanceof Error ? error.message : String(error)}. Probá recargar la página.
      </Aviso>
    );
  }

  const filas = parametros.data?.parametros ?? [];
  const cambios = cambiosDe(borrador, filas);
  const nCambios = Object.keys(cambios).length;
  const hayInvalidos = invalidosDe(borrador).length > 0;
  const nombreDe = (id: string | null) =>
    !id ? "Sistema" : usuarios.data?.usuarios.find((u) => u.id === id)?.nombre ?? "Un usuario dado de baja";

  function guardarParametros() {
    if (!nCambios || hayInvalidos) return;
    const previos = Object.fromEntries(
      Object.keys(cambios).map((k) => [k, filas.find((f) => f.clave === k)?.valor]),
    ) as Partial<Record<ClaveParametro, number>>;
    guardar.mutate(cambios, {
      onSuccess: () => {
        setBorrador({});
        toast.success(nCambios === 1 ? "Parámetro guardado" : `${nCambios} parámetros guardados`, {
          description: "El cambio quedó en el historial.",
          action: { label: "Deshacer", onClick: () => guardar.mutate(previos) },
        });
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
    });
  }

  const listaPersonas = personas.data?.personas ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Configuración del pañol</h2>
          <nav aria-label="Secciones de la configuración" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {INDICE.map(([id, t]) => <a key={id} href={`#${id}`} className="underline-offset-2 hover:text-foreground hover:underline">{t}</a>)}
          </nav>
        </div>
        {esAdmin && (
          <div className="flex items-center gap-3">
            {nCambios > 0 && (
              <span className="text-[13px] text-muted-foreground">{nCambios === 1 ? "1 cambio sin guardar" : `${nCambios} cambios sin guardar`}</span>
            )}
            <Button size="lg" className="h-10 px-4" disabled={!nCambios || hayInvalidos || guardar.isPending} onClick={guardarParametros}>
              {guardar.isPending && <Loader2 className="animate-spin" />} Guardar cambios
            </Button>
          </div>
        )}
      </div>

      <Ubicaciones
        ubicaciones={ubicaciones.data ?? []}
        articulos={catalogo.data?.articulos ?? []}
        saldos={catalogo.data?.saldos ?? []}
        puedeEditar={encargado}
      />

      <Parametros
        parametros={filas}
        historial={parametros.data?.historial ?? []}
        nombreDe={nombreDe}
        borrador={borrador}
        onCambio={(clave, valor) => setBorrador((b) => ({ ...b, [clave]: valor }))}
        puedeEditar={esAdmin}
      />

      {/* Fase 2 (docs §8 y §12): todavía no hay tabla de planes. No se inventan datos. */}
      <Seccion
        id="h-inspecciones"
        titulo={<>Inspecciones de seguridad y preventivos, por tipo <span className="ml-1 rounded-full bg-muted px-2 py-0.5 align-middle text-[12px] font-medium text-muted-foreground">Próximamente</span></>}
        ayuda="Los planes por tipo de artículo (cada N días o cada N préstamos, con los valores que defina Higiene y Seguridad) llegan en la fase 2. Mientras tanto, la próxima inspección de cada unidad se carga en la ficha de la herramienta."
      />

      <Encargados usuarios={usuarios.data?.usuarios ?? []} personas={listaPersonas} esAdmin={esAdmin} />
      <Kiosco usuarios={usuarios.data?.usuarios ?? []} ultimoKiosco={usuarios.data?.ultimoKiosco ?? new Map()} />
      <Credenciales personas={listaPersonas} codigos={codigos.data ?? []} estados={credenciales.data ?? []} puedeEditar={encargado} />
      <Externas personas={listaPersonas} cuadrillas={personas.data?.cuadrillas ?? []} puedeEditar={encargado} />
    </div>
  );
}
