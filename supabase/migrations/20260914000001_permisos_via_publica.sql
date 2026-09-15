-- ========================================================================
-- Gestoría de permisos en vía pública — fase 1: espejo de TAD
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: el estado de los permisos de andamio vive en TAD (Trámites a
-- Distancia del GCBA) y la única forma de saberlo es entrar con la cuenta miBA y mirar
-- "Mis trámites". Hoy lo hace una persona a mano y el resto de la empresa se entera tarde
-- —o nunca— de que un expediente volvió observado.
--
-- CÓMO: un robot (robot/worker-tad.mjs) entra a TAD cada 30 minutos en horario hábil, lee
-- la lista y deja acá cada expediente con su estado. Cuando un estado cambia registra el
-- evento, lee el motivo de la subsanación o baja el permiso, y avisa.
--
-- POR QUÉ NO SE ENGANCHA TODAVÍA CON LA VENTA DE ODOO: en esta fase el trámite es el
-- expediente tal como lo muestra TAD. La vinculación con la venta es por número de
-- expediente (sale.order.x_expediente_nro) y la hace el robot cuando lo encuentra; el
-- trámite completo ligado a la venta es la fase siguiente (docs/modulo-gestoria-permisos.md).
--
-- QUIÉN ESCRIBE: el robot, con service role (saltea RLS). Los usuarios sólo leen y piden
-- "revisar ahora", que es una fila en pvp_tareas. Nadie edita estados a mano: el estado es
-- el de TAD, y un estado escrito a mano sería una segunda fuente de verdad.
--
-- LA LISTA SE LEE, EL DETALLE NO: abrir el detalle de un expediente en TAD le agrega una
-- "Constancia de Consulta" al expediente (verificado 2026-09-14). Por eso el seguimiento
-- vive en la lista y en la tarea de subsanación, y no se guarda nada que obligue a abrir
-- el detalle en cada vuelta.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN

  -- ── Expedientes ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS pvp_expedientes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Tal cual lo muestra TAD: "EX-2026-41408211- -GCABA-SSGOU".
    expediente          TEXT NOT NULL UNIQUE,
    -- "2026-41408211": lo que se busca, se compara y se cruza con Odoo.
    numero              TEXT NOT NULL UNIQUE,
    nombre              TEXT,
    titular             TEXT,
    organismo           TEXT,
    -- Estado literal de TAD, normalizado a mayúsculas y sin tildes (INICIACION,
    -- SUBSANACION, TRAMITACION, GUARDA TEMPORAL…). Texto libre a propósito: TAD agrega
    -- estados sin avisar y un CHECK haría que el robot deje de guardar justo lo nuevo.
    estado_tad          TEXT NOT NULL,
    solapa              TEXT NOT NULL DEFAULT 'en_curso' CHECK (solapa IN ('en_curso', 'finalizado')),
    creado_tad          DATE,
    estado_desde        TIMESTAMPTZ NOT NULL DEFAULT now(),
    tarea_pendiente     BOOLEAN NOT NULL DEFAULT false,
    motivo_subsanacion  TEXT,
    motivo_leido_at     TIMESTAMPTZ,
    permiso_notificacion TEXT,
    permiso_path        TEXT,
    odoo_venta_id       BIGINT,
    odoo_venta_nombre   TEXT,
    direccion           TEXT,
    cliente             TEXT,
    visto_primero_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    visto_ultimo_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_pvp_expedientes_estado ON pvp_expedientes(solapa, estado_tad);

  -- ── Historial ─────────────────────────────────────────────────────────────
  -- Append-only: es lo que se le va a mostrar a quien pregunte "¿cuándo volvió observado?".
  CREATE TABLE IF NOT EXISTS pvp_eventos (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id  UUID REFERENCES pvp_expedientes(id) ON DELETE CASCADE,
    tipo           TEXT NOT NULL CHECK (tipo IN (
                     'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
                     'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot'
                   )),
    detalle        TEXT,
    datos          JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor          TEXT NOT NULL DEFAULT 'robot' CHECK (actor IN ('robot', 'gcba', 'persona')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_pvp_eventos_expediente ON pvp_eventos(expediente_id, created_at DESC);

  -- ── Cola del robot ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS pvp_tareas (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          TEXT NOT NULL CHECK (tipo IN ('tad_revisar')),
    estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'tomada', 'ok', 'error')),
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    resultado     JSONB,
    error         TEXT,
    pedida_por    UUID DEFAULT auth.uid() REFERENCES user_profiles(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    tomada_at     TIMESTAMPTZ,
    terminada_at  TIMESTAMPTZ
  );
  -- Una sola revisión en curso: diez clics en "Revisar ahora" son una revisión, no diez.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_tareas_una_abierta
    ON pvp_tareas(tipo) WHERE estado IN ('pendiente', 'tomada');

  -- ── Latido del robot ──────────────────────────────────────────────────────
  -- Sin esto, "no hay novedades" y "el robot está apagado" se ven igual en la pantalla.
  CREATE TABLE IF NOT EXISTS pvp_robot (
    id                   TEXT PRIMARY KEY,
    ultima_revision_at   TIMESTAMPTZ,
    ultimo_ok_at         TIMESTAMPTZ,
    proxima_revision_at  TIMESTAMPTZ,
    ultimo_error         TEXT,
    ultimo_error_at      TIMESTAMPTZ,
    equipo               TEXT,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ── Quién puede qué ───────────────────────────────────────────────────────
  ALTER TABLE pvp_expedientes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pvp_eventos     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pvp_tareas      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pvp_robot       ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Autenticados ven expedientes" ON pvp_expedientes;
  CREATE POLICY "Autenticados ven expedientes" ON pvp_expedientes FOR SELECT TO authenticated USING (true);

  DROP POLICY IF EXISTS "Autenticados ven eventos" ON pvp_eventos;
  CREATE POLICY "Autenticados ven eventos" ON pvp_eventos FOR SELECT TO authenticated USING (true);

  DROP POLICY IF EXISTS "Autenticados ven tareas" ON pvp_tareas;
  CREATE POLICY "Autenticados ven tareas" ON pvp_tareas FOR SELECT TO authenticated USING (true);

  -- Pedir una revisión es lo único que escribe un usuario, y firmada con su id.
  DROP POLICY IF EXISTS "Autenticados piden revision" ON pvp_tareas;
  CREATE POLICY "Autenticados piden revision" ON pvp_tareas FOR INSERT TO authenticated
    WITH CHECK (tipo = 'tad_revisar' AND estado = 'pendiente' AND pedida_por = auth.uid());

  DROP POLICY IF EXISTS "Autenticados ven el robot" ON pvp_robot;
  CREATE POLICY "Autenticados ven el robot" ON pvp_robot FOR SELECT TO authenticated USING (true);

  -- ── Archivos (permisos emitidos) ──────────────────────────────────────────
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('permisos-via-publica', 'permisos-via-publica', false)
  ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS "Autenticados leen permisos via publica" ON storage.objects;
  CREATE POLICY "Autenticados leen permisos via publica" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'permisos-via-publica');

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
