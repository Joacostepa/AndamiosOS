# Modelador ABA: decisión de producto

## 1. Puntaje de las tres propuestas

Las notas van de 1 a 5, y 5 es lo mejor. En "Costo/riesgo", un 5 significa barato y de poco riesgo.

| Criterio | Plantillas primero | Dibujo ("Trazo") | Híbrido por bloques |
|---|---|---|---|
| Velocidad para armar lo típico de ABA (pantalla, fachada recta o en L, torre) | **5**: formulario corto, 30–90 s | 3: trazar cuesta aunque se tipee | 4: rápido, aunque arrastrar bloques suma gestos |
| Casos raros (retranqueo, ochava, fachada sobre pórtico, obstáculos) | 3: depende de los overrides y de `O` | **5**: polilínea libre, calco y huecos | 4: puertos y uniones resuelven combinaciones |
| Facilidad de aprendizaje (meta: 10 min) | **5**: elegir y completar | 2: exige destreza de CAD (escala, inferencias) | 4: el snapping puede sorprender |
| Costo/riesgo de construir | **4**: unas 9 semanas, un solo motor | 2: calco de PDF, polilínea libre y esquinas a cualquier ángulo | 3: las uniones como objetos agregan casos borde |
| Valor de las salidas (cómputo, imagen, cálculo) | 4 | 4 | 4 |
| **Total** | **21** | 16 | 19 |

Las salidas puntúan igual porque las tres comparten la misma cadena `construir() → Pieza[] → BOM/3D/SVG/Mxx`. Lo que las separa es cómo se edita.

## 2. Propuesta recomendada: "Plantillas que encastran"

**Gana "Plantillas primero"**, con estos injertos:
- **Del Híbrido:** las uniones como objetos visibles y editables (vertical compartida, vano de giro, apoyo); el snap por puertos para ubicar una torre o un pórtico respecto de una fachada; la paleta de plantillas compuestas guardables; el toggle de kit o despiezado.
- **Del Dibujo:** frentes con largo y ángulo tipeados, una altura por frente, `apoya_en` (fachada sobre pórtico), los huecos como objetos y la variante de esquina conmutable desde la planta. El calco sobre PDF queda para una fase posterior, como opción, y no es la vía principal.

### 2.1 Visión

1. Elegís qué vas a armar, completás de 3 a 6 datos y el andamio sale entero, con barandas, diagonales, anclajes, accesos y bases.
2. Lo raro se resuelve **sobre lo generado**: celdas del alzado, frentes extra y plantillas que se encastran. Nunca se edita tubo por tubo.
3. Del mismo modelo salen el 3D, el cómputo con códigos Odoo reales, la imagen para la propuesta y, cuando estén corregidas y firmadas, las verificaciones.

### 2.2 Principios de diseño

1. **Nunca pantalla vacía.** Siempre se arranca de una plantilla precargada (con `medidasDe()` marcada "estimado") o de la galería.
2. **La unidad es la celda vano × nivel.** Las piezas solo se ven en la ficha de hover o en un modo excepción.
3. **Lo inválido es imposible por construcción.** Las manijas y los campos saltan solo a medidas del **catálogo ABA** (2,50 / 2,00 / 1,50 / 1,25 / 1,09 / 0,73), nunca a las de Allround.
4. **Lo automático se explica y se puede deshacer.** Por ejemplo, un toast: "Agregué 8 anclajes por la media sombra · Deshacer".
5. **Cada error trae su reparación**, con 1 o 2 botones de un clic.
6. **Los overrides sobreviven a la regeneración.** Quedan marcados con un punto, como las instancias de Figma.
7. **Sin veredicto antes que un "ok" falso.** Todo lo que sea cálculo dice "PREDIMENSIONADO".
8. **El sistema (multidireccional o bastidor) se elige por estructura**, no por obra.

### 2.3 Flujo principal: los 3 casos

El arranque es siempre el mismo. Desde la obra, el cómputo o la cotización, el botón "Diseñar andamio" sugiere la plantilla según `x_trabajo_obra` y precarga los ml estimados.

