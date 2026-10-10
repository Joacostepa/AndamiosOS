"use client";

// La hoja lateral "Enviar" (§11), por Telegram:
// - "Enviar a los capataces" manda de una vez a todos los vinculados (capataces y
//   choferes). "Enviada" se marca sólo si Telegram contestó que llegó.
// - Por persona: el estado (Enviada / Abierta / Recibida / Cambiada), "Ver mensaje", y
//   para quien no vinculó Telegram el camino a mano ("Copiar mensaje", "Abrir WhatsApp") y
//   "Copiar link para vincular".
// - Después de mandar, "Avisar cambios (n)" sólo a los afectados, o "No hace falta avisar".
// - "Avisar a Ramírez" (opcional, sin link) al que entró a una hoja después de mandarla.

import { useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import type { Preparado } from "@/lib/hoja-dia/envios";
import {
  cuadrillasActivas, destinatarios, estadoEnvio, fechaLarga, fmtFrases, genteDe, hm, hojaDeCuadrilla, nombreDe, nuevosEnHoja,
  pendientesEnvio, persona, cNombre, toMin, type Destinatario, type EstadoEnvio,
} from "@/lib/hoja-dia/estado";
import { mensajeOperario } from "@/lib/hoja-dia/mensajes";
import { linkWhatsapp } from "@/lib/panol/whatsapp";
import { useAccionHoja, useDeshacer, useEnviar, useEnvios } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HojaLateral } from "./hoja-lateral";
import { PRI } from "./boton-coral";
import { BotonVincularTelegram, copiar } from "./vincular-telegram";

const PENDIENTE: EstadoEnvio["k"][] = ["sinenviar", "sinrecibe", "cambiada", "ex", "anulado"];

