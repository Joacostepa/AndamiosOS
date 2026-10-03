# Handoff — Tablero de planificación (actualizado 2026-10-02)

Para retomar en una sesión nueva: "Leé docs/handoff-tablero-planificacion.md y seguimos con las
mejoras del tablero". Acá van el estado, lo pendiente y las mejoras pedidas, la más nueva arriba.
Los specs de junio (`modulo-planificacion.md`, `modulo-planificacion-mejoras-v2.md`) y el de agosto
(`ABA-Tablero-Planificacion-SPEC.md`) son el diseño original: el código ya se apartó en varias
cosas, así que ante la duda manda el código y los comentarios largos que tiene cada archivo.

---

## Pendiente ahora

1. **Crear `plan_suspensiones` y tapar el 29/09.** El código de los días suspendidos (abajo) ya
   está en main, pero la tabla no existe todavía: desde la Mac de JS no se pudo crear (falta
   `SUPABASE_DB_URL` en `.env.local` y la CLI de Supabase no tiene sesión). Hay que pegar en el
   editor SQL de Supabase el contenido de la migración
   `supabase/migrations/20261002000001_suspensiones_del_tablero.sql` y después la carga del
   29/09:

   ```sql
   INSERT INTO plan_suspensiones (fecha, cuadrilla_odoo_id, motivo, lote_id)
   SELECT DISTINCT ON ((m.antes->>'cuadrillaId')::bigint)
     DATE '2026-09-29', (m.antes->>'cuadrillaId')::bigint, m.motivo, m.lote_id
   FROM plan_movimientos m
   WHERE m.accion = 'correr'
     AND m.created_at >= '2026-09-29' AND m.created_at < '2026-09-30'
     AND (m.antes->>'cuadrillaId')::bigint IN (13, 14)
     AND m.antes->'fechas' ? '2026-09-29'
   ORDER BY (m.antes->>'cuadrillaId')::bigint, m.created_at
   ON CONFLICT (fecha, cuadrilla_odoo_id) DO NOTHING;
   ```

   Tienen que quedar dos filas: cuadrilla 1 (Odoo 13) y cuadrilla 2 (Odoo 14), "Lluvia". Esos
   corrimientos se hicieron el 29/09 a las 17:10 y 17:19 (lotes `7b7684e3…` y `3b39b46c…`).
   Mientras la tabla no exista el tablero anda igual: no aparecen tapas y el corrimiento sigue
   funcionando (la marca falla en silencio y queda en el log del servidor).
2. **Ver la tapa andando con un corrimiento real** (o uno de prueba deshecho enseguida). No se
   pudo mirar en el navegador cuando se construyó.

---

## 02/10 — el día suspendido queda tapado con el motivo

**Pedido (Juan Agustín, Slack 01/10, con captura):** al correr la cuadrilla 1 y la 2 por
lluvia el martes 29 quedó en blanco, "como si no lo hubiéramos utilizado". Ideal una tapa con
el motivo.

**Cómo quedó:**
- **Tabla `plan_suspensiones`** (Supabase): una fila por fecha × cuadrilla (id de Odoo), única,
  con motivo, `lote_id` del corrimiento que la creó y autor. No se deriva de `plan_movimientos`
  porque esas filas son por obra y no dicen qué día se suspendió ni para qué cuadrillas.
- **Quién queda marcado:** las cuadrillas tildadas en "Suspender un día" que tenían algo
  asignado ese día (`suspendidas` en `dialogo-correr-dia.tsx`). La destildada y la que no tenía
  nada no se tapan.
- **Se escribe en `/api/planificacion/corrimiento`** (`suspension: { dia, cuadrillaIds }`), y el
  deshacer la levanta (`levantaLote`). Si la marca falla no se rechaza el corrimiento: las
  jornadas ya se movieron en Odoo.
