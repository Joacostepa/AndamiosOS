-- ============================================================
-- AndamiosOS — Hoja del día: contratistas (mano de obra tercerizada)
--
-- Decisiones del dueño (10/10, noche), en docs/equipos-del-dia/modulo.md §20:
--
-- 1. A veces se terceriza mano de obra con CONTRATISTAS (varios; p. ej. Tomás Quintana).
--    NO se dan de alta como empleados: ni Legajos ni Odoo.
-- 2. Sólo se sabe la CANTIDAD de personas del contratista, no los nombres. Por eso no se
--    reutiliza `pan_personas_externas` (una fila por persona, con nombre y DNI, la que usa
--    el Pañol para saber quién se llevó qué): acá la unidad es el contratista y un número.
-- 3. El contratista va DENTRO de las cuadrillas del tablero (un día la Cuadrilla 4 es
--    Quintana), a veces con gente nuestra o reforzando una cuadrilla nuestra. No hay
--    cuadrilla aparte. Un contratista puede estar en varias cuadrillas el mismo día.
-- 4. Se le paga por persona y jornada (`valor_jornada`, opcional): el resumen del mes suma
--    las cantidades por día.
-- 5. El parte de Odoo NO cambia: su gente cuenta en "cantidad de personas" como la nuestra.
-- 6. Nada de documentación (ART, seguro) por ahora.
--
-- QUÉ HAY:
--   hd_contratistas        el contratista (nombre, referente, celular, Telegram, valor).
--   hd_hoja_contratistas   cuántos van de cada contratista en cada hoja (UNIQUE hoja+contratista).
--   hd_hojas.a_cargo_contratista_id
--                          la hoja está a cargo del contratista: su referente la recibe.
--                          Un contratista está a cargo de UNA hoja por día (su link es uno
--                          por día, como el de cualquier capataz). Si la hoja tiene a alguien
--                          nuestro a cargo (hd_integrantes.a_cargo), las acciones del servidor
--                          sacan el del contratista, y al revés: nunca quedan los dos.
--   hd_links / hd_telegram_codigos / hd_telegram_mensajes .contratista_id
--                          el referente recibe la hoja y vincula Telegram como cualquiera.
--
-- Se aplica a mano con `npx supabase db query --linked -f` (NUNCA db push), DESPUÉS de
-- 20261011000001_hoja_del_dia.sql y ANTES del deploy del código que la usa. Idempotente:
-- se puede correr dos veces. Sin BEGIN/COMMIT propios (el probador la envuelve en ROLLBACK).
-- ============================================================

-- ========================
-- El contratista
-- ========================
CREATE TABLE IF NOT EXISTS hd_contratistas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cómo se lo nombra en pantalla y en los mensajes: "Quintana" ("+3 de Quintana").
  nombre                 TEXT NOT NULL CHECK (btrim(nombre) <> ''),
  -- La persona que recibe la hoja cuando el contratista está a cargo ("Tomás Quintana").
  referente              TEXT,
  celular                TEXT,
  -- Telegram, igual que las personas (lo escribe el webhook al tocar el link de vinculación).
  telegram_chat_id       BIGINT,
  telegram_usuario       TEXT,
  telegram_vinculado_at  TIMESTAMPTZ,
  -- Lo que se le paga por persona y jornada (opcional): el total estimado del mes.
  valor_jornada          NUMERIC(12, 2) CHECK (valor_jornada IS NULL OR valor_jornada >= 0),
  nota                   TEXT,
  activo                 BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             UUID REFERENCES user_profiles(id) DEFAULT auth.uid()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_contratistas_nombre ON hd_contratistas (lower(btrim(nombre)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_contratistas_telegram ON hd_contratistas(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- ========================
-- Cuántos van de cada contratista en cada hoja
-- ========================
CREATE TABLE IF NOT EXISTS hd_hoja_contratistas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id         UUID NOT NULL REFERENCES hd_hojas(id) ON DELETE CASCADE,
  -- Repetida a propósito (la pone el trigger con la de la hoja): el resumen del mes filtra
  -- por fecha sin pasar por las hojas.
  fecha           DATE NOT NULL,
  -- RESTRICT: un contratista con jornadas no se borra (se desactiva); el historial y el
  -- resumen del mes lo siguen nombrando.
  contratista_id  UUID NOT NULL REFERENCES hd_contratistas(id) ON DELETE RESTRICT,
  -- 0 = "todavía no sé cuántos": la hoja lo marca como problema hasta que se cargue.
  cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad BETWEEN 0 AND 60),
  nota            TEXT,
  orden           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hoja_id, contratista_id)
);
CREATE INDEX IF NOT EXISTS idx_hd_hoja_contratistas_fecha ON hd_hoja_contratistas(fecha, contratista_id);

