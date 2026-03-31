-- ============================================================
-- AndamiosOS - Fase 2: Schema adicional
-- ============================================================

-- ========================
-- TIPOS ENUMERADOS NUEVOS
-- ========================

CREATE TYPE estado_proyecto_tecnico AS ENUM (
  'pendiente', 'en_curso', 'en_revision', 'aprobado', 'requiere_cambios', 'cancelado'
);

CREATE TYPE estado_computo AS ENUM (
  'borrador', 'verificado', 'aprobado', 'en_preparacion', 'preparado', 'requiere_ajuste'
);

CREATE TYPE tipo_tarea_planificacion AS ENUM (
  'montaje', 'desarme', 'entrega', 'retiro', 'visita_tecnica', 'inspeccion', 'otro'
);

CREATE TYPE estado_tarea AS ENUM (
  'planificada', 'confirmada', 'en_ejecucion', 'completada', 'reprogramada', 'cancelada'
);

CREATE TYPE prioridad_tarea AS ENUM ('normal', 'urgente');

CREATE TYPE estado_parte_obra AS ENUM ('borrador', 'firmado', 'aprobado');

CREATE TYPE tipo_tarea_parte AS ENUM (
  'montaje', 'desarme', 'modificacion', 'reparacion', 'inspeccion', 'otro'
);

CREATE TYPE motivo_solicitud_extra AS ENUM (
  'error_computo', 'cambio_alcance', 'reemplazo_danado', 'otro'
);

CREATE TYPE urgencia_solicitud AS ENUM ('normal', 'urgente', 'critica');

CREATE TYPE estado_solicitud_extra AS ENUM (
  'solicitada', 'aprobada', 'rechazada', 'despachada', 'entregada'
);

-- ========================
-- TABLAS FASE 2
-- ========================

-- Proyectos Tecnicos
CREATE TABLE proyectos_tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  codigo TEXT UNIQUE,
  tecnico_asignado_id UUID REFERENCES user_profiles(id),
  estado estado_proyecto_tecnico NOT NULL DEFAULT 'pendiente',
  fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega_estimada DATE,
  fecha_entrega_real DATE,
  tipo_sistema_andamio sistema_andamio,
  altura_maxima DECIMAL(8,2),
  metros_lineales DECIMAL(10,2),
  superficie DECIMAL(10,2),
  observaciones_tecnicas TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  aprobado_por_id UUID REFERENCES user_profiles(id),
  fecha_aprobacion DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Secuencia para codigos de proyecto
CREATE SEQUENCE proyecto_codigo_seq START WITH 1;

-- Archivos de proyecto tecnico
CREATE TABLE proyecto_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES proyectos_tecnicos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT,
  url TEXT NOT NULL,
  tamanio INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Computos de materiales
CREATE TABLE computos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_tecnico_id UUID NOT NULL REFERENCES proyectos_tecnicos(id),
  version INTEGER NOT NULL DEFAULT 1,
  estado estado_computo NOT NULL DEFAULT 'borrador',
  verificado_por_id UUID REFERENCES user_profiles(id),
  aprobado_por_id UUID REFERENCES user_profiles(id),
  fecha_verificacion DATE,
  fecha_aprobacion DATE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Items del computo
CREATE TABLE computo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computo_id UUID NOT NULL REFERENCES computos(id) ON DELETE CASCADE,
  pieza_id UUID NOT NULL REFERENCES catalogo_piezas(id),
  cantidad_requerida INTEGER NOT NULL,
  cantidad_disponible INTEGER,
  notas TEXT
);

-- Planificacion de tareas
CREATE TABLE planificacion_tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_tarea_planificacion NOT NULL,
  obra_id UUID NOT NULL REFERENCES obras(id),
  fecha_programada DATE NOT NULL,
  hora_inicio TIME,
  hora_fin_estimada TIME,
  cuadrilla JSONB DEFAULT '[]'::jsonb,
  vehiculo_id UUID REFERENCES vehiculos(id),
  estado estado_tarea NOT NULL DEFAULT 'planificada',
  prioridad prioridad_tarea NOT NULL DEFAULT 'normal',
  observaciones TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partes de obra
CREATE TABLE partes_obra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_tarea tipo_tarea_parte NOT NULL DEFAULT 'montaje',
  cuadrilla JSONB DEFAULT '[]'::jsonb,
  horas_trabajadas JSONB DEFAULT '{}'::jsonb,
  avance_descripcion TEXT,
  metros_montados DECIMAL(10,2),
  material_utilizado JSONB DEFAULT '[]'::jsonb,
  observaciones TEXT,
  fotos JSONB DEFAULT '[]'::jsonb,
  clima TEXT,
  firmado_por_id UUID REFERENCES personal(id),
  estado estado_parte_obra NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Solicitudes extra de material
