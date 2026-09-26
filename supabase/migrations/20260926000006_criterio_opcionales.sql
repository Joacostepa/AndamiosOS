-- ========================================================================
-- Criterio v2 con los opcionales estándar, y retiro del rango viejo de S&H
-- ========================================================================
--
-- SE APLICA DESPUÉS de subir el código que lee `syh_jornada` e `ingenieria_memoria`
-- (20260926000005): el código anterior todavía lee `syh` como rango y se rompería sin él.
--
-- Lo que hace:
--   · criterio v2 = el v1 con cuatro líneas cambiadas (tabla de complementarios §3.3, §4.8 y
--     el punto 11 del checklist): técnico de SyH por jornada y memoria de cálculo como
--     opcionales estándar, y la memoria obligatoria pasados los 6 m. Si alguna de las líneas
--     del v1 no está tal cual, NO crea la v2 (falla la migración).
--   · `ingenieria` pasa a llamarse "Ingeniería — obras complejas" (el rango sigue igual).
--   · se borra `syh` (el rango global de 1,2 a 5,5 M): lo reemplaza `syh_jornada`.
--
-- Las conversaciones abiertas siguen con el criterio con el que arrancaron; el v2 vale para
-- las nuevas.
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$
DECLARE
  v1 TEXT;
  v2 TEXT;
  syh_viejo JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cotizacion_criterios WHERE version = 2) THEN
    SELECT contenido INTO v1 FROM cotizacion_criterios WHERE version = 1;
    IF v1 IS NULL THEN RAISE EXCEPTION 'No está el criterio v1'; END IF;
    IF position($v$| Ingeniería | [Parámetro: Ingeniería (habitual)]; piso [Parámetro: Ingeniería — torre simple] | Línea propia, única vez. Torre del Reloj llegó a $6.500.000 (valor de la época) |$v$ in v1) = 0 THEN RAISE EXCEPTION 'El criterio v1 no tiene la línea 222 esperada: no se crea la v2'; END IF;
    IF position($v$| Seguridad e Higiene | [Parámetro: Seguridad e Higiene] | Según jornadas. En obras chicas va en Aclaraciones, no como línea |$v$ in v1) = 0 THEN RAISE EXCEPTION 'El criterio v1 no tiene la línea 223 esperada: no se crea la v2'; END IF;
    IF position($v$🔒 **Gestoría y concertina van como opcionales**, fuera de la base. Excepción: en licitación$v$ in v1) = 0 THEN RAISE EXCEPTION 'El criterio v1 no tiene la línea 324 esperada: no se crea la v2'; END IF;
    IF position($v$11. Opcionales: concertina, gestoría, Seguridad e Higiene.$v$ in v1) = 0 THEN RAISE EXCEPTION 'El criterio v1 no tiene la línea 363 esperada: no se crea la v2'; END IF;
    v2 := replace(replace(replace(replace(v1,
      $v$| Ingeniería | [Parámetro: Ingeniería (habitual)]; piso [Parámetro: Ingeniería — torre simple] | Línea propia, única vez. Torre del Reloj llegó a $6.500.000 (valor de la época) |$v$,
      $v$| Ingeniería — memoria de cálculo | [Parámetro: Ingeniería — memoria de cálculo] | Opcional de toda bandeja y fachada. **Pasados los 6 m de altura es obligatoria** (Decreto 911/96, §6.1) y va en la base. Obra compleja (torres altas, industria, geometría especial): [Parámetro: Ingeniería — obras complejas]; piso [Parámetro: Ingeniería — torre simple]. Torre del Reloj llegó a $6.500.000 (valor de la época) |$v$),
      $v$| Seguridad e Higiene | [Parámetro: Seguridad e Higiene] | Según jornadas. En obras chicas va en Aclaraciones, no como línea |$v$,
      $v$| Técnico de Seguridad e Higiene | [Parámetro: Técnico de Seguridad e Higiene] por jornada de armado y de desarme (una jornada corta cuenta entera) | Opcional de toda bandeja y fachada; en la base si el cliente lo pide |$v$),
      $v$🔒 **Gestoría y concertina van como opcionales**, fuera de la base. Excepción: en licitación$v$,
      $v$🔒 **Concertina, gestoría, técnico de SyH y memoria de cálculo van como opcionales**, fuera de la base (la memoria de cálculo, salvo que la estructura pase los 6 m: ahí es obligatoria y va en la base). Excepción: en licitación$v$),
      $v$11. Opcionales: concertina, gestoría, Seguridad e Higiene.$v$,
      $v$11. Opcionales: concertina (bandejas, [Parámetro: Concertina perimetral] del metro), gestoría (sólo CABA), técnico de SyH por jornada y memoria de cálculo. Salen solos en el presupuesto; se sacan si el cliente no los quiere.$v$);
    UPDATE cotizacion_criterios SET vigente = false WHERE vigente;
    INSERT INTO cotizacion_criterios (version, contenido, notas, vigente, autor_id) VALUES
    (2, v2, 'Joaquín (26/09): técnico de SyH ($250.000 por jornada) y memoria de cálculo ($1.250.000) como opcionales de toda bandeja y fachada; la memoria, obligatoria pasados los 6 m.', true, NULL);
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('criterio', jsonb_build_object('version', 1), jsonb_build_object('version', 2),
     'Opcionales estándar: técnico de SyH por jornada y memoria de cálculo (Joaquín, 26/09).', NULL);
  END IF;

  UPDATE cotizacion_parametros
     SET etiqueta = 'Ingeniería — obras complejas',
         descripcion = 'Cuando la memoria de cálculo estándar no alcanza: torres altas, industria, geometría especial. Línea propia, única vez. Llegó a $6.500.000 (Torre del Reloj).',
         updated_at = now()
   WHERE clave = 'ingenieria' AND etiqueta <> 'Ingeniería — obras complejas';

  SELECT to_jsonb(p) INTO syh_viejo FROM cotizacion_parametros p WHERE clave = 'syh';
  IF syh_viejo IS NOT NULL THEN
    DELETE FROM cotizacion_parametros WHERE clave = 'syh';
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('syh', syh_viejo, NULL, 'Reemplazado por el técnico de SyH por jornada (syh_jornada, $250.000): el rango global ya no se usa.', NULL);
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
