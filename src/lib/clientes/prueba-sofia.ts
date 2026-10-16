// Un mundo de mentira para probar a Sofía sin base, sin Meta y sin catastro: la charla, el hilo,
// la historia, lo pendiente y lo que «salió por WhatsApp», todo en memoria. Lo usan los tests
// (turno.test.ts, con un Claude simulado) y scripts/test-agente-clientes.mts (con el modelo de
// verdad). No es un test: no lo corre `npm test`.

import type Anthropic from "@anthropic-ai/sdk";
import type { Lote } from "../catastro/caba.ts";
import { TARIFAS_AGO26 } from "../cotizador/prueba-tarifas.ts";
import type { ConfigSofia } from "./config.ts";
import { HORARIO_POR_DEFECTO } from "./horario.ts";
import { asignarPareja, PAREJAS_15_10 } from "./asignacion.ts";
import type { ContextoFacil } from "./facil.ts";
import { fichaSofiaVacia, type FichaSofia, type ServiciosSofia } from "./herramientas.ts";
import type { HallazgoSalida } from "./filtro-salida.ts";
import type { CharlaSofia, DepsSofia, FilaHistoria, ItemNuevo, NuevaFila, RepoSofia } from "./turno.ts";
import type { EstadoCharla } from "./vista.ts";

export const CONFIG_PRUEBA: ConfigSofia = {
  activa: true,
  modelo: "claude-opus-5-5",
  esfuerzo: "low",
  topeTelefonoUsd: 1,
  topeGlobalUsd: 15,
  horario: HORARIO_POR_DEFECTO,
  telefonoGuardia: "11 0000-0000",
};

export function lotePrueba(direccion: string, cambios: Partial<Lote> = {}): Lote {
  return {
    fuente: "catastro", direccionConsultada: direccion, smp: "045-123-007", direccionOficial: direccion.toUpperCase(),
    frenteCatastro: 12.4, caras: [12.4], tramosCortos: [], esquina: false, calles: [], fondo: 30, superficie: 372, pisos: 2,
    nota: null, consultado: "2026-10-15T12:00:00Z", ...cambios,
  };
}

export type Pendiente = { numero: number; tipo: string; carril: string; resumen: string; montoPropuesto: number | null; payload: Record<string, unknown> };

export type Mundo = {
  charla: CharlaSofia & { motivo: string | null; ocupada: boolean; costo: number };
  hilo: (ItemNuevo & { autor: ItemNuevo["autor"] })[];
  historia: (FilaHistoria & { tipo: string; texto: string | null })[];
  /** Lo que salió por WhatsApp, en orden. */
  salidas: { texto: string; autor: "ia" | "sistema" }[];
  eventos: string[];
  pendientes: Pendiente[];
  bloqueos: { texto: string; motivo: string; hallazgos: HallazgoSalida[] }[];
  urgentes: string[];
  gasto: { telefono: number; global: number };
  /** Lo que se le mandó al modelo en cada pedido. */
  pedidos: Record<string, unknown>[];
  /** El catastro de mentira: dirección → resultado. */
  catastro: (direccion: string) => Promise<import("../catastro/caba.ts").ConsultaLote>;
  contextoFacil: ContextoFacil | null;
  /** Agrega un mensaje del cliente al hilo (o de una persona). */
  escribe(texto: string, o?: Partial<ItemNuevo>): ItemNuevo;
  deps(modelo: DepsSofia["modelo"], cambios?: Partial<DepsSofia>): DepsSofia;
};

// Relativo a la hora real: la ventana de 24 h (ventana.ts) se mide contra Date.now().
let reloj = Date.now() - 10 * 60_000;
const tic = () => new Date((reloj += 1_000)).toISOString();