CREATE OR REPLACE FUNCTION hd_hoja_contratista_fecha()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fecha := (SELECT fecha FROM hd_hojas WHERE id = NEW.hoja_id);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hd_hoja_contratista_fecha ON hd_hoja_contratistas;
CREATE TRIGGER hd_hoja_contratista_fecha BEFORE INSERT OR UPDATE ON hd_hoja_contratistas
  FOR EACH ROW EXECUTE FUNCTION hd_hoja_contratista_fecha();

DROP TRIGGER IF EXISTS hd_tocar ON hd_contratistas;
CREATE TRIGGER hd_tocar BEFORE UPDATE ON hd_contratistas FOR EACH ROW EXECUTE FUNCTION hd_tocar();

-- ========================
-- La hoja a cargo de un contratista
-- ========================
ALTER TABLE hd_hojas ADD COLUMN IF NOT EXISTS a_cargo_contratista_id UUID REFERENCES hd_contratistas(id) ON DELETE SET NULL;
-- Una hoja por día a cargo de cada contratista (su link es uno por día, como el de un capataz).
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_hojas_a_cargo_contratista ON hd_hojas(fecha, a_cargo_contratista_id)
  WHERE a_cargo_contratista_id IS NOT NULL;

-- ========================
-- Links y Telegram: el referente recibe como cualquiera
-- ========================
ALTER TABLE hd_links ADD COLUMN IF NOT EXISTS contratista_id UUID REFERENCES hd_contratistas(id) ON DELETE CASCADE;
ALTER TABLE hd_telegram_codigos ADD COLUMN IF NOT EXISTS contratista_id UUID REFERENCES hd_contratistas(id) ON DELETE CASCADE;
ALTER TABLE hd_telegram_mensajes ADD COLUMN IF NOT EXISTS contratista_id UUID REFERENCES hd_contratistas(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_links_contratista ON hd_links(fecha, contratista_id)
  WHERE contratista_id IS NOT NULL AND anulado_at IS NULL;

-- El CHECK de "de quién es" pasa de dos columnas a tres: exactamente una. Se borra el viejo
-- (sin nombre: Postgres lo llamó <tabla>_check) buscándolo por su definición, y se crea uno
-- con nombre. Idempotente: la segunda vez no encuentra el viejo y el nuevo ya está.
DO $chk$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['hd_links', 'hd_telegram_codigos'] LOOP
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = t::regclass AND contype = 'c'
        AND conname <> t || '_un_destinatario'
        AND pg_get_constraintdef(oid) ILIKE '%persona_id IS NULL%externa_id IS NULL%'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, r.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t::regclass AND conname = t || '_un_destinatario') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (num_nonnulls(persona_id, externa_id, contratista_id) = 1)', t, t || '_un_destinatario');
    END IF;
  END LOOP;
END
$chk$;

