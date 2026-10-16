// La configuración de Sofía, de Parámetros (cotizacion_parametros, grupo agente_clientes). Puro,
// con tests (en prompt.test.ts).
//
// EL INTERRUPTOR GENERAL ES `clientes_ia_activa`, Y ESTÁ APAGADO POR DEFECTO (0). Con 0, o si la
// clave no existe (la migración 20261017000002 sin aplicar), todo sigue como la etapa 0: las
// charlas nuevas entran «Sin tomar», nadie contesta solo y el código no toca las tablas nuevas.
// Es también el «Pausar la IA» de §7: con 0, lo que llegue a una charla que estaba con Sofía
// pasa a una persona.
//
// Los topes (§10): `clientes_tope_tel_usd` (US$ 1 por teléfono por día: después pasa a una
// persona sin decirle por qué al cliente) y `clientes_tope_global_usd` (US$ 15 por día en
// total: todo pasa a personas).

import { esfuerzoValido, type Esfuerzo } from "../ia/nucleo.ts";
import { leerHorario, type Horario } from "./horario.ts";

export type FilaConfig = { clave: string; valor: number | null; texto?: string | null };

export type ConfigSofia = {
  activa: boolean;
  modelo: string;
  esfuerzo: Esfuerzo;
  topeTelefonoUsd: number;
  topeGlobalUsd: number;
  horario: Horario;
  /** Decisión 21: el de JS. Vacío hasta que se cargue (el texto fijo dice 911). */
  telefonoGuardia: string | null;
};

/** Decisión 19 de JS: Opus 5.5 con esfuerzo bajo. */
export const MODELO_POR_DEFECTO = "claude-opus-5-5";

export const CLAVES_SOFIA = [
  "clientes_ia_activa", "clientes_modelo", "clientes_esfuerzo", "clientes_tope_tel_usd", "clientes_tope_global_usd", "clientes_horario",
  "clientes_telefono_guardia",
] as const;

export function configSofiaDesdeFilas(filas: FilaConfig[]): ConfigSofia {
  const por = new Map(filas.map((f) => [f.clave, f]));
  const num = (c: string, def: number) => {
    const v = por.get(c)?.valor;
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? def : Number(v);
  };
  const txt = (c: string) => por.get(c)?.texto?.trim() || null;
  return {
    activa: num("clientes_ia_activa", 0) === 1,
    modelo: txt("clientes_modelo") ?? MODELO_POR_DEFECTO,
    esfuerzo: esfuerzoValido(txt("clientes_esfuerzo"), "low"),
    topeTelefonoUsd: Math.max(0, num("clientes_tope_tel_usd", 1)),
    topeGlobalUsd: Math.max(0, num("clientes_tope_global_usd", 15)),
    horario: leerHorario(txt("clientes_horario")),
    telefonoGuardia: txt("clientes_telefono_guardia"),
  };
}
