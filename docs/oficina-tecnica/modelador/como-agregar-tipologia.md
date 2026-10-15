# Cómo agregar una tipología al modelador

> Para quien programa una estructura nueva (una «cimbra», una chimenea, un escenario…).
> Una tipología nueva es **un archivo + su test**, registrada en `_nuevas.ts`. No se toca el núcleo.
> Todo lo que calcula el modelador es **PREDIMENSIONADO**.

## Antes de empezar

Si el caso viene de obra, buscalo en [`pendientes/`](pendientes/README.md). Tiene que tener fotos y un `caso.md` con las medidas típicas. Miralas: la tipología tiene que armarse **como se arma en obra**, no como queda lindo en pantalla.

Mientras la tipología no exista, el caso se resuelve con la **Estructura libre** o con una **plantilla propia**. Si lo que hace falta es una variante de algo que ya existe (otra medida, otra visera), alcanza con un **preset** nuevo en la tipología que ya está.

## Cómo funciona por dentro (en dos líneas)

La tipología no dibuja piezas: arma un **esqueleto** (columnas, vanos, paños, cotas de anillo y lo que va en cada celda) y, si hace falta, **elementos** sueltos (vigas, viseras, zancas). Un único `armar()` del núcleo convierte eso en piezas con código de `catalogo_piezas`, y de ahí sale la lista y el cómputo.

Por eso, una tipología nueva hereda sola:

- las diagonales bien dibujadas;
- la medida libre (caño y grampa);
- el «Convertir a estructura libre»;
- la lista con «sin peso» y «sin código»;
- el panel de parámetros y la galería.

## Paso a paso

### 1. Crear `src/lib/tecnica/modelo/tipologias/<id>.ts`

Exportá un objeto `Tipologia` (la interfaz está en `tipologias/registro.ts`). Estos son los campos que importan:

| Campo | Qué es |
|---|---|
| `id`, `version` | Únicos. Subí `version` cuando cambie la forma de `params` y escribí `migrarParams`. |
| `categoria` | `fachada`, `bandeja`, `torre`, `portico`, `especial` o `libre`. Define en qué grupo de la galería aparece. |
| `porDefecto()` | Los params de arranque. |
| `normalizar(parcial, sistema)` | **Nunca tira.** Recorta a rangos razonables, completa defaults y devuelve `avisos` en palabras de obra. |
| `campos` | Lo que muestra el panel. Cada `ruta` empieza con `params.`. Si el campo no tiene sentido siempre, usá `visibleSi`. |
| `presets` | Lo que aparece en la galería. El `id` de cada preset es único **en todo el modelador**. |
| `generar(est, ctx)` | Devuelve `{ esqueleto, avisos, reglas, metricas, puertos, info }`. |

Herramientas que ya están hechas:

- **`tipologias/comunes/`** (núcleo, no se modifica):
  - grillas: `grillaRect`, `grillaPoligono`, `cotasNiveles`;
  - accesos y protecciones: `visera`, `vigaCelosia`, `escaleraInterior`;
  - torres móviles: `ruedas`, `estabilizadores`;
  - apoyos: `apoyoEscalonado`, `muestrearEscalera`, `colgar`;
  - ayudas: `poligonoCirculo`, `puertosCaja`, `avisoEsbeltez`.
- **`tipologias/nuevas-comunes.ts`**, las herramientas que usan las tipologías nuevas:
  - `diagonalesEnFila` y `diagonalesPerimetro`: zigzag roseta a roseta solo donde las dos columnas llegan;
  - `viseraEnPuntos`: bandeja y visera apoyadas en nodos;
  - `anclarLinea`: anclajes al tresbolillo;
  - `canoGrampa` y `diagonalPlanta`;
  - `cotasEscalonadas` y `perfilDeEscalera`: apoyos a distinto nivel;
  - `incorporar`: suma una tira armada en otro marco, con esquinas compartidas;
  - `fusionarColumnasCercanas` y `cerrarEsquinasPoligono`: para grillas sobre polígonos.
- **`ctx.rellenar(largo, 'multi', { modo: est.medida, medidas })`**: respeta el toggle «medida libre». No uses largos fijos: pasá siempre por acá (o por `tramosDe` de `nuevas-comunes`).
- **`ctx.diseno.contexto.volumenes`**: los volúmenes del contexto (el edificio, una losa, un puente o una escalera). Una tipología que se apoya o se cuelga de algo recibe un param `volumenId` y lee de ahí su cota. Si no lo encuentra, avisa con la reparación «Desvincular».

Las reglas de armado no se negocian:

