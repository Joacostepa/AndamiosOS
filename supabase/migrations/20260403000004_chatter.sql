-- ============================================================
-- Chatter: hacer comunicaciones genérico para cualquier entidad
-- ============================================================

-- Agregar campos genéricos
ALTER TABLE comunicaciones ADD COLUMN IF NOT EXISTS entidad_tipo TEXT;
ALTER TABLE comunicaciones ADD COLUMN IF NOT EXISTS entidad_id UUID;

-- Migrar los existentes (obras)
UPDATE comunicaciones SET entidad_tipo = 'obras', entidad_id = obra_id WHERE entidad_tipo IS NULL AND obra_id IS NOT NULL;

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_comunicaciones_entidad ON comunicaciones(entidad_tipo, entidad_id);

-- Asegurar que audit_log tenga trigger en cotizaciones
DROP TRIGGER IF EXISTS audit_cotizaciones ON cotizaciones;
CREATE TRIGGER audit_cotizaciones AFTER INSERT OR UPDATE OR DELETE ON cotizaciones
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
