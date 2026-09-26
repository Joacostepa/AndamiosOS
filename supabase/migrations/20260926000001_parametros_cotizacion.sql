-- ========================================================================
-- Parámetros de cotización — tarifas, lista de alquiler, criterio y renders
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: las reglas de precio viven en un documento (ABA Criterio de
-- Cotización v2, agosto 2026) que mezcla tres cosas distintas —números, una lista de piezas
-- y criterio escrito— y cada vez que cambia una tarifa hay que editar el documento, avisarle
-- a la IA y esperar que todos lean la versión nueva. En agosto, 80 de 150 líneas de bandeja
-- seguían saliendo a la tarifa de mayo: la tarifa estaba escrita pero no aplicada.
--
-- CÓMO: cada cosa en su lugar.
--   · cotizacion_parametros   → los NÚMEROS (tarifas, %, mínimos, recargos). Los lee el
--                               motor de precios (src/lib/cotizador/), que es el único que
--                               hace cuentas: la IA decide qué cotizar, no multiplica.
--   · lista_alquiler(+piezas) → la lista de piezas (JUN26), con versiones.
--   · cotizacion_criterios    → el CRITERIO escrito, versionado. Es lo que lee el asistente.
--     La semilla es el v2 con los números vigentes reemplazados por referencias a los
--     parámetros: si el texto repitiera "$140.000", al cambiar la tarifa quedarían dos
--     números vivos. Los casos históricos se conservan con sus valores de la época.
--   · cotizacion_renders      → la biblioteca de renders por tipo de sistema.
--
-- QUIÉN ESCRIBE: sólo por funciones SECURITY DEFINER que chequean el permiso
-- "parametros-cotizacion: editar" y dejan el cambio en el historial EN LA MISMA
-- TRANSACCIÓN. Un UPDATE directo desde el navegador podría cambiar una tarifa sin dejar
-- rastro, y de un número de precio siempre hay que poder contestar quién, cuándo y por qué.
--
-- El bucket `comercial` es privado y SIN políticas para usuarios: lo leen y lo escriben las
-- rutas del servidor (service role, después de chequear el permiso) y el navegador sube con
-- URLs firmadas. Ahí van renders, PDFs de propuestas y adjuntos del asistente.
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push: el historial remoto está vacío.)

