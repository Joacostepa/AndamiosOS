-- ============================================================
-- AndamiosOS — Por qué se corrió el día
--
-- Correr un día pide un motivo escrito ("lluvia", "paro de transporte") y hasta acá no
-- tenía dónde guardarse. Sin eso, dentro de un mes el historial dice que alguien movió
-- treinta y cuatro jornadas y no por qué — que es justamente la única pregunta que se le
-- va a hacer.
--
-- VA EN LA FILA Y NO EN UNA TABLA DE LOTES. Un lote no es una entidad: es un hilo que ata
-- filas que ya existen. Repetir el motivo en las doce filas cuesta nada y deja que la
-- ficha de cada obra conteste sola "esta obra se corrió por lluvia", sin ir a buscarlo a
-- otro lado.
--
-- NULLABLE porque los gestos de a uno no lo piden: arrastrar una tarjeta no necesita
-- justificarse, y obligar a escribir algo en cada arrastre sólo produciría puntos y
-- "varios".
-- ============================================================

BEGIN;

ALTER TABLE plan_movimientos ADD COLUMN IF NOT EXISTS motivo TEXT;

COMMENT ON COLUMN plan_movimientos.motivo IS
  'Por qué se hizo el gesto. Obligatorio al correr un día; NULL en los gestos de a uno.';

COMMIT;
