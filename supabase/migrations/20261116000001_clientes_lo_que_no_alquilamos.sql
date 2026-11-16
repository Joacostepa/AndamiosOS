-- ========================================================================
-- Tomás — lo que no alquilamos (JS, 16/11, por la charla de Gabi Notario)
-- ========================================================================
--
-- Tomás le dijo a un cliente que las vallas free standing «no son de lo que solemos trabajar».
-- JS: alquilamos vallas free standing, vallado tipo reja y vallado ciego, y nunca se dice que no
-- alquilamos algo (ante la duda lo define el equipo: a veces conviene tercerizarlo). Lo único que
-- no alquilamos son balancines, silletas y andamios eléctricos, y ahí se ofrece andamio tubular.
--
-- Cambia SÓLO el renglón «Lo que no hacemos» de clientes_datos_empresa (el resto queda como
-- está). Si alguien ya lo editó en Parámetros, no lo toca y avisa (NOTICE).

DO $mig$
DECLARE n int;
BEGIN
  UPDATE cotizacion_parametros SET texto = replace(texto,
    '- Lo que no hacemos: balancines ni colgantes eléctricos, silletas, montacargas, guinches, tubos de escombro, truss, hormigoneras ni herramientas.',
    '- Lo que no alquilamos: balancines, silletas y andamios eléctricos (ahí se ofrece andamio tubular, ver «Qué hace ABA»). Todo lo demás lo define el equipo: nunca digas que no lo alquilamos.'),
    updated_at = now()
  WHERE clave = 'clientes_datos_empresa'
    AND position('- Lo que no hacemos: balancines ni colgantes eléctricos, silletas, montacargas, guinches, tubos de escombro, truss, hormigoneras ni herramientas.' in texto) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE NOTICE 'clientes_datos_empresa no se tocó: el renglón «Lo que no hacemos» ya cambió. Corregirlo a mano en Parámetros.'; END IF;
END $mig$;
