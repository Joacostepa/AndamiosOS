"use client";

import { useState } from "react";
import { Copy, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useAccionPresentacion, useCorregirDueno, useDescarte, useEncomienda, useGenerarDocumentos, usePedirEndosoTramite,
  usePresentacion, useRecordatorioCliente, useReabrirDocumentos, useReenviarLink, useVinculoVenta,
} from "@/hooks/use-permisos-via-publica";
import { diaCorto, horaCorta, type ClaveAccion } from "@/lib/permisos-via-publica/estado";
import type { FichaPermiso } from "@/lib/permisos-via-publica/ficha";
import type { AccionConPersona } from "@/lib/permisos-via-publica/lista";
import { textoRecordatorio } from "@/lib/permisos-via-publica/mensajes";
import { NOMBRE_DOCUMENTO, clavesFirmables, cuitValido, formatoCuit, nombreSospechoso } from "@/lib/permisos-via-publica/tipos";
import { DatosQueSalen, Dialogo } from "../dialogo";
import { BOTON } from "../textos";
import { Chip } from "../ui";

// Los botones de lo que le toca a la oficina, cada uno con su diálogo (rediseño 09/10, § 4.4):
//   0 · inocuas: copiar, ver. Sin freno.
//   1 · internas: generar informe, dejar de seguir. Con toast.
//   2 · salen afuera: endoso, recordar al cliente, confirmar venta. Diálogo con a quién y qué.
//   3 · no se deshacen: armar la encomienda (el robot paga), presentar, empezar de cero. Diálogo
//       rojo con los datos exactos, foco en Cancelar, y sólo para gestores o administradores.

const IRREVERSIBLE: ClaveAccion[] = ["armar_encomienda", "volver_a_armar", "revisar_cpau", "reanudar_cierre", "presentar", "volver_a_presentar", "empezar_de_cero", "seguir_borrador"];
const err = (e: unknown, def: string) => toast.error(e instanceof Error ? e.message : def);
const nombreDoc = (c: string) => (NOMBRE_DOCUMENTO[c] ?? c).replace(/\s*\(.*\)$/, "");

/** El texto para mandarle al cliente por WhatsApp, con lo que falta y lo que hay que corregir. */
export function mensajeCliente(f: FichaPermiso): string {
  const cli = f.documentos.filter((d) => d.origen === "cliente");
  return textoRecordatorio({
    cliente: f.tramite.cliente_nombre,
    direccion: f.tramite.direccion,
    sinDueno: !f.tramite.titular_cargado_at,
    faltan: cli.filter((d) => d.estado === "falta" || d.estado === "pedido").map((d) => ({ nombre: nombreDoc(d.clave) })),
    aCorregir: cli.filter((d) => d.estado === "observado").map((d) => ({ nombre: nombreDoc(d.clave), motivo: d.observacion })),
    link: f.linkCliente,
  });
}

export function copiar(texto: string | null, ok: string) {
  if (!texto) return toast.error("No hay nada para copiar");
  navigator.clipboard.writeText(texto).then(() => toast.success(ok), () => toast.error("No se pudo copiar"));
}

