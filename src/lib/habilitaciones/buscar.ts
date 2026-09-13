// Búsqueda de la bandeja de Habilitaciones.
//
// EN EL BROWSER Y SOBRE LO QUE YA ESTÁ CARGADO: la bandeja trae todas las OTs activas en
// una sola lectura (en trámite, habilitadas y no aplican), así que buscar no necesita ir
// a ningún lado. Una ida a Odoo por tecla sería pagar ~250 ms para filtrar 150 filas.
//
// POR PALABRAS Y EN CUALQUIER ORDEN: "corrientes norte" encuentra "Av. Corrientes 5386 ·
// NORTE - MARTIN S.R.L". Cada palabra tiene que aparecer en algún campo, sin tildes ni
// mayúsculas — nadie escribe "Azara" y "Olazábal" igual dos veces.

import { direccionDeObra, normalizar, partesTitulo } from "@/lib/tablero/titulo";
import { tipoOtLabel } from "@/lib/tablero/tipos";
import { MODALIDAD_LABEL, type FilaBandeja } from "./tipos";

/** Todo lo que se puede buscar de una fila, en un solo texto normalizado. */
function textoBuscable(f: FilaBandeja): string {
  const partes = partesTitulo(f.titulo);
  return normalizar(
    [
      direccionDeObra(f),
      // El título de la OT trae tipo, número de orden y cliente: "Armado · S02525 · …".
      f.titulo,
      partes.cliente,
      f.ventaNombre,
      String(f.otId),
      f.tecnicoNombre,
      tipoOtLabel(f.tipo),
      // "prioridad alta" / "urgente": la baja no se indexa, igual que no lleva chip.
      f.urgencia !== "baja" ? `prioridad ${f.urgencia} urgente` : null,
      f.motivoUrgencia,
      f.modalidad ? MODALIDAD_LABEL[f.modalidad] : null,
      f.trabajo.tipoLabel,
      f.habilitadaPor,
      f.pospuestaHasta ? "pospuesta" : null,
      f.pospuestaMotivo,
      ...f.notasFijadas,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

export function coincide(fila: FilaBandeja, consulta: string): boolean {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const texto = textoBuscable(fila);
  return palabras.every((p) => texto.includes(p));
}
