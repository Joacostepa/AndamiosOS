-- ============================================================
-- AndamiosOS — Módulo Pañol (fase 1)
--
-- Diseño completo en docs/modulo-panol.md. Lo que hay que saber para leer esto:
--
-- 1. UN SOLO HISTORIAL, QUE SÓLO CRECE. `pan_movimientos` es la verdad; `pan_saldos` y el
--    estado de cada herramienta numerada (`pan_unidades.lugar/estado`) los mantiene el
--    trigger. Nadie edita un saldo: un error se corrige con una ANULACIÓN (el movimiento
--    inverso, enlazado al original), y un conteo con un AJUSTE.
--
-- 2. EL LUGAR DICE DÓNDE ESTÁ Y QUIÉN LO TIENE, en una sola clave de texto:
--      u:<uuid>  una ubicación del pañol (estantería, estante, cajón)
--      p:<uuid>  una persona de Legajos (`personal`)
--      x:<uuid>  una persona externa (cuadrillas tercerizadas)
--      c:<uuid>  una cuadrilla (`cuadrillas`; responde su capataz)
--      o:<ot>    una obra (OT de Odoo)
--      taller · faltante · perdida · baja     lugares de afuera que SÍ se siguen
--      proveedor · consumo · alta · ajuste    fuentes y sumideros: no llevan saldo
--    Así "de 10 martillos, 5 en el pañol, 3 los tiene Diego y 2 la Cuadrilla 5" son tres
--    filas de pan_saldos, y prestar, devolver, pasar y perder son el mismo movimiento con
--    otro destino.
--
-- 3. TODA ESCRITURA PASA POR RPC (SECURITY DEFINER). El kiosco es un dispositivo compartido
--    logueado con un usuario que sólo tiene el módulo `panol-kiosco`: puede registrar
--    movimientos a nombre de quien se identificó (credencial o PIN, validados acá adentro)
--    y nada más. No es encargado, no ve la oficina, no aprueba. Encargado es quien tiene
--    Pañol en "editar" (o admin); en el kiosco, un encargado se identifica con su
--    credencial y su legajo vinculado (`personal.user_id`) le habilita lo suyo.
--
-- Se aplica a mano con `supabase db query` (NUNCA db push) y es idempotente: se puede
-- correr dos veces (scripts/probar-migracion.mjs lo verifica). Sin BEGIN/COMMIT propios
-- para que el probador la pueda envolver en su ROLLBACK.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ========================
-- Personas: el encargado tiene que poder llegar de su legajo a su usuario
-- ========================
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Gente de cuadrillas tercerizadas: no está en Legajos y también retira.
CREATE TABLE IF NOT EXISTS pan_personas_externas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  apellido      TEXT NOT NULL,
  dni           TEXT UNIQUE,
  empresa       TEXT NOT NULL,
  cuadrilla_id  UUID REFERENCES cuadrillas(id) ON DELETE SET NULL,
  telefono      TEXT,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES user_profiles(id) DEFAULT auth.uid()
);

-- ========================
-- Catálogo
-- ========================

-- Árbol: Pañol › Estantería E3 › Estante 2 › Cajón E3-2-04. Un solo pañol más el depósito
-- hoy; sumar otro es una fila más.
CREATE TABLE IF NOT EXISTS pan_ubicaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  padre_id    UUID REFERENCES pan_ubicaciones(id) ON DELETE RESTRICT,
  nombre      TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('panol', 'deposito', 'estanteria', 'estante', 'cajon')),
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pan_ubicaciones_padre ON pan_ubicaciones(padre_id);

-- Tres tipos, no más. "Seguridad crítica" es una marca (arneses, cabos de vida, roldanas)
-- y "equipo de cuadrilla" es un titular, no un tipo (ver docs §1).
CREATE TABLE IF NOT EXISTS pan_articulos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             TEXT NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('insumo', 'herramienta', 'granel')),
  seguridad_critica  BOOLEAN NOT NULL DEFAULT false,
  tiene_talles       BOOLEAN NOT NULL DEFAULT false,
  -- Se retira siempre en `unidad`; `unidad_compra` × `factor_compra` es cómo llega.
  unidad             TEXT NOT NULL DEFAULT 'u.',
  unidad_compra      TEXT,
  factor_compra      NUMERIC NOT NULL DEFAULT 1 CHECK (factor_compra > 0),
  minimo             NUMERIC CHECK (minimo >= 0),
  reponer_hasta      NUMERIC CHECK (reponer_hasta >= 0),
  -- Dónde vive: a dónde vuelve lo devuelto y qué abre el QR del cajón.
  ubicacion_id       UUID REFERENCES pan_ubicaciones(id) ON DELETE SET NULL,
  proveedor          TEXT,
  codigo_barras      TEXT UNIQUE,
  foto_path          TEXT,
  -- Lo escribe el trigger con cada ingreso de compra: es el que valoriza el consumo.
  ultimo_costo       NUMERIC,
  notas              TEXT,
  activo             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pan_articulos_ubicacion ON pan_articulos(ubicacion_id);

-- Talles del EPP: cada uno con su stock.
CREATE TABLE IF NOT EXISTS pan_variantes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id  UUID NOT NULL REFERENCES pan_articulos(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  orden        INTEGER NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (articulo_id, nombre)
);

-- Herramientas con número. `lugar` y `estado` NO se escriben a mano: son el resultado del
-- último movimiento (trigger). Lo demás es ficha, y eso sí lo edita un encargado.
CREATE TABLE IF NOT EXISTS pan_unidades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id         UUID NOT NULL REFERENCES pan_articulos(id) ON DELETE RESTRICT,
  numero              TEXT NOT NULL UNIQUE,                    -- H-014
  serie               TEXT,
  marca_modelo        TEXT,
  fecha_compra        DATE,
  costo               NUMERIC,
  ubicacion_id        UUID REFERENCES pan_ubicaciones(id) ON DELETE SET NULL,
  lugar               TEXT NOT NULL DEFAULT 'alta',
  estado              TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN (
                        'disponible', 'afuera', 'en_revision', 'en_mantenimiento',
                        'fuera_de_servicio', 'faltante', 'perdida', 'baja')),
  desde_at            TIMESTAMPTZ NOT NULL DEFAULT now(),        -- desde cuándo está ahí
  odoo_ot_id          BIGINT,
  capataz_id          UUID REFERENCES personal(id) ON DELETE SET NULL,
  vence_el            DATE,                                       -- sólo préstamos a personas
  faltante_de         TEXT,                                       -- de quién era cuando faltó
  proxima_inspeccion  DATE,                                       -- seguridad crítica
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pan_unidades_articulo ON pan_unidades(articulo_id);
CREATE INDEX IF NOT EXISTS idx_pan_unidades_lugar ON pan_unidades(lugar);

