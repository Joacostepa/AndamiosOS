"use client";

// Los botones de cada fila de la bandeja. La bandeja (lib/panol/bandeja.ts) dice QUÉ se
// puede hacer; acá está el CÓMO, con la regla del rediseño:
//   - lo de un clic que se puede volver atrás se hace en la fila, con Deshacer en el toast;
//   - lo que no se deshace (aprobar un ajuste) o deja algo perdido pide confirmación, y lo
//     que la base pide con motivo (la pérdida) lo pide acá antes de mandar;
//   - un botón que todavía no se puede usar dice por qué AL LADO, no en un tooltip.

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Chip } from "@/components/permisos-via-publica/ui";
import { deshacerVale, useInvalidarPanol } from "@/hooks/use-panol";
import { useAvisadosWhatsapp, useGestionPanol, useListaReposicion, useResolverConteo, useSinAltaResuelto } from "@/hooks/use-panol-bandeja";
import type { AccionBandeja } from "@/lib/panol/bandeja";
import { hoyBA, leerRechazo } from "@/lib/panol/estado";
import { fechaCorta } from "@/lib/panol/whatsapp";
import type { ItemVale } from "@/lib/panol/tipos";

const BOTON = "max-sm:h-10";
const errorDe = (e: unknown) => leerRechazo(e instanceof Error ? e.message : String(e)).texto;

/** Un botón que no se puede usar todavía, con el porqué a la vista. */
function Apagado({ etiqueta, porque }: { etiqueta: string; porque: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button size="sm" variant="outline" className={BOTON} disabled>{etiqueta}</Button>
      <span className="text-[12px] text-muted-foreground">{porque}</span>
    </span>
  );
}

/** El toast de lo hecho, con Deshacer si se puede volver atrás. */
function hecho(texto: string, deshacer?: () => Promise<unknown> | void) {
  toast.success(texto, deshacer ? {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: () => {
        Promise.resolve(deshacer())
          .then(() => toast("Listo, quedó como estaba."))
          .catch((e) => toast.error(errorDe(e)));
      },
    },
  } : undefined);
}

export function AccionFila({ accion }: { accion: AccionBandeja }) {
  switch (accion.tipo) {
    case "aprobar_conteo":
    case "rechazar_conteo":
      return <ResolverConteo accion={accion} />;
    case "reponer":
      return <Reponer accion={accion} />;
    case "whatsapp":
      return <Whatsapp accion={accion} />;
    case "perdida":
      return <PasarAPerdida accion={accion} />;
    case "revision":
    case "taller_envio":
    case "taller_vuelta":
      return <Gestion accion={accion} />;
    case "sin_alta_resuelto":
      return <SinAltaResuelto accion={accion} />;
    case "link":
      return (
        <Button size="sm" variant="outline" className={BOTON} nativeButton={false} render={<Link href={accion.href} />}>
          {accion.etiqueta} <ArrowRight aria-hidden className="size-3.5" />
        </Button>
      );
  }
}

// ─── Ajustes de conteo ──────────────────────────────────────────────────────

