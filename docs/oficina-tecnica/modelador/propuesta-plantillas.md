# Propuesta: Modelador ABA, con plantillas y parámetros primero

## Visión

1. Elegís qué vas a armar (fachada, torre o pórtico), completás 3 a 6 datos y el andamio sale generado con todos sus accesorios.
2. Lo que se edita son parámetros y celdas (vano × nivel), nunca tubos sueltos. Lo hecho a mano se conserva al regenerar.
3. Del mismo modelo salen el 3D, el cómputo con códigos de Odoo, la imagen para la propuesta y, cuando estén corregidas, las verificaciones.

## Usuarios y trabajos a resolver

| Usuario | Trabajo | Hoy | Meta |
|---|---|---|---|
| Oficina Técnica (principal) | Pasar de la venta a un cómputo confiable | Planilla, cálculo a mano, `/api/ai/computo` que adivina | Menos de 2 min para una fachada simple, menos de 5 para una combinada |
| Oficina Técnica | Resolver lo no estándar (quiebre, abertura, pórtico) | Croquis a mano | Celda o plantilla, sin CAD |
| Comercial | Imagen y m² para la propuesta antes de cerrar la venta | No hay | Modelo sin obra, con PNG en 1 clic |
| Logística / depósito | Saber qué cargar y si hay stock | Remito armado a ojo | Semáforo de stock y, después, remito desde el cómputo |
| Profesional firmante (Hougassian) | Validar criterios y cálculo | Memoria aparte | Tabla de criterios ABA editable y veredictos con la norma a la vista |

## Flujo principal

El arranque es igual para todo: en la obra o en el cómputo, el botón **"Diseñar andamio"** abre la galería de plantillas con la tipología sugerida por `x_trabajo_obra` y las medidas precargadas con `medidasDe()`, marcadas como "(estimado)". Nunca se arranca de una pantalla vacía.

### A. Fachada con un quiebre en L, estructura + pantalla, 18 m de alto: unos 90 s

1. **0:00–0:10.** Plantilla "Estructura + pantalla". Viene precargada con 22 ml de la venta.
2. **0:10–0:35.** Formulario corto:
   - frentes: `14` y `8`, ángulo 90°;
   - altura: `18`;
   - profundidad: 0,73 o 1,09, en chips;
   - plataformas: "cada 2 m" o "1 fila";
   - cubierta: nada, media sombra o lona.

   Cada dato regenera el 3D al instante.
3. **0:35–0:50.** El generador:
   - rellena cada frente con vanos de 2,50 más uno de ajuste. Por ejemplo, 14 m da 5 × 2,50 + 1 × 1,50. Muestra chips de alternativa ("vanos iguales", "menos piezas");
   - resuelve la esquina compartiendo la vertical;
   - pone niveles, barandas, rodapiés, diagonales, anclajes, accesos y la bandeja en planta baja.
4. **0:50–1:20.** Excepción: en el alzado seleccionás 2 vanos × 2 niveles sobre la entrada del local y apretás `O`. El sistema anula esas celdas y propone una viga puente arriba. Se acepta con un clic.
5. **1:20–1:30.** Revisás la barra inferior (m², t, piezas, anclajes, semáforo) y apretás **"Generar cómputo"**.

### B. Torre de escalera adosada a la fachada A: unos 45 s

1. `T` y elegís "Torre escalera". La plantilla queda en el cursor.
2. Hacés clic al costado del frente de 8 m. Se imanta al extremo y comparte las verticales con la fachada (fusión de nodos).
3. Completás 3 datos: planta 2,50 × 1,50 (descanso), altura 18 y desembarco "en cada nivel de la fachada".
4. El sistema genera las zancas, las barandas de escalera, las diagonales en todas las caras y las conexiones con la fachada. Agrega una línea al cómputo.

### C. Pórtico peatonal sobre vereda, 10 ml: unos 40 s

1. `P` y elegís "Pórtico peatonal".
2. Completás los datos: ml `10`, sistema bastidor (paso peatonal 1,30 × 2,50) o multidireccional, altura libre ≥ 2,50 y "estructura arriba: no".
3. El sistema genera los bastidores de paso, la bandeja de fenólico, las esferas y el recubrimiento de verticales hasta 2 m.
4. Valida la altura libre y el paso de 1,20 m o más. Si no da, ofrece "subir a 2,50" con un clic.

