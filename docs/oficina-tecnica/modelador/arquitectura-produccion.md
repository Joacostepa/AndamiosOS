# Modelador ABA en producción: arquitectura

> Documento de trabajo para los agentes que construyen el modelador dentro de Andamios OS (rama `feat/modelador`).
> Fija el contrato que comparten el **núcleo**, las **tipologías nuevas (A)**, la **pantalla (B)** y la **persistencia (C)**.
> Cuando algo de acá choque con la maqueta, gana este documento. Cuando choque con el pedido de JS, gana el pedido.
> Fecha: 14/10/2026. Todo cálculo es **PREDIMENSIONADO**.

---

## 0. Decisiones en una página

| # | Decisión | Por qué |
|---|---|---|
| D1 | El motor se porta a **TypeScript puro** en `src/lib/tecnica/modelo/`. No usa DOM, three ni React, y se prueba con `node --test`. | Es el mismo motor en el navegador (vista en vivo) y en el servidor (al generar el cómputo se recalcula, no se confía en lo que manda el cliente). Sigue el patrón de `src/lib/cotizador` y `src/lib/mapa-obras`. |
| D2 | El 3D se porta como **módulo imperativo de three** (no r3f), montado desde un client component cargado con `dynamic(..., { ssr:false })`. Los paneles se hacen en React con shadcn. | `vista3d.js` (1.011 líneas) ya resuelve InstancedMesh por geometría, picking por celda, manijas, render bajo demanda y PNG, y JS lo aprobó. Reescribirlo en r3f es trabajo sin valor nuevo y suma `@react-three/*` con pin de React. Con three solo hay una dependencia nueva. |
| D3 | Toda estructura se resuelve en un **Esqueleto** común (columnas, vanos, cotas, paños y celdas). Las tipologías *generan* esqueletos y un único `armar()` los convierte en piezas. | Así salen gratis las diagonales bien dibujadas (una regla, un lugar), la medida libre (el ajuste con caño y grampa se resuelve en `armar`), la **estructura libre** (un esqueleto editado a mano) y el **"Convertir a estructura libre"** (se congela el esqueleto generado). |
| D4 | Las tipologías se registran en `tipologias/indice.ts`. Las nuevas entran por **un barril propio**, `tipologias/_nuevas.ts`, que el núcleo crea vacío y después es solo de A. | A suma tipologías sin tocar el núcleo ni el índice. La UI arma el panel de parámetros a partir de `campos` (descriptores) y la galería a partir de `presets`, así que una tipología nueva aparece sola. |
| D5 | El catálogo **no está en el código**. En producción, `Catalogo` se arma desde `catalogo_piezas` + `stock` + `tec_pieza_mapa` + `tec_kits`. Los pesos y stock de la maqueta pasan a ser **solo un fixture de tests**. | Pedido de JS: los pesos que no existen se muestran "sin peso", nunca se inventan. Lo que no tiene código va como "sin código". |
| D6 | Las piezas se emiten por **familia + medidas** y se resuelven a código con `tec_pieza_mapa`, que Oficina Técnica puede editar. | Así se evita el riesgo R1 (largos de Allround contra stock real) y se aguantan cambios de códigos de Odoo sin redeploy. |
| D7 | Persistencia en **`tec_modelos`** (con `obra_id` nullable y `es_plantilla`), más `computos.modelo_id` y `computo_items.origen`/`modelo_cantidad`. El cómputo se genera con una **RPC transaccional** que respeta lo editado a mano y se bloquea si el cómputo está completado. | Es la decisión 5 y 7 de la propuesta: muestra la diferencia y no pisa en silencio. |
| D8 | Las escrituras van por **route handlers** `/api/tecnica/modelador/**` con `exigirModulo`. Nuevo módulo `modelador` en `DEFINICION`. Se alinea la RLS de `computos` con los permisos por módulo. | En el repo no hay server actions: todas las mutaciones con permiso usan route handlers (`hoja-dia`, `comercial`). |
| D9 | El estado del editor va en **zustand** (ya instalado), **sin immer**: las operaciones del núcleo ya devuelven copias. Deshacer funciona con un ring buffer de 200 diseños. | `immer` no está en `package.json` (aparece solo como dependencia transitiva). No hace falta. |

---

## 1. Estrategia de port

### 1.1 Qué se porta y a dónde

| Maqueta (`docs/oficina-tecnica/modelador/maqueta/`) | Producción | Quién |
|---|---|---|
| `motor.js` (2.415 líneas) | `src/lib/tecnica/modelo/**` (TS, reestructurado en esqueleto + armar + tipologías) | Núcleo |
| `motor.test.mjs` (32 tests) | `src/lib/tecnica/modelo/**/*.test.ts` (se portan los 32 y se agregan los del §6) | Núcleo |
| `vista3d.js` | `src/components/tecnica/modelador/vista3d/*.ts` (imperativo, sin estado global: recibe `Resultado` y callbacks) | B |
| `alzado.js` (SVG) | `src/components/tecnica/modelador/alzado/*.tsx` (componente React que dibuja SVG desde `Resultado.celdas`) | B |
| `estado.js` | `src/components/tecnica/modelador/estado/store.ts` (zustand) | B |
| `app.js`, `ui-base.js`, `index.html` | Paneles React + shadcn en `src/components/tecnica/modelador/paneles/*` | B |
| `tour.js` | Opcional en la v1 (`paneles/tour.tsx`), detrás de "¿Cómo se usa?" | B |
| `FILAS`, `KITS`, `CATALOGO` de motor.js | `src/lib/tecnica/modelo/catalogo/fixture.ts` (**solo tests y modo demo**, marcado `fuente:'fixture'`) | Núcleo |
| `CRITERIOS` | `src/lib/tecnica/modelo/criterios.ts` (valores ⚠ provisorios, con `firmado:false`) | Núcleo |

### 1.2 Reglas para el TS del núcleo

- Node 22.16 de esta Mac **no** trae strip-types por defecto. Para correr los tests: `node --no-warnings --experimental-strip-types --test "src/lib/tecnica/**/*.test.ts"`. No se cambia el script `test` de `package.json`.
- Solo sintaxis que se pueda borrar: **nada de `enum`, `namespace`, parameter properties ni decorators**. Uniones de string literal, `import type` para tipos e imports relativos **con `.ts`** (`allowImportingTsExtensions` ya está en `tsconfig.json`).
- Funciones puras: no mutan argumentos, devuelven copias (`structuredClone`). Sin `Date.now()` ni `Math.random()` en `construir` (los ids son estables y deterministas).
- Sin dependencias de runtime. `zod` se usa **solo** en persistencia/API, no en el núcleo.
- Unidades: **metros**, Y hacia arriba, planta en (x, z), `rumbo` en grados. Se redondea al milímetro (`mm()`) para claves de nodo.
- El JSON guardado tiene **códigos y metros, nunca índices sobre arrays**.

### 1.3 Por qué no r3f (y cuándo reconsiderarlo)

- r3f sirve cuando la escena es *declarativa y cambia por partes*. Acá la escena se regenera completa desde `Resultado` en cada cambio: unas 8 a 12 `InstancedMesh` reconstruidas. Eso es exactamente lo que hace `vista3d.cargar()`.
- La maqueta ya mide bien (render bajo demanda y picking por una malla invisible).
- Se reconsidera r3f solo si aparece una necesidad de componer objetos 3D desde React (gizmos complejos o anotaciones con estado). No está en el pedido.

### 1.4 Dependencias nuevas (las agrega B)

- `three` con **versión exacta** `0.186.1` y `@types/three` de la **misma minor** (`0.186.x`). Si el install no resuelve esa versión, se usa `three@0.160.0` + `@types/three@0.160.0`, que es la probada en la maqueta. Hay que anotar el pin en el handoff.
- Los addons van por `three/examples/jsm/...` (`OrbitControls`, `RoomEnvironment`). No se carga nada desde un CDN.

---

## 2. Estructura del núcleo (`src/lib/tecnica/modelo/`)

```
src/lib/tecnica/modelo/
  tipos.ts                 contrato (§3): Diseno, Estructura, Esqueleto, Pieza, LineaBom, Aviso, Resultado, Accion…
  constantes.ts            VERSION_MOTOR, ESQUEMA_DISENO, PREDIMENSIONADO, SIMPLIFICACIONES
  util.ts                  mm, r3, fmt (es-AR), marco local→mundo, geometría de polígonos
  criterios.ts             CRITERIOS ⚠ (+ firmado:false)
  catalogo/
    catalogo.ts            tipo Catalogo + resolverCodigo(familia, medidas, sistema) + infoDe(codigo)
    fixture.ts             catálogo de la maqueta para tests/demo (fuente:'fixture')
  medida/
    rellenar.ts            rellenarLargo(largo, sistema, {modo:'catalogo'|'libre', ajuste}) → Relleno
    ajustes.ts             caño y grampa: canoPara(luz), piezas de ajuste
    alturas.ts             niveles, arranque regulable, pila de verticales
  esqueleto/
    esqueleto.ts           creación/consulta: columnasDe, vanosDe, cotaK, nodoId, celdaId…
    operaciones.ts         aplicarOpEsqueleto(esq, op) (§3.6) — usado por la estructura libre
    validar.ts             consistencia geométrica (nodos que existen, rosetas alcanzables)
  armar/
    armar.ts               armar(esqueleto, estructura, catalogo, ctx) → Pieza[] + avisos
    multi.ts               columnas, anillos, barandas, rodapiés, plataformas, ménsulas, anclajes
    diagonales.ts          dibujo roseta a roseta (§4)
    bastidor.ts            bastidores, riendas, kits
    apoyos.ts              base fija/regulable, rueda, colgado, sobre estructura, escalonado
  reglas/
    diagonales.ts          sugerirDiagonales(esq, criterios) → celdas.diagonal
    anclajes.ts, protecciones.ts, plataformas.ts, accesos.ts, esbeltez.ts, via-publica.ts
    motor-reglas.ts        modo 'automatico' (plantillas) | 'sugerencias' (libre): en libre solo emite avisos con reparación
  uniones/
    puertos.ts, snap.ts, unir.ts   (de la maqueta) + modo 'embebida' (torre dentro de otra estructura)
  fusionar.ts              fusionarNodos(piezas)
  bom.ts                   calcularBom(piezas, catalogo, modo) → LineaBom[]
  diseno.ts                crearDiseno, agregarEstructura, quitarEstructura, setParam, setOverride,
                           editarEsqueleto, convertirALibre, cambiarSistema, aplicarReparacion, migrarDiseno
  construir.ts             construir(diseno, catalogo, criterios?) → Resultado
  tipologias/
    registro.ts            tipo Tipologia, registrarTodas(lista) (valida ids únicos), tipologia(id)
    indice.ts              TIPOLOGIAS = [...BASE, ...NUEVAS]   ← núcleo (A no lo toca)
    _nuevas.ts             export const NUEVAS: Tipologia[] = []   ← lo crea el núcleo vacío; después es de A
    comunes/               helpers que A puede usar (§5.3): visera.ts, bandeja.ts, viga-celosia.ts,
                           ruedas.ts, escalera-interior.ts, poligono.ts, apoyo-escalonado.ts
    fachada.ts             multi: pantalla, estructura±pantalla, voladizo con ménsulas (presets)
    fachada-bastidor.ts
    torre.ts               escalera, acceso (presets)
    portico.ts             peatonal, vehicular (presets)
    libre.ts               Estructura libre (§7)
  *.test.ts                junto a cada módulo
```

