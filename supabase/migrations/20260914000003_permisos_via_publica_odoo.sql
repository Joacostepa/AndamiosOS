-- ========================================================================
-- Permisos vía pública — el robot escribe el estado del permiso en la venta de Odoo
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: sale.order.x_tramite_estado, x_expediente_nro, x_expediente_fecha
-- y x_permiso_fecha se cargan a mano, y de ellos dependen el candado del tablero y
-- Habilitaciones. Al 2026-09-14 ninguna venta tenía el número de expediente cargado y sólo
-- 11 tenían el estado del trámite. TAD ya se lee solo: falta que lo que se lee llegue a Odoo.
--
-- LA REGLA: el robot sólo escribe en una venta cuando el vínculo expediente → venta es
-- seguro. Por número de expediente lo es. Por dirección NO: la misma dirección tiene
-- varias ventas (renovaciones, otra obra años después) y un vínculo equivocado le
-- destraba el candado a la obra de otro. Por eso un vínculo por dirección queda
-- "propuesto" hasta que una persona lo confirma una vez desde la ficha.
--
-- DESCARTAR NO ES BORRAR: la venta descartada se recuerda para que el robot no la vuelva
-- a proponer en la vuelta siguiente.
--
-- QUIÉN ESCRIBE: el robot (service role) todo lo de Odoo. La persona sólo confirma,
-- descarta o vincula a mano, y lo hace por funciones que chequean su permiso sobre el
-- módulo: la tabla sigue siendo de sólo lectura para los usuarios.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_expedientes
    ADD COLUMN IF NOT EXISTS odoo_vinculo_por           TEXT CHECK (odoo_vinculo_por IN ('numero', 'direccion', 'persona')),
    ADD COLUMN IF NOT EXISTS odoo_vinculo_confirmado_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS odoo_vinculo_confirmado_por UUID REFERENCES user_profiles(id),
    ADD COLUMN IF NOT EXISTS odoo_ventas_descartadas    BIGINT[] NOT NULL DEFAULT '{}',
    -- Lo último que el robot dejó en la venta, tal cual se mandó a Odoo.
    ADD COLUMN IF NOT EXISTS odoo_escrito               JSONB,
    ADD COLUMN IF NOT EXISTS odoo_escrito_at            TIMESTAMPTZ,
    -- Por qué NO se escribió (p. ej. la venta ya tiene otro expediente cargado a mano).
    ADD COLUMN IF NOT EXISTS odoo_error                 TEXT,
    -- Del PDF del permiso: fecha de firma y vigencia otorgada (puede ser menor a la pedida).
    ADD COLUMN IF NOT EXISTS permiso_emitido_el         DATE,
    ADD COLUMN IF NOT EXISTS permiso_vence              DATE;

  UPDATE pvp_expedientes e SET odoo_vinculo_por = 'direccion'
    WHERE e.odoo_venta_id IS NOT NULL AND e.odoo_vinculo_por IS NULL;

  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_tipo_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_tipo_check CHECK (tipo IN (
    'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
    'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot', 'caratula_leida',
    'vinculo_confirmado', 'vinculo_descartado', 'odoo_escrito', 'odoo_conflicto'
  ));

  ALTER TABLE pvp_tareas DROP CONSTRAINT IF EXISTS pvp_tareas_tipo_check;
  ALTER TABLE pvp_tareas ADD CONSTRAINT pvp_tareas_tipo_check CHECK (tipo IN ('tad_revisar', 'odoo_sincronizar'));

  -- ── ¿Puede editar el módulo? ──────────────────────────────────────────────
  -- Misma regla que nivelEn() de src/lib/auth/acceso.ts. Va en la base y no sólo en el
  -- proxy porque las funciones de abajo se pueden llamar directo desde el navegador.
  CREATE OR REPLACE FUNCTION public.pvp_puede_editar()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT COALESCE((
      SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'permisos-via-publica' = 'editar')
      FROM public.user_profiles p WHERE p.id = auth.uid()
    ), false);
  $fn$;

  -- ── Confirmar o descartar el vínculo propuesto ────────────────────────────
  CREATE OR REPLACE FUNCTION public.pvp_resolver_vinculo(p_id uuid, p_confirmar boolean)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  DECLARE e pvp_expedientes;
  BEGIN
    IF NOT pvp_puede_editar() THEN RAISE EXCEPTION 'No tenés permiso para editar Permisos de andamio'; END IF;
    SELECT * INTO e FROM pvp_expedientes WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El expediente no existe'; END IF;
    IF e.odoo_venta_id IS NULL THEN RAISE EXCEPTION 'El expediente no tiene una venta propuesta'; END IF;

    IF p_confirmar THEN
      UPDATE pvp_expedientes SET odoo_vinculo_confirmado_at = now(), odoo_vinculo_confirmado_por = auth.uid(),
        odoo_error = NULL, updated_at = now() WHERE id = p_id;
      INSERT INTO pvp_eventos (expediente_id, tipo, detalle, datos, actor)
        VALUES (p_id, 'vinculo_confirmado', e.odoo_venta_nombre, jsonb_build_object('odoo_venta_id', e.odoo_venta_id, 'por', auth.uid()), 'persona');
      INSERT INTO pvp_tareas (tipo, pedida_por) VALUES ('odoo_sincronizar', auth.uid()) ON CONFLICT DO NOTHING;
    ELSE
      UPDATE pvp_expedientes SET
        odoo_ventas_descartadas = array_append(odoo_ventas_descartadas, e.odoo_venta_id),
        odoo_venta_id = NULL, odoo_venta_nombre = NULL, cliente = NULL, odoo_vinculo_por = NULL,
        odoo_vinculo_confirmado_at = NULL, odoo_vinculo_confirmado_por = NULL, odoo_error = NULL,
        updated_at = now()
      WHERE id = p_id;
      INSERT INTO pvp_eventos (expediente_id, tipo, detalle, datos, actor)
        VALUES (p_id, 'vinculo_descartado', e.odoo_venta_nombre, jsonb_build_object('odoo_venta_id', e.odoo_venta_id, 'por', auth.uid()), 'persona');
    END IF;
  END;
  $fn$;

  -- ── Vincular a mano ───────────────────────────────────────────────────────
  -- Para las carátulas sin altura (la calle se escribió sin elegirla del buscador de TAD) y
  -- para cuando la propuesta por dirección era otra venta. La ruta de la API busca la venta
  -- en Odoo y pasa id, nombre y cliente: la base no habla con Odoo.
  CREATE OR REPLACE FUNCTION public.pvp_vincular_a_mano(p_id uuid, p_venta_id bigint, p_venta_nombre text, p_cliente text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  BEGIN
    IF NOT pvp_puede_editar() THEN RAISE EXCEPTION 'No tenés permiso para editar Permisos de andamio'; END IF;
    UPDATE pvp_expedientes SET odoo_venta_id = p_venta_id, odoo_venta_nombre = p_venta_nombre, cliente = p_cliente,
      odoo_vinculo_por = 'persona', odoo_vinculo_confirmado_at = now(), odoo_vinculo_confirmado_por = auth.uid(),
      odoo_ventas_descartadas = array_remove(odoo_ventas_descartadas, p_venta_id), odoo_error = NULL, updated_at = now()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El expediente no existe'; END IF;
    INSERT INTO pvp_eventos (expediente_id, tipo, detalle, datos, actor)
      VALUES (p_id, 'vinculo_confirmado', p_venta_nombre || ' (vinculada a mano)', jsonb_build_object('odoo_venta_id', p_venta_id, 'por', auth.uid()), 'persona');
    INSERT INTO pvp_tareas (tipo, pedida_por) VALUES ('odoo_sincronizar', auth.uid()) ON CONFLICT DO NOTHING;
  END;
  $fn$;

  REVOKE ALL ON FUNCTION public.pvp_puede_editar() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.pvp_resolver_vinculo(uuid, boolean) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.pvp_vincular_a_mano(uuid, bigint, text, text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.pvp_puede_editar() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.pvp_resolver_vinculo(uuid, boolean) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.pvp_vincular_a_mano(uuid, bigint, text, text) TO authenticated;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
