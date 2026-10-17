-- ============================================================
-- Recorridos obligatorios: quién ya hizo cuál.
--
-- El primero es el de Sistemas («Reportar», docs/sistemas/propuesta.md §1 y §5 decisión 3):
-- le aparece a TODOS la próxima vez que entran al dashboard, también a los usuarios nuevos,
-- hasta que tocan «Entendido» en el último paso. Recién ahí se escribe la fila.
--
-- POR QUÉ EN LA BASE Y NO EN localStorage: los tours de Habilitaciones (use-tour.ts) se
-- marcan en el navegador porque son opcionales. Éste es obligatorio: hecho en la compu no se
-- tiene que volver a pedir en el celular, y Sistemas tiene que poder contar quién falta.
--
-- GENÉRICA: (usuario, clave, versión). Una versión nueva del mismo recorrido (cambió la
-- pantalla) se vuelve a mostrar sin borrar nada. La misma tabla va a servir para las
-- Novedades del sistema (etapa 2).
--
-- RLS: cada uno lee lo suyo (el admin, todo: para contar quién falta) y escribe sólo a su
-- nombre. No se edita ni se borra desde la app.
-- Si la tabla no existe o la consulta falla, el recorrido NO se muestra (no bloquea a nadie):
-- src/hooks/use-recorrido-obligatorio.ts.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- Idempotente, sin BEGIN/COMMIT propios.
-- ============================================================

CREATE TABLE IF NOT EXISTS recorridos_vistos (
  usuario_id   UUID NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE CASCADE,
  clave        TEXT NOT NULL CONSTRAINT recorridos_vistos_clave CHECK (clave ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  version      INTEGER NOT NULL CONSTRAINT recorridos_vistos_version CHECK (version BETWEEN 1 AND 1000),
  pasos_total  SMALLINT CONSTRAINT recorridos_vistos_pasos CHECK (pasos_total IS NULL OR pasos_total BETWEEN 0 AND 100),
  -- «celular» o «compu» y el navegador, para saber dónde lo hicieron. Texto libre corto.
  dispositivo  TEXT CONSTRAINT recorridos_vistos_dispositivo CHECK (dispositivo IS NULL OR char_length(dispositivo) <= 200),
  visto_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, clave, version)
);
CREATE INDEX IF NOT EXISTS recorridos_vistos_clave ON recorridos_vistos (clave, version);

ALTER TABLE recorridos_vistos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recorridos: leer los propios" ON recorridos_vistos;
CREATE POLICY "Recorridos: leer los propios" ON recorridos_vistos FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Recorridos: marcar el propio" ON recorridos_vistos;
CREATE POLICY "Recorridos: marcar el propio" ON recorridos_vistos FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()));

REVOKE ALL ON recorridos_vistos FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON recorridos_vistos FROM authenticated;
GRANT SELECT, INSERT ON recorridos_vistos TO authenticated;

NOTIFY pgrst, 'reload schema';