**Qué hace el núcleo, de los pedidos de JS:** 1 (diagonales), 8 (medida libre), 8c (estructura libre y "Convertir"), 8e (registro), el modo de unión `embebida` (la parte del núcleo del pedido 6) y los helpers `comunes/` que necesita A. **Qué hace A:** 2, 3, 4, 5, 6 (tipologías de torre nuevas), 7 y 8b, más el documento `como-agregar-tipologia.md`. **8d (plantillas propias)** queda repartido entre C (tabla y API) y B (galería "Mis plantillas"). El núcleo solo aporta `instanciarPlantilla(disenoGuardado)` (§3.8).

---

## 3. Contrato de tipos (`tipos.ts`)

Este es el contrato. El núcleo lo implementa tal cual. Si necesita cambiarlo, lo anota en §11 (Cambios al contrato) para que A, B y C se enteren.

### 3.1 Básicos

```ts
export type V2 = [number, number];          // planta (x, z) o local (s, t)
export type V3 = [number, number, number];  // mundo (x, y, z)
export type Sistema = 'multi' | 'bastidor';
export type SistemaPieza = Sistema | 'comun';
export type ModoMedida = 'catalogo' | 'libre';      // toggle "medida libre" (default 'catalogo')
export type ModoBom = 'kit' | 'despiezado';         // bastidor: default 'kit'
export type Poligono = V2[];                         // en sentido antihorario, sin repetir el primero
```

### 3.2 Diseño y estructura

```ts
export interface Diseno {
  esquema: number;                 // ESQUEMA_DISENO (empieza en 2; la maqueta era 1). migrarDiseno() sube versiones viejas
  nombre: string;
  obra?: { id: string; codigo: string; nombre: string } | null;
  contexto: Contexto;
  estructuras: Estructura[];
  uniones: Union[];
  modoBom: ModoBom;
  ajustesBom: AjusteBom[];         // ± manual por código; no toca el modelo
}

export interface Contexto {
  terreno: 'cemento' | 'tierra' | 'losa';
  enVereda: boolean;
  anchoVereda?: number;
  claseCarga: number;              // 3 por defecto
  zonaViento?: string;
  /** Volúmenes de referencia: el edificio, una losa de la que colgar, una cúpula o un tanque para envolver, una escalera. */
  volumenes: Volumen[];
}

export interface Volumen {
  id: string;
  tipo: 'edificio' | 'losa' | 'puente' | 'cupula' | 'cilindro' | 'muro' | 'escalera';
  nombre?: string;
  planta: Poligono;                // en mundo
  yBase: number;
  yTope: number;
  /** Solo si tipo === 'escalera': escalones en planta, sobre el eje del tramo. */
  escalera?: { peldanos: { s: number; huella: number; contrahuella: number }[]; rumbo: number; origen: V2;
               descansos: { s0: number; s1: number; cota: number }[] };
}

export interface Estructura {
  id: string;                      // 'E1', 'E2'…: estable dentro del diseño
  tipologia: string;               // id registrado ('fachada', 'bandeja', 'libre'…)
  tipologiaVersion: number;        // para migrarParams
  preset?: string;                 // preset de la galería con el que se creó (informativo)
  nombre: string;
  sistema: Sistema;
  origen: V2;
  rumbo: number;
  apoyo: Apoyo;
  medida: ModoMedida;              // 'catalogo' | 'libre'
  params: Record<string, unknown>; // los valida/normaliza la tipología (normalizar)
  overrides: Record<string, OverrideCelda>;   // clave = id de celda del esqueleto (§3.4)
  /** Solo en la tipología 'libre': el esqueleto editado a mano. */
  esqueleto?: Esqueleto;
  /** Si vino de "Convertir a estructura libre": de qué era. Ya no se regenera por parámetros. */
  convertidaDe?: { tipologia: string; tipologiaVersion: number; params: Record<string, unknown> };
}

/** Cómo se apoya la estructura (pedido 4, 7, 8b). */
export type Apoyo =
  | { tipo: 'suelo'; terreno?: Contexto['terreno'] }      // las cotas por columna (escalonado) van en el esqueleto
  | { tipo: 'colgado'; modo: 'suspendido' | 'volado';
      soporte: { volumenId?: string; estructuraId?: string; cota: number };
      sujecion: 'cano_grampa' | 'viga_celosia' | 'mensula' | 'anclaje_quimico' }
  | { tipo: 'sobre_estructura'; estructuraId: string };   // equivale a la unión 'apoyo' de la maqueta

export interface OverrideCelda {
  abertura?: boolean; viga?: boolean; sinPlataforma?: boolean; lona?: boolean;
  mensula?: 'afuera' | 'fachada' | false; anclaje?: boolean;
  diagonal?: 'sube' | 'baja' | false;     // nuevo: forzar o quitar la diagonal de una celda de cara
}

export interface Union {
  id: string;
  a: { estructuraId: string; puerto: string; s?: number };
  b: { estructuraId: string; puerto: string };
  modo: 'vertical_compartida' | 'vano_giro' | 'apoyo' | 'embebida';
  // 'embebida': B (típicamente una torre) ocupa vanos de A. Comparten verticales; A pierde sus plataformas
  // y diagonales en la huella de B; B pone su acceso (escalera/escotilla) y desembarca en los niveles de A.
}

export interface AjusteBom { codigo: string; delta: number; motivo?: string }
```

### 3.3 Medida libre

```ts
export interface Relleno {
  modo: ModoMedida;
  pedido: number;                          // largo pedido
  vanos: TramoVano[];                      // en orden
  total: number;                           // suma real
  desvio: number;                          // total − pedido (en 'libre' es 0 salvo tolerancia de 5 mm)
  texto: string;                           // "5 × 2,50 + 1 × 1,09 + ajuste 0,37 (caño y grampa)"
  alternativas: { id: string; etiqueta: string; vanos: TramoVano[]; texto: string; desvio: number }[];
}
export interface TramoVano { medida: number; libre: boolean }   // libre = no es largo de catálogo → caño y grampa
```

Reglas (`medida/rellenar.ts`):
- **`catalogo`** (default ágil): solo largos de catálogo. Muestra el desvío y las alternativas ("menos piezas", "vanos iguales", "menos peso"), igual que la maqueta. Si el desvío pasa la tolerancia (0,10 ⚠), aviso con reparación "Pasar a medida libre".
- **`libre`**: cubre el largo exacto con vanos de catálogo + **un** tramo libre (al final o centrado, según `ajuste`), siempre que el resto sea ≥ 0,20 m. Si el resto es menor que 0,20, se absorbe agrandando el último vano libre o achicando uno de catálogo al siguiente menor más un tramo libre más largo. Nunca queda un tramo libre menor de 0,20 ni mayor de 2,50 ⚠.
- **Altura libre:** el último nivel de trabajo queda donde se pide. La diferencia contra el paso de roseta (0,50) se absorbe primero con el **tornillón** (arranque regulable 0,25 a 0,75 ⚠). Si no alcanza, el nivel de trabajo superior se arma con **horizontales de caño y grampa** a la cota exacta, con aviso.
- **Profundidad libre:** transversales y plataforma de la medida pedida. Los transversales van con caño y grampa. La plataforma va con tablones del ancho que entra más un fenólico de relleno, con aviso.

Piezas de ajuste (`medida/ajustes.ts`), que emite `armar` en un tramo libre:
- **Horizontal o baranda de un vano libre** = `cano` de largo `ceil10(luz + 2 × 0,15)` + 2 `grampa_fija`.
- **Diagonal de un vano libre** = `cano` de largo `ceil10(√(luz² + h²) + 0,30)` + 2 `grampa_giratoria`.
- **Plataforma de un vano libre** = tablones del siguiente largo de catálogo **mayor**, si el solape es ≤ 0,50 ⚠ (aviso "tablón volado"). Si no, `fenolico` en m².
- En el catálogo real, `cano` resuelve a **`CAÑO-010` … `CAÑO-640`** (existen en `catalogo_piezas`, en pasos de 0,10). `grampa_fija` resuelve a `NUDO-FIJO` y `grampa_giratoria` a `NUDO-GIR`.
- Cada pieza de ajuste lleva `ajuste: {motivo, medidaPedida, medidaPieza}`. La BOM las agrupa en un bloque **"Ajuste con caño y grampa"** y la UI las muestra en otro color.

### 3.4 Esqueleto (lo que generan las tipologías y edita la estructura libre)

```ts
/** Grafo estructural en coordenadas LOCALES de la estructura (s a lo largo, t hacia afuera, y arriba). */
export interface Esqueleto {
  sistema: Sistema;
  columnas: Columna[];
  vanos: Vano[];                 // aristas de planta entre dos columnas (caras y transversales)
  panos: Pano[];                 // superficies de planta (normalmente 4 vanos) donde va plataforma
  cotas: number[];               // cotas de anillo (y) ascendentes, compartidas. Índice k = 0..n−1
  celdas: Record<string, CeldaCara>;   // clave `${vanoId}@${k}`: banda entre cotas[k−1] (o el arranque) y cotas[k]
  celdasPano: Record<string, CeldaPano>; // clave `${panoId}@${k}`: lo que hay en la cota k
  nodos: Record<string, NodoExtra>;    // clave `${columnaId}@${k}`
  elementos: Elemento[];         // piezas "especiales" con geometría propia (vigas, viseras, zancas…)
}

export interface Columna {
  id: string;                    // 'c0', 'c1'… estable
  p: V2;                         // (s, t) local
  yBase: number;                 // arranque de la vertical (sobre el apoyo). Distinto por columna = apoyo escalonado
  yTope: number;                 // cota superior (incluye montante de baranda)
  apoyo: 'base_fija' | 'base_regulable' | 'rueda' | 'rueda_freno' | 'colgada' | 'sobre' | 'ninguno';
  /** Cota del terreno/peldaño bajo la columna (para medir la extensión del tornillón). */
  ySuelo?: number;
}

export interface Vano {
  id: string;                    // 'v0'…
  a: string; b: string;          // ids de columna
  cara: 'exterior' | 'interior' | 'transversal' | 'interna';
  medida: number;                // distancia a–b (redundante, validada)
  libre: boolean;                // no es largo de catálogo → caño y grampa
}

export interface Pano { id: string; vanos: string[]; libre: boolean }

export interface CeldaCara {
  horizontal?: boolean;          // anillo en cotas[k] (default true si ambas columnas llegan)
  baranda?: 0 | 1 | 2;           // 2 = doble baranda (0,50 y 1,00)
  rodapie?: boolean;
  diagonal?: 'sube' | 'baja' | null;   // 'sube' = de (a, cota k−1) a (b, cota k)
  cerramiento?: 'lona' | 'media_sombra' | 'fenolico' | 'chapa' | null;
  abertura?: boolean;            // paso sin horizontales intermedias ni diagonal
}

export interface CeldaPano {
  plataforma?: 'tablones' | 'escotilla' | 'fenolico' | null;
  diagonalPlanta?: boolean;
}

export interface NodoExtra {
  anclaje?: boolean | { retiro: number };
  mensula?: { dir: 'afuera' | 'fachada'; brazo: number } | null;
  estabilizador?: { brazo: number } | null;
}

/** Algo que no es una pieza de grilla. Se arma tal cual, y en la estructura libre se puede quitar o mover. */
export interface Elemento {
  id: string;
  familia: Familia;
  medidas: Medidas;
  a: V3; b: V3;                  // local
  primitivas?: { a: V3; b: V3 }[];
  ajuste?: Pieza['ajuste'];
  rinde?: number;                // m² o m para cubiertas
  grupo?: string;                // 'visera', 'portico', 'zanca'… (para seleccionar todo junto)
}
```

