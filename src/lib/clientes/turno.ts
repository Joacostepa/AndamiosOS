// Un turno de Sofía: lo que escribió el cliente → el modelo (con sus 7 herramientas) → el filtro
// de salida → WhatsApp. Con tests y un Claude simulado (turno.test.ts).
//
// ARRIBA DEL NÚCLEO COMPARTIDO (src/lib/ia/nucleo.ts): el mismo respaldo de modelo,
// block_binding, plazo de 265 s, reparación de la historia y costo que el asistente comercial.
// Cambia lo de alrededor:
//   · no hay pantalla que mire: no hay streaming de eventos, el turno termina en un mensaje de
//     WhatsApp (o en ninguno);
//   · SÓLO HABLA SI LA CHARLA ESTÁ EN «bot». Si una persona la toma (humano), Sofía se calla, aun
//     a mitad de un turno: antes de mandar se vuelve a leer el estado;
//   · TODO LO QUE ESCRIBE EL MODELO PASA POR EL FILTRO DE SALIDA (filtro-salida.ts). Si
//     encuentra plata, un link o que niega ser una IA, no sale: queda un aviso para la bandeja
//     (texto_bloqueado) y la charla pasa a «Espera tu OK»;
//   · el saludo lo manda el código, una vez, antes del modelo (saludo.ts);
//   · lo pendiente (precio, técnico) lo registran las herramientas y la charla pasa a «Espera tu
//     OK»; una derivación la pasa a «Sin tomar». En los dos casos Sofía manda su último mensaje y
//     no sigue: la toma una persona (o la devuelve con «Devolver a Sofía»);
//   · ante un error técnico, un texto fijo («te escribe una persona en un rato») y pasa a una
//     persona: nunca se reintenta en silencio delante del cliente (§6).
//
// HISTORIA APPEND-ONLY (cli_api_mensajes), como el asistente: cada mensaje se guarda tal cual se
// le mandó a la API y se reenvía igual (caché y bloques de razonamiento). Lo que escribe una
// persona del equipo entra en el aviso de sistema del turno, nunca como mensaje del cliente: un
// cliente no puede fingir ser del equipo escribiendo «Sandra: te autorizo…».
//
// QUÉ ES «NUEVO» PARA SOFÍA: lo del hilo (cli_hilo) después de `ia_leido_hasta`. Así, si llegan
// dos mensajes seguidos, el segundo lo levanta el mismo turno (o el siguiente), y si la charla
// la tuvo una persona, al devolverla Sofía ve lo que pasó en el medio.
//
// Sin base, sin red y sin el SDK: todo lo de afuera llega en `DepsSofia` (agente.ts lo arma con
// Supabase, Anthropic, Meta, el catastro y Odoo).

import type Anthropic from "@anthropic-ai/sdk";
import {
  PRESUPUESTO_MS, armarPedido, cierreFaltante, costoUsd, limpiarFallback, reparacionHuerfanos, senalDelPedido, textoDe,
} from "../ia/nucleo.ts";
import type { ConfigSofia } from "./config.ts";
import { ahoraLegible, atencion, describirHorario } from "./horario.ts";
import { NADA, contextoDelTurno, sistemaSofia } from "./prompt.ts";
import { esSoloSaludo, saludoInicial, textoSeguridad, TEXTO_ERROR, TEXTO_PASO_A_PERSONA } from "./saludo.ts";
import { revisarSalida, type HallazgoSalida } from "./filtro-salida.ts";
import { puedeTextoLibre } from "./ventana.ts";
import { palabraGamaAlta } from "./facil.ts";
import {
  definicionesSofia, ejecutarHerramientaSofia, type FichaSofia, type ServiciosSofia,
} from "./herramientas.ts";
import type { EstadoCharla } from "./vista.ts";

const MAX_VUELTAS = 8;
/** Cuántas tandas de mensajes nuevos atiende un mismo turno (si siguen llegando mientras contesta). */
const MAX_TANDAS = 3;
const MAX_TOKENS = 8_000;

// ── Lo de afuera ───────────────────────────────────────────────────────────────────────

