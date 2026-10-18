-- ============================================================
-- AndamiosOS — Tablero: cerrar las escrituras directas (RLS) y el permiso "solo JS"
--
-- Contrato: docs/tablero-planificacion/guardias-contrato.md §3 (manda). Plan técnico:
-- docs/tablero-planificacion/guardias-plan-tecnico.md §7.2. Va DESPUÉS de
-- 20261018100001_guardias.sql: usa plan_nivel(), plan_puede_editar() y deja en pie las tres
-- políticas RESTRICTIVE que impiden escribir una guardia con la sesión.
--
-- 1. QUÉ PROBLEMA RESUELVE. La auditoría del 08/10 (handoff.md, "Auditoría UX y técnica")
--    encontró que tablero_tareas, plan_suspensiones y las demás tablas plan_* del tablero
--    tenían `FOR ALL TO authenticated USING (true)`: con la clave anon y CUALQUIER sesión (un
--    capataz, el kiosco del pañol, Comercial que sólo mira) se podía escribir directo contra
--    Supabase, salteando las rutas. Con las guardias eso deja de ser un detalle: el candado
--    vive en las rutas (y en el trigger de tablero_tareas), y una tabla abierta es una puerta
--    trasera para poner una tarea donde no va o levantar la tapa de un día suspendido.
--
-- 2. CÓMO QUEDA: LA MISMA REGLA QUE EL MAPA APIS (src/lib/auth/acceso.ts). Cada tabla pide,
--    para escribir, el módulo que la ruta que la escribe ya pide en el proxy y en la segunda
--    llave (exigirPermisoDeApi). Si la política fuera más estricta que la ruta, la ruta se
--    rompería para alguien que hoy la usa; si fuera más floja, sería otra vez la puerta
--    trasera. LEER sigue abierto para cualquier autenticado: lo leen la Hoja del día, el
--    asistente comercial y quien mira el tablero, y el contrato sólo pide cerrar escrituras.
--
--      tabla                   la escribe (con la sesión)                         escribir
--      ─────────────────────── ─────────────────────────────────────────────────── ─────────────────────────────
--      tablero_tareas          /api/planificacion/tareas                          planificacion editar
--      plan_suspensiones       /corrimiento, /suspensiones                        planificacion editar
--      plan_movimientos        /asignaciones, /corrimiento, /guardias/usar        planificacion editar + autor
--      plan_jornadas_ot        /jornadas-plan                                     planificacion editar
--      plan_confirmaciones     /asignaciones (APIS de /confirmaciones: + partes)  planificacion o partes
--      plan_notas_dia          /notas                                             planificacion o partes
--      plan_cajon_notas        /cajon (PUT)                                       planificacion editar
--      plan_cajon_pendientes   /cajon y la Hoja del día (hoja-dia/acciones.ts     planificacion u hoja-dia
--                              tilda el pendiente al pasarlo a pedido)
--      ot_comentarios          /api/ordenes-trabajo/[id]/comentarios y            planificacion, ordenes-trabajo
--                              /api/habilitaciones/[otId]/notas                   o habilitaciones (+ autor)
--
--    Relevado el 18/10 con grep sobre src/, scripts/, robot/ y las funciones SQL: NINGÚN hook
--    ni componente escribe estas tablas desde el navegador (todo pasa por las rutas de arriba
--    con la sesión del usuario), ningún script ni el robot las toca, y ninguna función SQL
--    les inserta. Las corridas de las guardias (crons) y las rutas de /guardias escriben con
--    la service role, que no pasa por RLS.
--
-- 3. "editar" ES EL DE LA APP: plan_nivel() es nivelEn() en SQL (perfil activo; el admin
--    edita todo lo que no es explícito; si no, el permiso del módulo). plan_edita_en() de
--    abajo es "alcanza con UNO de estos módulos en editar", igual que APIS.
--
-- 4. LO QUE NO CAMBIA A PROPÓSITO:
--    · Las lecturas (SELECT USING true) de todas estas tablas.
--    · plan_movimientos y plan_confirmaciones siguen append-only (sólo INSERT).
--    · hab_gestiones (lo que registra el candado de habilitaciones): ya deja leer e insertar
--      a cualquier autenticado y es append-only. Depósito y Campo la usan desde el tablero
--      (APIS de /api/habilitaciones/candado); cerrarla ahora los dejaría otra vez afuera.
--    · Las tablas de las guardias (plan_guardia_*): ya no tienen políticas de escritura.
--
-- 5. Extiende el CHECK de direccion_auditoria con 'permiso_guardias': quién dio o sacó
--    "Planificación · Autorizar guardias" queda registrado como con Socios y Sistemas
--    (src/lib/auth/explicitos-servidor.ts). OJO: el bloque es el mismo que el de
--    20261022000001_sistemas.sql; si alguna vez se re-aplica ésa DESPUÉS de ésta, borra
--    'permiso_guardias' del CHECK. Re-aplicar ésta lo vuelve a poner.
--
-- RIESGO: si apareciera una pantalla que escribe una de estas tablas desde el navegador, o
-- una ruta nueva que la escribe con la sesión de alguien sin el módulo, la escritura daría
-- "new row violates row-level security policy" (INSERT) o no tocaría nada (UPDATE/DELETE).
-- Volver atrás: recrear las políticas "USING (true)" de las migraciones originales.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  npx supabase db query --linked -f <este archivo>   (NUNCA supabase db push)
-- Idempotente y sin BEGIN/COMMIT propios (el probador la envuelve en su ROLLBACK).
-- ============================================================