-- ========================
-- QR
--
-- Un código no dice nada: la tabla lo traduce. Reimprimir ANULA el viejo (`activo`) y crea
-- otro, así una credencial perdida deja de servir. Alfabeto sin 0/O/1/I/L.
-- ========================
CREATE TABLE IF NOT EXISTS pan_codigos (
  codigo       TEXT PRIMARY KEY CHECK (codigo ~ '^[2-9A-HJKMNP-Z]{6}$'),
  tipo         TEXT NOT NULL CHECK (tipo IN ('ubicacion', 'unidad', 'persona', 'externa')),
  entidad_id   UUID NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT true,
  impreso_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_at   TIMESTAMPTZ,
  anulado_por  UUID REFERENCES user_profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pan_codigos_activo ON pan_codigos(tipo, entidad_id) WHERE activo;

-- ========================
-- Credenciales, PIN y sesiones del kiosco. Ninguna de estas tablas se lee desde afuera.
-- ========================

-- El PIN identifica solo (sin elegir a la persona primero), así que tiene que ser único y
-- buscable: HMAC con un secreto que vive en la base, no un hash con sal por fila.
CREATE TABLE IF NOT EXISTS pan_secreto (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  pepper  TEXT NOT NULL
);
INSERT INTO pan_secreto (id, pepper)
VALUES (1, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pan_credenciales (
  persona_tipo  TEXT NOT NULL CHECK (persona_tipo IN ('persona', 'externa')),
  persona_id    UUID NOT NULL,
  pin_hash      TEXT UNIQUE,
  pin_at        TIMESTAMPTZ,
  PRIMARY KEY (persona_tipo, persona_id)
);

-- Un PIN equivocado no dice de quién era, así que el bloqueo es del dispositivo.
CREATE TABLE IF NOT EXISTS pan_kiosco_intentos (
  dispositivo      TEXT PRIMARY KEY,
  fallidos         INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta  TIMESTAMPTZ
);

-- "¿Quién sos?" devuelve un token corto: el vale se firma con él, no con un id que el
-- navegador podría inventar.
CREATE TABLE IF NOT EXISTS pan_sesiones (
  token           TEXT PRIMARY KEY,
  persona_tipo    TEXT NOT NULL,
  persona_id      UUID NOT NULL,
  dispositivo     TEXT,
  registrado_por  UUID NOT NULL,
  expira_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pan_sesiones_expira ON pan_sesiones(expira_at);

-- ========================
-- Parámetros (los cambia un admin; cada cambio queda)
-- ========================
CREATE TABLE IF NOT EXISTS pan_parametros (
  clave        TEXT PRIMARY KEY,
  valor        NUMERIC NOT NULL,
  descripcion  TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES user_profiles(id)
);
CREATE TABLE IF NOT EXISTS pan_parametros_historial (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave   TEXT NOT NULL,
  antes   NUMERIC,
  despues NUMERIC NOT NULL,
  por     UUID REFERENCES user_profiles(id),
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pan_parametros (clave, valor, descripcion) VALUES
  ('aviso_inspeccion_dias', 15, 'Avisar inspecciones de seguridad con estos días de anticipación'),
  ('vencida_aviso_horas', 24, 'Préstamo vencido: avisar pasadas estas horas'),
  ('faltante_perdida_dias', 15, 'Un faltante pasa a pérdida a los estos días'),
  ('conteo_umbral_pct', 10, 'Un conteo pide aprobación si la diferencia supera este %'),
  ('kiosco_inactividad_seg', 60, 'El kiosco vuelve a "¿Quién sos?" tras estos segundos sin uso'),
  ('deshacer_seg', 120, 'Hasta cuántos segundos después se puede deshacer un vale desde el kiosco')
ON CONFLICT (clave) DO NOTHING;

-- ========================
-- Vales y movimientos
-- ========================

-- Un vale es un gesto: "Marcelo se llevó esto para la OT 4812". Agrupa sus movimientos y
-- es la unidad del Deshacer. `client_uuid` lo hace idempotente: reintentar no duplica.
CREATE TABLE IF NOT EXISTS pan_vales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid     UUID UNIQUE,
  tipo            TEXT NOT NULL CHECK (tipo IN (
                    'retiro', 'sobrante', 'devolucion', 'transferencia',
                    'ingreso', 'alta', 'gestion', 'conteo', 'anulacion')),
  quien_tipo      TEXT CHECK (quien_tipo IN ('persona', 'externa')),
  quien_id        UUID,
  cuadrilla_id    UUID REFERENCES cuadrillas(id) ON DELETE SET NULL,
  odoo_ot_id      BIGINT,
  origen          TEXT NOT NULL DEFAULT 'app' CHECK (origen IN ('kiosco', 'app')),
  -- Kiosco sin un encargado identificado: entra en el resumen de la mañana.
  sin_encargado   BOOLEAN NOT NULL DEFAULT false,
  dispositivo     TEXT,
  proveedor       TEXT,
  comprobante     TEXT,
  nota            TEXT,
  registrado_por  UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deshecho_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pan_vales_fecha ON pan_vales(created_at DESC);

CREATE TABLE IF NOT EXISTS pan_movimientos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id          UUID REFERENCES pan_vales(id) ON DELETE RESTRICT,
  tipo             TEXT NOT NULL CHECK (tipo IN (
                     'retiro', 'sobrante', 'prestamo', 'devolucion', 'transferencia',
                     'ingreso', 'alta', 'ajuste', 'taller_envio', 'taller_vuelta',
                     'faltante', 'perdida', 'recuperada', 'baja', 'revision', 'anulacion')),
  articulo_id      UUID NOT NULL REFERENCES pan_articulos(id) ON DELETE RESTRICT,
  variante_id      UUID REFERENCES pan_variantes(id) ON DELETE RESTRICT,
  unidad_id        UUID REFERENCES pan_unidades(id) ON DELETE RESTRICT,
  cantidad         NUMERIC NOT NULL CHECK (cantidad > 0),
  desde            TEXT NOT NULL,
  hacia            TEXT NOT NULL,
  odoo_ot_id       BIGINT,
  cuadrilla_id     UUID REFERENCES cuadrillas(id) ON DELETE SET NULL,
  -- El capataz DE ESE MOMENTO: si la cuadrilla cambia de responsable, el historial no.
  capataz_id       UUID REFERENCES personal(id) ON DELETE SET NULL,
  quien_tipo       TEXT CHECK (quien_tipo IN ('persona', 'externa')),
  quien_id         UUID,
  estado_vuelta    TEXT CHECK (estado_vuelta IN ('bien', 'con_falla', 'incompleta')),
  nuevo_estado     TEXT,
  estado_anterior  TEXT,                                -- lo completa el trigger
  motivo           TEXT,
  foto_path        TEXT,
  vence_el         DATE,
  costo_unitario   NUMERIC,
  denuncia         TEXT,
  anula_a          UUID UNIQUE REFERENCES pan_movimientos(id) ON DELETE RESTRICT,
  registrado_por   UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pan_mov_lugares CHECK (
    desde ~ '^((u|p|x|c):[0-9a-f-]{36}|o:[0-9]+|taller|faltante|perdida|baja|proveedor|consumo|alta|ajuste)$'
    AND hacia ~ '^((u|p|x|c):[0-9a-f-]{36}|o:[0-9]+|taller|faltante|perdida|baja|proveedor|consumo|alta|ajuste)$'),
  CONSTRAINT pan_mov_unidad_uno CHECK (unidad_id IS NULL OR cantidad = 1),
  CONSTRAINT pan_mov_anulacion CHECK ((tipo = 'anulacion') = (anula_a IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_pan_mov_fecha ON pan_movimientos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pan_mov_articulo ON pan_movimientos(articulo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pan_mov_unidad ON pan_movimientos(unidad_id, created_at DESC) WHERE unidad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pan_mov_vale ON pan_movimientos(vale_id);
CREATE INDEX IF NOT EXISTS idx_pan_mov_ot ON pan_movimientos(odoo_ot_id) WHERE odoo_ot_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pan_saldos (
  articulo_id     UUID NOT NULL REFERENCES pan_articulos(id) ON DELETE CASCADE,
  variante_id     UUID REFERENCES pan_variantes(id) ON DELETE CASCADE,
  lugar           TEXT NOT NULL,
  cantidad        NUMERIC NOT NULL DEFAULT 0,
  actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pan_saldos_clave
  ON pan_saldos(articulo_id, COALESCE(variante_id, '00000000-0000-0000-0000-000000000000'::uuid), lugar);
CREATE INDEX IF NOT EXISTS idx_pan_saldos_lugar ON pan_saldos(lugar) WHERE cantidad <> 0;

-- "Me llevo algo que no está": se registra igual y cae en la bandeja para darle de alta.
CREATE TABLE IF NOT EXISTS pan_sin_alta (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id               UUID REFERENCES pan_vales(id) ON DELETE CASCADE,
  descripcion           TEXT NOT NULL,
  cantidad              NUMERIC NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  foto_path             TEXT,
  quien_tipo            TEXT,
  quien_id              UUID,
  odoo_ot_id            BIGINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto_articulo_id  UUID REFERENCES pan_articulos(id) ON DELETE SET NULL,
  resuelto_por          UUID REFERENCES user_profiles(id),
  resuelto_at           TIMESTAMPTZ
);

-- ========================
-- Conteos
-- ========================
CREATE TABLE IF NOT EXISTS pan_conteos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ubicacion_id      UUID NOT NULL REFERENCES pan_ubicaciones(id) ON DELETE RESTRICT,
  contado_por_tipo  TEXT CHECK (contado_por_tipo IN ('persona', 'externa')),
  contado_por_id    UUID,
  registrado_por    UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  estado            TEXT NOT NULL DEFAULT 'abierto'
                    CHECK (estado IN ('abierto', 'por_aprobar', 'aplicado', 'rechazado')),
  umbral_pct        NUMERIC,
  iniciado_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_at        TIMESTAMPTZ,
  resuelto_por      UUID REFERENCES user_profiles(id),
  resuelto_at       TIMESTAMPTZ,
  motivo_rechazo    TEXT,
  vale_id           UUID REFERENCES pan_vales(id)
);
CREATE TABLE IF NOT EXISTS pan_conteo_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conteo_id         UUID NOT NULL REFERENCES pan_conteos(id) ON DELETE CASCADE,
  articulo_id       UUID NOT NULL REFERENCES pan_articulos(id),
  variante_id       UUID REFERENCES pan_variantes(id),
  unidad_id         UUID REFERENCES pan_unidades(id),
  contado           NUMERIC CHECK (contado >= 0),
  contado_at        TIMESTAMPTZ,
  esperado          NUMERIC,                         -- se calcula al cerrar
  encontrado_extra  BOOLEAN NOT NULL DEFAULT false,
  nota              TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pan_conteo_items_clave ON pan_conteo_items(
  conteo_id, articulo_id,
  COALESCE(variante_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(unidad_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================
-- FUNCIONES
-- ============================================================

-- Quién llama: 'encargado' | 'kiosco' | 'ver' | NULL.
CREATE OR REPLACE FUNCTION pan_nivel()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.activo IS NOT TRUE THEN NULL
    WHEN p.rol = 'admin' OR p.permisos->>'panol' = 'editar' THEN 'encargado'
    WHEN p.permisos->>'panol-kiosco' = 'editar' THEN 'kiosco'
    WHEN p.permisos->>'panol' = 'ver' THEN 'ver'
  END
  FROM user_profiles p WHERE p.id = auth.uid();
$$;

-- ¿Esta persona (de Legajos) está a cargo del pañol? Por su usuario vinculado.
CREATE OR REPLACE FUNCTION pan_persona_es_encargado(p_tipo TEXT, p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_tipo = 'persona' AND EXISTS (
    SELECT 1 FROM personal pe JOIN user_profiles u ON u.id = pe.user_id
    WHERE pe.id = p_id AND u.activo AND (u.rol = 'admin' OR u.permisos->>'panol' = 'editar'));
$$;

CREATE OR REPLACE FUNCTION pan_nuevo_codigo()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_alfabeto CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_codigo   TEXT;
  v_bytes    BYTEA;
BEGIN
  LOOP
    v_bytes := extensions.gen_random_bytes(6);
    v_codigo := '';
    FOR i IN 0..5 LOOP
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 31) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM pan_codigos WHERE codigo = v_codigo);
  END LOOP;
  RETURN v_codigo;
END;
$$;

-- El código activo de algo; lo crea si no tiene.
CREATE OR REPLACE FUNCTION pan_codigo_de(p_tipo TEXT, p_entidad UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_codigo TEXT;
BEGIN
  SELECT codigo INTO v_codigo FROM pan_codigos WHERE tipo = p_tipo AND entidad_id = p_entidad AND activo;
  IF v_codigo IS NULL THEN
    v_codigo := pan_nuevo_codigo();
    INSERT INTO pan_codigos (codigo, tipo, entidad_id) VALUES (v_codigo, p_tipo, p_entidad);
  END IF;
  RETURN v_codigo;
END;
$$;

CREATE OR REPLACE FUNCTION pan_hash_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT encode(extensions.hmac(p_pin, (SELECT pepper FROM pan_secreto WHERE id = 1), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION pan_nombre_persona(p_tipo TEXT, p_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE p_tipo
    WHEN 'persona' THEN (SELECT nombre || ' ' || apellido FROM personal WHERE id = p_id)
    WHEN 'externa' THEN (SELECT nombre || ' ' || apellido FROM pan_personas_externas WHERE id = p_id)
  END;
$$;

-- ========================
-- El trigger: aplica cada movimiento a saldos y a la unidad
-- ========================
CREATE OR REPLACE FUNCTION pan_lugar_lleva_saldo(p_lugar TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_lugar NOT IN ('proveedor', 'consumo', 'alta', 'ajuste'); $$;

CREATE OR REPLACE FUNCTION pan_mov_antes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.unidad_id IS NOT NULL THEN
    SELECT estado INTO NEW.estado_anterior FROM pan_unidades WHERE id = NEW.unidad_id FOR UPDATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION pan_mov_aplicar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_estado TEXT;
BEGIN
  IF NEW.desde <> NEW.hacia THEN
    IF pan_lugar_lleva_saldo(NEW.desde) THEN
      INSERT INTO pan_saldos (articulo_id, variante_id, lugar, cantidad)
      VALUES (NEW.articulo_id, NEW.variante_id, NEW.desde, -NEW.cantidad)
      ON CONFLICT (articulo_id, COALESCE(variante_id, '00000000-0000-0000-0000-000000000000'::uuid), lugar)
      DO UPDATE SET cantidad = pan_saldos.cantidad - NEW.cantidad, actualizado_at = now();
    END IF;
    IF pan_lugar_lleva_saldo(NEW.hacia) THEN
      INSERT INTO pan_saldos (articulo_id, variante_id, lugar, cantidad)
      VALUES (NEW.articulo_id, NEW.variante_id, NEW.hacia, NEW.cantidad)
      ON CONFLICT (articulo_id, COALESCE(variante_id, '00000000-0000-0000-0000-000000000000'::uuid), lugar)
      DO UPDATE SET cantidad = pan_saldos.cantidad + NEW.cantidad, actualizado_at = now();
    END IF;
  END IF;

  IF NEW.unidad_id IS NOT NULL THEN
    v_estado := CASE
      -- Revisión y anulación traen el estado explícito (la anulación, el de antes).
      WHEN NEW.nuevo_estado IS NOT NULL THEN NEW.nuevo_estado
      WHEN NEW.hacia LIKE 'u:%' THEN
        CASE WHEN NEW.estado_vuelta IN ('con_falla', 'incompleta') THEN 'en_revision' ELSE 'disponible' END
      WHEN NEW.hacia ~ '^(p|x|c|o):' THEN 'afuera'
      WHEN NEW.hacia = 'taller' THEN 'en_mantenimiento'
      WHEN NEW.hacia IN ('faltante', 'perdida', 'baja') THEN NEW.hacia
      ELSE NEW.estado_anterior
    END;

    UPDATE pan_unidades SET
      lugar       = NEW.hacia,
      estado      = v_estado,
      desde_at    = CASE WHEN NEW.desde <> NEW.hacia THEN now() ELSE desde_at END,
      odoo_ot_id  = CASE WHEN NEW.hacia ~ '^(p|x|c|o):' THEN NEW.odoo_ot_id
                         WHEN NEW.desde <> NEW.hacia THEN NULL ELSE odoo_ot_id END,
      capataz_id  = CASE WHEN NEW.hacia LIKE 'c:%' THEN NEW.capataz_id
                         WHEN NEW.desde <> NEW.hacia AND NEW.hacia NOT IN ('faltante', 'perdida') THEN NULL
                         ELSE capataz_id END,
      vence_el    = CASE WHEN NEW.hacia ~ '^(p|x|c):' THEN NEW.vence_el
                         WHEN NEW.desde <> NEW.hacia THEN NULL ELSE vence_el END,
      faltante_de = CASE WHEN NEW.hacia = 'faltante' THEN NEW.desde
                         WHEN NEW.hacia = 'perdida' THEN faltante_de
                         WHEN NEW.desde <> NEW.hacia THEN NULL ELSE faltante_de END
    WHERE id = NEW.unidad_id;
  END IF;

  IF NEW.tipo = 'ingreso' AND NEW.costo_unitario IS NOT NULL THEN
    UPDATE pan_articulos SET ultimo_costo = NEW.costo_unitario, updated_at = now() WHERE id = NEW.articulo_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pan_mov_antes ON pan_movimientos;
CREATE TRIGGER pan_mov_antes BEFORE INSERT ON pan_movimientos
  FOR EACH ROW EXECUTE FUNCTION pan_mov_antes();
DROP TRIGGER IF EXISTS pan_mov_aplicar ON pan_movimientos;
CREATE TRIGGER pan_mov_aplicar AFTER INSERT ON pan_movimientos
  FOR EACH ROW EXECUTE FUNCTION pan_mov_aplicar();

-- El historial no se toca: ni UPDATE ni DELETE, tampoco con service role por descuido.
CREATE OR REPLACE FUNCTION pan_mov_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'El historial del pañol no se edita: anulá el movimiento.';
END;
$$;
DROP TRIGGER IF EXISTS pan_mov_inmutable ON pan_movimientos;
CREATE TRIGGER pan_mov_inmutable BEFORE UPDATE OR DELETE ON pan_movimientos
  FOR EACH ROW EXECUTE FUNCTION pan_mov_inmutable();

-- Parámetros: cada cambio deja su fila.
CREATE OR REPLACE FUNCTION pan_parametro_historial()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    INSERT INTO pan_parametros_historial (clave, antes, despues, por)
    VALUES (NEW.clave, OLD.valor, NEW.valor, auth.uid());
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pan_parametro_historial ON pan_parametros;
CREATE TRIGGER pan_parametro_historial BEFORE UPDATE ON pan_parametros
  FOR EACH ROW EXECUTE FUNCTION pan_parametro_historial();

-- ========================
-- "¿Quién sos?"
--
-- Por credencial (el código del QR) o por PIN. Devuelve un token que dura 15 minutos y que
-- firma los vales de esa persona desde ESE usuario. Tres PIN errados bloquean el
-- dispositivo 5 minutos.
-- ========================
CREATE OR REPLACE FUNCTION pan_identificar(p_codigo TEXT, p_pin TEXT, p_dispositivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nivel   TEXT := pan_nivel();
  v_tipo    TEXT;
  v_id      UUID;
  v_activo  BOOLEAN;
  v_token   TEXT;
  v_intento pan_kiosco_intentos%ROWTYPE;
  v_disp    TEXT := COALESCE(NULLIF(BTRIM(p_dispositivo), ''), 'sin-dispositivo');
BEGIN
  -- IS NULL primero: NULL NOT IN (…) da NULL y el IF no frenaría a quien no tiene el pañol.
  IF v_nivel IS NULL OR v_nivel NOT IN ('kiosco', 'encargado') THEN
    RAISE EXCEPTION 'Este usuario no puede registrar movimientos del pañol.';
  END IF;

  IF NULLIF(BTRIM(p_codigo), '') IS NOT NULL THEN
    SELECT CASE tipo WHEN 'persona' THEN 'persona' ELSE 'externa' END, entidad_id, activo
      INTO v_tipo, v_id, v_activo
    FROM pan_codigos WHERE codigo = upper(BTRIM(p_codigo)) AND tipo IN ('persona', 'externa');
    IF v_id IS NULL THEN RAISE EXCEPTION 'CREDENCIAL_DESCONOCIDA'; END IF;
    IF NOT v_activo THEN RAISE EXCEPTION 'CREDENCIAL_REEMPLAZADA'; END IF;
  ELSIF NULLIF(BTRIM(p_pin), '') IS NOT NULL THEN
    SELECT * INTO v_intento FROM pan_kiosco_intentos WHERE dispositivo = v_disp;
    IF v_intento.bloqueado_hasta > now() THEN RAISE EXCEPTION 'PIN_BLOQUEADO'; END IF;

    SELECT persona_tipo, persona_id INTO v_tipo, v_id
    FROM pan_credenciales WHERE pin_hash = pan_hash_pin(BTRIM(p_pin));

    IF v_id IS NULL THEN
      INSERT INTO pan_kiosco_intentos (dispositivo, fallidos) VALUES (v_disp, 1)
      ON CONFLICT (dispositivo) DO UPDATE SET
        fallidos = CASE WHEN pan_kiosco_intentos.bloqueado_hasta < now() THEN 1 ELSE pan_kiosco_intentos.fallidos + 1 END,
        bloqueado_hasta = CASE
          WHEN (CASE WHEN pan_kiosco_intentos.bloqueado_hasta < now() THEN 1 ELSE pan_kiosco_intentos.fallidos + 1 END) >= 3
          THEN now() + interval '5 minutes' ELSE NULL END;
      -- Sin RAISE: la excepción desharía el contador. El llamador mira `error`.
      RETURN jsonb_build_object('error', 'PIN_INCORRECTO');
    END IF;
    DELETE FROM pan_kiosco_intentos WHERE dispositivo = v_disp;
  ELSE
    RAISE EXCEPTION 'Falta la credencial o el PIN.';
  END IF;

  IF v_tipo = 'persona' THEN
    SELECT activo INTO v_activo FROM personal WHERE id = v_id;
  ELSE
    SELECT activo INTO v_activo FROM pan_personas_externas WHERE id = v_id;
  END IF;
  IF v_activo IS NOT TRUE THEN RAISE EXCEPTION 'PERSONA_INACTIVA'; END IF;

  DELETE FROM pan_sesiones WHERE expira_at < now();
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  INSERT INTO pan_sesiones (token, persona_tipo, persona_id, dispositivo, registrado_por, expira_at)
  VALUES (v_token, v_tipo, v_id, v_disp, auth.uid(), now() + interval '15 minutes');

  RETURN jsonb_build_object(
    'token', v_token,
    'personaTipo', v_tipo,
    'personaId', v_id,
    'nombre', pan_nombre_persona(v_tipo, v_id),
    'esEncargado', pan_persona_es_encargado(v_tipo, v_id),
    'cuadrillaId', CASE v_tipo
      WHEN 'persona' THEN (SELECT cuadrilla_id FROM cuadrilla_personal WHERE personal_id = v_id)
      ELSE (SELECT cuadrilla_id FROM pan_personas_externas WHERE id = v_id) END
  );
END;
$$;

-- Quién firma: el token del kiosco o, desde la app, el legajo del usuario (o la persona que
-- un encargado elige). Devuelve tipo, id y si es encargado.
CREATE OR REPLACE FUNCTION pan_quien(p_token TEXT, p_quien JSONB)
RETURNS TABLE (q_tipo TEXT, q_id UUID, q_encargado BOOLEAN, q_kiosco BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nivel TEXT := pan_nivel();
  v_s     pan_sesiones%ROWTYPE;
BEGIN
  -- IS NULL primero: NULL NOT IN (…) da NULL y el IF no frenaría a quien no tiene el pañol.
  IF v_nivel IS NULL OR v_nivel NOT IN ('kiosco', 'encargado') THEN
    RAISE EXCEPTION 'Este usuario no puede registrar movimientos del pañol.';
  END IF;

  IF NULLIF(p_token, '') IS NOT NULL THEN
    SELECT * INTO v_s FROM pan_sesiones
    WHERE token = p_token AND registrado_por = auth.uid() AND expira_at > now();
    IF v_s.token IS NULL THEN RAISE EXCEPTION 'SESION_VENCIDA'; END IF;
    RETURN QUERY SELECT v_s.persona_tipo, v_s.persona_id,
      v_nivel = 'encargado' OR pan_persona_es_encargado(v_s.persona_tipo, v_s.persona_id),
      v_nivel = 'kiosco';
    RETURN;
  END IF;

  IF v_nivel = 'kiosco' THEN RAISE EXCEPTION 'SESION_VENCIDA'; END IF;

  -- Encargado desde la app: a nombre de otra persona, o de su propio legajo.
  IF p_quien ? 'id' AND p_quien->>'id' IS NOT NULL THEN
    RETURN QUERY SELECT COALESCE(p_quien->>'tipo', 'persona'), (p_quien->>'id')::uuid, true, false;
  ELSE
    RETURN QUERY SELECT 'persona'::text, (SELECT id FROM personal WHERE user_id = auth.uid()), true, false;
  END IF;
END;
$$;

-- ========================
-- El vale
--
-- Un solo punto de entrada para todo lo que mueve cosas. El navegador manda QUÉ y PARA
-- QUIÉN; de dónde sale y a dónde va lo decide esto, porque es lo que hace imposible
-- prestar algo que ya está afuera o devolver algo que ya está en el estante.
--
-- p = {
--   clientUuid, tipo, token | quien:{tipo,id}, cuadrillaId, odooOtId, dispositivo, nota,
--   proveedor, comprobante,
--   items: [{ articuloId, varianteId, unidadId, cantidad, estadoVuelta, motivo, fotoPath,
--             venceEl, costoUnitario, desde, hacia, ubicacionId, movTipo, nuevoEstado,
--             denuncia, sinAlta:{descripcion, cantidad, fotoPath} }]
-- }
--
-- Errores con código (el kiosco los traduce): LA_TIENE:<lugar>, INSPECCION_VENCIDA:<n°>,
-- NO_DISPONIBLE:<estado>, YA_EN_PANOL:<n°>, SOLO_ENCARGADO, SESION_VENCIDA.
-- ========================
CREATE OR REPLACE FUNCTION pan_registrar_vale(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo        TEXT := p->>'tipo';
  v_q           RECORD;
  v_vale_id     UUID;
  v_existente   UUID;
  v_cuadrilla   UUID := NULLIF(p->>'cuadrillaId', '')::uuid;
  v_capataz     UUID;
  v_ot          BIGINT := NULLIF(p->>'odooOtId', '')::bigint;
  v_titular     TEXT;
  v_item        JSONB;
  v_art         pan_articulos%ROWTYPE;
  v_uni         pan_unidades%ROWTYPE;
  v_desde       TEXT;
  v_hacia       TEXT;
  v_mov_tipo    TEXT;
  v_ubic        UUID;
  v_raiz        UUID;
  v_n           INTEGER := 0;
  v_mov_ot      BIGINT;
BEGIN
  IF v_tipo NOT IN ('retiro', 'sobrante', 'devolucion', 'transferencia', 'ingreso', 'gestion') THEN
    RAISE EXCEPTION 'Tipo de vale desconocido: %', v_tipo;
  END IF;

  -- Idempotencia: el mismo vale reintentado devuelve el que ya quedó.
  IF p->>'clientUuid' IS NOT NULL THEN
    SELECT id INTO v_existente FROM pan_vales WHERE client_uuid = (p->>'clientUuid')::uuid;
    IF v_existente IS NOT NULL THEN
      RETURN jsonb_build_object('valeId', v_existente, 'repetido', true);
    END IF;
  END IF;

  SELECT * INTO v_q FROM pan_quien(p->>'token', p->'quien');
  IF v_tipo IN ('ingreso', 'gestion') AND NOT v_q.q_encargado THEN
    RAISE EXCEPTION 'SOLO_ENCARGADO';
  END IF;

  IF v_cuadrilla IS NOT NULL THEN
    SELECT responsable_id INTO v_capataz FROM cuadrillas WHERE id = v_cuadrilla;
    v_titular := 'c:' || v_cuadrilla;
  ELSIF v_q.q_id IS NOT NULL THEN
    v_titular := CASE v_q.q_tipo WHEN 'externa' THEN 'x:' ELSE 'p:' END || v_q.q_id;
  END IF;

  -- La raíz del pañol: a dónde va lo que no tiene ubicación propia.
  SELECT id INTO v_raiz FROM pan_ubicaciones WHERE padre_id IS NULL AND tipo = 'panol' AND activo ORDER BY orden LIMIT 1;

  INSERT INTO pan_vales (client_uuid, tipo, quien_tipo, quien_id, cuadrilla_id, odoo_ot_id, origen,
                         sin_encargado, dispositivo, proveedor, comprobante, nota)
  VALUES (NULLIF(p->>'clientUuid', '')::uuid, v_tipo, v_q.q_tipo, v_q.q_id, v_cuadrilla, v_ot,
          CASE WHEN v_q.q_kiosco THEN 'kiosco' ELSE 'app' END,
          v_q.q_kiosco AND NOT v_q.q_encargado,
          p->>'dispositivo', p->>'proveedor', p->>'comprobante', p->>'nota')
  RETURNING id INTO v_vale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::jsonb)) LOOP
    -- "Me llevo algo que no está": queda registrado, sin movimiento.
    IF v_item ? 'sinAlta' THEN
      INSERT INTO pan_sin_alta (vale_id, descripcion, cantidad, foto_path, quien_tipo, quien_id, odoo_ot_id)
      VALUES (v_vale_id, v_item->'sinAlta'->>'descripcion',
              COALESCE((v_item->'sinAlta'->>'cantidad')::numeric, 1),
              v_item->'sinAlta'->>'fotoPath', v_q.q_tipo, v_q.q_id, v_ot);
      CONTINUE;
    END IF;

    SELECT * INTO v_art FROM pan_articulos WHERE id = (v_item->>'articuloId')::uuid;
    IF v_art.id IS NULL THEN RAISE EXCEPTION 'Artículo desconocido.'; END IF;

    v_uni := NULL;
    IF v_item->>'unidadId' IS NOT NULL THEN
      SELECT * INTO v_uni FROM pan_unidades WHERE id = (v_item->>'unidadId')::uuid FOR UPDATE;
      IF v_uni.id IS NULL OR v_uni.articulo_id <> v_art.id THEN RAISE EXCEPTION 'Unidad desconocida.'; END IF;
    END IF;

    v_ubic := COALESCE(NULLIF(v_item->>'ubicacionId', '')::uuid, v_uni.ubicacion_id, v_art.ubicacion_id, v_raiz);
    IF v_ubic IS NULL THEN RAISE EXCEPTION 'El pañol no tiene ubicaciones cargadas.'; END IF;
    v_mov_ot := COALESCE(NULLIF(v_item->>'odooOtId', '')::bigint, v_ot);

    CASE v_tipo
    WHEN 'retiro' THEN
      IF v_titular IS NULL THEN RAISE EXCEPTION 'Falta a nombre de quién.'; END IF;
      IF v_uni.id IS NOT NULL THEN
        IF v_uni.lugar NOT LIKE 'u:%' THEN RAISE EXCEPTION 'LA_TIENE:%', v_uni.lugar; END IF;
        IF v_uni.estado <> 'disponible' THEN RAISE EXCEPTION 'NO_DISPONIBLE:%', v_uni.estado; END IF;
        IF v_art.seguridad_critica AND v_uni.proxima_inspeccion < current_date THEN
          RAISE EXCEPTION 'INSPECCION_VENCIDA:%', v_uni.numero;
        END IF;
        v_desde := v_uni.lugar;
      ELSE
        v_desde := 'u:' || COALESCE(NULLIF(v_item->>'ubicacionId', '')::uuid, v_art.ubicacion_id, v_raiz);
      END IF;
      IF v_art.tipo = 'insumo' THEN
        v_hacia := 'consumo'; v_mov_tipo := 'retiro';
      ELSE
        v_hacia := v_titular; v_mov_tipo := 'prestamo';
      END IF;

    WHEN 'sobrante' THEN
      IF v_art.tipo <> 'insumo' THEN RAISE EXCEPTION 'Sólo los insumos vuelven como sobrante.'; END IF;
      v_desde := 'consumo'; v_hacia := 'u:' || v_ubic; v_mov_tipo := 'sobrante';

    WHEN 'devolucion' THEN
      v_mov_tipo := 'devolucion';
      IF v_uni.id IS NOT NULL THEN
        IF v_uni.lugar LIKE 'u:%' THEN RAISE EXCEPTION 'YA_EN_PANOL:%', v_uni.numero; END IF;
        v_desde := v_uni.lugar;            -- aunque la traiga otro: queda quién la trajo
      ELSE
        v_desde := COALESCE(NULLIF(v_item->>'desde', ''), v_titular);
      END IF;
      v_hacia := 'u:' || v_ubic;

    WHEN 'transferencia' THEN
      v_mov_tipo := 'transferencia';
      v_desde := COALESCE(v_uni.lugar, NULLIF(v_item->>'desde', ''));
      v_hacia := COALESCE(NULLIF(v_item->>'hacia', ''), v_titular);
      IF v_desde IS NULL OR v_desde !~ '^(p|x|c|o):' OR v_hacia !~ '^(p|x|c|o):' THEN
        RAISE EXCEPTION 'Sólo se pasa algo que está afuera, a otra persona, cuadrilla u obra.';
      END IF;
      IF v_uni.id IS NOT NULL AND v_art.seguridad_critica AND v_uni.proxima_inspeccion < current_date THEN
        RAISE EXCEPTION 'INSPECCION_VENCIDA:%', v_uni.numero;
      END IF;

    WHEN 'ingreso' THEN
      v_mov_tipo := 'ingreso'; v_desde := 'proveedor'; v_hacia := 'u:' || v_ubic;

    WHEN 'gestion' THEN
      v_mov_tipo := v_item->>'movTipo';
      v_desde := COALESCE(v_uni.lugar, NULLIF(v_item->>'desde', ''));
      v_hacia := CASE v_mov_tipo
        WHEN 'faltante'      THEN 'faltante'
        WHEN 'perdida'       THEN 'perdida'
        WHEN 'baja'          THEN 'baja'
        WHEN 'taller_envio'  THEN 'taller'
        WHEN 'taller_vuelta' THEN 'u:' || v_ubic
        WHEN 'recuperada'    THEN 'u:' || v_ubic
        WHEN 'revision'      THEN v_desde
      END;
      IF v_hacia IS NULL OR v_desde IS NULL THEN RAISE EXCEPTION 'Gestión incompleta (%).', v_mov_tipo; END IF;
      IF v_mov_tipo = 'recuperada' AND v_desde NOT IN ('faltante', 'perdida') THEN
        RAISE EXCEPTION 'Sólo se recupera algo faltante o perdido.';
      END IF;
      IF v_mov_tipo = 'taller_vuelta' AND v_desde <> 'taller' THEN
        RAISE EXCEPTION 'No figura en el taller.';
      END IF;
      IF v_mov_tipo IN ('perdida', 'baja') AND NULLIF(BTRIM(v_item->>'motivo'), '') IS NULL THEN
        RAISE EXCEPTION 'Falta el motivo.';
      END IF;
      IF v_mov_tipo = 'revision' AND (v_uni.id IS NULL OR v_item->>'nuevoEstado' NOT IN ('disponible', 'en_revision', 'fuera_de_servicio')) THEN
        RAISE EXCEPTION 'Revisión inválida.';
      END IF;
    END CASE;

    INSERT INTO pan_movimientos (
      vale_id, tipo, articulo_id, variante_id, unidad_id, cantidad, desde, hacia,
      odoo_ot_id, cuadrilla_id, capataz_id, quien_tipo, quien_id, estado_vuelta, nuevo_estado,
      motivo, foto_path, vence_el, costo_unitario, denuncia)
    VALUES (
      v_vale_id, v_mov_tipo, v_art.id, NULLIF(v_item->>'varianteId', '')::uuid, v_uni.id,
      CASE WHEN v_uni.id IS NOT NULL THEN 1 ELSE (v_item->>'cantidad')::numeric END,
      v_desde, v_hacia, v_mov_ot,
      COALESCE(v_cuadrilla, CASE WHEN v_desde LIKE 'c:%' THEN substr(v_desde, 3)::uuid END),
      CASE WHEN v_hacia LIKE 'c:%' THEN (SELECT responsable_id FROM cuadrillas WHERE id = substr(v_hacia, 3)::uuid)
           WHEN v_desde LIKE 'c:%' THEN (SELECT responsable_id FROM cuadrillas WHERE id = substr(v_desde, 3)::uuid)
           WHEN v_desde = 'faltante' THEN v_uni.capataz_id END,
      v_q.q_tipo, v_q.q_id,
      NULLIF(v_item->>'estadoVuelta', ''), NULLIF(v_item->>'nuevoEstado', ''),
      NULLIF(BTRIM(v_item->>'motivo'), ''), NULLIF(v_item->>'fotoPath', ''),
      CASE WHEN v_hacia ~ '^(p|x):' AND NOT COALESCE((v_item->>'vuelveHoy')::boolean, false)
           THEN NULLIF(v_item->>'venceEl', '')::date
           WHEN v_hacia ~ '^(p|x|c):' AND COALESCE((v_item->>'vuelveHoy')::boolean, false) THEN current_date END,
      NULLIF(v_item->>'costoUnitario', '')::numeric,
      NULLIF(BTRIM(v_item->>'denuncia'), ''));
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM pan_sin_alta WHERE vale_id = v_vale_id) THEN
    RAISE EXCEPTION 'El vale está vacío.';
  END IF;

  RETURN jsonb_build_object('valeId', v_vale_id, 'movimientos', v_n, 'repetido', false);
END;
$$;

-- ========================
-- Deshacer (el aviso de 10 s) y anular (un encargado, con motivo)
-- ========================
CREATE OR REPLACE FUNCTION pan_inverso(p_mov pan_movimientos, p_vale UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lugar TEXT;
BEGIN
  IF p_mov.tipo = 'anulacion' THEN RAISE EXCEPTION 'Una anulación no se anula: cargá el movimiento de nuevo.'; END IF;
  IF EXISTS (SELECT 1 FROM pan_movimientos WHERE anula_a = p_mov.id) THEN RAISE EXCEPTION 'Ya está anulado.'; END IF;
  IF p_mov.unidad_id IS NOT NULL THEN
    SELECT lugar INTO v_lugar FROM pan_unidades WHERE id = p_mov.unidad_id FOR UPDATE;
    -- Si la herramienta se movió después, deshacer esto la "teletransportaría".
    IF v_lugar <> p_mov.hacia OR EXISTS (
      SELECT 1 FROM pan_movimientos WHERE unidad_id = p_mov.unidad_id AND created_at > p_mov.created_at AND anula_a IS NULL
        AND id NOT IN (SELECT anula_a FROM pan_movimientos WHERE anula_a IS NOT NULL)) THEN
      RAISE EXCEPTION 'YA_SE_MOVIO';
    END IF;
  END IF;

  INSERT INTO pan_movimientos (vale_id, tipo, articulo_id, variante_id, unidad_id, cantidad, desde, hacia,
                               odoo_ot_id, cuadrilla_id, capataz_id, quien_tipo, quien_id, nuevo_estado,
                               motivo, anula_a)
  VALUES (p_vale, 'anulacion', p_mov.articulo_id, p_mov.variante_id, p_mov.unidad_id, p_mov.cantidad,
          p_mov.hacia, p_mov.desde, p_mov.odoo_ot_id, p_mov.cuadrilla_id, p_mov.capataz_id,
          p_mov.quien_tipo, p_mov.quien_id,
          CASE WHEN p_mov.unidad_id IS NOT NULL THEN p_mov.estado_anterior END,
          p_motivo, p_mov.id);
END;
$$;

CREATE OR REPLACE FUNCTION pan_deshacer_vale(p_vale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vale  pan_vales%ROWTYPE;
  v_mov   pan_movimientos%ROWTYPE;
  v_seg   NUMERIC := (SELECT valor FROM pan_parametros WHERE clave = 'deshacer_seg');
  v_nuevo UUID;
BEGIN
  SELECT * INTO v_vale FROM pan_vales WHERE id = p_vale_id FOR UPDATE;
  IF v_vale.id IS NULL THEN RAISE EXCEPTION 'Vale desconocido.'; END IF;
  IF v_vale.deshecho_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true); END IF;
  IF v_vale.registrado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sólo se deshace desde donde se cargó.'; END IF;
  IF v_vale.created_at < now() - make_interval(secs => COALESCE(v_seg, 120)) THEN
    RAISE EXCEPTION 'Ya pasó el tiempo para deshacer: pedile a un encargado que lo anule.';
  END IF;

  INSERT INTO pan_vales (tipo, quien_tipo, quien_id, origen, dispositivo, nota)
  VALUES ('anulacion', v_vale.quien_tipo, v_vale.quien_id, v_vale.origen, v_vale.dispositivo, 'Deshecho')
  RETURNING id INTO v_nuevo;

  FOR v_mov IN SELECT * FROM pan_movimientos WHERE vale_id = p_vale_id ORDER BY created_at DESC LOOP
    PERFORM pan_inverso(v_mov, v_nuevo, 'Deshecho al momento');
  END LOOP;
  DELETE FROM pan_sin_alta WHERE vale_id = p_vale_id;
  UPDATE pan_vales SET deshecho_at = now() WHERE id = p_vale_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION pan_anular(p_movimiento_id UUID, p_motivo TEXT, p_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q     RECORD;
  v_mov   pan_movimientos%ROWTYPE;
  v_nuevo UUID;
BEGIN
  SELECT * INTO v_q FROM pan_quien(p_token, NULL);
  IF NOT v_q.q_encargado THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Falta el motivo.'; END IF;

  SELECT * INTO v_mov FROM pan_movimientos WHERE id = p_movimiento_id;
  IF v_mov.id IS NULL THEN RAISE EXCEPTION 'Movimiento desconocido.'; END IF;

  INSERT INTO pan_vales (tipo, quien_tipo, quien_id, origen, nota)
  VALUES ('anulacion', v_q.q_tipo, v_q.q_id, CASE WHEN v_q.q_kiosco THEN 'kiosco' ELSE 'app' END, BTRIM(p_motivo))
  RETURNING id INTO v_nuevo;
  PERFORM pan_inverso(v_mov, v_nuevo, BTRIM(p_motivo));
  RETURN jsonb_build_object('valeId', v_nuevo);
END;
$$;

-- ========================
-- Alta de unidades: numera, genera el QR y la deja en su estante
-- ========================
CREATE OR REPLACE FUNCTION pan_alta_unidades(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_art     pan_articulos%ROWTYPE;
  v_prefijo TEXT := upper(COALESCE(NULLIF(BTRIM(p->>'prefijo'), ''), 'H'));
  v_n       INTEGER := COALESCE((p->>'cantidad')::int, 1);
  v_ubic    UUID;
  v_sig     INTEGER;
  v_vale    UUID;
  v_uid     UUID;
  v_numero  TEXT;
  v_salida  JSONB := '[]'::jsonb;
BEGIN
  IF pan_nivel() IS DISTINCT FROM 'encargado' THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  IF v_prefijo !~ '^[A-Z]{1,3}$' THEN RAISE EXCEPTION 'El prefijo son 1 a 3 letras.'; END IF;
  IF v_n < 1 OR v_n > 200 THEN RAISE EXCEPTION 'Entre 1 y 200 unidades.'; END IF;

  SELECT * INTO v_art FROM pan_articulos WHERE id = (p->>'articuloId')::uuid;
  IF v_art.id IS NULL OR v_art.tipo <> 'herramienta' THEN RAISE EXCEPTION 'Sólo las herramientas con número tienen unidades.'; END IF;
  v_ubic := COALESCE(NULLIF(p->>'ubicacionId', '')::uuid, v_art.ubicacion_id,
    (SELECT id FROM pan_ubicaciones WHERE padre_id IS NULL AND tipo = 'panol' AND activo ORDER BY orden LIMIT 1));
  IF v_ubic IS NULL THEN RAISE EXCEPTION 'El pañol no tiene ubicaciones cargadas.'; END IF;

  -- Serializa las altas con el mismo prefijo: dos a la vez no sacan el mismo número.
  PERFORM pg_advisory_xact_lock(hashtext('pan_alta_' || v_prefijo));
  SELECT COALESCE(MAX(substring(numero FROM '^' || v_prefijo || '-([0-9]+)$')::int), 0) + 1 INTO v_sig
  FROM pan_unidades WHERE numero ~ ('^' || v_prefijo || '-[0-9]+$');

  INSERT INTO pan_vales (tipo, origen, proveedor, comprobante, nota)
  VALUES ('alta', 'app', p->>'proveedor', p->>'comprobante', p->>'nota') RETURNING id INTO v_vale;

  FOR i IN 0..(v_n - 1) LOOP
    v_numero := v_prefijo || '-' || lpad((v_sig + i)::text, 3, '0');
    INSERT INTO pan_unidades (articulo_id, numero, serie, marca_modelo, fecha_compra, costo, ubicacion_id, proxima_inspeccion)
    VALUES (v_art.id, v_numero, p->'series'->>i, NULLIF(p->>'marcaModelo', ''),
            NULLIF(p->>'fechaCompra', '')::date, NULLIF(p->>'costo', '')::numeric, v_ubic,
            NULLIF(p->>'proximaInspeccion', '')::date)
    RETURNING id INTO v_uid;
    INSERT INTO pan_movimientos (vale_id, tipo, articulo_id, unidad_id, cantidad, desde, hacia, costo_unitario)
    VALUES (v_vale, 'alta', v_art.id, v_uid, 1, 'alta', 'u:' || v_ubic, NULLIF(p->>'costo', '')::numeric);
    v_salida := v_salida || jsonb_build_object('id', v_uid, 'numero', v_numero, 'codigo', pan_codigo_de('unidad', v_uid));
  END LOOP;

  IF NULLIF(p->>'costo', '') IS NOT NULL THEN
    UPDATE pan_articulos SET ultimo_costo = (p->>'costo')::numeric, updated_at = now() WHERE id = v_art.id;
  END IF;
  RETURN jsonb_build_object('valeId', v_vale, 'unidades', v_salida);
END;
$$;

-- ========================
-- Códigos y PIN (encargados)
-- ========================
CREATE OR REPLACE FUNCTION pan_codigo(p_tipo TEXT, p_entidad UUID, p_reimprimir BOOLEAN DEFAULT false)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF pan_nivel() IS DISTINCT FROM 'encargado' THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  IF p_reimprimir THEN
    UPDATE pan_codigos SET activo = false, anulado_at = now(), anulado_por = auth.uid()
    WHERE tipo = p_tipo AND entidad_id = p_entidad AND activo;
  END IF;
  RETURN pan_codigo_de(p_tipo, p_entidad);
END;
$$;

-- Genera un PIN nuevo de 4 dígitos (se muestra una sola vez) que no use nadie más.
CREATE OR REPLACE FUNCTION pan_generar_pin(p_persona_tipo TEXT, p_persona_id UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pin TEXT;
  v_intentos INTEGER := 0;
BEGIN
  IF pan_nivel() IS DISTINCT FROM 'encargado' THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  IF p_persona_tipo NOT IN ('persona', 'externa') THEN RAISE EXCEPTION 'Tipo de persona inválido.'; END IF;
  LOOP
    v_intentos := v_intentos + 1;
    v_pin := lpad(((get_byte(extensions.gen_random_bytes(2), 0) * 256 + get_byte(extensions.gen_random_bytes(2), 1)) % 10000)::text, 4, '0');
    EXIT WHEN v_pin !~ '^(\d)\1{3}$' AND v_pin NOT IN ('1234', '4321', '0123', '1212')
      AND NOT EXISTS (SELECT 1 FROM pan_credenciales WHERE pin_hash = pan_hash_pin(v_pin));
    IF v_intentos > 200 THEN RAISE EXCEPTION 'No hay PIN libres.'; END IF;
  END LOOP;
  INSERT INTO pan_credenciales (persona_tipo, persona_id, pin_hash, pin_at)
  VALUES (p_persona_tipo, p_persona_id, pan_hash_pin(v_pin), now())
  ON CONFLICT (persona_tipo, persona_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, pin_at = now();
  RETURN v_pin;
END;
$$;

-- Quién tiene PIN (sin el PIN): para la pantalla de credenciales.
CREATE OR REPLACE FUNCTION pan_credenciales_estado()
RETURNS TABLE (persona_tipo TEXT, persona_id UUID, tiene_pin BOOLEAN, pin_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.persona_tipo, c.persona_id, c.pin_hash IS NOT NULL, c.pin_at
  FROM pan_credenciales c WHERE pan_nivel() IN ('encargado', 'ver');
$$;

-- ========================
-- Conteo cíclico
--
-- Se carga a ciegas. Lo esperado se calcula AL CERRAR, por ítem, corrigiendo lo que se
-- movió desde que se contó ese ítem: si contaste los precintos a las 10 y a las 10:20
-- alguien se llevó 50, lo esperado al cerrar es el saldo de ahora + 50.
-- ========================
CREATE OR REPLACE FUNCTION pan_subarbol(p_ubicacion UUID)
RETURNS TABLE (lugar TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE arbol AS (
    SELECT id FROM pan_ubicaciones WHERE id = p_ubicacion
    UNION ALL
    SELECT u.id FROM pan_ubicaciones u JOIN arbol a ON u.padre_id = a.id
  )
  SELECT 'u:' || id FROM arbol;
$$;

CREATE OR REPLACE FUNCTION pan_conteo_abrir(p_ubicacion UUID, p_token TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_q RECORD; v_id UUID;
BEGIN
  SELECT * INTO v_q FROM pan_quien(p_token, NULL);
  IF NOT v_q.q_encargado THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  INSERT INTO pan_conteos (ubicacion_id, contado_por_tipo, contado_por_id, umbral_pct)
  VALUES (p_ubicacion, v_q.q_tipo, v_q.q_id, (SELECT valor FROM pan_parametros WHERE clave = 'conteo_umbral_pct'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- items: [{articuloId, varianteId, unidadId, contado, encontradoExtra, nota}]
CREATE OR REPLACE FUNCTION pan_conteo_cargar(p_conteo UUID, p_items JSONB, p_token TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_q RECORD; v_item JSONB;
BEGIN
  SELECT * INTO v_q FROM pan_quien(p_token, NULL);
  IF NOT v_q.q_encargado THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pan_conteos WHERE id = p_conteo AND estado = 'abierto') THEN
    RAISE EXCEPTION 'El conteo ya está cerrado.';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO pan_conteo_items (conteo_id, articulo_id, variante_id, unidad_id, contado, contado_at, encontrado_extra, nota)
    VALUES (p_conteo, (v_item->>'articuloId')::uuid, NULLIF(v_item->>'varianteId', '')::uuid,
            NULLIF(v_item->>'unidadId', '')::uuid, (v_item->>'contado')::numeric, now(),
            COALESCE((v_item->>'encontradoExtra')::boolean, false), v_item->>'nota')
    ON CONFLICT (conteo_id, articulo_id,
                 COALESCE(variante_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 COALESCE(unidad_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET contado = EXCLUDED.contado, contado_at = now(), nota = EXCLUDED.nota;
  END LOOP;
END;
$$;

-- Aplica los ajustes de un conteo cerrado (interna).
CREATE OR REPLACE FUNCTION pan_conteo_aplicar(p_conteo UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_c     pan_conteos%ROWTYPE;
  v_it    pan_conteo_items%ROWTYPE;
  v_vale  UUID;
  v_lugar TEXT;
  v_uni   pan_unidades%ROWTYPE;
  v_dif   NUMERIC;
BEGIN
  SELECT * INTO v_c FROM pan_conteos WHERE id = p_conteo FOR UPDATE;
  INSERT INTO pan_vales (tipo, quien_tipo, quien_id, origen, nota)
  VALUES ('conteo', v_c.contado_por_tipo, v_c.contado_por_id, 'app', 'Conteo')
  RETURNING id INTO v_vale;

  FOR v_it IN SELECT * FROM pan_conteo_items WHERE conteo_id = p_conteo AND contado IS NOT NULL LOOP
    IF v_it.unidad_id IS NOT NULL THEN
      SELECT * INTO v_uni FROM pan_unidades WHERE id = v_it.unidad_id;
      IF v_it.contado = 0 AND v_uni.lugar IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id)) THEN
        -- Figuraba acá y no apareció: faltante, no un ajuste silencioso.
        INSERT INTO pan_movimientos (vale_id, tipo, articulo_id, unidad_id, cantidad, desde, hacia, motivo, quien_tipo, quien_id)
        VALUES (v_vale, 'faltante', v_uni.articulo_id, v_uni.id, 1, v_uni.lugar, 'faltante', 'No apareció en el conteo',
                v_c.contado_por_tipo, v_c.contado_por_id);
      ELSIF v_it.contado = 1 AND v_uni.lugar NOT IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id)) THEN
        -- Apareció acá aunque figuraba en otro lado.
        INSERT INTO pan_movimientos (vale_id, tipo, articulo_id, unidad_id, cantidad, desde, hacia, motivo, quien_tipo, quien_id)
        VALUES (v_vale, CASE WHEN v_uni.lugar IN ('faltante', 'perdida') THEN 'recuperada' ELSE 'ajuste' END,
                v_uni.articulo_id, v_uni.id, 1, v_uni.lugar, 'u:' || v_c.ubicacion_id, 'Apareció en el conteo',
                v_c.contado_por_tipo, v_c.contado_por_id);
      END IF;
      CONTINUE;
    END IF;

    v_dif := v_it.contado - COALESCE(v_it.esperado, 0);
    IF v_dif = 0 THEN CONTINUE; END IF;
    -- A dónde va el ajuste: el lugar propio del artículo si está en lo contado, si no, lo contado.
    SELECT 'u:' || a.ubicacion_id INTO v_lugar FROM pan_articulos a WHERE a.id = v_it.articulo_id
      AND ('u:' || a.ubicacion_id) IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id));
    v_lugar := COALESCE(v_lugar, 'u:' || v_c.ubicacion_id);
    INSERT INTO pan_movimientos (vale_id, tipo, articulo_id, variante_id, cantidad, desde, hacia, motivo, quien_tipo, quien_id)
    VALUES (v_vale, 'ajuste', v_it.articulo_id, v_it.variante_id, abs(v_dif),
            CASE WHEN v_dif > 0 THEN 'ajuste' ELSE v_lugar END,
            CASE WHEN v_dif > 0 THEN v_lugar ELSE 'ajuste' END,
            'Conteo: contado ' || v_it.contado || ', esperado ' || COALESCE(v_it.esperado, 0),
            v_c.contado_por_tipo, v_c.contado_por_id);
  END LOOP;

  UPDATE pan_conteos SET estado = 'aplicado', vale_id = v_vale WHERE id = p_conteo;
END;
$$;

CREATE OR REPLACE FUNCTION pan_conteo_cerrar(p_conteo UUID, p_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q       RECORD;
  v_c       pan_conteos%ROWTYPE;
  v_supera  BOOLEAN;
BEGIN
  SELECT * INTO v_q FROM pan_quien(p_token, NULL);
  IF NOT v_q.q_encargado THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  SELECT * INTO v_c FROM pan_conteos WHERE id = p_conteo FOR UPDATE;
  IF v_c.estado <> 'abierto' THEN RAISE EXCEPTION 'El conteo ya está cerrado.'; END IF;

  -- Las unidades que figuran acá y no se escanearon entran con contado 0.
  INSERT INTO pan_conteo_items (conteo_id, articulo_id, unidad_id, contado, contado_at)
  SELECT p_conteo, u.articulo_id, u.id, 0, now()
  FROM pan_unidades u
  WHERE u.lugar IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id)) AND u.activo
    AND NOT EXISTS (SELECT 1 FROM pan_conteo_items i WHERE i.conteo_id = p_conteo AND i.unidad_id = u.id);

  -- Esperado de cantidades: saldo actual en lo contado, corregido por lo movido desde que se contó.
  UPDATE pan_conteo_items i SET esperado = (
      SELECT COALESCE(SUM(s.cantidad), 0) FROM pan_saldos s
      WHERE s.articulo_id = i.articulo_id AND s.variante_id IS NOT DISTINCT FROM i.variante_id
        AND s.lugar IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id))
    ) + (
      SELECT COALESCE(SUM(CASE WHEN m.desde IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id)) THEN m.cantidad ELSE 0 END)
                    - SUM(CASE WHEN m.hacia IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id)) THEN m.cantidad ELSE 0 END), 0)
      FROM pan_movimientos m
      WHERE m.articulo_id = i.articulo_id AND m.variante_id IS NOT DISTINCT FROM i.variante_id
        AND m.unidad_id IS NULL AND m.created_at > i.contado_at
    )
  WHERE i.conteo_id = p_conteo AND i.unidad_id IS NULL;

  UPDATE pan_conteo_items SET esperado = 1 WHERE conteo_id = p_conteo AND unidad_id IS NOT NULL AND contado = 0;
  UPDATE pan_conteo_items i SET esperado = CASE WHEN EXISTS (
      SELECT 1 FROM pan_unidades u WHERE u.id = i.unidad_id AND u.lugar IN (SELECT lugar FROM pan_subarbol(v_c.ubicacion_id)))
    THEN 1 ELSE 0 END
  WHERE conteo_id = p_conteo AND unidad_id IS NOT NULL AND contado = 1;

  SELECT EXISTS (
    SELECT 1 FROM pan_conteo_items
    WHERE conteo_id = p_conteo AND contado IS NOT NULL AND (
      (unidad_id IS NOT NULL AND contado = 0)
      OR (unidad_id IS NULL AND abs(contado - COALESCE(esperado, 0)) * 100.0 / GREATEST(COALESCE(esperado, 0), 1) > v_c.umbral_pct))
  ) INTO v_supera;

  UPDATE pan_conteos SET cerrado_at = now(), estado = CASE WHEN v_supera THEN 'por_aprobar' ELSE 'abierto' END
  WHERE id = p_conteo;
  IF NOT v_supera THEN PERFORM pan_conteo_aplicar(p_conteo); END IF;
  RETURN jsonb_build_object('estado', CASE WHEN v_supera THEN 'por_aprobar' ELSE 'aplicado' END);
END;
$$;

-- Aprueba o rechaza. No puede hacerlo quien contó.
CREATE OR REPLACE FUNCTION pan_conteo_resolver(p_conteo UUID, p_aprobar BOOLEAN, p_motivo TEXT DEFAULT NULL, p_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_q RECORD; v_c pan_conteos%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM pan_quien(p_token, NULL);
  IF NOT v_q.q_encargado THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  SELECT * INTO v_c FROM pan_conteos WHERE id = p_conteo FOR UPDATE;
  IF v_c.estado <> 'por_aprobar' THEN RAISE EXCEPTION 'Este conteo no espera aprobación.'; END IF;
  IF (v_q.q_id IS NOT NULL AND v_q.q_id = v_c.contado_por_id) OR v_c.registrado_por = auth.uid() AND NOT v_q.q_kiosco THEN
    RAISE EXCEPTION 'Lo tiene que aprobar otro encargado, no quien contó.';
  END IF;
  UPDATE pan_conteos SET resuelto_por = auth.uid(), resuelto_at = now(),
    motivo_rechazo = CASE WHEN p_aprobar THEN NULL ELSE NULLIF(BTRIM(p_motivo), '') END,
    estado = CASE WHEN p_aprobar THEN estado ELSE 'rechazado' END
  WHERE id = p_conteo;
  IF p_aprobar THEN PERFORM pan_conteo_aplicar(p_conteo); END IF;
  RETURN jsonb_build_object('estado', CASE WHEN p_aprobar THEN 'aplicado' ELSE 'rechazado' END);
END;
$$;

-- ========================
-- Lo que el kiosco necesita leer (su usuario no tiene el módulo Pañol)
-- ========================

-- Resuelve un QR o un código de barras de fábrica.
CREATE OR REPLACE FUNCTION pan_resolver_codigo(p_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_c   pan_codigos%ROWTYPE;
  v_txt TEXT := upper(BTRIM(regexp_replace(COALESCE(p_codigo, ''), '^.*/p/', '', 'i')));
  v_art UUID;
BEGIN
  IF pan_nivel() IS NULL THEN RAISE EXCEPTION 'Sin acceso al pañol.'; END IF;
  SELECT * INTO v_c FROM pan_codigos WHERE codigo = v_txt;
  IF v_c.codigo IS NOT NULL THEN
    IF NOT v_c.activo THEN RETURN jsonb_build_object('tipo', 'anulado', 'codigo', v_txt); END IF;
    RETURN jsonb_build_object('tipo', v_c.tipo, 'id', v_c.entidad_id, 'codigo', v_txt);
  END IF;
  SELECT id INTO v_art FROM pan_articulos WHERE codigo_barras = BTRIM(p_codigo) AND activo;
  IF v_art IS NOT NULL THEN RETURN jsonb_build_object('tipo', 'articulo', 'id', v_art); END IF;
  RETURN jsonb_build_object('tipo', 'desconocido', 'codigo', v_txt);
END;
$$;

-- Las etiquetas que se descargaron: "Etiquetas › Sólo las nuevas" deja de ofrecerlas.
CREATE OR REPLACE FUNCTION pan_marcar_impresos(p_codigos TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n INTEGER;
BEGIN
  IF pan_nivel() IS DISTINCT FROM 'encargado' THEN RAISE EXCEPTION 'SOLO_ENCARGADO'; END IF;
  UPDATE pan_codigos SET impreso_at = now()
  WHERE codigo = ANY(p_codigos) AND activo AND impreso_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ============================================================
-- RLS: se lee todo con acceso al pañol; se escribe por RPC.
-- El catálogo lo editan los encargados; los parámetros, un admin.
-- ============================================================
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pan_ubicaciones', 'pan_articulos', 'pan_variantes', 'pan_unidades', 'pan_codigos',
                           'pan_vales', 'pan_movimientos', 'pan_saldos', 'pan_sin_alta', 'pan_conteos',
                           'pan_conteo_items', 'pan_parametros', 'pan_parametros_historial', 'pan_personas_externas']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Pañol: leer" ON %I', t);
    EXECUTE format('CREATE POLICY "Pañol: leer" ON %I FOR SELECT TO authenticated USING ((SELECT pan_nivel()) IS NOT NULL)', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['pan_ubicaciones', 'pan_articulos', 'pan_variantes', 'pan_personas_externas'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Pañol: encargados cargan" ON %I', t);
    EXECUTE format('CREATE POLICY "Pañol: encargados cargan" ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT pan_nivel()) = ''encargado'')', t);
    EXECUTE format('DROP POLICY IF EXISTS "Pañol: encargados editan" ON %I', t);
    EXECUTE format('CREATE POLICY "Pañol: encargados editan" ON %I FOR UPDATE TO authenticated USING ((SELECT pan_nivel()) = ''encargado'') WITH CHECK ((SELECT pan_nivel()) = ''encargado'')', t);
  END LOOP;
END
$rls$;

-- Unidades: la ficha sí, el lugar y el estado no (son del historial).
DROP POLICY IF EXISTS "Pañol: encargados editan la ficha" ON pan_unidades;
CREATE POLICY "Pañol: encargados editan la ficha" ON pan_unidades FOR UPDATE TO authenticated
  USING (pan_nivel() = 'encargado') WITH CHECK (pan_nivel() = 'encargado');
REVOKE UPDATE ON pan_unidades FROM authenticated;
GRANT UPDATE (serie, marca_modelo, fecha_compra, costo, ubicacion_id, proxima_inspeccion, notas, activo)
  ON pan_unidades TO authenticated;

-- Artículos: `ultimo_costo` lo escribe el ingreso de compra, no una edición.
REVOKE UPDATE ON pan_articulos FROM authenticated;
GRANT UPDATE (nombre, tipo, seguridad_critica, tiene_talles, unidad, unidad_compra, factor_compra, minimo,
              reponer_hasta, ubicacion_id, proveedor, codigo_barras, foto_path, notas, activo, updated_at)
  ON pan_articulos TO authenticated;

-- "Artículos sin alta": un encargado los marca resueltos.
DROP POLICY IF EXISTS "Pañol: encargados resuelven sin alta" ON pan_sin_alta;
CREATE POLICY "Pañol: encargados resuelven sin alta" ON pan_sin_alta FOR UPDATE TO authenticated
  USING (pan_nivel() = 'encargado') WITH CHECK (pan_nivel() = 'encargado');
REVOKE UPDATE ON pan_sin_alta FROM authenticated;
GRANT UPDATE (resuelto_articulo_id, resuelto_por, resuelto_at) ON pan_sin_alta TO authenticated;

DROP POLICY IF EXISTS "Pañol: admin cambia parámetros" ON pan_parametros;
CREATE POLICY "Pañol: admin cambia parámetros" ON pan_parametros FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');
REVOKE UPDATE ON pan_parametros FROM authenticated;
GRANT UPDATE (valor) ON pan_parametros TO authenticated;

-- Secretos: ni lectura. Sólo las funciones de arriba (SECURITY DEFINER) los tocan.
ALTER TABLE pan_secreto ENABLE ROW LEVEL SECURITY;
ALTER TABLE pan_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pan_kiosco_intentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pan_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pan_secreto, pan_credenciales, pan_kiosco_intentos, pan_sesiones FROM anon, authenticated;

-- Las funciones: nada para anon; las internas, para nadie de afuera.
DO $fn$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'pan_nivel()', 'pan_identificar(text, text, text)', 'pan_registrar_vale(jsonb)',
    'pan_deshacer_vale(uuid)', 'pan_anular(uuid, text, text)', 'pan_alta_unidades(jsonb)',
    'pan_codigo(text, uuid, boolean)', 'pan_generar_pin(text, uuid)', 'pan_credenciales_estado()',
    'pan_conteo_abrir(uuid, text)', 'pan_conteo_cargar(uuid, jsonb, text)', 'pan_conteo_cerrar(uuid, text)',
    'pan_conteo_resolver(uuid, boolean, text, text)', 'pan_resolver_codigo(text)', 'pan_subarbol(uuid)',
    'pan_marcar_impresos(text[])']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'pan_persona_es_encargado(text, uuid)', 'pan_nuevo_codigo()', 'pan_codigo_de(text, uuid)', 'pan_hash_pin(text)',
    'pan_nombre_persona(text, uuid)', 'pan_quien(text, jsonb)', 'pan_inverso(pan_movimientos, uuid, text)',
    'pan_conteo_aplicar(uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END
$fn$;

-- ========================
-- Fotos (retiros sin alta, fallas al devolver, artículos). Privado.
-- Prefijo: panol/{tipo}/{id}/{archivo}
-- ========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('panol', 'panol', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Pañol: leer fotos" ON storage.objects;
CREATE POLICY "Pañol: leer fotos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'panol' AND pan_nivel() IS NOT NULL);
DROP POLICY IF EXISTS "Pañol: subir fotos" ON storage.objects;
CREATE POLICY "Pañol: subir fotos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'panol' AND pan_nivel() IN ('kiosco', 'encargado'));

NOTIFY pgrst, 'reload schema';
