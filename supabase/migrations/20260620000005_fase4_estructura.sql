-- Fase 4 — flujo operativo en la app (estructura).
-- (Los valores de enum tipo_remito 'sobrante'/'control_devolucion' se agregan
--  aparte, fuera de transacción, en el applier — ADD VALUE no se usa acá.)

BEGIN;

-- ── Remitos: sobrante (motivo) + control de devolución (referencia a la devolución) ──
ALTER TABLE remitos
  ADD COLUMN IF NOT EXISTS motivo text,                 -- por qué sobró (remito sobrante), texto/observación
  ADD COLUMN IF NOT EXISTS remito_origen_id uuid        -- control_devolucion → remito de devolución que controla
    REFERENCES remitos(id) ON DELETE SET NULL;

-- ── Partes diarios vinculados a la OT (hoy solo cuelgan de la obra) ──
ALTER TABLE partes_obra
  ADD COLUMN IF NOT EXISTS ot_id uuid REFERENCES ordenes_trabajo(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_partes_obra_ot_id ON partes_obra(ot_id);

-- ── Rollup app-owned: cierre de OT → estado de Obra ──────────────────────────
-- Regla (monotónica, solo avanza; nunca toca 'cancelada'):
--   todas las OTs de armado/ampliacion completadas  → obra 'armado'
--   existe OT de desarme/desmonte_parcial (iniciada) → obra 'pendiente_desarme'
--   todas las OTs de desarme completadas             → obra 'desarmado'
CREATE OR REPLACE FUNCTION recalc_estado_obra() RETURNS trigger AS $$
DECLARE
  v_obra uuid;
  v_actual estado_obra;
  v_nuevo estado_obra;
  has_armado boolean; armado_done boolean;
  has_desarme boolean; desarme_done boolean;
  rank_actual int; rank_nuevo int;
BEGIN
  v_obra := COALESCE(NEW.obra_id, OLD.obra_id);
  IF v_obra IS NULL THEN RETURN NULL; END IF;

  SELECT estado INTO v_actual FROM obras WHERE id = v_obra;
  IF v_actual IS NULL OR v_actual = 'cancelada' THEN RETURN NULL; END IF;

  SELECT
    COALESCE(bool_or(tipo IN ('armado','ampliacion')        AND estado <> 'cancelada'), false),
    COALESCE(bool_or(tipo IN ('desarme','desmonte_parcial') AND estado <> 'cancelada'), false)
  INTO has_armado, has_desarme
  FROM ordenes_trabajo WHERE obra_id = v_obra;

  armado_done := has_armado AND NOT EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE obra_id = v_obra
      AND tipo IN ('armado','ampliacion') AND estado NOT IN ('completada','cancelada'));
  desarme_done := has_desarme AND NOT EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE obra_id = v_obra
      AND tipo IN ('desarme','desmonte_parcial') AND estado NOT IN ('completada','cancelada'));

  IF desarme_done THEN v_nuevo := 'desarmado';
  ELSIF has_desarme THEN v_nuevo := 'pendiente_desarme';
  ELSIF armado_done THEN v_nuevo := 'armado';
  ELSE v_nuevo := 'pendiente_armado';
  END IF;

  -- monotónico: solo avanzar (evita que una OT nueva 'pendiente' retroceda la obra)
  rank_actual := CASE v_actual
    WHEN 'pendiente_armado' THEN 0 WHEN 'armado' THEN 1
    WHEN 'pendiente_desarme' THEN 2 WHEN 'desarmado' THEN 3 ELSE -1 END;
  rank_nuevo := CASE v_nuevo
    WHEN 'pendiente_armado' THEN 0 WHEN 'armado' THEN 1
    WHEN 'pendiente_desarme' THEN 2 WHEN 'desarmado' THEN 3 ELSE -1 END;

  IF rank_nuevo > rank_actual THEN
    UPDATE obras SET estado = v_nuevo WHERE id = v_obra;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalc_estado_obra ON ordenes_trabajo;
CREATE TRIGGER trg_recalc_estado_obra
  AFTER INSERT OR DELETE OR UPDATE OF estado, tipo, obra_id ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION recalc_estado_obra();

COMMIT;
