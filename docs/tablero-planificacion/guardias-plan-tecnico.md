# Guardias y comodines: plan técnico (18/10/2026)

Cómo se construye lo que pide [guardias-contrato.md](guardias-contrato.md). **Si este plan
contradice al contrato, manda el contrato**; si contradice al código, mirá el código y avisá.
Contexto: [guardias.md](guardias.md), [comodines.md](comodines.md),
[maqueta-guardias.html](maqueta-guardias.html) y [handoff.md](handoff.md).

> **Cambio del 18/10 (decidido por JS):** el comodín dejó de calcularse. Es una OT que
> Planificación marca a mano (tabla `plan_comodines`, ruta `/api/planificacion/comodines`), sin
> piso ni vencimiento. Lo que este plan dice del cálculo (`piso`, `espera`, `vencido`,
> `DIAS_MAX_COMODIN`, la alerta `comodin_vencido`) quedó como historia; lo vigente está en el
> contrato §2 y en [guardias-handoff.md](guardias-handoff.md), "Comodines marcados a mano".

Lo construyen **tres tracks en paralelo en el mismo worktree** (`feat/guardias`), con archivos
**disjuntos** (sección 11). Lo compartido ya está escrito y no se toca sin avisar (sección 1).

---

## 0. Decisiones del arquitecto (y por qué)

1. **La guardia es una fila de `tablero_tareas` con `tipo = 'guardia'`**, como recomienda el
   contrato. Ocupa capacidad sola, el corrimiento ya no la mueve y frena la cascada, el
   asistente ya la lee. Las columnas propias llevan prefijo `guardia_`.
   - **Activa** viaja en el payload del tablero como una tarea (su id = el de su
     `AsignacionTablero`). **Usada o sacada** deja de viajar (`tareasEnRango` la filtra) y queda
     sólo en la historia. **Rellenada con depósito** (nadie la usó y el día pasó) sigue viajando
     como la tarea "Depósito" que fue, con `tarea.tipo = 'deposito'` y `tarea.deGuardia = true`
     (sólo lectura).
   - Rellenada con comodín: deja de viajar; en la celda está el comodín.
2. **La semana y la ranura hacen idempotente la corrida**: índice único
   `(guardia_semana, guardia_ranura)`. Una sacada conserva su ranura → la semana no se repone.
3. **Nadie escribe una guardia con su sesión**: políticas RESTRICTIVE en la migración de
   guardias. Las rutas validan el candado y escriben con la service role.
4. **Las rutas comunes nunca usan una guardia**: si una escritura cae en la celda de una guardia
   activa, contestan **409 `RechazoCandado`** y el tablero pasa por
   `/api/planificacion/guardias/usar`, que es la única que la reemplaza (un lote, deshacible).
5. **Al aprobar, la acción pedida se ejecuta**: la solicitud guarda el `PedidoUsoGuardia`. Si
   la grilla cambió y no se puede ejecutar, queda **aprobada y habilitada**
   (`error_ejecucion`) y quien pidió la usa después con `solicitudId`.
6. **"Meter urgente" reusa `POST /api/ordenes-trabajo/[id]/urgencia`**, que ya escribe
   `x_urgencia` y `x_motivo_urgencia` con motivo obligatorio y avisa. No hace falta ruta nueva.
7. **El depósito no se confirma a mano.** Mientras el día no pasó, la guardia sigue activa y
   protegida (el capataz igual recibe "Depósito · mantenimiento de material"). La corrida de las
   13 h cierra las guardias de días pasados como `rellenada · deposito`. Confirmarlo antes
   dejaría una celda sin candado donde se podría apilar cualquier cosa.
8. **Liberación por salida** (no está en el contrato; cierra un atajo): si la obra que usó una
   guardia se va de su celda (se mueve o se quita) y la celda queda totalmente libre, la guardia
   vuelve a `activa`. Sin esto, "usar con una urgencia y después mover la urgencia" achicaría el
   lugar protegido sin pedir nada.
9. **La Hoja del día hoy no muestra ninguna tarea del tablero** (sólo obras de Odoo). Para que el
   capataz reciba "Depósito · mantenimiento de material" hay que sumar las tareas del día a la
   Hoja. Se suman **todas** las tareas con cuadrilla (no sólo las guardias): son trabajo real que
   Operaciones le asigna a la cuadrilla, y mostrar sólo la guardia-como-depósito y no un depósito
   de verdad sería incoherente. **A confirmar con JS** (sección 9.4).
10. **Días hábiles = lunes a sábado sin feriados** (`dias-habiles.ts`). No es
    `siguienteDiaLaboral` (que sólo saltea el domingo, regla del reparto de obras).
11. **"Creada en los últimos 3 días hábiles"** = `diasHabilesEntre(fechaCreacionBA, hoyBA) <= 3`
    (creada el jueves, el lunes todavía vale: viernes, sábado, lunes). Sin `creadaEl`, no cumple
    (falla cerrado → pasa por JS).
12. **"Armado atrasado"** = armado, `en_proceso`, y `cerradas >= ceil(jornadas)` o
    `asignadas > ceil(jornadas)` (se cerraron tantos días como lo estimado y sigue, o el plan ya
    tiene más días). `jornadas` = estimado de Comercial (`x_duracion_est`).

---

## 1. Lo compartido (YA ESCRITO por el arquitecto; no se cambia sin coordinar)

