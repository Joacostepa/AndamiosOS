-- ============================================================
-- AndamiosOS — Habilitaciones: que el historial diga qué papel, y que no se escape nada
--
-- Salió de la prueba del módulo del 09/10 (docs/habilitaciones/errores.md §9, §10, §12):
--
--   1. 162 entradas "Envío" y "Aprobación" sin detalle: hab_mover_requisito guardaba el
--      MOTIVO (casi siempre vacío) y no el nombre del requisito. El módulo existe para
--      poder demostrar "te mandé la nómina el 24/9", y para un papel puntual no se podía.
--   2. Volver un requisito a pendiente no dejaba rastro: deshacía una aprobación en
--      silencio, al lado del botón "Aprobar".
--   3. "Corregir y reenviar" conservaba la fecha del PRIMER envío, así que el "días sin
--      respuesta" de un reenvío arrancaba inflado.
--   4. Agregar o quitar requisitos y cambiar de paquete no quedaban en el historial (eso
--      lo registra TypeScript, con el tipo nuevo `requisitos`), y habilitar o revertir se
--      guardaba como "Aprobación", mezclado con las aprobaciones de cada papel (ahora
--      `habilitacion`).
--
-- APLICAR ANTES DE PUBLICAR EL CÓDIGO: la app nueva inserta los tipos `requisitos` y
-- `habilitacion`, que la restricción vieja rechaza. Al revés no hay problema: con esto
-- aplicado, el código viejo sigue andando igual.
--
-- Se aplica a mano con `supabase db query`, NUNCA con db push (el historial remoto está
-- vacío). Un comando por llamada y sin estos comentarios: son tres llamadas, una por
-- bloque separado por una línea en blanco doble.
-- ============================================================

DO $mig$ BEGIN
  ALTER TABLE hab_gestiones DROP CONSTRAINT IF EXISTS hab_gestiones_tipo_check;
  ALTER TABLE hab_gestiones ADD CONSTRAINT hab_gestiones_tipo_check CHECK (tipo IN (
    'triage', 'consulta', 'reclamo', 'envio', 'aprobacion',
    'observacion', 'permiso', 'renovacion', 'excepcion', 'posposicion',
    'requisitos', 'habilitacion'));
  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;


-- ========================
-- Un requisito. Misma firma y misma única ida a la base que antes (ver 20260904000001);
-- cambian el detalle del historial, el registro de la vuelta a pendiente y la fecha del
-- reenvío.
-- ========================
CREATE OR REPLACE FUNCTION hab_mover_requisito(
  p_requisito_id UUID,
  p_estado       TEXT,
  p_motivo       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ot_id  BIGINT;
  v_nombre TEXT;
  v_antes  TEXT;
  v_tipo   TEXT;
  v_detalle TEXT;
BEGIN
  SELECT odoo_ot_id, nombre, estado INTO v_ot_id, v_nombre, v_antes
  FROM hab_requisitos WHERE id = p_requisito_id FOR UPDATE;

  IF v_ot_id IS NULL THEN
    RAISE EXCEPTION 'No existe el requisito %', p_requisito_id;
  END IF;

  UPDATE hab_requisitos SET
    estado     = p_estado,
    motivo_obs = CASE WHEN p_estado = 'observado' THEN p_motivo ELSE NULL END,
    -- La primera vez se sella y no se pisa —sostiene la etapa `c` en Odoo—, salvo en el
    -- REENVÍO de un observado: ahí el cliente recibe un papel nuevo y los días sin
    -- respuesta cuentan desde hoy. Volver a pendiente la borra.
    fecha_envio = CASE
      WHEN p_estado = 'pendiente' THEN NULL
      WHEN p_estado = 'enviado' AND v_antes = 'observado' THEN current_date
      WHEN p_estado = 'enviado' THEN COALESCE(fecha_envio, current_date)
      ELSE fecha_envio
    END,
    fecha_resolucion = CASE
      WHEN p_estado IN ('aprobado', 'observado') THEN current_date
      WHEN p_estado = 'pendiente' THEN NULL
      ELSE fecha_resolucion
    END
  WHERE id = p_requisito_id;

  -- El tipo es el de la transición. Volver a pendiente se registra con el tipo de lo que
  -- se deshace: deshacer una aprobación es una "Aprobación" que dice que se deshizo.
  v_tipo := CASE
    WHEN p_estado = 'enviado'   THEN 'envio'
    WHEN p_estado = 'aprobado'  THEN 'aprobacion'
    WHEN p_estado = 'observado' THEN 'observacion'
    WHEN v_antes  = 'aprobado'  THEN 'aprobacion'
    WHEN v_antes  = 'observado' THEN 'observacion'
    WHEN v_antes  = 'enviado'   THEN 'envio'
    ELSE NULL
  END;

  v_detalle := CASE
    WHEN p_estado = 'pendiente' THEN v_nombre || ': se deshizo, vuelve a pendiente'
    WHEN p_estado = 'enviado' AND v_antes = 'observado' THEN v_nombre || ': corregido y reenviado'
    ELSE v_nombre || COALESCE(' — ' || NULLIF(BTRIM(COALESCE(p_motivo, '')), ''), '')
  END;

  IF v_tipo IS NOT NULL AND v_antes IS DISTINCT FROM p_estado THEN
    INSERT INTO hab_gestiones (odoo_ot_id, tipo, detalle, autor_id)
    VALUES (v_ot_id, v_tipo, v_detalle, auth.uid());
  END IF;

  RETURN hab_gestion_de(v_ot_id) || jsonb_build_object('otId', v_ot_id);
END;
$$;


-- ========================
-- Todos los requisitos de una obra de un solo gesto: el detalle nombra cuáles.
-- ========================
CREATE OR REPLACE FUNCTION hab_mover_todos(
  p_ot_id  BIGINT,
  p_estado TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_desde   TEXT;
  v_n       INTEGER;
  v_nombres TEXT;
BEGIN
  v_desde := CASE WHEN p_estado = 'enviado' THEN 'pendiente' ELSE 'enviado' END;

  WITH movidos AS (
    UPDATE hab_requisitos SET
      estado     = p_estado,
      motivo_obs = NULL,
      fecha_envio = CASE
        WHEN p_estado = 'enviado' THEN COALESCE(fecha_envio, current_date)
        ELSE fecha_envio
      END,
      fecha_resolucion = CASE
        WHEN p_estado = 'aprobado' THEN current_date
        ELSE fecha_resolucion
      END
    WHERE odoo_ot_id = p_ot_id AND estado = v_desde
    RETURNING nombre, orden
  )
  SELECT COUNT(*), string_agg(nombre, ', ' ORDER BY orden) INTO v_n, v_nombres FROM movidos;

  IF v_n > 0 THEN
    INSERT INTO hab_gestiones (odoo_ot_id, tipo, detalle, autor_id)
    VALUES (
      p_ot_id,
      CASE WHEN p_estado = 'enviado' THEN 'envio' ELSE 'aprobacion' END,
      v_nombres || CASE WHEN v_n > 1 THEN ' (' || v_n || ', en un solo gesto)' ELSE '' END,
      auth.uid()
    );
  END IF;

  RETURN hab_gestion_de(p_ot_id) || jsonb_build_object('movidos', v_n);
END;
$$;
