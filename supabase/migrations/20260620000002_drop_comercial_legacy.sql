-- Limpieza del dominio comercial que migró a Odoo (cotizaciones + CRM/oportunidades).
-- Las tablas estaban vacías (data ya borrada). Se eliminan también las columnas FK
-- huérfanas en tablas que se conservan, y la tabla `actividades` (log de CRM, sin uso).

-- 1) Quitar columnas FK huérfanas de tablas conservadas
ALTER TABLE obras DROP COLUMN IF EXISTS cotizacion_id;
ALTER TABLE relevamientos DROP COLUMN IF EXISTS oportunidad_id;

-- 2) Dropear tablas del dominio comercial (CASCADE resuelve FKs remanentes)
DROP TABLE IF EXISTS cotizacion_imagenes CASCADE;
DROP TABLE IF EXISTS cotizacion_items CASCADE;
DROP TABLE IF EXISTS actividades CASCADE;
DROP TABLE IF EXISTS cotizaciones CASCADE;
DROP TABLE IF EXISTS oportunidades CASCADE;
