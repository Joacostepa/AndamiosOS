-- ========================================================================
-- WhatsApp de clientes, paso 5 — Sofía, el agente (las tablas)
-- ========================================================================
--
-- QUÉ AGREGA (docs/clientes/crm-propuesta.md §13, paso 5):
--   · cli_api_mensajes — la historia EXACTA que se le manda a la API de Claude, append-only,
--     como asistente_mensajes. `contenido` es JSON y NO JSONB a propósito: jsonb reordena las
--     claves y un tool_use reenviado con otro orden rompe el caché y la firma de los bloques de
--     razonamiento. Lo que escribe una persona del equipo entra en el aviso de sistema del turno
--     (rol system), nunca como mensaje del cliente. Los presupuestos entran como «se envió el
--     presupuesto #N (aprobado)», sin montos. `costo_usd` de cada respuesta, para los topes.
--     `enviado` (sólo en la respuesta final): si le llegó al cliente; `nota`, por qué no.
--   · cli_aprobaciones — lo que espera el botón de una persona: `precio` (bandeja fácil y
--     alquiler simple), `tecnico` (asignación), `traspaso`, y `texto_bloqueado` (lo que el filtro
--     de salida no dejó salir). El monto que propuso el motor queda acá y NUNCA vuelve al modelo.
--     `numero` es el «#N» que Sofía le puede decir al cliente. Una sola pendiente por charla,
--     tipo y carril (las herramientas la actualizan si se vuelven a llamar). La tarjeta que la
--     aprueba es el paso 6: la decisión se toma una sola vez (estado pendiente → otro).
--   · cli_conversaciones.ia_leido_hasta — hasta dónde del hilo vio Sofía (created_at): lo que
--     llegó después es lo nuevo del turno. Así, al devolverle una charla, ve lo que pasó.
--   · cli_conversaciones.ia_saludo_at — cuándo mandó el saludo (una vez por charla; al
--     reabrirse una cerrada, vuelve a null).
--   · cli_tomar_turno / cli_soltar_turno — el candado del turno sobre `ocupado_hasta` (que ya
--     creó 20261016000001): una respuesta a la vez por charla; vence a los 330 s (una función de
--     Vercel no vive más de 300 s).
--   · cli_gasto_hoy — el gasto de Claude de hoy (Buenos Aires), de un teléfono y de todas las
--     charlas, para los topes de §10. cli_sumar_costo, el acumulado de la charla.
--
-- NO PRENDE NADA: el interruptor es el parámetro clientes_ia_activa (migración siguiente,
-- 20261017000002), en 0. Con esta migración aplicada y el interruptor en 0, todo sigue como la
-- etapa 0. El código nuevo tampoco toca estas tablas con el interruptor en 0, así que se puede
-- subir el código antes o después de aplicarla.
--
-- QUIÉN LEE Y QUIÉN ESCRIBE: escribe sólo el servidor (service role). Leen con la sesión los que
-- tienen el módulo clientes-whatsapp (clientes_whatsapp_puede_ver(), de 20261016000001), para el
-- auditor y la tarjeta del paso 6.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT.

