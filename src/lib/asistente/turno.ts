// Un turno del asistente: lo que dijo el vendedor → el modelo (con herramientas) → la respuesta.
//
// ES EL MISMO PARA TODOS LOS CANALES (chat, voz, WhatsApp): cambian la entrada y cómo se
// muestra la salida, no el cerebro.
//
// LOOP PROPIO sobre la API de Mensajes en streaming (no el tool runner): cada herramienta se
// ejecuta y su resultado vuelve en el mismo paso, así la historia nunca queda con un pedido de
// herramienta sin respuesta; las escrituras no se ejecutan acá (proponen una acción).
//
// HISTORIA APPEND-ONLY: cada mensaje se guarda tal cual se le mandó a la API y se reenvía
// igual. Es lo que hace que el caché del prefijo sirva de un turno al siguiente y que los
// bloques de razonamiento sigan siendo válidos.

import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fallaDeCuenta, avisarFallaDeCuenta } from "@/lib/permisos-via-publica/falla-ia";
import { leerListaVigente, leerParametros, leerProductos } from "@/lib/parametros-cotizacion/servidor";
import { tarifasDesdeParametros } from "@/lib/cotizador/tarifas";
import { recalcular } from "./borrador";
import {
  agregarMensajes, costoUsd, gastoDelDia, leerBorrador, leerConversacion, leerMensajes, soltarTurno, tomarTurno, vendedorDe,
  leerAccion, type FilaMensaje, type NuevoMensaje,
} from "./datos";
import { contextoDelTurno } from "./prompt";
import { notaDeContinuacion } from "@/lib/voz/continuacion";
import { definicionesParaApi, ejecutarHerramienta, etiquetaDe, resumenCortoBorrador, vistaBorrador, type ContextoHerramientas } from "./herramientas";
import { ejecutarAccion, presentarAcciones, rechazarAccion, vencerAccionesDelTurno, vistaAccion } from "./acciones";
import { crearEjecutor } from "./ejecutores";
import type { Evento } from "./eventos";

const MAX_VUELTAS = 15;
const PRESUPUESTO_MS = 240_000;
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];
type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";
const ESFUERZOS = new Set<string>(["low", "medium", "high", "xhigh", "max"]);

export type Adjunto = { path: string; tipo: string; nombre: string };

export type EntradaTurno =
  | { tipo: "mensaje"; texto: string; adjuntos: Adjunto[]; canal: "web" | "voz" | "whatsapp" }
  | { tipo: "boton"; accionId: string; decision: "confirmar" | "rechazar"; canal: "web" | "whatsapp" }
  | { tipo: "continuar"; canal: "web" | "voz" | "whatsapp" };

type Bloque = Anthropic.Beta.BetaContentBlock;

/** Lo guardado → lo que se le manda a la API, en el mismo orden y con el mismo contenido. */
function paraApi(filas: FilaMensaje[]): Anthropic.Beta.BetaMessageParam[] {
  return filas.map((m) => ({ role: m.rol, content: m.contenido }) as Anthropic.Beta.BetaMessageParam);
}

/** Tras un fallback a mitad de respuesta: lo anterior al último bloque `fallback` que no sea texto no se reenvía ni se ejecuta. */
function limpiarFallback(contenido: Bloque[]): Bloque[] {
  const ultimo = contenido.map((b) => b.type as string).lastIndexOf("fallback");
  if (ultimo < 0) return contenido;
  return contenido.filter((b, i) => i > ultimo || b.type === "text");
}

async function subirAdjuntos(db: SupabaseClient, cliente: Anthropic, adjuntos: Adjunto[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of adjuntos) {
    const { data, error } = await db.storage.from("comercial").download(a.path);
    if (error || !data) continue;
    const buf = Buffer.from(await data.arrayBuffer());
    // Files API: la historia guarda el file_id y no el archivo; una URL firmada vencería.
    const subido = await cliente.files.upload({ file: await toFile(buf, a.nombre, { type: a.tipo }) });
    if (a.tipo === "application/pdf") bloques.push({ type: "document", source: { type: "file", file_id: subido.id }, title: a.nombre });
    else if (a.tipo.startsWith("image/")) bloques.push({ type: "image", source: { type: "file", file_id: subido.id } });
  }
  return bloques;
}

