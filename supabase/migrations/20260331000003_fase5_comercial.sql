-- ============================================================
-- AndamiosOS - Fase 5: Pipeline Comercial Completo
-- ============================================================

-- ========================
-- TIPOS ENUMERADOS
-- ========================

CREATE TYPE tipo_cliente_crm AS ENUM (
  'empresa_constructora', 'industria', 'gobierno_publico',
  'particular', 'consorcio', 'evento', 'otro'
);

CREATE TYPE tamano_cliente AS ENUM ('grande', 'mediano', 'chico', 'particular');

CREATE TYPE perfil_decision AS ENUM (
  'busca_precio', 'busca_profesionalismo', 'busca_velocidad', 'busca_seguridad'
);

CREATE TYPE relacion_cliente AS ENUM ('nuevo', 'recurrente', 'referido', 'ex_cliente');

CREATE TYPE situacion_proyecto AS ENUM (
  'consulta_inicial', 'en_licitacion', 'obra_ganada',
  'proyecto_en_desarrollo', 'urgencia', 'mantenimiento'
);

CREATE TYPE poder_decision AS ENUM (
  'decide_solo', 'necesita_aprobacion', 'licitacion_publica', 'compra_corporativa'
);

CREATE TYPE rango_presupuesto AS ENUM (
  'chico', 'mediano', 'grande', 'muy_grande'
);

CREATE TYPE estado_oportunidad AS ENUM (
  'lead', 'contactado', 'relevamiento', 'cotizado',
  'negociacion', 'ganado', 'perdido'
);

CREATE TYPE tipo_actividad AS ENUM (
  'llamada', 'email', 'reunion', 'whatsapp', 'visita', 'nota', 'otro'
);

CREATE TYPE estado_relevamiento AS ENUM (
  'pendiente', 'agendado', 'realizado', 'cancelado'
);

CREATE TYPE estado_cotizacion AS ENUM (
  'borrador', 'enviada', 'en_revision', 'aprobada', 'rechazada', 'vencida'
);

CREATE TYPE tipo_item_cotizacion AS ENUM (
  'alquiler_mensual', 'montaje', 'desarme', 'transporte',
  'permiso', 'ingenieria', 'extra', 'descuento'
);

-- ========================
-- TABLAS
-- ========================