DO $mig$ BEGIN

  -- ── Permiso ───────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.cotizacion_puede_editar()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT COALESCE((
      SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'parametros-cotizacion' = 'editar')
      FROM public.user_profiles p WHERE p.id = auth.uid()
    ), false);
  $fn$;

  -- ── Parámetros (los números) ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cotizacion_parametros (
    clave          TEXT PRIMARY KEY,
    grupo          TEXT NOT NULL,
    etiqueta       TEXT NOT NULL,
    descripcion    TEXT,
    -- monto: pesos · porcentaje: 35 = 35 % · rango: valor_min..valor_max · factor: 1,15 ·
    -- numero: días, metros, personas · texto: valores no numéricos (modelo del asistente).
    tipo           TEXT NOT NULL CHECK (tipo IN ('monto', 'porcentaje', 'rango', 'factor', 'numero', 'texto')),
    unidad         TEXT,
    valor          NUMERIC(16,4),
    valor_min      NUMERIC(16,4),
    valor_max      NUMERIC(16,4),
    texto          TEXT,
    vigente_desde  DATE,
    orden          INT NOT NULL DEFAULT 0,
    updated_by     UUID REFERENCES user_profiles(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cotizacion_parametros_forma CHECK (
      (tipo = 'rango' AND valor_min IS NOT NULL AND valor_max IS NOT NULL AND valor_min <= valor_max)
      OR (tipo = 'texto')
      OR (tipo NOT IN ('rango', 'texto') AND valor IS NOT NULL)
    )
  );

  -- ── Historial de todo lo que se toca acá ──────────────────────────────────
  -- Append-only y con motivo obligatorio: es la respuesta a "¿desde cuándo la bandeja está
  -- a este precio y quién la cambió?". También registra criterio y listas (clave
  -- 'criterio' o 'lista:<id>'), para que el historial sea uno solo.
  CREATE TABLE IF NOT EXISTS cotizacion_parametros_cambios (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clave       TEXT NOT NULL,
    antes       JSONB,
    despues     JSONB,
    motivo      TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
    autor_id    UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_cotizacion_cambios_fecha ON cotizacion_parametros_cambios(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_cotizacion_cambios_clave ON cotizacion_parametros_cambios(clave, created_at DESC);

  -- ── Criterio escrito, versionado ──────────────────────────────────────────
  -- Editar = versión nueva. Nunca se pisa una versión: una propuesta vieja tiene que poder
  -- explicarse con el criterio que estaba vigente cuando se hizo.
  CREATE TABLE IF NOT EXISTS cotizacion_criterios (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version     INT NOT NULL UNIQUE,
    contenido   TEXT NOT NULL,
    notas       TEXT,
    vigente     BOOLEAN NOT NULL DEFAULT false,
    autor_id    UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cotizacion_criterios_una_vigente
    ON cotizacion_criterios(vigente) WHERE vigente;

  -- ── Lista de alquiler (piezas) ────────────────────────────────────────────
  -- Una lista por vigencia (JUN26, la que venga). Precio por pieza y por período de 30 días,
  -- neto. Las viejas quedan: el alquiler de una obra cotizada en julio se explica con JUN26.
  CREATE TABLE IF NOT EXISTS lista_alquiler (
    id             TEXT PRIMARY KEY,
    nombre         TEXT NOT NULL,
    vigente_desde  DATE,
    vigente        BOOLEAN NOT NULL DEFAULT false,
    origen         TEXT,
    notas          TEXT,
    autor_id       UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_lista_alquiler_una_vigente
    ON lista_alquiler(vigente) WHERE vigente;

  CREATE TABLE IF NOT EXISTS lista_alquiler_piezas (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lista_id     TEXT NOT NULL REFERENCES lista_alquiler(id) ON DELETE CASCADE,
    codigo       TEXT NOT NULL,
    descripcion  TEXT NOT NULL,
    precio       NUMERIC(14,2) NOT NULL CHECK (precio >= 0),
    orden        INT NOT NULL DEFAULT 0,
    UNIQUE (lista_id, codigo)
  );
  CREATE INDEX IF NOT EXISTS idx_lista_alquiler_piezas_lista ON lista_alquiler_piezas(lista_id, orden);

  -- ── Productos de Odoo que usa una propuesta ───────────────────────────────
  -- El motor de precios arma cada línea con uno de estos, nunca con un id que escriba la IA:
  -- Odoo no tiene precios (list_price = $1 en todo el catálogo) y crear un producto por error
  -- ensucia el catálogo para siempre. `unica_vez` define qué queda fuera de la base de la
  -- renovación (ingeniería, S&H, gestoría, flete). `verificado_*` lo llena el chequeo contra
  -- Odoo de la pantalla de Parámetros: un producto archivado en Odoo se ve antes de cotizar.
  CREATE TABLE IF NOT EXISTS cotizacion_productos_odoo (
    clave          TEXT PRIMARY KEY,
    product_id     INT NOT NULL,
    nombre         TEXT NOT NULL,
    unidad         TEXT,
    is_rental      BOOLEAN NOT NULL,
    unica_vez      BOOLEAN NOT NULL DEFAULT false,
    uso            TEXT,
    activo         BOOLEAN NOT NULL DEFAULT true,
    verificado_at  TIMESTAMPTZ,
    verificado_ok  BOOLEAN,
    verificado_nombre TEXT
  );

  -- ── Renders ───────────────────────────────────────────────────────────────
  -- Los genéricos por tipo de sistema que el asistente ofrece cuando no hay uno de la obra.
  CREATE TABLE IF NOT EXISTS cotizacion_renders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo         TEXT NOT NULL,
    nombre       TEXT NOT NULL,
    path         TEXT NOT NULL UNIQUE,
    por_defecto  BOOLEAN NOT NULL DEFAULT false,
    autor_id     UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cotizacion_renders_default
    ON cotizacion_renders(tipo) WHERE por_defecto;

  -- ── Lectura para cualquiera con sesión; escritura sólo por las funciones ─────
  ALTER TABLE cotizacion_parametros          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_parametros_cambios  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_criterios           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE lista_alquiler                 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE lista_alquiler_piezas          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_renders             ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cotizacion_productos_odoo      ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Autenticados ven productos de cotizacion" ON cotizacion_productos_odoo;
  CREATE POLICY "Autenticados ven productos de cotizacion" ON cotizacion_productos_odoo FOR SELECT TO authenticated USING (true);

  DROP POLICY IF EXISTS "Autenticados ven parametros" ON cotizacion_parametros;
  CREATE POLICY "Autenticados ven parametros" ON cotizacion_parametros FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Autenticados ven cambios de parametros" ON cotizacion_parametros_cambios;
  CREATE POLICY "Autenticados ven cambios de parametros" ON cotizacion_parametros_cambios FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Autenticados ven criterios" ON cotizacion_criterios;
  CREATE POLICY "Autenticados ven criterios" ON cotizacion_criterios FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Autenticados ven listas de alquiler" ON lista_alquiler;
  CREATE POLICY "Autenticados ven listas de alquiler" ON lista_alquiler FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Autenticados ven piezas de alquiler" ON lista_alquiler_piezas;
  CREATE POLICY "Autenticados ven piezas de alquiler" ON lista_alquiler_piezas FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Autenticados ven renders" ON cotizacion_renders;
  CREATE POLICY "Autenticados ven renders" ON cotizacion_renders FOR SELECT TO authenticated USING (true);

  -- ── Cambiar un parámetro ──────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.cotizacion_parametro_actualizar(
    p_clave text, p_valor numeric, p_valor_min numeric, p_valor_max numeric,
    p_texto text, p_vigente_desde date, p_motivo text
  )
  RETURNS cotizacion_parametros
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE
    v_antes cotizacion_parametros;
    v_despues cotizacion_parametros;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para editar los parámetros de cotización';
    END IF;
    IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
      RAISE EXCEPTION 'Contá por qué cambia: el motivo queda en el historial';
    END IF;

    SELECT * INTO v_antes FROM cotizacion_parametros WHERE clave = p_clave FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El parámetro % no existe', p_clave; END IF;

    UPDATE cotizacion_parametros SET
      valor = CASE WHEN tipo IN ('rango', 'texto') THEN NULL ELSE p_valor END,
      valor_min = CASE WHEN tipo = 'rango' THEN p_valor_min ELSE NULL END,
      valor_max = CASE WHEN tipo = 'rango' THEN p_valor_max ELSE NULL END,
      texto = CASE WHEN tipo = 'texto' THEN p_texto ELSE texto END,
      vigente_desde = COALESCE(p_vigente_desde, current_date),
      updated_by = auth.uid(),
      updated_at = now()
    WHERE clave = p_clave
    RETURNING * INTO v_despues;

    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo)
    VALUES (
      p_clave,
      jsonb_build_object('valor', v_antes.valor, 'valor_min', v_antes.valor_min, 'valor_max', v_antes.valor_max,
                         'texto', v_antes.texto, 'vigente_desde', v_antes.vigente_desde),
      jsonb_build_object('valor', v_despues.valor, 'valor_min', v_despues.valor_min, 'valor_max', v_despues.valor_max,
                         'texto', v_despues.texto, 'vigente_desde', v_despues.vigente_desde),
      trim(p_motivo)
    );
    RETURN v_despues;
  END;
  $fn$;

  -- ── Versión nueva del criterio ────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.cotizacion_criterio_nueva_version(p_contenido text, p_notas text)
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE v_version int; v_anterior int;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para editar el criterio de cotización';
    END IF;
    IF p_contenido IS NULL OR length(trim(p_contenido)) < 200 THEN
      RAISE EXCEPTION 'El criterio quedó vacío o demasiado corto';
    END IF;
    -- Serializa dos ediciones simultáneas: la segunda espera y toma el número siguiente.
    LOCK TABLE cotizacion_criterios IN SHARE ROW EXCLUSIVE MODE;
    SELECT version INTO v_anterior FROM cotizacion_criterios WHERE vigente;
    SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM cotizacion_criterios;
    UPDATE cotizacion_criterios SET vigente = false WHERE vigente;
    INSERT INTO cotizacion_criterios (version, contenido, notas, vigente)
    VALUES (v_version, p_contenido, NULLIF(trim(COALESCE(p_notas, '')), ''), true);
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo)
    VALUES ('criterio', jsonb_build_object('version', v_anterior), jsonb_build_object('version', v_version),
            COALESCE(NULLIF(trim(COALESCE(p_notas, '')), ''), 'Nueva versión del criterio'));
    RETURN v_version;
  END;
  $fn$;

  -- ── Lista de alquiler: crear (importada o ajustada) y activar ─────────────
  -- p_piezas: [{ "codigo": "...", "descripcion": "...", "precio": 1234.5 }, ...]
  CREATE OR REPLACE FUNCTION public.lista_alquiler_crear(
    p_id text, p_nombre text, p_vigente_desde date, p_origen text, p_notas text,
    p_piezas jsonb, p_activar boolean
  )
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE v_cantidad int; v_anterior text;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para editar las listas de alquiler';
    END IF;
    IF p_id IS NULL OR p_id !~ '^[A-Za-z0-9_-]{2,20}$' THEN
      RAISE EXCEPTION 'El nombre corto de la lista tiene que ser como JUN26 (letras, números, - o _)';
    END IF;
    IF EXISTS (SELECT 1 FROM lista_alquiler WHERE id = p_id) THEN
      RAISE EXCEPTION 'Ya existe una lista %: usá otro nombre corto', p_id;
    END IF;
    IF jsonb_typeof(p_piezas) <> 'array' OR jsonb_array_length(p_piezas) = 0 THEN
      RAISE EXCEPTION 'La lista no tiene piezas';
    END IF;

    INSERT INTO lista_alquiler (id, nombre, vigente_desde, origen, notas)
    VALUES (p_id, p_nombre, p_vigente_desde, p_origen, p_notas);

    INSERT INTO lista_alquiler_piezas (lista_id, codigo, descripcion, precio, orden)
    SELECT p_id, trim(e->>'codigo'), trim(e->>'descripcion'), round((e->>'precio')::numeric, 2), ord::int
    FROM jsonb_array_elements(p_piezas) WITH ORDINALITY AS t(e, ord);
    GET DIAGNOSTICS v_cantidad = ROW_COUNT;

    IF p_activar THEN
      SELECT id INTO v_anterior FROM lista_alquiler WHERE vigente;
      UPDATE lista_alquiler SET vigente = false WHERE vigente;
      UPDATE lista_alquiler SET vigente = true WHERE id = p_id;
    END IF;

    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo)
    VALUES ('lista:' || p_id, jsonb_build_object('vigente', v_anterior),
            jsonb_build_object('lista', p_id, 'piezas', v_cantidad, 'activada', p_activar, 'origen', p_origen),
            COALESCE(NULLIF(trim(COALESCE(p_notas, '')), ''), 'Lista nueva ' || p_id));
    RETURN v_cantidad;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.lista_alquiler_activar(p_id text, p_motivo text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE v_anterior text;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para editar las listas de alquiler';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM lista_alquiler WHERE id = p_id) THEN
      RAISE EXCEPTION 'La lista % no existe', p_id;
    END IF;
    SELECT id INTO v_anterior FROM lista_alquiler WHERE vigente;
    UPDATE lista_alquiler SET vigente = false WHERE vigente;
    UPDATE lista_alquiler SET vigente = true WHERE id = p_id;
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo)
    VALUES ('lista:' || p_id, jsonb_build_object('vigente', v_anterior), jsonb_build_object('vigente', p_id),
            COALESCE(NULLIF(trim(COALESCE(p_motivo, '')), ''), 'Lista ' || p_id || ' pasa a vigente'));
  END;
  $fn$;

  -- ── Renders: alta, baja y "por defecto" ────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.cotizacion_render_guardar(p_tipo text, p_nombre text, p_path text, p_por_defecto boolean)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE v_id uuid;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para cargar renders';
    END IF;
    IF p_por_defecto THEN
      UPDATE cotizacion_renders SET por_defecto = false WHERE tipo = p_tipo AND por_defecto;
    END IF;
    INSERT INTO cotizacion_renders (tipo, nombre, path, por_defecto)
    VALUES (p_tipo, p_nombre, p_path, p_por_defecto)
    RETURNING id INTO v_id;
    RETURN v_id;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cotizacion_render_por_defecto(p_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE v_tipo text;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para editar renders';
    END IF;
    SELECT tipo INTO v_tipo FROM cotizacion_renders WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El render no existe'; END IF;
    UPDATE cotizacion_renders SET por_defecto = false WHERE tipo = v_tipo AND por_defecto;
    UPDATE cotizacion_renders SET por_defecto = true WHERE id = p_id;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cotizacion_render_borrar(p_id uuid)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE v_path text;
  BEGIN
    IF NOT cotizacion_puede_editar() THEN
      RAISE EXCEPTION 'No tenés permiso para borrar renders';
    END IF;
    DELETE FROM cotizacion_renders WHERE id = p_id RETURNING path INTO v_path;
    RETURN v_path;
  END;
  $fn$;

  REVOKE ALL ON FUNCTION public.cotizacion_parametro_actualizar(text, numeric, numeric, numeric, text, date, text) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.cotizacion_criterio_nueva_version(text, text) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.lista_alquiler_crear(text, text, date, text, text, jsonb, boolean) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.lista_alquiler_activar(text, text) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.cotizacion_render_guardar(text, text, text, boolean) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.cotizacion_render_por_defecto(uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.cotizacion_render_borrar(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.cotizacion_parametro_actualizar(text, numeric, numeric, numeric, text, date, text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cotizacion_criterio_nueva_version(text, text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.lista_alquiler_crear(text, text, date, text, text, jsonb, boolean) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.lista_alquiler_activar(text, text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cotizacion_render_guardar(text, text, text, boolean) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cotizacion_render_por_defecto(uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cotizacion_render_borrar(uuid) TO authenticated;

  -- ── Bucket privado ────────────────────────────────────────────────────────
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('comercial', 'comercial', false)
  ON CONFLICT (id) DO NOTHING;

  -- ── Semilla: los números del criterio v2 (agosto 2026) ─────────────────────
  -- ON CONFLICT DO NOTHING: re-correr la migración nunca pisa un valor ya editado.
  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, valor_min, valor_max, texto, vigente_desde, orden) VALUES
  -- Reglas generales
  ('iva_pct', 'generales', 'IVA', 'Se cobra y se ingresa siempre, aunque el cliente sea exento.', 'porcentaje', '%', 21, NULL, NULL, NULL, '2026-08-01', 10),
  ('validez_dias', 'generales', 'Validez de la oferta', 'Días corridos desde la emisión.', 'numero', 'días', 15, NULL, NULL, NULL, '2026-08-01', 20),
  ('periodo_minimo_dias', 'generales', 'Período mínimo de alquiler', 'Aunque pidan 4 días o precio por día: se cobra el primer período completo.', 'numero', 'días', 30, NULL, NULL, NULL, '2026-08-01', 30),
  ('renovacion_obra_pct', 'generales', 'Renovación de bandejas y fachadas', 'Porcentaje del canon locativo del primer mes que se factura por cada mes siguiente. Nunca sobre el subtotal: quedan fuera los ítems de única vez.', 'porcentaje', '%', 35, NULL, NULL, NULL, '2026-08-01', 40),
  ('renovacion_alquiler_puro_pct', 'generales', 'Renovación de alquiler puro', 'Alquiler sin montaje: no hay mano de obra que descontar.', 'porcentaje', '%', 100, NULL, NULL, NULL, '2026-08-01', 50),
  ('corte_mo_pct', 'generales', 'Corte de mano de obra', 'Si la mano de obra supera este % del primer mes, el esquema todo incluido deja de servir: se abre en mano de obra por única vez + alquiler mensual.', 'porcentaje', '%', 50, NULL, NULL, NULL, '2026-08-01', 60),
  ('plazo_inicio_dias_habiles', 'generales', 'Plazo de inicio', 'Días hábiles estimados para empezar el montaje desde la acreditación del anticipo y la habilitación del personal.', 'numero', 'días hábiles', 7, NULL, NULL, NULL, '2026-08-01', 70),
  -- Bandejas y pantallas
  ('bandeja_3m_ml', 'bandejas', 'Bandeja 3 m', 'Altura estándar. Primer mes todo incluido (alquiler, armado, desarme, traslados y costos operativos). Evolución: $100.000 feb-26, $110.000/$120.000 may-jun, $140.000 desde jul-26.', 'monto', '$/m.l.', 140000, NULL, NULL, NULL, '2026-07-01', 10),
  ('bandeja_6m_ml', 'bandejas', 'Bandeja 6 m', 'Es un rango, no un valor: manda el volumen (43,88 m.l. a $175.000; 8,66 m.l. a $210.000), la complejidad del apoyo y el contexto comercial. Fuera del rango, preguntar.', 'rango', '$/m.l.', NULL, 175000, 210000, NULL, '2026-08-01', 20),
  ('bandeja_8m_ml', 'bandejas', 'Bandeja 8 m', 'Referencia Fontana, Esmeralda 570 (36 m.l.).', 'monto', '$/m.l.', 235000, NULL, NULL, NULL, '2026-08-01', 30),
  ('bandeja_minimo_ml', 'bandejas', 'Mínimo facturable de bandeja', 'La medida real va en el texto de la propuesta; el mínimo va en el importe y se declara en el alcance.', 'numero', 'm.l.', 10, NULL, NULL, NULL, '2026-08-01', 40),
  ('concertina_pct', 'bandejas', 'Concertina perimetral', 'Porcentaje del valor del metro lineal de la bandeja. Se factura sobre los m.l. facturables (también con el mínimo). Va como opcional salvo que el cliente la haya pedido.', 'porcentaje', '% del m.l.', 10, NULL, NULL, NULL, '2026-08-01', 50),
  -- Fachadas
  ('fachada_lista_m2', 'fachadas', 'Fachada — valor de lista', 'Valor de lista CABA: estructura con bandeja en PB y 1-2 filas de tablones. Base del encuadre B (lista con bonificación declarada; la renovación se calcula sobre lista).', 'monto', '$/m²', 45000, NULL, NULL, NULL, '2026-08-01', 10),
  ('fachada_licitacion_m2', 'fachadas', 'Fachada — piso de licitación', 'Piso competitivo con gestoría e ingeniería absorbidas (AGE, Perú 160).', 'monto', '$/m²', 35000, NULL, NULL, NULL, '2026-08-01', 20),
  ('fachada_estandar_m2', 'fachadas', 'Fachada — estándar', 'Estructura con bandeja en PB, 1-2 filas de tablones.', 'rango', '$/m²', NULL, 40000, 45000, NULL, '2026-08-01', 30),
  ('fachada_escaleras_m2', 'fachadas', 'Fachada — con núcleo de escaleras', 'Núcleo de escaleras interno, 2 filas completas, media sombra.', 'monto', '$/m²', 50000, NULL, NULL, NULL, '2026-08-01', 40),
  ('fachada_completa_m2', 'fachadas', 'Fachada — completa o superficie chica', 'Bandeja + media sombra + 2 filas de tablones, o superficie chica.', 'rango', '$/m²', NULL, 60000, 75000, NULL, '2026-08-01', 50),
  ('fachada_compleja_m2', 'fachadas', 'Fachada — acceso comprometido', 'Interior, patio, acceso comprometido, fases con remobilización.', 'rango', '$/m²', NULL, 80000, 95000, NULL, '2026-08-01', 60),
  ('fachada_especial_m2', 'fachadas', 'Fachada — fuera del AMBA o patrimonial', 'Fuera del AMBA, o envolvente patrimonial de alta exigencia (Torre del Reloj, Quequén).', 'rango', '$/m²', NULL, 122000, 124000, NULL, '2026-08-01', 70),
  ('fachada_salto_altura_a_pct', 'fachadas', 'Salto del tramo alto — opción A', 'Altura moderada, acceso normal. Se promedia con el tramo bajo en un renglón único.', 'porcentaje', '%', 25, NULL, NULL, NULL, '2026-08-01', 80),
  ('fachada_salto_altura_b_pct', 'fachadas', 'Salto del tramo alto — opción B', 'Edificio alto con caída marcada de rendimiento (referencia Ayacucho 1075).', 'porcentaje', '%', 44, NULL, NULL, NULL, '2026-08-01', 90),
  -- Alquiler sin montaje
  ('alquiler_recargo_lista_pct', 'alquiler', 'Recargo sobre la lista de alquiler', 'Canon de 30 días = pieza por pieza a la lista vigente, más este recargo comercial.', 'porcentaje', '%', 80, NULL, NULL, NULL, '2026-08-01', 10),
  ('alquiler_fuera_lista_pct', 'alquiler', 'Canon de ítems fuera de lista', 'Canon mensual como % del valor de compra neto (equivale a 1,8x la lista implícita). Nunca se apila con el recargo sobre lista.', 'porcentaje', '% del valor de compra', 7.5, NULL, NULL, NULL, '2026-08-01', 20),
  -- Venta de material
  ('venta_amortizacion_a_meses', 'venta', 'Venta — amortización opción A', 'Meses de canon para derivar el precio de venta (criterio Merba). Siempre preguntar: no hay default.', 'numero', 'meses', 36, NULL, NULL, NULL, '2026-08-01', 10),
  ('venta_amortizacion_b_meses', 'venta', 'Venta — amortización opción B', 'Equivale a la lista propia en USD.', 'numero', 'meses', 24, NULL, NULL, NULL, '2026-08-01', 20),
  -- Complementarios
  ('gestoria_caba', 'complementarios', 'Gestoría permiso vía pública (CABA)', 'Sólo CABA. Fuera de CABA cambia el ítem y probablemente el valor: si no está confirmado, dejarlo afuera. Va como opcional.', 'monto', '$', 350000, NULL, NULL, NULL, '2026-08-01', 10),
  ('media_sombra_m2', 'complementarios', 'Media sombra', 'Sube la carga de viento: puede exigir anclajes adicionales (decirlo en la propuesta).', 'monto', '$/m²', 3500, NULL, NULL, NULL, '2026-08-01', 20),
  ('fenolico_18mm_m2', 'complementarios', 'Fenólico 18 mm (estimado)', 'No está en lista: validar antes de usarlo en volumen.', 'monto', '$/m²', 32000, NULL, NULL, NULL, '2026-08-01', 30),
  ('ingenieria', 'complementarios', 'Ingeniería (habitual)', 'Línea propia, única vez. Va de $750.000 (torre simple) a $6.500.000 (Torre del Reloj).', 'rango', '$', NULL, 1250000, 3500000, NULL, '2026-08-01', 40),
  ('ingenieria_torre_simple', 'complementarios', 'Ingeniería — torre simple', 'Piso de la ingeniería.', 'monto', '$', 750000, NULL, NULL, NULL, '2026-08-01', 50),
  ('syh', 'complementarios', 'Seguridad e Higiene', 'Según jornadas. En obras chicas va en Aclaraciones, no como línea. Única vez.', 'rango', '$', NULL, 1200000, 5500000, NULL, '2026-08-01', 60),
  ('flete_gba_cercano', 'complementarios', 'Flete GBA cercano', 'Fuera de CABA va como renglón aparte.', 'monto', '$', 850000, NULL, NULL, NULL, '2026-08-01', 70),
  ('flete_caba', 'complementarios', 'Flete CABA', 'Según volumen y acceso.', 'rango', '$', NULL, 1200000, 2400000, NULL, '2026-08-01', 80),
  ('flete_la_plata', 'complementarios', 'Flete La Plata', 'Referencia.', 'monto', '$', 2500000, NULL, NULL, NULL, '2026-08-01', 90),
  -- Mano de obra
  ('uocra_persona_jornada', 'mano_obra', 'Persona-jornada UOCRA', 'Escala UOCRA CCT 76/75 Zona A con carga patronal completa (~2,06x). Agosto 2026: oficial $6.348/h. Se actualiza con cada revisión salarial.', 'monto', '$/jornada', 118835, NULL, NULL, NULL, '2026-08-01', 10),
  ('mo_recargo_estandar_pct', 'mano_obra', 'Recargo estándar sobre UOCRA', 'Criterio estándar.', 'porcentaje', '%', 70, NULL, NULL, NULL, '2026-08-01', 20),
  ('mo_recargo_alto_pct', 'mano_obra', 'Recargo alto sobre UOCRA', 'Según trabajo; es la opción A (bottom-up) en obra industrial.', 'porcentaje', '%', 100, NULL, NULL, NULL, '2026-08-01', 30),
  ('mo_industria_cuadrilla', 'mano_obra', 'Jornada industrial top-down (cuadrilla de 5)', 'Comparable del mes +20 % por contexto industrial (opción B en obra industrial). Usada en INTECO, ETEC, Casa de la Cultura.', 'monto', '$/jornada', 1150000, NULL, NULL, NULL, '2026-08-01', 40),
  ('mo_cuadrilla_personas', 'mano_obra', 'Cuadrilla por defecto', 'Personas por cuadrilla si no se indica otra cosa.', 'numero', 'personas', 5, NULL, NULL, NULL, '2026-08-01', 50),
  ('recargo_sabado_pct', 'mano_obra', 'Recargo sábado', NULL, 'porcentaje', '%', 50, NULL, NULL, NULL, '2026-08-01', 60),
  ('recargo_domingo_pct', 'mano_obra', 'Recargo domingo', 'Domingo = x2.', 'porcentaje', '%', 100, NULL, NULL, NULL, '2026-08-01', 70),
  ('recargo_nocturno_pct', 'mano_obra', 'Recargo nocturno', 'Entre x1,5 y x2.', 'rango', '%', NULL, 50, 100, NULL, '2026-08-01', 80),
  ('recargo_adversas_pct', 'mano_obra', 'Recargo condiciones adversas', 'Voladizo, acarreo vertical, altura de campanario.', 'porcentaje', '%', 10, NULL, NULL, NULL, '2026-08-01', 90),
  ('productividad_hasta_10m', 'mano_obra', 'Productividad hasta 10 m', 'Factor de jornadas por altura sobre el apoyo (Torre del Reloj). Las franjas intermedias de 10 en 10 m son una interpretación: ajustar si hace falta.', 'factor', 'x', 1.00, NULL, NULL, NULL, '2026-08-01', 100),
  ('productividad_10_20m', 'mano_obra', 'Productividad 10 a 20 m', NULL, 'factor', 'x', 1.15, NULL, NULL, NULL, '2026-08-01', 110),
  ('productividad_20_30m', 'mano_obra', 'Productividad 20 a 30 m', NULL, 'factor', 'x', 1.30, NULL, NULL, NULL, '2026-08-01', 120),
  ('productividad_30_40m', 'mano_obra', 'Productividad 30 a 40 m', NULL, 'factor', 'x', 1.50, NULL, NULL, NULL, '2026-08-01', 130),
  ('productividad_mas_40m', 'mano_obra', 'Productividad más de 40 m', NULL, 'factor', 'x', 1.75, NULL, NULL, NULL, '2026-08-01', 140),
  -- Fuera de radio
  ('viaje_jornada_pct', 'viaticos', 'Jornada de viaje', 'Las jornadas de viaje se cobran a este % de la jornada.', 'porcentaje', '%', 60, NULL, NULL, NULL, '2026-08-01', 10),
  ('alojamiento_persona_noche', 'viaticos', 'Alojamiento', 'Por persona y por noche. En temporada alta conviene cotizar contra presupuesto cerrado del hotel.', 'monto', '$', 95000, NULL, NULL, NULL, '2026-08-01', 20),
  ('comida_persona_dia', 'viaticos', 'Comida', 'Por persona y por día.', 'monto', '$', 50000, NULL, NULL, NULL, '2026-08-01', 30),
  ('movilizacion_minimo_dias', 'viaticos', 'Mínimo de una movilización', 'Toda movilización cuenta este mínimo de días: la cuadrilla duerme allá.', 'numero', 'días', 2, NULL, NULL, NULL, '2026-08-01', 40),
  -- Asistente
  ('asistente_modelo', 'asistente', 'Modelo del asistente', 'claude-opus-5 es el default. claude-fable-5-1 es el más capaz: cuesta el doble y es más lento.', 'texto', NULL, NULL, NULL, NULL, 'claude-opus-5', '2026-09-26', 10),
  ('asistente_esfuerzo', 'asistente', 'Esfuerzo en el chat', 'low, medium, high, xhigh o max. Más esfuerzo: respuestas más pensadas, más lentas y más caras.', 'texto', NULL, NULL, NULL, NULL, 'high', '2026-09-26', 20),
  ('asistente_esfuerzo_voz', 'asistente', 'Esfuerzo en la voz', 'En voz la demora se nota más: conviene uno más bajo que en el chat.', 'texto', NULL, NULL, NULL, NULL, 'medium', '2026-09-26', 30),
  ('asistente_tope_diario_usd', 'asistente', 'Tope diario por persona', 'Gasto estimado máximo por persona y por día, en dólares. Al llegar, el asistente avisa y deja de responder hasta el día siguiente.', 'numero', 'US$', 30, NULL, NULL, NULL, '2026-09-26', 40),
  -- Odoo: los ids fijos con los que se arma una orden. Técnicos: sólo se tocan si cambian en Odoo.
  ('odoo_impuesto_iva_id', 'odoo', 'Impuesto IVA 21 % (id)', 'account.tax que se pone en cada línea.', 'numero', 'id', 88, NULL, NULL, NULL, '2026-09-26', 10),
  ('odoo_termino_pago_id', 'odoo', 'Término de pago (id)', '"50 % anticipado, 50 % saldo al finalizar el montaje".', 'numero', 'id', 11, NULL, NULL, NULL, '2026-09-26', 20),
  ('odoo_lista_precios_id', 'odoo', 'Lista de precios ARS (id)', NULL, 'numero', 'id', 1, NULL, NULL, NULL, '2026-09-26', 30),
  ('odoo_plantilla_mail_id', 'odoo', 'Plantilla de mail de la propuesta (id)', 'mail.template "Propuesta Técnico-Económica ABA": manda sólo nuestro PDF.', 'numero', 'id', 65, NULL, NULL, NULL, '2026-09-26', 40),
  ('odoo_tecnico_default', 'odoo', 'Técnico por defecto', 'Empleado (hr.employee) que va en "Técnico asignado" si el vendedor no dice otro.', 'texto', NULL, NULL, NULL, NULL, 'Joaquín Stepansky', '2026-09-26', 50)
  ON CONFLICT (clave) DO NOTHING;

  -- ── Semilla: productos (tabla de la skill andamios-propuesta, references/odoo.md) ─────
  INSERT INTO cotizacion_productos_odoo (clave, product_id, nombre, unidad, is_rental, unica_vez, uso) VALUES
  ('alquiler_sin_montaje', 143, 'ALQUILER DE ESTRUCTURA MULTIDIRECCIONAL SIN MONTAJE', 'unidad', true, false, 'Sólo alquiler: el cliente arma'),
  ('estructura_tubular', 165, 'ESTRUCTURA TUBULAR (ALQUILER Y MONTAJE)', 'unidad', true, false, 'Torres y estructuras con montaje'),
  ('fachada_m2', 156, 'ESTRUCTURA PARA FACHADA POR M2 (ALQUILER Y MONTAJE)', 'm²', true, false, 'Fachadas, primer mes todo incluido'),
  ('apuntalamiento', 157, 'ESTRUCTURA DE APUNTALAMIENTO (ALQUILER Y MONTAJE)', 'unidad', true, false, 'Apuntalamientos'),
  ('plataforma_m2', 161, 'PLATAFORMA POR M2 (ALQUILER Y MONTAJE)', 'm²', true, false, 'Plataformas'),
  ('bandeja_ml', 144, 'PANTALLA / BANDEJA DE PROTECCIÓN POR M/L (ALQUILER Y MONTAJE)', 'm.l.', true, false, 'Bandejas y pantallas, primer mes todo incluido'),
  ('concertina_ml', 145, 'ALAMBRE TIPO CONCERTINA PARA PANTALLA PROTECCIÓN POR M/L (ALQUILER Y MONTAJE)', 'm.l.', true, false, 'Seguridad perimetral sobre la bandeja'),
  ('escenario', 168, 'ALQUILER DE ESCENARIO', 'unidad', true, false, 'Eventos'),
  ('tribuna', 169, 'ALQUILER DE TRIBUNA PARA EVENTO', 'unidad', true, false, 'Eventos'),
  ('mangrullo', 553, 'ALQUILER DE MANGRULLO PARA EVENTO', 'unidad', true, false, 'Eventos'),
  ('estructura_evento', 172, 'ESTRUCTURAS PARA EVENTO (ALQUILER Y MONTAJE)', 'unidad', true, false, 'Eventos'),
  ('ingenieria', 174, 'SERVICIO DE INGENIERÍA / ARQ. DIR. DE OBRA', 'unidad', false, true, 'Ingeniería, memoria de cálculo, planos y firma'),
  ('gestoria_permiso', 146, 'SERVICIO GESTIÓN PERMISO IMPLANTACIÓN DE ANDAMIO EN VÍA PÚBLICA', 'unidad', false, true, 'Permiso GCBA'),
  ('seguridad_higiene', 147, 'SERVICIO DE SEGURIDAD E HIGIENE EN OBRA', 'unidad', false, true, 'S&H'),
  ('traslado', 218, 'Servicio de Traslado', 'unidad', false, true, 'Fletes, acarreos y viáticos (envío y retiro)'),
  ('minimo_operativo', 170, 'MÍNIMO OPERATIVO Andamios Bs. As.', 'unidad', true, false, 'Costo operativo mínimo'),
  ('renovacion_fachada', 158, 'ESTRUCTURA PARA FACHADA POR M2 (RENOVACIÓN ALQUILER)', 'm²', true, false, 'Renovación sin montaje'),
  ('renovacion_pantalla', 159, 'PANTALLA / BANDEJA DE PROTECCIÓN POR M/L (RENOVACIÓN ALQUILER)', 'm.l.', true, false, 'Renovación sin montaje'),
  ('renovacion_plataforma', 162, 'PLATAFORMA POR M2 (RENOVACIÓN ALQUILER)', 'm²', true, false, 'Renovación sin montaje'),
  ('renovacion_apuntalamiento', 163, 'ESTRUCTURA DE APUNTALAMIENTO (RENOVACIÓN ALQUILER)', 'unidad', true, false, 'Renovación sin montaje'),
  ('renovacion_tubular', 166, 'ESTRUCTURA TUBULAR (RENOVACIÓN ALQUILER)', 'unidad', true, false, 'Renovación sin montaje'),
  ('renovacion_alquiler_simple', 193, 'RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)', 'unidad', true, false, 'Renovación sin montaje')
  ON CONFLICT (clave) DO NOTHING;

  -- ── Semilla: el criterio escrito (v2 de agosto 2026, adaptado a Parámetros) ────────
  IF NOT EXISTS (SELECT 1 FROM cotizacion_criterios) THEN
    INSERT INTO cotizacion_criterios (version, contenido, notas, vigente, autor_id) VALUES (1, $criterio$
# Criterios de cotización — Andamios Buenos Aires

**Documento de referencia permanente · Emprendimientos y Estructuras SA**

Versión cargada en AndamiosOS a partir del **v2 de agosto 2026**, que consolida las reglas de precio,
el checklist previo, las señales de alerta y los criterios comerciales surgidos de las cotizaciones
reales emitidas entre febrero y agosto de 2026. Valores netos, sin IVA.

> **Los números vigentes viven en Parámetros de cotización.** Donde este texto dice
> **[Parámetro: …]** hay que tomar el valor de la tabla de parámetros. Los números que aparecen en
> los casos (Corrientes 2810, Ayacucho 1075, AGE, etc.) son **valores de la época**: sirven para
> entender el criterio y como comparables, no como tarifa. Si un número de este texto no coincide
> con la tabla, **manda la tabla**.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| 🔒 **Regla fija** | Criterio establecido por Joaquín. No se cambia sin que él lo diga. |
| 💲 **Tarifa vigente** | Está en Parámetros, con su fecha. Se desactualiza: verificar contra órdenes recientes en Odoo (precios recientes por producto) antes de usarla. |
| 🧠 **Criterio propuesto** | Lógica aplicada y aceptada en un caso concreto, nunca declarada como regla general. Aplicar y **avisar** que se está aplicando. |
| ⚠️ **Ambigüedad abierta** | Dos criterios que conviven sin resolución. **Marcar y preguntar** antes de usar. |

---

# 1. Los cuatro modelos de cotización

Antes de tocar un número hay que definir **con qué modelo se cotiza**. Es la decisión de mayor
impacto y la que más veces se cambia a mitad de camino.

| Modelo | Cuándo se usa | Estructura del precio | Renovación |
|---|---|---|---|
| **A — Bandeja / pantalla por m.l.** | Protección peatonal aislada, sin estructura de fachada | $/m.l. × metros, primer mes todo incluido | [Parámetro: Renovación de bandejas y fachadas] |
| **B — Fachada por m²** | Estructura sobre fachada, con o sin bandeja y media sombra | $/m² × superficie, primer mes todo incluido | [Parámetro: Renovación de bandejas y fachadas] |
| **C — Alquiler puro (sin montaje)** | El cliente arma; ABA provee material y, opcionalmente, acompañamiento | Canon de material (lista vigente) + líneas separadas | [Parámetro: Renovación de alquiler puro] |
| **D — Desagregado por ítem** | Industria, etapas, geometría no estándar, licitaciones grandes | Canon + MO por jornada-cuadrilla + flete + ingeniería + S&H + viáticos | Se declara aparte, por etapa |

🔒 **Regla de corte.** Si la mano de obra supera aproximadamente el [Parámetro: Corte de mano de obra]
del primer mes, el esquema "todo incluido + renovación" deja de servir: la renovación queda absurda
porque arrastra mano de obra ya pagada. Ahí se abre en dos líneas — **mano de obra por única vez** y
**alquiler por mes**. (Criterio aplicado en la torre anexa de AGE, donde la MO era el 80 % del primer
mes.)

---

# 2. Cómo se cotiza cada unidad de negocio

## 2.1 Estructura en fachada — por m²

🔒 Precio = **$/m² × metros lineales de desarrollo × altura**. El desarrollo es la suma de los
frentes (en esquina, cada cara por separado), **no el perímetro del lote**.

🔒 El valor del primer mes es **todo incluido**: alquiler, armado, desarme, traslados y costos
operativos. Va como **un solo renglón**.

🔒 Incluye por defecto: estructura completa, bandeja de protección peatonal en fenólico, una fila
completa de tablones (o niveles cada 2 m si se aclara), cobertura en tela media sombra y acceso
por escalera escotilla.

🔒 **Renovación mensual** = [Parámetro: Renovación de bandejas y fachadas] del canon locativo.

### Escalonamiento por altura

🔒 En estructuras altas no se cotiza un $/m² plano: se parte en dos tramos y **se promedia en un
único renglón**, con la aclaración del escalonamiento en la descripción. Joaquín pidió
expresamente que no se muestre partido en dos renglones.

- Corrientes 2810 (42 m): hasta 21 m a $40.000, de 21 a 42 m a $50.000 → renglón único $45.000/m² (valores de la época).
- Ayacucho 1075: mitad inferior $45.000, mitad superior $65.000 (valores de la época).

🔒 **El salto del tramo alto se pregunta en cada obra.** No hay porcentaje fijo: los casos reales
van de +25 % a +44 %. Ofrecer las opciones al cotizar:

| Opción | Salto | Cuándo |
|---|---|---|
| **A** | [Parámetro: Salto del tramo alto — opción A] | Altura moderada, acceso normal, sin complicación de acarreo |
| **B** | [Parámetro: Salto del tramo alto — opción B] | Edificio alto con caída marcada de rendimiento (referencia Ayacucho 1075) |
| **C** | Otro | Lo define Joaquín para el caso |

Sea cual sea, el resultado **se promedia y va como un renglón único**, con el escalonamiento
aclarado en la descripción.

### Obras por fases con reubicación del material

🔒 Cuando el mismo material rota entre posiciones (frente → laterales → contrafrente), **cada
fase se factura al valor completo**, no como un alquiler largo. Fundamento: cada fase tiene
armado, desarme y traslados propios. La composición del $/m² es aproximadamente **35 % alquiler /
65 % mano de obra y operativo**, así que la remobilización es la mayor parte del costo.

⚠️ **ABIERTO — pendiente de definición de Joaquín.** Hay tensión con el criterio de etapas del
modelo D, que dice que el material no se multiplica (hay un solo juego) y sólo se multiplica la
mano de obra. Cobrar el valor completo por fase implica volver a cobrar también el alquiler sobre
material que ya está pago. Mientras no esté resuelto: **marcar el caso y preguntar** antes de
emitir una propuesta por fases.

## 2.2 Bandejas y pantallas de protección peatonal — por metro lineal

🔒 Se cotiza por metro lineal. Primer mes todo incluido, renovación [Parámetro: Renovación de
bandejas y fachadas].

🔒 **Mínimo facturable: [Parámetro: Mínimo facturable de bandeja]**, aunque el frente sea más corto.
En el PDF va **la medida real** en las secciones 1 y 2; el mínimo se declara explícitamente en el
alcance y en el renglón de la oferta.

🔒 **Concertina perimetral antitrepa** = [Parámetro: Concertina perimetral] del valor del metro de la
bandeja. Se factura también sobre el mínimo facturable. Se computa sobre los m.l. del desarrollo, no
de la estructura.

🔒 **Etapas.** Si el cliente no va a trabajar los frentes en simultáneo, dividir la propuesta en
etapas por frente, **con el monto de renovación indicado por etapa**, no globalizado.

## 2.3 Alquiler de material sin montaje

Torres móviles, apuntalamiento, componentes sueltos.

🔒 El canon de 30 días se computa **pieza por pieza a la lista de alquiler vigente**, y sobre ese
total se aplica el [Parámetro: Recargo sobre la lista de alquiler] como criterio comercial.

🔒 Ítems **fuera de la lista** (puntales telescópicos, vigas H20, caño estructural, ruedas): canon
mensual = [Parámetro: Canon de ítems fuera de lista] del **valor de compra neto**.

🔒 **No apilar los dos criterios sobre el mismo ítem.** Si salió de la lista, lleva el recargo sobre
lista; si salió del valor de compra, lleva el % del valor de compra y nada más.

🔒 **Criterio unificado (agosto 2026).** Las dos reglas viejas no eran equivalentes (el 10 % del
valor de compra daba ~2,4x lista y el +80 % daba 1,8x): un mismo presupuesto salía con dos políticas
comerciales distintas según de dónde viniera cada pieza. Manda el recargo sobre lista, porque es el
criterio que Joaquín fijó deliberadamente; el % del valor de compra de Parámetros es su equivalente.
Si en algún caso se quiere sostener un premio por ítem fuera de lista —rotación baja, reposición
difícil, riesgo de pérdida— que sea un recargo **declarado y explícito**, no el subproducto de dos
fórmulas distintas.

🔒 **Renovación** = [Parámetro: Renovación de alquiler puro]: no hay componente de mano de obra que
descontar.

## 2.4 Venta de material

🔒 **Siempre preguntar con qué criterio se amortiza antes de cotizar una venta.** No hay default.
Ofrecer las opciones: [Parámetro: Venta — amortización opción A] de canon, [Parámetro: Venta —
amortización opción B] (equivalente a la lista en USD), u otro plazo que indique Joaquín. Conviven
tres referencias:

- Lista de venta en **USD**, convertida al **T.C. oficial BNA billete vendedor** del día (criterio
  general de conversión de la casa). Referencias de la época: módulo estándar USD 260, tablón
  metálico 2,50 m USD 195.
- Precio derivado de la amortización del canon a 36 meses (criterio aplicado en Merba).
- Contrastada contra la propia lista en USD, la lista real equivale a ~24 meses. Con 36 la venta
  queda ~50 % por encima de nuestro propio precio de lista.

**Nunca elegir por default.** Preguntar, aplicar lo que se indique, y dejar escrito en la nota de
la orden qué plazo se usó.

---

# 3. Tarifario de referencia

> 💲 Los valores vigentes están en **Parámetros de cotización** (grupos Bandejas, Fachadas,
> Complementarios y Mano de obra). Acá quedan los casos con los que se construyeron, con sus valores
> de la época, para usarlos como comparables.

## 3.1 Bandeja y pantalla de protección peatonal ($/m.l.)

| Altura | Tarifa | Casos (valores de la época) |
|---|---|---|
| **3,00 m** (estándar) | [Parámetro: Bandeja 3 m] | Gorostiaga, Alvear 1547, Doblas 125, Córdoba 950, Corrientes 712, Scalabrini 2178, Pueyrredón 1643, Céspedes 2979, Sarmiento 1894, Roosevelt 5023, México 547, Lobos 504 |
| **6,00 m** | [Parámetro: Bandeja 6 m] (rango) | Revelli Santa Fe 1907 (43,88 m.l.) $175.000 · All Flags Azcuénaga (8,66 m.l.) $210.000 · Azopardo 505 con ménsulas sobre alero $210.000 |
| **8,00 m** | [Parámetro: Bandeja 8 m] | Fontana, Esmeralda 570 (36 m.l.) |
| **9,00 m sobre terreno de terceros** | caso a caso | Areco, Montañeses 2664 (bandeja 2 × 30 m, apoyos sobre terraza vecina) $645.000 |
| **Pasarela ancha con vigas reticuladas** | caso a caso | ROL, Av. de Mayo 575 (línea aparte del m² de fachada) $350.000 |

**Evolución de la tarifa base a 3 m:** $100.000 (feb-26) → $110.000/$120.000 (may/jun-26) →
$140.000 (jul-26). Toda cotización anterior a la tarifa vigente que se reactive se **re-emite a valor
de hoy**, no se parchea.

**Efecto volumen:** a igual altura, más metros bajan el unitario. 8,66 m.l. a 6 m iban a $210.000;
43,88 m.l. a la misma altura iban a $175.000 (−17 %).

🔒 **La tarifa de 6 m es un rango, no un valor.** Se define caso por caso según:

- **Volumen.** Es el factor dominante.
- **Complejidad del apoyo.** Ménsulas sobre alero, apoyo sobre estructura de terceros o
  transiciones empujan al techo del rango (Azopardo 505).
- **Contexto comercial.** Competencia activa o cliente recurrente.

Piso y techo en [Parámetro: Bandeja 6 m]. Fuera de ese rango, **preguntar**.

> **Alerta de aplicación, agosto 2026.** De 150 líneas de bandeja cotizadas desde el 1 de julio,
> 80 estaban por debajo de la tarifa nueva — la mayoría a la tarifa de mayo/junio. La tarifa estaba
> escrita pero no aplicada: usar siempre la de Parámetros.

## 3.2 Estructura de fachada ($/m²)

| Rango | Contenido típico | Casos (valores de la época) |
|---|---|---|
| [Parámetro: Fachada — piso de licitación] | Piso competitivo de licitación, gestoría e ingeniería absorbidas | AGE, Perú 160 (3.240 m² en 3 etapas) |
| [Parámetro: Fachada — estándar] | Estructura con bandeja en PB, 1–2 filas de tablones. **Valor de lista CABA** | Sanfelippo (150 m²) · Bucarelli (216 m²) · Sembinelli (205 m²) · Grupo LS La Plata (720 m²) · ROL (970 m²) · Ayacucho tramo bajo (900 m²) |
| [Parámetro: Fachada — con núcleo de escaleras] | Con núcleo de escaleras interno, 2 filas completas, media sombra | Ortiz Hornos 238 (750 m²/etapa) · Nolazco (346 m², estructura pelada de galpón) |
| [Parámetro: Fachada — completa o superficie chica] | Bandeja + media sombra + 2 filas de tablones, o superficie chica | Starnova Moreno (186 m²) · Idero Talcahuano (1.538 m²) · Ni Moreno 2087 (108 m²) · W&D (780 m², multidireccional) |
| [Parámetro: Fachada — acceso comprometido] | Interior, patio, acceso comprometido, fases con remobilización | Torre Boston (840 m², interior) · Vazquez Santiago del Estero (52,5 m², patio interno) |
| [Parámetro: Fachada — fuera del AMBA o patrimonial] | Fuera del AMBA, o envolvente patrimonial de alta exigencia | Torre del Reloj, Legislatura (2.420 m², 26 niveles entablonados, 150 días, izaje incluido) · Quequén (520 km) |

🔒 **El encuadre se pregunta en cada obra**, porque cambia cómo se le presenta el número al
cliente aunque el importe final sea el mismo:

| Opción | Encuadre | Cómo se ve en la propuesta |
|---|---|---|
| **A** | **Rango por complejidad** | El $/m² sale de lo que la obra requiere. No hay descuento que mostrar. |
| **B** | **Lista con bonificación declarada** ([Parámetro: Fachada — valor de lista]) | Se muestra el valor de lista y el descuento (§4.6). La renovación se calcula sobre lista, no sobre el bonificado. |

La opción B conviene cuando querés que el cliente vea que le hiciste un precio; la A, cuando no
querés fijar un ancla de la que después haya que defenderse. **Preguntar antes de emitir.**

## 3.3 Ítems complementarios

| Ítem | Valor | Nota |
|---|---|---|
| Concertina perimetral | [Parámetro: Concertina perimetral] del valor del m.l. de bandeja | Sobre los m.l. del desarrollo |
| Gestoría permiso vía pública GCBA | [Parámetro: Gestoría permiso vía pública (CABA)] | Sólo CABA. Fuera de CABA cambia el nombre del ítem y probablemente el valor; si no está confirmado, **dejarlo afuera** (La Plata → Municipalidad) |
| Media sombra | [Parámetro: Media sombra] | Sube la carga de viento: puede exigir anclajes adicionales |
| Fenólico 18 mm | [Parámetro: Fenólico 18 mm (estimado)] | No está en lista — **validar antes de usarlo en volumen** |
| Ingeniería | [Parámetro: Ingeniería (habitual)]; piso [Parámetro: Ingeniería — torre simple] | Línea propia, única vez. Torre del Reloj llegó a $6.500.000 (valor de la época) |
| Seguridad e Higiene | [Parámetro: Seguridad e Higiene] | Según jornadas. En obras chicas va en Aclaraciones, no como línea |
| Flete | [Parámetro: Flete GBA cercano] · [Parámetro: Flete CABA] · [Parámetro: Flete La Plata] | Fuera de CABA va como **renglón aparte**. Casos de la época: Quequén $5.200.000; 4 semis ida y vuelta $7.200.000 |

## 3.4 Mano de obra

Unidad de cuenta: **jornada-cuadrilla**.

🔒 Base: escala **UOCRA CCT 76/75 Zona A** con carga patronal completa (~2,06x) →
[Parámetro: Persona-jornada UOCRA]. Verificar la tabla del mes en curso: se actualiza con cada
revisión salarial.

| Criterio | Recargo |
|---|---|
| **UOCRA estándar** | [Parámetro: Recargo estándar sobre UOCRA] |
| **UOCRA según trabajo** | [Parámetro: Recargo alto sobre UOCRA] |

(Julio 2026 era $190.000 por persona → $950.000 la cuadrilla de 5, valores de la época.)

🧠 **Tarifa top-down para industria:** [Parámetro: Jornada industrial top-down (cuadrilla de 5)] =
comparable del mes + 20 % por contexto industrial. Usada en INTECO (Quequén), ETEC y Casa de la
Cultura.

🔒 **En obra industrial se pregunta qué mecanismo aplicar.** Los dos llegan a valores casi iguales
por caminos distintos, así que la elección es de criterio, no de plata:

| Opción | Mecanismo |
|---|---|
| **A** | UOCRA + [Parámetro: Recargo alto sobre UOCRA] (bottom-up desde el convenio) |
| **B** | [Parámetro: Jornada industrial top-down (cuadrilla de 5)] (top-down) |

Preguntar cuál usar y **dejarlo asentado en la nota de la orden**.

🔒 **Recargos**: sábado [Parámetro: Recargo sábado] · domingo [Parámetro: Recargo domingo] ·
nocturno [Parámetro: Recargo nocturno] · condiciones de trabajo adversas (voladizo, acarreo vertical,
altura de campanario) [Parámetro: Recargo condiciones adversas].

🔒 **Fuera de radio**: jornadas de viaje a [Parámetro: Jornada de viaje], alojamiento
[Parámetro: Alojamiento] por persona y noche, comida [Parámetro: Comida] por persona y día, y **toda
movilización cuenta mínimo [Parámetro: Mínimo de una movilización]** — la cuadrilla duerme allá.

🔒 **El rendimiento de la cuadrilla cae con la altura.** En estructuras altas hay que sumar
jornadas, no sólo material. Factores de productividad en Parámetros (grupo Mano de obra), usados en
la Torre del Reloj: 1,00 hasta 10 m sobre el apoyo, crecientes en las franjas intermedias y 1,75 por
encima de 40 m.

## 3.5 Ingeniería, S&H y gestoría

🔒 Van como **líneas propias, de única vez**, y **quedan fuera de la base de cálculo de la
renovación** (ver §4.1).

---

# 4. Reglas duras — no se negocian

## 4.1 La renovación se calcula SOLO sobre el canon locativo

🔒 Nunca sobre el subtotal. Quedan fuera: flete, viáticos, ingeniería, memoria de cálculo,
Seguridad e Higiene, gestoría, venta de material y cualquier ítem de única vez. En AndamiosOS cada
línea del presupuesto lleva la marca "única vez" y el motor calcula la base con esa marca.

🔒 **Igual se verifica el bullet de renovación en el PDF antes de mandarlo.**

## 4.2 El canon corre hasta la recepción física en depósito

🔒 No se acepta la figura de "puesta a disposición". El período se computa desde la entrega hasta
la recepción efectiva del material en depósito de ABA. Sin excepción.

## 4.3 IVA siempre

🔒 [Parámetro: IVA]. Se cobra y se ingresa aunque el cliente sea exento.

## 4.4 Mínimo de alquiler

🔒 [Parámetro: Período mínimo de alquiler], aunque el cliente pida 4 días o pregunte "precio por
día". Si el pedido es notoriamente corto, conviene una sección breve en el PDF explicando por qué el
mínimo lo favorece (se hizo en Agüero 1938). Casos: González, Bernardo de Irigoyen.

## 4.5 Mínimo facturable en bandejas

🔒 [Parámetro: Mínimo facturable de bandeja]. La medida real va en el PDF; el mínimo va en el importe.

## 4.6 Bonificaciones

🔒 Se muestran como **descuento sobre el valor de lista**, y **la renovación se calcula sobre
lista, no sobre el bonificado**. Casos: Sanfelippo −15 %, Martinez −20 % con 5 % adicional en
renovación calculado sobre lista.

🔒 Si la bonificación tiene fecha límite, va escrita en **Aclaraciones** con la fecha explícita.

## 4.7 Actualización por CAC

🔒 Índice **CAMARCO/CAC**, no INDEC. En obras pagaderas en cuotas, el ajuste aplica **por cuota al
momento del pago** — en ese caso va dentro de la forma de pago y se desactiva el bullet estándar de
actualización, porque no es un mecanismo mensual automático. En cotizaciones en USD: canon fijo, sin
cláusula CAC.

## 4.8 Lo que el cliente declaró como necesidad no es un opcional

🔒 Si el cliente lo pidió expresamente (ej. concertina "para evitar trepadura"), va en la base.
Los opcionales son cosas que el cliente todavía va a evaluar.

🔒 **Gestoría y concertina van como opcionales**, fuera de la base. Excepción: en licitación
pueden ir incluidas, pero **aclarándolo** para que el comitente sepa que las está recibiendo.

## 4.9 Los tiempos de armado y desarme no se inventan

🔒 Los confirma el técnico caso por caso. Nunca se asume un valor típico.

## 4.10 No ofrecer "supervisor durante todo el armado"

🔒 Es un cheque en blanco. Se cotizan **jornadas cerradas** más un valor de jornada adicional.

---

# 5. Checklist previo — preguntar siempre

## Nunca asumir estos dos

1. 🔒 **Jornadas de armado y desarme.** Preguntar siempre, aunque el resto de los datos haya
   venido completo. Van en la Sección 2 y en el bullet "Plazo de montaje".
2. 🔒 **Render.** Genérico de la biblioteca, o uno propio que se sube para la obra.

## Geometría

3. Frente en m.l. y altura real. En CABA se verifica el frente contra la parcela (Dateas); fuera
   de CABA lo tiene que dar el cliente.
4. Si es esquina: ¿los dos frentes o uno solo? (Sarmiento 1894 pasó de 39,31 a 14,25 m.l.;
   Esmeralda 570 se cotizó solo sobre una calle.)
5. Altura de la bandeja. 3 m es el default y define la tarifa; cualquier otra cosa cambia el renglón.
6. ¿El precio va escalonado por altura?

## Alcance

7. ¿Qué tarea hace el cliente? Pintura con silleteros, restauración, impermeabilización, recambio
   de ventanales, revestimiento, desmontaje. Define niveles y densidad.
8. ¿Cuántas filas de tablones? ¿Niveles cada 2 m o dos filas móviles que el cliente va desplazando?
   **Es el driver más grande del material.**
9. ¿Media sombra? ¿Bandeja incluida en la estructura o aparte?
10. ¿Etapas? ¿Conviven en simultáneo o son sucesivas? Si son sucesivas, la renovación va **por
    etapa separada** y hay MO por cada rearmado.
11. Opcionales: concertina, gestoría, Seguridad e Higiene.

## Operación y contexto

12. Plazo de alquiler previsto (define las renovaciones y si conviene bonificar).
13. ¿Quién arma: ABA o el cliente?
14. ¿Quién retira y devuelve el material?
15. ¿Cómo entra el material y cuánto hay que acarrearlo? ¿Hace falta izaje?
16. ¿La obra está dentro o fuera de CABA? Si está afuera: **flete aparte** y cambia la jurisdicción
    del permiso.
17. ¿Sobre qué apoya la estructura? ¿Hace falta verificación estructural?
18. ¿Quién provee izaje, energía, obrador, vigilancia nocturna, acceso del personal?
19. ¿Hay inducción, habilitaciones o restricciones horarias? (banco, laboratorio, planta, edificio
    en funcionamiento)

## Del cliente — antes de escribir nada en Odoo

20. 🔒 **Validar el CUIT.** Los formularios de alta llegan con errores de dígito con frecuencia.
    Si está mal, marcarlo y **no cargarlo**. Si no se puede confirmar, dejarlo vacío y anotar que se
    confirme contra la constancia.
21. 🔒 **"Ya soy cliente" no significa que exista en Odoo.** Verificar siempre.
22. ¿La obra ya fue cotizada por otro vendedor de ABA? (ver §7)
23. Datos fiscales, contacto, cómo nos conoció.
24. Vendedor, técnico, tipo de contrato.

---

# 6. Qué mueve el precio, y cuánto

Ordenado por impacto observado (porcentajes medidos en casos reales).

| Factor | Efecto medido |
|---|---|
| **Densidad de entablonado** | Niveles cada 2,00 m contra dos filas móviles: **+75 % sobre el canon** (Juzgado de Viedma). Cada nivel entablonado en Lasserre eran ~$2,1 M sobre el total. |
| **Altura — bandeja** | 3 m → 6 m = **+25 % a +50 %**; 3 m → 8 m = **+68 %**. |
| **Altura — fachada** | Tramo alto **+25 % a +44 %** sobre el bajo. Además, más jornadas por caída de rendimiento (factor hasta 1,75 por encima de 40 m). |
| **Fases con remobilización** | Cada fase al valor completo. Cuatro fases ≠ un alquiler largo. La MO se multiplica; el material no. En Merba, 24 jornadas fueron el **57 % del presupuesto**. |
| **Obra fuera del AMBA** | En Quequén (520 km) el alquiler fue apenas el **20 %** del total; MO + viáticos el **48 %**; flete el 10 %. El $/m² pasó de $45.000 a **$122.000**. En INTECO, viáticos y flete fueron **$18 M sobre $57 M**. |
| **Acarreo e izaje** | El cuello de botella suele ser el acarreo, no la cantidad de piezas (Merba: 133 piezas que suben por ascensor cuestan más jornadas que 260 a nivel vereda). Izaje subcontratado en Torre del Reloj: **$28.000.000**. |
| **Horario** | Sábado, domingo y nocturno con recargo (Parámetros). Casa de la Cultura se armó fin de semana; Banco Galicia solo sábados por horario bancario. |
| **Contexto industrial / planta** | Inducción, S&H en obra, ART y RC, ropa ignífuga, horarios restringidos, coordinación con el comitente, cuadrilla parada mientras se cumple el protocolo. Líneas propias de S&H e ingeniería + recargo de jornada. |
| **Exposición al viento** | CIRSOC 102 exposición D (borde de río, campo abierto): qz = **113 kg/m²** contra 75 kg/m² urbano. Más material, más anclajes, y puede cambiar el diagrama estructural entero. |
| **Pliego patrimonial** | Sin perforaciones, media sombra nueva mantenida toda la obra, inspección diaria, desarme solo con autorización escrita. La Torre del Reloj terminó en ~$124.000/m² contra $35.000/m² de las fachadas del mismo edificio. |
| **Esbeltez** | Ver §6.1. El umbral normativo es **6 m de altura → memoria de cálculo obligatoria** (Decreto 911/96). Superado el límite de autoportancia: anclajes obligatorios, autorización del comitente e ingeniería facturable aparte. |
| **Apoyo sobre estructura existente** | Verificación estructural previa. Va como **condición suspensiva** en la propuesta, no como supuesto. |
| **Geometría no estándar** | Envolventes, voladizos, colgantes, transiciones con ménsulas y vigas de reparto. |
| **Requerimientos especiales** | Lona ignífuga, red de protección, valla ciega en fenólico, bandejas en voladizo, vigas celosía. Cada uno es material y cómputo aparte. |
| **Media sombra** | Además del $/m² del tejido, sube la carga de viento y puede obligar a anclajes adicionales. **Decirlo en la propuesta.** |
| **Esquina / ochava** | Dos frentes = dos caras a computar + **1 jornada de armado adicional** como mínimo. |
| **Plazo declarado por el cliente** | Define cuántas renovaciones tiene el negocio. Un frente de 2 meses vale más que el primer mes que se cotiza. |

## 6.1 Esbeltez y autoportancia — qué dice la norma

El umbral no lo fija ABA: lo fija la normativa. Tres cosas distintas que conviene no mezclar:

🔒 **Disparador legal (Argentina).** El Decreto 911/96 —Reglamento de Higiene y Seguridad para la
Industria de la Construcción, de aplicación obligatoria en obra pública y privada— exige que
**todo andamio que supere los 6 m de altura sea dimensionado en base a cálculo**, o sea con
memoria de cálculo de la estructura montada. Ese es el corte duro, y no depende de la relación
altura/base. La norma técnica que ordena el dimensionamiento es **IRAM 3691**, que toma el
criterio general europeo con materiales locales y los reglamentos CIRSOC.

🔒 **Torres móviles sobre ruedas.** Relación altura/base máxima **3:1 en exteriores** y **3,5:1 en
interiores**, con ruedas bloqueadas durante el trabajo.

🔒 **Estructuras fijas autoportantes.** El criterio corriente es altura ≤ **4× el ancho menor de
la base**. Por encima de eso la estructura no se sostiene libre: exige arriostramiento o anclaje
estructural.

**Conclusión operativa: se adopta 4:1 para estructura fija y 3:1 para torre móvil en exterior.**
El 6:1 que aparecía en la documentación anterior no corresponde a ninguna norma y se descarta.

⚠️ El texto de IRAM 3691 no es de acceso público. Antes de usar estos umbrales como argumento
técnico frente a un comitente o en una memoria firmada, **verificarlos contra la norma vigente y
el manual del fabricante del sistema**. Acá sirven como criterio de cotización, no como
sustituto del cálculo.

---

# 7. Señales de que la obra vale más de lo que parece

Cuando aparece alguna de estas, **frenar y recotizar el alcance antes de tirar un número**.

## Señales de medición

- **Medida declarada absurda** — "20 m de ancho por 360 m de alto". Error de tipeo: no existe un
  edificio de 360 m en el país (el más alto ronda los 235). Verificar antes de calcular.
- **Frente más corto que el mínimo facturable** — se factura el mínimo. El trabajo chico no es barato.
- **Dos tramos de ochava casi iguales pero no idénticos** (4,20 y 4,26) — son las dos caras del
  chaflán, no una medida repetida por error. Se suman.
- **Tramo suelto muy corto** (1,99 m sobre un frente) — preguntar si la bandeja tiene dónde
  apoyarse ahí. Puede requerir estructura adicional que no está en el $/m.l.
- **"Espacio libre de 6×4"** — confirmar si es el interior útil o la huella total. En Central
  Costanera esa aclaración cambió la solución estructural entera (de pared simple a doble línea de
  montantes) y bajó la tensión por anclaje de 1.083 kg a 260 kg.

## Señales de alcance

- **El cliente pide "andamio común" pero la geometría exige multidireccional.** Sembinelli pidió
  andamio común en una esquina de 25,57 m.l.; se cotizó multidireccional igual.
- **El cliente pide "precio por día".** Traduce a plazo corto, pero el mínimo es el primer período
  completo. Se cobra el mínimo igual.
- **El acceso al lugar de montaje no es directo.** Patio interno, azotea a +31 m, piso 10 por
  ascensor, 20 m de acarreo desde la descarga. El $/m² estándar **no contempla** izaje por fachada
  ni acarreo largo.
- **La obra tiene etapas.** Multiplica mano de obra, fletes internos entre etapas y renovaciones
  que hay que declarar por separado.
- **El desarme depende de la autorización de un tercero.** Devenga extensión de alquiler; hay que
  dejarlo escrito.
- **La devolución del material queda del lado del cliente.** El canon corre hasta que el material
  vuelve físicamente al depósito.
- **Aparece un pliego.** Exigencias de norma, media sombra nueva, pantallas a 45°, línea de vida,
  guardias de mantenimiento, supervisión técnica: todo eso son líneas que el cliente no pidió pero
  el pliego obliga.

## Señales de contexto que multiplican el precio

- **Planta industrial, central eléctrica, cementerio, puerto** — no es un frente de obra normal.
- **Estructura que apoya sobre losa existente** — verificación estructural a cargo del comitente,
  como condición previa a la firma.
- **Lo que se ancla es lo que se va a demoler** — el plan de arriostramiento tiene que bajar con
  el corte. Eso es ingeniería de secuencia, y es facturable.
- **Borde de río o campo abierto** — exposición D, +50 % de presión de viento.
- **Obra fuera del AMBA en temporada alta** — el alojamiento no es sólo precio, es disponibilidad.
  Conviene bloquear o cotizar contra presupuesto cerrado del hotel.
- **Material que no está en la lista de alquiler** — no hay precio de referencia. Se calcula sobre
  valor de compra y hay que decir explícitamente qué porcentaje del total está apoyado en
  estimaciones.

## Señales comerciales

- **Silletero o contratista independiente** — compite por precio, pero el riesgo de cobro sube.
  Clasificar como "Profesional de oficio / contratista independiente".
- **La misma dirección aparece en varias oportunidades** — Corrientes 2810 generó tres propuestas
  para tres empresas distintas. Puede ser competencia real, o el mismo trabajo por tres canales.
- 🔒 **La obra ya fue cotizada por otro vendedor de ABA** — riesgo de conflicto de canal.
  **Verificar en el CRM antes de emitir** (pasó en Sarmiento 1894 y Ayacucho 1075) y avisar a Joaquín.
- **El cliente llegó por cartel en obra o recomendación** — no está comparando tres presupuestos.
  Distinto de una licitación.
- **El cliente ganó una licitación con un número nuestro viejo.** Hay margen y legitimidad para
  actualizar (Viedma: valor de abril actualizado por CAC).
- **El cliente reduce el alcance después de cotizar** — pasó dos veces (Sarmiento de 39,31 a
  14,25 m.l.; Andonaegui de 46,24 a 16,24). Al reducir, **revisar también las jornadas**: con menos
  metros no se justifican las mismas.

---

# 8. Chequeos de razonabilidad antes de emitir

1. **$/m² resultante contra comparables.** FG dio $47.269/m² sobre 873 m² — alineado con los rangos
   de fachada. Si el resultado se despega, hay algo mal computado, o hay algo que justifica el
   sobreprecio y conviene **explicitarlo en la propuesta**.
2. **Ratio contra lista de material.** AGE rendía **1,37x lista** por el período. En Viedma se
   detectó que el valor viejo daba **5,3x lista** — estaba armado con un $/m² de fachada todo
   incluido, no con la lista.
3. **Peso de la mano de obra sobre el total.** Si pasa el [Parámetro: Corte de mano de obra], revisar
   las jornadas antes de mandar: son la estimación más frágil del presupuesto. Y si pasa ese umbral,
   revisar además si corresponde cambiar de modelo (§1).
4. **Sensibilidad del montaje.** En AGE, si el montaje se iba de 50 a 70 jornadas se comían $23 M
   de margen. Hacer esa cuenta en toda obra grande.
5. **Renovaciones como porcentaje del ingreso.** En AGE el 41 % del ingreso eran renovaciones — o
   sea que el negocio depende de que la obra efectivamente dure lo que dice.
6. **Verificar el bullet de renovación en el PDF generado** (§4.1).

---

# 9. Reglas comerciales

## Frente a la competencia

🔒 **No bajar el precio antes de ver el presupuesto del otro.** Decir "lo llevo a la dirección",
nunca "te lo mejoro". Prometer antes de ver fija un piso.

🔒 **Normalizar el metraje antes de comparar.** Con Gladys/Colman, la diferencia declarada del 29 %
se derrumbó al **4 %** al comparar los mismos metros.

🔒 **Una brecha mayor al 40 % no es precio, es alcance.** No se cierra con descuento: se cierra
rediseñando el alcance (sistema mixto, plazo más corto, montaje por etapas).

🧠 **Contraoferta declarada:** *mejoramos un 15 % los valores de la competencia contra presentación
de la cotización.* Usado en Elcano 3200.

🧠 **Cuando se conoce el número del competidor**, el objetivo es quedar **10 % por debajo**, tanto
en el primer período como en la renovación (San Cristóbal / Rivadavia 2450).

🔒 **Nunca descontar por sacar el respaldo técnico.** La documentación firmada está absorbida en
el precio como el flete o el seguro; no es un ítem separable. Si el alcance cambia, cambia el precio.

🔒 **Las concesiones van sobre el canon y condicionadas** (período firme con penalidad por baja
anticipada), nunca como porcentaje plano sobre el total.

## Forma de presentar

🔒 La **renovación siempre en pesos concretos** por período, como línea del presupuesto, no sólo
como porcentaje en las condiciones de abajo.

🔒 **La pantalla no se lista como ítem separado** cuando va integrada a la estructura: un solo
número claro de canon.

🔒 Lenguaje llano: *Qué se monta · Qué incluye · Qué está incluido en el precio*.

🔒 Cuando hay **etapas que no conviven**, cada renovación va por separado y se aclara por qué.

🔒 Al **reactivar una cotización vieja**: se emite propuesta nueva a valor de hoy y **se cancela la
anterior**, para que no queden dos números vivos por la misma obra.

---

# 10. Registro de negociaciones

De cada obra que se pelea por precio conviene dejar anotado: cliente y contacto, obra, propuesta
enviada, concesión máxima ofrecida, razón declarada del rechazo, hipótesis propia y resultado final.

Repetido sobre 20 negociaciones, eso responde con datos preguntas que hoy se contestan por
intuición: cuánto se pierde por precio contra cuánto por alcance, qué tipo de obra es la más
cuestionada, y cuál es la diferencia promedio del competidor más barato.

🔒 **Regla de higiene asociada:** cuando el precio se aparta del tarifario, la razón va en la nota de
la orden en Odoo. Sin eso, el criterio no es recuperable después.

---

# 11. Lo que quedó sin resolver

| # | Tema | Dónde | Estado |
|---|---|---|---|
| 1 | **Fases con remobilización** | §2.1 | ⚠️ **Abierto.** ¿Valor completo por fase, o completo menos el alquiler ya cobrado? Marcar y preguntar en cada caso. |
| 2 | **Aplicación de la tarifa de julio** | §3.1 | ⚠️ En agosto 80 de 150 líneas de bandeja seguían a valor de mayo/junio. No es un problema de criterio sino de comunicación al equipo: usar siempre Parámetros. |
| 3 | **Umbrales de esbeltez contra IRAM 3691** | §6.1 | ⚠️ Los valores adoptados (4:1 fija, 3:1 móvil exterior) son criterio de cotización. Verificar contra la norma vigente y el manual del fabricante antes de usarlos en una memoria firmada. |
| 4 | **Repricing por CAC de propuestas viejas** | — | Pendiente a medida que la inflación compone. |
| 5 | **Fenólico 18 mm** | §3.3 | Valor estimado, no está en lista. Validar antes de usarlo en volumen. |
$criterio$, 'Carga inicial: criterio v2 (agosto 2026) con los números vigentes pasados a Parámetros.', true, NULL);
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
