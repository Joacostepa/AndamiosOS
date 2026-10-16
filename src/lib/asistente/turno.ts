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
  leerAccion, type Conversacion, type FilaMensaje, type NuevoMensaje,
} from "./datos";
import { cambiosDeParametros, contextoDelTurno } from "./prompt";
import { novedadesParaCharla } from "./novedades";
import { tandasDeHerramientas } from "./tandas";
import {
  LIMITE_MS, PRESUPUESTO_MS, armarPedido, cierreFaltante, esAtado, esfuerzoValido, limpiarFallback, reparacionHuerfanos, senalDelPedido,
  type Esfuerzo,
} from "@/lib/ia/nucleo";
import { notaDeContinuacion } from "@/lib/voz/continuacion";
import {
  definicionesParaApi, ejecutarHerramienta, etiquetaDe, resumenCortoBorrador, vistaBorrador, type ContextoHerramientas,
  type ResultadoHerramienta,
} from "./herramientas";
import { HERRAMIENTAS_OCULTAS, resultadoWebConError } from "./respuesta";
import { destrabarAcciones, ejecutarAccion, presentarAcciones, rechazarAccion, vencerAccionesDelTurno, vistaAccion } from "./acciones";
import { crearEjecutor } from "./ejecutores";
import type { Evento } from "./eventos";

const MAX_VUELTAS = 15;
/** Guardar en Odoo llegó a tardar 24 s (más el PDF): no se arranca si queda menos que esto. */
const MARGEN_ESCRITURA_MS = 90_000;
// El respaldo de modelo, el pensamiento atado (block_binding), las notas de progreso, el plazo
// duro de 265 s y el costo viven en el núcleo compartido con Sofía (src/lib/ia/nucleo.ts).

export type Adjunto = { path: string; tipo: string; nombre: string };

export type EntradaTurno =
  | { tipo: "mensaje"; texto: string; adjuntos: Adjunto[]; canal: "web" | "voz" | "whatsapp" }
  // "reintentar": la misma acción que quedó en error o incierta (botón Reintentar de la tarjeta).
  | { tipo: "boton"; accionId: string; decision: "confirmar" | "rechazar" | "reintentar"; canal: "web" | "whatsapp" }
  | { tipo: "continuar"; canal: "web" | "voz" | "whatsapp" };

/** Lo guardado → lo que se le manda a la API, en el mismo orden y con el mismo contenido. */
function paraApi(filas: FilaMensaje[]): Anthropic.Beta.BetaMessageParam[] {
  return filas.map((m) => ({ role: m.rol, content: m.contenido }) as Anthropic.Beta.BetaMessageParam);
}

