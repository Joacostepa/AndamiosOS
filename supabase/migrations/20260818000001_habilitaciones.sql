-- ============================================================
-- AndamiosOS — Módulo Habilitaciones
--
-- Reparto Odoo/Supabase (ver docs/modulo-habilitaciones.md): el ESTADO de la
-- habilitación vive en Odoo (x_hab_*, que el tablero lee) y la GESTIÓN vive acá.
-- El criterio es un dueño por dato: ¿alguien lo lee desde Odoo? Si no, va a Supabase.
--
-- El motivo práctico es la latencia: cada RPC a Odoo Online tarda ~800 ms sin importar
-- la concurrencia, y marcar un requisito como aprobado tiene que ser instantáneo. Una
-- obra exigente son 9 requisitos con varias transiciones cada uno.
--
-- Las cinco tablas cuelgan de `odoo_ot_id`, que es una REFERENCIA BLANDA: no hay FK ni
-- cascade contra un sistema que no controlamos. El ciclo de vida lo maneja el job de
-- reconciliación (OT cancelada → sale de la cola pero conserva todo; OT borrada →
-- se marca huérfana, no se borra).
-- ============================================================

BEGIN;

-- ========================
-- hab_ots — una fila por habilitación
--
-- Existe por dos razones. La obvia: el estado de sincronización con Odoo necesita
-- vivir en algún lado y las otras tablas son listas, no cabeceras.
-- La que importa en el uso diario: hace que el TRIAGE sea optimista. Si "aplica /
-- no aplica" escribiera sólo en Odoo, resolver 4 obras de un clic serían 4 RPCs de
-- 800 ms — la latencia que este reparto existe para evitar, en la acción más
-- frecuente del módulo.
-- ========================
CREATE TABLE IF NOT EXISTS hab_ots (
  odoo_ot_id     BIGINT PRIMARY KEY,
  triage         TEXT CHECK (triage IN ('aplica', 'no_aplica')),  -- NULL = recién llegada
  triage_fecha   TIMESTAMPTZ,
  triage_autor   UUID REFERENCES user_profiles(id),
  -- Espejo local de los inputs que la app escribe en Odoo. Permite que el job de
  -- reconciliación compare sin releer Odoo entero, y que la UI sea optimista.
  hab_estado         TEXT CHECK (hab_estado IN ('pendiente', 'en_curso', 'habilitada', 'no_aplica')),
  hab_fecha_consulta DATE,
  hab_fecha_envio    DATE,
  hab_fecha          DATE,
  hab_vencimiento    DATE,
  sync_estado    TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (sync_estado IN ('pendiente', 'sincronizado', 'error', 'huerfana')),
  sync_error     TEXT,
  sync_intentos  INTEGER NOT NULL DEFAULT 0,
  sync_fecha     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hab_ots_sync ON hab_ots(sync_estado) WHERE sync_estado <> 'sincronizado';

-- ========================
-- hab_requisitos — un registro por documento pedido
--
-- `observado` es el estado que hoy no existe en ningún lado y es el que hace que una
-- habilitación tarde semanas: el cliente aprueba 7 documentos y rebota 2. Con el motivo
-- al lado, se sabe qué corregir sin volver a leer el mail.
-- ========================
CREATE TABLE IF NOT EXISTS hab_requisitos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_ot_id        BIGINT NOT NULL,
  nombre            TEXT NOT NULL,
  -- TEXT + CHECK y no ENUM a propósito: es el más probable de crecer (ya se ven
  -- candidatos como no_aplica o vencido). Alterar un enum en Postgres duele; mover un
  -- check constraint es una línea.
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'enviado', 'observado', 'aprobado')),
  fecha_envio       DATE,
  fecha_resolucion  DATE,
  motivo_obs        TEXT,
  origen            TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('paquete', 'manual')),
  orden             INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hab_requisitos_ot ON hab_requisitos(odoo_ot_id, orden);

-- ========================
-- hab_notas — memoria de la obra, no de la persona
--
-- "El administrador sólo atiende martes y jueves", "la nómina la piden con foto carnet
-- de cada operario, si falta una rebotan todo el paquete". Hoy eso vive en la cabeza de
-- Agustina y en su casilla: si está de licencia, se pierde.
-- ========================
CREATE TABLE IF NOT EXISTS hab_notas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_ot_id  BIGINT NOT NULL,
  texto       TEXT NOT NULL,
  fijada      BOOLEAN NOT NULL DEFAULT false,
  autor_id    UUID REFERENCES user_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hab_notas_ot ON hab_notas(odoo_ot_id, fijada DESC, created_at DESC);

-- ========================
-- hab_gestiones — historial append-only
--
-- Si el valor del módulo es poder demostrar que se reclamó tres veces desde el 4 de
-- agosto, ese registro no puede depender de que la UI se porte bien: no hay política de
-- UPDATE ni DELETE (ver más abajo). Una gestión mal cargada se corrige agregando otra.
-- ========================
CREATE TABLE IF NOT EXISTS hab_gestiones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_ot_id  BIGINT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN (
                'triage', 'consulta', 'reclamo', 'envio', 'aprobacion',
                'observacion', 'permiso', 'renovacion', 'excepcion')),
  detalle     TEXT,
  autor_id    UUID REFERENCES user_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hab_gestiones_ot ON hab_gestiones(odoo_ot_id, created_at DESC);
