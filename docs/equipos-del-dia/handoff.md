# Hoja del día — handoff

Estado real al 10/10/2026 (noche): **en producción.** Mergeado a `main` con el PR #3
(`d736eca`) y publicado en Vercel. Para retomar: "Leé docs/equipos-del-dia/handoff.md y
seguimos con lo que falta".

**Contratistas (10/10, noche)**: hecho en la rama `feat/hoja-dia-contratistas`, **sin mergear y con la
migración nueva SIN APLICAR** (`20261011000002_hoja_dia_contratistas.sql`). Antes del deploy de esa rama
hay que aplicarla: ver "Contratistas" abajo.

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

## Contratistas (10/10, noche) — rama `feat/hoja-dia-contratistas`

Decisión del dueño: a veces se terceriza mano de obra con **contratistas** (varios, p. ej. Tomás Quintana). No son empleados (ni Legajos ni Odoo); sólo se sabe **cuántos** van; van **dentro de las cuadrillas del tablero** (solos o con gente nuestra); se les paga por persona y jornada; **el parte de Odoo no cambia** (cuentan en la cantidad como los nuestros); nada de documentación por ahora. La especificación está en `modulo.md` §20 y el contrato en `implementacion.md`.

**Qué se hizo**
- **Datos** (`20261011000002_hoja_dia_contratistas.sql`, idempotente, probada dos veces dentro de `BEGIN … ROLLBACK` contra la base linkeada y verificado después que las tablas no existen): `hd_contratistas`, `hd_hoja_contratistas` (cantidad por hoja, UNIQUE hoja+contratista, `fecha` por trigger), `hd_hojas.a_cargo_contratista_id` (UNIQUE parcial por fecha: a cargo de una hoja por día), `contratista_id` en `hd_links` / `hd_telegram_codigos` / `hd_telegram_mensajes` con el CHECK "exactamente uno" (`num_nonnulls`), RLS por `hd_nivel`, `hd_aplicar` con las dos tablas nuevas. Lista blanca del Deshacer (`deshacer-regla.ts`) y entidad `contratista` del historial.
- **Lógica pura**: estado.ts (cuántos van, a cargo, problemas "Falta cuántos van de Quintana" y "dado de baja", sugerencia de a cargo, foto y diferencias "va Quintana con 4 / Quintana pasa de 4 a 3 / no va Quintana", precarga y "Copiar como hoy", mano de obra del cierre) + `contratistas.ts` (chips, panel, "3 de Quintana + Ramírez", resumen del mes con prorrateo por obra). Tests: `contratistas.test.ts` (11 casos).
- **Servidor**: `quien.ts` (persona / externa / contratista para links, Telegram y mensajes), `contratistas-servidor.ts` (resumen del mes: Supabase + una pasada a Odoo para nombres de cuadrilla y fracciones), acciones `contratista_sumar` / `contratista_quitar` / `contratista_nota` / `a_cargo` con contratista, alta/edición en `/api/hoja-dia/contratistas`, el webhook de Telegram vincula contratistas, `precargaCierre` suma su gente.
- **Pantallas**: chip "+3 de Quintana" con − / + y su menú en la tarjeta; grupo "Contratistas" en el panel Gente (arrastrar suma 1, tocar → "Agregar a la Cuadrilla N…" con cantidad; también en "+ Agregar"); hojas laterales "Contratistas" (administrar, con Hoja del día en editar) y "Contratistas · octubre" (resumen); el celular del referente muestra "Van 4 · 3 de Quintana + Ramírez"; "Cerrar jornada" aclara "incluye 3 de Quintana".
- De paso: en la vista Cuadrillas, el diálogo "Celular de…" y "Cerrar jornada" tenían la misma `key` ("-") como hermanos (React avisaba "two children with the same key" y podía no desmontar bien una hoja lateral); ahora tienen claves distintas.

**Cómo se probó**: tests (`node --no-warnings --experimental-strip-types --test "src/lib/**/*.test.ts"`), `npx tsc --noEmit`, `npx eslint` sobre lo cambiado, `npm run build`, y Playwright con el escenario del martes 13 (la 5 de Quintana con Ramírez, +1 de Quintana en la 4) servido por una ruta temporal (borrada) con las APIs interceptadas: chip y stepper, menú del chip, grupo del panel, "Agregar a la Cuadrilla 2" con 2, arrastrar al panel, "+ Agregar", alta en Administrar, resumen del mes, el celular del referente a 390 px y la tarjeta a 390 px sin scroll horizontal.

