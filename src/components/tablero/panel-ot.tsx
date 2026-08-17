"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, ExternalLink, FileText, Phone, ShieldCheck, User, Clock, CalendarDays,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { semaforo } from "@/lib/tablero/colores";
import { fraccionLabel } from "@/lib/tablero/fracciones";
import type { Bloque } from "@/lib/tablero/bloques";
import type { DocumentoOt, OtTablero } from "@/lib/tablero/tipos";

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
  onOpenChange,
}: {
  ot: OtTablero | null;
  bloque: Bloque | null;
  cuadrillaNombre: string | null;
  onOpenChange: (abierto: boolean) => void;
}) {
  const sem = semaforo(ot?.habSemaforo);

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
                {ot.tecnico && <Badge variant="outline">{ot.tecnico}</Badge>}
                {ot.urgencia === "alta" && (
                  <Badge style={{ backgroundColor: "#D92D20", color: "#fff" }}>Urgencia alta</Badge>
                )}
                {bloque && (
                  <Badge variant="outline">
                    {bloque.estado === "confirmada" ? "Confirmada" : "Tentativa"}
                  </Badge>
                )}
              </div>

              {ot.urgencia === "alta" && ot.motivoUrgencia && (
                <div className="flex gap-2 rounded-md border p-2 text-sm" style={{ borderColor: "#D92D20" }}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#D92D20" }} />
                  <p className="whitespace-pre-wrap">{ot.motivoUrgencia}</p>
                </div>
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
                {ot.habVencimiento && (
                  <p className="text-xs text-muted-foreground">
                    Vence el {format(parseISO(ot.habVencimiento), "d MMM yyyy", { locale: es })}
                  </p>
                )}
              </Fila>

              {(ot.contactoObra || ot.telObra) && (
                <Fila icono={<Phone className="h-4 w-4" />} etiqueta="Contacto en obra">
                  {ot.contactoObra ?? "—"}
                  {ot.telObra && (
                    <p>
                      <a href={`tel:${ot.telObra.replace(/\s/g, "")}`} className="text-sm underline">
                        {ot.telObra}
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
                </p>
              </Fila>

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