DO $mig$ BEGIN

  -- ── cli_conversaciones: el cursor y el saludo de Sofía ───────────────────
  ALTER TABLE cli_conversaciones ADD COLUMN IF NOT EXISTS ia_leido_hasta TIMESTAMPTZ;
  ALTER TABLE cli_conversaciones ADD COLUMN IF NOT EXISTS ia_saludo_at TIMESTAMPTZ;

  -- ── cli_api_mensajes ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cli_api_mensajes (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversacion_id   UUID NOT NULL REFERENCES cli_conversaciones(id) ON DELETE CASCADE,
    seq               INT NOT NULL,
    rol               TEXT NOT NULL CHECK (rol IN ('user', 'assistant', 'system')),
    -- cliente: lo que escribió el cliente · resultados: tool_results · contexto: el aviso de
    -- sistema del turno (hora, ficha, lo que hizo el equipo) · asistente: respuesta del modelo.
    tipo              TEXT NOT NULL CHECK (tipo IN ('cliente', 'resultados', 'contexto', 'asistente')),
    contenido         JSON NOT NULL,
    texto             TEXT,
    turno_id          UUID,
    uso               JSON,
    modelo_servido    TEXT,
    costo_usd         NUMERIC(10, 5) NOT NULL DEFAULT 0,
    interrumpido      BOOLEAN NOT NULL DEFAULT false,
    enviado           BOOLEAN,
    nota              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversacion_id, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_cli_api_mensajes_fecha ON cli_api_mensajes(created_at) WHERE costo_usd > 0;

  ALTER TABLE cli_api_mensajes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Clientes WhatsApp: ver historia de la IA" ON cli_api_mensajes;
  CREATE POLICY "Clientes WhatsApp: ver historia de la IA" ON cli_api_mensajes FOR SELECT TO authenticated
    USING (clientes_whatsapp_puede_ver());

  -- ── cli_aprobaciones ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cli_aprobaciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- El «#N» que puede ver el cliente («cotización #1042»).
    numero              BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) UNIQUE,
    conversacion_id     UUID NOT NULL REFERENCES cli_conversaciones(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('precio', 'tecnico', 'traspaso', 'texto_bloqueado')),
    -- facil: bandeja fácil · simple: alquiler simple (precio de Tamara) · tecnico: asignación.
    carril              TEXT CHECK (carril IN ('facil', 'simple', 'tecnico')),
    estado              TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'aprobada', 'corregida', 'rechazada', 'tomada', 'vencida')),
    resumen             TEXT,
    -- Lo que propuso el motor (neto, sin IVA) y lo que salió de verdad (paso 6).
    monto_propuesto     NUMERIC(16, 2),
    monto_enviado       NUMERIC(16, 2),
    -- El texto exacto: el bloqueado, o el que va a salir al aprobar.
    texto               TEXT,
    -- texto_bloqueado: «texto bloqueado: monto en letras».
    motivo              TEXT,
    -- El borrador del motor, «Por qué es fácil», la pareja propuesta, la ficha, los hallazgos.
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    decidido_por        UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    decidido_at         TIMESTAMPTZ,
    motivo_correccion   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_cli_aprobaciones_pendiente
    ON cli_aprobaciones(conversacion_id, tipo, carril) WHERE estado = 'pendiente' AND tipo IN ('precio', 'tecnico');
  CREATE INDEX IF NOT EXISTS idx_cli_aprobaciones_charla ON cli_aprobaciones(conversacion_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_cli_aprobaciones_pendientes ON cli_aprobaciones(created_at) WHERE estado = 'pendiente';

  ALTER TABLE cli_aprobaciones ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Clientes WhatsApp: ver aprobaciones" ON cli_aprobaciones;
  CREATE POLICY "Clientes WhatsApp: ver aprobaciones" ON cli_aprobaciones FOR SELECT TO authenticated
    USING (clientes_whatsapp_puede_ver());

  -- ── El candado del turno ─────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.cli_tomar_turno(p_conversacion uuid)
  RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE cli_conversaciones
       SET ocupado_hasta = now() + interval '330 seconds'
     WHERE id = p_conversacion
       AND (ocupado_hasta IS NULL OR ocupado_hasta < now())
    RETURNING true;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cli_soltar_turno(p_conversacion uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE cli_conversaciones SET ocupado_hasta = NULL WHERE id = p_conversacion;
  $fn$;

  -- ── El gasto ─────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.cli_gasto_hoy(p_telefono text)
  RETURNS TABLE (gasto_telefono numeric, gasto_total numeric)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT COALESCE(SUM(m.costo_usd) FILTER (WHERE c.telefono = p_telefono), 0),
           COALESCE(SUM(m.costo_usd), 0)
      FROM cli_api_mensajes m
      JOIN cli_conversaciones c ON c.id = m.conversacion_id
     WHERE m.costo_usd > 0
       AND m.created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires');
  $fn$;

  CREATE OR REPLACE FUNCTION public.cli_sumar_costo(p_conversacion uuid, p_usd numeric)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE cli_conversaciones SET costo_usd = costo_usd + p_usd WHERE id = p_conversacion;
  $fn$;

  REVOKE ALL ON FUNCTION public.cli_tomar_turno(uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.cli_soltar_turno(uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.cli_gasto_hoy(text) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.cli_sumar_costo(uuid, numeric) FROM PUBLIC, anon, authenticated;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