export function BotonAccion({ accion, ficha, principal = false, className }: { accion: AccionConPersona; ficha: FichaPermiso; principal?: boolean; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const t = ficha.tramite;
  const prueba = t.es_prueba;
  const bloqueado = IRREVERSIBLE.includes(accion.clave) && !prueba && !ficha.yo.puedeIrreversible;
  const sinEditar = !ficha.yo.puedeEditar;

  // Las inocuas no abren diálogo.
  if (accion.clave === "copiar_link") {
    return (
      <Button size="sm" variant={principal ? "default" : "outline"} className={cn("max-sm:h-10", className)} onClick={() => copiar(ficha.linkCliente, "Link copiado: pegalo en WhatsApp")}>
        <Copy className="size-4" /> Copiar el link
      </Button>
    );
  }
  if (accion.clave === "ver_encomienda" || accion.clave === "revisar_confirmar") {
    return (
      <Button size="sm" variant={principal ? "default" : "outline"} className={cn("max-sm:h-10", className)} onClick={() => document.getElementById("robot")?.scrollIntoView({ behavior: "smooth" })}>
        {BOTON[accion.clave]}
      </Button>
    );
  }

  const etiqueta = prueba && ["presentar", "volver_a_presentar"].includes(accion.clave) ? "Probar en TAD (sin presentar)" : BOTON[accion.clave];
  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button
          size="sm"
          variant={principal ? "default" : "outline"}
          className={cn("max-sm:h-10", className)}
          disabled={bloqueado || sinEditar}
          onClick={() => setAbierto(true)}
        >
          {etiqueta}…
        </Button>
        {bloqueado && <span className="text-[12px] text-muted-foreground">Lo hace un gestor o un administrador.</span>}
      </div>
      {abierto && <DialogoAccion accion={accion} ficha={ficha} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function DialogoAccion({ accion, ficha, onCerrar }: { accion: AccionConPersona; ficha: FichaPermiso; onCerrar: () => void }) {
  const id = ficha.tramite.id;
  switch (accion.clave) {
    case "perseguir_cliente":
      return <DialogoRecordar ficha={ficha} onCerrar={onCerrar} />;
    case "revisar_dueno":
      return <DialogoDueno ficha={ficha} onCerrar={onCerrar} mandarEndoso />;
    case "pedir_endoso":
    case "volver_a_pedir_endoso":
      return <DialogoEndoso ficha={ficha} onCerrar={onCerrar} otraVez={accion.clave === "volver_a_pedir_endoso"} />;
    case "generar_documentos":
      return <DialogoGenerar tramiteId={id} onCerrar={onCerrar} />;
    case "armar_encomienda":
    case "volver_a_armar":
    case "revisar_cpau":
      return <DialogoEncomienda ficha={ficha} onCerrar={onCerrar} revisarAntes={accion.clave === "revisar_cpau"} />;
    case "reanudar_cierre":
      return <DialogoReanudar ficha={ficha} onCerrar={onCerrar} />;
    case "presentar":
    case "volver_a_presentar":
    case "seguir_borrador":
      return <DialogoPresentar ficha={ficha} onCerrar={onCerrar} desdeBorrador={accion.clave === "seguir_borrador"} />;
    case "empezar_de_cero":
      return <DialogoEmpezarDeCero ficha={ficha} onCerrar={onCerrar} />;
    case "confirmar_venta":
      return <DialogoConfirmarVenta ficha={ficha} onCerrar={onCerrar} />;
    case "subsanar":
      return <DialogoSubsanar ficha={ficha} onCerrar={onCerrar} />;
    case "ver_archivado":
    case "decidir_expediente":
      return <DialogoDejarDeSeguir expedienteId={ficha.expediente?.id ?? null} archivado={accion.clave === "ver_archivado"} onCerrar={onCerrar} />;
    default:
      return null;
  }
}

/** Nivel 2: recordarle al cliente por mail, o copiar el mensaje para WhatsApp y anotarlo. */
function DialogoRecordar({ ficha, onCerrar }: { ficha: FichaPermiso; onCerrar: () => void }) {
  const recordar = useRecordatorioCliente(ficha.tramite.id);
  const t = ficha.tramite;
  const mensaje = mensajeCliente(ficha);
  const conMail = !!t.cliente_email;
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      etiqueta={{ texto: "Sale un mail afuera", tono: "marcha" }}
      titulo={`¿Recordarle al cliente lo que falta de ${t.direccion}?`}
      texto={conMail ? `Le sale un mail a ${t.cliente_email}, con copia a la vendedora y a quien gestiona. O copiá el mensaje y mandalo por WhatsApp.` : "El cliente no tiene mail en Odoo: copiá el mensaje y mandalo por WhatsApp."}
      confirmar={conMail ? "Mandar el mail" : "Ya le avisé por WhatsApp"}
      cargando={recordar.isPending}
      onConfirmar={() =>
        recordar.mutate(conMail ? "mail" : "whatsapp", {
          onSuccess: (r) => {
            if (r.enviado) toast.success(conMail ? `Le recordamos al cliente (${r.para})` : "Anotado: se le avisó por WhatsApp");
            else toast.error(`No salió: ${r.motivo}`);
            if (r.enviado) onCerrar();
          },
          onError: (e) => err(e, "No se pudo"),
        })
      }
    >
      <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-[13px]">{mensaje}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copiar(mensaje, "Mensaje copiado: pegalo en WhatsApp")}>
          <MessageCircle className="size-4" /> Copiar mensaje para WhatsApp
        </Button>
        {conMail && (
          <Button
            size="sm"
            variant="ghost"
            disabled={recordar.isPending}
            onClick={() => recordar.mutate("whatsapp", { onSuccess: () => { toast.success("Anotado: se le avisó por WhatsApp"); onCerrar(); }, onError: (e) => err(e, "No se pudo") })}
          >
            Ya le avisé por WhatsApp
          </Button>
        )}
      </div>
    </Dialogo>
  );
}

/** Corregir el nombre del dueño (y el CUIT) y, si se pide, mandar el endoso en el mismo paso. */
export function DialogoDueno({ ficha, onCerrar, mandarEndoso }: { ficha: FichaPermiso; onCerrar: () => void; mandarEndoso: boolean }) {
  const t = ficha.tramite;
  const corregir = useCorregirDueno(t.id);
  // Sugerencia: sin comillas. Lo demás ("nú3 meros") lo corrige una persona.
  const [nombre, setNombre] = useState((t.titular_nombre ?? "").replace(/["“”«»]/g, "").replace(/\s+/g, " ").trim());
  const [cuit, setCuit] = useState(t.titular_cuit ? formatoCuit(t.titular_cuit) : "");
  const [admNombre, setAdmNombre] = useState(t.administrador_nombre ?? "");
  const [admCuit, setAdmCuit] = useState(t.administrador_cuit ? formatoCuit(t.administrador_cuit) : "");
  const [endoso, setEndoso] = useState(mandarEndoso);
  const raro = nombreSospechoso(nombre);
  const consorcio = t.tipo_dueno === "consorcio";
  const okCuit = cuitValido(cuit);
  const okAdm = !consorcio || !admCuit || cuitValido(admCuit);
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      etiqueta={endoso ? { texto: "Sale un mail afuera", tono: "marcha" } : undefined}
      titulo={endoso ? `¿Corregir el dueño y pedirle el endoso a Segucom?` : "Corregir el dueño del lote"}
      texto={endoso ? "Así le llega a Segucom como coasegurado y al CPAU como propietario. El mail a Segucom sale en unos segundos." : "Así le llega a Segucom como coasegurado y al CPAU como propietario."}
      confirmar={endoso ? "Guardar y mandar a Segucom" : "Guardar"}
      deshabilitado={nombre.trim().length < 3 || !okCuit || !okAdm || (endoso && !!raro)}
      cargando={corregir.isPending}
      onConfirmar={() =>
        corregir.mutate(
          { nombre: nombre.trim(), cuit, administradorNombre: consorcio ? admNombre.trim() || null : null, administradorCuit: consorcio ? admCuit || null : null, mandarEndoso: endoso },
          { onSuccess: (r) => { toast.success(r.endoso ? "Dueño corregido y endoso pedido a Segucom" : "Dueño corregido"); onCerrar(); }, onError: (e) => err(e, "No se pudo guardar") },
        )
      }
    >
      <label className="grid gap-1">
        <span className="text-[12px] text-muted-foreground">Dueño del lote</span>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        {raro && <span className="text-[12px] text-amber-800 dark:text-amber-300">El nombre {raro}.</span>}
      </label>
      <label className="grid gap-1">
        <span className="text-[12px] text-muted-foreground">CUIT</span>
        <Input value={cuit} onChange={(e) => setCuit(e.target.value)} inputMode="numeric" className="w-44" />
        {cuit && !okCuit && <span className="text-[12px] text-red-700 dark:text-red-300">Ese CUIT no es válido: revisá los números.</span>}
      </label>
      {consorcio && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1">
            <span className="text-[12px] text-muted-foreground">Administrador (también coasegurado)</span>
            <Input value={admNombre} onChange={(e) => setAdmNombre(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-[12px] text-muted-foreground">CUIT del administrador</span>
            <Input value={admCuit} onChange={(e) => setAdmCuit(e.target.value)} inputMode="numeric" className="w-44" />
          </label>
        </div>
      )}
      {!ficha.documentos.some((d) => d.clave === "poliza_rc") && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="size-4" checked={endoso} onChange={(e) => setEndoso(e.target.checked)} />
          Pedirle el endoso a Segucom en el mismo paso
        </label>
      )}
    </Dialogo>
  );
}

function datosEndoso(f: FichaPermiso) {
  const t = f.tramite;
  const raro = nombreSospechoso(t.titular_nombre);
  return [
    {
      etiqueta: "Coasegurado (dueño del lote)",
      valor: `${t.titular_nombre ?? "—"} · CUIT ${formatoCuit(t.titular_cuit ?? "")}`,
      aviso: raro ? <Chip tono="aviso">El nombre {raro}</Chip> : undefined,
    },
    ...(t.administrador_cuit ? [{ etiqueta: "Administrador (también coasegurado)", valor: `${t.administrador_nombre} · CUIT ${formatoCuit(t.administrador_cuit)}` }] : []),
    { etiqueta: "Cláusula", valor: "No repetición a favor del GCBA" },
    { etiqueta: "Permiso hasta", valor: t.permiso_hasta ? diaCorto(t.permiso_hasta) + `/${t.permiso_hasta.slice(0, 4)}` : "—" },
  ];
}

/** Nivel 2: el pedido a Segucom, con los datos que salen. */
function DialogoEndoso({ ficha, onCerrar, otraVez }: { ficha: FichaPermiso; onCerrar: () => void; otraVez: boolean }) {
  const pedir = usePedirEndosoTramite(ficha.tramite.id);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const raro = nombreSospechoso(ficha.tramite.titular_nombre);
  if (corrigiendo) return <DialogoDueno ficha={ficha} onCerrar={onCerrar} mandarEndoso />;
  const pol = ficha.documentos.find((d) => d.clave === "poliza_rc");
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      etiqueta={{ texto: "Sale un mail afuera", tono: "marcha" }}
      titulo={`¿${otraVez ? "Volver a pedirle" : "Pedirle"} el endoso a Segucom para ${ficha.tramite.direccion}?`}
      texto={`Sale un mail a Segucom${ficha.gestor || ficha.vendedora ? `, con copia a ${[ficha.gestor?.corto, ficha.vendedora?.corto].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" y ")}` : ""}.${otraVez && pol?.pedido_at ? ` Ya se pidió el ${diaCorto(pol.pedido_at)}.` : ""} Va así:`}
      confirmar="Mandar a Segucom"
      deshabilitado={!!raro}
      cargando={pedir.isPending}
      onConfirmar={() => pedir.mutate(undefined, { onSuccess: () => { toast.success("Endoso pedido: el mail a Segucom sale en unos segundos"); onCerrar(); }, onError: (e) => err(e, "No se pudo pedir") })}
    >
      <DatosQueSalen filas={datosEndoso(ficha)} />
      {raro && (
        <Button size="sm" variant="outline" onClick={() => setCorrigiendo(true)}>
          Corregir el nombre primero
        </Button>
      )}
    </Dialogo>
  );
}

function DialogoGenerar({ tramiteId, onCerrar }: { tramiteId: string; onCerrar: () => void }) {
  const generar = useGenerarDocumentos(tramiteId);
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      titulo="Generar el informe técnico y el croquis"
      texto="Se arman con lo que dice la venta en «Trabajo a ejecutar» y la plancheta del catastro de la Ciudad. Puede tardar un minuto. No sale nada hacia afuera."
      confirmar="Generar"
      cargando={generar.isPending}
      onConfirmar={() =>
        generar.mutate(null, {
          onSuccess: (r) => {
            if (r.plancheta) toast.success(`Informe técnico y croquis generados (parcela ${r.smp})`);
            else toast.warning("Se generaron, pero sin el plano de la manzana: no está en el catastro. Revisá la dirección.");
            onCerrar();
          },
          onError: (e) => err(e, "No se pudieron generar"),
        })
      }
    />
  );
}

/** Nivel 3: la encomienda. Un solo botón y el robot hace todo, también el pago (JS, 09/10). */
function DialogoEncomienda({ ficha, onCerrar, revisarAntes }: { ficha: FichaPermiso; onCerrar: () => void; revisarAntes: boolean }) {
  const encomienda = useEncomienda(ficha.tramite.id);
  const [revise, setRevise] = useState(!revisarAntes);
  const informe = ficha.documentos.find((d) => d.clave === "informe_tecnico")?.revision?.leido as { tipo?: string; base?: number; alto?: number; direccion?: string } | undefined;
  const t = ficha.tramite;
  const medidas = informe?.tipo === "pantalla" ? `Pantalla de ${informe.base} m lineales` : informe?.base ? `${informe.base} × ${informe.alto} m` : "Del informe técnico";
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      peligroso
      etiqueta={{ texto: "No se deshace", tono: "bloqueo" }}
      titulo={`¿Armar la encomienda del CPAU de ${t.direccion}?`}
      texto={t.es_prueba
        ? "Prueba: el robot la completa en el CPAU hasta Confirmar y nunca la finaliza."
        : "El robot hace todo solo: la carga y la finaliza en el CPAU a nombre de Hougassian, firma el registro, la paga con la tarjeta ($50.000) y la envía. Finalizada no se deshace, y armarla de nuevo es otro pago."}
      confirmar={revisarAntes ? "Volver a armarla" : "Armar la encomienda"}
      deshabilitado={!revise}
      cargando={encomienda.isPending}
      onConfirmar={() =>
        encomienda.mutate("pedir", {
          onSuccess: (r) => { toast.success(r.resultado === "ya_pedida" ? "Ya había una encomienda en curso" : "Encomienda pedida: el robot la toma en unos segundos"); onCerrar(); },
          onError: (e) => err(e, "No se pudo pedir"),
        })
      }
    >
      <DatosQueSalen
        filas={[
          { etiqueta: "Propietario", valor: `${t.titular_nombre ?? "—"} · CUIT ${formatoCuit(t.titular_cuit ?? "")}` },
          { etiqueta: "Obra", valor: informe?.direccion ?? t.direccion },
          { etiqueta: "Medidas", valor: medidas },
        ]}
      />
      {revisarAntes && (
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4" checked={revise} onChange={(e) => setRevise(e.target.checked)} />
          Ya revisé el Histórico del CPAU: la encomienda anterior no quedó registrada ni pagada.
        </label>
      )}
    </Dialogo>
  );
}

