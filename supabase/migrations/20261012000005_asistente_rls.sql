-- ========================================================================
-- Seguridad (RLS) — lo que hoy lee cualquiera con login
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE (auditoría del 12/10, Bloque 6): con la clave anon y una sesión
-- cualquiera (un capataz, el kiosco del pañol) se podía leer desde el navegador:
--   · configuracion.afip_key y afip_cert — la clave privada del certificado de AFIP/ARCA
--     (política "Autenticados pueden ver configuracion", 20260331000004);
--   · las tarifas, su historial, el criterio, la lista de alquiler, los productos de Odoo y los
--     renders (20260926000001: todas "USING (true)");
--   · comercial_vendedores con el WhatsApp de cada vendedor (20260926000003). Ese número le
--     habla al asistente COMO esa persona.
--
-- CÓMO QUEDA:
--   · configuracion: se ve todo MENOS las claves afip_*. Las pantallas que la leen con la
--     sesión (Configuración → Empresa y Agentes IA, use-configuracion.ts) no usan esas claves,
--     y ningún código las lee (se buscó `from("configuracion")` el 12/10). Un admin las sigue
--     viendo por la política de edición, que es FOR ALL.
--   · Parámetros de cotización: quien tenga el módulo parametros-cotizacion o
--     asistente-comercial (ver o editar), o sea admin — cotizacion_puede_ver(). Las únicas
--     lecturas con la sesión son las rutas /api/comercial/parametros/*, que ya exigen el módulo;
--     el asistente lee con service role, y las funciones de escritura son SECURITY DEFINER.
--   · comercial_vendedores: sólo admin. La pantalla Vendedores y el asistente leen con service
--     role después de exigirModulo, así que no cambia nada visible.
--
-- NO CUBRE: el registro abierto de usuarios. Eso es de Supabase Auth (Authentication →
-- Sign In / Providers → "Allow new users to sign up"), no de SQL.
--
-- RIESGO: si alguna pantalla nueva leyera estas tablas con la sesión de un usuario sin el
-- módulo, vería vacío (no un error). Volver atrás: recrear las políticas "USING (true)"
-- de las migraciones citadas.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) No depende de ningún deploy: se puede aplicar antes o después.

DO $mig$ BEGIN

  -- ── configuracion: todo menos las claves de AFIP ──────────────────────────
  DROP POLICY IF EXISTS "Autenticados pueden ver configuracion" ON configuracion;
  DROP POLICY IF EXISTS "Autenticados ven configuracion no sensible" ON configuracion;
  CREATE POLICY "Autenticados ven configuracion no sensible" ON configuracion FOR SELECT TO authenticated
    USING (clave NOT LIKE 'afip\_%');

  -- ── Parámetros de cotización: módulo comercial ────────────────────────────
  CREATE OR REPLACE FUNCTION public.cotizacion_puede_ver()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT COALESCE((
      SELECT p.activo AND (
        p.rol::text = 'admin'
        OR p.permisos->>'parametros-cotizacion' IN ('ver', 'editar')
        OR p.permisos->>'asistente-comercial' IN ('ver', 'editar')
      )
      FROM public.user_profiles p WHERE p.id = auth.uid()
    ), false);
  $fn$;
  REVOKE ALL ON FUNCTION public.cotizacion_puede_ver() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.cotizacion_puede_ver() TO authenticated;

  DROP POLICY IF EXISTS "Autenticados ven parametros" ON cotizacion_parametros;
  DROP POLICY IF EXISTS "Comercial ve parametros" ON cotizacion_parametros;
  CREATE POLICY "Comercial ve parametros" ON cotizacion_parametros FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  DROP POLICY IF EXISTS "Autenticados ven cambios de parametros" ON cotizacion_parametros_cambios;
  DROP POLICY IF EXISTS "Comercial ve cambios de parametros" ON cotizacion_parametros_cambios;
  CREATE POLICY "Comercial ve cambios de parametros" ON cotizacion_parametros_cambios FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  DROP POLICY IF EXISTS "Autenticados ven criterios" ON cotizacion_criterios;
  DROP POLICY IF EXISTS "Comercial ve criterios" ON cotizacion_criterios;
  CREATE POLICY "Comercial ve criterios" ON cotizacion_criterios FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  DROP POLICY IF EXISTS "Autenticados ven listas de alquiler" ON lista_alquiler;
  DROP POLICY IF EXISTS "Comercial ve listas de alquiler" ON lista_alquiler;
  CREATE POLICY "Comercial ve listas de alquiler" ON lista_alquiler FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  DROP POLICY IF EXISTS "Autenticados ven piezas de alquiler" ON lista_alquiler_piezas;
  DROP POLICY IF EXISTS "Comercial ve piezas de alquiler" ON lista_alquiler_piezas;
  CREATE POLICY "Comercial ve piezas de alquiler" ON lista_alquiler_piezas FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  DROP POLICY IF EXISTS "Autenticados ven productos de cotizacion" ON cotizacion_productos_odoo;
  DROP POLICY IF EXISTS "Comercial ve productos de cotizacion" ON cotizacion_productos_odoo;
  CREATE POLICY "Comercial ve productos de cotizacion" ON cotizacion_productos_odoo FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  DROP POLICY IF EXISTS "Autenticados ven renders" ON cotizacion_renders;
  DROP POLICY IF EXISTS "Comercial ve renders" ON cotizacion_renders;
  CREATE POLICY "Comercial ve renders" ON cotizacion_renders FOR SELECT TO authenticated USING (cotizacion_puede_ver());

  -- ── comercial_vendedores: sólo admin (el resto, por el servidor) ──────────
  DROP POLICY IF EXISTS "Autenticados ven vendedores" ON comercial_vendedores;
  DROP POLICY IF EXISTS "Admin ve vendedores" ON comercial_vendedores;
  CREATE POLICY "Admin ve vendedores" ON comercial_vendedores FOR SELECT TO authenticated USING (asistente_es_admin());

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
