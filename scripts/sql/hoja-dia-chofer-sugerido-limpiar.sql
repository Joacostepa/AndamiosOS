-- ============================================================
-- Hoja del día — soltar el chofer que se congeló con una sugerencia
--
-- Hasta el 11/10 los viajes que nacían de un sugerido aceptado, de "Poner en un camión", de
-- poner un pedido o de "Nuevo viaje" guardaban el chofer en hd_viajes.chofer_id con el que
-- se SUGERÍA en ese momento (casi siempre el habitual del camión). Después, si el dueño
-- ponía otro chofer en el renglón de la hoja, el viaje seguía con el de antes: el domingo
-- 11/10 la Cuadrilla 1 decía "Nuñez: lleva C1 Ing. Huergo termina ~8:45 y lleva Ing. Huergo
-- es a las 8:00" con Conte en el renglón del AB 799 CA.
--
-- Desde la rama fix/hoja-dia-chofer-de-pedidos, chofer_id NULL = "el que maneje ese camión
-- a esa hora" (choferDe en src/lib/hoja-dia/estado.ts: el renglón de la hoja con ese camión
-- ese día, si no el viaje anterior/siguiente de la fila con chofer elegido, si no
-- hd_camiones_dia, si no el habitual). Esto suelta el chofer de los viajes que lo tienen
-- igual al habitual del vehículo, que es lo que se guardaba sin que nadie lo eligiera:
--
-- - Sólo viajes PLANEADOS, de HOY (Buenos Aires) en adelante.
-- - Sueltos: sin renglón de hoja (hoja_vehiculo_id NULL) y sin hoja (hoja_id NULL). Los
--   lleva / busca / mueve de las hojas no se tocan (su chofer es el del renglón o el que se
--   eligió para el busca).
-- - Con camión y chofer = el chofer habitual de ese vehículo.
-- Un viaje en el que alguien eligió a mano justo al habitual también se suelta: queda con
-- el que maneje el camión (casi siempre el mismo); si no, se vuelve a elegir con "Cambiar
-- chofer".
--
-- NO pasa por el historial de la Hoja del día (no tiene Deshacer desde la pantalla): mirar
-- antes qué toca con el SELECT de abajo.
--
-- IDEMPOTENTE: la segunda vez no encuentra nada. Correrlo DESPUÉS del deploy de la rama
-- (el código viejo resolvía el NULL con el habitual, que es lo mismo que había):
--   npx supabase db query --linked -f scripts/sql/hoja-dia-chofer-sugerido-limpiar.sql
--
-- Antes, para ver qué toca:
--   select v.id, v.fecha, v.tipo, ve.patente, p.apellido as chofer, v.hora, v.carga
--   from hd_viajes v
--   join vehiculos ve on ve.id = v.vehiculo_id
--   left join personal p on p.id = v.chofer_id
--   where v.estado = 'planeado'
--     and v.fecha >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
--     and v.hoja_vehiculo_id is null and v.hoja_id is null
--     and v.chofer_id is not null
--     and v.chofer_id = ve.chofer_habitual_id
--   order by v.fecha, ve.patente, v.orden;
-- ============================================================

UPDATE hd_viajes v
SET chofer_id = NULL
FROM vehiculos ve
WHERE ve.id = v.vehiculo_id
  AND v.estado = 'planeado'
  AND v.fecha >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  AND v.hoja_vehiculo_id IS NULL
  AND v.hoja_id IS NULL
  AND v.chofer_id IS NOT NULL
  AND v.chofer_id = ve.chofer_habitual_id
RETURNING v.id, v.fecha, v.tipo, ve.patente, v.hora;