CREATE TABLE solicitudes_extra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id),
  solicitante_id UUID REFERENCES personal(id),
  motivo motivo_solicitud_extra NOT NULL DEFAULT 'otro',
  urgencia urgencia_solicitud NOT NULL DEFAULT 'normal',
  estado estado_solicitud_extra NOT NULL DEFAULT 'solicitada',
  aprobador_id UUID REFERENCES user_profiles(id),
  remito_id UUID REFERENCES remitos(id),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Items de solicitud extra
CREATE TABLE solicitud_extra_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES solicitudes_extra(id) ON DELETE CASCADE,
  pieza_id UUID NOT NULL REFERENCES catalogo_piezas(id),
  cantidad INTEGER NOT NULL
);

-- ========================
-- INDICES
-- ========================

CREATE INDEX idx_proyectos_obra ON proyectos_tecnicos(obra_id);
CREATE INDEX idx_proyectos_estado ON proyectos_tecnicos(estado);
CREATE INDEX idx_proyecto_archivos_proyecto ON proyecto_archivos(proyecto_id);
CREATE INDEX idx_computos_proyecto ON computos(proyecto_tecnico_id);
CREATE INDEX idx_computo_items_computo ON computo_items(computo_id);
CREATE INDEX idx_planificacion_fecha ON planificacion_tareas(fecha_programada);
CREATE INDEX idx_planificacion_obra ON planificacion_tareas(obra_id);
CREATE INDEX idx_planificacion_estado ON planificacion_tareas(estado);
CREATE INDEX idx_partes_obra_obra ON partes_obra(obra_id);
CREATE INDEX idx_partes_obra_fecha ON partes_obra(fecha);
CREATE INDEX idx_solicitudes_obra ON solicitudes_extra(obra_id);
CREATE INDEX idx_solicitudes_estado ON solicitudes_extra(estado);
CREATE INDEX idx_solicitud_items_solicitud ON solicitud_extra_items(solicitud_id);

-- ========================
-- TRIGGERS updated_at
-- ========================

CREATE TRIGGER trg_proyectos_tecnicos_updated_at BEFORE UPDATE ON proyectos_tecnicos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_computos_updated_at BEFORE UPDATE ON computos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_planificacion_updated_at BEFORE UPDATE ON planificacion_tareas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_partes_obra_updated_at BEFORE UPDATE ON partes_obra FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_solicitudes_extra_updated_at BEFORE UPDATE ON solicitudes_extra FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- TRIGGERS AUDITORIA
-- ========================

CREATE TRIGGER trg_audit_proyectos AFTER INSERT OR UPDATE OR DELETE ON proyectos_tecnicos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_computos AFTER INSERT OR UPDATE OR DELETE ON computos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_planificacion AFTER INSERT OR UPDATE OR DELETE ON planificacion_tareas FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_partes_obra AFTER INSERT OR UPDATE OR DELETE ON partes_obra FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_solicitudes AFTER INSERT OR UPDATE OR DELETE ON solicitudes_extra FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ========================
-- FUNCION: Generar codigo de proyecto
-- ========================

CREATE OR REPLACE FUNCTION generar_codigo_proyecto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'PRY-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('proyecto_codigo_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_codigo_proyecto BEFORE INSERT ON proyectos_tecnicos FOR EACH ROW EXECUTE FUNCTION generar_codigo_proyecto();

-- ========================
-- RLS POLICIES FASE 2
-- ========================

ALTER TABLE proyectos_tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE computos ENABLE ROW LEVEL SECURITY;
ALTER TABLE computo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE planificacion_tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE partes_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitud_extra_items ENABLE ROW LEVEL SECURITY;

-- Proyectos tecnicos
CREATE POLICY "Autenticados pueden ver proyectos" ON proyectos_tecnicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear proyectos" ON proyectos_tecnicos FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar proyectos" ON proyectos_tecnicos FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Archivos de proyecto
CREATE POLICY "Autenticados pueden ver archivos" ON proyecto_archivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden gestionar archivos" ON proyecto_archivos FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Computos
CREATE POLICY "Autenticados pueden ver computos" ON computos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear computos" ON computos FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar computos" ON computos FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Computo items
CREATE POLICY "Autenticados pueden ver items computo" ON computo_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden gestionar items computo" ON computo_items FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Planificacion
CREATE POLICY "Autenticados pueden ver planificacion" ON planificacion_tareas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear tareas" ON planificacion_tareas FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar tareas" ON planificacion_tareas FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Partes de obra
CREATE POLICY "Autenticados pueden ver partes" ON partes_obra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear partes" ON partes_obra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Todos pueden editar partes" ON partes_obra FOR UPDATE TO authenticated USING (true);

-- Solicitudes extra
CREATE POLICY "Autenticados pueden ver solicitudes" ON solicitudes_extra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear solicitudes" ON solicitudes_extra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin y operativo pueden editar solicitudes" ON solicitudes_extra FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Solicitud items
CREATE POLICY "Autenticados pueden ver items solicitud" ON solicitud_extra_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden gestionar items solicitud" ON solicitud_extra_items FOR ALL TO authenticated USING (true);
