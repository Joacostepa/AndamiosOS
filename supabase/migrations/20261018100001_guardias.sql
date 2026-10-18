-- ============================================================
-- AndamiosOS — Guardias del tablero y sus pedidos de autorización
--
-- Contrato: docs/tablero-planificacion/guardias-contrato.md (manda). Plan técnico:
-- docs/tablero-planificacion/guardias-plan-tecnico.md.
--
-- 1. LA GUARDIA ES UNA FILA DE tablero_tareas CON tipo = 'guardia'. Es lo que recomendaba el
--    contrato y por lo mismo: una tarea ya ocupa capacidad en la celda, en el riel, en "N de
--    6 j" y en el asistente comercial, el corrimiento ya la respeta (no la mueve y frena la
--    cascada) y el tablero ya la dibuja. Mientras está ACTIVA viaja en el payload del
--    tablero como cualquier tarea; usada, rellenada o sacada deja de viajar (tareasEnRango la
--    filtra) y queda como historia. Sus columnas propias llevan el prefijo guardia_ y son
--    NULL en las tareas comunes (CHECK tablero_tareas_guardia_forma).
--
-- 2. LA SEMANA Y LA RANURA HACEN IDEMPOTENTE A LA CORRIDA DEL VIERNES. Cada semana tiene dos
--    ranuras (1 = martes, 2 = jueves); el índice único (guardia_semana, guardia_ranura) hace
--    que correrla dos veces —o dos corridas a la vez— no pueda duplicar nada. Una guardia
--    SACADA conserva su ranura: "si JS autorizó sacarla, esa semana no se repone" lo cumple
--    la base, no el código. guardia_semana = el lunes de `fecha` (CHECK): correrla dentro de
--    la semana se puede, a otra semana no.
--
-- 3. NADIE ESCRIBE UNA GUARDIA CON SU SESIÓN. Las políticas RESTRICTIVE de abajo dejan a
--    `authenticated` sin INSERT/UPDATE/DELETE sobre las filas tipo 'guardia' (aunque la
--    política vieja "Autenticados gestionan tareas del tablero" siga abierta para las demás
--    tareas; ésa la cierra la migración de seguridad 20261018100002). Las rutas de
--    /api/planificacion/guardias validan el candado y escriben con la service role.
--
-- 4. EL CANDADO TAMBIÉN EN LA BASE PARA LAS TAREAS: el trigger tablero_tareas_candado_guardia
--    rechaza poner una tarea común en la celda de una guardia activa (de hoy en adelante)
--    salvo la service role. Las OBRAS viven en Odoo y no se pueden atajar acá: las ataja la
--    validación de las rutas que escriben asignaciones (plan técnico §5).
--
-- 5. LA HISTORIA VA EN plan_guardia_eventos, una fila por cosa que le pasó (puesta, corrida,
--    usada, reactivada, sacada, pedida, aprobada…). Append-only y sólo por la service role.
--    ON DELETE RESTRICT: una guardia con historia no se borra; se saca.
--
-- 6. LOS PEDIDOS A JS VAN EN plan_guardia_solicitudes. `pedido` es el cuerpo de
--    /api/planificacion/guardias/usar (PedidoUsoGuardia) que se ejecuta al aprobar; si no se
--    puede ejecutar solo, queda aprobado y habilitado (error_ejecucion) para quien pidió.
--
-- 7. QUIÉN ES "JS": el módulo explícito `planificacion-autoriza` (src/lib/auth/acceso.ts), que
--    ningún admin trae solo. plan_autoriza_guardias() lo mide igual y SIN el atajo de admin.
--    Se le da acá a js@andamiosbuenosaires.com.ar; después se administra desde Usuarios.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  npx supabase db query --linked -f <este archivo>   (NUNCA supabase db push)
-- Idempotente y sin BEGIN/COMMIT propios (el probador la envuelve en su ROLLBACK). Va ANTES
-- que 20261018100002 (seguridad), que usa las funciones de permiso de la sección 1.
-- ============================================================

-- ============================================================
-- 1. Permisos (la misma regla que nivelEn() de src/lib/auth/acceso.ts)
-- ============================================================

-- El nivel en un módulo: 'editar' | 'ver' | NULL. El admin edita todo lo que no es
-- explícito. Igual que hd_nivel(), pero propio del tablero para no depender de la Hoja.
CREATE OR REPLACE FUNCTION plan_nivel(p_modulo TEXT DEFAULT 'planificacion') RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.activo IS NOT TRUE THEN NULL
    WHEN p.rol::text = 'admin' THEN 'editar'
    WHEN p.permisos->>p_modulo IN ('ver', 'editar') THEN p.permisos->>p_modulo
  END
  FROM user_profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION plan_puede_ver() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(plan_nivel('planificacion') IS NOT NULL, false); $$;

