-- ============================================================
-- AndamiosOS — Baja del tablero de planificación v2 (Supabase)
--
-- El tablero v3 planifica en fracciones de jornada y persiste en Odoo
-- (x_aba_asignacion). Ver src/lib/odoo/asignaciones.ts. Desde esa mudanza,
-- estas cuatro tablas no las escribe nadie: lo único que las leía era
-- src/components/planificacion/, el board viejo, que no estaba montado en
-- ninguna ruta (la página renderiza TableroBoard).
--
-- Se van con datos: 4 asignaciones y 19 filas de personal, todas creadas el
-- 21/06/2026 —el día que se armó el board v2— y fechadas 2026-06-15. Son las
-- pruebas de aquel desarrollo, no trabajo planificado.
--
-- `cuadrillas` NO se toca: la usa la página de configuración de cuadrillas, que
-- sigue viva. Queda con su FK saliente hacia nada, que es lo correcto.
--
-- POR QUÉ AHORA: la que más molestaba era planificacion_asignaciones. Seguía
-- siendo la fuente de useFuturasPorCuadrilla —la guarda que impide desactivar
-- una cuadrilla con trabajo por delante— y como estaba vacía desde junio, la
-- guarda venía diciendo que TODAS las cuadrillas estaban libres. En el mismo
-- cambio esa consulta pasa a leer Odoo, que es donde está el plan de verdad.
-- ============================================================

BEGIN;

-- ot_jornadas es de la misma tanda de junio y tampoco la usa nadie, pero tiene 21
-- filas y se queda: sólo se le saca el FK, que es lo único que impide el DROP de
-- abajo. Queda con asignacion_id apuntando a nada, que es lo que ya era.
ALTER TABLE ot_jornadas DROP CONSTRAINT IF EXISTS ot_jornadas_asignacion_id_fkey;

-- Los triggers de auditoría cuelgan de las tablas y se van con ellas; los
-- borro explícito igual para que el DROP no dependa del orden del CASCADE.
DROP TRIGGER IF EXISTS trg_audit_plan_bloqueos ON planificacion_bloqueos;
DROP TRIGGER IF EXISTS trg_audit_plan_asignaciones ON planificacion_asignaciones;
DROP TRIGGER IF EXISTS trg_plan_asignaciones_updated_at ON planificacion_asignaciones;

-- En orden de dependencia: las hijas antes que planificacion_asignaciones.
DROP TABLE IF EXISTS planificacion_viajes;
DROP TABLE IF EXISTS planificacion_asignacion_personal;
DROP TABLE IF EXISTS planificacion_bloqueos;
DROP TABLE IF EXISTS planificacion_asignaciones;

COMMIT;
