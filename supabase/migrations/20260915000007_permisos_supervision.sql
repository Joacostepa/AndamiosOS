-- ========================================================================
-- Permisos vía pública — modo supervisado, vendedor y gestor de cada trámite
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE (JS, 2026-09-15): durante las primeras semanas con clientes reales
-- nada sale solo hacia afuera ni avanza sin una persona:
--   - "Iniciar trámite" le manda el link al VENDEDOR de la orden, no al cliente; el vendedor
--     se lo pasa;
--   - el pedido de endoso a Segucom, la encomienda del CPAU y la presentación en TAD se
--     disparan desde la app con un botón, y la app avisa cuando están para hacerse.
-- Después se apagan desde la bandeja: son interruptores, no código.
--
-- COPIAS: todos los mails van con copia al vendedor de la orden y a quien gestiona el trámite
-- (quien apretó "Iniciar trámite", pvp_tramites.creado_por). Las respuestas van SIEMPRE al
-- vendedor. El vendedor se guarda al abrir el trámite (sale.order.user_id → res.users).
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  CREATE TABLE IF NOT EXISTS pvp_config (
    id          TEXT PRIMARY KEY,
    valores     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES user_profiles(id)
  );
  INSERT INTO pvp_config (id, valores) VALUES ('supervision', jsonb_build_object(
    'link_al_cliente', false,
    'endoso_automatico', false,
    'encomienda_automatica', false,
    'presentacion_automatica', false
  )) ON CONFLICT (id) DO NOTHING;

  ALTER TABLE pvp_config ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Autenticados ven la configuracion de permisos" ON pvp_config;
  CREATE POLICY "Autenticados ven la configuracion de permisos" ON pvp_config FOR SELECT TO authenticated USING (true);

  ALTER TABLE pvp_tramites
    ADD COLUMN IF NOT EXISTS vendedor_nombre TEXT,
    ADD COLUMN IF NOT EXISTS vendedor_email  TEXT,
    ADD COLUMN IF NOT EXISTS link_enviado_a  TEXT;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
