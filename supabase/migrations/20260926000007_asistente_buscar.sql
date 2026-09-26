-- ========================================================================
-- Asistente comercial: buscar conversaciones
-- ========================================================================
--
-- Joaquín (26/09): la lista muestra las últimas 40 y los títulos son el primer mensaje
-- ("...", "Hola, ¿cómo estás?"), así que una charla vieja no se encuentra. Se busca por lo que
-- uno recuerda: el cliente, la obra, el número de Odoo o algo que se dijo.
--
-- asistente_buscar(usuario, texto, todos, límite) devuelve las conversaciones que tienen TODAS
-- las palabras (en cualquier orden, sin distinguir acentos ni mayúsculas) entre el título, el
-- cliente, el contacto, la obra, el número de Odoo y el texto de los mensajes; y, de cada una,
-- el mensaje donde aparecen más palabras, para mostrar el pedacito. Incluye las archivadas (así
-- se recuperan). todos = true sólo para los administradores (lo decide la API).
--
-- La llama sólo el servidor (service_role): con todos = true devolvería charlas ajenas.
--
-- Recorre el texto de todas las conversaciones en cada búsqueda: con cientos va sobrado. Si un
-- día son decenas de miles, pasar a una columna de búsqueda guardada.
--
-- Sólo agrega: el código de hoy no la usa. Aplicar ANTES de subir el código que la llama:
--   node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$ BEGIN

  CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

  CREATE OR REPLACE FUNCTION public.asistente_buscar(p_usuario uuid, p_q text, p_todos boolean DEFAULT false, p_limite int DEFAULT 30)
  RETURNS TABLE (id uuid, fragmento text)
  LANGUAGE sql STABLE
  SET search_path = public, extensions
  AS $fn$
    WITH q AS (
      SELECT coalesce(array_agg(w), '{}') AS ws
      FROM unnest(regexp_split_to_array(lower(unaccent(coalesce(p_q, ''))), '\s+')) AS w
      WHERE w <> ''
    ),
    c AS (
      SELECT c.id, c.ultimo_mensaje_at, c.created_at,
        lower(unaccent(concat_ws(' ',
          c.titulo, b.odoo_venta_nombre,
          b.datos -> 'cliente' ->> 'razonSocial', b.datos -> 'cliente' ->> 'contacto', b.datos -> 'obra' ->> 'direccion',
          (SELECT string_agg(m.texto, ' ') FROM asistente_mensajes m WHERE m.conversacion_id = c.id AND m.tipo IN ('humano', 'asistente'))
        ))) AS todo
      FROM asistente_conversaciones c
      LEFT JOIN cotizacion_borradores b ON b.id = c.borrador_id
      WHERE p_todos OR c.usuario_id = p_usuario
    ),
    hallados AS (
      SELECT c.id, c.ultimo_mensaje_at, c.created_at
      FROM c, q
      WHERE cardinality(q.ws) > 0
        AND NOT EXISTS (SELECT 1 FROM unnest(q.ws) w WHERE strpos(c.todo, w) = 0)
      ORDER BY c.ultimo_mensaje_at DESC NULLS LAST, c.created_at DESC
      LIMIT greatest(1, least(coalesce(p_limite, 30), 100))
    )
    SELECT h.id, f.texto
    FROM hallados h
    CROSS JOIN q
    LEFT JOIN LATERAL (
      SELECT m.texto
      FROM asistente_mensajes m
      WHERE m.conversacion_id = h.id AND m.tipo IN ('humano', 'asistente') AND m.texto IS NOT NULL
        AND EXISTS (SELECT 1 FROM unnest(q.ws) w WHERE strpos(lower(unaccent(m.texto)), w) > 0)
      ORDER BY (SELECT count(*) FROM unnest(q.ws) w WHERE strpos(lower(unaccent(m.texto)), w) > 0) DESC, m.seq
      LIMIT 1
    ) f ON true
    ORDER BY h.ultimo_mensaje_at DESC NULLS LAST, h.created_at DESC;
  $fn$;

  REVOKE EXECUTE ON FUNCTION public.asistente_buscar(uuid, text, boolean, int) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.asistente_buscar(uuid, text, boolean, int) TO service_role;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
