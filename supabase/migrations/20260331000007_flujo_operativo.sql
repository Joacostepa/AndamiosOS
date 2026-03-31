-- ============================================================
-- AndamiosOS - Rediseño flujo operativo
-- Ordenes de trabajo, unidades de negocio, vigencia, gates
-- ============================================================

-- ========================
-- TIPOS ENUMERADOS
-- ========================

CREATE TYPE unidad_negocio AS ENUM (
  'fachadas', 'particulares', 'multidireccional',
  'industria', 'construccion', 'obra_publica', 'eventos'
);

CREATE TYPE estado_pago AS ENUM (
  'pendiente', 'anticipo_facturado', 'anticipo_pagado', 'al_dia', 'con_deuda'
);

CREATE TYPE tipo_orden_trabajo AS ENUM (
  'montaje', 'desarme', 'adicional', 'modificacion',
  'visita_tecnica', 'inspeccion', 'retiro'
);

CREATE TYPE estado_orden_trabajo AS ENUM (
  'pendiente', 'habilitacion_pendiente', 'habilitada',
  'programada', 'en_ejecucion', 'completada', 'cancelada'
);

CREATE TYPE estado_periodo AS ENUM (
  'vigente', 'facturado', 'pagado', 'vencido', 'renovado'
);

CREATE TYPE tipo_gate AS ENUM (
  'pago_anticipo', 'permiso_municipal', 'habilitacion_personal',
  'proyecto_tecnico', 'computo_aprobado'
);

CREATE TYPE estado_gate AS ENUM ('pendiente', 'aprobado', 'bloqueado');

-- ========================
-- MODIFICAR TABLAS EXISTENTES
-- ========================

-- Agregar unidad de negocio y vigencia a obras
ALTER TABLE obras ADD COLUMN IF NOT EXISTS unidad_negocio unidad_negocio;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS fecha_vigencia_inicio DATE;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS fecha_vigencia_fin DATE;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS estado_pago estado_pago DEFAULT 'pendiente';
ALTER TABLE obras ADD COLUMN IF NOT EXISTS monto_alquiler_mensual DECIMAL(14,2);
ALTER TABLE obras ADD COLUMN IF NOT EXISTS cotizacion_id UUID REFERENCES cotizaciones(id);

-- Agregar unidad de negocio a oportunidades
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS unidad_negocio unidad_negocio;

-- ========================
-- NUEVAS TABLAS
-- ========================

-- Ordenes de trabajo
CREATE TABLE ordenes_trabajo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  obra_id UUID NOT NULL REFERENCES obras(id),
  tipo tipo_orden_trabajo NOT NULL,
  descripcion TEXT,
  estado estado_orden_trabajo NOT NULL DEFAULT 'pendiente',
  fecha_programada DATE,
  fecha_ejecucion DATE,
  hora_inicio TIME,
  hora_fin TIME,
  cuadrilla JSONB DEFAULT '[]'::jsonb,
  vehiculo_id UUID REFERENCES vehiculos(id),
  responsable_id UUID REFERENCES user_profiles(id),
  horas_estimadas DECIMAL(6,2),
  horas_reales DECIMAL(6,2),
  observaciones TEXT,
  requiere_habilitacion BOOLEAN NOT NULL DEFAULT true,
  habilitacion_aprobada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

CREATE SEQUENCE orden_trabajo_codigo_seq START WITH 1;

-- Periodos de alquiler
CREATE TABLE periodos_alquiler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  numero_periodo INTEGER NOT NULL DEFAULT 1,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  estado estado_periodo NOT NULL DEFAULT 'vigente',
  factura_referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gates de obra (prerequisitos)
CREATE TABLE gates_obra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  tipo_gate tipo_gate NOT NULL,
  estado estado_gate NOT NULL DEFAULT 'pendiente',
  fecha_aprobacion DATE,
  observaciones TEXT,
  aprobado_por_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, tipo_gate)
);

-- ========================
-- INDICES
-- ========================

