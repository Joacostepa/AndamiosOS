# Modelador ABA: propuesta híbrida por bloques

## Visión

- **Una obra se arma encastrando bloques**: tramo de fachada, torre, pórtico y voladizo. Se hace como con piezas de Lego, no tubo por tubo ni dibujando en CAD.
- **Cada bloque tiene parámetros con valores precargados**. Se editan en el panel o arrastrando manijas que avanzan de a un vano o de a un nivel, y la lista de piezas y el peso se ven en vivo.
- **Del mismo modelo sale todo**: el 3D, el cómputo en `computos`, la imagen para la propuesta y, más adelante, los veredictos M0x.

## Usuarios y trabajos a resolver

| Usuario | Trabajo | Hoy | Meta |
|---|---|---|---|
| **Oficina Técnica** (principal) | Pasar de la venta a un cómputo confiable | Cómputo a mano o con `/api/ai/computo`, que adivina las cantidades | Fachada con quiebre en menos de 2 min y cómputo en un clic |
| **Comercial** | Imagen y m² para la propuesta, a veces antes de cerrar la venta | Fotos de otras obras o nada | PNG 3/4 y m² desde un modelo sin obra |
| **Profesional firmante** (Hougassian) | Validar los criterios y la memoria | Planillas aparte | Tabla de "criterios ABA" editable y veredictos con la norma visible |
| **Depósito / Logística** | Saber qué sale y si hay stock | Remito armado de cero | Semáforo de stock y, después, remito desde el cómputo |

## El bloque como unidad

| Bloque | Parámetros (con default) | Puertos de encastre |
|---|---|---|
| **Tramo de fachada** | largo, altura, profundidad (0,73 / 1,09), sistema, niveles ("1 fila" o "cada 2 m"), cubierta, pantalla en PB s/n, retiro al muro | extremo izquierdo y derecho (para quiebres) y cara exterior por nivel (para torre o ménsula) |
| **Torre** | planta (2,50 × 1,50 por defecto), altura, tipo (escalera / acceso / trabajo / móvil), nivel de desembarco, anclada s/n | 4 caras × nivel |
| **Pórtico** | luz, altura libre (≥ 2,50), ancho de paso, viga (puente o celosía), "lleva estructura arriba" s/n | tope del pórtico (para apoyar un tramo) y laterales |
| **Voladizo / ménsula** | lado, brazo, niveles afectados | se cuelga de la cara exterior de un tramo |

**El snapping funciona así.** Al arrastrar un bloque cerca de otro, sus puertos se iluminan. Al soltar, el sistema arma la unión con una regla según el tipo:

- **Quiebre** (extremo con extremo): ángulo de 90° por defecto, o 45° o libre con Shift. En multidireccional se resuelve con vertical compartida o con un vano de giro de 0,73. En bastidor, con dos cuerpos y nudos giratorios ⚠.
- **Torre adosada** (cara con cara): comparte verticales y el sistema lo informa con un toast: "Compartí 2 verticales con el Tramo A".
- **Fachada sobre pórtico** (tope con base): las verticales del tramo arrancan sobre la viga y se agrega una diagonal en planta.

Las uniones se guardan como objetos y se pueden seleccionar y cambiar, por ejemplo de "vertical compartida" a "vano de giro".

## Flujo principal

**Caso: obra en esquina con fachada en L, torre de escalera y pórtico peatonal de acceso.**

| Paso | Qué hace el usuario | Qué hace el sistema | Tiempo |
|---|---|---|---|
| 1 | En la obra o el cómputo aprieta **"Diseñar andamio"** | Abre el modelador con un Tramo instanciado a partir de `medidasDe()` (por ejemplo 18 ml × 12 m, con la marca "estimado") y el tipo `estructura_pantalla` | 0:05 |
| 2 | Responde 3 chips: Multidireccional, 0,73, Media sombra | Regenera: vanos de 2,50 más uno de ajuste, niveles cada 2 m, pantalla en PB, barandas, rodapiés, diagonales, anclajes densificados y toast "Agregué 8 anclajes por la media sombra" | 0:20 |
| 3 | **Quiebre:** arrastra un Tramo nuevo desde la paleta (o `F`) hasta el extremo derecho, suelta y tipea `9` Enter | Une a 90° con vertical compartida, hereda la altura y la cubierta y muestra "9,00 → 2×2,50 + 2,00 + 1,09 (desvío +0,09)" con chips de alternativas | 0:45 |
| 4 | **Torre de escalera:** `T`, apoya la torre en la cara exterior del Tramo A, en el vano 3 | Torre de 2,50 × 1,50 × 12 con zancas, descansos y barandas de escalera. Comparte verticales y desembarca en todos los niveles | 1:10 |
| 5 | **Pórtico peatonal:** `P` y lo suelta sobre los vanos 5–6 del Tramo A, a nivel de PB | Reemplaza esos vanos por un pórtico de altura libre de 2,50 con viga puente, bandeja y recubrimiento de verticales. Valida el paso de 1,20 o más | 1:30 |
| 6 | Revisa la barra inferior (t, piezas, anclajes y estado "predimensionado"), abre la lista y aprieta **"Generar cómputo"** | Agrupa por código Odoo, escribe `computo_items` con origen = modelo y marca "sin código" en lo que falta | 1:50 |
| 7 | "Imagen para propuesta" | PNG 3× con encuadre 3/4 y fondo blanco | 2:00 |

