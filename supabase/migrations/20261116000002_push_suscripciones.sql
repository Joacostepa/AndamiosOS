-- ========================================================================
-- Notificaciones push de la app (JS, 16/11): por ahora, de la bandeja de clientes
-- ========================================================================
--
-- Cada dispositivo (celular, compu) en el que alguien tocó «Activar notificaciones» deja acá
-- su suscripción de Web Push (endpoint y claves del navegador). El servidor la usa para
-- mandarle el aviso con web-push (src/lib/push/servidor.ts). Si el servicio de push contesta
-- que ya no existe (404/410), se borra.
--
-- modo: «todo» = cada mensaje del cliente y cada respuesta de Tomás; «necesita» = sólo lo que
-- necesita a una persona (Tomás la pasó, una tarjeta espera el OK, te pasaron una charla, el
-- cliente escribió en una charla tuya).
--
-- Sin políticas: la tabla la leen y escriben sólo las rutas del servidor (service role),
-- detrás de exigirModulo("clientes-whatsapp").

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  modo        TEXT NOT NULL DEFAULT 'todo' CHECK (modo IN ('todo', 'necesita')),
  dispositivo TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_ok_at TIMESTAMPTZ,
  fallas      INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS push_suscripciones_user_idx ON push_suscripciones (user_id);

ALTER TABLE push_suscripciones ENABLE ROW LEVEL SECURITY;

-- Suma una falla (las que no son 404/410: el servicio caído, un timeout). Para ver en la base
-- si un dispositivo dejó de recibir.
CREATE OR REPLACE FUNCTION push_sumar_falla(p_id UUID) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE push_suscripciones SET fallas = fallas + 1 WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION push_sumar_falla(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION push_sumar_falla(UUID) TO service_role;