Combinación típica: pantalla (1) + pórtico de acceso a garaje (9). Las estructuras comparten la misma planta y cada una tiene su sistema.

## Layout de pantalla

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◂ Obra S01234 · Av. Corrientes 1234 (estimado)   [Plantillas] [Ctrl+K]  ↶ ↷  │
├───────────────┬─────────────────────────────────────┬────────────────────────┤
│ ESTRUCTURAS   │                                     │ PROPIEDADES            │
│ ▸ Fachada L ● │          VISTA 3D (iso)             │ Fachada L · multi      │
│ ▸ Torre esc.  │       ┌──┬──┬──┬──┬──┐             │ Frentes  14 ⟂ 8  m     │
│ ▸ Pórtico     │       │  │  │  │  │  │◂ manija     │ Altura   18 m          │
│ + Agregar     │       ├──┼──┼──┼──┼──┤  (+vano)    │ Prof.  [0,73][1,09]    │
│               │       │  │▒▒│▒▒│  │  │             │ Plataf.[cada 2m][1 fila]│
│ PLANTILLAS    │       └──┴──┴──┴──┴──┘             │ Cubierta [—][malla][lona]│
│ ▢ Fachada     │                       [1][2][3] cubo│ Anclajes  auto ▾       │
│ ▢ Torre       ├─────────────────────────────────────┤ ● 2 ajustes manuales   │
│ ▢ Pórtico     │  ALZADO DE CELDAS (frente 1 ▾)      ├────────────────────────┤
│ ▢ Pantalla    │  N9 ░░░░░░░░░░░░                    │ LISTA DE MATERIALES    │
│ ▢ Bastidores  │  …                                  │ VERT-300-CE   48  ⚠stk │
│               │  N1 ░░▒▒▒▒░░░░░░  ▒=abertura         │ HOR-048-250  212       │
│               │     V1 V2 V3 V4 V5 V6               │ … [+ ajuste manual]    │
├───────────────┴─────────────────────────────────────┴────────────────────────┤
│ 396 m² · 9,8 t · 2.140 piezas · 34 anclajes · M03 ● M05 ○ M11 ● predimens.  │
│                                     [Imagen propuesta]  [GENERAR CÓMPUTO]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Se usan los tokens de Andamios OS (coral `--primary`, DM Sans y JetBrains Mono). Los paneles son de "vidrio oscuro" como en Ciudad Armada. Es solo para escritorio.

## Modelo de datos

```
Diseno { id, obra_id?, cotizacion_id?, version, autor, contexto, estructuras[], ajustes_bom[] }
 contexto: terreno, en_vereda, ancho_vereda, clase_carga (3), zona_viento, cubierta_global
Estructura { id, plantilla, sistema: multi|bastidor, origen, rumbo, params{…}, overrides[] }
  params (según plantilla): frentes[{largo, angulo}], altura, profundidad,
          modo_plataforma, cubierta, accesos, luz/altura_libre (pórtico) …
  overrides: [{celda:[frente,vano,nivel], cambio:{abertura|sin_plataforma|mensula|lona|anclaje±}}]
construir(Diseno) → Pieza[] {id, codigo, tipo, a, b, estructura_id, celda, primitivas[]}
              → fusionarNodos() → BOM {codigo, cant, kg, kit?} · vistas2D · entradas Mxx
```

- **Persistencia:** tabla `tec_modelos` con `obra_id` nullable y `es_plantilla`, más `computos.modelo_id`. Hacen falta plantillas guardadas ("Torre esc. 2,50×1,50×10") y diseños sin obra para que Comercial cotice.
- **Referencias:** el JSON guarda **códigos de pieza y metros, nunca índices**. Es el bug de los escenarios viejos.
- **Ítems de `computo_items`:** llevan `origen` (modelo o manual) para mostrar las diferencias al regenerar.

## Multidireccional y bastidores

