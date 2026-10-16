-- ========================================================================
-- Agente de clientes de WhatsApp: los parámetros de la bandeja «fácil»
-- ========================================================================
--
-- docs/sofia/crm-propuesta.md §4 y §13, con lo que decidió JS el 15/10 (§12):
--   · agente_facil_max_ml (25): el ÚNICO tope de metros de la bandeja fácil (decisión 5). Lo
--     usan esFacil y armarBorradorFacil (src/lib/clientes/facil.ts). Se sube a 30 cuando se
--     complete la racha de la etapa 2;
--   · agente_facil_jornadas (1): jornadas de armado, y otras tantas de desarme, del armado
--     fácil (decisión 6). Es una excepción escrita al criterio §4.9 («nunca se asume»), sólo
--     para este armado. Sólo mueve el opcional del técnico de SyH, no la base;
--   · agente_facil_render (vacío): el id del render genérico de bandeja en la biblioteca
--     (cotizacion_renders). Lo elige JS; mientras esté vacío, el armado lo marca como problema;
--   · agente_facil_empresas_con_persona (0): decisión 20, pendiente. Con 1, una empresa,
--     constructora u organismo (o CUIT 30/33/34) no es fácil aunque el trabajo lo sea: el bot
--     arma el borrador y lo manda una persona. Apagado hasta que JS decida.
--
-- El precio NO está acá: la bandeja de 3 m sale de bandeja_3m_ml ($140.000, decisión 1), la
-- misma tarifa del asistente comercial.
--
-- REGLA DE LOS DOS PASOS (docs/asistente-comercial/handoff.md § Reglas): esta migración SÓLO
-- AGREGA las claves. El código que las lee (parametrosFacilDesdeFilas) corta si falta una, así
-- que se aplica ANTES de subir el código que la llama. Hoy nada en producción la llama: aplicarla
-- no cambia nada de lo que anda.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT.

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, texto, vigente_desde, orden) VALUES
  ('agente_facil_max_ml', 'agente_clientes', 'Bandeja fácil — tope de metros',
   'Hasta cuántos metros lineales de frente una bandeja de 3 m en CABA es «fácil» y la cotiza el agente de WhatsApp (con aprobación). Es el único tope: lo usan la regla, el armado y la etapa 2. Decisión 5 de JS (15/10): 25 al arrancar.',
   'numero', 'm.l.', 25, NULL, '2026-10-15', 10),
  ('agente_facil_jornadas', 'agente_clientes', 'Bandeja fácil — jornadas de armado y de desarme',
   'Jornadas de armado, y otras tantas de desarme, que usa el armado fácil sin preguntarle a un técnico (excepción al criterio §4.9, sólo para la bandeja fácil). Sólo mueven el opcional del técnico de SyH. Decisión 6 de JS (15/10): 1 + 1 hasta el tope.',
   'numero', 'jornadas', 1, NULL, '2026-10-15', 20),
  ('agente_facil_render', 'agente_clientes', 'Bandeja fácil — render genérico',
   'El id del render de bandeja de la biblioteca que lleva el PDF de la bandeja fácil (excepción al criterio §5.2). Vacío: el armado avisa que falta.',
   'texto', NULL, NULL, '', '2026-10-15', 30),
  ('agente_facil_empresas_con_persona', 'agente_clientes', 'Bandeja fácil — empresas las manda una persona',
   'Decisión 20, pendiente. 1: una empresa, constructora u organismo (o CUIT 30, 33 o 34) no es fácil aunque el trabajo lo sea; el agente arma el borrador y lo manda la asistente con su nombre. 0: se tratan como cualquier fácil.',
   'numero', '0 = no · 1 = sí', 0, NULL, '2026-10-15', 40)
  ON CONFLICT (clave) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'agente_facil_max_ml') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('agente_facil_max_ml', NULL, jsonb_build_object('valor', 25, 'vigente_desde', '2026-10-15'),
     'JS (15/10, decisión 5): la bandeja fácil del agente de WhatsApp es hasta 25 m.l.', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'agente_facil_jornadas') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('agente_facil_jornadas', NULL, jsonb_build_object('valor', 1, 'vigente_desde', '2026-10-15'),
     'JS (15/10, decisión 6): hasta 25 m.l., 1 jornada de armado y 1 de desarme.', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'agente_facil_render') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('agente_facil_render', NULL, jsonb_build_object('texto', '', 'vigente_desde', '2026-10-15'),
     'Propuesta del CRM (§4): render genérico de bandeja para el PDF del agente. Falta que JS elija cuál.', NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'agente_facil_empresas_con_persona') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('agente_facil_empresas_con_persona', NULL, jsonb_build_object('valor', 0, 'vigente_desde', '2026-10-15'),
     'JS (15/10, decisión 20): empresas y clientes de rango se deciden después de ver cómo funciona. Apagado.', NULL);
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
