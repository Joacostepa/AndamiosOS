-- ============================================================
-- Modelador ABA (Oficina técnica): modelos guardados, mapa familia → código y kits.
-- Contrato: docs/oficina-tecnica/modelador/arquitectura-produccion.md §8.1.
--
-- 1. PERMISOS del módulo «modelador» (src/lib/auth/acceso.ts): tec_puede_ver() / tec_puede_editar(),
--    mismo patrón que org_puede_*. computos_puede_editar() la usa la 000002 para alinear la RLS de
--    computos con los permisos por módulo.
-- 2. tec_modelos: el diseño (jsonb, versionado por `esquema` y `motor_version`), obra opcional
--    (un modelo puede nacer de una cotización sin obra), plantillas propias (`es_plantilla`) y
--    control optimista con `revision` (sube sola cuando cambia el diseño; ver el trigger).
-- 3. tec_pieza_mapa: (familia, sistema, medidas) → código de catalogo_piezas. Lo edita OT sin
--    redeploy. Se siembra con INSERT … SELECT desde los códigos que EXISTEN: un código que no esté
--    en catalogo_piezas no se inventa y la pieza queda «sin código».
--    OJO: las reglas de la semilla están espejadas en src/lib/tecnica/persistencia/semillas.ts
--    (con test). Si cambia una, cambiar la otra.
-- 4. tec_kits: composición de los módulos de bastidor (supuesta hasta que la confirme JS).
-- 5. computos.modelo_id / modelo_revision y computo_items.origen / modelo_cantidad (el diff).
--
-- NO SE APLICA SOLA. Se corre a mano (`npx supabase db query --linked -f <archivo>`, nunca db push).
-- Es idempotente y no tiene BEGIN/COMMIT propios.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permisos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tec_puede_ver() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'modelador' IN ('ver', 'editar'))
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION tec_puede_editar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'modelador' = 'editar')
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

-- Cómputos: admin, el permiso por módulo, y el rol operativo por compatibilidad con la política
-- vieja (get_user_role() IN ('admin','operativo')), para no dejar afuera a nadie que hoy edita.
CREATE OR REPLACE FUNCTION computos_puede_editar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text IN ('admin', 'operativo') OR p.permisos->>'computos' = 'editar')
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

-- ------------------------------------------------------------
-- 2. tec_modelos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tec_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
  descripcion text,
  obra_id uuid REFERENCES obras(id) ON DELETE SET NULL,
  -- Nombre de la venta/cotización de Odoo (S0xxxx) cuando el modelo todavía no tiene obra.
  cotizacion_ref text CHECK (cotizacion_ref IS NULL OR length(cotizacion_ref) <= 60),
  es_plantilla boolean NOT NULL DEFAULT false,
  -- Galería «Mis plantillas»: 'fachada' | 'bandeja' | 'torre' | 'portico' | 'especial' | 'libre'.
  plantilla_categoria text,
  diseno jsonb NOT NULL,
  esquema int NOT NULL,                      -- Diseno.esquema (núcleo: ESQUEMA_DISENO)
  motor_version text NOT NULL,               -- VERSION_MOTOR con el que se guardó
  -- Versión del DISEÑO para el control optimista: el PATCH manda la que leyó y si no coincide
  -- recibe 409. La sube el trigger (nadie la escribe a mano).
  revision int NOT NULL DEFAULT 1,
  resumen jsonb,                             -- m2, ml, pesoKg, piezas, sinCodigo… (lista sin construir)
  imagen_path text,                          -- storage: tec-modelos/<id>/portada.png
  created_by uuid REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archivado_at timestamptz,
  CONSTRAINT tec_modelos_diseno_tamano CHECK (pg_column_size(diseno) < 2000000),
  CONSTRAINT tec_modelos_plantilla_sin_obra CHECK (NOT es_plantilla OR obra_id IS NULL)
);

CREATE INDEX IF NOT EXISTS tec_modelos_obra_idx ON tec_modelos(obra_id) WHERE archivado_at IS NULL;
CREATE INDEX IF NOT EXISTS tec_modelos_plantilla_idx ON tec_modelos(es_plantilla) WHERE archivado_at IS NULL;
CREATE INDEX IF NOT EXISTS tec_modelos_updated_idx ON tec_modelos(updated_at DESC) WHERE archivado_at IS NULL;

