# Modelador 3D en el navegador: viabilidad técnica

## 1. Veredicto

Se puede hacer, y con el stack que el repo ya tiene. React 19.2.4 y Next 16.2.1 son compatibles con r3f 9 y drei 10. `zustand@5.0.12` e `immer@10.2.0` ya están instalados (ver `package.json`). Hay un patrón ya probado para cargar el 3D sin SSR: `dynamic(..., { ssr:false })` dentro de un client component, como en `src/app/(dashboard)/mapa-obras/page.tsx:35`. La documentación local lo exige así: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md:66,94` dice que `ssr:false` no anda en Server Components.

La decisión técnica de fondo es esta: **el modelo es paramétrico y está en una grilla, no es una malla libre**. Un andamio, sea multidireccional o de bastidores, es una grilla de vanos × niveles × frentes. Si editamos esa grilla, y no piezas sueltas, el modelador es rápido de usar y también de calcular.

## 2. Stack recomendado (versiones exactas, todas con más de 2 semanas)

| Paquete | Versión | Nota |
|---|---|---|
| `three` | **0.186.1** | publicado el 24/09/2026 |
| `@types/three` | 0.186.0 | |
| `@react-three/fiber` | **9.8.1** | peer `react >=19 <19.4`. **No usar la 9.8.2**: salió hoy (14/10) |
| `@react-three/drei` | **10.7.9** | ya trae `camera-controls ^3.1`, `three-mesh-bvh ^0.8.3` y `three-stdlib`. **No agregar `three-mesh-bvh` 0.9 aparte**, porque quedaría duplicado |
| `zustand` | 5.0.12 (ya está) | store del modelo |
| `immer` | 10.2.0 (ya está) | `produce` + `enablePatches` para deshacer |
| `@react-pdf/renderer` | 4.3.2 (ya está) | PDF de la lámina (PNG + SVG) |

`zundo@2.3.0` es opcional; ver §5.

Hay un riesgo de dependencias: r3f tiene el techo `react <19.4`. Si se sube React, r3f tiene que subir con él. Hay que dejarlo anotado en el handoff.

**Fuentes:** `npm view @react-three/fiber peerDependencies`, `npm view three time`, https://r3f.docs.pmnd.rs, https://drei.docs.pmnd.rs, https://threejs.org/docs/#api/en/objects/InstancedMesh

## 3. Arquitectura por capas

```
src/lib/tecnica/modelo/            ← TS puro, sin React ni three; tests con node --test
  tipos.ts          ModeloAndamio { sistema: 'multi'|'bastidor', estructuras: Estructura[] }
                    Estructura = Fachada | Torre | Portico  (unión discriminada)
                    Fachada { origen, rumbo, vanos: number[] (m), niveles: number[] (m),
                              ancho: 0.73|1.09, anclajes, mensulas, cubierta, overrides }
  catalogo.ts       piezas por sistema: {ref, tipo, largo, peso_kg, codigoOdoo?}. Se busca por ref, no por índice
                    (así no se repite el bug de la app vieja con los índices sobre STD/VARM)
  construir/        fachada.ts, torre.ts, portico.ts, bastidor.ts → Pieza[]
  pieza.ts          Pieza {id estable, ref, tipo, a:[x,y,z], b:[x,y,z], rot?, estructuraId, celda:[i,j,k]}
  computo.ts        Pieza[] → agrupar por ref → {ref, cant, peso}
  vistas2d.ts       Pieza[] → segmentos proyectados (planta / alzado / corte) → datos para SVG
  validar.ts        reglas geométricas: falta diagonal cada N vanos, anclaje cada X m², base sin plato
  adaptadores-calc.ts  ModeloAndamio → entradas de M01–M11
src/lib/tecnica/estado/
  store.ts          zustand + immer: modelo, selección, herramienta activa, historial
  comandos.ts       acciones de dominio: agregarVano, cambiarAltura, insertarPortico… (cada una es un produce)
src/components/tecnica/modelador/
  lienzo-3d.tsx     <Canvas> (lo carga dynamic ssr:false)
  capas/instancias.tsx   un InstancedMesh por geometría base
  capas/seleccion.tsx    resaltado, hover, puntos de agarre (handles) por celda
  camara.tsx        CameraControls + ortográfica/perspectiva + vistas fijas
  vista-svg.tsx     planta/alzado 2D desde vistas2d.ts
  panel-*.tsx       parámetros, cómputo, veredictos