/**
 * Corre un turno completo. Emite eventos para la pantalla; guarda todo en la base.
 * `signal`: si el vendedor corta (o se va), se guarda lo que haya y se termina limpio.
 */
export async function* ejecutarTurno(p: {
  db: SupabaseClient;
  conversacionId: string;
  usuarioId: string;
  entrada: EntradaTurno;
  signal?: AbortSignal;
}): AsyncGenerator<Evento> {
  const { db } = p;
  const conv = await leerConversacion(db, p.conversacionId);
  if (!conv) return yield { t: "error", codigo: "interno", mensaje: "La conversación no existe." };

  if (!(await tomarTurno(db, conv.id))) {
    return yield { t: "error", codigo: "ocupado", mensaje: "Todavía estoy respondiendo el mensaje anterior: esperá un segundo." };
  }

  const turnoId = randomUUID();
  const inicio = Date.now();
  yield { t: "inicio", turnoId };

  try {
    // ── Contexto ──────────────────────────────────────────────────────────────────
    const [parametros, productos, lista, vendedor, historia, gasto] = await Promise.all([
      leerParametros(db), leerProductos(db), leerListaVigente(db), vendedorDe(db, p.usuarioId), leerMensajes(db, conv.id), gastoDelDia(db, p.usuarioId),
    ]);
    const tope = parametros.find((x) => x.clave === "asistente_tope_diario_usd")?.valor ?? null;
    if (tope !== null && gasto >= tope && p.entrada.tipo !== "boton") {
      return yield { t: "error", codigo: "tope", mensaje: `Llegaste al tope de uso de hoy (US$ ${tope}). Se renueva mañana; si hace falta, Joaquín lo puede subir en Parámetros.` };
    }
    const tarifas = tarifasDesdeParametros(parametros);
    const valor = (clave: string, def: number) => parametros.find((x) => x.clave === clave)?.valor ?? def;
    const odoo = {
      impuestoIvaId: valor("odoo_impuesto_iva_id", 88),
      terminoPagoId: valor("odoo_termino_pago_id", 11),
      plantillaMailId: valor("odoo_plantilla_mail_id", 65),
    };
    const listaCalculo = lista ? { id: lista.lista.id, piezas: lista.piezas } : null;
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });

    let borrador = conv.borrador_id ? await leerBorrador(db, conv.borrador_id) : null;
    if (!borrador) throw new Error("La conversación no tiene borrador.");
    if (!borrador.resultado) {
      const resultado = recalcular(borrador.datos, { tarifas, lista: listaCalculo, hoy });
      await db.from("cotizacion_borradores").update({ resultado }).eq("id", borrador.id);
      borrador = { ...borrador, resultado };
    }

    const cliente = new Anthropic();
    let seq = (historia.at(-1)?.seq ?? 0) + 1;
    const mensajes = paraApi(historia);
    const turnoAnteriorId = [...historia].reverse().find((m) => m.rol === "assistant")?.turno_id ?? null;
    let textoVendedor: string | null = null;
    const canal = p.entrada.canal;
    // En voz la espera hasta la primera palabra se nota mucho más que en el chat: se usa el
    // esfuerzo de voz de Parámetros. Cambiar el esfuerzo entre pedidos invalida el caché de los
    // mensajes una vez (al pasar del chat a la voz o al revés); dentro de la charla se recupera.
    const esfuerzoVoz = parametros.find((x) => x.clave === "asistente_esfuerzo_voz")?.texto?.trim();
    const esfuerzo = (canal === "voz" && esfuerzoVoz && ESFUERZOS.has(esfuerzoVoz) ? esfuerzoVoz : conv.esfuerzo) as Esfuerzo;

    const ctx: ContextoHerramientas = {
      db, conversacion: conv, usuarioId: p.usuarioId, vendedor, borrador, tarifas, lista: listaCalculo, productos, odoo,
      turnoId, turnoAnteriorId, textoVendedor: null, canal, hoy, emitir: () => {},
    };

    // Eventos que emiten las herramientas mientras corren: se juntan y se sueltan en orden.
    const pendientes: Evento[] = [];
    ctx.emitir = (e) => pendientes.push(e);

    // ── Entrada del vendedor ──────────────────────────────────────────────────────
    const nuevos: NuevoMensaje[] = [];
    let resultadoBoton: string | null = null;
    let notaVoz: string | null = null;
    // Reparación: si la historia terminó con un pedido de herramienta sin respuesta (no
    // debería pasar: se guardan juntos), se le responde "interrumpido" antes de seguir.
    const ultima = historia.at(-1);
    const huerfanos = ultima?.rol === "assistant" && Array.isArray(ultima.contenido)
      ? (ultima.contenido as Bloque[]).filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      : [];
    const reparacion: Anthropic.Beta.BetaToolResultBlockParam[] = huerfanos.map((b) => ({
      type: "tool_result", tool_use_id: b.id, is_error: true, content: "La respuesta anterior se interrumpió antes de terminar esta herramienta.",
    }));

    if (p.entrada.tipo === "mensaje") {
      textoVendedor = p.entrada.texto.trim();
      if (canal === "voz") notaVoz = notaDeContinuacion([...historia].reverse().find((m) => m.tipo === "humano"), textoVendedor);
      const adjuntos = await subirAdjuntos(db, cliente, p.entrada.adjuntos);
      const contenido: Anthropic.Beta.BetaContentBlockParam[] = [...reparacion, ...adjuntos, { type: "text", text: textoVendedor || "(sin texto)" }];
      nuevos.push({ rol: "user", tipo: "humano", contenido, texto: textoVendedor, canal, turno_id: turnoId, uso: null, modelo_servido: null });
    } else if (p.entrada.tipo === "boton") {
      // El botón se ejecuta ANTES de llamar al modelo: el modelo se entera del resultado.
      const a = await leerAccion(db, p.entrada.accionId);
      if (!a || a.conversacion_id !== conv.id) throw new Error("Esa acción no es de esta conversación.");
      let texto: string;
      let resultado: unknown;
      if (p.entrada.decision === "rechazar") {
        const r = await rechazarAccion(db, a.id, conv.id);
        yield { t: "accion", accion: vistaAccion(r ?? a) };
        texto = `[Botón] Rechacé la acción ${a.numero}.`;
        resultado = { rechazada: !!r };
      } else {
        const ejecutor = crearEjecutor({ db, tarifas, usuarioId: p.usuarioId, vendedorEnPropuesta: vendedor.nombreEnPropuesta, vendedorNombre: vendedor.nombre, emitir: (e) => pendientes.push(e) });
        yield { t: "herramienta", id: a.id, nombre: "confirmar_accion", etiqueta: "Ejecutando lo confirmado", estado: "inicio" };
        const r = await ejecutarAccion(db, a.id, "boton", { usuarioId: p.usuarioId, texto: null }, ejecutor);
        while (pendientes.length) yield pendientes.shift()!;
        yield { t: "herramienta", id: a.id, nombre: "confirmar_accion", etiqueta: "Ejecutando lo confirmado", estado: r.ok ? "ok" : "error" };
        yield { t: "accion", accion: vistaAccion(r.accion) };
        texto = `[Botón] Confirmé la acción ${a.numero}.`;
        resultado = { ejecutada: r.ok, estado: r.accion.estado, resultado: r.accion.resultado, error: r.accion.error, yaEstaba: r.yaEjecutada ?? false };
        const b = await leerBorrador(db, borrador.id);
        if (b) {
          ctx.borrador = b;
          yield { t: "borrador", borrador: vistaBorrador(b) };
        }
      }
      nuevos.push({ rol: "user", tipo: "boton", contenido: [...reparacion, { type: "text", text: texto }], texto, canal, turno_id: turnoId, uso: null, modelo_servido: null });
      // El resultado va en el aviso de sistema (abajo): el vendedor no lo puede escribir, así
      // que no se puede fingir una confirmación tipeando "[Botón] Confirmé…".
      resultadoBoton = `Resultado de la acción ${a.numero} (${p.entrada.decision === "rechazar" ? "rechazada" : "confirmada"} con el botón): ${JSON.stringify(resultado)}`;
    }
    ctx.textoVendedor = textoVendedor;

    if (p.entrada.tipo !== "continuar") {
      const contexto = await contextoDelTurno(db, {
        vendedor, canal, parametrosVersion: conv.parametros_version, resumenBorrador: resumenCortoBorrador(ctx.borrador),
      });
      // Un solo aviso de sistema por turno, justo después del vendedor (así lo pide la API).
      const aviso = [resultadoBoton, notaVoz, contexto].filter(Boolean).join("\n\n");
      nuevos.push({ rol: "system", tipo: "contexto", contenido: aviso, texto: null, canal: null, turno_id: turnoId, uso: null, modelo_servido: null });
      seq = await agregarMensajes(db, conv.id, seq, nuevos);
      mensajes.push(...nuevos.map((m) => ({ role: m.rol, content: m.contenido }) as Anthropic.Beta.BetaMessageParam));
      if (!conv.titulo && textoVendedor) {
        await db.from("asistente_conversaciones").update({ titulo: textoVendedor.slice(0, 70) }).eq("id", conv.id);
      }
    }

    // ── Loop con el modelo ────────────────────────────────────────────────────────
    let costo = 0;
    let stop = "end_turn";
    for (let vuelta = 0; ; vuelta++) {
      if (vuelta >= MAX_VUELTAS || Date.now() - inicio > PRESUPUESTO_MS) {
        yield { t: "continuar" };
        stop = "continuar";
        break;
      }

      const stream = cliente.beta.messages.stream(
        {
          model: conv.modelo,
          max_tokens: 32_000,
          system: conv.system_snapshot,
          tools: definicionesParaApi(),
          messages: mensajes,
          thinking: { type: "adaptive" },
          output_config: { effort: esfuerzo },
          cache_control: { type: "ephemeral" },
          betas: BETAS,
          fallbacks: "default",
          metadata: { user_id: p.usuarioId },
        },
        { signal: p.signal },
      );

      let mensaje: Anthropic.Beta.BetaMessage;
      let pensando = false;
      let textoParcial = "";
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_start") {
            if (ev.content_block.type === "thinking" && !pensando) {
              pensando = true;
              yield { t: "pensando", on: true };
            } else if (ev.content_block.type === "tool_use") {
              yield { t: "herramienta", id: ev.content_block.id, nombre: ev.content_block.name, etiqueta: etiquetaDe(ev.content_block.name), estado: "inicio" };
            }
          } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            if (pensando) {
              pensando = false;
              yield { t: "pensando", on: false };
            }
            textoParcial += ev.delta.text;
            yield { t: "texto", d: ev.delta.text };
          }
        }
        mensaje = await stream.finalMessage();
      } catch (e) {
        if (p.signal?.aborted) {
          // Cortado por el vendedor: se guarda sólo el texto que alcanzó a leer.
          if (textoParcial.trim()) {
            seq = await agregarMensajes(db, conv.id, seq, [{
              rol: "assistant", tipo: "asistente", contenido: [{ type: "text", text: textoParcial }], texto: textoParcial, canal: null,
              turno_id: turnoId, uso: null, modelo_servido: conv.modelo, interrumpido: true,
            }]);
          }
          await vencerAccionesDelTurno(db, conv.id, turnoId);
          return;
        }
        throw e;
      }
      if (pensando) yield { t: "pensando", on: false };

      costo += costoUsd(mensaje.usage as unknown as Record<string, number>, mensaje.model);
      const contenido = limpiarFallback(mensaje.content);

      if (mensaje.stop_reason === "refusal") {
        const texto = contenido.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
        seq = await agregarMensajes(db, conv.id, seq, [{
          rol: "assistant", tipo: "asistente", contenido: [{ type: "text", text: texto || "(sin respuesta)" }], texto, canal: null, turno_id: turnoId,
          uso: mensaje.usage as unknown as Record<string, number>, modelo_servido: mensaje.model,
        }]);
        yield { t: "error", codigo: "rechazo", mensaje: "El modelo no quiso responder eso. Probá decirlo de otra forma." };
        stop = "refusal";
        break;
      }

      const usos = contenido.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const textoAsistente = contenido.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
      const filaAsistente: NuevoMensaje = {
        rol: "assistant", tipo: "asistente", contenido: contenido as unknown as Anthropic.Beta.BetaContentBlockParam[], texto: textoAsistente || null,
        canal: null, turno_id: turnoId, uso: mensaje.usage as unknown as Record<string, number>, modelo_servido: mensaje.model,
      };

      if (mensaje.stop_reason !== "tool_use" || usos.length === 0) {
        seq = await agregarMensajes(db, conv.id, seq, [filaAsistente]);
        mensajes.push({ role: "assistant", content: filaAsistente.contenido } as Anthropic.Beta.BetaMessageParam);
        stop = mensaje.stop_reason ?? "end_turn";
        if (mensaje.stop_reason === "max_tokens") yield { t: "aviso", nivel: "advertencia", texto: "La respuesta se cortó por largo." };
        break;
      }

      // Herramientas: todas las de esta vuelta, sus resultados en UN mensaje.
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of usos) {
        let r;
        try {
          r = await ejecutarHerramienta(u.name, u.input, ctx, u.id);
        } catch (e) {
          const falla = e instanceof Error ? e.message : String(e);
          r = { contenido: `Falló: ${falla}`, esError: true };
        }
        while (pendientes.length) yield pendientes.shift()!;
        resultados.push({ type: "tool_result", tool_use_id: u.id, content: r.contenido, ...(r.esError ? { is_error: true } : {}) });
        yield {
          t: "herramienta", id: u.id, nombre: u.name, etiqueta: etiquetaDe(u.name), estado: r.esError ? "error" : "ok",
          resumen: typeof r.contenido === "string" && r.esError ? r.contenido.slice(0, 200) : undefined,
        };
      }
      const filaResultados: NuevoMensaje = { rol: "user", tipo: "resultados", contenido: resultados, texto: null, canal: null, turno_id: turnoId, uso: null, modelo_servido: null };
      // Juntos o nada: el pedido de herramientas y sus resultados.
      seq = await agregarMensajes(db, conv.id, seq, [filaAsistente, filaResultados]);
      mensajes.push({ role: "assistant", content: filaAsistente.contenido } as Anthropic.Beta.BetaMessageParam, { role: "user", content: resultados });
    }

    if (stop !== "continuar") await presentarAcciones(db, conv.id, turnoId);
    yield { t: "fin", stop, costoUsd: Math.round(costo * 10000) / 10000 };
  } catch (e) {
    const falla = fallaDeCuenta(e);
    if (falla) {
      await avisarFallaDeCuenta(db, falla);
      yield { t: "error", codigo: "cuenta_ia", mensaje: `${falla.motivo}. ${falla.queHacer}` };
    } else {
      console.error("[asistente] turno falló", e);
      yield { t: "error", codigo: "interno", mensaje: e instanceof Error ? e.message : "Algo falló." };
    }
    await vencerAccionesDelTurno(db, conv.id, turnoId);
  } finally {
    await soltarTurno(db, conv.id);
  }
}
