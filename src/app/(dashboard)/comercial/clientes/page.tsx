"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, Hand, Loader2, Lock, MessageCircle, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSeguirAbajo } from "@/components/asistente/hilo";
import { ListaCharlas } from "@/components/clientes/lista-charlas";
import { HiloCharla } from "@/components/clientes/hilo-charla";
import { CajaRespuesta } from "@/components/clientes/caja-respuesta";
import { PastillaEstado, PastillaVentana, useAhora } from "@/components/clientes/pastillas";
import { useCambiarEstado, useCharla, useCharlas } from "@/hooks/use-clientes-whatsapp";
import { telefonoLegible, type Filtro } from "@/lib/clientes/vista";

// Comercial → WhatsApp de clientes (docs/clientes/crm-propuesta.md §7, etapa 0).
//
// La bandeja del número de clientes: el número no está en ningún celular (sólo la Cloud API
// de Meta), así que ésta es LA forma de contestarlo, y tiene que andar bien en el teléfono.
// En el celular, la lista ocupa la pantalla y la charla se abre encima (con «Charlas» para
// volver); en la compu, lista a la izquierda y charla a la derecha.
//
// Sin Sofía (etapa 0, clientes_ia_activa = 0): lo nuevo entra «Sin tomar»; quien lo toma (o le
// escribe) pasa a tenerlo, y lo puede soltar o cerrar. Con Sofía (paso 5): lo nuevo entra con
// ella; lo que escribe se ve en celeste, distinto de lo que escribe una persona. Si alguien toma
// la charla (o le escribe), Sofía se calla; «Devolver a Sofía» se la devuelve, con una nota
// opcional para ella. Las tarjetas de aprobación son el paso 6.