Una torre suelta o una pantalla de protección sola tienen que salir en menos de 30 s, con los pasos 1, 2 y 6.

## Layout de pantalla

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Obra S01234 · Av. Corrientes 1234   [Multi|Bastidor]  ⌘K Buscar…  ↶ ↷  [Imagen] [Generar cómputo] │
├────────┬──────────────────────────────────────────────┬──────────────────────────┤
│BLOQUES │                                              │ PROPIEDADES · Tramo A    │
│        │              VISTA 3D (r3f)                  │ Largo     [18,00] m      │
│ ▭ Tramo│     ┌───┬───┬───┬───┬───┬───┬──┐  ◇ viewcube │  = 6×2,50 + 2,00 + 1,09  │
│ ▯ Torre│     ├───┼───┼───┼───┼───┼───┼──┤             │ Altura    [12,00] m      │
│ ⊓ Pórt.│     ├───┼───┼───┼─▓▓─┼───┼───┼──┤◀▶ manija   │ Prof.     (0,73) 1,09    │
│ ⊏ Volad│     ├───┼───┼───┼───┼───┼───┼──┤             │ Niveles   (cada 2 m)     │
│────────│     ├───╫───┼───┴───┴───┼───┼──┤  ● puerto   │ Cubierta  [Media sombra] │
│PLANTILL│  ═══╧═══╧═══╧══[pórtico]╧═══╧══╧══           │ Pantalla PB  ☑           │
│ Fachada│                    ▲ manija altura           │ ── Celda N4·V3 (2) ───── │
│ en L   │                                              │ Plataforma ☑ Anclaje ●   │
│ Torre  ├──────────────────────────────────────────────┤ Diagonal  auto (override)│
│ escal. │  ALZADO DESPLEGADO (SVG, celdas)   [1][2][3] │──────────────────────────│
│ Pórtico│  V1  V2  V3  V4  V5  V6  V7 | B1  B2  B3     │ LISTA EN VIVO            │
│ peat.  │ N6 □   □   □   □   □   □   □ | □   □   □     │ HOR-048-250   124  1.4 t │
│ …      │ N5 □   □   ■   □   □   □   □ | □   □   □     │ VERT-200-CE    56  0.6 t │
│        │ …                            ↑ quiebre       │ DIAG-200x250   18 …      │
│        │                                              │ + Ajuste manual          │
├────────┴──────────────────────────────────────────────┴──────────────────────────┤
│ 412 m² · 6,8 t · 1.934 piezas · 22 anclajes · stock ● 3 faltantes · PREDIMENSIONADO │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Izquierda:** paleta de bloques y plantillas compuestas, que son combinaciones de bloques guardadas. Se arrastran al lienzo.
- **Centro:** el 3D arriba y el alzado desplegado abajo. El alzado es la superficie de edición fina: celdas, pincel y aberturas. `Tab` cambia cuál de las dos vistas es la grande.
- **Derecha:** propiedades del bloque o la celda seleccionada. Con varios seleccionados muestra "Mixto". Abajo va la lista en vivo.
- **Barra inferior:** siempre visible.

## Modelo de datos

```
Diseño { id, obra_id?, cotizacion_id?, version, contexto{terreno, en_vereda, ancho_vereda,
         clase_carga=3, zona_viento, cubierta_global}, criterios_ref, bloques[], uniones[] }
Bloque { id, tipo: tramo|torre|portico|voladizo, sistema: multi|bastidor,
         origen{x,y,z}, rumbo°, params{…metros…}, overrides{ "i,j": {plataforma?, diagonal?,
         anclaje?, anulada?, cubierta?} } }
Union  { a:{bloque, puerto}, b:{bloque, puerto}, modo: vertical_compartida|vano_giro|apoyo }
construir(Diseño, Catálogo, Criterios) → Pieza[] → fusionarNodos() → Pieza[]
Pieza  { id estable, codigo, tipo, a, b, peso_kg, bloque_id, celda, kit? }
```

