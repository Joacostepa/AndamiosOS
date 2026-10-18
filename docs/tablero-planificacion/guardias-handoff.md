# Handoff — Guardias y comodines (18/10/2026)

Para retomar: "Leé docs/tablero-planificacion/guardias-handoff.md y seguimos con las guardias".

Qué se construyó: [guardias-contrato.md](guardias-contrato.md) (manda). Cómo:
[guardias-plan-tecnico.md](guardias-plan-tecnico.md). El por qué de cada regla:
[guardias.md](guardias.md) y [comodines.md](comodines.md). La referencia visual:
[maqueta-guardias.html](maqueta-guardias.html).

En una línea: el sistema reserva **2 jornadas por semana** en las cuadrillas propias para lo
imprevisto (la **guardia**). Planificación la usa sola para una urgencia nueva, la lluvia, un
armado atrasado o un **comodín** (desarme que ya puede ir cualquier día) desde las 13 h del día
hábil anterior; para todo lo demás le pide a JS. El candado vale en el servidor.

---

## Estado

- Construido en la rama `feat/guardias` por tres tracks (núcleo, pantalla, seguridad) e
  integrado el 18/10 a la noche. Pasan `npx tsc --noEmit`, `npx eslint` sobre todo lo tocado,
  `npm test`, `npm run contraste` y `npx next build`. **No se probó con sesión ni contra la
  base**: ninguna de las dos migraciones se ensayó (en el worktree no hay `SUPABASE_DB_URL`).
- **Falta, en este orden:** ensayar y aplicar las dos migraciones, desplegar, correr el arranque
  y mirar el tablero con sesión (ver abajo). Las migraciones las aplica el orquestador; nunca
  `db push`.
- **Lo que hizo la integración** (además de juntar los tracks): los pedidos a JS traen el nombre
  de la cuadrilla (`SolicitudGuardia.guardia.cuadrillaNombre`) y la página de autorizaciones ya
  no lee el tablero de hoy para decir "C3"; deshacer un uso de guardia deja su fila en
  `plan_movimientos` (`deshace_a` → la del uso), así el panel de actividad lo marca deshecho; el
  aviso de las 13 h nombra el día cuando no es mañana ("Lun 20/10: guardia C3 libre" el sábado);
  leyenda propia de "Autorizar guardias" en el editor de usuarios; la pantalla y los docs del
  módulo en `src/lib/sistemas/rutas.ts`; `SLACK_WEBHOOK_PLANIFICACION` en `.env.example`.
- **Revisión del 18/10 a la noche** (correctitud, seguridad y fidelidad), ya aplicada. Lo que
  cambió de comportamiento:
  - **Usar es atómico:** primero se TOMA la guardia (`activa → usada ... WHERE activa
    RETURNING`), después se escribe Odoo; si Odoo falla, se compensa y la guardia vuelve a
    activa si su celda quedó libre (`devolverSiFalla`). Dos obras soltadas a la vez sobre la
    misma guardia: la segunda recibe 409 sin tocar Odoo.
  - **El deshacer de un uso no confía en el navegador:** qué se borra y adónde vuelve cada
    jornada sale de `tablero_tareas.guardia_deshacer` (columna nueva, en la migración 1), que el
    servidor anota al usarla con lo que leyó de Odoo. Si donde vuelve la obra ahora hay una
    guardia activa, 409.
  - **El corrimiento valida que sea un corrimiento:** sin `levantaLote` exige `suspension`, y
    cada jornada tiene que estar en Odoo en el día suspendido o después, en una cuadrilla
    suspendida (o ser apoyo) e ir al día laboral siguiente; `crear` no se acepta. Con
    `levantaLote`, el lote tiene que existir, cada jornada vuelve al día que el lote anotó, cada
    apoyo recreado es uno que el lote quitó, y todo pasa por `frenoParaMover`/`frenoDeGuardias`.
    El `loteId` lo genera la ruta (si el historial falla, la guardia consumida igual tiene lote).
    Si no puede marcar la guardia consumida, reintenta y avisa a Planificación (`guardia_problema`).
  - **"Armado atrasado" cuenta lo hecho:** `cerradas >= estimadas`; planificarle un día de más
    ya no abre nada.
  - **La duración del candado es la mayor entre Odoo y el plan de Operaciones**
    (`duracionParaCandado`): achicar `plan_jornadas_ot` no vuelve comodín a un desarme ni
    "atrasado" a un armado. Lo usan el tablero, `/usar`, el 409 de las rutas comunes y la
    corrida de las 13 h. Costo: un desarme que Operaciones achicó a 1 j no es comodín hasta
    que se corrija la estimación en Odoo.
  - **Las autorizaciones:** el tipo del pedido lo decide el servidor (`evaluarCandado`), la
    aprobada sirve sólo a quien la pidió y para el MISMO pedido (misma obra, guardias y celdas),
    abre todas las guardias del pedido y se gasta de forma atómica. Los pedidos pendientes de
    una guardia que se usa, se saca, se consume, se cierra a depósito o se corre (estos sólo los
    de poner una obra) se cancelan solos con el porqué. JS se autoriza a sí mismo en UNA llamada
    (`autoaprobar`), sin avisarse ni publicar en #planificacion; lo aprobado ofrece "Deshacer"
    (en el tablero, en la bandeja y en la ficha). La bandeja muestra las jornadas que se lleva
    el pedido y lista las guardias sacadas. `/sacar` y `/autorizar` vuelven a mirar el permiso.
  - **Correr una guardia a hoy no:** sólo a un día que todavía no empezó (sería sacarla sin JS).
    Al correrla, `guardia_por_que` pasa a "La corrió X del jue 05/11 (C3) al mié 04/11 (C2)";
    el porqué original queda en la historia.
  - **Los crons:** la de las 13 h con `?hoy` NO cierra nada a depósito con esa fecha (siempre con
    el hoy real); el aviso del viernes lleva en la clave el día real de la corrida.
  - **Slack:** el texto de las alertas se escapa (`&`, `<`, `>`): un motivo no puede arrobar al
    canal ni disfrazar un link.
  - **Pantalla:** el chip "de guardia" abre la guardia; el menú de una guardia de un día pasado
    no ofrece correrla ni sacarla; el indicador dice "sin guardias · libre X j" cuando no hay
    guardias esos días y se lee entero en el lector de pantalla; el aviso del apoyo sobre una
    guardia sale del candado; el spinner de Aprobar/Rechazar en la ficha es el del botón tocado.
