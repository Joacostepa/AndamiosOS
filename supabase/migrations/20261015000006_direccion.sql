-- ============================================================
-- AndamiosOS — Dirección (el tablero de los socios)
--
-- Diseño en docs/direccion/diseno.md (§10 y §11) y plan en docs/direccion/handoff.md §4.6.
-- Contrato para quien construye las pantallas: docs/direccion/implementacion.md.
--
-- 1. DIRECCIÓN LEE ODOO Y NO ESCRIBE NUNCA. Estas tablas guardan lo PROPIO de Dirección:
--    el snapshot nocturno (respaldo e historia para comparar), las notas y dueños de cada
--    decisión, las metas, la configuración (colchón mínimo, escenario), la política de
--    retiros, los avisos de calidad cargados a mano, el registro de accesos y el IPC.
--
-- 2. PERMISOS POR MÓDULO, como en src/lib/auth/acceso.ts:
--    · `direccion`: leer con «ver»; escribir notas, dueños, metas, configuración, avisos e
--      IPC con «editar». El admin lo trae solo.
--    · `direccion-socios` (exigeExplicito): el admin NO lo trae solo. Sólo quien lo tiene
--      tildado. Además pide `direccion` (las dos llaves). La política de retiros, lo
--      reservado del snapshot y leer la auditoría son de este módulo.
--
-- 3. LA APP FUNCIONA SIN ESTA MIGRACIÓN: las pantallas calculan en vivo desde Odoo. Lo que
--    escribe acá contesta un mensaje amable mientras la tabla no exista
--    (src/lib/direccion/supabase.ts → esTablaFaltante).
--
-- 4. EL SNAPSHOT LO ESCRIBE SÓLO EL CRON (/api/cron/direccion, service role): no hay
--    política de INSERT para usuarios. La AUDITORÍA también la escribe sólo el servidor
--    (service role): un usuario no puede cargar filas falsas ("abrir_socios", "actualizar:*").
--
-- 5. LO RESERVADO SE MARCA EN CADA FILA (`reservado`) y la RLS lo aplica igual en snapshot,
--    notas, dueños, metas y avisos: `NOT reservado OR dir_es_socio()` para leer y escribir.
--    El servidor calcula la marca (no confía en la que manda el navegador).
--
-- Se aplica a mano con `npx supabase db query --linked -f <este archivo>` (NUNCA db push) y
-- es idempotente. Sin BEGIN/COMMIT propios para que el probador la pueda envolver en su
-- ROLLBACK.
-- ============================================================

-- ============================================================
-- Permisos
-- ============================================================
CREATE OR REPLACE FUNCTION dir_puede_ver() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'direccion' IN ('ver', 'editar'))
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION dir_puede_editar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'direccion' = 'editar')
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

-- Socios: SIN el atajo de admin, y con las dos llaves (direccion + direccion-socios).
CREATE OR REPLACE FUNCTION dir_es_socio() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo
                          AND p.permisos->>'direccion-socios' IN ('ver', 'editar')
                          AND (p.rol::text = 'admin' OR p.permisos->>'direccion' IN ('ver', 'editar'))
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

-- ============================================================
-- Tablas
-- ============================================================

-- Snapshot: una fila por cifra (para la historia: "vs lunes anterior", "vs semana pasada") y
-- una fila por pantalla con kpi_id = '*' y el resultado entero en `detalle` (para mostrar
-- algo cuando Odoo no responde). `reservado` = sólo socios.
CREATE TABLE IF NOT EXISTS direccion_snapshots (
  id         BIGSERIAL PRIMARY KEY,
  tomado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  pantalla   TEXT NOT NULL CHECK (pantalla IN ('semana', 'caja', 'ventas', 'cobranzas', 'calle', 'socios', 'datos')),
  kpi_id     TEXT NOT NULL,                      -- id del diccionario (src/lib/direccion/diccionario.ts) o '*'
  periodo    TEXT,                               -- '2026-10', '2026-W42', NULL = foto del día
  valor_ars  NUMERIC,                            -- NULL = sin dato (nunca 0 por error)
  valor_usd  NUMERIC,
  detalle    JSONB NOT NULL DEFAULT '{}'::jsonb,
  confianza  TEXT CHECK (confianza IN ('ok', 'ver', 'inc')),
  reservado  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS direccion_snapshots_kpi ON direccion_snapshots (kpi_id, tomado_at DESC);
CREATE INDEX IF NOT EXISTS direccion_snapshots_pantalla ON direccion_snapshots (pantalla, tomado_at DESC) WHERE kpi_id = '*';

-- Notas de "Para decidir" (Anotar). Se muestran mientras la alerta siga viva.
CREATE TABLE IF NOT EXISTS direccion_notas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id   TEXT NOT NULL,                     -- id de la decisión ('ministerio', 'devolucion', …)
  texto       TEXT NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 2000),
  dueno       TEXT,                              -- el dueño al momento de anotar
  reunion     BOOLEAN NOT NULL DEFAULT false,    -- anotada en el modo reunión
  reservado   BOOLEAN NOT NULL DEFAULT false,    -- nota sobre un tema de socios
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS direccion_notas_alerta ON direccion_notas (alerta_id, created_at DESC);