Convenciones:
- Los ids de columna, vano y paño son **estables**. Una operación que agrega no renumera. Se usa `proximoId(prefijo)`.
- `celdaId = "${vanoId}@${k}"`. Las celdas de la maqueta `"f:v:n"` se migran a este formato con `migrarDiseno` cuando un diseño viejo se abre.
- **Sparse:** un valor que no está en `celdas`, `celdasPano` o `nodos` toma el default de las reglas. Solo se guarda lo que difiere.

### 3.5 Pieza, BOM, avisos

```ts
export type Familia =
  | 'vertical' | 'horizontal' | 'baranda' | 'diagonal' | 'diagonal_planta'
  | 'tablon' | 'tablon_escotilla' | 'rodapie' | 'fenolico'
  | 'base_fija' | 'base_regulable' | 'collarin' | 'rueda' | 'rueda_freno' | 'estabilizador'
  | 'anclaje' | 'mensula' | 'viga_celosia' | 'viga_puente' | 'zanca' | 'escalera_interior' | 'baranda_escalera'
  | 'bastidor' | 'bastidor_baranda' | 'rienda_h' | 'rienda_d' | 'modulo_kit'
  | 'cano' | 'grampa_fija' | 'grampa_giratoria' | 'manguito'
  | 'lona' | 'media_sombra' | 'chapa' | 'colgador' | 'recubrimiento' | 'esfera' | 'defensa' | 'accesorio';

export interface Medidas { largo?: number; alto?: number; ancho?: number; variante?: string }

export interface Pieza {
  id: string;                    // `${estructuraId}:${owner}:${local}`: estable entre construcciones
  familia: Familia;
  medidas: Medidas;
  codigo: string | null;         // null = "sin código" (no hay entrada en tec_pieza_mapa)
  peso_kg: number | null;        // del catálogo; null = "sin peso". NUNCA se inventa
  a: V3; b: V3;                  // mundo
  estructuraId: string;
  owner: string;
  celda?: string; nodo?: string; elemento?: string;
  kit?: { codigo: string; grupo: string };
  medida?: number;               // m² o m para códigos con rinde
  ajuste?: { motivo: 'vano_libre' | 'altura_libre' | 'profundidad_libre' | 'amarre' | 'manual';
             medidaPedida: number; medidaPieza: number };
  primitivas?: { a: V3; b: V3 }[];
}

export interface LineaBom {
  clave: string;                 // codigo, o `SIN:${familia}:${medidas}` si no tiene código
  codigo: string | null;
  piezaId: string | null;        // catalogo_piezas.id (lo necesita computo_items)
  descripcion: string;
  familia: Familia;
  grupo: string;                 // familia visible ("Verticales", "Ajuste con caño y grampa"…)
  cantidad: number;              // unidades de compra (con rinde ya aplicado)
  unidad: string;
  peso_unit: number | null;
  peso_total: number | null;
  stockLibre: number | null;     // en_deposito − comprometido; null si no hay dato
  falta: number | null;
  esKit: boolean;
  esAjuste: boolean;
  sinCodigo: boolean;
  ajusteManual: number;          // suma de AjusteBom para este código
}

export type Nivel = 'error' | 'aviso' | 'info';
export interface Aviso {
  id: string;
  regla: string;                 // id estable de la regla: 'diag.falta', 'hb.excede', 'medida.desvio'…
  nivel: Nivel;
  texto: string;                 // rioplatense, en palabras de obra
  estructuraId: string | null;
  celda?: string;
  reparaciones: { etiqueta: string; accion: Accion }[];
}
export interface Regla { id: string; regla: string; texto: string; estructuraId: string | null; deshacer?: Accion }

export type Accion =
  | { tipo: 'param'; estructuraId: string; ruta: string; valor: unknown }
  | { tipo: 'override'; estructuraId: string; celda: string; valor: OverrideCelda | null }
  | { tipo: 'esqueleto'; estructuraId: string; op: OpEsqueleto }
  | { tipo: 'medida'; estructuraId: string; modo: ModoMedida }
  | { tipo: 'modoUnion'; unionId: string; modo: Union['modo'] }
  | { tipo: 'quitarUnion'; unionId: string }
  | { tipo: 'agregarEstructura'; tipologia: string; preset?: string; opciones?: Record<string, unknown> };
```

### 3.6 Operaciones de la estructura libre

```ts
export type OpEsqueleto =
  | { op: 'agregarVano'; desde: { vanoId?: string; columnaId?: string }; hacia: 'izq' | 'der' | 'afuera' | 'adentro';
      medida: number; libre?: boolean; desdeK?: number; hastaK?: number }   // crecer de costado o hacia afuera, solo en una zona
  | { op: 'quitarVano'; vanoId: string }
  | { op: 'medidaVano'; vanoId: string; medida: number; libre?: boolean }
  | { op: 'agregarNivel'; cota: number; columnas?: string[] }               // crecer hacia arriba solo en una zona
  | { op: 'quitarNivel'; k: number; columnas?: string[] }
  | { op: 'celda'; clave: string; valor: Partial<CeldaCara> | null }
  | { op: 'pano'; clave: string; valor: Partial<CeldaPano> | null }
  | { op: 'nodo'; clave: string; valor: Partial<NodoExtra> | null }
  | { op: 'columna'; columnaId: string; yBase?: number; yTope?: number; apoyo?: Columna['apoyo']; ySuelo?: number }
  | { op: 'agregarElemento'; elemento: Elemento }
  | { op: 'quitarElemento'; id: string }
  | { op: 'moverElemento'; id: string; delta: V3 };
```

`aplicarOpEsqueleto(esq, op) → { esqueleto, avisos }` es pura y está en el núcleo. B solo dispara ops desde la UI.

### 3.7 Resultado de `construir`

```ts
export interface Resultado {
  piezas: Pieza[];
  bom: LineaBom[];
  avisos: Aviso[];
  reglas: Regla[];
  estructuras: EstructuraResuelta[];   // con su esqueleto efectivo, métricas, puertos y celdas
  celdas: CeldaResuelta[];             // geometría de cada celda (para alzado, picking y overlays)
  puertos: Puerto[];
  uniones: UnionResuelta[];
  resumen: {
    m2: number; ml: number; alturaMax: number;
    pesoKg: number; pesoParcial: boolean; codigosSinPeso: string[];
    sinCodigo: { clave: string; familia: Familia; medidas: Medidas; cantidad: number }[];
    piezas: number; piezasAjuste: number; anclajes: number;
    faltantesStock: { codigo: string; falta: number }[];
    modoBom: ModoBom; etiqueta: 'PREDIMENSIONADO'; catalogoFuente: 'base' | 'fixture';
    texto: string;                     // "412 m² · 9,8 t* · 3.214 pzs · … · PREDIMENSIONADO"
  };
  ms: number;
}
export interface EstructuraResuelta {
  id: string; nombre: string; tipologia: string;
  esqueleto: Esqueleto;                // MUNDO NO: local + marco
  marco: { origen: V2; rumbo: number };
  m2: number; ml: number; alturaReal: number; huella: Poligono;
  apoyaEn: string[]; regenerable: boolean; // false si es 'libre'
}
export interface CeldaResuelta {
  id: string; estructuraId: string; tipo: 'cara' | 'pano';
  esquinas: V3[];                      // mundo (4 puntos de la cara, o el polígono del paño a la cota)
  vanoId?: string; panoId?: string; k: number;
  estado: 'ok' | 'aviso' | 'error';
}
// Puerto y UnionResuelta: igual que la maqueta (motor.js, typedef Puerto), en TS.
```

### 3.8 API pública del núcleo (lo que importan B y C)

```ts
// src/lib/tecnica/modelo/index.ts  (barril público; A, B y C importan SOLO de acá o de tipos.ts)
export * from './tipos.ts';
export { VERSION_MOTOR, ESQUEMA_DISENO, PREDIMENSIONADO, SIMPLIFICACIONES } from './constantes.ts';
export { CRITERIOS } from './criterios.ts';
export { construir } from './construir.ts';
export { calcularBom } from './bom.ts';
export { rellenarLargo } from './medida/rellenar.ts';
export {
  crearDiseno, agregarEstructura, quitarEstructura, setParam, setOverride, editarEsqueleto,
  convertirALibre, cambiarSistema, aplicarReparacion, unir, buscarSnap, puertosDe, migrarDiseno,
  instanciarPlantilla, validarDiseno,
} from './diseno.ts';
export { TIPOLOGIAS, tipologia, presetsGaleria } from './tipologias/indice.ts';
export type { Catalogo, ItemCatalogo, EntradaMapa } from './catalogo/catalogo.ts';
export { catalogoVacio } from './catalogo/catalogo.ts';
export { CATALOGO_FIXTURE } from './catalogo/fixture.ts';   // solo tests y demo
export { fmt } from './util.ts';
```