CREATE INDEX idx_ordenes_trabajo_obra ON ordenes_trabajo(obra_id);
CREATE INDEX idx_ordenes_trabajo_estado ON ordenes_trabajo(estado);
CREATE INDEX idx_ordenes_trabajo_fecha ON ordenes_trabajo(fecha_programada);
CREATE INDEX idx_periodos_alquiler_obra ON periodos_alquiler(obra_id);
CREATE INDEX idx_periodos_alquiler_estado ON periodos_alquiler(estado);
CREATE INDEX idx_gates_obra_obra ON gates_obra(obra_id);
CREATE INDEX idx_obras_unidad ON obras(unidad_negocio);
CREATE INDEX idx_oportunidades_unidad ON oportunidades(unidad_negocio);

-- ========================
-- TRIGGERS
-- ========================

CREATE TRIGGER trg_ordenes_trabajo_updated_at BEFORE UPDATE ON ordenes_trabajo FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_periodos_alquiler_updated_at BEFORE UPDATE ON periodos_alquiler FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_gates_obra_updated_at BEFORE UPDATE ON gates_obra FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_audit_ordenes_trabajo AFTER INSERT OR UPDATE OR DELETE ON ordenes_trabajo FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_periodos_alquiler AFTER INSERT OR UPDATE OR DELETE ON periodos_alquiler FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_gates_obra AFTER INSERT OR UPDATE OR DELETE ON gates_obra FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Auto-generar codigo de OT
CREATE OR REPLACE FUNCTION generar_codigo_ot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'OT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('orden_trabajo_codigo_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_codigo_ot BEFORE INSERT ON ordenes_trabajo FOR EACH ROW EXECUTE FUNCTION generar_codigo_ot();

-- ========================
-- FUNCION: Verificar gates de una obra
-- ========================

CREATE OR REPLACE FUNCTION verificar_gates_obra(p_obra_id UUID)
RETURNS TABLE(tipo tipo_gate, estado estado_gate, mensaje TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT g.tipo_gate, g.estado,
    CASE
      WHEN g.estado = 'aprobado' THEN 'OK'
      WHEN g.tipo_gate = 'pago_anticipo' THEN 'Falta confirmar pago de anticipo'
      WHEN g.tipo_gate = 'permiso_municipal' THEN 'Falta permiso municipal aprobado'
      WHEN g.tipo_gate = 'habilitacion_personal' THEN 'Falta habilitacion de personal'
      WHEN g.tipo_gate = 'proyecto_tecnico' THEN 'Falta proyecto tecnico aprobado'
      WHEN g.tipo_gate = 'computo_aprobado' THEN 'Falta computo aprobado'
      ELSE 'Pendiente'
    END AS mensaje
  FROM gates_obra g
  WHERE g.obra_id = p_obra_id
  ORDER BY g.tipo_gate;
END;
$$ LANGUAGE plpgsql;

-- ========================
-- FUNCION: Crear gates default al crear obra
-- ========================

CREATE OR REPLACE FUNCTION crear_gates_obra()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gates_obra (obra_id, tipo_gate) VALUES
    (NEW.id, 'pago_anticipo'),
    (NEW.id, 'habilitacion_personal');

  -- Si es fachada, agregar gate de permiso municipal
  IF NEW.unidad_negocio = 'fachadas' THEN
    INSERT INTO gates_obra (obra_id, tipo_gate) VALUES (NEW.id, 'permiso_municipal');
  END IF;

  -- Si no es particulares, agregar gates de proyecto y computo
  IF NEW.unidad_negocio IS DISTINCT FROM 'particulares' THEN
    INSERT INTO gates_obra (obra_id, tipo_gate) VALUES
      (NEW.id, 'proyecto_tecnico'),
      (NEW.id, 'computo_aprobado');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crear_gates_obra AFTER INSERT ON obras FOR EACH ROW EXECUTE FUNCTION crear_gates_obra();

-- ========================
-- RLS
-- ========================

ALTER TABLE ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos_alquiler ENABLE ROW LEVEL SECURITY;
ALTER TABLE gates_obra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver OTs" ON ordenes_trabajo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear OTs" ON ordenes_trabajo FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar OTs" ON ordenes_trabajo FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver periodos" ON periodos_alquiler FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden gestionar periodos" ON periodos_alquiler FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver gates" ON gates_obra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden gestionar gates" ON gates_obra FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));
