-- ============================================================
-- AndamiosOS — Hoja del día: varios vehículos por hoja, chofer por viaje, "Puede manejar"
--
-- Decisiones del dueño (11/10), en docs/equipos-del-dia/modulo.md §4:
--
-- 1. CHOFER Y VEHÍCULO SON INDEPENDIENTES. Un camión puede tener distintos choferes según el
--    día y según el viaje: el chofer de cada viaje (hd_viajes.chofer_id) manda. El chofer
--    habitual (vehiculos.chofer_habitual_id) y hd_camiones_dia son sólo la SUGERENCIA para
--    precargar; nunca un problema. Los únicos choques reales son el mismo vehículo o el
--    mismo chofer en dos lugares a la vez. (Esto es lógica: no cambia tablas.)
-- 2. ARMADORES QUE TAMBIÉN MANEJAN. `personal.puede_manejar` (como "Puede estar a cargo"):
--    los elegibles como chofer son los choferes de Odoo más los que pueden manejar. Arranca
--    en true para Conte y Ortega. La sincronización con Odoo no la toca.
-- 3. UNA CUADRILLA PUEDE LLEVAR MÁS DE UN VEHÍCULO, cada uno con su chofer y su modo (la
--    hidrogrúa con Borda todo el día + otro camión que lleva gente y material y se va).
--    `hd_hoja_vehiculos`: una fila por vehículo de la hoja. "Sin chofer" = ninguna fila.
--    Las columnas viejas de hd_hojas (chofer_modo, chofer_id, vehiculo_id) quedan como
--    RESUMEN del primer vehículo (las escribe el código nuevo): un rollback del deploy sigue
--    funcionando y volver a correr esta migración no duplica nada.
-- 4. LLEVA Y TRAE SOBRE LA MARCHA. El "lleva" de cada vehículo es un viaje con
--    `hoja_vehiculo_id`; puede marcar "después vuelve al depósito" (`vuelta`, ya existía) con
--    la hora estimada de llegada (`vuelta_llega`, nueva). El "busca" puede hacerlo el mismo
--    vehículo (con `hoja_vehiculo_id`: sigue a ese renglón), otro camión u otro chofer (sin
--    `hoja_vehiculo_id`), quedar "a definir" (sin vehículo) o no existir ("vuelven solos").
--
-- Se aplica a mano con `npx supabase db query --linked -f` (NUNCA db push), DESPUÉS de
-- 20261011000002_hoja_dia_contratistas.sql y ANTES del deploy del código que la usa (el
-- código nuevo lee hd_hoja_vehiculos al leer el día: sin ella la Hoja del día no abre).
-- Idempotente: se puede correr dos veces, también después del deploy (ver el backfill). Sin
-- BEGIN/COMMIT propios (el probador la envuelve en ROLLBACK).
-- ============================================================

-- ========================
-- "Puede manejar" (Legajos)
-- ========================
-- Andamistas que además manejan (y que pueden estar a cargo): Conte y Ortega. Es de la app,
-- como puede_estar_a_cargo: la sincronización con Odoo no la toca.
ALTER TABLE personal ADD COLUMN IF NOT EXISTS puede_manejar BOOLEAN NOT NULL DEFAULT false;