1. **Diagonales siempre roseta a roseta**, una por celda, en zigzag. Usá las ayudas: no pongas `diagonal` en una celda donde alguna columna no llega a las dos cotas.
2. **Un tubo nunca pasa por una vertical.** Si dos tiras se cruzan, la esquina se resuelve con un cuadro y verticales compartidas (mirá `patio-interno.ts`).
3. **No se inventan códigos ni pesos.** Emití la pieza por familia y medidas: si no está en `tec_pieza_mapa`, la lista la muestra como «sin código».
4. **Las alturas van en la grilla de rosetas** (paso 0,50). Si la plataforma tiene que quedar en una cota exacta, la fase la fija esa cota (mirá `cotasEscalonadas`).
5. **Los avisos que se pueden arreglar traen su reparación**: una `Accion` de un clic, por ejemplo `{ tipo: 'param', ruta: 'params.anclada', valor: true }`.

### 2. Crear `src/lib/tecnica/modelo/tipologias/<id>.test.ts`

Un test por tipología con lo mínimo:

- `normalizar` con params vacíos o absurdos no tira y avisa.
- Un **golden** por preset: cantidades por familia de la lista.
- `problemasDeArmado(r)` vacío (de `nuevas-test-utils.ts`). Cubre piezas repetidas, tubos que pasan por una vertical, verticales dobles, pies repetidos y diagonales fuera de nodo.
- «Convertir a estructura libre» da **la misma lista**.
- Una regla propia que dispara y se repara con `aplicarReparacion`.

Además, `tipologias/contrato.test.ts` y `armar/diagonales.test.ts` del núcleo corren solos sobre **todos** los presets registrados. Esos tests exigen que, con el catálogo de prueba, todos los presets salgan sin códigos faltantes.

### 3. Registrarla en `tipologias/_nuevas.ts`

```ts
import { CIMBRA } from './cimbra.ts';
export const NUEVAS: Tipologia[] = [ /* …las que ya están… */, CIMBRA ] as unknown as Tipologia[];
```

### 4. Correr los tests

```
node --no-warnings --experimental-strip-types --test "src/lib/tecnica/**/*.test.ts"
npx tsc --noEmit
npx eslint src/lib/tecnica/modelo/tipologias/<id>.ts src/lib/tecnica/modelo/tipologias/<id>.test.ts
```

(En esta Mac, Node 22.16 no saca los tipos solo: hace falta `--experimental-strip-types`.)

### 5. Códigos nuevos

Si la tipología usa piezas que no están mapeadas (una viga de 7,50, una ruedita distinta), Oficina Técnica carga la fila en `tec_pieza_mapa`: familia, sistema, medidas y código existente en `catalogo_piezas`. Hasta entonces la pieza sale «sin código» y **no entra al cómputo**. Se muestra en la lista para que nadie la pase por alto.

### 6. Pendientes

Pasá el caso de `pendientes/` a «Ya incorporados» en [`pendientes/README.md`](pendientes/README.md).

## Ejemplo completo: cimbra de losa (de juguete)

Una grilla de puntales multidireccionales bajo una losa: plataforma arriba, diagonales en las cuatro caras y aviso si la losa queda muy baja.

```ts
// src/lib/tecnica/modelo/tipologias/cimbra.ts
import type { Estructura } from '../tipos.ts';
import type { CtxGenerar, Generado, Tipologia } from './registro.ts';
import { cotasNiveles, grillaRect } from './comunes/grilla.ts';
import { puertosCaja } from './comunes/util-tipologias.ts';
import { diagonalesPerimetro, medida, metricasCaja, plataformaGrilla, tramosAncho, tramosDe } from './nuevas-comunes.ts';
import { fmt } from '../util.ts';

interface ParamsCimbra extends Record<string, unknown> { largo: number; ancho: number; cotaLosa: number }
const DEF: ParamsCimbra = { largo: 5, ancho: 2.5, cotaLosa: 3 };

export const CIMBRA: Tipologia<ParamsCimbra> = {
  id: 'cimbra', version: 1, nombre: 'Cimbra', categoria: 'especial',
  descripcion: 'Apuntalamiento de una losa con multidireccional.',
  sistemas: ['multi'], apoyos: ['suelo'],
  porDefecto: () => ({ ...DEF }),
  normalizar(p) {
    const x = (p || {}) as Record<string, unknown>;
    return { params: { largo: medida(x.largo, 5, 1, 50), ancho: medida(x.ancho, 2.5, 0.73, 50), cotaLosa: medida(x.cotaLosa, 3, 1.5, 12) }, avisos: [] };
  },
  campos: [
    { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', grupo: 'Medidas' },
    { ruta: 'params.ancho', etiqueta: 'Ancho', tipo: 'medida', unidad: 'm', grupo: 'Medidas' },
    { ruta: 'params.cotaLosa', etiqueta: 'Cota de la losa', tipo: 'medida', unidad: 'm', grupo: 'Medidas' },
  ],
  presets: [{ id: 'cimbra_losa', nombre: 'Cimbra de losa', icono: 'torre', descripcion: 'Puntales bajo una losa de 5,00 × 2,50.', params: {} }],
  generar(est: Estructura & { params: ParamsCimbra }, ctx: CtxGenerar): Generado {
    const m = ctx.catalogo.medidas;
    const cn = cotasNiveles({ altura: est.params.cotaLosa + 1, modo: 'solo_trabajo' });
    const g = grillaRect({
      vanosS: tramosDe(est.params.largo, est.medida, m), profundidades: tramosAncho(est.params.ancho, est.medida, m),
      cotas: cn.cotas, yTope: cn.plataformas[0], diagonales: false, barandas: false, catalogo: ctx.catalogo, medidas: m,
    });
    plataformaGrilla(g.b, g, g.b.k(cn.plataformas[0]));
    diagonalesPerimetro(g.b, ctx.catalogo, g);
    const avisos = est.params.cotaLosa < 2
      ? [{ regla: 'cimbra.baja', nivel: 'aviso' as const, estructuraId: est.id, texto: `Losa a ${fmt(est.params.cotaLosa)}: conviene puntal telescópico.`, reparaciones: [] }]
      : [];
    const L = g.S[g.S.length - 1];
    const B = g.T[g.T.length - 1];
    return {
      esqueleto: g.esqueleto, avisos, reglas: [], metricas: metricasCaja(L, B, cn.plataformas[0]),
      puertos: puertosCaja('Cimbra', g.S, L, B, cn.plataformas[0], cn.plataformas[0]),
    };
  },
};
```

