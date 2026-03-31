-- Mínimo operativo para cotizaciones hogareñas
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('minimo_hogareno', '400000', 'Mínimo operativo para cotizaciones de alquiler hogareño. Cualquier cotización por debajo de este monto se ajusta a este valor.')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
