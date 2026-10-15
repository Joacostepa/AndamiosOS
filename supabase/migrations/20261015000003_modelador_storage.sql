-- ============================================================
-- Modelador ABA: portada de cada modelo (PNG del lienzo 3D) en Storage.
-- Bucket PRIVADO `tec-modelos` (son obras de clientes). Path: <modelo_id>/portada.png
-- Lectura con tec_puede_ver(), escritura con tec_puede_editar() (20261015000001_modelador.sql).
-- La sube /api/tecnica/modelador/[id]/imagen con la sesión del usuario (la RLS decide).
--
-- NO SE APLICA SOLA; idempotente, sin BEGIN/COMMIT.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('tec-modelos', 'tec-modelos', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets SET file_size_limit = 4194304, allowed_mime_types = ARRAY['image/png']
WHERE id = 'tec-modelos';

DROP POLICY IF EXISTS "Modelador: leer portadas" ON storage.objects;
CREATE POLICY "Modelador: leer portadas" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'tec-modelos' AND tec_puede_ver());

DROP POLICY IF EXISTS "Modelador: subir portadas" ON storage.objects;
CREATE POLICY "Modelador: subir portadas" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tec-modelos' AND tec_puede_editar());

-- upsert de la portada (la misma ruta se reescribe en cada guardado con imagen)
DROP POLICY IF EXISTS "Modelador: reemplazar portadas" ON storage.objects;
CREATE POLICY "Modelador: reemplazar portadas" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'tec-modelos' AND tec_puede_editar())
  WITH CHECK (bucket_id = 'tec-modelos' AND tec_puede_editar());

DROP POLICY IF EXISTS "Modelador: borrar portadas" ON storage.objects;
CREATE POLICY "Modelador: borrar portadas" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'tec-modelos' AND tec_puede_editar());
