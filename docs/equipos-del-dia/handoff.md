# Hoja del día — handoff

Estado real al 10/10/2026 (rama `feat/hoja-del-dia`, sin push ni merge). Pantallas hechas y
**revisión de código corregida** (ver "Correcciones de la revisión" abajo). Nada aplicado en
producción.

## Qué hay

- **El módulo completo.** Migración, lógica pura portada de la maqueta (`estado.ts`, `camiones.ts`), servicio de Supabase + Odoo, APIs, link público `/api/public/hoja/[token]` (con foto del remito), bot de Telegram con webhook, hooks de TanStack Query, alertas a la campanita, la precarga de "Cerrar jornada", y las pantallas: Cuadrillas, Camiones, el celular `/h/[token]` (con sin señal), lista de envío, ausencias, la pestaña en Planificación, "Pasar a pedido" en el cajón, Telegram y "Puede estar a cargo" en Legajos. El contrato está en `implementacion.md`.
- **Nada aplicado ni corrido contra producción.** La migración (con los cambios de la revisión: `hd_aplicar`, `hd_contar`, historial cerrado, `hd_links` sólo para quien edita, bucket con límite) se probó dos veces seguidas dentro de `BEGIN … ROLLBACK` con `npx supabase db query --linked -f` (la migración dos veces + una prueba de `hd_aplicar`/`hd_contar` que aborta a propósito); después se verificó que `hd_hojas`, `hd_aplicar` y `hd_contar` no existen. Los scripts de vínculos y del webhook no se corrieron.

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
14. **Quién es chofer**: `personal.odoo_tarea = 'chofer'` (lo trae el script de Odoo); sin vínculo todavía, el puesto de Legajos. Hoy Legajos dice chofer para Ortega, que actúa de capataz: hasta correr el script, Ortega no aparece en "Sin asignar".
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

## Orden exacto para salir a producción

1. **Aplicar la migración** (antes del deploy: el código depende de ella): `npx supabase db query --linked -f supabase/migrations/20261011000001_hoja_del_dia.sql`. Verificar: `select to_regclass('public.hd_hojas'), to_regproc('public.hd_aplicar'), to_regproc('public.hd_contar');`
2. **Vínculos en simulacro**: `node --env-file=.env.local scripts/hoja-dia-vincular-cuadrillas.mjs` y `node --env-file=.env.local scripts/hoja-dia-vincular-personal.mjs` (sólo muestran). Revisar los cruces dudosos (dos Miño, dos Valenzuela).
3. **Vínculos de verdad**: los mismos dos con `--aplicar`.
4. **Variables de Telegram** en Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (bot creado con @BotFather). Cargar en `hd_parametros` el teléfono del coordinador y el del depósito (y `deposito.telegram_chat_id` si el depósito usa Telegram).
5. **Webhook**: `node --env-file=.env.local scripts/telegram-webhook.mjs https://<dominio>`.
6. **Deploy** de la rama (merge a main). Después: permisos "Hoja del día" (editar) a Juan Agustín, Ezequiel y Joaquín, y vincular Telegram de capataces y choferes.

## Lo que falta

**Para usarlo**
- [ ] Seguir "Orden exacto para salir a producción" (arriba). Sin `odoo_employee_id`: no hay puntero en "Cerrar jornada", no aparecen las ART de la asistencia y no hay celulares. Sin `odoo_cuadrilla_id`: no hay plantel base ni responsable para sugerir.
- [ ] **Dirección del Depósito A CONFIRMAR** (y lat/lng). Sin eso, "Cerca" no mide desde el depósito. También Galvanizados Sanz, la planta de VTV y el taller (dirección, horario, `cierra`, teléfono). Pendiente 18.
- [ ] Teléfono del coordinador (`hd_parametros.coordinador`) y del depósito (`deposito`): sin ellos no hay "Llamar a Juan Agustín" ni "Avisar al depósito" a mano.
- [ ] Crear el bot (@BotFather), cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` en Vercel y correr `scripts/telegram-webhook.mjs https://<dominio>`. Después, vincular a capataces y choferes (link de una vez).
- [ ] Permisos: "Hoja del día" en editar a Juan Agustín, Ezequiel y Joaquín.

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
src/lib/odoo/parte-existente.ts             B1: el POST de cierre no reescribe
src/lib/hoja-dia/{estado,mensajes}.test.ts + escenario.test-fixture.ts (el martes 13 de la maqueta)
src/lib/odoo/asignaciones.ts                 fetchTableroDeFechas
src/lib/auth/acceso.ts, servidor.ts          módulo hoja-dia, APIS, moduloDeRuta, exigirModulo
src/lib/supabase/proxy.ts                    /h/ y /api/telegram/webhook públicos
src/lib/alertas/{servicio,slack}.ts          tipo hoja_dia (sólo campanita)
src/app/api/hoja-dia/**                      las APIs
src/app/api/public/hoja/[token]/**           el link público y los archivos
src/app/api/telegram/webhook/route.ts        el bot
src/hooks/use-hoja-dia.ts                    hooks
src/components/tablero/formulario-cierre.tsx precarga desde la hoja
scripts/hoja-dia-vincular-{personal,cuadrillas}.mjs, scripts/telegram-webhook.mjs
```
