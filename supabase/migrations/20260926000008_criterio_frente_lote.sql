-- ========================================================================
-- Criterio v3: el frente del lote se verifica contra el catastro (no en Dateas)
-- ========================================================================
--
-- Joaquín (26/09): en bandejas y estructuras "siempre hay que verificar los metros de fachada
-- del lote". Desde 29d73c2 el asistente lo hace con verificar_frente_lote (catastro público de
-- la Ciudad, la misma fuente AGIP que muestra Dateas) y sin eso no deja guardar.
--
-- criterio v3 = el v2 con los puntos 3 y 4 de "Geometría" cambiados: dónde se verifica el
-- frente, qué hacer si los metros no cierran, y que la esquina se anota como decisión. Si las
-- líneas del v2 no están tal cual, NO crea la v3 (falla la migración).
--
-- Las conversaciones abiertas siguen con el criterio con el que arrancaron; el v3 vale para
-- las nuevas (la herramienta y el bloqueo ya rigen para todas).
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$
DECLARE
  v2 TEXT;
  v3 TEXT;
  viejo3 CONSTANT TEXT := $v$3. Frente en m.l. y altura real. En CABA se verifica el frente contra la parcela (Dateas); fuera
   de CABA lo tiene que dar el cliente.$v$;
  viejo4 CONSTANT TEXT := $v$4. Si es esquina: ¿los dos frentes o uno solo? (Sarmiento 1894 pasó de 39,31 a 14,25 m.l.;
   Esmeralda 570 se cotizó solo sobre una calle.)$v$;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cotizacion_criterios WHERE version = 3) THEN
    SELECT contenido INTO v2 FROM cotizacion_criterios WHERE version = 2;
    IF v2 IS NULL THEN RAISE EXCEPTION 'No está el criterio v2'; END IF;
    IF position(viejo3 in v2) = 0 THEN RAISE EXCEPTION 'El criterio v2 no tiene el punto 3 de Geometría esperado: no se crea la v3'; END IF;
    IF position(viejo4 in v2) = 0 THEN RAISE EXCEPTION 'El criterio v2 no tiene el punto 4 de Geometría esperado: no se crea la v3'; END IF;
    v3 := replace(replace(v2,
      viejo3,
      $v$3. 🔒 Frente en m.l. y altura real. En CABA el frente se verifica SIEMPRE contra el catastro
   de la Ciudad (verificar_frente_lote): sin eso no se guarda. Si la altura no es una puerta
   oficial, preguntar cuál de las parcelas vecinas es. Si los m.l. no cierran con el frente,
   preguntar por qué (¿toma lotes vecinos?, ¿cubre sólo un tramo?). Fuera de CABA el frente lo
   tiene que dar el cliente.$v$),
      viejo4,
      $v$4. Si es esquina (el catastro lo marca y mide cada cara): ¿los dos frentes o uno solo? Se
   anota en la decisión «esquina». (Sarmiento 1894 pasó de 39,31 a 14,25 m.l.; Esmeralda 570
   se cotizó solo sobre una calle.)$v$);
    UPDATE cotizacion_criterios SET vigente = false WHERE vigente;
    INSERT INTO cotizacion_criterios (version, contenido, notas, vigente, autor_id) VALUES
    (3, v3, 'Joaquín (26/09): el frente del lote se verifica siempre contra el catastro de la Ciudad (verificar_frente_lote), no en Dateas; la esquina se anota como decisión.', true, NULL);
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('criterio', jsonb_build_object('version', 2), jsonb_build_object('version', 3),
     'Frente del lote: se verifica contra el catastro de la Ciudad con verificar_frente_lote (Joaquín, 26/09).', NULL);
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