| Archivo | Qué es | Dueño después |
|---|---|---|
| `src/lib/tablero/guardias-tipos.ts` | Todos los tipos y constantes (`Guardia`, `PedidoUsoGuardia`, `RechazoCandado`, `DIAS_MAX_COMODIN`…) | congelado (cambios: avisar a los tres) |
| `src/lib/tablero/dias-habiles.ts` | Días hábiles y hora de BA, implementado | nucleo (tests) |
| `src/lib/tablero/guardias.ts` | Lógica pura: firmas definitivas; las cortas hechas, las de regla con `throw new Error("pendiente")` | nucleo |
| `src/lib/tablero/comodines.ts` | Comodines: firmas definitivas, `comodinPuedeIr` y `textoChipComodin` hechas | nucleo |
| `src/lib/tablero/corrimiento.ts` | Se agregó `guardiasConsumidas` (hoy `[]`), `GuardiaConsumida` y `reactivarGuardias` en `invertirCorrimiento` | nucleo |
| `src/lib/tablero/tipos.ts` | `tipoTareaLabel('guardia')`, `OtTablero.creadaEl?`, `DatosTarea.deGuardia?` | nucleo |
| `src/lib/auth/acceso.ts` | Módulo explícito `planificacion-autoriza` (ruta `/planificacion/autorizaciones`) y APIS de guardias | seguridad |
| `src/lib/auth/servidor.ts` | `exigirPermisoDeApi(req)`: segunda llave con la misma regla que el proxy | seguridad |
| `supabase/migrations/20261018100001_guardias.sql` | Modelo de datos completo (sección 2) | nucleo (sólo si hace falta corregir) |

Firmas clave (ver los archivos para el comentario completo):

```ts
// guardias.ts
esGuardia(a): boolean
claveCelda(cuadrillaId, fecha): string
guardiasPisadas(jornadas, activas): GuardiaResumen[]
esCuadrillaPropia(c): boolean
numeroDeCuadrilla(c): number;  siglaCuadrilla(c): string        // "C3"
aperturaRelleno(fechaGuardia, feriados): string                   // ISO, 13 h BA del hábil anterior
cuentaConGuardias(asignaciones, capacidad): CuentaConGuardias     // encabezado y fila
motivoCeldaNoApta(grilla, celda, ignorarId?): string | null       // pendiente
planearGuardiasSemana(e: EntradaColocacion): ResultadoColocacion  // pendiente
destinoValidoGuardia(grilla, guardia, destino, otras): string | null  // pendiente
evaluarCandado(e: EntradaCandado): DecisionCandado                // pendiente
urgenciaCumple(ot, ahora, feriados): boolean                      // pendiente
armadoAtrasado(ot, avance): boolean                               // pendiente
guardiaMasCercanaPara(e): { guardia, decision } | null            // pendiente
candidatosRelleno(e: EntradaRelleno): CandidatoRelleno[]          // pendiente
textoAvisoRelleno(guardia, sigla, candidatos): { titulo, descripcion }   // pendiente
textoAvisoColocacion(resultados, sigla): { titulo, descripcion }  // pendiente
lugarProtegido(e): LugarProtegido                                 // pendiente
tareaParaCapataz(a): TareaParaCapataz | null                      // hecha

// comodines.ts
evaluarComodines(e: EntradaComodines): Comodin[]                  // pendiente (incluye vencidos)
comodinDe(ot, e): Comodin | null                                  // pendiente
comodinPuedeIr(c, fecha): boolean                                 // hecha
textoChipComodin(c): string                                       // hecha

// dias-habiles.ts (hechas)
diaIso, esDiaHabil, sumarDias, lunesDe, diaDeSemana, siguienteDiaHabil, anteriorDiaHabil,
diasHabilesEntre, proximosDiasHabiles, hoyBA, instanteBA, fechaBADeOdoo

// auth/servidor.ts (hecha)
exigirPermisoDeApi(req): Promise<{ userId, acceso } | NextResponse>
```

---

## 2. Modelo de datos

**Migración 1 — `supabase/migrations/20261018100001_guardias.sql` (escrita).** Idempotente, sin
BEGIN/COMMIT, se ensaya con `scripts/probar-migracion.mjs` y se aplica con
`npx supabase db query --linked -f`. La aplica el orquestador al final.

- Funciones de permiso: `plan_nivel(modulo)`, `plan_puede_ver()`, `plan_puede_editar()`
  (admin incluido) y `plan_autoriza_guardias()` (sólo el módulo explícito, sin atajo de admin).
- `tablero_tareas` + columnas `guardia_estado`, `guardia_origen`, `guardia_uso`,
  `guardia_ot_id`, `guardia_asignacion_ids BIGINT[]`, `guardia_semana DATE`, `guardia_ranura`,
  `guardia_por_que`, `guardia_lote_id`, `guardia_estado_por`, `guardia_estado_at`,
  `guardia_estado_motivo`. CHECKs: forma (sólo tipo guardia; jornada entera; con cuadrilla;
  semana = lunes de la fecha), uso ↔ estado.
- Índices únicos: `(guardia_semana, guardia_ranura) WHERE tipo='guardia'` y
  `(cuadrilla_odoo_id, fecha) WHERE tipo='guardia' AND guardia_estado='activa'`.
- RLS: tres políticas **RESTRICTIVE** (INSERT/UPDATE/DELETE) que dejan a `authenticated` sin
  escribir filas tipo guardia. Trigger `tablero_tareas_candado_guardia`: una tarea común no
  entra en la celda de una guardia activa de hoy en adelante (salvo service role).
- `plan_guardia_eventos` (historia, append-only, sólo service role escribe; lee
  `plan_puede_ver()`; FK `ON DELETE RESTRICT`).
- `plan_guardia_solicitudes` (pedidos a JS; `pedido JSONB` = `PedidoUsoGuardia`; un pendiente
  por guardia+tipo+OT; lee `plan_puede_ver() OR plan_autoriza_guardias()`).
- Da `planificacion-autoriza: editar` a `js@andamiosbuenosaires.com.ar`.

**Migración 2 — `supabase/migrations/20261018100002_tablero_rls.sql` (la escribe seguridad).**
Ver sección 7.

