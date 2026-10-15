# Handoff: Modelador de andamios (actualizado 2026-10-15)

Para retomar en una sesión nueva: «Leé docs/oficina-tecnica/modelador/handoff.md y seguimos con el modelador».

**Estado:** terminado en la rama `feat/modelador`. Pasa 922 tests y `tsc` da limpio. La subida a producción está en curso; ver el §6.
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
| Base de datos | `supabase/migrations/20261015000001…04_modelador*.sql`; para volver atrás, `supabase/scripts/modelador_down.sql` |
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
6. **Probar con la Oficina Técnica:** 2 o 3 personas, sin explicación previa, cronometradas con los casos de la propuesta (§3 de `propuesta-recomendada.md`).

**Desarrollo**
1. Manijas de largo y alto que se puedan arrastrar en el 3D. Hoy se tipea con L/H y Enter.
2. Que «Mis plantillas» se ubiquen con encastre.
3. Bug: «Detrás de la selección» ubica mal el volumen en las fachadas en L (`volumenes/geometria.ts`).
4. Control optimista en la pantalla de Cómputos (`use-computos.ts`) y consolidar en la RPC los ítems duplicados manual + modelo.
5. Tests de la RPC y de las rutas API contra un Supabase local.
6. Medida libre: cerrar el sobrante con ménsula o caño volado.
7. Pórtico con bandeja: lista de huecos sobre accesos.
8. Recorrido guiado y atajos K, M y Shift+P de la maqueta.
9. **Más adelante:**
   - importar DWG/DXF y volúmenes de SketchUp (OBJ, DAE, glTF o IFC) para modelar arriba;
   - verificaciones M03, M05 y M11 portadas con los bugs corregidos (ver `../handoff.md` §3);
   - lámina PDF.

**Idea de importación (JS la dejó para después, el 15/10):** conviene un modo semiautomático: importar el plano, poner la escala y hacer clic en la línea de fachada para que salga el frente. El DWG se puede leer convirtiéndolo a DXF con LibreDWG. El .skp no se puede leer en la web: hay que pedir que lo exporten a OBJ, DAE o glTF. Para arrancar hacen falta 2 o 3 DWG reales y un SketchUp de obra.

## 6. Subida a producción (15/10)

- [x] Backup de `computos`, `computo_items` y `user_profiles`, en `~/Desktop/Proyectos/AndamiosOS-backups/2026-10-15-pre-modelador/`.
- [ ] Migraciones 000001 → 000004. Hace falta `SUPABASE_DB_URL` en `.env.local`.
- [ ] Revisar que `SUPABASE_SERVICE_ROLE_KEY` esté en Vercel.
- [ ] Merge a `main`, push y deploy. Va **después** de las migraciones, porque la pantalla de Cómputos y la de obra ya leen las columnas nuevas.
- [ ] Permisos: Modelador «editar» para la Oficina Técnica. La migración copia el nivel de Cómputos y lo anota en `tec_backfill_permisos`.
- [ ] Prueba de punta a punta: crear un modelo, guardarlo y generar el cómputo en una obra de prueba.

Para volver atrás: `supabase/scripts/modelador_down.sql`. ⚠ Borra los modelos guardados.