```ts
// src/lib/tecnica/modelo/tipologias/cimbra.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';

const C = M.CATALOGO_FIXTURE;

test('cimbra: golden, bien armada y misma lista en libre', () => {
  const d = M.crearDiseno('cimbra_losa');
  const r = M.construir(d, C);
  assert.deepEqual(problemasDeArmado(r), []);
  console.log(golden(porFamilia(r), FAMILIAS_GOLDEN)); // la primera vez: copiá esto como golden
  assert.deepEqual(bomPlano(M.construir(M.convertirALibre(d, 'E1', C), C)), bomPlano(r));
});
```

Las tipologías reales de este directorio son buenos ejemplos para copiar:

- `torre-movil.ts`: lo más parecido a la cimbra, con regla de H/B y dos reparaciones;
- `bandeja-voladizo.ts`: sin columnas al suelo;
- `sobre-escalera.ts`: apoyos a distinto nivel y perfil editable;
- `patio-interno.ts`: tiras en varios marcos con esquinas compartidas.

## Volúmenes de referencia (para tipologías que se apoyan en algo)

El edificio y sus obstáculos se dibujan desde medidas con `agregarVolumen(diseno, def)`. Hay seis tipos de definición:

- caja;
- prisma por planta;
- escalonado con retranqueos;
- cilindro con cúpula;
- saliente: balcón, marquesina o cornisa;
- huecos y patios dentro de un cuerpo.

Se guardan en `diseno.contexto.volumenes` con su `def` y su `defVersion`. Las tipologías leen solo `planta`, `yBase` e `yTope`.

Desde una cara (`carasDelDiseno`), `agregarEnCara` crea la fachada, la envolvente o el patio que corresponde. `avisosDeChoque` marca las piezas que se meten en un volumen y trae la reparación de un clic.

### Campo «volumen»: la tipología depende de algo del contexto

Si la tipología se apoya en un volumen (una escalera, la losa de la que cuelga, la azotea), declará el campo con
`tipo: 'volumen'` y los tipos que sirven:

```ts
{ ruta: 'params.volumenId', etiqueta: 'Escalera', tipo: 'volumen', volumenes: ['escalera'], grupo: 'Apoyo' },
```

La pantalla muestra una lista con los volúmenes compatibles y el botón «Crear uno con estas medidas». Al ubicar
la plantilla, si el diseño no tiene ninguno compatible, se crea solo (`vincularVolumenSugerido` en
`volumenes/sugerido.ts`) y queda vinculado: nadie tiene que tipear un id. Si tu tipología necesita un volumen
de otra forma, sumá el caso en `volumenSugerido` con su test en `volumenes.test.ts`.

### Reglas que el test de presets exige

- `motor.test.ts` arma **todos** los presets con el catálogo de prueba y falla si alguno abre con un aviso de nivel
  `aviso` o `error` por cómo está configurado (anclá lo que es esbelto, dale profundidad al paso peatonal, etc.).
  Los avisos de verificación obligatoria (colgar, volar, cargar una losa) están en una lista aparte del test.
- Todas las piezas tienen que tener código en el fixture (o la línea queda «sin código» y el test lo marca). Si
  una pieza nueva no existe en Odoo, agregala al fixture con `{ plausible: true }`: en producción queda «sin
  código» hasta que Oficina Técnica la mapee en `tec_pieza_mapa` (nunca se inventa).
- Cada caño lleva sus propias grampas con id `<id del caño>:g0`, `:g1`…: `fusionarNodos` no las deduplica por
  posición (dos caños que llegan al mismo nodo suman 4 grampas) y solo las saca si se fue su caño.
