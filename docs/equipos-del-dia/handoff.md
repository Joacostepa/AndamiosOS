# Hoja del día — handoff

Estado real al 10/10/2026 (rama `feat/hoja-del-dia`, sin push ni merge).

## Qué hay

- **La base completa, sin pantallas.** Migración, lógica pura portada de la maqueta (`estado.ts`), servicio de Supabase + Odoo, APIs, link público `/api/public/hoja/[token]`, bot de Telegram con webhook, hooks de TanStack Query, alertas a la campanita y la precarga de "Cerrar jornada" (ya conectada al formulario del tablero). El contrato para las pantallas está en `implementacion.md`.
- **Nada aplicado ni corrido contra producción.** La migración se probó dos veces dentro de `BEGIN … ROLLBACK` (compila, es idempotente, siembra 20 parámetros, 4 lugares y a cargo para Conte, Miño H., Ortega, Hepper, Sack y Pérez). Los scripts de vínculos y del webhook no se corrieron.

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
11. **Deshacer genérico.** Cada gesto guarda en `hd_historial.cambios` las filas de antes y de después. `/api/hoja-dia/deshacer` las restaura en orden inverso, y se niega si alguna cambió después (otra persona, el chofer desde su link).
12. **Lecturas con la service role, escrituras con la sesión.** La lectura del día cruza Legajos, flota, pañol y planificación: se hace con la service role después de verificar el permiso en la ruta (`exigirModulo`, segunda llave además del proxy). Las escrituras de `hd_*` van con la sesión del usuario (RLS). Legajos (celular) y Telegram, con la service role y quedan en el historial.
13. **Odoo**: una lectura del día son 4 llamadas (`fetchTableroDeFechas`: sólo las OTs de ese día y del anterior con hojas, con coordenadas y número de jornada) + la asistencia, en paralelo con Supabase. El link público y las mutaciones usan un caché de 45 s del tablero (los celulares consultan cada 30 s). El GET del escritorio, no.
14. **Quién es chofer**: `personal.odoo_tarea = 'chofer'` (lo trae el script de Odoo); sin vínculo todavía, el puesto de Legajos. Hoy Legajos dice chofer para Ortega, que actúa de capataz: hasta correr el script, Ortega no aparece en "Sin asignar".
15. **Nombres**: el apellido con `nombrePropio()`; si dos lo comparten, con la inicial ("Miño H.", "Miño J."; también hay dos Valenzuela).
16. **Módulo `hoja-dia` dentro de Planificación**: `puedeAbrir` ahora elige el módulo por la ruta MÁS LARGA (`moduloDeRuta`), si no `/planificacion/hoja` la abría cualquiera con Planificación.
17. **Duraciones de la maqueta** (no las de la tabla de §6): busca 30 min y trae 30 + 60 de vuelta al depósito.

## Lo que falta

**Para usarlo**
- [ ] Las pantallas (`implementacion.md` §6): Cuadrillas, Camiones, el celular `/h/[token]` (con sin señal), lista de envío, ausencias, lugares, la pestaña en Planificación, "Pasar a pedido" en el cajón, Telegram y "Puede estar a cargo" en Legajos.
- [ ] Aplicar la migración y correr los dos scripts de vínculos (primero en simulacro). Sin `odoo_employee_id`: no hay puntero en "Cerrar jornada", no aparecen las ART de la asistencia y no hay celulares. Sin `odoo_cuadrilla_id`: no hay plantel base ni responsable para sugerir.
- [ ] **Dirección del Depósito A CONFIRMAR** (y lat/lng). Sin eso, "Cerca" no mide desde el depósito. También Galvanizados Sanz, la planta de VTV y el taller (dirección, horario, `cierra`, teléfono). Pendiente 18.
- [ ] Teléfono del coordinador (`hd_parametros.coordinador`) y del depósito (`deposito`): sin ellos no hay "Llamar a Juan Agustín" ni "Avisar al depósito" a mano.
- [ ] Crear el bot (@BotFather), cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` en Vercel y correr `scripts/telegram-webhook.mjs https://<dominio>`. Después, vincular a capataces y choferes (link de una vez).
- [ ] Permisos: "Hoja del día" en editar a Juan Agustín, Ezequiel y Joaquín.

**Conocido y no hecho**
- Fotos del remito: la tabla tiene `foto_path` y el bucket `hoja-dia` existe, pero no hay endpoint de subida (`/api/public/hoja/[token]/viaje/[id]/foto` de §14).
- El viaje "Taller / VTV" no ocupa el camión en la vista de Vehículos ni lee `mantenimientos` (fase 2).
- `hd_hojas.version` no se incrementa (no se usa: las versiones que importan están en `hd_links`).
- Las alertas de la campanita se crean al LEER el día (no hay barrido): si nadie abre la hoja, no hay rojo. Si hace falta, sumar la hoja al barrido de `/api/alertas/barrido`.
- `scripts/probar-migracion.mjs` no corre en esta máquina (falta el paquete `pg` y `SUPABASE_DB_URL` en `.env.local`). La prueba se hizo con la CLI: un archivo con `BEGIN;` + la migración dos veces + un `DO $$ RAISE EXCEPTION …` que muestra lo sembrado y aborta + `ROLLBACK;`, corrido con `npx supabase db query --linked -f`. Después se verificó que `hd_hojas` no existe.
- `.next/types/routes.d 2.ts` y `validator 2.ts` (copias del Finder) hacen fallar `npx tsc --noEmit` con "Duplicate identifier"; no son del módulo. `npm run build` pasa.
- Tests con Node < 22.18: `node --no-warnings --experimental-strip-types --test "src/lib/**/*.test.ts"`.

## Archivos

```
supabase/migrations/20261011000001_hoja_del_dia.sql
src/lib/hoja-dia/{tipos,estado,mensajes,tokens,telegram,servicio,acciones,envios,publico,avisos}.ts
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
