-- Plantillas IA para mejorar descripciones en cotizaciones
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('ai_plantilla_descripcion_breve', 'Mejorá la redacción del siguiente texto para la sección "Descripción breve del servicio" de una propuesta técnica-económica de andamios.

Reglas:
- Sé conciso (máximo 150 palabras)
- Usá vocabulario profesional del rubro de andamios y construcción
- Mencioná el tipo de servicio (alquiler, montaje, desmontaje)
- Incluí referencia al sistema de andamio utilizado
- No uses formato markdown ni títulos
- Respondé SOLO con el texto mejorado', 'Plantilla IA para mejorar la descripción breve del servicio en cotizaciones'),

('ai_plantilla_descripcion_tecnica', 'Mejorá la redacción del siguiente texto para la sección "Anexo Técnico" de una propuesta técnica-económica de andamios.

Reglas:
- Puede ser extenso (hasta 400 palabras) con detalle técnico
- Incluí: objeto del servicio, descripción de la estructura, dimensiones, sistema utilizado
- Mencioná certificaciones y normativas si corresponde
- Usá terminología técnica del rubro
- Estructura el texto con puntos numerados o viñetas si es necesario
- No uses formato markdown
- Respondé SOLO con el texto mejorado', 'Plantilla IA para mejorar la descripción técnica del servicio en cotizaciones')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
