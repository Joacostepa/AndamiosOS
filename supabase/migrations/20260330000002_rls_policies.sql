-- ============================================================
-- AndamiosOS - Row Level Security Policies
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_piezas ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_por_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE remito_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ========================
-- Funcion helper: obtener rol del usuario actual
-- ========================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT rol FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ========================
-- USER_PROFILES
-- ========================

-- Todos los autenticados pueden ver perfiles
CREATE POLICY "Usuarios autenticados pueden ver perfiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Usuarios pueden editar su propio perfil
CREATE POLICY "Usuarios pueden editar su perfil"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Solo admin puede crear perfiles
CREATE POLICY "Admin puede crear perfiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');

-- ========================
-- CLIENTES
-- ========================

CREATE POLICY "Autenticados pueden ver clientes"
  ON clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operativo pueden crear clientes"
  ON clientes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Admin y operativo pueden editar clientes"
  ON clientes FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'operativo'));

-- ========================
-- OBRAS
-- ========================

CREATE POLICY "Autenticados pueden ver obras"
  ON obras FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operativo pueden crear obras"
  ON obras FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Admin y operativo pueden editar obras"
  ON obras FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'operativo'));

-- ========================
-- CATALOGO_PIEZAS
-- ========================

CREATE POLICY "Autenticados pueden ver catalogo"
  ON catalogo_piezas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y deposito pueden gestionar catalogo"
  ON catalogo_piezas FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'deposito'));

CREATE POLICY "Admin y deposito pueden editar catalogo"
  ON catalogo_piezas FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'deposito'));

-- ========================
-- STOCK
-- ========================

CREATE POLICY "Autenticados pueden ver stock"
  ON stock FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y deposito pueden gestionar stock"
  ON stock FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'deposito'));

-- ========================
-- STOCK_POR_OBRA
-- ========================

CREATE POLICY "Autenticados pueden ver stock por obra"
  ON stock_por_obra FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y deposito pueden gestionar stock por obra"
  ON stock_por_obra FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'deposito'));

-- ========================
-- MOVIMIENTOS
-- ========================

CREATE POLICY "Autenticados pueden ver movimientos"
  ON movimientos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin, operativo y deposito pueden crear movimientos"
  ON movimientos FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo', 'deposito'));

-- ========================
-- REMITOS
-- ========================

CREATE POLICY "Autenticados pueden ver remitos"
  ON remitos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin, operativo y deposito pueden crear remitos"
  ON remitos FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo', 'deposito'));

CREATE POLICY "Admin, operativo y deposito pueden editar remitos"
  ON remitos FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'operativo', 'deposito'));

-- ========================
-- REMITO_ITEMS
-- ========================

CREATE POLICY "Autenticados pueden ver items de remito"
  ON remito_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin, operativo y deposito pueden gestionar items de remito"
  ON remito_items FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'operativo', 'deposito'));

-- ========================
-- PERSONAL
-- ========================

CREATE POLICY "Autenticados pueden ver personal"
  ON personal FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operativo pueden gestionar personal"
  ON personal FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Admin y operativo pueden editar personal"
  ON personal FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'operativo'));

-- ========================
-- VEHICULOS
-- ========================

CREATE POLICY "Autenticados pueden ver vehiculos"
  ON vehiculos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operativo pueden gestionar vehiculos"
  ON vehiculos FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Admin y operativo pueden editar vehiculos"
  ON vehiculos FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'operativo'));

-- ========================
-- DOCUMENTOS
-- ========================

CREATE POLICY "Autenticados pueden ver documentos"
  ON documentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operativo pueden gestionar documentos"
  ON documentos FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Admin y operativo pueden editar documentos"
  ON documentos FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'operativo'));

-- ========================
-- ALERTAS
-- ========================

CREATE POLICY "Usuarios ven sus alertas o las de su rol"
  ON alertas FOR SELECT TO authenticated
  USING (
    destinatario_id = auth.uid()
    OR destinatario_rol = get_user_role()
    OR destinatario_id IS NULL
  );

CREATE POLICY "Sistema puede crear alertas"
  ON alertas FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'operativo'));

CREATE POLICY "Usuarios pueden marcar alertas como leidas"
  ON alertas FOR UPDATE TO authenticated
  USING (
    destinatario_id = auth.uid()
    OR destinatario_rol = get_user_role()
    OR get_user_role() = 'admin'
  );

-- ========================
-- AUDIT_LOG
-- ========================

CREATE POLICY "Solo admin puede ver audit log"
  ON audit_log FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');
