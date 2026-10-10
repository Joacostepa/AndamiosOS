-- ============================================================
-- AndamiosOS — Módulo Hoja del día (fase 1: la base)
--
-- Diseño completo en docs/equipos-del-dia/modulo.md; el contrato para las pantallas en
-- docs/equipos-del-dia/implementacion.md. Lo que hay que saber para leer esto:
--
-- 1. TODO CUELGA DE (cuadrilla de Odoo, fecha) Y DE (vehículo, fecha). Nunca del id de
--    `x_aba_asignacion`, que el tablero borra y recrea cada vez que mueve o corre una obra.
--    Las obras de cada hoja NO se guardan acá: se leen del tablero en cada consulta.
--
-- 2. EL VIAJE ES UNO SOLO. Los "lleva", "busca" y "mueve" de una cuadrilla son filas de
--    `hd_viajes` con `hoja_id`, las mismas que ve la vista Camiones. No hay una lista de la
--    hoja y otra del camión: cambiar la hora del "lleva" en un lado la cambia en el otro.
--
-- 3. LO ENVIADO ES UNA FOTO. Cada persona que recibe algo (capataz o chofer) tiene, por día,
--    una fila en `hd_links` con su token y la foto de lo último que se le mandó (`snap`).
--    "Cambiada después de enviar" es la diferencia entre la hoja de ahora y esa foto: por
--    eso un cambio en el tablero también la marca, sin que nadie escriba nada acá.
--
-- 4. RLS CERRADA POR PERMISO desde el primer día (no abierta como el tablero): se lee con
--    `hoja-dia` en ver y se escribe con `hoja-dia` en editar. Las dos excepciones del
--    documento (§14): los pedidos también los crean `planificacion` y `panol`, y las
--    ausencias también `personal`. Lo público (el link del capataz y del chofer, el webhook
--    de Telegram) NO pasa por acá: va por rutas del servidor con la service role y valida
--    el token o el secreto antes de tocar nada.
--
-- 5. EL HISTORIAL SÓLO CRECE. `hd_historial` guarda cada cambio con la fila de antes y la
--    de después; de ahí salen el "Deshacer", el "qué cambió" y la línea de tiempo.
--
-- Se aplica a mano con `npx supabase db query --linked -f` (NUNCA db push) y es
-- idempotente: se puede correr dos veces. Sin BEGIN/COMMIT propios para que el probador
-- (scripts/probar-migracion.mjs) la pueda envolver en su ROLLBACK.
-- ============================================================

-- ========================
-- Vínculos que faltaban (§14 "Vínculos que faltan")
-- ========================

-- Legajos ↔ hr.employee de Odoo: el puntero del parte, la asistencia y los celulares.
-- Lo llena scripts/hoja-dia-vincular-personal.mjs (cruce por DNI y, si no, por nombre).
ALTER TABLE personal ADD COLUMN IF NOT EXISTS odoo_employee_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_odoo_employee ON personal(odoo_employee_id) WHERE odoo_employee_id IS NOT NULL;

-- La tarea de Odoo (hr.employee.x_tarea: andamista / chofer / herrero), sincronizada por el
-- mismo script. Es la que dice quién maneja: en Legajos Ortega figura con puesto chofer y
-- actúa de capataz; en Odoo los choferes son tres (Borda, Kiska, Nuñez).
ALTER TABLE personal ADD COLUMN IF NOT EXISTS odoo_tarea TEXT;

-- Quién puede estar a cargo de una cuadrilla. Es independiente del puesto: Ortega figura
-- como chofer y actúa de capataz.
ALTER TABLE personal ADD COLUMN IF NOT EXISTS puede_estar_a_cargo BOOLEAN NOT NULL DEFAULT false;

