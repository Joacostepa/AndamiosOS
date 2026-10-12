"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, ClipboardList, Loader2, MessagesSquare, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Hilo, useSeguirAbajo } from "@/components/asistente/hilo";
import { Compositor } from "@/components/asistente/compositor";
import { PanelBorrador } from "@/components/asistente/panel-borrador";
import { ListaConversaciones } from "@/components/asistente/lista-conversaciones";
import { ModoVoz } from "@/components/asistente/modo-voz";
import { TarjetaAccion, TarjetaPdf, TarjetaWhatsapp } from "@/components/asistente/tarjetas";
import {
  useArchivarConversacion, useChat, useConversacion, useConversaciones, useCrearConversacion, useEliminarConversacion,
} from "@/hooks/use-asistente";

// Comercial → Asistente. Un chat con el asistente comercial (Claude), que arma presupuestos con
// el motor de precios, los guarda en Odoo cuando se confirma y contesta consultas de Odoo.
//
// EN EL CELULAR es donde más se va a usar (Gabriel y Jorge trabajan por teléfono): el chat
// ocupa toda la pantalla; las conversaciones y el presupuesto se abren en hojas.

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

const SUGERENCIAS = [
  "¿Qué tengo pendiente hoy?",
  "Necesito cotizar una bandeja de protección",
  "Re-emití el S02441 a valor de hoy",
  "¿Cuánto nos debe el cliente…?",
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

  const nueva = () =>
    crear.mutate(undefined, {
      onSuccess: ({ conversacion }) => elegir(conversacion.id),
      onError: (e) => toast.error(e.message),
    });

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
  const decidir = (id: string, d: "confirmar" | "rechazar") => {
    setConfirmando(d === "confirmar" ? id : null);
    void chat.decidir(id, d).finally(() => setConfirmando(null));
  };
  const pdf = chat.pdfs[0] ?? detalle.data?.pdfs[0] ?? null;
  const whatsapp = chat.whatsapp ?? detalle.data?.whatsapp ?? null;
  const subtotal = borrador?.resultado?.totales.subtotal ?? 0;
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
      onNueva={nueva}
      onArchivar={archivarConversacion}
      onEliminar={(id) => eliminar.mutate(id, { onSuccess: () => salirSiEsLaActual(id), onError: (e) => toast.error(e.message) })}
      creando={crear.isPending}
    />
  );

  return (
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">{listaConversaciones}</aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setVerConversaciones(true)} aria-label="Conversaciones">
            <MessagesSquare />
          </Button>
          <Bot className="hidden size-5 text-primary sm:block" />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{detalle.data?.conversacion.titulo ?? "Asistente comercial"}</h1>
          {actual && (
            <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setVerBorrador(true)}>
              <ClipboardList /> {subtotal ? pesos(subtotal) : "Presupuesto"}
            </Button>
          )}
        </header>

        {!actual ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <Bot className="size-12 text-muted-foreground/50" />
            <div>
              <p className="text-lg font-medium">Asistente comercial</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Contale qué hay que cotizar —escribiendo, dictando o con un audio, y con fotos o planos—, preguntale por un cliente, un presupuesto o los pendientes del día. Arma el presupuesto con las tarifas vigentes y lo guarda en Odoo cuando confirmás.
              </p>
            </div>
            <Button onClick={nueva} disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="animate-spin" />} Empezar una conversación
            </Button>
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
                  <div className="flex flex-wrap justify-center gap-2 pt-8">
                    {SUGERENCIAS.map((s) => (
                      <Button key={s} variant="outline" size="sm" onClick={() => chat.enviar(s)}>{s}</Button>
                    ))}
                  </div>
                )}
                <Hilo items={detalle.data?.items ?? []} enVivo={chat.enVivo} respondiendo={ocupado} />
                {/* Mientras se ejecuta lo confirmado, su tarjeta sigue a la vista (antes desaparecía). */}
                {ocupado && confirmando && acciones.some((a) => a.id === confirmando) && (
                  <div className="space-y-2 pl-9">
                    <TarjetaAccion accion={acciones.find((a) => a.id === confirmando)!} onDecidir={decidir} ocupado ejecutando />
                  </div>
                )}
                {!ocupado && (
                  <div className="space-y-2 pl-9">
                    {acciones.map((a) => <TarjetaAccion key={a.id} accion={a} onDecidir={decidir} ocupado={chat.respondiendo} />)}
                    {pdf && <TarjetaPdf pdf={pdf} />}
                    {whatsapp && <TarjetaWhatsapp texto={whatsapp} telefono={borrador?.datos.cliente.celular} />}
                  </div>
                )}
              </div>
            </div>
            {propia && voz.data?.vozEnVivo ? (
              <ModoVoz conversacionId={actual}>
                {(hablar) => (
                  <Compositor
                    conversacionId={actual}
                    respondiendo={ocupado}
                    onEnviar={(t, a) => chat.enviar(t, a)}
                    onParar={trabajando ? undefined : chat.parar}
                    transcripcionDisponible={!!voz.data?.transcripcion}
                    onHablar={hablar}
                  />
                )}
              </ModoVoz>
            ) : propia ? (
              <Compositor
                conversacionId={actual}
                respondiendo={ocupado}
                onEnviar={(t, a) => chat.enviar(t, a)}
                onParar={trabajando ? undefined : chat.parar}
                transcripcionDisponible={!!voz.data?.transcripcion}
              />
            ) : (
              <p className="border-t border-border p-3 text-center text-[12px] text-muted-foreground">Conversación de otra persona: sólo lectura.</p>
            )}
          </>
        )}
      </section>

      {actual && <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-border xl:block"><PanelBorrador borrador={borrador} /></aside>}

      <Sheet open={verConversaciones} onOpenChange={setVerConversaciones}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetTitle className="sr-only">Conversaciones</SheetTitle>
          {listaConversaciones}
        </SheetContent>
      </Sheet>
      <Sheet open={verBorrador} onOpenChange={setVerBorrador}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Presupuesto</SheetTitle>
          <PanelBorrador borrador={borrador} />
        </SheetContent>
      </Sheet>
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
