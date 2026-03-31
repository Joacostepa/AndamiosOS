-- ============================================================
-- AndamiosOS - Schema Inicial MVP
-- ============================================================

-- ========================
-- TIPOS ENUMERADOS
-- ========================

CREATE TYPE user_role AS ENUM ('admin', 'operativo', 'deposito', 'campo');

CREATE TYPE estado_cliente AS ENUM ('activo', 'inactivo');

CREATE TYPE tipo_obra AS ENUM ('construccion', 'fachada', 'industria', 'evento', 'especial');
CREATE TYPE tipo_andamio AS ENUM ('multidireccional', 'tubular', 'colgante', 'otro');
CREATE TYPE estado_obra AS ENUM (
  'presupuestada', 'aprobada', 'en_proyecto', 'proyecto_aprobado',
  'lista_para_ejecutar', 'en_montaje', 'montada', 'en_uso',
  'en_desarme', 'desarmada', 'en_devolucion', 'cerrada_operativamente',
  'cancelada', 'suspendida', 'en_espera'
);

CREATE TYPE categoria_pieza AS ENUM (
  'marco', 'diagonal', 'plataforma', 'base', 'rodapie',
  'escalera', 'barandilla', 'conector', 'anclaje', 'accesorio', 'otro'
);
CREATE TYPE sistema_andamio AS ENUM ('multidireccional', 'tubular', 'colgante', 'otro');

CREATE TYPE tipo_movimiento AS ENUM ('salida', 'entrada', 'transferencia', 'ajuste', 'baja');

CREATE TYPE tipo_remito AS ENUM ('entrega', 'devolucion', 'transferencia');
CREATE TYPE estado_remito AS ENUM ('emitido', 'en_transito', 'recibido', 'con_diferencia', 'cerrado', 'anulado');

CREATE TYPE puesto_personal AS ENUM (
  'operario', 'capataz', 'chofer', 'tecnico', 'administrativo',
  'supervisor', 'jefe_deposito', 'jefe_tecnico', 'gerente'
);
CREATE TYPE estado_habilitacion AS ENUM ('habilitado', 'no_habilitado', 'por_vencer', 'vencido');

CREATE TYPE entidad_documento AS ENUM ('personal', 'vehiculo', 'empresa', 'obra');
CREATE TYPE tipo_documento AS ENUM (
  'dni', 'alta_afip', 'art', 'curso_altura', 'psicofisico',
  'seguro_vida', 'epp', 'induccion', 'vtv', 'seguro_vehiculo',
  'cnrt', 'habilitacion', 'permiso_municipal', 'contrato',
  'plano', 'foto', 'otro'
);
CREATE TYPE estado_documento AS ENUM ('vigente', 'por_vencer', 'vencido');

CREATE TYPE estado_vehiculo AS ENUM ('disponible', 'en_ruta', 'en_taller', 'fuera_servicio');
CREATE TYPE tipo_vehiculo AS ENUM ('camion', 'camioneta', 'hidrogrua', 'utilitario', 'otro');

-- ========================
-- TABLAS
-- ========================

-- Perfiles de usuario (extiende auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  rol user_role NOT NULL DEFAULT 'campo',
  activo BOOLEAN NOT NULL DEFAULT true,
  telefono TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  cuit TEXT,
  domicilio_fiscal TEXT,
  telefono TEXT,
  email TEXT,
  condicion_iva TEXT,
  contactos JSONB DEFAULT '[]'::jsonb,
  estado estado_cliente NOT NULL DEFAULT 'activo',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Obras
CREATE TABLE obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  nombre TEXT NOT NULL,
  direccion TEXT,
  localidad TEXT,
  provincia TEXT DEFAULT 'Buenos Aires',
  coordenadas POINT,
  tipo_obra tipo_obra NOT NULL DEFAULT 'construccion',
  tipo_andamio tipo_andamio NOT NULL DEFAULT 'multidireccional',
  estado estado_obra NOT NULL DEFAULT 'presupuestada',
  fecha_aprobacion DATE,
  fecha_inicio_estimada DATE,
  fecha_inicio_real DATE,
  fecha_fin_estimada DATE,
  fecha_fin_real DATE,
  presupuesto_referencia TEXT,
  responsable_comercial_id UUID REFERENCES user_profiles(id),
  responsable_operativo_id UUID REFERENCES user_profiles(id),
  observaciones TEXT,
  condiciones_acceso TEXT,
  horario_permitido TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Secuencia para codigos de obra
CREATE SEQUENCE obra_codigo_seq START WITH 1;

-- Catalogo de piezas
CREATE TABLE catalogo_piezas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  descripcion TEXT NOT NULL,
  categoria categoria_pieza NOT NULL DEFAULT 'otro',
  sistema_andamio sistema_andamio NOT NULL DEFAULT 'multidireccional',
  peso_kg DECIMAL(8,2),
  unidad_medida TEXT DEFAULT 'unidad',
  foto_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stock global por pieza
CREATE TABLE stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pieza_id UUID UNIQUE NOT NULL REFERENCES catalogo_piezas(id),
  total INTEGER NOT NULL DEFAULT 0,
  en_deposito INTEGER NOT NULL DEFAULT 0,
  comprometido INTEGER NOT NULL DEFAULT 0,
  en_obras INTEGER NOT NULL DEFAULT 0,
  en_transito INTEGER NOT NULL DEFAULT 0,
  danado INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stock por obra
CREATE TABLE stock_por_obra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pieza_id UUID NOT NULL REFERENCES catalogo_piezas(id),
  obra_id UUID NOT NULL REFERENCES obras(id),
  cantidad INTEGER NOT NULL DEFAULT 0,
  cantidad_instalada INTEGER NOT NULL DEFAULT 0,
  cantidad_sobrante INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pieza_id, obra_id)
);