-- ============================================================
-- 1. "Alcanza con uno de estos módulos en editar" (la regla de APIS)
-- ============================================================
CREATE OR REPLACE FUNCTION plan_edita_en(VARIADIC p_modulos TEXT[]) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(bool_or(plan_nivel(m) = 'editar'), false) FROM unnest(p_modulos) AS m;
$$;
REVOKE ALL ON FUNCTION plan_edita_en(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION plan_edita_en(TEXT[]) TO authenticated, service_role;

-- ============================================================
-- 2. tablero_tareas (obligatorio: es donde viven las guardias)
-- ============================================================
-- Antes: "Autenticados gestionan tareas del tablero" FOR ALL USING (true). Ahora escribe
-- sólo quien edita la planificación, que es lo que pide /api/planificacion/tareas. Las
-- RESTRICTIVE de 20261018100001 se SUMAN (AND) a éstas: ni siquiera quien planifica escribe
-- una fila tipo 'guardia' con su sesión.
DROP POLICY IF EXISTS "Autenticados gestionan tareas del tablero" ON tablero_tareas;

DROP POLICY IF EXISTS "Planificacion crea tareas del tablero" ON tablero_tareas;
CREATE POLICY "Planificacion crea tareas del tablero" ON tablero_tareas
  FOR INSERT TO authenticated WITH CHECK (plan_puede_editar());

DROP POLICY IF EXISTS "Planificacion edita tareas del tablero" ON tablero_tareas;
CREATE POLICY "Planificacion edita tareas del tablero" ON tablero_tareas
  FOR UPDATE TO authenticated USING (plan_puede_editar()) WITH CHECK (plan_puede_editar());

DROP POLICY IF EXISTS "Planificacion borra tareas del tablero" ON tablero_tareas;
CREATE POLICY "Planificacion borra tareas del tablero" ON tablero_tareas
  FOR DELETE TO authenticated USING (plan_puede_editar());

-- ============================================================
-- 3. plan_suspensiones (la tapa de lluvia: donde no van guardias)
-- ============================================================
-- marcarSuspension hace upsert (INSERT … ON CONFLICT DO UPDATE): necesita INSERT y UPDATE.
DROP POLICY IF EXISTS "Autenticados gestionan suspensiones" ON plan_suspensiones;

DROP POLICY IF EXISTS "Planificacion marca suspensiones" ON plan_suspensiones;
CREATE POLICY "Planificacion marca suspensiones" ON plan_suspensiones
  FOR INSERT TO authenticated WITH CHECK (plan_puede_editar());

DROP POLICY IF EXISTS "Planificacion edita suspensiones" ON plan_suspensiones;
CREATE POLICY "Planificacion edita suspensiones" ON plan_suspensiones
  FOR UPDATE TO authenticated USING (plan_puede_editar()) WITH CHECK (plan_puede_editar());

DROP POLICY IF EXISTS "Planificacion levanta suspensiones" ON plan_suspensiones;
CREATE POLICY "Planificacion levanta suspensiones" ON plan_suspensiones
  FOR DELETE TO authenticated USING (plan_puede_editar());

-- ============================================================
-- 4. plan_movimientos (el registro de gestos y su deshacer; append-only)
-- ============================================================
-- Se mantiene "el autor es quien escribe" (la columna tiene DEFAULT auth.uid()) y se suma
-- el módulo. Sigue sin UPDATE ni DELETE.
DROP POLICY IF EXISTS "Autenticados registran movimientos" ON plan_movimientos;
DROP POLICY IF EXISTS "Planificacion registra movimientos" ON plan_movimientos;
CREATE POLICY "Planificacion registra movimientos" ON plan_movimientos
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid() AND plan_puede_editar());