- **Cambio del 18/10 (JS):** la Hoja del día NO muestra tareas del tablero en esta entrega. Una
  guardia sin usar no le llega al capataz de ninguna forma, igual que hoy un "Depósito". Un test
  (`src/lib/hoja-dia/guardias-capataz.test.ts`) frena a quien empiece a leer las tareas desde la
  Hoja sin pasar por `tareaParaCapataz` o escriba la palabra "guardia" ahí.

## Mapa de archivos

**Núcleo (reglas, servidor, crons, avisos):**

| Archivo | Qué hace |
|---|---|
| `src/lib/tablero/guardias-tipos.ts` | Todos los tipos y las constantes (`DIAS_MAX_COMODIN`, `HORA_RELLENO`, ranuras…). Un número se cambia acá y nada más. |
| `src/lib/tablero/dias-habiles.ts` | Días hábiles (lunes a sábado sin feriados) y la hora de Buenos Aires. |
| `src/lib/tablero/guardias.ts` | **La regla, pura:** dónde van (`motivoCeldaNoApta`, `planearGuardiasSemana`, `destinoValidoGuardia`), el candado (`evaluarCandado`, `urgenciaCumple`, `armadoAtrasado`, `guardiaMasCercanaPara`), el relleno de las 13 h (`candidatosRelleno`), los textos de los avisos, el indicador (`lugarProtegido`) y lo que ve el capataz (`tareaParaCapataz`). |
| `src/lib/tablero/comodines.ts` | Qué es un comodín (`evaluarComodines`, `comodinDe`), si puede ir (`comodinPuedeIr`) y su chip. |
| `src/lib/tablero/corrimiento.ts` | El corrimiento consume las guardias (`guardiasConsumidas`); el deshacer las reactiva. |
| `src/lib/tablero/tareas.ts` | Las guardias activas viajan al tablero como tarea "Guardia"; las que terminaron en depósito, como "Depósito" (`deGuardia`). |
| `src/lib/planificacion/guardias.ts` | El servicio del servidor: leer, poner, usar (un lote), deshacer, correr, sacar, consumir por lluvia, liberar por salida, cerrar a depósito, pedidos a JS, avisos y los esquemas de las rutas. |
| `src/lib/planificacion/candado-guardias.ts` | `frenoDeGuardias`/`frenoParaMover`/`frenoParaActualizar`: el 409 en las rutas que ya existían. Falla cerrado (503). |
| `src/app/api/planificacion/guardias/**` | `GET` (rango), `usar`, `deshacer`, `mover`, `sacar` (JS), `solicitudes` (GET/POST/DELETE), `autorizar` (JS). |
| `src/app/api/planificacion/{asignaciones,tareas,jornadas,corrimiento}/route.ts` | El candado y la segunda llave (`exigirPermisoDeApi`) en cada handler que escribe; el corrimiento consume y reactiva. |
| `src/app/api/cron/guardias-viernes/route.ts` | Viernes 13 UTC: pone las de las semanas +1 y +2. |
| `src/app/api/cron/guardias-relleno/route.ts` | Lun–sáb 16 UTC: pasadas a depósito, aviso de las libres de mañana, comodines vencidos. |
| `src/lib/odoo/asignaciones.ts` | `creadaEl` (create_date) en las OTs; lecturas para el candado (`celdasDeAsignaciones`, `asignacionesEnCeldas`, `leerOts`, `avanceDeOts`, `fetchGrillaLiviana`). |
| `src/lib/alertas/{servicio,slack}.ts` | Los seis avisos nuevos (`guardia_problema` desde la revisión) y el canal `#planificacion` (`SLACK_WEBHOOK_PLANIFICACION`); el texto que va a Slack se escapa. |
| `src/lib/asistente/{planificacion,herramientas}.ts` | El asistente comercial no ofrece guardias: `libreSinGuardia` y `primeraFechaSinGuardia`. |
| `supabase/migrations/20261018100001_guardias.sql` | Columnas `guardia_*` en `tablero_tareas`, historia, pedidos, permisos y el trigger del candado para tareas. |
| `vercel.json`, `src/lib/supabase/proxy.ts` | Los dos crons (rutas públicas protegidas por `CRON_SECRET`). |

