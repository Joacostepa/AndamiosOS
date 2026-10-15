## Informe: cómo encaja el modelador en Andamios OS y qué se puede reusar de Oficina Técnica ABA

### 0. Tres cosas que cambian lo que se había propuesto

1. **El multidireccional de ABA no es Layher Allround.** El catálogo real (`supabase/migrations/20260331000010_import_productos_odoo.sql`) tiene:
   - horizontales Ø48,3 de 0,73 / 1,09 / 1,25 / 1,50 / 2,00 / 2,50 m (`HOR-048-*`);
   - verticales de 0,50 a 3,00 m, con y sin espiga (`VERT-*-CE/SE`);
   - diagonales por color, de 2,00 × vano (`DIAG-200x073` … `DIAG-200x250`);
   - piezas Q235 HDG ("Coronet"): rosetas móviles, puños, chavetas.

   En cambio, `oficina-tecnica-aba/src/lib/calc/catalog/medidas.ts` usa los largos de Allround (`STD: [0.73, 1.09, 1.4, 1.57, 2.07, 2.57, 3.07]`), y `layher.ts` toma las cargas admisibles de las tablas de Layher. El modelador tiene que salir de **los largos que ABA tiene en stock**, no de Allround. Las admisibles de M08 hay que revalidarlas para este material.

2. **El sistema de bastidores ya está en el catálogo, y viene en kits.**
   - Bastidores sueltos: `BAST-AND-130x180`, `BAST-PAS-090x180`, `BAST-PEA-130x250`, barandas `BAST-BAR-*`.
   - Módulos armados: `MOD-AND-STD-130x250x180`, `MOD-AND-JR-130x150x180`, `MOD-PEA-*` (paso peatonal), `MOD-BAR-*`.
   - Riendas: `RIEND-250-H/D`, `RIEND-150-H/D`, que hacen de crucetas.
   - Complementos: ruedas, tornillones de base fija y móvil.

   Esto pide un modelo con **kits**: el usuario coloca un "módulo" y el cómputo puede salir como kit o despiezado.

3. **Las ventas de Odoo no traen medidas confiables.** `src/lib/mapa-obras/medidas.ts:3-6` lo dice así: "`x_permiso_altura` está en 0 en todas las ventas (12/10/2026)". Las medidas solo están como texto libre en `x_estructura_actual` ("Pantalla 9m x 1,25m x 2,50m H a 90°"). Lo que sí hay es `x_permiso_metros_lineales` y un tipo de trabajo inferido: `pantalla_proteccion | estructura_pantalla | estructura_sin_pantalla | torre | plataforma | sercha | apuntalamiento_vertical` (`src/lib/mapa-obras/tipos.ts`). La precarga "desde la venta" tiene que reusar `medidasDe()` y avisar con "(estimado)", no leer `x_permiso_*` directo.

---

### 1. Mapa de integración

#### Qué lee el modelador

| Dato | Fuente | Observaciones |
|---|---|---|
| Obra, cliente, dirección | `obras` (`odoo_obra_id`, `cotizacion_id`) vía `useObra` (`src/hooks/use-obras`) | Ya lo usa el editor de cómputo |
| Medidas iniciales y tipo de trabajo | `src/lib/mapa-obras/medidas.ts` (`medidasDe`), `src/lib/odoo/mapa-obras.ts:57` (`x_estructura_actual`, `x_trabajo_obra`, `x_permiso_metros_lineales`) | Es puro y tiene tests. Marca `estimadas: true` |
| Línea municipal y orientación de la fachada | `src/lib/mapa-obras/fachada.ts` (solo en el servidor, cacheado) | Opcional: servirá para ubicar la obra o para un render "en contexto" |
| Piezas, códigos y pesos | `catalogo_piezas` (`codigo`, `categoria`, `sistema_andamio` multidireccional/tubular, `peso_kg`, `odoo_product_id`) vía `useCatalogo` | Ver riesgo R2: `peso_kg` sale de `product.weight` de Odoo y "hoy los productos vienen planos (sin código, sin categoría, sin peso)" (`src/lib/odoo/products.ts:5`) |
| Stock disponible | `stock` (`en_deposito`, `comprometido`) | Sirve para el semáforo "¿tenemos el material?". `computo_items.cantidad_disponible` ya existe y hoy no se usa |
| Tarifas | `src/lib/cotizador/tarifas.ts` + Parámetros de cotización | El modelador **no pone precios**. El motor es el único que hace cuentas (`src/lib/cotizador/tipos.ts:3-9`) |

#### Qué escribe