-- ========================
-- RLS: cerrada por permiso, como el resto del módulo
-- ========================
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hd_contratistas', 'hd_hoja_contratistas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: leer" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: leer" ON %I FOR SELECT TO authenticated USING ((SELECT hd_puede_ver()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: cargar" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: cargar" ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT hd_puede_editar()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: editar" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: editar" ON %I FOR UPDATE TO authenticated USING ((SELECT hd_puede_editar())) WITH CHECK ((SELECT hd_puede_editar()))', t);
    -- Borrar: lo necesita el Deshacer de un alta (un contratista con jornadas no se puede
    -- borrar igual: lo frena el RESTRICT de hd_hoja_contratistas).
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: borrar" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: borrar" ON %I FOR DELETE TO authenticated USING ((SELECT hd_puede_editar()))', t);
  END LOOP;
END
$rls$;
REVOKE ALL ON hd_contratistas, hd_hoja_contratistas FROM anon;

-- ========================
-- hd_aplicar (Deshacer y gestos a medias): las dos tablas nuevas en la lista blanca.
-- Es la misma función de 20261011000001; sólo cambia la lista de tablas permitidas.
-- ========================
CREATE OR REPLACE FUNCTION hd_aplicar(p_ops JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_op      JSONB;
  v_tabla   TEXT;
  v_id      UUID;
  v_antes   JSONB;
  v_despues JSONB;
  v_valores JSONB;
  v_cols    TEXT;
  v_set     TEXT;
  v_out     JSONB := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_ops) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'hd_aplicar: se esperaba una lista';
  END IF;
  FOR v_op IN SELECT x FROM jsonb_array_elements(p_ops) AS t(x) LOOP
    v_tabla := v_op->>'tabla';
    IF v_tabla IS NULL OR v_tabla NOT IN ('hd_hojas', 'hd_integrantes', 'hd_camiones_dia', 'hd_viajes', 'hd_pedidos',
                                          'hd_instrucciones', 'hd_ausencias', 'hd_links', 'hd_lugares',
                                          'hd_contratistas', 'hd_hoja_contratistas') THEN
      RAISE EXCEPTION 'hd_aplicar: tabla no permitida (%)', v_tabla;
    END IF;
    v_id := (v_op->>'id')::uuid;
    EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x.id = $1 FOR UPDATE', v_tabla) INTO v_antes USING v_id;

    IF v_op ? 'esperado' THEN
      IF jsonb_typeof(v_op->'esperado') = 'null' THEN
        IF v_antes IS NOT NULL THEN RAISE EXCEPTION 'HD_CAMBIO: % % ya existe', v_tabla, v_id; END IF;
      ELSIF v_antes IS NULL OR (v_antes - 'updated_at') IS DISTINCT FROM ((v_op->'esperado') - 'updated_at') THEN
        RAISE EXCEPTION 'HD_CAMBIO: % % cambió', v_tabla, v_id;
      END IF;
    END IF;

    CASE v_op->>'op'
      WHEN 'borrar' THEN
        IF v_antes IS NOT NULL THEN
          EXECUTE format('DELETE FROM %I WHERE id = $1', v_tabla) USING v_id;
        END IF;
      WHEN 'insertar', 'actualizar' THEN
        v_valores := (v_op->'valores') - 'updated_at';
        IF v_op->>'op' = 'actualizar' THEN
          v_valores := v_valores - 'id' - 'created_at';
          IF v_antes IS NULL THEN RAISE EXCEPTION 'HD_CAMBIO: % % ya no existe', v_tabla, v_id; END IF;
        ELSE
          v_valores := jsonb_set(v_valores, '{id}', to_jsonb(v_id::text));
        END IF;
        SELECT string_agg(quote_ident(c.column_name), ', '), string_agg(format('%I = r.%I', c.column_name, c.column_name), ', ')
          INTO v_cols, v_set
          FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = v_tabla AND v_valores ? c.column_name;
        IF v_cols IS NULL THEN RAISE EXCEPTION 'hd_aplicar: sin columnas para %', v_tabla; END IF;
        IF v_op->>'op' = 'insertar' THEN
          EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_record(NULL::%I, $1) r', v_tabla, v_cols, v_cols, v_tabla) USING v_valores;
        ELSE
          EXECUTE format('UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, $1) r WHERE t.id = $2', v_tabla, v_set, v_tabla) USING v_valores, v_id;
        END IF;
      ELSE
        RAISE EXCEPTION 'hd_aplicar: operación desconocida (%)', v_op->>'op';
    END CASE;

    EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x.id = $1', v_tabla) INTO v_despues USING v_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('tabla', v_tabla, 'id', v_id, 'antes', v_antes, 'despues', v_despues));
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION hd_aplicar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hd_aplicar(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
