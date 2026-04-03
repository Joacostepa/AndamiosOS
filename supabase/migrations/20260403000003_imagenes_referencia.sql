-- ============================================================
-- Banco de imágenes de referencia para cotizaciones
-- ============================================================

CREATE TABLE IF NOT EXISTS imagenes_referencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT NOT NULL DEFAULT 'fachadas',
  tags JSONB DEFAULT '[]'::jsonb,
  url TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cotizacion_imagenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  imagen_id UUID NOT NULL REFERENCES imagenes_referencia(id) ON DELETE CASCADE,
  orden INTEGER DEFAULT 0,
  UNIQUE(cotizacion_id, imagen_id)
);

ALTER TABLE imagenes_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_imagenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_imagenes" ON imagenes_referencia FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_imagenes" ON imagenes_referencia FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_cot_imagenes" ON cotizacion_imagenes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_manage_cot_imagenes" ON cotizacion_imagenes FOR ALL TO authenticated USING (true) WITH CHECK (true);
