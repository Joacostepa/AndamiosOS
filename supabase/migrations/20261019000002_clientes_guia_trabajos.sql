-- ========================================================================
-- Sofía — la guía para entender qué trabajo hace el cliente (pedido de JS, 16/10)
-- ========================================================================
--
-- Sofía decidía el tipo de andamio sin saber qué trabajo iba a hacer el cliente. Este parámetro
-- (texto, editable en Parámetros → Agente de clientes, sin deploy) va como un bloque más del
-- system de Sofía, con el encabezado «# Cómo entender el trabajo del cliente» (sistemaSofia en
-- src/lib/clientes/prompt.ts, después de los datos de ABA, con la caché de 1 h en el último
-- bloque). Lo que el cliente va a hacer lo anota en la ficha (anotar_ficha → tarea). Vacío: como
-- antes.
--
-- El texto es el que pasó JS el 16/10. Ensayar con scripts/probar-migracion.mjs y aplicar con
-- scripts/apply-migration.mjs (NUNCA supabase db push). Idempotente: ON CONFLICT DO NOTHING
-- nunca pisa un texto ya editado.

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, texto, vigente_desde, orden) VALUES
  ('clientes_guia_trabajos', 'agente_clientes', 'Sofía — guía de trabajos',
   'Cómo entiende Sofía qué trabajo va a hacer el cliente y qué le pregunta en cada caso (vereda, fachada, trabajo puntual, industria). Una línea por caso.',
   'texto', NULL, NULL,
   E'- Siempre, antes que nada, preguntá qué trabajo va a hacer y dónde (dirección, cuántos pisos o qué altura). Nunca decidas el tipo de andamio sin saber el trabajo.\n- Obra que da a la vereda en CABA (construcción, demolición, refacción de fachada): la Ciudad pide bandeja de protección peatonal. Preguntá los metros de frente y si trabajan sólo desde la vereda o también en altura.\n- Trabajo sobre la fachada en altura (pintar, revocar, impermeabilizar, reparar balcones o cornisas, cambiar ventanas, poner revestimiento): estructura de fachada, casi siempre con bandeja abajo. Preguntá la altura o los pisos, los metros de frente, el plazo y si trabajan con silleteros (en ese caso puede alcanzar con la bandeja).\n- Trabajo puntual en altura (un techo, una pared interior, un cartel, luces, un galpón): torre móvil o alquiler de material sin armado. Preguntá la altura de trabajo, si es adentro o afuera y quién lo arma. Para casas, sólo en CABA.\n- Industria, obras por etapas, formas raras o licitaciones: juntá los datos básicos y pasalo a una persona.\n- Si no entendés qué trabajo es, preguntá con palabras simples («¿qué van a hacer: pintar, arreglar algo, construir?»).',
   '2026-10-16', 9)
  ON CONFLICT (clave) DO NOTHING;

END $mig$;
