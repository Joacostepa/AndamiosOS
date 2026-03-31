-- ============================================================
-- Cotizaciones: soporte para unidades de negocio
-- ============================================================

-- Enum para las 3 unidades de cotizacion (diferente del enum unidad_negocio de obras)
CREATE TYPE unidad_cotizacion AS ENUM (
  'hogareno', 'multidireccional', 'armado_desarme'
);

CREATE TYPE sub_vertical_cotizacion AS ENUM (
  'fachadas', 'industria', 'eventos', 'obra_publica', 'construccion', 'estructuras_especiales'
);

-- Nuevas columnas en cotizaciones
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS unidad_cotizacion unidad_cotizacion;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS sub_vertical sub_vertical_cotizacion;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fraccion_dias INTEGER;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS zona_entrega TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tonelaje_estimado DECIMAL(10,2);
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS urgencia TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Nuevos tipos de item
ALTER TYPE tipo_item_cotizacion ADD VALUE IF NOT EXISTS 'alquiler_fraccion';
ALTER TYPE tipo_item_cotizacion ADD VALUE IF NOT EXISTS 'flete';

-- Tabla lista_precios (estructura para futuro, se popula cuando el usuario comparta el Excel)
CREATE TABLE IF NOT EXISTS lista_precios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_cotizacion unidad_cotizacion NOT NULL,
  producto TEXT NOT NULL,
  descripcion TEXT,
  fraccion_dias INTEGER,
  precio DECIMAL(14,2) NOT NULL,
  zona TEXT,
  precio_flete DECIMAL(14,2),
  vigente_desde DATE DEFAULT CURRENT_DATE,
  vigente_hasta DATE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lista_precios_unidad ON lista_precios(unidad_cotizacion);
CREATE INDEX idx_lista_precios_activo ON lista_precios(activo) WHERE activo = true;
