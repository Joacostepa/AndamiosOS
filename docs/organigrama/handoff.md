# Handoff — Organigrama

## Estado (12/10/2026)

**En producción** desde el merge `8ba57b9` a `main` (rama `feat/organigrama`). El mismo 12/10 se sumaron la vista **Árbol** del Lienzo, la **jerarquía visual** (tamaños por tipo, recuadros de área, vacantes calmas) con **renombrar en línea**, y la **estructura v2**, que el dueño ya **cargó como borrador** (27 nodos, junto a la v1 vigente; todavía sin publicar). La migración `20261012000003_organigrama.sql` la aplicó el dueño a mano desde su terminal y quedó verificada: versión 1 publicada con los 24 nodos y ningún ocupante.

### Hecho

- Migración `supabase/migrations/20261012000003_organigrama.sql`: tablas `org_versiones`, `org_nodos`, `org_nodo_version`, `org_notas_internas`, `org_ocupantes`; RLS en todas (`org_puede_ver()` / `org_puede_editar()`); triggers anti-ciclo (diferido), de inmutabilidad de versiones publicadas y de protección de versiones; RPC atómicas (`org_leer`, `org_crear_borrador`, `org_guardar_borrador`, `org_publicar`, `org_descartar_borrador`, `org_guardar_ocupantes`, `org_sembrar`); siembra la **versión 1** con los 24 nodos reales, sin personas.
- La maqueta pasó a datos reales sin cambiar la experiencia: el proveedor mantiene la misma interfaz (`dispatch`, `datos`, `asignar`, `quitar`…), con updates optimistas y una cola que guarda por diferencias (ver [modulo.md § 5](./modulo.md#5-cómo-se-guarda-optimista)). Deshacer/rehacer del Lienzo persiste como la operación inversa.
- Lienzo en **pantalla completa** (botón en los controles de zoom o tecla `F`): el lienzo pasa a `fixed inset-0` y además pide `requestFullscreen` sobre todo el documento, así las hojas y diálogos (portales del `body`) se siguen viendo. En iPhone, donde el navegador no lo deja, solo tapa la app.
- Personas reales: legajos (activos o todavía nombrados), usuarios activos (sin el kiosco del pañol), externos de cuadrillas tercerizadas y ocupantes de afuera con nombre libre (campo «¿Es de afuera?» en Asignar persona).
- Cuadrillas en vivo debajo de Montajes (capataz, plantel activo y externos).
- Fuera: personas inventadas, «Ver como», banner de maqueta y `?demo=`. Cargando / error / vacío salen de los datos reales (con «Reintentar» y «Empezar desde la estructura base»).
- «Ver legajo» en la ficha de persona lleva a `/personal/<id>` y solo aparece con permiso de Legajos.
- Tests (`node:test`, 521 en verde al mergear): `datos.test.ts` (traducción base ↔ pantalla, diffs, `operacionesPara`, y que el JSON sembrado en la migración sea igual a `estructura-base.ts`), más `arbol`, `lienzo` y `layout`.
- Antes de aplicarla, la migración se probó: en un Postgres local (PGlite) dos veces seguidas, con ciclos, versiones publicadas, RLS y un ciclo completo crear → asignar → deshacer → publicar; y contra la base real dentro de `BEGIN … ROLLBACK` (una sola pasada; ver «Cómo probar una migración nueva»).

- **Lienzo: Lista / Árbol** (rama `feat/organigrama-arbol`, en `main` desde el 12/10): selector en la barra (tecla `L`, recordado en `localStorage`, Árbol por defecto en escritorio, siempre Lista en el celular); layout Árbol compacto en `layout.ts` (`forma: "arbol"`, grilla de 2 columnas con más de 3 hijos) con tests en `layout-arbol.test.ts`; y el arreglo de los encuadres, que ahora miden los paneles flotantes (`data-panel` + `areaLibre`) y no dejan la Dirección debajo de la barra ni lo de abajo debajo del banco. Detalle en [modulo.md § 3](./modulo.md#3-pantallas). Solo código, sin migración. Límite: en una notebook 1440×900 el árbol entero entra recién al ~33 % (43 % en pantalla completa), con las tarjetas resumidas; criterio de uso: **Árbol para ver la forma y presentar, Lista para trabajar**.
- **Estructura v2** (rama `feat/organigrama-estructura-v2`, en `main` desde el 12/10): rediseño de la estructura para pyme familiar, basado en dos relevamientos del circuito real de ABA (sistema + base, y negocio + normativa). 27 funciones en 3 niveles, sin personas, con todas las fichas completas. Diseño, tabla de cambios contra la v1 y preguntas abiertas en [estructura-v2.md](./estructura-v2.md). Se carga como **borrador** con `supabase/scripts/organigrama-estructura-v2.sql`. **Cargada como borrador el 12/10** (verificado: borrador con 27 nodos, v1 vigente intacta, 0 ocupantes); el dueño la está revisando y editando en el Lienzo.
- **Lienzo: jerarquía, grupos, vacantes calmas y renombrar** (rama `feat/organigrama-jerarquia`, 12/10; pedido del dueño al ver la v2 en Árbol: «los puestos tienen el mismo tamaño que las áreas» y «no se entiende que Compras es una subárea de Operaciones»): tamaños y estilos por clase (Dirección › área › subárea › puesto), recuadros de área anidados en el Árbol (franja en la Lista), vacantes neutras salvo búsquedas abiertas o «Resaltar vacantes» (contador de la barra / `V`), y renombrar en línea (doble clic, `F2`, «Renombrar» en la ficha) con borrador y deshacer. Detalle en [modulo.md § 3](./modulo.md#3-pantallas). Solo código; tests nuevos en `layout-arbol.test.ts` y `lienzo.test.ts`.
- **Hallazgo del relevamiento**: las siglas SOL/OPC/RS/FS/RDP/RDF/ICO de la v1 (y de «Seguí el papel») **no existen en ABA**: venían del organigrama viejo; en la base no hay remitos ni movimientos de material. La v2 no las usa; [propuesta.md § 1](./propuesta.md) lleva la corrección.

### Falta

0. **Estructura v2** — en este orden:
   1. Contestar las preguntas abiertas de [estructura-v2.md](./estructura-v2.md) (quién firma memorias y certificados, régimen UOCRA/IERIC y quién liquida, asesor SyH externo, responsable de cada frente, si SyH puede frenar un armado…). Lo no contestado queda «[confirmar]» en las fichas.
   2. Reescribir `src/lib/organigrama/circuitos.ts` con los 4 circuitos reales propuestos en [estructura-v2.md § 7](./estructura-v2.md) (consulta → obra armada, permiso de vía pública, parte del día, desarme y cierre). **Tiene que salir antes o junto con la publicación de la v2**: los circuitos actuales paran en `stock`, `despacho`, `devoluciones`, `control` y `cobr`, que la v2 elimina (el papel deja de viajar a esas cajas). Su test verifica que cada parada exista y tenga la tarea con ese documento.
   3. ~~Cargarla como borrador~~ — **hecho el 12/10** (`npx supabase db query --linked -f supabase/scripts/organigrama-estructura-v2.sql`; si ya hay un borrador aborta sin tocar nada).
   - **Compras**: el dueño la agregó en el borrador como *área* colgada de Operaciones. Recomendación dada (pendiente de su decisión): en una pyme de ~45 personas Compras es una **función**, no un área → **puesto**: dentro de Operaciones si compra sobre todo insumos y repuestos para pañol y taller; si no, seguir como «A crear» dentro de «Pagos, caja y compras» (Administración), con la Dirección aprobando lo grande (material de andamio).
   4. Revisarla en el Lienzo y publicarla (o descartarla) desde Versiones.
   5. Si queda, actualizar `estructura-base.ts` a la v2 y regenerar el JSON de la migración (solo afecta a una base vacía).
1. **Probar en el navegador con datos reales** (nadie lo vio todavía con la base de verdad): la lista de abajo.
2. **Dar permisos** en Configuración › Usuarios: «ver» a todos los perfiles y «editar» a quien mantiene la estructura (el admin ya edita). Hasta entonces solo lo ve el admin.
3. **Ubicar a la gente**: todo arranca vacante; se arrastra a cada persona desde el banco del Lienzo.
4. **Cuenta duplicada**: hay dos usuarios activos «Joaquin Stepansky»; desactivar uno o aparece dos veces en el banco.
5. Cargar las **misiones** de los 18 puestos de la v1 (vacías a propósito, como en el original). La v2 ya las trae.
7. **Borrador perdido (a investigar)**: el 12/10 el dueño vio en el Lienzo «BORRADOR · 3 cambios», pero poco después la base no tenía ningún borrador. Si no lo descartó él, algún guardado falló sin que se viera; revisar la cola de `proveedor.tsx` (`operacionesPara` / el toast de error) reproduciendo crear borrador → 3 cambios → recargar.
6. **App vieja `organigrama-aba`** (Firebase, proyecto `orgama-aba`): no tiene login, así que su Firestore probablemente está abierto con teléfonos y emails del equipo. Revisar las reglas o dar de baja el proyecto ahora que el módulo vive acá.

### Qué probar (primera vez con datos reales)

- Entrar como admin a `/organigrama/lienzo`: se ven los 24 nodos con sus colores, todo vacante, Montajes con las cuadrillas reales.
- Arrastrar una persona del banco a un puesto → recargar la página: sigue ahí. Deshacer (⌘Z) → recargar: no está.
- Crear un puesto con la caja de herramientas → aparece «Borrador» → recargar: el borrador sigue con el puesto. Publicar con nota → Versiones muestra v2 vigente.
- Mover un puesto debajo de un descendiente: el Lienzo no lo deja (y si llegara, la base lo rechaza).
- Descartar el borrador: vuelve la vigente; si alguien estaba asignado a un puesto que solo existía en el borrador, queda terminado («borrador descartado»).
- Un usuario con «organigrama: ver» no ve Para revisar, Versiones, notas internas ni el borrador; uno sin el módulo no entra (el proxy lo redirige).
- Dar de baja un legajo con puesto (o esperar al sync de Odoo) → aparece en «Para revisar › Bajas con puesto».
- Dos pestañas: un cambio en una entra en la otra al volver a ella (si no hay nada guardándose).

## Reglas que importan

- **Las personas no se copian.** Nada de nombres o teléfonos en tablas `org_*`, salvo `nombre_libre` para alguien de afuera.
- **La estructura solo cambia en el borrador**; lo publicado es inmutable (lo garantiza la base). Las asignaciones son inmediatas.
- **Toda escritura va por RPC** con su chequeo de permiso. Si se agrega una, sumarla al bloque de `GRANT EXECUTE` de la migración (y las internas, al de `REVOKE`).
- La clave de un nodo es su URL y su identidad mientras vive. Al publicar sin él (o descartar el borrador que lo creó) se libera (`clave~xxxxxxxx`) y sus ocupantes vigentes terminan.
- `estructura-base.ts` y el bloque `$base$…$base$` de la migración tienen que coincidir (lo verifica `datos.test.ts`; se regenera con `node --experimental-strip-types scripts/organigrama-estructura-sql.mts`). Cambiarlos después de aplicada la migración no cambia la base: la siembra corre solo si no hay ninguna versión.

## Riesgos y límites conocidos

- **Dos editores a la vez sobre el mismo borrador**: cada uno guarda diferencias contra lo que vio; no se pisan filas distintas, pero si los dos tocan el mismo puesto gana el último. Lo de los demás entra al volver a leer (no hay tiempo real).
- **Deshacer en el Lienzo después de que entró un cambio de otra persona** puede deshacer también ese cambio (el historial guarda fotos locales).
- Si una RPC falla, se pierde lo que estaba en la cola detrás de ella (se avisa y se vuelve a lo último guardado).
- **Kiosco**: se excluye de las personas al usuario cuyo único módulo es `panol-kiosco`. Cualquier otro usuario activo aparece (hoy hay una cuenta duplicada de Joaquin Stepansky que va a aparecer dos veces).
- «Seguí el papel» usa las claves de la estructura base (`stock`, `montajes`, `cobr`…). Si se elimina uno de esos puestos, el papel no viaja a esa parada (el texto del paso se sigue leyendo).
- `modalidad = 'compartido'` está permitida en la base pero la pantalla la lee como titular (compartir = dos titulares).
- El historial de deshacer vive mientras el Lienzo está abierto.
- **Árbol en la pantalla normal (no completa)**: con el banco abierto y la caja de herramientas, el árbol entero entra a ~33 % en una notebook de 1440×900 (zoom semántico: nombre + conteo). En pantalla completa, ~43 %. Es lo que da el ancho de 5 áreas con 2 columnas cada una; para leer las fichas, acercar o colapsar áreas.

## Cómo retomar

- **Dónde está todo**: pantallas en `src/app/(dashboard)/organigrama/**` y `src/components/organigrama/**` (el Lienzo en `lienzo/`, el estado y el guardado en `proveedor.tsx`); datos en `src/hooks/use-organigrama.ts`; lógica pura en `src/lib/organigrama/`. Mapa completo en [modulo.md § 7](./modulo.md#7-código).
- **Correr local**: `npm run dev` y entrar como admin a `/organigrama/lienzo`. Lee y escribe en la base de producción (no hay staging): para probar a gusto, conviene trabajar sobre un borrador y descartarlo al final.
- **Tests**: la máquina tiene Node 22, que no corre `.ts` sin flag: `NODE_OPTIONS=--experimental-strip-types npm test` (con `npm test` a secas fallan todos, también los de otros módulos).
- **Animaciones**: librería `motion` (`motion/react`), agregada con este módulo. `MotionConfig reducedMotion="user"` respeta «reducir movimiento».
- **Cambios de pantalla** que no tocan datos: solo código, sin migración.
- **Cambios de datos** (columna nueva, RPC nueva, permiso): migración nueva con fecha (`supabase/migrations/AAAAMMDD00000N_organigrama_<qué>.sql`), idempotente, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`, y sumar las RPC nuevas al `GRANT EXECUTE`. Si cambia lo que devuelve `org_leer()`, actualizar `datos.ts` y su test.

### Cómo probar una migración nueva

- `scripts/probar-migracion.mjs` necesita el paquete `pg`, que **no está instalado**. Alternativa que se usó: armar un archivo con `BEGIN;` + la migración + `SET CONSTRAINTS ALL IMMEDIATE;` + un `select` de control + `ROLLBACK;` y correrlo con `npx supabase db query --linked -f <archivo>` desde la raíz del repo principal (el link de Supabase vive ahí, no en los worktrees).
- **No** pegar la migración dos veces dentro de la misma transacción: el trigger anti-ciclo es diferido y deja eventos pendientes, y el segundo `CREATE INDEX` falla con «pending trigger events». La idempotencia se prueba en transacciones separadas.
- Aplicarla la aplica el dueño (o con su OK explícito): `npx supabase db query --linked -f supabase/migrations/<archivo>.sql`. **Nunca `db push`.**

## Historia (para entender por qué es así)

1. La app original era `organigrama-aba` (repo propio, Vite + React + Zustand + Firebase, sin login): árbol editable, diagrama, export PNG/PDF, equipo global. De ahí se conservó el **contenido** (24 nodos con tareas, documentos, «qué NO hace», KPIs) y las ideas de vacante, carga por persona y ficha de puesto; el software se rehízo.
2. Primera maqueta (rama `maqueta/organigrama`): Mapa por columnas, fichas, buscador, Personas, Para revisar, borrador/versiones, impresión A4 — [propuesta.md §§ 1–6](./propuesta.md).
3. Devolución del dueño: «me gustó, pero me imaginaba algo súper animado, didáctico». Segunda propuesta: el **Lienzo vivo** ([propuesta.md § 7](./propuesta.md#7-propuesta-2-lienzo-vivo-organigramalienzo)). Le encantó y pasó a ser la entrada del módulo. **Criterio para cambios futuros: que siga siendo manipulable y animado, no solo para leer.**
4. Integración a datos reales (rama `feat/organigrama`) con las decisiones de [modulo.md § 2](./modulo.md#2-decisiones-12102026), y merge a producción el 12/10.
5. Pedido del dueño: que también se abra «tipo árbol» → vista Árbol como **opción** (no reemplazo), porque el árbol puro de ABA mide ~4.000 px de ancho. Y una revisión de la estructura «pensando que es una pyme familiar, no una corporación, y entendiendo el circuito de ABA» → [estructura-v2.md](./estructura-v2.md). Los relevamientos que la sustentan eran archivos de trabajo; sus conclusiones están en ese documento.

## Mantenimiento

- Para cambiar la estructura base que se ofrece en una base vacía: editar `estructura-base.ts` y regenerar el JSON de la migración (ver arriba).
- Para un permiso nuevo o un cambio de RLS: migración nueva con el mismo estilo (idempotente, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).

## Lo que queda para más adelante (propuesta § 5, fases 2 y 3)

- Alerta `organigrama_baja` en la campanita desde el sync de Odoo.
- «Ver esta versión» y comparar versiones; fotos desde Odoo; vista Circuito documental; diferencias con Odoo; KPIs conectados.
- Tiempo real (Supabase Realtime) si se vuelve común que editen dos personas a la vez.
