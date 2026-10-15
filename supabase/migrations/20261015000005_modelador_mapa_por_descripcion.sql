-- ============================================================
-- Modelador: mapa de piezas POR DESCRIPCIÓN contra el catálogo real de Odoo
-- ============================================================
-- La semilla de tec_pieza_mapa de 20261015000001 mapea por CÓDIGO con la convención ABA
-- (VERT-200-CE, HOR-048-250…), pero en producción el sync con Odoo dejó los códigos como
-- «ODOO-<n>» y la medida en la descripción («HORIZONTAL ø48.3 x 2.50 m», «RODAPIE 1,09m»).
-- Resultado: tec_pieza_mapa con 0 filas y todo el cómputo «sin código».
--
-- Esta migración siembra tec_pieza_mapa (y la composición supuesta de los módulos en tec_kits)
-- leyendo catalogo_piezas.descripcion normalizada (sin acentos ni ø, mayúsculas, coma decimal →
-- punto, espacios colapsados). Solo códigos que EXISTEN: lo que no está en Odoo no se inventa.
--
-- FUENTE: src/lib/tecnica/persistencia/mapa-descripcion.ts. El bloque «Reglas» de abajo es
-- `sqlSemillaDescripcion()` tal cual; mapa-descripcion.test.ts verifica que coincidan y prueba las
-- mismas regex contra el catálogo real (__fixtures__/catalogo-real.json). Si cambia una regla,
-- cambiar el TS y regenerar el bloque.
--
-- Idempotente: ON CONFLICT DO NOTHING contra tec_pieza_mapa_unica (no pisa lo que OT haya editado o
-- desactivado). Las filas quedan con notas = 'semilla-descripcion' para poder distinguirlas.
--
-- NO SE APLICA SOLA. Se corre a mano (`npx supabase db query --linked -f <archivo>`, nunca db push).
-- No tiene BEGIN/COMMIT propios.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Normalización de descripciones (espejo de normalizarDescripcion en mapa-descripcion.ts)
--    translate antes de upper: así no depende del locale de la base (en C, upper no toca acentos).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tec_normalizar_descripcion(d text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(upper(translate(COALESCE(d, ''), 'áéíóúüñÁÉÍÓÚÜÑøØΦφ', 'aeiouunAEIOUUN')), '(\d),(\d)', '\1.\2', 'g'),
           '\s+', ' ', 'g'));
$$;

