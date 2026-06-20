-- Fase 4 — el cómputo cuelga DIRECTO de la obra (se elimina el Proyecto Técnico).
-- Decisión del usuario: Oficina Técnica trabaja Obra → Cómputo, sin paso intermedio.
-- Los datos de ingeniería (sistema/altura/m²/ml) pasan al propio cómputo.
-- computos y proyectos_tecnicos están vacíos → sin migración de datos.

BEGIN;

ALTER TABLE computos
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES obras(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tipo_sistema_andamio text,
  ADD COLUMN IF NOT EXISTS altura_maxima numeric,
  ADD COLUMN IF NOT EXISTS metros_lineales numeric,
  ADD COLUMN IF NOT EXISTS superficie numeric,
  ADD COLUMN IF NOT EXISTS observaciones_tecnicas text;

-- soltar el vínculo viejo al proyecto técnico (tabla vacía) y exigir obra
ALTER TABLE computos DROP COLUMN IF EXISTS proyecto_tecnico_id;
ALTER TABLE computos ALTER COLUMN obra_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_computos_obra_id ON computos(obra_id);

-- eliminar el concepto de Proyecto Técnico
DROP TABLE IF EXISTS proyecto_archivos;
DROP TABLE IF EXISTS proyectos_tecnicos CASCADE;

COMMIT;
