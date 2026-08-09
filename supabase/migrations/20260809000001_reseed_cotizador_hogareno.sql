-- ============================================================
-- Re-seed de datos del cotizador hogareño público (/cotizador)
--
-- CONTEXTO: wipe_seed_data.sql truncó lista_precios y fletes_zona
-- cuando Odoo pasó a ser fuente de verdad del dominio comercial.
-- El cotizador hogareño NO va por Odoo (es alquiler directo a
-- consumidor final), así que sus precios viven acá.
--
-- Idempotente: borra el bloque hogareño antes de reinsertar.
-- Origen: 20260331000010 (precios) y 20260331000012 (fletes).
-- ============================================================

DELETE FROM lista_precios WHERE unidad_cotizacion = 'hogareno';


-- Módulos de andamio: $13.000 / $16.000 / $18.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'MOD-AND-STD-130x250x180', 'Módulo de Andamio STD 1,30 X 2,50 X 1,80', 10, 13000),
('hogareno', 'MOD-AND-STD-130x250x180', 'Módulo de Andamio STD 1,30 X 2,50 X 1,80', 20, 16000),
('hogareno', 'MOD-AND-STD-130x250x180', 'Módulo de Andamio STD 1,30 X 2,50 X 1,80', 30, 18000),
('hogareno', 'MOD-AND-JR-130x150x180', 'Módulo de Andamio Junior 1,30 X 1,50 X 1,80', 10, 13000),
('hogareno', 'MOD-AND-JR-130x150x180', 'Módulo de Andamio Junior 1,30 X 1,50 X 1,80', 20, 16000),
('hogareno', 'MOD-AND-JR-130x150x180', 'Módulo de Andamio Junior 1,30 X 1,50 X 1,80', 30, 18000),
('hogareno', 'MOD-AND-PAS-090x250x180', 'Módulo de Andamio Pasillo 0,90 X 2,50 X 1,80', 10, 13000),
('hogareno', 'MOD-AND-PAS-090x250x180', 'Módulo de Andamio Pasillo 0,90 X 2,50 X 1,80', 20, 16000),
('hogareno', 'MOD-AND-PAS-090x250x180', 'Módulo de Andamio Pasillo 0,90 X 2,50 X 1,80', 30, 18000),
('hogareno', 'MOD-AND-PAS-JR-090x150x180', 'Módulo de Andamio Pasillo Junior 0,90 X 1,50 X 1,80', 10, 13000),
('hogareno', 'MOD-AND-PAS-JR-090x150x180', 'Módulo de Andamio Pasillo Junior 0,90 X 1,50 X 1,80', 20, 16000),
('hogareno', 'MOD-AND-PAS-JR-090x150x180', 'Módulo de Andamio Pasillo Junior 0,90 X 1,50 X 1,80', 30, 18000);

-- Módulos baranda: $13.000 / $16.000 / $18.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'MOD-BAR-STD-130x250x180', 'Módulo Baranda STD 1,30 X 2,50 X 1,80', 10, 13000),
('hogareno', 'MOD-BAR-STD-130x250x180', 'Módulo Baranda STD 1,30 X 2,50 X 1,80', 20, 16000),
('hogareno', 'MOD-BAR-STD-130x250x180', 'Módulo Baranda STD 1,30 X 2,50 X 1,80', 30, 18000),
('hogareno', 'MOD-BAR-PAS-090x250x100', 'Módulo Baranda Pasillo 0,90 X 2,50 X 1,00', 10, 13000),
('hogareno', 'MOD-BAR-PAS-090x250x100', 'Módulo Baranda Pasillo 0,90 X 2,50 X 1,00', 20, 16000),
('hogareno', 'MOD-BAR-PAS-090x250x100', 'Módulo Baranda Pasillo 0,90 X 2,50 X 1,00', 30, 18000),
('hogareno', 'MOD-BAR-PAS-JR-090x150x100', 'Módulo Baranda Pasillo Junior 0,90 X 1,50 X 1,00', 10, 13000),
('hogareno', 'MOD-BAR-PAS-JR-090x150x100', 'Módulo Baranda Pasillo Junior 0,90 X 1,50 X 1,00', 20, 16000),
('hogareno', 'MOD-BAR-PAS-JR-090x150x100', 'Módulo Baranda Pasillo Junior 0,90 X 1,50 X 1,00', 30, 18000);

