-- ============================================================
-- AndamiosOS — Días suspendidos en el tablero
--
-- EL PROBLEMA (Juan Agustín, 01/10): al correr la cuadrilla 1 y la 2 por lluvia, el día
-- quedó en blanco, como si nadie lo hubiera usado. Leído una semana después, un hueco
-- dice "estaba libre" y no "llovió".
--
-- POR QUÉ NO ALCANZA CON plan_movimientos. Las filas del corrimiento son una por OBRA y
-- guardan el antes y el después de cada bloque, pero no QUÉ DÍA se suspendió ni PARA QUÉ
-- CUADRILLAS: en una cascada el `antes` trae varios días, y una cuadrilla tildada que no
-- tenía nada asignado no deja fila. Esto es una marca del día × cuadrilla, que es otra
-- cosa.
--
-- UNA FILA POR CUADRILLA Y DÍA, única. Correr dos veces el mismo día para la misma
-- cuadrilla actualiza el motivo en vez de apilar tapas.
--
-- lote_id ata la marca al corrimiento que la creó (plan_movimientos.lote_id): deshacer el
-- corrimiento la levanta.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS plan_suspensiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  -- Id de Odoo (x_aba_cuadrilla), sin FK: mismo criterio que plan_notas_dia.
  cuadrilla_odoo_id BIGINT NOT NULL,
  motivo TEXT NOT NULL,
  lote_id UUID,
  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT plan_suspensiones_motivo CHECK (length(btrim(motivo)) > 0),
  CONSTRAINT plan_suspensiones_unica UNIQUE (fecha, cuadrilla_odoo_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_suspensiones_lote
  ON plan_suspensiones(lote_id) WHERE lote_id IS NOT NULL;

ALTER TABLE plan_suspensiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados ven suspensiones" ON plan_suspensiones;
CREATE POLICY "Autenticados ven suspensiones" ON plan_suspensiones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados gestionan suspensiones" ON plan_suspensiones;
CREATE POLICY "Autenticados gestionan suspensiones" ON plan_suspensiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