CREATE OR REPLACE FUNCTION plan_puede_editar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(plan_nivel('planificacion') = 'editar', false); $$;

-- "Solo JS": el módulo explícito, sin el atajo de admin (como sis_puede_revisar).
CREATE OR REPLACE FUNCTION plan_autoriza_guardias() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND p.permisos->>'planificacion-autoriza' = 'editar'
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

DO $fn$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['plan_nivel(text)', 'plan_puede_ver()', 'plan_puede_editar()', 'plan_autoriza_guardias()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$fn$;

-- ============================================================
-- 2. La guardia, en tablero_tareas
-- ============================================================

ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_estado TEXT;
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_origen TEXT;
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_uso TEXT;
-- La OT que la usó o la rellenó (id de Odoo, sin FK: vive en Odoo).
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_ot_id BIGINT;
-- Las asignaciones de Odoo que ocupan su celda por haberla usado. Sirve para el chip "de
-- guardia" de la obra y para reactivarla si esa obra se va de la celda (plan técnico §5.4).
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_asignacion_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_semana DATE;
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_ranura SMALLINT;
-- "Semana del 02/11: el jueves le tocaba a la C3 por rotación". Lo escribe el sistema.
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_por_que TEXT;
-- El lote de plan_movimientos del gesto que la usó (o el del corrimiento que la consumió).
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_lote_id UUID;
-- Lo que deshace el uso: las jornadas que el uso CREÓ (se borran) y las que MOVIÓ, con la
-- celda donde estaban según Odoo antes de moverlas (vuelven ahí). Lo escribe el servidor al
-- usarla; el deshacer sale de acá y no de lo que mande el navegador (revisión del 18/10).
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_deshacer JSONB;
-- Quién y cuándo cambió el estado por última vez, y el motivo si lo hubo. NULL = el sistema.
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_estado_por UUID REFERENCES user_profiles(id);
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_estado_at TIMESTAMPTZ;
ALTER TABLE tablero_tareas ADD COLUMN IF NOT EXISTS guardia_estado_motivo TEXT;

ALTER TABLE tablero_tareas DROP CONSTRAINT IF EXISTS tablero_tareas_guardia_estado;
ALTER TABLE tablero_tareas ADD CONSTRAINT tablero_tareas_guardia_estado
  CHECK (guardia_estado IS NULL OR guardia_estado IN ('activa', 'usada', 'rellenada', 'sacada'));

ALTER TABLE tablero_tareas DROP CONSTRAINT IF EXISTS tablero_tareas_guardia_origen;
ALTER TABLE tablero_tareas ADD CONSTRAINT tablero_tareas_guardia_origen
  CHECK (guardia_origen IS NULL OR guardia_origen IN ('sistema', 'persona'));

ALTER TABLE tablero_tareas DROP CONSTRAINT IF EXISTS tablero_tareas_guardia_uso;
ALTER TABLE tablero_tareas ADD CONSTRAINT tablero_tareas_guardia_uso
  CHECK (guardia_uso IS NULL OR guardia_uso IN ('urgencia', 'lluvia', 'atraso', 'comodin', 'obra_comun', 'deposito'));

ALTER TABLE tablero_tareas DROP CONSTRAINT IF EXISTS tablero_tareas_guardia_ranura;
ALTER TABLE tablero_tareas ADD CONSTRAINT tablero_tareas_guardia_ranura
  CHECK (guardia_ranura IS NULL OR guardia_ranura IN (1, 2));

-- La forma de una guardia: las columnas guardia_* van si y sólo si tipo = 'guardia'; una
-- guardia es de una cuadrilla, de jornada entera, con semana y ranura, y su semana es el
-- lunes de su fecha (correrla de semana no se puede ni por error).
ALTER TABLE tablero_tareas DROP CONSTRAINT IF EXISTS tablero_tareas_guardia_forma;
ALTER TABLE tablero_tareas ADD CONSTRAINT tablero_tareas_guardia_forma CHECK (
  (tipo = 'guardia') = (guardia_estado IS NOT NULL)
  AND (
    tipo <> 'guardia'
    OR (
      guardia_origen IS NOT NULL
      AND guardia_semana IS NOT NULL
      AND guardia_ranura IS NOT NULL
      AND cuadrilla_odoo_id IS NOT NULL
      AND fraccion = 1
      AND guardia_semana = fecha - (EXTRACT(ISODOW FROM fecha)::int - 1)
    )
  )
);

-- Usada o rellenada dice para qué; activa no tiene uso.
ALTER TABLE tablero_tareas DROP CONSTRAINT IF EXISTS tablero_tareas_guardia_uso_estado;
ALTER TABLE tablero_tareas ADD CONSTRAINT tablero_tareas_guardia_uso_estado CHECK (
  guardia_estado IS NULL
  OR (guardia_estado IN ('usada', 'rellenada')) = (guardia_uso IS NOT NULL)
);

-- Idempotencia de la corrida: una guardia por ranura y semana, en cualquier estado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tablero_tareas_guardia_ranura
  ON tablero_tareas(guardia_semana, guardia_ranura) WHERE tipo = 'guardia';

-- Una sola guardia activa por celda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tablero_tareas_guardia_activa_celda
  ON tablero_tareas(cuadrilla_odoo_id, fecha) WHERE tipo = 'guardia' AND guardia_estado = 'activa';

-- La rotación (últimas 4 semanas) y el GET por rango leen por semana.
CREATE INDEX IF NOT EXISTS idx_tablero_tareas_guardia_semana
  ON tablero_tareas(guardia_semana) WHERE tipo = 'guardia';

COMMENT ON COLUMN tablero_tareas.guardia_estado IS
  'Sólo en tipo = guardia: activa | usada | rellenada | sacada. Ver guardias-contrato.md §1.1.';

-- Nadie escribe una guardia con su sesión: las rutas validan el candado y escriben con la
-- service role (que no pasa por RLS). RESTRICTIVE: se suman (AND) a las políticas abiertas
-- que ya existen, así que valen aunque "Autenticados gestionan tareas del tablero" siga.
-- No hay restrictiva de SELECT: leerlas es lo que hace el tablero.
DROP POLICY IF EXISTS "Las guardias no se insertan con la sesion" ON tablero_tareas;
CREATE POLICY "Las guardias no se insertan con la sesion" ON tablero_tareas
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tipo <> 'guardia');

