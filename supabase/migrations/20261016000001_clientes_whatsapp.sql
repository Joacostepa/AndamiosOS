-- ========================================================================
-- WhatsApp de clientes, etapa 0 — la bandeja compartida (sin IA)
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE (docs/sofia/crm-propuesta.md §7, §12 y §13, pasos 2 y 3): ABA
-- suma un número de WhatsApp para clientes, conectado sólo a la Cloud API de Meta. No se usa
-- desde ningún celular: la única forma de contestarlo es la bandeja de AndamiosOS
-- (Comercial → WhatsApp de clientes, /comercial/clientes). En la etapa 0 no hay IA: el número
-- funciona como un WhatsApp compartido, y se mide la línea de base y la adopción.
--
-- LAS PIEZAS:
--   · cli_conversaciones — una charla por teléfono y número de ABA. Una sola ABIERTA por
--     teléfono (índice único parcial); si el cliente vuelve a escribir a una cerrada, se
--     reabre la misma. Estado: bot · espera_ok · humano · derivada · cerrada (§7). En la etapa
--     0 no hay IA: lo nuevo entra como «derivada» (sin tomar) y pasa a «humano» al tomarla.
--     Los campos de la IA y de Odoo (carril, ficha, técnico, partner, lead, pedido, costo,
--     consentimiento) quedan creados y en null: los usa la etapa 1.
--   · cli_hilo — lo que se ve en WhatsApp: cada mensaje que entra o sale, y los eventos de la
--     charla (tomó, cerró). Guarda el wamid para cruzar los avisos de entrega de Meta
--     (statuses), el adjunto ya bajado a Storage, la transcripción del audio y el error de Meta
--     (por ejemplo el 131047: pasaron más de 24 h desde el último mensaje del cliente).
--   · whatsapp_entrantes — el registro crudo de lo que llega (una vez por wamid: Meta
--     reintenta). Suma phone_number_id (a qué número de ABA llegó) y cli_conversacion_id.
--   · cli_anotar_entrante() — mueve los punteros de la charla en una sola sentencia (último
--     mensaje, ventana de 24 h, sin leer), para que dos mensajes simultáneos no se pisen.
--
-- Lo que NO está todavía (§13, para la etapa 1): cli_aprobaciones, cli_api_mensajes,
-- cli_envios_programados, pedidos_presupuesto y telegram_chat_id. Suman poco sin la IA.
--
-- QUIÉN LEE Y QUIÉN ESCRIBE:
--   · escribe sólo el servidor (service role): el webhook, después de validar la firma de
--     Meta, y las rutas /api/comercial/clientes, después de exigir el módulo;
--   · leen con la sesión quienes tengan el módulo `clientes-whatsapp` (ver o editar) o sean
--     admin (clientes_whatsapp_puede_ver()). Hoy la pantalla lee por el servidor; la política
--     queda para cuando haya actualización en vivo con Supabase Realtime.
--   · whatsapp_entrantes: lo de clientes (cli_conversacion_id no nulo) con el mismo permiso;
--     lo del asistente de vendedores sigue sin políticas (sólo service role).
--
-- ORDEN: aplicar ANTES del deploy del código que la usa. El código nuevo escribe
-- whatsapp_entrantes.phone_number_id en cada mensaje (también los de vendedores): sin la
-- columna, el webhook daría error y Meta reintentaría. Es aditiva: el código viejo sigue
-- andando con la migración aplicada.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT.

