-- En consorcios el endoso de la póliza lleva también al administrador (la persona) como
-- coasegurado (JS, 2026-09-15). Lo carga el cliente en el primer paso del portal, junto con
-- el consorcio, para que el pedido a Segucom salga enseguida. Sólo obras nuevas: en los
-- trámites anteriores queda vacío y el pedido sale como antes.
DO $mig$ BEGIN
  ALTER TABLE pvp_tramites ADD COLUMN IF NOT EXISTS administrador_nombre TEXT;
  ALTER TABLE pvp_tramites ADD COLUMN IF NOT EXISTS administrador_cuit TEXT;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pvp_tramites_administrador_cuit_check') THEN
    ALTER TABLE pvp_tramites ADD CONSTRAINT pvp_tramites_administrador_cuit_check CHECK (administrador_cuit ~ '^[0-9]{11}$');
  END IF;
END $mig$;
