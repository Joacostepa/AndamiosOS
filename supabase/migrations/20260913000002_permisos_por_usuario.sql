-- Permisos por usuario.
--
-- HASTA HOY qué veía cada uno salía de su rol (la lista fija de src/lib/auth/roles.ts).
-- Con gente que no encaja en ningún casillero —el de depósito que también mira la
-- planificación, el técnico de afuera que sólo consulta habilitaciones— un rol por
-- persona terminaba siendo un rol por persona con otro nombre.
--
-- AHORA cada persona tiene su lista: permisos = { "<módulo>": "ver" | "editar" }. Los ids
-- de módulo son los de MODULOS en src/lib/auth/acceso.ts; un módulo ausente es sin acceso.
-- El rol queda: `admin` abre todo y administra usuarios, y el resto lo siguen usando las
-- políticas viejas (get_user_role) y las alertas dirigidas por rol.
--
-- debe_cambiar_clave: el alta desde Configuración → Usuarios crea la cuenta con una
-- contraseña temporal. Mientras esté en true, el proxy sólo deja entrar a /cambiar-clave.
--
-- Ninguna de las dos columnas entra en los GRANT por columna de 20260826000001, así que
-- nadie puede escribírselas desde el navegador con la clave anónima: sólo la service role.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS permisos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS debe_cambiar_clave boolean NOT NULL DEFAULT false;

-- Cada uno arranca con exactamente lo que veía con su rol: el cambio no le mueve nada a
-- nadie. "editar" porque hasta hoy no existía la distinción, y quien entraba podía todo.
UPDATE public.user_profiles
  SET permisos = '{"planificacion":"editar","ordenes-trabajo":"editar","partes":"editar","habilitaciones":"editar","mapa-obras":"ver"}'::jsonb
  WHERE rol = 'operativo' AND permisos = '{}'::jsonb;

UPDATE public.user_profiles
  SET permisos = '{"planificacion":"editar","ordenes-trabajo":"editar","partes":"editar"}'::jsonb
  WHERE rol IN ('deposito', 'campo') AND permisos = '{}'::jsonb;

-- mi_acceso(): lo que el proxy necesita saber de quien pide, en una sola llamada y sin
-- conocer su id (sale de auth.uid()). Eso le permite correr EN PARALELO con getUser() en
-- vez de después, que es la diferencia entre sumar un viaje a Supabase por request o no.
-- El rol va como texto: el enum no le suma nada a quien lee y rompe el scan del CLI.
CREATE OR REPLACE FUNCTION public.mi_acceso()
RETURNS TABLE (rol text, activo boolean, permisos jsonb, debe_cambiar_clave boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.rol::text, p.activo, p.permisos, p.debe_cambiar_clave
  FROM public.user_profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.mi_acceso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_acceso() TO authenticated;
