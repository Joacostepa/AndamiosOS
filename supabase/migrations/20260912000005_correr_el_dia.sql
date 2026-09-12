-- ============================================================
-- AndamiosOS — Correr el día: un gesto que toca doce obras
--
-- EL PROBLEMA: suspender una jornada por lluvia y postergar todo un día son, a mano,
-- treinta y pico de arrastres. Como gesto es UNO SOLO, y el historial tiene que poder
-- decirlo así: "corrió el jueves 17 por lluvia · 34 jornadas, 12 obras".
--
-- POR QUÉ NO ALCANZA CON LA FILA QUE YA HAY. plan_movimientos ancla cada fila a UNA obra
-- (odoo_ot_id), a propósito: es lo que permite que la ficha de cada obra muestre su propia
-- historia. Un corrimiento toca doce obras, así que son doce filas — y sin nada que las
-- ate, el panel de actividad mostraría doce líneas idénticas y el deshacer no sabría qué
-- devolver.
--
-- lote_id ES ESE HILO. Las doce filas se siguen escribiendo una por obra (la ficha no
-- cambia), y el panel las agrupa en una sola línea. Deshacer un corrimiento es un
-- corrimiento inverso, con su propio lote, donde cada fila apunta con `deshace_a` a su par
-- del lote original: el `deshechosDe` que ya existe lo marca solo, sin columna nueva.
--
-- NULL EN TODO LO DEMÁS. Un arrastre sigue siendo una fila suelta sin lote: no es un lote
-- de uno, es otra cosa. La columna es nullable y sin default por eso.
-- ============================================================

BEGIN;

ALTER TABLE plan_movimientos DROP CONSTRAINT IF EXISTS plan_movimientos_accion_check;

ALTER TABLE plan_movimientos ADD CONSTRAINT plan_movimientos_accion_check
  CHECK (accion IN (
    'crear', 'mover', 'fraccion', 'cuadrilla', 'quitar', 'fijar', 'soltar', 'correr'
  ));

ALTER TABLE plan_movimientos ADD COLUMN IF NOT EXISTS lote_id UUID;

COMMENT ON COLUMN plan_movimientos.lote_id IS
  'Agrupa las filas de un mismo gesto masivo (correr el día). NULL en los gestos de a una.';

-- El panel agrupa por lote y el deshacer trae el lote entero. Parcial porque la enorme
-- mayoría de las filas son arrastres sueltos y no tienen lote.
CREATE INDEX IF NOT EXISTS idx_plan_movimientos_lote
  ON plan_movimientos(lote_id, created_at DESC) WHERE lote_id IS NOT NULL;

COMMIT;
