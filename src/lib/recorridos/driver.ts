// Fábrica de driver.js compartida por los recorridos de la app: los opcionales de
// Habilitaciones (src/hooks/use-tour.ts) y el obligatorio (src/hooks/use-recorrido-obligatorio.ts).
// Sólo del lado del navegador.

import { driver, type Config, type Driver } from "driver.js";
// El CSS base de la librería (overlay, recorte, posicionamiento). La apariencia del
// popover se sobreescribe en globals.css (.tour-aba) para que siga el tema de la app.
import "driver.js/dist/driver.css";

/**
 * Lo que comparten todos: el aspecto (`tour-aba`), el recorte y los textos en castellano.
 * Cada uso suma lo suyo encima; lo que pase en `config` gana.
 */
export const BASE_DRIVER: Config = {
  overlayOpacity: 0.6,
  stagePadding: 6,
  stageRadius: 8,
  popoverClass: "tour-aba",
  nextBtnText: "Siguiente",
  prevBtnText: "Atrás",
  doneBtnText: "Listo",
  progressText: "{{current}} de {{total}}",
};

export function crearDriver(config: Config): Driver {
  return driver({ ...BASE_DRIVER, ...config });
}