Firmas clave:
- `crearDiseno(tipologiaId?: string, opciones?: { preset?: string; params?: object; nombre?: string; sistema?: Sistema; obra?: Diseno['obra'] }): Diseno`
- `construir(diseno: Diseno, catalogo: Catalogo, criterios = CRITERIOS): Resultado`. Es **determinista** y tiene que tardar 10 ms o menos en el ejemplo Paraná 631.
- `convertirALibre(diseno, estructuraId, catalogo): Diseno` congela el esqueleto efectivo, con overrides y reglas ya aplicadas. Pasa `tipologia` a `'libre'`, guarda `convertidaDe` y agrega un aviso `info` "Ya no se regenera por parámetros".
- `instanciarPlantilla(disenoPlantilla, { origen?, obra? }): Diseno` renumera ids y limpia la obra. Se usa para "Mis plantillas".
- `validarDiseno(json: unknown): { ok: true; diseno: Diseno } | { ok: false; errores: string[] }` hace un chequeo estructural mínimo (lo usa C antes de guardar) y aplica `migrarDiseno`.
- `editarEsqueleto(diseno, estructuraId, op: OpEsqueleto): Diseno`

### 3.9 Catálogo (DTO que arma C y consume el núcleo)

```ts
export interface ItemCatalogo {
  codigo: string; piezaId: string | null; descripcion: string; familia: Familia | null;
  sistema: SistemaPieza; unidad: string; rinde?: number;
  peso_kg: number | null;                        // tal cual viene de catalogo_piezas
  stock: { enDeposito: number; comprometido: number } | null;
  activo: boolean;
}
export interface EntradaMapa {
  familia: Familia; sistema: SistemaPieza;
  largo: number | null; alto: number | null; ancho: number | null; variante: string | null;
  codigo: string; prioridad: number;
}
export interface Catalogo {
  fuente: 'base' | 'fixture';
  piezas: Record<string, ItemCatalogo>;
  mapa: EntradaMapa[];
  kits: Record<string, Record<string, number>>;  // kit → { componente: cantidad }
  medidas: {                                       // listas de largos que ofrece la UI/rellenar
    multi: { vanos: number[]; profundidades: number[]; pasoRoseta: number; pasoNivel: number;
             mensulas: number[]; vigasCelosia: number[]; vigasPuente: number[] };
    bastidor: { vanos: number[]; anchos: number[]; alturaCuerpo: number; alturaPaso: number; alturaBaranda: number };
    canos: number[];                               // largos de caño disponibles (0,10…6,40)
  };
}
```

- `resolverCodigo(catalogo, familia, medidas, sistema)`: busca en `mapa` una coincidencia exacta de (familia, sistema o 'comun', largo, alto, ancho, variante) al milímetro. Si hay varias, gana la de menor `prioridad`. Si no hay, devuelve `null` y la pieza queda **sin código**. El núcleo **nunca** fabrica un código.
- Las `medidas.multi.vanos` salen del mapa: largos con `familia='horizontal'` y sistema `multi`. Si el mapa está vacío, se toman los default de la decisión vigente (2,50/2,00/1,50/1,25/1,09/0,73 y profundidades 0,73/1,09/1,25), con un aviso.

---

## 4. Diagonales como en obra (pedido 1)

Referencias: fotos 7, 8 y 9. La captura 1 muestra el error actual: cruces en X que atraviesan dos vanos y diagonales que no llegan a nodos.

**Regla de dibujo (`armar/diagonales.ts`):**
1. Una diagonal **siempre** une dos **nodos**. Un nodo es una roseta de una columna a una cota donde hay anillo (horizontal) en esa columna. Va de `(a, cotas[k−1])` a `(b, cotas[k])` (`'sube'`) o de `(b, cotas[k−1])` a `(a, cotas[k])` (`'baja'`), siempre dentro de **un solo vano y una sola banda**.
2. Es **una sola diagonal por celda de cara**. No existen cruces en X dentro de una celda ni diagonales que crucen dos vanos.
3. Van en la **cara exterior** (`vano.cara==='exterior'`) y en las **transversales de los extremos**. La cara interior (lado fachada) no lleva diagonal por defecto.
4. **Zigzag continuo en altura:** en un vano arriostrado, la dirección alterna con k (`k` par → `'sube'`, `k` impar → `'baja'`). Así el nodo superior de la banda k es el nodo inferior de la banda k+1 y en altura se forma la "escalera" continua de las fotos. Los vanos arriostrados contiguos alternan además la fase (se forman "V" y "Λ", no paralelas), como en la foto 8.
5. **Qué vanos van arriostrados** (`reglas/diagonales.ts`, ⚠): los extremos de cada tramo y al menos uno cada `CRITERIOS.diagonalCadaVanos` (5). En un vano de esquina entrante se corre al vano anterior (como en la maqueta). En una celda con `abertura` o en un paso peatonal bajo el gálibo no se dibuja, y si ese vano queda sin arriostrar se emite un aviso con la reparación "Arriostrar el vano siguiente".
6. **Altura de banda y código:** `h = cotas[k] − cotas[k−1]`. El código sale de `resolverCodigo('diagonal', {alto:h, largo:vano.medida})`. Hoy solo existen las de `alto=2,00` (`DIAG-200x073…250`) y `DIAG-150x250`. Si la banda mide otra cosa (pantalla 1,00/1,50, último nivel), queda **sin código** con un aviso "Diagonal de h × v sin código: ¿usás caño y grampa?" y la reparación "Pasar a caño y grampa", que emite `cano` + 2 `grampa_giratoria`. Nunca se estira una diagonal de 2,00 para que entre.
7. Si en un vano libre no hay código, va siempre con caño y grampa (§3.3).
8. Diagonal en planta: en el arranque y bajo los pórticos (`CeldaPano.diagonalPlanta`), roseta a roseta en un paño.

**Tests obligatorios** (núcleo, `armar/diagonales.test.ts`):
- Cada diagonal tiene sus dos extremos en un nodo existente (columna × cota con anillo), con tolerancia de 1 mm.
- Ninguna diagonal proyecta en planta un largo mayor que el de su vano.
- No hay dos diagonales en la misma celda.
- En un vano arriostrado, el extremo superior de la banda k coincide con el inferior de la banda k+1 (zigzag continuo).
- En la fachada de 14 m × 12 m con vanos de 2,50, la cantidad de diagonales = vanos arriostrados × niveles + transversales extremos (golden).

---

## 5. Registro de tipologías (pedido 8e)

### 5.1 Interfaz

```ts
// tipologias/registro.ts
export interface Campo {
  ruta: string;                  // 'params.visera.tipo', 'params.frentes', 'params.ancho'
  etiqueta: string;              // rioplatense, corto
  tipo: 'medida' | 'entero' | 'opcion' | 'bool' | 'frentes' | 'poligono' | 'lista_medidas' | 'texto';
  unidad?: 'm' | 'm²' | '°';
  min?: number; max?: number; paso?: number;
  opciones?: { valor: string | number; etiqueta: string }[];
  /** Muestra el campo solo si la condición se cumple sobre los params normalizados. */
  visibleSi?: { ruta: string; igual?: unknown; distinto?: unknown };
  ayuda?: string;
  grupo?: 'Medidas' | 'Protección' | 'Apoyo' | 'Accesos' | 'Avanzado';
  /** Medidas de catálogo que se ofrecen como chips cuando estructura.medida === 'catalogo'. */
  catalogo?: 'vanos' | 'profundidades' | 'mensulas' | 'vigasCelosia';
}

export interface Preset {
  id: string;                    // único global: 'bandeja_45', 'torre_movil_interior'…
  nombre: string; descripcion: string; icono: string; tecla?: string;
  params: Record<string, unknown>;    // parcial: se mezcla con porDefecto()
  sistema?: Sistema;
}

export interface CtxGenerar {
  diseno: Diseno;                // solo lectura (para volúmenes del contexto y otras estructuras)
  catalogo: Catalogo;
  criterios: typeof CRITERIOS;
  rellenar: typeof rellenarLargo;
}

export interface Generado {
  esqueleto: Esqueleto;          // local
  elementos?: Elemento[];        // también se pueden poner dentro de esqueleto.elementos
  avisos: Omit<Aviso, 'id'>[];
  reglas: Omit<Regla, 'id'>[];
  metricas: { m2: number; ml: number; alturaReal: number; huella: Poligono };
  puertos?: Omit<Puerto, 'estructuraId'>[];   // si se omite, el núcleo deriva los de caja/cara
  /** Reglas del núcleo que esta tipología NO quiere (p. ej. un colgante no lleva bases). */
  sinReglas?: string[];
}

export interface Tipologia<P extends Record<string, unknown> = Record<string, unknown>> {
  id: string;                    // 'bandeja', 'torre_movil'…: kebab o snake, único
  version: number;               // subir cuando cambia la forma de params
  nombre: string;
  descripcion: string;
  categoria: 'fachada' | 'bandeja' | 'torre' | 'portico' | 'especial' | 'libre';
  sistemas: Sistema[];
  apoyos: Apoyo['tipo'][];       // apoyos que admite
  porDefecto(): P;
  normalizar(parcial: Partial<P>, sistema: Sistema): { params: P; avisos: string[] };  // clamp + defaults, nunca tira
  campos: Campo[];
  presets: Preset[];
  generar(est: Estructura & { params: P }, ctx: CtxGenerar): Generado;
  migrarParams?(viejos: Record<string, unknown>, versionVieja: number): P;
}
```

### 5.2 Índice

```ts
// tipologias/indice.ts (núcleo)
import { registrarTodas } from './registro.ts';
import { FACHADA } from './fachada.ts';
import { FACHADA_BASTIDOR } from './fachada-bastidor.ts';
import { TORRE } from './torre.ts';
import { PORTICO } from './portico.ts';
import { LIBRE } from './libre.ts';
import { NUEVAS } from './_nuevas.ts';          // ← de A
export const TIPOLOGIAS = registrarTodas([FACHADA, FACHADA_BASTIDOR, TORRE, PORTICO, ...NUEVAS, LIBRE]);
```

```ts
// tipologias/_nuevas.ts (lo crea el núcleo así; después SOLO lo edita A)
import type { Tipologia } from './registro.ts';
export const NUEVAS: Tipologia[] = [];
```

`registrarTodas` tira un error en el arranque si se repite un id de tipología o de preset (y lo prueba un test). `presetsGaleria()` devuelve los presets agrupados por categoría, en el orden de la galería.

### 5.3 Helpers `tipologias/comunes/` (los hace el núcleo; A los usa y no los modifica)

