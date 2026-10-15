-- ============================================================
-- Modelador ABA: endurecimiento (revisión de seguridad e integridad antes de producción).
--
-- 1. tec_generar_computo deja de poder llamarse por PostgREST con la sesión del usuario. Antes, al
--    ser SECURITY DEFINER con GRANT a authenticated, cualquiera con permiso podía mandar p_lineas
--    arbitrarias y estampar origen='modelo'/modelo_revision con datos que no salieron del modelo.
--    Ahora la firma lleva p_uid (el usuario que la ruta ya verificó), solo la ejecuta service_role
--    y los permisos se revalidan con ese uid. La ruta /api/tecnica/modelador/[id]/computo recalcula las
--    líneas desde el diseño guardado y la llama con el cliente de servicio.
-- 2. Candado por obra (pg_advisory_xact_lock): dos generaciones a la vez no crean dos cómputos.
-- 3. tec_pieza_mapa y tec_kits: escribe solo admin. Es configuración global: cambiar el mapeo
--    familia → código cambia los cómputos reales de todos los modelos.
-- 4. tec_modelos: BEFORE INSERT que fija created_by/updated_by = auth.uid() y revision = 1, y tope
--    de tamaño del resumen.
--
-- Requiere 20261015000001…3. NO SE APLICA SOLA; idempotente, sin BEGIN/COMMIT.
-- Bajada (a mano, no es migración): supabase/scripts/modelador_down.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permisos con uid explícito (para la RPC llamada con service_role, donde auth.uid() es null)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tec_puede_editar_uid(p_uid uuid) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'modelador' = 'editar')
                   FROM user_profiles p WHERE p.id = p_uid), false);
$$;

CREATE OR REPLACE FUNCTION computos_puede_editar_uid(p_uid uuid) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text IN ('admin', 'operativo') OR p.permisos->>'computos' = 'editar')
                   FROM user_profiles p WHERE p.id = p_uid), false);
$$;

