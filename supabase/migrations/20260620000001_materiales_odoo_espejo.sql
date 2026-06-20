-- Espejo de materiales desde Odoo (product.product, type=consu).
--
-- DECISIÓN: igual que clientes, Odoo es la fuente de verdad de materiales.
-- `catalogo_piezas` se alimenta por sync desde Odoo. Se conserva la PK (id UUID)
-- para no romper FK (computo_items.pieza_id, remito_items.pieza_id, stock.*).
-- Solo se agrega el mapeo hacia Odoo y el timestamp de sync.

ALTER TABLE catalogo_piezas
  ADD COLUMN IF NOT EXISTS odoo_product_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_piezas_odoo_product_id
  ON catalogo_piezas(odoo_product_id)
  WHERE odoo_product_id IS NOT NULL;

COMMENT ON COLUMN catalogo_piezas.odoo_product_id IS 'product.product.id en Odoo (fuente de verdad). NULL = pieza no vinculada.';
COMMENT ON COLUMN catalogo_piezas.odoo_synced_at IS 'Última sincronización de esta pieza desde Odoo.';
