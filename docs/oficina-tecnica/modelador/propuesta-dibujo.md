# Propuesta C: el modelador "Trazo", dibujo directo en planta y alzado

## Visión en 3 líneas
1. La Oficina Técnica dibuja lo que ve en la obra: la línea de fachada o la huella en planta, calcada sobre un plano, una foto o catastro. El andamio aparece solo, con piezas del parque real de ABA.
2. Cada tramo tiene su altura y cada vano se edita con la mano: se arrastran bordes, se pintan celdas y se agujerea donde hay una marquesina o un árbol.
3. Plantillas para lo de todos los días y lápiz para lo raro, sobre el mismo modelo, sin salir a CAD.

## Usuarios y trabajos a resolver
| Usuario | Trabajo |
|---|---|
| **Técnico de OT** (usuario principal) | "Tengo un PDF del plano y fotos de la obra: necesito el cómputo hoy." También retranqueos, ochavas, medianeras irregulares y pórticos sobre vereda. |
| **Responsable de OT / profesional firmante** | Revisar criterios (diagonales, anclajes, esbeltez) sin abrir pieza por pieza, y ver un predimensionado honesto. |
| **Comercial** (consumidor) | Recibir una imagen 3D y los m² o ml para la propuesta antes de cerrar la venta. |
| **Logística** (consumidor) | Recibir un cómputo con códigos Odoo reales para armar el remito. |

**Trabajo central:** pasar de "la obra como está" a cómputo, imagen y predimensionado en minutos. Lo raro (quiebres, ochavas, obstáculos) no puede obligar a dibujar pieza por pieza.

## Principio de diseño
**Se dibuja geometría de obra y el sistema genera andamio.** El usuario traza *ejes* (polilíneas en planta) y define *alturas por tramo*. La unidad editable es la **celda vano × nivel**, nunca el tubo. Las piezas sueltas solo se ven en un modo excepción. Esto evita el error de los modeladores "pieza a pieza" y conserva la flexibilidad de Avontus *Wall Scaffold* sin depender de un CAD.

## Flujo principal

### Caso 1: fachada de 22 m con quiebre a 90° y retranqueo, 15 m de alto. Objetivo: menos de 3 min
1. **0:00–0:20.** Desde la obra, "Diseñar andamio". Se abre el lienzo con `medidasDe()` precargado: tipo *estructura + pantalla*, 22 ml (estimado). Se arrastra el PDF del plano y se escala con dos clics sobre una cota conocida, tipeando `8,66`.
2. **0:20–1:00.** Con `F` se traza la línea de fachada: clic, se tipea `14` + Enter, se gira 90° con inferencia ortogonal, `1,20` (retranqueo), 90° otra vez, `8` + Enter. El sistema ya muestra 3 tramos con vanos de 2,50 y un vano de ajuste por tramo: "14,00 → 5×2,50 + 1×1,50".
3. **1:00–1:30.** Se arrastra la manija de altura del primer tramo hasta "15", con salto de a 0,50 y lectura en vivo "N7 · baranda a 15,00". Los otros tramos heredan. Al de 8 m se le baja la altura a 12 con doble clic + `12`.
4. **1:30–2:20.** En el alzado desplegado se pinta con `B` la abertura del local en PB (2 vanos × 2 niveles). El sistema propone "viga puente sobre la abertura" y se acepta con un clic. Se aplica media sombra a todo con el chip "Cubierta", y el toast avisa: "Densifiqué anclajes: +8 (viento con media sombra)".
5. **2:20–2:40.** La barra inferior muestra m², t, piezas, anclajes y el semáforo de predimensionado. "Generar cómputo".

**Esquinas:** en cada quiebre el sistema resuelve solo, según la regla de "criterios ABA" (vertical compartida o vano de giro de 0,73). Un ícono en planta permite alternar la variante.

### Caso 2: torre de escalera adosada, 2,50 × 1,50, 15 m. Objetivo: menos de 1 min
1. Con `T` la plantilla "Torre escalera" queda pegada al cursor. Se suelta sobre la planta pegada al tramo 1, y el snap a eje de fachada la alinea.
2. El panel pide tres datos: altura (hereda 15), nivel de desembarco ("todos" o lista) y anclada a fachada (sí).
3. El sistema genera las zancas con descansos, las barandas de escalera, las diagonales en todas las caras y la **fusión de verticales** con la fachada. El aviso dice: "Comparte 2 verticales con Fachada T1", para que el cómputo no cuente de más.

