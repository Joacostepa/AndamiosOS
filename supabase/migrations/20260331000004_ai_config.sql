-- ============================================================
-- AndamiosOS - Configuracion de IA
-- ============================================================

CREATE TABLE configuracion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES user_profiles(id)
);

CREATE TRIGGER trg_configuracion_updated_at BEFORE UPDATE ON configuracion FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver configuracion" ON configuracion FOR SELECT TO authenticated USING (true);
CREATE POLICY "Solo admin puede editar configuracion" ON configuracion FOR ALL TO authenticated USING (get_user_role() = 'admin');

-- Insertar configuracion inicial de IA
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('ai_prompt_cotizacion', 'Somos Andamios Buenos Aires, empresa lider en alquiler de andamios en CABA y GBA.

PRECIOS DE REFERENCIA:
- Alquiler andamio multidireccional: $3.500-5.000 por m2/mes
- Alquiler andamio tubular: $2.500-3.500 por m2/mes
- Montaje multidireccional: $2.000-3.500 por m2
- Montaje tubular: $1.500-2.500 por m2
- Desarme: 70% del valor de montaje
- Transporte CABA: $150.000-250.000 por viaje
- Transporte GBA: $200.000-350.000 por viaje
- Permiso municipal GCBA: $80.000-150.000
- Ingenieria/proyecto: $100.000-200.000

POLITICAS COMERCIALES:
- Plazo minimo de alquiler: 1 mes
- El alquiler se factura mensualmente por adelantado
- Montaje y desarme se facturan al momento de la ejecucion
- Validez de cotizacion: 30 dias
- Forma de pago habitual: 50% anticipo, 50% contra entrega

NOTAS IMPORTANTES:
- Siempre incluir montaje y desarme salvo que el cliente diga lo contrario
- Siempre incluir transporte
- Para obras en CABA de mas de 4 pisos, sugerir permiso municipal
- El cliente es responsable de la custodia del material
- Todos los precios son sin IVA', 'Instrucciones personalizadas para el asistente de cotizaciones IA'),

('ai_prompt_estilo', 'Habla en español rioplatense, informal pero profesional. Se conciso y directo. Cuando el vendedor te saluda, responde brevemente y pregunta que necesita cotizar. No te extiendas en explicaciones innecesarias.', 'Estilo de comunicacion del asistente IA');
