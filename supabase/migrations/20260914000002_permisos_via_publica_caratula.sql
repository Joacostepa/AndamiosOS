-- ========================================================================
-- Permisos vía pública — datos de la carátula del expediente
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: la lista de TAD no dice dónde es la obra. El titular que muestra
-- es siempre Emprendimientos y Estructuras, y el número de expediente casi nunca quedó
-- cargado en la venta de Odoo (0 de 21 vinculados el 2026-09-14). Sin dirección, la
-- bandeja es una lista de números.
--
-- DE DÓNDE SALE: la "Carátula" (IF-…) que el GCBA arma con lo que se cargó en el
-- formulario: calle y altura, barrio, comuna, sección/manzana/parcela, fechas pedidas y
-- seguro. El robot la lee UNA VEZ por expediente. Abrir el detalle deja una "Constancia de
-- Consulta" en el expediente —lo mismo que pasa cuando alguien lo abre a mano—, así que
-- `caratula_leida_at` es lo que garantiza que no vuelva a entrar.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_expedientes
    ADD COLUMN IF NOT EXISTS barrio              TEXT,
    ADD COLUMN IF NOT EXISTS comuna              TEXT,
    ADD COLUMN IF NOT EXISTS seccion             TEXT,
    ADD COLUMN IF NOT EXISTS manzana             TEXT,
    ADD COLUMN IF NOT EXISTS parcela             TEXT,
    ADD COLUMN IF NOT EXISTS pedido_desde        DATE,
    ADD COLUMN IF NOT EXISTS pedido_hasta        DATE,
    ADD COLUMN IF NOT EXISTS seguro_compania     TEXT,
    ADD COLUMN IF NOT EXISTS seguro_vence        DATE,
    ADD COLUMN IF NOT EXISTS contacto_mail       TEXT,
    ADD COLUMN IF NOT EXISTS caratula_path       TEXT,
    -- Se marca también si la lectura falla sin remedio (carátula que no existe o no se
    -- puede leer): el intento cuesta una constancia en el expediente y no se repite solo.
    ADD COLUMN IF NOT EXISTS caratula_leida_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS caratula_error      TEXT;

  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_tipo_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_tipo_check CHECK (tipo IN (
    'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
    'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot', 'caratula_leida'
  ));

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
