-- ============================================================
-- AndamiosOS — Hoja del día: el Depósito como sector (rediseño, fase F2)
--
-- docs/equipos-del-dia/rediseno-plan.md, "Depósito como sector". El Pizarrón tiene una
-- columna "Depósito" siempre presente, con la misma mecánica que una cuadrilla: se le
-- arrastra gente, tiene encargado (★, el "a cargo" de siempre), "no viene", encuentro y su
-- hoja le llega al encargado (Telegram o el link) como a un capataz.
--
-- CÓMO SE GUARDA: el depósito de cada día es UNA HOJA MÁS (`hd_hojas`) con
-- `sector = 'deposito'` y `cuadrilla_odoo_id = 0`, un número que en Odoo no existe
-- (x_aba_cuadrilla empieza en 1). Así no cambia nada de lo que ya cuelga de una hoja: su
-- gente (`hd_integrantes`: "una persona, una cuadrilla por día" sigue valiendo, ahora
-- también contra el depósito), el a cargo, el encuentro, los links, el historial y el
-- Deshacer (`hd_aplicar` lee las columnas al vuelo). El UNIQUE (fecha, cuadrilla_odoo_id)
-- ya da un depósito por día.
--
-- EL 0 NO SALE DE ACÁ: el código lo cerca (no va al parte de Odoo, ni a las alertas del
-- tablero, ni a la asistencia). El CHECK de abajo hace que el 0 sea SÓLO el depósito.
--
-- De paso, para F5 (repaso de la mañana): `hd_links.recibida_canal`, por dónde confirmó
-- alguien que recibió su hoja (el botón del link, Telegram, o "ya confirmó por teléfono"
-- cargado a mano). NULL = como hasta ahora.
--
-- Se aplica a mano con `npx supabase db query --linked -f` (NUNCA db push), ANTES del
-- deploy del código que la usa. Idempotente: se puede correr dos veces. Sin BEGIN/COMMIT
-- propios (la prueba la envuelve en BEGIN … ROLLBACK). El código viejo sigue andando con
-- la migración aplicada (columnas nuevas con valor por defecto).
-- ============================================================

-- ========================
-- El sector de la hoja
-- ========================
ALTER TABLE hd_hojas ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'cuadrilla';

DO $sector$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hd_hojas'::regclass AND conname = 'hd_hojas_sector_valido') THEN
    ALTER TABLE hd_hojas ADD CONSTRAINT hd_hojas_sector_valido CHECK (sector IN ('cuadrilla', 'deposito'));
  END IF;
  -- El 0 es el depósito y el depósito es el 0: ninguna cuadrilla de Odoo puede quedar con
  -- sector 'deposito', ni el depósito con un número de Odoo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hd_hojas'::regclass AND conname = 'hd_hojas_deposito_es_cero') THEN
    ALTER TABLE hd_hojas ADD CONSTRAINT hd_hojas_deposito_es_cero CHECK ((sector = 'deposito') = (cuadrilla_odoo_id = 0));
  END IF;
END
$sector$;

-- ========================
-- Por dónde confirmó (F5)
-- ========================
ALTER TABLE hd_links ADD COLUMN IF NOT EXISTS recibida_canal TEXT;

DO $canal$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'hd_links'::regclass AND conname = 'hd_links_recibida_canal_valido') THEN
    ALTER TABLE hd_links ADD CONSTRAINT hd_links_recibida_canal_valido
      CHECK (recibida_canal IS NULL OR recibida_canal IN ('link', 'telegram', 'telefono'));
  END IF;
END
$canal$;

NOTIFY pgrst, 'reload schema';
