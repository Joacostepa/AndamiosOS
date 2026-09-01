"use client";

import { useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, AlertTriangle, CalendarRange, Check, CircleCheck, CircleDashed, ClipboardCheck, Lock, MoreHorizontal, MoreVertical, Pencil, Trash2, Wrench } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FRACCIONES, fraccionLabel, type FraccionStr } from "@/lib/tablero/fracciones";
import { colorTipo, semaforo, TAREA, TAREA_FRANJA, URGENCIA_ALTA_BORDE, CORAL } from "@/lib/tablero/colores";
import { partesTitulo } from "@/lib/tablero/titulo";
import { jornadasLiberables } from "@/lib/tablero/cierre";
import type { Bloque, Colocacion } from "@/lib/tablero/bloques";
import { tipoTareaLabel, type OtTablero } from "@/lib/tablero/tipos";

/** Cierre de la jornada visible en la tarjeta. */
export type EstadoCierre = {
  estado: "ejecutado" | "no_ejecutado";
  motivoLabel?: string | null;
};

/** Qué día del bloque se puede cerrar, o cuál ya está cerrado. */
export type AccionCierre =
  | { tipo: "cerrar"; asignacionId: number; fecha: string }
  | { tipo: "ver"; parteId: number; asignacionId: number; fecha: string }
  | null;

// Tarjeta de una asignación en la grilla. Una obra de varias jornadas es UNA tarjeta
// que abarca las celdas contiguas (grid-column: span N): se arrastra completa.
//
// Lenguaje visual (v3). Cada canal codifica UNA cosa y sólo una:
//   fondo + ícono → TIPO de OT (armado sube, desarme baja, resto neutro)
//   borde punteado + fondo transparente → tentativa (borrador, pero ocupa capacidad)
//   franja izquierda → semáforo de habilitación
//   triángulo rojo   → urgencia alta
//
// El tipo y el estado son canales INDEPENDIENTES: una tentativa de armado conserva el
// ícono y el color de texto del armado, y sólo pierde el relleno.

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

const LABEL_TIPO: Record<string, string> = {
  armado: "Armado",
  desarme: "Desarme",
};

function labelTipo(tipo: string | null | undefined): string {
  return LABEL_TIPO[tipo ?? ""] ?? "Sin tipo definido";
}

/**
 * Cuerpo de la tarjeta. Densidad pensada para que entren 3 o 4 apiladas en una celda:
 * una línea con dirección y fracción, otra con tipo y técnico. La habilitación y la
 * urgencia son señales de color, sin texto que compita por el ancho.
 *
 * El bloque multi-jornada afloja la densidad: tiene todo el ancho de sus días.
 */