export function crearMundo(o: { perfil?: string | null; estado?: EstadoCharla; config?: Partial<ConfigSofia>; ficha?: Partial<FichaSofia> } = {}): Mundo {
  let n = 0;
  let numero = 1041;
  const mundo: Mundo = {
    charla: {
      id: "charla-1",
      telefono: "5491155550000",
      nombrePerfil: o.perfil === undefined ? "Marcela Ríos" : o.perfil,
      estado: o.estado ?? "bot",
      ficha: { ...fichaSofiaVacia(), telefono: "5491155550000", ...o.ficha },
      ultimoEntranteAt: null,
      iaLeidoHasta: null,
      iaSaludoAt: null,
      motivo: null,
      ocupada: false,
      costo: 0,
    },
    hilo: [],
    historia: [],
    salidas: [],
    eventos: [],
    pendientes: [],
    bloqueos: [],
    urgentes: [],
    gasto: { telefono: 0, global: 0 },
    pedidos: [],
    catastro: async (direccion) => ({ estado: "encontrado", lote: lotePrueba(direccion) }),
    contextoFacil: null,
    escribe(texto, x = {}) {
      const ahora = tic();
      const it: ItemNuevo = {
        id: `h${++n}`, direccion: "entrante", autor: "cliente", autorNombre: null, tipo: "text", texto, transcripcion: null, adjunto: null,
        creado: ahora, momento: ahora, ...x,
      };
      mundo.hilo.push(it);
      if (it.direccion === "entrante") mundo.charla.ultimoEntranteAt = ahora;
      return it;
    },
    deps(modelo, cambios = {}) {
      const repo: RepoSofia = {
        async leerCharla() {
          return structuredClone({ ...mundo.charla });
        },
        async tomarTurno() {
          if (mundo.charla.ocupada) return false;
          mundo.charla.ocupada = true;
          return true;
        },
        async soltarTurno() {
          mundo.charla.ocupada = false;
        },
        async nuevosDelHilo(_id, desde) {
          return mundo.hilo.filter((h) => (!desde || h.creado > desde) && (h.direccion === "entrante" || h.autor === "persona"));
        },
        async avanzarCursor(_id, hasta) {
          mundo.charla.iaLeidoHasta = hasta;
        },
        async marcarSaludo() {
          mundo.charla.iaSaludoAt = tic();
        },
        async leerHistoria() {
          return structuredClone(mundo.historia);
        },
        async agregarHistoria(_id, seq, filas: NuevaFila[]) {
          filas.forEach((f, i) => mundo.historia.push({
            seq: seq + i, rol: f.rol, tipo: f.tipo, contenido: structuredClone(f.contenido), texto: f.texto, turno_id: f.turno_id,
            enviado: f.enviado ?? null, nota: f.nota ?? null,
          }));
          return seq + filas.length;
        },
        async guardarFicha(_id, ficha) {
          mundo.charla.ficha = structuredClone(ficha);
        },
        async cambiarEstado(_id, estado, motivo, desde) {
          if (!desde.includes(mundo.charla.estado)) return false;
          mundo.charla.estado = estado;
          mundo.charla.motivo = motivo;
          return true;
        },
        async sumarCosto(_id, usd) {
          mundo.charla.costo += usd;
        },
        async gastoHoy() {
          return mundo.gasto;
        },
        async pendientes() {
          return mundo.pendientes.map((p) => `${p.tipo === "precio" ? (p.carril === "simple" ? "pedido de alquiler" : "cotización") : "asignación"} #${p.numero}: pendiente de revisión del equipo`);
        },
        async registrarBloqueo(_id, texto, motivo, hallazgos) {
          mundo.bloqueos.push({ texto, motivo, hallazgos });
        },
        async mandar(_id, _tel, texto, autor) {
          mundo.salidas.push({ texto, autor });
        },
        async evento(_id, texto) {
          mundo.eventos.push(texto);
        },
        async avisarUrgente(_id, resumen) {
          mundo.urgentes.push(resumen);
        },
      };
      const servicios = (): ServiciosSofia => ({
        verificarDireccion: (d) => mundo.catastro(d),
        contextoFacil: async () => mundo.contextoFacil ?? {
          parametros: { maxMl: 25, jornadas: 1, renderId: "render-bandeja-generico", empresasConPersona: false },
          clienteConHistorial: false, deudaVencida: false, direccionCotizada: false,
        },
        tarifas: async () => TARIFAS_AGO26,
        asignar: async (f) => asignarPareja({ alquilerSimple: f.trabajo === "alquiler_simple" }, { config: PAREJAS_15_10, cuentasSocios: [], turno: { ultimo: null } }),
        registrarPendiente: async (p) => {
          const previo = mundo.pendientes.find((x) => x.tipo === p.tipo && x.carril === p.carril);
          if (previo) {
            Object.assign(previo, p);
            return { numero: previo.numero, yaEstaba: true };
          }
          mundo.pendientes.push({ numero: ++numero, ...p });
          return { numero, yaEstaba: false };
        },
        hoy: "2026-10-15",
      });
      return {
        repo,
        config: async () => ({ ...CONFIG_PRUEBA, ...o.config }),
        feriados: async () => new Set<string>(),
        servicios,
        modelo: async (params, senal) => {
          mundo.pedidos.push(structuredClone(params) as unknown as Record<string, unknown>);
          return modelo(params, senal);
        },
        ahora: () => new Date("2026-10-15T13:30:00Z"),
        nuevoId: () => `t${++n}`,
        ...cambios,
      };
    },
  };
  return mundo;
}

// ── Respuestas del Claude simulado ─────────────────────────────────────────────────────

let idHerr = 0;

const USO = { input_tokens: 1200, output_tokens: 150, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 };

export function respuestaTexto(texto: string, stop: "end_turn" | "refusal" = "end_turn"): Anthropic.Beta.BetaMessage {
  return {
    id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: stop, stop_sequence: null,
    content: [{ type: "text", text: texto, citations: null }], usage: USO,
  } as unknown as Anthropic.Beta.BetaMessage;
}

export function respuestaHerramientas(...usos: [string, unknown][]): Anthropic.Beta.BetaMessage {
  return {
    id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
    content: usos.map(([name, input]) => ({ type: "tool_use", id: `tu_${++idHerr}`, name, input })), usage: USO,
  } as unknown as Anthropic.Beta.BetaMessage;
}

/** Un Claude que contesta en orden lo que tiene en el guion. */
export function guion(...pasos: (Anthropic.Beta.BetaMessage | ((params: Record<string, unknown>) => Anthropic.Beta.BetaMessage))[]): DepsSofia["modelo"] & { quedan(): number } {
  const cola = [...pasos];
  const f = (async (params: unknown) => {
    const p = cola.shift();
    if (!p) throw new Error("El guion del Claude simulado se terminó.");
    return typeof p === "function" ? p(params as Record<string, unknown>) : p;
  }) as unknown as DepsSofia["modelo"] & { quedan(): number };
  f.quedan = () => cola.length;
  return f;
}

/** Los resultados de herramientas que vio el modelo, en texto. */
export function resultadosDeHerramientas(m: Mundo): string[] {
  return m.historia
    .filter((h) => h.tipo === "resultados" && Array.isArray(h.contenido))
    .flatMap((h) => (h.contenido as { type: string; content?: unknown }[]).filter((b) => b.type === "tool_result").map((b) => String(b.content)));
}
