"use client";

// Relleno de las pantallas mientras su dueño las construye. Muestra lo que el calculador
// YA devuelve (sus cifras, con la tarjeta común), sin inventar nada. Cada desarrollador lo
// reemplaza por la vista de su pantalla.

import type { ResultadoPantalla } from "@/lib/direccion/tipos";
import { EstadoVacio } from "./estados";
import { FilaCifras, TarjetaCifra } from "./tarjetas";

export function EnConstruccion({ resultado, titulo }: { resultado: ResultadoPantalla; titulo: string }) {
  if (resultado.cifras.length === 0) {
    return <EstadoVacio titulo={`${titulo}: todavía se está construyendo`} texto="Cuando esté lista, acá van a aparecer sus cifras leídas de Odoo." />;
  }
  return (
    <FilaCifras>
      {resultado.cifras.map((c) => (
        <TarjetaCifra key={c.id ?? c.kpi} cifra={c} />
      ))}
    </FilaCifras>
  );
}