- **Persistencia:** `tec_modelos` con `obra_id` nullable (opción B del informe de sistema), para que Comercial pueda modelar sin obra y para tener plantillas compuestas reutilizables. El vínculo con el cómputo va por `computos.modelo_id`.
- **El JSON guarda códigos y metros**, nunca índices, para no repetir el bug de los escenarios de la app vieja.
- **`fusionarNodos()`** deduplica verticales y bases donde los bloques se tocan, con un hash de posición al milímetro. Es el corazón del encastre y lo que más hay que probar.

## Multidireccional y bastidores

- **El sistema se elige por bloque, no por obra.** Así se puede combinar un pórtico multidireccional con una fachada de bastidores.
- **La interfaz es la misma; cambia el constructor:**

| | Multidireccional | Bastidor |
|---|---|---|
| Vanos | catálogo ABA: 2,50 (default), 2,00, 1,50, 1,25, 1,09, 0,73. **No Allround** | cuerpos de 2,50 (STD) o 1,50 (JR), sin vano de ajuste: el largo se redondea con aviso |
| Niveles | paso de 0,50 (default 2,00); el último a H − 1,00 | cuerpos de 1,80 más bastidor baranda de 1,00 |
| Profundidad | 0,73 / 1,09 / 1,25 (pantalla) | 1,30 (andamio) / 0,90 (pasillo) |
| Arriostre | diagonales "2,00 × vano" | riendas H/D (crucetas) |
| Cómputo | piezas sueltas | **kit o despiezado**, a elección (`MOD-AND-STD-130x250x180` o bastidores, riendas y tablones) |

- **Las medidas no son libres:** las manijas solo saltan a medidas del catálogo del sistema del bloque.
- **Cambiar el sistema de un bloque lo reconstruye** con las mismas medidas. Si algo no cierra, lo avisa y propone una corrección.

## Reglas automáticas

Las reglas viven en una tabla de **criterios ABA**, versionada y editable, para que la firme Hougassian. Los valores marcados con ⚠ son provisorios:

- **Relleno del largo:** vanos de 2,50 más uno de ajuste, al final o centrado. Avisa si el desvío pasa de 10 cm y ofrece alternativas en chips: "menos piezas", "vanos iguales" o "menos peso".
- **Protección:** doble baranda y rodapié en cada lado abierto. El lado de fachada queda libre si el retiro es de 0,30 m o menos ⚠. Los laterales de cierre van siempre.
- **Plataformas:** tablones por ancho de vano ⚠ y escotilla en el vano de acceso.
- **Diagonales:** en los vanos extremos y al menos cada 5 vanos, alternando el sentido ⚠. Diagonal en planta en el arranque y sobre pórticos.
- **Anclajes:** 1 cada 12 m², con un mínimo de 5, al tresbolillo cada 2 vanos × 2 niveles. Se densifican con media sombra o lona, y van siempre en el último nivel y en los extremos ⚠.
- **Esbeltez:** en torres libres con H/B > 3 propone ensanche, pata de gallo o anclaje (M03/M04), con reparación en un clic.
- **Vía pública:** pantalla con fenólico de 18 mm y esferas. En el pórtico valida altura libre de 2,50 o más, paso de 1,20 o más y recubrimiento de verticales hasta 2 m.
- **Bases:** una por vertical. El tornillón absorbe el desnivel que se cargue por eje.

**Cómo se comunican las reglas:**

- **Cuando el sistema agrega algo**, lo dice con un toast y un botón de deshacer.
- **Cuando falla una regla**, se pinta en rojo en todas las vistas y el panel ofrece la reparación.
- **Cuando el usuario cambia algo a mano**, el override queda marcado con un punto y sobrevive a la regeneración.

## Salidas

1. **Lista de materiales y cómputo en vivo:** cantidad, código Odoo, kg y semáforo de stock contra `stock.en_deposito − comprometido`. Permite **ajustar a mano** el material extra o de reposición sin tocar el modelo. "Generar cómputo" escribe `computo_items` con `origen`. Al regenerar muestra las diferencias y no pisa en silencio. Queda bloqueado si el cómputo está completado.
2. **Imagen:** PNG 3× para la propuesta, más alzado y planta en SVG.
3. **Lámina PDF** con iso, alzado y lista, usando `@react-pdf/renderer`.
4. **Entradas al cotizador:** `frentes[]`, altura, m² y ml, o la lista de piezas para `cotizarAlquiler`. **El modelador nunca pone precio.**
5. **Verificaciones:**
   - En la v1 son solo reglas geométricas.
   - M03, M05 y M11 entran después, portados con los bugs corregidos, la norma visible y la etiqueta "predimensionado" hasta que haya firma.
   - Ante NaN o entradas inválidas fallan cerrado: mejor sin veredicto que con un "ok" falso.

## Integración con Andamios OS

