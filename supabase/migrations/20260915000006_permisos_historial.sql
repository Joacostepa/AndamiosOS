-- ========================================================================
-- Permisos vía pública — historial de expedientes finalizados
-- ========================================================================
--
-- QUÉ PASÓ: el 15/09 el robot empezó a leer la solapa Finalizados de TAD entera (antes veía
-- sólo la primera página de 5) y dio de alta 591 expedientes finalizados de 2019 a 2026, más
-- 92 PDF de permisos, antes de que se lo frenara. No abrió ningún detalle ni tocó Odoo.
--
-- DECISIÓN DE JS (2026-09-15): quedan guardados como HISTORIAL en la app.
--
-- UN EXPEDIENTE HISTÓRICO es sólo la fila de la lista de TAD: el robot NO lo relee en cada
-- vuelta, no baja su permiso, no abre su detalle (abrirlo agrega una Constancia de Consulta en
-- el expediente del Gobierno) y no lo busca en Odoo. La bandeja lo muestra aparte.
--
-- Se marcan los que dio de alta la vuelta de las 10:14 (hora de Buenos Aires): finalizados,
-- sin carátula leída y sin venta. Los 21 que se seguían desde el 14/09 no se tocan.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_expedientes ADD COLUMN IF NOT EXISTS historico BOOLEAN NOT NULL DEFAULT false;

  UPDATE pvp_expedientes SET historico = true
   WHERE solapa = 'finalizado'
     AND visto_primero_at BETWEEN '2026-09-15 13:14:00+00' AND '2026-09-15 13:21:00+00'
     AND caratula_leida_at IS NULL
     AND odoo_venta_id IS NULL;

  CREATE INDEX IF NOT EXISTS idx_pvp_expedientes_historico ON pvp_expedientes(historico);

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
