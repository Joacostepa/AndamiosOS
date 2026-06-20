-- Alinea los enums de obras / ordenes_trabajo con el vocabulario de Odoo
-- (x_aba_obra, x_aba_orden_trabajo) para el espejo operativo Odoo→app.
--
-- Contexto: los enums originales eran del diseño pre-Odoo, donde la app era el
-- sistema comercial completo (estado_obra tenía 15 estados de ciclo comercial).
-- Ahora Comercial vive en Odoo; la app es operativa. Un solo vocabulario
-- compartido = cero tablas de mapeo. La granularidad "en proceso" vive en la OT
-- (en_curso) y el gate de habilitación en los booleans requiere_habilitacion /
-- habilitacion_aprobada, NO como estado.
--
-- Tablas vacías (post-wipe) → recreación de tipos sin migración de datos.

BEGIN;

-- ── estado_obra: 15 estados comerciales → 4 hitos de Odoo + cancelada ─────────
ALTER TABLE obras ALTER COLUMN estado DROP DEFAULT;
ALTER TYPE estado_obra RENAME TO estado_obra_old;
CREATE TYPE estado_obra AS ENUM (
  'pendiente_armado', 'armado', 'pendiente_desarme', 'desarmado', 'cancelada'
);
ALTER TABLE obras ALTER COLUMN estado TYPE estado_obra USING estado::text::estado_obra;
ALTER TABLE obras ALTER COLUMN estado SET DEFAULT 'pendiente_armado';
DROP TYPE estado_obra_old;

-- ── tipo_orden_trabajo: vocabulario de x_aba_orden_trabajo.x_tipo ─────────────
ALTER TYPE tipo_orden_trabajo RENAME TO tipo_orden_trabajo_old;
CREATE TYPE tipo_orden_trabajo AS ENUM (
  'armado', 'desarme', 'ampliacion', 'desmonte_parcial', 'mantenimiento', 'otro'
);
ALTER TABLE ordenes_trabajo ALTER COLUMN tipo TYPE tipo_orden_trabajo USING tipo::text::tipo_orden_trabajo;
DROP TYPE tipo_orden_trabajo_old;

-- ── estado_orden_trabajo: vocabulario de x_aba_orden_trabajo.x_estado ─────────
-- (habilitación NO es estado: vive en requiere_habilitacion / habilitacion_aprobada)
ALTER TABLE ordenes_trabajo ALTER COLUMN estado DROP DEFAULT;
ALTER TYPE estado_orden_trabajo RENAME TO estado_orden_trabajo_old;
CREATE TYPE estado_orden_trabajo AS ENUM (
  'pendiente', 'programada', 'en_curso', 'completada', 'cancelada'
);
ALTER TABLE ordenes_trabajo ALTER COLUMN estado TYPE estado_orden_trabajo USING estado::text::estado_orden_trabajo;
ALTER TABLE ordenes_trabajo ALTER COLUMN estado SET DEFAULT 'pendiente';
DROP TYPE estado_orden_trabajo_old;

COMMIT;
