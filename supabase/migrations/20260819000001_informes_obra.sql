-- ============================================================
-- AndamiosOS — Informe de Obra (cierre)
--
-- Un informe congelado por obra cerrada. Ver docs/modulo-informe-de-obra.md.
--
-- POR QUÉ CONGELADO Y NO CALCULADO AL VUELO: el valor hora se mueve —en el histórico va
-- de $18.570 a $22.745—, así que recalcular el mismo informe dentro de un año daría otras
-- cifras. Guardarlo fija cuánto costó AL MOMENTO DE CERRAR, que es el número que sirve
-- para cotizar la próxima.
--
-- Un dueño por dato: Odoo es dueño de los partes, las OTs y los costos; Supabase es dueño
-- del informe, que es un derivado congelado. Nadie lo lee desde Odoo.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS informes_obra (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Referencia blanda a sale.order, igual que en habilitaciones: no hay FK contra un
  -- sistema que no controlamos.
  odoo_sale_order_id  BIGINT NOT NULL,
  version             INTEGER NOT NULL DEFAULT 1,
  generado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = lo generó el cron o el backfill. Sólo lleva usuario la regeneración manual.
  generado_por        UUID REFERENCES user_profiles(id),
  -- Congelado a propósito: dice qué tan confiable era el costeo cuando se generó, aunque
  -- después la obra se complete.
  estado_costeo       TEXT NOT NULL,
  -- El informe entero, ya calculado. JSONB y no columnas: la forma va a cambiar varias
  -- veces en los próximos meses y con columnas habría que migrar cientos de filas cada vez.
  datos               JSONB NOT NULL,
  inconsistencias     JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Se sella en la versión VIEJA cuando la obra vuelve a Armado: "este informe fue válido
  -- hasta acá". La fila sin sellar es siempre la vigente.
  reabierta_en        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_informes_obra_version
  ON informes_obra (odoo_sale_order_id, version);
CREATE INDEX IF NOT EXISTS idx_informes_obra_ultima
  ON informes_obra (odoo_sale_order_id, version DESC);

-- La consulta caliente: "el informe vigente de esta obra". Parcial, porque el 99% de las
-- filas van a tener reabierta_en NULL y el índice sólo tiene que cubrir esas.
CREATE INDEX IF NOT EXISTS idx_informes_obra_vigente
  ON informes_obra (odoo_sale_order_id) WHERE reabierta_en IS NULL;

-- Para los chips de la lista, que filtran por informes con inconsistencias.
CREATE INDEX IF NOT EXISTS idx_informes_obra_generado
  ON informes_obra (generado_en DESC) WHERE reabierta_en IS NULL;

-- ========================
-- RLS
--
-- SELECT para autenticados; NINGUNA política de INSERT, UPDATE ni DELETE.
--
-- El informe lo escribe SÓLO el cron, con service role (que saltea RLS). Un informe
-- congelado que cualquier sesión puede insertar o editar no es evidencia de nada — es el
-- mismo criterio que hace append-only a hab_gestiones, pero acá ni siquiera hay que poder
-- agregar: la única forma de cambiar un informe es generar una versión nueva.
-- ========================
ALTER TABLE informes_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados ven informes de obra" ON informes_obra;
CREATE POLICY "Autenticados ven informes de obra"
  ON informes_obra FOR SELECT TO authenticated USING (true);

COMMIT;
