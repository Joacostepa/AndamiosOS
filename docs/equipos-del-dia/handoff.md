# Hoja del día — handoff

Estado real al 10/10/2026 (noche): **en producción.** Arreglos del 10/10 a la noche, ya en `main`: el domingo es un día más (PR #5) y velocidad + nombres de pila (ver "Latencia"; sin migraciones). Mergeado a `main` con el PR #3
(`d736eca`) y los contratistas con el PR #4 (`7751ce7`), publicados en Vercel. Para retomar: "Leé docs/equipos-del-dia/handoff.md y
seguimos con lo que falta".

**Choferes y camiones + Google Maps (11/10) — rama integrada `feat/hoja-dia-choferes-y-maps`, lista para salir.** Junta `fix/hoja-dia-choferes-camiones` y `feat/hoja-dia-google-maps`, más las correcciones de la revisión (12/10). 419 tests, `tsc`, `eslint` y `build` en verde.
- **Prueba contra la base real hecha (11/10)**: las dos migraciones dos veces + `scripts/sql/hoja-dia-vehiculos-reparar.sql` dentro de `BEGIN … ROLLBACK`. Resultado: 4 hojas con chofer → 5 filas en `hd_hoja_vehiculos` (la quinta es la hoja del 10/10 en "Lleva y trae" sin chofer en la hoja, armada desde su lleva), `hojas_sin_backfill=0`, 4 viajes ligados, `puede_manejar` = Ortega y Conte, `hd_tiempos` creada, RLS en las dos tablas, `hd_aplicar` con la tabla nueva. Verificado después que no quedó nada.
- **Falta**: aplicar las dos migraciones (`20261012000001_hoja_dia_vehiculos.sql` y `20261012000002_hoja_dia_tiempos.sql`), mergear a `main` enseguida y correr la reparación (pasos 2 a 5 de "Para producción" abajo). El modo automático de Claude Code bloquea las escrituras a producción: el dueño las corre o aprueba el permiso.
- **Google**: la Routes API ya responde con la clave `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (probado el 11/10: 12,7 km / 24 min). El código la usa si no hay `GOOGLE_MAPS_API_KEY`; confirmar que esté cargada en Vercel y restringirla a las APIs que se usan.

**Contratistas (10/10, noche)**: en producción. Migración `20261011000002_hoja_dia_contratistas.sql`
aplicada y verificada (las dos tablas y los 2 CHECK) ANTES del merge del PR #4. Ver "Contratistas" abajo.


## Choferes y camiones (11/10) — rama `fix/hoja-dia-choferes-camiones`

El dueño reportó cuatro problemas (Cuadrilla 1 del domingo: "Lleva y trae · Nuñez · AB 831 LC" en rojo "El AB 831 LC lo maneja Borda el domingo"; no se podía marcar que el camión los deja y vuelve al depósito; "vuelven solos" no dejaba cargar la vuelta; armadores que manejan; varios camiones por cuadrilla). Decisiones suyas en `modulo.md` §4 y §19.

**Qué cambió**
1. **Chofer y vehículo independientes.** El chofer de cada viaje manda (`hd_viajes.chofer_id`); el habitual y `hd_camiones_dia` sólo sugieren (el chofer de un viaje nuevo es el del viaje anterior en la fila: `choferParaOrden` / `choferSugerido`). Se fue el problema `vehch` ("lo maneja Borda"). Choques reales: el mismo vehículo en dos lugares (`vehdup`, `todo-`, horas que no entran en un camión) y el mismo chofer en dos lugares (`crucesChofer`: dos camiones que se pisan; `todoch-`: todo el día con una y un viaje de otra; `chint-`: integrante de otra cuadrilla; `chdup`/`chmix`). La fila de Camiones dice quién lo maneja en cada tramo ("Kiska → Nuñez 14:00"); el menú de una ficha tiene "Cambiar chofer" y el de la fila "Elegir otro chofer" (antes `chofer_del_camion` no tenía botón). `vehOpts` ya no dice "lo maneja Kiska".
2. **"Puede manejar"** en Legajos (lista y ficha, junto a "Puede estar a cargo"; `personal.puede_manejar`, en la lista blanca del Deshacer). Elegibles como chofer = choferes de Odoo + los que pueden manejar (`choferesElegibles`). Siguen en "Sin asignar" mientras no manejen todo el día. A cargo y chofer todo el día de su cuadrilla cuenta una vez ("a cargo · chofer"; `genteConChoferes`), y el mensaje le dice "manejás vos todo el día". La sincronización con Odoo no toca la columna.
3. **Varios vehículos por hoja**: `hd_hoja_vehiculos` (hoja, vehículo, chofer, modo `lleva_trae`/`todo_el_dia`, orden, tocado). `Hoja.vehiculos` reemplaza `modo/choferId/vehiculoId`. La regla vive en `vehiculos.ts` (`planVehiculos`, puro y con tests): el servidor escribe el plan (`escribirPlanVehiculos`, todo por el grabador: historial y Deshacer) y el optimista lo muestra igual al instante. Las columnas viejas de `hd_hojas` quedan como **resumen del primer vehículo** (rollback; volver a correr la migración no duplica). Gestos nuevos: `vehiculo_sumar`, `vehiculo_quitar`, `vehiculo_cambiar`, `vuelta`, `busca_con`; `modo`/`chofer`/`vehiculo` actúan sobre el primer vehículo (teclas 1–5, soltar un chofer, botones de los problemas). Tarjeta: un renglón por vehículo + "Los busca …"; editor con modo/chofer/camión/hora del lleva/vuelta/carga/quitar y "+ Otro vehículo".
4. **Lleva y trae sobre la marcha**: cada vehículo de lleva y trae tiene su lleva (`hoja_vehiculo_id`); "Después vuelve al depósito" (`vuelta` + `vuelta_llega` nueva, estimada si no se carga) libera el camión desde la llegada (calcVeh, dondeAnda, "Poner en un camión" lo ven en el depósito). El busca: el mismo vehículo (lo sigue), otro camión u otro chofer, a definir ("Nadie los busca") o vuelven solos, y se pasa de uno a otro en cualquier momento, desde la tarjeta o Camiones (son los mismos viajes: pasar el lleva a otro camión en Camiones cambia el renglón).
5. Mensajes (Telegram y `/h/`): "va Borda todo el día con la hidrogrúa y te lleva Gómez", "Los busca Conte a las 17:00…", otros choferes con "Llamar" en "Quiénes van". "Cerrar jornada" muestra los fletes por vehículo ("AB 831 LC: 1 · AB 497 YY: 2"). Diferencias "cambiada después de enviar" por vehículo ("va también el AB 497 YY: los lleva Gómez", "ya no va el AF 669 ZL (Kiska)"); las fotos viejas se comparan con el primer vehículo.

**Migración** `supabase/migrations/20261012000001_hoja_dia_vehiculos.sql` (idempotente, sin BEGIN/COMMIT, **probada contra la base dentro de BEGIN … ROLLBACK el 11/10; sin aplicar**): `personal.puede_manejar` (true para Conte "osmar%" y Ortega "carlos%" sólo si hay un único legajo activo que coincide; si no, NOTICE y no toca), `hd_hoja_vehiculos` con trigger de fecha, índices y UNIQUE parcial (hoja, vehículo), `hd_viajes.hoja_vehiculo_id` (FK SET NULL) y `vuelta_llega`, backfill (un vehículo por hoja con `chofer_modo` ≠ 'sin' y sin vehículos, armado desde el **lleva planeado** con camión si lo hay —el código viejo dejaba moverlo a otro camión— o si no desde las columnas de la hoja; liga sólo viajes **planeados** de las filas que crea la misma sentencia y **del mismo camión**: lleva/mueve con el mismo camión, el busca con el mismo camión y chofer), RLS por `hd_puede_ver`/`hd_puede_editar`, `hd_aplicar` con la tabla nueva.

**Idempotencia.** La migración se puede volver a correr también **después del deploy**: el INSERT sólo toca hojas con chofer y sin ninguna fila (el código nuevo nunca deja una así: al quedarse sin vehículos escribe `chofer_modo = 'sin'`), y el ligado de viajes es una CTE sobre las filas que crea esa misma sentencia, sólo planeados y del mismo camión. Nunca re-liga un viaje que el código soltó a propósito (un mueve o un busca pasados a otro camión) ni toca uno hecho o anulado.

**Para producción (en este orden)**
1. ~~Probar dentro de `BEGIN … ROLLBACK`~~ **hecho el 11/10** (ver arriba): la migración dos veces + `select count(*) from hd_hoja_vehiculos;` + `select apellido, puede_manejar from personal where puede_manejar;` y abortar. (Se probó el backfill y la reparación en una base PGlite con tablas mínimas: hoja con el lleva movido a otro camión, lleva sin chofer, busca con otro camión, lleva hecho y anulado, todo el día, sin chofer; dos corridas iguales y una tercera "después del deploy" que no re-liga el mueve soltado.)
2. **Aplicar la migración ANTES del deploy** (el código nuevo lee `hd_hoja_vehiculos` y `personal.puede_manejar`: sin ellas la Hoja del día no abre): `npx supabase db query --linked -f supabase/migrations/20261012000001_hoja_dia_vehiculos.sql`. Verificar: `select to_regclass('public.hd_hoja_vehiculos'), (select count(*) from hd_hoja_vehiculos), (select count(*) from hd_hojas where chofer_modo <> 'sin'), (select string_agg(apellido, ', ') from personal where puede_manejar);` → los dos conteos iguales y "CONTE, ORTEGA".
3. Merge a `main` (deploy) **enseguida**, mejor fuera de horario (después de mandar las hojas o antes de las 6): lo que el código viejo cambie de chofer/vehículo entre la migración y el deploy no llega a la tabla nueva.
4. **Reparación después del deploy** (siempre; es idempotente y sin hojas para arreglar no hace nada): `npx supabase db query --linked -f scripts/sql/hoja-dia-vehiculos-reparar.sql`. Arma la fila de las hojas con chofer que el código viejo creó en ese rato sin fila en `hd_hoja_vehiculos` y liga sus viajes planeados del mismo camión (es la misma sentencia que el backfill). Igual el código nuevo no les borra el lleva ni el busca: al primer gesto adopta el lleva como fila implícita (`planVehiculos`), pero hasta entonces la tarjeta las ve "sin chofer" y una de "todo el día" no muestra su chofer.
5. Las hojas que YA tenían fila y a las que el código viejo les cambió chofer o vehículo en ese rato no se reparan solas (no se sabe cuál de los dos vale): listarlas con `select h.id, h.cuadrilla_odoo_id from hd_hojas h left join lateral (select * from hd_hoja_vehiculos x where x.hoja_id = h.id order by x.orden limit 1) x on true where h.fecha >= current_date and (h.chofer_modo <> coalesce(x.modo, 'sin') or h.chofer_id is distinct from x.chofer_id or h.vehiculo_id is distinct from x.vehiculo_id);` **enseguida después del deploy** (después, "Elegir otro chofer" de Camiones cambia el chofer de las filas sin tocar el resumen y aparecerían diferencias que no son errores) y corregir esas tarjetas en la pantalla.

**Cómo se probó**: tests (`node --no-warnings --experimental-strip-types --test "src/lib/**/*.test.ts"`, 387 en verde; nuevo `vehiculos.test.ts` con: habitual distinto que NO avisa, un camión con dos choferes por tramos, choque real de vehículo, choque real de chofer en dos camiones, todo el día + viaje de otra cosa, Conte elegible y en Sin asignar, Conte a cargo y chofer contado una vez y sin "dos lugares", Conte chofer de otra cuadrilla sí avisa, dos vehículos con modos distintos con la diferencia después de enviar, resumen legado, propuestas sin pisar, vuelta al depósito que libera el camión y corre la llegada, busca con otro camión, busca a definir, busca sin quién los lleve, todo el día ⇄ lleva y trae; y casos en `optimista.test.ts` y `deshacer-regla.test.ts`), `npx tsc --noEmit`, `npx eslint` sobre lo tocado, `npm run build` (con variables de mentira: no toca la base) y Playwright con el martes 13 servido por una ruta temporal (borrada) con las APIs interceptadas (el "servidor" falso aplica cada gesto con optimista.ts): nunca dice "lo maneja", C3 con la hidrogrúa sigue con Kiska, "+ Otro vehículo" visible en ~70 ms con el POST demorado 1,5 s, Gómez lleva y vuelve al depósito 8:30, busca a definir → otro camión con Conte, Conte a cargo y chofer "5 de 5" y "a cargo · chofer", Camiones por tramos tras "Cambiar chofer", editor y celular del capataz a 390 px sin scroll horizontal.

**Riesgos y pendientes**
- La migración se probó contra la base (rollback, 11/10); falta probar con datos reales las escrituras de los gestos nuevos, el Deshacer de un gesto de vehículos ni el backfill con los datos reales.
- Un Deshacer de un gesto de antes de la migración que cambió chofer/vehículo restaura sólo las columnas viejas (resumen), no la tabla nueva.
- `hd_camiones_dia` sigue existiendo como sugerencia; "Elegir otro chofer" pasa TODOS los viajes pendientes del camión (también los de un tramo con otro chofer).
- Los ids provisorios: un renglón recién sumado queda deshabilitado hasta el refresco (~1 s).
- Pasar el lleva a "sin camión" en Camiones deja el renglón sin camión ni chofer (no se suelta del renglón).
- Si entre la migración y el deploy el código viejo pasó a otro camión el lleva de una hoja que ya tenía fila, ese lleva queda en su camión (Camiones lo muestra ahí) y el renglón de la tarjeta con el suyo hasta que alguien cambie el camión o el chofer de ese renglón: ningún gesto ajeno lo mueve (ver "Correcciones de la revisión (12/10)").
- El otro agente (tiempos de Google Maps) toca `durDe` y `DiaHoja`: acá no se tocó `durDe` (la vuelta al depósito se calcula en `conVuelta`, aparte).

Dónde está: Operaciones › Planificación › **Hoja del día** (`/planificacion/hoja`; Camiones en
`/planificacion/hoja/camiones`), y la pestaña "Tablero · Hoja del día" arriba del tablero.
El link del celular es `/h/<token>`. Módulo de permiso propio: `hoja-dia`.

## Qué hay

- **El módulo completo.** Migración, lógica pura portada de la maqueta (`estado.ts`, `camiones.ts`), servicio de Supabase + Odoo, APIs, link público `/api/public/hoja/[token]` (con foto del remito), bot de Telegram con webhook, hooks de TanStack Query, alertas a la campanita, la precarga de "Cerrar jornada", y las pantallas: Cuadrillas, Camiones, el celular `/h/[token]` (con sin señal), lista de envío, ausencias, la pestaña en Planificación, "Pasar a pedido" en el cajón, Telegram y "Puede estar a cargo" en Legajos. El contrato está en `implementacion.md`.
- **Sincronización Legajos ← Empleados de Odoo**, activa (ver su sección abajo).

## Qué se hizo en producción (10/10)

1. **Migración aplicada** (`20261011000001_hoja_del_dia.sql`). Verificado: 15 tablas `hd_*` con RLS, funciones `hd_nivel`, `hd_aplicar`, `hd_contar`, 20 parámetros, 4 lugares, 6 personas "puede estar a cargo" (Conte, Miño Horacio, Ortega, Hepper, Sack, Pérez). Antes se probó dos veces dentro de `BEGIN … ROLLBACK`.
2. **Vínculos aplicados**: 20 legajos ↔ `hr.employee` por nombre, 18 con celular traído de Odoo (sólo donde el legajo no tenía). Las 5 cuadrillas ↔ `x_aba_cuadrilla`; la **Cuadrilla 5 se creó** en Configuración de cuadrillas.
3. **Limpieza de Legajos** (con el dueño). Los 28 legajos originales se cargaron a mano el 21/06, todos "operario" y con DNI `TMP-…`; nunca se cruzaron con Odoo.
   - 3 nombres corregidos para que coincidan con Odoo y vinculados: Gongora Mendez Cesar Mercedes (#6), Gomez William Estanislao (#16), Omar Victor Hugo Ramon (#15).
   - **Inactivos** López Carlos, Arrieta Cesar, Teodorovich Ivan y Polo Lucas: no existen en Empleados de Odoo, ni archivados. Se sacaron de los planteles base. Arrieta era el responsable de la Cuadrilla 1, que quedó **sin responsable**.
   - **Iñaki Capurro** es el técnico de SyH: puesto `tecnico`, activo, sin empleado en Odoo, fuera de los planteles. No aparece para asignar a cuadrillas.
4. **Deploy** (merge del PR #3). Probado desde afuera: `/planificacion/hoja` pide login, `/h/<token>` responde, el webhook de Telegram sólo acepta POST y el cron devuelve 401 sin clave.
5. **Regla de Odoo creada**: "AndamiosOS sync empleados" (`base.automation` id 55). Probado: el webhook de producción contesta 202 con la clave y 401 sin ella.
6. **Puesta al día de Legajos**: se crearon los 7 andamistas que faltaban, con DNI de Odoo: Della Corte, García Javier, Muñoz Leonardo, Vargas, Geloz, Sena Ayrton y Taboada. Legajos queda en **31 activos, 30 vinculados** con Odoo (el único sin vínculo es Capurro) y 4 inactivos. Los 15 administrativos de Odoo no llevan legajo, a propósito.

## Contratistas (10/10, noche) — en producción (PR #4)

Decisión del dueño: a veces se terceriza mano de obra con **contratistas** (varios, p. ej. Tomás Quintana). No son empleados (ni Legajos ni Odoo); sólo se sabe **cuántos** van; van **dentro de las cuadrillas del tablero** (solos o con gente nuestra); se les paga por persona y jornada; **el parte de Odoo no cambia** (cuentan en la cantidad como los nuestros); nada de documentación por ahora. La especificación está en `modulo.md` §20 y el contrato en `implementacion.md`.

**Qué se hizo**
- **Datos** (`20261011000002_hoja_dia_contratistas.sql`, idempotente, probada dos veces dentro de `BEGIN … ROLLBACK` contra la base linkeada y verificado después que las tablas no existen): `hd_contratistas`, `hd_hoja_contratistas` (cantidad por hoja, UNIQUE hoja+contratista, `fecha` por trigger), `hd_hojas.a_cargo_contratista_id` (UNIQUE parcial por fecha: a cargo de una hoja por día), `contratista_id` en `hd_links` / `hd_telegram_codigos` / `hd_telegram_mensajes` con el CHECK "exactamente uno" (`num_nonnulls`), RLS por `hd_nivel`, `hd_aplicar` con las dos tablas nuevas. Lista blanca del Deshacer (`deshacer-regla.ts`) y entidad `contratista` del historial.
- **Lógica pura**: estado.ts (cuántos van, a cargo, problemas "Falta cuántos van de Quintana" y "dado de baja", sugerencia de a cargo, foto y diferencias "va Quintana con 4 / Quintana pasa de 4 a 3 / no va Quintana", precarga y "Copiar como hoy", mano de obra del cierre) + `contratistas.ts` (chips, panel, "3 de Quintana + Ramírez", resumen del mes con prorrateo por obra). Tests: `contratistas.test.ts` (11 casos).
- **Servidor**: `quien.ts` (persona / externa / contratista para links, Telegram y mensajes), `contratistas-servidor.ts` (resumen del mes: Supabase + una pasada a Odoo para nombres de cuadrilla y fracciones), acciones `contratista_sumar` / `contratista_quitar` / `contratista_nota` / `a_cargo` con contratista, alta/edición en `/api/hoja-dia/contratistas`, el webhook de Telegram vincula contratistas, `precargaCierre` suma su gente.
- **Pantallas**: chip "+3 de Quintana" con − / + y su menú en la tarjeta; grupo "Contratistas" en el panel Gente (arrastrar suma 1, tocar → "Agregar a la Cuadrilla N…" con cantidad; también en "+ Agregar"); hojas laterales "Contratistas" (administrar, con Hoja del día en editar) y "Contratistas · octubre" (resumen); el celular del referente muestra "Van 4 · 3 de Quintana + Ramírez"; "Cerrar jornada" aclara "incluye 3 de Quintana".
- De paso: en la vista Cuadrillas, el diálogo "Celular de…" y "Cerrar jornada" tenían la misma `key` ("-") como hermanos (React avisaba "two children with the same key" y podía no desmontar bien una hoja lateral); ahora tienen claves distintas.

**Cómo se probó**: tests (`node --no-warnings --experimental-strip-types --test "src/lib/**/*.test.ts"`), `npx tsc --noEmit`, `npx eslint` sobre lo cambiado, `npm run build`, y Playwright con el escenario del martes 13 (la 5 de Quintana con Ramírez, +1 de Quintana en la 4) servido por una ruta temporal (borrada) con las APIs interceptadas: chip y stepper, menú del chip, grupo del panel, "Agregar a la Cuadrilla 2" con 2, arrastrar al panel, "+ Agregar", alta en Administrar, resumen del mes, el celular del referente a 390 px y la tarjeta a 390 px sin scroll horizontal.

**Para producción (en este orden)**
Pasos 1 y 2 **hechos el 10/10** (migración aplicada y verificada, después merge del PR #4 y deploy ok). Queda el 3, del lado del dueño.

1. **Aplicar la migración ANTES del deploy** (el código nuevo lee `hd_contratistas` y `hd_hoja_contratistas` al leer el día: sin ellas la Hoja del día no abre): `npx supabase db query --linked -f supabase/migrations/20261011000002_hoja_dia_contratistas.sql`. Verificar: `select to_regclass('public.hd_contratistas'), to_regclass('public.hd_hoja_contratistas'), (select count(*) from pg_constraint where conname in ('hd_links_un_destinatario','hd_telegram_codigos_un_destinatario'));` → las dos tablas y `2`.
2. Merge de `feat/hoja-dia-contratistas` a `main` (deploy en Vercel).
3. Dar de alta a los contratistas (Hoja del día › panel Gente › Contratistas › Administrar): nombre, referente, celular y, si se quiere el total del mes, el valor por persona y jornada. Si el referente va a recibir hojas, "Copiar link para vincular" (Telegram) una vez.

**Lo que queda / conocido**
- Si la hoja está a cargo de un contratista, "Cerrar jornada" no precarga **puntero** (no hay `hr.employee`): se elige a mano. El parte no cambia (decisión 5).
- Un contratista está a cargo de **una sola hoja por día** (su link es uno por día). Si un día tiene dos cuadrillas suyas, la otra la recibe alguien nuestro o se manda a mano.
- El prorrateo por obra del resumen usa el tablero de hoy para días pasados: si se mueve una obra de un día ya trabajado, cambia el reparto (no las jornadas).
- Fase 2: documentación (ART/seguro), exportar el resumen y marcarlo pagado.

## Domingo (10/10, noche — PR #5)

El dueño trabaja algunos domingos. La hoja salteaba el domingo (el sábado, "Mañana" era el lunes; las flechas no pasaban). Ahora el domingo es un día más (`dias.ts`): el sábado, "Mañana" es el domingo, y el domingo abre en el domingo. Si el tablero no tiene obras ese día, la hoja dice "El tablero no tiene obras el domingo N". Las obras del domingo se ponen en el **tablero**: en la ficha de la obra, "Jornadas de la obra" › "Trabajar el domingo", o arrastrando a la columna del domingo si ya está activa.

## Latencia (10/10, noche — en `main`)

El dueño: "cada cambio tarda mucho". Medido contra la base real (sólo lectura, script fuera del repo, mediana de 5, desde Buenos Aires: ~280 ms por ida a Supabase):

| Qué | Antes | Ahora |
|---|---|---|
| GET del día (abrir / volver / refrescar) | ~1,3 s siempre (26 consultas + 6 a Odoo; picos de 2,9 s) | ~0,6 s con el tablero en caché; ~1,3 s en frío o con `fresco` |
| Lo que lee el servidor en cada gesto | `leerDia` entero: ~0,6 s (26 consultas), ~1,3–3 s si el caché de Odoo de 45 s ya venció | `leerContexto`: ~0,3 s (8 consultas en una vuelta; 14 para modo/chofer), sin Odoo |
| Escrituras de un gesto | cada UPDATE leía la fila antes (2 idas), cada DELETE también | UPDATE con la fila ya leída (1 ida), DELETE … RETURNING (1 ida) |
| Después del gesto | el cliente pedía el día entero con Odoo (~1,3 s) antes de mostrar el cambio | el cambio se ve **al instante** (~30–75 ms medido con Playwright, con el POST demorado 1,5 s); el día se pide en segundo plano, uno por ráfaga |

Qué cambió:
1. **Optimista en el cliente** (`src/lib/hoja-dia/optimista.ts`, puro y con tests): agregar / sacar / pasar / reemplazar, a cargo (persona o contratista), recibe, contratista ± / quitar / nota, modo, chofer, vehículo, pasar chofer, encuentro, lleva / busca, carga del lleva, notas, instrucciones y liberar. Usa `planModo` / `planSoltarChofer` de estado.ts (la misma regla que el servidor) y el cambio mínimo al objeto. `useGesto` (`use-hoja-dia.ts`) lo aplica en `onMutate` (cancela la lectura en vuelo), y si el servidor dice que no vuelve atrás (si nadie lo tocó después) y muestra el error. El toast con Deshacer es el mismo. "Copiar como hoy", "Mueve", la precarga, viajes de camión, pedidos y envíos no se adivinan: esperan al servidor como antes.
2. **Refresco en segundo plano** (`refrescarHoja`): un solo GET 0,5 s después del último gesto de una ráfaga, nunca con un gesto en vuelo (todas las mutaciones llevan `mutationKey ["hoja-dia","gesto"]`). Los avisos en vivo de otros pasan por el mismo refresco. El broadcast propio no vuelve (`self: false`).
3. **El servidor no lee el día entero por gesto** (`leerContexto` en servicio.ts + `PARTES` en acciones.ts): hojas del día, su gente y sus contratistas, Legajos, externas, contratistas, parámetros y los nombres de las cuadrillas (del tablero ya leído o de Configuración de cuadrillas). Modo y chofer suman flota, el día anterior y las obras (Odoo con caché de 2 min, casi siempre ya lo dejó el GET); `a_cargo` suma los envíos; `vehiculo`, la flota. "Copiar como hoy" y "Mueve" siguen con el día entero (con caché). Las garantías no cambian: historial y Deshacer (el grabador guarda la fila de antes: la que ya leyó el gesto, la que dejó él mismo, o la que devuelve el DELETE), `conGrabador`/`hd_aplicar`, escrituras con la sesión (RLS), y "una persona en una cuadrilla por día" / "un a cargo por hoja" siguen siendo índices únicos de la base.
4. **`leerDia`** en dos vueltas (todo lo independiente sale junto con las hojas anteriores) y con Odoo/asistencia en caché por fecha (decisión 13). Un gesto ahora ve la asistencia si ya estaba leída (antes no la veía nunca).

Riesgos conocidos:
- **Si lo adivinado y lo del servidor no coinciden** (p. ej. otro coordinador cambió la misma tarjeta, o una regla que el navegador no ve), se ve lo adivinado hasta el refresco (~0,5 s después de que contesta el servidor) y ahí queda lo del servidor. Si el servidor rechaza, se vuelve atrás y sale el error.
- Las filas nuevas tienen id provisorio (`tmp-…`) hasta el refresco: si en ese segundo se abre el historial de una tarjeta recién creada o se toca un viaje recién creado, el servidor contesta "Id inválido" (se reintenta un segundo después).
- El caché de Odoo es por instancia del servidor: un cambio hecho a mano en Odoo (no desde el tablero de la app) tarda hasta 30 s en verse en la hoja; uno desde el tablero de la app llega con el aviso en vivo y se pide `fresco`.
- Si hiciera falta bajar más el GET: se puede pasar a una sola vuelta trayendo las hojas anteriores con sus integrantes/contratistas/viajes embebidos (PostgREST), ~0,3 s menos desde Buenos Aires.

## Google Maps y tiempos de recorrido (12/10 — rama `feat/hoja-dia-google-maps`, sin merge)

El dueño: "¿se podría integrar Google Maps y tiempos de recorrido?". Las horas estimadas de los camiones salían de duraciones típicas fijas (`durDe`, `duracionViaje`, la vuelta de 60 min y el hueco de 45 entre viajes).

**Qué hace**
1. **Tiempos reales** con la Routes API (`computeRouteMatrix`, `DRIVE`, `TRAFFIC_AWARE`, `departureTime` = la mitad de la franja de media hora del tramo ese día en BA; si ya pasó, sin `departureTime`). Lo pide el servidor al leer el día (`rutas-servidor.ts` → `DiaHoja.tiempos`) y `estado.ts` lo usa en `durDe` cuando está (ver modulo.md §6, "Tiempos de manejo reales").
2. **Sólo los tramos que se usan** (`paresDelDia`, rutas.ts): paradas seguidas de cada camión y su vuelta al depósito (no si tiene la llegada cargada a mano); por cuadrilla, obra → obra (el manejo de la tarjeta). Depósito → primera obra ya es la parada del lleva, y última obra → depósito no la usa nadie: no se piden. Sin repetir y sólo con coordenadas en los dos puntos. Un pedido por franja (Google acepta un `departureTime` por pedido): la matriz entera si son justo los tramos que faltan, si no uno por origen (nunca se paga un cruce que nadie usa).
3. **Caché**: en memoria por instancia y en `hd_tiempos` (origen/destino redondeados a ~100 m, franja de 30 min, hábil/sábado/domingo, minutos, metros, `actualizado`; vale 14 días). De `hd_tiempos` se leen sólo los tramos del día que faltan en memoria, vigentes, por franja y en lotes de hasta 900 filas (PostgREST corta en 1000); un tramo que no estaba no se vuelve a buscar por 10 min. El mismo tramo a la misma franja en otro martes no se vuelve a pagar.
4. **Nunca rompe ni demora**: sin clave, con 403, sin la tabla o sin coordenadas, las típicas de siempre. **Sólo el GET de la pantalla** (`/api/hoja-dia`, `leerDia(f, { tiempos: "google" })`) le pide a Google y lo espera como mucho 2,5 s (en paralelo con el bot de Telegram); lo que llega tarde se guarda igual (`after`) y sirve para la próxima. Los gestos, los envíos y el link del celular leen con `soloCache`: memoria y `hd_tiempos`, sin esperar a Google. Si Google contesta error, no se le pide nada por 10 min (un log `[hoja-dia] Routes API: 403 SERVICE_DISABLED…` en Vercel).
5. **Pantallas**: "~35 min en auto" con ícono (auto = Google, reloj = típico; el porqué en el `title`) en la lista de Camiones, en el `title` de cada ficha y en el menú del viaje; en la tarjeta, el manejo entre dos obras (sólo Google). Links a Maps (gratis, sin clave, `https://www.google.com/maps/dir/?api=1…`, al pin o a la dirección): "Cómo llegar" en el menú del viaje, "Ver el recorrido en Maps" en el menú del camión, en el celular del chofer ("Ver el recorrido en Maps" con sus paradas que faltan y "Cómo llegar" por parada), "Cómo llegar" en las obras del capataz y un botón "Ver el recorrido en Maps" en el Telegram de los viajes del chofer. Si el depósito no tiene coordenadas, Camiones dice "Cargá la dirección del depósito para calcular tiempos reales".

**Cómo entra en estado.ts** (para mergear con otros cambios de la cuenta): en `durDe` (`durConTramo` de tiempos.ts antes de la típica, recibe `haciaKey`), en `calcVeh` la vuelta (`vueltaCon`) y el `conflicto` (`llegadaCon`: con el tramo real, una fija que no es "lleva" mira si llega manejando), y en `camionesQueSirven` el hueco mínimo (`huecoMinimo`: el parámetro de 45 o el manejo hasta lo que sigue, lo que sea más). Las reglas están en `tiempos.ts` (puro, sin estado.ts).

**Para producción (en este orden)**
1. **Google Cloud, proyecto 261735489589** (el de la clave del mapa): APIs y servicios → Biblioteca → **"Routes API" → Habilitar** (hoy contesta 403 `SERVICE_DISABLED`). Tiene que tener facturación activa.
2. **Una clave para el servidor**: Credenciales → Crear clave → restringirla a la API "Routes API", **sin** restricción de sitios web (la llama el servidor; Vercel no tiene IP fija). Cargarla en Vercel como `GOOGLE_MAPS_API_KEY` (Production y Preview) y redeploy. Sin ella se usa `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, que si está restringida a sitios web va a contestar 403 desde el servidor: conviene la clave aparte. Poner un tope de cuota diaria (p. ej. 2.000 elementos/día) en Cuotas de la Routes API como red de seguridad.
3. **Migración** (opcional para que ande; sin ella no hay caché persistente y cada instancia vuelve a pedir lo suyo): probar con `BEGIN; … ROLLBACK;` y aplicar `npx supabase db query --linked -f supabase/migrations/20261012000002_hoja_dia_tiempos.sql`. Verificar: `select to_regclass('public.hd_tiempos');`. Se puede aplicar antes o después del deploy. **No se aplicó.**
4. Merge de la rama a `main`.
5. **Dirección y coordenadas del Depósito** en `hd_lugares` (y de Sanz, la VTV y el taller): sin ellas los tramos que salen o vuelven al depósito van con la típica. Hoy no hay pantalla para editar lugares (está `POST /api/hoja-dia/lugares` con `accion: "editar"`), se carga con SQL: `update hd_lugares set direccion = '…', lat = …, lng = … where tipo = 'deposito';`.

**Costo estimado.** La Routes API cobra por elemento (un origen × un destino); con tránsito (`TRAFFIC_AWARE`) es el SKU "Compute Route Matrix Pro", del orden de **USD 10 por 1.000 elementos** con **5.000 gratis por mes** (precios de Google desde marzo de 2025; confirmarlos en la consola). Un día como el martes 13 de la maqueta son ~19 tramos; con los cambios del día (viajes nuevos, horas que se corren de franja) **~30 a 60 elementos por día**, ~1.000 por mes de 22 días: entra en lo gratis. Fuera de lo gratis serían ~USD 0,30–0,60 por día. Los links a Maps no cuestan nada. Una lectura que encuentra todo en caché no llama a Google.

**Cómo se probó**: tests (`tiempos.test.ts`, `rutas.test.ts`, `rutas-servidor.test.ts`: claves, franjas, salida, `durDe` con y sin tiempos, el choque con tramo real, pares, URLs, el parseo de una respuesta de ejemplo, 403 y Google colgado con `fetch` falso; nunca la API real), `npx tsc --noEmit`, `npx eslint`, `npm run build`, y Playwright con una ruta temporal (borrada): Camiones en línea de tiempo y en lista con tiempos de Google y típicos, el menú del viaje (abre Cómo llegar), el menú del camión, el aviso del depósito, la tarjeta, y el celular del chofer y del capataz a 390 px sin scroll horizontal. **No se probó contra Google** (la API está apagada) ni se escribió en la base.

**Riesgos / pendiente**
- Las duraciones de la parada (`PARADA_MIN` en tiempos.ts) son una primera estimación: ajustarlas con el uso (podrían pasar a `hd_parametros`).
- El "lleva" que sigue a otro "lleva" (Kiska lleva la 2 y después la 3, las dos con encuentro en el depósito) toma como origen la obra anterior, como ya hacía la cuenta típica: el modelo no pone la vuelta al encuentro.
- El caché por franja hace que correr un viaje de franja pida el tramo de nuevo (una vez); la primera lectura de un día nuevo puede salir con las típicas si Google tarda más de 2,5 s (la siguiente ya tiene los reales).
- Con la clave del mapa (restringida a sitios web) el servidor recibe 403: hace falta la clave del paso 2.
- Las direcciones sin coordenadas (obras de Odoo sin lat/lng) no tienen tiempo real; los links a Maps igual andan con la dirección en texto.
- El recorrido de Maps en el navegador del celular sin la app acepta menos paradas intermedias que en la app.

## Correcciones de la revisión (12/10) — rama `feat/hoja-dia-choferes-y-maps`

Una revisión de las dos ramas juntas (varios vehículos + tiempos de Google) encontró esto; está arreglado en la rama, con un test por hallazgo donde se pudo (`vehiculos.test.ts`, `rutas.test.ts`, `rutas-servidor.test.ts`):

1. **Backfill y gestos que movían viajes de camión.** La migración ligaba el lleva/mueve a la fila sin mirar el camión, y `planVehiculos` después pasaba el viaje al camión de la fila en *cualquier* gesto (la hora del busca, el encuentro, la carga). Ahora la fila sale del lleva planeado, sólo se ligan viajes planeados del mismo camión, y un viaje sigue a su renglón **sólo en lo que el gesto le cambió** (`seguir`: el camión si cambió el camión, el chofer si cambió el chofer, los dos si el renglón es nuevo).
2. **Hojas sin filas** (creadas por el código viejo entre la migración y el deploy): un gesto de vehículos borraba su lleva y su busca. Ahora `planVehiculos` adopta el lleva como **fila implícita** (la crea y liga los planeados del mismo camión); un busca solo, sin lleva, no se toca salvo "Van por su cuenta" / "Vuelven solos". Y `scripts/sql/hoja-dia-vehiculos-reparar.sql` (idempotente) les arma la fila después del deploy (paso 4 de "Para producción" de Choferes y camiones).
3. **Idempotencia post-deploy** de la migración (ver "Idempotencia" en Choferes y camiones).
4. **Los gestos ya no esperan a Google**: `leerDia` usa sólo lo guardado salvo `tiempos: "google"` (el GET de la pantalla).
5. **`hd_tiempos` se cortaba en 1000 filas**: se leen sólo los tramos del día, por franja y en lotes.
6. **La llegada al depósito vieja**: mover o cambiar la hora del lleva en Camiones corre `vuelta_llega` igual que la tarjeta (`correrLlegada`); y `conVuelta` ignora una llegada anterior al fin de la parada (va la estimada). Los gestos de Camiones no son optimistas (esperan al servidor), así que no hubo que tocar `optimista.ts`.
7. **Busca con otro camión**: el editor manda el chofer que resolvió (`choferSugerido`) y el gesto lee las obras: servidor y pantalla eligen el mismo.
8. **El mismo vehículo dos veces en una hoja**: `NoSePuede` al sumar o cambiar, la opción deshabilitada en el selector, el error de la base traducido y la precarga ya no copia un vehículo de otro renglón de la misma hoja.
9. **Tramos que nadie usaba**: fuera depósito → primera obra, última obra → depósito y la vuelta con llegada cargada.
10. **"Copiar como hoy" sobre una hoja enviada** ya no marca cambios fantasma (se compara vehículo + chofer + modo, no el id); con una foto vieja, sumar un vehículo sí es un cambio.
11. **Quitar un renglón** suelta con historial los viajes hechos y anulados que lo nombran (antes la FK los cambiaba por detrás del grabador); "Copiar como hoy" también.

## Decisiones de diseño que no se leen en el código

1. **Telegram en vez de WhatsApp (decisión del dueño, 10/10 tarde).** El bot le escribe a quien lo vinculó una vez con `t.me/<bot>?start=<código>`. "Enviada" se marca SÓLO si Telegram contestó `ok`; si falla, la respuesta trae el `wa.me` con el mismo texto y no marca nada. Sin las variables de Telegram todo funciona a mano (como el Pañol).
2. **El día viaja entero y las cuentas se hacen en el navegador.** `GET /api/hoja-dia` devuelve un `DiaHoja`; `estado.ts` (puro) hace problemas, bandeja, horas de los camiones, avisos, diferencias. El servidor usa las MISMAS funciones para los mensajes: lo que dice la tarjeta y lo que dice el Telegram no pueden divergir.
3. **Las horas son minutos desde las 0:00 del día de la hoja** (Buenos Aires, UTC−3 fijo). La tarde anterior es negativa. `minutosDesde()` convierte.
4. **Un viaje es uno solo.** Los lleva/busca/mueve de una cuadrilla son filas de `hd_viajes` con `hoja_id`. El "lleva" y el "busca" NO guardan la obra: van a la primera y a la última obra del tablero de ese día (`haciaDe`), así un cambio en el tablero los arrastra solos. Si la cuadrilla se suspende o se queda sin obras, sus viajes dejan de contar (`viajesVigentes`).
5. **Lo enviado es una foto por persona** (`hd_links.snap`): "Cambiada después de enviar" = diferencia entre la foto y el día de ahora. Las horas estimadas que se corren no marcan cambiada; las fijas sí. `snap_ok` es "No hace falta avisar"; `snap_recibido`, lo que confirmó con Recibido/Entendido (marca lo "nuevo" en el celular).
6. **La foto vive en `hd_links`, no en `hd_hojas.enviado`** (desvío de la propuesta §14): la maqueta guarda el envío por persona (capataz o chofer), y un chofer no tiene hoja.
7. **Instrucciones con clave (fecha, OT)**, no (fecha, cuadrilla, OT): así siguen a la obra si cambia de cuadrilla (lo que pide §10).
8. **El chofer de "todo el día" no es un integrante**: está en `hd_hojas.chofer_id` y `vanDe` lo suma (Pendiente 10). No hay `es_chofer` en `hd_integrantes`.
9. **Sugeridos calculados, no guardados.** Un "Aceptar" crea el pedido con `sugerido_regla`; un "No hace falta" crea uno anulado con la regla. El UNIQUE `(fecha_original, sugerido_regla, sugerido_ot_id)` hace que no vuelvan.
10. **"Pasar a mañana" con viaje puesto**: el viaje queda ANULADO con motivo "pasa a mañana" (no se borra), así al chofer le llega "te saqué un viaje".
11. **Deshacer genérico, con lista blanca.** Cada gesto guarda en `hd_historial.cambios` las filas de antes y de después. `/api/hoja-dia/deshacer` valida la fila (`deshacer-regla.ts`: sólo tablas `hd_*`, y de Legajos sólo `telefono` y `puede_estar_a_cargo`, sólo actualizar) y la restaura en orden inverso EN UNA TRANSACCIÓN (`hd_aplicar`, SECURITY INVOKER, con la sesión de quien deshace), comparando adentro de la base que cada fila siga como la dejó el gesto. `hd_historial` lo escribe SÓLO el servidor (service role): el cliente no tiene INSERT/UPDATE.
12. **Lecturas con la service role, escrituras con la sesión.** La lectura del día cruza Legajos, flota, pañol y planificación: se hace con la service role después de verificar el permiso en la ruta (`exigirModulo`, segunda llave además del proxy). Las escrituras de `hd_*` van con la sesión del usuario (RLS). Legajos (celular), Telegram, el link público y las ausencias cargadas por RRHH sin Hoja del día van con la service role (después de validar token/secreto/permiso) y quedan en el historial.
18. **Gestos atómicos (I4).** Cada gesto corre en `conGrabador`: si falla a mitad, lo que llegó a escribir se vuelve atrás en un bloque (`hd_aplicar`); si ni eso se puede, queda en el historial como "a medias" con su Deshacer y el error lo dice. Pasar a alguien de cuadrilla es un UPDATE de `hoja_id` (no borrar + insertar).
19. **"Cerrar jornada" nunca reescribe (B1).** `POST /api/planificacion/partes` crea; si la asignación ya tiene parte, 409. Corregir es el PATCH con el id (`Ver parte` → Editar). La tarjeta sabe del parte (`ObraDia.parteId`).
13. **Odoo**: una lectura del día son 4 a 6 llamadas encadenadas (`fetchTableroDeFechas`: sólo las OTs de ese día y del anterior con hojas, con coordenadas y número de jornada; ~1,3–3 s) + la asistencia, en paralelo con Supabase. Desde el 10/10 (noche) las dos salen de un **caché en memoria por fecha** (`servicio.ts`, "Odoo, con caché"): el GET del escritorio acepta 30 s el tablero y 5 min la asistencia; `GET /api/hoja-dia?…&fresco=1` va a Odoo (la pantalla lo pide cuando llega el aviso en vivo del **tablero**); el link público y los gestos, 45 s. Ver "Latencia".
14. **Quién es chofer**: `personal.odoo_tarea = 'chofer'` (lo trae la sincronización de Odoo); sin vínculo, el puesto de Legajos. Legajos dice chofer para Ortega, que actúa de capataz; como en Odoo es andamista (`odoo_tarea`), aparece en "Sin asignar" y puede estar a cargo.
15. **Nombres**: el apellido con `nombrePropio()`; si dos lo comparten, con la inicial ("Miño H.", "Miño J."; también hay dos Valenzuela). Desde el 10/10 (noche) `Persona.pila` trae el nombre de pila: el panel Gente, "+ Agregar" y "Quiénes van" del celular dicen "Taboada · Fernando", y los buscadores buscan por nombre o apellido (`coincidePersona`: todas las palabras, sin tildes). Los chips de la tarjeta siguen cortos, con el nombre entero en el `title`/aria-label.
20. **Quién se asigna**: `Persona.deObra` (`esPersonalDeObra`): la tarea de Odoo si hay (andamista, herrero, chofer), si no el puesto de Legajos (operario, capataz, chofer). Un técnico (Capurro) o un administrativo no aparece en "Sin asignar", "No disponibles" ni "+ Agregar". La ART de la asistencia (`x_tipo_ausencia = "accidente"`) se lee "ART / accidente".
16. **Módulo `hoja-dia` dentro de Planificación**: `puedeAbrir` ahora elige el módulo por la ruta MÁS LARGA (`moduloDeRuta`), si no `/planificacion/hoja` la abría cualquiera con Planificación.
17. **Duraciones de la maqueta** (no las de la tabla de §6): busca 30 min y trae 30 + 60 de vuelta al depósito.

## Correcciones de la revisión (10/10)

| Hallazgo | Qué se hizo |
|---|---|
| B1 Cerrar jornada reescribía/duplicaba el parte | `ObraDia.parteId`; tarjeta "Jornada cerrada HH:MM · puntero, N personas · Ver parte"; POST de partes → 409 si ya hay parte (`parte-existente.ts`). El tablero sigue igual (POST nuevo, PATCH con id) |
| I8 precarga del cierre | Fletes de la hoja sólo si registró viajes (si no, la regla N+1 de siempre); horarios por obra/encuentro/busca (`horariosCierre`); marcado "Sugerido según la Hoja del día" |
| B2 Deshacer sobre cualquier tabla | Lista blanca + validación de la fila; `hd_aplicar` transaccional con la sesión; historial sólo del servidor |
| I1 adjuntos públicos | Imágenes y PDF en línea; el resto `attachment` + `octet-stream`; `nosniff`; CSP `sandbox` (no en PDF: los visores no abren con sandbox) |
| I2 Recibido viejo | Se compara la versión del botón (Telegram) o de la vista (link); vieja → "Esa hoja cambió, mirá la nueva" |
| I3 viaje anulado / ajeno | `porQueNoPuedeMarcar`; el mensaje de Telegram pierde los botones; reintentos idempotentes (no anotan dos veces) |
| I4 gestos a medias | `conGrabador` + `hd_aplicar` (ver decisión 18) |
| I5 Pasar a mañana | Saca sólo ese pedido (`sacarPedidoDeViaje`); anula el viaje sólo si queda vacío. También al anular el pedido |
| I6 flete de afuera | Un solo POST (`crear` con `pedidoId`): el pedido queda `en_camion` apuntando al flete |
| I7 alertas de días pasados | `diaAlertable`: un día pasado no alerta |
| I9 ausencias desde Personal | Sin Hoja del día en editar, escribe el servidor (después de verificar Personal) y saca de las hojas; avisa si una hoja ya estaba enviada |
| I10 `?veh=`, `?viaje=`, `?pedido=` | Camiones enfoca la fila, abre el menú del viaje o resalta el pedido (`&hacer=poner\|esperar\|flete`) |
| Menores | Tokens fuera del GET y RLS de `hd_links` para quien edita; GET de envíos sin efectos (y reintento si dos crean el link); límites atómicos (`hd_contar`: 30 toques y 120 lecturas/min por token) y caché de adjuntos permitidos; horas 0:00–23:59; encabezado sin hydration mismatch y con `hora_corte_manana` del servidor; Deshacer sólo de lo mandado a mano; Pasar a pedido sólo para quien puede guardarlo; menú visible con Hoja del día sin Planificación; código de Telegram de un uso atómico y 7 días; botón de viaje de Telegram mira el vencimiento |
| Huecos | Foto del remito (endpoint, celular y menú del viaje con URL firmada); carga del "lleva" editable; aviso "Cambió el tablero"; Telegram para "Sacarlo un rato", "Avisar tarde" (mensaje), "Vuelven por su cuenta" y la lista completa al depósito (`avisar_mensaje`, con respaldo a mano) |
| Duplicados | Camiones usa `comunes/` (menú flotante, campo de hora, botones, kbd, `mensaje-a-mano`, hoja lateral; `pasar-a-pedido` movido). `camiones.ts` queda aparte de `estado.ts` a propósito |

Tests nuevos: `parte-existente.test.ts`, `cierre.test.ts`, `deshacer-regla.test.ts`, `reglas-publico.test.ts`, `archivo-seguro.test.ts`, y casos en `camiones`, `dias`, `vista-cuadrillas`, `mensajes`.

## Orden para salir a producción

Pasos 1 a 3 y 6 a 8 **hechos el 10/10** (ver "Qué se hizo en producción"). Faltan el 4 y el 5 (Telegram) y los permisos del 6. Se deja el detalle por si hay que repetirlo en otro ambiente.

1. **Aplicar la migración** (antes del deploy: el código depende de ella): `npx supabase db query --linked -f supabase/migrations/20261011000001_hoja_del_dia.sql`. Verificar: `select to_regclass('public.hd_hojas'), to_regproc('public.hd_aplicar'), to_regproc('public.hd_contar');`
2. **Vínculos en simulacro**: `node --env-file=.env.local scripts/hoja-dia-vincular-cuadrillas.mjs` y `node --env-file=.env.local scripts/hoja-dia-vincular-personal.mjs` (sólo muestran). Revisar los cruces dudosos (dos Miño, dos Valenzuela).
3. **Vínculos de verdad**: los mismos dos con `--aplicar`.
4. **Variables de Telegram** en Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (bot creado con @BotFather). Cargar en `hd_parametros` el teléfono del coordinador y el del depósito (y `deposito.telegram_chat_id` si el depósito usa Telegram).
5. **Webhook**: `node --env-file=.env.local scripts/telegram-webhook.mjs https://<dominio>`.
6. **Deploy** de la rama (merge a main). Después: permisos "Hoja del día" (editar) a Juan Agustín, Ezequiel y Joaquín, y vincular Telegram de capataces y choferes.
7. **Regla de Odoo para Legajos** (después del deploy, ver abajo): `node --env-file=.env.local scripts/odoo-webhook-empleados.mjs` (simulacro) y después con `--aplicar`.
8. **Puesta al día de Legajos**: `node --env-file=.env.local --experimental-strip-types scripts/personal-sincronizar-odoo.mjs` (simulacro: hoy crea los 7 andamistas que faltan) y después con `--aplicar`.

## Legajos ↔ Empleados de Odoo (sincronización automática)

Decisión del dueño (10/10): cuando se da de alta, se modifica o se da de baja un empleado en Odoo (`hr.employee`), Legajos (`personal`) se actualiza solo. **Un solo sentido**: Odoo es el dueño de los datos de la persona; la app suma lo suyo (`puede_estar_a_cargo`, Telegram, planteles, pañol, `user_id`) y eso la sincronización no lo toca nunca. En Odoo no escribe nada.

**La regla** (`src/lib/personal/sync-odoo.ts`, pura, con tests):
- Cruce: por `odoo_employee_id`; si no, por DNI (`identification_id`, sólo dígitos) entre los legajos sin vínculo; si no, por nombre normalizado entre los legajos sin vínculo. Misma regla que `hoja-dia-vincular-personal.mjs` (que ya se aplicó y queda reemplazado por `personal-sincronizar-odoo.mjs`).
- Con legajo: vincula y actualiza `activo` (archivado en Odoo → legajo inactivo), `odoo_tarea` y `telefono` **sólo si el legajo no tiene**. El `puesto` no se toca (Ortega es chofer en Legajos y andamista en Odoo, a propósito).
- Sin legajo: se **crea** sólo si es **operario** y está activo. Operario = `x_regimen_liquidacion = "operarios"` (o, si el régimen está vacío, que tenga `x_tarea`). En Odoo el régimen separa limpio: los 31 de obra (30 activos y Belizán, archivado) tienen `operarios` + tarea (andamista/chofer/herrero); los 15 de oficina, `administrativos` y sin tarea. `employee_type` NO sirve (Geloz, Sena Ayrton, Taboada y Vargas son operarios cargados como "employee"). Al crear: apellido/nombre partidos de "APELLIDO, Nombres" (en mayúsculas como el resto), DNI de `identification_id` (si no hay, `TMP-NOMBRES-APELLIDO`), puesto `chofer` si la tarea es chofer y si no `operario`, `user_id` null.
- Dudoso (no se toca, se avisa): dos legajos sin vínculo con el mismo nombre o DNI, un DNI o nombre que ya es del legajo de OTRO empleado, un empleado activo sin régimen ni tarea.
- Nunca borra. Los legajos sin vínculo que no cruzan quedan como están (López, Arrieta, Teodorovich y Polo, de baja a mano; Capurro, técnico de SyH). Un legajo vinculado a un empleado que se **borró** de Odoo se desactiva.

**Las tres entradas** (las tres con la misma regla):
1. **Webhook** `POST /api/odoo/webhooks/empleados?secret=ODOO_SYNC_SECRET` — lo llama el automatismo de Odoo "AndamiosOS sync empleados" (`base.automation` on_create_or_write sobre `hr.employee` + `ir.actions.server` state=webhook que manda sólo el id; mismo mecanismo que clientes/obras/OTs). Dispara al crear y al cambiar `name`, `active`, `mobile_phone`, `work_phone`, `x_tarea`, `x_regimen_liquidacion`, `identification_id`. Contesta 202 al validar el secret y sincroniza en `after()` releyendo el empleado de Odoo. Idempotente (dos altas a la vez chocan con el UNIQUE de `odoo_employee_id`). Log en Vercel: `[webhook empleado N]`.
2. **Control diario** `GET /api/cron/personal-odoo` (05:30 BA, `30 8 * * *` UTC en `vercel.json`, protegido por `CRON_SECRET`): todos los empleados, activos y archivados. Respaldo por si un webhook se perdió. Si Odoo no devuelve empleados, no toca nada.
3. **Script** `scripts/personal-sincronizar-odoo.mjs`: la misma pasada a mano, simulacro por defecto.

**Avisos**: tipo `personal_odoo`, sólo campanita, a **cada persona activa con Legajos en editar** (y admins) por `destinatario_id`. Un aviso por empleado y motivo, una sola vez (clave `personal_odoo:<empleado>:<motivo>:<usuario>`): el alta automática ("Legajos: alta desde Odoo — …", para revisar si puede estar a cargo y vincular Telegram), lo dudoso y lo que falló al escribir.

**Cómo se activa** (hecho el 10/10: regla id 55 en Odoo y 7 legajos creados; queda por si hay que repetirlo):
1. Deploy (las rutas tienen que existir antes: si no, Odoo llama a un 404 dentro del guardado del empleado).
2. `node --env-file=.env.local scripts/odoo-webhook-empleados.mjs` (simulacro: muestra lo que crearía) → con `--aplicar` lo crea en Odoo. Idempotente: si ya existe, lo deja activo con esos campos y esa URL.
3. `node --env-file=.env.local --experimental-strip-types scripts/personal-sincronizar-odoo.mjs` (simulacro) → con `--aplicar`. Simulacro del 10/10: 23 al día, **7 a crear** (Della Corte, García Javier, Muñoz Leonardo, Vargas, Geloz, Sena Ayrton, Taboada; los 7 puesto operario, tarea andamista, con DNI de Odoo), 16 sin legajo a propósito (15 administrativos y Belizán, archivado), 0 dudosos.

**Cómo se apaga**: `node --env-file=.env.local scripts/odoo-webhook-empleados.mjs --desactivar --aplicar` (deja la regla archivada en Odoo; se vuelve a prender corriendo el script con `--aplicar`). Para apagar también el control diario, sacar la entrada `/api/cron/personal-odoo` de `vercel.json` (o borrar `CRON_SECRET`, que lo apaga junto con los otros crons). Lo que ya se creó en Legajos queda.

## Lo que falta

**Para usarlo** (lo que queda del lado del dueño)
- [x] Migración, vínculos, deploy, regla de Odoo y puesta al día de Legajos (10/10).
- [ ] **Telegram**: crear el bot (@BotFather), cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` en Vercel (redeploy) y correr `node --env-file=.env.local scripts/telegram-webhook.mjs https://andamios-os.vercel.app`. Después, vincular a capataces y choferes (cada uno toca una vez su link; se copia desde Legajos). Mientras tanto la hoja funciona a mano (copiar mensaje / WhatsApp).
- [ ] **Permisos**: "Hoja del día" en editar a Juan Agustín y Ezequiel; Juan Pablo en ver. Joaquín la ve por admin.
- [ ] **Teléfonos** del coordinador (`hd_parametros.coordinador`) y del depósito (`deposito`). Sin ellos, "Llamar a Juan Agustín" aparece desactivado en el celular y no hay "Avisar al depósito".
- [ ] **Dirección del Depósito A CONFIRMAR** (y lat/lng). Sin eso, "Cerca" no mide desde el depósito. También Galvanizados Sanz, la planta de VTV y el taller (dirección, horario, `cierra`, teléfono). Pendiente 18.
- [ ] **Planteles**: la Cuadrilla 1 quedó sin responsable (era Arrieta) y la Cuadrilla 5 no tiene plantel. Cargarlos en Configuración de cuadrillas. No es urgente, porque el capataz se elige cada día, pero lo usan "Empezar con el plantel base" y la sugerencia de a cargo.
- [ ] **Celulares en Odoo** de Vargas, Geloz, Sena Ayrton y Taboada (hoy vacíos). Al cargarlos en Odoo se copian solos a Legajos.
- [ ] **Contratistas**: darlos de alta (panel Gente › Contratistas › Administrar) con referente, celular y valor por jornada, y mandarle al referente su link para vincular Telegram.
- [ ] **Probar en producción** los gestos rápidos (agregar, mover, poner a cargo, contratista ±): que al recargar la página quede lo mismo. Las escrituras reales no se pudieron probar contra la base desde acá.
- [ ] **Primer día de uso**: no hay "día anterior" con hojas, así que el primer día se arma con "Empezar con el plantel base" (o vacío). Desde el segundo, "Empezar como hoy".

**Conocido y no hecho**
- Foto del remito sin señal: no queda en cola (una foto no entra en el almacenamiento del navegador); el celular avisa que la saque de nuevo con señal.
- El resumen "Hoja: 3 de 5 enviadas · 2 pedidos sin camión" en el encabezado de cada día del tablero (`implementacion.md` §6) no está (sería un GET del día por cada día visible).
- Telegram: el motivo del "No pude" viaja por índice (`m:<viaje>:<i>`): si un admin reordena `motivos_no_pude` mientras hay mensajes abiertos, el botón viejo toma otro motivo. "Anular link" no desvincula el Telegram de la persona (el chat sigue siendo suyo; para eso está "Desvincular" en Legajos).
- `personal.telegram_chat_id`/`telegram_usuario` los puede leer cualquier autenticado (la RLS de `personal` es `USING (true)` desde el esquema inicial; un REVOKE de columna no alcanza con el GRANT de tabla). Bajo riesgo.
- Latencia: ver la sección "Latencia" (arreglado el 10/10, noche).
- Las alertas se crean al LEER el día (ahora sólo de días que todavía se pueden arreglar). El barrido (`/api/alertas/barrido`) corre una vez por día a las 5 (BA): no sirve para las 19:00 ni las 6:30. Para que lleguen sin que nadie abra la hoja hace falta un cron propio (~19:05 y ~6:35 BA) que llame `alertarDia(leerDia(mañana/hoy))`; queda para cuando haya plan de Vercel con más crons.
- El viaje "Taller / VTV" no ocupa el camión en la vista de Vehículos ni lee `mantenimientos` (fase 2).
- `hd_hojas.version` no se incrementa (no se usa: las versiones que importan están en `hd_links`).
- `scripts/probar-migracion.mjs` no corre en esta máquina (falta el paquete `pg` y `SUPABASE_DB_URL` en `.env.local`). La prueba se hizo con la CLI: un archivo con `BEGIN;` + la migración dos veces + un `DO $$ RAISE EXCEPTION …` que muestra lo sembrado y aborta + `ROLLBACK;`, corrido con `npx supabase db query --linked -f`. Después se verificó que `hd_hojas` no existe.
- Si aparecen `.next/types/* 2.ts` (copias del Finder), hacen fallar `npx tsc --noEmit` con "Duplicate identifier"; no son del módulo. `npm run build` pasa.
- Tests con Node < 22.18: `node --no-warnings --experimental-strip-types --test "src/lib/**/*.test.ts"`.

## Archivos

```
supabase/migrations/20261011000001_hoja_del_dia.sql
src/lib/hoja-dia/{tipos,estado,camiones,dias,mensajes,tokens,telegram,servicio,acciones,envios,publico,avisos}.ts
src/lib/hoja-dia/vehiculos.ts (+ .test.ts)   varios vehículos por hoja, lleva / vuelta / busca (puro)
supabase/migrations/20261012000001_hoja_dia_vehiculos.sql   vehículos por hoja y puede_manejar (11/10, sin aplicar)
src/lib/hoja-dia/{deshacer-regla,reglas-publico,archivo-seguro}.ts   reglas puras de la revisión (con tests)
supabase/migrations/20261011000002_hoja_dia_contratistas.sql   contratistas (aplicada el 10/10)
src/lib/hoja-dia/contratistas.ts (+ .test.ts)   contratistas: chips, panel, resumen del mes (puro)
supabase/migrations/20261012000002_hoja_dia_tiempos.sql   hd_tiempos (caché de Google; no aplicada)
src/lib/hoja-dia/{tiempos,rutas,maps}.ts (+ tests)   tiempos en la cuenta, tramos del día, links a Maps (puros)
src/lib/hoja-dia/rutas-servidor.ts (+ test)  cliente de la Routes API y caché (servidor)
src/components/hoja-dia/comunes/tiempo-tramo.tsx   "~35 min en auto" con ícono
src/lib/hoja-dia/{quien,contratistas-servidor}.ts   de qué tabla es cada id; el resumen del mes (servidor)
src/app/api/hoja-dia/contratistas            alta/edición (POST) y resumen del mes (GET ?mes=)
src/components/hoja-dia/cuadrillas/{contratistas,hoja-contratistas,hoja-resumen-contratistas}.tsx
src/lib/odoo/parte-existente.ts             B1: el POST de cierre no reescribe
src/lib/hoja-dia/{estado,mensajes}.test.ts + escenario.test-fixture.ts (el martes 13 de la maqueta)
src/lib/odoo/asignaciones.ts                 fetchTableroDeFechas
src/lib/auth/acceso.ts, servidor.ts          módulo hoja-dia, APIS, moduloDeRuta, exigirModulo
src/lib/supabase/proxy.ts                    /h/ y /api/telegram/webhook públicos
src/lib/alertas/{servicio,slack}.ts          tipo hoja_dia (sólo campanita); personal_odoo y destinatarioId
src/lib/personal/sync-odoo.ts (+ .test.ts)  Legajos ↔ hr.employee: la regla pura
src/lib/personal/sync-odoo-servidor.ts       lee Odoo/Supabase, escribe personal, avisa
src/app/api/odoo/webhooks/empleados          webhook de Odoo
src/app/api/cron/personal-odoo               control diario (vercel.json)
scripts/odoo-webhook-empleados.mjs           crea la regla en Odoo (simulacro por defecto)
scripts/personal-sincronizar-odoo.mjs        puesta al día (simulacro por defecto)
src/app/api/hoja-dia/**                      las APIs
src/app/api/public/hoja/[token]/**           el link público y los archivos
src/app/api/telegram/webhook/route.ts        el bot
src/hooks/use-hoja-dia.ts                    hooks
src/components/tablero/formulario-cierre.tsx precarga desde la hoja
scripts/hoja-dia-vincular-{personal,cuadrillas}.mjs, scripts/telegram-webhook.mjs
```