-- ------------------------------------------------------------
-- 2. Reglas (GENERADO desde REGLAS_DESCRIPCION: no editar a mano)
-- ------------------------------------------------------------
-- vertical CE
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'vertical', 'multi', g[1]::numeric, NULL, NULL, 'CE', codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^VERTICAL (\d+\.\d+) ?M\.? CON ESPIGA$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- vertical SE
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'vertical', 'multi', g[1]::numeric, NULL, NULL, 'SE', codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^VERTICAL (\d+\.\d+) ?M\.? SIN ESPIGA$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- horizontal
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'horizontal', 'multi', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^HORIZONTAL (?:48\.3 ?X ?)?(\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- baranda
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'baranda', 'multi', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^HORIZONTAL (?:48\.3 ?X ?)?(\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- diagonal
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'diagonal', 'multi', g[2]::numeric, g[1]::numeric, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^DIAGONAL (\d+\.\d+) ?X ?(\d+\.\d+)(?: ?M\.?)?(?: \(P/[A-Z]+\))?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- diagonal (DE)
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'diagonal', 'multi', g[2]::numeric, g[1]::numeric, NULL, NULL, codigo, 110, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^DIAGONAL DE (\d+\.\d+) ?X ?(\d+\.\d+)(?: ?M\.?)?(?: \(P/[A-Z]+\))?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- diagonal_planta
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'diagonal_planta', 'multi', g[1]::numeric, NULL, g[2]::numeric, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^DIAGONAL (?:EN )?PLANTA (\d+\.\d+) ?X ?(\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- tablon
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'tablon', CASE WHEN g[1]::numeric IN (1.5, 2.5) THEN 'comun' ELSE 'multi' END, g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^TABLON METALICO (\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- tablon_escotilla
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'tablon_escotilla', 'comun', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^TABLON (?:CON )?ESCOTILLA (\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- rodapie
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'rodapie', CASE WHEN g[1]::numeric IN (0.9, 1.3) THEN 'bastidor' WHEN g[1]::numeric IN (1.5, 2.5) THEN 'comun' ELSE 'multi' END, g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^RODAPIE (\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- bastidor
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'bastidor', 'bastidor', NULL, g[2]::numeric, g[1]::numeric, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^BASTIDOR (?:DE ANDAMIO|PASO PEATONAL)(?: PASILLO)? - ?(\d+\.\d+) ?M\.? ?X ?(\d+\.\d+) ?H\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- bastidor_baranda
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'bastidor_baranda', 'bastidor', NULL, g[2]::numeric, g[1]::numeric, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^BASTIDOR BARANDA(?: PASILLO)? - ?(\d+\.\d+) ?M\.? ?X ?(\d+\.\d+) ?H\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- rienda_h
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'rienda_h', 'bastidor', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^RIENDA ANDAMIO (?:JR |JUNIOR )?(\d+\.\d+) ?M\.? - ?HORIZONTAL$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- rienda_d
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'rienda_d', 'bastidor', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^RIENDA ANDAMIO (?:JR |JUNIOR )?(\d+\.\d+) ?M\.?(?: \(\d+\.\d+ ?M\.?\))? - ?DIAGONAL$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- modulo_kit
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'modulo_kit', 'bastidor', g[2]::numeric, g[3]::numeric, g[1]::numeric, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^MODULO DE ANDAMIO (?:[A-Z]+ )*(\d+\.\d+) ?X ?(\d+\.\d+) ?X ?(\d+\.\d+)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- cano
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'cano', 'comun', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^CANO - ?(\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- grampa_fija
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'grampa_fija', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^NUDO FIJO$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- grampa_giratoria
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'grampa_giratoria', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^NUDO GIRATORIO$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- base_regulable
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'base_regulable', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^TORNILLON (?:DE )?600 ?MM\.?(?: POR UNIDAD)? \(BASE FIJA\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- base_regulable movil
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'base_regulable', 'comun', NULL, NULL, NULL, 'movil', codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^TORNILLON (?:DE )?600 ?MM\.?(?: POR UNIDAD)? \(BASE MOVIL\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- base_fija
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'base_fija', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^TORNILLON (?:DE )?300 ?MM\.?(?: POR UNIDAD)? \(BASE FIJA\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- rueda
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'rueda', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^RUEDA (?:DE ANDAMIO )?STANDARD(?:, POR UNIDAD)?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- rueda_freno
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'rueda_freno', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^RUEDA (?:DE ANDAMIO )?STANDARD CON FRENO(?:, POR UNIDAD)?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- viga_celosia
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'viga_celosia', 'multi', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^VIGA CELOSIA (\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- viga_puente
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'viga_puente', 'multi', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^VIGA PUENTE (\d+\.\d+) ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- zanca
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'zanca', 'multi', g[2]::numeric / 100, NULL, g[1]::numeric / 100, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^ZANCA (?:\(LIMON\) )?ESCALERA [A-Z]+ (\d{3}) ?X ?(\d{3})$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- escalera_interior multi
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'escalera_interior', 'multi', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^ESCALERA INTERNA \(PARA MULTIDIRECCIONAL\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- escalera_interior bastidor
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'escalera_interior', 'bastidor', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^ESCALERA INTERNA \(PARA BASTIDOR\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- baranda_escalera multi
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'baranda_escalera', 'multi', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^BARANDA DE ESCALERA INTERNA \(PARA MULTIDIRECCIONAL\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- baranda_escalera bastidor
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'baranda_escalera', 'bastidor', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^BARANDA DE ESCALERA INTERNA \(PARA BASTIDOR\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- mensula
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'mensula', 'multi', g[1]::numeric, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^MENSULA .* - ?(\d+\.\d+) ?M(?: .*)?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- collarin
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'collarin', 'multi', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^COLLARIN CORTO(?: \(0\.33 ?M\.?\))?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- esfera
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'esfera', 'comun', NULL, NULL, NULL, NULL, codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^ESFERA DE SEGURIDAD$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- madera_base
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'accesorio', 'comun', NULL, NULL, NULL, 'madera_base', codigo, 100, NULL, NULL, 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^MADERA BASE 10 ?X ?10 ?CM\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- fenolico
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'fenolico', 'comun', NULL, NULL, NULL, NULL, codigo, 100, 2.9768, 'placa', 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^PLACA (?:DE )?FENOLICO 1\.22 ?X ?2\.44 ?M\.?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- media_sombra
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'media_sombra', 'comun', NULL, NULL, NULL, NULL, codigo, 100, 200, 'rollo 4×50 m', 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^MEDIA SOMBRA .*\(4 ?M ?X ?50 ?M\)$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- concertina
INSERT INTO tec_pieza_mapa (familia, sistema, largo_m, alto_m, ancho_m, variante, codigo, prioridad, rinde, unidad_compra, notas)
SELECT 'accesorio', 'comun', NULL, NULL, NULL, 'concertina', codigo, 100, 10, 'rollo 10 m', 'semilla-descripcion'
FROM (SELECT codigo, regexp_match(tec_normalizar_descripcion(descripcion), '^ALAMBRE CONCERTINA (?:DOBLE )?45 ?MM ?X ?10 ?M(?: .*)?$') AS g FROM catalogo_piezas) m
WHERE g IS NOT NULL
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. tec_kits: composición SUPUESTA de los módulos de bastidor (la de la maqueta):
--    1 bastidor del mismo ancho × alto + 2 riendas H + 2 riendas D del mismo largo.
--    Espejo de kitsPorMedidas. Solo módulos que todavía no tienen composición cargada.
-- ------------------------------------------------------------
INSERT INTO tec_kits (kit_codigo, pieza_codigo, cantidad, supuesto)
SELECT k.codigo, c.pieza, c.cantidad, true
FROM tec_pieza_mapa k
CROSS JOIN LATERAL (
  SELECT
    (SELECT b.codigo FROM tec_pieza_mapa b
      WHERE b.familia = 'bastidor' AND b.ancho_m = k.ancho_m AND b.alto_m = k.alto_m AND b.variante IS NULL
      ORDER BY b.prioridad, b.codigo LIMIT 1) AS bast,
    (SELECT h.codigo FROM tec_pieza_mapa h
      WHERE h.familia = 'rienda_h' AND h.largo_m = k.largo_m
      ORDER BY h.prioridad, h.codigo LIMIT 1) AS rh,
    (SELECT r.codigo FROM tec_pieza_mapa r
      WHERE r.familia = 'rienda_d' AND r.largo_m = k.largo_m
      ORDER BY r.prioridad, r.codigo LIMIT 1) AS rd
) x
CROSS JOIN LATERAL (VALUES (x.bast, 1), (x.rh, 2), (x.rd, 2)) AS c(pieza, cantidad)
WHERE k.familia = 'modulo_kit' AND k.notas = 'semilla-descripcion'
  AND x.bast IS NOT NULL AND x.rh IS NOT NULL AND x.rd IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tec_kits t WHERE t.kit_codigo = k.codigo)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 4. Resumen
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_total int := 0;
  v_kits int;
BEGIN
  FOR r IN
    SELECT familia, count(*) AS filas, count(DISTINCT codigo) AS codigos
      FROM tec_pieza_mapa WHERE notas = 'semilla-descripcion'
     GROUP BY familia ORDER BY familia
  LOOP
    RAISE NOTICE 'tec_pieza_mapa [semilla-descripcion] %: % fila(s), % código(s)', r.familia, r.filas, r.codigos;
    v_total := v_total + r.filas;
  END LOOP;
  SELECT count(DISTINCT kit_codigo) INTO v_kits FROM tec_kits;
  RAISE NOTICE 'tec_pieza_mapa [semilla-descripcion]: % fila(s) en total; tec_kits: % módulo(s) con composición', v_total, v_kits;
END $$;