DO $mig$ BEGIN

  -- ── Permiso del módulo ────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.clientes_whatsapp_puede_ver()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT COALESCE((
      SELECT p.activo AND (
        p.rol::text = 'admin'
        OR p.permisos->>'clientes-whatsapp' IN ('ver', 'editar')
      )
      FROM public.user_profiles p WHERE p.id = auth.uid()
    ), false);
  $fn$;
  REVOKE ALL ON FUNCTION public.clientes_whatsapp_puede_ver() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.clientes_whatsapp_puede_ver() TO authenticated;

  -- ── cli_conversaciones ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cli_conversaciones (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Como lo manda Meta: sólo dígitos, con código de país (549 + área + número).
    telefono                    TEXT NOT NULL,
    -- El número de ABA por el que llegó (el id de Meta, no el número).
    phone_number_id             TEXT NOT NULL,
    -- El nombre que el cliente tiene en su perfil de WhatsApp (puede cambiar).
    nombre_perfil               TEXT,
    estado                      TEXT NOT NULL DEFAULT 'derivada'
                                CHECK (estado IN ('bot', 'espera_ok', 'humano', 'derivada', 'cerrada')),
    -- Por qué está derivada (la IA lo elige de una lista cerrada, §6). En la etapa 0, null.
    motivo                      TEXT,
    -- Quién la tiene (estado humano) o la asistente de la pareja.
    asistente_id                UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    tomada_at                   TIMESTAMPTZ,
    -- Etapa 1 (§8): carril de seguimiento y vínculos con Odoo. Quedan en null por ahora.
    carril                      TEXT CHECK (carril IN ('rapido', 'a_medida')),
    tecnico_employee_id         INTEGER,
    partner_id                  INTEGER,
    lead_id                     INTEGER,
    -- A pedidos_presupuesto (paso 2b): la FK se agrega cuando exista esa tabla.
    pedido_id                   UUID,
    -- El borrador de la charla que arma la IA (etapa 1).
    ficha                       JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- La ventana de 24 h de Meta se cuenta desde el último mensaje DEL CLIENTE.
    ultimo_entrante_at          TIMESTAMPTZ,
    -- Para ordenar la bandeja y mostrar la última línea.
    ultimo_mensaje_at           TIMESTAMPTZ,
    ultimo_resumen              TEXT,
    -- Mensajes del cliente que nadie abrió todavía (se pone en 0 al abrir la charla).
    sin_leer                    INTEGER NOT NULL DEFAULT 0,
    -- Candado del turno de la IA (como whatsapp_tomar_turno). En la etapa 0 no se usa.
    ocupado_hasta               TIMESTAMPTZ,
    -- El [Sí] a «¿Te podemos escribir por acá?» (§8). null = no se preguntó.
    consentimiento_seguimiento  BOOLEAN,
    -- Escribió BAJA: no se le mandan plantillas de seguimiento.
    opt_out                     BOOLEAN NOT NULL DEFAULT false,
    -- De dónde vino (cartel, web, Google…: el texto precargado del link wa.me, §8).
    origen                      TEXT,
    -- Gasto de la IA en la charla (etapa 1).
    costo_usd                   NUMERIC(10, 4) NOT NULL DEFAULT 0,
    cerrada_at                  TIMESTAMPTZ,
    cerrada_por                 UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Una sola charla abierta por teléfono y número de ABA.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_cli_conversaciones_abierta
    ON cli_conversaciones(telefono, phone_number_id) WHERE estado <> 'cerrada';
  CREATE INDEX IF NOT EXISTS idx_cli_conversaciones_telefono ON cli_conversaciones(telefono);
  CREATE INDEX IF NOT EXISTS idx_cli_conversaciones_bandeja ON cli_conversaciones(estado, ultimo_mensaje_at DESC);

  ALTER TABLE cli_conversaciones ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Clientes WhatsApp: ver charlas" ON cli_conversaciones;
  CREATE POLICY "Clientes WhatsApp: ver charlas" ON cli_conversaciones FOR SELECT TO authenticated
    USING (clientes_whatsapp_puede_ver());

  -- ── cli_hilo ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cli_hilo (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id   UUID NOT NULL REFERENCES cli_conversaciones(id) ON DELETE CASCADE,
    -- entrante (del cliente) · saliente (de ABA) · evento (tomó, cerró: no sale a WhatsApp)
    direccion         TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente', 'evento')),
    -- cliente · persona (alguien del equipo, autor_id) · sistema (texto fijo del servidor)
    -- · ia · plantilla (de Meta)
    autor             TEXT NOT NULL CHECK (autor IN ('cliente', 'persona', 'sistema', 'ia', 'plantilla')),
    autor_id          UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    -- El id de Meta. Null mientras sale (o si Meta no lo aceptó) y en los eventos.
    wamid             TEXT UNIQUE,
    -- text · audio · image · document · video · sticker · location · interactive · button ·
    -- reaction · evento · otro
    tipo              TEXT NOT NULL,
    texto             TEXT,
    -- { path, mime, nombre, bytes } ya en Storage (bucket comercial, clientes/<charla>/…);
    -- mientras se baja, { media_id, mime, nombre, pendiente: true }; si falló, { error }.
    -- La ubicación compartida: { lat, lng, nombre, direccion }.
    adjunto           JSONB,
    -- El audio pasado a texto (ElevenLabs Scribe), como ayuda: el audio es lo que vale.
    transcripcion     TEXT,
    -- recibido (entrante) · enviando · enviado · entregado · leido · error
    estado            TEXT NOT NULL DEFAULT 'recibido'
                      CHECK (estado IN ('recibido', 'enviando', 'enviado', 'entregado', 'leido', 'error')),
    estado_at         TIMESTAMPTZ,
    -- El error de Meta (statuses[].errors[0] o la respuesta del envío). 131047 = fuera de 24 h.
    error_codigo      INTEGER,
    error_detalle     TEXT,
    -- El mensaje al que responde (context.id de Meta).
    responde_a        TEXT,
    -- Cuándo se escribió: la hora de Meta para lo que entra, la del envío para lo que sale.
    momento           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_cli_hilo_conversacion ON cli_hilo(conversacion_id, momento);
  CREATE INDEX IF NOT EXISTS idx_cli_hilo_adjunto_pendiente ON cli_hilo(created_at)
    WHERE (adjunto->>'pendiente')::boolean IS TRUE;

  ALTER TABLE cli_hilo ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Clientes WhatsApp: ver hilo" ON cli_hilo;
  CREATE POLICY "Clientes WhatsApp: ver hilo" ON cli_hilo FOR SELECT TO authenticated
    USING (clientes_whatsapp_puede_ver());

  -- ── whatsapp_entrantes: a qué número llegó y a qué charla fue ─────────────
  ALTER TABLE whatsapp_entrantes ADD COLUMN IF NOT EXISTS phone_number_id TEXT;
  ALTER TABLE whatsapp_entrantes ADD COLUMN IF NOT EXISTS cli_conversacion_id UUID REFERENCES cli_conversaciones(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_whatsapp_entrantes_cli ON whatsapp_entrantes(cli_conversacion_id) WHERE cli_conversacion_id IS NOT NULL;

  DROP POLICY IF EXISTS "Clientes WhatsApp: ver entrantes" ON whatsapp_entrantes;
  CREATE POLICY "Clientes WhatsApp: ver entrantes" ON whatsapp_entrantes FOR SELECT TO authenticated
    USING (cli_conversacion_id IS NOT NULL AND clientes_whatsapp_puede_ver());

  -- ── Un mensaje del cliente: los punteros de la charla, en una sola sentencia ──
  -- Meta puede avisar desordenado: el último mensaje y la ventana sólo avanzan.
  CREATE OR REPLACE FUNCTION public.cli_anotar_entrante(p_conversacion uuid, p_momento timestamptz, p_resumen text)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE cli_conversaciones
       SET ultimo_entrante_at = GREATEST(COALESCE(ultimo_entrante_at, p_momento), p_momento),
           ultimo_resumen     = CASE WHEN ultimo_mensaje_at IS NULL OR p_momento >= ultimo_mensaje_at THEN p_resumen ELSE ultimo_resumen END,
           ultimo_mensaje_at  = GREATEST(COALESCE(ultimo_mensaje_at, p_momento), p_momento),
           sin_leer           = sin_leer + 1,
           updated_at         = now()
     WHERE id = p_conversacion;
  $fn$;
  REVOKE ALL ON FUNCTION public.cli_anotar_entrante(uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