function DialogoReanudar({ ficha, onCerrar }: { ficha: FichaPermiso; onCerrar: () => void }) {
  const encomienda = useEncomienda(ficha.tramite.id);
  const etapa = ficha.encomienda?.resultado?.cierre?.etapa;
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      peligroso
      titulo="¿Reanudar el cierre de la encomienda?"
      texto={`El robot sigue desde «${etapa ?? "donde quedó"}». No repite un pago ni un envío que ya intentó: si el error habla de eso, mirá el CPAU antes.`}
      confirmar={`Reanudar${etapa ? ` desde «${etapa}»` : ""}`}
      cargando={encomienda.isPending}
      onConfirmar={() => encomienda.mutate("reanudar", { onSuccess: () => { toast.success("Reanudado: el robot sigue en unos segundos"); onCerrar(); }, onError: (e) => err(e, "No se pudo") })}
    />
  );
}

/** Nivel 3: presentar en TAD. Fuera de horario queda programada para las 19. */
function DialogoPresentar({ ficha, onCerrar, desdeBorrador }: { ficha: FichaPermiso; onCerrar: () => void; desdeBorrador: boolean }) {
  const presentar = usePresentacion(ficha.tramite.id);
  const t = ficha.tramite;
  const casilleros = ficha.presentacion.estado.casilleros;
  const listos = casilleros.filter((c) => c.ok).length;
  const ahora = new Date();
  const hora = Number(ahora.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }));
  const enHorario = hora >= 19 || hora < 7;
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      peligroso={!t.es_prueba}
      etiqueta={t.es_prueba ? undefined : { texto: "Genera documentos oficiales", tono: "bloqueo" }}
      titulo={t.es_prueba ? "¿Probar el formulario de TAD?" : `¿Presentar el permiso de ${t.direccion} en TAD?`}
      texto={t.es_prueba
        ? "El robot llena y guarda el formulario con esta obra, verifica la parcela y borra el borrador. No adjunta ni presenta."
        : `Es una declaración jurada de Emprendimientos y Estructuras. El robot llena el formulario y adjunta ${casilleros.length} casilleros: cada adjunto queda como un documento oficial, aunque la presentación no termine.${desdeBorrador && ficha.presentacion.borradorPendiente ? ` Sigue desde el borrador ${ficha.presentacion.borradorPendiente}.` : ""}${enHorario ? "" : " Son fuera de horario: queda programada para las 19:00 (de día TAD falla seguido)."}`}
      confirmar={t.es_prueba ? "Probar en TAD" : enHorario ? "Presentar en TAD" : "Programar para las 19:00"}
      cargando={presentar.isPending}
      onConfirmar={() =>
        presentar.mutate(undefined, {
          onSuccess: (x) => {
            toast.success(x.resultado === "ya_pedida" ? "Ya hay una presentación en curso" : x.programadaPara ? `Presentación programada para las ${horaCorta(x.programadaPara)}` : "Presentación pedida: el robot la toma en unos segundos");
            onCerrar();
          },
          onError: (e) => err(e, "No se pudo pedir"),
        })
      }
    >
      {!t.es_prueba && (
        <DatosQueSalen
          filas={[
            { etiqueta: "Obra", valor: t.direccion },
            { etiqueta: "Permiso hasta", valor: t.permiso_hasta ? `${diaCorto(t.permiso_hasta)}/${t.permiso_hasta.slice(0, 4)}` : "—" },
            { etiqueta: "Casilleros", valor: `${listos} de ${casilleros.length} listos` },
          ]}
        />
      )}
    </Dialogo>
  );
}