function Bandeja() {
  const router = useRouter();
  const params = useSearchParams();
  const actual = params.get("c");
  const [filtro, setFiltro] = useState<Filtro>("vos");
  const ahora = useAhora();
  const lista = useCharlas();
  const yo = lista.data?.yo ?? "";

  const elegir = (id: string | null) => router.replace(id ? `/comercial/clientes?c=${id}` : "/comercial/clientes");

  // Las que nadie abrió, en el título de la pestaña (avisa aunque la pestaña esté en el fondo
  // cuando vuelve a consultar).
  const sinLeer = (lista.data?.charlas ?? []).reduce((n, c) => n + (c.estado !== "cerrada" ? c.sinLeer : 0), 0);
  useEffect(() => {
    const antes = document.title;
    document.title = sinLeer ? `(${sinLeer}) WhatsApp de clientes` : "WhatsApp de clientes";
    return () => {
      document.title = antes;
    };
  }, [sinLeer]);

  const listaCharlas = lista.isLoading ? (
    <div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  ) : lista.error ? (
    <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-destructive">
      <TriangleAlert className="size-4" /> {lista.error.message}
    </div>
  ) : (
    <ListaCharlas charlas={lista.data?.charlas ?? []} yo={yo} filtro={filtro} onFiltro={setFiltro} actual={actual} onElegir={elegir} ahora={ahora} />
  );

  return (
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside className={`${actual ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-border lg:w-96`}>
        <header className="flex h-14 items-center gap-2 border-b border-border px-3">
          <MessageCircle className="size-5 text-hd-boton" />
          <h1 className="flex-1 text-[15px] font-semibold">WhatsApp de clientes</h1>
          {lista.isFetching && !lista.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
        </header>
        {lista.data && !lista.data.numeroConfigurado && (
          <p className="border-b border-border bg-hd-ambar-bg px-3 py-2 text-[13px] text-hd-ambar">
            El número de clientes todavía no está configurado: se ve lo que llegó, pero no se puede contestar.
          </p>
        )}
        <div className="min-h-0 flex-1">{listaCharlas}</div>
      </aside>

      <section className={`${actual ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {actual ? (
          <Charla key={actual} id={actual} ahora={ahora} onVolver={() => elegir(null)} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <MessageCircle className="size-10 opacity-50" />
            <p className="text-[15px]">Elegí una charla de la lista.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Charla({ id, ahora, onVolver }: { id: string; ahora: number; onVolver: () => void }) {
  const detalle = useCharla(id);
  const cambiar = useCambiarEstado(id);
  const [cajaRef, contenidoRef] = useSeguirAbajo(id, cambiar.isPending);
  const d = detalle.data;
  // «Devolver a Sofía»: se abre un renglón para dejarle una nota (opcional).
  const [devolviendo, setDevolviendo] = useState(false);
  const [nota, setNota] = useState("");

  const accion = (a: "tomar" | "soltar" | "cerrar" | "devolver", forzar = false) =>
    cambiar.mutate(
      { accion: a, forzar, ...(a === "devolver" && nota.trim() ? { nota: nota.trim() } : {}) },
      {
        onSuccess: () => {
          if (a === "cerrar") toast.success("Charla cerrada", { description: "Si el cliente vuelve a escribir, se reabre." });
          if (a === "devolver") {
            setDevolviendo(false);
            setNota("");
            toast.success("La charla volvió a Sofía", { description: "Sigue ella. Si la tomás de nuevo, se calla." });
          }
        },
        onError: (e) => {
          // La tiene otra persona: se pregunta antes de sacársela.
          if (a === "tomar" && e.status === 409 && e.message.startsWith("La tiene")) {
            toast(e.message, { action: { label: "Tomarla igual", onClick: () => accion("tomar", true) } });
          } else toast.error(e.message);
        },
      },
    );

  if (detalle.isLoading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (detalle.error || !d) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-destructive">
        <span className="flex items-center gap-2"><TriangleAlert className="size-4" /> {detalle.error?.message ?? "No se pudo abrir la charla."}</span>
        <Button variant="outline" onClick={onVolver}>Volver a las charlas</Button>
      </div>
    );
  }

  const c = d.charla;
  const nombre = c.nombre || telefonoLegible(c.telefono);
  const mia = c.estado === "humano" && c.asistente?.id === d.yo;
  const deOtro = c.estado === "humano" && !!c.asistente && c.asistente.id !== d.yo;
  const puedeDevolver = !!d.iaActiva && d.puedeEditar && !deOtro && (c.estado === "humano" || c.estado === "derivada" || c.estado === "espera_ok");

  return (
    <>
      <header className="border-b border-border px-2 py-1.5 sm:px-3">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" className="h-11 gap-1 px-2 text-[15px] lg:hidden" onClick={onVolver} aria-label="Volver a las charlas">
            <ArrowLeft className="size-5" /> <span className="sr-only sm:not-sr-only">Charlas</span>
          </Button>
          <div className="min-w-0 flex-1 py-0.5">
            <h2 className="truncate text-[15px] font-semibold">{nombre}</h2>
            <p className="truncate text-[13px] text-muted-foreground tabular-nums">
              <a href={`tel:+${c.telefono}`} className="hover:underline">{telefonoLegible(c.telefono)}</a>
              {c.optOut && " · pidió la baja de los seguimientos"}
            </p>
          </div>
          {d.puedeEditar && (
            <div className="flex shrink-0 items-center gap-1.5">
              {mia ? (
                <Button variant="outline" className="h-10 px-3" onClick={() => accion("soltar")} disabled={cambiar.isPending} title="Queda sin tomar, para cualquiera" aria-label="Soltar la charla">
                  <Undo2 /> <span className="hidden sm:inline">Soltar</span>
                </Button>
              ) : (
                <Button variant="outline" className="h-10 px-3" onClick={() => accion("tomar")} disabled={cambiar.isPending} aria-label="Tomar la charla">
                  <Hand /> Tomar
                </Button>
              )}
              {puedeDevolver && (
                <Button variant="outline" className="h-10 px-3" onClick={() => setDevolviendo((x) => !x)} disabled={cambiar.isPending} title="Que siga Sofía" aria-label="Devolver a Sofía">
                  <Bot /> <span className="hidden sm:inline">Devolver a Sofía</span>
                </Button>
              )}
              {c.estado !== "cerrada" && (
                <Button variant="outline" className="h-10 px-3" onClick={() => accion("cerrar")} disabled={cambiar.isPending} aria-label="Cerrar la charla">
                  <Lock /> <span className="hidden sm:inline">Cerrar</span>
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-0.5 lg:pl-0">
          <PastillaEstado charla={c} yo={d.yo} />
          {c.estado !== "cerrada" && <PastillaVentana ultimoEntranteAt={c.ultimoEntranteAt} ahora={ahora} />}
        </div>
        {devolviendo && puedeDevolver && (
          <form
            className="flex flex-wrap items-center gap-2 pt-1.5 pb-1"
            onSubmit={(e) => {
              e.preventDefault();
              accion("devolver");
            }}
          >
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={500}
              placeholder="Nota para Sofía (opcional): «ya le expliqué el permiso, que junte el CUIT»"
              aria-label="Nota para Sofía"
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[14px]"
            />
            <Button type="submit" className="h-10" disabled={cambiar.isPending}>
              {cambiar.isPending ? <Loader2 className="animate-spin" /> : <Bot />} Devolver
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={() => setDevolviendo(false)}>Cancelar</Button>
          </form>
        )}
      </header>

      <div ref={cajaRef} className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-3 py-4 sm:px-6">
        <div ref={contenidoRef} className="mx-auto max-w-3xl">
          <HiloCharla items={d.items} nombreCliente={c.nombre?.split(" ")[0] || "Cliente"} />
        </div>
      </div>

      {!d.puedeEditar ? (
        <p className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[13px] text-muted-foreground">Tenés la bandeja en sólo lectura.</p>
      ) : deOtro ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[13.5px] text-muted-foreground">
          La tiene {c.asistente!.nombre}: la ves en sólo lectura.
          <Button variant="outline" className="h-10" onClick={() => accion("tomar", true)} disabled={cambiar.isPending}>Tomarla igual</Button>
        </div>
      ) : (
        <CajaRespuesta charla={c} yo={d.yo} ahora={ahora} numeroConfigurado={d.numeroConfigurado} />
      )}
    </>
  );
}

export default function ClientesWhatsappPage() {
  return (
    <Suspense>
      <Bandeja />
    </Suspense>
  );
}
