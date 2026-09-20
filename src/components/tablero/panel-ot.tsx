"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, Building2, CalendarCheck, Construction, ExternalLink, Fence, FileText,
  HardHat, Phone, ShieldCheck, User, UserRound, Users, Clock, CalendarDays,
  CalendarRange, Check, CircleDashed, ClipboardCheck, Pin, PinOff, Trash2,
} from "lucide-react";
import { useDetalleOt } from "@/hooks/use-detalle-ot";
import { HistorialConfirmacion } from "./historial-confirmacion";
import { MovimientosOt } from "./movimientos-ot";
import { ComentariosOt } from "./comentarios-ot";
import { DetalleTecnico } from "./detalle-tecnico";
import { ETAPA_LABEL, type HabEtapa } from "@/lib/habilitaciones/tipos";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ALERTA, CORAL, NOTA, PELIGRO, PELIGRO_SOLIDO, semaforo,
} from "@/lib/tablero/colores";
import { FRACCIONES, fraccionLabel, type FraccionStr } from "@/lib/tablero/fracciones";
import { accionDeCierre, jornadasCerradas, jornadasLiberables, type AccionCierre } from "@/lib/tablero/cierre";
import { lineaVentana } from "@/lib/tablero/ventana";
import { Button } from "@/components/ui/button";
import type { Bloque } from "@/lib/tablero/bloques";
import type { DocumentoOt, OtTablero, TrabajoOt } from "@/lib/tablero/tipos";

// Panel lateral de la OT: todo lo que hace falta para coordinar la jornada sin salir
// del tablero. La carga de partes, el circuito de habilitación y los costos viven en
// Odoo — de acá se linkea, no se edita.

const TIPO_LABEL: Record<string, string> = {
  armado: "Armado",
  desarme: "Desarme",
  ampliacion: "Ampliación",
  desmonte_parcial: "Desmonte parcial",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

/**
 * Lo que esta jornada necesita ADEMÁS de la cuadrilla.
 *
 * Sale de la clasificación que Comercial carga en la venta y son las dos cosas que, si no
 * se ven acá, se descubren en la obra: que hay que llevar concertina y que tiene que
 * estar el técnico de Seguridad e Higiene del cliente.
 *
 * SE MUESTRA SÓLO CUANDO HAY ALGO. Una caja fija diciendo "sin requisitos" en las obras
 * normales entrenaría a saltearla, y entonces no se leería el día que sí dice algo.
 *
 * VA EN CAJA DESTACADA, como "Qué hay que ejecutar", porque no es contexto: es trabajo que
 * hay que preparar antes de salir. La barra ámbar la distingue de la coral del detalle
 * técnico y de las notas fijadas, que son ámbar enteras.
 *
 * NO VA EN LA TARJETA del tablero: la primera línea ya lleva tipo, parte, candado,
 * dirección, fracción y urgencia, y por debajo de 38px se queda sin el segundo renglón.
 * Meter dos íconos más ahí le come ancho a la dirección, que es lo último que este diseño
 * sacrifica. Tampoco va en el parte: el parte se completa DESPUÉS de la jornada, o sea
 * cuando ya no sirve para cargar el camión.
 */
function QueNecesita({ trabajo }: { trabajo: TrabajoOt | undefined }) {
  if (!trabajo) return null;
  const syh = trabajo.syhPresencial === true;
  if (!trabajo.alambre && !syh) return null;

  return (
    <div
      className="space-y-2 rounded-md border-l-4 bg-muted/40 px-3 py-2.5"
      style={{ borderLeftColor: ALERTA }}
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Construction className="h-3.5 w-3.5" />
        Qué necesita esta jornada
      </p>

      {trabajo.alambre && (
        <div className="flex gap-2 text-sm">
          <Fence className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ALERTA }} />
          <p className="leading-snug">
            <span className="font-medium">Lleva alambre de concertina.</span>
          </p>
        </div>
      )}

      {syh && (
        <div className="flex gap-2 text-sm">
          <HardHat className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ALERTA }} />
          <p className="leading-snug">
            <span className="font-medium">El cliente contrató técnico de SyH.</span>
          </p>
        </div>
      )}

      {trabajo.tipoLabel && (
        <p className="text-xs text-muted-foreground">{trabajo.tipoLabel}</p>
      )}
    </div>
  );
}

