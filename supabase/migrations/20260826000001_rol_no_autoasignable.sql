-- El rol deja de ser auto-asignable.
--
-- EL AGUJERO: la política "Usuarios pueden editar su perfil" permite UPDATE sobre la
-- propia fila (id = auth.uid()) sin restringir QUÉ columnas. Una política de RLS no puede
-- acotar columnas, así que hasta hoy cualquier usuario autenticado podía escribir su
-- propio `rol` desde el navegador —con la clave anónima, que viaja en el bundle— y
-- ponerse admin. Con el menú y las rutas filtrados por rol, eso convierte el permiso en
-- una decoración.
--
-- LA SOLUCIÓN es privilegio a nivel COLUMNA, que es la herramienta que sí acota columnas.
-- El usuario sigue pudiendo editar su nombre, apellido y teléfono; `rol` y `activo` sólo
-- se tocan con la service role (los scripts de alta) o desde el panel de Supabase.
--
-- Nota: en Postgres, quitar el UPDATE de dos columnas obliga a enumerar el resto, porque
-- el permiso de tabla completo desaparece al haber permisos por columna.

REVOKE UPDATE ON public.user_profiles FROM authenticated;

GRANT UPDATE (nombre, apellido, telefono, email, updated_at)
  ON public.user_profiles TO authenticated;

-- INSERT ya estaba restringido a admin por política; se deja igual, pero sin poder
-- elegirse el rol en el alta por la misma razón.
REVOKE INSERT ON public.user_profiles FROM authenticated;
GRANT INSERT (id, email, nombre, apellido, telefono) ON public.user_profiles TO authenticated;