DROP POLICY IF EXISTS "Las guardias no se editan con la sesion" ON tablero_tareas;
CREATE POLICY "Las guardias no se editan con la sesion" ON tablero_tareas
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tipo <> 'guardia') WITH CHECK (tipo <> 'guardia');

DROP POLICY IF EXISTS "Las guardias no se borran con la sesion" ON tablero_tareas;
CREATE POLICY "Las guardias no se borran con la sesion" ON tablero_tareas
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tipo <> 'guardia');

-- El candado para las TAREAS: una tarea común no entra en la celda de una guardia activa
-- (de hoy en adelante, en Buenos Aires). La service role pasa: es la que usa las rutas que ya
-- validaron. SECURITY DEFINER para que la consulta vea la guardia aunque la RLS de lectura
-- se cierre algún día.
CREATE OR REPLACE FUNCTION tablero_tareas_candado_guardia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'guardia' OR NEW.cuadrilla_odoo_id IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.fecha >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
     AND EXISTS (
       SELECT 1 FROM tablero_tareas g
       WHERE g.tipo = 'guardia' AND g.guardia_estado = 'activa'
         AND g.cuadrilla_odoo_id = NEW.cuadrilla_odoo_id AND g.fecha = NEW.fecha
         AND g.id <> NEW.id
     ) THEN
    RAISE EXCEPTION 'Esa jornada es una guardia: para usarla con una tarea hace falta la autorización de JS'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION tablero_tareas_candado_guardia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tablero_tareas_candado_guardia ON tablero_tareas;
CREATE TRIGGER trg_tablero_tareas_candado_guardia
  BEFORE INSERT OR UPDATE OF cuadrilla_odoo_id, fecha, tipo ON tablero_tareas
  FOR EACH ROW EXECUTE FUNCTION tablero_tareas_candado_guardia();