-- Módulos paso peatonal: $13.000 / $16.000 / $18.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'MOD-PEA-STD-130x250x250', 'Módulo Paso Peatonal STD 1,30 X 2,50 X 2,50', 10, 13000),
('hogareno', 'MOD-PEA-STD-130x250x250', 'Módulo Paso Peatonal STD 1,30 X 2,50 X 2,50', 20, 16000),
('hogareno', 'MOD-PEA-STD-130x250x250', 'Módulo Paso Peatonal STD 1,30 X 2,50 X 2,50', 30, 18000),
('hogareno', 'MOD-PEA-PAS-090x250x250', 'Módulo Paso Peatonal Pasillo 0,90 X 2,50 X 2,50', 10, 13000),
('hogareno', 'MOD-PEA-PAS-090x250x250', 'Módulo Paso Peatonal Pasillo 0,90 X 2,50 X 2,50', 20, 16000),
('hogareno', 'MOD-PEA-PAS-090x250x250', 'Módulo Paso Peatonal Pasillo 0,90 X 2,50 X 2,50', 30, 18000);

-- Tablones con precio: $13.000 / $16.000 / $18.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'TAB-MET-150', 'Tablón Metálico 1.50m', 10, 13000),
('hogareno', 'TAB-MET-150', 'Tablón Metálico 1.50m', 20, 16000),
('hogareno', 'TAB-MET-150', 'Tablón Metálico 1.50m', 30, 18000),
('hogareno', 'TAB-MET-250', 'Tablón Metálico 2.50m', 10, 13000),
('hogareno', 'TAB-MET-250', 'Tablón Metálico 2.50m', 20, 16000),
('hogareno', 'TAB-MET-250', 'Tablón Metálico 2.50m', 30, 18000);

-- Juego de ruedas: $30.000 / $41.000 / $47.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'JUEGO-RUEDAS-STD', 'Juego de Ruedas de Andamio Standard (4 U)', 10, 30000),
('hogareno', 'JUEGO-RUEDAS-STD', 'Juego de Ruedas de Andamio Standard (4 U)', 20, 41000),
('hogareno', 'JUEGO-RUEDAS-STD', 'Juego de Ruedas de Andamio Standard (4 U)', 30, 47000);

-- Tornillos (base fija/móvil): $9.000 / $9.000 / $9.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'TORN-300-FIJA', 'Tornillón 300mm Base Fija', 10, 9000),
('hogareno', 'TORN-300-FIJA', 'Tornillón 300mm Base Fija', 20, 9000),
('hogareno', 'TORN-300-FIJA', 'Tornillón 300mm Base Fija', 30, 9000),
('hogareno', 'TORN-600-FIJA', 'Tornillón 600mm Base Fija', 10, 9000),
('hogareno', 'TORN-600-FIJA', 'Tornillón 600mm Base Fija', 20, 9000),
('hogareno', 'TORN-600-FIJA', 'Tornillón 600mm Base Fija', 30, 9000),
('hogareno', 'TORN-600-MOVIL', 'Tornillón 600mm Base Móvil', 10, 9000),
('hogareno', 'TORN-600-MOVIL', 'Tornillón 600mm Base Móvil', 20, 9000),
('hogareno', 'TORN-600-MOVIL', 'Tornillón 600mm Base Móvil', 30, 9000);

-- Escalera de aluminio doble hoja: $43.800 (solo 10 días)
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'ESC-ALU-DH-370-580', 'Escalera de Aluminio Doble Hoja Extensible (3,70m - 5,80m)', 10, 43800);