-- ============================================================
-- 5. plan_jornadas_ot (cuántas jornadas tiene la obra según Operaciones)
-- ============================================================
-- fijarJornadasPlan hace upsert: INSERT y UPDATE.
DROP POLICY IF EXISTS "Autenticados gestionan jornadas planificadas" ON plan_jornadas_ot;

DROP POLICY IF EXISTS "Planificacion fija jornadas planificadas" ON plan_jornadas_ot;
CREATE POLICY "Planificacion fija jornadas planificadas" ON plan_jornadas_ot
  FOR INSERT TO authenticated WITH CHECK (plan_puede_editar());

DROP POLICY IF EXISTS "Planificacion corrige jornadas planificadas" ON plan_jornadas_ot;
CREATE POLICY "Planificacion corrige jornadas planificadas" ON plan_jornadas_ot
  FOR UPDATE TO authenticated USING (plan_puede_editar()) WITH CHECK (plan_puede_editar());

DROP POLICY IF EXISTS "Planificacion borra jornadas planificadas" ON plan_jornadas_ot;
CREATE POLICY "Planificacion borra jornadas planificadas" ON plan_jornadas_ot
  FOR DELETE TO authenticated USING (plan_puede_editar());

-- ============================================================
-- 6. plan_confirmaciones (append-only)
-- ============================================================
-- Hoy la escribe sólo /api/planificacion/asignaciones (Planificación). Se admite también
-- Partes porque es lo que el mapa APIS le da a /api/planificacion/confirmaciones: si mañana
-- el cierre de jornada registra confirmaciones, no se rompe. Sin "autor = quien escribe":
-- la columna no tiene DEFAULT y la ruta manda `data.user?.id ?? null`; exigirlo acá podría
-- tirar abajo una confirmación por un autor vacío, y este registro no es del candado.
DROP POLICY IF EXISTS "Autenticados registran confirmaciones" ON plan_confirmaciones;
DROP POLICY IF EXISTS "Planificacion registra confirmaciones" ON plan_confirmaciones;
CREATE POLICY "Planificacion registra confirmaciones" ON plan_confirmaciones
  FOR INSERT TO authenticated WITH CHECK (plan_edita_en('planificacion', 'partes'));

-- ============================================================
-- 7. plan_notas_dia (notas de la jornada)
-- ============================================================
-- /api/planificacion/notas admite Planificación o Partes (el parte diario también anota).
-- UPDATE no lo usa nadie hoy; se deja con la misma regla para no achicar lo que FOR ALL daba.
DROP POLICY IF EXISTS "Autenticados gestionan notas de jornada" ON plan_notas_dia;

DROP POLICY IF EXISTS "Planificacion anota la jornada" ON plan_notas_dia;
CREATE POLICY "Planificacion anota la jornada" ON plan_notas_dia
  FOR INSERT TO authenticated WITH CHECK (plan_edita_en('planificacion', 'partes'));

DROP POLICY IF EXISTS "Planificacion edita notas de jornada" ON plan_notas_dia;
CREATE POLICY "Planificacion edita notas de jornada" ON plan_notas_dia
  FOR UPDATE TO authenticated
  USING (plan_edita_en('planificacion', 'partes')) WITH CHECK (plan_edita_en('planificacion', 'partes'));

DROP POLICY IF EXISTS "Planificacion borra notas de jornada" ON plan_notas_dia;
CREATE POLICY "Planificacion borra notas de jornada" ON plan_notas_dia
  FOR DELETE TO authenticated USING (plan_edita_en('planificacion', 'partes'));

-- ============================================================
-- 8. El cajón de planificación
-- ============================================================
-- La nota es una fila única que sólo se actualiza (la crea la migración del cajón), y la
-- escribe sólo el PUT de /api/planificacion/cajon: Planificación.
DROP POLICY IF EXISTS "Autenticados editan notas del cajon" ON plan_cajon_notas;
DROP POLICY IF EXISTS "Planificacion edita notas del cajon" ON plan_cajon_notas;
CREATE POLICY "Planificacion edita notas del cajon" ON plan_cajon_notas
  FOR UPDATE TO authenticated USING (plan_puede_editar()) WITH CHECK (plan_puede_editar());

