-- La presentación en TAD se reintenta sola cuando TAD no responde (servicio caído, página que
-- no carga): la tarea vuelve a 'pendiente' con la hora desde la que el robot la puede tomar.
-- NULL = se toma ya (todas las demás tareas).
DO $mig$ BEGIN
  ALTER TABLE pvp_tareas ADD COLUMN IF NOT EXISTS reintentar_desde TIMESTAMPTZ;
END $mig$;
