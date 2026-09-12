-- Comentarios de la OT — el hilo que Operaciones lleva sobre cada obra.
--
-- QUÉ PROBLEMA RESUELVE: Operaciones habla con el cliente y acuerda cosas que no están
-- en ningún campo — "entramos 8am el martes, portero avisado", "si llueve corre al
-- jueves", "el encargado pide avisar el día anterior". Hoy eso vive en un WhatsApp y se
-- pierde: el que planifica el jueves no sabe lo que se habló el lunes.
--
-- NO SE CREA UNA TABLA NUEVA: se renombra hab_notas, que ya tenía exactamente esta forma
-- y ya tiene 20 notas cargadas por el equipo. Lo que cambia es el alcance. Nacieron como
-- "notas de la habilitación" y se usan como notas de la obra a secas; el prefijo hab_ ya
-- no describe lo que hay adentro y en esta base los nombres que mienten se pagan caro.
--
-- POR QUÉ "COMENTARIOS" Y NO "NOTAS": porque `plan_notas_dia` ya se llama notas y es otra
-- cosa —lo que pasa un día con una cuadrilla, no lo que pasa con una obra—. Dos nombres
-- para dos cosas distintas cuesta una migración; uno solo para las dos cuesta para
-- siempre.
--
-- POR QUÉ EL COMENTARIO ES DE LA OT Y NO DE LA TARJETA: una obra de tres días son tres
-- tarjetas, y si el plan quedó partido en tramos, más. "El cliente confirmó 8am" atado a
-- una tarjeta se pierde en cuanto esa jornada se mueve o se libera, y aparece en una sola
-- de las tres. Atado a la OT se ve en todas.

-- ── El renombre ─────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS hab_notas RENAME TO ot_comentarios;
ALTER INDEX  IF EXISTS idx_hab_notas_ot RENAME TO idx_ot_comentarios_ot;

COMMENT ON TABLE ot_comentarios IS
  'Hilo de comentarios de una orden de trabajo: lo que se habló con el cliente y no entra en ningún campo. Antes hab_notas.';

-- ── El autor lo pone Postgres ───────────────────────────────────────────────
--
-- Con el default, ninguna ruta puede insertar un comentario sin firma por olvidarse de
-- pasar el userId, y la política de abajo impide firmarlo con el nombre de otro.
ALTER TABLE ot_comentarios ALTER COLUMN autor_id SET DEFAULT auth.uid();

-- ── El texto no se edita ────────────────────────────────────────────────────
--
-- Un comentario es el registro de una charla con el cliente: si se puede reescribir,
-- deja de servir para saber qué se acordó. Mismo criterio que hab_gestiones, que es
-- append-only. Un comentario equivocado se borra y se escribe otro; lo que no se puede
-- es cambiarle el contenido dejando la fecha y el autor viejos.
--
-- Vive en un trigger y no en la UI por lo mismo de siempre: si la garantía depende de
-- que el formulario se porte bien, no es una garantía.
CREATE OR REPLACE FUNCTION ot_comentarios_texto_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.texto IS DISTINCT FROM OLD.texto THEN
    RAISE EXCEPTION 'El texto de un comentario no se edita. Borralo y escribí otro.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ot_comentarios_texto_inmutable ON ot_comentarios;
CREATE TRIGGER trg_ot_comentarios_texto_inmutable
  BEFORE UPDATE ON ot_comentarios
  FOR EACH ROW EXECUTE FUNCTION ot_comentarios_texto_inmutable();

-- ── Quién puede qué ─────────────────────────────────────────────────────────
--
-- Ven todos y escriben todos: son 7 usuarios y el caso que motiva la tabla es "me
-- atendió el encargado y me dijo tal cosa", que le puede pasar a cualquiera.
--
-- BORRA SÓLO EL AUTOR. No es jerarquía: es que borrar el comentario de otro borra el
-- único registro de una conversación a la que no estuviste. Un admin que necesite sacar
-- algo lo hace desde Supabase, y queda el rastro de que fue una excepción.
--
-- FIJAR SÍ LO PUEDE HACER CUALQUIERA: decidir qué queda arriba de todo es curaduría
-- compartida, y el trigger de arriba ya garantiza que un UPDATE no pueda tocar el texto.
DROP POLICY IF EXISTS "Autenticados ven notas"      ON ot_comentarios;
DROP POLICY IF EXISTS "Autenticados gestionan notas" ON ot_comentarios;

DROP POLICY IF EXISTS "Autenticados ven comentarios" ON ot_comentarios;
CREATE POLICY "Autenticados ven comentarios" ON ot_comentarios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados comentan" ON ot_comentarios;
CREATE POLICY "Autenticados comentan" ON ot_comentarios
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

DROP POLICY IF EXISTS "Autenticados fijan comentarios" ON ot_comentarios;
CREATE POLICY "Autenticados fijan comentarios" ON ot_comentarios
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "El autor borra su comentario" ON ot_comentarios;
CREATE POLICY "El autor borra su comentario" ON ot_comentarios
  FOR DELETE TO authenticated USING (autor_id = auth.uid());

-- ── La función de la ficha de habilitación, apuntando al nombre nuevo ───────
--
-- Se recrea idéntica salvo la tabla: la ficha del módulo sigue mostrando el hilo junto a
-- los requisitos y las gestiones, que es donde Agustina lo lee. Es el mismo hilo que el
-- panel del tablero — una obra tiene UNA conversación, no una por pantalla.
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
      FROM ot_comentarios n LEFT JOIN user_profiles p ON p.id = n.autor_id
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

GRANT EXECUTE ON FUNCTION hab_gestion_de(BIGINT) TO authenticated;
