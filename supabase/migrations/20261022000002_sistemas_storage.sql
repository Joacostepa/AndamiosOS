-- ============================================================
-- Sistemas: las capturas y las imágenes de cada reporte, en Storage.
--
-- Bucket PRIVADO `sistemas` (las capturas pueden mostrar sueldos, montos o lo de Socios).
-- Ruta de cada archivo: <uid de quien reporta>/<uuid>.<png|jpg|webp>. 5 MB como máximo
-- (WebP 0,85 a 1920 px pesa entre 100 y 400 KB; el margen es para fotos del celular).
--
-- SIN POLÍTICAS PARA authenticated, a propósito: nadie lee ni sube con su sesión.
--   · Subir: POST /api/sistemas/reportes/subidas firma con la service role una URL de subida
--     (createSignedUploadUrl) dentro de la carpeta de quien llama, y el navegador sube con
--     uploadToSignedUrl. Mismo patrón que api/comercial/asistente/adjuntos.
--   · Leer: las APIs firman URLs de 10 minutos (1 hora para «Copiar para Claude Code») DESPUÉS
--     de chequear que el reporte es de quien pide o que es revisor.
--   · sis_crear_reporte (20261022000001) exige que cada path exista acá y empiece con el uid.
-- Se borran las políticas viejas con ese nombre por si alguna vez se crearon a mano.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- Idempotente, sin BEGIN/COMMIT propios.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('sistemas', 'sistemas', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'sistemas';

DROP POLICY IF EXISTS "Sistemas: leer capturas" ON storage.objects;
DROP POLICY IF EXISTS "Sistemas: subir capturas" ON storage.objects;
DROP POLICY IF EXISTS "Sistemas: reemplazar capturas" ON storage.objects;
DROP POLICY IF EXISTS "Sistemas: borrar capturas" ON storage.objects;

NOTIFY pgrst, 'reload schema';