-- Personal
CREATE TABLE personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT UNIQUE NOT NULL,
  cuil TEXT,
  fecha_nacimiento DATE,
  domicilio TEXT,
  telefono TEXT,
  email TEXT,
  contacto_emergencia_nombre TEXT,
  contacto_emergencia_telefono TEXT,
  puesto puesto_personal NOT NULL DEFAULT 'operario',
  categoria TEXT,
  especialidad TEXT,
  fecha_ingreso DATE,
  estado_habilitacion estado_habilitacion NOT NULL DEFAULT 'no_habilitado',
  art_empresa TEXT,
  obra_social TEXT,
  disponible BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Vehiculos
CREATE TABLE vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patente TEXT UNIQUE NOT NULL,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  tipo tipo_vehiculo NOT NULL DEFAULT 'camion',
  capacidad_carga_kg DECIMAL(10,2),
  estado estado_vehiculo NOT NULL DEFAULT 'disponible',
  km_actual INTEGER DEFAULT 0,
  chofer_habitual_id UUID REFERENCES personal(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Remitos
CREATE TABLE remitos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  tipo tipo_remito NOT NULL,
  obra_id UUID NOT NULL REFERENCES obras(id),
  estado estado_remito NOT NULL DEFAULT 'emitido',
  fecha_emision TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_recepcion TIMESTAMPTZ,
  chofer_id UUID REFERENCES personal(id),
  vehiculo_id UUID REFERENCES vehiculos(id),
  receptor_nombre TEXT,
  receptor_firma_url TEXT,
  observaciones TEXT,
  tiene_diferencia BOOLEAN NOT NULL DEFAULT false,
  fotos JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Secuencia para numeros de remito
CREATE SEQUENCE remito_numero_seq START WITH 1;

-- Items de remito
CREATE TABLE remito_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remito_id UUID NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
  pieza_id UUID NOT NULL REFERENCES catalogo_piezas(id),
  cantidad_remitida INTEGER NOT NULL,
  cantidad_recibida INTEGER,
  observacion TEXT
);