**A. Fachada con quiebre en L (14 + 8 m × 18 m, estructura + pantalla). Meta: menos de 2 min**
1. **0:00.** Se abre la plantilla "Estructura + pantalla" con 22 ml estimados.
2. **0:10.** Se completan los frentes: `14`, Tab, `8`, ángulo 90° por defecto. Altura `18`. Chips: profundidad 0,73, "cada 2 m", media sombra.
3. **0:35.** El sistema genera:
   - el relleno "14,00 → 5×2,50 + 1,50", con chips de alternativa;
   - la esquina con vertical compartida, conmutable a "vano de giro 0,73" desde un ícono en la planta;
   - la bandeja en PB, barandas, rodapiés, diagonales y anclajes densificados, avisados con un toast.
4. **0:50.** En el alzado se seleccionan 2 vanos × 2 niveles sobre el local y se aprieta `O`. El sistema propone una viga puente y se acepta con un clic.
5. **1:20.** Barra inferior y después "Generar cómputo".

**B. Torre de escalera adosada. Meta: menos de 1 min**
1. Se aprieta `T` y se elige "Torre escalera" (2,50 × 1,50). Queda en el cursor y los puertos de la fachada se iluminan.
2. Se suelta en la cara exterior del frente de 8 m. La unión se crea como **vertical compartida** y un toast avisa "Comparte 2 verticales con Frente B".
3. La altura se hereda (18) y el desembarco por defecto es "en cada nivel de la fachada".
4. El sistema genera las zancas, los descansos, las barandas de escalera y las diagonales en todas las caras. `fusionarNodos()` evita contar verticales de más.

**C. Pórtico peatonal sobre vereda, 10 ml. Meta: menos de 1 min**
1. Se aprieta `P` y se elige "Pórtico peatonal". El sistema por defecto es **bastidor de paso 1,30 × 2,50** y se puede cambiar a multidireccional con viga puente.
2. Se cargan ml `10`, altura libre `2,50` y "estructura arriba: no o sí". Con "sí", la fachada queda con `apoya_en` el pórtico.
3. El sistema genera la bandeja de fenólico, las esferas y el recubrimiento de verticales hasta 2 m.
4. Valida que la altura libre sea de 2,50 m o más y que el paso sea de 1,20 m o más. Si no da, ofrece "Subir a 2,50" con un clic.

### 2.4 Layout (escritorio, 1920×1080)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◂ S01234 · Av. Corrientes 1234 (estimado)    Ctrl+K ⌕   ↶ ↷   [Imagen] [GENERAR CÓMPUTO] │
├──────────────┬──────────────────────────────────────┬────────────────────────┤
│ OBRA         │            VISTA 3D (iso)    ◇cubo    │ PROPIEDADES            │
│ ▾ Fachada L ●│      ┌──┬──┬──┬──┬──┐◂▸ manija        │ Fachada L · [Multi|Bast]│
│   Frente A   │      ├──┼▒▒┼──┼──┼──┤                 │ Frentes 14 ⟂ 8 m        │
│   Frente B   │      └──┴──┴──┴──┴──┘ ▣ torre         │  = 5×2,50+1,50 · chips  │
│ ▸ Torre esc. │   ════[pórtico]════   ▲ altura        │ Altura 18 · Prof (0,73) │
│ ▸ Pórtico    ├──────────────────────────────────────┤ Plataf (c/2m) Cubierta  │
│ ─ Uniones ─  │ ALZADO DESPLEGADO  A │ B   [1][2][3]  │ ● 2 overrides [Reset]   │
│  A↔B v.comp. │ N9 □□□□□□│□□□□                      │ Celda N1·V2-V3: abertura│
│  B↔Torre     │ N1 □▒▒□□□│□□□□  ▒ abertura          ├────────────────────────┤
│ PLANTILLAS   │    V1……V6 │ V7…V10                  │ LISTA EN VIVO [kit|desp]│
│ ▢ Pantalla   │                                      │ VERT-200-CE  84  ⚠stock │
│ ▢ Fachada    │                                      │ HOR-048-250 212         │
│ ▢ Torre / esc│                                      │ DIAG-200x250 36 sin kg  │
│ ▢ Pórtico    │                                      │ [+ ajuste manual]       │
├──────────────┴──────────────────────────────────────┴────────────────────────┤
│ 396 m² · 9,8 t* · 2.140 pzs · 34 anclajes · stock ● 3 faltan · PREDIMENSIONADO │
└──────────────────────────────────────────────────────────────────────────────┘
  * peso parcial: N códigos sin peso