export type CharlaSofia = {
  id: string;
  telefono: string;
  nombrePerfil: string | null;
  estado: EstadoCharla;
  ficha: FichaSofia;
  ultimoEntranteAt: string | null;
  /** created_at del último item del hilo que ya vio Sofía. */
  iaLeidoHasta: string | null;
  iaSaludoAt: string | null;
};

/** Un item del hilo posterior al cursor: lo del cliente, y lo que escribió o hizo una persona. */
export type ItemNuevo = {
  id: string;
  direccion: "entrante" | "saliente" | "evento";
  autor: "cliente" | "persona" | "sistema" | "ia" | "plantilla";
  autorNombre: string | null;
  tipo: string;
  texto: string | null;
  transcripcion: string | null;
  /** El adjunto como está en el hilo (sólo importa si es audio sin transcribir o ubicación). */
  adjunto: Record<string, unknown> | null;
  /** created_at: el cursor. */
  creado: string;
  /** momento: la hora para mostrar. */
  momento: string;
};

export type FilaHistoria = {
  seq: number;
  rol: "user" | "assistant" | "system";
  contenido: Anthropic.Beta.BetaMessageParam["content"];
  turno_id: string | null;
  enviado: boolean | null;
  nota: string | null;
};

export type NuevaFila = {
  rol: "user" | "assistant" | "system";
  tipo: "cliente" | "resultados" | "contexto" | "asistente";
  contenido: Anthropic.Beta.BetaMessageParam["content"];
  texto: string | null;
  turno_id: string;
  uso: Record<string, unknown> | null;
  modelo_servido: string | null;
  costo_usd: number;
  interrumpido?: boolean;
  /** Sólo en la respuesta final: si le llegó al cliente. */
  enviado?: boolean | null;
  /** Por qué no le llegó (bloqueado, la tomó una persona, ventana cerrada). */
  nota?: string | null;
};

export type RepoSofia = {
  leerCharla(id: string): Promise<CharlaSofia | null>;
  tomarTurno(id: string): Promise<boolean>;
  soltarTurno(id: string): Promise<void>;
  nuevosDelHilo(id: string, desde: string | null): Promise<ItemNuevo[]>;
  avanzarCursor(id: string, hasta: string): Promise<void>;
  marcarSaludo(id: string): Promise<void>;
  leerHistoria(id: string): Promise<FilaHistoria[]>;
  /** Agrega al final, en un solo insert. Devuelve el seq siguiente. */
  agregarHistoria(id: string, seq: number, filas: NuevaFila[]): Promise<number>;
  guardarFicha(id: string, ficha: FichaSofia): Promise<void>;
  /**
   * Pasa la charla de «bot» a otro estado, sólo si sigue en «bot» (o en el que dejó este mismo
   * turno). false si alguien la cambió antes.
   */
  cambiarEstado(id: string, estado: "espera_ok" | "derivada", motivo: string, desde: EstadoCharla[]): Promise<boolean>;
  sumarCosto(id: string, usd: number): Promise<void>;
  /** Gasto de hoy (Buenos Aires): de este teléfono y de todas las charlas. */
  gastoHoy(telefono: string): Promise<{ telefono: number; global: number }>;
  /** Lo pendiente de esta charla, en palabras y sin montos («cotización #12: pendiente de revisión»). */
  pendientes(id: string): Promise<string[]>;
  /** El aviso para la bandeja: cli_aprobaciones tipo texto_bloqueado. */
  registrarBloqueo(id: string, texto: string, motivo: string, hallazgos: HallazgoSalida[]): Promise<void>;
  /** Manda un texto por WhatsApp y lo anota en el hilo (autor ia o sistema). */
  mandar(id: string, telefono: string, texto: string, autor: "ia" | "sistema"): Promise<void>;
  /** Un evento en el hilo («Sofía pasó la charla: …»). */
  evento(id: string, texto: string): Promise<void>;
  /** Avisos urgentes (seguridad en obra). */
  avisarUrgente(id: string, resumen: string): Promise<void>;
  /** Las tildes azules y el «escribiendo…» del último mensaje del cliente. */
  escribiendo?(id: string): Promise<void>;
};

