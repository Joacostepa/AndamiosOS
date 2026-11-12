-- ========================================================================
-- WhatsApp de clientes — el carril «alquiler» en cli_aprobaciones (12/11)
-- ========================================================================
--
-- docs/sofia/alquiler-simple-propuesta.md §10: el alquiler simple que cotiza Tomás deja su
-- cotización para la tarjeta con carril 'alquiler' (el 'simple' viejo sigue para los pedidos
-- que arma una persona). La tabla tiene un CHECK sobre carril desde 20261017000001
-- ('facil', 'simple', 'tecnico'): sin esta migración, el INSERT de la herramienta falla.
--
-- QUÉ HACE: saca el CHECK de carril (sea cual sea su nombre: era un CHECK en línea, que Postgres
-- nombra cli_aprobaciones_carril_check) y lo vuelve a poner con 'alquiler'. TODO ES ADITIVO:
-- no toca filas y los valores viejos siguen valiendo.
--
-- La racha de la etapa 2 (rachaActual) sigue contando sólo 'facil'; el alquiler tiene la suya
-- (aprobacion-alquiler.ts). El índice único de pendientes (conversacion_id, tipo, carril) ya
-- separa 'simple' de 'alquiler'.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT. Va ANTES de subir el código de la
-- herramienta cotizar_alquiler_simple.

DO $mig$
DECLARE
  r RECORD;
BEGIN

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'cli_aprobaciones'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%carril%'
  LOOP
    EXECUTE format('ALTER TABLE cli_aprobaciones DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE cli_aprobaciones ADD CONSTRAINT cli_aprobaciones_carril_check
    CHECK (carril IS NULL OR carril IN ('facil', 'simple', 'tecnico', 'alquiler'));

END $mig$;