-- Dueño vigente de cada decisión (el menú "dueño: …"). Una fila por alerta.
-- reservado = la decisión es de socios (la marca la pone el servidor, api/direccion/dueno).
CREATE TABLE IF NOT EXISTS direccion_duenos (
  alerta_id   TEXT PRIMARY KEY,
  dueno       TEXT,                              -- NULL = sin dueño
  reservado   BOOLEAN NOT NULL DEFAULT false,
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE direccion_duenos ADD COLUMN IF NOT EXISTS reservado BOOLEAN NOT NULL DEFAULT false;

-- Metas por indicador. Historial: vale la última de cada kpi; meta NULL = se sacó.
-- reservado = indicador de socios (src/lib/direccion/diccionario.ts → reservado). La de
-- "retiros" tiene que ir marcada sí o sí (el CHECK), así la RLS la deja sólo a socios.
CREATE TABLE IF NOT EXISTS direccion_metas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id      TEXT NOT NULL,
  meta        NUMERIC,
  reservado   BOOLEAN NOT NULL DEFAULT false,
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT direccion_metas_retiros_reservado CHECK (kpi_id <> 'retiros' OR reservado)
);
ALTER TABLE direccion_metas ADD COLUMN IF NOT EXISTS reservado BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS direccion_metas_kpi ON direccion_metas (kpi_id, created_at DESC);