export type DepsSofia = {
  repo: RepoSofia;
  config(): Promise<ConfigSofia>;
  feriados(): Promise<ReadonlySet<string>>;
  /** Arma los servicios de las herramientas para esta charla. */
  servicios(charla: CharlaSofia): ServiciosSofia;
  /** El pedido a Claude (en producción, `cliente.beta.messages.stream(...).finalMessage()`). */
  modelo(params: ReturnType<typeof armarPedido>, senal: AbortSignal): Promise<Anthropic.Beta.BetaMessage>;
  ahora?: () => Date;
  nuevoId?: () => string;
  /** Una falla de la cuenta de Anthropic (sin crédito, clave): se avisa a JS. */
  alFallar?: (e: unknown) => Promise<void>;
  /** Una pausa corta antes de leer, para juntar los mensajes que el cliente manda de a varios. */
  esperarTanda?: () => Promise<void>;
};

export type ResultadoTurno = {
  /** apagada · callada (no está en bot) · ocupado (otro turno) · sin_novedades · atendio · error */
  resultado: "apagada" | "callada" | "ocupado" | "sin_novedades" | "atendio" | "error";
  /** Lo que le llegó al cliente, en orden. */
  enviados: string[];
  costoUsd: number;
  /** El estado en que quedó la charla, si el turno lo cambió. */
  estado?: EstadoCharla;
  bloqueado?: string;
};

// ── Lo del hilo → lo que ve el modelo ──────────────────────────────────────────────────

const hora = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** Un mensaje del cliente, en texto para el modelo. Lo que no es texto se describe entre corchetes. */
export function textoDelCliente(it: ItemNuevo): string {
  const t = it.texto?.trim() || "";
  switch (it.tipo) {
    case "text":
      return t || "(mensaje vacío)";
    case "audio": {
      const a = it.adjunto ?? {};
      if (it.transcripcion?.trim()) return `[Audio, transcripto] ${it.transcripcion.trim()}`;
      return a.pendiente ? "[Mandó un audio que todavía no se transcribió]" : "[Mandó un audio que no se pudo transcribir]";
    }
    case "image":
      return `[Mandó una foto: la ve el equipo, vos no]${t ? ` Epígrafe: ${t}` : ""}`;
    case "document":
      return `[Mandó un archivo${typeof it.adjunto?.nombre === "string" ? ` (${it.adjunto.nombre})` : ""}: lo ve el equipo, vos no]${t ? ` Epígrafe: ${t}` : ""}`;
    case "video":
      return "[Mandó un video: lo ve el equipo, vos no]";
    case "sticker":
      return "[Mandó un sticker]";
    case "location": {
      const a = it.adjunto ?? {};
      const donde = [a.nombre, a.direccion].filter((x) => typeof x === "string" && x).join(", ");
      return donde
        ? `[Compartió una ubicación: ${donde}] (si es la obra, verificá esa dirección)`
        : "[Compartió una ubicación sin dirección escrita: pedile calle y altura]";
    }
    case "interactive":
    case "button":
      return `[Tocó el botón «${t}»]`;
    case "reaction":
      return `[${t || "Reaccionó a un mensaje"}]`;
    default:
      return t || "[Mandó algo que no se puede leer]";
  }
}

/** Lo que hizo el equipo, para el aviso: lo que le escribió al cliente y sus eventos. */
function notaDelEquipo(it: ItemNuevo): string | null {
  if (it.autor !== "persona") return null;
  const quien = it.autorNombre ?? "Alguien del equipo";
  if (it.direccion === "saliente") {
    const que = it.texto?.trim() || (it.adjunto ? `un archivo${typeof it.adjunto.nombre === "string" ? ` (${it.adjunto.nombre})` : ""}` : "un mensaje");
    return `(${hora(it.momento)}) ${quien} le escribió al cliente: «${que}»`;
  }
  if (it.direccion === "evento" && it.texto) return `(${hora(it.momento)}) ${it.texto}`;
  return null;
}

