-- ============================================================
-- Hoja del día — reparación DESPUÉS del deploy de los varios vehículos por hoja
--
-- Entre la migración 20261012000001_hoja_dia_vehiculos.sql y el deploy del código nuevo, el
-- código viejo pudo crear hojas con chofer (y su lleva / busca) que no tienen filas en
-- hd_hoja_vehiculos. El código nuevo ya no las rompe (vehiculos.ts adopta el lleva como una
-- fila implícita al primer gesto), pero hasta entonces la tarjeta las muestra "sin chofer" y
-- una hoja de "todo el día" pierde su chofer. Esto les arma su fila y liga sus viajes, con
-- la MISMA sentencia que el backfill de la migración (si se cambia una, cambiar la otra):
--
-- - Sólo hojas con chofer_modo 'lleva_trae' / 'todo_el_dia' y SIN ninguna fila.
-- - La fila sale del lleva PLANEADO con camión (si lo hay) o de las columnas de la hoja.
-- - Liga sólo viajes PLANEADOS de esas filas nuevas y del mismo camión (el busca, además,
--   con el mismo chofer o sin chofer). Nunca un viaje hecho o anulado, nunca uno de una fila
--   que ya existía.
--
-- IDEMPOTENTE: se puede correr cuantas veces haga falta (la segunda no encuentra hojas sin
-- filas). Correrla con:
--   npx supabase db query --linked -f scripts/sql/hoja-dia-vehiculos-reparar.sql
-- Antes, para ver cuántas toca:
--   select count(*) from hd_hojas h where h.chofer_modo in ('lleva_trae','todo_el_dia')
--     and not exists (select 1 from hd_hoja_vehiculos x where x.hoja_id = h.id);
-- ============================================================

WITH fuente AS (
  SELECT h.id AS hoja_id, h.fecha, h.chofer_modo, h.chofer_tocado_at, h.updated_by,
         CASE WHEN ll.vehiculo_id IS NOT NULL THEN ll.vehiculo_id ELSE h.vehiculo_id END AS vehiculo_id,
         CASE WHEN ll.vehiculo_id IS NOT NULL THEN COALESCE(
                ll.chofer_id,
                CASE WHEN ll.vehiculo_id = h.vehiculo_id THEN h.chofer_id END,
                (SELECT c.chofer_id FROM hd_camiones_dia c WHERE c.fecha = h.fecha AND c.vehiculo_id = ll.vehiculo_id AND c.sin_chofer IS NOT TRUE LIMIT 1),
                (SELECT ve.chofer_habitual_id FROM vehiculos ve WHERE ve.id = ll.vehiculo_id))
              ELSE h.chofer_id END AS chofer_id
  FROM hd_hojas h
  LEFT JOIN LATERAL (
    SELECT v.vehiculo_id, v.chofer_id FROM hd_viajes v
    WHERE v.hoja_id = h.id AND v.tipo = 'lleva' AND v.estado = 'planeado' AND v.vehiculo_id IS NOT NULL
      AND h.chofer_modo = 'lleva_trae'
    ORDER BY v.orden, v.id
    LIMIT 1
  ) ll ON true
  WHERE h.chofer_modo IN ('lleva_trae', 'todo_el_dia')
    AND NOT EXISTS (SELECT 1 FROM hd_hoja_vehiculos x WHERE x.hoja_id = h.id)
),
nuevas AS (
  INSERT INTO hd_hoja_vehiculos (hoja_id, fecha, vehiculo_id, chofer_id, modo, orden, tocado_at, created_by, updated_by)
  SELECT hoja_id, fecha, vehiculo_id, chofer_id, chofer_modo, 0, chofer_tocado_at, updated_by, updated_by FROM fuente
  RETURNING id, hoja_id, vehiculo_id, chofer_id, modo
),
-- Los "lleva" y "mueve" planeados de esas hojas en el camión de la fila.
ligados AS (
  UPDATE hd_viajes v SET hoja_vehiculo_id = n.id
  FROM nuevas n
  WHERE v.hoja_id = n.hoja_id
    AND n.modo = 'lleva_trae'
    AND v.hoja_vehiculo_id IS NULL
    AND v.estado = 'planeado'
    AND v.tipo IN ('lleva', 'mueve')
    AND v.vehiculo_id IS NOT DISTINCT FROM n.vehiculo_id
  RETURNING v.id
)
-- El "busca" sigue al vehículo sólo si lo hace el mismo camión con el mismo chofer; si se
-- había pasado a otro camión (o quedó sin camión), queda suelto: "otro camión" / "a definir".
UPDATE hd_viajes v SET hoja_vehiculo_id = n.id
FROM nuevas n
WHERE v.hoja_id = n.hoja_id
  AND n.modo = 'lleva_trae'
  AND v.hoja_vehiculo_id IS NULL
  AND v.estado = 'planeado'
  AND v.tipo = 'busca'
  AND v.vehiculo_id IS NOT NULL
  AND v.vehiculo_id = n.vehiculo_id
  AND (v.chofer_id IS NULL OR v.chofer_id IS NOT DISTINCT FROM n.chofer_id);