- **Cómputo:** `computos` (1 por obra, `obra_id NOT NULL`, más las columnas `tipo_sistema_andamio`, `altura_maxima`, `metros_lineales`, `superficie` de `20260620000007_computo_directo_obra.sql`) y `computo_items(pieza_id, cantidad_requerida)`. Es lo mismo que hace `useSaveComputoItems` (`src/hooks/use-computos`).
- **Entradas del cotizador:** `EntradaFachada.frentes[]` y `altura` (`src/lib/cotizador/fachada.ts:24`), `EntradaBandeja` (ml), o una lista de piezas para `cotizarAlquiler` (`PiezaDeLista`, `src/lib/cotizador/alquiler.ts:10`). El m² que hoy se carga a mano sale directo del modelo.
- **Imagen PNG** para la propuesta. Se guarda en Storage y se referencia desde el PDF de `src/lib/cotizador/pdf/documento.ts` (react-pdf). Hay que ver si el documento admite imagen; hoy no hay ninguna.

#### Dónde se guarda el modelo

- **Opción A (recomendada para empezar): `computos.modelo jsonb` + `computos.modelo_version int`.**
  - A favor: hoy hay un cómputo por obra y `proyectos_tecnicos` se borró a propósito ("Oficina Técnica trabaja Obra → Cómputo, sin paso intermedio"). Por eso un modelo = un cómputo, `computo_items` queda derivado y `balance-material` (`src/hooks/use-balance-material.ts`, que toma "el último cómputo de la obra") sigue funcionando igual.
  - En contra: no se pueden tener variantes (A/B, por fases) ni una biblioteca de plantillas.
- **Opción B: `tec_modelos(id, obra_id null, computo_id null, nombre, es_plantilla, modelo jsonb, version, imagen_url, created_by…)`.** Usa el prefijo `tec_` que pide el handoff (§4). Permite plantillas reutilizables ("Torre escalera 2,50 × 1,50 × 10 m", "Pórtico peatonal 2 vanos") y modelos sin obra (para cotizar antes de cerrar la venta). "Generar cómputo" escribe `computo_items` y deja `computos.modelo_id`.
- **Recomendación:** si las plantillas son centrales para que el modelador sea ágil (y lo son), ir directo a **B**, con `computos.modelo_id` como vínculo. El JSON tiene que guardar **códigos de pieza y medidas en metros**, nunca índices sobre arrays (es el bug de los escenarios del handoff §3: "las entradas son índices sobre STD/VARM").

#### Permisos

El modelo es por persona: `user_profiles.permisos` es un mapa módulo → "ver"/"editar" (`src/lib/auth/acceso.ts:1-14`). El proxy (`src/proxy.ts`) bloquea las rutas según `DEFINICION`.

- Hay que agregar `{ id: "modelador", titulo: "Modelador", grupo: "Oficina técnica", rutas: ["/oficina-tecnica/modelador"] }` (o colgarlo de `computos` con `incluidoEn`).
- Las APIs usan `exigirModulo([...], "editar")` (`src/lib/auth/servidor.ts:43`).
- La RLS de `computos` sigue con `get_user_role() IN ('admin','operativo')` (`20260331000001_fase2_schema.sql:251-253`), desalineada del modelo por módulo. Si alguien con permiso `computos:editar` no es operativo, el insert falla. **Hay que alinearla** o escribir desde una ruta de servidor.

---

### 2. Flujo de punta a punta

1. **Venta (Odoo).** Comercial confirma la venta y se sincroniza la obra. Si hay cotización, `obras.cotizacion_id`.
2. **Pendientes de Oficina Técnica.** En `/oficina-tecnica/computos` (home por estado, spec en `docs/computo-materiales/modulo.md`) aparece la obra sin cómputo.
3. **Modelar.** "Abrir en modelador":
   - se precarga el tipo y las medidas con `medidasDe()`, con la etiqueta "estimado";
   - se elige el **sistema** (multidireccional o bastidores) y una **plantilla** (fachada, torre, pórtico, bandeja);
   - se ajusta con parámetros (frentes, vanos, niveles, anclajes, accesos);
   - se ven en vivo: el 3D, el peso total, la lista de piezas y los veredictos M0x, como "predimensionado" hasta que haya firma.
4. **Generar cómputo.** Se agrupa por `codigo` → `pieza_id` y se escribe `computo_items`. Lo que falta en el catálogo se muestra como "sin código".
   - Hoy el editor de cómputo (`src/app/(dashboard)/oficina-tecnica/computos/[obraId]/page.tsx`) tiene autoguardado con debounce de 1,5 s, hidratación una sola vez y modo lectura al completar.
   - Si el cómputo se editó a mano después de generarlo, hay que decidir qué pasa al regenerar: reemplazar, o mostrar la diferencia.
   - Esto reemplaza a `/api/ai/computo`, que le pide al modelo que adivine cantidades.
