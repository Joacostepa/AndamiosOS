"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Loader2, MessagesSquare, Plus, TriangleAlert } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Hilo, useSeguirAbajo } from "@/components/asistente/hilo";
import { Compositor, type CompositorApi } from "@/components/asistente/compositor";
import { BarraBorrador, PanelBorrador } from "@/components/asistente/panel-borrador";
import { ListaConversaciones } from "@/components/asistente/lista-conversaciones";
import { ModoVoz } from "@/components/asistente/modo-voz";
import { TarjetaAccion, TarjetaMandar, TarjetaPdf, TarjetaWhatsapp } from "@/components/asistente/tarjetas";
import {
  type Adjunto, useArchivarConversacion, useChat, useConversacion, useConversaciones, useCrearConversacion, useEliminarConversacion,
} from "@/hooks/use-asistente";

// Comercial → Asistente. Un chat con el asistente comercial (Claude), que arma presupuestos con
// el motor de precios, los guarda en Odoo cuando se confirma y contesta consultas de Odoo.
//
// EN EL CELULAR es donde más se va a usar (Gabriel y Jorge trabajan por teléfono): el chat
// ocupa toda la pantalla; las conversaciones se abren en una hoja desde la izquierda y el
// presupuesto desde la barra de abajo (la zona del pulgar, encima del cuadro de escribir).

/** Lo que se ve y con qué llena el cuadro (no se manda sola: casi todas necesitan un dato). */
const SUGERENCIAS: { ver: string; poner: string }[] = [
  { ver: "¿Qué tengo pendiente hoy?", poner: "¿Qué tengo pendiente hoy?" },
  { ver: "Cotizar una bandeja de protección", poner: "Necesito cotizar una bandeja de protección en " },
  { ver: "Editar el S0…", poner: "Editar el S0" },
  { ver: "Re-emitir a valor de hoy", poner: "Re-emití a valor de hoy el S0" },
  { ver: "Plan de pagos", poner: "Armá un plan de pagos para el S0" },
  { ver: "¿Cuánto nos debe…?", poner: "¿Cuánto nos debe " },
];