REVOKE ALL ON FUNCTION tec_puede_editar_uid(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION computos_puede_editar_uid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tec_puede_editar_uid(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION computos_puede_editar_uid(uuid) TO service_role;

-- La firma vieja (sin p_uid) se va: era la que se podía llamar desde el navegador.
DROP FUNCTION IF EXISTS tec_generar_computo(uuid, uuid, int, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION tec_generar_computo(
  p_uid uuid,
  p_modelo uuid,
  p_obra uuid,
  p_revision int,
  p_lineas jsonb,
  p_decisiones jsonb DEFAULT '{}'::jsonb,
  p_metricas jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_modelo   tec_modelos%ROWTYPE;
  v_computo  computos%ROWTYPE;
  v_item     computo_items%ROWTYPE;
  v_creado   boolean := false;
  v_ins int := 0; v_act int := 0; v_bor int := 0; v_cons int := 0; v_igu int := 0;
  r          record;
  v_dec      text;
  v_nueva    int;
  v_dec_json jsonb := COALESCE(p_decisiones, '{}'::jsonb);
  v_met      jsonb := COALESCE(p_metricas, '{}'::jsonb);
  v_ids      uuid[];
  v_lineas   jsonb;
BEGIN
  IF p_uid IS NULL OR NOT (tec_puede_editar_uid(p_uid) AND computos_puede_editar_uid(p_uid)) THEN
    RAISE EXCEPTION 'No tenés permiso para generar el cómputo (hace falta Modelador y Cómputos en «editar»).'
      USING ERRCODE = '42501';
  END IF;

  -- Serializa las generaciones de la misma obra (aunque vengan de modelos distintos): sin esto, dos
  -- llamadas a la vez sobre una obra sin cómputo creaban dos cómputos.
  PERFORM pg_advisory_xact_lock(hashtext('tec_generar_computo:' || p_obra::text));

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'Las líneas del cómputo no vinieron bien.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_modelo FROM tec_modelos WHERE id = p_modelo AND archivado_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encuentro el modelo.' USING ERRCODE = 'P0002';
  END IF;
  IF v_modelo.es_plantilla THEN
    RAISE EXCEPTION 'Una plantilla no genera cómputo: creá un modelo desde la plantilla.' USING ERRCODE = '22023';
  END IF;
  IF v_modelo.revision <> p_revision THEN
    RAISE EXCEPTION 'El modelo cambió, volvé a generar.' USING ERRCODE = '40001';
  END IF;
  IF v_modelo.obra_id IS NOT NULL AND v_modelo.obra_id <> p_obra THEN
    RAISE EXCEPTION 'El modelo está vinculado a otra obra.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM obras WHERE id = p_obra) THEN
    RAISE EXCEPTION 'No encuentro la obra.' USING ERRCODE = 'P0002';
  END IF;

  -- Líneas consolidadas por pieza (las de cantidad ≤ 0 no cuentan). Sin tabla temporal: un
  -- arreglo de ids y un jsonb alcanzan para un cómputo (decenas de líneas).
  SELECT COALESCE(array_agg(x.pieza_id), '{}'), COALESCE(jsonb_agg(jsonb_build_object('pieza_id', x.pieza_id, 'cantidad', x.cantidad)), '[]'::jsonb)
    INTO v_ids, v_lineas
    FROM (SELECT l.pieza_id, ceil(sum(l.cantidad))::int AS cantidad
            FROM jsonb_to_recordset(p_lineas) AS l(pieza_id uuid, cantidad numeric)
           WHERE l.pieza_id IS NOT NULL AND l.cantidad > 0
           GROUP BY l.pieza_id) x;

  IF EXISTS (SELECT 1 FROM unnest(v_ids) AS u(id) WHERE NOT EXISTS (SELECT 1 FROM catalogo_piezas c WHERE c.id = u.id)) THEN
    RAISE EXCEPTION 'Hay piezas que ya no están en el catálogo: recargá el modelador y volvé a generar.' USING ERRCODE = '22023';
  END IF;

  -- El último cómputo de la obra, o uno nuevo.
  SELECT * INTO v_computo FROM computos WHERE obra_id = p_obra
   ORDER BY version DESC, created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO computos (obra_id, created_by) VALUES (p_obra, p_uid) RETURNING * INTO v_computo;
    v_creado := true;
  ELSE
    -- Mismo set que src/lib/computos/estado.ts (ESTADOS_COMPLETADOS).
    IF v_computo.estado::text IN ('verificado', 'aprobado', 'en_preparacion', 'preparado') THEN
      RAISE EXCEPTION 'El cómputo está completado: no se regenera. Pasalo a «requiere ajuste» si hay que cambiarlo.'
        USING ERRCODE = '55000';
    END IF;
    IF v_computo.modelo_id IS NOT NULL AND v_computo.modelo_id <> p_modelo
       AND COALESCE(v_dec_json->>'_modelo', '') <> 'reemplazar' THEN
      RAISE EXCEPTION 'El cómputo de esta obra salió de otro modelo. Confirmá que querés reemplazarlo.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Lo que dice el modelo.
  FOR r IN SELECT * FROM jsonb_to_recordset(v_lineas) AS t(pieza_id uuid, cantidad int) LOOP
    SELECT * INTO v_item FROM computo_items
     WHERE computo_id = v_computo.id AND pieza_id = r.pieza_id
     ORDER BY (origen = 'modelo') DESC, id LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO computo_items (computo_id, pieza_id, cantidad_requerida, origen, modelo_cantidad)
      VALUES (v_computo.id, r.pieza_id, r.cantidad, 'modelo', r.cantidad);
      v_ins := v_ins + 1;

    ELSIF v_item.origen = 'modelo' THEN
      IF v_item.cantidad_requerida = r.cantidad THEN v_igu := v_igu + 1; ELSE v_act := v_act + 1; END IF;
      UPDATE computo_items SET cantidad_requerida = r.cantidad, modelo_cantidad = r.cantidad WHERE id = v_item.id;

    ELSIF v_item.cantidad_requerida = r.cantidad THEN
      -- La persona y el modelo dicen lo mismo: no hay nada que decidir.
      UPDATE computo_items SET modelo_cantidad = r.cantidad WHERE id = v_item.id;
      v_igu := v_igu + 1;

    ELSE
      v_dec := COALESCE(v_dec_json->>(r.pieza_id::text), 'mantener');
      IF v_dec = 'modelo' THEN
        UPDATE computo_items SET cantidad_requerida = r.cantidad, origen = 'modelo', modelo_cantidad = r.cantidad
         WHERE id = v_item.id;
        v_act := v_act + 1;
      ELSIF v_dec = 'sumar' THEN
        v_nueva := GREATEST(0, r.cantidad + (v_item.cantidad_requerida - COALESCE(v_item.modelo_cantidad, 0)));
        UPDATE computo_items SET cantidad_requerida = v_nueva, origen = 'modelo_editado', modelo_cantidad = r.cantidad
         WHERE id = v_item.id;
        v_act := v_act + 1;
      ELSE
        UPDATE computo_items SET modelo_cantidad = r.cantidad WHERE id = v_item.id;
        v_cons := v_cons + 1;
      END IF;
    END IF;
  END LOOP;

  -- Lo que el modelo ya no tiene.
  FOR v_item IN
    SELECT ci.* FROM computo_items ci
     WHERE ci.computo_id = v_computo.id
       AND ci.pieza_id <> ALL (v_ids)
  LOOP
    IF v_item.origen = 'modelo' THEN
      DELETE FROM computo_items WHERE id = v_item.id;
      v_bor := v_bor + 1;
    ELSIF v_item.origen = 'modelo_editado' THEN
      IF COALESCE(v_dec_json->>(v_item.pieza_id::text), 'mantener') = 'borrar' THEN
        DELETE FROM computo_items WHERE id = v_item.id;
        v_bor := v_bor + 1;
      ELSE
        UPDATE computo_items SET modelo_cantidad = 0 WHERE id = v_item.id;
        v_cons := v_cons + 1;
      END IF;
    END IF;
    -- 'manual' que el modelo no tiene: es de la persona, no se toca.
  END LOOP;

  UPDATE computos SET
    modelo_id            = p_modelo,
    modelo_revision      = p_revision,
    superficie           = COALESCE(NULLIF(v_met->>'m2', '')::numeric, superficie),
    metros_lineales      = COALESCE(NULLIF(v_met->>'ml', '')::numeric, metros_lineales),
    altura_maxima        = COALESCE(NULLIF(v_met->>'alturaMax', '')::numeric, altura_maxima),
    tipo_sistema_andamio = COALESCE(NULLIF(v_met->>'sistema', ''), tipo_sistema_andamio)
  WHERE id = v_computo.id;

  -- Un modelo sin obra queda vinculado a la obra para la que generó (no cambia la revisión).
  IF v_modelo.obra_id IS NULL THEN
    UPDATE tec_modelos SET obra_id = p_obra WHERE id = p_modelo;
  END IF;

  RETURN jsonb_build_object(
    'computo_id', v_computo.id,
    'creado', v_creado,
    'insertadas', v_ins,
    'actualizadas', v_act,
    'borradas', v_bor,
    'conservadas', v_cons,
    'iguales', v_igu
  );
END;
$$;

REVOKE ALL ON FUNCTION tec_generar_computo(uuid, uuid, uuid, int, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tec_generar_computo(uuid, uuid, uuid, int, jsonb, jsonb, jsonb) TO service_role;

-- ------------------------------------------------------------
-- 3. Mapa de piezas y kits: escribe solo admin (leen como antes)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Modelador edita mapa de piezas" ON tec_pieza_mapa;
DROP POLICY IF EXISTS "Admin edita mapa de piezas" ON tec_pieza_mapa;
CREATE POLICY "Admin edita mapa de piezas" ON tec_pieza_mapa
  FOR ALL TO authenticated USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Modelador edita kits" ON tec_kits;
DROP POLICY IF EXISTS "Admin edita kits" ON tec_kits;
CREATE POLICY "Admin edita kits" ON tec_kits
  FOR ALL TO authenticated USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

-- ------------------------------------------------------------
-- 4. tec_modelos: autoría al crear y tope del resumen
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tec_modelos_crear() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Desde PostgREST la autoría no la elige el cliente. Con service_role (auth.uid() null) se respeta.
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
  END IF;
  NEW.revision := 1;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tec_modelos_crear ON tec_modelos;
CREATE TRIGGER trg_tec_modelos_crear BEFORE INSERT ON tec_modelos
  FOR EACH ROW EXECUTE FUNCTION tec_modelos_crear();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tec_modelos_resumen_tope') THEN
    ALTER TABLE tec_modelos ADD CONSTRAINT tec_modelos_resumen_tope
      CHECK (resumen IS NULL OR pg_column_size(resumen) < 20000);
  END IF;
END $$;