/** Nivel 3: empezar de cero en un paso (antes eran tres botones en tres estados). */
function DialogoEmpezarDeCero({ ficha, onCerrar }: { ficha: FichaPermiso; onCerrar: () => void }) {
  const accion = useAccionPresentacion(ficha.tramite.id);
  const borrador = ficha.presentacion.borradorPendiente ?? ficha.intentos[0]?.resultado?.borrador ?? null;
  const documentos = Math.max(0, ...ficha.intentos.filter((x) => x.resultado?.borrador === borrador).map((x) => x.resultado?.adjuntados ?? 0));
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      peligroso
      etiqueta={{ texto: "Genera documentos oficiales", tono: "bloqueo" }}
      titulo="¿Empezar la presentación de cero?"
      texto={`${borrador ? `El borrador ${borrador} no se pudo reabrir: TAD no muestra sus documentos.` : ""} Desde el 15/09, reabrir un borrador funcionó 0 de 8 veces.`}
      confirmar="Empezar de cero y presentar"
      cargando={accion.isPending}
      onConfirmar={() =>
        accion.mutate("empezar_de_cero", {
          onSuccess: (r) => { toast.success(r.programadaPara ? `Programada para las ${horaCorta(r.programadaPara)}: arma un borrador nuevo` : "El robot arma un borrador nuevo en unos segundos"); onCerrar(); },
          onError: (e) => err(e, "No se pudo"),
        })
      }
    >
      <ol className="list-decimal space-y-1 rounded-md bg-muted py-2.5 pl-8 pr-3 text-[13px]">
        <li>El robot deja de intentar con ese borrador.</li>
        <li>El borrador queda descartado{documentos ? `: sus ${documentos} documentos oficiales quedan sueltos` : ""} y pasa a «Para limpiar en TAD».</li>
        <li>El robot arma un borrador nuevo y vuelve a adjuntar todo: son documentos oficiales nuevos.</li>
      </ol>
    </Dialogo>
  );
}

