-- ============================================================
-- Modelador ABA: RLS de cómputos alineada con los permisos por módulo + RPC de generación.
-- Contrato: docs/oficina-tecnica/modelador/arquitectura-produccion.md §8.1 (riesgo R7).
--
-- 1. computos / computo_items: las escrituras pasan de get_user_role() IN ('admin','operativo')
--    a computos_puede_editar() (admin, rol operativo por compatibilidad, o permiso «computos» en
--    «editar»). El SELECT queda como estaba (autenticados).
-- 2. tec_generar_computo(): escribe el cómputo REAL de la obra a partir de las líneas que el
--    SERVIDOR recalculó desde el diseño guardado (nunca la BOM que manda el navegador). En una sola
--    transacción: control de revisión, bloqueo si el cómputo está completado, respeto de lo editado a
--    mano (decisión por línea) y borrado solo de lo que había puesto el modelo.
--    La misma lógica está espejada en TS para la previa (src/lib/tecnica/persistencia/computo.ts,
--    planGeneracion, con tests). Si cambia una, cambiar la otra.
--
-- Requiere la 20261015000001_modelador.sql. NO SE APLICA SOLA; idempotente, sin BEGIN/COMMIT.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admin y operativo pueden crear computos" ON computos;
DROP POLICY IF EXISTS "Cómputos: crear con permiso" ON computos;
CREATE POLICY "Cómputos: crear con permiso" ON computos
  FOR INSERT TO authenticated WITH CHECK (computos_puede_editar());

DROP POLICY IF EXISTS "Admin y operativo pueden editar computos" ON computos;
DROP POLICY IF EXISTS "Cómputos: editar con permiso" ON computos;
CREATE POLICY "Cómputos: editar con permiso" ON computos
  FOR UPDATE TO authenticated USING (computos_puede_editar()) WITH CHECK (computos_puede_editar());

DROP POLICY IF EXISTS "Admin y operativo pueden gestionar items computo" ON computo_items;
DROP POLICY IF EXISTS "Cómputos: gestionar ítems con permiso" ON computo_items;
CREATE POLICY "Cómputos: gestionar ítems con permiso" ON computo_items
  FOR ALL TO authenticated USING (computos_puede_editar()) WITH CHECK (computos_puede_editar());

-- ------------------------------------------------------------
-- 2. RPC
-- ------------------------------------------------------------
-- p_lineas:     [{ "pieza_id": uuid, "cantidad": int }]   (las repetidas se suman)
-- p_decisiones: { "<pieza_id>": "mantener" | "modelo" | "sumar" | "borrar", "_modelo": "reemplazar" }
--   · fila del modelo que alguien editó a mano, o fila manual, y el modelo dice otra cantidad:
--       'mantener' (default) deja la de la persona; 'modelo' pisa con la del modelo;
--       'sumar' = cantidad del modelo + lo que la persona le había agregado a mano.
--   · fila editada a mano que el modelo ya no tiene: 'mantener' (default) o 'borrar'.
--   · '_modelo' = 'reemplazar': el cómputo venía de OTRO modelo y se acepta reemplazarlo.
-- p_metricas:   { "m2": n, "ml": n, "alturaMax": n, "sistema": "multidireccional" | "tubular" }
CREATE OR REPLACE FUNCTION tec_generar_computo(
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
  IF NOT (tec_puede_editar() AND computos_puede_editar()) THEN
    RAISE EXCEPTION 'No tenés permiso para generar el cómputo (hace falta Modelador y Cómputos en «editar»).'
      USING ERRCODE = '42501';
  END IF;

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
    INSERT INTO computos (obra_id, created_by) VALUES (p_obra, auth.uid()) RETURNING * INTO v_computo;
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

REVOKE ALL ON FUNCTION tec_generar_computo(uuid, uuid, int, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tec_generar_computo(uuid, uuid, int, jsonb, jsonb, jsonb) TO authenticated;