- **Se lee con `/api/planificacion/suspensiones`** (GET por rango, DELETE por id) y el hook
  `use-suspensiones.ts`. Clave de query **propia** (`suspensiones-tablero`), no bajo `["tablero"]`:
  `aplicarOptimista` reescribe todo lo que cuelga de esa clave como si fuera el payload de
  asignaciones. La invalidan el corrimiento y los avisos en vivo de los demás.
- **La tapa** (`TapaSuspension` en `celda-dia.tsx`): rayado diagonal con "Suspendido" y el motivo.
  Azul del clima con nube si el motivo es lluvia/viento/tormenta/granizo; gris con ícono de
  prohibido para cualquier otro. No toma el puntero (la celda sigue aceptando drop y doble clic);
  si después se asigna algo, la tarjeta va encima. Al pasar por la celda aparece una cruz para
  **quitar la marca** (no mueve jornadas). El tooltip dice quién la marcó.

**Archivos:** `supabase/migrations/20261002000001_suspensiones_del_tablero.sql`,
`src/lib/planificacion/suspensiones.ts`, `src/lib/tablero/tipos-suspension.ts`,
`src/app/api/planificacion/suspensiones/route.ts`, `src/hooks/use-suspensiones.ts`, y cambios en
`corrimiento/route.ts`, `use-tablero.ts` (`useCorrerDia`), `use-avisos-tablero.ts`,
`dialogo-correr-dia.tsx`, `tablero-board.tsx`, `tablero-grid.tsx` y `celda-dia.tsx`.

**Ideas que quedaron afuera (para decidir):**
- Marcar un día suspendido **sin correr nada** (p. ej. una cuadrilla que no salió y no tenía
  trabajo que mover). Hoy la ruta no tiene POST a propósito.
- Mostrar la suspensión en la ficha de la obra y en el panel de actividad, además de la grilla.
- Que la tapa de lluvia se ofrezca sola cuando el chip de clima del día marca lluvia fuerte.

---

## Mapa del módulo

- **Página:** `src/app/(dashboard)/planificacion/page.tsx` → `TableroBoard`
  (`src/components/tablero/tablero-board.tsx`, el que orquesta: datos, diálogos, deshacer).
- **Grilla:** `tablero-grid.tsx` (encabezado de días con feriados, clima y notas; una fila por
  cuadrilla), `celda-dia.tsx` (fondo droppable, riel de ocupación, nota de la cuadrilla, tapa
  de suspendido), `tarjeta-asignacion.tsx` (la obra en el día).
- **Datos:** las asignaciones viven en **Odoo** (`x_aba_asignacion`, cuadrillas `x_aba_cuadrilla`)
  y se leen por `/api/planificacion/tablero` (`use-tablero.ts`, optimista). En **Supabase** viven
  lo que nadie lee desde el ERP: historial de movimientos (`plan_movimientos`, con `lote_id` y
  `motivo` para los corrimientos), notas del día (`plan_notas_dia`) y días suspendidos
  (`plan_suspensiones`).
- **Correr el día:** cálculo en `src/lib/tablero/corrimiento.ts` (`planearCorrimiento`, la misma
  función para el preview y para ejecutar), diálogo `dialogo-correr-dia.tsx`, ruta
  `/api/planificacion/corrimiento`. Deshacer = corrimiento inverso con `deshace_a`.
- **En vivo:** `use-avisos-tablero.ts` escucha los cambios de los demás e invalida las queries.
- **Colores:** todo sale de `src/lib/tablero/colores.ts` (tokens `--tb-*` en `globals.css`, claro y
  oscuro). `npm run contraste` controla el contraste del tablero.

## Reglas que no se leen en el código

- **Migraciones:** nunca `supabase db push`. Se aplican con
  `node --env-file=.env.local scripts/apply-migration.mjs <archivo>` (pide `SUPABASE_DB_URL`) o
  pegando el SQL en el editor de Supabase.
- **Nada nuevo bajo la query key `["tablero"]`** que no sea el payload de asignaciones (ver arriba).
- Lo que escriba en Odoo se agrupa y se deshace entero o no se deshace (ver los comentarios de
  `correrElDia` y `useCorrerDia`).
