-- ============================================================
-- Importación de productos desde Odoo + lista de precios hogareño
-- ============================================================

-- Agregar categorías faltantes
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'modulo';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'tablon';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'caño';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'rueda';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'tornillo';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'viga';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'vertical';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'horizontal';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'puntal';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'valla';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'tribuna';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'consumible';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'herramienta';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'epp';
ALTER TYPE categoria_pieza ADD VALUE IF NOT EXISTS 'indumentaria';

-- ============================================================
-- CATALOGO DE PIEZAS (todos los productos para stock)
-- ============================================================

-- BASTIDORES / MARCOS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('BAST-BAR-090x100', 'BASTIDOR BARANDA - 0,90m x 1.00h', 'marco', 'tubular', 'unidad'),
('BAST-BAR-130x100', 'BASTIDOR BARANDA - 1,30m x 1.00h', 'marco', 'tubular', 'unidad'),
('BAST-AND-130x180', 'BASTIDOR DE ANDAMIO - 1,30m x 1.80h', 'marco', 'tubular', 'unidad'),
('BAST-PAS-090x180', 'BASTIDOR DE ANDAMIO PASILLO - 0,90m x 1.80h', 'marco', 'tubular', 'unidad'),
('BAST-PEA-130x250', 'BASTIDOR PASO PEATONAL - 1,30m x 2.50h', 'marco', 'tubular', 'unidad'),
('BAST-PEA-090x250', 'BASTIDOR PASO PEATONAL PASILLO - 0,90m x 2.50h', 'marco', 'tubular', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- MÓDULOS (productos de alquiler hogareño)
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('MOD-AND-STD-130x250x180', 'MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80', 'modulo', 'tubular', 'unidad'),
('MOD-AND-JR-130x150x180', 'MODULO DE ANDAMIO JUNIOR 1,30 X 1,50 X 1,80', 'modulo', 'tubular', 'unidad'),
('MOD-AND-PAS-090x250x180', 'MODULO DE ANDAMIO PASILLO 0,90 X 2,50 X 1,80', 'modulo', 'tubular', 'unidad'),
('MOD-AND-PAS-JR-090x150x180', 'MODULO DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,80', 'modulo', 'tubular', 'unidad'),
('MOD-BAR-STD-130x250x180', 'MODULO BARANDA DE ANDAMIO STD 1,30 X 2,50 X 1,80', 'modulo', 'tubular', 'unidad'),
('MOD-BAR-PAS-090x250x100', 'MODULO BARANDA DE ANDAMIO PASILLO 0,90 X 2,50 X 1,00', 'modulo', 'tubular', 'unidad'),
('MOD-BAR-PAS-JR-090x150x100', 'MODULO BARANDA DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,00', 'modulo', 'tubular', 'unidad'),
('MOD-PEA-STD-130x250x250', 'MODULO DE ANDAMIO PASO PEATONAL STD 1,30 X 2,50 X 2,50', 'modulo', 'tubular', 'unidad'),
('MOD-PEA-PAS-090x250x250', 'MODULO DE ANDAMIO PASO PEATONAL PASILLO 0,90 X 2,50 X 2,50', 'modulo', 'tubular', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- TABLONES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('TAB-MET-073', 'TABLON METALICO 0.73m', 'tablon', 'tubular', 'unidad'),
('TAB-MET-109', 'TABLON METALICO 1.09m', 'tablon', 'tubular', 'unidad'),
('TAB-MET-125', 'TABLON METALICO 1.25m', 'tablon', 'tubular', 'unidad'),
('TAB-MET-150', 'TABLON METALICO 1.50m', 'tablon', 'tubular', 'unidad'),
('TAB-MET-150-020', 'TABLON METALICO 1.50m 0.20', 'tablon', 'tubular', 'unidad'),
('TAB-MET-200', 'TABLON METALICO 2.00m', 'tablon', 'tubular', 'unidad'),
('TAB-MET-250', 'TABLON METALICO 2.50m', 'tablon', 'tubular', 'unidad'),
('TAB-MET-250-020', 'TABLON METALICO 2.50m 0.20', 'tablon', 'tubular', 'unidad'),
('TAB-ESC-250', 'TABLON ESCOTILLA 2.50m', 'tablon', 'tubular', 'unidad'),
('TAB-TRIB-030x250', 'TABLERO TRIBUNA 0.30 x 2.50', 'tablon', 'tubular', 'unidad'),
('TAB-TRIB-060x250', 'TABLERO TRIBUNA 0.60 x 2.50', 'tablon', 'tubular', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- CAÑOS (0.10m a 6.40m)
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida)
SELECT
  'CAÑO-' || LPAD((n * 10)::TEXT, 3, '0'),
  'CAÑO - ' || REPLACE(TO_CHAR(n * 0.10, '0.00'), ' ', '') || 'm',
  'caño',
  'tubular',
  'unidad'
FROM generate_series(1, 64) AS n
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('CAÑO-EST-50x20x2', 'CAÑO ESTRUCTURAL 50X20X2 MM S D. (TUBO)', 'caño', 'tubular', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- DIAGONALES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('DIAG-150x250', 'DIAGONAL 1.50 X 2.50m (P/ROJA)', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-200x073', 'DIAGONAL 2.00 X 0.73m (P/NEGRA)', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-200x109', 'DIAGONAL 2.00 X 1.09m (P/AZUL)', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-200x125', 'DIAGONAL 2.00 X 1.25m (P/VERDE)', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-200x150', 'DIAGONAL 2.00 X 1.50m (P/AMARILLA)', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-200x200', 'DIAGONAL 2.00 X 2.00m', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-200x250', 'DIAGONAL 2.00 X 2.50m', 'diagonal', 'multidireccional', 'unidad'),
('DIAG-PL-250x250', 'DIAGONAL PLANTA 2.50 x 2.50m', 'diagonal', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- HORIZONTALES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('HOR-048-073', 'HORIZONTAL Ø48.3 x 0.73m', 'horizontal', 'multidireccional', 'unidad'),
('HOR-048-109', 'HORIZONTAL Ø48.3 x 1.09m', 'horizontal', 'multidireccional', 'unidad'),
('HOR-048-125', 'HORIZONTAL Ø48.3 x 1.25m', 'horizontal', 'multidireccional', 'unidad'),
('HOR-048-150', 'HORIZONTAL Ø48.3 x 1.50m', 'horizontal', 'multidireccional', 'unidad'),
('HOR-048-200', 'HORIZONTAL Ø48.3 x 2.00m', 'horizontal', 'multidireccional', 'unidad'),
('HOR-048-250', 'HORIZONTAL Ø48.3 x 2.50m', 'horizontal', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- VERTICALES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('VERT-050-CE', 'VERTICAL 0.50m CON ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-050-SE', 'VERTICAL 0.50m SIN ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-100-CE', 'VERTICAL 1.00m CON ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-100-SE', 'VERTICAL 1.00m SIN ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-150-CE', 'VERTICAL 1.50m CON ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-150-SE', 'VERTICAL 1.50m SIN ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-200-CE', 'VERTICAL 2.00m CON ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-200-SE', 'VERTICAL 2.00m SIN ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-300-CE', 'VERTICAL 3.00m CON ESPIGA', 'vertical', 'multidireccional', 'unidad'),
('VERT-300-SE', 'VERTICAL 3.00m SIN ESPIGA', 'vertical', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- VIGAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('VIGA-CEL-073', 'VIGA CELOSIA 0.73m', 'viga', 'multidireccional', 'unidad'),
('VIGA-CEL-109', 'VIGA CELOSIA 1.09m', 'viga', 'multidireccional', 'unidad'),
('VIGA-CEL-250', 'VIGA CELOSIA 2.50m', 'viga', 'multidireccional', 'unidad'),
('VIGA-PTE-150', 'VIGA PUENTE Ø1.50m', 'viga', 'multidireccional', 'unidad'),
('VIGA-PTE-250', 'VIGA PUENTE Ø2.50m', 'viga', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- RODAPIES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('RDPE-073', 'RODAPIE 0,73m', 'rodapie', 'multidireccional', 'unidad'),
('RDPE-090', 'RODAPIE 0,90m', 'rodapie', 'multidireccional', 'unidad'),
('RDPE-109', 'RODAPIE 1,09m', 'rodapie', 'multidireccional', 'unidad'),
('RDPE-125', 'RODAPIE 1,25m', 'rodapie', 'multidireccional', 'unidad'),
('RDPE-130', 'RODAPIE 1,30m', 'rodapie', 'multidireccional', 'unidad'),
('RDPE-250', 'RODAPIE 2,50m', 'rodapie', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- ESCALERAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('ESC-INT-BAST', 'ESCALERA INTERNA (PARA BASTIDOR)', 'escalera', 'tubular', 'unidad'),
('ESC-INT-MULTI', 'ESCALERA INTERNA (PARA MULTIDIRECCIONAL)', 'escalera', 'multidireccional', 'unidad'),
('ESC-MAR-200', 'ESCALERA MARINERA 2m', 'escalera', 'otro', 'unidad'),
('ESC-ALU-EXT-980', 'ESCALERA DE ALUMINIO EXTENSIBLE (9,80m)', 'escalera', 'otro', 'unidad'),
('ESC-ALU-DH-370-580', 'ESCALERA DE ALUMINIO DOBLE HOJA EXTENSIBLE (3,70m - 5,80m)', 'escalera', 'otro', 'unidad'),
('BAR-ESC-BAST', 'BARANDA DE ESCALERA INTERNA (PARA BASTIDOR)', 'barandilla', 'tubular', 'unidad'),
('BAR-ESC-MULTI', 'BARANDA DE ESCALERA INTERNA (PARA MULTIDIRECCIONAL)', 'barandilla', 'multidireccional', 'unidad'),
('ZANCA-ESC-150x250', 'ZANCA (LIMON) ESCALERA DESCANSO 150X250', 'escalera', 'tubular', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- CONECTORES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('NUDO-FIJO', 'NUDO FIJO', 'conector', 'tubular', 'unidad'),
('NUDO-GIR', 'NUDO GIRATORIO', 'conector', 'tubular', 'unidad'),
('COLL-CORTO', 'COLLARIN CORTO (0.33m)', 'conector', 'tubular', 'unidad'),
('COLL-LARGO', 'COLLARIN LARGO (0.48m)', 'conector', 'tubular', 'unidad'),
('PUÑO-DOBLE', 'PUÑO DOBLE MULTIDIRECCIONAL', 'conector', 'multidireccional', 'unidad'),
('PUÑO-GALV', 'PUÑO GALVANIZADO SIN CHAVETA', 'conector', 'multidireccional', 'unidad'),
('PUÑO-NUDO', 'Puño con nudo Q235 HDG', 'conector', 'multidireccional', 'unidad'),
('PUÑO-NUDO-GIR', 'Puño con nudo giratorio Q235 HDG', 'conector', 'multidireccional', 'unidad'),
('CHAVETA-Q355', 'Chaveta Q355 galvanizado en caliente', 'conector', 'multidireccional', 'unidad'),
('GRAPA-ROSETA', 'Grapa roseta (Roseta móvil Coronet)', 'conector', 'multidireccional', 'unidad'),
('ESPIGA-EXP', 'ESPIGA EXPANSIBLE', 'conector', 'multidireccional', 'unidad'),
('ESPIGA-GRAPA', 'Espiga con media grapa Q235 HDG', 'conector', 'multidireccional', 'unidad'),
('ESFERA-SEG', 'ESFERA DE SEGURIDAD', 'conector', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- BASES / TORNILLOS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('TORN-300-FIJA', 'TORNILLON DE 300mm POR UNIDAD (BASE FIJA)', 'tornillo', 'tubular', 'unidad'),
('TORN-600-FIJA', 'TORNILLON DE 600mm POR UNIDAD (BASE FIJA)', 'tornillo', 'tubular', 'unidad'),
('TORN-600-MOVIL', 'TORNILLON DE 600mm POR UNIDAD (BASE MOVIL)', 'tornillo', 'tubular', 'unidad'),
('MAD-BASE-10x10', 'MADERA BASE 10X10cm', 'base', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- RUEDAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('RUEDA-STD', 'RUEDA DE ANDAMIO STANDARD', 'rueda', 'tubular', 'unidad'),
('RUEDA-STD-FRENO', 'RUEDA DE ANDAMIO STANDARD CON FRENO', 'rueda', 'tubular', 'unidad'),
('RUEDA-INT-ROJA', 'RUEDA INTERMEDIA (ROJA) POR UNIDAD', 'rueda', 'tubular', 'unidad'),
('RUEDA-GRAN', 'RUEDA DE GRAN PORTE POR UNIDAD', 'rueda', 'tubular', 'unidad'),
('JUEGO-RUEDAS-STD', 'JUEGO DE RUEDAS DE ANDAMIO STANDARD (4 U)', 'rueda', 'tubular', 'juego'),
('ADAPT-RUEDA-12', 'Adaptador Ajustable para Rueda 12", Q235 HDG', 'rueda', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- RIENDAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('RIEND-250-H', 'RIENDA ANDAMIO 2.50m - HORIZONTAL', 'anclaje', 'tubular', 'unidad'),
('RIEND-250-D', 'RIENDA ANDAMIO 2.50m (2.77m) - DIAGONAL', 'anclaje', 'tubular', 'unidad'),
('RIEND-150-H', 'RIENDA ANDAMIO JR 1.50m - HORIZONTAL', 'anclaje', 'tubular', 'unidad'),
('RIEND-150-D', 'RIENDA ANDAMIO JR 1.50m (1.65m) - DIAGONAL', 'anclaje', 'tubular', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- MÉNSULAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('MENSULA-045', 'Ménsula 48.3x3.2mm 1 x 320mm W Tablón - 0.45M Q235 HDG', 'accesorio', 'multidireccional', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- PUNTALES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('PUNT-TEL-210-350', 'PUNTAL TELESCÓPICO (2,10m a 3,50m)', 'puntal', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- PLACA FENÓLICO
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('PLACA-FEN-122x244', 'Placa Fenólico 1,22 x 2,44m', 'plataforma', 'otro', 'unidad'),
('FEN-PINO-122x244x18', 'Fenólico pino Rivadavia D Scrap 122x244x18', 'plataforma', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- VALLAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('VALLA-FREE', 'VALLA FREESTANDING', 'valla', 'otro', 'unidad'),
('VALLA-FREE-ALQ', 'VALLA FREESTANDING - ALQUILER POR UNIDAD', 'valla', 'otro', 'unidad'),
('VALLA-STD-3M', 'VALLA STANDARD X 3M - ALQUILER POR UNIDAD', 'valla', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- TRIBUNAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('BAR-TRIB-LAT-250x150', 'BARANDA TRIBUNA LATERAL REJA 2.50 X 1.50 Mts', 'tribuna', 'tubular', 'unidad'),
('BAR-TRIB-TRAS-INF-250', 'BARANDA TRIBUNA TRASERA 2.50 Mts INFERIOR', 'tribuna', 'tubular', 'unidad'),
('BAR-TRIB-TRAS-SUP-250', 'BARANDA TRIBUNA TRASERA 2.50 Mts SUPERIOR', 'tribuna', 'tubular', 'unidad'),
('LIMON-TRIB', 'Limon Tribuna (para Butacas Plasticas)', 'tribuna', 'tubular', 'unidad'),
('BUTACA-M4', 'Butaca m4 (Sin Respaldo)', 'tribuna', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- EPP
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('ARNES-SIN-COLA', 'ARNES DE SEGURIDAD SIN COLA', 'epp', 'otro', 'unidad'),
('COLA-AMARRE', 'COLA DE AMARRE DE ARNES CON DOBLE MOSQUETON', 'epp', 'otro', 'unidad'),
('GUANTES-DESCARNE', 'PAR DE GUANTES DE CUERO DE DESCARNE', 'epp', 'otro', 'par'),
('GUANTES-SOLDADOR', 'PAR DE GUANTES SOLDADOR', 'epp', 'otro', 'par'),
('MASCARA-SOLDADOR', 'MÁSCARA DE SOLDADOR', 'epp', 'otro', 'unidad'),
('PROT-AUDITIVO', 'PROTECTOR AUDITIVO', 'epp', 'otro', 'unidad'),
('MASCARILLA-PINTOR', 'MASCARILLA DESCARTABLE PINTOR', 'epp', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- HERRAMIENTAS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('APAREJO-2T', 'APAREJO CADENA MANUAL 2 TON', 'herramienta', 'otro', 'unidad'),
('CORTADORA-SENS', 'CORTADORA SENSITIVA DUCA 300W', 'herramienta', 'otro', 'unidad'),
('MAQ-PINTURA', 'MAQUINA PINTURA ADIABATIC MEGAJET MONOFÁSICA', 'herramienta', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- CONSUMIBLES
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('ALAMB-COBR-12x18', 'ALAMBRE COBREADO CONARCO 1,2mm x 18kg', 'consumible', 'otro', 'kg'),
('ALAMB-CONC-45x10', 'ALAMBRE CONCERTINA DOBLE 45mm x 10m', 'consumible', 'otro', 'rollo'),
('ALAMB-RECOCIDO-16', 'ALAMBRE RECOCIDO DEL 16', 'consumible', 'otro', 'kg'),
('CLAVOS-PP-25', 'CLAVOS PUNTA PARIS 2,5"', 'consumible', 'otro', 'kg'),
('DISCO-CORTE-114', 'DISCO DE CORTE 114x1,6x22,2', 'consumible', 'otro', 'unidad'),
('DISCO-FLAP-45', 'DISCO FLAP 4,5"', 'consumible', 'otro', 'unidad'),
('DISCO-SENS-350', 'Disco Sensitiva Secur 350x3.0x25x4', 'consumible', 'otro', 'unidad'),
('MEDIA-SOMBRA-5', 'MEDIA SOMBRA N°5 NEGRO (4m x 50m)', 'consumible', 'otro', 'rollo'),
('METAL-DESPL-250', 'METAL DESPLEGADO 250.30.12 1.5X3 MTS', 'consumible', 'otro', 'unidad'),
('HIERRO-PLANCH', 'HIERRO PLANCHUELA 1 1/2" X 3/16"', 'consumible', 'otro', 'barra'),
('PRECINTOS-FL4250', 'PRECINTOS FL 4250', 'consumible', 'otro', 'bolsa'),
('TIRANTE-3x3-300', 'TIRANTE MADERA 3 X 3" - 3,00m', 'consumible', 'otro', 'unidad'),
('TUBO-CO2', 'TUBO CO2 (RETORNABLE)', 'consumible', 'otro', 'unidad'),
('RECARGA-CO2', 'RECARGA TUBO CO2', 'consumible', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- ACCESORIOS VARIOS
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, unidad_medida) VALUES
('RACK-106', 'Rack 1.06x1.06Mx1.1M pintado', 'accesorio', 'otro', 'unidad'),
('RACK-REJ-106', 'Rack con rejilla 1.06x1.06Mx1.1M Pintado', 'accesorio', 'otro', 'unidad'),
('MIN-OPERATIVO', 'MÍNIMO OPERATIVO Andamios Bs. As.', 'accesorio', 'otro', 'unidad'),
('CAJAS-OPERARIOS', 'CAJAS OPERARIOS', 'accesorio', 'otro', 'unidad')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- LISTA DE PRECIOS HOGAREÑO (fracción 10/20/30 días)
-- ============================================================

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