/** Nivel 2: confirmar que el expediente es de esta venta (el robot escribe Odoo y la app no lo vuelve a presentar). */
function DialogoConfirmarVenta({ ficha, onCerrar }: { ficha: FichaPermiso; onCerrar: () => void }) {
  const e = ficha.expediente;
  const vinculo = useVinculoVenta(e?.id ?? "");
  if (!e) return null;
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      etiqueta={{ texto: "Escribe en Odoo", tono: "marcha" }}
      titulo={`¿EX-${e.numero} es de la venta ${ficha.venta?.nombre ?? e.odoo_venta_nombre ?? ""}?`}
      texto="El robot lo encontró por la dirección. Al confirmar, escribe el trámite en la venta de Odoo (y con eso el tablero sabe del permiso) y la app no lo vuelve a presentar."
      confirmar="Sí, es esta venta"
      cargando={vinculo.isPending}
      onConfirmar={() => vinculo.mutate({ accion: "confirmar" }, { onSuccess: () => { toast.success("Venta confirmada: el robot actualiza Odoo en unos segundos"); onCerrar(); }, onError: (x) => err(x, "No se pudo") })}
    >
      <DatosQueSalen
        filas={[
          { etiqueta: "Obra en TAD (carátula)", valor: e.direccion ?? "—" },
          { etiqueta: "Obra en Odoo", valor: ficha.venta?.direccion ?? "—" },
          { etiqueta: "Cliente de la venta", valor: ficha.venta?.cliente ?? e.cliente ?? "—" },
        ]}
      />
    </Dialogo>
  );
}