| Helper | Qué hace |
|---|---|
| `grillaRect({ vanosS, profundidades, cotas, origenT? })` | Esqueleto rectangular (columnas, vanos, paños y celdas por defecto). Base de casi todo. |
| `grillaPoligono({ poligono, offset, vanoMax, profundidad, cotas, cerrada })` | Recorre un polígono con un andamio de profundidad dada. Parte cada lado en vanos (catálogo o libre), resuelve las esquinas con un vano de giro o una vertical compartida y cierra el anillo si `cerrada`. Base de **envolventes** y **patios internos**. |
| `cotasNiveles({ altura, sistema, modo, arranque })` | Niveles cada 2,00 (o pantalla), arranque regulable y último nivel a H − 1,00. |
| `visera({ desde: V3, dir, ancho, tipo:'90'|'45'|'ninguna', alto, cerramiento })` | `Elemento[]` de la bandeja de protección: ménsulas o vigas voladas, fenólico (m²) y la visera vertical (90°) o inclinada (45°) con su cerramiento (lona, chapa o fenólico) y sus caños/grampas. |
| `vigaCelosia({ a, b, luz })` | Elige `viga_celosia` de catálogo (≥ luz) o deja sin código. Agrega la diagonal en planta. |
| `ruedas(esq, { freno:true })` | Pone `apoyo:'rueda_freno'` en todas las columnas y los avisos de H/B con ruedas. |
| `estabilizadores(esq, brazo)` | `NodoExtra.estabilizador` en las 4 esquinas. Calcula la B efectiva. |
| `escaleraInterior(esq, panoId, { tipo: 'escalera_interior' | 'zanca' })` | Escotillas alternadas por nivel (`tablon_escotilla`) y escalera o zanca. |
| `apoyoEscalonado(esq, ySueloDe: (p: V2) => number)` | Pone `ySuelo` por columna (peldaño o descanso). Fija `yBase` en la roseta alcanzable y el tornillón en `base_regulable`. Avisa si la extensión pasa la máxima ⚠. |
| `colgar(esq, { cota, sujecion })` | Columnas con `apoyo:'colgada'`, colgadores o caños + grampas hasta la cota del soporte, sin bases. |
| `muestrearEscalera(volumen)` | Función `(p) ⇒ ySuelo` a partir de `Volumen.escalera`. |

---

## 6. Tipologías: quién hace cada una

### 6.1 Núcleo (portadas de la maqueta, como tipologías del registro)

| id | Presets | Notas |
|---|---|---|
| `fachada` | `pantalla`, `estructura_pantalla` (F), `estructura`, `voladizo` | Frentes en L, ménsulas, bandeja en PB (la bandeja en PB usa `comunes/visera`), media sombra y vía pública |
| `fachada_bastidor` | `fachada_bastidor` | Kits y riendas |
| `torre` | `torre_escalera` (T), `torre_acceso` | Admite unión `embebida` |
| `portico` | `portico_peatonal` (P), `portico_vehicular` | |
| `libre` | `libre_vacia`, `libre_desde_medidas` | §7 |

**Criterio de aceptación del port:** los 32 tests de la maqueta pasan adaptados. La única diferencia de BOM aceptada es la de diagonales (§4) y la de códigos plausibles, que pasan a quedar "sin código" en el catálogo base.

### 6.2 A: tipologías nuevas (un archivo + su test cada una, todas en `_nuevas.ts`)

| id (archivo) | Presets | Qué genera (resumen) | Fotos |
|---|---|---|---|
| `bandeja` (`bandeja.ts`) | `bandeja_90`, `bandeja_45`, `bandeja_amplia` | Bandeja de protección sobre estructura o fachada. `ancho` configurable de 1,00 a 3,00 (ménsulas hasta 1,09, vigas en voladizo por encima). Cerramiento: fenólico + lona o chapa. Visera a 90° (vertical) o a 45° (inclinada) con `alto` configurable. Parámetros: `largo`, `cota`, `ancho`, `visera{tipo,alto}`, `cerramiento`, `soporte:'mensula'|'viga'` y `paso`. | 2, 3, 6, 10 |
| `bandeja_portico` | `bandeja_portico_peatonal` | Pórtico peatonal con vigas celosía a lo largo de la vereda + bandeja/visera arriba. Gálibo ≥ 2,50 y paso ≥ 1,20 (reglas de vía pública). | 2, 6, 10 |
| `bandeja_voladizo` | `bandeja_voladizo` | Volada desde la fachada con vigas celosía o ménsulas, `apoyo:'colgado', modo:'volado'`, **sin patas en vereda**. Anclajes a la losa o fachada en los nodos de arranque. | 11 |
| `colgante` | `colgante_puente`, `colgante_losa` | `apoyo:'colgado', modo:'suspendido'` desde un `Volumen` (losa o puente) del contexto. Columnas colgadas con caño y grampa o colgadores. Sin bases. Aviso "verificar soporte". | 4 |
| `envolvente` | `envolvente_cupula`, `envolvente_tanque`, `envolvente_columna` | `planta: {tipo:'poligono', puntos} | {tipo:'circulo', centro, radio, lados}` + `offset`. Usa `grillaPoligono(cerrada:true)`. `torreCentral?` agrega una torre unida en modo `embebida` o `vertical_compartida`. | 5 |
| `torre_plataforma` | `torre_plataforma`, `torre_azotea` | Torre de trabajo con plataforma amplia (n × m vanos). En azotea, `apoyo` sobre losa (`ySuelo` = cota de azotea), con escalera de acceso. Puede embeberse dentro de otra estructura (unión `embebida`). | 7, 9 |
| `patio_interno` | `patio_medianeras` | Patio entre medianeras: polígono del patio con caras ancladas a los muros (anclajes en `nodos`). Sin cara exterior hacia la calle. Acceso por torre interna. | 8 |
| `sobre_escalera` | `sobre_escalera` | Apoyos escalonados siguiendo peldaños o descanso (`apoyoEscalonado` + `muestrearEscalera`). Bases regulables y aviso de extensión máxima. | 12 |
| `hueco_escalera` | `hueco_escalera` | Plataforma de trabajo que cubre el hueco de la escalera, apoyada en escalones o descansos, con barandas perimetrales. Admite caño y grampa + fenólico. | 13 |
| `torre_movil` | `torre_movil_interior`, `torre_movil_exterior` | Ruedas con freno, estabilizadores, escalera interior y plataformas con trampilla (`tablon_escotilla`). Altura máxima con ruedas según H/B (⚠ interior 3,5 : 1 y exterior 3 : 1, con la B efectiva de los estabilizadores). Si se pasa, error con reparación "Agregar estabilizadores" / "Bajar a X m". | 14, 15 |

A además escribe **`docs/oficina-tecnica/modelador/como-agregar-tipologia.md`**, con el paso a paso y un ejemplo completo (se sugiere `torre_movil` o una "cimbra" mínima de juguete):
1. Crear `tipologias/<id>.ts` con la interfaz `Tipologia`.
2. Crear `tipologias/<id>.test.ts`.
3. Sumarla a `_nuevas.ts`.
4. Correr los tests.
5. Si hacen falta códigos nuevos, cargar filas en `tec_pieza_mapa` desde la pantalla de mapa (fase siguiente) o por migración.
6. Pasar el caso de `pendientes/` a "Ya incorporados".

**Tests mínimos de cada tipología nueva:**
- `normalizar` con params vacíos o absurdos no tira y avisa.
- `generar` + `construir` con `CATALOGO_FIXTURE` da piezas > 0, sin `NaN` en coordenadas.
- Todas las diagonales en nodos (se reusa el helper de test del núcleo `assertDiagonalesEnNodos`).
- Un golden de BOM por preset (cantidades por familia).
- `convertirALibre` de esa estructura produce **la misma BOM**.
- Una regla propia que dispare y se repare con `aplicarReparacion`.

---

## 7. Estructura libre (pedido 8c)

- Es la tipología `libre`. Su `generar` **devuelve `est.esqueleto` tal cual**, más las reglas en **modo sugerencias**.
- **Las reglas no se imponen.** En libre, `reglas/*` no cambian el esqueleto: emiten `Aviso` con `reparaciones` (por ejemplo, "Falta diagonal en el vano v7 → Agregar"). La reparación es una `Accion` de tipo `esqueleto`. Las reglas que sí se aplican siempre son las geométricas de `armar`: rodapié con plataforma, collarín en el arranque y fusión de nodos.
- **Creación:** con `libre_vacia` (un vano de 2,50 × 0,73 × 2,00) o con `libre_desde_medidas` (largo × profundidad × alto, rellenados con `rellenarLargo` según el toggle de medida).
- **Edición** (desde la UI, siempre vía `editarEsqueleto` + `OpEsqueleto`):
  - agregar o quitar vanos en cualquier cara, hacia un costado, hacia afuera o hacia adentro, también solo entre las cotas k0–k1 (crecer en una zona);
  - agregar o quitar niveles en todo o solo en un grupo de columnas;
  - medida por vano (chip de catálogo, o libre con caño y grampa);
  - pincel por celda: horizontal, baranda, rodapié, diagonal, plataforma, cerramiento y abertura;
  - por nodo: ménsula, anclaje y estabilizador;
  - por columna: base fija o regulable, rueda, colgada y `ySuelo` (apoyos a distinto nivel);
  - elementos: quitar o mover.
- **"Convertir a estructura libre"** sirve para cualquier estructura de plantilla. Diálogo: "Vas a poder editarla a mano, pero ya **no se regenera** cuando cambies los parámetros. ¿Seguimos?". Llama a `convertirALibre` y se puede deshacer.
- **BOM y cómputo**: igual que cualquier otra estructura (mismo `armar`, mismo `calcularBom`).

---

## 8. Persistencia (C)

### 8.1 Migraciones (solo el archivo, **no se aplican**)

**`supabase/migrations/20261015000001_modelador.sql`**

