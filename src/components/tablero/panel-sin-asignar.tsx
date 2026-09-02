"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
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
  Info,
  Lock,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { colorTipo, semaforo, CORAL, ACENTO_BG, URGENCIA } from "@/lib/tablero/colores";
import { fraccionLabel, repartirJornadas, FRACCIONES, type FraccionStr } from "@/lib/tablero/fracciones";
import { partesTitulo, normalizar } from "@/lib/tablero/titulo";
import { lineaPiso } from "@/lib/tablero/fecha-desde";
import type { OtTablero } from "@/lib/tablero/tipos";

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
  /** Jornadas totales previstas de la obra. */
  totales: number;
  /** Las que faltan planificar. */
  pendientes: number;
  /** Las que ya tienen parte cargado: si hay, la obra está empezada. */
  cerradas: number;
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
  const todas = repartirJornadas(obra.ot.jornadas);
  const quedan = todas.slice(Math.max(0, todas.length - obra.pendientes));
  if (quedan.length > 1) return "varios";
  return (quedan[0] ?? "1") as ClaveDuracion;
}

/**
 * La escala completa de duración, de menor a mayor. Es la MISMA de la que salen las
 * fracciones al planificar, así que un tamaño posible no puede faltar acá.
 */
const ESCALA_DURACION: { clave: ClaveDuracion; label: string; orden: number }[] = [
  ...FRACCIONES.map((f, i) => ({
    clave: f.value as ClaveDuracion,
    label: f.value === "1" ? "1 jornada · 8 h" : `${f.label} · ${f.horas} h`,
    orden: i,
  })),
  { clave: "varios", label: "Varios días", orden: 99 },
];

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
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:cursor-default"
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
 * La habilitación deja de ser una franja de color y pasa a ser el criterio de
 * agrupación: rojo y vencida a un lado, el resto al otro. El amarillo —"en curso"— va con
 * las habilitadas: el trámite avanza y la obra se puede planificar mientras tanto.
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
  onDetalle,
}: {
  obra: ObraPendiente;
  hoy: string;
  onDetalle: (ot: OtTablero) => void;
}) {
  const { ot, totales, pendientes, cerradas } = obra;
  const empezada = cerradas > 0;
  const compromiso = lineaCompromiso(ot, hoy);
  // Sin fecha planificada: en la bandeja la obra todavía no está en la grilla, así que
  // la línea informa el piso pero nunca lo marca como violado.
  const pisoLinea = lineaPiso(ot, null);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `ot:${ot.id}`,
    data: { ot },
  });
  const tipo = colorTipo(ot.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const sem = semaforo(ot.habSemaforo);
  const urgente = esUrgente(ot);
  const media = esUrgenciaMedia(ot);
  const partes = partesTitulo(ot.titulo);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // select-none: apretar sobre el texto y arrastrar hacía que el navegador extendiera
      // una SELECCIÓN, y una selección que se estira más allá del borde scrollea el
      // contenedor sola — el mismo síntoma que el auto-scroll, por otro camino. Acá el
      // texto es un agarre para arrastrar, no algo para seleccionar.
      className="cursor-grab select-none rounded-md border p-2 transition-colors hover:border-foreground/25 active:cursor-grabbing"
      style={{
        opacity: isDragging ? 0.35 : 1,
        backgroundColor: tipo.bg,
        // El borde rojo es SÓLO de la urgencia alta. Es el canal más caro que le queda a
        // esta tarjeta y por eso no lo comparte con nada: si también marcara "media", las
        // dos se leerían igual desde lejos, que es exactamente lo que hay que evitar.
        borderColor: urgente ? URGENCIA.alta.fuerte : "transparent",
        // La franja ya no es el semáforo —eso ahora lo dice el grupo— sino "empezada",
        // que es el estado que hay que no perder de vista dentro de cada grupo. La urgencia
        // alta se la queda cuando hay conflicto: no se pierde nada, porque "empezada" tiene
        // además su propio renglón arriba con las jornadas hechas.
        borderLeft: urgente
          ? `5px solid ${URGENCIA.alta.fuerte}`
          : empezada
            ? "5px solid #EF9F27"
            : "5px solid transparent",
      }}
    >
      {empezada && (
        <p
          className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: "#854F0B" }}
        >
          <PlayCircle className="h-3 w-3" />
          Empezada · {cerradas} de {totales} jornadas hechas
        </p>
      )}
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: tipo.text, opacity: 0.8 }}>
            {/* El ícono reemplaza a la palabra ARMADO / DESARME: dice lo mismo, no compite
                por el ancho, y es lo que libera lugar para la dirección. */}
            <IconoTipo className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {partes.numero ?? "OT"}
            {/* El semáforo sigue estando: dentro del grupo de listas conviven verde,
                amarillo y gris, y la diferencia importa. */}
            <span
              className="ml-auto h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: sem.color }}
              title={sem.label}
            />
          </p>
          {partes.cliente && (
            <p className="truncate text-[11px]" style={{ color: tipo.text, opacity: 0.75 }} title={partes.cliente}>
              {partes.cliente}
            </p>
          )}
          {/* La dirección entra completa: para eso el panel es vertical. */}
          <p className="text-[12px] font-medium leading-snug" style={{ color: tipo.text }}>
            {partes.principal}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Alta va en rojo pleno y media en ámbar suave: el mismo lugar, dos pesos.
              Leídas de reojo, la primera salta y la segunda se nota sin gritar. */}
          {urgente && (
            <span
              className="rounded px-1 text-[9px] font-semibold"
              style={{ backgroundColor: URGENCIA.alta.fuerte, color: "#fff" }}
              title="Urgencia alta, marcada en la OT"
            >
              {URGENCIA.alta.label}
            </span>
          )}
          {media && (
            <span
              className="rounded px-1 text-[9px] font-semibold"
              style={{ backgroundColor: URGENCIA.media.suave, color: URGENCIA.media.texto }}
              title="Urgencia media, marcada en la OT"
            >
              {URGENCIA.media.label}
            </span>
          )}
          {/* Botón aparte para el detalle: el cuerpo de la tarjeta es el asa de
              arrastre, y un clic ahí se confunde con el gesto de asignar. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDetalle(ot); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-1 hover:bg-black/5"
            style={{ color: tipo.text }}
            title="Ver detalle de la obra"
            aria-label="Ver detalle de la obra"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="mt-1 truncate text-[10px]" style={{ color: tipo.text, opacity: 0.7 }}>
        {empezada || pendientes < totales
          ? `quedan ${pendientes} de ${totales} jornadas`
          : ot.jornadas >= 1
            ? `${ot.jornadas} jornada${ot.jornadas === 1 ? "" : "s"}`
            : `${fraccionLabel(ot.jornadas)} de jornada`}
        {ot.tecnico ? ` · ${ot.tecnico}` : ""}
      </p>

      {/* El motivo de la urgencia, igual que el compromiso: lo que explica por qué esta
          obra está arriba de todo y salteando el grupo de habilitación. Una tarjeta
          urgente sin motivo se lee como un error del sistema, no como una decisión. */}
      {urgente && (
        <p
          className="mt-0.5 line-clamp-2 text-[10px] font-semibold"
          style={{ color: URGENCIA.alta.texto }}
          title={ot.motivoUrgencia ?? "Marcada como urgente en la OT, sin motivo cargado"}
        >
          {ot.motivoUrgencia ?? "urgente — sin motivo cargado en la OT"}
        </p>
      )}

      {/* El compromiso con el cliente va en su propia línea y no diluido entre el resto:
          es lo que explica por qué la obra está arriba de la lista. Sin esto el orden
          sería una decisión invisible que hay que creer. */}
      {compromiso && (
        <p
          className={`mt-0.5 truncate text-[10px] ${compromiso.alerta ? "font-semibold" : "font-medium"}`}
          style={{ color: compromiso.alerta ? "#B42318" : tipo.text }}
          title="Fecha que Comercial le prometió al cliente"
        >
          {compromiso.texto}
        </p>
      )}

      {/* El piso acordado con el cliente. Va DESPUÉS del compromiso porque se leen como
          los dos extremos de la ventana —"no antes del 12 · comprometida 18"— y en ese
          orden. Acá nunca está en rojo: en la bandeja la obra todavía no tiene día, así
          que no hay nada violado; el rojo aparece cuando ya está sobre la grilla. */}
      {pisoLinea && (
        <p
          className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium"
          style={{ color: tipo.text }}
          title="El cliente no la recibe antes de esta fecha"
        >
          <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden />
          {pisoLinea.texto}
        </p>
      )}
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
        className={`flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.04em] ${
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
          className={`rounded-full px-1.5 text-[10px] font-medium ${color ? "" : "bg-muted"}`}
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
  hoy,
  colapsado,
  onColapsar,
  onDetalle,
  onIrABloque,
}: {
  ots: ObraPendiente[];
  /** Obras que ya están en la grilla, para el buscador. Sólo las del rango cargado. */
  planificadas: ObraPlanificada[];
  /** Hoy en yyyy-MM-dd: define qué compromiso está vencido. */
  hoy: string;
  colapsado: boolean;
  onColapsar: (valor: boolean) => void;
  onDetalle: (ot: OtTablero) => void;
  onIrABloque: (bloqueKey: string, fecha: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  // El grupo de habilitación pendiente arranca plegado para que lo que está listo no se
  // mezcle con lo que no. NO es un bloqueo: se abre con un clic y adentro las tarjetas se
  // arrastran igual que cualquier otra. El semáforo advierte, no impide planificar.
  const [pendientesAbierto, setPendientesAbierto] = useState(false);
  const { setNodeRef, isOver, active } = useDroppable({ id: ID_BANDEJA });
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
    return orden.filter((o) => normalizar(`${o.ot.titulo} ${o.ot.tecnico ?? ""}`).includes(q));
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
    const baldes = new Map<ClaveDuracion, { label: string; orden: number; cantidad: number }>(
      ESCALA_DURACION.map((b) => [b.clave, { label: b.label, orden: b.orden, cantidad: 0 }]),
    );
    for (const o of paraDuracion) {
      const clave = duracionDe(o);
      const balde = baldes.get(clave);
      if (balde) balde.cantidad++;
      // Un balde fuera de la escala sería un bug de duracionDe, no un caso de uso: se
      // agrega igual, antes que perder la obra de vista.
      else baldes.set(clave, { label: String(clave), orden: 98, cantidad: 1 });
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

  // Sólo se buscan las ya planificadas cuando hay texto: sin búsqueda, la sección no
  // aporta nada y le sacaría lugar a la bandeja.
  const yaPlanificadas = useMemo(() => {
    if (!q) return [];
    return planificadas
      .filter((p) => normalizar(`${p.ot.titulo} ${p.ot.tecnico ?? ""}`).includes(q))
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  }, [planificadas, q]);

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
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {ots.length}
        </span>
        {/* Con el panel plegado, una obra urgente es invisible. El contador rojo es lo
            único que puede decir "abrí esto" desde 44px de ancho. Cuenta sobre `ots`, no
            sobre los filtros: plegado no hay filtros a la vista que expliquen un faltante. */}
        {urgentesTotales > 0 && (
          <span
            className="rounded-full px-1.5 text-[11px] font-semibold"
            style={{ backgroundColor: URGENCIA.alta.fuerte, color: "#fff" }}
            title={`${urgentesTotales} obra(s) urgente(s) sin planificar`}
          >
            {urgentesTotales}
          </span>
        )}
        <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          Sin asignar
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex w-[300px] shrink-0 flex-col border-l transition-colors"
      style={{
        backgroundColor: soltando ? ACENTO_BG : undefined,
        outline: soltando ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-4px",
      }}
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Sin asignar
        </p>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
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
          placeholder="Buscar obra, cliente o técnico…"
          className="h-7 pl-7 text-[12px]"
        />
      </div>

      {(chipsTipo.length > 0 || chipsDuracion.length > 0) && (
        <div className="space-y-1 border-b px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {chipsTipo.map((t) => {
              const Icono = ICONO_TIPO[colorTipo(t.clave).icono];
              return (
                <Chip
                  key={t.clave}
                  activo={tipoFiltro === t.clave}
                  cantidad={t.cantidad}
                  onClick={() => setTipoFiltro((v) => (v === t.clave ? null : t.clave))}
                >
                  <Icono className="h-3 w-3" aria-hidden />
                  {t.label}
                </Chip>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1">
            {chipsDuracion.map((d) => (
              <Chip
                key={d.clave}
                activo={duracionFiltro === d.clave}
                cantidad={d.cantidad}
                titulo={
                  d.cantidad === 0
                    ? `Ninguna obra de ${d.label}`
                    : `${d.cantidad} obra(s) de ${d.label}, por lo que les queda`
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
        <p className="px-2.5 py-1.5 text-[11px]" style={{ color: CORAL }}>
          Soltá para devolver la obra a sin asignar
        </p>
      )}

      {conFiltros.length > 0 || yaPlanificadas.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          <Grupo
            titulo="Urgentes"
            cantidad={urgentes.length}
            abierto
            fijo
            color={URGENCIA.alta.fuerte}
            onToggle={() => {}}
          >
            {urgentes.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} onDetalle={onDetalle} />
            ))}
          </Grupo>

          <Grupo
            titulo="Habilitadas"
            cantidad={listas.length}
            abierto
            fijo
            onToggle={() => {}}
          >
            {listas.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} onDetalle={onDetalle} />
            ))}
          </Grupo>

          <Grupo
            titulo="Con habilitación pendiente"
            cantidad={pendientesHab.length}
            abierto={pendientesAbierto}
            onToggle={() => setPendientesAbierto((v) => !v)}
          >
            {pendientesHab.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} onDetalle={onDetalle} />
            ))}
          </Grupo>

          {/* Responde "¿esta obra ya la planifiqué?", que hoy se contesta scrolleando la
              grilla a ojo. Dice DÓNDE está, que es lo que hace falta para ir. */}
          {q && (
            <div>
              <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Ya planificadas
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-medium">
                  {yaPlanificadas.length}
                </span>
              </p>
              {yaPlanificadas.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {yaPlanificadas.map((p) => {
                    const partes = partesTitulo(p.ot.titulo);
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
                          <span className="block truncate text-[12px] font-medium">{partes.principal}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {p.cuadrillaNombre ?? "sin cuadrilla"} ·{" "}
                            {format(parseISO(p.fechaInicio), "EEE d MMM", { locale: es })}
                            {p.jornadas > 1 ? ` · ${p.jornadas} jornadas` : ""}
                          </span>
                        </span>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                // No dice "no está planificada": el buscador sólo ve el rango cargado, y
                // afirmar de más sobre lo que no se miró es peor que no decir nada.
                <p className="px-1 text-[10px] text-muted-foreground">
                  Nada en las semanas cargadas. Si puede estar más adelante, scrolleá y
                  volvé a buscar.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-[11px] text-muted-foreground">
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
              className="rounded border px-2 py-1 text-[11px] hover:border-foreground/25"
            >
              Ver todas ({filtradas.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
