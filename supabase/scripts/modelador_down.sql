-- ============================================================
-- Modelador ABA: BAJADA de las migraciones 20261015000001…4 (volver atrás en producción).
--
-- NO es una migración (vive en supabase/scripts, no en migrations): se corre a mano, una sola vez,
-- en el SQL editor de Supabase, solo si hay que retirar el modelador. Antes, hacé un backup.
--
-- Qué hace, en orden:
--   1. Restaura las 3 políticas originales de computos / computo_items (get_user_role()).
--   2. Borra la RPC tec_generar_computo (las dos firmas) y las funciones de permisos del modelador.
--   3. Quita las columnas que el modelador agregó a computos y computo_items.
--      ⚠ Se pierde de qué modelo salió cada cómputo y el origen de cada línea (las cantidades quedan).
--   4. Quita el permiso «modelador» SOLO a quien lo recibió por el backfill (tec_backfill_permisos)
--      y con el mismo nivel; a quien se lo asignaron después a mano no se lo toca.
--   5. Borra el bucket de portadas, sus políticas y las tablas tec_* (⚠ se pierden los modelos).
-- ============================================================

-- 1. RLS original de cómputos (20260331000001_fase2_schema.sql)
DROP POLICY IF EXISTS "Cómputos: crear con permiso" ON computos;
DROP POLICY IF EXISTS "Cómputos: editar con permiso" ON computos;
DROP POLICY IF EXISTS "Cómputos: gestionar ítems con permiso" ON computo_items;
DROP POLICY IF EXISTS "Admin y operativo pueden crear computos" ON computos;
DROP POLICY IF EXISTS "Admin y operativo pueden editar computos" ON computos;
DROP POLICY IF EXISTS "Admin y operativo pueden gestionar items computo" ON computo_items;
CREATE POLICY "Admin y operativo pueden crear computos" ON computos FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden editar computos" ON computos FOR UPDATE TO authenticated USING (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin y operativo pueden gestionar items computo" ON computo_items FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- 2. RPC y funciones
DROP FUNCTION IF EXISTS tec_generar_computo(uuid, uuid, uuid, int, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS tec_generar_computo(uuid, uuid, int, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS tec_puede_editar_uid(uuid);
DROP FUNCTION IF EXISTS computos_puede_editar_uid(uuid);

-- 3. Columnas agregadas a cómputos
DROP INDEX IF EXISTS idx_computos_modelo_id;
ALTER TABLE computos DROP COLUMN IF EXISTS modelo_id, DROP COLUMN IF EXISTS modelo_revision;
ALTER TABLE computo_items DROP CONSTRAINT IF EXISTS computo_items_origen_check;
ALTER TABLE computo_items DROP COLUMN IF EXISTS origen, DROP COLUMN IF EXISTS modelo_cantidad;

-- 4. Permiso «modelador» del backfill (solo si sigue igual a lo que dio el backfill)
DO $$
BEGIN
  IF to_regclass('public.tec_backfill_permisos') IS NOT NULL THEN
    UPDATE user_profiles p
       SET permisos = p.permisos - 'modelador'
      FROM tec_backfill_permisos b
     WHERE b.user_id = p.id AND p.permisos->>'modelador' = b.nivel;
  END IF;
END $$;

-- 5. Storage y tablas del modelador
DROP POLICY IF EXISTS "Modelador: leer portadas" ON storage.objects;
DROP POLICY IF EXISTS "Modelador: subir portadas" ON storage.objects;
DROP POLICY IF EXISTS "Modelador: reemplazar portadas" ON storage.objects;
DROP POLICY IF EXISTS "Modelador: borrar portadas" ON storage.objects;
DELETE FROM storage.objects WHERE bucket_id = 'tec-modelos';
DELETE FROM storage.buckets WHERE id = 'tec-modelos';

DROP TABLE IF EXISTS tec_backfill_permisos;
DROP TABLE IF EXISTS tec_kits;
DROP TABLE IF EXISTS tec_pieza_mapa;
DROP TABLE IF EXISTS tec_modelos;
DROP FUNCTION IF EXISTS tec_modelos_tocar();
DROP FUNCTION IF EXISTS tec_modelos_crear();
DROP FUNCTION IF EXISTS tec_puede_ver();
DROP FUNCTION IF EXISTS tec_puede_editar();
-- computos_puede_editar() la usan solo las políticas del modelador (ya restauradas arriba)
DROP FUNCTION IF EXISTS computos_puede_editar();