-- Configuración: 'colchon_minimo' → {"ars": 120000000}, 'escenario' → {"valor": "proyectado"},
-- 'cobranzas' → {"publicos": [ids], "privados": [ids], "patron": "…", "diasSinPlazo": 30}.
CREATE TABLE IF NOT EXISTS direccion_config (
  clave       TEXT PRIMARY KEY CHECK (clave IN ('colchon_minimo', 'escenario', 'cobranzas')),
  valor       JSONB NOT NULL,
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Política de retiros (sólo socios). Versionada: vale la de versión más alta.
CREATE TABLE IF NOT EXISTS direccion_politica_retiros (
  version     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contenido   JSONB NOT NULL CHECK (jsonb_typeof(contenido) = 'object'),
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Avisos de calidad cargados a mano (los automáticos los calcula src/lib/direccion/calculo/calidad.ts).
CREATE TABLE IF NOT EXISTS direccion_avisos_calidad (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave       TEXT UNIQUE,                       -- id estable ('caja_usd_arqueo'); NULL = libre
  nivel       TEXT NOT NULL CHECK (nivel IN ('ver', 'inc', 'inf')),
  aviso       TEXT NOT NULL CHECK (length(btrim(aviso)) > 0),
  detalle     TEXT,
  desde       DATE,
  afecta      TEXT[] NOT NULL DEFAULT '{}',      -- ids del diccionario
  quien       TEXT,                              -- a quién le toca resolverlo (en Odoo)
  que         TEXT,                              -- qué hay que hacer
  reservado   BOOLEAN NOT NULL DEFAULT false,
  activo      BOOLEAN NOT NULL DEFAULT true,
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro de accesos y cambios (§10.4): aperturas de Socios, cambios de política, metas,
-- dueños, y los "Actualizar ahora" (de ahí sale el límite de 1 cada 5 minutos).
-- La escribe SÓLO el servidor (service role) y la base (trigger de permisos): sin INSERT
-- para usuarios. `accion` acotada: nada de textos libres.
CREATE TABLE IF NOT EXISTS direccion_auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario     UUID NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE CASCADE,
  accion      TEXT NOT NULL CONSTRAINT direccion_auditoria_accion CHECK (
                accion IN ('abrir_socios', 'politica', 'meta', 'dueno', 'config', 'aviso_cargar', 'aviso_cerrar',
                           'permiso_socios', 'permiso_socios_base')
                OR accion ~ '^actualizar:(semana|caja|ventas|cobranzas|calle|socios|datos)$'),
  detalle     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS direccion_auditoria_usuario ON direccion_auditoria (usuario, accion, created_at DESC);
CREATE INDEX IF NOT EXISTS direccion_auditoria_fecha ON direccion_auditoria (created_at DESC);

-- IPC de INDEC para "ARS de hoy". Mientras esté vacía, el botón no aparece.
CREATE TABLE IF NOT EXISTS ipc_mensual (
  mes         DATE PRIMARY KEY CHECK (extract(day FROM mes) = 1),   -- primer día del mes
  indice      NUMERIC NOT NULL CHECK (indice > 0),
  fuente      TEXT NOT NULL DEFAULT 'INDEC',
  autor       UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE direccion_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_duenos ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_politica_retiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_avisos_calidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE direccion_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipc_mensual ENABLE ROW LEVEL SECURITY;

-- Snapshot: se lee con Dirección; lo reservado, sólo socios. Lo escribe la service role.
DROP POLICY IF EXISTS "Dirección: leer" ON direccion_snapshots;
CREATE POLICY "Dirección: leer" ON direccion_snapshots FOR SELECT TO authenticated
  USING ((SELECT dir_puede_ver()) AND (NOT reservado OR (SELECT dir_es_socio())));

-- Notas: se leen con Dirección (las reservadas, sólo socios); se cargan con «editar» y a
-- nombre propio. No se editan ni se borran: son el acta.
DROP POLICY IF EXISTS "Dirección: leer" ON direccion_notas;
CREATE POLICY "Dirección: leer" ON direccion_notas FOR SELECT TO authenticated
  USING ((SELECT dir_puede_ver()) AND (NOT reservado OR (SELECT dir_es_socio())));
DROP POLICY IF EXISTS "Dirección: anotar" ON direccion_notas;
CREATE POLICY "Dirección: anotar" ON direccion_notas FOR INSERT TO authenticated
  WITH CHECK ((SELECT dir_puede_editar()) AND autor = auth.uid() AND (NOT reservado OR (SELECT dir_es_socio())));

-- Política de retiros: sólo socios, para leer y para cargar (cargar pide además «editar»
-- en Dirección, como toda escritura). Versionada: no se edita ni se borra.
DROP POLICY IF EXISTS "Dirección socios: leer" ON direccion_politica_retiros;
CREATE POLICY "Dirección socios: leer" ON direccion_politica_retiros FOR SELECT TO authenticated
  USING ((SELECT dir_es_socio()));
DROP POLICY IF EXISTS "Dirección socios: cargar" ON direccion_politica_retiros;
CREATE POLICY "Dirección socios: cargar" ON direccion_politica_retiros FOR INSERT TO authenticated
  WITH CHECK ((SELECT dir_es_socio()) AND (SELECT dir_puede_editar()) AND autor = auth.uid());

-- Avisos manuales: se leen con Dirección (los reservados, sólo socios); se cargan y editan con «editar».
DROP POLICY IF EXISTS "Dirección: leer" ON direccion_avisos_calidad;
CREATE POLICY "Dirección: leer" ON direccion_avisos_calidad FOR SELECT TO authenticated
  USING ((SELECT dir_puede_ver()) AND (NOT reservado OR (SELECT dir_es_socio())));

-- Auditoría: leerla entera es de socios (cada uno ve lo propio). La escribe el servidor con
-- la service role: los usuarios no tienen INSERT (no pueden fabricar filas "abrir_socios"
-- ni "actualizar:*", que invalidan el snapshot de todos).
DROP POLICY IF EXISTS "Dirección: leer" ON direccion_auditoria;
CREATE POLICY "Dirección: leer" ON direccion_auditoria FOR SELECT TO authenticated
  USING (usuario = auth.uid() OR (SELECT dir_es_socio()));
DROP POLICY IF EXISTS "Dirección: registrar" ON direccion_auditoria;

-- Configuración e IPC: se leen con Dirección y se escriben con «editar».
-- Dueños y metas: igual, pero las filas reservadas sólo las lee y escribe un socio.
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['direccion_config', 'ipc_mensual'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Dirección: leer" ON %I', t);
    EXECUTE format('CREATE POLICY "Dirección: leer" ON %I FOR SELECT TO authenticated USING ((SELECT dir_puede_ver()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['direccion_duenos', 'direccion_metas'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Dirección: leer" ON %I', t);
    EXECUTE format('CREATE POLICY "Dirección: leer" ON %I FOR SELECT TO authenticated USING ((SELECT dir_puede_ver()) AND (NOT reservado OR (SELECT dir_es_socio())))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Dirección: editores cargan" ON %I', t);
    EXECUTE format('CREATE POLICY "Dirección: editores cargan" ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT dir_puede_editar()) AND (NOT reservado OR (SELECT dir_es_socio())))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Dirección: editores editan" ON %I', t);
    EXECUTE format('CREATE POLICY "Dirección: editores editan" ON %I FOR UPDATE TO authenticated USING ((SELECT dir_puede_editar()) AND (NOT reservado OR (SELECT dir_es_socio()))) WITH CHECK ((SELECT dir_puede_editar()) AND (NOT reservado OR (SELECT dir_es_socio())))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['direccion_config', 'direccion_avisos_calidad', 'ipc_mensual'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Dirección: editores cargan" ON %I', t);
    EXECUTE format('CREATE POLICY "Dirección: editores cargan" ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT dir_puede_editar()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Dirección: editores editan" ON %I', t);
    EXECUTE format('CREATE POLICY "Dirección: editores editan" ON %I FOR UPDATE TO authenticated USING ((SELECT dir_puede_editar())) WITH CHECK ((SELECT dir_puede_editar()))', t);
  END LOOP;
  -- Un aviso reservado sólo lo carga o edita un socio.
  DROP POLICY IF EXISTS "Dirección: editores cargan" ON direccion_avisos_calidad;
  CREATE POLICY "Dirección: editores cargan" ON direccion_avisos_calidad FOR INSERT TO authenticated
    WITH CHECK ((SELECT dir_puede_editar()) AND (NOT reservado OR (SELECT dir_es_socio())));
  DROP POLICY IF EXISTS "Dirección: editores editan" ON direccion_avisos_calidad;
  CREATE POLICY "Dirección: editores editan" ON direccion_avisos_calidad FOR UPDATE TO authenticated
    USING ((SELECT dir_puede_editar()) AND (NOT reservado OR (SELECT dir_es_socio())))
    WITH CHECK ((SELECT dir_puede_editar()) AND (NOT reservado OR (SELECT dir_es_socio())));

  FOREACH t IN ARRAY ARRAY['direccion_snapshots', 'direccion_notas', 'direccion_duenos', 'direccion_metas', 'direccion_config',
                           'direccion_politica_retiros', 'direccion_avisos_calidad', 'direccion_auditoria', 'ipc_mensual'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END
$rls$;

GRANT SELECT ON direccion_snapshots TO authenticated;
GRANT SELECT, INSERT ON direccion_notas, direccion_politica_retiros TO authenticated;
GRANT SELECT ON direccion_auditoria TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON direccion_auditoria FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON direccion_duenos, direccion_metas, direccion_config, direccion_avisos_calidad, ipc_mensual TO authenticated;

-- ============================================================
-- Registro en la base de quién recibe o pierde Dirección › Socios
-- ============================================================
-- La API de usuarios ya exige que quien da o saca el módulo lo tenga (acceso.ts →
-- motivoRechazoExplicitos) y registra quién lo hizo ('permiso_socios'). Los permisos sólo
-- se escriben con la service role (20260826000001), así que un trigger no puede saber QUÉ
-- persona hizo el cambio para bloquearlo; lo que sí garantiza es que NINGÚN cambio pase sin
-- dejar rastro, venga de la app, de un script o del panel de Supabase ('permiso_socios_base').
CREATE OR REPLACE FUNCTION dir_registrar_permiso_socios() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  antes TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.permisos->>'direccion-socios' END;
  despues TEXT := NEW.permisos->>'direccion-socios';
BEGIN
  IF antes IS DISTINCT FROM despues THEN
    INSERT INTO direccion_auditoria (usuario, accion, detalle)
    VALUES (NEW.id, 'permiso_socios_base',
            jsonb_build_object('antes', antes, 'despues', despues, 'por', auth.uid(), 'rol_db', current_user));
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION dir_registrar_permiso_socios() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_dir_permiso_socios ON user_profiles;
CREATE TRIGGER trg_dir_permiso_socios AFTER INSERT OR UPDATE OF permisos ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION dir_registrar_permiso_socios();

-- Las funciones de permiso: nada para anon.
DO $fn$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['dir_puede_ver()', 'dir_puede_editar()', 'dir_es_socio()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END
$fn$;
