// Lo que manda la pantalla del cotizador, validado antes de tocar el borrador.

import { z } from "zod";
import type { Formulario } from "./formulario";

const estado3 = z.enum(["base", "opcional", "no"]);
// Un texto más largo que el tope se corta, no rechaza el guardado entero (JS, 19/11: el alcance
// pasó los 300 caracteres de entonces y se perdió todo lo cargado después). Los topes son
// holgados: están para frenar un cuerpo absurdo, no para limitar lo que se escribe.
const texto = (max: number) => z.string().transform((s) => s.slice(0, max));
const numeroONull = z.number().finite().nonnegative().max(1e9).nullable();

export const esquemaFormulario = z.object({
  tipo: z.enum(["bandeja", "fachada", "desglosado"]),
  cliente: z.object({
    partnerId: z.number().int().positive().nullable(),
    razonSocial: texto(200), contacto: texto(200), celular: texto(60), email: texto(200), cuit: texto(20), domicilio: texto(300),
    domicilioObra: z.boolean(),
  }),
  obra: z.object({ direccion: texto(200), enCaba: z.boolean().nullable(), esquina: texto(200).nullable() }),
  bandeja: z.object({
    metros: numeroONull, altura: z.number().finite().nonnegative().max(60), precioMl: numeroONull, motivoPrecio: texto(1000),
    concertina: estado3, gestoria: estado3,
  }),
  fachada: z.object({
    frentes: z.array(z.number().finite().positive().max(2000)).max(12),
    altura: numeroONull,
    categoria: z.enum(["licitacion", "estandar", "escaleras", "completa", "compleja", "especial"]).nullable(),
    precioM2: numeroONull, motivoPrecio: texto(1000),
    escalonado: z.enum(["sin_preguntar", "no", "A", "B"]), alturaCorte: numeroONull,
    gestoria: estado3, bandejaA3: z.boolean(), filasTablones: z.enum(["1", "2", "todas"]), mediaSombra: z.boolean(),
  }),
  desglose: z.object({
    trabajo: texto(4000),
    filas: z.array(z.object({
      id: z.string().regex(/^manual:[\w.-]{1,60}$/),
      concepto: texto(1000), cantidad: z.number().finite().positive().max(1e6), precio: numeroONull,
      porPeriodo: z.boolean(), seccion: z.enum(["base", "opcional"]), producto: texto(60),
      productoOdoo: z.object({ id: z.number().int(), alquiler: z.boolean() }).optional(),
    })).max(60),
  }),
  syh: estado3,
  memoria: estado3,
  jornadas: z.object({ armado: z.number().finite().positive().max(60).nullable(), desarme: z.number().finite().positive().max(60).nullable() }),
  render: z.object({
    eleccion: z.enum(["biblioteca", "propio", "ninguno"]).nullable(), renderId: z.string().max(60).nullable(), path: z.string().max(300).nullable(),
    extras: z.array(z.object({ renderId: z.string().max(60).nullable(), path: z.string().max(300).nullable() })).max(8).optional(),
  }),
  plazoDias: z.number().int().positive().max(3650),
  formaPago: texto(2000).nullable(),
  textos: z.object({
    aMano: z.boolean(), referencia: texto(1000), seccion1: texto(20000),
    seccion2: z.array(z.object({ titulo: texto(500), contenido: texto(20000) })).max(20),
  }),
  ia: z.record(z.string().max(60), z.object({ cita: texto(2000), deducido: z.boolean() })),
}) satisfies z.ZodType<Formulario>;
