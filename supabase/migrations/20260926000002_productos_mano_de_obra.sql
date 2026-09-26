-- ========================================================================
-- Productos de mano de obra para la cotización desagregada (modelo D)
-- ========================================================================
--
-- La tabla de la skill no tenía producto para la mano de obra: en el modelo D (industria,
-- etapas, licitaciones) la MO va como línea propia. Verificado en Odoo el 26/09 sobre las
-- órdenes desde marzo: "Mano de Obra" (199) está en 96 líneas de mano de obra, 69 de
-- jornadas y 87 de desarme; los extras van con "ADICIONAL VARIOS - SERVICIOS EXTRA - MANO
-- DE OBRA" (178). Los viáticos van con Servicio de Traslado (218), que ya estaba.
--
-- Los dos tienen "Puede venderse" apagado en Odoo: es un filtro del buscador, no una regla,
-- y por API se usan igual (así se cargaron esas órdenes).
--
-- La mano de obra es de única vez: se cobra el armado y el desarme una sola vez, y por eso
-- queda fuera de la base de la renovación (regla de corte del criterio, §1).

DO $mig$ BEGIN
  INSERT INTO cotizacion_productos_odoo (clave, product_id, nombre, unidad, is_rental, unica_vez, uso) VALUES
  ('mano_obra', 199, 'Mano de Obra', 'unidad', false, true, 'Jornadas de armado y desarme (modelo D)'),
  ('adicional_mano_obra', 178, 'ADICIONAL VARIOS - SERVICIOS EXTRA - MANO DE OBRA', 'unidad', false, true, 'Servicios extra y jornadas adicionales')
  ON CONFLICT (clave) DO NOTHING;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
