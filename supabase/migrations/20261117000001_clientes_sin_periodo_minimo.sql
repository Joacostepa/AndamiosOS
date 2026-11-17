-- ========================================================================
-- Tomás — sin período mínimo, y la dirección sin catastro fuera de la vereda (JS, 17/11)
-- ========================================================================
--
-- JS: «no quiero que mencione lo del período mínimo del alquiler, nosotros cotizamos igual; lo
-- importante es saber por cuánto tiempo les va a llevar el trabajo». Y el catastro sólo importa
-- si lo que se arma va sobre la vereda (bandeja, fachada): en eventos e interiores Tomás insistía
-- con «no figura como puerta oficial».
--
-- Cambia SÓLO dos renglones: «Período mínimo» de clientes_datos_empresa y «Dirección» de
-- clientes_guia_trabajos. Si alguien ya los editó en Parámetros, no los toca y avisa (NOTICE).

DO $mig$
DECLARE n int;
BEGIN
  UPDATE cotizacion_parametros SET texto = replace(texto,
    '- Período mínimo: hay un período mínimo de alquiler y el detalle va en el presupuesto. No digas cuál es.',
    '- Período mínimo: no lo menciones nunca, el equipo cotiza igual. Preguntá por cuánto tiempo lo necesitan (cuánto les lleva el trabajo).'),
    updated_at = now()
  WHERE clave = 'clientes_datos_empresa'
    AND position('- Período mínimo: hay un período mínimo de alquiler y el detalle va en el presupuesto. No digas cuál es.' in texto) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE NOTICE 'clientes_datos_empresa no se tocó: el renglón «Período mínimo» ya cambió. Corregirlo a mano en Parámetros.'; END IF;

  UPDATE cotizacion_parametros SET texto = replace(texto,
    '- Dirección: pedí calle y altura de la OBRA (no la de su casa u oficina) y explicá para qué: «para ver el frente y calcular el traslado». Si es esquina, preguntá por qué calle o por las dos. Si da sólo el barrio, repreguntá una vez.',
    '- Dirección: pedí calle y altura de la obra o del lugar (no la de su casa u oficina). En una bandeja o una fachada, explicá que es «para ver el frente y calcular el traslado» y, si es esquina, preguntá por qué calle o por las dos. En lo demás (eventos, interiores, alquiler), es para el traslado: no le pidas más precisión de la que dé. Si da sólo el barrio, repreguntá una vez.'),
    updated_at = now()
  WHERE clave = 'clientes_guia_trabajos'
    AND position('- Dirección: pedí calle y altura de la OBRA (no la de su casa u oficina) y explicá para qué: «para ver el frente y calcular el traslado». Si es esquina, preguntá por qué calle o por las dos. Si da sólo el barrio, repreguntá una vez.' in texto) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE NOTICE 'clientes_guia_trabajos no se tocó: el renglón «Dirección» ya cambió. Corregirlo a mano en Parámetros.'; END IF;
END $mig$;
