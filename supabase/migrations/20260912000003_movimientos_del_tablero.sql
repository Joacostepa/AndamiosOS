-- ============================================================
-- AndamiosOS — Qué se hizo en el tablero, quién y a qué hora
--
-- EL PROBLEMA: una tarjeta aparece el jueves y nadie sabe por qué. A veces es un arrastre
-- sin querer, a veces una decisión que alguien tomó y no contó. Hoy no hay forma de
-- distinguir las dos cosas, y tampoco de volver atrás.
--
-- POR QUÉ NO ALCANZA CON ODOO, que es donde vive la asignación: la app escribe con UN
-- solo usuario de integración, así que las 170 asignaciones figuran creadas y modificadas
-- por la misma persona. `write_uid` no puede contestar "quién". La identidad real sólo
-- existe del lado de Supabase. Mismo motivo que plan_confirmaciones.
--
-- POR QUÉ NO EN audit_log, que ya existe y tiene 34.372 filas: audita TABLAS DE SUPABASE,
-- y el tablero escribe en Odoo. Sus 22 filas de `planificacion_asignaciones` son del
-- módulo viejo y la última es del 21 de junio. Además está dominada por 28.666 UPDATE de
-- `clientes` que mete el sync: un movimiento de tablero ahí adentro no se encuentra más.
--
-- UNA FILA POR GESTO, y acá se separa de plan_confirmaciones a propósito. Mover una obra
-- de tres días toca tres asignaciones pero es UNA cosa que pasó: el historial tiene que
-- decir "movió Callao 1810 del mar 16 al jue 18, 3 jornadas" y no tres líneas iguales.
-- Confirmar es al revés —una fila por jornada— porque después ese tramo se parte y cada
-- jornada se lleva su historia.
--
-- NO REGISTRA EL CAMBIO DE ESTADO: eso ya lo registra plan_confirmaciones, con su propia
-- granularidad y su propia pantalla. Dos tablas anotando el mismo hecho es cómo terminan
-- diciendo cosas distintas. El panel de actividad lee las dos y las muestra en una sola
-- línea de tiempo; son conjuntos disjuntos, así que nada se ve dos veces.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS plan_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ancla estable: la OBRA. Las asignaciones se borran y se vuelven a crear con otro id
  -- —quitar del tablero y deshacer hace exactamente eso—, así que colgar el historial de
  -- ellas lo dejaría huérfano.
  odoo_ot_id BIGINT NOT NULL,

  -- DENORMALIZADO A PROPÓSITO. El panel de actividad muestra movimientos de obras que no
  -- están en la ventana cargada del tablero, y resolver cada título contra Odoo sería un
  -- RPC por línea. Además un registro de auditoría tiene que decir cómo se llamaba la
  -- obra ENTONCES, no cómo se llama hoy.
  ot_titulo TEXT,

  accion TEXT NOT NULL CHECK (accion IN ('crear', 'mover', 'fraccion', 'cuadrilla', 'quitar')),

  -- Las asignaciones que tocó el gesto. Sirve para la guarda del deshacer —comprobar que
  -- sigan existiendo y que nadie las haya movido después— y para contar jornadas.
  asignacion_ids BIGINT[] NOT NULL DEFAULT '{}',

  -- El estado del bloque antes y después, con la forma de src/lib/tablero/tipos-movimiento.ts:
  -- { fechas, cuadrillaId, cuadrillaNombre, fraccion, estado }. NULL de un lado es
  -- exactamente lo que significa: `crear` no tiene antes y `quitar` no tiene después.
  --
  -- LOS MANDA EL CLIENTE. El tablero tiene el bloque en memoria; leerlo de vuelta en Odoo
  -- le sumaría ~800 ms al gesto que más se repite del módulo. Es la misma decisión —y por
  -- el mismo motivo— que el `contexto` de las confirmaciones. Lo que NO se delega es el
  -- autor ni el hecho de registrar: eso lo pone la ruta con la sesión, así que no hay
  -- forma de mover una tarjeta sin dejar rastro.
  antes JSONB,
  despues JSONB,

  -- Qué movimiento vino a deshacer éste. Un deshacer NO borra el original: es un
  -- movimiento más, y el hecho de que alguien se haya equivocado y lo haya corregido
  -- también es información.
  deshace_a UUID REFERENCES plan_movimientos(id) ON DELETE SET NULL,

  autor_id UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El panel de actividad: todo, lo último primero.
CREATE INDEX IF NOT EXISTS idx_plan_movimientos_fecha
  ON plan_movimientos(created_at DESC);
-- El panel de la tarjeta: los de esta obra.
CREATE INDEX IF NOT EXISTS idx_plan_movimientos_ot
  ON plan_movimientos(odoo_ot_id, created_at DESC);
-- Para marcar en el historial lo que ya fue deshecho, sin recorrer la tabla.
CREATE INDEX IF NOT EXISTS idx_plan_movimientos_deshace
  ON plan_movimientos(deshace_a) WHERE deshace_a IS NOT NULL;

ALTER TABLE plan_movimientos ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY: sólo SELECT e INSERT. Un registro de auditoría que se puede editar no es
-- un registro de auditoría. Mismo criterio que plan_confirmaciones y hab_gestiones.
DROP POLICY IF EXISTS "Autenticados ven movimientos" ON plan_movimientos;
CREATE POLICY "Autenticados ven movimientos" ON plan_movimientos
  FOR SELECT TO authenticated USING (true);

-- El autor no se puede falsear: tiene que ser quien escribe. El default de la columna lo
-- pone solo, así que una ruta que se olvide de mirar quién es no deja un registro anónimo.
DROP POLICY IF EXISTS "Autenticados registran movimientos" ON plan_movimientos;
CREATE POLICY "Autenticados registran movimientos" ON plan_movimientos
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

COMMIT;