**Pantalla:** `src/components/tablero/{tarjeta-guardia,ficha-guardia,dialogo-pedir-autorizacion,bandeja-autorizaciones,grupo-comodines,indicador-protegido,dialogo-meter-urgente}.tsx`
(nuevos) y los cambios en `tablero-board`, `tablero-grid`, `celda-dia`, `tarjeta-asignacion`,
`panel-ot`, `panel-sin-asignar`, `topbar-tablero`, `dialogo-correr-dia`, `apoyo-ot`,
`dialogo-candado`; `src/hooks/use-guardias.ts` (nuevo), `use-tablero.ts`, `use-avisos-tablero.ts`;
`src/lib/tablero/colores.ts`, `src/app/globals.css` (tokens `--tb-guardia-*`),
`scripts/contraste-tablero.mjs`; la página `src/app/(dashboard)/planificacion/autorizaciones/page.tsx`.

**Seguridad:** `src/lib/auth/{acceso,servidor,explicitos-servidor}.ts` (módulo explícito
`planificacion-autoriza`, `exigirPermisoDeApi`), `src/lib/auth/acceso.test.ts`,
`src/lib/direccion/auditoria.ts`, la segunda llave en las demás rutas de `/api/planificacion`,
`src/app/api/habilitaciones/candado/route.ts`, `src/app/api/ordenes-trabajo/[id]/urgencia/route.ts`
y `supabase/migrations/20261018100002_tablero_rls.sql` (RLS de las tablas `plan_*` y `tablero_tareas`).

## Aplicar las migraciones

Dos, **en este orden** (la segunda usa `plan_nivel()`/`plan_puede_editar()` de la primera):

1. `supabase/migrations/20261018100001_guardias.sql` — columnas `guardia_*` en
   `tablero_tareas` (incluida `guardia_deshacer`), `plan_guardia_eventos`,
   `plan_guardia_solicitudes`, funciones de permiso, políticas RESTRICTIVE, el trigger del
   candado para tareas y el permiso de JS.
2. `supabase/migrations/20261018100002_tablero_rls.sql` — cierra las escrituras directas de
   `tablero_tareas` y las `plan_*` y suma `permiso_guardias` al CHECK de `direccion_auditoria`.

```bash
# ensayo en un ROLLBACK (pide SUPABASE_DB_URL en .env.local y `pg` instalado). La segunda
# sola no se puede ensayar antes de aplicar la primera: se ensayan JUNTAS en un archivo.
cat supabase/migrations/20261018100001_guardias.sql supabase/migrations/20261018100002_tablero_rls.sql > /tmp/guardias-juntas.sql
node --env-file=.env.local scripts/probar-migracion.mjs /tmp/guardias-juntas.sql
# aplicar
npx supabase db query --linked -f supabase/migrations/20261018100001_guardias.sql
npx supabase db query --linked -f supabase/migrations/20261018100002_tablero_rls.sql
```