```sql
-- Permisos del módulo «modelador» (src/lib/auth/acceso.ts). admin siempre edita. Mismo patrón que org_puede_*.
CREATE OR REPLACE FUNCTION tec_puede_ver() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'modelador' IN ('ver','editar'))
                   FROM user_profiles p WHERE p.id = auth.uid()), false); $$;
CREATE OR REPLACE FUNCTION tec_puede_editar() RETURNS boolean ... p.permisos->>'modelador' = 'editar' ...
CREATE OR REPLACE FUNCTION computos_puede_editar() RETURNS boolean ...
  -- admin, rol operativo (compatibilidad), permisos->>'computos' = 'editar'

CREATE TABLE tec_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
  descripcion text,
  obra_id uuid REFERENCES obras(id) ON DELETE SET NULL,
  cotizacion_ref text,                       -- nombre de la venta/cotización de Odoo (modelo sin obra)
  es_plantilla boolean NOT NULL DEFAULT false,
  plantilla_categoria text,                  -- 'fachada' | 'bandeja' | 'torre' | … (galería "Mis plantillas")
  diseno jsonb NOT NULL,
  esquema int NOT NULL,                      -- Diseno.esquema
  motor_version text NOT NULL,
  revision int NOT NULL DEFAULT 1,           -- control optimista (PATCH con revision → 409 si no coincide)
  resumen jsonb,                             -- m2, ml, pesoKg, piezas, sinCodigo… (para la lista sin construir)
  imagen_path text,                          -- storage: tec-modelos/<id>/portada.png
  created_by uuid REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archivado_at timestamptz,
  CHECK (pg_column_size(diseno) < 2000000)
);
CREATE INDEX ON tec_modelos(obra_id) WHERE archivado_at IS NULL;
CREATE INDEX ON tec_modelos(es_plantilla) WHERE archivado_at IS NULL;
-- trigger updated_at + revision++ (no permitir bajar revision)

CREATE TABLE tec_pieza_mapa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia text NOT NULL,                     -- Familia del núcleo
  sistema text NOT NULL CHECK (sistema IN ('multi','bastidor','comun')),
  largo_m numeric(6,3), alto_m numeric(6,3), ancho_m numeric(6,3), variante text,
  codigo text NOT NULL REFERENCES catalogo_piezas(codigo) ON UPDATE CASCADE,
  prioridad int NOT NULL DEFAULT 100,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON tec_pieza_mapa (familia, sistema, COALESCE(largo_m,-1), COALESCE(alto_m,-1),
                                       COALESCE(ancho_m,-1), COALESCE(variante,''), codigo);

CREATE TABLE tec_kits (
  kit_codigo text NOT NULL REFERENCES catalogo_piezas(codigo) ON UPDATE CASCADE,
  pieza_codigo text NOT NULL REFERENCES catalogo_piezas(codigo) ON UPDATE CASCADE,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  supuesto boolean NOT NULL DEFAULT true,    -- composición supuesta hasta que la confirme JS
  PRIMARY KEY (kit_codigo, pieza_codigo)
);

ALTER TABLE computos ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES tec_modelos(id) ON DELETE SET NULL,
                     ADD COLUMN IF NOT EXISTS modelo_revision int;
ALTER TABLE computo_items ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual'
                            CHECK (origen IN ('modelo','modelo_editado','manual')),
                          ADD COLUMN IF NOT EXISTS modelo_cantidad int;   -- lo que dijo el modelo (para el diff)

-- RLS tec_modelos: SELECT tec_puede_ver(); INSERT/UPDATE tec_puede_editar(); sin DELETE (se archiva).
-- RLS tec_pieza_mapa / tec_kits: SELECT si tec_puede_ver() o computos (ver); escritura tec_puede_editar().

-- Semillas: tec_pieza_mapa por INSERT … SELECT desde catalogo_piezas (solo códigos que EXISTEN):
--   HOR-048-NNN → ('horizontal','multi',largo=NNN/100) y también ('baranda','multi',…)
--   VERT-NNN-CE → ('vertical','multi',largo, variante 'CE'); VERT-NNN-SE → variante 'SE'
--   DIAG-200xNNN → ('diagonal','multi', alto=2.00, largo=NNN/100); DIAG-150x250 → alto 1.50, largo 2.50
--   DIAG-PL-250x250 → ('diagonal_planta','multi',largo 2.50, ancho 2.50)
--   TAB-MET-NNN → ('tablon','multi',largo); TAB-ESC-250 → ('tablon_escotilla',…)
--   RDPE-* → ('rodapie',…); TORN-600-FIJA → base_regulable; TORN-300-FIJA → base_fija (variante 'corta')
--   RUEDA-STD-FRENO → rueda_freno; RUEDA-STD → rueda; MENSULA-045 → ('mensula','multi',largo 0.45)
--   VIGA-CEL-NNN → viga_celosia; VIGA-PTE-NNN → viga_puente; ZANCA-ESC-150x250 → zanca; ESC-INT-MULTI/BAST → escalera_interior
--   BAST-AND-130x180 → ('bastidor','bastidor', ancho 1.30, alto 1.80); BAST-PAS-090x180; BAST-PEA-*; BAST-BAR-* → bastidor_baranda
--   RIEND-250-H/D, RIEND-150-H/D → rienda_h / rienda_d (largo); MOD-AND-* / MOD-PEA-* → modulo_kit
--   CAÑO-NNN (0.10…6.40) → ('cano','comun',largo NNN/100); NUDO-FIJO → grampa_fija; NUDO-GIR → grampa_giratoria
--   PLACA-FEN-122x244 → ('fenolico','comun') — rinde 2,98 m² por placa
--   Lo que no existe en Odoo (ménsulas 0,73/1,09, vigas celosía 5/6/7,5, lona, chapa, colgadores…) NO se siembra:
--   queda «sin código» hasta que OT lo cargue.
-- Semillas de tec_kits: la composición supuesta de KITS de la maqueta (supuesto = true), solo si existen los códigos.
-- Backfill de permisos: a quien tiene 'computos', darle 'modelador' con el mismo nivel:
--   UPDATE user_profiles SET permisos = permisos || jsonb_build_object('modelador', permisos->>'computos')
--   WHERE permisos ? 'computos' AND NOT permisos ? 'modelador';
```

> Ojo: `catalogo_piezas` se sincroniza desde Odoo y algunos productos llegaron "planos" (`src/lib/odoo/products.ts:5`). Las semillas usan **`INSERT … SELECT … WHERE codigo LIKE …`**, nunca VALUES con códigos fijos, para no fallar si un código no está. La migración termina con un `RAISE NOTICE` que dice cuántas familias quedaron mapeadas.

**`supabase/migrations/20261015000002_modelador_computos_rls.sql`** alinea la RLS de `computos` y `computo_items` (riesgo R7):
- reemplaza las políticas de INSERT/UPDATE de `computos` y la de ALL de `computo_items` por `computos_puede_editar()`;
- SELECT queda como está (`true` para autenticados).

**RPC `tec_generar_computo`** (en la 000002), `SECURITY DEFINER`, con `SET search_path = public`:

```
tec_generar_computo(p_modelo uuid, p_obra uuid, p_revision int, p_lineas jsonb, p_decisiones jsonb, p_metricas jsonb)
  RETURNS jsonb  -- { computo_id, insertadas, actualizadas, borradas, conservadas, omitidas_sin_codigo }
```

Hace lo siguiente:
1. Exige `tec_puede_editar() AND computos_puede_editar()`; si no, lanza `42501`.
2. Exige que `tec_modelos.revision = p_revision`; si no, lanza "El modelo cambió, volvé a generar".
3. Toma el último cómputo de la obra (por `version` desc) o lo crea.
4. Si su estado está completado (`verificado`, `aprobado`, `en_preparacion`, `preparado`, el mismo set que `src/lib/computos/estado.ts`), lanza "El cómputo está completado: no se regenera".
5. Por cada línea `{pieza_id, cantidad}`:
   - si no hay fila → la inserta con `origen='modelo'` y `modelo_cantidad=cantidad`;
   - si la fila es `modelo` → actualiza `cantidad_requerida` y `modelo_cantidad`;
   - si es `modelo_editado` o `manual` → aplica `p_decisiones[pieza_id]`: `'modelo'` (pisar), `'mantener'` (default) o `'sumar'`. Siempre actualiza `modelo_cantidad`.
6. Borra las filas `origen='modelo'` cuyas piezas ya no están en `p_lineas`. Las `modelo_editado` que ya no están se conservan, salvo que la decisión sea `'borrar'`.
7. Actualiza `computos.modelo_id`, `modelo_revision`, `superficie`, `metros_lineales`, `altura_maxima` y `tipo_sistema_andamio` (multidireccional/tubular) desde `p_metricas`.

**`supabase/migrations/20261015000003_modelador_storage.sql`**: bucket privado `tec-modelos` (como `20260909000001_fotos_obra.sql`). Lectura con `tec_puede_ver()` y escritura con `tec_puede_editar()`. Path: `<modelo_id>/portada.png`.

`tec_criterios` (reglas firmadas) **no** entra en esta etapa. Los criterios siguen en `criterios.ts` con `firmado:false`.

### 8.2 Código de persistencia (`src/lib/tecnica/persistencia/`)

| Archivo | Contenido |
|---|---|
| `tipos.ts` | DTOs de la API: `ModeloFila`, `ModeloLista`, `PlantillaFila`, `PreviaComputo`, `DiffLinea`, `DecisionDiff` |
| `catalogo.ts` | `catalogoDesdeFilas({ piezas, stock, mapa, kits }): Catalogo` (pura, con tests). La `familia` sale de `tec_pieza_mapa` (no de `categoria`, porque las riendas figuran como `anclaje`). Copia `peso_kg` tal cual (null si null). |
| `computo.ts` | `lineasParaComputo(bom): { lineas, omitidas }` (agrupa por `piezaId` y separa sin código) y `diferenciasComputo(itemsActuales, lineas): DiffLinea[]` (`nuevo`, `cambia`, `igual`, `quita`, `conflicto_manual`). Pura, con tests. |
| `validar.ts` | Esquemas zod de los bodies (crear, patch, plantilla, generar) y tope de tamaño del `diseno` (2 MB). Delega en `validarDiseno` del núcleo. |
| `servidor.ts` | `cargarCatalogo(db)` (una query por tabla, cacheada por request) y `construirEnServidor(diseno, db)` → `Resultado` (el cómputo **siempre** se recalcula en el servidor desde el diseño guardado) |

### 8.3 API (route handlers; Next 16: `ctx.params` es una **Promise** → `const { id } = await ctx.params`, tipado con `RouteContext<'/api/tecnica/modelador/[id]'>`)

Base: `src/app/api/tecnica/modelador/`. Todas las rutas llaman a `exigirModulo(["modelador"], nivel)`. Las escrituras de cómputo exigen **además** `exigirModulo(["computos"], "editar")`.

| Método y ruta | Body / query | Respuesta |
|---|---|---|
| `GET /api/tecnica/modelador` | `?obra=<uuid>&plantillas=1&q=` | `{ modelos: ModeloLista[] }` (sin `diseno`, con `resumen` e imagen firmada) |
| `POST /api/tecnica/modelador` | `{ nombre, obra_id?, cotizacion_ref?, diseno }` (o `{ desdePlantilla: id, obra_id? }`, que usa `instanciarPlantilla`) | `{ modelo: ModeloFila }` (201) |
| `GET /api/tecnica/modelador/[id]` | — | `{ modelo: ModeloFila }` (con `diseno`) |
| `PATCH /api/tecnica/modelador/[id]` | `{ revision, diseno?, nombre?, descripcion?, obra_id?, resumen? }` | `{ revision }` o **409** `{ error, revisionActual }` |
| `DELETE /api/tecnica/modelador/[id]` | — | Archiva (`archivado_at`). 204 |
| `POST /api/tecnica/modelador/[id]/plantilla` | `{ nombre, descripcion?, categoria }` | Copia el modelo como plantilla propia (`es_plantilla=true`, `obra_id=null`). `{ modelo }` |
| `POST /api/tecnica/modelador/[id]/imagen` | PNG (`image/png`, ≤ 5 MB) | `{ imagen_path, url }` |
| `GET /api/tecnica/modelador/catalogo` | — | `{ catalogo: Catalogo }` (para el editor) |
| `POST /api/tecnica/modelador/[id]/computo/previa` | `{ obra_id, revision }` | `{ computo: {id, estado, bloqueado}, diff: DiffLinea[], omitidas, metricas }` (recalcula en el servidor) |
| `POST /api/tecnica/modelador/[id]/computo` | `{ obra_id, revision, decisiones }` | Llama a la RPC → `{ computo_id, … }` |
| `GET /api/tecnica/modelador/precarga` | `?obra=<uuid>` | `{ medidas, tipoTrabajo, estimadas: true }` vía `medidasDe()` (opcional en la v1) |

