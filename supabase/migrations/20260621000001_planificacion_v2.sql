-- ============================================================
-- AndamiosOS — Planificación v2 (tablero semanal)
-- Modelo: asignación de jornada (OT × cuadrilla × día) con personal,
-- viajes de camión (camión + chofer + franja horaria) y bloqueos.
-- Reemplaza el calendario simple sobre planificacion_tareas (que queda sin uso).
-- ============================================================

BEGIN;

-- ========================
-- TABLAS
-- ========================

-- Cuadrillas: slots fijos de trabajo (personal variable por jornada).
CREATE TABLE IF NOT EXISTS cuadrillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asignación de jornada: una OT trabajada por una cuadrilla un día.
CREATE TABLE IF NOT EXISTS planificacion_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  cuadrilla_id UUID NOT NULL REFERENCES cuadrillas(id),
  fecha DATE NOT NULL,
  horas_jornada NUMERIC NOT NULL DEFAULT 8,
  hora_inicio TIME NOT NULL DEFAULT '07:00',
  estado TEXT NOT NULL DEFAULT 'sin_completar',  -- 'sin_completar' | 'completa'
  observaciones TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Personal asignado a una jornada de cuadrilla (M:N).
CREATE TABLE IF NOT EXISTS planificacion_asignacion_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id UUID NOT NULL REFERENCES planificacion_asignaciones(id) ON DELETE CASCADE,
  personal_id UUID NOT NULL REFERENCES personal(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asignacion_id, personal_id)
);

-- Viaje de camión para una jornada: camión + chofer + franja horaria.
CREATE TABLE IF NOT EXISTS planificacion_viajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id UUID NOT NULL REFERENCES planificacion_asignaciones(id) ON DELETE CASCADE,
  camion_id UUID NOT NULL REFERENCES vehiculos(id),
  chofer_id UUID REFERENCES personal(id),
  franja_desde TIME NOT NULL,
  franja_hasta TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bloqueo de franja horaria en una cuadrilla (almuerzo, capacitación, feriado).
CREATE TABLE IF NOT EXISTS planificacion_bloqueos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuadrilla_id UUID NOT NULL REFERENCES cuadrillas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  franja_desde TIME NOT NULL,
  franja_hasta TIME NOT NULL,
  motivo TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================
-- ÍNDICES
-- ========================

CREATE INDEX IF NOT EXISTS idx_plan_asig_cuadrilla_fecha ON planificacion_asignaciones(cuadrilla_id, fecha);
CREATE INDEX IF NOT EXISTS idx_plan_asig_fecha ON planificacion_asignaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_plan_asig_ot ON planificacion_asignaciones(ot_id);
CREATE INDEX IF NOT EXISTS idx_plan_asig_personal_asig ON planificacion_asignacion_personal(asignacion_id);
CREATE INDEX IF NOT EXISTS idx_plan_viajes_asig ON planificacion_viajes(asignacion_id);
CREATE INDEX IF NOT EXISTS idx_plan_viajes_camion ON planificacion_viajes(camion_id);
CREATE INDEX IF NOT EXISTS idx_plan_bloqueos_cuadrilla_fecha ON planificacion_bloqueos(cuadrilla_id, fecha);

-- ========================
-- TRIGGERS
-- ========================

CREATE TRIGGER trg_plan_asignaciones_updated_at BEFORE UPDATE ON planificacion_asignaciones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_audit_plan_asignaciones AFTER INSERT OR UPDATE OR DELETE ON planificacion_asignaciones FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_plan_bloqueos AFTER INSERT OR UPDATE OR DELETE ON planificacion_bloqueos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ========================
-- RLS
-- ========================

ALTER TABLE cuadrillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE planificacion_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE planificacion_asignacion_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE planificacion_viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE planificacion_bloqueos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver cuadrillas" ON cuadrillas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan cuadrillas" ON cuadrillas FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver asignaciones" ON planificacion_asignaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan asignaciones" ON planificacion_asignaciones FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver asignacion personal" ON planificacion_asignacion_personal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan asignacion personal" ON planificacion_asignacion_personal FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver viajes" ON planificacion_viajes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan viajes" ON planificacion_viajes FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Autenticados pueden ver bloqueos" ON planificacion_bloqueos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan bloqueos" ON planificacion_bloqueos FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- ========================
-- SEED — 4 cuadrillas fijas (ajustable luego)
-- ========================

INSERT INTO cuadrillas (nombre, orden) VALUES
  ('Cuadrilla 1', 1),
  ('Cuadrilla 2', 2),
  ('Cuadrilla 3', 3),
  ('Cuadrilla 4', 4)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
