-- ========================
-- Posponer una habilitación
--
-- Hay obras —típicamente las que llevan permiso— para las que mandar la documentación
-- apenas entran a la bandeja no sirve: falta mucho, y la nómina de ART se vence antes de
-- que la cuadrilla entre. Posponer las saca de la cola hasta una fecha.
--
-- `pospuesta_hasta` NUNCA SE ALEJA SOLA: la bandeja la adelanta cuando la fecha programada
-- o la primera jornada del tablero quedan a menos de 10 días (ver vueltaDePospuesta), y la
-- borra cuando la obra vuelve. Si Operaciones atrasa la obra, la vuelta no se corre.
--
-- `pospuesta_aviso` es la primera jornada de la que ya se avisó. Sin ella, cada lectura de
-- la bandeja volvería a avisar "Operaciones planificó la obra"; con ella, se avisa una vez
-- por cada fecha planificada nueva.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).
-- ========================

DO $mig$ BEGIN
  ALTER TABLE hab_ots ADD COLUMN IF NOT EXISTS pospuesta_hasta DATE;
  ALTER TABLE hab_ots ADD COLUMN IF NOT EXISTS pospuesta_motivo TEXT;
  ALTER TABLE hab_ots ADD COLUMN IF NOT EXISTS pospuesta_por UUID REFERENCES user_profiles(id);
  ALTER TABLE hab_ots ADD COLUMN IF NOT EXISTS pospuesta_el TIMESTAMPTZ;
  ALTER TABLE hab_ots ADD COLUMN IF NOT EXISTS pospuesta_aviso DATE;

  CREATE INDEX IF NOT EXISTS idx_hab_ots_pospuesta ON hab_ots(pospuesta_hasta) WHERE pospuesta_hasta IS NOT NULL;

  -- Posponer, adelantar la vuelta, volver y reactivar quedan en el historial.
  ALTER TABLE hab_gestiones DROP CONSTRAINT IF EXISTS hab_gestiones_tipo_check;
  ALTER TABLE hab_gestiones ADD CONSTRAINT hab_gestiones_tipo_check CHECK (tipo IN (
    'triage', 'consulta', 'reclamo', 'envio', 'aprobacion',
    'observacion', 'permiso', 'renovacion', 'excepcion', 'posposicion'));

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
