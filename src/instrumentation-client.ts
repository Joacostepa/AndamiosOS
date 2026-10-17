// Corre en el navegador después de cargar el HTML y antes de que hidrate React (Next 16:
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
//
// Sistemas: instala los buffers circulares que acompañan cada reporte (últimos errores,
// pedidos fallidos y pantallas visitadas; docs/sistemas/contrato.md §6.3). Sólo memoria: no
// manda nada a ningún lado hasta que alguien toca «Mandar a Sistemas».
//
// Tiene que ser liviano (Next avisa si pasa de 16 ms) y no puede romper nada: todo va en
// try/catch, también adentro de instalarBuffers().

import { instalarBuffers, registrarRuta } from "@/lib/sistemas/contexto-cliente";

try {
  instalarBuffers();
} catch {
  /* jamás rompe la app */
}

export function onRouterTransitionStart(url: string) {
  try {
    registrarRuta(url);
  } catch {
    /* nunca */
  }
}
