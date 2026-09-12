-- Los comentarios de Operaciones y las notas de la habilitación dejan de ser el mismo hilo.
--
-- QUÉ PASÓ: al unificarlos, el panel del tablero quedó mostrando el expediente de la
-- habilitación. Medido sobre las 21 filas que había: 19 son de Agustina y son papeles
-- —CUITs, mails, "ENVIAR MEMORIA DE CÁLCULO", "se envió mail 01/09 11:24 a lucio@…"— y
-- UNA sola es de Operaciones ("esta obra no pasa nada si se necesita mover hacia atrás
-- 2/3 días"). Esa proporción no se arregla sola: el que planifica abre el panel, ve nueve
-- líneas de trámite y deja de abrirlo.
--
-- SON DOS CONVERSACIONES CON DOS INTERLOCUTORES. La de habilitación es con el área de
-- SyH del cliente y su asunto son los papeles para poder entrar. La de operaciones es con
-- quien está en la obra y su asunto es cuándo y cómo se entra. Que las dos cuelguen de la
-- misma OT no las hace la misma charla.
--
-- UNA COLUMNA Y NO DOS TABLAS. Es el mismo objeto —un texto con autor y fecha colgado de
-- una OT— con dos audiencias. Dos tablas duplicarían el servicio, los hooks, las rutas,
-- las políticas y el trigger de inmutabilidad para distinguir una palabra, y cerrarían la
-- puerta a mostrar las dos juntas el día que haga falta.
--
-- TAMPOCO SE SEPARA POR EL ROL DEL AUTOR, que era la tentación: Agustina y los cinco
-- operativos comparten el rol `operativo`, y la misma persona puede escribir de las dos
-- cosas en el mismo día. El ámbito lo define DESDE DÓNDE se escribe, no quién escribe.

ALTER TABLE ot_comentarios ADD COLUMN IF NOT EXISTS ambito TEXT;

COMMENT ON COLUMN ot_comentarios.ambito IS
  'operaciones = lo que se habló con la obra sobre la jornada (panel del tablero). habilitacion = el trámite de papeles con el cliente (módulo de habilitaciones).';

-- ── El backfill ─────────────────────────────────────────────────────────────
--
-- El corte es la fecha, y es exacto: hasta el 2026-09-12 el módulo de habilitaciones era
-- el ÚNICO lugar desde donde se podía escribir, así que todo lo anterior es de
-- habilitación por construcción. El panel del tablero se desplegó ese día, y la única
-- fila posterior es justamente la de Operaciones.
--
-- Comprobado antes de escribir esto: la nota más nueva de habilitación es del 2026-09-11
-- 18:52 y la de Operaciones del 2026-09-12 19:28. No hay ninguna del 12 escrita desde
-- habilitaciones, así que el corte a medianoche no parte nada por el medio.
UPDATE ot_comentarios
   SET ambito = CASE WHEN created_at < '2026-09-12 00:00:00+00' THEN 'habilitacion' ELSE 'operaciones' END
 WHERE ambito IS NULL;

-- ── SIN DEFAULT, a propósito ────────────────────────────────────────────────
--
-- Es el punto entero de la migración. Con un default, el día que alguien agregue una
-- tercera pantalla que escriba comentarios y se olvide de decir el ámbito, las dos
-- conversaciones se vuelven a mezclar y nadie se entera hasta que el panel está lleno de
-- ruido otra vez. Sin default, ese olvido no compila: falla en el insert.
ALTER TABLE ot_comentarios ALTER COLUMN ambito SET NOT NULL;

ALTER TABLE ot_comentarios DROP CONSTRAINT IF EXISTS ot_comentarios_ambito;
ALTER TABLE ot_comentarios ADD CONSTRAINT ot_comentarios_ambito
  CHECK (ambito IN ('operaciones', 'habilitacion'));

-- El índice arranca por el ámbito: las dos pantallas piden SIEMPRE uno de los dos, nunca
-- los comentarios de una OT a secas.
DROP INDEX IF EXISTS idx_ot_comentarios_ot;
CREATE INDEX IF NOT EXISTS idx_ot_comentarios_ambito_ot
  ON ot_comentarios(ambito, odoo_ot_id, fijada DESC, created_at DESC);

-- ── La ficha de habilitación ve SÓLO lo suyo ────────────────────────────────
--
-- Se recrea idéntica salvo el filtro. Lo que Operaciones escriba en el tablero no tiene
-- por qué aparecer en el expediente: al área de SyH del cliente no le sirve saber que la
-- obra se puede correr dos días.
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
      WHERE n.odoo_ot_id = p_ot_id AND n.ambito = 'habilitacion'
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
