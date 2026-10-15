// Tipologías nuevas (lo edita el equipo de tipologías). Cada una es un archivo + su test.
// Ver docs/oficina-tecnica/modelador/como-agregar-tipologia.md
import type { Tipologia } from './registro.ts';
import { BANDEJA } from './bandeja.ts';
import { BANDEJA_PORTICO } from './bandeja-portico.ts';
import { BANDEJA_VOLADIZO } from './bandeja-voladizo.ts';
import { COLGANTE } from './colgante.ts';
import { ENVOLVENTE } from './envolvente.ts';
import { TORRE_PLATAFORMA } from './torre-plataforma.ts';
import { TORRE_MOVIL } from './torre-movil.ts';
import { PATIO_INTERNO } from './patio-interno.ts';
import { SOBRE_ESCALERA } from './sobre-escalera.ts';
import { HUECO_ESCALERA } from './hueco-escalera.ts';

/** En el orden de la galería dentro de cada categoría. */
export const NUEVAS: Tipologia[] = [
  BANDEJA, BANDEJA_PORTICO, BANDEJA_VOLADIZO,
  TORRE_PLATAFORMA, TORRE_MOVIL,
  COLGANTE, ENVOLVENTE, PATIO_INTERNO, SOBRE_ESCALERA, HUECO_ESCALERA,
] as unknown as Tipologia[];