En `src/lib/auth/acceso.ts` (lo hace C):
- `DEFINICION` suma `{ id: "modelador", titulo: "Modelador", grupo: "Oficina técnica", rutas: ["/oficina-tecnica/modelador"] }` **después** de `computos`;
- `APIS` suma `"/api/tecnica/modelador": ["modelador"]`;
- en `PERFILES`, el perfil `operativo` suma `modelador: "editar"`.

**Hook cliente** `src/hooks/use-modelador.ts` (C): `useModelos(filtro)`, `useModelo(id)`, `useCrearModelo`, `useGuardarModelo` (PATCH con revision, expone el 409), `useGuardarComoPlantilla`, `useCatalogoModelador`, `usePreviaComputo`, `useGenerarComputo` y `useSubirImagen`. Todo con `@tanstack/react-query` y `fetch` a las rutas de arriba. Los query keys van bajo `["modelador", …]`. Al generar, invalida `["computos"]`.

**Editor de cómputo existente** (`src/hooks/use-computos.ts`, C): `useSaveComputoItems` hoy borra e inserta todo, y eso perdería `origen`. Hay que cambiarlo para que:
- conserve `origen` y `modelo_cantidad` de cada pieza;
- pase a `modelo_editado` una fila `modelo` cuya cantidad cambió a mano;
- mantenga en `manual` una fila nueva.

---

## 9. Pantalla (B)

### 9.1 Rutas (Next 16)

- `src/app/(dashboard)/oficina-tecnica/modelador/page.tsx` (`"use client"`). Lista de modelos: filtros por obra o sin obra, búsqueda, tarjetas con imagen y `resumen`. Botón **"Nuevo modelo"**, que abre la galería: categorías de `presetsGaleria()` + **"Mis plantillas"** (`useModelos({plantillas:true})`). Con `?obra=<id>` filtra y precarga la obra en el nuevo modelo.
- `src/app/(dashboard)/oficina-tecnica/modelador/[id]/page.tsx` (`"use client"`). `const { id } = use(params)` (params es una Promise, como en `computos/[obraId]/page.tsx`). Carga `Editor` con `dynamic(() => import("@/components/tecnica/modelador/editor"), { ssr:false, loading })`, igual que `mapa-obras/page.tsx`. El `ssr:false` **solo** funciona en un client component.
- Solo escritorio: por debajo de 1280 px se muestra un aviso "El modelador se usa en una pantalla grande" con un link a la lista.
- Con permiso "ver" (sin "editar"), el editor abre en **solo lectura**: sin autoguardado, sin generar y sin guardar como plantilla.

### 9.2 Componentes (`src/components/tecnica/modelador/`)

```
editor.tsx                 layout de 3 columnas (galería/estructuras · lienzo 3D + alzado · propiedades/lista/avisos)
estado/store.ts            zustand: diseno, resultado, sel, hover, historial (ring buffer de 200), revision, guardado
estado/autoguardado.ts     PATCH con debounce de 1,5 s; ante un 409, diálogo "Alguien más lo cambió: recargar / sobrescribir"
estado/construir-worker.ts (opcional) Web Worker si construir() pasa los 16 ms
vista3d/escena.ts          port de vista3d.js: iniciar(contenedor, callbacks) → { cargar(resultado), seleccionar, png(), destruir }
vista3d/geometrias.ts, paleta.ts (lee tokens CSS con getComputedStyle; observa la clase .dark), picking.ts, manijas.ts, png.ts
alzado/alzado.tsx          SVG desde Resultado.celdas (+ pincel de celda; en libre, ops de esqueleto)
paneles/galeria.tsx        presets por categoría + Mis plantillas
paneles/propiedades.tsx    formulario GENÉRICO desde tipologia.campos (las tipologías nuevas aparecen solas) + toggle "Medida libre"
paneles/libre.tsx          barra de la estructura libre: + vano (izq/der/afuera/adentro), + nivel (zona), medida, pinceles por celda/nodo/columna
paneles/lista.tsx          BOM: familias, kit/despiezado, "sin peso", "sin código", bloque "Ajuste con caño y grampa", stock, ajustes manuales
paneles/avisos.tsx         avisos con botón de reparación (aplicarReparacion) y reglas aplicadas con "deshacer"
paneles/generar-computo.tsx diálogo: previa → diff (nuevo/cambia/quita/conflicto) → decisiones → generar; bloqueado si está completado
paneles/guardar-plantilla.tsx
paneles/convertir-libre.tsx confirmación de "Convertir a estructura libre"
paneles/predimensionado.tsx banda fija "PREDIMENSIONADO · reglas provisorias sin firma"
```

