-- ============================================================
-- AndamiosOS — Notas de la jornada
--
-- "El chofer se va temprano el jueves", "llevar material a Turme", "Juan de licencia
-- del 12 al 20". Hoy eso llega por WhatsApp o de palabra y vive en la cabeza del que
-- planifica: el día que no está, nadie lo tiene en cuenta.
--
-- LA NOTA ES DEL DÍA, NO DE LA OBRA. Por eso no cuelga de x_aba_asignacion —que ya
-- tiene su propio campo de notas, y es de una obra en un día— ni de la OT: lo que se
-- anota acá vale para todo lo que caiga ese día.
--
-- Vive en Supabase y no en Odoo, igual que hab_notas: es memoria operativa, nadie la
-- lee desde el ERP, y crear un modelo x_aba_* nuevo para esto no compra nada.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS plan_notas_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- EL RANGO, y no una sola fecha: "Juan de licencia del 12 al 20" son siete días. Sin
  -- rango habría que cargar la misma nota siete veces, y entonces se carga el primer
  -- día y los otros seis quedan mudos. Una nota de un día tiene hasta = desde.
  desde DATE NOT NULL,
  hasta DATE NOT NULL,

  -- NULL = la nota es del DÍA ENTERO: la ve toda la columna, sin importar la cuadrilla.
  -- Con valor, es de esa cuadrilla en esos días ("la 2 arranca tarde el jueves").
  --
  -- Es el id de Odoo (x_aba_cuadrilla) y no un FK a la tabla `cuadrillas` de Supabase:
  -- el tablero trabaja contra Odoo y esa tabla es del módulo de planificación viejo.
  -- Mismo criterio que hab_notas.odoo_ot_id. Sin FK, por lo tanto: si alguien archiva
  -- una cuadrilla en Odoo la nota queda igual, y la UI la muestra sin nombre.
  cuadrilla_odoo_id BIGINT,

  texto TEXT NOT NULL,
  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT plan_notas_dia_rango CHECK (hasta >= desde),
  CONSTRAINT plan_notas_dia_texto CHECK (length(btrim(texto)) > 0)
);

-- El tablero pregunta por un rango de varias semanas ("¿qué notas tocan lo que estoy
-- mirando?"), que es un solapamiento: hasta >= :desde AND desde <= :hasta. El índice
-- arranca por `hasta` porque es la condición que descarta todo el pasado.
CREATE INDEX IF NOT EXISTS idx_plan_notas_dia_rango ON plan_notas_dia(hasta, desde);

ALTER TABLE plan_notas_dia ENABLE ROW LEVEL SECURITY;

-- Escribe cualquier autenticado, igual que hab_notas y a diferencia de
-- planificacion_bloqueos. A propósito: el caso que motiva la tabla es "el chofer me
-- avisó que el jueves se va temprano", y quien se entera no es necesariamente quien
-- planifica. Restringir a admin/operativo bloquearía justo el camino que hace que el
-- dato exista.
DROP POLICY IF EXISTS "Autenticados ven notas de jornada" ON plan_notas_dia;
CREATE POLICY "Autenticados ven notas de jornada" ON plan_notas_dia
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados gestionan notas de jornada" ON plan_notas_dia;
CREATE POLICY "Autenticados gestionan notas de jornada" ON plan_notas_dia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
