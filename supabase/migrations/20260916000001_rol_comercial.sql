-- Rol "comercial": asistentes comerciales.
--
-- Consultan la planificación y el mapa de obras, y trabajan la gestoría de permisos de
-- andamio. Los módulos de cada una viven en user_profiles.permisos (20260913000002); el
-- rol las identifica en la pantalla de usuarios y, como no está en ninguna política vieja
-- de RLS (get_user_role IN ('admin', 'operativo')), no hereda permisos de escritura de
-- Oficina.
--
-- OJO con las alertas: las que se crean sin destinatario van al rol 'operativo', así que
-- este rol NO las ve en la campanita. Si alguna tiene que llegarle, hay que dirigirla.
--
-- Va sola: un valor nuevo de enum no se puede usar en la misma transacción que lo crea.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'comercial';