- **El sistema es por estructura, no por proyecto.** Se puede tener una fachada multidireccional con un pórtico de bastidores. La UI es la misma y cambia el constructor.
- **Multidireccional ABA (Coronet, no Layher):**
  - vanos de 0,73, 1,09, 1,25, 1,50, 2,00 y 2,50, con 2,50 por defecto;
  - niveles con paso de 0,50;
  - verticales de 0,5 a 3 m con empalmes escalonados;
  - diagonales "2,00 × vano".
- **Bastidores:**
  - cuerpos de 2,50 (STD) o 1,50 (JR) y altura en múltiplos de 1,80 (paso peatonal: 2,50);
  - remate con bastidor baranda de 1,00 y riendas H/D como crucetas;
  - **sin vano de ajuste:** el largo se redondea y se avisa la diferencia;
  - el BOM sale como **kit** (`MOD-AND-STD-130x250x180`) o despiezado, a elección.
- **El catálogo sale de `catalogo_piezas`/Odoo**, a través de una tabla `tec_pieza_mapa(tipo, largo, sistema) → codigo` que edita la Oficina Técnica. Nada de largos Allround hardcodeados.

## Reglas automáticas

Todas viven en una tabla **"Criterios ABA"** editable y firmada por el profesional. Las marcadas con ⚠ están pendientes de confirmar.

- **Relleno de largo:** vanos de 2,50 más uno de ajuste (al final o centrado). Si el desvío pasa de unos 10 cm, aviso.
- **Altura:** el último nivel de trabajo queda a H − 1,00 y el arranque a 0,20–0,40 sobre el tornillón.
- **Protección:** doble baranda más rodapié en todo lado abierto. El lado de fachada queda libre si la distancia es ≤ 0,30 ⚠.
- **Accesos:** escalera interna con escotilla, uno cada 20–30 m de frente ⚠.
- **Diagonales:** en los vanos extremos y una cada 5 vanos ⚠, en todos los niveles y alternando el sentido. Diagonal en planta en el arranque y bajo los pórticos.
- **Anclajes:** grilla al tresbolillo (unos 12 m² por anclaje, mínimo 5), siempre en el último nivel y en los extremos. Con lona o malla se densifica y aparece un toast explicando por qué, con "Deshacer".
- **Esbeltez:** si una estructura libre supera H/B > 3, se ofrece "ensanchar", "pata de gallo" o "anclar" con un clic.
- **Vía pública:** altura libre ≥ 2,50, paso ≥ 1,20 y recubrimiento de verticales hasta 2 m.
- **Combinaciones:** fusión de nodos entre estructuras para no contar verticales de más.

El principio es que lo inválido sea **imposible por construcción**, que lo que se agrega solo **se explique** y que cada error **traiga su reparación**.

## Salidas

1. **BOM / cómputo en vivo:**
   - agrupado por código de Odoo, con kg (o "sin peso" visible);
   - semáforo de stock contra `stock.en_deposito`;
   - "+ ajuste manual" para reposición, sin tocar el modelo;
   - "Generar cómputo" escribe `computo_items`.
2. **Imagen:** PNG 3× en iso 3/4 con fondo blanco, a Storage, para el PDF del cotizador. Una lámina PDF con iso, alzado SVG y BOM viene en la fase 3.
3. **Métricas para el cotizador:** m² y ml por frente (`EntradaFachada.frentes[]`, `EntradaBandeja`) o una lista de piezas para alquiler puro. **El modelador no pone precios.**
4. **Verificaciones:** al principio, solo un **semáforo geométrico** (anclajes, diagonales, esbeltez y gálibo). M03, M05 y M11 entran portados con los bugs corregidos y siempre con la etiqueta **"predimensionado"** hasta que haya firma. Ante NaN o una entrada inválida, fallan cerrado.

## Integración con Andamios OS