export function ContenidoTarjeta({
  ot,
  bloque,
  plan,
  compacta = false,
  vieneDeAntes = false,
  sigueDespues = false,
  cierre = null,
  vencidaSinParte = false,
  candado = false,
  unaLinea = false,
}: {
  ot: OtTablero | undefined;
  bloque: Pick<Bloque, "estado" | "fraccion" | "fechas" | "multiDia" | "tarea">;
  /**
   * Plan completo de la obra. Cuando quedó partida en tramos no corridos, esta tarjeta es
   * sólo una parte y el contador lo dice ("1/3j"): si no, una obra de tres días partida se
   * lee como tres obras de un día y nadie encuentra el resto del plan.
   */
  plan?: { dias: number; tramos: number };
  compacta?: boolean;
  /** El bloque empieza antes / termina después de la semana visible. */
  vieneDeAntes?: boolean;
  sigueDespues?: boolean;
  /** Cierre de la jornada, si ya se cargó el parte. */
  cierre?: EstadoCierre | null;
  /** Alguna jornada ya pasó y sigue sin parte: reclama acción, no se atenúa. */
  vencidaSinParte?: boolean;
  /**
   * El cliente pidió no armar sin el permiso emitido. Es AVISO, no impedimento: la obra
   * se arrastra y se planifica igual. El freno está al confirmar.
   */
  candado?: boolean;
  /**
   * La tarjeta es demasiado baja para dos renglones: se queda sólo con el de arriba.
   *
   * Pasa desde que el alto es proporcional a la fracción — una jornada de ¼ mide 24px y
   * ahí entra una línea. Se sacrifica el cliente y no la dirección: la dirección es lo
   * que identifica la obra de un vistazo, el cliente es contexto y está en el panel.
   */
  unaLinea?: boolean;
}) {
  // Una tarjeta de operaciones no tiene OT detrás: título, tipo y estado salen del
  // propio bloque. Todo lo que sigue mira `tarea` para apagar los canales que hablan de
  // una obra —semáforo, urgencia, cliente, dirección del tipo— porque en una tarea no
  // significan nada y mostrarlos vacíos la haría leer como una obra a la que le faltan
  // datos, que es justo lo contrario de lo que es.
  const tarea = bloque.tarea;
  const tipo = tarea ? TAREA : colorTipo(ot?.tipo);
  const IconoTipo = tarea ? Wrench : ICONO_TIPO[tipo.icono];
  const confirmada = bloque.estado === "confirmada";
  const sem = semaforo(ot?.habSemaforo);
  const urgente = !tarea && ot?.urgencia === "alta";
  const partes = partesTitulo(ot?.titulo ?? "OT");
  const noEjecutada = cierre?.estado === "no_ejecutado";
  const partida = (plan?.tramos ?? 1) > 1;
  // El texto conserva el color del tipo aunque el relleno no esté: el tipo se lee igual
  // en una tentativa. Sobre el fondo blanco de la tentativa estos tonos oscuros
  // contrastan de sobra.
  const colorTexto = noEjecutada ? "#7A271A" : tipo.text;

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-[4px] px-2",
        unaLinea ? "py-0" : "py-1",
        compacta && "shadow-md",
      )}
      style={{
        // El relleno es el canal del ESTADO: sólido = confirmada, transparente =
        // tentativa. El tono de ese relleno es el canal del TIPO.
        backgroundColor: noEjecutada ? "#FDECEA" : confirmada ? tipo.bg : "var(--card)",
        // El borde punteado rojo es el mismo lenguaje de "pendiente" del listado de
        // partes: la jornada ya pasó y nadie cargó nada.
        border: noEjecutada
          ? "1px solid #D92D20"
          : vencidaSinParte
            ? "1px dashed #D92D20"
            : confirmada
              ? "1px solid transparent"
              : "1px dashed var(--border)",
        // La franja izquierda es el semáforo de habilitación: aplica siempre y es lo que
        // más se mira. Un punto de 6px se perdía con la grilla llena.
        // En una tarea no hay habilitación que semaforear, así que la franja la toma el
        // violeta del tipo en vez de mentir un verde.
        borderLeft: `5px solid ${noEjecutada ? "#D92D20" : tarea ? TAREA_FRANJA : sem.color}`,
      }}
    >
      <div className="flex items-baseline gap-1">
        {/* Las flechas de continuidad van EN LÍNEA y no absolutas: colgadas del borde
            se salían de la grilla y generaban scroll horizontal. */}
        {vieneDeAntes && (
          <ChevronLeft className="h-3 w-3 shrink-0 self-center" style={{ color: colorTexto }} />
        )}
        {/* El ícono de tipo va SIEMPRE, incluso en la variante compacta: es lo último que
            se sacrifica por espacio. Antes se corta el nombre. */}
        <IconoTipo
          className="h-3.5 w-3.5 shrink-0 self-center"
          style={{ color: colorTexto }}
          aria-hidden
        />
        {/* En una obra el tilde lo pone el parte; en una tarea, el booleano `hecha`. */}
        {(cierre?.estado === "ejecutado" || tarea?.hecha) && (
          <CircleCheck className="h-3 w-3 shrink-0 self-center" style={{ color: "#639922" }} />
        )}
        {noEjecutada && (
          <AlertTriangle className="h-3 w-3 shrink-0 self-center" style={{ color: "#D92D20" }} />
        )}
        {candado && (
          <Lock
            className="h-3 w-3 shrink-0 self-center"
            style={{ color: "#912018" }}
            aria-label="El cliente pidió esperar el permiso emitido"
          />
        )}
        <span
          className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight"
          style={{ color: colorTexto }}
          title={
            tarea
              ? `${tipoTareaLabel(tarea.tipo)} — ${tarea.titulo}`
              : `${labelTipo(ot?.tipo)} — ${ot?.titulo ?? ""} — ${sem.label}`
          }
        >
          {tarea ? tarea.titulo : partes.principal}
        </span>
        <span
          className="shrink-0 text-[11px] font-semibold tabular-nums"
          style={{ color: colorTexto }}
          title={partida ? `Obra partida: ${plan!.dias} días en ${plan!.tramos} tramos` : undefined}
        >
          {partida
            ? `${bloque.fechas.length}/${plan!.dias}j`
            : bloque.multiDia
              ? `${bloque.fechas.length}j`
              : fraccionLabel(bloque.fraccion)}
        </span>
        {urgente && (
          <AlertTriangle
            className="h-3 w-3 shrink-0 self-center"
            style={{ color: URGENCIA_ALTA_BORDE }}
          />
        )}
        {sigueDespues && (
          <ChevronRight className="h-3 w-3 shrink-0 self-center" style={{ color: colorTexto }} />
        )}
      </div>

      {!unaLinea && (
      <p
        className="truncate text-[10px] leading-tight"
        style={{ color: colorTexto, opacity: 0.75 }}
      >
        {/* El tipo ya no va en texto: lo dice el ícono, y repetirlo gastaba el ancho que
            necesita la dirección. Tampoco dice "tentativa": lo comunica el borde.
            En una tarea sí va el tipo: es lo único que la clasifica, y el ícono de la
            llave es el mismo para todas. */}
        {tarea
          ? [tipoTareaLabel(tarea.tipo), tarea.hecha ? "hecha" : null].filter(Boolean).join(" · ")
          : [
              partes.cliente,
              ot?.tecnico,
              noEjecutada ? (cierre?.motivoLabel ?? "no ejecutada") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      )}
    </div>
  );
}