-- updated_at, updated_by y revision. La revisión SOLO sube cuando cambia el diseño: renombrar o
-- vincular a una obra no invalida lo que otro tiene abierto. Tampoco se puede bajar ni fijar a mano.
CREATE OR REPLACE FUNCTION tec_modelos_tocar() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF NEW.diseno IS DISTINCT FROM OLD.diseno THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tec_modelos_tocar ON tec_modelos;
CREATE TRIGGER trg_tec_modelos_tocar BEFORE UPDATE ON tec_modelos
  FOR EACH ROW EXECUTE FUNCTION tec_modelos_tocar();

ALTER TABLE tec_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Modelador ve modelos" ON tec_modelos;
CREATE POLICY "Modelador ve modelos" ON tec_modelos
  FOR SELECT TO authenticated USING (tec_puede_ver());

DROP POLICY IF EXISTS "Modelador crea modelos" ON tec_modelos;
CREATE POLICY "Modelador crea modelos" ON tec_modelos
  FOR INSERT TO authenticated WITH CHECK (tec_puede_editar());

DROP POLICY IF EXISTS "Modelador edita modelos" ON tec_modelos;
CREATE POLICY "Modelador edita modelos" ON tec_modelos
  FOR UPDATE TO authenticated USING (tec_puede_editar()) WITH CHECK (tec_puede_editar());
-- Sin DELETE: se archiva (archivado_at). Un cómputo puede apuntar al modelo.

-- ------------------------------------------------------------
-- 3. tec_pieza_mapa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tec_pieza_mapa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia text NOT NULL,                     -- Familia del núcleo (src/lib/tecnica/modelo/tipos.ts)
  sistema text NOT NULL CHECK (sistema IN ('multi', 'bastidor', 'comun')),
  largo_m numeric(6,3),
  alto_m numeric(6,3),
  ancho_m numeric(6,3),
  variante text,
  codigo text NOT NULL REFERENCES catalogo_piezas(codigo) ON UPDATE CASCADE,
  prioridad int NOT NULL DEFAULT 100,        -- si dos filas coinciden, gana la menor
  -- Para los códigos que se compran por superficie o largo (placa de fenólico 2,98 m², rollo de
  -- media sombra 200 m²…). catalogo_piezas no lo tiene.
  rinde numeric(10,4) CHECK (rinde IS NULL OR rinde > 0),
  unidad_compra text,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tec_pieza_mapa_unica ON tec_pieza_mapa (
  familia, sistema, COALESCE(largo_m, -1), COALESCE(alto_m, -1), COALESCE(ancho_m, -1), COALESCE(variante, ''), codigo
);
CREATE INDEX IF NOT EXISTS tec_pieza_mapa_codigo_idx ON tec_pieza_mapa(codigo);

DROP TRIGGER IF EXISTS trg_tec_pieza_mapa_updated_at ON tec_pieza_mapa;
CREATE TRIGGER trg_tec_pieza_mapa_updated_at BEFORE UPDATE ON tec_pieza_mapa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 4. tec_kits
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tec_kits (
  kit_codigo text NOT NULL REFERENCES catalogo_piezas(codigo) ON UPDATE CASCADE,
  pieza_codigo text NOT NULL REFERENCES catalogo_piezas(codigo) ON UPDATE CASCADE,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  supuesto boolean NOT NULL DEFAULT true,    -- composición supuesta hasta que la confirme JS
  PRIMARY KEY (kit_codigo, pieza_codigo)
);

ALTER TABLE tec_pieza_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE tec_kits ENABLE ROW LEVEL SECURITY;

-- Lo leen el modelador y quien mira cómputos (el cómputo muestra «generado desde el modelo»).
DROP POLICY IF EXISTS "Modelador ve mapa de piezas" ON tec_pieza_mapa;
CREATE POLICY "Modelador ve mapa de piezas" ON tec_pieza_mapa
  FOR SELECT TO authenticated USING (tec_puede_ver() OR computos_puede_editar());
