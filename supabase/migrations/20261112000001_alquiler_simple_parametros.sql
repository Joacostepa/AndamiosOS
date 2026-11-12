-- ========================================================================
-- Agente de clientes de WhatsApp: los parámetros del alquiler simple que cotiza Tomás
-- ========================================================================
--
-- docs/sofia/alquiler-simple-propuesta.md §5 y §10, cerrada con JS el 12/11 (tabla de la §11).
-- Los lee parametrosAlquilerDesdeFilas (src/lib/clientes/alquiler-simple.ts):
--   · alquiler_simple_precio_pieza (18.000): módulo, módulo baranda o tablón (estándar, angosto
--     o junior), por pieza y por 30 días. Siempre se cotiza el servicio de 30 días (fila 7);
--   · alquiler_simple_ruedas (36.000) y alquiler_simple_tornillones (36.000): el juego de 4
--     (fila 4). Uno por torre: tornillones si el piso es desparejo;
--   · alquiler_simple_minimo (500.000): el mínimo operativo, neto y con el flete adentro. Si no
--     llega, la orden lleva la línea «MÍNIMO OPERATIVO» por la diferencia;
--   · alquiler_simple_max_modulos (10): el tope para que salga solo, sumando todas las torres y
--     sin contar las barandas (fila 9). Más, va a un vendedor;
--   · alquiler_simple_recargo_franja (20 %): la franja de una hora, sobre el total del servicio
--     ya con el mínimo (fila 15: en el ejemplo de Palermo, $ 100.000 + IVA).
--
-- Lo que NO está acá: el flete (el método de envío del barrio en Odoo, tanda del 31/3/2026) y las
-- medidas del andamio y los márgenes de altura (MEDIDAS en alquiler-simple.ts: son la ficha
-- técnica y la seguridad, no precios).
--
-- REGLA DE LOS DOS PASOS (docs/asistente-comercial/handoff.md § Reglas): esta migración SÓLO
-- AGREGA las claves. El código que las lee (parametrosAlquilerDesdeFilas) corta si falta una, así
-- que se aplica ANTES de subir el código que la llama. Hoy nada en producción la llama: aplicarla
-- no cambia nada de lo que anda.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT: el INSERT no pisa un valor editado.

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, texto, vigente_desde, orden) VALUES
  ('alquiler_simple_precio_pieza', 'agente_clientes', 'Alquiler simple — precio por pieza (30 días)',
   'Lo que se cobra por cada módulo, módulo baranda o tablón (estándar, angosto o junior) en el alquiler simple que cotiza Tomás, por 30 días y + IVA. Siempre se cotiza el servicio de 30 días, aunque lo use menos. Al cliente se le pasa un solo total (con el flete), nunca el precio por pieza. JS, 12/11.',
   'monto', '$ por pieza, 30 días', 18000, NULL, '2026-11-12', 50),
  ('alquiler_simple_ruedas', 'agente_clientes', 'Alquiler simple — juego de ruedas',
   'El juego de 4 ruedas con freno, por 30 días y + IVA ($ 9.000 cada una). Va uno por torre cuando el piso es liso. JS, 12/11 (fila 4).',
   'monto', '$ el juego de 4, 30 días', 36000, NULL, '2026-11-12', 51),
  ('alquiler_simple_tornillones', 'agente_clientes', 'Alquiler simple — juego de tornillones',
   'El juego de 4 tornillones (bases regulables), por 30 días y + IVA ($ 9.000 cada uno). Van en lugar de las ruedas cuando el piso es desparejo. JS, 12/11 (fila 4).',
   'monto', '$ el juego de 4, 30 días', 36000, NULL, '2026-11-12', 52),
  ('alquiler_simple_minimo', 'agente_clientes', 'Alquiler simple — mínimo operativo',
   'El mínimo del alquiler simple, neto (+ IVA) y con el flete adentro. Si el material más el flete no llega, la orden lleva la línea «MÍNIMO OPERATIVO» por la diferencia, y Tomás le ofrece al cliente lo que le entra sin pagar más (otra torre, un módulo más de alto).',
   'monto', '$ neto, con el flete', 500000, NULL, '2026-11-12', 53),
  ('alquiler_simple_max_modulos', 'agente_clientes', 'Alquiler simple — tope de módulos',
   'Hasta cuántos módulos, sumando todas las torres y sin contar las barandas, el alquiler simple lo cotiza Tomás (con aprobación). Con más, va a un vendedor. JS, 12/11 (fila 9).',
   'numero', 'módulos', 10, NULL, '2026-11-12', 54),
  ('alquiler_simple_recargo_franja', 'agente_clientes', 'Alquiler simple — recargo por franja de una hora',
   'Si el cliente necesita la entrega en un horario particular, se pacta una franja de una hora con este recargo por costos operativos, sobre el total del servicio (con el flete y el mínimo). Tomás sólo dice que hay un recargo: el porcentaje y el monto van en el presupuesto que sale al aprobar. JS, 12/11 (fila 15).',
   'porcentaje', '%', 20, NULL, '2026-11-12', 55)
  ON CONFLICT (clave) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'alquiler_simple_precio_pieza') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('alquiler_simple_precio_pieza', NULL, jsonb_build_object('valor', 18000, 'vigente_desde', '2026-11-12'),
     'JS (12/11): alquiler simple de Tomás, $ 18.000 por pieza por 30 días (alquiler-simple-propuesta.md §5).', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'alquiler_simple_ruedas') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('alquiler_simple_ruedas', NULL, jsonb_build_object('valor', 36000, 'vigente_desde', '2026-11-12'),
     'JS (12/11, fila 4): $ 36.000 el juego de 4 ruedas.', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'alquiler_simple_tornillones') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('alquiler_simple_tornillones', NULL, jsonb_build_object('valor', 36000, 'vigente_desde', '2026-11-12'),
     'JS (12/11, fila 4): $ 36.000 el juego de 4 tornillones.', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'alquiler_simple_minimo') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('alquiler_simple_minimo', NULL, jsonb_build_object('valor', 500000, 'vigente_desde', '2026-11-12'),
     'JS (12/11): mínimo operativo de $ 500.000 netos con el flete adentro (alquiler-simple-propuesta.md §5).', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'alquiler_simple_max_modulos') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('alquiler_simple_max_modulos', NULL, jsonb_build_object('valor', 10, 'vigente_desde', '2026-11-12'),
     'JS (12/11, fila 9): hasta 10 módulos sale solo (con aprobación).', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'alquiler_simple_recargo_franja') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('alquiler_simple_recargo_franja', NULL, jsonb_build_object('valor', 20, 'vigente_desde', '2026-11-12'),
     'JS (12/11, filas 13 y 15): la franja de una hora tiene un recargo del 20 % sobre el total del servicio.', NULL);
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
