-- Fase 4 — cableado de stock (inventario app-owned).
--
-- ARQUITECTURA: `movimientos` es el ledger único y la ÚNICA fuente de verdad del
-- stock. `actualizar_stock_en_movimiento()` (trigger sobre movimientos) deriva todo
-- el stock. El trigger de remito SOLO inserta movimientos (no toca stock directo,
-- para no duplicar). Esta migración:
--   1) extiende actualizar_stock_en_movimiento() para que sea OBRA-AWARE
--      (salida con destino-obra → en_obras + stock_por_obra; entrada con origen-obra
--       → vuelve de la obra). Sin obra = comportamiento legacy (depósito/tránsito).
--   2) crea aplicar_stock_remito(): al recibir un remito, inserta los movimientos.
--
-- Modelo de una fase (en la recepción), cantidad_recibida (fallback remitida).
--   entrega    → salida  (destino = obra)
--   sobrante   → entrada (origen = obra)  [material que vuelve durante el montaje]
--   devolucion → entrada (origen = obra)  [desarme]
--   control_devolucion / transferencia → no generan movimiento acá

BEGIN;

-- 0) El generador de número de remito tenía un CASE sin ramas para los tipos
--    nuevos (sobrante/control_devolucion) → "case not found". Se agregan + ELSE.
CREATE OR REPLACE FUNCTION generar_numero_remito() RETURNS trigger AS $$
DECLARE prefijo TEXT;
BEGIN
  prefijo := CASE NEW.tipo
    WHEN 'entrega' THEN 'RE'
    WHEN 'devolucion' THEN 'RD'
    WHEN 'transferencia' THEN 'RT'
    WHEN 'sobrante' THEN 'RS'
    WHEN 'control_devolucion' THEN 'RC'
    ELSE 'R' END;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := prefijo || '-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('remito_numero_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Stock derivado del ledger, ahora obra-aware (backward-compatible: sin obra = legacy)
CREATE OR REPLACE FUNCTION actualizar_stock_en_movimiento() RETURNS trigger AS $$
BEGIN
  CASE NEW.tipo
    WHEN 'salida' THEN
      UPDATE stock SET en_deposito = en_deposito - NEW.cantidad,
        en_obras   = en_obras   + CASE WHEN NEW.obra_destino_id IS NOT NULL THEN NEW.cantidad ELSE 0 END,
        en_transito = en_transito + CASE WHEN NEW.obra_destino_id IS NULL     THEN NEW.cantidad ELSE 0 END
      WHERE pieza_id = NEW.pieza_id;
      IF NEW.obra_destino_id IS NOT NULL THEN
        INSERT INTO stock_por_obra (pieza_id, obra_id, cantidad) VALUES (NEW.pieza_id, NEW.obra_destino_id, NEW.cantidad)
        ON CONFLICT (pieza_id, obra_id) DO UPDATE SET cantidad = stock_por_obra.cantidad + NEW.cantidad, updated_at = now();
      END IF;

    WHEN 'entrada' THEN
      IF NEW.obra_origen_id IS NOT NULL THEN
        -- vuelve de una obra al depósito
        UPDATE stock SET en_deposito = en_deposito + NEW.cantidad, en_obras = en_obras - NEW.cantidad WHERE pieza_id = NEW.pieza_id;
        INSERT INTO stock_por_obra (pieza_id, obra_id, cantidad) VALUES (NEW.pieza_id, NEW.obra_origen_id, -NEW.cantidad)
        ON CONFLICT (pieza_id, obra_id) DO UPDATE SET cantidad = stock_por_obra.cantidad - NEW.cantidad, updated_at = now();
      ELSE
        -- ingreso/compra
        UPDATE stock SET en_deposito = en_deposito + NEW.cantidad, total = total + NEW.cantidad WHERE pieza_id = NEW.pieza_id;
      END IF;

    WHEN 'ajuste' THEN
      UPDATE stock SET en_deposito = en_deposito + NEW.cantidad, total = total + NEW.cantidad WHERE pieza_id = NEW.pieza_id;

    WHEN 'baja' THEN
      UPDATE stock SET danado = danado + NEW.cantidad, en_deposito = en_deposito - NEW.cantidad WHERE pieza_id = NEW.pieza_id;

    WHEN 'transferencia' THEN
      IF NEW.obra_origen_id IS NOT NULL THEN
        INSERT INTO stock_por_obra (pieza_id, obra_id, cantidad) VALUES (NEW.pieza_id, NEW.obra_origen_id, -NEW.cantidad)
        ON CONFLICT (pieza_id, obra_id) DO UPDATE SET cantidad = stock_por_obra.cantidad - NEW.cantidad, updated_at = now();
      END IF;
      IF NEW.obra_destino_id IS NOT NULL THEN
        INSERT INTO stock_por_obra (pieza_id, obra_id, cantidad) VALUES (NEW.pieza_id, NEW.obra_destino_id, NEW.cantidad)
        ON CONFLICT (pieza_id, obra_id) DO UPDATE SET cantidad = stock_por_obra.cantidad + NEW.cantidad, updated_at = now();
      END IF;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Al recibir un remito → asienta los movimientos (el trigger de arriba mueve el stock)
CREATE OR REPLACE FUNCTION aplicar_stock_remito() RETURNS trigger AS $$
DECLARE
  it RECORD; mov tipo_movimiento; v_origen uuid; v_destino uuid;
BEGIN
  IF NEW.estado NOT IN ('recibido','con_diferencia') THEN RETURN NEW; END IF;
  IF OLD.estado IN ('recibido','con_diferencia') THEN RETURN NEW; END IF;       -- idempotente
  IF NEW.tipo IN ('control_devolucion','transferencia') THEN RETURN NEW; END IF;

  IF NEW.tipo = 'entrega' THEN mov := 'salida';  v_origen := NULL;        v_destino := NEW.obra_id;
  ELSE                        mov := 'entrada'; v_origen := NEW.obra_id;  v_destino := NULL;  -- sobrante, devolucion
  END IF;

  FOR it IN
    SELECT pieza_id, COALESCE(cantidad_recibida, cantidad_remitida, 0) AS q
    FROM remito_items WHERE remito_id = NEW.id
  LOOP
    IF it.q = 0 THEN CONTINUE; END IF;
    INSERT INTO movimientos (tipo, pieza_id, cantidad, obra_origen_id, obra_destino_id, remito_id, motivo, fecha)
    VALUES (mov, it.pieza_id, it.q, v_origen, v_destino, NEW.id, NEW.motivo, now());
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aplicar_stock_remito ON remitos;
CREATE TRIGGER trg_aplicar_stock_remito
  AFTER UPDATE OF estado ON remitos
  FOR EACH ROW EXECUTE FUNCTION aplicar_stock_remito();

COMMIT;