5. **Remito de entrega.** Hoy **no** se precarga desde el cómputo (`src/app/(dashboard)/logistica/remitos/nuevo/page.tsx` solo menciona "sobreestimación del cómputo" como motivo). Falta el botón "remito desde cómputo". Después, `balance-material` compara lo planeado con lo entregado, devuelto y sobrante.
6. **Propuesta.** El cotizador recibe los m² o los ml del modelo, o la lista de piezas para alquiler puro. El PDF suma la imagen del 3D y, si va memoria de cálculo, el opcional `ingenieriaMemoria` (`tipos.ts`).

> Ojo con el orden. Hoy la cotización viene **antes** de la venta y el cómputo **después**. Para que la imagen y los m² lleguen a la propuesta, el modelador tiene que poder usarse **sin obra**, desde una cotización. Es otro argumento para `tec_modelos` con `obra_id` nullable.

---

### 3. Qué se reusa de `~/Desktop/Proyectos/oficina-tecnica-aba`

(La ruta real es `Proyectos/`, no `~/Desktop/oficina-tecnica-aba` como dice el handoff. Último commit: 0d01f48, 16/06/2026.)

| Pieza | ¿Se reusa? | Cómo |
|---|---|---|
| `src/lib/calc/modules/m01…m11` + `types.ts` (`CalcModule<I,D>` → `{verdict, readouts, data, caveat}`) | **Sí**, con arreglos | TS puro, unas 1.600 líneas. Hay que agregar `.ts` a los imports y pasar Vitest a `node:test`. Arreglar los bugs del handoff §3: M07 da NaN y sale ok, M05 da siempre ok, M09, viento 50 contra 126 kg/m². Hacen falta adaptadores `Modelo → input Mxx` |
| `catalog/{clases,seguridad,viento,terrenos,materiales}.ts` | Parcial | Son parámetros normativos. Corregir viento y esbeltez, y marcarlos como "representativos" hasta que firme un profesional |
| `catalog/medidas.ts`, `layher.ts` | **No tal cual** | Son largos y admisibles de Allround. Reemplazar por medidas derivadas de `catalogo_piezas` |
| `catalog/pesos.ts`, `volumenes/` | **No** | Es el "método del volumen" (25 kg/m², 22 kg/m³). El modelador cuenta piezas reales |
| `catalog/tarifas.ts` | **No** | Tarifa placeholder. Queda el motor de Andamios OS |
| `src/lib/svg/scaffold-iso.tsx`, `scaffold.tsx` (480 líneas) | Solo como referencia | Pseudo-3D con offsets fijos (`ISO = {dx:30, dy:18}`), con píxeles a mano. Sirve para íconos de plantillas o para el PDF, no como motor de vista |
| `components/diagrams/*`, `simulador/*` | No para el modelador | Corresponden a Capacitación, fuera de alcance |
| `escenarios` (Supabase propio) | No | Otra base, y los escenarios guardan índices |

---

### 4. Restricciones técnicas