- **Ruta y carga:** `/oficina-tecnica/modelador/[id]`, con una página `"use client"` y `dynamic(..., { ssr:false })`, siguiendo el patrón de `mapa-obras`.
- **Permisos:** módulo `modelador` en `DEFINICION`, con `exigirModulo` en la API de escritura. Antes hay que alinear la RLS de `computos` (R7 del informe de sistema).
- **Precarga desde la venta:** solo con `medidasDe()` y la marca "estimado". No se lee `x_permiso_*` directo, porque viene en 0.
- **Catálogo:** familias derivadas de `catalogo_piezas` más una tabla `tec_pieza_mapa(tipo, largo, sistema) → codigo`, que edita la Oficina Técnica.
- **Código y estado:** el código puro va en `src/lib/tecnica/modelo/*` con tests golden. El estado, en zustand con immer y snapshots para deshacer.
- **Stack 3D:** `three@0.186.1`, `@react-three/fiber@9.8.1` y `@react-three/drei@10.7.9`, con `InstancedMesh` y `frameloop="demand"`.
- **Estética:** se usan los tokens de Andamios OS (coral, DM Sans) y los paneles de vidrio oscuro de Ciudad Armada.

## MVP por fases

| Fase | Contenido | Estimación |
|---|---|---|
| **0 · Prerrequisitos** | Node ≥ 22.18. Auditoría de `peso_kg` y códigos. Confirmar los largos multi y el bastidor 1,30 × 1,80 vs 1,50 × 2,00. Primera versión de la tabla de criterios. 10 remitos reales para los tests golden | 3–5 días (depende de JS) |
| **1 · Tramo multi + lista** | Bloque Tramo, plantillas recta y en L, quiebre por snapping, alzado de celdas con pincel, 3D, lista en vivo y "Generar cómputo" | 2–3 semanas |
| **2 · Torre + pórtico + bastidor** | Bloques Torre y Pórtico, uniones con `fusionarNodos()`, constructor de bastidor con kits y plantillas compuestas guardables | 2–3 semanas |
| **3 · Salidas comerciales** | PNG, lámina PDF, entradas al cotizador, modelos sin obra desde la cotización y semáforo de stock | 1–2 semanas |
| **4 · Verificaciones** | M03, M05 y M11 portados y corregidos, con veredictos y reparaciones | 1–2 semanas |
| *Después* | Voladizo con ménsulas, M08/M09, remito desde el cómputo y sercha, tribuna o escenario como estructura libre | — |

## Riesgos

1. **Las uniones entre bloques** son el riesgo más alto, porque pueden dar verticales duplicadas o faltantes. Se mitiga con tests golden por cada combinación (L, fachada + torre, pantalla + pórtico) contrastados con remitos reales.
2. **Catálogo y pesos incompletos:** sin ellos, la lista de materiales es ilustrativa. Por eso la Fase 0 es bloqueante.
3. **Que el snapping sorprenda**, uniendo lo que el usuario no quería. Se mitiga con una previsualización fantasma antes de soltar, `Alt` para soltar sin unir y la unión como objeto editable.
4. **Que el alcance se escape** hacia la edición pieza por pieza. Esa edición queda como modo excepción, detrás de un toggle.
5. **Veredictos que den falsa seguridad.** Se mitiga con la Fase 4 aparte y la etiqueta "predimensionado".
6. **Que el cómputo regenerado pise las ediciones manuales.** Se mitiga con `origen` por ítem y la vista de diferencias.
7. **GPU de la oficina y pin de r3f a React < 19.4.** Se mitiga probando en la PC real y anotándolo en el handoff.

## Qué validaría con la maqueta interactiva

La maqueta va standalone, sin Supabase, con el catálogo ABA y pesos de ejemplo. Se prueba con 2–3 personas de la Oficina Técnica, cronómetro en mano y sin explicación previa:

1. **Tarea completa:** fachada en L de 18 + 9 m × 12 m, más torre de escalera y pórtico peatonal. **Meta: menos de 2 min**, midiendo clics, errores y dónde se traban.
2. **¿Se entiende el snapping?** Que unan bloques sin ayuda, que noten qué unión se armó y que la cambien.
3. **¿Alzado o 3D?** Ver cuál usan para editar. Si el 3D no se usa para editar, se simplifica.
4. **Manijas contra tipeo:** cuál prefieren y si el redondeo con chips de alternativas se entiende.
5. **Pincel de celdas y aberturas**, por ejemplo una puerta de local en PB.
6. **Cambio de sistema multi ↔ bastidor en un bloque:** si el aviso de redondeo es claro.
7. **Toasts de reglas automáticas:** si generan confianza o molestan.
8. **La lista en vivo:** si coincide con lo que la OT espera para esa obra. Comparar con el remito real de una obra parecida.
9. **Rendimiento en la PC de oficina:** 60 fps con una obra de unas 5.000 piezas.

**Criterio para pasar a producción:** 2 de 3 personas completan la tarea completa en menos de 3 min la primera vez y en menos de 2 la segunda.