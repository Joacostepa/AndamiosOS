-- ============================================================
-- AndamiosOS - Seed Data (Catalogo de piezas inicial)
-- ============================================================

-- Piezas de andamio multidireccional
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, peso_kg, stock_minimo) VALUES
  ('MF-070-MD', 'Marco 0.70m multidireccional', 'marco', 'multidireccional', 8.5, 50),
  ('MF-100-MD', 'Marco 1.00m multidireccional', 'marco', 'multidireccional', 11.2, 100),
  ('MF-150-MD', 'Marco 1.50m multidireccional', 'marco', 'multidireccional', 15.8, 200),
  ('MF-200-MD', 'Marco 2.00m multidireccional', 'marco', 'multidireccional', 19.5, 150),
  ('DG-150-MD', 'Diagonal 1.50m multidireccional', 'diagonal', 'multidireccional', 4.2, 200),
  ('DG-200-MD', 'Diagonal 2.00m multidireccional', 'diagonal', 'multidireccional', 5.1, 150),
  ('DG-250-MD', 'Diagonal 2.50m multidireccional', 'diagonal', 'multidireccional', 6.3, 100),
  ('PL-073-MD', 'Plataforma 0.73m x 2.07m', 'plataforma', 'multidireccional', 14.0, 100),
  ('PL-073-30', 'Plataforma 0.73m x 3.07m', 'plataforma', 'multidireccional', 18.5, 80),
  ('BS-038-MD', 'Base regulable 0.38m', 'base', 'multidireccional', 3.8, 100),
  ('BS-060-MD', 'Base regulable 0.60m', 'base', 'multidireccional', 5.2, 80),
  ('RP-073-MD', 'Rodapie 0.73m x 2.07m', 'rodapie', 'multidireccional', 3.5, 100),
  ('RP-073-30', 'Rodapie 0.73m x 3.07m', 'rodapie', 'multidireccional', 4.8, 80),
  ('ES-200-MD', 'Escalera interna 2.00m', 'escalera', 'multidireccional', 8.0, 30),
  ('BR-100-MD', 'Barandilla 1.00m', 'barandilla', 'multidireccional', 2.8, 100),
  ('BR-150-MD', 'Barandilla 1.50m', 'barandilla', 'multidireccional', 3.5, 80),
  ('BR-200-MD', 'Barandilla 2.00m', 'barandilla', 'multidireccional', 4.2, 60),
  ('CN-GIR-MD', 'Conector giratorio', 'conector', 'multidireccional', 0.8, 50),
  ('CN-FIJ-MD', 'Conector fijo', 'conector', 'multidireccional', 0.7, 50),
  ('AN-PAR-MD', 'Anclaje a pared', 'anclaje', 'multidireccional', 1.2, 80),
  ('AN-TUB-MD', 'Anclaje tubular', 'anclaje', 'multidireccional', 1.5, 60),
  ('RD-150-MD', 'Rueda con freno 150mm', 'accesorio', 'multidireccional', 4.0, 20),
  ('MN-EXT-MD', 'Mensula de extension 0.39m', 'accesorio', 'multidireccional', 3.2, 40);

-- Piezas de andamio tubular
INSERT INTO catalogo_piezas (codigo, descripcion, categoria, sistema_andamio, peso_kg, stock_minimo) VALUES
  ('TB-150-TB', 'Tubo 1.50m tubular', 'marco', 'tubular', 3.5, 100),
  ('TB-200-TB', 'Tubo 2.00m tubular', 'marco', 'tubular', 4.6, 100),
  ('TB-300-TB', 'Tubo 3.00m tubular', 'marco', 'tubular', 6.9, 80),
  ('GR-048-TB', 'Grapa giratoria 48mm', 'conector', 'tubular', 0.9, 200),
  ('GR-FIJ-TB', 'Grapa fija 48mm', 'conector', 'tubular', 0.8, 200),
  ('BS-060-TB', 'Base regulable tubular 0.60m', 'base', 'tubular', 5.0, 60),
  ('TB-PL-200', 'Tablón metálico 2.00m', 'plataforma', 'tubular', 12.0, 50);