- El estado vive **solo** en el store. `vista3d` y `alzado` reciben `Resultado` y emiten intenciones (clic en celda, arrastre de manija) que el editor traduce a operaciones del núcleo + `commit`.
- Tema y tokens: Tailwind 4 con los tokens de `globals.css` (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`), `font-mono` para cifras y `rounded-lg`, más los componentes de `src/components/ui`. **No** se usan hex sueltos, salvo la paleta 3D, que sale de tokens. Para los paneles sobre el lienzo sirve de precedente `src/components/mapa-obras/panel/estilos`.
- Copy en rioplatense. Números con `fmt` (coma decimal). Las cifras de peso van siempre con "*" cuando el peso es parcial.

### 9.3 Menú y entradas

- `src/lib/constants/navigation.ts`: en "Oficina Tecnica" se suma `{ title: "Modelador", href: "/oficina-tecnica/modelador", icon: Boxes }` (lucide). El filtrado por permiso ya lo hace `navegacionPara`, que usa `DEFINICION`. Funciona en cuanto C suma el módulo.
- `src/app/(dashboard)/oficina-tecnica/computos/[obraId]/page.tsx`: botón **"Abrir en modelador"** en el header. Si `computo.modelo_id` existe, va a `/oficina-tecnica/modelador/<modelo_id>`; si no, a `/oficina-tecnica/modelador?obra=<obraId>`. Se muestra con un badge "Generado desde el modelo" si hay items `origen='modelo'`.
- `src/app/(dashboard)/obras/[id]/page.tsx`: acción **"Modelar"**, que va a `/oficina-tecnica/modelador?obra=<id>`.
- `package.json`: `three` y `@types/three` (§1.4).

---

## 10. Reparto de archivos (sin solapamiento)

| Área | Dueño | Archivos (solo estos) |
|---|---|---|
| Núcleo | Agente núcleo (**antes** que A, B y C) | `src/lib/tecnica/modelo/**`, **salvo** los archivos nuevos de tipologías de A. Crea `tipologias/_nuevas.ts` vacío y `tipologias/comunes/**` |
| A · tipologías nuevas | A | `src/lib/tecnica/modelo/tipologias/{bandeja,bandeja-portico,bandeja-voladizo,colgante,envolvente,torre-plataforma,patio-interno,sobre-escalera,hueco-escalera,torre-movil}.ts` + sus `.test.ts`; **`tipologias/_nuevas.ts`**; `docs/oficina-tecnica/modelador/como-agregar-tipologia.md`; actualizar `docs/oficina-tecnica/modelador/pendientes/README.md` (sección "Ya incorporados") |
| B · pantalla | B | `src/app/(dashboard)/oficina-tecnica/modelador/**`, `src/components/tecnica/modelador/**`, `src/lib/constants/navigation.ts`, el botón en `src/app/(dashboard)/oficina-tecnica/computos/[obraId]/page.tsx` y en `src/app/(dashboard)/obras/[id]/page.tsx`, `package.json` + `package-lock.json` (solo three/@types/three) |
| C · persistencia | C | `supabase/migrations/20261015000001_modelador.sql`, `…000002_modelador_computos_rls.sql`, `…000003_modelador_storage.sql`, `src/lib/tecnica/persistencia/**`, `src/app/api/tecnica/modelador/**`, `src/hooks/use-modelador.ts`, `src/hooks/use-computos.ts` (solo `useSaveComputoItems` y el tipo `ComputoItem`), `src/lib/auth/acceso.ts` (DEFINICION/APIS/PERFILES) |

Reglas de convivencia:
- **Nadie edita archivos de otro.** Si alguien necesita algo del núcleo, lo pide en §11 (o en el mensaje de commit) y mientras tanto lo resuelve en su propio archivo.
- A, B y C importan del núcleo **solo** por `src/lib/tecnica/modelo/index.ts` (o `tipos.ts`). A puede importar además `tipologias/registro.ts` y `tipologias/comunes/*`.
- B trabaja contra `CATALOGO_FIXTURE` y un mock de los hooks hasta que estén los de C. La forma de los DTOs es la del §8.3.
- Commits locales en `feat/modelador`, con estilo `feat(modelador): …`, `test(modelador): …` o `docs(modelador): …`, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push, sin deploy, sin aplicar migraciones y sin tocar `.env*`.
- Antes de commitear: los tests del área pasan, `npx tsc --noEmit` no suma errores nuevos en los archivos propios y `npx eslint <archivos propios>` está limpio.

**Orden:**
1. Núcleo: contrato, registro, esqueleto, armar, diagonales, medida libre, libre y las tipologías portadas, con sus tests.
2. A, B y C en paralelo.
3. Integración, a cargo de B: editor conectado a los hooks reales, generar cómputo de punta a punta contra una base local, si existe.

---

## 11. Cambios al contrato

> Si alguien necesita cambiar algo del §3 o del §8.3, lo anota acá con fecha, quién y por qué. El núcleo es el único que toca `tipos.ts`.

- **14/10/2026 · núcleo · agregados (todos opcionales, no rompen nada):**
  - `Esqueleto.terreno` (tierra → madera bajo cada base) y `Esqueleto.puertos` (puertos locales congelados al «Convertir a estructura libre»).
  - `Columna.movil` (tornillón de base móvil). `Vano.normal` (normal hacia afuera en local: ménsulas, cerramientos y anclajes). `Pano.sentido` (vano paralelo a los tablones).
  - `CeldaCara.cano` (toda la celda con caño y grampa) y `CeldaCara.diagonalCano` (solo la diagonal). Lo mismo en `OverrideCelda`. `CeldaCara.baranda: 1` = baranda baja a 0,50 (faldón de la pantalla); `2` = doble.
  - `CeldaPano.fenolico` (placa de fenólico encima de los tablones: bandeja). `plataforma: 'fenolico'` queda para «solo placa».
  - `NodoExtra.anclaje.dir` (dirección al muro, local) y `NodoExtra.mensula.baranda` (baranda en la punta, default true).
  - `Elemento.sistema`, `Elemento.medida` (m² o m con rinde) y `Elemento.kit`.
  - `Accion` suma `overrides` (varias celdas), `sistema`, `modoBom` y `lote` (varias acciones, p. ej. una reparación de la estructura libre).
  - `OpEsqueleto` celda/paño/nodo aceptan `null` por campo para borrarlo (`Anulable<T>`).
  - `EstructuraResuelta.info` (datos de la tipología para la UI: frentes, relleno, gálibo, desembarcos…). `CeldaResuelta.cara` y `CeldaResuelta.contenido` (resumen para overlays). `LineaBom.medida`.
  - `Generado.info` y `Generado.uniones` (esquinas internas de la fachada). `CtxGenerar.relaciones` (apoyos, torre unida, acceso por torre, altura y fase heredadas) y `Tipologia.cambiarSistema?` (con `rechazado`).
  - Códigos del ajuste: en el fixture y en la base, el caño es **`CAÑO-010 … CAÑO-640`** (no `CANO-048-*`) y las grampas `NUDO-FIJO` / `NUDO-GIR`.
  - `crearDiseno(id, opciones)` acepta id de tipología **o** de preset, y `opciones.catalogo` (B lo pasa para que la estructura libre elija caño y grampa en bandas sin diagonal de catálogo). `unir`, `puertosDe`, `buscarSnap`, `editarEsqueleto`, `convertirALibre` y `aplicarReparacion` aceptan el catálogo como último parámetro opcional.
  - Overrides de la fachada: clave `"<vanoExterior>@<k>"` (k = índice de cota) o `"<vanoExterior>@N<n>"` (n = nivel, la usa la migración de la maqueta). Los vanos exteriores de la fachada se llaman `f<frente>e<vano>`.
  - Helpers de test para tipologías nuevas en `src/lib/tecnica/modelo/test-utils.ts` (`assertDiagonalesEnNodos`, `bomPlano`, `porFamilia`, `coordenadasFinitas`).
- **14/10/2026 · C (persistencia) · agregados y precisiones de §8:**
  - `tec_pieza_mapa` suma `rinde` y `unidad_compra` (placa de fenólico 2,9768 m², media sombra 200 m², concertina 10 m): `catalogo_piezas` no los tiene.
  - `catalogoDesdeFilas(filas, { inferir })` devuelve `{ catalogo, avisos }`. Si un código no tiene **ninguna** fila en `tec_pieza_mapa`, se infiere por la convención del código (`persistencia/semillas.ts`, prioridad 900; una fila de OT gana). Peso `0` en Odoo = «sin peso». `GET /catalogo` devuelve `{ catalogo, avisos }`.
  - `revision` sube **solo cuando cambia `diseno`** (trigger). Renombrar o vincular a obra no pide revisión ni la invalida. PATCH con `diseno` exige `revision`.
  - Nuevas: `POST /[id]/duplicar` (`{ nombre?, obra_id? }`) y filtro `?sinObra=1` en la lista. `ModeloFila.computo` = último cómputo generado desde el modelo (`desactualizado` si su `modelo_revision` ≠ `revision`).
  - Generar: `{ obra_id, revision, decisiones, reemplazarOtroModelo?, aceptoOmitidas? }`. 422 + `omitidas` si hay líneas sin código y no se confirmó; 423 si el cómputo está completado; 409 si cambió la revisión; error si el cómputo de la obra salió de **otro** modelo y no se mandó `reemplazarOtroModelo`.
  - `DiffLinea.tipo` suma `quita_editado` (fila editada a mano que el modelo ya no tiene: `mantener` | `borrar`) y `manual` (no se toca). `sumar` = cantidad del modelo + lo que la persona había agregado a mano (`actual − modelo_cantidad` anterior).
  - `useSaveComputoItems` marca `modelo_editado` una fila del modelo cuya cantidad cambió, y la vuelve a `modelo` si vuelve a la cantidad del modelo (`persistencia/origen.ts`).
- **15/10/2026 · A (tipologías y volúmenes) · sin cambios en `tipos.ts`:**
  - **Tipologías nuevas.** Diez archivos en `tipologias/` registrados en `_nuevas.ts`: `bandeja`, `bandeja_portico`, `bandeja_voladizo`, `torre_plataforma`, `torre_movil`, `colgante`, `envolvente`, `patio_interno`, `sobre_escalera` y `hueco_escalera`, con 18 presets.
    - Ayudas propias en `tipologias/nuevas-comunes.ts`. Chequeos de test en `tipologias/nuevas-test-utils.ts`: piezas repetidas, tubos que pasan por una vertical, verticales dobles y pies repetidos.
  - **Volúmenes de referencia.** Están en `volumenes/**` y se exportan desde `index.ts`.
    - Cada volumen se guarda en `contexto.volumenes` como `VolumenModelado`: un `Volumen` más `def` (la definición paramétrica) y `defVersion`. Las tipologías solo leen `planta`, `yBase` e `yTope`.
    - API: `agregarVolumen`, `actualizarVolumen`, `quitarVolumen`, `migrarVolumenes`, `solidosDe`, `carasDe` y `carasDelDiseno`.
    - Para modelar sobre una cara: `propuestaParaCara` y `agregarEnCara`.
    - Para los choques: `detectarChoques`, `avisosDeChoque` (ids `VC*`, nivel `error`, con reparación) y `accionesRetiro`.
    - **Para B:** `avisosDeChoque(diseno, resultado, catalogo.medidas)` se concatena a `resultado.avisos` en el editor. No sale de `construir`, para no tocar el núcleo.
  - **Para el núcleo.** Lo detecté y lo resolví del lado de las tipologías; conviene corregirlo en `comunes/`:
    1. `grillaPoligono` redondea las columnas al milímetro y, en lados inclinados, deja vanos de 0,729: quedan «sin código» (`ajustarMedidasCatalogo`).
    2. En medida libre, `grillaPoligono` cierra cada lado con hasta 5 mm de tolerancia y deja verticales casi duplicadas en las esquinas (`cerrarEsquinasPoligono` + `fusionarColumnasCercanas`).
    3. `grillaPoligono({ lado: 'adentro' })` deja uniones en T: la horizontal exterior de un lado pasa por la primera vertical del siguiente. El patio perimetral se arma con tiras y cuadros de esquina (`incorporar`).
    4. En un vano libre de menos de 0,25 el rodapié queda «sin código»: se corta de fenólico (`rodapiesCortos`).
    5. El fixture no tiene código de `estabilizador`. La torre móvil exterior arranca sin estabilizadores para cumplir el test de presets sin faltantes; con estabilizadores salen «sin código» hasta que OT los mapee.
- **15/10/2026 · integración (pantalla ↔ persistencia ↔ volúmenes):**
  - **Un solo cliente de la API.** `src/components/tecnica/modelador/datos/api.ts` reexporta los hooks de `src/hooks/use-modelador.ts`, y `datos/tipos.ts` los tipos de `persistencia/tipos.ts`. Se agregaron `guardarModelo()` y `subirImagen()` sin react-query, porque el autoguardado corre fuera de un componente. El único hook propio de la pantalla es `useCatalogoModelador`: si la ruta falla, cae al catálogo de prueba. Usa la key `["modelador","catalogo","con-respaldo"]` porque devuelve otra forma.
  - **El resumen del modelo lo arma `persistencia/computo.ts#resumenDe`**, el mismo que el servidor. La lista tolera resúmenes viejos con menos campos.
  - **La previa del cómputo usa el contrato de persistencia:**
    - las opciones y la decisión por defecto de cada línea las manda el servidor;
    - se muestran los tipos `quita_editado` y `manual`;
    - se manda `aceptoOmitidas`, y `reemplazarOtroModelo` con un tilde cuando el cómputo vino de otro modelo.
  - **Categorías de plantilla:** se suma `interior` («Interiores y escaleras», el grupo de la galería) a `CATEGORIAS_PLANTILLA` en `validar.ts`. La columna es `text` sin CHECK, así que no hace falta migración.
  - **Permisos:** la pantalla usa `nivelEn(acceso, "modelador")` y ya no cae en Cómputos, porque la migración copia ese nivel.
  - **Volúmenes:** la pantalla usa la lógica oficial.
    - `components/tecnica/modelador/volumenes/geometria.ts` es ahora un adaptador. Traduce entre la `def` y la receta del formulario, que se deriva y no se guarda.
    - El 3D dibuja `solidosDe`: tramos, cúpula, balcones repetidos y patios.
    - El clic en una cara llama a `agregarEnCara`, y el toggle «Seguir el contorno» pasa `seguir: 'contorno'`.
    - Los choques salen de `avisosDeChoque(diseno, res, catalogo.medidas)`.
    - Un patio suelto, sin cuerpo que lo contenga, va como volumen sin `def` con `hueco: true`, que `solidosDe` entiende.
    - `migrarVolumenesPantalla` convierte al cargar los volúmenes del formato provisorio (`forma`/`grupo`).
  - **`npm test`** pasa `--experimental-strip-types`, porque Node 22.16 no lo trae activo. El test de rendimiento exige el mínimo por debajo de 15 ms y la mediana por debajo de 40 ms, así no falla por la carga de la máquina.

---

## 12. Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Faltan pesos y códigos en `catalogo_piezas` | "sin peso" y "sin código" visibles. Las líneas sin código **no se escriben** en `computo_items` (la FK exige `pieza_id`): el diálogo de generar las lista y pide confirmación explícita, y quedan en `tec_modelos.resumen.sinCodigo`. |
| Regenerar pisa ediciones manuales | `origen` + `modelo_cantidad` + diff + decisiones por línea. RPC transaccional. Bloqueo si el cómputo está completado. |
| El cliente manda una BOM trucha | El servidor recalcula con `construir` desde el `diseno` guardado y la `revision`. |
| Dos personas editan el mismo modelo | `revision` optimista → 409 → diálogo. |
| `construir` lento en estructuras grandes | Presupuesto de 10 ms; con más de 16 ms se pasa a un worker (B). InstancedMesh por geometría y render bajo demanda. |
| Diseños guardados con un esquema viejo | `esquema` + `migrarDiseno` (núcleo) + `migrarParams` por tipología. Test de un JSON de la maqueta (esquema 1) que abre. |
| Tipologías nuevas rompen el núcleo | Viven en archivos propios. Los tests de contrato del registro (ids únicos, `normalizar` total y `convertirALibre` con la misma BOM) corren para **todas** las tipologías registradas (`tipologias/contrato.test.ts`, del núcleo). |
| Reglas sin firma | Todo dice PREDIMENSIONADO. `CRITERIOS` con `firmado:false` y ⚠ en la UI. Sin veredictos M0x en esta etapa. |
