-- ========================================================================
-- Asistente comercial por WhatsApp — mensajes entrantes y un turno por teléfono
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: Gabriel y Jorge le escriben (o le mandan audios) al asistente por
-- WhatsApp, a un número de la empresa. Meta avisa cada mensaje a un webhook, que tiene que
-- contestar enseguida; el asistente tarda de 5 a 60 segundos. Entonces el webhook anota el
-- mensaje y lo procesa después.
--
-- LAS PIEZAS:
--   · whatsapp_entrantes — cada mensaje que llega, UNA vez (Meta reintenta: el id del mensaje,
--     wamid, es la clave). Estado pendiente → procesando → ok / error / ignorado.
--   · comercial_vendedores.whatsapp_ocupado_hasta — "turno" por teléfono. En WhatsApp se
--     escribe cortado ("hola" / "necesito cotizar" / "una bandeja…"): el que toma el turno
--     junta todo lo pendiente en una sola consulta al asistente, y al terminar se fija si
--     llegó algo más. Vence solo por si una función muere a mitad de camino.
--
-- QUIÉN ESCRIBE: sólo el servidor (service role), después de validar la firma de Meta.
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$ BEGIN

  ALTER TABLE comercial_vendedores ADD COLUMN IF NOT EXISTS whatsapp_ocupado_hasta TIMESTAMPTZ;

  CREATE TABLE IF NOT EXISTS whatsapp_entrantes (
    wamid             TEXT PRIMARY KEY,
    -- Como lo manda Meta: sólo dígitos, con código de país (Argentina: 549 + área + número).
    telefono          TEXT NOT NULL,
    usuario_id        UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    -- text · audio · image · document · interactive · location · otro
    tipo              TEXT NOT NULL,
    -- El mensaje tal cual vino en el webhook.
    contenido         JSONB NOT NULL,
    enviado_at        TIMESTAMPTZ,
    recibido_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'procesando', 'ok', 'error', 'ignorado')),
    error             TEXT,
    conversacion_id   UUID REFERENCES asistente_conversaciones(id) ON DELETE SET NULL,
    procesado_at      TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_whatsapp_entrantes_pendientes ON whatsapp_entrantes(telefono, recibido_at) WHERE estado = 'pendiente';

  ALTER TABLE whatsapp_entrantes ENABLE ROW LEVEL SECURITY;
  -- Sin políticas: sólo la service role lee y escribe.

  -- El turno del teléfono. Devuelve el usuario si lo tomó; NULL si está ocupado o si el
  -- número no es de ningún vendedor activo.
  CREATE OR REPLACE FUNCTION public.whatsapp_tomar_turno(p_telefonos text[])
  RETURNS uuid
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE comercial_vendedores
       SET whatsapp_ocupado_hasta = now() + interval '330 seconds', updated_at = now()
     WHERE whatsapp = ANY (p_telefonos)
       AND activo
       AND (whatsapp_ocupado_hasta IS NULL OR whatsapp_ocupado_hasta < now())
    RETURNING usuario_id;
  $fn$;

  CREATE OR REPLACE FUNCTION public.whatsapp_soltar_turno(p_telefonos text[])
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE comercial_vendedores SET whatsapp_ocupado_hasta = NULL, updated_at = now() WHERE whatsapp = ANY (p_telefonos);
  $fn$;

  REVOKE ALL ON FUNCTION public.whatsapp_tomar_turno(text[]) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.whatsapp_soltar_turno(text[]) FROM PUBLIC, anon, authenticated;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
