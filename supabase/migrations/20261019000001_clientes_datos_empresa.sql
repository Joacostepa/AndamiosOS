-- ========================================================================
-- Sofía — los datos de ABA que puede contestar sola (pedido de JS, 16/10)
-- ========================================================================
--
-- Un cliente preguntó «¿Tienen oficinas al público?» y Sofía lo pasó al equipo: no tenía los
-- datos de la empresa. Este parámetro (texto, editable en Parámetros → Agente de clientes, sin
-- deploy) va como un bloque más del system de Sofía (sistemaSofia en src/lib/clientes/prompt.ts).
-- Lo que esté acá lo contesta sola; lo que no, lo consulta al equipo. Vacío: como antes.
--
-- El texto es el que pasó JS el 16/10. Ensayar con scripts/probar-migracion.mjs y aplicar con
-- scripts/apply-migration.mjs (NUNCA supabase db push). Idempotente: ON CONFLICT DO NOTHING
-- nunca pisa un texto ya editado.

DO $mig$ BEGIN

  INSERT INTO cotizacion_parametros (clave, grupo, etiqueta, descripcion, tipo, unidad, valor, texto, vigente_desde, orden) VALUES
  ('clientes_datos_empresa', 'agente_clientes', 'Sofía — datos de ABA',
   'Lo que Sofía puede contestar sola sobre la empresa: oficina, horarios, pagos, zona, permisos, seguros, facturación. Una línea por dato. Lo que no esté acá, Sofía lo consulta al equipo.',
   'texto', NULL, NULL,
   E'- Oficina: Maturín 2570, Ciudad de Buenos Aires. Abierta de lunes a viernes de 9 a 16, con cita previa: para ir hay que coordinarlo antes con alguien del equipo (ofrecé coordinarlo).\n- Formas de pago: transferencia bancaria o efectivo.\n- Zona de trabajo: las obras grandes, en todo el país. Los alquileres simples para casas (sin armado), sólo en la Ciudad de Buenos Aires.\n- Trayectoria: 30 años en el rubro.\n- Permisos: sí, gestionamos los permisos municipales. No prometas plazos: dependen del municipio.\n- Seguros: sí, trabajamos con seguro.\n- Facturación: hacemos factura A.',
   '2026-10-16', 8)
  ON CONFLICT (clave) DO NOTHING;

END $mig$;