```

La planta es una tercera vista, que se trae con `Tab` o `1`, y sirve para ubicar estructuras y conmutar esquinas. Se usan los tokens de Andamios OS (coral `--primary`, DM Sans y JetBrains Mono) y los paneles de vidrio oscuro de Ciudad Armada.

### 2.5 Interacciones clave

- **Tipear mientras se arrastra una manija.** Por ejemplo, `14` + Enter da "14,00 → 5×2,50 + 1,50".
- **Expresiones en los campos** (`12+2,5`). En edición múltiple, `+1` suma un nivel, y los valores distintos se muestran como "Mixto".
- **Arrastre con conteo en vivo**, por ejemplo "+3 vanos · +214 kg", con un fantasma antes de soltar.
- **Pincel de celdas** (`B`, con `1–5` para elegir abertura, sin plataforma, lona, ménsula o anclaje) y selección por fila o columna desde los rótulos.
- **Snap por puertos** con previsualización. `Alt` suelta sin unir, y la unión se puede editar desde el árbol.
- **Hover con ficha de pieza:** código, largo, peso y celda.
- **Deshacer con nombre** ("Abertura N1 V2–V3"). Un arrastre cuenta como un solo paso.
- **Atajos:**

| Tecla | Acción |
|---|---|
| `V` | Seleccionar |
| `F` | Nueva fachada |
| `T` | Nueva torre |
| `P` | Nuevo pórtico |
| `K` | Partir frente |
| `O` | Abertura |
| `B` | Pincel |
| `1` / `2` / `3` | Planta / alzado / 3D |
| `Tab` | Alternar la vista grande |
| `Supr` | Borrar (mismo patrón que el organigrama) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Deshacer / rehacer |
| `Ctrl+D` | Duplicar alineado |
| `Ctrl+K` | Paleta de comandos ("torre 2,50×1,50 h 12") |
| `Z` | Encuadrar |
| `?` | Hoja de atajos |

### 2.6 Modelo de datos

```
tec_modelos(id, obra_id NULL, cotizacion_id NULL, nombre, es_plantilla,
            modelo jsonb, modelo_version, imagen_url, created_by, updated_at)
computos.modelo_id → tec_modelos.id ; computo_items.origen ('modelo'|'manual')
tec_pieza_mapa(familia, largo_m, sistema) → codigo   -- editable por OT
tec_criterios(clave, valor, unidad, firmado_por, fecha, version)

Diseno { contexto{terreno, en_vereda, ancho_vereda, clase_carga=3, zona_viento, cubierta_global},
         estructuras[], uniones[], ajustes_bom[] }
Estructura { id, plantilla, sistema: multi|bastidor, origen, rumbo, apoya_en?,
             params{ frentes[{largo, angulo, altura?}], altura, profundidad, modo_plataforma,
                     cubierta, accesos, luz, altura_libre, … },
             huecos[], overrides{"f:v:n": {...}} }
