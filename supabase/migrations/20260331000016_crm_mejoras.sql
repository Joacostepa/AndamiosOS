-- Seguimientos en actividades
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS fecha_seguimiento DATE;

-- Agregar unidad_negocio al tipo de oportunidad si no existe
-- (ya existe en la tabla via migración flujo_operativo, pero no en el tipo TS)
