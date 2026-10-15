// Nodos de desglose de Datos y definiciones. DUEÑO: quien construye /direccion/datos.
//
// Convención: un nodo por indicador con `tipo` = id del diccionario (lo abre la tarjeta) y
// los de nivel 2 con nombre propio ("cliente", "cuenta", "semanaFlujo", …). Ver ./contrato.ts.

import type { DefNodo } from "./contrato.ts";

export const nodos: DefNodo[] = [];