-- Movimientos de stock
CREATE TABLE movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_movimiento NOT NULL,
  pieza_id UUID NOT NULL REFERENCES catalogo_piezas(id),
  cantidad INTEGER NOT NULL,
  obra_origen_id UUID REFERENCES obras(id),
  obra_destino_id UUID REFERENCES obras(id),
  remito_id UUID REFERENCES remitos(id),
  motivo TEXT,
  responsable_id UUID REFERENCES user_profiles(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentos (polimorficos: personal, vehiculo, obra, empresa)
CREATE TABLE documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_tipo entidad_documento NOT NULL,
  entidad_id UUID NOT NULL,
  tipo_documento tipo_documento NOT NULL DEFAULT 'otro',
  descripcion TEXT,
  archivo_url TEXT,
  fecha_emision DATE,
  fecha_vencimiento DATE,
  estado estado_documento NOT NULL DEFAULT 'vigente',
  alerta_enviada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Alertas
CREATE TABLE alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  prioridad TEXT NOT NULL DEFAULT 'media',
  entidad_tipo TEXT,
  entidad_id UUID,
  leida BOOLEAN NOT NULL DEFAULT false,
  destinatario_rol user_role,
  destinatario_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES user_profiles(id),
  accion TEXT NOT NULL,
  entidad_tipo TEXT NOT NULL,
  entidad_id UUID,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================
-- INDICES
-- ========================

CREATE INDEX idx_obras_cliente ON obras(cliente_id);
CREATE INDEX idx_obras_estado ON obras(estado);
CREATE INDEX idx_obras_codigo ON obras(codigo);
CREATE INDEX idx_stock_pieza ON stock(pieza_id);
CREATE INDEX idx_stock_por_obra_obra ON stock_por_obra(obra_id);
CREATE INDEX idx_stock_por_obra_pieza ON stock_por_obra(pieza_id);
CREATE INDEX idx_movimientos_pieza ON movimientos(pieza_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX idx_movimientos_remito ON movimientos(remito_id);
CREATE INDEX idx_remitos_obra ON remitos(obra_id);
CREATE INDEX idx_remitos_estado ON remitos(estado);
CREATE INDEX idx_remito_items_remito ON remito_items(remito_id);
CREATE INDEX idx_personal_dni ON personal(dni);
CREATE INDEX idx_personal_habilitacion ON personal(estado_habilitacion);
CREATE INDEX idx_documentos_entidad ON documentos(entidad_tipo, entidad_id);
CREATE INDEX idx_documentos_vencimiento ON documentos(fecha_vencimiento);
CREATE INDEX idx_documentos_estado ON documentos(estado);
CREATE INDEX idx_alertas_leida ON alertas(leida);
CREATE INDEX idx_alertas_destinatario ON alertas(destinatario_id);
CREATE INDEX idx_audit_log_entidad ON audit_log(entidad_tipo, entidad_id);
CREATE INDEX idx_audit_log_fecha ON audit_log(created_at);

-- ========================
-- FUNCIONES HELPER
-- ========================

-- Funcion para actualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de updated_at a todas las tablas relevantes
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_obras_updated_at BEFORE UPDATE ON obras FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_catalogo_piezas_updated_at BEFORE UPDATE ON catalogo_piezas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_stock_updated_at BEFORE UPDATE ON stock FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_stock_por_obra_updated_at BEFORE UPDATE ON stock_por_obra FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_personal_updated_at BEFORE UPDATE ON personal FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vehiculos_updated_at BEFORE UPDATE ON vehiculos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_remitos_updated_at BEFORE UPDATE ON remitos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documentos_updated_at BEFORE UPDATE ON documentos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- FUNCION DE AUDITORIA
-- ========================

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  _user_id UUID;
BEGIN
  -- Intentar obtener el user_id del contexto de Supabase
  BEGIN
    _user_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (usuario_id, accion, entidad_tipo, entidad_id, datos_nuevos)
    VALUES (_user_id, 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (usuario_id, accion, entidad_tipo, entidad_id, datos_anteriores, datos_nuevos)
    VALUES (_user_id, 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (usuario_id, accion, entidad_tipo, entidad_id, datos_anteriores)
    VALUES (_user_id, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger de auditoria a tablas principales
CREATE TRIGGER trg_audit_clientes AFTER INSERT OR UPDATE OR DELETE ON clientes FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_obras AFTER INSERT OR UPDATE OR DELETE ON obras FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_stock AFTER INSERT OR UPDATE OR DELETE ON stock FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_remitos AFTER INSERT OR UPDATE OR DELETE ON remitos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_personal AFTER INSERT OR UPDATE OR DELETE ON personal FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_documentos AFTER INSERT OR UPDATE OR DELETE ON documentos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_movimientos AFTER INSERT OR UPDATE OR DELETE ON movimientos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER trg_audit_vehiculos AFTER INSERT OR UPDATE OR DELETE ON vehiculos FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ========================
-- FUNCION: Generar codigo de obra
-- ========================

CREATE OR REPLACE FUNCTION generar_codigo_obra()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'OBR-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('obra_codigo_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_codigo_obra BEFORE INSERT ON obras FOR EACH ROW EXECUTE FUNCTION generar_codigo_obra();

-- ========================
-- FUNCION: Generar numero de remito
-- ========================

CREATE OR REPLACE FUNCTION generar_numero_remito()
RETURNS TRIGGER AS $$
DECLARE
  prefijo TEXT;
BEGIN
  CASE NEW.tipo
    WHEN 'entrega' THEN prefijo := 'RE';
    WHEN 'devolucion' THEN prefijo := 'RD';
    WHEN 'transferencia' THEN prefijo := 'RT';
  END CASE;

  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := prefijo || '-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('remito_numero_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_numero_remito BEFORE INSERT ON remitos FOR EACH ROW EXECUTE FUNCTION generar_numero_remito();

-- ========================
-- FUNCION: Crear registro de stock al crear pieza
-- ========================

CREATE OR REPLACE FUNCTION crear_stock_para_pieza()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO stock (pieza_id, total, en_deposito, comprometido, en_obras, en_transito, danado)
  VALUES (NEW.id, 0, 0, 0, 0, 0, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crear_stock_pieza AFTER INSERT ON catalogo_piezas FOR EACH ROW EXECUTE FUNCTION crear_stock_para_pieza();

-- ========================
-- FUNCION: Actualizar stock en movimiento
-- ========================

CREATE OR REPLACE FUNCTION actualizar_stock_en_movimiento()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.tipo
    WHEN 'entrada' THEN
      UPDATE stock SET
        en_deposito = en_deposito + NEW.cantidad,
        total = total + NEW.cantidad
      WHERE pieza_id = NEW.pieza_id;

    WHEN 'salida' THEN
      UPDATE stock SET
        en_deposito = en_deposito - NEW.cantidad,
        en_transito = en_transito + NEW.cantidad
      WHERE pieza_id = NEW.pieza_id;

    WHEN 'ajuste' THEN
      UPDATE stock SET
        en_deposito = en_deposito + NEW.cantidad,
        total = total + NEW.cantidad
      WHERE pieza_id = NEW.pieza_id;

    WHEN 'baja' THEN
      UPDATE stock SET
        danado = danado + NEW.cantidad,
        en_deposito = en_deposito - NEW.cantidad
      WHERE pieza_id = NEW.pieza_id;

    WHEN 'transferencia' THEN
      -- Solo actualiza stock_por_obra, no stock global
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_stock AFTER INSERT ON movimientos FOR EACH ROW EXECUTE FUNCTION actualizar_stock_en_movimiento();

-- ========================
-- FUNCION: Actualizar estado de documentos
-- ========================

CREATE OR REPLACE FUNCTION actualizar_estado_documentos()
RETURNS void AS $$
BEGIN
  -- Marcar vencidos
  UPDATE documentos
  SET estado = 'vencido'
  WHERE fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento < CURRENT_DATE
    AND estado != 'vencido';

  -- Marcar por vencer (30 dias)
  UPDATE documentos
  SET estado = 'por_vencer'
  WHERE fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento >= CURRENT_DATE
    AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
    AND estado = 'vigente';

  -- Marcar vigentes (los que ya no estan por vencer)
  UPDATE documentos
  SET estado = 'vigente'
  WHERE fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento > CURRENT_DATE + INTERVAL '30 days'
    AND estado = 'por_vencer';
END;
$$ LANGUAGE plpgsql;

-- ========================
-- FUNCION: Actualizar habilitacion de personal segun documentos
-- ========================

CREATE OR REPLACE FUNCTION actualizar_habilitacion_personal()
RETURNS void AS $$
BEGIN
  -- Marcar como vencido si tiene algun documento vencido
  UPDATE personal p
  SET estado_habilitacion = 'vencido'
  WHERE EXISTS (
    SELECT 1 FROM documentos d
    WHERE d.entidad_tipo = 'personal'
      AND d.entidad_id = p.id
      AND d.estado = 'vencido'
  )
  AND p.activo = true;

  -- Marcar como por_vencer si tiene documentos por vencer y ninguno vencido
  UPDATE personal p
  SET estado_habilitacion = 'por_vencer'
  WHERE EXISTS (
    SELECT 1 FROM documentos d
    WHERE d.entidad_tipo = 'personal'
      AND d.entidad_id = p.id
      AND d.estado = 'por_vencer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM documentos d
    WHERE d.entidad_tipo = 'personal'
      AND d.entidad_id = p.id
      AND d.estado = 'vencido'
  )
  AND p.activo = true;

  -- Marcar como habilitado si todos los documentos estan vigentes
  UPDATE personal p
  SET estado_habilitacion = 'habilitado'
  WHERE NOT EXISTS (
    SELECT 1 FROM documentos d
    WHERE d.entidad_tipo = 'personal'
      AND d.entidad_id = p.id
      AND d.estado IN ('vencido', 'por_vencer')
  )
  AND EXISTS (
    SELECT 1 FROM documentos d
    WHERE d.entidad_tipo = 'personal'
      AND d.entidad_id = p.id
      AND d.estado = 'vigente'
  )
  AND p.activo = true;
END;
$$ LANGUAGE plpgsql;