function Asistente() {
  const router = useRouter();
  const params = useSearchParams();
  const actual = params.get("c");
  const lista = useConversaciones();
  const crear = useCrearConversacion();
  const archivar = useArchivarConversacion();
  const eliminar = useEliminarConversacion();
  const chat = useChat(actual);
  const detalle = useConversacion(actual, { seguirTurno: !chat.respondiendo });
  // Un turno que corre en el servidor pero no llega por el stream de esta pantalla (se recargó a
  // mitad de una respuesta): se muestra "Pensando…" y se consulta hasta que termine.
  const trabajando = !chat.respondiendo && !!detalle.data?.conversacion.trabajando;
  const ocupado = chat.respondiendo || trabajando;
  const { reiniciar } = chat;
  const voz = useQuery({
    queryKey: ["asistente-voz"],
    queryFn: async () => (await fetch("/api/comercial/asistente/voz")).json() as Promise<{ transcripcion: boolean; vozEnVivo: boolean }>,
    staleTime: 10 * 60_000,
  });
  const [verConversaciones, setVerConversaciones] = useState(false);
  const [verBorrador, setVerBorrador] = useState(false);
  const [cajaRef, contenidoRef] = useSeguirAbajo(actual, ocupado);
  const compositor = useRef<CompositorApi>(null);
  // La sugerencia tocada sin charla abierta: se crea la charla y el cuadro arranca con ese texto.
  // (Que la charla se cree con el primer mensaje pide cambiar la API: queda para después.)
  const [semilla, setSemilla] = useState<{ conversacion: string; texto: string } | null>(null);

  useEffect(() => {
    reiniciar();
  }, [actual, reiniciar]);

  useEffect(() => {
    if (chat.error) toast.error(chat.error);
  }, [chat.error]);

  const elegir = (id: string) => {
    router.replace(`/comercial/asistente?c=${id}`);
    setVerConversaciones(false);
  };

  const nueva = (texto?: string) =>
    crear.mutate(undefined, {
      onSuccess: ({ conversacion }) => {
        if (texto) setSemilla({ conversacion: conversacion.id, texto });
        elegir(conversacion.id);
      },
      onError: (e) => toast.error(e.message),
    });

  const sugerir = (texto: string) => (actual ? compositor.current?.poner(texto) : nueva(texto));
  const mandar = (texto: string, adjuntos: Adjunto[]) => {
    setSemilla(null);
    return chat.enviar(texto, adjuntos);
  };

  const borrador = chat.borrador ?? detalle.data?.borrador ?? null;
  // Manda lo guardado: la copia en vivo no se entera cuando el servidor vence una acción porque
  // el borrador cambió, y así quedaban tarjetas viejas con Confirmar (05/10: 3 seguidas). Al
  // terminar el turno la pantalla relee la conversación, así que lo guardado está al día.
  const acciones = useMemo(() => {
    const porId = new Map(chat.acciones.map((a) => [a.id, a]));
    for (const a of detalle.data?.acciones ?? []) porId.set(a.id, a);
    const todas = [...porId.values()].sort((a, b) => b.numero - a.numero);
    const abiertas = todas.filter((a) => ["propuesta", "presentada", "ejecutando"].includes(a.estado));
    // Lo último que se hizo (Quedó como S0…) sigue a la vista, también al recargar, hasta que
    // se propone otra cosa.
    const ultima = todas[0];
    const hecha = ultima && ["ok", "error", "incierto"].includes(ultima.estado) ? [ultima] : [];
    return [...abiertas, ...hecha].slice(0, 3);
  }, [chat.acciones, detalle.data?.acciones]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const decidir = (id: string, d: "confirmar" | "rechazar" | "reintentar") => {
    setConfirmando(d === "rechazar" ? null : id);
    void chat.decidir(id, d).finally(() => setConfirmando(null));
  };
  const pdf = chat.pdfs[0] ?? detalle.data?.pdfs[0] ?? null;
  const whatsapp = chat.whatsapp ?? detalle.data?.whatsapp ?? null;
  const propia = detalle.data?.conversacion.propia ?? true;

  const salirSiEsLaActual = (id: string) => {
    if (id === actual) router.replace("/comercial/asistente");
  };

  const archivarConversacion = (id: string, siArchivar: boolean) =>
    archivar.mutate({ id, archivar: siArchivar }, {
      onSuccess: () => {
        if (!siArchivar) return void toast.success("Conversación desarchivada");
        salirSiEsLaActual(id);
        toast.success("Conversación archivada", {
          description: "La encontrás con el buscador.",
          action: { label: "Deshacer", onClick: () => archivar.mutate({ id, archivar: false }) },
        });
      },
      onError: (e) => toast.error(e.message),
    });

  const listaConversaciones = (
    <ListaConversaciones
      conversaciones={lista.data ?? []}
      actual={actual}
      onElegir={elegir}
      onNueva={() => nueva()}
      onArchivar={archivarConversacion}
      onEliminar={(id) => eliminar.mutate(id, { onSuccess: () => salirSiEsLaActual(id), onError: (e) => toast.error(e.message) })}
      creando={crear.isPending}
    />
  );

  return (
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">{listaConversaciones}</aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 sm:px-3">
          <Button variant="ghost" size="icon" className="size-11 lg:hidden [&_svg:not([class*='size-'])]:size-5" onClick={() => setVerConversaciones(true)} aria-label="Conversaciones">
            <MessagesSquare />
          </Button>
          <Bot className="hidden size-5 text-primary sm:block" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold">{detalle.data?.conversacion.titulo ?? "Asistente comercial"}</h1>
            {borrador?.odooVentaNombre && (
              <p className="truncate text-[13px] text-muted-foreground xl:hidden">Editando {borrador.odooVentaNombre} en Odoo</p>
            )}
          </div>
          {/* "+ Nueva" a mano en el celular (antes había que abrir la lista). */}
          <Button variant="outline" className="h-11 px-3 text-[15px] lg:hidden" onClick={() => nueva()} disabled={crear.isPending} aria-label="Nueva conversación">
            {crear.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Nueva
          </Button>
        </header>

        {!actual ? (
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto flex max-w-xl flex-col gap-5">
              <div className="text-center">
                <Bot className="mx-auto mb-2 size-10 text-muted-foreground/60" />
                <p className="text-lg font-medium">Asistente comercial</p>
                <p className="text-[14px] text-muted-foreground">
                  Contale qué hay que cotizar —escribiendo, con un audio o hablando en vivo, y con fotos o planos—, o preguntale por un cliente, un presupuesto o los pendientes del día. En el cuadro de abajo, el micrófono graba un audio con un toque; mantenelo apretado y soltá para hablar en vivo.
                </p>
              </div>
              <Button className="h-12 w-full bg-hd-boton text-[16px] text-white hover:bg-hd-boton-hover" onClick={() => nueva()} disabled={crear.isPending}>
                {crear.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Empezar una conversación
              </Button>
              <Sugerencias onElegir={sugerir} deshabilitado={crear.isPending} />
              {(lista.data?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Seguir con una reciente</p>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {lista.data!.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => elegir(c.id)} className="flex min-h-12 w-full flex-col justify-center px-3.5 py-2 text-left hover:bg-muted/60">
                          <span className="truncate text-[15px]">{[c.cliente, c.obra].filter(Boolean).join(" · ") || c.titulo || "Conversación nueva"}</span>
                          <span className="truncate text-[13px] text-muted-foreground">
                            {[c.venta, c.ultimo_mensaje_at ? `hace ${formatDistanceToNowStrict(parseISO(c.ultimo_mensaje_at), { locale: es })}` : "sin mensajes"].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : detalle.isLoading ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : detalle.error ? (
          <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-destructive">
            <TriangleAlert className="size-4" /> {detalle.error instanceof Error ? detalle.error.message : "No se pudo abrir la conversación"}
          </div>
        ) : (
          <>
            <div ref={cajaRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
              <div ref={contenidoRef} className="mx-auto max-w-3xl space-y-4">
                {(detalle.data?.items.length ?? 0) === 0 && !ocupado && (
                  <div className="pt-6"><Sugerencias onElegir={sugerir} /></div>
                )}
                <Hilo items={detalle.data?.items ?? []} enVivo={chat.enVivo} respondiendo={ocupado} />
                {/* Mientras se ejecuta lo confirmado, su tarjeta sigue a la vista (antes desaparecía). */}
                {ocupado && confirmando && acciones.some((a) => a.id === confirmando) && (
                  <div className="space-y-2.5 sm:pl-9">
                    <TarjetaAccion accion={acciones.find((a) => a.id === confirmando)!} onDecidir={decidir} ocupado ejecutando />
                  </div>
                )}
                {!ocupado && (
                  <div className="space-y-2.5 sm:pl-9">
                    {acciones.map((a) => <TarjetaAccion key={a.id} accion={a} onDecidir={decidir} ocupado={chat.respondiendo} />)}
                    {/* El PDF final y su mensaje van juntos («Mandar al cliente»); si falta uno, cada uno solo. */}
                    {pdf && whatsapp && pdf.tipo === "final" ? (
                      <TarjetaMandar key={pdf.id} pdf={pdf} texto={whatsapp} telefono={borrador?.datos.cliente.celular} nombre={borrador?.datos.cliente.contacto} />
                    ) : (
                      <>
                        {pdf && <TarjetaPdf key={pdf.id} pdf={pdf} />}
                        {whatsapp && <TarjetaWhatsapp texto={whatsapp} telefono={borrador?.datos.cliente.celular} />}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {borrador && (
              <div className="xl:hidden">
                <BarraBorrador borrador={borrador} onAbrir={() => setVerBorrador(true)} />
              </div>
            )}
            {propia && voz.data?.vozEnVivo ? (
              <ModoVoz conversacionId={actual}>
                {(hablar) => (
                  <Compositor
                    ref={compositor}
                    key={actual}
                    textoInicial={semilla?.conversacion === actual ? semilla.texto : ""}
                    conversacionId={actual}
                    respondiendo={ocupado}
                    onEnviar={mandar}
                    onParar={trabajando ? undefined : chat.parar}
                    transcripcionDisponible={!!voz.data?.transcripcion}
                    onHablar={hablar}
                  />
                )}
              </ModoVoz>
            ) : propia ? (
              <Compositor
                ref={compositor}
                key={actual}
                textoInicial={semilla?.conversacion === actual ? semilla.texto : ""}
                conversacionId={actual}
                respondiendo={ocupado}
                onEnviar={mandar}
                onParar={trabajando ? undefined : chat.parar}
                transcripcionDisponible={!!voz.data?.transcripcion}
              />
            ) : (
              <p className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[13px] text-muted-foreground">Conversación de otra persona: sólo lectura.</p>
            )}
          </>
        )}
      </section>

      {actual && <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-border xl:block"><PanelBorrador borrador={borrador} /></aside>}

      <Sheet open={verConversaciones} onOpenChange={setVerConversaciones}>
        <SheetContent side="left" className="w-[85vw] max-w-80 p-0 pt-[env(safe-area-inset-top)]">
          <SheetTitle className="sr-only">Conversaciones</SheetTitle>
          {listaConversaciones}
        </SheetContent>
      </Sheet>
      <Sheet open={verBorrador} onOpenChange={setVerBorrador}>
        {/* Desde abajo: sale de la barra, donde está el pulgar. */}
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/20" aria-hidden />
          <SheetTitle className="sr-only">Presupuesto</SheetTitle>
          <div className="pr-12"><PanelBorrador borrador={borrador} /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Sugerencias({ onElegir, deshabilitado }: { onElegir: (texto: string) => void; deshabilitado?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGERENCIAS.map((s) => (
        <Button key={s.ver} variant="outline" className="h-11 rounded-full px-4 text-[14px]" disabled={deshabilitado} onClick={() => onElegir(s.poner)}>
          {s.ver}
        </Button>
      ))}
    </div>
  );
}

export default function AsistentePage() {
  return (
    <Suspense>
      <Asistente />
    </Suspense>
  );
}
