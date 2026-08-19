"use client";

import { use, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, CircleCheck, CircleX, ExternalLink, Loader2, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  useHabilitacion, useRegistrarGestion, useTriage, useVencimiento,
} from "@/hooks/use-habilitaciones";
import { ColumnaPermiso } from "@/components/habilitaciones/columna-permiso";
import { ListadoRequisitos } from "@/components/habilitaciones/listado-requisitos";
import { NotasObra } from "@/components/habilitaciones/notas-obra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { veredicto } from "@/lib/habilitaciones/derivacion";
import { ETAPA_LABEL, TIPO_GESTION_LABEL } from "@/lib/habilitaciones/tipos";
import { partesTitulo } from "@/lib/tablero/titulo";
import type { FichaHabilitacion, HabEtapa } from "@/lib/habilitaciones/tipos";

// Ficha de una habilitación.
//
// LOS DOS TRÁMITES VAN EN COLUMNAS porque avanzan por separado y se reclaman a tres
// interlocutores distintos: el cliente, el técnico y el gobierno. Mezclarlos en una fila
// —como hacía la planilla— es lo que hacía imposible saber a quién había que apurar.

export default function FichaHabilitacionPage({
  params,
}: {
  params: Promise<{ otId: string }>;
}) {
  const { otId: raw } = use(params);
  const otId = Number(raw);
  const { data: ficha, isLoading, error } = useHabilitacion(otId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="No se pudo abrir la habilitación"
        description={error instanceof Error ? error.message : "La OT no existe en Odoo"}
      />
    );
  }

  return <Ficha ficha={ficha} otId={otId} />;
}

