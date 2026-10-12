-- ============================================================
-- AndamiosOS — Hoja del día: el recorrido del camión (rediseño, fase F3)
--
-- docs/equipos-del-dia/rediseno-plan.md, "El recorrido sobre hd_viajes". En el Pizarrón,
-- cada camión tiene su recorrido: una lista de paradas en orden. UNA PARADA ES UN VIAJE
-- (`hd_viajes` de ese vehículo, ordenados por `orden`): no hay tabla nueva. Lo que falta
-- para el editor:
--
--   hd_viajes.accion       qué hace ahí: lleva_gente, deja_material, carga, descarga,
--                          busca_gente, compra, espera. NULL = la de siempre según el tipo
--                          (un "lleva" lleva gente, un "trae material" carga…). No se toca
--                          el CHECK de `tipo`.
--   hd_viajes.hora_aprox   la hora es una pista (decisión 1 del dueño, 12/10): se usa para
--                          ordenar y estimar, pero no genera avisos de choque. El candado la
--                          vuelve fija (un turno de VTV) y ahí sí avisa. Las paradas nuevas
--                          del editor nacen aproximadas; los viajes de antes quedan como
--                          estaban (false).
--   hd_viajes.hacia_lat/lng, desde_lat/lng
--                          coordenadas de una "otra dirección" (texto libre) para medir
--                          tiempos y desvíos (F4 las completa al geocodificar).
--   hd_viajes.salio_at     el botón "Salí" del chofer (decisión 6; lo usa F6, el 3D).
--   hd_pedidos.hacia_lat/lng, desde_lat/lng
--                          lo mismo para un pedido a "otra dirección" (F4).
--
-- Columnas nuevas con valor por defecto o nulas: el código viejo sigue andando con la
-- migración aplicada. hd_aplicar (Deshacer) lee las columnas al vuelo: no cambia.
--
-- Se aplica a mano con `npx supabase db query --linked -f` (NUNCA db push), ANTES del
-- deploy del código que la usa. Idempotente. Sin BEGIN/COMMIT propios.
-- ============================================================

ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS accion TEXT;
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS hora_aprox BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS hacia_lat DOUBLE PRECISION;
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS hacia_lng DOUBLE PRECISION;
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS desde_lat DOUBLE PRECISION;
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS desde_lng DOUBLE PRECISION;
ALTER TABLE hd_viajes ADD COLUMN IF NOT EXISTS salio_at TIMESTAMPTZ;

ALTER TABLE hd_pedidos ADD COLUMN IF NOT EXISTS hacia_lat DOUBLE PRECISION;
ALTER TABLE hd_pedidos ADD COLUMN IF NOT EXISTS hacia_lng DOUBLE PRECISION;
ALTER TABLE hd_pedidos ADD COLUMN IF NOT EXISTS desde_lat DOUBLE PRECISION;
ALTER TABLE hd_pedidos ADD COLUMN IF NOT EXISTS desde_lng DOUBLE PRECISION;

DO $accion$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hd_viajes'::regclass AND conname = 'hd_viajes_accion_valida') THEN
    ALTER TABLE hd_viajes ADD CONSTRAINT hd_viajes_accion_valida
      CHECK (accion IS NULL OR accion IN ('lleva_gente', 'deja_material', 'carga', 'descarga', 'busca_gente', 'compra', 'espera'));
  END IF;
  -- Una coordenada va de a pares (las dos o ninguna).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hd_viajes'::regclass AND conname = 'hd_viajes_coords_pares') THEN
    ALTER TABLE hd_viajes ADD CONSTRAINT hd_viajes_coords_pares
      CHECK ((hacia_lat IS NULL) = (hacia_lng IS NULL) AND (desde_lat IS NULL) = (desde_lng IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hd_pedidos'::regclass AND conname = 'hd_pedidos_coords_pares') THEN
    ALTER TABLE hd_pedidos ADD CONSTRAINT hd_pedidos_coords_pares
      CHECK ((hacia_lat IS NULL) = (hacia_lng IS NULL) AND (desde_lat IS NULL) = (desde_lng IS NULL));
  END IF;
END
$accion$;

NOTIFY pgrst, 'reload schema';
