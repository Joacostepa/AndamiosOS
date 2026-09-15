-- ========================================================================
-- Permisos vía pública — modo prueba
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: JS quiere ver el circuito entero (mail al cliente, portal, pedido a
-- Segucom, página del productor, revisión de la póliza) antes de usarlo con un cliente. Con
-- una venta real eso le escribe al cliente y le pide un endoso de verdad a Gonzalo.
--
-- UN TRÁMITE DE PRUEBA manda todo a la casilla de la app (js@): el link "del cliente" y el
-- pedido de endoso, que sale a nombre de un productor de prueba con su propio link. La
-- página real de Segucom no muestra pruebas y la de prueba sólo muestra pruebas. No crea
-- alertas (irían a Slack). Se borra desde la ficha.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_tramites ADD COLUMN IF NOT EXISTS es_prueba BOOLEAN NOT NULL DEFAULT false;

  INSERT INTO pvp_productores (id, nombre, email)
  VALUES ('prueba', 'Productor de prueba (llega a js@)', 'js@andamiosbuenosaires.com.ar')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
