-- Duraciones de 3, 5 y 7 horas en el tablero: la columna necesita un decimal más.
--
-- EL PROBLEMA: la escala del tablero era de cuartos (0,25 · 0,50 · 0,75) y dos decimales
-- alcanzaban. Las duraciones nuevas son OCTAVOS —3 h son 0,375 de una jornada de 8— y en
-- NUMERIC(3,2) Postgres las redondea SIN AVISAR: 0,375 entra y sale 0,38. Eso no es un
-- detalle cosmético, es lo que rompe la cuenta del día: tres horas más cinco horas darían
-- 1,01 y la celda se pintaría de sobreasignada cuando en realidad es una jornada perfecta.
--
-- POR QUÉ 4,3 Y NO 5,4: tres decimales cubren los octavos exactos y ahí se corta la
-- escala. Dejar más lugar invitaría a guardar duraciones que ninguna pantalla sabe
-- mostrar ni nadie sabe planificar.
--
-- Las asignaciones de obra NO están acá: viven en Odoo (x_aba_asignacion.x_fraccion), que
-- es un campo de selección y se amplía con scripts/odoo-fracciones-por-hora.mjs. Esta
-- tabla es la de las tareas operativas del tablero (depósito, traslados, mantenimiento),
-- que son las únicas fracciones que guarda Supabase.
--
-- Es una ampliación de precisión: no toca ningún valor cargado —los cuartos siguen siendo
-- los mismos números— y el CHECK de rango (> 0 y <= 1) sigue valiendo igual.

ALTER TABLE public.tablero_tareas
  ALTER COLUMN fraccion TYPE NUMERIC(4,3);

COMMENT ON COLUMN public.tablero_tareas.fraccion IS
  'Cuánto ocupa la tarea de la jornada de esa cuadrilla. Misma escala que '
  'x_aba_asignacion.x_fraccion: 0.10 | 0.25 | 0.375 | 0.50 | 0.625 | 0.75 | 0.875 | 1. '
  'Los octavos van exactos (0.375 = 3 h), por eso NUMERIC(4,3) y no (3,2).';
