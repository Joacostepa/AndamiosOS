-- ============================================================
-- AndamiosOS — Comodines marcados a mano (plan_comodines)
--
-- Contrato: docs/tablero-planificacion/guardias-contrato.md §2 (reescrito el 18/10, decidido
-- por JS). Va DESPUÉS de 20261018100001_guardias.sql, que crea plan_puede_editar().
--
-- 1. QUÉ CAMBIA. Hasta hoy un comodín se CALCULABA (src/lib/tablero/comodines.ts): desarme, una
--    jornada o menos, sin urgencia alta, con el "a partir de" cumplido, vencido a los 7 días
--    hábiles. JS lo vio en producción el 18/10 y decidió que no: que una obra pueda ir
--    "cuando haya lugar" depende de cosas que no están en Odoo (lo que Comercial habló con el
--    cliente, si el edificio deja entrar cualquier día, si el material ya volvió) y lo sabe
--    quien planifica, obra por obra. Desde ahora un comodín es una MARCA que pone o saca
--    Planificación, y esta tabla es esa marca: una fila por OT marcada.
--
-- 2. POR QUÉ EN SUPABASE Y NO EN ODOO. Es una decisión de la oficina sobre cómo usar el
--    tablero, no un dato de la obra: no le sirve a Comercial ni al cliente, y un campo nuevo en
--    Odoo es un viaje más por cada escritura y una lectura más del tablero entero. Igual que
--    plan_jornadas_ot (la duración que corrigió Operaciones): se cuelga del id de la OT.
--
-- 3. QUÉ GUARDA. La OT, quién la marcó y cuándo. `marcado_el` ordena el grupo "Comodines" de
--    la bandeja y la propuesta de relleno de las 13 h (el marcado hace más tiempo, primero).
--    NADA DE FECHAS DE LA OBRA: el comodín "puede ir ya" y no vence; es comodín hasta que
--    alguien lo quite (DELETE). Una OT que se completa no se borra de acá: el tablero deja de
--    mostrarla (comodines.ts mira el estado y el avance) y la fila no molesta.
--
-- 4. QUIÉN ESCRIBE. La ruta /api/planificacion/comodines, con la SESIÓN de quien marca (como
--    plan_jornadas_ot): POST marca, DELETE quita. Lo pide el mapa APIS (planificación en
--    "editar") y lo repite la RLS de abajo: INSERT y DELETE sólo con plan_puede_editar(), y el
--    INSERT además firmado por quien lo hace (marcado_por = auth.uid(), como el autor de
--    plan_movimientos). Sin UPDATE: una marca se pone o se saca, no se edita; volver a marcar
--    una OT ya marcada no le cambia el `marcado_el` (la ruta lo trata como "ya estaba").
--    LEER: cualquier autenticado, como el resto de las tablas plan_*. El candado de las
--    guardias (src/lib/planificacion/candado-guardias.ts) y la corrida de las 13 h la leen con
--    la service role, que no pasa por RLS.
--
-- RIESGO: bajo. Tabla nueva, nadie la usa hasta que se despliegue la versión que la lee. Si
-- se despliega el código ANTES de aplicar esto, el tablero no muestra comodines (la lectura
-- falla y la pantalla sigue sin ellos), marcar contesta 500 y el candado trata a toda obra
-- como no comodín (pide autorización a JS): falla cerrado. Volver atrás: DROP TABLE
-- plan_comodines (se pierden las marcas).
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  npx supabase db query --linked -f <este archivo>   (NUNCA supabase db push)
-- Idempotente y sin BEGIN/COMMIT propios (el probador la envuelve en su ROLLBACK).
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_comodines (
  -- El id de la OT en Odoo (x_orden_trabajo). Una marca por OT: marcar dos veces es la misma.
  ot_id BIGINT PRIMARY KEY,
  -- Quién la marcó. DEFAULT auth.uid(): con la sesión no hace falta mandarlo, y la política
  -- de INSERT exige que sea quien escribe. SET NULL si alguna vez se borra el usuario: la
  -- marca sigue valiendo, sólo se pierde el nombre.
  marcado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  marcado_el TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plan_comodines IS
  'Comodines del tablero: OTs que Planificación marcó porque pueden ir cualquier día (guardias-contrato.md §2, 18/10). Sin fecha ni vencimiento: comodín hasta que alguien lo quite.';

-- El orden de la bandeja y del relleno: el marcado hace más tiempo, primero.
CREATE INDEX IF NOT EXISTS idx_plan_comodines_marcado_el ON plan_comodines(marcado_el);

ALTER TABLE plan_comodines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leen comodines" ON plan_comodines;
CREATE POLICY "Autenticados leen comodines" ON plan_comodines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Planificacion marca comodines" ON plan_comodines;
CREATE POLICY "Planificacion marca comodines" ON plan_comodines
  FOR INSERT TO authenticated WITH CHECK (plan_puede_editar() AND marcado_por = auth.uid());

DROP POLICY IF EXISTS "Planificacion quita comodines" ON plan_comodines;
CREATE POLICY "Planificacion quita comodines" ON plan_comodines
  FOR DELETE TO authenticated USING (plan_puede_editar());

-- Sin UPDATE a propósito (ver el encabezado, punto 4): se saca también el privilegio, no sólo
-- la política, así un UPDATE con la sesión falla en vez de "no tocar nada" en silencio. anon
-- no lee ni escribe nada (los privilegios por defecto de Supabase se los darían).
REVOKE ALL ON plan_comodines FROM anon;
REVOKE UPDATE, TRUNCATE ON plan_comodines FROM authenticated;
GRANT SELECT, INSERT, DELETE ON plan_comodines TO authenticated;
GRANT ALL ON plan_comodines TO service_role;