function Fila({ icono, etiqueta, children }: { icono: React.ReactNode; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icono}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

function Documentos({ otId, cantidad }: { otId: number; cantidad: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tablero-documentos", otId],
    queryFn: async () => {
      const res = await fetch(`/api/planificacion/documentos?otId=${otId}`);
      if (!res.ok) throw new Error("No se pudieron leer los adjuntos");
      return (await res.json()) as { documentos: DocumentoOt[] };
    },
    enabled: cantidad > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (cantidad === 0) return <p className="text-sm text-muted-foreground">Sin documentación adjunta.</p>;
  if (isLoading) return <Skeleton className="h-16 w-full" />;

  const docs = data?.documentos ?? [];
  return (
    <div className="grid grid-cols-2 gap-2">
      {docs.map((d) => (
        <a
          key={d.id}
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-md border transition-colors hover:border-foreground/30"
          title={d.nombre}
        >
          {d.mimetype.startsWith("image/") ? (
            // La vista previa sale de Odoo con la sesión del usuario en el browser; si
            // no hay sesión, queda el nombre del archivo como alternativa.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.url} alt={d.nombre} className="h-20 w-full bg-muted object-cover" />
          ) : (
            <div className="flex h-20 items-center justify-center bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
            {/* Distingue lo que alguien subió PARA la cuadrilla de los papeles de la
                venta, que van en el mismo grid y son mayoría. */}
            {d.instruccion && <span className="font-semibold text-foreground">Instrucción · </span>}
            {d.nombre}
          </p>
        </a>
      ))}
    </div>
  );
}

/**
 * Lo que se puede hacer con esta jornada: lo mismo que el menú ⋮ de la tarjeta.
 *
 * EXISTE POR EL CELULAR. El ⋮ aparece al pasar el mouse, y en una pantalla táctil no hay
 * mouse: tocar la tarjeta abre este panel, y hasta acá el panel sólo mostraba datos. O sea
 * que desde un teléfono no había forma de confirmar, fijar, cambiar la fracción ni cerrar la
 * jornada — y cerrar la jornada es justo lo que alguien hace desde la obra.
 *
 * SE VE TAMBIÉN EN LA COMPUTADORA, a propósito: una tablet es ancha y táctil, y esconderlo
 * por ancho de pantalla la dejaría afuera. En la computadora es un segundo camino al mismo
 * gesto, y no molesta.
 *
 * Los botones miden 40px de alto en pantalla chica, que es lo mínimo que se toca con el
 * dedo sin errarle. En la computadora vuelven al tamaño de siempre.
 *
 * El motivo de una obra fija va escrito acá, entero: en la tarjeta vive en un tooltip, y en
 * un celular un tooltip no se puede leer.
 */
function AccionesJornada({
  bloque,
  hoy,
  onEstado,
  onFijar,
  onSoltar,
  onFraccion,
  onEditarJornadas,
  onCerrarJornada,
  onQuitar,
}: {
  bloque: Bloque;
  hoy: string;
  onEstado: (e: "tentativa" | "confirmada") => void;
  onFijar: () => void;
  onSoltar: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEditarJornadas: () => void;
  onCerrarJornada: (accion: NonNullable<AccionCierre>) => void;
  onQuitar: () => void;
}) {
  const accion = accionDeCierre(bloque, hoy);
  const liberables = jornadasLiberables(bloque).length;
  const cerradas = jornadasCerradas(bloque);
  // Recién soltada: todavía no tiene su número en Odoo y cualquier escritura rebotaría.
  const guardando = bloque.ids.some((id) => id < 0);
  const boton = "h-10 justify-start md:h-8";
  const confirmada = bloque.estado === "confirmada";

  return (
    <div className="space-y-2">
      {bloque.motivoFija && (
        <div className="flex gap-2 rounded-md border px-3 py-2 text-sm">
          <Pin className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-snug">
            <span className="font-medium">No se mueve de este día.</span> {bloque.motivoFija}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {accion && (
          <Button
            variant="outline"
            size="sm"
            className={boton}
            disabled={guardando}
            onClick={() => onCerrarJornada(accion)}
          >
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            {accion.tipo === "cerrar" ? "Cerrar jornada" : "Ver parte"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={boton}
          disabled={guardando}
          onClick={() => onEstado(confirmada ? "tentativa" : "confirmada")}
        >
          {confirmada ? (
            <CircleDashed className="mr-1.5 h-4 w-4" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          {confirmada ? "A tentativa" : "Confirmar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={boton}
          disabled={guardando}
          onClick={bloque.motivoFija ? onSoltar : onFijar}
        >
          {bloque.motivoFija ? (
            <PinOff className="mr-1.5 h-4 w-4" />
          ) : (
            <Pin className="mr-1.5 h-4 w-4" />
          )}
          {bloque.motivoFija ? "Soltar" : "Fijar al día"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={boton}
          disabled={guardando}
          onClick={onEditarJornadas}
        >
          <CalendarRange className="mr-1.5 h-4 w-4" />
          Jornadas
        </Button>
        {liberables > 0 && (
          <Button
            variant="outline"
            size="sm"
            className={boton}
            style={{ color: CORAL }}
            disabled={guardando}
            onClick={onQuitar}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {cerradas > 0 ? `Liberar ${liberables}` : "Quitar"}
          </Button>
        )}
      </div>

      {/* Sólo en una jornada suelta, igual que en el menú: en un bloque de varios días cada
          día tiene su fracción, y eso se edita desde "Jornadas". */}
      {!bloque.multiDia && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Fracción</span>
          {FRACCIONES.map((f) => {
            const actual = Number(f.value) === bloque.fraccion;
            return (
              <Button
                key={f.value}
                variant={actual ? "secondary" : "outline"}
                size="sm"
                className="h-10 min-w-10 px-2 md:h-7 md:min-w-0"
                disabled={guardando}
                aria-pressed={actual}
                title={f.detalle}
                onClick={() => onFraccion(f.value)}
              >
                {f.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PanelOt({
  ot,
  bloque,
  cuadrillaNombre,
  cuadrillaPrevista,
  plan,
  planObra,
  hoy,
  onEstado,
  onFijar,
  onSoltar,
  onFraccion,
  onEditarJornadas,
  onCerrarJornada,
  onQuitar,
  onOpenChange,
}: {
  ot: OtTablero | null;
  bloque: Bloque | null;
  cuadrillaNombre: string | null;
  /** La cuadrilla que la OT trae sugerida de Odoo (x_cuadrilla_prevista_id), ya con nombre. */
  cuadrillaPrevista: string | null;
  /**
   * La duración que fijó Operaciones, cuando difiere del estimado de Comercial.
   *
   * Se muestran LAS DOS y no sólo la vigente: la ficha es donde alguien va a preguntarse
   * por qué el tablero dice siete si la venta decía ocho, y esconder una de las dos
   * convierte esa pregunta en un misterio. Mismo criterio que "Duración sugerida", que
   * también convive con el estimado sin reemplazarlo.
   */
  plan: { jornadas: number; motivo: string | null; autorNombre: string | null } | null;
  /**
   * En qué días cayó la obra ENTERA, sumando todos sus tramos.
   *
   * NO ES `plan`, aunque el nombre se parezca: aquél es cuántas jornadas dijo Operaciones
   * que lleva; éste es dónde quedaron. Sirve para una sola cosa —medir la ventana del
   * cliente contra el plan de verdad— y tiene que ser la obra entera y no el bloque
   * abierto: el techo es sobre el trabajo TERMINADO, y una obra partida en dos tramos
   * termina cuando termina el segundo. Ver el encabezado de ventana.ts.
   */
  planObra: { primerDia: string | null; ultimoDia: string | null } | null;
  /** Hoy en yyyy-MM-dd: desde cuándo se puede cerrar una jornada. */
  hoy: string;
  /** Las acciones del menú de la tarjeta, sobre el bloque abierto. Ver AccionesJornada. */
  onEstado: (e: "tentativa" | "confirmada") => void;
  onFijar: () => void;
  onSoltar: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEditarJornadas: () => void;
  onCerrarJornada: (accion: NonNullable<AccionCierre>) => void;
  onQuitar: () => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  const sem = semaforo(ot?.habSemaforo);
  const { data: detalle } = useDetalleOt(ot?.id ?? null);
  const etapa = detalle?.habEtapa ? ETAPA_LABEL[detalle.habEtapa as HabEtapa] : null;
  const fecha = (f: string) => format(parseISO(f), "d MMM yyyy", { locale: es });
  // Acá SÍ se mide contra el plan, al revés que en la bandeja: la obra ya está en la
  // grilla, así que la línea no sólo informa la ventana sino que dice si el lugar donde
  // quedó la respeta. Es la misma función que usa la bandeja para que las dos superficies
  // no puedan discrepar (ver el encabezado de ventana.ts).
  const ventana = ot
    ? lineaVentana(ot, {
        primerDia: planObra?.primerDia ?? null,
        ultimoDia: planObra?.ultimoDia ?? null,
      })
    : null;

  return (
    <Sheet open={!!ot} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {ot && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-base leading-snug">{ot.titulo}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{TIPO_LABEL[ot.tipo] ?? ot.tipo}</Badge>
                {/* El técnico deja de ser una badge con las iniciales ("GS") y pasa a su
                    propia fila con nombre y apellido, que es lo que sirve para ubicarlo. */}
                {ot.urgencia === "alta" && (
                  <Badge style={{ backgroundColor: PELIGRO_SOLIDO, color: "#fff" }}>Urgencia alta</Badge>
                )}
                {bloque && (
                  <Badge variant="outline">
                    {bloque.estado === "confirmada" ? "Confirmada" : "Tentativa"}
                  </Badge>
                )}
              </div>

              {/* Quién y cuándo, pegado al badge de arriba: ese dice QUÉ estado tiene la
                  jornada, esto dice quién la dejó así. Separarlos obligaría a mirar dos
                  lugares del panel para una sola pregunta.
                  No se muestra nada mientras no haya historial — las obras confirmadas
                  antes de que esto existiera no tienen registro, y un "sin datos" en cada
                  panel sería ruido permanente por algo que se llena solo con el uso. */}
              <HistorialConfirmacion otId={ot.id} />

              {/* QUÉ SE PUEDE HACER, arriba y no al pie: en un celular este panel es la
                  única puerta a las acciones de la jornada, y al pie quedaban debajo de
                  medio metro de datos. Una tarea de operaciones no abre este panel. */}
              {bloque && bloque.origen !== "tarea" && (
                <AccionesJornada
                  bloque={bloque}
                  hoy={hoy}
                  onEstado={onEstado}
                  onFijar={onFijar}
                  onSoltar={onSoltar}
                  onFraccion={onFraccion}
                  onEditarJornadas={onEditarJornadas}
                  onCerrarJornada={onCerrarJornada}
                  onQuitar={onQuitar}
                />
              )}

              {/* Y qué más le pasó a esta obra: de qué día se movió, quién la planificó,
                  quién le sacó jornadas. Junto al de confirmaciones y no en otra parte
                  del panel: son las dos mitades de "¿por qué esta obra está acá?". */}
              <MovimientosOt otId={ot.id} />

              {ot.urgencia === "alta" && ot.motivoUrgencia && (
                <div className="flex gap-2 rounded-md border p-2 text-sm" style={{ borderColor: PELIGRO }}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PELIGRO }} />
                  <p className="whitespace-pre-wrap">{ot.motivoUrgencia}</p>
                </div>
              )}

              {/* QUÉ HAY QUE EJECUTAR, antes que nada.
                  Es la primera pregunta del que abre la tarjeta y hasta acá el panel no la
                  contestaba: la dirección y el cliente estaban, la estructura no. Va en
                  caja destacada y no como una Fila más porque no es un dato de contexto,
                  es el trabajo.
                  El vacío SE MUESTRA: una OT sin detalle técnico es un problema para
                  quien planifica, y no mostrar nada lo esconde. */}
              <DetalleTecnico
                texto={detalle?.detalleTecnico}
                confirmadoEl={detalle?.estructuraConfirmadaEl}
                cargando={!detalle}
              />

              <QueNecesita trabajo={detalle?.trabajo} />

              {/* EL HILO DE LA OBRA, arriba y no al pie del panel. Lo que Operaciones
                  habló con el cliente —"entramos 8am el martes", "si llueve corre al
                  jueves"— cambia lo que hay que hacer con la jornada, así que va con lo
                  que hay que ejecutar y no entre los datos de contexto. */}
              <ComentariosOt otId={ot.id} />

              {/* QUIÉN y DÓNDE, arriba de todo. Antes el panel no lo decía: el cliente
                  salía de partir el título de la OT, que no siempre lo trae —"Desarme ·
                  S00719 · Av. Callao 1810" no tiene cliente— y la dirección quedaba
                  mezclada ahí adentro. En la orden de venta están los dos, siempre. */}
              {(detalle?.cliente || detalle?.direccionObra) && (
                <Fila icono={<Building2 className="h-4 w-4" />} etiqueta="Cliente">
                  {detalle.cliente ?? "—"}
                  {detalle.direccionObra && (
                    <p className="text-xs text-muted-foreground">{detalle.direccionObra}</p>
                  )}
                  {/* Cómo se reconoce el lugar desde la calle. Va en su propio renglón y no
                      pegado a la dirección: es lo que la cuadrilla busca cuando llega. */}
                  {detalle.referenciaObra && (
                    <p className="text-xs font-medium">{detalle.referenciaObra}</p>
                  )}
                </Fila>
              )}

              {(detalle?.tecnicoNombre || ot.tecnico || detalle?.vendedor) && (
                <Fila icono={<UserRound className="h-4 w-4" />} etiqueta="Técnico">
                  {detalle?.tecnicoNombre ?? ot.tecnico ?? "—"}
                  {detalle?.vendedor && (
                    <p className="text-xs text-muted-foreground">Vendedor: {detalle.vendedor}</p>
                  )}
                </Fila>
              )}

              <Separator />

              {/* LA VENTANA DEL CLIENTE — "no antes del 12", "terminada antes del 15".
                  Es la restricción que Comercial cargó en la venta, y le pasaba lo mismo
                  que a la fecha comprometida acá abajo: se veía en la bandeja y
                  desaparecía al planificar la obra, que es cuando hay que defenderla. El
                  caso real: alguien pone una obra en una fecha lejana PORQUE leyó el
                  piso, y después nadie puede saber por qué está ahí.

                  A diferencia de la bandeja, acá puede salir en rojo: una vez que la obra
                  está en la grilla, la ventana se compara contra el día en que quedó. */}
              {/* CalendarRange y NO el candado, aunque la bandeja use candado para esto:
                  este panel se abre desde una tarjeta de la grilla, y ahí el candado ya
                  significa otra cosa —el permiso municipal sin emitir—. El mismo dibujo
                  para dos cosas distintas a un clic de distancia se lee como la misma. */}
              {ventana && (
                <Fila icono={<CalendarRange className="h-4 w-4" />} etiqueta="Ventana del cliente">
                  <span style={ventana.alerta ? { color: PELIGRO_SOLIDO, fontWeight: 500 } : undefined}>
                    {ventana.texto}
                  </span>
                  {ventana.alerta && (
                    <p className="text-xs text-muted-foreground">
                      El plan de hoy no respeta lo que se acordó con el cliente.
                    </p>
                  )}
                </Fila>
              )}

              {/* La fecha que Comercial prometió. Es contra esto que se mide si la
                  planificación llega tarde, y hasta ahora sólo se veía en la bandeja:
                  al abrir la obra desaparecía justo cuando se decide dónde ponerla. */}
              {ot.fechaComprometida && (
                <Fila icono={<CalendarCheck className="h-4 w-4" />} etiqueta="Comprometida al cliente">
                  {fecha(ot.fechaComprometida)}
                  {detalle?.fechaFirmeza && (
                    <p className="text-xs text-muted-foreground">
                      {detalle.fechaFirmeza === "confirmada"
                        ? "Fecha firme"
                        : "Tentativa · puede moverse"}
                    </p>
                  )}
                </Fila>
              )}

              {/* Sin bloque a la vista, la fecha de la OT es lo único que ubica la obra:
                  puede estar planificada fuera del rango cargado. */}
              {!bloque && ot.fechaProgramada && (
                <Fila icono={<CalendarDays className="h-4 w-4" />} etiqueta="Programada">
                  {fecha(ot.fechaProgramada)}
                  <p className="text-xs text-muted-foreground">Fuera de las semanas que estás viendo.</p>
                </Fila>
              )}

              {/* La cuadrilla que ya venía sugerida, sólo cuando aporta algo: si el bloque
                  ya está en esa misma cuadrilla, repetirlo es ruido. */}
              {cuadrillaPrevista && cuadrillaPrevista !== cuadrillaNombre && (
                <Fila icono={<Users className="h-4 w-4" />} etiqueta="Cuadrilla prevista">
                  {cuadrillaPrevista}
                  {bloque && (
                    <p className="text-xs text-muted-foreground">
                      En el tablero está en {cuadrillaNombre ?? "otra cuadrilla"}.
                    </p>
                  )}
                </Fila>
              )}

              {bloque && (
                <Fila icono={<CalendarDays className="h-4 w-4" />} etiqueta="En el tablero">
                  {cuadrillaNombre ?? "Sin cuadrilla"} ·{" "}
                  {bloque.fechas.length > 1
                    ? `${format(parseISO(bloque.fechas[0]), "d MMM", { locale: es })} – ${format(
                        parseISO(bloque.fechas[bloque.fechas.length - 1]),
                        "d MMM",
                        { locale: es },
                      )} (${bloque.fechas.length} jornadas)`
                    : `${format(parseISO(bloque.fechas[0]), "EEE d MMM", { locale: es })} · ${fraccionLabel(bloque.fraccion)} de jornada`}
                </Fila>
              )}

              <Separator />

              <Fila icono={<ShieldCheck className="h-4 w-4" />} etiqueta="Habilitación">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sem.color }} />
                  {sem.label}
                  {ot.habAlerta ? ` · ${ot.habAlerta}` : ""}
                </span>
                {/* El semáforo dice el color; la ETAPA dice qué falta para poder ir, que
                    es lo que el que planifica necesita para decidir si pone la fecha. */}
                {etapa && (
                  <p className="text-xs text-muted-foreground">
                    {etapa}
                    {detalle && detalle.habDias > 0 && ` · ${detalle.habDias} días en trámite`}
                  </p>
                )}
                {ot.habVencimiento && (
                  <p className="text-xs text-muted-foreground">
                    Vence el {fecha(ot.habVencimiento)}
                  </p>
                )}
              </Fila>

              {/* El contacto de la OT manda. Cuando no está —el 88% de los casos— se cae
                  al teléfono de la ficha de obra del cliente, que es al que se llama
                  igual, y se aclara de dónde salió para que nadie lo confunda con un
                  dato cargado para esta jornada. */}
              {(ot.contactoObra || ot.telObra || detalle?.telFichaCliente) && (
                <Fila icono={<Phone className="h-4 w-4" />} etiqueta="Contacto en obra">
                  {ot.contactoObra ?? (ot.telObra ? "—" : "Según la ficha del cliente")}
                  {(ot.telObra ?? detalle?.telFichaCliente) && (
                    <p>
                      <a
                        href={`tel:${(ot.telObra ?? detalle?.telFichaCliente ?? "").replace(/[^\d+]/g, "")}`}
                        className="text-sm underline"
                      >
                        {ot.telObra ?? detalle?.telFichaCliente}
                      </a>
                    </p>
                  )}
                </Fila>
              )}

              <Fila icono={<Clock className="h-4 w-4" />} etiqueta="Duración">
                {ot.sinEstimar ? (
                  <span style={{ color: NOTA.texto }}>
                    Sin estimar — nadie cargó la duración en Odoo
                  </span>
                ) : (
                  <>
                    {ot.jornadas} jornada{ot.jornadas === 1 ? "" : "s"} estimada
                    {ot.jornadas === 1 ? "" : "s"}
                  </>
                )}
                {ot.personalPorJornada > 0 ? ` · ${ot.personalPorJornada} personas` : ""}
                {plan && (
                  <p className="text-xs" style={{ color: NOTA.texto }}>
                    Operaciones planifica {plan.jornadas} jornada
                    {plan.jornadas === 1 ? "" : "s"}
                    {plan.autorNombre ? ` · ${plan.autorNombre}` : ""}
                    {plan.motivo ? ` — ${plan.motivo}` : ""}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Ejecutado: {ot.diasObra} día{ot.diasObra === 1 ? "" : "s"} · {ot.horasHombre} h hombre
                  {detalle?.desvio ? ` · ${detalle.desvio} vs estimado` : ""}
                </p>
                {/* CUÁNDO se ejecutó, no sólo cuánto. Para planificar un desarme, saber
                    que el armado corrió de febrero a julio es la mitad de la decisión. */}
                {detalle?.periodo && (
                  <p className="text-xs text-muted-foreground">{detalle.periodo}</p>
                )}
              </Fila>

              {detalle?.duracionSugerida && (
                <Fila icono={<Clock className="h-4 w-4" />} etiqueta="Duración sugerida">
                  <p className="whitespace-pre-wrap text-sm">{detalle.duracionSugerida}</p>
                </Fila>
              )}

              {ot.observaciones && (
                <Fila icono={<User className="h-4 w-4" />} etiqueta="Observaciones">
                  <p className="whitespace-pre-wrap text-sm">{ot.observaciones}</p>
                </Fila>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Documentación ({ot.cantDocs + ot.cantInstrucciones})
                </p>
                {/* Las dos fuentes se suman: los croquis que Comercial sube EN la OT y los
                    papeles de la venta. Con sólo cantDocs, una OT que tiene instrucciones
                    pero ningún adjunto en la venta decía "Sin documentación". */}
                <Documentos otId={ot.id} cantidad={ot.cantDocs + ot.cantInstrucciones} />
              </div>

              <a
                href={ot.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir la OT en Odoo
                {ot.ordenVenta ? ` (${ot.ordenVenta})` : ""}
              </a>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
