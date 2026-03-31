-- ============================================================
-- AndamiosOS - Modulo de Fichadas / Asistencia
-- ============================================================

CREATE TYPE tipo_fichada AS ENUM ('entrada', 'salida');
CREATE TYPE estado_fichada AS ENUM ('valida', 'fuera_de_zona', 'dispositivo_no_autorizado', 'pendiente_aprobacion');
CREATE TYPE ubicacion_fichada AS ENUM ('obra', 'deposito', 'oficina', 'otro');

-- Dispositivos registrados por empleado
CREATE TABLE dispositivos_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_id UUID NOT NULL REFERENCES personal(id),
  device_id TEXT NOT NULL,
  nombre_dispositivo TEXT,
  autorizado BOOLEAN NOT NULL DEFAULT false,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso TIMESTAMPTZ,
  UNIQUE(personal_id, device_id)
);

-- Tokens QR dinamicos (para supervisores)
CREATE TABLE qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID REFERENCES obras(id),
  ubicacion ubicacion_fichada NOT NULL DEFAULT 'obra',
  ubicacion_nombre TEXT,
  generado_por_id UUID REFERENCES user_profiles(id),
  token TEXT UNIQUE NOT NULL,
  expira_at TIMESTAMPTZ NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fichadas (registro de asistencia)
CREATE TABLE fichadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_id UUID NOT NULL REFERENCES personal(id),
  tipo tipo_fichada NOT NULL,
  obra_id UUID REFERENCES obras(id),
  ubicacion ubicacion_fichada NOT NULL DEFAULT 'obra',
  -- Geolocalizacion
  latitud DECIMAL(10, 7),
  longitud DECIMAL(10, 7),
  precision_gps DECIMAL(8, 2),
  dentro_geocerca BOOLEAN DEFAULT true,
  distancia_obra DECIMAL(10, 2),
  -- Validacion
  qr_token_id UUID REFERENCES qr_tokens(id),
  device_id TEXT,
  estado estado_fichada NOT NULL DEFAULT 'valida',
  -- Metadata
  foto_url TEXT,
  observaciones TEXT,
  aprobado_por_id UUID REFERENCES user_profiles(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Geocercas por obra (radio en metros)
ALTER TABLE obras ADD COLUMN IF NOT EXISTS geocerca_radio INTEGER DEFAULT 200;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS latitud DECIMAL(10, 7);
ALTER TABLE obras ADD COLUMN IF NOT EXISTS longitud DECIMAL(10, 7);

-- Indices
CREATE INDEX idx_fichadas_personal ON fichadas(personal_id);
CREATE INDEX idx_fichadas_obra ON fichadas(obra_id);
CREATE INDEX idx_fichadas_fecha ON fichadas(fecha);
CREATE INDEX idx_fichadas_estado ON fichadas(estado);
CREATE INDEX idx_qr_tokens_token ON qr_tokens(token);
CREATE INDEX idx_qr_tokens_expira ON qr_tokens(expira_at);
CREATE INDEX idx_dispositivos_personal ON dispositivos_personal(personal_id);
CREATE INDEX idx_dispositivos_device ON dispositivos_personal(device_id);

-- Triggers
CREATE TRIGGER trg_audit_fichadas AFTER INSERT OR UPDATE OR DELETE ON fichadas FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- RLS
ALTER TABLE fichadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispositivos_personal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden ver fichadas" ON fichadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden crear fichadas" ON fichadas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin puede editar fichadas" ON fichadas FOR UPDATE TO authenticated USING (get_user_role() = 'admin');

CREATE POLICY "Autenticados pueden ver QR tokens" ON qr_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin y operativo pueden crear QR" ON qr_tokens FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('admin', 'operativo'));
CREATE POLICY "Admin puede gestionar QR" ON qr_tokens FOR ALL TO authenticated USING (get_user_role() = 'admin');

CREATE POLICY "Autenticados pueden ver dispositivos" ON dispositivos_personal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Todos pueden registrar dispositivos" ON dispositivos_personal FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin puede gestionar dispositivos" ON dispositivos_personal FOR ALL TO authenticated USING (get_user_role() IN ('admin', 'operativo'));

-- Funcion para limpiar QR tokens expirados
CREATE OR REPLACE FUNCTION limpiar_qr_tokens_expirados()
RETURNS void AS $$
BEGIN
  UPDATE qr_tokens SET activo = false WHERE expira_at < now() AND activo = true;
END;
$$ LANGUAGE plpgsql;
