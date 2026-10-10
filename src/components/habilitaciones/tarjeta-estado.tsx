"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  BadgeCheck, ChevronDown, CircleCheck, CircleX, ExternalLink, HardHat, Loader2, RotateCcw,
  TriangleAlert, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogoPosponer } from "@/components/habilitaciones/dialogo-posponer";
import {
  useDeclararHabilitacion, useMarcarTodos, usePosponer, useRegistrarConsulta, useRegistrarGestion,
  useTriage,
} from "@/hooks/use-habilitaciones";
import {
  esperaDe, estadoDeHabilitacion, friccionDelTablero, grupoDe, hoyISO, vueltaPorPermiso,
} from "@/lib/habilitaciones/derivacion";
import { pasoDe, seArma } from "@/lib/habilitaciones/presentacion";
import { AVISO, OK, OK_SOLIDO, PELIGRO, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { direccionDeObra } from "@/lib/tablero/titulo";
import type { ClaveGrupo, FichaHabilitacion } from "@/lib/habilitaciones/tipos";

// La tarjeta de estado de la ficha (rediseño del 09/10, docs/habilitaciones-rediseno.md §4.3).
//
// UNA SOLA TARJETA ARRIBA, en lugar de cinco bloques: el veredicto, el bloque de habilitar,
// la barra de triage, la de posponer y la columna con las cuatro etapas de Odoo. Los cinco
// decían el estado con palabras distintas ("Se puede armar, con pendientes", "Nuestra —
// falta consultarle…", "Falta aprobar 1 de 1"), y el Aplica de una obra nueva quedaba
// séptimo, debajo del pliegue.
//
// Dice tres cosas: qué sigue (con su botón), cuándo se arma y qué hace el tablero con ella.
// Debajo, los pasos con fecha. Lo que no es el paso de hoy va en "Más".
//
// HABILITAR ES UNA DECISIÓN: acá, parado sobre la obra, es un clic; con faltantes pide motivo
// en un diálogo. REVERTIR pide confirmación y motivo, que viaja en el aviso a Operaciones.

const fecha = (f: string) => format(parseISO(f), "d MMM", { locale: es });
const larga = (f: string) => format(parseISO(f), "EEEE d 'de' MMMM", { locale: es });

type Estado =
  | { tipo: "no_aplica" }
  | { tipo: "habilitada" }
  | { tipo: "pospuesta" }
  | { tipo: "grupo"; grupo: ClaveGrupo };

const PILDORA: Record<string, { texto: string; fondo: string; color: string }> = {
  urgentes: { texto: "Urgente", fondo: PELIGRO_SUAVE, color: PELIGRO_TEXTO },
  nuevas: { texto: "Nueva", fondo: AVISO.fondo, color: AVISO.texto },
  para_hacer: { texto: "Para hacer", fondo: "var(--accent)", color: "var(--foreground)" },
  cliente: { texto: "Esperando al cliente", fondo: "var(--muted)", color: "var(--foreground)" },
  permiso: { texto: "Espera el permiso", fondo: AVISO.fondo, color: AVISO.texto },
  por_vencer: { texto: "Vence pronto", fondo: AVISO.fondo, color: AVISO.texto },
  habilitada: { texto: "Habilitada", fondo: "var(--tb-verde-bg)", color: "var(--tb-verde-text)" },
  no_aplica: { texto: "No aplica", fondo: "var(--tb-verde-bg)", color: "var(--tb-verde-text)" },
  pospuesta: { texto: "Pospuesta", fondo: "var(--muted)", color: "var(--foreground)" },
};

export function TarjetaEstado({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const hoy = hoyISO();
  const direccion = direccionDeObra(ficha);
  const triage = useTriage();
  const declarar = useDeclararHabilitacion(otId);
  const marcar = useMarcarTodos(otId);
  const consulta = useRegistrarConsulta(otId);
  const gestion = useRegistrarGestion(otId);
  const posponer = usePosponer();
  const [dialogo, setDialogo] = useState<"excepcion" | "revertir" | "posponer" | null>(null);
  const [motivo, setMotivo] = useState("");

  const primeraJornada = ficha.jornadas.find((j) => j.fecha >= hoy) ?? null;
  const espera = esperaDe({
    triage: ficha.triage,
    habilitada: !!ficha.habilitadaEl,
    creadaEl: ficha.creadaEl,
    triadaEl: ficha.triadaEl,
    vueltaEl: ficha.vueltaEl,
    fechaConsulta: ficha.fechaConsulta,
    requisitos: ficha.requisitos,
  }, hoy);
  const datos = {
    triage: ficha.triage,
    habilitadaEl: ficha.habilitadaEl,
    alerta: ficha.alerta,
    espera,
    vencimiento: ficha.vencimiento,
    modalidad: ficha.permiso.modalidad,
    tramite: ficha.permiso.tramite,
    tipo: ficha.tipo,
    primeraJornada: primeraJornada?.fecha ?? null,
    fechaProgramada: ficha.fechaProgramada,
  };
  const estado: Estado =
    ficha.triage === "no_aplica" ? { tipo: "no_aplica" }
    : ficha.habilitadaEl ? { tipo: "habilitada" }
    : ficha.pospuestaHasta ? { tipo: "pospuesta" }
    : { tipo: "grupo", grupo: grupoDe(datos, hoy) ?? "para_hacer" };
  const clavePildora = estado.tipo === "grupo" ? estado.grupo : estado.tipo;
  const pildora = PILDORA[clavePildora];

  const est = estadoDeHabilitacion(ficha.requisitos);
  const reqs = ficha.requisitos.map((r) => ({ id: r.id, nombre: r.nombre, estado: r.estado }));
  const paso = pasoDe(
    {
      espera, reqs, reclamos: ficha.reclamos, tramite: ficha.permiso.tramite,
      expedienteNro: ficha.permiso.expedienteNro, primeraJornada: datos.primeraJornada,
      fechaProgramada: ficha.fechaProgramada, vencimiento: ficha.vencimiento, habilitadaEl: ficha.habilitadaEl,
    },
    estado.tipo === "grupo" ? estado.grupo : "para_hacer",
    hoy,
  );
  const arma = seArma({ primeraJornada: datos.primeraJornada, fechaProgramada: ficha.fechaProgramada, habilitada: !!ficha.habilitadaEl }, hoy);
  const friccion = friccionDelTablero(ficha.permiso, ficha.tipo, hoy);
  const enAplica = ficha.triage === "aplica" && !ficha.habilitadaEl;

  // ── Qué dice ──
  let titulo: string;
  let detalle: string | null = null;
  if (estado.tipo === "no_aplica") {
    titulo = "No pide papeles";
    detalle = "Quedó habilitada: no hay documentación que tramitar.";
  } else if (estado.tipo === "habilitada") {
    titulo = `Habilitada el ${fecha(ficha.habilitadaEl!)}${ficha.habilitadaPor ? ` por ${ficha.habilitadaPor}` : ""}`;
    detalle = ficha.habilitadaMotivo
      ? `Por excepción: ${ficha.habilitadaMotivo}`
      : "Operaciones ya la puede programar.";
  } else if (estado.tipo === "pospuesta") {
    titulo = `Pospuesta hasta el ${larga(ficha.pospuestaHasta!)}`;
    detalle = [
      "Vuelve sola a la cola, o antes si Operaciones la planifica.",
      ficha.pospuestaMotivo,
      ficha.pospuestaPor ? `Pospuesta por ${ficha.pospuestaPor}.` : null,
    ].filter(Boolean).join(" ");
  } else if (estado.grupo === "nuevas" || espera?.clave === "triar") {
    titulo = "¿Esta obra pide papeles?";
    detalle = "Si no pide nada, No aplica la deja habilitada en el acto.";
  } else if (estado.grupo === "permiso") {
    const vuelve = vueltaPorPermiso(datos);
    titulo = "Espera el permiso municipal";
    detalle = [
      ficha.permiso.tramite === "presentado"
        ? `Presentado${ficha.permiso.expedienteFecha ? ` el ${fecha(ficha.permiso.expedienteFecha)}` : ""}${ficha.permiso.expedienteNro ? ` · ${ficha.permiso.expedienteNro.replace(/- -GCABA-SSGOU$/, "")}` : ""}.`
        : "Todavía no se presentó.",
      `Vuelve a "Para hacer" cuando salga${vuelve ? `, o el ${larga(vuelve)}` : ""}: los papeles se mandan cerca de la obra, para que no se venzan.`,
    ].join(" ");
  } else {
    titulo = paso.titulo;
    detalle = paso.detalle ? mayuscula(paso.detalle) : null;
  }

  const tablero =
    friccion?.tipo === "bloqueo"
      ? { tono: "bloqueo" as const, texto: "El tablero no deja confirmar la jornada: el cliente pidió esperar el permiso emitido." }
      : friccion?.tipo === "falta_expediente"
        ? { tono: "aviso" as const, texto: "El tablero deja confirmar pidiendo un motivo: falta el número de expediente." }
        : { tono: "ok" as const, texto: ficha.habilitadaEl || ficha.triage === "no_aplica"
            ? "El tablero deja confirmar."
            : "El tablero deja confirmar igual: la documentación no frena." };
  const IconoTablero = tablero.tono === "bloqueo" ? CircleX : tablero.tono === "aviso" ? TriangleAlert : CircleCheck;
  const colorTablero = tablero.tono === "bloqueo" ? PELIGRO : tablero.tono === "aviso" ? AVISO.icono : OK;

  // ── Acciones ──
  function triar(decision: "aplica" | "no_aplica" | "pendiente", deshacer: "aplica" | "no_aplica" | "pendiente") {
    triage.mutate(
      { otIds: [otId], decision },
      {
        onSuccess: () =>
          toast.success(
            decision === "aplica" ? "Aplica · en la cola" : decision === "no_aplica" ? "No aplica · quedó habilitada" : "De vuelta en Nuevas",
            { action: { label: "Deshacer", onClick: () => triage.mutate({ otIds: [otId], decision: deshacer }) } },
          ),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo cambiar"),
      },
    );
  }

  function mover(todos: "enviado" | "aprobado") {
    marcar.mutate(todos, {
      onSuccess: (r) => toast.success(`${r.movidos} ${todos === "enviado" ? "marcado" : "aprobado"}${r.movidos === 1 ? "" : "s"}`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
    });
  }

  function habilitar(conMotivo: string | null) {
    declarar.mutate(
      { habilitar: true, faltan: est.faltan || (est.total === 0 ? 1 : 0), motivo: conMotivo },
      {
        onSuccess: () => {
          toast.success("Obra habilitada · Operaciones recibió el aviso");
          setDialogo(null);
          setMotivo("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo habilitar"),
      },
    );
  }

  function revertir() {
    if (!motivo.trim()) return;
    declarar.mutate(
      { habilitar: false, faltan: 0, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success("Se revirtió la habilitación · Operaciones recibió el aviso");
          setDialogo(null);
          setMotivo("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo revertir"),
      },
    );
  }

  function reclamar() {
    gestion.mutate(
      { tipo: "reclamo", detalle: `${ficha.reclamos + 1}º reclamo al cliente` },
      {
        onSuccess: () => toast.success(`${ficha.reclamos + 1}º reclamo registrado · no manda mail, guarda la fecha`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar"),
      },
    );
  }

  const ocupado = declarar.isPending || marcar.isPending || triage.isPending;
  const pendientes = ficha.requisitos.filter((r) => r.estado === "pendiente").length;
  const enviados = ficha.requisitos.filter((r) => r.estado === "enviado").length;

  let botones: React.ReactNode = null;
  if (estado.tipo === "no_aplica") {
    botones = (
      <Button size="sm" variant="outline" disabled={ocupado} onClick={() => triar("pendiente", "no_aplica")}>
        <Undo2 className="mr-1 h-3.5 w-3.5" />
        Volver a la cola
      </Button>
    );
  } else if (estado.tipo === "habilitada") {
    botones = (
      <Button size="sm" variant="outline" data-tour="boton-revertir" disabled={ocupado} onClick={() => setDialogo("revertir")}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Revertir…
      </Button>
    );
  } else if (estado.tipo === "pospuesta") {
    botones = (
      <>
        <Button size="sm" variant="ghost" onClick={() => setDialogo("posponer")}>
          Cambiar fecha
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={posponer.isPending}
          onClick={() =>
            posponer.mutate(
              { otId, hasta: null },
              {
                onSuccess: () => toast.success("De vuelta en la cola"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo reactivar"),
              },
            )
          }
        >
          <Undo2 className="mr-1 h-3.5 w-3.5" />
          Reactivar
        </Button>
      </>
    );
  } else if (ficha.triage === null) {
    botones = (
      <span className="flex gap-2" data-tour="barra-triage">
        <Button size="sm" disabled={ocupado} onClick={() => triar("aplica", "pendiente")}>
          Aplica
        </Button>
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => triar("no_aplica", "pendiente")}>
          No aplica
        </Button>
      </span>
    );
  } else if (estado.grupo !== "permiso" && espera) {
    if (espera.clave === "habilitar") {
      botones = (
        <Button
          size="sm"
          data-tour="boton-habilitar"
          disabled={ocupado}
          style={{ backgroundColor: OK_SOLIDO, color: "white" }}
          onClick={() => habilitar(null)}
        >
          {declarar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="mr-1.5 h-4 w-4" />}
          Habilitar obra
        </Button>
      );
    } else if (espera.clave === "mandar") {
      botones = (
        <Button size="sm" disabled={ocupado} onClick={() => mover("enviado")}>
          {pendientes === 1 ? "Marcar enviado" : `Marcar ${pendientes} enviados`}
        </Button>
      );
    } else if (espera.clave === "cliente_revisa") {
      botones = (
        <>
          <Button size="sm" variant="ghost" disabled={gestion.isPending} onClick={reclamar}>
            Reclamar{ficha.reclamos > 0 ? ` · ${ficha.reclamos + 1}º` : ""}
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => mover("aprobado")}>
            {enviados === 1 ? "Aprobó" : `Aprobar ${enviados}`}
          </Button>
        </>
      );
    } else if (espera.clave === "cliente_pide") {
      botones = (
        <Button size="sm" variant="ghost" disabled={gestion.isPending} onClick={reclamar}>
          Reclamar{ficha.reclamos > 0 ? ` · ${ficha.reclamos + 1}º` : ""}
        </Button>
      );
    }
  }

  // ── Los pasos, con fecha ──
  const fechaEnvio = ficha.requisitos.map((r) => r.fecha_envio).filter(Boolean).sort()[0] ?? null;
  const aprobadaEl = est.listo
    ? ficha.requisitos.map((r) => r.fecha_resolucion).filter(Boolean).sort().pop() ?? null
    : null;
  const pasos = [
    { texto: "Aplica", fecha: ficha.triadaEl, hecho: ficha.triage === "aplica" },
    { texto: "Papeles mandados", fecha: fechaEnvio, hecho: !!fechaEnvio && pendientes === 0 },
    { texto: "Aprobados", fecha: aprobadaEl, hecho: est.listo },
    { texto: "Habilitada", fecha: ficha.habilitadaEl, hecho: !!ficha.habilitadaEl },
  ];
  const ahora = pasos.findIndex((p) => !p.hecho);

  return (
    // data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts)
    <section
      data-tour="estado"
      className="space-y-3 rounded-md border border-l-4 bg-card px-4 py-3"
      style={{ borderLeftColor: clavePildora === "urgentes" ? PELIGRO : clavePildora === "habilitada" || clavePildora === "no_aplica" ? OK : "var(--primary)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[70ch] space-y-1">
          <span
            className="inline-block rounded px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide uppercase"
            style={{ backgroundColor: pildora.fondo, color: pildora.color }}
          >
            {pildora.texto}
          </span>
          <h2 className="text-lg font-bold">{titulo}</h2>
          {detalle && (
            <p
              className="text-[13px] text-muted-foreground"
              // Los días pasados de umbral en rojo, igual que en la fila de la bandeja.
              style={estado.tipo === "grupo" && estado.grupo !== "permiso" && paso.rojo ? { color: PELIGRO, fontWeight: 600 } : undefined}
            >
              {detalle}
            </p>
          )}
          <p className="text-[13px]">
            <span className="font-semibold" style={arma.rojo ? { color: PELIGRO } : undefined}>
              {arma.fecha === "Sin fecha" ? "Sin fecha de armado" : `Se arma el ${arma.fecha}`}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {arma.detalle}
              {primeraJornada?.cuadrilla && ` · ${primeraJornada.cuadrilla}, ${primeraJornada.estado}`}
            </span>
          </p>
          <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
            <IconoTablero className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: colorTablero }} />
            {tablero.texto}
          </p>
          {ficha.trabajo.syhPresencial === true && (
            <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
              <HardHat className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: AVISO.icono }} />
              Llevamos técnico de Seguridad e Higiene: su documentación es un papel más, abajo.
            </p>
          )}
          {ficha.syncEstado === "error" && (
            <p className="text-[12px]" style={{ color: AVISO.texto }}>
              El estado no pudo actualizarse en Odoo ({ficha.syncError}). El tablero puede estar
              mostrando un semáforo viejo: reintentá desde la bandeja.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {botones}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" data-tour="mas-acciones" />}>
              Más
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {enAplica && !ficha.pospuestaHasta && estado.tipo === "grupo" && estado.grupo !== "permiso" && (
                <DropdownMenuItem onClick={() => setDialogo("posponer")}>Posponer…</DropdownMenuItem>
              )}
              {enAplica && !est.listo && (
                <DropdownMenuItem onClick={() => setDialogo("excepcion")}>
                  Habilitar sin todos los papeles…
                </DropdownMenuItem>
              )}
              {/* Con los papeles aprobados y esperando el permiso, el botón no está en la
                  tarjeta —lo normal es esperar—, pero se puede: el tablero igual no deja
                  confirmar hasta que salga. */}
              {enAplica && est.listo && estado.tipo === "grupo" && estado.grupo === "permiso" && (
                <DropdownMenuItem onClick={() => habilitar(null)}>Habilitar ya, sin esperar el permiso</DropdownMenuItem>
              )}
              {enAplica && (
                <DropdownMenuItem onClick={reclamar}>
                  Registrar un reclamo al cliente{ficha.reclamos > 0 ? ` (${ficha.reclamos + 1}º)` : ""}
                </DropdownMenuItem>
              )}
              {enAplica && !ficha.fechaConsulta && (
                <DropdownMenuItem
                  data-tour="boton-consulta"
                  onClick={() =>
                    consulta.mutate(undefined, {
                      onSuccess: () => toast.success("Consulta registrada · mientras no salga ningún papel, la pelota es del cliente"),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar"),
                    })
                  }
                >
                  Registrar que le consulté qué pide
                </DropdownMenuItem>
              )}
              {enAplica && (
                <DropdownMenuItem onClick={() => triar("no_aplica", "aplica")}>Marcar que no aplica</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<a href={ficha.url} target="_blank" rel="noreferrer" />} className="gap-2">
                Ver la OT en Odoo
                <ExternalLink className="ml-auto h-3.5 w-3.5" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Los pasos con fecha. Salen de los requisitos y de las decisiones, no de las etapas
          de Odoo: "consultado" casi nunca se registra, y la etapa lo pintaba cumplido igual. */}
      {ficha.triage === "aplica" && (
        <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t pt-2.5 text-[12px] text-muted-foreground">
          {pasos.map((p, i) => (
            <li key={p.texto} className="flex items-center gap-2.5">
              <span className={`flex items-center gap-1.5 ${p.hecho || i === ahora ? "text-foreground" : ""} ${i === ahora ? "font-semibold" : ""}`}>
                <span
                  className="h-2 w-2 rounded-full border"
                  style={p.hecho ? { backgroundColor: OK, borderColor: OK } : i === ahora ? { borderColor: "var(--primary)" } : undefined}
                />
                {p.texto}
                {p.hecho && p.fecha && <span className="font-normal text-muted-foreground">· {fecha(p.fecha)}</span>}
              </span>
              {i < pasos.length - 1 && <span className="h-px w-4 bg-border" />}
            </li>
          ))}
        </ol>
      )}

      {/* ── Diálogos ── */}
      <Dialog open={dialogo === "excepcion"} onOpenChange={(abrir) => !abrir && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Habilitar sin todos los papeles?</DialogTitle>
            <DialogDescription>
              {est.motivo} Queda registrado con tu nombre y el motivo, y Operaciones recibe el
              aviso de que ya se puede programar.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-[12px] font-medium">
            ¿Por qué se habilita igual?
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: el cliente autorizó por teléfono; manda la nómina el lunes"
              rows={2}
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!motivo.trim() || declarar.isPending}
              style={{ backgroundColor: OK_SOLIDO, color: "white" }}
              onClick={() => habilitar(motivo.trim())}
            >
              Habilitar igual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "revertir"} onOpenChange={(abrir) => !abrir && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Revertir la habilitación de {direccion}?</DialogTitle>
            <DialogDescription>
              Vuelve a la cola sin habilitar y Operaciones recibe un aviso urgente con este
              motivo. Si ya tiene jornadas planificadas, siguen en el tablero: lo decide
              Operaciones. Los papeles y el historial no se tocan.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-[12px] font-medium">
            Motivo (lo lee Operaciones)
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: lleva permiso y todavía no salió"
              rows={2}
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={revertir} disabled={declarar.isPending || !motivo.trim()}>
              Revertir y avisar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogoPosponer
        obra={
          dialogo === "posponer"
            ? {
                otId,
                direccion,
                fechaProgramada: ficha.fechaProgramada,
                primeraJornada: primeraJornada?.fecha ?? null,
                pospuestaHasta: ficha.pospuestaHasta,
              }
            : null
        }
        onCerrar={() => setDialogo(null)}
      />
    </section>
  );
}

function mayuscula(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
