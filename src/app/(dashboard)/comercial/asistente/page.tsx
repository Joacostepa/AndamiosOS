"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, ClipboardList, Loader2, MessagesSquare, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Hilo } from "@/components/asistente/hilo";
import { Compositor } from "@/components/asistente/compositor";
import { PanelBorrador } from "@/components/asistente/panel-borrador";
import { ListaConversaciones } from "@/components/asistente/lista-conversaciones";
import { ModoVoz } from "@/components/asistente/modo-voz";
import { TarjetaAccion, TarjetaPdf, TarjetaWhatsapp } from "@/components/asistente/tarjetas";
import { useArchivarConversacion, useChat, useConversacion, useConversaciones, useCrearConversacion } from "@/hooks/use-asistente";

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
  const detalle = useConversacion(actual);
  const chat = useChat(actual);
  const { reiniciar } = chat;
  const voz = useQuery({
    queryKey: ["asistente-voz"],
    queryFn: async () => (await fetch("/api/comercial/asistente/voz")).json() as Promise<{ transcripcion: boolean; vozEnVivo: boolean }>,
    staleTime: 10 * 60_000,
  });
  const [verConversaciones, setVerConversaciones] = useState(false);
  const [verBorrador, setVerBorrador] = useState(false);

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
  const acciones = useMemo(() => {
    const vivas = new Map(chat.acciones.map((a) => [a.id, a]));
    const guardadas = (detalle.data?.acciones ?? []).filter((a) => !vivas.has(a.id));
    return [...chat.acciones, ...guardadas]
      .filter((a) => ["propuesta", "presentada", "ejecutando"].includes(a.estado) || chat.acciones.some((x) => x.id === a.id))
      .slice(0, 3);
  }, [chat.acciones, detalle.data?.acciones]);
  const pdf = chat.pdfs[0] ?? detalle.data?.pdfs[0] ?? null;
  const subtotal = borrador?.resultado?.totales.subtotal ?? 0;
  const propia = detalle.data?.conversacion.propia ?? true;

  const listaConversaciones = (
    <ListaConversaciones
      conversaciones={lista.data ?? []}
      actual={actual}
      onElegir={elegir}
      onNueva={nueva}
      onArchivar={(id) => archivar.mutate(id, { onSuccess: () => id === actual && router.replace("/comercial/asistente") })}
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
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-4">
                {(detalle.data?.items.length ?? 0) === 0 && !chat.respondiendo && (
                  <div className="flex flex-wrap justify-center gap-2 pt-8">
                    {SUGERENCIAS.map((s) => (
                      <Button key={s} variant="outline" size="sm" onClick={() => chat.enviar(s)}>{s}</Button>
                    ))}
                  </div>
                )}
                <Hilo items={detalle.data?.items ?? []} enVivo={chat.enVivo} respondiendo={chat.respondiendo} />
                {!chat.respondiendo && (
                  <div className="space-y-2 pl-9">
                    {acciones.map((a) => <TarjetaAccion key={a.id} accion={a} onDecidir={chat.decidir} ocupado={chat.respondiendo} />)}
                    {pdf && <TarjetaPdf pdf={pdf} />}
                    {chat.whatsapp && <TarjetaWhatsapp texto={chat.whatsapp} telefono={borrador?.datos.cliente.celular} />}
                  </div>
                )}
              </div>
            </div>
            {propia && voz.data?.vozEnVivo ? (
              <ModoVoz conversacionId={actual}>
                {(hablar) => (
                  <Compositor
                    conversacionId={actual}
                    respondiendo={chat.respondiendo}
                    onEnviar={(t, a) => chat.enviar(t, a)}
                    onParar={chat.parar}
                    transcripcionDisponible={!!voz.data?.transcripcion}
                    onHablar={hablar}
                  />
                )}
              </ModoVoz>
            ) : propia ? (
              <Compositor
                conversacionId={actual}
                respondiendo={chat.respondiendo}
                onEnviar={(t, a) => chat.enviar(t, a)}
                onParar={chat.parar}
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
