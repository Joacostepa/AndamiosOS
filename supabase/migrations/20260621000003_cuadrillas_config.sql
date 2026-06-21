-- ============================================================
-- AndamiosOS — Configuración de cuadrillas
-- Composición base: responsable + plantel (M:N con personal).
-- Un operario pertenece al plantel base de una sola cuadrilla (UNIQUE personal_id).
-- ============================================================

BEGIN;

ALTER TABLE cuadrillas
  ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES personal(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_temporaria BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS cuadrilla_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuadrilla_id UUID NOT NULL REFERENCES cuadrillas(id) ON DELETE CASCADE,
  personal_id UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (personal_id)
);

CREATE INDEX IF NOT EXISTS idx_cuadrilla_personal_cuadrilla ON cuadrilla_personal(cuadrilla_id);

ALTER TABLE cuadrilla_personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados pueden ver plantel" ON cuadrilla_personal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo gestionan plantel" ON cuadrilla_personal FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

COMMIT;