-- Oportunidades (CRM)
CREATE TABLE oportunidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  cliente_id UUID REFERENCES clientes(id),
  -- Si es cliente nuevo que aun no esta en la base
  cliente_nombre TEXT,
  cliente_telefono TEXT,
  cliente_email TEXT,
  -- Categorizacion
  tipo_cliente tipo_cliente_crm DEFAULT 'otro',
  tamano tamano_cliente DEFAULT 'mediano',
  perfil_decision perfil_decision DEFAULT 'busca_precio',
  relacion relacion_cliente DEFAULT 'nuevo',
  situacion situacion_proyecto DEFAULT 'consulta_inicial',
  poder_decision poder_decision DEFAULT 'decide_solo',
  rango_presupuesto rango_presupuesto DEFAULT 'mediano',
  zona TEXT,
  -- Datos de la oportunidad
  titulo TEXT NOT NULL,
  descripcion TEXT,
  estado estado_oportunidad NOT NULL DEFAULT 'lead',
  monto_estimado DECIMAL(14,2),
  probabilidad INTEGER DEFAULT 50,
  fecha_cierre_estimada DATE,
  competidores TEXT,
  motivo_perdida TEXT,
  -- Origen
  origen TEXT DEFAULT 'directo',
  referido_por TEXT,
  -- Asignacion
  responsable_id UUID REFERENCES user_profiles(id),
  -- Vinculacion
  obra_id UUID REFERENCES obras(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

CREATE SEQUENCE oportunidad_codigo_seq START WITH 1;

-- Actividades del CRM
CREATE TABLE actividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  tipo tipo_actividad NOT NULL DEFAULT 'nota',
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  duracion_min INTEGER,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relevamientos
CREATE TABLE relevamientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id UUID REFERENCES oportunidades(id),
  obra_id UUID REFERENCES obras(id),
  -- Datos basicos
  direccion TEXT NOT NULL,
  localidad TEXT,
  provincia TEXT DEFAULT 'Buenos Aires',
  contacto_nombre TEXT,
  contacto_telefono TEXT,
  relevador_id UUID REFERENCES user_profiles(id),
  fecha_programada TIMESTAMPTZ,
  fecha_realizada TIMESTAMPTZ,
  estado estado_relevamiento NOT NULL DEFAULT 'pendiente',
  -- Sitio
  tipo_edificio TEXT,
  cantidad_pisos INTEGER,
  altura_estimada DECIMAL(8,2),
  metros_lineales DECIMAL(10,2),
  superficie_fachada DECIMAL(10,2),
  -- Condiciones
  tipo_acceso TEXT,
  tipo_suelo TEXT,
  interferencias TEXT,
  requiere_permiso_municipal BOOLEAN DEFAULT false,
  requiere_proteccion_peatonal BOOLEAN DEFAULT false,
  requiere_red_seguridad BOOLEAN DEFAULT false,
  horario_restriccion TEXT,
  -- Andamio
  sistema_recomendado sistema_andamio DEFAULT 'multidireccional',
  tipo_montaje TEXT,
  anclajes_especiales BOOLEAN DEFAULT false,
  observaciones_tecnicas TEXT,
  -- Fotos
  fotos JSONB DEFAULT '[]'::jsonb,
  -- General
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Cotizaciones
CREATE TABLE cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  oportunidad_id UUID REFERENCES oportunidades(id),
  cliente_id UUID REFERENCES clientes(id),
  relevamiento_id UUID REFERENCES relevamientos(id),
  -- Datos
  titulo TEXT NOT NULL,
  descripcion_servicio TEXT,
  condiciones TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  estado estado_cotizacion NOT NULL DEFAULT 'borrador',
  -- Montos
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  iva_porcentaje DECIMAL(5,2) DEFAULT 21.00,
  iva_monto DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  moneda TEXT DEFAULT 'ARS',
  -- Validez
  fecha_emision DATE DEFAULT CURRENT_DATE,
  validez_dias INTEGER DEFAULT 30,
  fecha_vencimiento DATE,
  -- Condiciones comerciales
  condicion_pago TEXT,
  plazo_alquiler_meses INTEGER,
  incluye_montaje BOOLEAN DEFAULT true,
  incluye_desarme BOOLEAN DEFAULT true,
  incluye_transporte BOOLEAN DEFAULT true,
  -- IA
  generado_por_ia BOOLEAN DEFAULT false,
  -- Vinculacion
  obra_id UUID REFERENCES obras(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

CREATE SEQUENCE cotizacion_codigo_seq START WITH 1;

-- Items de cotizacion
CREATE TABLE cotizacion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  tipo tipo_item_cotizacion NOT NULL DEFAULT 'alquiler_mensual',
  concepto TEXT NOT NULL,
  detalle TEXT,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1,
  unidad TEXT DEFAULT 'mes',
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  orden INTEGER DEFAULT 0
);

-- ========================
-- INDICES
-- ========================

CREATE INDEX idx_oportunidades_estado ON oportunidades(estado);
CREATE INDEX idx_oportunidades_cliente ON oportunidades(cliente_id);
CREATE INDEX idx_oportunidades_responsable ON oportunidades(responsable_id);
CREATE INDEX idx_actividades_oportunidad ON actividades(oportunidad_id);
CREATE INDEX idx_relevamientos_oportunidad ON relevamientos(oportunidad_id);
CREATE INDEX idx_relevamientos_estado ON relevamientos(estado);
CREATE INDEX idx_cotizaciones_oportunidad ON cotizaciones(oportunidad_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones(estado);
CREATE INDEX idx_cotizacion_items_cotizacion ON cotizacion_items(cotizacion_id);

-- ========================
-- TRIGGERS
-- ========================

CREATE TRIGGER trg_oportunidades_updated_at BEFORE UPDATE ON oportunidades FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_relevamientos_updated_at BEFORE UPDATE ON relevamientos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cotizaciones_updated_at BEFORE UPDATE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_audit_oportunidades AFTER INSERT OR UPDATE OR DELETE ON oportunidades FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_relevamientos AFTER INSERT OR UPDATE OR DELETE ON relevamientos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_cotizaciones AFTER INSERT OR UPDATE OR DELETE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Generar codigos automaticos
CREATE OR REPLACE FUNCTION generar_codigo_oportunidad()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'OPO-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('oportunidad_codigo_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_generar_codigo_oportunidad BEFORE INSERT ON oportunidades FOR EACH ROW EXECUTE FUNCTION generar_codigo_oportunidad();

CREATE OR REPLACE FUNCTION generar_codigo_cotizacion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'COT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('cotizacion_codigo_seq')::TEXT, 4, '0');
  END IF;
  IF NEW.fecha_vencimiento IS NULL AND NEW.fecha_emision IS NOT NULL THEN
    NEW.fecha_vencimiento := NEW.fecha_emision + (NEW.validez_dias || ' days')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_generar_codigo_cotizacion BEFORE INSERT ON cotizaciones FOR EACH ROW EXECUTE FUNCTION generar_codigo_cotizacion();

-- Auto-calcular totales de cotizacion
CREATE OR REPLACE FUNCTION recalcular_cotizacion()
RETURNS TRIGGER AS $$
DECLARE
  _subtotal DECIMAL(14,2);
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO _subtotal
  FROM cotizacion_items WHERE cotizacion_id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  UPDATE cotizaciones SET
    subtotal = _subtotal,
    iva_monto = _subtotal * (iva_porcentaje / 100),
    total = _subtotal + (_subtotal * (iva_porcentaje / 100))
  WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalcular_cotizacion_insert AFTER INSERT ON cotizacion_items FOR EACH ROW EXECUTE FUNCTION recalcular_cotizacion();
CREATE TRIGGER trg_recalcular_cotizacion_update AFTER UPDATE ON cotizacion_items FOR EACH ROW EXECUTE FUNCTION recalcular_cotizacion();
CREATE TRIGGER trg_recalcular_cotizacion_delete AFTER DELETE ON cotizacion_items FOR EACH ROW EXECUTE FUNCTION recalcular_cotizacion();

-- ========================
-- RLS
-- ========================

ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE relevamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver oportunidades" ON oportunidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear oportunidades" ON oportunidades FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar oportunidades" ON oportunidades FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver actividades" ON actividades FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear actividades" ON actividades FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados pueden ver relevamientos" ON relevamientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear relevamientos" ON relevamientos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Todos pueden editar relevamientos" ON relevamientos FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Autenticados pueden ver cotizaciones" ON cotizaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear cotizaciones" ON cotizaciones FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar cotizaciones" ON cotizaciones FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver items cotizacion" ON cotizacion_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden gestionar items cotizacion" ON cotizacion_items FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));