-- Los pendientes los escribe el cajón (Planificación) y la Hoja del día: "Pasar a pedido"
-- tilda el pendiente con la sesión de quien coordina (hoja-dia/acciones.ts, accionPedido).
-- OJO: la purga de hechos viejos corre en el GET del cajón; con quien sólo mira no borra
-- nada (no es un error: la hace el próximo que edita).
DROP POLICY IF EXISTS "Autenticados gestionan pendientes del cajon" ON plan_cajon_pendientes;

DROP POLICY IF EXISTS "Planificacion agrega pendientes del cajon" ON plan_cajon_pendientes;
CREATE POLICY "Planificacion agrega pendientes del cajon" ON plan_cajon_pendientes
  FOR INSERT TO authenticated WITH CHECK (plan_edita_en('planificacion', 'hoja-dia'));

DROP POLICY IF EXISTS "Planificacion tilda pendientes del cajon" ON plan_cajon_pendientes;
CREATE POLICY "Planificacion tilda pendientes del cajon" ON plan_cajon_pendientes
  FOR UPDATE TO authenticated
  USING (plan_edita_en('planificacion', 'hoja-dia')) WITH CHECK (plan_edita_en('planificacion', 'hoja-dia'));

DROP POLICY IF EXISTS "Planificacion borra pendientes del cajon" ON plan_cajon_pendientes;
CREATE POLICY "Planificacion borra pendientes del cajon" ON plan_cajon_pendientes
  FOR DELETE TO authenticated USING (plan_edita_en('planificacion', 'hoja-dia'));

-- ============================================================
-- 9. ot_comentarios (los dos hilos de la OT: operaciones y habilitación)
-- ============================================================
-- Verificado el 18/10: escriben /api/ordenes-trabajo/[id]/comentarios (APIS: Órdenes de
-- trabajo o Planificación) y /api/habilitaciones/[otId]/notas (Habilitaciones), las dos con
-- la sesión. Se conservan las dos garantías de 20260912000001 —el autor es quien escribe, y
-- borra sólo el autor— y se suma el módulo. Fijar sigue siendo de cualquiera que pueda
-- comentar (curaduría del hilo); el trigger de esa migración ya impide tocar el texto.
DROP POLICY IF EXISTS "Autenticados comentan" ON ot_comentarios;
DROP POLICY IF EXISTS "Quien trabaja la OT comenta" ON ot_comentarios;
CREATE POLICY "Quien trabaja la OT comenta" ON ot_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND plan_edita_en('planificacion', 'ordenes-trabajo', 'habilitaciones'));

DROP POLICY IF EXISTS "Autenticados fijan comentarios" ON ot_comentarios;
DROP POLICY IF EXISTS "Quien trabaja la OT fija comentarios" ON ot_comentarios;
CREATE POLICY "Quien trabaja la OT fija comentarios" ON ot_comentarios
  FOR UPDATE TO authenticated
  USING (plan_edita_en('planificacion', 'ordenes-trabajo', 'habilitaciones'))
  WITH CHECK (plan_edita_en('planificacion', 'ordenes-trabajo', 'habilitaciones'));

DROP POLICY IF EXISTS "El autor borra su comentario" ON ot_comentarios;
CREATE POLICY "El autor borra su comentario" ON ot_comentarios
  FOR DELETE TO authenticated
  USING (autor_id = auth.uid() AND plan_edita_en('planificacion', 'ordenes-trabajo', 'habilitaciones'));

-- ============================================================
-- 10. Auditoría: dar o sacar "Planificación · Autorizar guardias"
-- ============================================================
-- Todos los valores que ya admitía (20261022000001_sistemas.sql) más 'permiso_guardias'.
DO $aud$
BEGIN
  IF to_regclass('public.direccion_auditoria') IS NOT NULL THEN
    ALTER TABLE direccion_auditoria DROP CONSTRAINT IF EXISTS direccion_auditoria_accion;
    ALTER TABLE direccion_auditoria ADD CONSTRAINT direccion_auditoria_accion CHECK (
      accion IN ('abrir_socios', 'politica', 'meta', 'dueno', 'config', 'aviso_cargar', 'aviso_cerrar',
                 'permiso_socios', 'permiso_socios_base', 'permiso_sistemas', 'permiso_guardias')
      OR accion ~ '^actualizar:(semana|caja|ventas|cobranzas|calle|socios|datos)$');
  END IF;
END
$aud$;