DROP POLICY IF EXISTS "Modelador edita mapa de piezas" ON tec_pieza_mapa;
CREATE POLICY "Modelador edita mapa de piezas" ON tec_pieza_mapa
  FOR ALL TO authenticated USING (tec_puede_editar()) WITH CHECK (tec_puede_editar());

DROP POLICY IF EXISTS "Modelador ve kits" ON tec_kits;
CREATE POLICY "Modelador ve kits" ON tec_kits
  FOR SELECT TO authenticated USING (tec_puede_ver() OR computos_puede_editar());
DROP POLICY IF EXISTS "Modelador edita kits" ON tec_kits;
CREATE POLICY "Modelador edita kits" ON tec_kits
  FOR ALL TO authenticated USING (tec_puede_editar()) WITH CHECK (tec_puede_editar());

-- ------------------------------------------------------------
-- 5. Cómputos: de qué modelo salió y qué dijo el modelo por línea
-- ------------------------------------------------------------
ALTER TABLE computos
  ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES tec_modelos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_revision int;

-- origen: 'modelo' (lo escribió el modelo, se regenera), 'modelo_editado' (salió del modelo y
-- alguien lo cambió a mano: no se pisa sin preguntar), 'manual' (lo cargó una persona).
ALTER TABLE computo_items
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS modelo_cantidad int;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'computo_items_origen_check') THEN
    ALTER TABLE computo_items ADD CONSTRAINT computo_items_origen_check
      CHECK (origen IN ('modelo', 'modelo_editado', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_computos_modelo_id ON computos(modelo_id) WHERE modelo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_computo_items_computo ON computo_items(computo_id);

-- ------------------------------------------------------------
-- 6. Semillas de tec_pieza_mapa (SOLO códigos que existen en catalogo_piezas)
--    Espejo en src/lib/tecnica/persistencia/semillas.ts. Lo que no existe en Odoo (ménsulas
--    0,73/1,09, vigas celosía de 5/6/7,5, lona, chapa, colgadores, anclaje químico…) NO se siembra:
--    queda «sin código» hasta que OT lo cargue.
-- ------------------------------------------------------------
-- Verticales: VERT-NNN-CE / VERT-NNN-SE
WITH m AS (SELECT codigo, regexp_match(codigo, '^VERT-(\d{3})-(CE|SE)$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, variante, codigo, notas)
SELECT 'vertical', 'multi', g[1]::numeric / 100, g[2], codigo, 'semilla' FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Horizontales (y barandas, que son la misma pieza): HOR-048-NNN
WITH m AS (SELECT codigo, regexp_match(codigo, '^HOR-048-(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT f.familia, 'multi', g[1]::numeric / 100, codigo, 'semilla'
FROM m CROSS JOIN (VALUES ('horizontal'), ('baranda')) AS f(familia) WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Diagonales de cara: DIAG-<alto>x<largo> (DIAG-200x250, DIAG-150x250)
WITH m AS (SELECT codigo, regexp_match(codigo, '^DIAG-(\d{3})x(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, codigo, notas)
SELECT 'diagonal', 'multi', g[2]::numeric / 100, g[1]::numeric / 100, codigo, 'semilla' FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Diagonales en planta: DIAG-PL-<largo>x<ancho>
WITH m AS (SELECT codigo, regexp_match(codigo, '^DIAG-PL-(\d{3})x(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, ancho_m, codigo, notas)
SELECT 'diagonal_planta', 'multi', g[1]::numeric / 100, g[2]::numeric / 100, codigo, 'semilla' FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Tablones metálicos: TAB-MET-NNN (1,50 y 2,50 sirven a los dos sistemas)
WITH m AS (SELECT codigo, regexp_match(codigo, '^TAB-MET-(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT 'tablon', CASE WHEN g[1] IN ('150', '250') THEN 'comun' ELSE 'multi' END, g[1]::numeric / 100, codigo, 'semilla'
FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Tablón con escotilla: TAB-ESC-NNN
WITH m AS (SELECT codigo, regexp_match(codigo, '^TAB-ESC-(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT 'tablon_escotilla', 'comun', g[1]::numeric / 100, codigo, 'semilla' FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Rodapiés: RDPE-NNN (0,90 y 1,30 de bastidor; 1,50 y 2,50 de los dos)
WITH m AS (SELECT codigo, regexp_match(codigo, '^RDPE-(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT 'rodapie',
       CASE WHEN g[1] IN ('090', '130') THEN 'bastidor' WHEN g[1] IN ('150', '250') THEN 'comun' ELSE 'multi' END,
       g[1]::numeric / 100, codigo, 'semilla'
FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Vigas: VIGA-CEL-NNN, VIGA-PTE-NNN. Ménsulas: MENSULA-NNN (con 3 dígitos: MENSULA-045 = 0,45)
WITH m AS (SELECT codigo, regexp_match(codigo, '^(VIGA-CEL|VIGA-PTE|MENSULA)-(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT CASE g[1] WHEN 'VIGA-CEL' THEN 'viga_celosia' WHEN 'VIGA-PTE' THEN 'viga_puente' ELSE 'mensula' END,
       'multi', g[2]::numeric / 100, codigo, 'semilla'
FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Zanca de escalera: ZANCA-ESC-<ancho>x<largo>
WITH m AS (SELECT codigo, regexp_match(codigo, '^ZANCA-ESC-(\d{3})x(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, ancho_m, codigo, notas)
SELECT 'zanca', 'multi', g[2]::numeric / 100, g[1]::numeric / 100, codigo, 'semilla' FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Bastidores: BAST-AND|PAS|PEA-<ancho>x<alto>; baranda: BAST-BAR-<ancho>x<alto>
WITH m AS (SELECT codigo, regexp_match(codigo, '^BAST-(AND|PAS|PEA|BAR)-(\d{3})x(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, ancho_m, alto_m, codigo, notas)
SELECT CASE WHEN g[1] = 'BAR' THEN 'bastidor_baranda' ELSE 'bastidor' END, 'bastidor',
       g[2]::numeric / 100, g[3]::numeric / 100, codigo, 'semilla'
FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Riendas: RIEND-NNN-H / RIEND-NNN-D
WITH m AS (SELECT codigo, regexp_match(codigo, '^RIEND-(\d{3})-(H|D)$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT CASE WHEN g[2] = 'H' THEN 'rienda_h' ELSE 'rienda_d' END, 'bastidor', g[1]::numeric / 100, codigo, 'semilla'
FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Módulos (kit) de bastidor: MOD-AND-…-<ancho>x<largo>x<alto>, MOD-PEA-…
WITH m AS (SELECT codigo, regexp_match(codigo, '^MOD-(AND|PEA)-[A-Z-]+-(\d{3})x(\d{3})x(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, ancho_m, largo_m, alto_m, codigo, notas)
SELECT 'modulo_kit', 'bastidor', g[2]::numeric / 100, g[3]::numeric / 100, g[4]::numeric / 100, codigo, 'semilla'
FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Caños de caño y grampa: CAÑO-NNN (0,10 … 6,40)
WITH m AS (SELECT codigo, regexp_match(codigo, '^CAÑO-(\d{3})$') g FROM catalogo_piezas)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, codigo, notas)
SELECT 'cano', 'comun', g[1]::numeric / 100, codigo, 'semilla' FROM m WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- Piezas sin medida (código fijo, solo si existe)
INSERT INTO tec_pieza_mapa (familia, sistema, variante, codigo, rinde, unidad_compra, notas)
SELECT s.familia, s.sistema, s.variante, c.codigo, s.rinde, s.unidad, 'semilla'
FROM (VALUES
  ('TORN-600-FIJA',     'base_regulable',    'comun',    NULL,          NULL::numeric, NULL),
  ('TORN-600-MOVIL',    'base_regulable',    'comun',    'movil',       NULL,          NULL),
  ('TORN-300-FIJA',     'base_fija',         'comun',    NULL,          NULL,          NULL),
  ('COLL-CORTO',        'collarin',          'multi',    NULL,          NULL,          NULL),
  ('MAD-BASE-10x10',    'accesorio',         'comun',    'madera_base', NULL,          NULL),
  ('RUEDA-STD',         'rueda',             'comun',    NULL,          NULL,          NULL),
  ('RUEDA-STD-FRENO',   'rueda_freno',       'comun',    NULL,          NULL,          NULL),
  ('ESC-INT-MULTI',     'escalera_interior', 'multi',    NULL,          NULL,          NULL),
  ('ESC-INT-BAST',      'escalera_interior', 'bastidor', NULL,          NULL,          NULL),
  ('BAR-ESC-MULTI',     'baranda_escalera',  'multi',    NULL,          NULL,          NULL),
  ('BAR-ESC-BAST',      'baranda_escalera',  'bastidor', NULL,          NULL,          NULL),
  ('ESFERA-SEG',        'esfera',            'comun',    NULL,          NULL,          NULL),
  ('NUDO-FIJO',         'grampa_fija',       'comun',    NULL,          NULL,          NULL),
  ('NUDO-GIR',          'grampa_giratoria',  'comun',    NULL,          NULL,          NULL),
  ('PLACA-FEN-122x244', 'fenolico',          'comun',    NULL,          2.9768,        'placa'),
  ('MEDIA-SOMBRA-5',    'media_sombra',      'comun',    NULL,          200,           'rollo 4×50 m'),
  ('ALAMB-CONC-45x10',  'accesorio',         'comun',    'concertina',  10,            'rollo 10 m')
) AS s(codigo, familia, sistema, variante, rinde, unidad)
JOIN catalogo_piezas c ON c.codigo = s.codigo
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Semillas de tec_kits: composición SUPUESTA de la maqueta (1 bastidor + 2 riendas H + 2 D)
-- ------------------------------------------------------------
INSERT INTO tec_kits (kit_codigo, pieza_codigo, cantidad, supuesto)
SELECT k.kit, k.pieza, k.cantidad, true
FROM (VALUES
  ('MOD-AND-STD-130x250x180',    'BAST-AND-130x180', 1), ('MOD-AND-STD-130x250x180',    'RIEND-250-H', 2), ('MOD-AND-STD-130x250x180',    'RIEND-250-D', 2),
  ('MOD-AND-JR-130x150x180',     'BAST-AND-130x180', 1), ('MOD-AND-JR-130x150x180',     'RIEND-150-H', 2), ('MOD-AND-JR-130x150x180',     'RIEND-150-D', 2),
  ('MOD-AND-PAS-090x250x180',    'BAST-PAS-090x180', 1), ('MOD-AND-PAS-090x250x180',    'RIEND-250-H', 2), ('MOD-AND-PAS-090x250x180',    'RIEND-250-D', 2),
  ('MOD-AND-PAS-JR-090x150x180', 'BAST-PAS-090x180', 1), ('MOD-AND-PAS-JR-090x150x180', 'RIEND-150-H', 2), ('MOD-AND-PAS-JR-090x150x180', 'RIEND-150-D', 2),
  ('MOD-PEA-STD-130x250x250',    'BAST-PEA-130x250', 1), ('MOD-PEA-STD-130x250x250',    'RIEND-250-H', 2), ('MOD-PEA-STD-130x250x250',    'RIEND-250-D', 2),
  ('MOD-PEA-PAS-090x250x250',    'BAST-PEA-090x250', 1), ('MOD-PEA-PAS-090x250x250',    'RIEND-250-H', 2), ('MOD-PEA-PAS-090x250x250',    'RIEND-250-D', 2)
) AS k(kit, pieza, cantidad)
WHERE EXISTS (SELECT 1 FROM catalogo_piezas WHERE codigo = k.kit)
  AND EXISTS (SELECT 1 FROM catalogo_piezas WHERE codigo = k.pieza)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 8. Backfill de permisos: a quien tiene Cómputos, Modelador con el mismo nivel
-- ------------------------------------------------------------
UPDATE user_profiles
   SET permisos = permisos || jsonb_build_object('modelador', permisos->>'computos')
 WHERE permisos ? 'computos' AND NOT permisos ? 'modelador'
   AND permisos->>'computos' IN ('ver', 'editar');

DO $$
DECLARE
  v_filas int; v_familias int;
BEGIN
  SELECT count(*), count(DISTINCT familia) INTO v_filas, v_familias FROM tec_pieza_mapa;
  RAISE NOTICE 'tec_pieza_mapa: % filas en % familias mapeadas', v_filas, v_familias;
END $$;
