-- Espejo operativo Obra + OT (Odoo→app). Mismo patrón que clientes/materiales:
-- columna odoo_*_id como clave de mapeo + índice único parcial para upsert
-- idempotente desde los webhooks / sync. odoo_synced_at = última sincronización.

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS odoo_obra_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_obras_odoo_obra_id
  ON obras(odoo_obra_id) WHERE odoo_obra_id IS NOT NULL;

ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS odoo_ot_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_trabajo_odoo_ot_id
  ON ordenes_trabajo(odoo_ot_id) WHERE odoo_ot_id IS NOT NULL;