Sola, la segunda falla en el ensayo porque `plan_puede_editar()` todavía no existe: por eso
se ensayan juntas (el probador corre el archivo dos veces, así que también prueba que sean
idempotentes).

**Nunca `supabase db push`.** Las dos son idempotentes. **Las dos antes de desplegar**: el
tablero lee `guardia_estado` y `guardia_uso` en cada carga (`tareasEnRango`) y sin la primera el
tablero entero falla. La segunda puede ir el mismo día: la app ya escribe todo por rutas con la
sesión de quien tiene el módulo.

**Ojo con el orden de los nombres:** `20261022000001_sistemas.sql` (ya aplicada) tiene fecha
POSTERIOR. Si alguien la vuelve a correr después de la de seguridad, borra `'permiso_guardias'`
del CHECK de `direccion_auditoria`; volver a correr `20261018100002` lo repone.

## Variables de entorno

- **Nueva y opcional: `SLACK_WEBHOOK_PLANIFICACION`** (Incoming Webhook del canal
  `#planificacion`). Sin ella, `guardia_puesta` y `guardia_solicitud` quedan sólo en la
  campanita; no caen a otro canal.
- **Ya existentes que ahora se usan acá:** `CRON_SECRET` (las dos corridas; sin ella contestan
  401), `SUPABASE_SERVICE_ROLE_KEY` (las guardias se escriben con la service role) y las de Odoo.

## Correr la corrida a mano

El arranque del 18/10, "como si hoy fuera viernes" (cubre las semanas del 26/10 y del 02/11):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<prod>/api/cron/guardias-viernes?hoy=2026-10-23"
```

Contesta `{ semanas: ResultadoColocacion[], puestas }`: qué puso, qué faltó y por qué, y qué
ranuras ya estaban. Se puede repetir sin miedo: no duplica (índice único por semana y ranura) y
el aviso tampoco el mismo día (la clave lleva la semana +1 y el día REAL de la corrida). La
corrida real del viernes 23/10 cubre la misma semana +1 que el arranque y avisa de nuevo con lo
suyo: es a propósito (si completa una ranura que faltaba, se entera alguien). La de las 13 h,
igual:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<prod>/api/cron/guardias-relleno"            # hoy
curl -H "Authorization: Bearer $CRON_SECRET" "https://<prod>/api/cron/guardias-relleno?hoy=2026-10-28"
```

Con `?hoy`, la de las 13 h simula los avisos de ese día ("mañana: guardia C3 libre") pero
**el paso que cierra a depósito usa siempre el hoy real**: correrla con una fecha futura no
cierra guardias que todavía no pasaron. Ojo igual: los avisos que deja son reales (van a la
campanita de Planificación).

Sin `CRON_SECRET` en el entorno, las dos contestan 401 (fallan cerradas).

Para mirar sin escribir: `npx supabase db query --linked -o table "select id, fecha, cuadrilla_odoo_id, guardia_ranura, guardia_estado, guardia_uso, guardia_por_que from tablero_tareas where tipo = 'guardia' order by fecha"`.

## Cuidados

- **El candado vale en el servidor.** Ninguna ruta común pone nada en la celda de una guardia
  activa: contesta 409 `RechazoCandado` (`codigo: "guardia"`, `pide`). La única que la reemplaza
  es `/guardias/usar`, en un lote (Odoo + guardia + historia + movimiento) que `/guardias/deshacer`
  vuelve entero o no vuelve. Si no se puede comprobar (Supabase u Odoo no contestan), 503: falla
  cerrado, al revés que la validación de roles.
- **Las guardias se escriben con la service role, siempre después de validar.** La RLS
  (políticas RESTRICTIVE) no deja escribirlas con la sesión; `plan_movimientos` sí va con la
  sesión (el autor sale de `auth.uid()`).
- **El corrimiento consume según la base**, no según el tablero: lee de Odoo la cuadrilla de
  cada jornada que corre y busca las guardias activas de las celdas destino. Las consume con el
  `lote_id` del corrimiento; el deshacer (`levantaLote`) las reactiva si su celda quedó libre.
- **Liberación por salida** (plan §0, decisión 8): si la obra que usó una guardia se mueve o se
  quita y la celda queda totalmente libre, la guardia vuelve a activa (después de responder, en
  `after()`). Un caso a mirar: si un gesto saca una obra de la guardia y en la request siguiente
  la vuelve a poner en la misma celda (editor de jornadas que borra y recrea), la segunda
  request puede encontrar la guardia ya reactivada y contestar 409; el tablero ofrece usarla.
