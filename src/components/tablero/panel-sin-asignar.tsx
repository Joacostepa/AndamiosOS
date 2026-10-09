"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
  Search,
  Inbox,
  Loader2,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  colorTipo,
  semaforo,
  CORAL,
  ACENTO_BG,
  ALERTA,
  NOTA,
  PELIGRO_TEXTO,
  URGENCIA,
} from "@/lib/tablero/colores";
import {
  fraccionMasCercana,
  repartirJornadas,
  FRACCIONES,
  FRACCIONES_ESTIMADO,
  type FraccionStr,
} from "@/lib/tablero/fracciones";
import { partesTitulo, normalizar, direccionDeObra, nombrePropio } from "@/lib/tablero/titulo";
import { piso } from "@/lib/tablero/ventana";
import type { OtTablero } from "@/lib/tablero/tipos";
import { tituloResumen, type ResumenEnTarjeta } from "@/lib/tablero/tipos-comentario";

// Panel lateral de obras sin asignar. Es una COLUMNA y no una franja horizontal
// porque la tarjeta de obra es vertical por naturaleza: en la franja, la dirección
// —que es lo que Operaciones usa para identificar la obra— quedaba siempre cortada.
//
// Se arrastra desde acá a una celda de la grilla; soltar una tarjeta de la grilla acá
// la devuelve a la bandeja.
//
// PRINCIPIO: un objeto se ve igual en todas las superficies. Una obra de armado es azul
// con flecha arriba en la grilla y también acá. Si cada pantalla tuviera su propio código
// visual, habría que reaprenderlo en cada una.

export const ID_BANDEJA = "bandeja";

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

/** Obra con jornadas por planificar, y cuánto de ella ya se ejecutó. */
export type ObraPendiente = {
  ot: OtTablero;
  /**
   * Cuántas jornadas tiene la obra según el tablero: el número de Operaciones si alguien
   * lo corrigió, y si no el estimado de Comercial. Viene resuelto desde el board para que
   * la bandeja no tenga dos ideas de la misma obra — `ot.jornadas` es SIEMPRE el estimado
   * y no se usa para mostrar duración.
   */
  duracion: number;
  /** Jornadas totales previstas, ya repartidas en días. */
  totales: number;
  /** Las que faltan planificar. */
  pendientes: number;
  /** Las que ya tienen parte cargado: si hay, la obra está empezada. */
  cerradas: number;
  /** Operaciones fijó la duración: `duracion` ya no es el estimado de Comercial. */
  corregida: boolean;
};

/** Una obra que YA está en la grilla, para poder encontrarla desde el buscador. */
export type ObraPlanificada = {
  bloqueKey: string;
  ot: OtTablero;
  cuadrillaNombre: string | null;
  fechaInicio: string;
  jornadas: number;
};

// ── Filtros de la bandeja ────────────────────────────────────────────────────
//
// Dos ejes, y sólo dos: TIPO y DURACIÓN. Contestan la pregunta con la que se llena un
// día — "me queda media jornada libre en la cuadrilla 1, ¿qué desarme corto tengo?"—,
// que hoy se resuelve escaneando la lista entera.
//
// LOS CHIPS DE DURACIÓN SON LA ESCALA COMPLETA, con su número al lado. Los que no tienen
// obras se muestran apagados y no se pueden apretar.
//
// La primera versión mostraba sólo los que tenían obras, para no ocupar lugar con baldes
// vacíos. El problema es que así no se puede VERIFICAR que no falte nada: quien mira la
// lista tiene que confiar en que toda obra cayó en algún balde. Con la escala entera, los
// números de los chips suman exactamente el total del encabezado, y esa suma se chequea de
// un vistazo. Además la ausencia pasa a ser información: "no tengo ninguna de media
// jornada" es un dato, y un hueco en la escala no lo dice.
//
// Ninguna obra puede quedar sin chip, por construcción: duracionDe siempre devuelve un
// balde —repartirJornadas redondea cualquier duración a la fracción más cercana, así que
// una obra de 0,4 jornadas cae en ½— y los grupos se arman recorriendo la lista.
//
// Medido sobre las 34 obras de hoy: 25 dicen "1 jornada", 5 son de varios días y 4 de ¼.
// Ese "25" es además un diagnóstico — la duración estimada está cargada en el 19% de las
// OTs, así que buena parte de ese grupo es el valor por defecto y no una medición. El
// filtro no puede ser mejor que el dato que filtra.
//
// NO SE PERSISTEN entre sesiones, a diferencia del panel colapsado o las cuadrillas
// visibles: un filtro que sobrevive a un refresh es cómo alguien termina creyendo que la
// bandeja está vacía.

/** Los cinco valores de fracción más el cajón de las obras que no entran en un día. */
type ClaveDuracion = FraccionStr | "varios";

/**
 * En qué balde de duración cae una obra, medido sobre lo que le QUEDA.
 *
 * Lo que importa para llenar un día es el trabajo que falta, no el original: a la obra de
 * Callao le quedan 6 de 8 jornadas, y si le quedara una sola tendría que aparecer entre
 * las de una jornada aunque haya empezado siendo de ocho.
 *
 * Las fracciones pendientes son las ÚLTIMAS del reparto, igual que cuando se planifica
 * (ver asignarObra): así el resto fraccionario cae donde va a caer de verdad.
 */
function duracionDe(obra: ObraPendiente): ClaveDuracion {
  const todas = repartirJornadas(obra.duracion, obra.corregida);
  const quedan = todas.slice(Math.max(0, todas.length - obra.pendientes));
  if (quedan.length > 1) return "varios";
  // A la escala GRUESA: una obra que Operaciones dejó en 3 h repartía "0.375", que no es
  // un balde, y aparecía un chip suelto "0.375". Para llenar un día, 3 h es "½".
  return fraccionMasCercana(Number(quedan[0] ?? "1"), FRACCIONES_ESTIMADO) as ClaveDuracion;
}