async function subirAdjuntos(db: SupabaseClient, cliente: Anthropic, adjuntos: Adjunto[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  // Todos a la vez (varias fotos de una obra tardaban una tras otra); el orden se mantiene.
  const bloques = await Promise.all(adjuntos.map(async (a): Promise<Anthropic.Beta.BetaContentBlockParam | null> => {
    const { data, error } = await db.storage.from("comercial").download(a.path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    // Files API: la historia guarda el file_id y no el archivo; una URL firmada vencería.
    const subido = await cliente.files.upload({ file: await toFile(buf, a.nombre, { type: a.tipo }) });
    if (a.tipo === "application/pdf") return { type: "document", source: { type: "file", file_id: subido.id }, title: a.nombre };
    if (a.tipo.startsWith("image/")) return { type: "image", source: { type: "file", file_id: subido.id } };
    return null;
  }));
  return bloques.filter((b): b is Anthropic.Beta.BetaContentBlockParam => b !== null);
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
  /** Si la ruta ya la leyó (chat), no se lee de nuevo. */
  conversacion?: Conversacion;
}): AsyncGenerator<Evento> {
  const { db } = p;
  const conv = p.conversacion?.id === p.conversacionId ? p.conversacion : await leerConversacion(db, p.conversacionId);
  if (!conv) return yield { t: "error", codigo: "interno", mensaje: "La conversación no existe." };

  if (!(await tomarTurno(db, conv.id))) {
    return yield { t: "error", codigo: "ocupado", mensaje: "Todavía estoy respondiendo el mensaje anterior: esperá un segundo." };
  }

  const turnoId = randomUUID();
  const inicio = Date.now();
  await destrabarAcciones(db, conv.id);
  yield { t: "inicio", turnoId };

  try {
    // ── Contexto ──────────────────────────────────────────────────────────────────
    // Todo lo que no depende de otra cosa, junto: el borrador y los cambios de Parámetros también.
    const [parametros, productos, lista, vendedor, historia, gasto, borradorLeido, cambiosParametros] = await Promise.all([
      leerParametros(db), leerProductos(db), leerListaVigente(db), vendedorDe(db, p.usuarioId), leerMensajes(db, conv.id), gastoDelDia(db, p.usuarioId),
      conv.borrador_id ? leerBorrador(db, conv.borrador_id) : Promise.resolve(null),
      p.entrada.tipo === "continuar" ? Promise.resolve([]) : cambiosDeParametros(db, conv.parametros_version),
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

    let borrador = borradorLeido;
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
    // Si el turno anterior se cortó antes de que el modelo contestara, la historia terminó en el
    // aviso de sistema y la API rechazaría lo que sigue: se cierra con una fila del asistente.
    // En "continuar" no: ahí lo último tiene que ser el aviso o el vendedor (no hay prefill).
    const cierre = p.entrada.tipo === "continuar" ? null : cierreFaltante(historia);
    if (cierre) {
      const fila: NuevoMensaje = {
        rol: "assistant", tipo: "asistente", contenido: [{ type: "text", text: cierre.texto }], texto: cierre.texto, canal: null,
        turno_id: cierre.turno_id, uso: null, modelo_servido: conv.modelo, interrumpido: true,
      };
      seq = await agregarMensajes(db, conv.id, seq, [fila]);
      mensajes.push({ role: "assistant", content: fila.contenido } as Anthropic.Beta.BetaMessageParam);
    }
    let textoVendedor: string | null = null;
    const canal = p.entrada.canal;
    // En voz la espera hasta la primera palabra se nota mucho más que en el chat: se usa el
    // esfuerzo de voz de Parámetros. Cambiar el esfuerzo entre pedidos invalida el caché de los
    // mensajes una vez (al pasar del chat a la voz o al revés); dentro de la charla se recupera.
    const esfuerzoVoz = parametros.find((x) => x.clave === "asistente_esfuerzo_voz")?.texto?.trim();
    const esfuerzo = (canal === "voz" && esfuerzoVoz ? esfuerzoValido(esfuerzoVoz, conv.esfuerzo as Esfuerzo) : conv.esfuerzo) as Esfuerzo;
    // Sólo en los modelos que atan el pensamiento (nucleo.ts): a las charlas de Opus 5 no les
    // cambia el pedido (ni pierden el caché). Las notas de progreso se piden siempre ahí.
    const atado = esAtado(conv.modelo);

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
    const reparacion = reparacionHuerfanos(historia.at(-1));

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
      const reintento = p.entrada.decision === "reintentar";
      if (p.entrada.decision === "rechazar") {
        const r = await rechazarAccion(db, a.id, conv.id);
        yield { t: "accion", accion: vistaAccion(r ?? a) };
        texto = `[Botón] Rechacé la acción ${a.numero}.`;
        resultado = { rechazada: !!r };
      } else {
        const ejecutor = crearEjecutor({ db, tarifas, usuarioId: p.usuarioId, vendedorEnPropuesta: vendedor.nombreEnPropuesta, vendedorNombre: vendedor.nombre, emitir: (e) => pendientes.push(e) });
        const etiqueta = reintento ? "Reintentando" : "Ejecutando lo confirmado";
        yield { t: "herramienta", id: a.id, nombre: "confirmar_accion", etiqueta, estado: "inicio" };
        const r = await ejecutarAccion(db, a.id, "boton", { usuarioId: p.usuarioId, texto: null }, ejecutor, { reintento });
        while (pendientes.length) yield pendientes.shift()!;
        yield { t: "herramienta", id: a.id, nombre: "confirmar_accion", etiqueta, estado: r.ok ? "ok" : "error", ...(r.motivo ? { resumen: r.motivo } : {}) };
        yield { t: "accion", accion: vistaAccion(r.accion) };
        texto = `[Botón] ${reintento ? "Reintenté" : "Confirmé"} la acción ${a.numero}.`;
        resultado = {
          ejecutada: r.ok, estado: r.accion.estado, resultado: r.accion.resultado, error: r.accion.error, yaEstaba: r.yaEjecutada ?? false,
          ...(r.motivo ? { noSeReintento: r.motivo } : {}),
        };
        const b = await leerBorrador(db, borrador.id);
        if (b) {
          ctx.borrador = b;
          yield { t: "borrador", borrador: vistaBorrador(b) };
        }
      }
      nuevos.push({ rol: "user", tipo: "boton", contenido: [...reparacion, { type: "text", text: texto }], texto, canal, turno_id: turnoId, uso: null, modelo_servido: null });
      // El resultado va en el aviso de sistema (abajo): el vendedor no lo puede escribir, así
      // que no se puede fingir una confirmación tipeando "[Botón] Confirmé…".
      const como = { rechazar: "rechazada", confirmar: "confirmada", reintentar: "reintentada" }[p.entrada.decision];
      resultadoBoton = `Resultado de la acción ${a.numero} (${como} con el botón): ${JSON.stringify(resultado)}`;
    }
    ctx.textoVendedor = textoVendedor;

    if (p.entrada.tipo !== "continuar") {
      const contexto = contextoDelTurno({
        vendedor, canal, resumenBorrador: resumenCortoBorrador(ctx.borrador), cambiosParametros,
        // Las instrucciones se congelan por conversación: lo que se agregó después se cuenta acá.
        novedades: novedadesParaCharla(conv.system_snapshot),
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

      const { plazo, senal } = senalDelPedido(inicio, p.signal);
      const stream = cliente.beta.messages.stream(
        armarPedido({
          modelo: conv.modelo,
          maxTokens: 32_000,
          system: conv.system_snapshot,
          tools: definicionesParaApi(),
          messages: mensajes,
          esfuerzo,
          usuarioId: p.usuarioId,
          progreso: true,
        }),
        { signal: senal },
      );

      let mensaje: Anthropic.Beta.BetaMessage;
      let pensando = false;
      let textoParcial = "";
      // Búsquedas en internet (herramientas del servidor): el input llega de a pedazos; al
      // cerrarse el bloque ya se sabe qué buscó y la etiqueta lo dice.
      const web = new Map<number, { id: string; nombre: string; json: string }>();
      const etiquetasWeb = new Map<string, { nombre: string; etiqueta: string }>();
      // Bloques de pensamiento abiertos, por índice: con "updates", el texto es el progreso.
      const notas = new Map<number, string>();
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_start") {
            const b = ev.content_block;
            if (b.type === "thinking") {
              if (atado) notas.set(ev.index, "");
              if (!pensando) {
                pensando = true;
                yield { t: "pensando", on: true };
              }
            } else if (b.type === "tool_use") {
              yield { t: "herramienta", id: b.id, nombre: b.name, etiqueta: etiquetaDe(b.name), estado: "inicio" };
            } else if (b.type === "server_tool_use" && !HERRAMIENTAS_OCULTAS.has(b.name)) {
              web.set(ev.index, { id: b.id, nombre: b.name, json: "" });
              etiquetasWeb.set(b.id, { nombre: b.name, etiqueta: etiquetaDe(b.name) });
              yield { t: "herramienta", id: b.id, nombre: b.name, etiqueta: etiquetaDe(b.name), estado: "inicio" };
            } else if ("tool_use_id" in b && b.type.endsWith("_tool_result") && etiquetasWeb.has(b.tool_use_id)) {
              const { nombre, etiqueta } = etiquetasWeb.get(b.tool_use_id)!;
              yield { t: "herramienta", id: b.tool_use_id, nombre, etiqueta, estado: resultadoWebConError(b) ? "error" : "ok" };
            }
          } else if (ev.type === "content_block_delta" && ev.delta.type === "thinking_delta" && notas.has(ev.index)) {
            notas.set(ev.index, notas.get(ev.index)! + ev.delta.thinking);
          } else if (ev.type === "content_block_stop" && notas.has(ev.index)) {
            // Una nota entre herramientas: se manda entera al cerrarse (una o dos oraciones). Un
            // bloque vacío es razonamiento oculto: no se muestra nada.
            const texto = notas.get(ev.index)!.trim();
            notas.delete(ev.index);
            if (texto) yield { t: "progreso", texto };
          } else if (ev.type === "content_block_delta" && ev.delta.type === "input_json_delta" && web.has(ev.index)) {
            web.get(ev.index)!.json += ev.delta.partial_json;
          } else if (ev.type === "content_block_stop" && web.has(ev.index)) {
            const w = web.get(ev.index)!;
            let input: unknown = {};
            try {
              input = JSON.parse(w.json || "{}");
            } catch {
              // sin el input queda la etiqueta genérica
            }
            const etiqueta = etiquetaDe(w.nombre, input);
            etiquetasWeb.set(w.id, { nombre: w.nombre, etiqueta });
            yield { t: "herramienta", id: w.id, nombre: w.nombre, etiqueta, estado: "inicio" };
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
        if (plazo.aborted) {
          // Se pasó del plazo: se guarda lo que alcanzó a escribir y el turno termina limpio.
          // No se sigue solo ("continuar"): la historia terminaría en el asistente.
          if (textoParcial.trim()) {
            seq = await agregarMensajes(db, conv.id, seq, [{
              rol: "assistant", tipo: "asistente", contenido: [{ type: "text", text: textoParcial }], texto: textoParcial, canal: null,
              turno_id: turnoId, uso: null, modelo_servido: conv.modelo, interrumpido: true,
            }]);
          }
          yield { t: "aviso", nivel: "advertencia", texto: "La respuesta tardó demasiado y se cortó. Pedímelo de nuevo, si podés en partes." };
          stop = "plazo";
          break;
        }
        throw e;
      }
      if (pensando) yield { t: "pensando", on: false };

      costo += costoUsd(mensaje.usage as unknown as Record<string, unknown>, conv.modelo);
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

      // La búsqueda en internet llegó al tope de pasos del lado de Anthropic: se reenvía la
      // respuesta tal cual (termina en la búsqueda pendiente) y la API sigue desde ahí.
      if (mensaje.stop_reason === "pause_turn") {
        seq = await agregarMensajes(db, conv.id, seq, [filaAsistente]);
        mensajes.push({ role: "assistant", content: filaAsistente.contenido } as Anthropic.Beta.BetaMessageParam);
        continue;
      }

      if (mensaje.stop_reason !== "tool_use" || usos.length === 0) {
        seq = await agregarMensajes(db, conv.id, seq, [filaAsistente]);
        mensajes.push({ role: "assistant", content: filaAsistente.contenido } as Anthropic.Beta.BetaMessageParam);
        stop = mensaje.stop_reason ?? "end_turn";
        if (mensaje.stop_reason === "max_tokens") yield { t: "aviso", nivel: "advertencia", texto: "La respuesta se cortó por largo." };
        break;
      }

      // Herramientas: todas las de esta vuelta, sus resultados en UN mensaje y en el mismo orden.
      // Las de sólo lectura seguidas corren a la vez (tres búsquedas en Odoo no se esperan una a
      // la otra); las que tocan el borrador o las acciones, de a una y en orden.
      const correr = async (u: Anthropic.Beta.BetaToolUseBlock): Promise<ResultadoHerramienta> => {
        try {
          return u.name === "confirmar_accion" && Date.now() - inicio > LIMITE_MS - MARGEN_ESCRITURA_MS
            ? { contenido: "Este turno ya lleva mucho tiempo y guardar puede tardar: no se ejecutó nada. Pedile al vendedor que toque Confirmar en la tarjeta.", esError: true }
            : await ejecutarHerramienta(u.name, u.input, ctx, u.id);
        } catch (e) {
          const falla = e instanceof Error ? e.message : String(e);
          return { contenido: `Falló: ${falla}`, esError: true };
        }
      };
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tanda of tandasDeHerramientas(usos)) {
        const rs = await Promise.all(tanda.map(correr));
        while (pendientes.length) yield pendientes.shift()!;
        for (const [k, u] of tanda.entries()) {
          const r = rs[k];
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: r.contenido, ...(r.esError ? { is_error: true } : {}) });
          yield {
            t: "herramienta", id: u.id, nombre: u.name, etiqueta: etiquetaDe(u.name), estado: r.esError ? "error" : "ok",
            resumen: typeof r.contenido === "string" && r.esError ? r.contenido.slice(0, 200) : undefined,
          };
        }
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
