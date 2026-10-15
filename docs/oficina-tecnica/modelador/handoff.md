# Handoff: Modelador de andamios (actualizado 2026-10-15)

Para retomar en una sesión nueva: «Leé docs/oficina-tecnica/modelador/handoff.md y seguimos con el modelador».

**Estado:** **en producción desde el 15/10/2026** (`main`). Pasa 940 tests y `tsc` da limpio. Pendientes de la subida en el §6; correcciones posteriores en el §7.
Todo lo que calcula es **PREDIMENSIONADO**, porque los criterios no tienen firma. No reemplaza la memoria de cálculo.

---

## 1. Qué es

Es una herramienta de escritorio para la Oficina Técnica que arma en minutos el andamio de una obra. Desde el modelo se sacan el 3D, el alzado, la lista de piezas, el cómputo real y una imagen para la propuesta.

La dirección la eligió JS el 14/10 y se llama «Plantillas que encastran». Se elige una plantilla, se completan de 3 a 6 datos y el andamio sale entero. Los casos raros se resuelven sobre lo generado o con la estructura libre.

- **Lista de modelos:** `/oficina-tecnica/modelador`.
- **Editor:** `/oficina-tecnica/modelador/[id]`.
- **Demo sin guardar:** `/oficina-tecnica/modelador/demo`.
- **Entrada desde la obra:** botón «Diseñar andamio» en `/obras/[id]`.
- **Prueba sin base, solo en dev:** `/prueba/modelador`.

