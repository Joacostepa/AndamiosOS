-- ============================================================
-- AndamiosOS — Habilitaciones: deshacer una aprobación sin registrarla como un envío
--
-- El rediseño de la bandeja (09/10) aprueba papeles desde la fila, con "Deshacer" en el
-- aviso. Deshacer es volver el papel de `aprobado` a `enviado`, y la función de
-- 20261009000001 lo registraba como un "Envío" nuevo y dejaba la fecha de aprobación
-- puesta. Ahora queda como "Aprobación: se deshizo" y la fecha se borra.
--
-- Misma firma: el código publicado sigue andando igual. Un comando, sin estos
-- comentarios, con `supabase db query` (NUNCA db push).
-- ============================================================

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
      -- Deshacer una aprobación: el papel vuelve a estar sin respuesta.
      WHEN p_estado = 'enviado' AND v_antes = 'aprobado' THEN NULL
      ELSE fecha_resolucion
    END
  WHERE id = p_requisito_id;

  -- El tipo es el de la transición. Volver a pendiente se registra con el tipo de lo que
  -- se deshace: deshacer una aprobación es una "Aprobación" que dice que se deshizo.
  v_tipo := CASE
    WHEN p_estado = 'enviado' AND v_antes = 'aprobado' THEN 'aprobacion'
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
    WHEN p_estado = 'enviado' AND v_antes = 'aprobado' THEN v_nombre || ': se deshizo la aprobación, vuelve a enviado'
    ELSE v_nombre || COALESCE(' — ' || NULLIF(BTRIM(COALESCE(p_motivo, '')), ''), '')
  END;

  IF v_tipo IS NOT NULL AND v_antes IS DISTINCT FROM p_estado THEN
    INSERT INTO hab_gestiones (odoo_ot_id, tipo, detalle, autor_id)
    VALUES (v_ot_id, v_tipo, v_detalle, auth.uid());
  END IF;

  RETURN hab_gestion_de(v_ot_id) || jsonb_build_object('otId', v_ot_id);
END;
$$;
