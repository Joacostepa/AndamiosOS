-- ========================================================================
-- WhatsApp de clientes — el agente pasa a llamarse Tomás y saluda con una nota de voz (17/10)
-- ========================================================================
--
-- JS eligió el 17/10 una voz de hombre para el saludo con audio y pidió que el agente se llame
-- Tomás en todos lados (docs/sofia/handoff.md, punto 14):
--   · clientes_saludo_voz (1, PRENDIDO para las pruebas internas): el saludo sale primero como
--     nota de voz («Jorge, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?») y
--     después el texto. Con 0, sólo el texto. Necesita ELEVENLABS_VOZ_API_KEY en Vercel;
--   · las etiquetas y descripciones de Parámetros que decían «Sofía» pasan a «Tomás», con el
--     género corregido («apagado», «con él», «solo»). Los textos que lee el agente
--     (clientes_datos_empresa, clientes_guia_trabajos) no la nombraban: no se tocan.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Idempotente, sin BEGIN/COMMIT: el INSERT no pisa un valor editado y
-- los reemplazos no hacen nada si ya no dice «Sofía».

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, texto, vigente_desde, orden) VALUES
  ('clientes_saludo_voz', 'agente_clientes', 'Tomás — saludo con voz',
   '1: el saludo de una charla nueva sale primero como nota de voz («Jorge, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?») y después el texto. 0: sólo el texto. Si el audio falla, sale sólo el texto. Cada audio se genera una vez por nombre y momento del día (US$ 0,01 aprox.).',
   'numero', '0 = apagado · 1 = prendido', 1, NULL, '2026-10-17', 10)
  ON CONFLICT (clave) DO NOTHING;

  UPDATE cotizacion_parametros SET
    etiqueta = replace(etiqueta, 'Sofía', 'Tomás'),
    descripcion = replace(replace(replace(replace(replace(descripcion,
      'entran con ella', 'entran con él'),
      '0: apagada,', '0: apagado,'),
      'puede contestar sola', 'puede contestar solo'),
      'de Sofía', 'de Tomás'),
      'Sofía', 'Tomás'),
    unidad = CASE WHEN unidad = '0 = apagada · 1 = prendida' THEN '0 = apagado · 1 = prendido' ELSE unidad END
  WHERE grupo = 'agente_clientes' AND (etiqueta LIKE '%Sofía%' OR descripcion LIKE '%Sofía%' OR unidad = '0 = apagada · 1 = prendida');

END $mig$;