export function ListaEnvio({
  abierta,
  onCerrar,
  dia,
  ahora,
  resaltar,
  onCargarCelular,
}: {
  abierta: boolean;
  onCerrar: () => void;
  dia: DiaHoja;
  ahora: number;
  /** La persona por la que se abrió ("Avisar a Ortega"). */
  resaltar?: string | null;
  onCargarCelular: (pid: string) => void;
}) {
  const fecha = dia.fecha;
  const envios = useEnvios(fecha, abierta);
  const enviar = useEnviar(fecha);
  const hoja = useAccionHoja(fecha);
  const [verMsg, setVerMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const deshacer = useDeshacer(fecha);
  /** El aviso del gesto, con "Deshacer" si lo tiene. */
  const avisar = (r: { texto: string; historialId: string | null }) =>
    toast(r.texto, r.historialId ? { duration: 9000, action: { label: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) } } : undefined);
  const alarma = toMin(dia.parametros.horaAlarmaNoAbierta) ?? 390;

  const prep = useMemo(() => new Map((envios.data?.filas ?? []).map((f) => [f.pid, f])), [envios.data]);
  const pend = pendientesEnvio(dia);
  const filas = destinatarios(dia).map((x) => ({ x, st: estadoEnvio(dia, x) }));
  const pendientes = filas.filter((r) => PENDIENTE.includes(r.st.k));
  const hechas = filas.filter((r) => r.st.k === "ok" || r.st.k === "okSinAvisar");
  const porTelegram = pendientes.filter((r) => r.x.pid && persona(dia, r.x.pid)?.telegram && dia.telegram.configurado).length;
  const nuevos = cuadrillasActivas(dia).flatMap((c) => nuevosEnHoja(dia, c).map((p) => ({ p, c })));
  const largo = fechaLarga(fecha);
  const titulo = pend.sinEnv ? `Mandar las hojas del ${largo}` : pend.cambios ? `Avisar los cambios del ${largo}` : `Envíos del ${largo}`;
  const sub = pend.sinEnv
    ? "Capataces y choferes. A los que vincularon Telegram les llega sola, todos de una vez; a los demás se la mandás vos por WhatsApp."
    : pend.cambios
      ? "Sólo a los que les cambió algo. El link es el mismo: al abrirlo ven el cambio arriba."
      : "Todo mandado. Acá ves quién la abrió y quién tocó Recibido.";

  const mandarTodos = () =>
    enviar.mutate(
      { accion: "enviar_todos", fecha },
      {
        onSuccess: (r) => {
          const res = r as unknown as { enviados: string[]; aMano: Preparado[]; errores: { pid: string; error: string }[] };
          const n = res.enviados.length;
          const partes = [n ? `${n === 1 ? "1 enviada" : `${n} enviadas`} por Telegram` : "Nada salió por Telegram"];
          if (res.aMano.length) partes.push(`${res.aMano.length} para mandar a mano`);
          if (res.errores.length) partes.push(`${res.errores.length} con error: ${res.errores.map((e) => `${nombreDe(dia, e.pid)} (${e.error})`).join(", ")}`);
          (res.errores.length ? toast.error : toast)(partes.join(" · "), { duration: 9000 });
        },
      },
    );

  const porWhatsapp = async (pid: string, p: Preparado | undefined, reenvio: boolean) => {
    if (!p?.waLink) return;
    window.open(p.waLink, "_blank", "noopener");
    setOcupado(pid);
    enviar.mutate(
      { accion: reenvio ? "reenviar" : "enviar", fecha, personaId: pid, canal: "manual" },
      { onSettled: () => setOcupado(null), onSuccess: avisar },
    );
  };
  const porTelegramUno = (pid: string, reenvio: boolean) => {
    setOcupado(pid);
    enviar.mutate(
      { accion: reenvio ? "reenviar" : "enviar", fecha, personaId: pid, canal: "telegram" },
      {
        onSettled: () => setOcupado(null),
        onSuccess: (r) => {
          if (r.enviado === false) {
            const wa = r.waLink;
            toast.error(r.texto, { duration: 12_000, action: wa ? { label: "Abrir WhatsApp", onClick: () => window.open(wa, "_blank", "noopener") } : undefined });
          } else avisar(r);
        },
      },
    );
  };

  const fila = ({ x, st }: { x: Destinatario; st: EstadoEnvio }) => {
    if (!x.pid) {
      const h = x.c != null ? hojaDeCuadrilla(dia, x.c) : null;
      return (
        <div key={`c-${x.c}`} className="grid gap-1.5 rounded-[10px] border border-foreground/20 bg-hd-card2 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-[170px] flex-1 text-sm">
              <b className="font-semibold">{cNombre(dia, x.c)}</b> <span className="text-muted-foreground">· sin nadie a cargo</span>
            </span>
            <select
              aria-label="Quién recibe la hoja"
              className="h-8 rounded-md border border-input bg-card px-2 text-[13px]"
              defaultValue=""
              onChange={(e) => e.target.value && x.c != null && hoja.mutate({ accion: "recibe", fecha, cuadrilla: x.c, personaId: e.target.value })}
            >
              <option value="">Elegir quién recibe…</option>
              {(h ? genteDe(h) : []).filter((g) => persona(dia, g)?.celular || persona(dia, g)?.telegram).map((g) => (
                <option key={g} value={g}>{nombreDe(dia, g)}</option>
              ))}
            </select>
          </div>
          <div className="text-[12.5px] text-muted-foreground">Se puede mandar igual: elegí a uno de los que van para que le llegue la hoja.</div>
        </div>
      );
    }
    const pid = x.pid;
    const p = prep.get(pid);
    const pr = persona(dia, pid);
    const tg = !!pr?.telegram && dia.telegram.configurado;
    const e = "e" in st ? st.e : null;
    const enviada = e?.enviadaMin != null;
    const nombre = nombreDe(dia, pid);
    const quien = (p?.fila ?? nombre).replace(new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · `), "").replace(/ · sin celular cargado$/, "");
    const pendiente = PENDIENTE.includes(st.k);
    const sinCanal = !pr?.celular && !tg;

    let estado: React.ReactNode;
    if (sinCanal) estado = <span className="font-semibold text-hd-rojo">sin celular ni Telegram</span>;
    else if (st.k === "sinenviar") estado = <>Sin enviar · {tg ? "por Telegram" : <span>sin Telegram vinculado</span>}</>;
    else if (st.k === "anulado" && e) estado = <><span className="font-semibold text-hd-rojo">Link anulado</span> · hay que mandarle uno nuevo</>;
    else if ((st.k === "cambiada" || st.k === "ex") && e) {
      estado = e.recibidaMin != null ? `${e.cambioMin != null ? "Entendido" : "Recibida"} ${hm(e.recibidaMin)} · después cambió` : `Enviada ${hm(e.enviadaMin ?? 0)} · después cambió`;
    } else if (e) {
      const partes: React.ReactNode[] = [];
      partes.push(e.cambioMin != null ? `Cambio enviado ${hm(e.cambioMin)}` : `Enviada ${hm(e.enviadaMin ?? 0)}${e.enviadaCanal === "telegram" ? " por Telegram" : " a mano"}`);
      if (e.reenviadaMin != null) partes.push(`reenviada ${hm(e.reenviadaMin)}`);
      if (e.abiertaMin != null && (e.cambioMin == null || e.abiertaMin >= e.cambioMin)) partes.push(`abierta ${hm(e.abiertaMin)}`);
      if (e.recibidaMin != null && (e.cambioMin == null || e.recibidaMin >= e.cambioMin)) partes.push(<span key="r" className="font-semibold text-hd-verde">{e.cambioMin != null ? "Entendido" : "Recibida"} {hm(e.recibidaMin)}</span>);
      if (st.k === "okSinAvisar") partes.push(<span key="s" className="font-semibold">cambio de las {hm(e.okMin ?? ahora)} sin avisar</span>);
      if (e.abiertaMin == null && ahora >= alarma) partes.push(<span key="n" className="font-semibold text-hd-rojo">no la abrió</span>);
      estado = partes.map((pp, i) => <span key={i}>{i > 0 && " · "}{pp}</span>);
    }

    const cargando = ocupado === pid;
    return (
      <div
        key={pid}
        id={`env-${pid}`}
        className={cn("grid gap-1.5 rounded-[10px] border bg-hd-card2 px-3 py-2.5", (resaltar === pid || verMsg === pid) && "border-foreground/30 ring-1 ring-hd-ctx/40")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-[170px] flex-1 text-sm">
            <b className="font-semibold">{nombre}</b> <span className="text-muted-foreground">· {quien}</span>
          </span>
          {sinCanal ? (
            <Button size="sm" variant="outline" onClick={() => onCargarCelular(pid)}>Cargar celular</Button>
          ) : pendiente ? (
            <>
              {tg ? (
                <Button size="sm" variant="outline" disabled={cargando} onClick={() => porTelegramUno(pid, false)}>
                  {cargando ? <Loader2 className="animate-spin" /> : <Send />} Enviar por Telegram
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled={!p?.texto} onClick={async () => p?.texto && toast((await copiar(p.texto)) ? `Mensaje para ${nombre} copiado` : "No se pudo copiar")}>
                    Copiar mensaje
                  </Button>
                  <Button size="sm" variant="outline" disabled={!p?.waLink || cargando} onClick={() => porWhatsapp(pid, p, false)}>
                    Abrir WhatsApp
                  </Button>
                </>
              )}
              {st.k === "cambiada" && (
                <Button size="sm" variant="ghost" onClick={() => enviar.mutate({ accion: "no_hace_falta", fecha, personaId: pid }, { onSuccess: avisar })}>
                  No hace falta avisar
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={cargando} onClick={() => (tg ? porTelegramUno(pid, true) : porWhatsapp(pid, p, true))}>
              Reenviar
            </Button>
          )}
        </div>
        {st.k === "cambiada" && <div className="text-[13px] font-medium text-hd-ambar">{fmtFrases(st.ds, true)}</div>}
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span>{estado}</span>
          <span className="ml-auto flex flex-wrap gap-2.5">
            {!tg && dia.telegram.configurado && !sinCanal && <BotonVincularTelegram personaId={pid} nombre={nombre} size="xs" className="text-xs text-muted-foreground" />}
            {enviada && e && !e.anulado && st.k !== "ex" && (
              <button type="button" className="text-xs underline decoration-foreground/30 underline-offset-[3px] hover:decoration-current" onClick={() => enviar.mutate({ accion: "anular_link", fecha, personaId: pid }, { onSuccess: avisar })}>
                Anular link
              </button>
            )}
            <button
              type="button"
              aria-expanded={verMsg === pid}
              className="text-xs underline decoration-foreground/30 underline-offset-[3px] hover:decoration-current"
              onClick={() => setVerMsg(verMsg === pid ? null : pid)}
            >
              {verMsg === pid ? "Ocultar mensaje" : "Ver mensaje"}
            </button>
          </span>
        </div>
        {verMsg === pid && (
          <div className="rounded-[10px_10px_10px_2px] border bg-accent px-3 py-2 text-[13px] break-words whitespace-pre-wrap">
            {envios.isLoading ? "Armando el mensaje…" : p?.texto ?? "No hay mensaje para mandar."}
          </div>
        )}
      </div>
    );
  };

  const filaOperario = ({ p, c }: { p: string; c: number }) => {
    const pr = persona(dia, p);
    const tg = !!pr?.telegram && dia.telegram.configurado;
    const msg = mensajeOperario(dia, p, ahora) ?? "";
    const wa = linkWhatsapp(pr?.celular, msg);
    return (
      <div key={`op-${p}`} className="grid gap-1.5 rounded-[10px] border bg-hd-card2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-[170px] flex-1 text-sm">
            <b className="font-semibold">Avisar a {nombreDe(dia, p)}</b> <span className="text-muted-foreground">· entra a la {cNombre(dia, c)} · opcional, sin link</span>
          </span>
          {tg ? (
            <Button size="sm" variant="outline" onClick={() => enviar.mutate({ accion: "avisar_operario", fecha, personaId: p, canal: "telegram" }, { onSuccess: avisar })}>
              Enviar por Telegram
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={!wa}
              onClick={() => {
                if (wa) window.open(wa, "_blank", "noopener");
                enviar.mutate({ accion: "avisar_operario", fecha, personaId: p, canal: "manual" }, { onSuccess: avisar });
              }}
            >
              Abrir WhatsApp
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => enviar.mutate({ accion: "avisar_operario", fecha, personaId: p, canal: "no_hace_falta" }, { onSuccess: avisar })}>
            No hace falta
          </Button>
        </div>
        <div className="rounded-[10px_10px_10px_2px] border bg-accent px-3 py-2 text-[13px] whitespace-pre-wrap">{msg}</div>
      </div>
    );
  };

  return (
    <HojaLateral
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={titulo}
      sub={sub}
      pie={
        <>
          <span className="mr-auto flex-[1_1_200px] text-xs text-muted-foreground">
            {dia.telegram.configurado
              ? "«Enviada» se marca sólo cuando Telegram confirma que llegó. Lo que mandás por WhatsApp lo marca la app al abrirlo: si no lo mandaste, tocá Deshacer."
              : "Telegram no está configurado: todo se manda a mano por WhatsApp."}
          </span>
          <Button variant="outline" onClick={onCerrar}>Listo</Button>
        </>
      }
    >
      {(pend.sinEnv > 0 || pend.cambios > 0) && dia.telegram.configurado && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border bg-hd-card2 px-3 py-2.5">
          <span className="flex-1 text-[13px] text-muted-foreground">
            {porTelegram ? `${porTelegram === 1 ? "1 tiene" : `${porTelegram} tienen`} Telegram vinculado: les llega sola.` : "Nadie de la lista tiene Telegram vinculado."}
          </span>
          <Button disabled={!porTelegram || enviar.isPending} onClick={mandarTodos} className={cn(PRI, "max-md:h-11 max-md:w-full")}>
            {enviar.isPending && !ocupado ? <Loader2 className="animate-spin" /> : <Send />}
            {pend.sinEnv ? "Enviar a los capataces" : `Avisar cambios (${pend.cambios})`}
          </Button>
        </div>
      )}
      {envios.isError && <p className="text-[13px] text-hd-rojo">No se pudo armar la lista: {(envios.error as Error).message}</p>}
      {pendientes.map(fila)}
      {nuevos.length > 0 && (
        <>
          <div className="mt-1.5 text-[11px] font-semibold tracking-[.07em] text-muted-foreground uppercase">Gente nueva en una hoja</div>
          {nuevos.map(filaOperario)}
        </>
      )}
      {hechas.length > 0 && (
        <>
          <div className="mt-1.5 text-[11px] font-semibold tracking-[.07em] text-muted-foreground uppercase">{pendientes.length ? "Ya mandadas" : "Mandadas"}</div>
          {hechas.map(fila)}
        </>
      )}
      {dia.operariosAvisados.length > 0 && (
        <p className="text-xs text-muted-foreground">También se avisó a {dia.operariosAvisados.map((p) => nombreDe(dia, p)).join(", ")} (mensaje sin link).</p>
      )}
    </HojaLateral>
  );
}
