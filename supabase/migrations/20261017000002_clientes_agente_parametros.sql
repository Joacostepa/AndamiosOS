-- ========================================================================
-- WhatsApp de clientes, paso 5 — Sofía, el agente (los parámetros)
-- ========================================================================
--
-- EL INTERRUPTOR GENERAL: clientes_ia_activa = 0 (APAGADO). Con 0 todo sigue como la etapa 0:
-- las charlas nuevas entran «Sin tomar» y nadie contesta solo. Es también el «Pausar la IA» de
-- §7: si se vuelve a 0, lo que llegue a una charla que tenía Sofía pasa a una persona.
-- Para prenderla: 1 (Comercial → Parámetros de cotización → Agente de clientes), con el motivo.
--
-- Los demás (docs/sofia/crm-propuesta.md §10, §12 y §13):
--   · clientes_modelo (claude-opus-5-5) y clientes_esfuerzo (low): decisión 19 de JS;
--   · clientes_tope_tel_usd (1): por teléfono y por día; al llegar, la charla pasa a una persona
--     sin decirle por qué al cliente;
--   · clientes_tope_global_usd (15): por día, todas las charlas; al llegar, todo pasa a personas;
--   · clientes_horario (08:00-17:00, de lunes a viernes hábiles): sólo para decirle al cliente
--     cuándo le escribe una persona (decisión 14: la IA atiende las 24 h);
--   · clientes_telefono_guardia (vacío): decisión 21, el de JS. Sale en el texto fijo de
--     seguridad en obra; mientras esté vacío, el texto dice que llame al 911.
--
-- ORDEN: DESPUÉS de 20261017000001 (las tablas). Prender el interruptor sin esas tablas deja a
-- Sofía sin dónde guardar la charla.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT. ON CONFLICT DO NOTHING: re-correrla
-- nunca pisa un valor ya editado.

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, texto, vigente_desde, orden) VALUES
  ('clientes_ia_activa', 'agente_clientes', 'Sofía — interruptor general',
   '1: Sofía atiende el WhatsApp de clientes (las charlas nuevas entran con ella). 0: apagada, como la etapa 0; lo que llegue a una charla que tenía Sofía pasa a una persona («Pausar la IA»).',
   'numero', '0 = apagada · 1 = prendida', 0, NULL, '2026-10-17', 1),
  ('clientes_modelo', 'agente_clientes', 'Sofía — modelo',
   'El modelo de Claude de Sofía. Decisión 19 de JS: Opus 5.5. Antes de cambiarlo, correr scripts/test-agente-clientes.mts con el modelo nuevo.',
   'texto', NULL, NULL, 'claude-opus-5-5', '2026-10-17', 2),
  ('clientes_esfuerzo', 'agente_clientes', 'Sofía — esfuerzo',
   'low, medium, high, xhigh o max. Decisión 19 de JS: low. Más esfuerzo: más lento y más caro.',
   'texto', NULL, NULL, 'low', '2026-10-17', 3),
  ('clientes_tope_tel_usd', 'agente_clientes', 'Sofía — tope por teléfono y por día',
   'Gasto máximo de Claude por teléfono y por día. Al llegar, la charla pasa a una persona sin decirle por qué al cliente.',
   'numero', 'US$', 1, NULL, '2026-10-17', 4),
  ('clientes_tope_global_usd', 'agente_clientes', 'Sofía — tope global por día',
   'Gasto máximo de Claude por día, sumando todas las charlas. Al llegar, todo pasa a personas. Es también un freno ante abuso.',
   'numero', 'US$', 15, NULL, '2026-10-17', 5),
  ('clientes_horario', 'agente_clientes', 'Sofía — horario de las personas',
   'De lunes a viernes hábiles (sin feriados), «08:00-17:00». Sofía atiende las 24 h: el horario sólo le dice cuándo sigue una persona.',
   'texto', NULL, NULL, '08:00-17:00', '2026-10-17', 6),
  ('clientes_telefono_guardia', 'agente_clientes', 'Sofía — teléfono de guardia',
   'El que sale en el texto fijo de seguridad en obra (decisión 21: el de JS). Vacío: el texto dice que llame al 911.',
   'texto', NULL, NULL, '', '2026-10-17', 7)
  ON CONFLICT (clave) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM cotizacion_parametros_cambios WHERE clave = 'clientes_ia_activa') THEN
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('clientes_ia_activa', NULL, jsonb_build_object('valor', 0, 'vigente_desde', '2026-10-17'),
     'Paso 5 del CRM: Sofía queda construida y apagada hasta que JS la prenda.', NULL),
    ('clientes_modelo', NULL, jsonb_build_object('texto', 'claude-opus-5-5', 'vigente_desde', '2026-10-17'),
     'JS (15/10, decisión 19): Opus 5.5 con esfuerzo bajo.', NULL),
    ('clientes_tope_tel_usd', NULL, jsonb_build_object('valor', 1, 'vigente_desde', '2026-10-17'),
     'Propuesta del CRM (§10): US$ 1 por teléfono por día.', NULL),
    ('clientes_tope_global_usd', NULL, jsonb_build_object('valor', 15, 'vigente_desde', '2026-10-17'),
     'Propuesta del CRM (§10): US$ 15 por día en total.', NULL);
  END IF;

  -- La descripción del grupo en la pantalla la pone el código (parametros-cotizacion/tipos.ts).

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