-- Puntal telescópico: $43.500 / $45.000 / $47.000
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'PUNT-TEL-210-350', 'Puntal Telescópico (2,10m a 3,50m)', 10, 43500),
('hogareno', 'PUNT-TEL-210-350', 'Puntal Telescópico (2,10m a 3,50m)', 20, 45000),
('hogareno', 'PUNT-TEL-210-350', 'Puntal Telescópico (2,10m a 3,50m)', 30, 47000);

-- Placa fenólico: $10.500 (solo 30 días)
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'PLACA-FEN-122x244', 'Placa Fenólico 1,22 x 2,44m', 30, 10500);

-- Madera base: $7.500 (30 días, los precios de 10 y 20 días estaban en $1 que parece un error en Odoo)
INSERT INTO lista_precios (unidad_cotizacion, producto, descripcion, fraccion_dias, precio) VALUES
('hogareno', 'MAD-BASE-10x10', 'Madera Base 10X10cm', 30, 7500);

INSERT INTO fletes_zona (zona, precio) VALUES
('AGRONOMIA', 91000),
('ALMAGRO', 95500),
('AVELLANEDA', 182500),
('BALVANERA', 117000),
('BANFIELD', 214500),
('BARRACAS', 136000),
('BARRIO NORTE', 136000),
('BELGRANO C', 109000),
('BELGRANO R', 103500),
('BENAVIDEZ', 412500),
('BERAZATEGUI', 461000),
('BOEDO', 123500),
('BOULOGNE', 287000),
('BURZACO', 254000),
('CABALLITO', 103500),
('CASEROS', 182500),
('CHACARITA', 91000),
('CIUDADELA', 182500),
('COGHLAN', 109000),
('COLEGIALES', 117000),
('CONSTITUCION', 136000),
('DOCK SUD', 503000),
('DON TORCUATO', 282500),
('ESCOBAR', 342000),
('EZEIZA', 556000),
('FLORES', 117000),
('FLORESTA', 117000),
('FLORIDA', 182500),
('GARIN', 360000),
('HURLINGHAM', 360000),
('INGENIERO BUDGE', 182500),
('ITUZAINGO', 360000),
('JOSE C. PAZ', 360000),
('JOSE L. SUAREZ', 277000),
('LA BOCA', 136000),
('LA LUCILA', 192500),
('LA TABLADA', 182500),
('LANUS', 288000),
('LAS CANITAS', 117000),
('LINIERS', 132000),
('LOMAS DE ZAMORA', 214500),
('LONGCHAMPS', 360000),
('MARTINEZ', 234500),
('MASCHWITZ', 360000),
('MATADEROS', 136000),
('MONSERRAT', 136000),
('MONTE CASTRO', 111000),
('MUNRO', 193000),
('NORDELTA', 317500),
('NUEVA POMPEYA', 136000),
('NUNEZ', 125500),
('OLIVOS', 188000),
('PACHECO', 342000),
('PALERMO', 117000),
('PARQUE AVELLANEDA', 136000),
('PARQUE CHACABUCO', 109000),
('PARQUE CHAS', 103500),
('PARQUE PATRICIOS', 136000),
('PATERNAL', 88000),
('PILAR', 454500),
('PUERTO MADERO', 156000),
('QUILMES', 288000),
('RAMOS MEJIA', 247000),
('RECOLETA', 156000),
('RETIRO', 156000),
('SAAVEDRA', 136000),
('SAN CRISTOBAL', 136000),
('SAN FERNANDO', 288000),
('SAN ISIDRO', 219000),
('SAN MARTIN', 206000),
('SAN NICOLAS', 136000),
('SAN TELMO', 143000),
('SANTOS LUGARES', 239000),
('SARANDI', 250500),
('TIGRE', 322500),
('VALENTIN ALSINA', 206000),
('VELEZ SARSFIELD', 132000),
('VERSALLES', 111000),
('VICENTE LOPEZ', 188000)
ON CONFLICT (zona) DO UPDATE SET precio = EXCLUDED.precio;