/** Lo que solo no merece respuesta: una reacción, o un «Hola» anterior al saludo (ya contestado). */
function esRuido(e: ItemNuevo, saludoAt: string | null): boolean {
  if (e.tipo === "reaction") return true;
  return e.tipo === "text" && esSoloSaludo(e.texto) && !!saludoAt && Date.parse(e.creado) <= Date.parse(saludoAt);
}

// ── El turno ───────────────────────────────────────────────────────────────────────────

/**
 * Atiende lo nuevo de una charla. Lo llama el webhook (después de responderle a Meta) y
 * «Devolver a Sofía». No tira: un error termina en el texto fijo y la charla pasa a una persona.
 * - `devuelta`: la charla volvió a Sofía; corre aunque no haya mensajes nuevos del cliente.
 */
export async function atenderCharla(deps: DepsSofia, conversacionId: string, opciones: { devuelta?: boolean; profundidad?: number } = {}): Promise<ResultadoTurno> {
  const { repo } = deps;
  const ahora = deps.ahora ?? (() => new Date());
  const nuevoId = deps.nuevoId ?? (() => crypto.randomUUID());
  const res: ResultadoTurno = { resultado: "sin_novedades", enviados: [], costoUsd: 0 };

  const cfg = await deps.config();
  if (!cfg.activa) return { ...res, resultado: "apagada" };
  const primera = await repo.leerCharla(conversacionId);
  if (!primera) return { ...res, resultado: "callada" };
  if (primera.estado !== "bot") return { ...res, resultado: "callada" };
  if (!(await repo.tomarTurno(conversacionId))) return { ...res, resultado: "ocupado" };

  const inicio = Date.now();
  let devuelta = !!opciones.devuelta;
  let quedoPendiente = false;
  try {
    await deps.esperarTanda?.();
    for (let tanda = 0; tanda < MAX_TANDAS && Date.now() - inicio < PRESUPUESTO_MS; tanda++) {
      const charla = await repo.leerCharla(conversacionId);
      if (!charla || charla.estado !== "bot") break;
      const nuevos = await repo.nuevosDelHilo(charla.id, charla.iaLeidoHasta);
      const entrantes = nuevos.filter((n) => n.direccion === "entrante");
      if (!entrantes.length && !devuelta) break;
      // Una reacción (👍), o el «Hola» que ya se contestó con el saludo, solos no se contestan:
      // quedan para la próxima.
      if (!devuelta && entrantes.every((e) => esRuido(e, charla.iaSaludoAt))) break;
      // Devuelta con la ventana de 24 h cerrada: no se le puede escribir. Sigue cuando escriba él.
      if (!puedeTextoLibre(charla.ultimoEntranteAt)) {
        if (devuelta) await repo.evento(charla.id, "Sofía espera a que el cliente escriba: la ventana de 24 h está cerrada.");
        break;
      }
      // Un audio que todavía se está bajando: lo levanta el turno que dispara su transcripción.
      // (Si ya falló un intento, no se espera: Sofía le pide que lo escriba o pasa la charla.)
      if (entrantes.some((e) => e.tipo === "audio" && !e.transcripcion && e.adjunto?.pendiente === true && !e.adjunto?.error)) {
        quedoPendiente = true;
        break;
      }
      res.resultado = "atendio";
      await repo.escribiendo?.(charla.id);

      // ── El saludo, una vez, armado por el código ──
      let saludoEnviado: string | null = null;
      if (!charla.iaSaludoAt) {
        saludoEnviado = saludoInicial(charla.nombrePerfil, ahora());
        await repo.mandar(charla.id, charla.telefono, saludoEnviado, "ia");
        await repo.marcarSaludo(charla.id);
        res.enviados.push(saludoEnviado);
        // «Hola» solo: el saludo ya pregunta en qué lo ayudamos. No se llama al modelo y el
        // mensaje queda sin leer para Sofía: va junto con lo próximo que escriba.
        if (!devuelta && entrantes.every((e) => e.tipo === "text" && esSoloSaludo(e.texto))) break;
      }

      // ── Topes de gasto (§10): pasa a una persona sin decirle por qué ──
      const gasto = await repo.gastoHoy(charla.telefono);
      if (gasto.global >= cfg.topeGlobalUsd || gasto.telefono >= cfg.topeTelefonoUsd) {
        const cual = gasto.global >= cfg.topeGlobalUsd ? `el tope global del día (US$ ${cfg.topeGlobalUsd})` : `el tope del día para este teléfono (US$ ${cfg.topeTelefonoUsd})`;
        if (await repo.cambiarEstado(charla.id, "derivada", "Se llegó al tope de gasto", ["bot"])) {
          await repo.mandar(charla.id, charla.telefono, TEXTO_PASO_A_PERSONA, "sistema");
          res.enviados.push(TEXTO_PASO_A_PERSONA);
          await repo.evento(charla.id, `Sofía pasó la charla a una persona: se llegó a ${cual}.`);
          res.estado = "derivada";
        }
        break;
      }

      const r = await unaTanda(deps, cfg, charla, nuevos, { saludoEnviado, devuelta, inicio, ahora: ahora(), nuevoId });
      devuelta = false;
      res.costoUsd += r.costo;
      res.enviados.push(...r.enviados);
      if (r.bloqueado) res.bloqueado = r.bloqueado;
      if (r.estado) {
        res.estado = r.estado;
        break;
      }
    }
  } catch (e) {
    res.resultado = "error";
    await deps.alFallar?.(e).catch(() => {});
    console.error("[sofia] turno falló", conversacionId, e);
    // §6: el cliente recibe un texto fijo y la charla pasa a una persona.
    try {
      const charla = await repo.leerCharla(conversacionId);
      if (charla && (await repo.cambiarEstado(conversacionId, "derivada", "Algo se cayó (la IA no pudo responder)", ["bot", "espera_ok"]))) {
        if (puedeTextoLibre(charla.ultimoEntranteAt)) {
          await repo.mandar(conversacionId, charla.telefono, TEXTO_ERROR, "sistema").catch(() => {});
          res.enviados.push(TEXTO_ERROR);
        }
        await repo.evento(conversacionId, `Sofía no pudo responder y pasó la charla a una persona (${e instanceof Error ? e.message.slice(0, 200) : "error"}).`);
        res.estado = "derivada";
      }
    } catch (e2) {
      console.error("[sofia] tampoco se pudo derivar", conversacionId, e2);
    }
  } finally {
    await repo.soltarTurno(conversacionId).catch(() => {});
  }

  // Lo que llegó justo cuando se soltaba el candado: otra vuelta (una sola).
  if (!quedoPendiente && res.resultado !== "error" && (opciones.profundidad ?? 0) < 1) {
    const charla = await repo.leerCharla(conversacionId);
    if (charla?.estado === "bot" && charla.iaSaludoAt) {
      const nuevos = await repo.nuevosDelHilo(conversacionId, charla.iaLeidoHasta);
      const quedan = nuevos.filter((n) => n.direccion === "entrante");
      if (quedan.length && !quedan.every((e) => esRuido(e, charla.iaSaludoAt))) {
        const otra = await atenderCharla({ ...deps, esperarTanda: undefined }, conversacionId, { profundidad: (opciones.profundidad ?? 0) + 1 });
        return { ...otra, enviados: [...res.enviados, ...otra.enviados], costoUsd: res.costoUsd + otra.costoUsd, resultado: otra.resultado === "sin_novedades" ? res.resultado : otra.resultado };
      }
    }
  }
  return res;
}