**Mapeo en `tareasEnRango` (`src/lib/tablero/tareas.ts`, nucleo):**
- filtro: `tipo <> 'guardia' OR guardia_estado = 'activa' OR (guardia_estado = 'rellenada' AND guardia_uso = 'deposito')`
  (PostgREST: `.or("tipo.neq.guardia,guardia_estado.eq.activa,and(guardia_estado.eq.rellenada,guardia_uso.eq.deposito)")`);
- activa → `tarea: { tipo: 'guardia', titulo: 'Guardia', … }`;
- rellenada·deposito → `tarea: { tipo: 'deposito', titulo: 'Depósito', deGuardia: true, hecha: true }`.
- `crearTarea`/`actualizar*`/`moverTareas`/`borrarTareas` no cambian (la RLS ya las frena
  sobre guardias; la ruta además rechaza explícito, ver 5.3).

**Servicio del servidor (nucleo) — `src/lib/planificacion/guardias.ts`** (SÓLO SERVIDOR, con
la service role para escribir guardias, eventos y solicitudes):

```ts
leerGuardias(db, desde, hasta): Promise<GuardiasPayload>
activasEnCeldas(db, celdas: {cuadrillaId, fecha}[], desdeFecha: string): Promise<GuardiaResumen[]>
leerGrilla(desde, hasta): Promise<GrillaGuardias & { ots: Map<number, OtTablero>; progreso: Map<number, ProgresoOt> }>
   // fetchTablero + tareasEnRango(admin) + plan_suspensiones + feriadosDelRango
ponerGuardias(adm, semana, resultado): Promise<number[]>          // INSERT … ON CONFLICT DO NOTHING + evento 'poner'
usarGuardias(sesion, pedido: PedidoUsoGuardia): Promise<RespuestaUsoGuardia | RechazoCandado>
deshacerUso(sesion, d: DeshacerUsoGuardia): Promise<void>
moverGuardia(sesion, m: MoverGuardia): Promise<void>
sacarGuardia(sesion, s: SacarGuardia, solicitudId?): Promise<void>
consumirPorLluvia(adm, guardiaIds, loteId, autorId): Promise<number[]>
reactivarDeLote(adm, loteId, guardiaIds, autorId): Promise<number[]>
liberarPorSalida(adm, asignacionIds, autorId): Promise<number[]>   // decisión 8
cerrarPasadasComoDeposito(adm, hoy): Promise<number>
crearSolicitud(sesion, s: NuevaSolicitud): Promise<SolicitudGuardia>
responderSolicitud(sesion, r: RespuestaSolicitud): Promise<ResultadoAutorizacion>
listarSolicitudes(db, filtro: { estado?: EstadoSolicitud | "todas" }): Promise<SolicitudGuardia[]>
destinatariosPlanificacion(adm): Promise<string[]>   // user_profiles activos con planificacion=editar
destinatariosAutoriza(adm): Promise<string[]>        // activos con planificacion-autoriza=editar
```

Y el freno común para las rutas que ya existen — `src/lib/planificacion/candado-guardias.ts`
(nucleo):