### Caso 3: pórtico peatonal sobre vereda, 6 ml, paso libre de 2,50 m o más. Objetivo: menos de 1,5 min
1. Con `P` se arrastra un rectángulo sobre la vereda en planta, de la línea municipal al cordón.
2. Se elige el sistema con un chip: **bastidor de paso peatonal 1,30 × 2,50** (por defecto) o multidireccional con viga puente.
3. El sistema valida que la altura libre sea de 2,50 o más y el ancho de paso de 1,20 o más (Res. 88/22). Genera la bandeja de fenólico, las esferas y el recubrimiento de verticales. Si el pórtico queda bajo la fachada, ofrece "usar como base de Fachada T1" y la fachada arranca sobre el pórtico.

## Layout de pantalla (1920×1080)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◄ Obra S01234 · Paraná 631   [Planta|Alzado|3D]  Sistema: ◉Multi ○Bastidor  │
│ Plantillas: [Fachada][Torre][Torre esc.][Pórtico][Pantalla]  Ctrl+K ⌕  ↶ ↷  │
├────┬───────────────────────────────────────────────┬─────────────────────────┤
│ V  │  PLANTA (grande)                              │ PROPIEDADES (selección) │
│ F  │   ░░ plano PDF calcado ░░                     │ Tramo T2 · 1,20 m · 90° │
│ T  │   ━━━━━━━━━━━━━━━━┓T1 14,00                   │ Altura   [ 15,00 ] m    │
│ P  │                   ┃T2 1,20                    │ Ancho    (0,73)(1,09)   │
│ K  │   [Torre]▣        ┗━━━━━━━━ T3 8,00           │ Vanos  2,50×5 + 1,50    │
│ O  │   ▭▭▭ pórtico (vereda)                         │ Niveles  c/2 m · 1 fila │
│ B  │  ─────────────── línea municipal ───          │ Cubierta [media sombra] │
│    ├───────────────────────────┬───────────────────┤ ● 2 overrides  [Reset]  │
│ 📷 │ ALZADO desplegado T1│T2│T3│ 3D (r3f, demand)  ├─────────────────────────┤
│    │ ┌┬┬┬┬┬┐┌┐┌┬┬┬┐            │    ╱│╲ iso         │ LISTA DE MATERIALES     │
│    │ ├┼┼┼┼┼┤├┤├┼┼┼┤  ← celdas  │   ╱ │ ╲            │ VERT-200-CE   84  ▲     │
│    │ ├┼▓▓┼┼┤├┤├┼┼┼┤  ▓ abertura│  (hover = ficha)  │ HOR-048-250  212        │
│    │ └┴┴┴┴┴┘└┘└┴┴┴┘            │                   │ DIAG-200x250  36  sin kg│
│    │  N1..N7  · V1..V12        │                   │ [+ ajuste manual]       │
├────┴───────────────────────────┴───────────────────┴─────────────────────────┤
│ 312 m² · 8,4 t* · 1.947 pzs · 22 anclajes · M03 ● M05 ○ M11 ●  PREDIMENS.    │
│                                [Imagen propuesta]   [ Generar cómputo ▸ ]     │
└──────────────────────────────────────────────────────────────────────────────┘
 * peso parcial: 14 códigos sin peso
```

`Tab` alterna cuál de las tres vistas es la grande. La selección se comparte entre las tres.

## Modelo de datos
```
tec_modelos(id, obra_id NULL, cotizacion_id NULL, nombre, es_plantilla,
            modelo jsonb, modelo_version, imagen_url, created_by, updated_at)
computos.modelo_id → tec_modelos.id
tec_pieza_mapa(familia, largo_m, sistema) → codigo (catalogo_piezas)
tec_criterios(clave, valor, firmado_por, fecha)   -- "criterios ABA" editables

