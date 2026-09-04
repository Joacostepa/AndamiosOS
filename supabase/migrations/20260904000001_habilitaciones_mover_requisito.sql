-- ============================================================
-- AndamiosOS — mover un requisito en UNA sola ida a la base
--
-- EL PROBLEMA, medido: cada request a Supabase cuesta ~300 ms FIJOS desde Argentina
-- —traer una fila cuesta lo mismo que traer sesenta, y el RTT de red es 23 ms, así que
-- no es la red ni el tamaño de la consulta—. Marcar un requisito hacía cinco idas
-- secuenciales:
--
--   auth.getUser()          ~300 ms
--   select del requisito    ~345 ms   (para saber si ya tenía fecha_envio)
--   update del requisito    ~338 ms
--   insert en hab_gestiones ~300 ms
--   fetchGestionDe          ~463 ms   (tres selects, esos sí en paralelo)
--   ─────────────────────────────────
--   ~1,5 s por clic en la acción más frecuente del módulo.
--
-- Acá adentro las cinco son una. El `select` previo desaparece porque el sellado de
-- fecha_envio se resuelve con un COALESCE, y el bloque de vuelta se arma en la misma
-- transacción, así que además no puede quedar desfasado del cambio que lo generó.
--
-- SECURITY INVOKER (el default, explícito para que se lea): las políticas de RLS siguen
-- aplicando igual que si la app hiciera los queries sueltos. En particular hab_gestiones
-- sigue siendo append-only por RLS, no por buena conducta de esta función. Y el autor
-- sale de auth.uid(), que es el JWT que ya viaja en la request: por eso la ruta tampoco
-- necesita el round trip de auth.getUser() para saber quién escribe.
--
-- FECHAS: current_date, que en Supabase es UTC, igual que el `new Date()` de las rutas
-- corriendo en Vercel. Se mantiene el comportamiento que ya había, no se corrige acá.
-- ============================================================

-- ========================
-- El bloque que la ficha necesita de Supabase, tal cual lo arma fetchGestionDe.
-- Se comparte entre las dos funciones de abajo para que no puedan divergir.
-- ========================
CREATE OR REPLACE FUNCTION hab_gestion_de(p_ot_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'requisitos', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.orden, r.created_at)
      FROM hab_requisitos r WHERE r.odoo_ot_id = p_ot_id
    ), '[]'::jsonb),
    'notas', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(n) || jsonb_build_object('autor_nombre', p.nombre)
        ORDER BY n.fijada DESC, n.created_at DESC
      )
      FROM hab_notas n LEFT JOIN user_profiles p ON p.id = n.autor_id
      WHERE n.odoo_ot_id = p_ot_id
    ), '[]'::jsonb),
    'gestiones', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(g) || jsonb_build_object('autor_nombre', p.nombre)
        ORDER BY g.created_at DESC
      )
      FROM hab_gestiones g LEFT JOIN user_profiles p ON p.id = g.autor_id
      WHERE g.odoo_ot_id = p_ot_id
    ), '[]'::jsonb),
    'reclamos', (
      SELECT COUNT(*) FROM hab_gestiones g
      WHERE g.odoo_ot_id = p_ot_id AND g.tipo = 'reclamo'
    )
  );
$$;

-- ========================
-- Un requisito. Devuelve el bloque fresco y el otId, que la ruta necesita para
-- disparar la sincronización con Odoo en after().
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
  v_ot_id BIGINT;
  v_tipo  TEXT;
BEGIN
  UPDATE hab_requisitos SET
    estado     = p_estado,
    motivo_obs = CASE WHEN p_estado = 'observado' THEN p_motivo ELSE NULL END,
    -- La fecha de envío se sella la PRIMERA vez y no se pisa: es la que sostiene la
    -- etapa `c` en Odoo y el "días sin respuesta" de la fila. Volver a `pendiente` sí
    -- la borra, porque el requisito deja de estar enviado.
    fecha_envio = CASE
      WHEN p_estado = 'pendiente' THEN NULL
      WHEN p_estado = 'enviado' THEN COALESCE(fecha_envio, current_date)
      ELSE fecha_envio
    END,
    fecha_resolucion = CASE
      WHEN p_estado IN ('aprobado', 'observado') THEN current_date
      WHEN p_estado = 'pendiente' THEN NULL
      ELSE fecha_resolucion
    END
  WHERE id = p_requisito_id
  RETURNING odoo_ot_id INTO v_ot_id;

  IF v_ot_id IS NULL THEN
    RAISE EXCEPTION 'No existe el requisito %', p_requisito_id;
  END IF;

  -- El historial guarda las transiciones que después hay que poder demostrar. Volver a
  -- `pendiente` no registra nada: deshacer un clic no es una gestión ante el cliente.
  v_tipo := CASE p_estado
    WHEN 'enviado'   THEN 'envio'
    WHEN 'aprobado'  THEN 'aprobacion'
    WHEN 'observado' THEN 'observacion'
    ELSE NULL
  END;

  IF v_tipo IS NOT NULL THEN
    INSERT INTO hab_gestiones (odoo_ot_id, tipo, detalle, autor_id)
    VALUES (v_ot_id, v_tipo, NULLIF(BTRIM(COALESCE(p_motivo, '')), ''), auth.uid());
  END IF;

  RETURN hab_gestion_de(v_ot_id) || jsonb_build_object('otId', v_ot_id);
END;
$$;

-- ========================
-- Todos los requisitos de una obra de un solo gesto.
--
-- La oficina manda un mail con todos los papeles y el cliente contesta "está todo bien".
-- Sólo mueve lo que corresponde: "marcar todo enviado" no toca lo ya aprobado ni pisa una
-- observación pendiente de corregir, y "aprobar todo" no resucita lo observado sin que
-- alguien lo mire. Mismo criterio que tenía marcarTodosLosRequisitos en el servicio.
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
  v_desde TEXT;
  v_n     INTEGER;
BEGIN
  v_desde := CASE WHEN p_estado = 'enviado' THEN 'pendiente' ELSE 'enviado' END;

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
  WHERE odoo_ot_id = p_ot_id AND estado = v_desde;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 THEN
    INSERT INTO hab_gestiones (odoo_ot_id, tipo, detalle, autor_id)
    VALUES (
      p_ot_id,
      CASE WHEN p_estado = 'enviado' THEN 'envio' ELSE 'aprobacion' END,
      v_n || ' requisito' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' en un solo gesto',
      auth.uid()
    );
  END IF;

  RETURN hab_gestion_de(p_ot_id) || jsonb_build_object('movidos', v_n);
END;
$$;

GRANT EXECUTE ON FUNCTION hab_gestion_de(BIGINT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION hab_mover_requisito(UUID, TEXT, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION hab_mover_todos(BIGINT, TEXT)          TO authenticated;