function ResolverConteo({ accion }: { accion: Extract<AccionBandeja, { tipo: "aprobar_conteo" | "rechazar_conteo" }> }) {
  const aprobar = accion.tipo === "aprobar_conteo";
  const resolver = useResolverConteo();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const etiqueta = aprobar ? "Aprobar" : "Rechazar";

  // El porqué se muestra una sola vez, al lado del segundo botón.
  if (accion.bloqueo) {
    return aprobar
      ? <Button size="sm" variant="outline" className={BOTON} disabled>{etiqueta}</Button>
      : <Apagado etiqueta={etiqueta} porque={accion.bloqueo} />;
  }

  function mandar() {
    resolver.mutate({ conteoId: accion.conteoId, aprobar, motivo }, {
      onSuccess: () => {
        setAbierto(false);
        hecho(aprobar ? "Ajuste aprobado: el stock queda como se contó." : "Ajuste rechazado: hay que volver a contar.");
      },
      onError: (e) => toast.error(errorDe(e)),
    });
  }

  if (aprobar) {
    return (
      <>
        <Button size="sm" variant="outline" className={BOTON} onClick={() => setAbierto(true)}>{etiqueta}</Button>
        <ConfirmDialog
          open={abierto}
          onOpenChange={setAbierto}
          title="¿Aprobar el ajuste?"
          description={`El stock queda como lo contó ${accion.contadoPor}. Esto no se deshace: si el conteo estuvo mal, se vuelve a contar.`}
          confirmLabel="Aprobar el ajuste"
          onConfirm={mandar}
          loading={resolver.isPending}
        />
      </>
    );
  }
  return (
    <>
      <Button size="sm" variant="outline" className={BOTON} onClick={() => setAbierto(true)}>{etiqueta}</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Rechazar el ajuste?</DialogTitle>
            <DialogDescription>El stock no cambia y el conteo queda rechazado: hay que volver a contar esa ubicación.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-rechazo">Por qué (opcional)</Label>
            <Textarea id="motivo-rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: contaron el estante equivocado" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={resolver.isPending}>Cancelar</Button>
            <Button variant="destructive" onClick={mandar} disabled={resolver.isPending}>
              {resolver.isPending && <Loader2 className="size-4 animate-spin" />} Rechazar el ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Reponer ────────────────────────────────────────────────────────────────

function Reponer({ accion }: { accion: Extract<AccionBandeja, { tipo: "reponer" }> }) {
  const lista = useListaReposicion();
  if (lista.tiene(accion.clave)) {
    return (
      <span className="inline-flex items-center gap-2">
        <Chip tono="listo">En la lista</Chip>
        <Button size="sm" variant="ghost" className={BOTON} onClick={() => lista.quitar(accion.clave)}>Quitar</Button>
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className={BOTON}
      onClick={() => {
        lista.agregar({ clave: accion.clave, articuloId: accion.articuloId, varianteId: accion.varianteId, cantidad: accion.cantidad, texto: accion.texto });
        hecho("Agregado a la lista de reposición.", () => lista.quitar(accion.clave));
      }}
    >
      Agregar a la lista de reposición
    </Button>
  );
}

// ─── WhatsApp ───────────────────────────────────────────────────────────────

function cuandoAvisado(iso: string): string {
  const dia = hoyBA(new Date(iso));
  const hoy = hoyBA();
  if (dia === hoy) return "Avisado hoy";
  const ayer = hoyBA(new Date(Date.now() - 86_400_000));
  return dia === ayer ? "Avisado ayer" : `Avisado el ${fechaCorta(dia)}`;
}

function Whatsapp({ accion }: { accion: Extract<AccionBandeja, { tipo: "whatsapp" }> }) {
  const { avisados, marcar, desmarcar } = useAvisadosWhatsapp();
  if (!accion.url) return <Apagado etiqueta={accion.etiqueta} porque={`${accion.a} no tiene un celular cargado en Legajos.`} />;
  const cuando = avisados[accion.clave];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {cuando && <Chip tono="neutro" sinIcono>{cuandoAvisado(cuando)}</Chip>}
      <Button
        size="sm"
        variant="outline"
        className={BOTON}
        nativeButton={false} render={<a href={accion.url} target="_blank" rel="noreferrer" />}
        onClick={() => {
          marcar(accion.clave);
          hecho(`Abrimos WhatsApp con el mensaje para ${accion.a}. Falta que aprietes Enviar.`, () => desmarcar(accion.clave));
        }}
      >
        <MessageCircle aria-hidden /> {cuando ? "Avisar de nuevo" : accion.etiqueta}
      </Button>
    </span>
  );
}

// ─── Gestiones de un clic (con Deshacer) ────────────────────────────────────

const GESTION: Record<string, { etiqueta: string; hecho: string }> = {
  disponible: { etiqueta: "Vuelve a disponible", hecho: "quedó disponible" },
  fuera_de_servicio: { etiqueta: "Fuera de servicio", hecho: "quedó fuera de servicio" },
  taller_envio: { etiqueta: "Al taller", hecho: "salió al taller" },
  taller_vuelta: { etiqueta: "Volvió", hecho: "volvió del taller y quedó disponible" },
};

function Gestion({ accion }: { accion: Extract<AccionBandeja, { tipo: "revision" | "taller_envio" | "taller_vuelta" }> }) {
  const gestion = useGestionPanol();
  const invalidar = useInvalidarPanol();
  const clave = accion.tipo === "revision" ? accion.nuevoEstado : accion.tipo;
  const texto = GESTION[clave];
  const item: ItemVale = accion.tipo === "revision"
    ? { articuloId: accion.articuloId, unidadId: accion.unidadId, movTipo: "revision", nuevoEstado: accion.nuevoEstado }
    : { articuloId: accion.articuloId, unidadId: accion.unidadId, movTipo: accion.tipo };
  return (
    <Button
      size="sm"
      variant="outline"
      className={BOTON}
      disabled={gestion.isPending}
      onClick={() => gestion.mutate(item, {
        onSuccess: (r) => hecho(`${accion.que} ${texto.hecho}.`, () => deshacerVale(r.valeId).then(invalidar)),
        onError: (e) => toast.error(errorDe(e)),
      })}
    >
      {gestion.isPending && <Loader2 className="size-4 animate-spin" />} {texto.etiqueta}
    </Button>
  );
}

function SinAltaResuelto({ accion }: { accion: Extract<AccionBandeja, { tipo: "sin_alta_resuelto" }> }) {
  const resolver = useSinAltaResuelto();
  return (
    <Button
      size="sm"
      variant="ghost"
      className={BOTON}
      disabled={resolver.isPending}
      onClick={() => resolver.mutate({ id: accion.sinAltaId, resuelto: true }, {
        onSuccess: () => hecho(`«${accion.que}» quedó resuelto.`, () => resolver.mutateAsync({ id: accion.sinAltaId, resuelto: false })),
        onError: (e) => toast.error(errorDe(e)),
      })}
    >
      Marcar resuelto
    </Button>
  );
}

// ─── Pasar a pérdida (pide motivo) ──────────────────────────────────────────

function PasarAPerdida({ accion }: { accion: Extract<AccionBandeja, { tipo: "perdida" }> }) {
  const gestion = useGestionPanol();
  const invalidar = useInvalidarPanol();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [robo, setRobo] = useState(false);
  const [denuncia, setDenuncia] = useState("");

  if (accion.bloqueo) return <Apagado etiqueta="Pasar a pérdida" porque={accion.bloqueo} />;

  function mandar() {
    const texto = motivo.trim();
    if (!texto) return;
    gestion.mutate({
      articuloId: accion.articuloId,
      varianteId: accion.varianteId,
      unidadId: accion.unidadId,
      cantidad: accion.cantidad,
      // Lo que es a granel no tiene unidad que diga dónde está: sale de "faltante".
      desde: accion.unidadId ? undefined : "faltante",
      movTipo: "perdida",
      motivo: robo ? `Robo — ${texto}` : texto,
      denuncia: robo ? denuncia.trim() || undefined : undefined,
    }, {
      onSuccess: (r) => {
        setAbierto(false);
        setMotivo(""); setRobo(false); setDenuncia("");
        hecho("Pasó a pérdida. Si aparece, se registra como recuperada.", () => deshacerVale(r.valeId).then(invalidar));
      },
      onError: (e) => toast.error(errorDe(e)),
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" className={BOTON} onClick={() => setAbierto(true)}>Pasar a pérdida</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pasar a pérdida</DialogTitle>
            <DialogDescription>
              {accion.que}{accion.aCargo ? `, a cargo de ${accion.aCargo}` : ""}. Queda en el historial; si aparece, se registra como recuperada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-perdida">Qué pasó</Label>
              <Textarea id="motivo-perdida" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: no apareció en la obra ni en la camioneta" />
            </div>
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={robo} onCheckedChange={(v) => setRobo(v === true)} /> Fue un robo
            </Label>
            {robo && (
              <div className="space-y-1.5">
                <Label htmlFor="denuncia">Número de denuncia (opcional)</Label>
                <Input id="denuncia" value={denuncia} onChange={(e) => setDenuncia(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={gestion.isPending}>Cancelar</Button>
            <Button variant="destructive" onClick={mandar} disabled={gestion.isPending || !motivo.trim()}>
              {gestion.isPending && <Loader2 className="size-4 animate-spin" />} Pasar a pérdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
