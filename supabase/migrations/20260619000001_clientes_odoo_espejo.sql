-- Espejo de clientes desde Odoo (res.partner).
--
-- DECISIÓN (arquitectura): Odoo es la fuente de verdad comercial. La tabla `clientes`
-- pasa a ser un espejo read-only alimentado por sync desde Odoo. Se conserva la PK
-- (id UUID) para NO romper los FK existentes (obras.cliente_id, oportunidades.cliente_id, etc.).
-- Solo se agrega el mapeo de identidad hacia Odoo y el timestamp de sincronización.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS odoo_partner_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

-- Un partner de Odoo mapea a lo sumo a un cliente local (índice parcial: ignora NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_odoo_partner_id
  ON clientes(odoo_partner_id)
  WHERE odoo_partner_id IS NOT NULL;

COMMENT ON COLUMN clientes.odoo_partner_id IS 'res.partner.id en Odoo (fuente de verdad). NULL = cliente todavía no vinculado.';
COMMENT ON COLUMN clientes.odoo_synced_at IS 'Última sincronización de este cliente desde Odoo.';
