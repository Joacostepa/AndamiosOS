-- ========================================================================
-- Permisos vía pública — trámites, documentos y el portal del productor de seguros
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: hasta acá el módulo sólo espejaba TAD. Para presentar un permiso
-- hacen falta documentos de tres orígenes —los del cliente, los que hace ABA (encomienda
-- del CPAU, croquis, informe técnico) y la póliza que endosa el productor— y hoy nadie
-- lleva la cuenta de cuál falta. El primero que se automatiza es el endoso de la póliza,
-- causa recurrente de subsanaciones.
--
-- EL TRÁMITE es la unidad de trabajo, con o sin expediente: uno nuevo todavía no tiene EX
-- (se presenta al final) y una subsanación ya lo tiene. Por eso expediente_id es opcional.
--
-- EL TITULAR DEL LOTE va en el trámite y no se toma del cliente de Odoo: muchas veces el
-- cliente es la constructora. Es el coasegurado de la póliza y lo que la revisión cruza.
--
-- EL PRODUCTOR entra por un link fijo (/endosos/<token>) sin cuenta: ve los endosos
-- pendientes y sube el PDF de cada uno. El token se guarda en claro y sólo lo lee la
-- service role (sin políticas): el mail de aviso lo tiene que poder armar, y lo único que
-- abre es subir pólizas y ver obra, titular y CUIT.
--
-- QUIÉN ESCRIBE: sólo el servidor (service role), detrás del proxy que exige nivel
-- "editar" en el módulo o del token del productor. Los usuarios leen.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  CREATE TABLE IF NOT EXISTS pvp_tramites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expediente_id   UUID UNIQUE REFERENCES pvp_expedientes(id) ON DELETE SET NULL,
    odoo_venta_id   BIGINT,
    odoo_venta_nombre TEXT,
    direccion       TEXT NOT NULL,
    titular_nombre  TEXT,
    titular_cuit    TEXT CHECK (titular_cuit ~ '^[0-9]{11}$'),
    permiso_hasta   DATE,
    estado          TEXT NOT NULL DEFAULT 'abierto',
    creado_por      UUID REFERENCES user_profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS pvp_documentos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tramite_id       UUID NOT NULL REFERENCES pvp_tramites(id) ON DELETE CASCADE,
    clave            TEXT NOT NULL,
    origen           TEXT NOT NULL CHECK (origen IN ('cliente', 'aba', 'productor')),
    estado           TEXT NOT NULL DEFAULT 'falta' CHECK (estado IN ('falta', 'pedido', 'revisando', 'ok', 'observado')),
    archivo_path     TEXT,
    archivo_nombre   TEXT,
    version          INT NOT NULL DEFAULT 0,
    subido_por       TEXT,
    subido_at        TIMESTAMPTZ,
    revision         JSONB,
    revisado_at      TIMESTAMPTZ,
    observacion      TEXT,
    pedido_at        TIMESTAMPTZ,
    aviso_enviado_at TIMESTAMPTZ,
    aviso_error      TEXT,
    recordatorio_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tramite_id, clave)
  );
  CREATE INDEX IF NOT EXISTS idx_pvp_documentos_pendientes ON pvp_documentos(clave, estado);

  CREATE TABLE IF NOT EXISTS pvp_productores (
    id          TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    email       TEXT NOT NULL,
    token       TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO pvp_productores (id, nombre, email)
  VALUES ('segucom', 'Segucom (Gonzalo Costa)', 'gcosta@segucom.com.ar')
  ON CONFLICT (id) DO NOTHING;

  ALTER TABLE pvp_eventos ADD COLUMN IF NOT EXISTS tramite_id UUID REFERENCES pvp_tramites(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_pvp_eventos_tramite ON pvp_eventos(tramite_id, created_at DESC);

  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_tipo_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_tipo_check CHECK (tipo IN (
    'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
    'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot', 'caratula_leida',
    'vinculo_confirmado', 'vinculo_descartado', 'odoo_escrito', 'odoo_conflicto',
    'tramite_abierto', 'documento_pedido', 'documento_subido', 'documento_revisado', 'aviso_productor'
  ));
  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_actor_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_actor_check CHECK (actor IN ('robot', 'gcba', 'persona', 'productor', 'ia', 'sistema'));

  ALTER TABLE pvp_tramites    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pvp_documentos  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pvp_productores ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Autenticados ven tramites" ON pvp_tramites;
  CREATE POLICY "Autenticados ven tramites" ON pvp_tramites FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Autenticados ven documentos" ON pvp_documentos;
  CREATE POLICY "Autenticados ven documentos" ON pvp_documentos FOR SELECT TO authenticated USING (true);

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