-- ============================================================
-- 3. La historia de cada guardia
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_guardia_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardia_id BIGINT NOT NULL REFERENCES tablero_tareas(id) ON DELETE RESTRICT,
  accion TEXT NOT NULL CONSTRAINT plan_guardia_eventos_accion CHECK (accion IN (
    'poner', 'mover', 'usar', 'rellenar', 'reactivar', 'sacar', 'pedir', 'aprobar', 'rechazar', 'cancelar'
  )),
  estado_antes TEXT,
  estado_despues TEXT,
  uso TEXT,
  -- La OT y su título ENTONCES (denormalizado, como plan_movimientos.ot_titulo).
  ot_id BIGINT,
  ot_titulo TEXT,
  -- Dónde estaba y a dónde fue (al ponerla, sólo `a`; al correrla, los dos).
  de_fecha DATE,
  de_cuadrilla BIGINT,
  a_fecha DATE,
  a_cuadrilla BIGINT,
  motivo TEXT,
  lote_id UUID,
  solicitud_id UUID,
  -- NULL = el sistema (la corrida del viernes, la de las 13 h).
  autor_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_guardia_eventos_guardia
  ON plan_guardia_eventos(guardia_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_guardia_eventos_lote
  ON plan_guardia_eventos(lote_id) WHERE lote_id IS NOT NULL;

ALTER TABLE plan_guardia_eventos ENABLE ROW LEVEL SECURITY;

-- Lee quien ve la planificación. Sin políticas de escritura: sólo la service role.
DROP POLICY IF EXISTS "Planificacion ve la historia de las guardias" ON plan_guardia_eventos;
CREATE POLICY "Planificacion ve la historia de las guardias" ON plan_guardia_eventos
  FOR SELECT TO authenticated USING (plan_puede_ver());

-- ============================================================
-- 4. Los pedidos de autorización a JS
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_guardia_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardia_id BIGINT NOT NULL REFERENCES tablero_tareas(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CONSTRAINT plan_guardia_solicitudes_tipo
    CHECK (tipo IN ('sacar', 'obra_comun', 'comodin_antes', 'urgencia_fuera_regla')),
  ot_id BIGINT,
  ot_titulo TEXT,
  -- Obligatorio, una línea.
  motivo TEXT NOT NULL CONSTRAINT plan_guardia_solicitudes_motivo
    CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 300),
  -- El PedidoUsoGuardia que se ejecuta al aprobar. NULL sólo en 'sacar'.
  pedido JSONB,
  estado TEXT NOT NULL DEFAULT 'pendiente' CONSTRAINT plan_guardia_solicitudes_estado
    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  pedido_por UUID NOT NULL REFERENCES user_profiles(id),
  pedido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_por UUID REFERENCES user_profiles(id),
  respondido_at TIMESTAMPTZ,
  respuesta TEXT,
  -- La acción pedida ya se hizo (al aprobar, o después, con la habilitación).
  ejecutada_at TIMESTAMPTZ,
  -- Aprobada pero no se pudo ejecutar sola (la grilla cambió): queda habilitada.
  error_ejecucion TEXT,
  CONSTRAINT plan_guardia_solicitudes_pedido CHECK (tipo = 'sacar' OR pedido IS NOT NULL),
  CONSTRAINT plan_guardia_solicitudes_respuesta
    CHECK (estado NOT IN ('aprobada', 'rechazada') OR (respondido_por IS NOT NULL AND respondido_at IS NOT NULL)),
  CONSTRAINT plan_guardia_solicitudes_ejecutada CHECK (ejecutada_at IS NULL OR estado = 'aprobada')
);

-- Un solo pedido pendiente por guardia, tipo y obra: tocar dos veces "Pedir" no le manda
-- dos avisos a JS.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_guardia_solicitudes_pendiente
  ON plan_guardia_solicitudes(guardia_id, tipo, COALESCE(ot_id, 0)) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_plan_guardia_solicitudes_estado
  ON plan_guardia_solicitudes(estado, pedido_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_guardia_solicitudes_guardia
  ON plan_guardia_solicitudes(guardia_id);

ALTER TABLE plan_guardia_solicitudes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Planificacion ve los pedidos de guardias" ON plan_guardia_solicitudes;
CREATE POLICY "Planificacion ve los pedidos de guardias" ON plan_guardia_solicitudes
  FOR SELECT TO authenticated USING (plan_puede_ver() OR plan_autoriza_guardias());

-- ============================================================
-- 5. Quién autoriza hoy: JS
-- ============================================================
UPDATE user_profiles
SET permisos = coalesce(permisos, '{}'::jsonb) || '{"planificacion-autoriza": "editar"}'::jsonb
WHERE lower(email) = 'js@andamiosbuenosaires.com.ar'
  AND (permisos->>'planificacion-autoriza') IS DISTINCT FROM 'editar';

NOTIFY pgrst, 'reload schema';