type ResultadoTanda = { costo: number; enviados: string[]; estado?: EstadoCharla; bloqueado?: string };

async function unaTanda(
  deps: DepsSofia,
  cfg: ConfigSofia,
  charla: CharlaSofia,
  nuevos: ItemNuevo[],
  o: { saludoEnviado: string | null; devuelta: boolean; inicio: number; ahora: Date; nuevoId: () => string },
): Promise<ResultadoTanda> {
  const { repo } = deps;
  const turnoId = o.nuevoId();
  const ficha = charla.ficha;
  const out: ResultadoTanda = { costo: 0, enviados: [] };

  // ── Lo nuevo: el cliente como mensaje; el equipo, en el aviso ──
  const entrantes = nuevos.filter((n) => n.direccion === "entrante");
  const variasHoras = new Set(entrantes.map((e) => hora(e.momento))).size > 1 || nuevos.some((n) => n.autor === "persona");
  const textoCliente = entrantes.map((e) => (variasHoras ? `(${hora(e.momento)}) ` : "") + textoDelCliente(e)).join("\n");
  for (const e of entrantes) {
    const t = e.tipo === "audio" ? e.transcripcion : e.texto;
    if (t?.trim() && (e.tipo === "text" || e.tipo === "audio" || e.tipo === "image" || e.tipo === "document")) {
      ficha.mensajesCliente.push(t.trim());
      // Gama alta (multidireccional): lo marca el código, no el modelo. Se guarda con la ficha.
      if (palabraGamaAlta(t)) ficha.segmento = "gama_alta";
    }
  }
  const notasEquipo = nuevos.map(notaDelEquipo).filter((x): x is string => !!x);

  const [historia, feriados, pendientes] = await Promise.all([repo.leerHistoria(charla.id), deps.feriados(), repo.pendientes(charla.id)]);
  const at = atencion(o.ahora, cfg.horario, feriados);
  const ultimaRespuesta = [...historia].reverse().find((h) => h.rol === "assistant" && h.enviado !== null && h.enviado !== undefined);
  const contexto = contextoDelTurno({
    ahora: ahoraLegible(o.ahora),
    enHorario: at.enHorario,
    cuandoSigue: at.cuando,
    horario: describirHorario(cfg.horario),
    // En la primera vuelta con el modelo, que sepa qué saludo le llegó al cliente (aunque se
    // haya mandado en un turno anterior, con un «Hola» solo).
    saludoEnviado: o.saludoEnviado ?? (historia.length === 0 && charla.iaSaludoAt ? saludoInicial(charla.nombrePerfil, new Date(charla.iaSaludoAt)) : null),
    ficha,
    pendientes,
    notasEquipo,
    noLlego: ultimaRespuesta && ultimaRespuesta.enviado === false ? ultimaRespuesta.nota ?? "no salió" : null,
    devuelta: o.devuelta,
  });

  let seq = (historia.at(-1)?.seq ?? 0) + 1;
  const mensajes: Anthropic.Beta.BetaMessageParam[] = historia.map((m) => ({ role: m.rol, content: m.contenido }) as Anthropic.Beta.BetaMessageParam);
  const filas: NuevaFila[] = [];
  const base = { turno_id: turnoId, uso: null, modelo_servido: null, costo_usd: 0 };
  // Si el turno anterior se cortó antes de que el modelo contestara, la historia terminó en el
  // aviso de sistema: se cierra con una fila del asistente (nucleo.ts → cierreFaltante).
  const cierre = cierreFaltante(historia);
  if (cierre) filas.push({ ...base, rol: "assistant", tipo: "asistente", contenido: [{ type: "text", text: cierre.texto }], texto: cierre.texto, interrumpido: true });
  const reparacion = cierre ? [] : reparacionHuerfanos(historia.at(-1));
  if (textoCliente || reparacion.length) {
    const contenido: Anthropic.Beta.BetaContentBlockParam[] = [...reparacion, ...(textoCliente ? [{ type: "text" as const, text: textoCliente }] : [])];
    filas.push({ ...base, rol: "user", tipo: "cliente", contenido, texto: textoCliente || null });
  }
  // Un solo aviso de sistema por turno, justo después del cliente (así lo pide la API).
  filas.push({ ...base, rol: "system", tipo: "contexto", contenido: contexto, texto: null });
  seq = await repo.agregarHistoria(charla.id, seq, filas);
  mensajes.push(...filas.map((f) => ({ role: f.rol, content: f.contenido }) as Anthropic.Beta.BetaMessageParam));
  // Lo de esta tanda ya está en la historia: no se vuelve a leer.
  const hasta = nuevos.at(-1)?.creado;
  if (hasta) await repo.avanzarCursor(charla.id, hasta);

  // ── El loop con el modelo ──
  const servicios = deps.servicios(charla);
  let estadoEsperado: EstadoCharla = "bot";
  let textoFinal: string | null = null;
  let silenciar = false;
  let filaFinal: NuevaFila | null = null;
  let negado = false;

  for (let vuelta = 0; ; vuelta++) {
    if (vuelta >= MAX_VUELTAS) throw new Error(`Sofía dio ${MAX_VUELTAS} vueltas sin terminar.`);
    const { plazo, senal } = senalDelPedido(o.inicio);
    let mensaje: Anthropic.Beta.BetaMessage;
    try {
      mensaje = await deps.modelo(
        armarPedido({
          modelo: cfg.modelo,
          maxTokens: MAX_TOKENS,
          system: sistemaSofia(cfg.datosEmpresa, cfg.guiaTrabajos),
          tools: definicionesSofia(),
          messages: mensajes,
          esfuerzo: cfg.esfuerzo,
          usuarioId: `cli-${charla.id}`,
          progreso: false,
        }),
        senal,
      );
    } catch (e) {
      if (plazo.aborted) throw new Error("La respuesta tardó demasiado y se cortó.");
      throw e;
    }
    const costo = costoUsd(mensaje.usage as unknown as Record<string, unknown>, cfg.modelo);
    out.costo += costo;
    const contenido = limpiarFallback(mensaje.content);
    const texto = textoDe(contenido);
    const fila: NuevaFila = {
      ...base, rol: "assistant", tipo: "asistente", contenido: contenido as unknown as Anthropic.Beta.BetaContentBlockParam[], texto: texto || null,
      uso: mensaje.usage as unknown as Record<string, unknown>, modelo_servido: mensaje.model, costo_usd: costo,
    };

    if (mensaje.stop_reason === "refusal") {
      // La IA se negó: pasa a una persona con el texto fijo (§6, «la IA se negó a contestar»).
      fila.contenido = [{ type: "text", text: texto || "(sin respuesta)" }];
      seq = await repo.agregarHistoria(charla.id, seq, [{ ...fila, enviado: false, nota: "la IA se negó a contestar" }]);
      negado = true;
      break;
    }

    const usos = contenido.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (mensaje.stop_reason === "pause_turn") {
      seq = await repo.agregarHistoria(charla.id, seq, [fila]);
      mensajes.push({ role: "assistant", content: fila.contenido } as Anthropic.Beta.BetaMessageParam);
      continue;
    }
    if (mensaje.stop_reason !== "tool_use" || !usos.length) {
      filaFinal = fila;
      textoFinal = texto.trim();
      mensajes.push({ role: "assistant", content: fila.contenido } as Anthropic.Beta.BetaMessageParam);
      break;
    }

    // Herramientas, de a una y en orden (tocan la ficha). Sus resultados en UN mensaje.
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of usos) {
      const r = await ejecutarHerramientaSofia(u.name, u.input, { ficha, servicios });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: r.contenido, ...(r.esError ? { is_error: true } : {}) });
      if (r.efecto) {
        // Una derivación pesa más que un pendiente: si ya se derivó, el pendiente queda registrado
        // pero la charla sigue «Sin tomar».
        const pisa = !(estadoEsperado === "derivada" && r.efecto.estado === "espera_ok");
        const ok = pisa && (await repo.cambiarEstado(charla.id, r.efecto.estado, r.efecto.motivo, ["bot", estadoEsperado]));
        if (ok) estadoEsperado = r.efecto.estado;
        if (r.efecto.estado === "derivada") {
          await repo.evento(charla.id, `Sofía pasó la charla a una persona · ${r.efecto.motivo}: ${r.efecto.resumen}`);
          if (r.efecto.urgente) await repo.avisarUrgente(charla.id, r.efecto.resumen).catch((e) => console.error("[sofia] aviso urgente", e));
          if (r.efecto.textoFijo === "seguridad" && ok) {
            const t = textoSeguridad(cfg.telefonoGuardia);
            await repo.mandar(charla.id, charla.telefono, t, "sistema");
            out.enviados.push(t);
          }
          if (r.efecto.silenciar) silenciar = true;
        }
      }
    }
    await repo.guardarFicha(charla.id, ficha);
    const filaResultados: NuevaFila = { ...base, rol: "user", tipo: "resultados", contenido: resultados, texto: null };
    seq = await repo.agregarHistoria(charla.id, seq, [fila, filaResultados]);
    mensajes.push({ role: "assistant", content: fila.contenido } as Anthropic.Beta.BetaMessageParam, { role: "user", content: resultados });
  }

  await repo.guardarFicha(charla.id, ficha);
  if (out.costo) await repo.sumarCosto(charla.id, out.costo);

  // ── La salida ──
  if (negado) {
    if (await repo.cambiarEstado(charla.id, "derivada", "La IA se negó a contestar", ["bot", estadoEsperado])) {
      await repo.mandar(charla.id, charla.telefono, TEXTO_PASO_A_PERSONA, "sistema");
      out.enviados.push(TEXTO_PASO_A_PERSONA);
      await repo.evento(charla.id, "Sofía no quiso responder el último mensaje y pasó la charla a una persona.");
      out.estado = "derivada";
    }
    return out;
  }

  const t = textoFinal ?? "";
  const nada = !t || t === NADA || t.replace(/[[\]\s.]/g, "").toLowerCase() === "nada";
  let enviado = false;
  let nota: string | null = null;
  let fallaEnvio: unknown = null;
  if (silenciar) {
    nota = "se mandó un texto fijo en su lugar";
  } else if (!nada) {
    const revision = revisarSalida(t);
    const actual = await repo.leerCharla(charla.id);
    if (revision.bloquea) {
      // No sale: queda el aviso para la bandeja y la charla espera a una persona.
      nota = `el filtro la bloqueó (${revision.motivo})`;
      out.bloqueado = revision.motivo!;
      await repo.registrarBloqueo(charla.id, t, revision.motivo!, revision.hallazgos);
      if (await repo.cambiarEstado(charla.id, "espera_ok", revision.motivo!, ["bot", estadoEsperado])) estadoEsperado = "espera_ok";
      await repo.evento(charla.id, `No se mandó lo que escribió Sofía (${revision.motivo}). Revisalo antes de contestar.`);
    } else if (!actual || actual.estado !== estadoEsperado) {
      // Una persona la tomó (o la cerró) mientras Sofía pensaba: se calla.
      nota = "una persona tomó la charla antes de que saliera";
      await repo.evento(charla.id, "Sofía no mandó su respuesta: una persona tomó la charla.");
    } else if (!puedeTextoLibre(actual.ultimoEntranteAt)) {
      nota = "la ventana de 24 h estaba cerrada";
      await repo.evento(charla.id, "Sofía no mandó su respuesta: la ventana de 24 h está cerrada. Cuando el cliente escriba, se abre.");
    } else {
      try {
        await repo.mandar(charla.id, charla.telefono, t, "ia");
        enviado = true;
        out.enviados.push(t);
      } catch (e) {
        nota = `WhatsApp no la aceptó (${e instanceof Error ? e.message.slice(0, 120) : "error"})`;
        fallaEnvio = e;
      }
    }
  }
  if (filaFinal) await repo.agregarHistoria(charla.id, seq, [{ ...filaFinal, enviado: nada && !silenciar ? null : enviado, nota }]);
  // Meta no aceptó el mensaje: es un error técnico (texto fijo y pasa a una persona, arriba).
  if (fallaEnvio) throw new Error(`WhatsApp no aceptó la respuesta de Sofía: ${fallaEnvio instanceof Error ? fallaEnvio.message : fallaEnvio}`);
  if (estadoEsperado !== "bot") out.estado = estadoEsperado;
  return out;
}