src/app/(dashboard)/oficina-tecnica/modelador/page.tsx  ("use client")
```

**Regla:** `construir()` es una función pura y determinista. El render, el cómputo, las vistas SVG y el cálculo derivan todos de `Pieza[]`. Las ediciones manuales finas, como sacar una diagonal o agregar una ménsula puntual, se guardan como `overrides` direccionados por `celda`, nunca como piezas sueltas. Así se pueden regenerar los parámetros sin perder esos ajustes.

## 4. Piezas propias, sin assets de terceros

Layher no publica glTF libres (ver el handoff §2), así que las piezas se generan por código. Alcanza con unas **8 geometrías base** de largo unitario, y el largo real va en la matriz de cada instancia:

| Geometría | Construcción | Triángulos |
|---|---|---|
| Tubo Ø48,3 (verticales, horizontales, diagonales, barandas) | `CylinderGeometry(0.02415, 0.02415, 1, 8, 1, true)` escalado en Y; para orientarlo de `a` a `b` alcanza con un `Quaternion.setFromUnitVectors` | 16 |
| Roseta | `ExtrudeGeometry` de una `Shape` circular Ø124 con 8 ranuras (4 chicas y 4 grandes), 9 mm de espesor. Simplificada: `CylinderGeometry` de 16 lados | ~64 a ~200 |
| Plataforma (acero o madera) | `BoxGeometry(1, 0.04, 0.32)` escalada en X, más un `CanvasTexture` procedural de chapa perforada | 12 |
| Rodapié | `BoxGeometry` | 12 |
| Base regulable | cilindro con placa (`BoxGeometry`) | ~40 |
| Bastidor | **no es una geometría**: el constructor lo descompone en 4–6 tubos (dos montantes, dos travesaños y uno o dos refuerzos). Para el cómputo es 1 pieza (`ref` del bastidor); para el render son `primitivas[]` | — |
| Cruceta | 2 tubos | — |
| Ménsula / viga de celosía | tubos con diagonales | — |

Con esto, `Pieza` y `Primitiva` quedan separadas: la lista de materiales cuenta piezas y el render dibuja primitivas.

**Material.** Un solo `MeshStandardMaterial` galvanizado (metalness 0,6 y roughness 0,45) con `instanceColor` para estados: seleccionado, con falla de verificación y "fantasma" de previsualización. La luz sale de `RoomEnvironment` (`three/examples/jsm/environments`), que se genera en código. **No hay que usar `<Environment preset>` de drei**, porque baja HDRs de un CDN externo.

## 5. Interacción

### Selección sobre instancias
r3f devuelve `e.instanceId` cuando el raycast pega en un `InstancedMesh`. Para hacer el raycast más rápido sirve `<Bvh>` de drei. Mejor todavía, porque es más barato y más útil: **picking semántico por grilla**. Se intersecta el rayo con los planos de la fachada (frente y niveles) y se obtiene `celda:[i,j,k]` en O(1). Eso alcanza para que la Oficina Técnica opere ("agregá vano acá", "subí este nivel", "poné un pórtico en estos 2 vanos"). El picking por instancia queda para la ficha de pieza. Para 50k instancias, el hover se calcula con throttle de un frame y el clic, al momento.

### Cámara tipo CAD
- `<CameraControls>` de drei (camera-controls 3.1) con `setLookAt` animado.
- Vistas planta / alzado frontal / lateral / iso en las teclas 1–4.
- `<OrthographicCamera makeDefault>` se alterna con la perspectiva conservando el encuadre.
- `<GizmoHelper><GizmoViewcube/>` para el cubo de vistas.
- `<Grid infiniteGrid>` como piso, con cotas en metros.

No hace falta gizmo de traslación libre: se edita con handles ajustados a la grilla (flechas en los bordes de la estructura para estirar vanos o niveles) y con el panel numérico.

### Deshacer y rehacer
El modelo pesa pocos KB: son parámetros, no piezas. Por eso se guardan **snapshots inmutables** del `ModeloAndamio` con structural sharing de immer, en un ring buffer de unas 200 entradas dentro del store de zustand.

- El command pattern explícito no se justifica.
- `zundo@2.3.0` resuelve esto mismo en 10 líneas, pero su último release es de noviembre de 2024 y conviene evaluarlo.
- Las patches de immer solo hacen falta si después se quiere colaboración o auditoría.

Mientras se arrastra un handle se usa `pause()` y se confirma al soltar, así el arrastre queda como un solo paso en el historial.

## 6. Exportación

- **PNG de alta resolución:** `gl.setPixelRatio(3)`, `gl.render()`, `canvas.toBlob()` y se restaura en el mismo tick. Si se necesita más de 4K, se usa un `WebGLRenderTarget` de 4096² con `readRenderTargetPixels`. Si se captura en el mismo frame no hace falta `preserveDrawingBuffer`. Fondo blanco y luz de "estudio" para la propuesta comercial.
- **SVG 2D (alzado y planta):** se proyecta `Pieza[]` a 2D (x–z para el alzado y x–y para la planta), se deduplican los segmentos colineales y se dibujan como `<line>`. Las cotas salen de `vanos[]` y `niveles[]`. Es determinista, se puede testear con `node --test` (snapshot de segmentos) y es vectorial para el PDF. Reemplaza los diagramas armados a mano de `scaffold-iso.tsx` de la app vieja.
- **PDF:** `@react-pdf/renderer`, que ya se usa en `src/lib/cotizador/pdf`, arma una lámina con la iso (PNG), el alzado y la planta (SVG), la lista de materiales y los veredictos. `next.config.ts` ya tiene el `outputFileTracingIncludes` para las fuentes.

## 7. Presupuesto de rendimiento

**Tamaño real de una obra.** Una fachada de 50 m × 30 m con vanos de 2,57 m y niveles de 2 m tiene unos 20 × 15 = 300 celdas. A unas 15 piezas por celda son **≈ 4.500 piezas**. 50.000 piezas es un caso extremo: una obra entera con varias fachadas y torres.

| Métrica | Objetivo (PC de oficina con GPU integrada, 1080p) |
|---|---|
| Draw calls | ≤ 40 (1 por geometría base × estado) |
| Triángulos en pantalla | ≤ 1,5 M (rosetas de 64 triángulos, más el detalle de 200 solo de cerca) |
| FPS órbita | 60 con 5k piezas y ≥ 30 con 50k |
| `construir()` | ≤ 10 ms con 5k y ≤ 60 ms con 50k; si se pasa de 16 ms, va a un Web Worker |
| Actualizar matrices | 50k × 64 B = 3,2 MB por regeneración: se reescribe `instanceMatrix` y se marca `needsUpdate` |
| Tiempo a interactivo | chunk 3D ≤ 250 KB gzip (three tree-shaken ~160 + r3f ~45 + drei importado por partes) |
| Memoria | ≤ 150 MB de tab |

Más técnicas:
- `frameloop="demand"`: solo renderiza cuando algo cambia, así el ventilador no se enciende mientras la Oficina Técnica escribe.
- LOD por distancia: las rosetas se ocultan si miden menos de 2 px.
- `BatchedMesh` (three r156+) queda como plan B si se necesitan muchas geometrías distintas.

## 8. Alternativas evaluadas

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| **r3f + drei** | declarativo y React-nativo; trae cámara, gizmo, BVH y grid listos; maqueta en días | pin `react <19.4`; abstrae el loop | **Recomendada** |
| three vanilla dentro de un `useEffect` | sin pin de React; control total | hay que escribir a mano controles, gizmo, eventos y limpieza | Plan B: si `construir()` es puro, migrar cuesta poco |
| Babylon.js 8 | thin instances, gizmos e inspector incluidos | integración React débil; ~2× peso; otro ecosistema | No |
| That Open / xeokit (BIM, IFC) | exporta IFC | sobredimensionado; licencia AGPL en xeokit | Más adelante, solo si piden IFC |
| **2D primero, 3D secundario** | la Oficina Técnica piensa en alzado y planta; SVG simple y rápido | sin 3D no hay "wow" comercial ni chequeo espacial de torres y pórticos | **Híbrido:** el alzado SVG es la superficie de edición principal y el 3D se actualiza al lado en vivo. Las dos vistas leen el mismo store |

## 9. Riesgos técnicos

1. **Combinaciones de estructuras:** fachada + torre de escalera + pórtico, y la unión entre ellas. Una torre que se apoya en la fachada comparte verticales. Para eso hace falta un paso de **fusión de nodos** (hash de posición redondeada a mm) después de `construir()`. Sin ese paso, el cómputo cuenta verticales de más. Es el riesgo más alto: hay que testearlo con casos golden.
2. **Catálogo real:** sin las medidas Layher STD reales (0,73 / 1,09 / 1,57 / 2,07 / 2,57 / 3,07) y los pesos, la lista de materiales es ilustrativa. Es la decisión abierta 2 del handoff.
3. **Bastidores:** las modulaciones son distintas (1,00 / 1,50 / 2,00 de alto y vanos fijos) y no hay rosetas. El `sistema` cambia el constructor, no la UI.
4. **Esquinas, fachadas no rectas y retiros en planta:** el modelo tiene que soportar `estructuras[]` con `rumbo` desde el día 1, aunque la v1 solo dibuje rectas.
5. **Peer pin de r3f** (§2) y **tests con Node 22.16**: `npm test` falla sin `--experimental-strip-types`. Hay que subir a Node ≥ 22.18 antes de sumar tests de `modelo/`.
6. **GPU de la oficina:** confirmar el modelo de PC. Si es iGPU vieja, bajar el detalle de rosetas por defecto.
7. **Pérdida de contexto WebGL** con varias pestañas abiertas: hay que manejar `webglcontextlost` y regenerar desde el store.

## 10. Plan de maqueta (1–3 días, solo para validar la UX)

Debe ser **standalone**, fuera de la app de producción. Puede ser una página `/oficina-tecnica/modelador-maqueta` sin datos, o un HTML con import maps (`three@0.186.1` desde jsDelivr). No toca Supabase.

**Día 1: modelo y 3D**
- `construirFachada({vanos, niveles, ancho})` → Pieza[] para el sistema multidireccional, con tubos, rosetas, plataformas y bases.
- Un InstancedMesh por geometría y CameraControls con vistas 1–4 + ViewCube.
- Panel de parámetros: largo total (se reparte solo en vanos STD), altura, ancho y cubierta.
- Lista de materiales en vivo agrupada por ref, con pesos de ejemplo.

**Día 2: edición ágil**
- Picking por celda con hover fantasma.
- Clic en un borde: suma un vano. Shift+clic: lo quita.
- Arrastrar el handle superior: sube o baja niveles.
- Pestañas de plantillas: **Fachada**, **Torre** (base B×L y altura, con o sin escalera), **Pórtico** (luz libre y altura de paso, con viga de celosía y vereda protegida).
- Deshacer/rehacer con Ctrl+Z / Ctrl+Shift+Z (snapshots).
- Alzado SVG al lado del 3D, sincronizado, con la selección cruzada.

**Día 3: bastidores y salida**
- Cambio de sistema a bastidores, que reconstruye la misma estructura con bastidores y crucetas.
- Exportar PNG 3× y lámina (iso + alzado + lista de materiales).
- Semáforo geométrico simple en `validar.ts`: anclajes y diagonales.
- Prueba con 2 o 3 personas de la Oficina Técnica: armar la fachada de 30 × 18 con un pórtico en la entrada. **Meta: menos de 2 minutos sin ayuda**, midiendo clics y tiempos.

**Criterios para pasar a producción:**
- El flujo de plantilla → ajuste → lista de materiales se entiende sin explicación.
- El alzado 2D se usa como superficie de edición.
- 60 fps en la PC real de la Oficina Técnica.
- `construir()` y `computo.ts` están cubiertos por tests golden antes de conectar el cálculo M01–M11 (con los bugs del handoff §3 corregidos).

**Archivos consultados:**
- `/Users/joaquin/Desktop/Proyectos/AndamiosOS/package.json`
- `/Users/joaquin/Desktop/Proyectos/AndamiosOS/docs/oficina-tecnica/handoff.md`
- `/Users/joaquin/Desktop/Proyectos/AndamiosOS/src/app/(dashboard)/mapa-obras/page.tsx`
- `/Users/joaquin/Desktop/Proyectos/AndamiosOS/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`
- `/Users/joaquin/Desktop/Proyectos/AndamiosOS/next.config.ts`