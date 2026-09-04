"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, Building2, CalendarCheck, Construction, ExternalLink, Fence, FileText,
  Hammer, HardHat, Phone, Pin, ShieldCheck, User, UserRound, Users, Clock, CalendarDays,
} from "lucide-react";
import { useDetalleOt } from "@/hooks/use-detalle-ot";
import { HistorialConfirmacion } from "./historial-confirmacion";
import { useNotasFijadas } from "@/hooks/use-habilitaciones";
import { ETAPA_LABEL, type HabEtapa } from "@/lib/habilitaciones/tipos";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ALERTA, AVISO, CORAL, PELIGRO, PELIGRO_SOLIDO, semaforo } from "@/lib/tablero/colores";
import { fraccionLabel } from "@/lib/tablero/fracciones";
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
            <span className="font-medium">Lleva alambre de concertina.</span>{" "}
            <span className="text-muted-foreground">
              Va sobre la bandeja de protección — hay que cargarlo con el material.
            </span>
          </p>
        </div>
      )}

      {syh && (
        <div className="flex gap-2 text-sm">
          <HardHat className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ALERTA }} />
          <p className="leading-snug">
            <span className="font-medium">El cliente contrató técnico de SyH.</span>{" "}
            <span className="text-muted-foreground">
              Tiene que estar en obra el día del trabajo: hay que coordinarlo antes.
            </span>
          </p>
        </div>
      )}

      {trabajo.tipoLabel && (
        <p className="text-xs text-muted-foreground">{trabajo.tipoLabel}</p>
      )}
    </div>
  );
}

/**
 * Las notas fijadas de la habilitación, acá y no sólo en su módulo.
 *
 * "El administrador sólo atiende martes y jueves" es información que necesita quien
 * planifica, en el momento en que está por prometer una fecha. Encerrarla en
 * /habilitaciones es dejarla donde no sirve.
 */
function NotasFijadas({ otId }: { otId: number }) {
  const { data: notas } = useNotasFijadas(otId);
  if (!notas?.length) return null;

  return (
    <div
      className="space-y-1.5 rounded-md border p-2"
      style={{ backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }}
    >
      {notas.map((n) => (
        <div key={n.id} className="flex gap-2 text-sm">
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: AVISO.icono }} />
          <p className="whitespace-pre-wrap">{n.texto}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Qué estructura hay que montar o bajar.
 *
 * Lo carga Comercial en la OT de Odoo, precargado con el párrafo técnico de la propuesta
 * de la venta (cubre 517 de las 632 obras confirmadas; el resto cae a las líneas de la
 * orden). Sin esto la cuadrilla salía sabiendo la dirección y nada más.
 */
function DetalleTecnico({
  texto,
  confirmadoEl,
  cargando,
}: {
  texto?: string | null;
  /** Fecha en que Operaciones confirmó la estructura en obra. */
  confirmadoEl?: string | null;
  cargando: boolean;
}) {
  return (
    <div className="space-y-1.5 rounded-md border-l-4 bg-muted/40 px-3 py-2.5" style={{ borderLeftColor: CORAL }}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Hammer className="h-3.5 w-3.5" />
        Qué hay que ejecutar
      </p>
      {cargando ? (
        <Skeleton className="h-4 w-3/4" />
      ) : texto ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-snug">{texto}</p>
          {/* Cambia cómo hay que leer el texto de arriba: con fecha, no es lo que se
              vendió sino lo que se armó de verdad, verificado por alguien que estuvo. */}
          {confirmadoEl && (
            <p className="text-xs text-muted-foreground">
              Estructura confirmada en obra el{" "}
              {format(parseISO(confirmadoEl), "d MMM yyyy", { locale: es })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sin detalle técnico cargado. Pedíselo a Comercial antes de mandar la cuadrilla.
        </p>
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
          <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{d.nombre}</p>
        </a>
      ))}
    </div>
  );
}

export function PanelOt({
  ot,
  bloque,
  cuadrillaNombre,
  cuadrillaPrevista,
  onOpenChange,
}: {
  ot: OtTablero | null;
  bloque: Bloque | null;
  cuadrillaNombre: string | null;
  /** La cuadrilla que la OT trae sugerida de Odoo (x_cuadrilla_prevista_id), ya con nombre. */
  cuadrillaPrevista: string | null;
  onOpenChange: (abierto: boolean) => void;
}) {
  const sem = semaforo(ot?.habSemaforo);
  const { data: detalle } = useDetalleOt(ot?.id ?? null);
  const etapa = detalle?.habEtapa ? ETAPA_LABEL[detalle.habEtapa as HabEtapa] : null;
  const fecha = (f: string) => format(parseISO(f), "d MMM yyyy", { locale: es });

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

              <NotasFijadas otId={ot.id} />

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
                {ot.jornadas} jornada{ot.jornadas === 1 ? "" : "s"} estimada
                {ot.jornadas === 1 ? "" : "s"}
                {ot.personalPorJornada > 0 ? ` · ${ot.personalPorJornada} personas` : ""}
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
                  Documentación ({ot.cantDocs})
                </p>
                <Documentos otId={ot.id} cantidad={ot.cantDocs} />
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
