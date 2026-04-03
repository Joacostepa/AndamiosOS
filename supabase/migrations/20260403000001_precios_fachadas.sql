-- Precios base para cotización de fachadas
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('precio_m2_fachada', '50000', 'Precio base por m² para andamio completo de fachada'),
('precio_ml_bandeja', '110000', 'Precio base por metro lineal para bandeja de protección peatonal'),
('precio_gestoria_permiso', '250000', 'Precio fijo de gestoría de permiso municipal'),
('precio_ingenieria', '1250000', 'Precio fijo de ingeniería (memoria de cálculo, planos, firma profesional)'),
('precio_syh_jornada', '250000', 'Precio por jornada de Seguridad e Higiene'),
('multiplicadores_comerciales', '{
  "busca_profesionalismo": 1.15,
  "busca_precio": 0.90,
  "busca_velocidad": 1.10,
  "busca_seguridad": 1.10,
  "hay_competencia": 0.92,
  "listo_contratar": 1.05,
  "licitacion": 1.00,
  "cotizando": 1.00,
  "urgencia_alta": 1.20
}', 'Multiplicadores comerciales para ajuste de precio base en fachadas (JSON)')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- Condiciones comerciales configurables
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('condicion_pago_default', '50% anticipo al momento de la aceptación, 50% a la finalización del montaje', 'Condición de pago por defecto para cotizaciones'),
('validez_oferta_dias', '15', 'Validez de la oferta en días por defecto')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
