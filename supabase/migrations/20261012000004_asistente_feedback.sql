-- ========================================================================
-- Asistente comercial — «esto estuvo mal»
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: el método de correcciones acordado con JS el 26/09 es que el
-- vendedor marque la respuesta que estuvo mal en el momento, con un motivo, y que eso quede
-- atado al turno exacto (turno_id) para poder ir a mirarlo después. Hasta ahora no había dónde
-- anotarlo: se perdía en el chat o en un WhatsApp a Joaquín.
--
-- LA TABLA: asistente_feedback — una marca por persona y por turno (marcar de nuevo la
-- reemplaza). `motivo` es uno de cinco: calculo (cuentas o importes), invento (completó con
-- supuestos o datos que no salen de ningún lado), lento, no_entendio y otro. `texto`, opcional.
--
-- QUIÉN ESCRIBE: sólo el servidor (POST /api/comercial/asistente/feedback, con exigirModulo y
-- después de chequear que la conversación sea de quien marca, o que sea admin). Los usuarios
-- leen lo suyo (admin, todo), como el resto de las tablas del asistente. La cuenta por persona
-- y por mes sale en Parámetros → Uso.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Va ANTES del deploy del código que la usa; el código tolera que
-- todavía no exista (el botón da error y la pestaña Uso muestra «—»).

DO $mig$ BEGIN

  CREATE TABLE IF NOT EXISTS asistente_feedback (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversacion_id  UUID NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
    turno_id         UUID NOT NULL,
    usuario_id       UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    motivo           TEXT NOT NULL CHECK (motivo IN ('calculo', 'invento', 'lento', 'no_entendio', 'otro')),
    texto            TEXT CHECK (texto IS NULL OR char_length(texto) <= 2000),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (turno_id, usuario_id)
  );
  CREATE INDEX IF NOT EXISTS idx_asistente_feedback_usuario ON asistente_feedback(usuario_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_asistente_feedback_conv ON asistente_feedback(conversacion_id);

  ALTER TABLE asistente_feedback ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Dueño ve su feedback" ON asistente_feedback;
  CREATE POLICY "Dueño ve su feedback" ON asistente_feedback FOR SELECT TO authenticated
    USING (usuario_id = auth.uid() OR asistente_es_admin());
  -- Sin políticas de escritura: escribe la service role.

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
