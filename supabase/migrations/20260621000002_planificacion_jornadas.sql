-- ============================================================
-- AndamiosOS — Planificación v2: jornadas de OT
-- Cada OT multi-día se materializa en N jornadas (ceil(horas_estimadas/8), mín 1).
-- Una asignación del tablero cubre una jornada puntual (jornada_id).
-- Triggers mantienen ot_jornadas en sync con las asignaciones.
-- ============================================================

BEGIN;

-- ----- Tabla de jornadas -----
CREATE TABLE IF NOT EXISTS ot_jornadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | asignada | ejecutada
  asignacion_id UUID REFERENCES planificacion_asignaciones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ot_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_ot_jornadas_ot ON ot_jornadas(ot_id);

-- ----- Vínculo asignación → jornada -----
ALTER TABLE planificacion_asignaciones
  ADD COLUMN IF NOT EXISTS jornada_id UUID REFERENCES ot_jornadas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_plan_asig_jornada ON planificacion_asignaciones(jornada_id);

-- ----- RLS -----
ALTER TABLE ot_jornadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados pueden ver jornadas" ON ot_jornadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan jornadas" ON ot_jornadas FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- ----- Trigger: asegurar jornadas al crear/actualizar la OT -----
CREATE OR REPLACE FUNCTION ensure_ot_jornadas()
RETURNS TRIGGER AS $$
DECLARE
  total INT;
BEGIN
  total := GREATEST(1, CEIL(COALESCE(NEW.horas_estimadas, 0) / 8.0)::int);
  INSERT INTO ot_jornadas (ot_id, numero)
  SELECT NEW.id, gs.n FROM generate_series(1, total) AS gs(n)
  ON CONFLICT (ot_id, numero) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_ot_jornadas
  AFTER INSERT OR UPDATE OF horas_estimadas ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION ensure_ot_jornadas();

-- ----- Trigger: sincronizar estado de la jornada con sus asignaciones -----
CREATE OR REPLACE FUNCTION sync_jornada_asignacion()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.jornada_id IS NOT NULL THEN
      UPDATE ot_jornadas SET estado = 'pendiente', asignacion_id = NULL WHERE id = OLD.jornada_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Si cambió la jornada vinculada, liberar la anterior.
  IF (TG_OP = 'UPDATE' AND OLD.jornada_id IS DISTINCT FROM NEW.jornada_id AND OLD.jornada_id IS NOT NULL) THEN
    UPDATE ot_jornadas SET estado = 'pendiente', asignacion_id = NULL WHERE id = OLD.jornada_id;
  END IF;

  IF NEW.jornada_id IS NOT NULL THEN
    UPDATE ot_jornadas SET estado = 'asignada', asignacion_id = NEW.id WHERE id = NEW.jornada_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_jornada_asignacion
  AFTER INSERT OR UPDATE OR DELETE ON planificacion_asignaciones
  FOR EACH ROW EXECUTE FUNCTION sync_jornada_asignacion();

-- ----- Backfill -----
-- Jornadas para las OTs no cerradas existentes.
INSERT INTO ot_jornadas (ot_id, numero)
SELECT o.id, gs.n
FROM ordenes_trabajo o
CROSS JOIN LATERAL generate_series(1, GREATEST(1, CEIL(COALESCE(o.horas_estimadas, 0) / 8.0)::int)) AS gs(n)
WHERE o.estado IN ('pendiente', 'programada', 'en_curso')
ON CONFLICT (ot_id, numero) DO NOTHING;

-- Vincular jornada_id en las asignaciones ya creadas (por orden cronológico → numero 1..N).
WITH ranked AS (
  SELECT a.id AS asig_id, a.ot_id,
         ROW_NUMBER() OVER (PARTITION BY a.ot_id ORDER BY a.fecha, a.hora_inicio, a.created_at) AS rn
  FROM planificacion_asignaciones a
  WHERE a.jornada_id IS NULL
)
UPDATE planificacion_asignaciones pa
SET jornada_id = j.id
FROM ranked r
JOIN ot_jornadas j ON j.ot_id = r.ot_id AND j.numero = r.rn
WHERE pa.id = r.asig_id;

COMMIT;
