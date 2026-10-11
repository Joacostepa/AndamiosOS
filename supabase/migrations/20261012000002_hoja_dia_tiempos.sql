-- ============================================================
-- Hoja del día: tiempos de manejo de Google (Routes API), guardados
-- ============================================================
-- Un tramo (origen → destino) cuesta un "elemento" de computeRouteMatrix cada vez que se
-- pide. Lo que ya se pagó se guarda acá y vale 14 días (lo decide el servidor al leer,
-- `actualizado`): el mismo tramo, a la misma franja de media hora y en el mismo tipo de
-- día, no se vuelve a pedir. Origen y destino van redondeados a 3 decimales (~100 m): una
-- obra y "la misma obra con el pin corrido" son el mismo tramo.
--
-- La escribe SÓLO el servidor (service role, src/lib/hoja-dia/rutas-servidor.ts); la lee
-- quien tiene Hoja del día. El código tolera que la tabla no exista (sigue sin caché
-- persistente), así que se puede aplicar antes o después del deploy.
--
-- Idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS hd_tiempos (
  -- "-34.603,-58.381" (lat,lng con 3 decimales).
  origen      TEXT NOT NULL,
  destino     TEXT NOT NULL,
  -- Minutos desde las 0:00 (BA) del comienzo de la franja de 30 min: 0, 30, …, 1410.
  franja      SMALLINT NOT NULL CHECK (franja >= 0 AND franja < 1440 AND franja % 30 = 0),
  tipo_dia    TEXT NOT NULL CHECK (tipo_dia IN ('habil', 'sabado', 'domingo')),
  minutos     INTEGER NOT NULL CHECK (minutos >= 0),
  metros      INTEGER CHECK (metros >= 0),
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (origen, destino, franja, tipo_dia)
);

-- El servidor lee "lo que no venció" (actualizado de los últimos 14 días).
CREATE INDEX IF NOT EXISTS hd_tiempos_actualizado ON hd_tiempos (actualizado);

ALTER TABLE hd_tiempos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hoja del día: leer" ON hd_tiempos;
CREATE POLICY "Hoja del día: leer" ON hd_tiempos FOR SELECT TO authenticated USING ((SELECT hd_puede_ver()));
-- Sin políticas de escritura: sólo la service role (que saltea la RLS) escribe.
REVOKE INSERT, UPDATE, DELETE ON hd_tiempos FROM anon, authenticated;
REVOKE ALL ON hd_tiempos FROM anon;
