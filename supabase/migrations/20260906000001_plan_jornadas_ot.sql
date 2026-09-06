-- ============================================================
-- AndamiosOS — Cuántas jornadas tiene la obra según Operaciones
--
-- EL PROBLEMA: la bandeja del tablero no guarda una lista de jornadas pendientes, hace
-- una resta —jornadas estimadas menos jornadas tomadas— y el estimado lo carga Comercial.
-- Cuando el planificador agarra una obra de 8 y se da cuenta de que son 7, saca la
-- jornada y la resta la devuelve a la bandeja para siempre: no hay forma de decir que esa
-- jornada no existe. La obra queda pidiendo trabajo que nadie va a hacer.
--
-- POR QUÉ NO SE PISA x_duracion_est: es el número de Comercial y el Informe de Obra mide
-- el desvío contra él. Si Operaciones lo corrige cada vez que Comercial se pasa, el
-- desvío da siempre cero y se pierde la única medición de que los estimados están mal.
-- Son dos preguntas distintas —"cuánto se pensó que iba a llevar" y "cuánto va a llevar"—
-- y cada una necesita su dueño. Mismo criterio que el detalle técnico de la OT, que se
-- corrige a mano y la corrección no se pisa.
--
-- POR QUÉ EN SUPABASE Y NO EN ODOO: preguntarse quién lo lee contesta solo. Lo lee la
-- bandeja del tablero y nadie más — Comercial sigue con su estimado, el costeo no lo
-- toca, el parte no lo toca. Es el mismo razonamiento de tablero_tareas. Y hay dos
-- razones prácticas encima: no hay que pasar por Studio, así que esto se puede iterar; y
-- no dispara la cascada de calculados de la OT (parte → OT → venta → obra), que cuesta
-- alrededor de un segundo por escritura y no tiene por qué pagarse para corregir un número.
--
-- Y una tercera, medida: la escala de x_duracion_est es una Selection que salta 6 → 8 →
-- 10 → 15. No tiene el 7. La obra de San Martín 1225 tiene HOY 17 jornadas planificadas
-- contra un estimado de 1, y 17 no es expresable en ese campo ni queriendo. Acá no hay
-- escala que heredar.
--
-- UNA FILA POR OT, no un log: la bandeja necesita el valor de ahora, y un append-only la
-- obligaría a sumar deltas en cada render para contestar la pregunta más frecuente del
-- tablero. El `motivo` y el `autor_id` alcanzan para lo que se va a preguntar después
-- ("¿por qué esta obra quedó en 7?"); el día que haga falta el historial completo, se
-- agrega una tabla de eventos al lado sin mover ésta.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS plan_jornadas_ot (
  -- La OT de Odoo (x_aba_orden_trabajo). Sin FK: Odoo es otra base. Es la PK porque la
  -- pregunta es por obra y sólo tiene una respuesta vigente.
  odoo_ot_id BIGINT PRIMARY KEY,

  -- NUMERIC y no INTEGER: el estimado que reemplaza es fraccionario (¼, ½, ¾ de jornada
  -- son valores válidos de x_duracion_est), así que un entero dejaría afuera obras que
  -- hoy se pueden expresar. La UI ofrece jornadas enteras porque las correcciones
  -- sub-jornada ya se hacen poniendo una fracción más chica en la grilla, pero el dato
  -- no tiene por qué ser más pobre que el que corrige.
  jornadas NUMERIC(5,2) NOT NULL,

  -- Por qué se corrigió. Opcional a propósito: exigirlo haría que se escriba "." para
  -- pasar el campo, y un motivo obligatorio que nadie completa es peor que ninguno.
  motivo TEXT,

  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cero jornadas no es "la obra es más corta", es "la obra no existe" — y eso se dice
  -- cancelando la OT en Odoo, que además la saca del tablero. Sin este CHECK, restar de
  -- a una hasta el fondo deja una obra que no vuelve nunca a la bandeja y tampoco está
  -- cerrada: desaparece sin que nadie haya decidido nada.
  CONSTRAINT plan_jornadas_ot_positivo CHECK (jornadas > 0)
);

DROP TRIGGER IF EXISTS trg_plan_jornadas_ot_updated_at ON plan_jornadas_ot;
CREATE TRIGGER trg_plan_jornadas_ot_updated_at
  BEFORE UPDATE ON plan_jornadas_ot
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE plan_jornadas_ot ENABLE ROW LEVEL SECURITY;

-- Escribe cualquier autenticado, mismo criterio que plan_notas_dia y tablero_tareas: el
-- que se da cuenta de que la obra es más corta es el que la está planificando, y pedirle
-- rol operativo bloquearía justo el camino por el que el dato existe.
DROP POLICY IF EXISTS "Autenticados ven jornadas planificadas" ON plan_jornadas_ot;
CREATE POLICY "Autenticados ven jornadas planificadas" ON plan_jornadas_ot
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados gestionan jornadas planificadas" ON plan_jornadas_ot;
CREATE POLICY "Autenticados gestionan jornadas planificadas" ON plan_jornadas_ot
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
