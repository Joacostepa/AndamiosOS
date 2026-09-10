-- Fotos de obra armada, recuperadas del grupo de Telegram.
--
-- POR QUÉ ACÁ Y NO EN ODOO: son cientos de fotos de ~1 MB. Meterlas en `ir.attachment`
-- consume la cuota de almacenamiento de Odoo Online, que se paga cara y no está pensada
-- para esto. Es la misma decisión que se tomó con los adjuntos de habilitaciones.
--
-- POR QUÉ NO SE REUSA `x_aba_foto` DE ODOO: ese modelo cuelga de un parte diario
-- (`x_parte_diario_id`), y estas fotos no tienen parte — vienen de un mensaje de Telegram.
-- Forzarlas ahí obligaría a inventar partes que nunca existieron.
--
-- LA UNIÓN CON EL MAPA es `odoo_venta_id`. La ficha del mapa ya sabe mostrar fotos de los
-- partes; estas se suman a esa lista.

DO $mig$
BEGIN

CREATE TABLE IF NOT EXISTS fotos_obra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- De dónde salió. Hoy sólo 'telegram', pero el día que se suba una desde la app o
  -- entre por un bot, es la misma tabla.
  origen text NOT NULL DEFAULT 'telegram',

  -- IDEMPOTENCIA DEL IMPORT. El id del mensaje en la exportación de Telegram es estable,
  -- así que reimportar el mismo export —o uno que se solape— no duplica nada. Sin esto,
  -- correr el importador dos veces deja el mapa con todo repetido.
  telegram_msg_id bigint UNIQUE,

  -- A qué obra quedó atada. NULL = no se pudo matchear y espera asignación a mano.
  odoo_venta_id integer,

  storage_path text NOT NULL,
  -- El texto completo del mensaje, tal cual vino. Se guarda entero aunque se parsee:
  -- si mañana el matcher mejora, se puede reprocesar sin volver a exportar el chat.
  caption text,
  -- La segunda línea: "Pantalla 8,59 x 2,50 de alto con alambre pua y 20 esferas".
  -- Es un as-built escrito por quien estuvo parado ahí.
  descripcion text,
  tomada_el timestamptz,
  autor text,

  -- asignada | sin_asignar | ambigua. Las dos últimas son la cola de trabajo manual.
  estado text NOT NULL DEFAULT 'sin_asignar',
  -- Con cuánta confianza matcheó, para poder revisar las flojas primero.
  match_score real,

  creado_el timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fotos_obra_venta_idx ON fotos_obra (odoo_venta_id);
CREATE INDEX IF NOT EXISTS fotos_obra_estado_idx ON fotos_obra (estado);

ALTER TABLE fotos_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados ven fotos de obra" ON fotos_obra;
CREATE POLICY "Autenticados ven fotos de obra" ON fotos_obra
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados gestionan fotos de obra" ON fotos_obra;
CREATE POLICY "Autenticados gestionan fotos de obra" ON fotos_obra
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket PRIVADO: son fotos de obras de clientes, no assets públicos.
-- Prefijo: obras/{odoo_venta_id o 'sin-asignar'}/{telegram_msg_id}.jpg
INSERT INTO storage.buckets (id, name, public)
VALUES ('obras', 'obras', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Autenticados leen fotos de obra" ON storage.objects;
CREATE POLICY "Autenticados leen fotos de obra" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'obras');

DROP POLICY IF EXISTS "Autenticados suben fotos de obra" ON storage.objects;
CREATE POLICY "Autenticados suben fotos de obra" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'obras');

DROP POLICY IF EXISTS "Autenticados borran fotos de obra" ON storage.objects;
CREATE POLICY "Autenticados borran fotos de obra" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'obras');

END $mig$;
