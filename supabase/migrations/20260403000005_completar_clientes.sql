-- Completar datos de clientes existentes con info de ejemplo

UPDATE clientes SET
  cuit = '20-30456789-1',
  domicilio_fiscal = 'Av. Corrientes 1234, CABA',
  telefono = COALESCE(telefono, '11-4567-8901'),
  email = COALESCE(email, 'alfredo@email.com'),
  condicion_iva = 'Responsable Inscripto'
WHERE razon_social ILIKE '%alfredo%' AND (cuit IS NULL OR cuit = '');

UPDATE clientes SET
  cuit = '30-71208637-4',
  domicilio_fiscal = 'Av. Del Libertador 7423, CABA',
  telefono = COALESCE(telefono, '11-5555-1234'),
  email = COALESCE(email, 'contacto@bricklane.com.ar'),
  condicion_iva = 'Responsable Inscripto'
WHERE razon_social ILIKE '%bricklane%' AND (cuit IS NULL OR cuit = '');

UPDATE clientes SET
  cuit = '27-28345678-9',
  domicilio_fiscal = 'Calle Falsa 123, Palermo, CABA',
  telefono = COALESCE(telefono, '11-6789-0123'),
  email = COALESCE(email, 'roberto@email.com'),
  condicion_iva = 'Monotributista'
WHERE razon_social ILIKE '%roberto%' AND (cuit IS NULL OR cuit = '');

UPDATE clientes SET
  cuit = '23-35678901-4',
  domicilio_fiscal = 'Av. Rivadavia 5678, Caballito, CABA',
  telefono = COALESCE(telefono, '11-2345-6789'),
  email = COALESCE(email, 'gonzalo@email.com'),
  condicion_iva = 'Responsable Inscripto'
WHERE razon_social ILIKE '%gonzalo%' AND (cuit IS NULL OR cuit = '');

UPDATE clientes SET
  cuit = '20-40123456-7',
  domicilio_fiscal = 'San Martín 890, Vicente López, GBA',
  telefono = COALESCE(telefono, '11-8901-2345'),
  email = COALESCE(email, 'matias@email.com'),
  condicion_iva = 'Responsable Inscripto'
WHERE razon_social ILIKE '%matias%' AND (cuit IS NULL OR cuit = '');

UPDATE clientes SET
  cuit = '27-33456789-2',
  domicilio_fiscal = 'Av. Santa Fe 4321, Recoleta, CABA',
  telefono = COALESCE(telefono, '11-3456-7890'),
  email = COALESCE(email, 'cacho@email.com'),
  condicion_iva = 'Consumidor Final'
WHERE razon_social ILIKE '%cacho%' AND (cuit IS NULL OR cuit = '');

-- Para cualquier cliente que aún no tenga datos completos
UPDATE clientes SET
  domicilio_fiscal = COALESCE(domicilio_fiscal, 'Buenos Aires, Argentina'),
  condicion_iva = COALESCE(condicion_iva, 'Consumidor Final')
WHERE domicilio_fiscal IS NULL OR condicion_iva IS NULL;
