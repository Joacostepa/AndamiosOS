-- ============================================================
-- AndamiosOS — Notificaciones
--
-- La tabla `alertas` y la campanita del header existían desde el schema inicial, pero
-- NADIE INSERTABA NUNCA una fila: medido contra producción el 2026-09-01, `alertas`
-- tenía 0 registros. El badge siempre dijo cero. Esta migración no construye la UI —ya
-- estaba— sino las tres cosas que faltaban para que el aviso llegue y sirva.
--
-- 1. `clave` — deduplicación. El aviso de "OT nueva" nace de un barrido que corre todos
--    los días contra Odoo; sin una clave única, cada corrida reinsertaría lo mismo y la
--    campanita marcaría 30 en una semana por una sola OT.
--
-- 2. `alertas_lecturas` — la lectura es de cada persona, no de la fila. `leida` era una
--    columna booleana en `alertas`: con avisos dirigidos a un rol entero, lo que marcaba
--    uno desaparecía para todos. Se puede borrar sin cuidado porque no hay datos.
--
-- 3. `enlace` — el aviso tiene que llevarte al lugar. `entidad_id` es UUID y no sirve
--    para esto: las OTs viven en Odoo y su id es un BIGINT, así que no entra en esa
--    columna. Guardamos la ruta ya armada.
-- ============================================================

BEGIN;

-- ========================
-- alertas
-- ========================

ALTER TABLE alertas
  -- Identidad de negocio del aviso: 'ot_nueva:8412', 'habilitada:8412',
  -- 'urgente:8412'. Quien crea la alerta la arma; el índice único hace que insertar dos
  -- veces sea inofensivo, que es lo que permite que el barrido sea un simple INSERT ...
  -- ON CONFLICT DO NOTHING en vez de un diff contra lo ya avisado.
  ADD COLUMN IF NOT EXISTS clave  TEXT,
  -- Ruta interna de la app, ya resuelta. Ver el comentario de arriba sobre entidad_id.
  ADD COLUMN IF NOT EXISTS enlace TEXT;

-- SIN `WHERE clave IS NOT NULL`, aunque el índice parcial sería el reflejo natural acá.
-- `ON CONFLICT (clave)` NO INFIERE UN ÍNDICE PARCIAL: Postgres exige que la inferencia
-- repita el predicado del índice, y PostgREST manda sólo la columna. Con el índice
-- parcial, cada upsert falla con "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" — o sea que ningún aviso se crearía nunca, en silencio.
--
-- El índice completo no cuesta nada: en Postgres los NULL son distintos entre sí, así que
-- las alertas sin clave siguen pudiendo ser muchas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_clave ON alertas(clave);

-- El listado siempre pide las últimas N por fecha.
CREATE INDEX IF NOT EXISTS idx_alertas_created ON alertas(created_at DESC);

-- `leida` queda EN DESUSO, no se borra todavía. Borrarla acá rompería el header de la
-- app desplegada —`useAlertasCount` filtra por `leida = false`— entre que corre la
-- migración y sale el deploy. Se va en una migración posterior, con el código nuevo ya
-- arriba. No hay estado que perder: la tabla tiene 0 filas.
COMMENT ON COLUMN alertas.leida IS
  'EN DESUSO — la reemplaza alertas_lecturas. Se borra en una migración posterior.';

-- ========================
-- alertas_lecturas — quién leyó qué
--
-- Sin fila = sin leer. No hay columna `leida`: la existencia del registro ES el estado,
-- y así no hay dos maneras de decir lo mismo.
-- ========================
CREATE TABLE IF NOT EXISTS alertas_lecturas (
  alerta_id   UUID NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  leida_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alerta_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_alertas_lecturas_usuario ON alertas_lecturas(usuario_id);

ALTER TABLE alertas_lecturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada uno ve sus lecturas" ON alertas_lecturas;
CREATE POLICY "Cada uno ve sus lecturas"
  ON alertas_lecturas FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "Cada uno marca sus lecturas" ON alertas_lecturas;
CREATE POLICY "Cada uno marca sus lecturas"
  ON alertas_lecturas FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

-- Desmarcar es volver a "sin leer". Se permite: marcar leído de más es un accidente
-- común y no poder deshacerlo obliga a fingir que no pasó.
DROP POLICY IF EXISTS "Cada uno desmarca sus lecturas" ON alertas_lecturas;
CREATE POLICY "Cada uno desmarca sus lecturas"
  ON alertas_lecturas FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());

-- ========================
-- RLS de alertas — arreglo de la política de lectura
--
-- La original decía:
--   destinatario_id = auth.uid() OR destinatario_rol = get_user_role() OR destinatario_id IS NULL
--
-- La tercera condición anulaba a la segunda: un aviso con destinatario_rol='operativo'
-- tiene destinatario_id NULL, así que `destinatario_id IS NULL` daba TRUE y lo veía
-- todo el mundo. Dirigir por rol no hacía nada. Nunca se notó porque no había filas.
-- ========================

DROP POLICY IF EXISTS "Usuarios ven sus alertas o las de su rol" ON alertas;
CREATE POLICY "Usuarios ven sus alertas o las de su rol"
  ON alertas FOR SELECT TO authenticated
  USING (
    -- Dirigida a esta persona.
    destinatario_id = auth.uid()
    -- Dirigida a su rol.
    OR (destinatario_rol IS NOT NULL AND destinatario_rol = get_user_role())
    -- Sin destinatario = para todos.
    OR (destinatario_id IS NULL AND destinatario_rol IS NULL)
    -- Admin ve todo: es el único perfil con navegación completa, y si algo se rompe es
    -- quien tiene que poder verlo.
    OR get_user_role() = 'admin'
  );

-- La política de UPDATE existe sólo para marcar `leida`. Se va junto con esa columna,
-- en la misma migración posterior: el contenido de una alerta no se edita, se crea y se
-- lee.

COMMENT ON COLUMN alertas.clave IS
  'Identidad de negocio del aviso (ej. ot_nueva:8412). Única: hace idempotente al barrido.';
COMMENT ON COLUMN alertas.enlace IS
  'Ruta interna a donde lleva el aviso. No se usa entidad_id porque las OTs son BIGINT de Odoo.';

COMMIT;