function Ficha({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const partes = partesTitulo(ficha.titulo);
  const v = veredicto(ficha.permiso, {
    etapa: ficha.etapa,
    fechaProgramada: ficha.fechaProgramada,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/habilitaciones"
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Habilitaciones
        </Link>
        <a
          href={ficha.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
        >
          Ver la OT en Odoo
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div>
        <h1 className="text-lg font-semibold">{partes.principal}</h1>
        <p className="text-[13px] text-muted-foreground">
          {[partes.numero, partes.cliente].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* EL VEREDICTO, ARRIBA DE TODO: responde lo único que le importa a Operaciones.
          Se calcula cruzando los dos trámites y es lo que alimenta el candado. */}
      <div
        className="flex items-start gap-3 rounded-md border px-3 py-2.5"
        style={
          v.puedeArmar
            ? { backgroundColor: "#EAF3DE", borderColor: "#B7D48E" }
            : { backgroundColor: "#FDECEA", borderColor: "#F1B0AA" }
        }
      >
        {v.puedeArmar ? (
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#27500A" }} />
        ) : (
          <CircleX className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#912018" }} />
        )}
        <div className="text-[13px]">
          <p className="font-semibold">{v.titulo}</p>
          <p className="text-muted-foreground">{v.detalle}</p>
        </div>
      </div>

      <BarraTriage ficha={ficha} otId={otId} />

      {ficha.syncEstado === "error" && (
        <p className="rounded border px-3 py-2 text-[12px]" style={{ backgroundColor: "#FEF6E7" }}>
          El estado no pudo actualizarse en Odoo: <code>{ficha.syncError}</code>. El tablero
          puede estar mostrando un semáforo viejo — reintentá desde la bandeja.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnaDocumentacion ficha={ficha} otId={otId} />
        <ColumnaPermiso
          otId={otId}
          permiso={ficha.permiso}
          urlVenta={ficha.urlVenta}
          pedidosPrevios={ficha.gestiones.filter((g) => g.tipo === "consulta").length}
        />
      </div>

      <ListadoRequisitos otId={otId} requisitos={ficha.requisitos} />

      <div className="grid gap-4 lg:grid-cols-2">
        <NotasObra otId={otId} notas={ficha.notas} />
        <Historial ficha={ficha} />
      </div>
    </div>
  );
}

/**
 * El estado de triage, y cómo deshacerlo.
 *
 * Sin esto, "no aplica" era irreversible desde la UI: la obra salía de la bandeja y no
 * había forma de traerla de vuelta salvo tocando la base. Una acción por lote sobre
 * decenas de obras sin vuelta atrás es una trampa, no un atajo.
 */
function BarraTriage({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const triage = useTriage();

  function decidir(decision: "aplica" | "no_aplica" | "pendiente", mensaje: string) {
    triage.mutate(
      { otIds: [otId], decision },
      {
        onSuccess: () => toast.success(mensaje),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo cambiar"),
      },
    );
  }

  if (ficha.triage === "no_aplica") {
    return (
      <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-[13px]">
        <CircleX className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">
          Marcada <strong>no aplica</strong> — está fuera de la cola y no cuenta en el total.
          Sus requisitos, notas e historial se conservan.
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={triage.isPending}
          onClick={() => decidir("pendiente", "De vuelta en la cola")}
        >
          {triage.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Volver a la cola
        </Button>
      </div>
    );
  }

  if (ficha.triage === null) {
    return (
      <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-[13px]" style={{ backgroundColor: "#FEF6E7" }}>
        <TriangleAlert className="h-4 w-4 shrink-0" style={{ color: "#B54708" }} />
        <span className="flex-1">Recién llegada — falta definir si la habilitación aplica.</span>
        <Button
          size="sm"
          disabled={triage.isPending}
          onClick={() => decidir("aplica", "En gestión · se creó la Nómina ART")}
        >
          Aplica
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={triage.isPending}
          onClick={() => decidir("no_aplica", "Fuera de la cola")}
        >
          No aplica
        </Button>
      </div>
    );
  }

  // En gestión: la salida está, pero discreta — sacar de la cola una obra que ya se
  // está trabajando no debería ser tan fácil como marcar un requisito.
  return (
    <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
      <span className="flex-1">En gestión desde el triage.</span>
      <button
        className="underline hover:text-foreground"
        disabled={triage.isPending}
        onClick={() => decidir("no_aplica", 'Fuera de la cola · queda en "No aplican"')}
      >
        Marcar que no aplica
      </button>
    </div>
  );
}

/** Las 4 etapas del trámite documental, con su fecha. Las computa Odoo. */
const PASOS: { etapa: HabEtapa; campo: keyof FichaHabilitacion }[] = [
  { etapa: "a", campo: "fechaConsulta" },
  { etapa: "b", campo: "fechaConsulta" },
  { etapa: "c", campo: "fechaEnvio" },
  { etapa: "d", campo: "fechaHabilitada" },
];

function ColumnaDocumentacion({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const gestion = useRegistrarGestion(otId);
  const vencimiento = useVencimiento(otId);
  const [fecha, setFecha] = useState(ficha.vencimiento ?? "");

  const indiceActual = PASOS.findIndex((p) => p.etapa === ficha.etapa);

  return (
    <section className="space-y-3 rounded-md border p-3">
      <header className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Documentación del cliente</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {ficha.etapa ? ETAPA_LABEL[ficha.etapa] : "sin estado"} · {ficha.dias} d
        </span>
      </header>

      <ol className="space-y-1">
        {PASOS.map((paso, i) => {
          const alcanzado = indiceActual >= i && indiceActual !== -1;
          const valor = ficha[paso.campo] as string | null;
          return (
            <li key={paso.etapa} className="flex items-center gap-2 text-[13px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: alcanzado ? "#27500A" : "var(--muted)" }}
              />
              <span className={alcanzado ? "" : "text-muted-foreground"}>
                {ETAPA_LABEL[paso.etapa]}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {alcanzado && valor
                  ? format(parseISO(valor), "d MMM yyyy", { locale: es })
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {/* El reclamo no abre ningún cliente de correo: registra la fecha, que es lo que
          después permite demostrarle al cliente que se le reclamó tres veces. */}
      <div className="flex items-center gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="outline"
          disabled={gestion.isPending}
          onClick={() =>
            gestion.mutate(
              { tipo: "reclamo", detalle: `${ficha.reclamos + 1}º reclamo al cliente` },
              { onSuccess: () => toast.success("Reclamo registrado") },
            )
          }
        >
          {gestion.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Reclamar al cliente
          {ficha.reclamos > 0 && ` · ${ficha.reclamos + 1}º reclamo`}
        </Button>
        <span className="text-[10px] text-muted-foreground">No manda mail: registra la fecha.</span>
      </div>

      <div className="flex items-end gap-2 border-t pt-3">
        <div className="flex-1">
          <label htmlFor="venc" className="text-[11px] text-muted-foreground">
            Vence el
          </label>
          <Input
            id="venc"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            onBlur={() => {
              if (fecha !== (ficha.vencimiento ?? "")) vencimiento.mutate(fecha || null);
            }}
            className="h-8 text-[13px]"
          />
        </div>
        <p className="pb-2 text-[10px] text-muted-foreground">
          Odoo avisa solo al pasar la fecha.
        </p>
      </div>
    </section>
  );
}

/** Append-only y de sólo lectura: no hay forma de editar ni borrar desde acá. */
function Historial({ ficha }: { ficha: FichaHabilitacion }) {
  return (
    <section className="rounded-md border">
      <header className="border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">Historial</h3>
      </header>
      <ul className="max-h-96 overflow-y-auto">
        {ficha.gestiones.map((g) => (
          <li key={g.id} className="border-b px-3 py-2 text-[13px] last:border-b-0">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{TIPO_GESTION_LABEL[g.tipo]}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {format(parseISO(g.created_at), "d MMM yyyy HH:mm", { locale: es })}
              </span>
            </div>
            {g.detalle && <p className="text-[12px] text-muted-foreground">{g.detalle}</p>}
            <p className="text-[11px] text-muted-foreground">{g.autor_nombre ?? "—"}</p>
          </li>
        ))}
        {ficha.gestiones.length === 0 && (
          <li className="px-3 py-3 text-[12px] text-muted-foreground">Sin gestiones registradas.</li>
        )}
      </ul>
    </section>
  );
}