/**
 * Por debajo de esto sólo entra un renglón: el de arriba mide ~16px y el padding y el
 * borde se comen el resto. Una jornada de ¼ (24px) cae siempre de este lado.
 */
const ALTO_DOS_LINEAS = 38;

export function TarjetaAsignacion({
  bloque,
  ot,
  plan,
  colocacion,
  top,
  alto,
  seleccionada,
  ejecutada,
  vencidaSinParte,
  cierre,
  accionCierre,
  candado = false,
  onCerrarJornada,
  onAbrir,
  onFraccion,
  onEditarJornadas,
  onEstado,
  onQuitar,
  onTareaHecha,
  onEditarTarea,
}: {
  bloque: Bloque;
  ot: OtTablero | undefined;
  /** Días y tramos que tiene planificada la obra entera, no sólo este tramo. */
  plan?: { dias: number; tramos: number };
  colocacion: Colocacion;
  /** Desplazamiento desde el borde de arriba de la celda, en px. */
  top: number;
  /**
   * Alto en px, proporcional a la fracción de jornada. Lo calcula repartirPorAltura: la
   * tarjeta no decide cuánto mide, lo decide cuánto trabajo representa.
   */
  alto: number;
  seleccionada: boolean;
  ejecutada: boolean;
  /** Alguna jornada ya pasó sin parte cargado. */
  vencidaSinParte: boolean;
  cierre: EstadoCierre | null;
  accionCierre: AccionCierre;
  /** El cliente pidió esperar el permiso emitido. Avisa; no impide arrastrar. */
  candado?: boolean;
  onCerrarJornada: (accion: NonNullable<AccionCierre>) => void;
  onAbrir: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEditarJornadas: () => void;
  onEstado: (e: "tentativa" | "confirmada") => void;
  onQuitar: () => void;
  /** Sólo en tarjetas de operaciones: el cierre de una tarea es un sí o un no. */
  onTareaHecha?: (hecha: boolean) => void;
  onEditarTarea?: () => void;
}) {
  // Ids temporales (negativos): la obra se soltó recién y Odoo todavía no devolvió su
  // número. Hasta que llegue no se arrastra ni se edita — la escritura viajaría con un id
  // que Odoo no conoce y volvería rebotada, con la tarjeta saltando de vuelta al lugar
  // anterior. Dura lo que tarda la creación, cerca de un segundo.
  const guardando = bloque.ids.some((id) => id < 0);

  const { setNodeRef: dragRef, attributes, listeners, isDragging } = useDraggable({
    id: `bloque:${bloque.key}`,
    data: { bloque },
    disabled: guardando,
  });
  // La tarjeta también es zona de drop: soltar sobre ella reordena el día.
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `tarjeta:${bloque.key}`,
    data: { bloque },
  });
  // El menú se ancla al botón ⋮. Si el botón se ocultara con `hidden` al salir el mouse
  // de la tarjeta —que es justo lo que pasa al ir hacia el menú— perdería su caja y el
  // popup se reubicaría en una esquina. Por eso se oculta con opacidad, que conserva el
  // layout, y se fuerza visible mientras el menú está abierto.
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Al elegir una opcion, el menu se desmonta y el navegador entrega el clic al
  // elemento que quedo debajo: la tarjeta. Se ignora por un instante para que ese
  // clic residual no dispare tambien el panel de la OT.
  const menuCerradoEn = useRef(0);
  // Las jornadas ya cerradas no se tocan: sacarlas del tablero dejaría el parte
  // huérfano y borraría el rastro de lo ejecutado.
  const liberables = jornadasLiberables(bloque).length;
  const cerradas = bloque.partes.filter((p) => p != null).length;

  return (
    <div
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      style={{
        gridColumn: `${colocacion.colInicio + 1} / span ${colocacion.span}`,
        gridRow: 1,
        // `start` y no el estirado por defecto del grid: el alto lo manda la fracción,
        // no la celda. El margen es lo que la apila debajo de las otras del día.
        alignSelf: "start",
        marginTop: top,
        height: alto,
        // Se atenúa lo TERMINADO, no lo pasado. Una jornada vencida sin parte queda a
        // opacidad plena: es la que reclama que alguien la cargue.
        opacity: isDragging ? 0.35 : vencidaSinParte ? 1 : ejecutada ? 0.55 : 1,
        outline: seleccionada ? `2px solid ${CORAL}` : isOver ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-1px",
      }}
      className={cn(
        // select-none: apretar sobre el texto y arrastrar hacía que el navegador
        // extendiera una SELECCIÓN, y una selección que se estira más allá del borde
        // scrollea el contenedor sola — el mismo síntoma que el auto-scroll, por otro
        // camino. La tarjeta es un agarre para arrastrar, no un texto para seleccionar.
        "group/tarjeta relative z-10 m-0.5 select-none rounded-[4px]",
        guardando ? "cursor-progress" : "cursor-grab active:cursor-grabbing",
      )}
      title={guardando ? "Guardando en Odoo…" : undefined}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      // Con el menú abierto —o recién cerrado— la tarjeta no responde: el clic que lo
      // cierra no tiene que abrir además el panel de la OT.
      onClick={() => {
        if (menuAbierto || Date.now() - menuCerradoEn.current < 400) return;
        onAbrir();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !menuAbierto) {
          e.preventDefault();
          onAbrir();
        }
      }}
    >
      <ContenidoTarjeta
        ot={ot}
        bloque={bloque}
        plan={plan}
        unaLinea={alto < ALTO_DOS_LINEAS}
        vieneDeAntes={colocacion.vieneDeAntes}
        sigueDespues={colocacion.sigueDespues}
        cierre={cierre}
        vencidaSinParte={vencidaSinParte}
        candado={candado}
      />

      {/* El menú no aparece mientras se guarda: todas sus opciones escriben, y con el id
          temporal cualquiera de ellas rebota. */}
      <div
        className={cn(
          "absolute right-0.5 top-0.5 transition-opacity",
          guardando && "hidden",
          menuAbierto
            ? "opacity-100"
            : "pointer-events-none opacity-0 group-hover/tarjeta:pointer-events-auto group-hover/tarjeta:opacity-100",
        )}
      >
        <DropdownMenu
          open={menuAbierto}
          onOpenChange={(abierto) => {
            setMenuAbierto(abierto);
            if (!abierto) menuCerradoEn.current = Date.now();
          }}
        >
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded bg-white/70 p-0.5 text-foreground/70 hover:bg-white hover:text-foreground"
                aria-label="Opciones de la asignación"
              />
            }
          >
            <MoreVertical className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* UNA TAREA TIENE OTRO MENÚ. No se confirma (no es borrador: la puso
                Operaciones y va), no tiene jornadas de obra que editar ni parte que
                cerrar. Lo único que comparte con una obra es la fracción y el quitar. */}
            {bloque.tarea ? (
              <>
                <DropdownMenuItem onClick={() => onTareaHecha?.(!bloque.tarea!.hecha)}>
                  {bloque.tarea.hecha ? (
                    <CircleDashed className="mr-2 h-4 w-4" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {bloque.tarea.hecha ? "Marcar como pendiente" : "Marcar como hecha"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditarTarea?.()}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar tarea
                </DropdownMenuItem>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Fracción de jornada</DropdownMenuLabel>
                  {FRACCIONES.map((f) => (
                    <DropdownMenuItem key={f.value} onClick={() => onFraccion(f.value)}>
                      <span className="mr-2 w-4 text-center">{f.label}</span>
                      {f.detalle}
                      {Number(f.value) === bloque.fraccion && (
                        <Check className="ml-auto h-3.5 w-3.5" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onQuitar} style={{ color: CORAL }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Borrar tarea
                </DropdownMenuItem>
              </>
            ) : (
              <>
            {/* El cierre se ofrece solo cuando la fecha ya llegó: un parte creado por
                adelantado queda huérfano si después se reprograma. */}
            {accionCierre && (
              <>
                <DropdownMenuItem onClick={() => onCerrarJornada(accionCierre)}>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  {accionCierre.tipo === "cerrar" ? "Cerrar jornada" : "Ver parte"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={() => onEstado(bloque.estado === "confirmada" ? "tentativa" : "confirmada")}
            >
              {bloque.estado === "confirmada" ? (
                <CircleDashed className="mr-2 h-4 w-4" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {bloque.estado === "confirmada" ? "Volver a tentativa" : "Confirmar"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            {/* Siempre disponible: es la única forma de estirar una obra de un día a
                dos, porque una vez asignada ya no está en la bandeja para re-arrastrar.
                Abre TODAS las jornadas de la obra, no sólo las de esta tarjeta: si el plan
                quedó partido en tramos, éste es el único lado desde donde se vuelve a unir. */}
            <DropdownMenuItem onClick={onEditarJornadas}>
              <CalendarRange className="mr-2 h-4 w-4" />
              {plan && plan.tramos > 1
                ? `Jornadas de la obra (${plan.dias} días en ${plan.tramos} tramos)`
                : bloque.multiDia
                  ? `Jornadas de la obra (${bloque.fechas.length} días)`
                  : "Jornadas de la obra (agregar días)"}
            </DropdownMenuItem>

            {!bloque.multiDia && (
              /* Atajo para el caso común: cambiar la fracción del único día.
                 El label necesita un Group padre; sin él, base-ui lanza al abrir. */
              <DropdownMenuGroup>
                <DropdownMenuLabel>Fracción de jornada</DropdownMenuLabel>
                {FRACCIONES.map((f) => (
                  <DropdownMenuItem key={f.value} onClick={() => onFraccion(f.value)}>
                    <span className="mr-2 w-4 text-center">{f.label}</span>
                    {f.detalle}
                    {Number(f.value) === bloque.fraccion && <Check className="ml-auto h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}

            {liberables > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onQuitar} style={{ color: CORAL }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {cerradas > 0
                    ? `Suspender: liberar ${liberables} jornada${liberables === 1 ? "" : "s"}`
                    : "Quitar del tablero"}
                </DropdownMenuItem>
              </>
            )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