/**
 * La escala de duración de la bandeja, de menor a mayor. Es la MISMA que reparte
 * `repartirJornadas`, así que un balde posible no puede faltar acá.
 *
 * ES LA GRUESA, no la de la tarjeta: acá se clasifica el estimado de Comercial, que no
 * distingue 3 h de 4 h. Los tamaños finos de Operaciones no son baldes —separarían obras
 * que para llenar un día son lo mismo, y este panel tiene el ancho que tiene.
 */
const HORAS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// El chip lleva el glifo ("½") y el tooltip lo que significa ("media jornada, 4 h"): con
// la escala entera en un solo renglón queda lugar para la lista.
const ESCALA_DURACION: { clave: ClaveDuracion; label: string; detalle: string; orden: number }[] = [
  ...FRACCIONES_ESTIMADO.map((f, i) => ({
    clave: f.value as ClaveDuracion,
    label: f.label,
    detalle: f.value === "1" ? "jornada completa (8 h)" : `${f.label} de jornada (${HORAS.format(f.horas)} h)`,
    orden: i,
  })),
  { clave: "varios", label: "+1", detalle: "varios días", orden: 99 },
];

/** "jornada completa", "½ jornada", "3 h", "mínimo (~1,5 h)", "4 jornadas". */
function textoDuracion(n: number): string {
  if (n > 1) return `${HORAS.format(n)} jornadas`;
  if (n === 1) return "1 jornada";
  const f = FRACCIONES.find((x) => Number(x.value) === n) ?? FRACCIONES.find((x) => x.value === fraccionMasCercana(n));
  if (!f) return `${HORAS.format(n * 8)} h`;
  if (f.value === "0.10") return "mínimo (~1,5 h)";
  if (f.label.endsWith("h")) return `${f.label.slice(0, -1)} h`;
  return `${f.label} jornada`;
}

/**
 * ¿La obra coincide con lo que se escribió? Por PALABRAS, en cualquier orden: "1810 callao"
 * encuentra "Callao 1810" y "storni arenales" encuentra la obra aunque en el título el
 * cliente y la dirección estén separados. Antes era una subcadena literal.
 * Entra también qué hay que ejecutar, que la tarjeta muestra con el botón "Qué ejecutar".
 */
function coincide(ot: OtTablero, q: string): boolean {
  const texto = normalizar(`${ot.titulo} ${ot.direccionObra ?? ""} ${ot.tecnico ?? ""} ${ot.detalleTecnico ?? ""}`);
  return q.split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
}

const TIPOS_BANDEJA = [
  { clave: "armado", label: "Armado" },
  { clave: "desarme", label: "Desarme" },
  { clave: "otro", label: "Otro" },
] as const;

/** El tipo de la OT, normalizado a los tres cajones que muestra el filtro. */
function tipoDe(ot: OtTablero): string {
  return ot.tipo === "armado" || ot.tipo === "desarme" ? ot.tipo : "otro";
}

function Chip({
  activo,
  onClick,
  children,
  cantidad,
  titulo,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  cantidad: number;
  titulo?: string;
}) {
  // Sin obras no se apaga: se muestra apagado. Es la diferencia entre "no hay ninguna de
  // este tamaño" —que es un dato— y no decir nada, que obliga a suponer.
  const vacio = cantidad === 0 && !activo;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={vacio}
      title={titulo}
      aria-pressed={activo}
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:cursor-default"
      style={{
        backgroundColor: activo ? CORAL : undefined,
        borderColor: activo ? CORAL : undefined,
        color: activo ? "#fff" : undefined,
        opacity: vacio ? 0.4 : 1,
      }}
    >
      {children}
      <span className={activo ? "opacity-80" : "text-muted-foreground"}>{cantidad}</span>
    </button>
  );
}

/**
 * La habilitación deja de ser una franja de color y pasa a ser el criterio de agrupación:
 * rojo y vencida a un lado, el resto al otro.
 *
 * El amarillo —"en curso"— cae del lado de las que SE PUEDEN PLANIFICAR: el trámite avanza
 * y la obra se puede meter en el tablero mientras tanto. Es a propósito, y por eso el grupo
 * NO se llama "habilitadas": una obra en curso no está habilitada, y el título que lo decía
 * hacía que alguien la buscara en Habilitaciones, la viera en trámite y reportara un bug
 * que no existía. El grupo agrupa por si frena o no la planificación; cuál está habilitada
 * lo dice el punto de semáforo de la tarjeta.
 */
function habilitacionPendiente(ot: OtTablero): boolean {
  return ot.habSemaforo === "rojo" || ot.habSemaforo === "vencida";
}

/**
 * LA URGENCIA LA DECIDE LA OT EN ODOO. Es `x_urgencia`, que carga una persona: el tablero
 * no la deduce de la fecha comprometida, del semáforo ni de nada más. Un criterio
 * calculado pondría obras arriba de todo por una regla que Operaciones no eligió.
 *
 * Todo lo urgente pasa por estas dos funciones —el grupo fijo de la bandeja, el orden y el
 * resaltado de la tarjeta— así que si algún día el criterio cambia, se cambia acá y nada
 * más.
 *
 * ESTADO DEL DATO (medido contra Odoo, 65 OTs candidatas): 0 en alta, 2 en media, el resto
 * sin cargar —la app lee el vacío como "baja"—. Mientras nadie marque una OT como urgente
 * en Odoo, el grupo de urgentes no aparece: `Grupo` no dibuja nada cuando está en cero.
 */
function esUrgente(ot: OtTablero): boolean {
  return ot.urgencia === "alta";
}

