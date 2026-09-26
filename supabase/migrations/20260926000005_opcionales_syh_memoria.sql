-- ========================================================================
-- Opcionales estándar: técnico de SyH por jornada y memoria de cálculo
-- ========================================================================
--
-- Joaquín (26/09): en toda bandeja y fachada van como opcionales el técnico de Seguridad e
-- Higiene, a $250.000 la jornada, y la memoria de cálculo de ingeniería, a $1.250.000 + IVA
-- (junto con la concertina al 10 % del metro de bandeja, que ya estaba).
--
-- Hasta ahora la S&H era un rango global (1,2 a 5,5 M "según jornadas") y la ingeniería un
-- rango (1,25 a 3,5 M) sin valor por defecto: el asistente tenía que preguntar "¿cuánto?" y
-- no los ofrecía solo.
--
-- ESTA MIGRACIÓN SÓLO AGREGA y no rompe el código que ya está en producción (que no lee estas
-- claves). El criterio nuevo y el retiro del rango viejo de S&H van en
-- 20260926000006_criterio_opcionales.sql, que se aplica DESPUÉS de subir el código que usa
-- estas dos claves (el código viejo todavía lee `syh` como rango).
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, vigente_desde, orden) VALUES
  ('ingenieria_memoria', 'complementarios', 'Ingeniería — memoria de cálculo',
   'Memoria de cálculo, planos y firma profesional estándar. Opcional de toda bandeja y fachada; pasados los 6 m de altura es obligatoria (Decreto 911/96) y va en la base. Línea propia, única vez.',
   'monto', '$', 1250000, '2026-09-26', 35),
  ('syh_jornada', 'complementarios', 'Técnico de Seguridad e Higiene',
   'Técnico de SyH presente en obra, por jornada de armado y de desarme (una jornada corta cuenta entera). Opcional de toda bandeja y fachada; en la base si el cliente lo pide. Línea propia, única vez.',
   'monto', '$ por jornada', 250000, '2026-09-26', 55)
  ON CONFLICT (clave) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'ingenieria_memoria') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('ingenieria_memoria', NULL, jsonb_build_object('valor', 1250000, 'vigente_desde', '2026-09-26'),
     'Joaquín (26/09): la memoria de cálculo sale $1.250.000 + IVA y va como opcional en toda bandeja y fachada.', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'syh_jornada') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('syh_jornada', NULL, jsonb_build_object('valor', 250000, 'vigente_desde', '2026-09-26'),
     'Joaquín (26/09): el técnico de SyH vale $250.000 la jornada y va como opcional en toda bandeja y fachada.', NULL);
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
