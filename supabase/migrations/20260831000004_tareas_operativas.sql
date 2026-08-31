-- ============================================================
-- AndamiosOS — Tarjetas de operaciones
--
-- "La cuadrilla 3 va al depósito a desarmar cañería". Trabajo real que Operaciones le
-- asigna a una cuadrilla y que hasta ahora no existía en ningún lado: el tablero sólo
-- sabe de OTs, así que ese martes se veía libre y encima se le planificaba una obra.
--
-- NO ES UNA OT. No tiene cliente, ni orden de venta, ni habilitación, ni parte diario,
-- ni va al costeo. Lo único que comparte con una obra es que ocupa a una cuadrilla un
-- día, que es justamente lo que el tablero necesita saber.
--
-- POR QUÉ EN SUPABASE Y NO EN ODOO: la asignación de una obra vive en Odoo porque
-- cuelga de la OT y alimenta partes y costeo. Sacando eso no queda nadie del lado del
-- ERP que necesite leer esto — es operativo puro, del lado de la app. Además Odoo
-- Online obliga a pasar por Studio para cada campo, y esto se va a querer iterar.
--
-- EL COSTO DE ESA DECISIÓN es que el tablero lee de dos fuentes. Se paga en un solo
-- lugar: fetchTablero mezcla las tareas dentro del mismo array de asignaciones, con
-- kind='tarea', y de ahí para arriba nadie sabe que hay dos bases. La capacidad de la
-- celda y el armado de bloques funcionan sin enterarse.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tablero_tareas (
  -- BIGINT y no UUID a propósito: en el tablero una tarea viaja como una asignación
  -- más, y AsignacionTablero.id es numérico porque del otro lado están los ids de
  -- Odoo. No hay riesgo de choque: la fuente la dice `kind`, nunca el id.
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  -- UNA FILA POR DÍA, igual que x_aba_asignacion. Los días de una misma tarea comparten
  -- grupo_id, y de ahí sale la tarjeta única que abarca las celdas contiguas (ver
  -- agruparBloques). Una tarea de un solo día —el caso normal— es un grupo de uno.
  --
  -- Se eligió esto sobre una tabla padre + una de días: la mayoría son de un día, y el
  -- join saldría en la consulta que más se repite del sistema. El precio es que el
  -- título se repite por día, y renombrar es un UPDATE ... WHERE grupo_id = $1.
  grupo_id BIGINT NOT NULL,

  titulo TEXT NOT NULL,
  -- deposito | mantenimiento | traslado | retiro | capacitacion | otro
  tipo TEXT NOT NULL DEFAULT 'otro',
  notas TEXT,

  -- Id de Odoo (x_aba_cuadrilla), mismo criterio que plan_notas_dia.cuadrilla_odoo_id:
  -- sin FK, porque la tabla `cuadrillas` de Supabase es del módulo viejo y el tablero
  -- trabaja contra Odoo. NULL = todavía sin cuadrilla (vive en la bandeja).
  cuadrilla_odoo_id BIGINT,

  fecha DATE NOT NULL,
  -- Misma escala que x_aba_asignacion.x_fraccion: 0.10 | 0.25 | 0.50 | 0.75 | 1.
  -- Es lo que hace que la tarea descuente de las horas disponibles de la jornada.
  fraccion NUMERIC(3,2) NOT NULL DEFAULT 1,
  -- Apilado dentro de la celda, igual que x_orden_dia.
  orden_dia INTEGER NOT NULL DEFAULT 0,

  -- El cierre de una tarea es un sí o un no, no un parte: no hay horas que costear.
  hecha BOOLEAN NOT NULL DEFAULT false,

  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tablero_tareas_titulo CHECK (length(btrim(titulo)) > 0),
  CONSTRAINT tablero_tareas_fraccion CHECK (fraccion > 0 AND fraccion <= 1),
  -- Dos días de la misma tarea en la misma fecha no significan nada y partirían la
  -- tarjeta en dos, igual que en el diálogo de jornadas de una obra.
  CONSTRAINT tablero_tareas_dia_unico UNIQUE (grupo_id, fecha)
);

-- grupo_id arranca donde arranca id: la primera fila de una tarea nueva se crea sin
-- grupo y se le pone el suyo propio, y los días que se agreguen después lo heredan.
-- Se hace en la app (ver crearTareas) y no con un trigger para que el id creado vuelva
-- en el mismo insert.

-- El tablero pide siempre por rango de fechas y dibuja por cuadrilla; es la única
-- consulta que hace esta tabla.
CREATE INDEX IF NOT EXISTS idx_tablero_tareas_fecha ON tablero_tareas(fecha);
CREATE INDEX IF NOT EXISTS idx_tablero_tareas_grupo ON tablero_tareas(grupo_id);

CREATE TRIGGER trg_tablero_tareas_updated_at
  BEFORE UPDATE ON tablero_tareas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE tablero_tareas ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que plan_notas_dia: escribe cualquier autenticado. Quien sabe que la
-- cuadrilla tiene que ir al depósito no es necesariamente quien planifica, y pedirle
-- rol operativo bloquea justo el camino por el que el dato existe.
DROP POLICY IF EXISTS "Autenticados ven tareas del tablero" ON tablero_tareas;
CREATE POLICY "Autenticados ven tareas del tablero" ON tablero_tareas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados gestionan tareas del tablero" ON tablero_tareas;
CREATE POLICY "Autenticados gestionan tareas del tablero" ON tablero_tareas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