- **"Creada hace 3 días hábiles"** sale de `create_date` de Odoo, que viene en UTC: se pasa a la
  fecha de Buenos Aires (`fechaBADeOdoo`) antes de contar. Sin el dato, la urgencia pasa por JS.
- **Quién es JS:** el módulo explícito `planificacion-autoriza` (lo da la migración a
  js@andamiosbuenosaires.com.ar). Ningún admin lo trae solo.
- **Avisos:** una fila por persona y Slack sólo en la primera. Al canal `#planificacion` salen
  sólo `guardia_puesta` y `guardia_solicitud`, y sólo si está `SLACK_WEBHOOK_PLANIFICACION`.
  "Planificación" son los perfiles activos con `planificacion = editar` (no los admin por rol:
  ya ven todas las alertas). Si no hay nadie, el aviso va a los admin para que no se pierda.
- **El capataz nunca ve "guardia".** Hoy la Hoja del día no lee tareas del tablero; si algún día
  las lee, tiene que pasar por `tareaParaCapataz` (el test lo controla).
- **Las tareas "NO DISPONIBLE"** (QUINTANA NO DISPONIBLE…) ocupan la celda: la corrida no pone
  guardias ahí. Bloquear celdas por falta de personal queda para después (contrato §1.5).
- **Quien autoriza también tiene que poder editar la planificación.** Aprobar un pedido ejecuta
  el uso con la sesión de JS, y esa sesión escribe `plan_movimientos` (RLS: `plan_puede_editar()`).
  JS hoy pasa por ser admin; si algún día autoriza alguien que no es admin, hay que tildarle
  también Planificación en editar.
- **Un 409 del candado en pantalla.** El tablero evalúa el candado antes de soltar, así que el
  409 sólo aparece con una pantalla vieja. Crear, mover y usar lo convierten en "Pedir
  autorización"; si el servidor contesta `pide: null` (la obra SÍ podía usarla, o es una tarea),
  sale un toast con el texto del servidor y el tablero se relee: hay que volver a soltar. El
  PATCH "actualizar" (cambiar día o cuadrilla desde el editor) y las tareas muestran el toast de
  siempre con ese mismo texto.
- **Jornadas no planificadas de hoy.** `POST /api/planificacion/jornadas` (la jornada que se
  carga desde Partes sin estar planificada) también pasa por el candado: si HOY esa cuadrilla
  tiene una guardia activa, contesta 409 y hay que usar la guardia desde el tablero primero. Los
  días pasados no se frenan (la corrida de las 13 h ya los cerró como depósito).
- **El deshacer de un uso por lluvia** no se hace desde `/guardias/deshacer` (contesta 409): se
  deshace deshaciendo el corrimiento, que reactiva sus guardias si la celda quedó libre.
- **Un uso que Odoo dejó a medias.** Si Odoo falla después de escribir algo y la compensación
  también falla, la guardia queda "usada" con un evento en la historia ("Odoo falló a mitad del
  uso… Revisá la celda"), sin chip ni deshacer: se arregla a mano. Es a propósito: volverla
  activa la dejaría debajo de trabajo real.
- **Un uso sin `guardia_deshacer`** (el UPDATE final falló, o una fila anterior a la columna):
  `/guardias/deshacer` contesta 409 "no se puede deshacer solo"; se corre la obra a mano y la
  guardia vuelve sola (liberación por salida) si la celda queda libre.
- **Autorizaciones viejas:** una aprobada que no se pudo ejecutar sirve sólo a quien la pidió y
  sólo para el mismo pedido (misma obra, mismas guardias, mismas celdas). Si al volver a soltar
  el tablero arma otra forma (otro día, otra cuadrilla), contesta 409 "pedila de nuevo".
- **Corrimientos armados a mano** ya no pasan: la ruta exige que cada jornada salga del día
  suspendido o de su cascada y vaya al día laboral siguiente. Si el tablero estaba viejo
  (alguien movió algo en el medio), 409 "Refrescá el tablero y volvé a correr el día".
- **Comodines fuera del rango cargado:** el grupo "Comodines" de la bandeja ve lo que el tablero
  tiene cargado; un comodín planificado varias semanas más allá aparece cuando se navega hasta
  ahí. El aviso de las 13 h sí mira 21 días hacia adelante.
- **Recalibrar:** los números están todos en `guardias-tipos.ts` (2 por semana, ranuras,
  4 semanas de rotación, 3 días hábiles, 7 días de comodín, 13 h, 5 días del indicador).