Union { a{estructura, puerto}, b{estructura, puerto}, modo: vertical_compartida|vano_giro|apoyo }
construir(Diseno, Catalogo, Criterios) → Pieza[] → fusionarNodos() → BOM · 3D · SVG · entradas Mxx
Pieza { id estable, codigo, tipo, a, b, peso_kg|null, estructura_id, celda, kit?, primitivas[] }
```

El JSON guarda **códigos y metros, nunca índices**, para no repetir el bug de los escenarios viejos.

### 2.7 Reglas automáticas

Todas se leen de `tec_criterios`. Las marcadas con ⚠ se ven en la interfaz hasta que las firme Hougassian.
- **Relleno del largo:** vanos de 2,50 más uno de ajuste (al final o centrado, ⚠). Aviso si el desvío pasa de unos 10 cm, y chips "menos piezas", "vanos iguales" y "menos peso".
- **Altura:** el último nivel de trabajo queda a H − 1,00, el arranque a 0,20–0,40 sobre el tornillón y los empalmes van escalonados ⚠.
- **Protección:** doble baranda y rodapié en cada lado abierto. El lado de fachada queda libre si el retiro es de 0,30 m o menos ⚠. Los laterales se cierran siempre.
- **Plataformas:** tablones por ancho ⚠ y escotilla en el vano de acceso. Un acceso cada 20–30 m ⚠.
- **Diagonales:** en los vanos extremos y al menos cada 5 vanos ⚠, alternando el sentido. Diagonal en planta en el arranque y bajo los pórticos.
- **Anclajes:** al tresbolillo cada 2 vanos × 2 niveles, con unos 12 m² por anclaje y mínimo 5. Siempre en el último nivel y en los extremos. Se densifican con malla o lona ⚠.
- **Esbeltez:** si una estructura libre supera H/B > 3, se ofrecen ensanche, pata de gallo o anclaje con un clic.
- **Vía pública:** altura libre de 2,50 m o más, paso de 1,20 m o más, recubrimiento de verticales hasta 2 m y esferas. El RT-040505 está pendiente.
- **Uniones:** `fusionarNodos()` con hash al milímetro. Las verticales y bases compartidas se cuentan una sola vez.

### 2.8 Multidireccional y bastidores

La interfaz es la misma y cambia el constructor. Cambiar el sistema de una estructura la reconstruye con las mismas medidas y avisa las diferencias.

| | Multidireccional ABA (Coronet, no Layher) | Bastidor |
|---|---|---|
| Vanos | 2,50 (default) / 2,00 / 1,50 / 1,25 / 1,09 / 0,73 | cuerpo STD 2,50 o JR 1,50, sin ajuste, con aviso "sobran 0,40 m" |
| Niveles | paso 0,50 (default 2,00) | cuerpos de 1,80 (paso peatonal 2,50) y baranda de 1,00 |
| Profundidad | 0,73 / 1,09 / 1,25 (pantalla) | 1,30 (andamio) / 0,90 (pasillo) |
| Arriostre | diagonales "2,00 × vano" | riendas H/D |
| BOM | piezas sueltas | kit (`MOD-AND-STD-130x250x180`) o despiezado |

### 2.9 Salidas

1. **Lista en vivo:**
   - por código Odoo, con kg (o "sin peso" visible, nunca inventado);
   - semáforo de stock contra `en_deposito − comprometido`;
   - ajuste manual que no toca el modelo.
2. **Generar cómputo:**
   - escribe `computo_items` con su `origen`;
   - al regenerar muestra las diferencias y no pisa en silencio;
   - queda bloqueado si el cómputo está completado.
3. **Imagen:** PNG 3× en iso 3/4 con fondo blanco, guardada en Storage. La lámina PDF (iso, alzado y planta SVG con cotas, y la lista) llega en la fase 3.
4. **Al cotizador:** `frentes[]`, altura, m² y ml, o la lista de piezas para `cotizarAlquiler`. **El modelador nunca pone precio.**
5. **Verificaciones:** en la v1 son solo un semáforo geométrico. M03, M05 y M11 entran después, portados con los bugs corregidos, con fallo cerrado ante NaN y la norma y los supuestos a la vista.

### 2.10 Integración con Andamios OS

- **Ruta y carga:** `/oficina-tecnica/modelador/[id]`, con una página `"use client"` y `dynamic(..., { ssr:false })`, como en `mapa-obras/page.tsx`.
- **Permisos:**
  - un módulo `modelador` en `DEFINICION`;
  - escrituras por API con `exigirModulo`;
  - alinear la RLS de `computos`, que hoy usa `get_user_role()`.
- **Puntos de entrada:** la obra, el cómputo y la cotización (modelo sin obra, que se vincula después).
- **Precarga:** solo con `medidasDe()` y la marca "estimado", porque `x_permiso_altura` viene en 0.
- **Reemplazos:**
  - `/api/ai/computo`, que hoy adivina las cantidades;
  - más adelante, el botón "Remito desde cómputo".

### 2.11 Arquitectura técnica y stack

- **`src/lib/tecnica/modelo/*`:** TS puro, con imports `.ts` y tests con `node --test`. Incluye `tipos`, `catalogo`, `construir/{fachada,torre,portico,bastidor}`, `uniones`, `fusionar`, `computo`, `vistas2d`, `validar` y `adaptadores-calc`. Lleva **tests golden contra remitos reales**.
- **`src/lib/tecnica/estado/`:** zustand + immer (ya instalados), con snapshots en un ring buffer de unas 200 entradas para deshacer y comandos de dominio.
- **3D:**
  - versiones fijas: `three@0.186.1`, `@react-three/fiber@9.8.1` y `@react-three/drei@10.7.9` (no la 9.8.2);
  - un `InstancedMesh` por cada una de las unas 8 geometrías base;
  - `frameloop="demand"`, LOD de rosetas y `RoomEnvironment` (sin HDR de CDN);
  - picking semántico por celda;
  - pin `react <19.4`, que hay que anotar en el handoff.
- **Alzado:** SVG derivado de `vistas2d`. Es la superficie principal de edición fina.
- **Presupuesto de rendimiento:**
  - 60 fps con 5.000 piezas en la PC de la oficina;
  - `construir()` en 10 ms o menos, y si pasa de 16 ms va a un Web Worker.

### 2.12 Fases

| Fase | Alcance | Estimación |
|---|---|---|
| **0 · Prerrequisitos** | Node ≥ 22.18; auditoría de `peso_kg` y códigos; `tec_pieza_mapa`; confirmar el bastidor; borrador de criterios; 10 remitos golden | 3–5 días (más el tiempo de JS y Hougassian) |
| **1 · Maqueta** | Ver §3 | 3–4 días |
| **2 · MVP v1 (multi)** | Plantillas pantalla, estructura ± pantalla con frentes en L, torre escalera y pórtico peatonal; uniones y fusión; alzado con `O` y pincel; lista en vivo; generar cómputo; PNG; semáforo geométrico; `tec_modelos` | 4 semanas |
| **3 · Bastidores y comercial** | Constructor de bastidor con kits, fachada de bastidores, torre móvil, plantillas compuestas guardadas, lámina PDF, imagen en la propuesta, modelo desde la cotización, semáforo de stock | 2–3 semanas |
| **4 · Cálculo y logística** | M03, M05 y M11 corregidos; M08 (pórtico vehicular) y M09 (ménsulas); remito desde cómputo; diferencias al regenerar | 2–3 semanas |
| *Después* | Calco sobre PDF, ángulos libres, sercha, tribuna y escenario como "estructura libre" | — |

**Total hasta una herramienta útil en producción (fin de la fase 2): unas 6 semanas. Completo: unas 11.**

## 3. Alcance de la maqueta interactiva

Es un **HTML standalone** (three@0.186.1 por import maps), sin Supabase ni datos reales. Se publica como artifact para probarla con 2–3 personas de la Oficina Técnica y 1 de Comercial.

### Qué tiene que permitir

1. Abrir la "Obra de ejemplo Paraná 631" con una plantilla precargada (22 ml "estimado"), además de la galería de 5 plantillas: pantalla, estructura + pantalla, fachada de bastidores, torre escalera y pórtico peatonal.
2. Formulario de chips: sistema, profundidad, plataformas y cubierta, con el 3D regenerando en vivo.
3. Frentes múltiples con ángulo de 90°, relleno de largo con chips de alternativa y esquina conmutable.
4. Manijas de largo y altura que saltan de a vano o de a nivel, con tipeo + Enter y conteo "+N vanos · +kg".
5. Alzado desplegado de celdas sincronizado con el 3D: selección, `O` para abertura con propuesta de viga puente, y pincel con 3 herramientas (abertura, sin plataforma, lona).
6. `T` y `P` con snap por puertos, fantasma, toast de verticales compartidas y unión visible en el árbol. El pórtico se puede poner "como base de la fachada".
7. Cambio multidireccional ↔ bastidor sobre la misma estructura, con el aviso de redondeo y el toggle kit o despiezado.
8. Lista de materiales en vivo con códigos ABA reales, barra inferior, toasts de reglas con "Deshacer", deshacer y rehacer, y exportar PNG.
9. Hover con ficha de pieza y vistas 1/2/3 con ViewCube.

### Qué se simula o falsea

- **Pesos:** son valores de ejemplo, rotulados "peso ilustrativo", y algunos códigos van "sin peso" a propósito para probar ese estado.
- **Stock:** inventado, con 2–3 faltantes forzados.
- **"Generar cómputo":** abre un modal con lo que se escribiría en `computo_items`; no persiste nada.
- **Reglas:** se usan valores ⚠ provisorios fijos.
- **Semáforo:** solo es geométrico (diagonales, anclajes, H/B, gálibo) y siempre dice "PREDIMENSIONADO". No hay M0x.
- **Geometría:** las piezas están simplificadas (tubos, discos y placas). Las zancas y la viga puente son representativas.
- **Fuera de la maqueta:** calco de PDF, ángulo libre, planta editable completa, persistencia y permisos.

### Preguntas de UX que responde

1. ¿La Oficina Técnica elige bien la plantilla (pantalla o estructura + pantalla) sin explicación?
2. ¿Alcanza el formulario corto? ¿Qué campo buscan y no encuentran?
3. ¿Editan en el alzado o intentan hacerlo en el 3D? Si el 3D no se usa para editar, queda como visor.
4. ¿Prefieren manija o tipeo, y leen bien "14,00 → 5×2,50 + 1,50"?
5. ¿Entienden el snap por puertos y notan qué unión se armó? ¿Saben cambiarla?
6. ¿Los toasts de reglas dan confianza o molestan? ¿Confían en dónde quedaron los anclajes y las diagonales?
7. ¿La lista se parece a un remito real de una obra conocida?
8. ¿El cambio a bastidor y el toggle kit o despiezado tienen sentido para logística?
9. ¿La imagen PNG le sirve tal cual a Comercial?
10. ¿Les hace falta una planta para quiebres, o alcanza con frentes tipeados?

### Criterios de éxito

- 2 de 3 personas de la Oficina Técnica, **sin explicación**, completan:
  - la fachada en L con abertura en menos de 2 min;
  - la torre escalera adosada en menos de 1 min;
  - el pórtico peatonal en menos de 1 min.
  En el segundo intento, menos de 3 min para los tres casos.
- En 5 segundos responden cuántas toneladas lleva la obra y qué falta en stock.
- Comercial usa el PNG sin retoques.
- Más de 50 fps con unas 5.000 piezas en la PC real de la oficina.
- Si el trazo o el snap generan más de 2 errores por persona, se rediseña ese paso antes de la fase 2.

## 4. Decisiones para JS

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | ¿Aprobás "Plantillas que encastran" como dirección? | **Sí.** El dibujo libre y el calco de PDF quedan para después |
| 2 | ¿El catálogo sale de Odoo/`catalogo_piezas` con un mapa editable, y no de Allround? | **Sí, sin excepción** |
| 3 | ¿El bastidor es de 1,30 × 1,80 (Odoo) o de 1,50 × 2,00 (skill de memoria)? ¿Qué compone exactamente un cuerpo? | Tomar **Odoo (1,30 × 1,80)** hasta que lo confirmes |
| 4 | ¿El cómputo de bastidor va por kit o despiezado por defecto? | **Kit** por defecto y despiezado opcional |
| 5 | ¿Dónde se guarda el modelo? | **`tec_modelos`** con `obra_id` nullable más `computos.modelo_id` (permite plantillas y modelar desde la cotización) |
| 6 | ¿Quién firma `tec_criterios` y la memoria, y con qué matrícula? | **Hougassian.** Hasta que firme, todo en "predimensionado" |
| 7 | ¿Al regenerar un cómputo editado a mano se reemplaza, se muestra la diferencia o se bloquea? | **Mostrar la diferencia.** Bloquear si el cómputo está completado |
| 8 | ¿Los veredictos M0x van en la v1? | **No.** Solo el semáforo geométrico; M03, M05 y M11 en la fase 4, corregidos |
| 9 | ¿El precio del alquiler sale del motor de Andamios OS y se descarta la tarifa de la otra app? | **Sí** |
| 10 | ¿Fecha y personas para el test de la maqueta? | 2–3 de la Oficina Técnica y 1 de Comercial, en la PC real |
| 11 | ¿Subimos Node a ≥ 22.18 en las máquinas de desarrollo? | **Sí**, antes de la fase 2 |

### Datos que faltan

1. **Peso real de cada código activo.** Hoy está vacío en Odoo.
2. **Largos confirmados del multidireccional:** ¿hay tablón de 0,73 o 1,09? ¿Se usa tablón de acero de 0,30 o plataforma con gancho?
3. **Ménsulas** disponibles, más allá de la de 0,45, y **vigas puente o de celosía** con sus luces.
4. **Criterios de armado:**
   - diagonales cada cuántos vanos;
   - grilla de anclajes con y sin media sombra;
   - distancia a fachada;
   - frecuencia de accesos;
   - altura máxima con ruedas.
5. **Composición tipo de la pantalla** de 3, 6 y 8 m, cómo es la bandeja y cómo va la media sombra.
6. **Normativa vigente:** RT-040505-020109-06 y lo que exige hoy la DGROC en altura libre y paso.
7. **10 obras reales con su remito** de entrega, para los tests golden.
8. **Mapeo pieza → código** y corrección de categorías (las riendas figuran como `anclaje`).
9. **Modelo de PC y GPU** de la Oficina Técnica.