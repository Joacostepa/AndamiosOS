-- Fase 5 — OT adicionales (Change Order) con write-back app→Odoo.
-- La OT adicional la crea Operaciones EN LA APP (se guarda primero acá, nunca se
-- bloquea por Odoo), queda pendiente de aprobación comercial, y se empuja a Odoo en
-- background. Comercial la aprueba EN ODOO → vuelve por webhook.

ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS es_adicional boolean NOT NULL DEFAULT false,
  -- normal (de Odoo) = aprobada; adicional creada en la app arranca en false (gate comercial)
  ADD COLUMN IF NOT EXISTS aprobada_comercial boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_adicional text,
  -- write-back: pendiente | sincronizado | error (las de Odoo nacen sincronizado)
  ADD COLUMN IF NOT EXISTS odoo_sync_estado text NOT NULL DEFAULT 'sincronizado',
  ADD COLUMN IF NOT EXISTS odoo_sync_error text;