**Para producción (en este orden)**
1. **Aplicar la migración ANTES del deploy** (el código nuevo lee `hd_contratistas` y `hd_hoja_contratistas` al leer el día: sin ellas la Hoja del día no abre): `npx supabase db query --linked -f supabase/migrations/20261011000002_hoja_dia_contratistas.sql`. Verificar: `select to_regclass('public.hd_contratistas'), to_regclass('public.hd_hoja_contratistas'), (select count(*) from pg_constraint where conname in ('hd_links_un_destinatario','hd_telegram_codigos_un_destinatario'));` → las dos tablas y `2`.
2. Merge de `feat/hoja-dia-contratistas` a `main` (deploy en Vercel).
3. Dar de alta a los contratistas (Hoja del día › panel Gente › Contratistas › Administrar): nombre, referente, celular y, si se quiere el total del mes, el valor por persona y jornada. Si el referente va a recibir hojas, "Copiar link para vincular" (Telegram) una vez.

**Lo que queda / conocido**
- Si la hoja está a cargo de un contratista, "Cerrar jornada" no precarga **puntero** (no hay `hr.employee`): se elige a mano. El parte no cambia (decisión 5).
- Un contratista está a cargo de **una sola hoja por día** (su link es uno por día). Si un día tiene dos cuadrillas suyas, la otra la recibe alguien nuestro o se manda a mano.
- El prorrateo por obra del resumen usa el tablero de hoy para días pasados: si se mueve una obra de un día ya trabajado, cambia el reparto (no las jornadas).
- Fase 2: documentación (ART/seguro), exportar el resumen y marcarlo pagado.

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
13. **Odoo**: una lectura del día son 4 llamadas (`fetchTableroDeFechas`: sólo las OTs de ese día y del anterior con hojas, con coordenadas y número de jornada) + la asistencia, en paralelo con Supabase. El link público y las mutaciones usan un caché de 45 s del tablero (los celulares consultan cada 30 s). El GET del escritorio, no.
14. **Quién es chofer**: `personal.odoo_tarea = 'chofer'` (lo trae la sincronización de Odoo); sin vínculo, el puesto de Legajos. Legajos dice chofer para Ortega, que actúa de capataz; como en Odoo es andamista (`odoo_tarea`), aparece en "Sin asignar" y puede estar a cargo.
15. **Nombres**: el apellido con `nombrePropio()`; si dos lo comparten, con la inicial ("Miño H.", "Miño J."; también hay dos Valenzuela).
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
- [ ] **Primer día de uso**: no hay "día anterior" con hojas, así que el primer día se arma con "Empezar con el plantel base" (o vacío). Desde el segundo, "Empezar como hoy".

**Conocido y no hecho**
- Foto del remito sin señal: no queda en cola (una foto no entra en el almacenamiento del navegador); el celular avisa que la saque de nuevo con señal.
- El resumen "Hoja: 3 de 5 enviadas · 2 pedidos sin camión" en el encabezado de cada día del tablero (`implementacion.md` §6) no está (sería un GET del día por cada día visible).
- Telegram: el motivo del "No pude" viaja por índice (`m:<viaje>:<i>`): si un admin reordena `motivos_no_pude` mientras hay mensajes abiertos, el botón viejo toma otro motivo. "Anular link" no desvincula el Telegram de la persona (el chat sigue siendo suyo; para eso está "Desvincular" en Legajos).
- `personal.telegram_chat_id`/`telegram_usuario` los puede leer cualquier autenticado (la RLS de `personal` es `USING (true)` desde el esquema inicial; un REVOKE de columna no alcanza con el GRANT de tabla). Bajo riesgo.
- Latencia: cada gesto lee el día entero antes de escribir (~24 consultas + Odoo con caché de 45 s). Con tres coordinadores anda; si se nota, es lo primero a optimizar.
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
src/lib/hoja-dia/{deshacer-regla,reglas-publico,archivo-seguro}.ts   reglas puras de la revisión (con tests)
supabase/migrations/20261011000002_hoja_dia_contratistas.sql   contratistas (SIN APLICAR al 10/10 noche)
src/lib/hoja-dia/contratistas.ts (+ .test.ts)   contratistas: chips, panel, resumen del mes (puro)
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