/** Nivel 2: subsanar los papeles del portal que observó el Gobierno. */
function DialogoSubsanar({ ficha, onCerrar }: { ficha: FichaPermiso; onCerrar: () => void }) {
  const reabrir = useReabrirDocumentos(ficha.tramite.id);
  const motivoGcba = ficha.expediente?.motivo_subsanacion ?? "";
  const cli = ficha.documentos.filter((d) => d.origen === "cliente");
  const firmables = ficha.tramite.tipo_dueno ? clavesFirmables(ficha.tramite.tipo_dueno) : [];
  // Preselección: lo que nombra el motivo ("ACTA Y NOTA DE SOLICITUD").
  const nombra = (c: string) =>
    (c === "acta_compromiso" && /\bACTA\b/i.test(motivoGcba)) || (/nota_/.test(c) && /\bNOTA\b/i.test(motivoGcba)) || (c === "constancia_cuit" && /CUIT/i.test(motivoGcba));
  const [claves, setClaves] = useState<string[]>(cli.filter((d) => nombra(d.clave)).map((d) => d.clave));
  const [motivo, setMotivo] = useState(motivoGcba);
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      etiqueta={{ texto: "Sale un mail afuera", tono: "marcha" }}
      titulo="¿Pedirle al cliente que corrija lo que observó el Gobierno?"
      texto={`Los papeles que elijas vuelven a «A corregir» con el motivo. ${firmables.some((c) => claves.includes(c)) ? "El portal le pide que vuelva a completar y firmar el acta y la nota. " : ""}Le sale un mail al cliente con el detalle. Subirlos a la tarea de TAD sigue siendo a mano.`}
      confirmar="Pedir la corrección"
      deshabilitado={!claves.length || motivo.trim().length < 5}
      cargando={reabrir.isPending}
      onConfirmar={() =>
        reabrir.mutate({ claves, motivo: motivo.trim() }, {
          onSuccess: (r) => { toast.success(r.mail.enviado ? "Pedido: le salió un mail al cliente" : `Pedido, pero el mail no salió (${r.mail.motivo}): mandale el link por WhatsApp`); onCerrar(); },
          onError: (e) => err(e, "No se pudo"),
        })
      }
    >
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-[12px] text-muted-foreground">Qué hay que corregir</legend>
        {cli.map((d) => (
          <label key={d.id} className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4" checked={claves.includes(d.clave)} onChange={(e) => setClaves((xs) => (e.target.checked ? [...xs, d.clave] : xs.filter((x) => x !== d.clave)))} />
            {nombreDoc(d.clave)}
            {firmables.includes(d.clave) && <span className="text-[12px] text-muted-foreground">(se firma en el portal)</span>}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1">
        <span className="text-[12px] text-muted-foreground">Motivo (lo ve el cliente)</span>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
      </label>
      <Button size="sm" variant="outline" onClick={() => copiar(ficha.linkCliente, "Link del portal copiado")}>
        <Copy className="size-4" /> Copiar el link del portal
      </Button>
    </Dialogo>
  );
}

/** Nivel 1: dejar de seguir un expediente (archivado ya mirado, o viejo sin novedades). */
export function DialogoDejarDeSeguir({ expedienteId, archivado, onCerrar }: { expedienteId: string | null; archivado: boolean; onCerrar: () => void }) {
  const descartar = useDescarte();
  const [motivo, setMotivo] = useState(archivado ? "Lo miré en TAD: " : "");
  return (
    <Dialogo
      open
      onOpenChange={(o) => !o && onCerrar()}
      titulo={archivado ? "¿Ya miraste en TAD por qué se archivó?" : "¿Dejar de seguir este expediente?"}
      texto={archivado
        ? "Pasa a «Archivados sin permiso» y deja de aparecer en «Te toca». Anotá qué viste: queda en la ficha."
        : "Presentado hace mucho y sin novedades. Pasa a «Archivados sin permiso». No se le escribe a nadie y se puede volver a seguir."}
      confirmar={archivado ? "Ya lo miré" : "Dejar de seguir"}
      deshabilitado={!expedienteId || motivo.trim().length < 5}
      cargando={descartar.isPending}
      onConfirmar={() =>
        expedienteId &&
        descartar.mutate({ tipo: "expedientes", id: expedienteId, motivo: motivo.trim() }, { onSuccess: () => { toast.success("Anotado"); onCerrar(); }, onError: (e) => err(e, "No se pudo guardar") })
      }
    >
      <label className="grid gap-1">
        <span className="text-[12px] text-muted-foreground">{archivado ? "Qué viste en TAD" : "Por qué"}</span>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
      </label>
    </Dialogo>
  );
}

/** "Reenviar el link…": nivel 2, dice a quién va de verdad. */
export function BotonReenviarLink({ ficha }: { ficha: FichaPermiso }) {
  const [abierto, setAbierto] = useState(false);
  const reenviar = useReenviarLink(ficha.tramite.id);
  const aVendedora = !ficha.supervision.linkAlCliente && !ficha.tramite.es_prueba;
  const destino = aVendedora ? ficha.vendedora?.corto ?? "la vendedora" : ficha.tramite.cliente_email ?? "el cliente";
  return (
    <>
      <Button size="sm" variant="ghost" className="h-8 px-2 underline underline-offset-2" disabled={!ficha.yo.puedeEditar} onClick={() => setAbierto(true)}>
        <Send className="size-3.5" /> Reenviar el link a {destino}…
      </Button>
      <Dialogo
        open={abierto}
        onOpenChange={setAbierto}
        etiqueta={{ texto: "Sale un mail", tono: "marcha" }}
        titulo={`¿Reenviarle el link a ${destino}?`}
        texto={aVendedora ? `Le llega a ${destino} para que se lo pase al cliente, con el texto para WhatsApp.` : "Le llega al cliente al mail que tiene hoy en Odoo (se relee antes de mandar)."}
        confirmar="Reenviar"
        cargando={reenviar.isPending}
        onConfirmar={() => reenviar.mutate(undefined, { onSuccess: (r) => { if (r.ok) toast.success("Link reenviado por mail"); else toast.error("No se pudo mandar: mirá el motivo en la ficha"); setAbierto(false); }, onError: (e) => err(e, "No se pudo reenviar") })}
      />
    </>
  );
}
