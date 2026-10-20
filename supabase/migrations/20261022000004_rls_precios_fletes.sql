-- ============================================================
-- RLS en lista_precios y fletes_zona (aviso de Supabase del 17/10: rls_disabled_in_public)
-- ============================================================
-- Las dos tablas nacieron el 31/03 sin RLS: con la clave anónima cualquiera podía leer,
-- cambiar y borrar precios y fletes.
--
-- LEER sigue abierto, también sin sesión: el cotizador hogareño (/cotizador) es para
-- clientes finales sin cuenta y las lee desde el navegador. Son los precios que ya se
-- muestran ahí.
--
-- ESCRIBIR queda para quien edita Configuración (o admin), que es lo que pide la pantalla
-- /configuracion/lista-precios y /configuracion/fletes en src/lib/auth/acceso.ts.

CREATE OR REPLACE FUNCTION public.config_puede_editar()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'configuracion' = 'editar')
    FROM public.user_profiles p WHERE p.id = auth.uid()
  ), false);
$fn$;

ALTER TABLE lista_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE fletes_zona   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos ven la lista de precios" ON lista_precios;
CREATE POLICY "Todos ven la lista de precios" ON lista_precios
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Configuracion edita la lista de precios" ON lista_precios;
CREATE POLICY "Configuracion edita la lista de precios" ON lista_precios
  FOR ALL TO authenticated USING (public.config_puede_editar()) WITH CHECK (public.config_puede_editar());

DROP POLICY IF EXISTS "Todos ven los fletes" ON fletes_zona;
CREATE POLICY "Todos ven los fletes" ON fletes_zona
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Configuracion edita los fletes" ON fletes_zona;
CREATE POLICY "Configuracion edita los fletes" ON fletes_zona
  FOR ALL TO authenticated USING (public.config_puede_editar()) WITH CHECK (public.config_puede_editar());
