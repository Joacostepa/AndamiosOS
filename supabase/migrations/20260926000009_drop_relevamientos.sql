-- ========================================================================
-- Baja del módulo Relevamientos
-- ========================================================================
--
-- Joaquín (26/09): quedó viejo y no se va a usar. Se sacan la pantalla, la API del agente
-- y el hook; acá, la tabla, su enum y las instrucciones del agente en `configuracion`.
--
-- Verificado antes de correrla: la tabla tenía 0 filas, ninguna FK entrante, ninguna vista
-- ni función que la use, ningún bucket de Storage y ningún usuario con el permiso
-- "relevamientos". El único otro uso del enum era su propio índice, que cae con la tabla.
-- Las políticas y los triggers (updated_at, auditoría) también caen con ella.

DROP TABLE IF EXISTS relevamientos;
DROP TYPE IF EXISTS estado_relevamiento;
DELETE FROM configuracion WHERE clave = 'ai_agente_relevamiento';