Modelo {
  referencias[]: {tipo: pdf|imagen, escala, origen, rotación, opacidad}
  contexto: {terreno, en_vereda, ancho_vereda, clase_carga, cubierta_global}
  estructuras[]: {
    id, tipo: fachada|torre|torre_escalera|portico|pantalla|libre,
    sistema: multi|bastidor,                // por estructura (R5)
    eje: Polilínea[{x,y}],  tramos[]: {altura, ancho, retiro, lado}
    vanos?: number[] (m, por tramo; si falta → autocompletar)
    niveles: {paso, rol_por_nivel}
    esquinas[]: {vertice_i, variante}
    huecos[]: {tramo, vano_desde/hasta, nivel_desde/hasta, solucion}
    overrides: {"t:v:n": {plataforma, diagonal, anclaje, mensula, ...}}
    apoya_en?: estructura_id                // pórtico como base
  }
}
construir(Modelo) → Pieza[] → fusión de nodos (hash mm) → BOM / 3D / SVG / entradas Mxx
```
Se guardan **metros y códigos, nunca índices de array**, para no repetir el bug de los escenarios viejos.

## Multidireccional y bastidores
- **El mismo trazo y otro constructor.** El eje, las alturas y los huecos son comunes, y el `sistema` cambia `construir()` y las reglas de snap.
- **Multidireccional:** vanos del catálogo **real de ABA** (2,50 / 2,00 / 1,50 / 1,25 / 1,09 / 0,73), niveles cada 0,50, rosetas y diagonales "2,00 × vano". Se ajusta con un vano de relleno.
- **Bastidores:** cuerpos STD de 2,50 o JR de 1,50 y alto de 1,80 (por confirmar contra el "1,50 × 2,00" de la skill). No hay vano de ajuste: el largo se redondea y se avisa con "sobran 0,40 m". El remate es el bastidor baranda de 1,00.
- **Kits:** el BOM sale **como kit** (`MOD-AND-STD-…`) o **despiezado** (bastidores, riendas H/D, tablones), según un toggle.
- **Mezcla:** el sistema es por estructura. Por ejemplo, un pórtico de bastidor de paso puede llevar arriba una fachada multidireccional.

## Reglas automáticas
Todas se leen de `tec_criterios` y se marcan ⚠ hasta que las firme el profesional.
- **Relleno de largo:** vanos de 2,50 más uno de ajuste al final o centrado, con 2–3 alternativas en chips. Aviso si el error pasa los 10 cm.
- **Altura:** último nivel de trabajo a H − 1,00, empalmes escalonados y nivel de arranque a 0,20–0,40.
- **Protección:** doble baranda y rodapié en cada lado abierto. El lado de fachada queda libre si el retiro es de 0,30 o menos, y los laterales se cierran siempre.
- **Diagonales:** en los vanos extremos y al menos cada 5 vanos, con sentido alternado. En el plano transversal, en las caras extremas.
- **Anclajes:** grilla al tresbolillo cada 2 vanos × 2 niveles, densificada con media sombra o lona. Siempre en el último nivel y en los extremos.
- **Accesos:** escotilla en el vano de acceso, uno cada 20–30 m de frente.
- **Esquinas, huecos y obstáculos:** la variante sale de la regla y la solución se propone (puente, ménsula o retiro).
- **Esbeltez:** en estructuras libres con H/B mayor a 3 se propone ensanche, pata de gallo o anclaje.
- **Vía pública:** paso libre de 2,50 o más, circulación de 1,20 o más, recubrimiento de verticales y esferas.
- **Prevención, propagación y reparación:** las manijas solo saltan a medidas válidas, y cada regla que agrega piezas lo dice con un toast que se puede deshacer.

## Salidas
1. **Lista de materiales en vivo** por código Odoo, con kg (marcando "sin peso"), semáforo de stock (`stock.en_deposito`) y ajuste manual que no toca el modelo.
2. **Generar cómputo** en `computo_items`, con `origen` = modelo o manual y la diferencia visible al regenerar. Bloqueado si el cómputo está completado.
3. **Imagen** PNG 3× en iso, con fondo limpio y encuadre comercial. **Lámina PDF** (react-pdf) con iso, alzado y planta en SVG con cotas, y la lista de materiales.
4. **Verificaciones** como "PREDIMENSIONADO": arrancan por las reglas geométricas, y M03, M05 y M11 entran solo cuando estén portados y corregidos (M05 y M07 fallan cerrado). Siempre se muestran la norma y los supuestos.
5. **Al cotizador:** m², ml y frentes[] para `EntradaFachada`, o una lista de piezas para `cotizarAlquiler`. El modelador no pone precios.

## Integración con Andamios OS
- **Ruta:** `/oficina-tecnica/modelador/[modeloId]`, en una página `"use client"` que carga el lienzo con `dynamic(..., {ssr:false})`, el patrón de mapa-obras.
- **Lógica pura** en `src/lib/tecnica/modelo/*` con `node --test`, y el store en zustand + immer.
- **Puntos de entrada:** el botón "Diseñar andamio" en la obra, en el cómputo y en la cotización (modelo sin obra, que se vincula después).
- **Permisos:** nuevo módulo `modelador` en `DEFINICION`, escrituras por API con `exigirModulo` y RLS de `computos` alineada.
- **Catálogo:** `catalogo_piezas` más `tec_pieza_mapa`, editable por OT. Las piezas sin código se ven en ámbar.
- **Remito desde cómputo:** queda como fase siguiente, pero sale directo de este flujo.

## MVP en fases
| Fase | Alcance | Estimación |
|---|---|---|
| **0. Datos** | Subir Node a 22.18 o más; auditar pesos y códigos; `tec_pieza_mapa`; confirmar bastidor, criterios y 10 remitos golden | 3–4 d (más tiempo de JS) |
| **1. Núcleo** | Trazo de polilínea con inferencias y largo tipeado, alturas por tramo, `construir()` multidireccional, esquinas a 90°, alzado de celdas, 3D instanciado, lista en vivo, deshacer | 2,5 sem |
| **2. Obra real** | Calcar PDF o imagen con escala, huecos y obstáculos, plantillas de torre, torre escalera y pórtico peatonal, fusión de nodos, generar cómputo, PNG | 2 sem |
| **3. Bastidores** | Constructor de bastidor, kits o despiece, sistema por estructura, pórtico como base | 1,5 sem |
| **4. Salida y cálculo** | Lámina PDF, M03, M05 y M11 corregidos y en predimensionado, imagen en la propuesta, esquinas a ángulo libre | 1,5–2 sem |

**Total hasta producción útil: unas 8 semanas.** La fase 1 ya resuelve fachadas con quiebres.

## Riesgos
1. **El dibujo exige destreza de CAD.** Se mitiga con inferencias visibles, largo tipeado y plantillas que no piden dibujar (torre y pórtico se sueltan, no se trazan). Si en la maqueta el trazo tarda más que llenar un formulario, se invierte la prioridad.
2. **Esquinas y uniones entre estructuras.** Es el mayor riesgo de cómputo (verticales duplicadas). Se mitiga con la fusión de nodos y tests golden contra remitos reales.
3. **Catálogo y pesos.** Las medidas de ABA no son las de Layher y los pesos están vacíos, así que sin la fase 0 la lista es ilustrativa.
4. **Calco de plano.** Los PDF vienen sin escala o torcidos, por eso la escala por dos puntos y la rotación son obligatorias. El DXF queda fuera del MVP.
5. **Falsa seguridad del cálculo.** Se mitiga con el sello "predimensionado" y fallo cerrado.
6. **Alcance hacia un "Revit de andamios".** Se mitiga con el modo pieza a pieza escondido y limitado a overrides.
7. **Rendimiento en la PC de la oficina.** Se mitiga con InstancedMesh, `frameloop="demand"` y LOD de rosetas. Hay que confirmar la GPU real.

## Qué validaría con la maqueta interactiva
Sería un HTML standalone con datos de ejemplo y sin Supabase, probado con 2–3 técnicos de OT y cronómetro.

1. **El trazo sirve o estorba.** Fachada en L con retranqueo: trazada contra la misma fachada armada con plantilla y tecla `K`. La meta es menos de 3 minutos sin ayuda.
2. **Calcar sobre PDF.** Escalar y trazar sobre un plano real de ABA. Mediría si entienden la escala por dos puntos.
3. **Alzado de celdas como superficie principal.** Pintar abertura, media sombra y "sin plataforma". Mediría si prefieren el alzado o el 3D para editar.
4. **Tipear mientras se arrastra y relleno de largo con chips.** Mediría si leen bien "14,00 → 5×2,50 + 1,50".
5. **Soltar torre escalera y pórtico.** Ver si el snap al eje y la fusión de verticales se entienden, y si el pórtico como base es intuitivo.
6. **Toasts de propagación.** Mediría si "Agregué 8 anclajes" genera confianza o molestia.
7. **Barra inferior y lista.** Mediría si en 5 segundos saben cuántas toneladas lleva y qué falta en stock.
8. **Cambio a bastidor.** Ver si el aviso "sobran 0,40 m" es claro y si el toggle kit o despiece tiene sentido para logística.

**Criterio para avanzar:** 2 de 3 técnicos completan los tres casos en menos de 6 minutos en total y sin explicación, y eligen el trazo para la fachada con quiebre.