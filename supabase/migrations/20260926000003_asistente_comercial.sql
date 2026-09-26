-- ========================================================================
-- Asistente comercial — conversaciones, presupuestos en construcción y acciones
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: Gabriel y Jorge presupuestan por teléfono y no usan Odoo. El
-- asistente (Comercial → Asistente) es un chat —escrito, dictado o por voz— con Claude, que
-- arma el presupuesto con el motor de precios, lo guarda en Odoo y genera el PDF. Esto es
-- lo que tiene que quedar guardado para que eso funcione y se pueda auditar.
--
-- LAS TABLAS:
--   · asistente_conversaciones — una por charla. Congela el prompt del sistema al crearse
--     (system_snapshot): así un cambio de tarifa a mitad de una charla no reescribe el
--     pasado, y el caché de la API sigue sirviendo. Los cambios le llegan al modelo como
--     avisos dentro de la conversación.
--   · asistente_mensajes — la historia EXACTA que se le manda a la API, append-only.
--     `contenido` es JSON y NO JSONB a propósito: jsonb reordena las claves, y un tool_use
--     reenviado con las claves en otro orden rompe el caché y la firma de los bloques de
--     razonamiento. Se guarda tal cual vino.
--   · cotizacion_borradores — el presupuesto en construcción, como objeto (no como texto de
--     chat). Lo completa el modelo con herramientas y lo muestra la pantalla en vivo.
--   · asistente_acciones — todo lo que escribe afuera (Odoo, mail, avisos). NADA se ejecuta
--     sin confirmación: primero se propone (con un resumen para leer en voz alta) y después
--     se confirma con el botón o con un "sí" que valida el servidor. `pasos` es el registro
--     de lo que ya se hizo, para que un reintento no duplique nada en Odoo.
--   · cotizacion_pdfs — cada PDF generado (vista previa o final), versionado.
--   · comercial_vendedores — quién es quién en Odoo: el técnico (hr.employee) y el vendedor
--     (res.users) de las órdenes de cada persona, y su WhatsApp. En Odoo el técnico es quien
--     cotiza y el vendedor suele ser su asistente comercial (Gabriel → Sandra, Jorge → Rocío,
--     medido sobre las órdenes desde agosto).
--
-- QUIÉN ESCRIBE: las rutas del servidor con service role, después de chequear el permiso
-- (exigirModulo). No hay políticas de escritura para usuarios: la historia es append-only
-- por construcción. Los usuarios leen lo suyo (admin, todo).
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$ BEGIN

  -- ── Conversaciones ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS asistente_conversaciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          UUID NOT NULL REFERENCES user_profiles(id),
    titulo              TEXT,
    canal               TEXT NOT NULL DEFAULT 'web' CHECK (canal IN ('web', 'voz', 'whatsapp')),
    estado              TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'archivada')),
    modelo              TEXT NOT NULL,
    esfuerzo            TEXT NOT NULL,
    system_snapshot     JSON NOT NULL,
    system_hash         TEXT NOT NULL,
    criterio_version    INT,
    parametros_version  BIGINT,
    borrador_id         UUID,
    -- Un turno a la vez: la ruta lo toma con asistente_tomar_turno() y lo suelta al final.
    -- Si una función de Vercel muere a mitad de camino, el candado vence solo (ver abajo).
    turno_en_curso      TIMESTAMPTZ,
    ultimo_mensaje_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_asistente_conv_usuario ON asistente_conversaciones(usuario_id, ultimo_mensaje_at DESC NULLS LAST);

  -- ── Mensajes ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS asistente_mensajes (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversacion_id   UUID NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
    seq               INT NOT NULL,
    rol               TEXT NOT NULL CHECK (rol IN ('user', 'assistant', 'system')),
    -- humano: lo que escribió o dijo el vendedor · resultados: tool_results · contexto: aviso
    -- de sistema del servidor · boton: una confirmación con el botón · asistente: respuesta.
    tipo              TEXT NOT NULL CHECK (tipo IN ('humano', 'resultados', 'contexto', 'boton', 'asistente')),
    contenido         JSON NOT NULL,
    -- Para listar y buscar sin parsear bloques: lo que escribió el vendedor o lo que respondió.
    texto             TEXT,
    canal             TEXT CHECK (canal IN ('web', 'voz', 'whatsapp')),
    turno_id          UUID,
    uso               JSONB,
    modelo_servido    TEXT,
    interrumpido      BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversacion_id, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_asistente_mensajes_conv ON asistente_mensajes(conversacion_id, seq);
  CREATE INDEX IF NOT EXISTS idx_asistente_mensajes_fecha ON asistente_mensajes(created_at) WHERE uso IS NOT NULL;

  -- ── Presupuestos en construcción ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cotizacion_borradores (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id      UUID REFERENCES asistente_conversaciones(id) ON DELETE SET NULL,
    usuario_id           UUID NOT NULL REFERENCES user_profiles(id),
    -- Sube con cada cambio. Una acción propuesta sobre la versión N vence si el borrador
    -- pasa a N+1: nadie confirma algo distinto de lo que se le leyó.
    version              INT NOT NULL DEFAULT 1,
    estado               TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'en_odoo', 'enviado', 'descartado')),
    datos                JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Lo que calculó el motor sobre `datos`: totales, avisos, pendientes, faltantes.
    resultado            JSONB,
    odoo_venta_id        INT,
    odoo_venta_nombre    TEXT,
    odoo_oportunidad_id  INT,
    -- Re-emisión: la venta vieja que este presupuesto reemplaza (se cancela al confirmar).
    origen_venta_id      INT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_cotizacion_borradores_usuario ON cotizacion_borradores(usuario_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_cotizacion_borradores_venta ON cotizacion_borradores(odoo_venta_id) WHERE odoo_venta_id IS NOT NULL;

  -- Quién cambió qué del borrador: el modelo, la pantalla o el motor.
  CREATE TABLE IF NOT EXISTS cotizacion_borrador_cambios (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    borrador_id  UUID NOT NULL REFERENCES cotizacion_borradores(id) ON DELETE CASCADE,
    version      INT NOT NULL,
    origen       TEXT NOT NULL CHECK (origen IN ('modelo', 'panel', 'motor', 'sistema')),
    patch        JSONB NOT NULL,
    autor_id     UUID REFERENCES user_profiles(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_borrador_cambios ON cotizacion_borrador_cambios(borrador_id, id);

  -- ── Acciones (lo que sale hacia afuera) ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS asistente_acciones (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Número corto para decirlo en voz alta: "la acción 12".
    numero               BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    conversacion_id      UUID NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
    usuario_id           UUID NOT NULL REFERENCES user_profiles(id),
    borrador_id          UUID REFERENCES cotizacion_borradores(id) ON DELETE SET NULL,
    borrador_version     INT,
    tipo                 TEXT NOT NULL CHECK (tipo IN ('guardar_presupuesto', 'reemitir_presupuesto', 'enviar_mail', 'crear_cliente', 'avisar_joaquin')),
    -- simple: un "sí" alcanza · explicita: además hay que decir el verbo ("mandalo").
    nivel                TEXT NOT NULL DEFAULT 'simple' CHECK (nivel IN ('simple', 'explicita')),
    -- propuesta → presentada (se le mostró/leyó) → ejecutando → ok | error | incierto
    -- y las salidas: rechazada, vencida (cambió el borrador o pasó el tiempo), reemplazada.
    estado               TEXT NOT NULL DEFAULT 'propuesta' CHECK (estado IN (
                           'propuesta', 'presentada', 'ejecutando', 'ok', 'error', 'incierto', 'rechazada', 'vencida', 'reemplazada')),
    payload              JSONB NOT NULL,
    resumen              TEXT NOT NULL,
    resumen_voz          TEXT,
    turno_id             UUID,
    tool_use_id          TEXT,
    vence_at             TIMESTAMPTZ NOT NULL,
    confirmada_via       TEXT CHECK (confirmada_via IN ('boton', 'texto', 'voz', 'whatsapp')),
    confirmacion_texto   TEXT,
    confirmada_por       UUID REFERENCES user_profiles(id),
    confirmada_at        TIMESTAMPTZ,
    pasos                JSONB NOT NULL DEFAULT '{}'::jsonb,
    resultado            JSONB,
    error                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Una sola acción abierta por conversación: proponer otra reemplaza la anterior.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_asistente_acciones_una_abierta
    ON asistente_acciones(conversacion_id) WHERE estado IN ('propuesta', 'presentada');
  CREATE INDEX IF NOT EXISTS idx_asistente_acciones_conv ON asistente_acciones(conversacion_id, created_at DESC);

  -- Historial de cada acción (append-only): cuándo se propuso, se presentó, se confirmó y cómo.
  CREATE TABLE IF NOT EXISTS asistente_acciones_eventos (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    accion_id   UUID NOT NULL REFERENCES asistente_acciones(id) ON DELETE CASCADE,
    estado      TEXT NOT NULL,
    detalle     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_acciones_eventos ON asistente_acciones_eventos(accion_id, id);

  -- ── PDFs ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cotizacion_pdfs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrador_id       UUID NOT NULL REFERENCES cotizacion_borradores(id) ON DELETE CASCADE,
    borrador_version  INT NOT NULL,
    tipo              TEXT NOT NULL CHECK (tipo IN ('preview', 'final')),
    odoo_venta_id     INT,
    odoo_adjunto_id   INT,
    nombre            TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    sha256            TEXT NOT NULL,
    bytes             INT NOT NULL,
    creado_por        UUID REFERENCES user_profiles(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_cotizacion_pdfs_borrador ON cotizacion_pdfs(borrador_id, created_at DESC);

  -- ── Vendedores ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS comercial_vendedores (
    usuario_id              UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
    -- "Técnico" de la orden (x_studio_tcnico → hr.employee): quien cotiza.
    odoo_employee_id        INT,
    -- "Vendedor" de la orden (user_id → res.users): muchas veces su asistente comercial.
    odoo_vendedor_user_id   INT,
    -- El nombre que va en "Vendedor asignado" del PDF.
    nombre_en_propuesta     TEXT,
    -- Para reconocerlo cuando escribe por WhatsApp (formato E.164 sin +: 5491155551234).
    whatsapp                TEXT UNIQUE,
    activo                  BOOLEAN NOT NULL DEFAULT true,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ── Lectura: lo propio (admin, todo) ──────────────────────────────────────
  ALTER TABLE asistente_conversaciones    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE asistente_mensajes          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_borradores       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_borrador_cambios ENABLE ROW LEVEL SECURITY;
  ALTER TABLE asistente_acciones          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE asistente_acciones_eventos  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_pdfs             ENABLE ROW LEVEL SECURITY;
  ALTER TABLE comercial_vendedores        ENABLE ROW LEVEL SECURITY;

  CREATE OR REPLACE FUNCTION public.asistente_es_admin()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT COALESCE((SELECT p.activo AND p.rol::text = 'admin' FROM public.user_profiles p WHERE p.id = auth.uid()), false);
  $fn$;

  DROP POLICY IF EXISTS "Dueño ve sus conversaciones" ON asistente_conversaciones;
  CREATE POLICY "Dueño ve sus conversaciones" ON asistente_conversaciones FOR SELECT TO authenticated
    USING (usuario_id = auth.uid() OR asistente_es_admin());

  DROP POLICY IF EXISTS "Dueño ve sus mensajes" ON asistente_mensajes;
  CREATE POLICY "Dueño ve sus mensajes" ON asistente_mensajes FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM asistente_conversaciones c WHERE c.id = conversacion_id AND (c.usuario_id = auth.uid() OR asistente_es_admin())));

  DROP POLICY IF EXISTS "Dueño ve sus borradores" ON cotizacion_borradores;
  CREATE POLICY "Dueño ve sus borradores" ON cotizacion_borradores FOR SELECT TO authenticated
    USING (usuario_id = auth.uid() OR asistente_es_admin());

  DROP POLICY IF EXISTS "Dueño ve cambios de sus borradores" ON cotizacion_borrador_cambios;
  CREATE POLICY "Dueño ve cambios de sus borradores" ON cotizacion_borrador_cambios FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM cotizacion_borradores b WHERE b.id = borrador_id AND (b.usuario_id = auth.uid() OR asistente_es_admin())));

  DROP POLICY IF EXISTS "Dueño ve sus acciones" ON asistente_acciones;
  CREATE POLICY "Dueño ve sus acciones" ON asistente_acciones FOR SELECT TO authenticated
    USING (usuario_id = auth.uid() OR asistente_es_admin());

  DROP POLICY IF EXISTS "Dueño ve eventos de sus acciones" ON asistente_acciones_eventos;
  CREATE POLICY "Dueño ve eventos de sus acciones" ON asistente_acciones_eventos FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM asistente_acciones a WHERE a.id = accion_id AND (a.usuario_id = auth.uid() OR asistente_es_admin())));

  DROP POLICY IF EXISTS "Dueño ve sus pdfs" ON cotizacion_pdfs;
  CREATE POLICY "Dueño ve sus pdfs" ON cotizacion_pdfs FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM cotizacion_borradores b WHERE b.id = borrador_id AND (b.usuario_id = auth.uid() OR asistente_es_admin())));

  DROP POLICY IF EXISTS "Autenticados ven vendedores" ON comercial_vendedores;
  CREATE POLICY "Autenticados ven vendedores" ON comercial_vendedores FOR SELECT TO authenticated USING (true);

  -- ── Candado de turno ──────────────────────────────────────────────────────
  -- Toma el turno si está libre o si el anterior quedó colgado más de 330 s (una función de
  -- Vercel no vive más de 300 s). Devuelve true si lo tomó.
  CREATE OR REPLACE FUNCTION public.asistente_tomar_turno(p_conversacion uuid)
  RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE asistente_conversaciones
       SET turno_en_curso = now(), updated_at = now()
     WHERE id = p_conversacion
       AND (turno_en_curso IS NULL OR turno_en_curso < now() - interval '330 seconds')
    RETURNING true;
  $fn$;

  CREATE OR REPLACE FUNCTION public.asistente_soltar_turno(p_conversacion uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $fn$
    UPDATE asistente_conversaciones SET turno_en_curso = NULL, updated_at = now() WHERE id = p_conversacion;
  $fn$;

  -- Sólo el servidor (service role) toma y suelta turnos.
  REVOKE ALL ON FUNCTION public.asistente_tomar_turno(uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.asistente_soltar_turno(uuid) FROM PUBLIC, anon, authenticated;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
