-- ============================================================
-- AndamiosOS — Fijar una obra a su día, y soltarla
--
-- EL PROBLEMA: cuando llueve se suspende el día y se corre todo una jornada. Pero hay
-- obras que sí o sí van esa fecha —grúa alquilada, permiso de corte con día, el evento es
-- el sábado— y hoy se corren con el resto sin que nadie se entere.
--
-- El estado vive en Odoo (x_aba_asignacion.x_motivo_fija, ver
-- scripts/odoo-add-fija-asignacion.mjs): ahí vive la fila, así que el motivo se borra solo
-- cuando la asignación se borra. Lo que vive ACÁ es la HISTORIA, por el mismo motivo que
-- el resto de plan_movimientos: la app escribe en Odoo con un solo usuario de
-- integración, así que write_uid no puede contestar quién fijó.
--
-- POR QUÉ SON DOS ACCIONES Y NO UNA con antes/después: "soltó Callao 1810" y "fijó Callao
-- 1810" se leen distinto en el panel de actividad, y soltar una obra es justamente el
-- gesto que hay que poder auditar — es el que permite que se mueva.
-- ============================================================

BEGIN;

ALTER TABLE plan_movimientos DROP CONSTRAINT IF EXISTS plan_movimientos_accion_check;

ALTER TABLE plan_movimientos ADD CONSTRAINT plan_movimientos_accion_check
  CHECK (accion IN ('crear', 'mover', 'fraccion', 'cuadrilla', 'quitar', 'fijar', 'soltar'));

COMMIT;