-- Arrancan en true Conte (Osmar Francisco Luján) y Ortega (Carlos Raúl). Por apellido y
-- nombre normalizados, sólo legajos activos, y SÓLO si hay uno solo que coincide: si no
-- existe o hay dos, no se toca nada (se marca a mano en Legajos).
DO $manejan$
DECLARE
  r RECORD;
  v_n INTEGER;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('conte', 'osmar'), ('ortega', 'carlos')) AS t(apellido, nombre) LOOP
    SELECT count(*) INTO v_n FROM personal
    WHERE activo IS DISTINCT FROM false
      AND lower(translate(btrim(apellido), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = r.apellido
      AND lower(translate(btrim(nombre), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE r.nombre || '%';
    IF v_n = 1 THEN
      UPDATE personal SET puede_manejar = true
      WHERE activo IS DISTINCT FROM false
        AND lower(translate(btrim(apellido), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = r.apellido
        AND lower(translate(btrim(nombre), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE r.nombre || '%'
        AND puede_manejar IS DISTINCT FROM true;
    ELSE
      RAISE NOTICE 'puede_manejar: % legajos activos para % %, no se marcó', v_n, r.apellido, r.nombre;
    END IF;
  END LOOP;
END
$manejan$;

-- ========================
-- Los vehículos de una hoja
-- ========================
CREATE TABLE IF NOT EXISTS hd_hoja_vehiculos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id      UUID NOT NULL REFERENCES hd_hojas(id) ON DELETE CASCADE,
  -- Repetida a propósito (la pone el trigger con la de la hoja): "qué hace este chofer o
  -- este vehículo ese día" sin pasar por las hojas.
  fecha        DATE NOT NULL,
  -- null = "falta el vehículo" / "falta el chofer" (la tarjeta lo marca).
  vehiculo_id  UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
  chofer_id    UUID REFERENCES personal(id) ON DELETE SET NULL,
  -- lleva_trae: los lleva (su "lleva" es un viaje con hoja_vehiculo_id) y se va.
  -- todo_el_dia: queda con la cuadrilla (el chofer cuenta en "Quiénes van").
  modo         TEXT NOT NULL CHECK (modo IN ('lleva_trae', 'todo_el_dia')),
  orden        INTEGER NOT NULL DEFAULT 0,
  -- Cuándo se tocó por última vez: cuando dos tarjetas reclaman el mismo chofer o vehículo
  -- "todo el día", el aviso fuerte va en la que se tocó último.
  tocado_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES user_profiles(id) DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_hd_hoja_vehiculos_hoja ON hd_hoja_vehiculos(hoja_id, orden);
CREATE INDEX IF NOT EXISTS idx_hd_hoja_vehiculos_fecha ON hd_hoja_vehiculos(fecha);
-- Un vehículo va una sola vez en la misma hoja (en dos hojas sí puede: es un choque que la
-- hoja avisa, no una regla dura).
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_hoja_vehiculos_vehiculo ON hd_hoja_vehiculos(hoja_id, vehiculo_id) WHERE vehiculo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hd_hoja_vehiculo_fecha()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fecha := (SELECT fecha FROM hd_hojas WHERE id = NEW.hoja_id);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hd_hoja_vehiculo_fecha ON hd_hoja_vehiculos;
CREATE TRIGGER hd_hoja_vehiculo_fecha BEFORE INSERT OR UPDATE ON hd_hoja_vehiculos
  FOR EACH ROW EXECUTE FUNCTION hd_hoja_vehiculo_fecha();

-- ========================
-- Viajes: de qué vehículo de la hoja son, y cuándo vuelve al depósito
-- ========================
-- El "lleva" (y los "mueve") de un vehículo de la hoja; el "busca" que hace ese mismo
-- vehículo (lo sigue si cambia el chofer o el camión). Null = no es de un vehículo de la
-- hoja (un busca con otro camión, "a definir", o un viaje suelto). Se borra el renglón:
-- el código ya borró o soltó sus viajes antes (SET NULL es sólo la red).
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS hoja_vehiculo_id UUID REFERENCES hd_hoja_vehiculos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hd_viajes_hoja_vehiculo ON hd_viajes(hoja_vehiculo_id) WHERE hoja_vehiculo_id IS NOT NULL;
-- "Después vuelve al depósito" (vuelta = true): a qué hora llega, si se cargó a mano. Null =
-- la estimada (la parada más minutos_vuelta_deposito). Desde ahí el camión queda libre.
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS vuelta_llega TIME;

-- ========================
-- Backfill: el chofer y el vehículo que tenía cada hoja pasan a ser su primer vehículo
-- ========================
-- Sólo las hojas con chofer (lleva y trae o todo el día) que todavía no tienen ningún
-- vehículo. Es la MISMA sentencia que scripts/sql/hoja-dia-vehiculos-reparar.sql (la
-- reparación después del deploy): si se cambia una, cambiar la otra.
--
-- De qué camión es la fila: el código viejo dejaba que el "lleva" estuviera en otro camión
-- que hd_hojas.vehiculo_id (se movía en Camiones, o cambiaba el chofer del camión). Si la
-- hoja tiene un lleva PLANEADO con camión, la fila sale de ese lleva (su camión y su chofer;
-- sin chofer guardado, el que veía la pantalla: el de la hoja si es el mismo camión, el del
-- camión ese día o el habitual). Si no, de las columnas de la hoja.
--
-- Qué viajes se ligan: SÓLO los de las filas que crea esta misma sentencia (la CTE
-- `nuevas`), SÓLO planeados (lo hecho o anulado es historia) y SÓLO si van en el camión de la
-- fila (lleva y mueve: el mismo camión; el busca: el mismo camión con el mismo chofer o sin
-- chofer). Un viaje en otro camión queda suelto ("otro camión"), como lo muestra el código.
--
-- IDEMPOTENTE TAMBIÉN DESPUÉS DEL DEPLOY: el código nuevo deja chofer_modo = 'sin' cuando
-- una hoja se queda sin vehículos (resumenLegado) y nunca deja una hoja con chofer sin
-- filas, así que volver a correrla no crea filas ni vuelve a ligar viajes que el código
-- soltó a propósito (el UPDATE sólo toca viajes de las filas recién creadas).
WITH fuente AS (
  SELECT h.id AS hoja_id, h.fecha, h.chofer_modo, h.chofer_tocado_at, h.updated_by,
         CASE WHEN ll.vehiculo_id IS NOT NULL THEN ll.vehiculo_id ELSE h.vehiculo_id END AS vehiculo_id,
         CASE WHEN ll.vehiculo_id IS NOT NULL THEN COALESCE(
                ll.chofer_id,
                CASE WHEN ll.vehiculo_id = h.vehiculo_id THEN h.chofer_id END,
                (SELECT c.chofer_id FROM hd_camiones_dia c WHERE c.fecha = h.fecha AND c.vehiculo_id = ll.vehiculo_id AND c.sin_chofer IS NOT TRUE LIMIT 1),
                (SELECT ve.chofer_habitual_id FROM vehiculos ve WHERE ve.id = ll.vehiculo_id))
              ELSE h.chofer_id END AS chofer_id
  FROM hd_hojas h
  LEFT JOIN LATERAL (
    SELECT v.vehiculo_id, v.chofer_id FROM hd_viajes v
    WHERE v.hoja_id = h.id AND v.tipo = 'lleva' AND v.estado = 'planeado' AND v.vehiculo_id IS NOT NULL
      AND h.chofer_modo = 'lleva_trae'
    ORDER BY v.orden, v.id
    LIMIT 1
  ) ll ON true
  WHERE h.chofer_modo IN ('lleva_trae', 'todo_el_dia')
    AND NOT EXISTS (SELECT 1 FROM hd_hoja_vehiculos x WHERE x.hoja_id = h.id)
),
nuevas AS (
  INSERT INTO hd_hoja_vehiculos (hoja_id, fecha, vehiculo_id, chofer_id, modo, orden, tocado_at, created_by, updated_by)
  SELECT hoja_id, fecha, vehiculo_id, chofer_id, chofer_modo, 0, chofer_tocado_at, updated_by, updated_by FROM fuente
  RETURNING id, hoja_id, vehiculo_id, chofer_id, modo
),
-- Los "lleva" y "mueve" planeados de esas hojas en el camión de la fila.
ligados AS (
  UPDATE hd_viajes v SET hoja_vehiculo_id = n.id
  FROM nuevas n
  WHERE v.hoja_id = n.hoja_id
    AND n.modo = 'lleva_trae'
    AND v.hoja_vehiculo_id IS NULL
    AND v.estado = 'planeado'
    AND v.tipo IN ('lleva', 'mueve')
    AND v.vehiculo_id IS NOT DISTINCT FROM n.vehiculo_id
  RETURNING v.id
)
-- El "busca" sigue al vehículo sólo si lo hace el mismo camión con el mismo chofer; si se
-- había pasado a otro camión (o quedó sin camión), queda suelto: "otro camión" / "a definir".
UPDATE hd_viajes v SET hoja_vehiculo_id = n.id
FROM nuevas n
WHERE v.hoja_id = n.hoja_id
  AND n.modo = 'lleva_trae'
  AND v.hoja_vehiculo_id IS NULL
  AND v.estado = 'planeado'
  AND v.tipo = 'busca'
  AND v.vehiculo_id IS NOT NULL
  AND v.vehiculo_id = n.vehiculo_id
  AND (v.chofer_id IS NULL OR v.chofer_id IS NOT DISTINCT FROM n.chofer_id);

-- ========================
-- RLS: cerrada por permiso, como el resto del módulo
-- ========================
DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE hd_hoja_vehiculos ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Hoja del día: leer" ON hd_hoja_vehiculos';
  EXECUTE 'CREATE POLICY "Hoja del día: leer" ON hd_hoja_vehiculos FOR SELECT TO authenticated USING ((SELECT hd_puede_ver()))';
  EXECUTE 'DROP POLICY IF EXISTS "Hoja del día: cargar" ON hd_hoja_vehiculos';
  EXECUTE 'CREATE POLICY "Hoja del día: cargar" ON hd_hoja_vehiculos FOR INSERT TO authenticated WITH CHECK ((SELECT hd_puede_editar()))';
  EXECUTE 'DROP POLICY IF EXISTS "Hoja del día: editar" ON hd_hoja_vehiculos';
  EXECUTE 'CREATE POLICY "Hoja del día: editar" ON hd_hoja_vehiculos FOR UPDATE TO authenticated USING ((SELECT hd_puede_editar())) WITH CHECK ((SELECT hd_puede_editar()))';
  EXECUTE 'DROP POLICY IF EXISTS "Hoja del día: borrar" ON hd_hoja_vehiculos';
  EXECUTE 'CREATE POLICY "Hoja del día: borrar" ON hd_hoja_vehiculos FOR DELETE TO authenticated USING ((SELECT hd_puede_editar()))';
END
$rls$;
REVOKE ALL ON hd_hoja_vehiculos FROM anon;

-- ========================
-- hd_aplicar (Deshacer y gestos a medias): la tabla nueva en la lista blanca.
-- Es la misma función de 20261011000002; sólo cambia la lista de tablas permitidas.
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
                                          'hd_contratistas', 'hd_hoja_contratistas', 'hd_hoja_vehiculos') THEN
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
