-- ============================================================
-- AndamiosOS — El PM de cada obra (plan_pm_ot)
--
-- Pedido de JS (19/11/2026): Augusto y Juani, de Oficina Técnica, se reparten las obras que
-- vienen y uno de ellos queda como PM (project manager). Lo importante es que NO SE PISEN y
-- que Operaciones vea quién es el PM de cada obra en el tablero. Lleva PM toda OT que no sea
-- un desarme (JS: "lo único que no llevaría es si dice Desarme"). Diseño y maquetas:
-- docs/oficina-tecnica/proyectos/.
--
-- 1. POR QUÉ EN SUPABASE Y NO EN ODOO. Igual que plan_comodines: es una decisión de la oficina
--    sobre la obra, no le sirve a Comercial ni al cliente, y un campo en Odoo es un viaje más
--    por escritura contra una Odoo Online que ya devuelve 429. Además Odoo por XML-RPC no tiene
--    un "escribir sólo si está vacío": habría que leer y después escribir, y en el medio se
--    pisan. Acá la PRIMARY KEY lo resuelve: dos "Tomar" a la vez, gana el primero y el segundo
--    recibe 23505 (la ruta lo contesta con "Ya lo tomó Juani").
--
-- 2. QUIÉN PUEDE SER PM. Quien tiene el módulo 'planificacion-pm' en "editar" EN SU PERFIL
--    (src/lib/auth/acceso.ts). Explícito: el atajo de admin NO hace PM a nadie —si no, el menú
--    "Asignar a…" ofrecería a cada administrador—. Lo resuelve plan_es_pm().
--
-- 3. QUIÉN ESCRIBE (la ruta /api/planificacion/pm, con la SESIÓN de quien lo hace):
--    · Tomar: un PM se asigna a sí mismo (pm = auth.uid()).
--    · Asignar a otro, pasar o quitar: quien EDITA Planificación (Operaciones, JS), o el PM de
--      esa obra (pasársela al otro o soltarla).
--    Siempre a alguien que sea PM (plan_es_pm(pm)). `asignado_por` y `asignado_el` los pone la
--    base (DEFAULT y trigger), para que nadie firme por otro.
--    LEER: quien ve Planificación o es PM.
--
-- RIESGO: bajo. Tabla y funciones nuevas; nadie las usa hasta que se despliegue la versión que
-- las lee. Si el código llega antes que esto, el tablero se dibuja sin PMs y "Tomar" contesta
-- 500. Volver atrás: DROP TABLE plan_pm_ot; DROP FUNCTION plan_es_pm(uuid),
-- plan_pm_firmar().
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Idempotente y sin BEGIN/COMMIT propios (el probador la envuelve en su ROLLBACK).
-- ============================================================

CREATE OR REPLACE FUNCTION plan_es_pm(p_usuario UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND p.permisos->>'planificacion-pm' = 'editar'
                   FROM user_profiles p WHERE p.id = p_usuario), false);
$$;

REVOKE ALL ON FUNCTION plan_es_pm(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION plan_es_pm(UUID) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS plan_pm_ot (
  -- El id de la OT en Odoo (x_aba_orden_trabajo). Una obra, un PM: la clave es lo que impide
  -- que se pisen.
  ot_id BIGINT PRIMARY KEY,
  -- El PM. Si alguna vez se borra el usuario, la obra vuelve a quedar sin PM.
  pm UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Quién la asignó (el mismo PM al tomarla, u Operaciones) y cuándo. Los pone la base.
  asignado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  asignado_el TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plan_pm_ot IS
  'El PM (project manager) de cada obra: lo toma Oficina Técnica o lo asigna Operaciones desde el tablero (19/11/2026). Una fila por OT; sin fila = sin PM.';

-- Al pasar la obra a otro, la firma es de quien la pasa y la hora es la del cambio.
CREATE OR REPLACE FUNCTION plan_pm_firmar() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.asignado_por := auth.uid();
  NEW.asignado_el := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_pm_ot_firmar ON plan_pm_ot;
CREATE TRIGGER plan_pm_ot_firmar BEFORE UPDATE ON plan_pm_ot
  FOR EACH ROW EXECUTE FUNCTION plan_pm_firmar();

ALTER TABLE plan_pm_ot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Planificacion y PMs leen PMs" ON plan_pm_ot;
CREATE POLICY "Planificacion y PMs leen PMs" ON plan_pm_ot
  FOR SELECT TO authenticated USING (plan_puede_ver() OR plan_es_pm(auth.uid()));

DROP POLICY IF EXISTS "Tomar o asignar PM" ON plan_pm_ot;
CREATE POLICY "Tomar o asignar PM" ON plan_pm_ot
  FOR INSERT TO authenticated WITH CHECK (
    asignado_por = auth.uid()
    AND plan_es_pm(pm)
    AND (pm = auth.uid() OR plan_puede_editar())
  );

DROP POLICY IF EXISTS "Pasar PM" ON plan_pm_ot;
CREATE POLICY "Pasar PM" ON plan_pm_ot
  FOR UPDATE TO authenticated
  USING (pm = auth.uid() OR plan_puede_editar())
  WITH CHECK (plan_es_pm(pm));

DROP POLICY IF EXISTS "Soltar o quitar PM" ON plan_pm_ot;
CREATE POLICY "Soltar o quitar PM" ON plan_pm_ot
  FOR DELETE TO authenticated USING (pm = auth.uid() OR plan_puede_editar());

REVOKE ALL ON plan_pm_ot FROM anon;
REVOKE TRUNCATE ON plan_pm_ot FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_pm_ot TO authenticated;
GRANT ALL ON plan_pm_ot TO service_role;
