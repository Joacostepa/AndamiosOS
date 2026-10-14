// Lo que los menús de una persona y de un contratista (menu-persona.tsx, contratistas.tsx)
// necesitan de la pantalla que los abre (el Pizarrón): el día, la hora y adónde llevan
// "Ver como…" y "Editar contratista". Los gestos van todos por los hooks de use-hoja-dia
// (con Deshacer); acá sólo está la forma.

import type { DiaHoja } from "@/lib/hoja-dia/tipos";

export type CtlMenus = {
  dia: DiaHoja;
  ahora: number;
  /** Puede editar la Hoja del día (administrar contratistas). */
  editor: boolean;
  /** Sumar (o restar) gente de un contratista a una cuadrilla. */
  sumarContratista: (c: number, contratistaId: string, n: number) => void;
  /** La hoja lateral de contratistas (alta, edición, Telegram), con uno elegido. */
  abrirContratistas: (contratistaId?: string | null) => void;
  /** Lo que le llega en el celular a quien recibe la hoja. */
  verComo: (c: number, pid: string) => void;
};