function esUrgenciaMedia(ot: OtTablero): boolean {
  return ot.urgencia === "media";
}

/**
 * Qué tan arriba va una obra. Menor = más arriba.
 *
 * NO se agrupa por esto. La bandeja ya se agrupa por habilitación, y agrupar por dos ejes
 * a la vez vuelve la lista ilegible. La prioridad se resuelve con el ORDEN, y la tarjeta
 * dice por qué está donde está: así se puede verificar de un vistazo en vez de confiar.
 */
function prioridad(ot: OtTablero, hoy: string): number {
  if (esUrgente(ot)) return 0;
  // Un compromiso vencido es lo más urgente después de lo declarado urgente: alguien le
  // dio una fecha al cliente y esa fecha ya pasó.
  if (ot.fechaComprometida && ot.fechaComprometida < hoy) return 1;
  if (ot.fechaComprometida) return 2;
  // La urgencia media ordena, y nada más: no arma grupo ni pinta la tarjeta. Va DESPUÉS
  // del compromiso para no alterar un orden que ya funcionaba — "en menor medida" también
  // quiere decir que no desplaza a lo que ya estaba decidido.
  if (esUrgenciaMedia(ot)) return 3;
  return 4;
}

/** Lo que explica la posición de la tarjeta: la fecha prometida y su desvío. */
function lineaCompromiso(ot: OtTablero, hoy: string): { texto: string; alerta: boolean } | null {
  if (!ot.fechaComprometida) return null;
  const label = format(parseISO(ot.fechaComprometida), "d MMM", { locale: es });
  if (ot.fechaComprometida < hoy) return { texto: `venció el ${label}`, alerta: true };
  if (ot.fechaComprometida === hoy) return { texto: "comprometida HOY", alerta: true };
  return { texto: `comprometida ${label}`, alerta: false };
}