-- Telegram: el chat privado de la persona con el bot. Lo escribe el webhook cuando la
-- persona toca el link de vinculación (/start <código>); nadie lo carga a mano.
ALTER TABLE personal ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE personal ADD COLUMN IF NOT EXISTS telegram_usuario TEXT;
ALTER TABLE personal ADD COLUMN IF NOT EXISTS telegram_vinculado_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_telegram ON personal(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Lo mismo para la gente de cuadrillas tercerizadas (el "a cargo" puede ser externo).
ALTER TABLE pan_personas_externas ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE pan_personas_externas ADD COLUMN IF NOT EXISTS telegram_usuario TEXT;
ALTER TABLE pan_personas_externas ADD COLUMN IF NOT EXISTS telegram_vinculado_at TIMESTAMPTZ;
ALTER TABLE pan_personas_externas ADD COLUMN IF NOT EXISTS puede_estar_a_cargo BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pan_externas_telegram ON pan_personas_externas(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Cuadrillas de Supabase (uuid, el plantel base) ↔ x_aba_cuadrilla de Odoo (int, el
-- tablero). Lo llena scripts/hoja-dia-vincular-cuadrillas.mjs, que además crea la 5.
ALTER TABLE cuadrillas ADD COLUMN IF NOT EXISTS odoo_cuadrilla_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cuadrillas_odoo ON cuadrillas(odoo_cuadrilla_id) WHERE odoo_cuadrilla_id IS NOT NULL;

-- Arrancan a cargo los punteros reales de las últimas 4 semanas (Pendiente 7 de §19, con la
-- recomendación del documento). Por apellido normalizado y SÓLO si hay un único legajo que
-- coincide: hay dos Miño y dos Valenzuela. Al Miño que fue puntero (43 partes desde el
-- 01/09) se lo distingue por el nombre.
DO $cargo$
DECLARE
  r RECORD;
  v_n INTEGER;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('conte', NULL), ('mino', 'horacio'), ('ortega', NULL), ('hepper', NULL), ('sack', NULL), ('perez', NULL)
  ) AS t(apellido, nombre)
  LOOP
    SELECT count(*) INTO v_n FROM personal
    WHERE lower(translate(apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = r.apellido
      AND (r.nombre IS NULL OR lower(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE r.nombre || '%');
    IF v_n = 1 THEN
      UPDATE personal SET puede_estar_a_cargo = true
      WHERE lower(translate(apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = r.apellido
        AND (r.nombre IS NULL OR lower(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE r.nombre || '%')
        AND puede_estar_a_cargo IS DISTINCT FROM true;
    END IF;
  END LOOP;
END
$cargo$;

-- ========================
-- Quién llama
-- ========================

-- El nivel del usuario en un módulo: 'editar' | 'ver' | NULL. Admin edita todo. Es la
-- misma regla que nivelEn() de src/lib/auth/acceso.ts, del lado de la base.
CREATE OR REPLACE FUNCTION hd_nivel(p_modulo TEXT DEFAULT 'hoja-dia')
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.activo IS NOT TRUE THEN NULL
    WHEN p.rol = 'admin' THEN 'editar'
    WHEN p.permisos->>p_modulo IN ('ver', 'editar') THEN p.permisos->>p_modulo
  END
  FROM user_profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION hd_puede_ver() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT hd_nivel('hoja-dia') IS NOT NULL; $$;

CREATE OR REPLACE FUNCTION hd_puede_editar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT hd_nivel('hoja-dia') = 'editar'; $$;

-- El día en Buenos Aires (como hoyBA() y pan_hoy()).
CREATE OR REPLACE FUNCTION hd_hoy() RETURNS DATE
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date; $$;

-- ========================
-- Parámetros (los cambia un admin; cada cambio queda)
-- ========================
CREATE TABLE IF NOT EXISTS hd_parametros (
  clave        TEXT PRIMARY KEY,
  valor        JSONB NOT NULL,
  descripcion  TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES user_profiles(id)
);
CREATE TABLE IF NOT EXISTS hd_parametros_historial (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave    TEXT NOT NULL,
  antes    JSONB,
  despues  JSONB NOT NULL,
  por      UUID REFERENCES user_profiles(id),
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Los valores recomendados del documento (§14 "hd_parametros" y las Pendientes de §19).
-- Las duraciones son las de la maqueta aprobada: el "busca" son 30 min y el "trae" 30 de
-- carga más 60 de vuelta al depósito (minutos_vuelta_deposito).
INSERT INTO hd_parametros (clave, valor, descripcion) VALUES
  ('hora_limite_envio', '"19:00"', 'Sin enviar a esta hora del día anterior: la bandeja lo pone en rojo'),
  ('hora_alarma_no_abierta', '"06:30"', 'Enviada y no abierta a esta hora del día: en rojo'),
  ('minutos_entre_viajes', '45', 'Tiempo mínimo entre dos viajes del mismo chofer cuando no hay duraciones'),
  ('duracion_viaje', '{"lleva": 45, "busca": 30, "mueve": 30, "lleva_material": 60, "trae_material": 30, "compra": 60, "entre_depositos": 60, "taller": 90, "otro": 60}', 'Duración típica de cada tipo de viaje, en minutos'),
  ('minutos_vuelta_deposito', '60', 'Del último lugar al depósito, con la descarga'),
  ('minutos_sin_noticias', '60', 'Pasada la hora estimada sin un Hecho: "Sin noticias"'),
  ('minutos_sin_avisar', '2', 'Un viaje nuevo sin avisar al chofer pasa a ámbar'),
  ('minutos_no_visto', '10', 'Un aviso que el chofer no vio pasa a "no abrió el viaje nuevo"'),
  ('km_cerca', '3', 'Distancia en línea recta para "Cerca"'),
  ('hora_corte_manana', '"15:00"', 'Después de esta hora la app abre en Mañana y un pedido de hoy sin camión pasa a "Quedó sin hacer hoy"'),
  ('encuentro_deposito', '"07:00"', 'Encuentro por defecto con chofer (en el depósito)'),
  ('encuentro_obra', '"08:00"', 'Encuentro por defecto sin chofer (en la obra)'),
  ('inicio_obra', '"08:00"', 'Hora de inicio de la primera obra del día'),
  ('fin_jornada', '"17:00"', 'Fin de la jornada: la hora del "busca" por defecto'),
  ('chips_instrucciones', '["Llevar arnés y cabo de vida", "Pasar por el depósito antes", "Llamar al encargado al llegar", "Tiene que estar el encargado", "Llevar la documentación (ART y seguro)", "Hidrogrúa en obra", "Terminar sí o sí hoy"]', 'Motivos rápidos de las instrucciones'),
  ('motivos_no_pude', '["No estaba listo", "Estaba cerrado", "No había nadie para recibir", "No entra en el camión", "Problema con el camión", "Otro (te llamo)"]', 'Motivos del "No pude" del chofer'),
  ('motivos_esperar', '["No está listo", "Falta en el depósito", "Espera al cliente", "Otro"]', 'Motivos de "Esperar…" de un pedido'),
  ('coordinador', '{"nombre": "Juan Agustín", "telefono": null}', 'Coordinador de guardia: a quién llaman capataces y choferes ("Llamar a Juan Agustín"). Falta cargar el teléfono'),
  ('deposito', '{"nombre": "Encargado del depósito", "telefono": null, "telegram_chat_id": null}', 'A quién se le avisa lo que hay que cargar ("Avisar al depósito"). Falta cargar el teléfono'),
  ('dias_asistencia', '3', 'Días hábiles de asistencia (Odoo x_parte_diario) que se leen para tomar las ART')
ON CONFLICT (clave) DO NOTHING;

-- ========================
-- Lugares frecuentes (los que no son obras)
-- ========================
CREATE TABLE IF NOT EXISTS hd_lugares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  corto       TEXT,
  tipo        TEXT NOT NULL CHECK (tipo IN ('deposito', 'proveedor', 'taller', 'vtv', 'otro')),
  direccion   TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  telefono    TEXT,
  horario     TEXT,
  -- "Atiende hasta": el aviso "Galvanizados Sanz atiende hasta las 16 y Kiska llega ~16:20".
  cierra      TIME,
  nota        TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PENDIENTE (Pendiente 18 de §19): las direcciones, horarios y teléfonos están A CONFIRMAR.
-- La dirección del depósito no se conoce desde el código: sin ella "Cerca" y "Libre" no
-- pueden medir distancias desde el depósito (el resto anda igual). Ver handoff.md.
INSERT INTO hd_lugares (nombre, corto, tipo, nota) VALUES
  ('Depósito', 'Depósito', 'deposito', 'Dirección A CONFIRMAR: cargarla con lat/lng para que funcione "Cerca"'),
  ('Galvanizados Sanz', 'Sanz', 'proveedor', 'Aparece en el cajón del tablero. Dirección, horario y teléfono a confirmar'),
  ('Planta de VTV', 'VTV', 'vtv', 'A confirmar cuál planta se usa'),
  ('Taller', 'Taller', 'taller', 'A confirmar cuál taller se usa')
ON CONFLICT (nombre) DO NOTHING;

-- ========================
-- Hojas: una por cuadrilla y día
-- ========================
CREATE TABLE IF NOT EXISTS hd_hojas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha               DATE NOT NULL,
  cuadrilla_odoo_id   BIGINT NOT NULL,
  -- sin / lleva_trae / todo_el_dia. En "lleva y trae" el chofer de cada tramo está en sus
  -- viajes (puede no ser el mismo); acá queda el de la cuadrilla, que es el que se propone.
  chofer_modo         TEXT NOT NULL DEFAULT 'sin' CHECK (chofer_modo IN ('sin', 'lleva_trae', 'todo_el_dia')),
  chofer_id           UUID REFERENCES personal(id) ON DELETE SET NULL,
  vehiculo_id         UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
  -- Cuándo se tocó por última vez el chofer o el vehículo: cuando dos tarjetas reclaman el
  -- mismo chofer "todo el día", el aviso fuerte va en la que se tocó último.
  chofer_tocado_at    TIMESTAMPTZ,
  encuentro_lugar     TEXT NOT NULL DEFAULT 'obra' CHECK (encuentro_lugar IN ('deposito', 'obra', 'otro')),
  encuentro_texto     TEXT,
  encuentro_hora      TIME NOT NULL DEFAULT '08:00',
  nota                TEXT,
  -- A quién se le manda si no hay nadie a cargo (Advierte, no bloquea: §3).
  recibe_id           UUID REFERENCES personal(id) ON DELETE SET NULL,
  recibe_externa_id   UUID REFERENCES pan_personas_externas(id) ON DELETE SET NULL,
  -- De dónde salió: hoy | plantel | vacio | manual | copia
  origen              TEXT NOT NULL DEFAULT 'manual',
  copiada_de          DATE,
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  UNIQUE (fecha, cuadrilla_odoo_id)
);
CREATE INDEX IF NOT EXISTS idx_hd_hojas_fecha ON hd_hojas(fecha);

-- ========================
-- Quiénes van
-- ========================
CREATE TABLE IF NOT EXISTS hd_integrantes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id     UUID NOT NULL REFERENCES hd_hojas(id) ON DELETE CASCADE,
  -- Repetida a propósito: es la que hace cumplir "una persona, una cuadrilla por día".
  -- La pone el trigger con la de la hoja; nadie la escribe.
  fecha       DATE NOT NULL,
  persona_id  UUID REFERENCES personal(id) ON DELETE CASCADE,
  externa_id  UUID REFERENCES pan_personas_externas(id) ON DELETE CASCADE,
  a_cargo     BOOLEAN NOT NULL DEFAULT false,
  nota        TEXT,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((persona_id IS NULL) <> (externa_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_integrantes_persona ON hd_integrantes(fecha, persona_id) WHERE persona_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_integrantes_externa ON hd_integrantes(fecha, externa_id) WHERE externa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_integrantes_a_cargo ON hd_integrantes(hoja_id) WHERE a_cargo;
CREATE INDEX IF NOT EXISTS idx_hd_integrantes_hoja ON hd_integrantes(hoja_id);

CREATE OR REPLACE FUNCTION hd_integrante_fecha()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fecha := (SELECT fecha FROM hd_hojas WHERE id = NEW.hoja_id);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hd_integrante_fecha ON hd_integrantes;
CREATE TRIGGER hd_integrante_fecha BEFORE INSERT OR UPDATE ON hd_integrantes
  FOR EACH ROW EXECUTE FUNCTION hd_integrante_fecha();

-- ========================
-- El chofer de cada vehículo cada día (la fila de la vista Camiones)
-- Sin fila = el chofer habitual del vehículo (vehiculos.chofer_habitual_id).
-- ========================
CREATE TABLE IF NOT EXISTS hd_camiones_dia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha        DATE NOT NULL,
  vehiculo_id  UUID NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
  chofer_id    UUID REFERENCES personal(id) ON DELETE SET NULL,
  -- true = "sin chofer hoy" aunque tenga habitual (para que el null no se confunda con
  -- "no se cargó nada").
  sin_chofer   BOOLEAN NOT NULL DEFAULT false,
  nota         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  UNIQUE (fecha, vehiculo_id)
);

-- ========================
-- Viajes: todos los de todos los camiones, de cuadrilla o no (§6)
-- ========================
CREATE TABLE IF NOT EXISTS hd_viajes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  -- null + flete_externo = flete de afuera; null sin flete = "nadie lo hace" (el busca que
  -- se sacó de un camión: "Nadie busca a la Cuadrilla 3").
  vehiculo_id        UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
  -- Se copia del camión del día al ponerlo, para que el historial no cambie.
  chofer_id          UUID REFERENCES personal(id) ON DELETE SET NULL,
  flete_externo      TEXT,
  tipo               TEXT NOT NULL CHECK (tipo IN ('lleva', 'busca', 'mueve', 'lleva_material', 'trae_material',
                                                   'compra', 'entre_depositos', 'taller', 'otro')),
  hoja_id            UUID REFERENCES hd_hojas(id) ON DELETE CASCADE,
  cuadrilla_odoo_id  BIGINT,
  -- Destino y origen: una OT, un lugar frecuente o texto. Origen todo null = "donde terminó
  -- el viaje anterior" (el primero sale del depósito).
  hacia_ot_id        BIGINT,
  hacia_lugar_id     UUID REFERENCES hd_lugares(id) ON DELETE SET NULL,
  hacia_texto        TEXT,
  desde_ot_id        BIGINT,
  desde_lugar_id     UUID REFERENCES hd_lugares(id) ON DELETE SET NULL,
  desde_texto        TEXT,
  -- Orden dentro del camión y el día. NUMERIC para poder soltar un viaje ENTRE dos sin
  -- renumerar la fila: queda en el medio.
  orden              NUMERIC NOT NULL DEFAULT 0,
  -- Hora FIJA (alguien espera: "10:45"). Null = estimada con el orden y las duraciones.
  hora               TIME,
  -- "No antes de": la estimada no arranca antes de esto (la compra está lista a las 10).
  no_antes_de        TIME,
  duracion_min       INTEGER CHECK (duracion_min > 0),
  -- Vuelve al depósito con carga después de la parada (el "trae"): suma la vuelta.
  vuelta             BOOLEAN NOT NULL DEFAULT false,
  vuelta_carga       TEXT,
  carga              TEXT,
  -- A qué hora carga en el depósito (la lista de carga), si no es la del viaje.
  carga_deposito     TIME,
  -- El coordinador aceptó sacar un rato al chofer de "todo el día": no se vuelve a avisar.
  ok_todo_el_dia     BOOLEAN NOT NULL DEFAULT false,
  estado             TEXT NOT NULL DEFAULT 'planeado' CHECK (estado IN ('planeado', 'hecho', 'no_pudo', 'anulado')),
  hecho_at           TIMESTAMPTZ,
  -- 'chofer' (link o Telegram) o el nombre de quien lo marcó por él ("Juan Agustín").
  hecho_por          TEXT,
  no_pudo_motivo     TEXT,
  anulado_motivo     TEXT,
  foto_path          TEXT,
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES user_profiles(id) DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_hd_viajes_fecha ON hd_viajes(fecha, vehiculo_id, orden);
CREATE INDEX IF NOT EXISTS idx_hd_viajes_hoja ON hd_viajes(hoja_id);
CREATE INDEX IF NOT EXISTS idx_hd_viajes_chofer ON hd_viajes(fecha, chofer_id);

-- ========================
-- Pedidos: lo que tiene que hacer un camión y todavía no tiene camión (§7)
-- ========================
CREATE TABLE IF NOT EXISTS hd_pedidos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Para qué día. "Pasar a mañana" la cambia; fecha_original no.
  fecha               DATE NOT NULL,
  fecha_original      DATE NOT NULL,
  que                 TEXT NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('lleva_material', 'trae_material', 'compra', 'entre_depositos', 'taller', 'otro')),
  hacia_ot_id         BIGINT,
  hacia_lugar_id      UUID REFERENCES hd_lugares(id) ON DELETE SET NULL,
  hacia_texto         TEXT,
  desde_ot_id         BIGINT,
  desde_lugar_id      UUID REFERENCES hd_lugares(id) ON DELETE SET NULL,
  desde_texto         TEXT,
  urgencia            TEXT NOT NULL DEFAULT 'hoy' CHECK (urgencia IN ('frena', 'hora', 'cliente', 'hoy', 'cuando_se_pueda')),
  hora_limite         TIME,
  -- Hora acordada (Ortega: "a las 15"). Pasa al viaje como hora fija.
  hora_fija           TIME,
  no_antes_de         TIME,
  duracion_min        INTEGER CHECK (duracion_min > 0),
  carga_deposito      TIME,
  necesita            TEXT NOT NULL DEFAULT 'cualquiera' CHECK (necesita IN ('cualquiera', 'camion', 'hidrogrua')),
  pidio_persona_id    UUID REFERENCES personal(id) ON DELETE SET NULL,
  pidio_externa_id    UUID REFERENCES pan_personas_externas(id) ON DELETE SET NULL,
  pidio_texto         TEXT,
  canal               TEXT NOT NULL DEFAULT 'telefono' CHECK (canal IN ('telefono', 'whatsapp', 'telegram', 'link', 'cajon', 'sugerido', 'deposito', 'oficina')),
  -- El estado que se guarda es el grueso; el que se ve (esperando que ya venció, hecho por
  -- su viaje) lo calcula estado.ts con la hora.
  estado              TEXT NOT NULL DEFAULT 'sin_camion' CHECK (estado IN ('sin_camion', 'esperando', 'en_camion', 'hecho', 'anulado')),
  esperando_motivo    TEXT,
  esperando_hasta     TIMESTAMPTZ,
  -- Varios pedidos pueden apuntar al mismo viaje (van al mismo lugar en la misma vuelta).
  viaje_id            UUID REFERENCES hd_viajes(id) ON DELETE SET NULL,
  orden_manual        NUMERIC,
  cajon_pendiente_id  UUID,
  -- Sugeridos de la noche anterior: un "No hace falta" es una fila anulada con la regla, y
  -- el UNIQUE hace que no vuelva a aparecer para esa obra y ese día.
  sugerido_regla      TEXT CHECK (sugerido_regla IN ('arranca', 'termina')),
  sugerido_ot_id      BIGINT,
  -- El último "No pude" (no es un estado: el pedido vuelve a la cola). En rojo hasta que
  -- el coordinador lo mira.
  ultimo_no_pudo      JSONB,
  no_pudo_visto       BOOLEAN NOT NULL DEFAULT true,
  intentos            INTEGER NOT NULL DEFAULT 0,
  nota                TEXT,
  anulado_motivo      TEXT,
  anulado_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hd_pedidos_fecha ON hd_pedidos(fecha);
CREATE INDEX IF NOT EXISTS idx_hd_pedidos_viaje ON hd_pedidos(viaje_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_pedidos_sugerido ON hd_pedidos(fecha_original, sugerido_regla, sugerido_ot_id)
  WHERE sugerido_regla IS NOT NULL;

-- ========================
-- Instrucciones por obra del día (§10)
-- La clave es (fecha, OT) y NO la cuadrilla: si la obra se mueve a otra cuadrilla el
-- mismo día, la instrucción la sigue.
-- ========================
CREATE TABLE IF NOT EXISTS hd_instrucciones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  odoo_ot_id         BIGINT NOT NULL,
  cuadrilla_odoo_id  BIGINT,
  hora_inicio        TIME,
  hoy                TEXT,
  chips              TEXT[] NOT NULL DEFAULT '{}',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  UNIQUE (fecha, odoo_ot_id)
);

-- ========================
-- Ausencias previstas (§5). No se borran: se anulan.
-- ========================
CREATE TABLE IF NOT EXISTS hd_ausencias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id   UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  desde        DATE NOT NULL,
  hasta        DATE,                                   -- null = sin fecha de alta
  -- Los de la asistencia de Odoo (x_parte_diario.x_tipo_ausencia) con nombre de pantalla,
  -- más "trámite" (parciales), "suspendido" y "sin aviso". accidente → art.
  tipo         TEXT NOT NULL CHECK (tipo IN ('enfermedad', 'art', 'personal', 'vacaciones', 'tramite', 'suspendido', 'sin_aviso')),
  -- Parciales: "llega a las 10" (hora_desde) o "se retira a las 14" (hora_hasta).
  hora_desde   TIME,
  hora_hasta   TIME,
  nota         TEXT,
  origen       TEXT NOT NULL DEFAULT 'planificador' CHECK (origen IN ('planificador', 'asistencia')),
  creada_por   UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulada_at   TIMESTAMPTZ,
  anulada_por  UUID REFERENCES user_profiles(id),
  CHECK (hasta IS NULL OR hasta >= desde)
);
CREATE INDEX IF NOT EXISTS idx_hd_ausencias_persona ON hd_ausencias(persona_id, desde);

-- ========================
-- Links y envíos: uno por persona y día (§11, §12, §14 "Seguridad del link")
-- ========================
CREATE TABLE IF NOT EXISTS hd_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 32 caracteres sin ambiguos (ver src/lib/hoja-dia/tokens.ts). No dice nada.
  token             TEXT NOT NULL UNIQUE CHECK (token ~ '^[2-9A-HJ-NP-Za-km-z]{32}$'),
  fecha             DATE NOT NULL,
  persona_id        UUID REFERENCES personal(id) ON DELETE CASCADE,
  externa_id        UUID REFERENCES pan_personas_externas(id) ON DELETE CASCADE,
  rol               TEXT NOT NULL CHECK (rol IN ('a_cargo', 'chofer')),
  cuadrilla_odoo_id BIGINT,                              -- la del capataz
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por        UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  -- 23:59 del día siguiente, en Buenos Aires.
  expira_at         TIMESTAMPTZ NOT NULL,
  anulado_at        TIMESTAMPTZ,
  anulado_motivo    TEXT,
  -- Envío. "Enviada" es: Telegram contestó ok, o la persona marcó que lo mandó a mano.
  enviada_at        TIMESTAMPTZ,
  enviada_por       UUID REFERENCES user_profiles(id),
  enviada_canal     TEXT CHECK (enviada_canal IN ('telegram', 'manual')),
  reenviada_at      TIMESTAMPTZ,
  abierta_at        TIMESTAMPTZ,                         -- primera vez (y después de cada cambio)
  ultima_vista_at   TIMESTAMPTZ,
  recibida_at       TIMESTAMPTZ,                         -- "Recibido" o "Entendido"
  -- El último aviso de cambio y qué decía (en palabras).
  cambio_at         TIMESTAMPTZ,
  cambio_diffs      JSONB,
  -- Las fotos: lo último avisado, lo primero enviado, lo que confirmó con Recibido y lo
  -- que el coordinador dio por bueno sin avisar ("No hace falta avisar").
  snap              JSONB,
  snap_primero      JSONB,
  snap_recibido     JSONB,
  snap_ok           JSONB,
  ok_at             TIMESTAMPTZ,
  version           INTEGER NOT NULL DEFAULT 0,          -- sube con cada envío o aviso
  version_vista     INTEGER NOT NULL DEFAULT 0,
  version_recibida  INTEGER NOT NULL DEFAULT 0,
  -- Pedidos públicos por token en el último minuto (límite simple de abuso): los toques
  -- (POST) y las lecturas (GET de la hoja y de los archivos) por separado. Los cuenta
  -- hd_contar(), atómica.
  pedidos_ventana   TIMESTAMPTZ,
  pedidos_n         INTEGER NOT NULL DEFAULT 0,
  lecturas_ventana  TIMESTAMPTZ,
  lecturas_n        INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((persona_id IS NULL) <> (externa_id IS NULL))
);
-- Un link vigente por persona y día (si cambia de rol, se anula y se crea otro).
ALTER TABLE hd_links ADD COLUMN IF NOT EXISTS lecturas_ventana TIMESTAMPTZ;
ALTER TABLE hd_links ADD COLUMN IF NOT EXISTS lecturas_n INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_links_persona ON hd_links(fecha, persona_id) WHERE persona_id IS NOT NULL AND anulado_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_links_externa ON hd_links(fecha, externa_id) WHERE externa_id IS NOT NULL AND anulado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hd_links_fecha ON hd_links(fecha);

-- ========================
-- Telegram
-- ========================

-- Códigos de vinculación: t.me/<bot>?start=<codigo>. De un solo uso, por persona.
CREATE TABLE IF NOT EXISTS hd_telegram_codigos (
  codigo      TEXT PRIMARY KEY CHECK (codigo ~ '^[A-Za-z0-9_-]{8,64}$'),
  persona_id  UUID REFERENCES personal(id) ON DELETE CASCADE,
  externa_id  UUID REFERENCES pan_personas_externas(id) ON DELETE CASCADE,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por  UUID REFERENCES user_profiles(id) DEFAULT auth.uid(),
  expira_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  usado_at    TIMESTAMPTZ,
  chat_id     BIGINT,
  CHECK ((persona_id IS NULL) <> (externa_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_hd_tg_codigos_persona ON hd_telegram_codigos(persona_id);

-- Cada mensaje que salió por el bot: para editarlo después ("✓ Recibido 20:16") y para
-- saber qué se le dijo a quién.
CREATE TABLE IF NOT EXISTS hd_telegram_mensajes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha          DATE,
  link_id        UUID REFERENCES hd_links(id) ON DELETE SET NULL,
  viaje_id       UUID REFERENCES hd_viajes(id) ON DELETE SET NULL,
  persona_id     UUID REFERENCES personal(id) ON DELETE SET NULL,
  externa_id     UUID REFERENCES pan_personas_externas(id) ON DELETE SET NULL,
  chat_id        BIGINT NOT NULL,
  message_id     BIGINT,
  tipo           TEXT NOT NULL CHECK (tipo IN ('hoja', 'cambio', 'viaje_nuevo', 'operario', 'deposito', 'vinculado', 'otro')),
  texto          TEXT NOT NULL,
  botones        JSONB,
  version        INTEGER,
  ok             BOOLEAN NOT NULL,
  error          TEXT,
  respuesta      TEXT,                                   -- recibido | entendido | hecho | no_pude:<motivo>
  respondido_at  TIMESTAMPTZ,
  editado_at     TIMESTAMPTZ,
  enviado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_por    UUID REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hd_tg_mensajes_link ON hd_telegram_mensajes(link_id);
CREATE INDEX IF NOT EXISTS idx_hd_tg_mensajes_chat ON hd_telegram_mensajes(chat_id, message_id);

-- Idempotencia del webhook: Telegram reintenta si no contestamos 200 a tiempo.
CREATE TABLE IF NOT EXISTS hd_telegram_updates (
  update_id    BIGINT PRIMARY KEY,
  tipo         TEXT,
  recibido_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================
-- Historial: sólo se le agregan filas
-- ========================
CREATE TABLE IF NOT EXISTS hd_historial (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha       DATE,
  -- Qué se tocó: hoja | integrante | viaje | pedido | ausencia | instruccion | camion |
  -- link | telegram | lugar | precarga | persona
  entidad     TEXT NOT NULL,
  entidad_id  TEXT,
  hoja_id     UUID,
  viaje_id    UUID,
  pedido_id   UUID,
  accion      TEXT NOT NULL,
  -- En palabras, como lo lee el coordinador: "Ramírez pasó a la Cuadrilla 3".
  texto       TEXT NOT NULL,
  -- Las filas de antes y de después de cada tabla tocada: [{tabla, id, antes, despues}].
  -- De acá sale el Deshacer.
  cambios     JSONB NOT NULL DEFAULT '[]',
  por         UUID REFERENCES user_profiles(id),
  por_texto   TEXT,
  -- escritorio | link | telegram | sistema
  origen      TEXT NOT NULL DEFAULT 'escritorio',
  deshecho_at TIMESTAMPTZ,
  deshecho_por UUID REFERENCES user_profiles(id),
  deshace_a   UUID REFERENCES hd_historial(id)
);
CREATE INDEX IF NOT EXISTS idx_hd_historial_fecha ON hd_historial(fecha, at DESC);
CREATE INDEX IF NOT EXISTS idx_hd_historial_hoja ON hd_historial(hoja_id);
CREATE INDEX IF NOT EXISTS idx_hd_historial_viaje ON hd_historial(viaje_id);
CREATE INDEX IF NOT EXISTS idx_hd_historial_pedido ON hd_historial(pedido_id);

-- Inmutable salvo la marca de "deshecho" (que es lo único que el Deshacer escribe).
CREATE OR REPLACE FUNCTION hd_historial_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El historial de la Hoja del día no se borra';
  END IF;
  IF (to_jsonb(NEW) - 'deshecho_at' - 'deshecho_por') IS DISTINCT FROM (to_jsonb(OLD) - 'deshecho_at' - 'deshecho_por') THEN
    RAISE EXCEPTION 'El historial de la Hoja del día no se edita';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hd_historial_inmutable ON hd_historial;
CREATE TRIGGER hd_historial_inmutable BEFORE UPDATE OR DELETE ON hd_historial
  FOR EACH ROW EXECUTE FUNCTION hd_historial_inmutable();

-- ========================
-- updated_at, versión y parámetros
-- ========================
CREATE OR REPLACE FUNCTION hd_tocar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DO $tocar$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hd_hojas', 'hd_camiones_dia', 'hd_viajes', 'hd_pedidos', 'hd_instrucciones',
                           'hd_ausencias', 'hd_links', 'hd_lugares']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS hd_tocar ON %I', t);
    EXECUTE format('CREATE TRIGGER hd_tocar BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hd_tocar()', t);
  END LOOP;
END
$tocar$;

CREATE OR REPLACE FUNCTION hd_parametro_historial()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    INSERT INTO hd_parametros_historial (clave, antes, despues, por)
    VALUES (NEW.clave, OLD.valor, NEW.valor, auth.uid());
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hd_parametro_historial ON hd_parametros;
CREATE TRIGGER hd_parametro_historial BEFORE UPDATE ON hd_parametros
  FOR EACH ROW EXECUTE FUNCTION hd_parametro_historial();

-- ============================================================
-- RLS: cerrada por permiso.
-- ============================================================
DO $rls$
DECLARE t TEXT;
BEGIN
  -- Lo del módulo: se lee con `hoja-dia` y se escribe con `hoja-dia` en editar.
  FOREACH t IN ARRAY ARRAY['hd_hojas', 'hd_integrantes', 'hd_camiones_dia', 'hd_viajes', 'hd_instrucciones',
                           'hd_lugares', 'hd_links', 'hd_parametros', 'hd_parametros_historial']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: leer" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: leer" ON %I FOR SELECT TO authenticated USING ((SELECT hd_puede_ver()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hd_hojas', 'hd_integrantes', 'hd_camiones_dia', 'hd_viajes', 'hd_instrucciones',
                           'hd_lugares', 'hd_links']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: cargar" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: cargar" ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT hd_puede_editar()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: editar" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: editar" ON %I FOR UPDATE TO authenticated USING ((SELECT hd_puede_editar())) WITH CHECK ((SELECT hd_puede_editar()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Hoja del día: borrar" ON %I', t);
    EXECUTE format('CREATE POLICY "Hoja del día: borrar" ON %I FOR DELETE TO authenticated USING ((SELECT hd_puede_editar()))', t);
  END LOOP;
END
$rls$;

-- Pedidos: también los crean Planificación (desde el cajón) y el Pañol (el depósito pide un
-- viaje), los dos en editar. Ponerlos en un camión es /api/hoja-dia/viajes (hoja-dia).
ALTER TABLE hd_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hoja del día: leer pedidos" ON hd_pedidos;
CREATE POLICY "Hoja del día: leer pedidos" ON hd_pedidos FOR SELECT TO authenticated
  USING ((SELECT hd_puede_ver()) OR (SELECT hd_nivel('planificacion')) IS NOT NULL OR (SELECT hd_nivel('panol')) IS NOT NULL);
DROP POLICY IF EXISTS "Hoja del día: cargar pedidos" ON hd_pedidos;
CREATE POLICY "Hoja del día: cargar pedidos" ON hd_pedidos FOR INSERT TO authenticated
  WITH CHECK ((SELECT hd_puede_editar()) OR (SELECT hd_nivel('planificacion')) = 'editar' OR (SELECT hd_nivel('panol')) = 'editar');
DROP POLICY IF EXISTS "Hoja del día: editar pedidos" ON hd_pedidos;
CREATE POLICY "Hoja del día: editar pedidos" ON hd_pedidos FOR UPDATE TO authenticated
  USING ((SELECT hd_puede_editar())) WITH CHECK ((SELECT hd_puede_editar()));
DROP POLICY IF EXISTS "Hoja del día: borrar pedidos" ON hd_pedidos;
CREATE POLICY "Hoja del día: borrar pedidos" ON hd_pedidos FOR DELETE TO authenticated
  USING ((SELECT hd_puede_editar()));

-- Ausencias: también RRHH desde Personal (vacaciones con semanas de anticipación).
ALTER TABLE hd_ausencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hoja del día: leer ausencias" ON hd_ausencias;
CREATE POLICY "Hoja del día: leer ausencias" ON hd_ausencias FOR SELECT TO authenticated
  USING ((SELECT hd_puede_ver()) OR (SELECT hd_nivel('personal')) IS NOT NULL);
DROP POLICY IF EXISTS "Hoja del día: cargar ausencias" ON hd_ausencias;
CREATE POLICY "Hoja del día: cargar ausencias" ON hd_ausencias FOR INSERT TO authenticated
  WITH CHECK ((SELECT hd_puede_editar()) OR (SELECT hd_nivel('personal')) = 'editar');
DROP POLICY IF EXISTS "Hoja del día: editar ausencias" ON hd_ausencias;
CREATE POLICY "Hoja del día: editar ausencias" ON hd_ausencias FOR UPDATE TO authenticated
  USING ((SELECT hd_puede_editar()) OR (SELECT hd_nivel('personal')) = 'editar')
  WITH CHECK ((SELECT hd_puede_editar()) OR (SELECT hd_nivel('personal')) = 'editar');
REVOKE DELETE ON hd_ausencias FROM authenticated;

-- Historial: lo lee quien ve el módulo. LO ESCRIBE SÓLO EL SERVIDOR (service role), nunca
-- el navegador: de `cambios` sale lo que el Deshacer vuelve a escribir, así que una fila
-- insertada a mano sería una puerta para escribir otras tablas con la sesión de quien toca
-- "Deshacer" (B2 de la revisión). El servidor la anota después de verificar el permiso de
-- la ruta, y el Deshacer además valida las tablas (src/lib/hoja-dia/deshacer-regla.ts).
-- Nadie la edita ni la borra (trigger); la marca de "deshecho" también la pone el servidor.
ALTER TABLE hd_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hoja del día: leer historial" ON hd_historial;
CREATE POLICY "Hoja del día: leer historial" ON hd_historial FOR SELECT TO authenticated
  USING ((SELECT hd_puede_ver()));
DROP POLICY IF EXISTS "Hoja del día: anotar historial" ON hd_historial;
DROP POLICY IF EXISTS "Hoja del día: marcar deshecho" ON hd_historial;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON hd_historial FROM anon, authenticated;

-- Los links: el token es la llave del celular del capataz o del chofer (con él se marca
-- "Hecho" por el chofer). Los lee sólo quien puede editar la hoja; la pantalla de sólo
-- lectura los recibe del servidor sin el token.
DROP POLICY IF EXISTS "Hoja del día: leer" ON hd_links;
CREATE POLICY "Hoja del día: leer" ON hd_links FOR SELECT TO authenticated USING ((SELECT hd_puede_editar()));

-- Parámetros: los cambia un admin, y sólo el valor.
DROP POLICY IF EXISTS "Hoja del día: admin cambia parámetros" ON hd_parametros;
CREATE POLICY "Hoja del día: admin cambia parámetros" ON hd_parametros FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');
REVOKE INSERT, UPDATE, DELETE ON hd_parametros FROM authenticated;
GRANT UPDATE (valor) ON hd_parametros TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON hd_parametros_historial FROM authenticated;

-- Telegram: ni lectura desde el navegador. Los códigos, los mensajes y los updates los
-- tocan sólo las rutas del servidor (service role).
ALTER TABLE hd_telegram_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE hd_telegram_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hd_telegram_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hoja del día: leer mensajes" ON hd_telegram_mensajes;
CREATE POLICY "Hoja del día: leer mensajes" ON hd_telegram_mensajes FOR SELECT TO authenticated
  USING ((SELECT hd_puede_ver()));
REVOKE ALL ON hd_telegram_codigos, hd_telegram_updates FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON hd_telegram_mensajes FROM anon, authenticated;

-- Nada para anon en ninguna tabla del módulo.
REVOKE ALL ON hd_hojas, hd_integrantes, hd_camiones_dia, hd_viajes, hd_pedidos, hd_instrucciones, hd_ausencias,
              hd_links, hd_lugares, hd_historial, hd_parametros, hd_parametros_historial, hd_telegram_mensajes
  FROM anon;

-- Las funciones: nada para anon.
DO $fn$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['hd_nivel(text)', 'hd_puede_ver()', 'hd_puede_editar()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END
$fn$;

-- ========================
-- Escrituras en bloque (I4 y el Deshacer)
-- ========================
-- Aplica una lista de escrituras sobre tablas del módulo EN UNA TRANSACCIÓN: o todas o
-- ninguna. La usan el Deshacer (vuelve las filas a como estaban) y el servidor cuando un
-- gesto falla a mitad (deshace lo que llegó a escribir). Cada una puede exigir cómo está la
-- fila ahora (`esperado`, sin updated_at; null = que no exista): si otra persona la cambió
-- en el medio, no se aplica nada (HD_CAMBIO).
--
-- SECURITY INVOKER: corre con la sesión de quien llama y la RLS de cada tabla decide. Sólo
-- tablas hd_* de la lista: no es una puerta a otras tablas.
--
-- p_ops: [{ op: "insertar" | "actualizar" | "borrar", tabla, id, valores?, esperado? }]
-- Devuelve [{ tabla, id, antes, despues }] (para el historial).
CREATE OR REPLACE FUNCTION hd_aplicar(p_ops JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_op      JSONB;
  v_tabla   TEXT;
  v_id      UUID;
  v_antes   JSONB;
  v_despues JSONB;
  v_valores JSONB;
  v_cols    TEXT;
  v_set     TEXT;
  v_out     JSONB := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_ops) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'hd_aplicar: se esperaba una lista';
  END IF;
  FOR v_op IN SELECT x FROM jsonb_array_elements(p_ops) AS t(x) LOOP
    v_tabla := v_op->>'tabla';
    IF v_tabla IS NULL OR v_tabla NOT IN ('hd_hojas', 'hd_integrantes', 'hd_camiones_dia', 'hd_viajes', 'hd_pedidos',
                                          'hd_instrucciones', 'hd_ausencias', 'hd_links', 'hd_lugares') THEN
      RAISE EXCEPTION 'hd_aplicar: tabla no permitida (%)', v_tabla;
    END IF;
    v_id := (v_op->>'id')::uuid;
    EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x.id = $1 FOR UPDATE', v_tabla) INTO v_antes USING v_id;

    IF v_op ? 'esperado' THEN
      IF jsonb_typeof(v_op->'esperado') = 'null' THEN
        IF v_antes IS NOT NULL THEN RAISE EXCEPTION 'HD_CAMBIO: % % ya existe', v_tabla, v_id; END IF;
      ELSIF v_antes IS NULL OR (v_antes - 'updated_at') IS DISTINCT FROM ((v_op->'esperado') - 'updated_at') THEN
        RAISE EXCEPTION 'HD_CAMBIO: % % cambió', v_tabla, v_id;
      END IF;
    END IF;

    CASE v_op->>'op'
      WHEN 'borrar' THEN
        IF v_antes IS NOT NULL THEN
          EXECUTE format('DELETE FROM %I WHERE id = $1', v_tabla) USING v_id;
        END IF;
      WHEN 'insertar', 'actualizar' THEN
        v_valores := (v_op->'valores') - 'updated_at';
        IF v_op->>'op' = 'actualizar' THEN
          v_valores := v_valores - 'id' - 'created_at';
          IF v_antes IS NULL THEN RAISE EXCEPTION 'HD_CAMBIO: % % ya no existe', v_tabla, v_id; END IF;
        ELSE
          v_valores := jsonb_set(v_valores, '{id}', to_jsonb(v_id::text));
        END IF;
        SELECT string_agg(quote_ident(c.column_name), ', '), string_agg(format('%I = r.%I', c.column_name, c.column_name), ', ')
          INTO v_cols, v_set
          FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = v_tabla AND v_valores ? c.column_name;
        IF v_cols IS NULL THEN RAISE EXCEPTION 'hd_aplicar: sin columnas para %', v_tabla; END IF;
        IF v_op->>'op' = 'insertar' THEN
          EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_record(NULL::%I, $1) r', v_tabla, v_cols, v_cols, v_tabla) USING v_valores;
        ELSE
          EXECUTE format('UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, $1) r WHERE t.id = $2', v_tabla, v_set, v_tabla) USING v_valores, v_id;
        END IF;
      ELSE
        RAISE EXCEPTION 'hd_aplicar: operación desconocida (%)', v_op->>'op';
    END CASE;

    EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x.id = $1', v_tabla) INTO v_despues USING v_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('tabla', v_tabla, 'id', v_id, 'antes', v_antes, 'despues', v_despues));
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION hd_aplicar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hd_aplicar(jsonb) TO authenticated, service_role;

-- El límite de abuso del link público: suma uno en la ventana del último minuto y devuelve
-- cuántos van, en UNA sentencia (dos pedidos a la vez no leen el mismo número). Sólo la
-- usa el servidor (service role). p_tipo: 'toque' (POST) o 'lectura' (GET y archivos).
CREATE OR REPLACE FUNCTION hd_contar(p_link UUID, p_tipo TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_n INTEGER;
BEGIN
  IF p_tipo = 'toque' THEN
    UPDATE hd_links SET
      pedidos_n = CASE WHEN pedidos_ventana > now() - interval '1 minute' THEN pedidos_n + 1 ELSE 1 END,
      pedidos_ventana = CASE WHEN pedidos_ventana > now() - interval '1 minute' THEN pedidos_ventana ELSE now() END
    WHERE id = p_link RETURNING pedidos_n INTO v_n;
  ELSE
    UPDATE hd_links SET
      lecturas_n = CASE WHEN lecturas_ventana > now() - interval '1 minute' THEN lecturas_n + 1 ELSE 1 END,
      lecturas_ventana = CASE WHEN lecturas_ventana > now() - interval '1 minute' THEN lecturas_ventana ELSE now() END
    WHERE id = p_link RETURNING lecturas_n INTO v_n;
  END IF;
  RETURN coalesce(v_n, 0);
END;
$$;
REVOKE ALL ON FUNCTION hd_contar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hd_contar(uuid, text) TO service_role;

-- ========================
-- Fotos de remitos (fase 1, opcionales). Privado: se sirven firmadas por el servidor.
-- Prefijo: viajes/{fecha}/{viaje_id}/{archivo}
-- ========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('hoja-dia', 'hoja-dia', false)
ON CONFLICT (id) DO NOTHING;
-- La foto del remito: sólo imágenes, hasta 5 MB (la sube el servidor después de validar el
-- token del chofer: /api/public/hoja/[token]/viaje/[id]/foto).
UPDATE storage.buckets SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'hoja-dia';

DROP POLICY IF EXISTS "Hoja del día: leer fotos" ON storage.objects;
CREATE POLICY "Hoja del día: leer fotos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'hoja-dia' AND hd_puede_ver());

NOTIFY pgrst, 'reload schema';
