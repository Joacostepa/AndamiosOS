// Lo que manda la pantalla del cotizador, validado antes de tocar el borrador.

import { z } from "zod";
import type { Formulario } from "./formulario";

const estado3 = z.enum(["base", "opcional", "no"]);
const texto = (max: number) => z.string().max(max);
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
    metros: numeroONull, altura: z.number().finite().nonnegative().max(60), precioMl: numeroONull, motivoPrecio: texto(300),
    concertina: estado3, gestoria: estado3,
  }),
  fachada: z.object({
    frentes: z.array(z.number().finite().positive().max(2000)).max(12),
    altura: numeroONull,
    categoria: z.enum(["licitacion", "estandar", "escaleras", "completa", "compleja", "especial"]).nullable(),
    precioM2: numeroONull, motivoPrecio: texto(300),
    escalonado: z.enum(["sin_preguntar", "no", "A", "B"]), alturaCorte: numeroONull,
    gestoria: estado3, bandejaA3: z.boolean(), filasTablones: z.enum(["1", "2", "todas"]), mediaSombra: z.boolean(),
  }),
  desglose: z.object({
    trabajo: texto(300),
    filas: z.array(z.object({
      id: z.string().regex(/^manual:[\w.-]{1,60}$/),
      concepto: texto(300), cantidad: z.number().finite().positive().max(1e6), precio: numeroONull,
      porPeriodo: z.boolean(), seccion: z.enum(["base", "opcional"]), producto: texto(60),
      productoOdoo: z.object({ id: z.number().int(), alquiler: z.boolean() }).optional(),
    })).max(60),
  }),
  syh: estado3,
  memoria: estado3,
  jornadas: z.object({ armado: z.number().finite().positive().max(60).nullable(), desarme: z.number().finite().positive().max(60).nullable() }),
  render: z.object({ eleccion: z.enum(["biblioteca", "propio", "ninguno"]).nullable(), renderId: z.string().max(60).nullable(), path: z.string().max(300).nullable() }),
  plazoDias: z.number().int().positive().max(3650),
  formaPago: texto(600).nullable(),
  textos: z.object({
    aMano: z.boolean(), referencia: texto(300), seccion1: texto(6000),
    seccion2: z.array(z.object({ titulo: texto(200), contenido: texto(6000) })).max(20),
  }),
  ia: z.record(z.string().max(60), z.object({ cita: texto(400), deducido: z.boolean() })),
}) satisfies z.ZodType<Formulario>;
