"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { HardHat, Pin, TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { AVISO, semaforo } from "@/lib/tablero/colores";
import { partesTitulo } from "@/lib/tablero/titulo";
import { UMBRAL_DIAS } from "@/lib/habilitaciones/derivacion";
import { MODALIDAD_LABEL } from "@/lib/habilitaciones/tipos";
import type { ClaveGrupo, FilaBandeja } from "@/lib/habilitaciones/tipos";

// Una fila de la bandeja: obra, contexto en una línea, antigüedad y la acción al lado.
//
// LA ANTIGÜEDAD SE MUESTRA SIEMPRE, y en rojo cuando pasa el umbral del grupo. Las 297
// obras con una mediana de 399 días de espera existen porque ese número no se veía en
// ningún lado — sólo aparecía calculándolo desde afuera de la planilla.
//
// LA ESPERA INTERNA SE VE IGUAL QUE LA EXTERNA: "31 d · esperando a Jorge Riveros" al
// lado de "14 d · esperando al cliente". Que el que no contesta sea de la casa no lo
// hace menos bloqueante.

export function Fila({
  fila,
  grupo,
  seleccionable,
  seleccionada,
  onSeleccionar,
  anclaTour = false,
}: {
  fila: FilaBandeja;
  grupo: ClaveGrupo;
  seleccionable: boolean;
  seleccionada: boolean;
  onSeleccionar: (otId: number, valor: boolean) => void;
  /** Marca esta fila como el ejemplo que resalta el recorrido guiado. */
  anclaTour?: boolean;
}) {
  const partes = partesTitulo(fila.titulo);
  const sem = semaforo(fila.semaforo);
  const vencidoElUmbral = fila.dias > UMBRAL_DIAS[grupo];

  const contexto = [
    partes.cliente,
    fila.modalidad ? MODALIDAD_LABEL[fila.modalidad] : "modalidad sin definir",
    fila.requisitos.total > 0
      ? `${fila.requisitos.aprobados}/${fila.requisitos.total} requisitos`
      : null,
  ].filter(Boolean).join(" · ");

  const espera = fila.modalidad
    ? "esperando al cliente"
    : `esperando a ${fila.tecnicoNombre ?? "el técnico"}`;

  return (
    // data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts)
    <div
      className="flex items-center gap-2 border-b px-3 py-2 text-[13px] hover:bg-muted/40"
      data-tour={anclaTour ? "fila-obra" : undefined}
    >
      {seleccionable && (
        <Checkbox
          checked={seleccionada}
          onCheckedChange={(v) => onSeleccionar(fila.otId, v === true)}
          aria-label={`Seleccionar ${partes.principal}`}
        />
      )}

      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: sem.color }}
        title={sem.label}
      />

      <ChipTipoOt tipo={fila.tipo} enColumna />

      <Link href={`/habilitaciones/${fila.otId}`} className="min-w-0 flex-1">
        <span className="block truncate font-medium">{partes.principal}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{contexto}</span>
      </Link>

      {/* EL CLIENTE CONTRATÓ TÉCNICO DE SyH. Acá no es un dato de color: significa que hay
          un papel más que mandar y hacer aprobar antes de que la cuadrilla pueda entrar a
          la obra. Va como chip y no en la línea de contexto —que ya tiene cliente,
          modalidad y requisitos— porque cambia el trabajo de quien mira la bandeja. */}
      {fila.trabajo.syhPresencial === true && (
        <span
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: AVISO.fondo, color: AVISO.texto }}
          title="El cliente contrató técnico de Seguridad e Higiene: hay que enviar su documentación para que lo aprueben a entrar"
        >
          <HardHat className="h-3 w-3" />
          SyH
        </span>
      )}

      {fila.requisitos.observados > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FDECEA", color: "#912018" }}
          title="Requisitos observados por el cliente"
        >
          <TriangleAlert className="h-3 w-3" />
          {fila.requisitos.observados}
        </span>
      )}

      {fila.notasFijadas.length > 0 && (
        <Pin
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "#B54708" }}
          aria-label="Tiene notas fijadas"
        />
      )}

      <span className="w-40 shrink-0 text-right text-[11px] text-muted-foreground">
        <span className={vencidoElUmbral ? "font-semibold text-[#D92D20]" : ""}>
          {fila.dias} d
        </span>
        {" · "}
        {espera}
      </span>

      <span className="w-20 shrink-0 text-right text-[12px]">
        {fila.fechaProgramada
          ? format(parseISO(fila.fechaProgramada), "d MMM", { locale: es })
          : "—"}
      </span>
    </div>
  );
}
