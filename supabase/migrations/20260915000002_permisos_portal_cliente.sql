-- ========================================================================
-- Permisos vía pública — portal del cliente
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: hoy el cliente manda su legajo por Google Forms y Tamara lo baja,
-- lo revisa y lo carga. El trámite nuevo arranca solo: Odoo avisa cuando se confirma una
-- venta con "Lleva permiso de implantación = Sí" (decidido con JS, 2026-09-15), la app abre
-- el trámite y le manda al cliente un link (/permiso/<token>) donde carga quién es el
-- dueño del lote —con eso sale el pedido de endoso— y después sus documentos.
--
-- UN TRÁMITE POR VENTA: el webhook de Odoo puede llegar varias veces por la misma venta
-- (cada write que toca los campos disparadores). El índice único parcial es lo que impide
-- el duplicado. Parcial porque un trámite abierto desde un expediente viejo puede apuntar a
-- la misma venta que otro (Av. Córdoba 2914 tiene dos expedientes).
--
-- EL TOKEN DEL CLIENTE va en claro por la misma razón que el del productor: el mail y el
-- botón "copiar link" para WhatsApp lo tienen que poder armar. Abre sólo el legajo de
-- ESE trámite.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_tramites
    ADD COLUMN IF NOT EXISTS cliente_nombre      TEXT,
    ADD COLUMN IF NOT EXISTS cliente_email       TEXT,
    ADD COLUMN IF NOT EXISTS token_cliente       TEXT UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    ADD COLUMN IF NOT EXISTS tipo_dueno          TEXT CHECK (tipo_dueno IN ('consorcio', 'empresa', 'persona')),
    ADD COLUMN IF NOT EXISTS es_inquilino        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS titular_cargado_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS link_enviado_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS link_error          TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_tramites_venta_sin_expediente
    ON pvp_tramites(odoo_venta_id) WHERE expediente_id IS NULL AND odoo_venta_id IS NOT NULL;

  ALTER TABLE pvp_documentos DROP CONSTRAINT IF EXISTS pvp_documentos_estado_check;
  ALTER TABLE pvp_documentos ADD CONSTRAINT pvp_documentos_estado_check
    CHECK (estado IN ('falta', 'pedido', 'cargado', 'revisando', 'ok', 'observado'));

  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_tipo_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_tipo_check CHECK (tipo IN (
    'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
    'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot', 'caratula_leida',
    'vinculo_confirmado', 'vinculo_descartado', 'odoo_escrito', 'odoo_conflicto',
    'tramite_abierto', 'documento_pedido', 'documento_subido', 'documento_revisado', 'aviso_productor',
    'link_cliente', 'titular_cargado'
  ));
  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_actor_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_actor_check
    CHECK (actor IN ('robot', 'gcba', 'persona', 'productor', 'ia', 'sistema', 'cliente'));

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
