-- ============================================================
-- AndamiosOS — Cajón de planificación
--
-- El panel de abajo del tablero: pendientes del que planifica, y criterios que no
-- vencen. Las dos cosas son GENERALES — no cuelgan de una semana.
--
-- POR QUÉ NO HAY SEMANA. La primera versión de esto ataba todo a un `week_start`, y
-- el tablero no tiene semanas: tiene una ventana rodante de siete días anclada en HOY
-- (ver `ancla` y `fechaVisible` en tablero-board.tsx). El borde izquierdo no es un
-- lunes y se mueve scrolleando, así que "la semana" habría sido una invención de este
-- módulo que cambia de contenido mientras alguien está escribiendo.
--
-- Y sin la semana el corte queda mejor, porque el que sobra es el corte por fecha:
-- un pendiente está abierto hasta que se hace, no hasta que termina la semana.
--
-- QUÉ VA ACÁ Y QUÉ VA EN plan_notas_dia. Es la división que hace que las dos tablas no
-- compitan, y hay que sostenerla o una de las dos queda vacía:
--
--   plan_notas_dia    EVENTOS. "El jueves el chofer se va temprano." Tiene fecha,
--                     aparece ese día en la grilla, y vence solo.
--   plan_cajon_notas  CRITERIOS. "Los desarmes de Olivos van con el camión chico."
--                     No tiene fecha, vale siempre, y hoy no hay dónde ponerlo:
--                     plan_notas_dia obliga a inventarle un desde/hasta a algo que
--                     no vence.
--
-- La UI lo dice en el placeholder. Sin eso, el primero que quiera anotar "el jueves
-- falta Juan" lo escribe acá y el jueves no aparece.
-- ============================================================

BEGIN;

-- ── Notas generales ──────────────────────────────────────────────────────────
--
-- UNA SOLA FILA, y el PK fijo es lo que lo garantiza. La alternativa —un índice único
-- sobre una expresión constante— no es una construcción que valga la pena arriesgar
-- para esto; un CHECK sobre el PK se lee solo y no depende de qué acepte el planner.
CREATE TABLE IF NOT EXISTS plan_cajon_notas (
  id TEXT PRIMARY KEY DEFAULT 'unica' CHECK (id = 'unica'),
  texto TEXT NOT NULL DEFAULT '',

  -- updated_at NO es decorativo: es el control de concurrencia. Esta es la fila de
  -- máxima colisión del sistema —una sola, editada por todos, para siempre— y el
  -- autoguardado con debounce garantiza que dos personas se pisen sin enterarse. El
  -- guardado manda el updated_at que leyó y el UPDATE no toca nada si ya cambió, así
  -- que el conflicto se convierte en un aviso en vez de en texto perdido.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES user_profiles(id)
);

DROP TRIGGER IF EXISTS trg_plan_cajon_notas_updated_at ON plan_cajon_notas;
CREATE TRIGGER trg_plan_cajon_notas_updated_at
  BEFORE UPDATE ON plan_cajon_notas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- La fila nace acá y no la crea la app: así el guardado es siempre un UPDATE y nunca
-- hay que resolver un upsert con control de concurrencia encima.
INSERT INTO plan_cajon_notas (id) VALUES ('unica') ON CONFLICT (id) DO NOTHING;

-- ── Pendientes ───────────────────────────────────────────────────────────────
--
-- SUELTOS, sin atar a obra ni a OT. La mitad de lo que anota el que planifica no es de
-- una obra ("confirmar plantel de la 1", "avisarle a Pepo el orden del martes"), y
-- exigir un vínculo haría que esas no se anoten en ningún lado.
CREATE TABLE IF NOT EXISTS plan_cajon_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto TEXT NOT NULL,
  hecho BOOLEAN NOT NULL DEFAULT false,

  -- Orden manual. Los nuevos van al final; el tildado no reordena nada, sólo se
  -- esconde bajo el plegable de hechos.
  posicion INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cuándo se tildó. Es lo que hace posible que la lista se limpie sola a los 30 días,
  -- y por eso el CHECK lo exige: un hecho sin fecha sería inmortal, y una lista general
  -- que nadie purga se llena de ochenta tildados hasta que abrirla no rinde. Ese es el
  -- modo de falla de este panel, no el de quedarse sin datos.
  hecho_at TIMESTAMPTZ,

  autor_id UUID REFERENCES user_profiles(id),

  CONSTRAINT plan_cajon_pendientes_texto CHECK (length(btrim(texto)) > 0),
  CONSTRAINT plan_cajon_pendientes_hecho_at CHECK (hecho = (hecho_at IS NOT NULL))
);

-- La lista se lee entera y se parte en abiertos / hechos, así que el índice arranca por
-- `hecho`. La tabla es chica por diseño (la purga se encarga), pero el orden importa:
-- es lo que se pinta en el panel.
CREATE INDEX IF NOT EXISTS idx_plan_cajon_pendientes_orden
  ON plan_cajon_pendientes(hecho, posicion);

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Escribe cualquier autenticado, mismo criterio que plan_notas_dia: el que se entera de
-- que hay que pedir una habilitación no es necesariamente el que planifica, y
-- restringirlo bloquearía justo el camino que hace que el dato exista.
ALTER TABLE plan_cajon_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_cajon_pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados ven notas del cajon" ON plan_cajon_notas;
CREATE POLICY "Autenticados ven notas del cajon" ON plan_cajon_notas
  FOR SELECT TO authenticated USING (true);

-- Sólo UPDATE: la fila única ya existe y no se borra ni se duplica.
DROP POLICY IF EXISTS "Autenticados editan notas del cajon" ON plan_cajon_notas;
CREATE POLICY "Autenticados editan notas del cajon" ON plan_cajon_notas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Autenticados ven pendientes del cajon" ON plan_cajon_pendientes;
CREATE POLICY "Autenticados ven pendientes del cajon" ON plan_cajon_pendientes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados gestionan pendientes del cajon" ON plan_cajon_pendientes;
CREATE POLICY "Autenticados gestionan pendientes del cajon" ON plan_cajon_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
