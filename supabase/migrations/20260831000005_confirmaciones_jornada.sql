-- ============================================================
-- AndamiosOS — Quién confirmó una jornada, y cuándo
--
-- POR QUÉ NO VIVE EN ODOO, que es donde vive la asignación: la app escribe con UN solo
-- usuario de integración (ODOO_USERNAME / ODOO_UID). El write_uid de x_aba_asignacion
-- dice lo mismo para todas las confirmaciones —el robot— así que Odoo no puede contestar
-- la pregunta. La identidad real sólo existe del lado de Supabase.
--
-- APPEND-ONLY, y no dos campos en la asignación: confirmar es reversible (el mismo botón
-- vuelve a tentativa). Con dos campos, desconfirmar borra al que había confirmado y no
-- queda rastro de quién lo hizo — que operativamente suele ser la pregunta más
-- importante ("¿por qué esta obra dejó de estar confirmada?"). Mismo criterio que
-- hab_gestiones: la restricción vive en la base, no sólo en la UI.
--
-- UNA FILA POR JORNADA, no por bloque: confirmar actúa sobre todas las jornadas de un
-- tramo a la vez, pero después ese tramo se parte, se mueve o se borra de a pedazos. Con
-- el registro colgado de cada asignación, cada jornada se lleva su historia.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS plan_confirmaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- La asignación de Odoo (x_aba_asignacion). Sin FK: Odoo es otra base.
  asignacion_odoo_id BIGINT NOT NULL,
  -- Ancla estable de la OBRA. La asignación puede borrarse y volver a crearse con otro id
  -- —"Deshacer" al quitarla del tablero hace exactamente eso— y ahí el historial quedaría
  -- huérfano. Por la OT se sigue encontrando.
  odoo_ot_id BIGINT NOT NULL,
  -- El día que se estaba confirmando. Se guarda para que el historial pueda decir "la
  -- jornada del 3 sep" sin tener que ir a preguntarle a Odoo por una asignación que
  -- quizá ya no existe.
  fecha DATE,

  -- A qué estado pasó. 'confirmada' o 'tentativa': el mismo botón hace las dos cosas y
  -- las dos importan.
  estado TEXT NOT NULL CHECK (estado IN ('confirmada', 'tentativa')),

  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El panel pregunta por la OT y ordena por fecha desc: es la consulta al abrir la tarjeta.
CREATE INDEX IF NOT EXISTS idx_plan_confirmaciones_ot
  ON plan_confirmaciones(odoo_ot_id, created_at DESC);
-- Y por asignación, para el bloque que se está mirando.
CREATE INDEX IF NOT EXISTS idx_plan_confirmaciones_asig
  ON plan_confirmaciones(asignacion_odoo_id, created_at DESC);

ALTER TABLE plan_confirmaciones ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY: sólo SELECT e INSERT, a propósito y por diseño. Sin UPDATE ni DELETE —
-- un registro de auditoría que se puede editar no es un registro de auditoría.
DROP POLICY IF EXISTS "Autenticados ven confirmaciones" ON plan_confirmaciones;
CREATE POLICY "Autenticados ven confirmaciones" ON plan_confirmaciones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados registran confirmaciones" ON plan_confirmaciones;
CREATE POLICY "Autenticados registran confirmaciones" ON plan_confirmaciones
  FOR INSERT TO authenticated WITH CHECK (true);

COMMIT;