```ts
/** 409 RechazoCandado si alguna celda destino (fecha >= hoy BA) tiene una guardia activa; null si se puede seguir. */
frenoDeGuardias(celdas: { cuadrillaId: number | null; fecha: string }[], ctx?: { otId?: number; esApoyo?: boolean }): Promise<NextResponse | null>
```
Si la lectura de Supabase falla, **falla cerrado** (503 "No pude comprobar las guardias:
probá de nuevo"), al revés que `frenoDeRoles`: el candado no puede abrirse por un error.

---

## 3. Rutas nuevas (todas bajo `/api/planificacion/guardias`, nucleo)

Todas empiezan con `exigirPermisoDeApi(req)` (el proxy ya filtra; es la segunda llave). Los
errores van en castellano en `{ error }`. 400 = cuerpo inválido (zod, con el campo adelante,
como en asignaciones), 401/403 = permiso, 409 = candado o estado que cambió, 502 = Odoo, 503 =
no se pudo comprobar.

| Método y ruta | Quién (APIS) | Entrada | Salida | Errores |
|---|---|---|---|---|
| `GET /api/planificacion/guardias?desde&hasta` | planificacion ver | — | `GuardiasPayload` | 400 fechas |
| `POST …/guardias/usar` | planificacion editar | `PedidoUsoGuardia` | `RespuestaUsoGuardia` | 409 `RechazoCandado` (no cumple → `pide`); 409 "la guardia ya no está activa"; 502 Odoo |
| `POST …/guardias/deshacer` | planificacion editar | `DeshacerUsoGuardia` | `{ ok: true }` | 409 si la guardia ya no está usada por ese lote o las jornadas cambiaron |
| `POST …/guardias/mover` | planificacion editar | `MoverGuardia` | `{ ok: true, guardia: Guardia }` | 409 con el motivo de `destinoValidoGuardia` |
| `POST …/guardias/sacar` | **planificacion-autoriza** | `SacarGuardia` | `{ ok: true }` | 409 si no está activa |
| `GET …/guardias/solicitudes?estado=pendiente\|todas` | planificacion ver (JS es admin: pasa) | — | `{ solicitudes: SolicitudGuardia[] }` | — |
| `POST …/guardias/solicitudes` | planificacion editar | `NuevaSolicitud` | `{ solicitud }` | 400 sin motivo o sin pedido; 409 ya hay una pendiente igual (devuelve la existente) |
| `DELETE …/guardias/solicitudes` `{ solicitudId }` | planificacion editar | — | `{ ok }` | sólo quien pidió y sólo pendiente: cancelar |
| `POST …/guardias/autorizar` | **planificacion-autoriza** | `RespuestaSolicitud` | `ResultadoAutorizacion` | 409 si ya no está pendiente |

**`usar` paso a paso** (un solo lote; si algo falla en Odoo a mitad, 502 y el tablero relee):
1. Lee las guardias de `guardiaIds` (admin). Todas activas, `fecha >= hoy`. Si no → 409.
2. Comprueba que las jornadas de `crear`/`mover` pisan EXACTAMENTE esas guardias
   (`guardiasPisadas`). Para `mover` sin `cuadrillaId` lee la cuadrilla de Odoo.
3. Lee la OT (Odoo: `x_tipo, x_estado, x_urgencia, create_date, x_fecha_desde, x_duracion_est`)
   y, si hay apoyo, el avance del armado; arma `OtParaCandado`; calcula `esComodin` con
   `comodinDe`. Si viene `solicitudId`, la solicitud tiene que ser aprobada, de esa guardia y
   esa OT, sin `ejecutada_at`.
4. `evaluarCandado` por guardia. Si alguna no es libre → 409 `RechazoCandado` con su `pide`.
5. `frenoDeRoles` (apoyos) igual que asignaciones; después `crearAsignaciones` y/o
   `moverAsignaciones` en Odoo; `sincronizarFechaProgramada` en `after()`.
6. Guardias → `usada|rellenada` (`ESTADO_POR_USO`), `uso`, `ot_id`, `asignacion_ids` (las
   jornadas de la obra que caen en su celda), `lote_id` nuevo, `estado_por`, evento `usar` o
   `rellenar`. Solicitud → `ejecutada_at`.
7. `plan_movimientos` con la sesión (`registrarMovimiento`, `lote_id` = el del uso, `motivo`
   = "De guardia (urgencia)" etc.).

**`deshacer`**: borra `borrar` (Odoo), devuelve `volver` (Odoo), y las guardias con
`guardia_lote_id = loteId` vuelven a `activa` (uso, ot, asignaciones y lote en NULL; evento
`reactivar` "Deshizo el uso"). Si la celda ya no está libre, 409 y no toca nada.

**`autorizar`** (JS): rechazar → estado `rechazada`, aviso a quien pidió. Aprobar → `aprobada`;
`sacar` → `sacarGuardia`; los otros → `usarGuardias(pedido, { solicitudId })` con la sesión de
JS como autor del evento `aprobar` y del uso. Si `usar` falla → `error_ejecucion` = el motivo,
`ejecutada: false`, y el aviso a quien pidió dice "JS aprobó: soltala de nuevo" (el tablero
manda `solicitudId`).

---

## 4. Crons

Protegidos como `src/app/api/cron/personal-odoo/route.ts`: `CRON_SECRET` por
`Authorization: Bearer` o `x-cron-secret`, **falla cerrado** sin la variable; `GET` y `POST`;
`maxDuration = 60`. Se suman a `publicPaths` de `src/lib/supabase/proxy.ts` (ruta completa,
con su comentario) y a `vercel.json`:

```json
{ "path": "/api/cron/guardias-viernes", "schedule": "0 13 * * 5" },
{ "path": "/api/cron/guardias-relleno", "schedule": "0 16 * * 1-6" }
```

### 4.1 `/api/cron/guardias-viernes` (vie 10 h AR)
- `?hoy=AAAA-MM-DD` opcional (sólo con el secreto): "como si hoy fuera". El arranque del 18/10
  se corre con `?hoy=2026-10-23` → cubre las semanas del 26/10 y del 02/11.
- Semanas: `lunesDe(hoy) + 7` y `+ 14`. Nunca la semana en curso.
- Por semana, en orden (+1 y después +2): **vuelve a leer** la grilla (`leerGrilla` desde el
  sábado anterior hasta el lunes siguiente, para ver obras de varios días), las guardias de la
  semana (todas) y la rotación (guardias no sacadas por cuadrilla en las 4 semanas anteriores
  + lo que esta corrida ya puso en +1) → `planearGuardiasSemana` → `ponerGuardias` con
  `ON CONFLICT DO NOTHING` (idempotente).
- Aviso `guardia_puesta` (sección 6) con `textoAvisoColocacion`, una alerta por persona de
  Planificación y JS, `clave = guardia_puesta:<semana+1>:<userId>`.
- Responde `{ semanas: ResultadoColocacion[], puestas: number }` (para correrlo a mano).

### 4.2 `/api/cron/guardias-relleno` (lun–sáb 13 h AR)
1. `cerrarPasadasComoDeposito(hoy)`: guardias activas con `fecha < hoy` → `rellenada · deposito`,
   evento `rellenar` "Nadie la usó: la cuadrilla fue al depósito".
2. Para cada guardia activa de `siguienteDiaHabil(hoy)`: `candidatosRelleno` (leyendo la grilla
   de hoy a +21 días) → `textoAvisoRelleno` → alerta `guardia_relleno` a Planificación,
   `clave = guardia_relleno:<guardiaId>:<userId>`.
3. Comodines vencidos (`evaluarComodines` con `vencido`) → alerta `comodin_vencido` a
   Planificación, una vez por OT (`clave = comodin_vencido:<otId>:<userId>`). No escribe Odoo.

### 4.3 El corrimiento consume la guardia (`corrimiento.ts` + su ruta, nucleo)
- `planearCorrimiento`: para cada celda destino de `movidas` con una guardia **activa**
  (`esGuardia`), la guardia va a `guardiasConsumidas` (con las obras que caen) y **no cuenta en
  la sobrecarga** de esa celda (la reemplaza, no se suma). La cascada ya frena ahí (la guardia
  no es movible). Una guardia en el día suspendido mismo no se toca.
- `invertirCorrimiento(..., guardiasConsumidas)` devuelve `reactivarGuardias` (ya escrito).
- Ruta `POST /api/planificacion/corrimiento`: cuerpo nuevo opcional `consumirGuardias:
  number[]` (lo que vio el tablero) y `reactivarGuardias: number[]` (deshacer). **El servidor
  es la autoridad**: lee la cuadrilla de cada jornada movida (Odoo), busca guardias activas en
  las celdas destino y consume ésas (`consumirPorLluvia`, con el `loteId` del corrimiento),
  aunque el tablero no las haya mandado. Al deshacer (`levantaLote`), `reactivarDeLote`.
  Respuesta: suma `guardiasConsumidas: number[]`.

---

## 5. El candado en cada ruta que escribe (nucleo)

Regla: **ninguna ruta común pone nada en la celda de una guardia activa (fecha ≥ hoy BA)**; si
lo intenta, `frenoDeGuardias` contesta 409 `RechazoCandado` con
`error: "Esa jornada es una guardia: …"` y `pide` (calculado con `evaluarCandado` si se sabe la
OT; si no, `obra_comun`). El tablero, que ya lo evaluó antes de soltar, nunca debería verlo:
es la defensa contra un tablero viejo o una llamada a mano.

| Ruta | Qué se valida |
|---|---|
| `POST /api/planificacion/asignaciones` (soltar obra, sumar apoyo, editor de jornadas) | celdas de `asignaciones[]` |
| `PATCH …/asignaciones` mover | celdas destino (`cuadrillaId` del movimiento o el actual de Odoo) |
| `PATCH …/asignaciones` actualizar con `fecha` o `cuadrillaId` | celdas destino de los ids |
| `PATCH …/asignaciones` roles | nada (no cambia celdas) |
| `DELETE …/asignaciones` | nada que frenar; después `liberarPorSalida(ids)` |
| `PATCH` mover/actualizar (después de escribir) | `liberarPorSalida(ids)` (decisión 8) |
| `POST /api/planificacion/corrimiento` | consume en vez de frenar (4.3) |
| `POST /api/planificacion/tareas` | celdas de los días creados (+ trigger de la base) |
| `PATCH …/tareas` | si algún id es guardia → 409 "Las guardias se corren desde su menú"; celdas destino de movimientos/cambios (+ trigger) |
| `DELETE …/tareas` | si algún id es guardia → 409 "Para sacar una guardia hace falta la autorización de JS" |
| `POST/PATCH /api/planificacion/jornadas` (reprogramar, no planificada) | celda de la nueva fecha |

Además, **cada handler que escribe** arranca con `exigirPermisoDeApi(req)` (segunda llave). En
los archivos de nucleo lo pone nucleo; en el resto, seguridad (sección 7).

---

## 6. Avisos (nucleo)

`src/lib/alertas/servicio.ts` (`TipoAlerta`) y `src/lib/alertas/slack.ts` (`DESTINOS`,
`ESTILO`, canal nuevo):

| Tipo | Cuándo | A quién | Slack |
|---|---|---|---|
| `guardia_puesta` | corrida del viernes | Planificación + JS | `planificacion` |
| `guardia_relleno` | 13 h, por guardia libre de mañana | Planificación | no |
| `guardia_solicitud` | se pidió autorización | JS (`destinatariosAutoriza`) | `planificacion` (destacado) |
| `guardia_respuesta` | JS aprobó o rechazó | quien pidió | no |
| `comodin_vencido` | 13 h, comodín que pasó los 7 días hábiles | Planificación | no |

- Canal nuevo `planificacion` en `slack.ts`: `process.env.SLACK_WEBHOOK_PLANIFICACION ||
  undefined` (sin variable no sale nada: "si hay un canal configurado").
- Se crean con la **service role** (la RLS de `alertas` no deja insertar a depósito/campo),
  una fila por persona (`destinatarioId`), `espejoSlack` sólo en la primera.
- Enlaces: Planificación → `/planificacion?fecha=<fecha>`; JS → `/planificacion/autorizaciones`.
- "Planificación" = perfiles activos con `permisos.planificacion = 'editar'` (no los admin por
  rol: ya ven todas las alertas).

---

## 7. Seguridad (track seguridad)

1. **Segunda llave en todas las rutas de planificación que escriben** con
   `exigirPermisoDeApi(req)` (misma regla que el proxy). Inventario de handlers que escriben:
   `cajon`, `comentarios`, `confirmaciones`, `contactos-obra`, `documentos`, `empleados`,
   `jornadas-plan`, `movimientos`, `notas`, `ot`, `partes`, `suspensiones`, `cuadrillas-futuras`
   (los que tengan POST/PATCH/PUT/DELETE). **No** tocar `asignaciones`, `corrimiento`, `tareas`,
   `jornadas` ni `guardias/**` (son de nucleo, que pone la llave ahí). Revisar también
   `/api/ordenes-trabajo/[id]/urgencia` ("Meter urgente": hoy mira sólo la sesión).
2. **RLS — migración `20261018100002_tablero_rls.sql`** (después de la de guardias, usa
   `plan_puede_ver()`/`plan_puede_editar()`):
   - **Obligatorio:** `tablero_tareas` → reemplazar "Autenticados gestionan tareas del tablero"
     por INSERT/UPDATE/DELETE con `plan_puede_editar()`; SELECT sigue `true` (lo leen el
     asistente y comercial). Las restrictivas de guardias quedan.
   - **Hoy nadie escribe estas tablas desde el navegador**: todo pasa por
     `/api/planificacion/*` con la sesión del usuario (inventario abajo). Cerrar = exigir el
     permiso del módulo en la política, alineado con el mapa APIS (el mismo usuario que la ruta
     deja pasar tiene que pasar la RLS, o la ruta se rompe):

     | Tabla | La escribe | Política de escritura |
     |---|---|---|
     | `tablero_tareas` | `/tareas` (planificacion) | `plan_puede_editar()` |
     | `plan_suspensiones` | `/corrimiento`, `/suspensiones` (planificacion) | `plan_puede_editar()` |
     | `plan_movimientos` (INSERT, append-only) | `/asignaciones`, `/corrimiento`, `/guardias/usar` (planificacion) | `autor_id = auth.uid() AND plan_puede_editar()` |
     | `plan_jornadas_ot` | `/jornadas-plan` (planificacion) | `plan_puede_editar()` |
     | `plan_confirmaciones` | `/asignaciones`, `/confirmaciones` (planificacion **o partes**) | `plan_nivel('planificacion')='editar' OR plan_nivel('partes')='editar'` |
     | `plan_notas_dia` | `/notas` (planificacion o partes) | ídem |
     | `plan_cajon_notas`, `plan_cajon_pendientes` | `/cajon` (planificacion) **y la Hoja del día** (`hoja-dia/acciones.ts` con la sesión de quien tiene hoja-dia) | `plan_puede_editar() OR plan_nivel('hoja-dia')='editar'` |
     | `ot_comentarios` | `/comentarios` (planificacion u ordenes-trabajo) | verificar antes |

     Antes de cerrar cada una: `grep` de quién la escribe y con qué cliente. Si una tabla no se
     puede mapear con certeza, **no se cierra** y queda anotada.
   - Ensayar con `scripts/probar-migracion.mjs` si hay `SUPABASE_DB_URL` (sólo ROLLBACK); no
     aplicar.
3. **El candado de habilitaciones que falla abierto:**
   - servidor: sumar `"/api/habilitaciones/candado": ["habilitaciones", "planificacion"]` en
     APIS (GET con planificacion ver; POST con planificacion editar) y revisar que `sesion()` de
     `src/app/api/habilitaciones/_comun.ts` y la RLS de las tablas que lee/escribe
     (`hab_gestiones`…) dejen pasar a Depósito y Campo, o que la ruta use la service role
     después de validar.
   - pantalla (lo hace el track pantalla, sección 8): si `useCandado` da error o no terminó para
     esa OT, confirmar pide pasar por un aviso ("No pude comprobar el permiso municipal") con
     motivo, en vez de confirmar sin fricción.
4. **El permiso "solo JS"**: ya está el módulo (`planificacion-autoriza`). Falta: `ACCION` en
   `src/lib/auth/explicitos-servidor.ts` → `"permiso_guardias"`, `AccionAuditoria` en
   `src/lib/direccion/auditoria.ts`, y el CHECK de `direccion_auditoria` en la migración de
   seguridad (sumar `'permiso_guardias'`, con el mismo `DO $aud$ … IF to_regclass` que
   Sistemas). Tests en `acceso.test.ts`: el admin sin el módulo no pasa
   `/api/planificacion/guardias/sacar` ni `/autorizar`; JS sí; Planificación pasa
   `/api/planificacion/guardias/usar` y no `/sacar`.

---

## 8. Pantalla (track pantalla)

**Reglas del módulo:** nada nuevo bajo `["tablero"]` que no sea el payload de asignaciones (las
guardias activas ya están ahí como tareas); lo demás en keys propias. Lo que escribe en Odoo va
en un lote y se deshace entero. Textos cortos, rioplatenses, sin jerga.

**Hooks — `src/hooks/use-guardias.ts` (nuevo):**
- `useGuardias(desde, hasta)` → `["guardias-tablero", desde, hasta]`, `GuardiasPayload`.
- `useSolicitudesGuardia(estado)` → `["guardias-solicitudes", estado]`.
- `useUsarGuardia()` (optimista sobre `["tablero"]`: saca la tarea guardia y suma las jornadas
  con ids temporales; devuelve `RespuestaUsoGuardia`), `useDeshacerUsoGuardia()`,
  `useMoverGuardia()` (optimista), `useSacarGuardia()`, `usePedirAutorizacion()`,
  `useCancelarSolicitud()`, `useResponderSolicitud()`.
- `usePuedeAutorizar()`: `nivelEn(acceso, "planificacion-autoriza") === "editar"` con el perfil
  de `useUser()`.
- Todas invalidan `["guardias-tablero"]` y `["guardias-solicitudes"]`; las que tocan Odoo,
  `refrescarPronto` del tablero.
- `use-tablero.ts`: `useCorrerDia` manda `consumirGuardias`/`reactivarGuardias` y en `onMutate`
  saca las guardias consumidas del payload. `use-avisos-tablero.ts`: invalida también las dos
  keys nuevas.

**Por componente:**
- `globals.css` + `colores.ts`: tokens `--tb-guardia-fondo`, `--tb-guardia-raya`,
  `--tb-guardia-borde`, `--tb-guardia-texto`, `--tb-guardia-sello` (claro y oscuro; ámbar
  claro, **nunca rojo**), objeto `GUARDIA` en `colores.ts`; pares en
  `scripts/contraste-tablero.mjs` (`npm run contraste` en verde).
- `tarjeta-guardia.tsx` (nuevo) y `tarjeta-asignacion.tsx`: si `esGuardia(a)` → bloque rayado
  con borde, sello "GUARDIA", escudo (`ShieldCheck` de lucide), "1 j"; segundo renglón "si no
  entra nada: Depósito" (o "… : comodín S02658" si `candidatosRelleno` da un comodín). La obra
  que usa una guardia lleva chip "de guardia" (sale de `useGuardias`: `asignacionIds`). Una
  tarea `deGuardia` se ve como depósito, sólo lectura. Comodín: naipe (`Spade` o similar) y chip
  `textoChipComodin`; vencido, "Esperando hace N días hábiles" en rojo.
- `celda-dia.tsx`: resaltado de destino válido durante el arrastre (guardias donde puede ir el
  comodín; celdas válidas al correr una guardia) y atenuado del resto.
- `tablero-grid.tsx`: encabezado del día "libre X · guardia Y" (`cuentaConGuardias` de las
  cuadrillas visibles); fila "4,5 de 6 j + 1 guardia"; indicador "Lugar protegido próximos 5
  días hábiles: X de N j" (`lugarProtegido`), gris o ámbar (puede ir en `topbar-tablero.tsx`).
- `ficha-guardia.tsx` (nuevo, Sheet como `panel-ot.tsx`): "La puso el sistema el vie 23/10",
  `porQue`, estado, historia (`eventos`), pedidos; acciones: Correr (menú con días/cuadrillas
  válidos según `destinoValidoGuardia`), Pedir autorización (sacar), y para JS **Sacar**.
- `dialogo-pedir-autorizacion.tsx` (nuevo): motivo obligatorio de una línea; tipo según
  `DecisionCandado.pide`; "Hasta que JS responda, la guardia sigue puesta".
- `bandeja-autorizaciones.tsx` (nuevo) + página
  `src/app/(dashboard)/planificacion/autorizaciones/page.tsx`: pedidos pendientes con
  Aprobar/Rechazar (respuesta opcional), y los resueltos recientes; en el tablero, un acceso
  con contador para JS (topbar).
- `tablero-board.tsx`:
  - `asignarObra` / `moverBloque` / `soltarApoyo`: si alguna jornada cae en una guardia
    activa → `evaluarCandado` (con `comodinDe`, `armadoAtrasado` vía progreso) → libre:
    `useUsarGuardia` (crear o mover; el comodín SE MUEVE) y `ofrecerDeshacer` con
    `useDeshacerUsoGuardia`; no libre: `DialogoPedirAutorizacion` con el `pedido` armado. Nunca
    se apila.
  - mover un bloque guardia → `destinoValidoGuardia` → `useMoverGuardia` (deshacer = moverla de
    vuelta); soltarla en la bandeja o "Quitar" → "Para sacarla hace falta la autorización de JS"
    (+ Pedir / Sacar si es JS); el diálogo de tarea no abre para una guardia.
  - un 409 con `codigo: "guardia"` de cualquier mutación → ofrece "Pedir autorización".
  - candado de habilitaciones: si `useCandado` dio error (o no terminó) para la OT, confirmar
    pasa por `DialogoCandado` con una fricción "no se pudo comprobar" (pide motivo) en vez de
    `aplicar()` directo (sección 7.3).
  - `correrElDia`: manda `consumirGuardias`, el deshacer `reactivarGuardias`.
- `dialogo-correr-dia.tsx`: lista "Usa la guardia del jue 22 (C3): Thames 1820" y no la cuenta
  como sobrecarga.
- `panel-sin-asignar.tsx`: grupo "Comodines (N · X j)" arriba (también los que ya están en la
  grilla, por espera, con dónde están hoy o "sin fecha" y el piso); "Meter urgente" en el menú
  de la tarjeta.
- `panel-ot.tsx`: "Meter urgente" y, después, "Guardia más cercana que puede usar: mar 03/11 C2
  [Ir]" (`guardiaMasCercanaPara`); naipe/chip si es comodín.
- `dialogo-meter-urgente.tsx` (nuevo): motivo obligatorio → `POST
  /api/ordenes-trabajo/[id]/urgencia { urgencia: "alta", motivo }`; deshacer = volver a la
  urgencia anterior (una sola escritura). Invalida `["tablero"]`.
- `apoyo-ot.tsx`: sumar un apoyo sobre una guardia → `useUsarGuardia` (uso atraso si cumple; si
  no, pedir).

---

## 9. Lo que el capataz ve (nucleo)

1. `src/lib/hoja-dia/servicio.ts`: al leer el día, también las tareas del tablero de esa fecha
   (service role, `tareasEnRango`) → `tareaParaCapataz` → `DiaHoja.tareas?: TareaParaCapataz[]`
   (opcional en `tipos.ts`, así los fixtures de test no se rompen).
2. `estado.ts`: `tareasDe(dia, c)`; las cuadrillas con sólo tareas cuentan como "con obras"
   para tener hoja (`cuadrillasConObras`, `cuadrillasConHoja`), sin romper cierre ni camiones
   (una tarea no tiene parte ni OT: no entra en `obrasDe`).
3. `mensajes.ts` (Telegram y mensaje de la hoja), `publico.ts`/`vista.ts` (celular del
   capataz) y `src/components/hoja-dia/pizarron/columna.tsx`: un renglón por tarea con su
   título. **Nunca la palabra "guardia"**: test que recorra los textos de un día con una
   guardia y falle si aparece `/guardia/i`.
4. A confirmar con JS: que se sumen todas las tareas y no sólo la guardia (decisión 9).

---

## 10. Asistente comercial (nucleo)

`src/lib/asistente/planificacion.ts`: la guardia activa se describe como "reservada para
imprevistos (no se ofrece)"; cada día suma `libreSinGuardia` (lo libre que se puede ofrecer) y la
consulta devuelve `primeraFechaSinGuardia` para una duración dada (sin tocar guardias ni pasarse
de la jornada). Actualizar la descripción de la herramienta en `herramientas.ts` si hace falta.

---

## 11. Reparto de archivos (disjuntos)

**nucleo:** `src/lib/tablero/{guardias,comodines,dias-habiles,corrimiento,tareas,tipos}.ts` y
sus tests nuevos (`guardias.test.ts`, `comodines.test.ts`, `dias-habiles.test.ts`,
`corrimiento-guardias.test.ts`); `src/lib/planificacion/{guardias,candado-guardias}.ts`;
`src/app/api/planificacion/guardias/**`; `src/app/api/planificacion/{asignaciones,corrimiento,tareas,jornadas,tablero}/route.ts`;
`src/app/api/cron/guardias-viernes/route.ts`, `src/app/api/cron/guardias-relleno/route.ts`;
`vercel.json`; `src/lib/supabase/proxy.ts`; `src/lib/odoo/asignaciones.ts` (`creadaEl`, la
cuadrilla en las lecturas que hagan falta) y `src/lib/odoo/jornadas.ts` si hace falta;
`src/lib/alertas/{servicio,slack}.ts`; `src/lib/hoja-dia/{servicio,tipos,estado,mensajes,publico,vista}.ts`
y `src/components/hoja-dia/pizarron/columna.tsx` + `src/components/hoja-dia/celular/*` (sólo
lo necesario para mostrar tareas); `src/lib/asistente/{planificacion,herramientas}.ts`;
`supabase/migrations/20261018100001_guardias.sql` (sólo correcciones);
`docs/tablero-planificacion/{handoff,guardias-handoff}.md`.

**pantalla:** `src/components/tablero/**` (todos, incluidos los nuevos), `src/hooks/use-guardias.ts`,
`src/hooks/use-tablero.ts`, `src/hooks/use-avisos-tablero.ts`, `src/lib/tablero/colores.ts`,
`src/lib/tablero/avisos.ts`, `src/app/globals.css`, `scripts/contraste-tablero.mjs`,
`src/app/(dashboard)/planificacion/autorizaciones/page.tsx`.

**seguridad:** `src/lib/auth/{acceso,servidor,explicitos-servidor}.ts`, `src/lib/auth/acceso.test.ts`,
`src/lib/direccion/auditoria.ts`, `supabase/migrations/20261018100002_tablero_rls.sql`,
`src/app/api/planificacion/{cajon,comentarios,confirmaciones,contactos-obra,documentos,empleados,jornadas-plan,movimientos,notas,ot,partes,suspensiones,cuadrillas-futuras,fechas-ot}/route.ts`,
`src/app/api/habilitaciones/candado/route.ts`, `src/app/api/habilitaciones/_comun.ts`,
`src/app/api/ordenes-trabajo/[id]/urgencia/route.ts`, `src/lib/planificacion/{notas,cajon,confirmaciones,movimientos,suspensiones,jornadas-plan}.ts`
(sólo si la RLS obliga a cambiar el cliente).

`src/lib/tablero/guardias-tipos.ts` queda **congelado**: si un track necesita un cambio, lo
anota en su respuesta y el orquestador lo coordina.

---

## 12. Tests (`npm test`)

**nucleo (obligatorios por contrato):**
- `dias-habiles.test.ts`: sábado hábil, domingo y feriado no; `diasHabilesEntre` (jueves→lunes
  = 3); `lunesDe` de un domingo; `instanteBA` (13 h = 16 UTC); `fechaBADeOdoo` a las 23:30 UTC.
- `guardias.test.ts` — **colocación**: martes y jueves cuando hay lugar; repuestos en orden
  (mié/lun y mié/vie); nunca el mismo día; una por cuadrilla; la C5 tercerizada nunca; rotación
  por menos guardias y desempate por número; no en celda con algo (obra, tarea, apoyo); no en
  medio de una obra de varios días; no en feriado, domingo, suspendido ni pasado; ranuras ya
  ocupadas (también sacadas) no se reponen; sin lugar → `faltan` con motivo; nunca mueve nada.
- **candado**: urgencia alta/media creada hace ≤3 hábiles → libre; 4 → pide
  `urgencia_fuera_regla`; sin `creadaEl` → pide; comodín a las 12:59 del hábil anterior → pide
  `comodin_antes`, a las 13:00 → libre; comodín con guardia el lunes → la apertura es el sábado
  13 h; apoyo a armado atrasado → libre `atraso`; apoyo a armado al día → pide `obra_comun`;
  obra común → pide; solicitud aprobada → libre; guardia no activa o pasada → `pide: null`.
- **mover**: misma semana ok; otra semana no; celda ocupada no; mismo día que la otra guardia
  no; cuadrilla que ya tiene la otra no.
- `comodines.test.ts`: desarme ≤1 j pendiente → comodín; armado no; urgencia alta no; 1,5 j no;
  piso futuro: `espera` 0 y `comodinPuedeIr` false antes del piso; sin piso cuenta desde la
  creación; 7 hábiles → todavía; 8 → `vencido`; orden por espera; chip "quedan 2 d".
- `corrimiento-guardias.test.ts`: lo que cae sobre una guardia la consume y no suma sobrecarga;
  la cascada frena ahí; modo "dia" también; guardia en el día suspendido no se consume;
  `invertirCorrimiento` devuelve `reactivarGuardias`; los tests viejos de `corrimiento.test.ts`
  siguen verdes.
- `candidatosRelleno`: orden apoyo → comodín (más espera primero) → tentativa (respeta piso) →
  depósito siempre último.
- `lugarProtegido`: gris con todas activas; ámbar si una usada o falta una en la semana.
- Hoja del día: un día con guardia no tiene `/guardia/i` en ningún texto para el capataz.

**seguridad:** `acceso.test.ts` (sección 7.4) y, si se toca, el mapeo de candado de
habilitaciones.

**pantalla:** sin tests unitarios obligatorios (es UI); `npm run contraste` en verde.

## 13. Verificación al final (cada track sobre lo suyo; el orquestador sobre todo)

`npx tsc --noEmit`, `npx eslint <archivos tocados>`, `npm test`, `npm run contraste`,
`npx next build`. Las migraciones las aplica el orquestador (nunca `db push`); después, el
arranque: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<prod>/api/cron/guardias-viernes?hoy=2026-10-23"`.
