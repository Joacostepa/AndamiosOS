// Registro de calculadores: uno por pantalla. Cada archivo lo mantiene su dueño; este
// índice no se toca (ya importa los 7).

import type { PantallaId } from "../tipos.ts";
import type { Calculador } from "./contrato.ts";
import { calculador as semana } from "./semana.ts";
import { calculador as caja } from "./caja.ts";
import { calculador as ventas } from "./ventas.ts";
import { calculador as cobranzas } from "./cobranzas.ts";
import { calculador as calle } from "./calle.ts";
import { calculador as socios } from "./socios.ts";
import { calculador as datos } from "./datos.ts";

export const CALCULADORES: Readonly<Record<PantallaId, Calculador<unknown>>> = {
  semana, caja, ventas, cobranzas, calle, socios, datos,
} as Record<PantallaId, Calculador<unknown>>;
