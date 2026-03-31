-- ============================================================
-- AndamiosOS - Fase 3: Inteligencia Operativa
-- ============================================================

-- ========================
-- TIPOS ENUMERADOS
-- ========================

CREATE TYPE tipo_incidente AS ENUM (
  'accidente', 'cuasi_accidente', 'dano_material', 'robo',
  'reclamo_cliente', 'desvio_operativo', 'observacion_seguridad'
);
CREATE TYPE severidad_incidente AS ENUM ('baja', 'media', 'alta', 'critica');
CREATE TYPE estado_incidente AS ENUM ('abierto', 'en_investigacion', 'cerrado');

CREATE TYPE estado_permiso AS ENUM ('en_tramite', 'aprobado', 'rechazado', 'vencido', 'en_renovacion');

CREATE TYPE tipo_inspeccion AS ENUM ('propia', 'tercero', 'cliente', 'organismo');
CREATE TYPE resultado_inspeccion AS ENUM ('aprobado', 'observado', 'rechazado');

CREATE TYPE tipo_mantenimiento AS ENUM ('preventivo', 'correctivo');
CREATE TYPE estado_mantenimiento AS ENUM ('programado', 'realizado', 'vencido');

-- ========================
-- TABLAS
-- ========================

-- Incidentes
CREATE TABLE incidentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID REFERENCES obras(id),
  tipo tipo_incidente NOT NULL,
  severidad severidad_incidente NOT NULL DEFAULT 'baja',
  descripcion TEXT NOT NULL,
  personas_involucradas JSONB DEFAULT '[]'::jsonb,
  fotos JSONB DEFAULT '[]'::jsonb,
  acciones_tomadas TEXT,
  acciones_correctivas TEXT,
  responsable_seguimiento_id UUID REFERENCES user_profiles(id),
  estado estado_incidente NOT NULL DEFAULT 'abierto',
  fecha_cierre DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Permisos municipales
CREATE TABLE permisos_municipales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  tipo_permiso TEXT NOT NULL,
  organismo TEXT NOT NULL,
  fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_otorgamiento DATE,
  fecha_vencimiento DATE,
  estado estado_permiso NOT NULL DEFAULT 'en_tramite',
  costo DECIMAL(12,2),
  responsable_id UUID REFERENCES user_profiles(id),
  documentacion JSONB DEFAULT '[]'::jsonb,
  notas_seguimiento JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Inspecciones periodicas
CREATE TABLE inspecciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo tipo_inspeccion NOT NULL DEFAULT 'propia',
  inspector_nombre TEXT NOT NULL,
  resultado resultado_inspeccion NOT NULL,
  observaciones TEXT,
  fotos JSONB DEFAULT '[]'::jsonb,
  proxima_inspeccion DATE,
  acciones_correctivas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Mantenimiento de vehiculos/equipos
CREATE TABLE mantenimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_tipo TEXT NOT NULL DEFAULT 'vehiculo',
  entidad_id UUID NOT NULL,
  tipo tipo_mantenimiento NOT NULL DEFAULT 'preventivo',
  descripcion TEXT NOT NULL,
  fecha_programada DATE,
  fecha_realizada DATE,
  proximo_mantenimiento DATE,
  costo DECIMAL(12,2),
  proveedor TEXT,
  estado estado_mantenimiento NOT NULL DEFAULT 'programado',
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insumos y herramientas
CREATE TABLE insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  unidad_medida TEXT DEFAULT 'unidad',
  fecha_vencimiento DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comunicaciones por obra
CREATE TABLE comunicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  tipo TEXT NOT NULL DEFAULT 'nota',
  asunto TEXT NOT NULL,
  contenido TEXT NOT NULL,
  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================
-- INDICES
-- ========================

CREATE INDEX idx_incidentes_obra ON incidentes(obra_id);
CREATE INDEX idx_incidentes_estado ON incidentes(estado);
CREATE INDEX idx_incidentes_severidad ON incidentes(severidad);
CREATE INDEX idx_permisos_obra ON permisos_municipales(obra_id);
CREATE INDEX idx_permisos_estado ON permisos_municipales(estado);
CREATE INDEX idx_inspecciones_obra ON inspecciones(obra_id);
CREATE INDEX idx_inspecciones_fecha ON inspecciones(fecha);
CREATE INDEX idx_mantenimientos_entidad ON mantenimientos(entidad_tipo, entidad_id);
CREATE INDEX idx_mantenimientos_estado ON mantenimientos(estado);
CREATE INDEX idx_comunicaciones_obra ON comunicaciones(obra_id);

-- ========================
-- TRIGGERS
-- ========================

CREATE TRIGGER trg_incidentes_updated_at BEFORE UPDATE ON incidentes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_permisos_updated_at BEFORE UPDATE ON permisos_municipales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inspecciones_updated_at BEFORE UPDATE ON inspecciones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_mantenimientos_updated_at BEFORE UPDATE ON mantenimientos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_insumos_updated_at BEFORE UPDATE ON insumos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_audit_incidentes AFTER INSERT OR UPDATE OR DELETE ON incidentes FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_permisos AFTER INSERT OR UPDATE OR DELETE ON permisos_municipales FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_inspecciones AFTER INSERT OR UPDATE OR DELETE ON inspecciones FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_mantenimientos AFTER INSERT OR UPDATE OR DELETE ON mantenimientos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ========================
-- RLS
-- ========================

ALTER TABLE incidentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos_municipales ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver incidentes" ON incidentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear incidentes" ON incidentes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin y operativo pueden editar incidentes" ON incidentes FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver permisos" ON permisos_municipales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear permisos" ON permisos_municipales FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar permisos" ON permisos_municipales FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver inspecciones" ON inspecciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear inspecciones" ON inspecciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin y operativo pueden editar inspecciones" ON inspecciones FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver mantenimientos" ON mantenimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden gestionar mantenimientos" ON mantenimientos FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver insumos" ON insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y deposito pueden gestionar insumos" ON insumos FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'deposito'));

CREATE POLICY "Autenticados pueden ver comunicaciones" ON comunicaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear comunicaciones" ON comunicaciones FOR INSERT TO authenticated WITH CHECK (true);