- **Ruta y permisos:** `/oficina-tecnica/modelador`, con el módulo `modelador` en `DEFINICION` y escritura vía API con `exigirModulo`. Así se evita la RLS de `computos` atada a `get_user_role()`.
- **Página:** `"use client"` con `dynamic(..., { ssr:false })`, mismo patrón que `mapa-obras/page.tsx`.
- **Modelo:** TS puro en `src/lib/tecnica/modelo/`, con tests `node --test` y casos golden contra remitos reales.
- **Stack:** `three@0.186.1`, `@react-three/fiber@9.8.1` y `@react-three/drei@10.7.9`. El estado va en zustand + immer, que ya están instalados.
- **Entradas:** "Diseñar andamio" desde la obra, desde el cómputo y desde la cotización (sin obra).
- **Reemplazo:** sustituye a `/api/ai/computo`.

## MVP en fases

| Fase | Alcance | Estimación |
|---|---|---|
| **0. Prerrequisitos** | Subir Node a ≥ 22.18; auditar `peso_kg` y códigos; cargar el mapa pieza → código; conseguir 10 remitos reales; criterios ABA en borrador | 3–4 días (más el tiempo de JS y Hougassian) |
| **1. Maqueta** | Ver abajo | 3 días |
| **2. MVP v1** | Plantillas: estructura + pantalla (con frentes en L), pantalla sola, estructura sin pantalla, torre escalera y pórtico peatonal. Multidireccional. Alzado de celdas con `O`, BOM en vivo, generar cómputo, PNG, semáforo geométrico, `tec_modelos` | 3–4 semanas |
| **3. Bastidores y combinadas** | Constructor de bastidores (kits), fachada de bastidores, torre móvil, fusión de nodos, plantillas guardadas, lámina PDF, imagen en la propuesta | 2–3 semanas |
| **4. Cálculo y logística** | M03/M05/M11 corregidos y adaptados, pórtico vehicular (M08), ménsulas (M09), remito desde cómputo, diferencias al regenerar | 2–3 semanas |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Modelar Layher en vez del stock real | Catálogo solo desde Odoo y `tec_pieza_mapa` |
| Pesos vacíos: tonelaje falso | Mostrar "sin peso" en lugar de inventar; carga de pesos desde el modelador |
| La plantilla queda chica ("solo lo predefinido") | Overrides por celda, `O` para abertura y modo "estructura libre" celda a celda |
| Regenerar pisa ediciones o el cómputo | Overrides direccionados por celda; diferencias al regenerar; bloqueo si el cómputo está completado |
| Veredictos con bugs dan falsa seguridad | Solo semáforo geométrico en v1; los Mxx entran corregidos y como "predimensionado" |
| Uniones entre estructuras cuentan de más | Fusión de nodos y tests golden |
| Criterios sin firma | Tabla editable firmada; ⚠ visibles en la UI |
| El alcance se va hacia un "Revit de andamios" | Sin edición pieza a pieza en v1 |
| Rendimiento en la PC de la oficina | InstancedMesh, `frameloop="demand"`, LOD de rosetas |

## Qué validaría con la maqueta interactiva

La maqueta es standalone, sin Supabase, con catálogo y pesos de ejemplo pero con largos ABA reales.

1. **¿Se elige bien la plantilla?** Mostrar la galería y ver si la OT encuentra "pantalla" frente a "estructura + pantalla" sin explicación.
2. **¿Alcanza el formulario corto?** Contar cuántos campos tocan y cuáles buscan y no están.
3. **Los tres flujos con cronómetro:** fachada en L con abertura, torre de escalera adosada y pórtico peatonal. Metas: menos de 2 min, menos de 1 min y menos de 1 min, sin ayuda.
4. **¿El alzado de celdas se entiende como superficie de edición?** ¿Usan `O` o buscan dibujar en el 3D?
5. **¿Confían en lo automático?** Preguntarles si ven bien colocados los anclajes, las diagonales y los accesos, y si el toast explicativo alcanza.
6. **¿La BOM se parece a un remito real?** Comparar contra 1 o 2 obras conocidas.
7. **¿Sirve el cambio de sistema** multidireccional ↔ bastidor sobre la misma estructura?
8. **¿La imagen PNG sirve tal cual para Comercial?**

Probaría con 2 o 3 personas de la OT y 1 de Comercial. Mediría tiempos, clics y puntos de traba, y rediseñaría el paso donde la mediana pase la meta.