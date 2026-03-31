-- Bucket para assets de la empresa (logo, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('empresa', 'empresa', true)
ON CONFLICT (id) DO NOTHING;

-- Política: cualquier usuario autenticado puede subir/leer
CREATE POLICY "Empresa assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'empresa');

CREATE POLICY "Authenticated users can upload empresa assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'empresa');

CREATE POLICY "Authenticated users can update empresa assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'empresa');

CREATE POLICY "Authenticated users can delete empresa assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'empresa');

-- Config key para el logo
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('empresa_logo_url', '', 'URL del logo de la empresa para PDFs y encabezados')
ON CONFLICT (clave) DO NOTHING;
