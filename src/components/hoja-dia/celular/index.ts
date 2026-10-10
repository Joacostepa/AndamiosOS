// El celular del capataz y del chofer (/h/[token]) y su vista previa para el escritorio.
//
//   import { MarcoTelefono, VistaCelular } from "@/components/hoja-dia/celular";
//   <MarcoTelefono><VistaCelular vista={vista} preview /></MarcoTelefono>
//
// `vista` es la `VistaPublica` (src/lib/hoja-dia/vista.ts) tal como la devuelve
// GET /api/public/hoja/[token]. Con `preview` no se toca nada y el pie dice quién lo toca.

export { VistaCelular, SinDescargar, MensajeCelular, type VistaCelularProps } from "./vista-celular";
export { MarcoTelefono } from "./marco-telefono";
export { useHojaPublica, type EstadoHojaPublica } from "./use-hoja-publica";
export type { AccionesCelular, Conexion, Pendiente, ResultadoToque, Toque } from "./tipos";
