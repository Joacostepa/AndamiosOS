-- ========================================================================
-- WhatsApp de clientes, paso 6 — la tarjeta de aprobación
-- ========================================================================
--
-- QUÉ AGREGA (docs/sofia/crm-propuesta.md §7 y §13, paso 6). TODO ES ADITIVO: no borra
-- columnas ni filas, y los estados viejos siguen valiendo.
--
--   · cli_aprobaciones.estado suma cuatro estados:
--       ejecutando      — alguien tocó Aprobar y el servidor está guardando en Odoo. Es el
--                         candado de «una sola vez»: el paso pendiente → ejecutando es un UPDATE
--                         condicionado; el segundo que toca ve que ya está;
--       error           — Odoo (o el PDF) falló: NO se le mandó nada al cliente. La tarjeta
--                         ofrece «Reintentar», que saltea lo que ya quedó hecho (pasos);
--       falta_plantilla — aprobada y guardada en Odoo, pero la ventana de 24 h estaba cerrada:
--                         no salió texto libre. Sale cuando exista la plantilla «Tu presupuesto
--                         está listo» (paso 0, Meta) o cuando el cliente vuelva a escribir;
--       descartada      — un texto bloqueado que la persona decidió no mandar.
--   · cli_aprobaciones: correccion_tipo (metros, piezas, precio, texto u otro: los tres primeros
--     cortan la racha de la etapa 2, §9), texto_enviado, borrador_id (el borrador del asistente
--     comercial con que se guarda en Odoo: su id es la marca x_asistente_ref, así un reintento
--     no duplica la orden), odoo_venta_id/nombre, pasos (lo ya hecho), error, turno_tecnico
--     (sólo cuando la decisión consumió el turno rotativo: de acá lee el turno Sofía) y
--     resultado (lo que hizo la decisión, para el auditor).
--   · cli_conversaciones.pareja_tecnico / pareja_asistente — la pareja confirmada (por nombre,
--     como PAREJAS_15_10). tecnico_employee_id (que ya existía) lleva el hr.employee de Odoo.
--   · idx_cli_hilo_persona — para «Revisar charlas»: las charlas donde intervino una persona.
--
-- NO PRENDE NADA: con el interruptor clientes_ia_activa en 0 no hay aprobaciones nuevas.
--
-- QUIÉN LEE Y QUIÉN ESCRIBE: escribe sólo el servidor (service role), como en 20261017000001.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT. Va DESPUÉS de 20261017000001.

DO $mig$ BEGIN

  -- ── cli_aprobaciones: los estados nuevos ─────────────────────────────────
  ALTER TABLE cli_aprobaciones DROP CONSTRAINT IF EXISTS cli_aprobaciones_estado_check;
  ALTER TABLE cli_aprobaciones ADD CONSTRAINT cli_aprobaciones_estado_check CHECK (estado IN (
    'pendiente', 'ejecutando', 'error', 'aprobada', 'corregida', 'falta_plantilla', 'rechazada', 'tomada', 'vencida', 'descartada'
  ));

  -- ── cli_aprobaciones: lo que deja la decisión ────────────────────────────
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS correccion_tipo TEXT;
  ALTER TABLE cli_aprobaciones DROP CONSTRAINT IF EXISTS cli_aprobaciones_correccion_tipo_check;
  ALTER TABLE cli_aprobaciones ADD CONSTRAINT cli_aprobaciones_correccion_tipo_check
    CHECK (correccion_tipo IS NULL OR correccion_tipo IN ('metros', 'piezas', 'precio', 'texto', 'otro'));
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS texto_enviado TEXT;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS borrador_id UUID REFERENCES cotizacion_borradores(id) ON DELETE SET NULL;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS odoo_venta_id INTEGER;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS odoo_venta_nombre TEXT;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS pasos JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS error TEXT;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS turno_tecnico TEXT;
  ALTER TABLE cli_aprobaciones ADD COLUMN IF NOT EXISTS resultado JSONB;

  -- La racha de la etapa 2 y el auditor leen las decididas por fecha.
  CREATE INDEX IF NOT EXISTS idx_cli_aprobaciones_decididas
    ON cli_aprobaciones(decidido_at DESC) WHERE decidido_at IS NOT NULL;
  -- El turno rotativo: la última decisión que lo consumió.
  CREATE INDEX IF NOT EXISTS idx_cli_aprobaciones_turno
    ON cli_aprobaciones(decidido_at DESC) WHERE turno_tecnico IS NOT NULL;

  -- ── cli_conversaciones: la pareja confirmada ─────────────────────────────
  ALTER TABLE cli_conversaciones ADD COLUMN IF NOT EXISTS pareja_tecnico TEXT;
  ALTER TABLE cli_conversaciones ADD COLUMN IF NOT EXISTS pareja_asistente TEXT;

  -- ── «Revisar charlas»: dónde intervino una persona ───────────────────────
  CREATE INDEX IF NOT EXISTS idx_cli_hilo_persona ON cli_hilo(momento DESC) WHERE autor = 'persona';

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