-- El deduplicado del pedido de modalidad al técnico consulta por venta + tipo + fecha.
CREATE INDEX IF NOT EXISTS idx_hab_gestiones_tipo ON hab_gestiones(tipo, created_at DESC);

-- ========================
-- hab_paquetes — configuración editable desde la app
--
-- Los cuatro presets salen de las combinaciones reales del tracker (1364 obras desde
-- 2025). El paquete es un punto de partida, no una jaula: una vez aplicado, los
-- requisitos se agregan y se quitan uno por uno.
-- ========================
CREATE TABLE IF NOT EXISTS hab_paquetes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  requisitos  TEXT[] NOT NULL DEFAULT '{}',
  orden       INTEGER NOT NULL DEFAULT 0,
  -- El que se aplica solo al marcar "aplica" en el triage. Uno solo.
  es_default  BOOLEAN NOT NULL DEFAULT false,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hab_paquetes_default ON hab_paquetes(es_default) WHERE es_default;

INSERT INTO hab_paquetes (nombre, requisitos, orden, es_default) VALUES
  ('Básico', ARRAY['Nómina ART'], 10, true),
  ('+ No repetición', ARRAY['Nómina ART', 'Cláusula de no repetición'], 20, false),
  ('+ SVO', ARRAY['Nómina ART', 'Cláusula de no repetición', 'SVO', 'Aviso de obra'], 30, false),
  ('Completo', ARRAY['Nómina ART', 'Cláusula de no repetición', 'SVO', 'Aviso de obra',
                     'P.S 319/99', 'E.P.P', 'Capacitaciones', 'F931'], 40, false)
ON CONFLICT (nombre) DO NOTHING;

-- ========================
-- updated_at
-- ========================
CREATE OR REPLACE FUNCTION hab_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hab_ots_updated ON hab_ots;
CREATE TRIGGER trg_hab_ots_updated BEFORE UPDATE ON hab_ots
  FOR EACH ROW EXECUTE FUNCTION hab_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hab_requisitos_updated ON hab_requisitos;
CREATE TRIGGER trg_hab_requisitos_updated BEFORE UPDATE ON hab_requisitos
  FOR EACH ROW EXECUTE FUNCTION hab_touch_updated_at();

-- ========================
-- RLS
-- ========================
ALTER TABLE hab_ots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hab_requisitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE hab_notas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hab_gestiones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hab_paquetes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados ven habilitaciones" ON hab_ots;
CREATE POLICY "Autenticados ven habilitaciones" ON hab_ots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Autenticados gestionan habilitaciones" ON hab_ots;
CREATE POLICY "Autenticados gestionan habilitaciones" ON hab_ots FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Autenticados ven requisitos" ON hab_requisitos;
CREATE POLICY "Autenticados ven requisitos" ON hab_requisitos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Autenticados gestionan requisitos" ON hab_requisitos;
CREATE POLICY "Autenticados gestionan requisitos" ON hab_requisitos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Autenticados ven notas" ON hab_notas;
CREATE POLICY "Autenticados ven notas" ON hab_notas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Autenticados gestionan notas" ON hab_notas;
CREATE POLICY "Autenticados gestionan notas" ON hab_notas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Autenticados ven paquetes" ON hab_paquetes;
CREATE POLICY "Autenticados ven paquetes" ON hab_paquetes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin y operativo gestionan paquetes" ON hab_paquetes;
CREATE POLICY "Admin y operativo gestionan paquetes" ON hab_paquetes FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'operativo')) WITH CHECK (get_user_role() IN ('admin', 'operativo'));

-- APPEND-ONLY: sólo SELECT e INSERT. Sin UPDATE ni DELETE, a propósito y por diseño.
-- La restricción vive en la base y no sólo en la UI.
DROP POLICY IF EXISTS "Autenticados ven gestiones" ON hab_gestiones;
CREATE POLICY "Autenticados ven gestiones" ON hab_gestiones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Autenticados registran gestiones" ON hab_gestiones;
CREATE POLICY "Autenticados registran gestiones" ON hab_gestiones FOR INSERT TO authenticated WITH CHECK (true);

-- ========================
-- Storage — bucket PRIVADO para los adjuntos de requisitos
--
-- No a ir.attachment: los seis PDFs de capacitaciones de una obra no tienen por qué
-- vivir en el ERP. Los documentos del PERMISO sí se quedan en Odoo (x_permiso_doc_ids):
-- son parte del contrato y tienen que sobrevivir con la venta.
--
-- Privado, a diferencia del bucket `empresa` (que es público porque son logos).
-- Prefijo: habilitaciones/{odoo_ot_id}/{requisito_id}/{archivo}
-- ========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('habilitaciones', 'habilitaciones', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Autenticados leen adjuntos de habilitacion" ON storage.objects;
CREATE POLICY "Autenticados leen adjuntos de habilitacion" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'habilitaciones');

DROP POLICY IF EXISTS "Autenticados suben adjuntos de habilitacion" ON storage.objects;
CREATE POLICY "Autenticados suben adjuntos de habilitacion" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'habilitaciones');

DROP POLICY IF EXISTS "Autenticados borran adjuntos de habilitacion" ON storage.objects;
CREATE POLICY "Autenticados borran adjuntos de habilitacion" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'habilitaciones');

COMMIT;