- **Next 16.2.1, React 19.2.4, Tailwind 4** (`package.json`). Según `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, `dynamic(..., { ssr:false })` "solo funciona en Client Components". Además, "cuando un Server Component importa dinámicamente un Client Component, la división de código automática **no** está soportada". El patrón a copiar es `src/app/(dashboard)/mapa-obras/page.tsx`: una página `"use client"` que carga `dynamic(() => import(...), { ssr:false, loading })`.
- **three y r3f no están instalados.** Las dependencias 3D/visuales actuales son `maplibre-gl` 5.24 (Ciudad Armada), `@react-pdf/renderer`, `zustand` y `@tanstack/react-query`.
  - Versiones propuestas: `three@0.186.1`, `@react-three/fiber@9.8.1`, `@react-three/drei@10.7.9`. Fiber 9 pide React ≥19 <19.4, y 19.2.4 entra.
  - Usar `InstancedMesh` por tipo de pieza: una fachada de 40 × 20 m tiene miles de piezas.
  - El estado del editor (selección, deshacer/rehacer) va en `zustand`, que ya está.
- **Modelo puro con tests.** Va en `src/lib/tecnica/modelo/*.ts`, con imports `.ts`, igual que el cotizador y mapa-obras. `npm test` falla con Node 22.16 en esta Mac (`node -v` = v22.16.0): hay que subir a ≥22.18 o usar `--experimental-strip-types`.
- **Diseño.**
  - Tokens en `src/app/globals.css`: `--primary: oklch(0.62 0.16 42)`, que es el coral `#D85A30`; tema oscuro con `--background: oklch(0.13 0 0)`; `--radius: .5rem`.
  - Tipografía: DM Sans + JetBrains Mono (`src/app/layout.tsx`).
  - Hay shadcn en `src/components/ui` (sheet, tabs, command, tooltip, dialog, table…). `command` sirve para una paleta de comandos tipo "agregar torre".
  - Oficina Técnica ABA usa Poppins y `#AF2C19`: no se mezcla.
  - Ciudad Armada ya resolvió paneles "vidrio oscuro" sobre un lienzo 3D (`src/components/mapa-obras/panel/estilos`), un precedente directo.
- **Escritorio solamente** (decidido el 12/10). Lo que va a obra o al cliente sale como PNG o PDF.
- **No hay modelos 3D de piezas licenciables.** Todo se modela en código: cilindros, discos y placas.

---

### 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Se modela Allround y no coincide con el stock real de ABA (largos 1,25/2,00/2,50; bastidores 1,30 × 1,80). El cómputo sale con piezas inexistentes | Las "familias de pieza" del modelador se derivan de `catalogo_piezas` (categoría + largo parseado del código), más una tabla de mapeo `tec_pieza_mapa(tipo, largo, sistema) → codigo` editable por Oficina Técnica |
| R2 | `peso_kg` vacío o generado (`ODOO-<id>`, sin peso) y categorías inferidas del nombre: el peso total y los veredictos quedan inválidos | Antes de desarrollar, una auditoría de cuántas piezas activas tienen `peso_kg`. Que se puedan cargar los pesos desde el propio modelador o en Odoo |
| R3 | Medidas de la venta en 0 o en texto libre: el "precargado" engaña | Usar `medidasDe()` con la marca "estimado". Pedirle a Comercial que cargue `x_permiso_altura` |
| R4 | Veredictos con bugs conocidos (M05 siempre ok, M07 NaN → ok, viento subestimado) mostrados en vivo dan una falsa seguridad | Portarlos arreglados y con tests. Mostrarlos como "predimensionado" hasta que haya firma y matrícula. M05 y M07 deben fallar cerrado ante NaN o entradas inválidas |
| R5 | Mezcla multidireccional + bastidores en una misma estructura (pórtico multidireccional con fachada de bastidores) | El modelo tiene que permitir **sistema por bloque**, no por proyecto |
| R6 | Un cómputo regenerado pisa las ediciones manuales, y `balance-material` usa "el último cómputo" | Guardar `origen` por ítem (modelo/manual) y mostrar las diferencias al regenerar. Bloquear la regeneración si `estado` está completado (`src/lib/computos/estado.ts`) |
| R7 | La RLS de `computos` con `get_user_role()` choca con los permisos por módulo | Migración que alinee la RLS, o escrituras por API con `exigirModulo` |
| R8 | Rendimiento: torres y fachadas grandes (más de 5.000 piezas) en máquinas de oficina | `InstancedMesh`, LOD (sin rosetas lejos), render bajo demanda (`frameloop="demand"`) |
| R9 | El alcance se escapa hacia un "Revit de andamios". La agilidad viene de **plantillas paramétricas + edición por bloque**, no de pieza por pieza | Edición pieza a pieza solo como excepción. Las plantillas (fachada, torre de acceso o escalera, torre móvil, pórtico peatonal/vehicular, bandeja) son la vía principal |
| R10 | Prerrequisito de entorno: Node 22.16 rompe `npm test` | Subir Node antes de empezar |

---

### Fuentes

**En Andamios OS** (`/Users/joaquin/Desktop/Proyectos/AndamiosOS/`):
- `docs/oficina-tecnica/handoff.md`
- `docs/computo-materiales/modulo.md`
- `src/app/(dashboard)/oficina-tecnica/computos/[obraId]/page.tsx`
- `src/app/api/ai/computo/route.ts`
- `src/hooks/use-balance-material.ts`
- `src/lib/cotizador/{tipos,fachada,alquiler,bandeja}.ts`
- `src/lib/mapa-obras/{medidas,tipos,fachada}.ts`
- `src/lib/odoo/{products,comercial,mapa-obras}.ts`
- `src/lib/auth/{acceso,servidor}.ts`
- `src/app/(dashboard)/mapa-obras/page.tsx`
- `src/app/globals.css`, `src/app/layout.tsx`
- `supabase/migrations/{20260330000001_initial_schema,20260331000001_fase2_schema,20260331000010_import_productos_odoo,20260620000001_materiales_odoo_espejo,20260620000007_computo_directo_obra}.sql`
- `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`

**En Oficina Técnica ABA** (`/Users/joaquin/Desktop/Proyectos/oficina-tecnica-aba/`):
- `src/lib/calc/{types.ts,catalog/medidas.ts,catalog/layher.ts,catalog/pesos.ts}`
- `src/lib/svg/scaffold-iso.tsx`