## 2. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Motor (TS puro, sin React) | `src/lib/tecnica/modelo/`: `tipos.ts`, `esqueleto/`, `armar/`, `reglas/`, `medida/`, `uniones/`, `criterios.ts` |
| Tipologías (una por archivo) | `src/lib/tecnica/modelo/tipologias/` + `indice.ts` (registro) |
| Volúmenes de referencia | `src/lib/tecnica/modelo/volumenes/` (lógica) y `src/components/tecnica/modelador/volumenes/` (UI) |
| Persistencia y cómputo | `src/lib/tecnica/persistencia/`, `src/app/api/tecnica/modelador/**`, `src/hooks/use-modelador.ts` |
| Pantalla | `src/components/tecnica/modelador/**` (vista 3D en `vista3d/`, alzado, paneles, estado) |
| Base de datos | `supabase/migrations/20261015000001…05_modelador*.sql` (todas aplicadas); para volver atrás, `supabase/scripts/modelador_down.sql` |
| Cómo sumar una tipología | `como-agregar-tipologia.md` |
| Casos nuevos por sumar | `pendientes/` (README con el formato) |
| Detalle técnico del cierre | `handoff-produccion.md` |
| Arquitectura | `arquitectura-produccion.md` |
| Origen del diseño | `propuesta-recomendada.md`, `propuesta-*.md`, `investigacion-*.md`, `maqueta/` (publicada en https://claude.ai/artifact/VZrxEkTpbLoA4EMBAj3Rck) |

**Las fotos de obra no están en el repo, porque el repo es público y son obras de clientes.** Están en la copia local `docs/oficina-tecnica/modelador/fotos/`, que figura en `.gitignore`. Son 15 fotos y sirvieron de referencia de armado.

## 3. Qué arma

Todas las tipologías salen del registro:

- **Fachadas:**
  - pantalla;
  - estructura con y sin pantalla;
  - voladizo con ménsulas;
  - fachada de bastidores.
- **Bandejas y pórticos:**
  - bandeja con visera a 45° y a 90°;
  - bandeja amplia;
  - bandeja con pórtico;
  - bandeja en voladizo;
  - pórtico peatonal y vehicular.
- **Torres:** escalera, acceso, plataforma, azotea y móvil.
- **Interiores y escaleras:**
  - estructura sobre escalera;
  - plataforma en hueco de escalera;
  - patio interno.
- **Especiales:** colgante (de losa o de puente), envolvente y estructura libre.

Además:

- **Medida libre:** combina vanos de catálogo con un ajuste de caño y grampa, y el ajuste nunca baja de 0,73.
- **Estructura libre** y la opción «Convertir a estructura libre».
- **Volúmenes desde medidas:** caja, prisma, escalonado, cilindro o cúpula, salientes y patios. Se toca una cara y sale la fachada, y avisa los choques.
- **Mis plantillas:** `tec_modelos.es_plantilla`.

## 4. Decisiones de JS

- La herramienta es para la compu de la oficina, no para el celular.
- **Multidireccional ABA (Coronet):** vanos de 2,50 / 2,00 / 1,50 / 1,25 / 1,09 / 0,73 y profundidades de 0,73 / 1,09 / 1,25. Está confirmado.
- **Bastidor de 1,30 × 1,80:** es un supuesto, no está confirmado. El cómputo va por kit, con opción de despiezado.
- **Precios:** el modelador nunca pone precio. Los precios salen del cotizador.
- **Pesos:** si una pieza no está en `catalogo_piezas`, sale «sin peso». Nunca se inventa.
- **Casos nuevos:** se modelan con la estructura libre. Si se repiten, se guardan como plantilla. Si conviene que se armen solos, se cargan en `pendientes/` y se suman por lotes.

## 5. Pendientes (por prioridad)

**Lo tiene que decidir o cargar JS**
1. **Códigos que faltan en el catálogo.** Hay que cargarlos en `tec_pieza_mapa`: `VIGA-CEL-500/600/750`, `DIAG-PL-*`, `RDPE-150`, `ESC-ARR`, `PASADOR-UNION`, `GRAMPA-VIGA`, `PLACA-ANC-COLG`, `ANC-VOL-PLACA` y el estabilizador. Hasta entonces salen «sin código» y no entran al cómputo.
2. **Pesos reales:** `peso_kg` está vacío en Odoo para muchos códigos.
3. **Última plataforma:** con una altura de 18 queda a 16,50 y no a 17,00. Hay que definir si sube el último nivel o se suma uno.
4. **Bastidor:** confirmar la medida y qué compone un cuerpo.
5. **Criterios de armado para firmar:** diagonales cada cuántos vanos, grilla de anclajes, cargas de bandeja. Faltan quién firma y con qué matrícula (Hougassian). Mientras no se firmen, todo queda en PREDIMENSIONADO.
6. **Voladizos (confirmar, 15/10):**
   - con vuelo de 0,45 sale solo la ménsula de catálogo, sin diagonal de 2,00: ¿es así en obra?
   - si 2,00 más abajo no hay nivel, la diagonal apoya en la roseta del parante a 2,00: ¿se arma así?
   - con balcones cada 2,80 la diagonal de 2,00 no entra entre niveles y la reparación propone ménsula de 0,45: ¿es correcto?
   - en Odoo solo existe la ménsula de 0,45; los vuelos mayores salen con horizontal + diagonal 2,00 × vuelo, que sí existen.
7. **Probar con la Oficina Técnica:** 2 o 3 personas, sin explicación previa, cronometradas con los casos de la propuesta (§3 de `propuesta-recomendada.md`).

**Desarrollo**
1. **Bug conocido:** en las plantillas que no son fachada (torres, bandejas…), los pinceles **Lona** y **Abertura** se guardan pero no generan nada. Diagonal, caño, ménsula y anclaje ya funcionan (`aplicarOverridesGenericos` en `src/lib/tecnica/modelo/construir.ts`).
2. **Portada de la tarjeta:** se actualiza solo al tocar «Imagen», así que puede quedar vieja (p. ej. una tarjeta con «0 m²» mostrando una torre que ya se borró). Propuesta: regenerarla sola al guardar, con un debounce.
3. Manijas de largo y alto que se puedan arrastrar en el 3D. Hoy se tipea con L/H y Enter.
4. Que «Mis plantillas» se ubiquen con encastre.
5. Bug: «Detrás de la selección» ubica mal el volumen en las fachadas en L (`volumenes/geometria.ts`).
6. Control optimista en la pantalla de Cómputos (`use-computos.ts`) y consolidar en la RPC los ítems duplicados manual + modelo.
7. Tests de la RPC y de las rutas API contra un Supabase local.
8. Medida libre: cerrar el sobrante con ménsula o caño volado.
9. Pórtico con bandeja: lista de huecos sobre accesos.
10. Recorrido guiado y atajos K, M y Shift+P de la maqueta.
11. **Más adelante:**
   - importar DWG/DXF y volúmenes de SketchUp (OBJ, DAE, glTF o IFC) para modelar arriba;
   - verificaciones M03, M05 y M11 portadas con los bugs corregidos (ver `../handoff.md` §3);
   - lámina PDF.

**Idea de importación (JS la dejó para después, el 15/10):** conviene un modo semiautomático: importar el plano, poner la escala y hacer clic en la línea de fachada para que salga el frente. El DWG se puede leer convirtiéndolo a DXF con LibreDWG. El .skp no se puede leer en la web: hay que pedir que lo exporten a OBJ, DAE o glTF. Para arrancar hacen falta 2 o 3 DWG reales y un SketchUp de obra.

## 6. Subida a producción (15/10)

- [x] Backup de `computos`, `computo_items` y `user_profiles`, en `~/Desktop/Proyectos/AndamiosOS-backups/2026-10-15-pre-modelador/`.
- [x] **Migraciones 000001 → 000004 aplicadas en producción (15/10).**
  - Quedaron creadas `tec_modelos`, `computos.modelo_id` y la RPC `tec_generar_computo(uuid,uuid,uuid,int,jsonb,jsonb,jsonb)`.
  - Las apliqué con `node --env-file=.env.local migrar.mjs`, que detecta el pooler `aws-0-us-west-2` y toma `SUPABASE_DB_PASSWORD` de `.env.local`.
- [x] **Mapa de piezas por descripción** (migración 000005, `src/lib/tecnica/persistencia/mapa-descripcion.ts`).
  - Quedaron 148 filas contra los códigos reales `ODOO-<n>`, más 6 kits de bastidor con composición *supuesta*.
  - Si Odoo trae un código sin fila en el mapa, `catalogo.ts` lo infiere por la descripción (prioridad 900). Lo que cargue OT siempre gana.
  - **Siguen sin código, porque no existen en Odoo:**
    - en Paraná 631: anclaje, rodapié 1,50 y recubrimiento de vertical;
    - en otras tipologías: lona, chapa, estabilizador, defensa, vigas celosía de 5/6/7,5, pasador, grampa de viga, placa de anclaje, escalón de arranque.
  - Para que esas piezas entren al cómputo hay que crearlas en Odoo.
  - **Para confirmar con JS:** cuál es la diagonal 2,00×2,00 real (ODOO-91 o ODOO-93), y la composición de los módulos de bastidor (hoy: 1 bastidor + 2 riendas H + 2 riendas D).
  - **Ninguna pieza tiene `peso_kg` en Odoo**, así que las toneladas salen «sin peso».
- [ ] **Permisos:** `tec_backfill_permisos` quedó en 0, así que nadie tenía Cómputos «ver/editar» en `user_profiles.permisos` para copiar. Hay que dar a mano Modelador «editar» a la Oficina Técnica (Configuración → usuarios). El admin entra igual.
- [ ] Revisar que `SUPABASE_SERVICE_ROLE_KEY` esté en Vercel.
- [x] **Merge a `main`, push y deploy (15/10).** Commits `b5bbb68` (modelador) y `d417191` (mapa, migración 000005 aplicada: 148 filas). Vercel deploya solo; en producción la API del modelador responde 401 sin sesión.
- [ ] Prueba de punta a punta: crear un modelo, guardarlo y generar el cómputo en una obra de prueba.

Para volver atrás: `supabase/scripts/modelador_down.sql`. ⚠ Borra los modelos guardados.

## 7. Correcciones del 15/10, después de la subida

Todas mergeadas a `main` y deployadas, con lo que reportó JS probando en producción:

| Qué | Arreglo | Dónde |
|---|---|---|
| No se podían borrar los volúmenes creados por una plantilla («Edificio (azotea)», «Escalera») | El botón «Borrar volumen» aparece siempre, y Supr/⌫ (doble pulsación, con Deshacer) borra el volumen elegido | `paneles/volumenes.tsx`, `comandos.tsx` |
| La lista de modelos solo ofrecía «Archivar», sin vuelta atrás | Menú con «Duplicar» y «Eliminar…» (confirma, aviso con «Deshacer»). Sigue siendo borrado lógico (`archivado_at`) porque un cómputo puede apuntar al modelo | `lista-modelos.tsx`, `api/tecnica/modelador/[id]/restaurar` |
| Panel de estructura libre: los 4 botones de crecer se pisaban, «4 m» parecía cantidad de niveles, se veían ids internos («s1_0») | Botones en 2 columnas, «Altura del nivel nuevo», vanos como V1, V2… | `paneles/libre.tsx` |
| En la torre el pincel Ménsula/Anclaje aparecía pero no hacía nada | Los overrides de ménsula y anclaje van a los nodos del vano en toda plantilla que no sea fachada | `modelo/construir.ts` + `tipologias/mensula-pincel.test.ts` |
| No se podía elegir el largo del voladizo, y la diagonal del voladizo bajaba 0,50 | Chips de «Vuelo» (0,45 · 0,73 · 1,09 · 1,25 · 1,50 · 2,00 · 2,50) en la barra del pincel; ≤ 0,45 = ménsula de catálogo; mayor = horizontal del vuelo + diagonal **2,00 × vuelo** que baja 2,00 al parante. Cambiaron los golden de bandeja 45/90 y envolvente de tanque | `armar/armar.ts` (`armarNodos`), `OverrideCelda.brazoMensula` |
| Al plegar la columna izquierda, el editor se desarmaba (3D en una columna de 0 px) | Cada panel fijo en su columna de la grilla | `editor.tsx` |
| En la estructura libre, la ménsula (y anclaje, horizontal, baranda, abertura, lona, caño) pintada no quedaba | El pincel leía el estado de la vista previa y al soltar lo volvía a alternar; ahora lee del diseño | `estado/acciones.ts` (`pintarDiseno`) |

**Para trabajar en local:** `node_modules` del checkout principal no tenía `three` (se había instalado solo en el worktree): correr `npm install`. Si Turbopack tira un FATAL al levantar `next dev`, borrar `.next/`.