function TarjetaOt({
  obra,
  hoy,
  comentarios,
  queEjecutar,
  onDetalle,
  onDuracion,
}: {
  obra: ObraPendiente;
  hoy: string;
  /** Resumen del hilo de la obra. null = nadie comentó nada todavía. */
  comentarios: ResumenEnTarjeta | null;
  /**
   * Mostrar QUÉ HAY QUE EJECUTAR en lugar del cliente. La dirección no se toca: es lo que
   * identifica la obra. Ver ContenidoTarjeta.
   */
  queEjecutar: boolean;
  onDetalle: (ot: OtTablero) => void;
  /** Fijar cuánto dura la obra, desde acá mismo. Ver el menú de duración más abajo. */
  onDuracion: (ot: OtTablero, f: FraccionStr) => void;
}) {
  const { ot, duracion, totales, pendientes, cerradas, corregida } = obra;
  const empezada = cerradas > 0;
  // Nadie estimó la obra y nadie la corrigió: lo que la bandeja resta es el fallback de
  // la importación (0 o 1), no una duración. Se marca porque el número se lee igual que
  // cualquier otro y no lo es — hay obras así con 17 jornadas planificadas contra un
  // "estimado" de 1. Se apaga en cuanto alguien fija la duración desde el tablero.
  const sinEstimar = ot.sinEstimar && !corregida;
  // Una obra que entra en un día, sin nada ejecutado ni planificado: recién ahí "cuánto
  // lleva" es una sola fracción y se puede elegir de una lista.
  const editableDuracion = !empezada && pendientes === totales && totales === 1;
  const compromiso = lineaCompromiso(ot, hoy);
  // EL PISO SÓLO SI TODAVÍA RESTRINGE. "no antes del 6 oct" leído el 9 no dice nada, y una
  // línea que casi nunca dice nada entrena a no leerla el día que sí. Sin ícono de candado:
  // el candado es el permiso municipal (ver tarjeta-asignacion), no la ventana del cliente.
  const desde = ot.fechaDesde && ot.fechaDesde > hoy ? piso(ot) : null;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `ot:${ot.id}`,
    data: { ot },
  });
  // El menú de duración vive en un portal, pero sus clics suben por el árbol de React hasta
  // la tarjeta: sin esta guarda, elegir una duración abría además la ficha.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuCerradoEn = useRef(0);
  const tipo = colorTipo(ot.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const sem = semaforo(ot.habSemaforo);
  const urgente = esUrgente(ot);
  const media = esUrgenciaMedia(ot);
  const partes = partesTitulo(ot.titulo);
  const direccion = direccionDeObra(ot);
  const orden = partes.numero ?? null;
  const cliente = partes.cliente ? nombrePropio(partes.cliente) : null;
  const abrir = () => {
    if (menuAbierto || Date.now() - menuCerradoEn.current < 400) return;
    onDetalle(ot);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // UN CLIC ABRE LA FICHA, apretar y mover arrastra: igual que las tarjetas de la
      // grilla. El sensor de arrastre recién arranca a los 6px con el mouse y a los 250ms
      // con el dedo, así que un clic quieto no se confunde con el gesto de asignar. Antes
      // había un botón "i" aparte, de 22px, que era el único camino a la ficha.
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !menuAbierto) {
          e.preventDefault();
          abrir();
        }
      }}
      aria-label={`${direccion}. Abrir la ficha o arrastrar a la grilla`}
      // select-none: apretar sobre el texto y arrastrar hacía que el navegador extendiera
      // una SELECCIÓN, y una selección que se estira más allá del borde scrollea el
      // contenedor sola — el mismo síntoma que el auto-scroll, por otro camino. Acá el
      // texto es un agarre para arrastrar, no algo para seleccionar.
      className="cursor-grab select-none space-y-0.5 rounded-lg border p-2.5 transition-colors outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing"
      style={{
        opacity: isDragging ? 0.35 : 1,
        // El fondo sigue siendo el del tipo, igual que en la grilla. El TEXTO ya no: va en
        // los grises de siempre, que se leen sobre los dos fondos y no se pierden en ámbar.
        backgroundColor: tipo.bg,
        // Táctil: sin demora de doble toque, y sin el menú de "copiar / compartir" que iOS
        // abre al mantener apretado, que es justo el gesto que agarra la tarjeta.
        touchAction: "manipulation",
        WebkitTouchCallout: "none",
        // El borde rojo es SÓLO de la urgencia alta. Es el canal más caro que le queda a
        // esta tarjeta y por eso no lo comparte con nada.
        borderColor: urgente ? URGENCIA.alta.fuerte : "transparent",
        // La franja es "empezada", el estado que hay que no perder de vista dentro de cada
        // grupo. La urgencia alta se la queda cuando hay conflicto.
        borderLeft: urgente
          ? `5px solid ${URGENCIA.alta.fuerte}`
          : empezada
            ? `5px solid ${ALERTA}`
            : "5px solid transparent",
      }}
    >
      {empezada && (
        <p className="flex items-center gap-1 text-xs font-medium text-foreground/75">
          <PlayCircle className="h-3.5 w-3.5" />
          Empezada · {cerradas} de {totales} jornadas hechas
        </p>
      )}

      {/* LA DIRECCIÓN PRIMERO: es lo que identifica la obra, y es el título de la ficha.
          El tipo lo dicen la flecha y el fondo, como en la grilla. */}
      <div className="flex items-start gap-1.5">
        <IconoTipo className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{direccion}</p>
        {/* Hay algo hablado con el cliente sobre esta obra. En la bandeja es donde más
            pesa: acá se decide en qué día va. El mismo chip de la grilla. */}
        {comentarios && (
          <span
            className="relative mt-0.5 flex shrink-0 items-center gap-px rounded-[3px] px-[3px] py-[1px]"
            style={{ color: tipo.text }}
            title={tituloResumen(comentarios)}
          >
            <span
              aria-hidden
              className={`absolute inset-0 rounded-[3px] bg-current ${
                comentarios.sinLeer ? "tb-comentario-nuevo" : "opacity-[0.14]"
              }`}
            />
            <MessageSquare
              className="relative h-3 w-3"
              aria-label={comentarios.sinLeer ? "Comentarios sin leer" : "Tiene comentarios"}
            />
            {comentarios.cantidad > 1 && (
              <span className="relative text-[9px] font-semibold leading-none tabular-nums">
                {comentarios.cantidad}
              </span>
            )}
          </span>
        )}
        {urgente && (
          <span
            className="mt-0.5 shrink-0 rounded px-1 text-xs font-medium"
            style={{ backgroundColor: URGENCIA.alta.solido, color: "#fff" }}
            title="Urgencia alta, marcada en la OT"
          >
            Urgente
          </span>
        )}
      </div>

      <div className="space-y-0.5 pl-5 text-xs leading-snug text-foreground/75">
        {/* "QUÉ EJECUTAR" CAMBIA ESTE RENGLÓN: lo que hay que hacer en lugar del cliente, en
            dos renglones y en el color del texto, porque en ese modo es lo que se lee. La
            mediana del detalle técnico son 205 caracteres: dos renglones muestran la obra
            corta entera y de la larga lo suficiente para decidir. El resto, en la ficha. */}
        {queEjecutar ? (
          ot.detalleTecnico && (
            <p className="line-clamp-2 text-foreground" title={ot.detalleTecnico}>
              {ot.detalleTecnico}
            </p>
          )
        ) : (
          <p className="truncate" title={cliente ?? undefined}>
            {[cliente, orden].filter(Boolean).join(" · ")}
          </p>
        )}

        <p className="flex flex-wrap items-center gap-x-1">
          {/* LA DURACIÓN SE PUEDE FIJAR DESDE ACÁ, y no sólo cuando la obra ya está en una
              fecha: se guarda del lado de Operaciones y sobrevive a sacarla del tablero.
              SÓLO EN LAS QUE ENTRAN EN UN DÍA: en una de varias jornadas el número es una
              cantidad y se corrige desde "Jornadas de la obra". Tampoco en las empezadas. */}
          {editableDuracion ? (
            <DropdownMenu
              open={menuAbierto}
              onOpenChange={(abierto) => {
                setMenuAbierto(abierto);
                if (!abierto) menuCerradoEn.current = Date.now();
              }}
            >
              <DropdownMenuTrigger
                className="-mx-1 flex items-center gap-0.5 rounded px-1 underline decoration-dotted underline-offset-4 hover:bg-foreground/10 hover:text-foreground"
                // El cuerpo de la tarjeta es el asa de arrastre: sin esto abrir el menú
                // empieza a arrastrar la obra, o abre la ficha.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                title="Cuánto lleva esta obra"
              >
                {textoDuracion(duracion)}
                <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* DropdownMenuLabel es un GroupLabel de Base UI: suelto, sin un Group
                    padre, tira una excepción al abrir el menú y tumba la página entera. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Cuánto lleva</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={FRACCIONES.find((f) => Number(f.value) === duracion)?.value ?? ""}
                    onValueChange={(v) => onDuracion(ot, v as FraccionStr)}
                  >
                    {FRACCIONES.map((f) => (
                      <DropdownMenuRadioItem key={f.value} value={f.value}>
                        {f.detalle}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span>
              {empezada || pendientes < totales
                ? `quedan ${pendientes} de ${totales} jornadas`
                : textoDuracion(duracion)}
            </span>
          )}
          {queEjecutar && orden && <span>· {orden}</span>}
          {/* El compromiso explica por qué la obra está arriba de la lista. */}
          {compromiso && (
            <span
              className={compromiso.alerta ? "font-medium" : undefined}
              style={compromiso.alerta ? { color: PELIGRO_TEXTO } : undefined}
              title="Fecha que Comercial le prometió al cliente"
            >
              · {compromiso.texto}
            </span>
          )}
          {desde && <span title="El cliente no la recibe antes de esta fecha">· desde el {desde}</span>}
          {sinEstimar && (
            <span
              className="rounded px-1"
              style={{ backgroundColor: NOTA.fondo, color: NOTA.texto }}
              title="Nadie cargó la duración estimada en Odoo: el número de al lado es el default de la importación, no una estimación. Se corrige al planificar la obra."
            >
              sin estimar
            </span>
          )}
        </p>

        {/* LA HABILITACIÓN CON TEXTO cuando no está al día. Un punto de 8px con tooltip no
            se lee en táctil, y el ámbar sobre el fondo del desarme casi no se veía. La
            habilitada no dice nada: es el estado normal de su grupo. */}
        {ot.habSemaforo !== "verde" && (
          <p className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sem.color }} />
            {sem.label}
          </p>
        )}

        {/* La urgencia media escrita: como pastilla ámbar desaparecía sobre el desarme, que
            tiene el mismo fondo. Ordena y nada más; no pinta la tarjeta. */}
        {media && <p className="font-medium text-foreground">Urgencia media</p>}

        {/* El motivo de la urgencia alta: una tarjeta urgente sin motivo se lee como un
            error del sistema, no como una decisión. */}
        {urgente && (
          <p
            className="line-clamp-2 font-medium"
            style={{ color: URGENCIA.alta.texto }}
            title={ot.motivoUrgencia ?? "Marcada como urgente en la OT, sin motivo cargado"}
          >
            {ot.motivoUrgencia ?? "urgente — sin motivo cargado en la OT"}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Encabezado plegable de un grupo. El plegado es visual: adentro se arrastra igual.
 *
 * Un grupo vacío no se dibuja. Es lo que hace que el grupo de urgentes no ocupe lugar
 * mientras nadie marque una OT como urgente en Odoo.
 *
 * `fijo` es el grupo que no se pliega: se muestra sin chevron, porque un control que no
 * hace nada es peor que no tenerlo.
 */
function Grupo({
  titulo,
  cantidad,
  abierto,
  onToggle,
  fijo = false,
  color,
  children,
}: {
  titulo: string;
  cantidad: number;
  abierto: boolean;
  onToggle: () => void;
  fijo?: boolean;
  /** Color del encabezado. Sin valor, el gris de siempre. */
  color?: string;
  children: React.ReactNode;
}) {
  if (cantidad === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={fijo ? undefined : onToggle}
        disabled={fijo}
        // focus-visible propio: con el anillo global, después del clic quedaba un recuadro
        // coral alrededor del encabezado que lo hacía parecer un campo de texto.
        className={`flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
          color ? "" : "text-muted-foreground"
        } ${fijo ? "cursor-default" : "hover:bg-muted"}`}
        style={color ? { color } : undefined}
        aria-expanded={abierto}
      >
        {!fijo &&
          (abierto ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          ))}
        {titulo}
        <span
          className={`rounded-full px-1.5 text-xs font-medium ${color ? "" : "bg-muted"}`}
          style={color ? { backgroundColor: color, color: "#fff" } : undefined}
        >
          {cantidad}
        </span>
      </button>
      {abierto && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  );
}

export function PanelSinAsignar({
  ots,
  planificadas,
  fueraDeRango,
  onIrAObra,
  comentarios,
  hoy,
  colapsado,
  flotante,
  queEjecutar,
  onColapsar,
  onDetalle,
  onDuracion,
  onIrABloque,
  onOrden,
}: {
  ots: ObraPendiente[];
  /** Obras que ya están en la grilla, para el buscador. Sólo las del rango cargado. */
  planificadas: ObraPlanificada[];
  /** Obras planificadas con todas sus jornadas fuera del rango cargado. */
  fueraDeRango: OtTablero[];
  /** Busca las fechas de la obra en Odoo y lleva el tablero hasta ahí. */
  onIrAObra: (otId: number) => Promise<void>;
  /** Resumen del hilo de cada OT, resuelto de una sola consulta en el board. */
  comentarios?: Map<number, ResumenEnTarjeta>;
  /** Hoy en yyyy-MM-dd: define qué compromiso está vencido. */
  hoy: string;
  colapsado: boolean;
  /**
   * Celular: la bandeja abierta flota encima de la grilla en vez de ocupar una columna. En
   * 390px una columna de 300px dejaba sesenta para el tablero.
   */
  flotante: boolean;
  /** Las tarjetas muestran qué hay que ejecutar en vez del cliente y el técnico. */
  queEjecutar: boolean;
  onColapsar: (valor: boolean) => void;
  onDetalle: (ot: OtTablero) => void;
  /** Fijar cuánto dura una obra desde la bandeja, sin tener que planificarla antes. */
  onDuracion: (ot: OtTablero, f: FraccionStr) => void;
  onIrABloque: (bloqueKey: string, fecha: string) => void;
  /** Avisa en qué orden se ven las obras, para recorrerlas desde la ficha con ‹ ›. */
  onOrden?: (otIds: number[]) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  // El grupo de habilitación pendiente arranca plegado para que lo que está listo no se
  // mezcle con lo que no. NO es un bloqueo: se abre con un clic y adentro las tarjetas se
  // arrastran igual que cualquier otra. El semáforo advierte, no impide planificar.
  const [pendientesAbierto, setPendientesAbierto] = useState(false);
  // ¿Se está arrastrando una obra DE ACÁ hacia la grilla?
  //
  // En celular importa dos veces. La bandeja flota encima de la grilla, así que mientras se
  // arrastra se corre hacia afuera para dejar ver los días. Y deja de ser destino: el
  // rectángulo que dnd-kit midió al empezar el arrastre sigue diciendo que la bandeja está
  // ahí, y soltar sobre un día que estaba debajo caería "en la bandeja" y no haría nada.
  // En la computadora no cambia nada: soltar una obra de la bandeja en la bandeja nunca
  // hizo nada.
  const { active: activoGlobal } = useDndContext();
  const arrastrandoObra = String(activoGlobal?.id ?? "").startsWith("ot:");
  const { setNodeRef, isOver, active } = useDroppable({ id: ID_BANDEJA, disabled: arrastrandoObra });
  const soltando = isOver && String(active?.id ?? "").startsWith("bloque:");

  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [duracionFiltro, setDuracionFiltro] = useState<ClaveDuracion | null>(null);
  const hayFiltro = tipoFiltro !== null || duracionFiltro !== null;

  // Sobre la bandeja ENTERA, sin filtros ni búsqueda: es lo que se muestra con el panel
  // plegado, donde no hay ningún filtro visible que explique por qué el número es menor.
  const urgentesTotales = ots.filter((o) => esUrgente(o.ot)).length;

  const q = normalizar(busqueda.trim());

  const filtradas = useMemo(() => {
    const orden = [...ots].sort((a, b) => {
      // Urgencia declarada, después compromiso vencido, después compromiso a futuro.
      const pa = prioridad(a.ot, hoy);
      const pb = prioridad(b.ot, hoy);
      if (pa !== pb) return pa - pb;
      // Dentro del mismo nivel manda la fecha prometida, la más próxima primero.
      const fa = a.ot.fechaComprometida ?? "9999";
      const fb = b.ot.fechaComprometida ?? "9999";
      if (fa !== fb) return fa.localeCompare(fb);
      // Las empezadas antes que las que nunca se tocaron: esperan retomarse y no hay que
      // perderlas de vista.
      if ((a.cerradas > 0) !== (b.cerradas > 0)) return a.cerradas > 0 ? -1 : 1;
      return (a.ot.fechaProgramada ?? "9999").localeCompare(b.ot.fechaProgramada ?? "9999");
    });
    if (!q) return orden;
    // Con 46 obras, encontrar una puntual escaneando no funciona.
    // La dirección entra aparte del título: desde el backfill hay obras cuya calle vive
    // sólo en el campo propio, y buscarlas por el título no las encontraría.
    return orden.filter((o) => coincide(o.ot, q));
  }, [ots, q, hoy]);

  // Los contadores de cada chip se cuentan sobre la lista filtrada por el OTRO eje: el
  // número dice cuántas obras quedarían si lo apretaras, que es lo que uno espera de un
  // filtro. El chip activo se dibuja siempre, aunque quede en cero, para que no
  // desaparezca abajo del dedo.
  const { chipsTipo, chipsDuracion, conFiltros } = useMemo(() => {
    const porTipo = (o: ObraPendiente) => tipoFiltro === null || tipoDe(o.ot) === tipoFiltro;
    const porDuracion = (o: ObraPendiente) =>
      duracionFiltro === null || duracionDe(o) === duracionFiltro;

    const paraTipo = filtradas.filter(porDuracion);
    const paraDuracion = filtradas.filter(porTipo);

    const chipsTipo = TIPOS_BANDEJA.map((t) => ({
      ...t,
      cantidad: paraTipo.filter((o) => tipoDe(o.ot) === t.clave).length,
    })).filter((t) => t.clave !== "otro" || t.cantidad > 0 || t.clave === tipoFiltro);

    // La escala arranca completa —los seis baldes, en orden de menor a mayor— y encima se
    // cuentan las obras. Así los números suman siempre el total del encabezado, que es lo
    // que permite comprobar de un vistazo que no quedó ninguna obra sin balde.
    const baldes = new Map<ClaveDuracion, { label: string; detalle: string; orden: number; cantidad: number }>(
      ESCALA_DURACION.map((b) => [b.clave, { label: b.label, detalle: b.detalle, orden: b.orden, cantidad: 0 }]),
    );
    for (const o of paraDuracion) {
      const clave = duracionDe(o);
      const balde = baldes.get(clave);
      if (balde) balde.cantidad++;
      // Un balde fuera de la escala sería un bug de duracionDe, no un caso de uso: se
      // agrega igual, antes que perder la obra de vista.
      else baldes.set(clave, { label: String(clave), detalle: String(clave), orden: 98, cantidad: 1 });
    }
    const chipsDuracion = [...baldes.entries()]
      .map(([clave, v]) => ({ clave, ...v }))
      .sort((a, b) => a.orden - b.orden);

    return { chipsTipo, chipsDuracion, conFiltros: filtradas.filter(porTipo).filter(porDuracion) };
  }, [filtradas, tipoFiltro, duracionFiltro]);

  // LA URGENCIA SALTEA LA HABILITACIÓN. Las urgentes se sacan de los dos grupos de
  // habilitación y van a uno propio arriba de todo, siempre abierto.
  //
  // El motivo es concreto: el grupo "Con habilitación pendiente" arranca PLEGADO, así que
  // una obra urgente sin habilitar quedaba escondida detrás de un clic — Operaciones no la
  // veía tarde, no la veía. Ordenarla primero dentro de su grupo no alcanzaba: seguía
  // abajo del otro grupo entero y había que scrollear hasta ella.
  //
  // Cada obra sigue apareciendo en UN solo grupo, así que los tres contadores siguen
  // sumando el total del encabezado y se puede verificar de un vistazo que no falta
  // ninguna. La tarjeta urgente conserva su punto de semáforo: está arriba porque es
  // urgente, no porque esté habilitada, y esas dos cosas no pueden confundirse.
  const urgentes = conFiltros.filter((o) => esUrgente(o.ot));
  const resto = conFiltros.filter((o) => !esUrgente(o.ot));
  const listas = resto.filter((o) => !habilitacionPendiente(o.ot));
  const pendientesHab = resto.filter((o) => habilitacionPendiente(o.ot));

  // El orden de la ficha es el que se VE, con la búsqueda y los filtros puestos: la
  // recorrida con ‹ › tiene que pasar por las mismas tarjetas que tenés adelante.
  const ordenVisible = [...urgentes, ...listas, ...pendientesHab].map((o) => o.ot.id).join(",");
  useEffect(() => {
    onOrden?.(ordenVisible ? ordenVisible.split(",").map(Number) : []);
  }, [ordenVisible, onOrden]);

  // Sólo se buscan las ya planificadas cuando hay texto: sin búsqueda, la sección no
  // aporta nada y le sacaría lugar a la bandeja.
  const yaPlanificadas = useMemo(() => {
    if (!q) return [];
    return planificadas
      .filter((p) =>
        coincide(p.ot, q),
      )
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  }, [planificadas, q]);

  const masAdelante = useMemo(() => {
    if (!q) return [];
    return fueraDeRango.filter((ot) =>
      coincide(ot, q),
    );
  }, [fueraDeRango, q]);

  // Qué obra se está yendo a buscar a Odoo: el clic tarda un segundo y sin marca parece
  // que no hizo nada.
  const [yendoA, setYendoA] = useState<number | null>(null);
  async function irAObra(otId: number) {
    if (yendoA !== null) return;
    setYendoA(otId);
    try {
      await onIrAObra(otId);
    } finally {
      setYendoA(null);
    }
  }
  const totalPlanificadas = yaPlanificadas.length + masAdelante.length;

  if (colapsado) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-l py-2">
        <button
          type="button"
          onClick={() => onColapsar(false)}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Mostrar obras sin asignar"
          aria-label="Mostrar obras sin asignar"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {ots.length}
        </span>
        {/* Con el panel plegado, una obra urgente es invisible. El contador rojo es lo
            único que puede decir "abrí esto" desde 44px de ancho. Cuenta sobre `ots`, no
            sobre los filtros: plegado no hay filtros a la vista que expliquen un faltante. */}
        {urgentesTotales > 0 && (
          <span
            className="rounded-full px-1.5 text-xs font-semibold"
            style={{ backgroundColor: URGENCIA.alta.solido, color: "#fff" }}
            title={`${urgentesTotales} obra(s) urgente(s) sin planificar`}
          >
            {urgentesTotales}
          </span>
        )}
        <span className="mt-1 text-xs uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          Sin asignar
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={
        flotante
          ? `absolute inset-y-0 right-0 z-40 flex w-[min(320px,88vw)] flex-col border-l bg-card shadow-xl transition-[transform,opacity] duration-150 ${
              arrastrandoObra ? "pointer-events-none translate-x-full opacity-0" : ""
            }`
          : "flex w-[300px] shrink-0 flex-col border-l transition-colors"
      }
      style={{
        backgroundColor: soltando ? ACENTO_BG : undefined,
        outline: soltando ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-4px",
      }}
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sin asignar
        </p>
        {/* Gris: el ámbar es de la urgencia media, y un contador no es urgente. */}
        <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {conFiltros.length === ots.length ? ots.length : `${conFiltros.length}/${ots.length}`}
        </span>
        <button
          type="button"
          onClick={() => onColapsar(true)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ocultar panel"
          aria-label="Ocultar panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="relative border-b px-2.5 py-2">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          // Honesto: el cliente se encuentra si está en el título de la OT, y el técnico
          // viaja como iniciales. Decir "técnico" prometía algo que no pasaba.
          placeholder="Dirección, cliente u orden…"
          aria-label="Buscar en la bandeja"
          className="h-8 pl-7 text-sm"
        />
      </div>

      {(chipsTipo.length > 0 || chipsDuracion.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 border-b px-2.5 py-2">
          {/* Un solo renglón: el tipo con su flecha y la escala de duración con glifos. Los
              números siguen sumando el total del encabezado. */}
          <div className="contents">
            {chipsTipo.map((t) => {
              const Icono = ICONO_TIPO[colorTipo(t.clave).icono];
              return (
                <Chip
                  key={t.clave}
                  activo={tipoFiltro === t.clave}
                  cantidad={t.cantidad}
                  titulo={t.label}
                  onClick={() => setTipoFiltro((v) => (v === t.clave ? null : t.clave))}
                >
                  <Icono className="h-3 w-3" aria-label={t.label} />
                </Chip>
              );
            })}
          </div>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <div className="contents">
            {chipsDuracion.map((d) => (
              <Chip
                key={d.clave}
                activo={duracionFiltro === d.clave}
                cantidad={d.cantidad}
                titulo={
                  d.cantidad === 0
                    ? `Ninguna obra de ${d.detalle}`
                    : `${d.cantidad} obra(s) de ${d.detalle}, por lo que les queda`
                }
                onClick={() => setDuracionFiltro((v) => (v === d.clave ? null : d.clave))}
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {soltando && (
        <p className="px-2.5 py-1.5 text-xs" style={{ color: CORAL }}>
          Soltá para devolver la obra a sin asignar
        </p>
      )}

      {/* Con texto en el buscador la lista se muestra SIEMPRE, aunque la bandeja no tenga
          coincidencias: ahí abajo está "Ya planificadas", que es justo donde suele estar
          lo que no aparece. Antes, sin coincidencias en la bandeja caía al mensaje vacío
          y "ninguna obra coincide" se leía como que la obra no existía. */}
      {conFiltros.length > 0 || q ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          {conFiltros.length === 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
              <p>
                {hayFiltro
                  ? "Ninguna obra sin asignar con esos filtros."
                  : "Ninguna obra sin asignar coincide."}
              </p>
              {hayFiltro && (
                <button
                  type="button"
                  onClick={() => { setTipoFiltro(null); setDuracionFiltro(null); }}
                  className="rounded border px-2 py-0.5 text-xs hover:border-foreground/25"
                >
                  Ver todas ({filtradas.length})
                </button>
              )}
            </div>
          )}

          <Grupo
            titulo="Urgentes"
            cantidad={urgentes.length}
            abierto
            fijo
            color={URGENCIA.alta.fuerte}
            onToggle={() => {}}
          >
            {urgentes.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} comentarios={comentarios?.get(obra.ot.id) ?? null} queEjecutar={queEjecutar} onDetalle={onDetalle} onDuracion={onDuracion} />
            ))}
          </Grupo>

          {/* "Se pueden planificar" y no "Habilitadas", que es lo que decía y era FALSO
              para el amarillo: ese grupo junta verde con amarillo a propósito —el trámite
              en curso no frena la planificación, ver habilitacionPendiente— pero el título
              afirmaba que estaban habilitadas.

              Se detectó desde afuera y de la peor manera: alguien vio una obra acá, la
              buscó en Habilitaciones, la encontró "en curso" y vino a reportar un bug. El
              bug era el cartel. Con 1 sola OT en amarillo contra 21 en verde, un título
              equivocado casi siempre parece correcto — que es lo que lo hacía durar.

              El nombre ahora describe el CRITERIO real del grupo, que es lo que le sirve a
              quien planifica. Cuál está habilitada y cuál en trámite lo sigue diciendo el
              punto de semáforo de cada tarjeta, que es donde esa distinción vive. */}
          <Grupo
            titulo="Se pueden planificar"
            cantidad={listas.length}
            abierto
            fijo
            onToggle={() => {}}
          >
            {listas.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} comentarios={comentarios?.get(obra.ot.id) ?? null} queEjecutar={queEjecutar} onDetalle={onDetalle} onDuracion={onDuracion} />
            ))}
          </Grupo>

          <Grupo
            titulo="Con habilitación pendiente"
            cantidad={pendientesHab.length}
            // Con búsqueda o filtro se abre solo: si la única coincidencia estaba acá
            // adentro, plegado se leía como que la obra no existía.
            abierto={pendientesAbierto || !!q || hayFiltro}
            onToggle={() => setPendientesAbierto((v) => !v)}
          >
            {pendientesHab.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} comentarios={comentarios?.get(obra.ot.id) ?? null} queEjecutar={queEjecutar} onDetalle={onDetalle} onDuracion={onDuracion} />
            ))}
          </Grupo>

          {/* Responde "¿esta obra ya la planifiqué?", que hoy se contesta scrolleando la
              grilla a ojo. Dice DÓNDE está, que es lo que hace falta para ir. */}
          {q && (
            <div>
              <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ya planificadas
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs font-medium">
                  {totalPlanificadas}
                </span>
              </p>
              {totalPlanificadas > 0 ? (
                <div className="mt-1 space-y-1">
                  {yaPlanificadas.map((p) => {
                    const direccion = direccionDeObra(p.ot);
                    const tipo = colorTipo(p.ot.tipo);
                    const IconoTipo = ICONO_TIPO[tipo.icono];
                    return (
                      <button
                        key={p.bloqueKey}
                        type="button"
                        onClick={() => onIrABloque(p.bloqueKey, p.fechaInicio)}
                        className="flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-left hover:border-foreground/25"
                      >
                        <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{direccion}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.cuadrillaNombre ?? "sin cuadrilla"} ·{" "}
                            {format(parseISO(p.fechaInicio), "EEE d MMM", { locale: es })}
                            {p.jornadas > 1 ? ` · ${p.jornadas} jornadas` : ""}
                          </span>
                        </span>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                  {/* Planificadas fuera de las semanas cargadas. No se sabe la fecha hasta
                      preguntarle a Odoo, así que la fila no la inventa: dice que está más
                      allá y el clic la busca. */}
                  {masAdelante.map((ot) => {
                    const direccion = direccionDeObra(ot);
                    const tipo = colorTipo(ot.tipo);
                    const IconoTipo = ICONO_TIPO[tipo.icono];
                    const yendo = yendoA === ot.id;
                    return (
                      <button
                        key={`fuera:${ot.id}`}
                        type="button"
                        onClick={() => irAObra(ot.id)}
                        disabled={yendoA !== null}
                        className="flex w-full items-center gap-1.5 rounded border border-dashed px-2 py-1.5 text-left hover:border-foreground/25 disabled:cursor-wait"
                      >
                        <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{direccion}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {yendo ? "buscando la fecha…" : "fuera de las semanas a la vista"}
                          </span>
                        </span>
                        {yendo ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Mira las obras activas en cualquier fecha, no sólo las semanas cargadas.
                // Una OT ya completada no está entre las candidatas del tablero.
                <p className="px-1 text-xs text-muted-foreground">
                  Ninguna obra activa planificada coincide.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
          <p>
            {ots.length === 0
              ? "No quedan obras sin asignar."
              : hayFiltro
                ? "Ninguna obra con esos filtros."
                : "Ninguna obra coincide con la búsqueda."}
          </p>
          {/* Una lista vacía sin explicación es cómo alguien concluye que la bandeja se
              quedó sin trabajo. Se dice por qué y se ofrece el camino de vuelta. */}
          {hayFiltro && (
            <button
              type="button"
              onClick={() => { setTipoFiltro(null); setDuracionFiltro(null); }}
              className="rounded border px-2 py-1 text-xs hover:border-foreground/25"
            >
              Ver todas ({filtradas.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
