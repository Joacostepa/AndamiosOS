// MarcoPantalla (server component): lo que toda página de Dirección hace con su
// RespuestaPantalla. Registra la lectura para el encabezado, pone la banda si Odoo no
// respondió, o el estado vacío si no hay nada que mostrar. El contenido es una función que
// recibe el resultado ya recortado (lo reservado no llega si no corresponde).
//
//   const r = await obtenerPantalla("caja", { conSocios: s.conSocios });
//   return <MarcoPantalla respuesta={r}>{(r) => <VistaCaja resultado={r} />}</MarcoPantalla>;

import type { RespuestaPantalla, ResultadoPantalla } from "@/lib/direccion/tipos";
import { BandaOdooCaido, EstadoSinDatos, LecturaPantalla } from "./estados";

export function MarcoPantalla<D>({ respuesta, children }: { respuesta: RespuestaPantalla<D>; children: (r: ResultadoPantalla<D>) => React.ReactNode }) {
  if (!respuesta.ok) {
    return (
      <>
        <LecturaPantalla pantalla={respuesta.pantalla} lectura={null} tc={null} />
        <EstadoSinDatos motivo={respuesta.motivo} />
      </>
    );
  }
  const r: ResultadoPantalla<D> = respuesta;
  return (
    <>
      <LecturaPantalla pantalla={r.pantalla} lectura={r.lectura} tc={r.tc} />
      {r.lectura.odooCaido && <BandaOdooCaido hora={r.lectura.odooCaido.hora} desde={r.lectura.tomadoAt} />}
      {children(r)}
    </>
  );
}
