-- ============================================================
-- AndamiosOS — Sistemas (reportar errores, correcciones y mejoras del sistema)
--
-- Propuesta y decisiones de JS en docs/sistemas/propuesta.md (§2 «Datos» y §5). Contrato para
-- quienes construyen la API y las pantallas: docs/sistemas/contrato.md.
--
-- 1. CUALQUIERA CON SESIÓN REPORTA; REVISA SÓLO QUIEN TIENE EL MÓDULO `sistemas` EN «editar».
--    `sistemas` es `exigeExplicito` en src/lib/auth/acceso.ts: el admin NO lo trae solo
--    (las capturas pueden mostrar sueldos o lo de Socios). sis_puede_revisar() lo mide igual
--    que la app y SIN el atajo de admin. Al 17/10 lo tienen JS y Juan Pablo Mansilla (§7).
--
-- 2. NADIE VE REPORTES AJENOS: la RLS de lectura es «el mío o soy revisor». En esta etapa no
--    hay «me pasa lo mismo» justamente por eso (para sumarse habría que ver el de otro).
--
-- 3. SIN POLÍTICAS DE ESCRITURA. Todo se escribe por RPC SECURITY DEFINER que chequean con
--    auth.uid() y dejan la línea de tiempo en sis_reporte_eventos:
--      · sis_crear_reporte(p)                 — cualquiera; 20 por persona por día; las
--        capturas tienen que estar YA subidas al bucket `sistemas` dentro de <su uid>/.
--      · sis_revisar_reporte(p_id, p)         — revisores: estado, prioridad, descarte con
--        motivo, duplicado y el mensaje para quien reportó.
--      · sis_comentar(p_id, p_texto, p_como)  — quien reportó ('usuario') o un revisor
--        ('sistemas'). En la pantalla los revisores firman «Sistemas», nunca con su nombre.
--      · sis_confirmar(p_id, p_ok, p_texto)   — quien reportó, sobre uno resuelto: «Ya está,
--        gracias» o «Sigue pasando» (lo reabre a 'visto').
--    Los avisos (campanita y Slack) NO salen de acá: los arma la API con crearAlertas(), que
--    necesita la service role porque la RLS de `alertas` no deja insertar a campo/depósito.
--
-- 4. EL #N es `numero` (identity): es lo que se dice en voz alta y lo que va en el commit
--    («Sistemas #N»). El id uuid es el que viaja en las URLs de la API.
--
-- 5. LO QUE VE QUIEN REPORTÓ de la línea de tiempo: 'creado', 'comentario' y 'estado'. La
--    prioridad y el duplicado son internos de Sistemas (la RLS de eventos los filtra), y el
--    autor de cada evento no se puede leer con la sesión (permiso por columna). OJO: en
--    sis_reportes, quien reportó SÍ puede leer por PostgREST la prioridad y el duplicado_de de
--    lo suyo (la RLS es por fila; «Mis reportes» los necesita para el cartel del duplicado).
--    No son secretos: que la pantalla no los muestre es una decisión de la interfaz.
--
-- 6. Extiende el CHECK de direccion_auditoria con 'permiso_sistemas': quién dio o sacó el
--    módulo queda registrado como con Socios (src/lib/auth/explicitos-servidor.ts).
--
-- 7. Les da `sistemas: editar` a JS y a Juan Pablo Mansilla (decisión 2 de §5), por mail.
--    Idempotente: si ya lo tienen, no toca nada. Después se administra desde Usuarios.
--
-- Ensayar:  node --env-file=.env.local scripts/probar-migracion.mjs <este archivo>
-- Aplicar:  node --env-file=.env.local scripts/apply-migration.mjs <este archivo>
-- (NUNCA supabase db push.) Va antes que 20261022000002 (bucket) y 20261022000003
-- (recorridos). Idempotente, sin BEGIN/COMMIT propios: el probador la envuelve en su ROLLBACK.
-- La app tolera que todavía no esté aplicada: la API contesta «falta terminar la instalación».
-- ============================================================

-- ============================================================
-- Permiso
-- ============================================================
CREATE OR REPLACE FUNCTION sis_puede_revisar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND p.permisos->>'sistemas' = 'editar'
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

-- ============================================================
-- Tablas
-- ============================================================
CREATE TABLE IF NOT EXISTS sis_reportes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              BIGINT GENERATED ALWAYS AS IDENTITY,
  tipo                TEXT NOT NULL CONSTRAINT sis_reportes_tipo CHECK (tipo IN ('error', 'correccion', 'mejora')),
  descripcion         TEXT NOT NULL CONSTRAINT sis_reportes_descripcion CHECK (char_length(btrim(descripcion)) BETWEEN 3 AND 5000),
  -- «¿Te frena el trabajo?» Sólo tiene sentido en un error (el RPC lo fuerza a false en el resto).
  frena               BOOLEAN NOT NULL DEFAULT false,
  estado              TEXT NOT NULL DEFAULT 'nuevo'
                        CONSTRAINT sis_reportes_estado CHECK (estado IN ('nuevo', 'visto', 'en_curso', 'resuelto', 'descartado')),
  motivo_descarte     TEXT CONSTRAINT sis_reportes_motivo CHECK (motivo_descarte IS NULL OR motivo_descarte IN
                        ('no_es_del_sistema', 'no_se_va_a_hacer', 'ya_existe', 'duplicado')),
  duplicado_de        UUID REFERENCES sis_reportes(id) ON DELETE SET NULL,
  -- La pone Sistemas, nunca quien reporta. NULL = «Sin definir».
  prioridad           TEXT CONSTRAINT sis_reportes_prioridad CHECK (prioridad IS NULL OR prioridad IN ('alta', 'media', 'baja')),
  -- Dónde pasó: la ruta ya saneada por el servidor (sin tokens ni mails), el módulo de
  -- acceso.ts que le corresponde y el título de la pantalla.
  ruta                TEXT CONSTRAINT sis_reportes_ruta CHECK (ruta IS NULL OR char_length(ruta) <= 2000),
  modulo              TEXT CONSTRAINT sis_reportes_modulo CHECK (modulo IS NULL OR char_length(modulo) <= 60),
  titulo_pantalla     TEXT CONSTRAINT sis_reportes_titulo CHECK (titulo_pantalla IS NULL OR char_length(titulo_pantalla) <= 200),
  -- El deploy del navegador (NEXT_PUBLIC_SHA) y el del servidor: si difieren, la pestaña estaba vieja.
  sha_cliente         TEXT CONSTRAINT sis_reportes_sha_cliente CHECK (sha_cliente IS NULL OR char_length(sha_cliente) <= 64),
  sha_servidor        TEXT CONSTRAINT sis_reportes_sha_servidor CHECK (sha_servidor IS NULL OR char_length(sha_servidor) <= 64),
  -- Navegador, pantalla, últimos errores, pedidos fallidos y pantallas anteriores (ContextoCliente
  -- de src/lib/sistemas/tipos.ts). El servidor lo deja en menos de 50 KB; acá hay margen.
  contexto            JSONB NOT NULL DEFAULT '{}'::jsonb
                        CONSTRAINT sis_reportes_contexto CHECK (jsonb_typeof(contexto) = 'object' AND pg_column_size(contexto) < 65536),
  creado_por          UUID NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Último mensaje o cambio: ordena «Mis reportes» y la bandeja.
  ultima_actividad_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Cuándo pasó a resuelto o descartado (las métricas de «para resolver»).
  cerrado_at          TIMESTAMPTZ,
  -- La respuesta de quien reportó a un resuelto: true = «Ya está, gracias». NULL = no contestó.
  -- «Sigue pasando» lo reabre y lo vuelve a NULL.
  confirmado_ok       BOOLEAN,
  CONSTRAINT sis_reportes_numero_unico UNIQUE (numero),
  CONSTRAINT sis_reportes_frena_solo_error CHECK (NOT frena OR tipo = 'error'),
  CONSTRAINT sis_reportes_no_es_su_duplicado CHECK (duplicado_de IS NULL OR duplicado_de <> id),
  -- Descartado ⇔ con motivo. Un original sólo lo tiene un descartado como 'duplicado' (al revés
  -- lo asegura sis_revisar_reporte: si el original se borrara, el FK lo deja en NULL sin chocar).
  CONSTRAINT sis_reportes_descarte CHECK ((estado = 'descartado') = (motivo_descarte IS NOT NULL)),
  CONSTRAINT sis_reportes_duplicado CHECK (duplicado_de IS NULL OR motivo_descarte = 'duplicado')
);
CREATE INDEX IF NOT EXISTS sis_reportes_creador ON sis_reportes (creado_por, ultima_actividad_at DESC);
CREATE INDEX IF NOT EXISTS sis_reportes_estado ON sis_reportes (estado, created_at);
CREATE INDEX IF NOT EXISTS sis_reportes_duplicado ON sis_reportes (duplicado_de) WHERE duplicado_de IS NOT NULL;
-- El límite de 20 por día cuenta por persona y fecha.
CREATE INDEX IF NOT EXISTS sis_reportes_creador_fecha ON sis_reportes (creado_por, created_at DESC);

-- Las imágenes: la captura (ya aplanada con las marcas: la original sin tapar nunca se sube) y
-- las que sumó la persona. Máximo 6 por reporte: `orden` va de 0 a 5 y no se repite.
CREATE TABLE IF NOT EXISTS sis_reporte_capturas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id  UUID NOT NULL REFERENCES sis_reportes(id) ON DELETE CASCADE,
  -- Ruta en el bucket privado `sistemas`: <uid de quien reportó>/<uuid>.<ext>
  path        TEXT NOT NULL CONSTRAINT sis_capturas_path_unico UNIQUE,
  mime        TEXT NOT NULL CONSTRAINT sis_capturas_mime CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes       INTEGER NOT NULL CONSTRAINT sis_capturas_bytes CHECK (bytes BETWEEN 1 AND 5242880),
  ancho       INTEGER CONSTRAINT sis_capturas_ancho CHECK (ancho IS NULL OR ancho BETWEEN 1 AND 10000),
  alto        INTEGER CONSTRAINT sis_capturas_alto CHECK (alto IS NULL OR alto BETWEEN 1 AND 10000),
  orden       SMALLINT NOT NULL CONSTRAINT sis_capturas_orden CHECK (orden BETWEEN 0 AND 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sis_capturas_orden_unico UNIQUE (reporte_id, orden)
);

-- La línea de tiempo: el alta, los mensajes, los cambios de estado y prioridad y el duplicado.
-- `lado` dice de qué lado de la conversación está: 'sistemas' se firma «Sistemas» en pantalla.
-- No se edita ni se borra (no hay grants de escritura): es el acta.
CREATE TABLE IF NOT EXISTS sis_reporte_eventos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporte_id  UUID NOT NULL REFERENCES sis_reportes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CONSTRAINT sis_eventos_tipo CHECK (tipo IN ('creado', 'comentario', 'estado', 'prioridad', 'duplicado')),
  lado        TEXT NOT NULL CONSTRAINT sis_eventos_lado CHECK (lado IN ('usuario', 'sistemas')),
  autor_id    UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  -- Estado/prioridad anterior y nuevo (códigos); en 'duplicado', `a` es el #N del original.
  de          TEXT CONSTRAINT sis_eventos_de CHECK (de IS NULL OR char_length(de) <= 40),
  a           TEXT CONSTRAINT sis_eventos_a CHECK (a IS NULL OR char_length(a) <= 40),
  texto       TEXT CONSTRAINT sis_eventos_texto CHECK (texto IS NULL OR char_length(texto) <= 5000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sis_eventos_comentario_con_texto CHECK (tipo <> 'comentario' OR char_length(btrim(coalesce(texto, ''))) >= 1)
);
CREATE INDEX IF NOT EXISTS sis_eventos_reporte ON sis_reporte_eventos (reporte_id, id);
-- El tope de mensajes por hora de sis_comentar cuenta por autor.
CREATE INDEX IF NOT EXISTS sis_eventos_autor ON sis_reporte_eventos (autor_id, created_at DESC) WHERE tipo = 'comentario';

-- updated_at solo. El número, quién lo creó y cuándo no se tocan nunca.
CREATE OR REPLACE FUNCTION sis_reportes_tocar() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.creado_por := OLD.creado_por;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sis_reportes_tocar ON sis_reportes;
CREATE TRIGGER trg_sis_reportes_tocar BEFORE UPDATE ON sis_reportes
  FOR EACH ROW EXECUTE FUNCTION sis_reportes_tocar();

-- ============================================================
-- RLS: leer lo propio o ser revisor. Sin políticas de escritura.
-- ============================================================
ALTER TABLE sis_reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_reporte_capturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_reporte_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sistemas: leer reportes" ON sis_reportes;
CREATE POLICY "Sistemas: leer reportes" ON sis_reportes FOR SELECT TO authenticated
  USING (creado_por = (SELECT auth.uid()) OR (SELECT sis_puede_revisar()));

DROP POLICY IF EXISTS "Sistemas: leer capturas" ON sis_reporte_capturas;
CREATE POLICY "Sistemas: leer capturas" ON sis_reporte_capturas FOR SELECT TO authenticated
  USING ((SELECT sis_puede_revisar())
         OR EXISTS (SELECT 1 FROM sis_reportes r WHERE r.id = reporte_id AND r.creado_por = (SELECT auth.uid())));

-- Quien reportó ve su conversación y los cambios de estado; la prioridad y el duplicado no.
DROP POLICY IF EXISTS "Sistemas: leer eventos" ON sis_reporte_eventos;
CREATE POLICY "Sistemas: leer eventos" ON sis_reporte_eventos FOR SELECT TO authenticated
  USING ((SELECT sis_puede_revisar())
         OR (tipo IN ('creado', 'comentario', 'estado')
             AND EXISTS (SELECT 1 FROM sis_reportes r WHERE r.id = reporte_id AND r.creado_por = (SELECT auth.uid()))));

REVOKE ALL ON sis_reportes, sis_reporte_capturas, sis_reporte_eventos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON sis_reportes, sis_reporte_capturas, sis_reporte_eventos FROM authenticated;
GRANT SELECT ON sis_reportes, sis_reporte_capturas TO authenticated;
-- Los eventos, SIN autor_id: en pantalla los revisores firman «Sistemas», y quien reportó no
-- tiene que poder sacar por PostgREST cuál de ellos le contestó. La bandeja lee el autor con
-- la service role, después de exigirRevisor (src/lib/sistemas/servidor.ts, leerDetalle).
-- Un permiso por columna no achica uno por tabla: primero se saca el de la tabla entera.
REVOKE SELECT ON sis_reporte_eventos FROM authenticated;
GRANT SELECT (id, reporte_id, tipo, lado, de, a, texto, created_at) ON sis_reporte_eventos TO authenticated;

-- ============================================================
-- RPC: crear
-- ============================================================
-- p = { tipo, descripcion, frena, ruta, modulo, titulo_pantalla, sha_cliente, sha_servidor,
--       contexto, capturas: [{ path, mime, bytes, ancho, alto }] }
-- Devuelve { id, numero }. Los mensajes de error son para quien los lee en un toast.
CREATE OR REPLACE FUNCTION sis_crear_reporte(p JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tipo      TEXT := p->>'tipo';
  v_desc      TEXT := btrim(coalesce(p->>'descripcion', ''));
  v_frena     BOOLEAN := coalesce((p->>'frena')::boolean, false);
  v_contexto  JSONB := coalesce(p->'contexto', '{}'::jsonb);
  v_capturas  JSONB := coalesce(p->'capturas', '[]'::jsonb);
  v_validas   JSONB := '[]'::jsonb;
  v_hoy       INTEGER;
  v_id        UUID;
  v_numero    BIGINT;
  v_cap       JSONB;
  v_orden     INTEGER := 0;
  v_path      TEXT;
  v_mime      TEXT;
  v_bytes     BIGINT;
  v_obj       RECORD;
  v_ruta      TEXT;
  v_modulo    TEXT;
  v_sha_cli   TEXT;
  v_sha_srv   TEXT;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_uid AND activo) THEN
    RAISE EXCEPTION 'Tu sesión venció: volvé a iniciar sesión.';
  END IF;
  IF v_tipo IS NULL OR v_tipo NOT IN ('error', 'correccion', 'mejora') THEN
    RAISE EXCEPTION 'Elegí si es un error, una corrección o una mejora.';
  END IF;
  IF char_length(v_desc) < 3 THEN
    RAISE EXCEPTION 'Contá un poco más qué pasó.';
  END IF;
  IF char_length(v_desc) > 5000 THEN
    RAISE EXCEPTION 'El texto es muy largo: resumilo en menos de 5000 letras.';
  END IF;
  IF jsonb_typeof(v_contexto) <> 'object' THEN v_contexto := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_capturas) <> 'array' THEN
    RAISE EXCEPTION 'Las imágenes llegaron mal. Probá de nuevo.';
  END IF;
  IF jsonb_array_length(v_capturas) > 6 THEN
    RAISE EXCEPTION 'Podés mandar hasta 6 imágenes por reporte.';
  END IF;

  -- 20 por persona en las últimas 24 horas: alcanza de sobra para quien reporta de verdad y
  -- frena un bucle o un script. El candado (por persona, hasta el fin de la transacción) pone
  -- en fila los pedidos en paralelo: sin él, veinte a la vez pasan todos el conteo.
  PERFORM pg_advisory_xact_lock(hashtext('sis_crear:' || v_uid::text));
  SELECT count(*) INTO v_hoy FROM sis_reportes WHERE creado_por = v_uid AND created_at > now() - interval '24 hours';
  IF v_hoy >= 20 THEN
    RAISE EXCEPTION 'Llegaste a 20 reportes en un día. Si es urgente, avisale a Sistemas por otro medio.';
  END IF;

  -- Primero se validan TODAS las imágenes y recién después se inserta: un rechazo no gasta un #N.
  -- Cada imagen tiene que estar YA en el bucket y dentro de la carpeta de quien reporta: así
  -- nadie puede colgarse de un archivo ajeno. Tamaño y tipo salen de Storage, no del navegador.
  FOR v_cap IN SELECT value FROM jsonb_array_elements(v_capturas) LOOP
    v_path := v_cap->>'path';
    IF v_path IS NULL OR v_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') THEN
      RAISE EXCEPTION 'Una de las imágenes no es tuya o tiene un nombre raro. Probá de nuevo.';
    END IF;
    IF EXISTS (SELECT 1 FROM sis_reporte_capturas WHERE path = v_path) THEN
      RAISE EXCEPTION 'Una de las imágenes ya se mandó en otro reporte. Probá de nuevo.';
    END IF;
    SELECT o.metadata INTO v_obj FROM storage.objects o WHERE o.bucket_id = 'sistemas' AND o.name = v_path;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Una de las imágenes no terminó de subirse. Probá de nuevo.';
    END IF;
    v_mime := coalesce(v_obj.metadata->>'mimetype', v_cap->>'mime');
    v_bytes := coalesce((v_obj.metadata->>'size')::bigint, (v_cap->>'bytes')::bigint);
    IF v_mime IS NULL OR v_mime NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
      RAISE EXCEPTION 'Sólo se pueden mandar imágenes PNG, JPG o WEBP.';
    END IF;
    IF v_bytes IS NULL OR v_bytes < 1 OR v_bytes > 5242880 THEN
      RAISE EXCEPTION 'Cada imagen puede pesar hasta 5 MB.';
    END IF;
    v_validas := v_validas || jsonb_build_array(jsonb_build_object(
      'path', v_path, 'mime', v_mime, 'bytes', v_bytes,
      'ancho', nullif(least(greatest(coalesce((v_cap->>'ancho')::int, 0), 0), 10000), 0),
      'alto', nullif(least(greatest(coalesce((v_cap->>'alto')::int, 0), 0), 10000), 0)));
  END LOOP;

  -- La API ya sanea todo esto, pero la RPC se puede llamar directo por PostgREST: lo que no
  -- tiene la forma esperada se guarda como NULL. El sha termina en el prompt para Claude Code
  -- («git log <sha>..HEAD»), la ruta en un enlace «abrir» de la bandeja (nada de «//otro.sitio»
  -- ni «/\otro.sitio», que el navegador lee como otro dominio) y el módulo en un filtro .or().
  v_ruta := left(p->>'ruta', 2000);
  IF v_ruta IS NOT NULL AND v_ruta !~ '^/([^/\\]|$)' THEN v_ruta := NULL; END IF;
  v_modulo := p->>'modulo';
  IF v_modulo IS NOT NULL AND v_modulo !~ '^[a-z0-9-]{1,60}$' THEN v_modulo := NULL; END IF;
  v_sha_cli := p->>'sha_cliente';
  IF v_sha_cli IS NOT NULL AND v_sha_cli !~ '^[0-9A-Za-z._-]{0,64}$' THEN v_sha_cli := NULL; END IF;
  v_sha_srv := p->>'sha_servidor';
  IF v_sha_srv IS NOT NULL AND v_sha_srv !~ '^[0-9A-Za-z._-]{0,64}$' THEN v_sha_srv := NULL; END IF;

  INSERT INTO sis_reportes (tipo, descripcion, frena, ruta, modulo, titulo_pantalla, sha_cliente, sha_servidor, contexto, creado_por)
  VALUES (v_tipo, v_desc, v_frena AND v_tipo = 'error',
          v_ruta, v_modulo, left(p->>'titulo_pantalla', 200),
          nullif(v_sha_cli, ''), nullif(v_sha_srv, ''), v_contexto, v_uid)
  RETURNING id, numero INTO v_id, v_numero;

  FOR v_cap IN SELECT value FROM jsonb_array_elements(v_validas) LOOP
    INSERT INTO sis_reporte_capturas (reporte_id, path, mime, bytes, ancho, alto, orden)
    VALUES (v_id, v_cap->>'path', v_cap->>'mime', (v_cap->>'bytes')::int,
            (v_cap->>'ancho')::int, (v_cap->>'alto')::int, v_orden);
    v_orden := v_orden + 1;
  END LOOP;

  INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id) VALUES (v_id, 'creado', 'usuario', v_uid);

  RETURN jsonb_build_object('id', v_id, 'numero', v_numero);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Una de las imágenes ya se mandó en otro reporte. Probá de nuevo.';
END;
$$;

-- ============================================================
-- RPC: revisar (sólo revisores)
-- ============================================================
-- p = { estado?, prioridad? (presente con null = sin definir), motivo_descarte?, duplicado_de?, mensaje? }
-- Devuelve { id, numero, creado_por, estado_anterior, estado, cambio_estado, cambio_prioridad,
--            motivo_descarte, estado_evento_id, comentario_id (ids de sis_reporte_eventos, para las
--            claves de los avisos), duplicados: [{ id, numero, creado_por }] (sólo al resolver un original) }.
CREATE OR REPLACE FUNCTION sis_revisar_reporte(p_id UUID, p JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_r           sis_reportes%ROWTYPE;
  v_estado      TEXT;
  v_motivo      TEXT;
  v_dup         UUID;
  v_dup_numero  BIGINT;
  v_prio        TEXT;
  v_toca_prio   BOOLEAN := p ? 'prioridad';
  v_mensaje     TEXT := nullif(btrim(coalesce(p->>'mensaje', '')), '');
  v_cambio_est  BOOLEAN := false;
  v_cambio_prio BOOLEAN := false;
  v_com_id      BIGINT;
  v_est_ev      BIGINT;
  v_duplicados  JSONB := '[]'::jsonb;
BEGIN
  IF NOT sis_puede_revisar() THEN
    RAISE EXCEPTION 'No tenés permiso para revisar reportes.';
  END IF;
  SELECT * INTO v_r FROM sis_reportes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese reporte no existe.'; END IF;

  v_estado := coalesce(p->>'estado', v_r.estado);
  IF v_estado NOT IN ('nuevo', 'visto', 'en_curso', 'resuelto', 'descartado') THEN
    RAISE EXCEPTION 'Estado desconocido: %', v_estado;
  END IF;
  IF v_mensaje IS NOT NULL AND char_length(v_mensaje) > 5000 THEN
    RAISE EXCEPTION 'El mensaje es muy largo: resumilo en menos de 5000 letras.';
  END IF;

  -- Descarte: motivo obligatorio. Duplicado: el original, que se resuelve a su raíz (si el
  -- elegido ya era duplicado de otro, queda apuntando a ese otro).
  IF v_estado = 'descartado' THEN
    v_motivo := coalesce(p->>'motivo_descarte', CASE WHEN v_r.estado = 'descartado' THEN v_r.motivo_descarte END);
    IF v_motivo IS NULL OR v_motivo NOT IN ('no_es_del_sistema', 'no_se_va_a_hacer', 'ya_existe', 'duplicado') THEN
      RAISE EXCEPTION 'Elegí por qué se descarta.';
    END IF;
    IF v_motivo = 'duplicado' THEN
      v_dup := coalesce(nullif(p->>'duplicado_de', '')::uuid, v_r.duplicado_de);
      IF v_dup IS NULL THEN RAISE EXCEPTION 'Elegí de qué reporte es duplicado.'; END IF;
      SELECT coalesce(o.duplicado_de, o.id) INTO v_dup FROM sis_reportes o WHERE o.id = v_dup;
      IF v_dup IS NULL THEN RAISE EXCEPTION 'El reporte original no existe.'; END IF;
      IF v_dup = p_id THEN RAISE EXCEPTION 'Un reporte no puede ser duplicado de sí mismo.'; END IF;
      SELECT numero INTO v_dup_numero FROM sis_reportes WHERE id = v_dup;
    END IF;
  END IF;

  IF v_toca_prio THEN
    v_prio := nullif(p->>'prioridad', '');
    IF v_prio IS NOT NULL AND v_prio NOT IN ('alta', 'media', 'baja') THEN
      RAISE EXCEPTION 'Prioridad desconocida: %', v_prio;
    END IF;
    v_cambio_prio := v_prio IS DISTINCT FROM v_r.prioridad;
  END IF;

  v_cambio_est := v_estado IS DISTINCT FROM v_r.estado
                  OR (v_estado = 'descartado' AND (v_motivo IS DISTINCT FROM v_r.motivo_descarte OR v_dup IS DISTINCT FROM v_r.duplicado_de));

  IF v_cambio_est THEN
    UPDATE sis_reportes SET
      estado = v_estado,
      motivo_descarte = v_motivo,
      duplicado_de = v_dup,
      cerrado_at = CASE WHEN v_estado IN ('resuelto', 'descartado') THEN now() END,
      confirmado_ok = NULL,
      ultima_actividad_at = now()
    WHERE id = p_id;
    INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, de, a)
    VALUES (p_id, 'estado', 'sistemas', v_uid, v_r.estado, v_estado)
    RETURNING id INTO v_est_ev;
    IF v_dup IS NOT NULL AND v_dup IS DISTINCT FROM v_r.duplicado_de THEN
      INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, a)
      VALUES (p_id, 'duplicado', 'sistemas', v_uid, v_dup_numero::text);
      -- Los que eran duplicados de éste pasan al mismo original.
      UPDATE sis_reportes SET duplicado_de = v_dup WHERE duplicado_de = p_id;
    END IF;
  END IF;

  IF v_cambio_prio THEN
    UPDATE sis_reportes SET prioridad = v_prio WHERE id = p_id;
    INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, de, a)
    VALUES (p_id, 'prioridad', 'sistemas', v_uid, v_r.prioridad, v_prio);
  END IF;

  IF v_mensaje IS NOT NULL THEN
    INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, texto)
    VALUES (p_id, 'comentario', 'sistemas', v_uid, v_mensaje)
    RETURNING id INTO v_com_id;
    UPDATE sis_reportes SET ultima_actividad_at = now() WHERE id = p_id;
  END IF;

  -- Al resolver un original, los que avisaron lo mismo también se enteran: se les deja el
  -- mensaje en su reporte (sin el nombre de nadie) y la API les manda la campanita.
  IF v_cambio_est AND v_estado = 'resuelto' THEN
    WITH d AS (
      SELECT id, numero, creado_por FROM sis_reportes WHERE duplicado_de = p_id
    ), ins AS (
      INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, texto)
      SELECT d.id, 'comentario', 'sistemas', v_uid, 'Ya está arreglado. ¡Gracias por avisar!' FROM d
      RETURNING reporte_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'numero', d.numero, 'creado_por', d.creado_por)), '[]'::jsonb)
      INTO v_duplicados FROM d;
    UPDATE sis_reportes SET ultima_actividad_at = now() WHERE duplicado_de = p_id;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id, 'numero', v_r.numero, 'creado_por', v_r.creado_por,
    'estado_anterior', v_r.estado, 'estado', v_estado,
    'cambio_estado', v_cambio_est, 'cambio_prioridad', v_cambio_prio, 'motivo_descarte', v_motivo,
    'estado_evento_id', v_est_ev, 'comentario_id', v_com_id, 'duplicados', v_duplicados);
END;
$$;

-- ============================================================
-- RPC: comentar
-- ============================================================
-- p_como = 'usuario' (quien reportó, mientras no esté cerrado) o 'sistemas' (un revisor; si
-- estaba 'nuevo', pasa a 'visto'). Devuelve { id (evento), reporte_id, numero, creado_por,
-- lado, estado_anterior, estado }.
CREATE OR REPLACE FUNCTION sis_comentar(p_id UUID, p_texto TEXT, p_como TEXT DEFAULT 'usuario') RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_r      sis_reportes%ROWTYPE;
  v_texto  TEXT := btrim(coalesce(p_texto, ''));
  v_estado TEXT;
  v_ev     BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Tu sesión venció: volvé a iniciar sesión.'; END IF;
  IF p_como NOT IN ('usuario', 'sistemas') THEN RAISE EXCEPTION 'Lado desconocido: %', p_como; END IF;
  IF char_length(v_texto) < 1 THEN RAISE EXCEPTION 'Escribí algo antes de mandar.'; END IF;
  IF char_length(v_texto) > 5000 THEN RAISE EXCEPTION 'El mensaje es muy largo: resumilo en menos de 5000 letras.'; END IF;

  SELECT * INTO v_r FROM sis_reportes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese reporte no existe.'; END IF;
  v_estado := v_r.estado;

  IF p_como = 'usuario' THEN
    IF v_r.creado_por <> v_uid THEN RAISE EXCEPTION 'Ese reporte no existe.'; END IF;
    IF v_r.estado IN ('resuelto', 'descartado') THEN
      RAISE EXCEPTION 'Este reporte ya está cerrado. Si sigue pasando, tocá «Sigue pasando» o mandá uno nuevo.';
    END IF;
    -- Cada mensaje de quien reportó le prende la campanita a cada revisor: 30 por hora (entre
    -- todos sus reportes) sobra para una charla y frena un bucle o un script.
    PERFORM pg_advisory_xact_lock(hashtext('sis_comentar:' || v_uid::text));
    IF (SELECT count(*) FROM sis_reporte_eventos
        WHERE autor_id = v_uid AND tipo = 'comentario' AND lado = 'usuario'
          AND created_at > now() - interval '1 hour') >= 30 THEN
      RAISE EXCEPTION 'Mandaste muchos mensajes seguidos. Esperá un rato y probá de nuevo.';
    END IF;
  ELSE
    IF NOT sis_puede_revisar() THEN RAISE EXCEPTION 'No tenés permiso para revisar reportes.'; END IF;
    IF v_r.estado = 'nuevo' THEN
      v_estado := 'visto';
      UPDATE sis_reportes SET estado = 'visto' WHERE id = p_id;
      INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, de, a)
      VALUES (p_id, 'estado', 'sistemas', v_uid, 'nuevo', 'visto');
    END IF;
  END IF;

  INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, texto)
  VALUES (p_id, 'comentario', p_como, v_uid, v_texto)
  RETURNING id INTO v_ev;
  UPDATE sis_reportes SET ultima_actividad_at = now() WHERE id = p_id;

  RETURN jsonb_build_object('id', v_ev, 'reporte_id', p_id, 'numero', v_r.numero, 'creado_por', v_r.creado_por,
                            'lado', p_como, 'estado_anterior', v_r.estado, 'estado', v_estado);
END;
$$;

-- ============================================================
-- RPC: confirmar (quien reportó, sobre uno resuelto)
-- ============================================================
-- p_ok true = «Ya está, gracias». false = «Sigue pasando»: vuelve a 'visto' (Sistemas ya lo
-- conoce) y la API les avisa a los revisores. Devuelve { numero, creado_por, estado, reabierto,
-- evento_id (el comentario que deja) }.
CREATE OR REPLACE FUNCTION sis_confirmar(p_id UUID, p_ok BOOLEAN, p_texto TEXT DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_r     sis_reportes%ROWTYPE;
  v_extra TEXT := nullif(btrim(coalesce(p_texto, '')), '');
  v_ev    BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Tu sesión venció: volvé a iniciar sesión.'; END IF;
  IF p_ok IS NULL THEN RAISE EXCEPTION 'Falta decir si quedó bien.'; END IF;
  SELECT * INTO v_r FROM sis_reportes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_r.creado_por <> v_uid THEN RAISE EXCEPTION 'Ese reporte no existe.'; END IF;
  IF v_r.estado <> 'resuelto' THEN RAISE EXCEPTION 'Este reporte todavía no está resuelto.'; END IF;
  IF v_extra IS NOT NULL AND char_length(v_extra) > 2000 THEN
    RAISE EXCEPTION 'El mensaje es muy largo: resumilo en menos de 2000 letras.';
  END IF;

  IF p_ok THEN
    IF v_r.confirmado_ok IS TRUE THEN RAISE EXCEPTION 'Ya lo confirmaste. ¡Gracias!'; END IF;
    UPDATE sis_reportes SET confirmado_ok = true, ultima_actividad_at = now() WHERE id = p_id;
    INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, texto)
    VALUES (p_id, 'comentario', 'usuario', v_uid, coalesce('Ya está, gracias. ' || v_extra, 'Ya está, gracias.'))
    RETURNING id INTO v_ev;
    RETURN jsonb_build_object('numero', v_r.numero, 'creado_por', v_r.creado_por, 'estado', 'resuelto', 'reabierto', false, 'evento_id', v_ev);
  END IF;

  UPDATE sis_reportes SET estado = 'visto', cerrado_at = NULL, confirmado_ok = NULL, ultima_actividad_at = now() WHERE id = p_id;
  INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, de, a)
  VALUES (p_id, 'estado', 'usuario', v_uid, 'resuelto', 'visto');
  INSERT INTO sis_reporte_eventos (reporte_id, tipo, lado, autor_id, texto)
  VALUES (p_id, 'comentario', 'usuario', v_uid, coalesce('Sigue pasando. ' || v_extra, 'Sigue pasando.'))
  RETURNING id INTO v_ev;
  RETURN jsonb_build_object('numero', v_r.numero, 'creado_por', v_r.creado_por, 'estado', 'visto', 'reabierto', true, 'evento_id', v_ev);
END;
$$;

-- Nada para anon; las RPC y el permiso, para authenticated.
DO $fn$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['sis_puede_revisar()', 'sis_crear_reporte(jsonb)', 'sis_revisar_reporte(uuid, jsonb)',
                           'sis_comentar(uuid, text, text)', 'sis_confirmar(uuid, boolean, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END
$fn$;
REVOKE ALL ON FUNCTION sis_reportes_tocar() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Auditoría: dar o sacar `sistemas` queda registrado como con Socios
-- ============================================================
DO $aud$
BEGIN
  IF to_regclass('public.direccion_auditoria') IS NOT NULL THEN
    ALTER TABLE direccion_auditoria DROP CONSTRAINT IF EXISTS direccion_auditoria_accion;
    ALTER TABLE direccion_auditoria ADD CONSTRAINT direccion_auditoria_accion CHECK (
      accion IN ('abrir_socios', 'politica', 'meta', 'dueno', 'config', 'aviso_cargar', 'aviso_cerrar',
                 'permiso_socios', 'permiso_socios_base', 'permiso_sistemas')
      OR accion ~ '^actualizar:(semana|caja|ventas|cobranzas|calle|socios|datos)$');
  END IF;
END
$aud$;

-- ============================================================
-- Quiénes revisan hoy (§5, decisión 2): JS y Juan Pablo Mansilla
-- ============================================================
UPDATE user_profiles
SET permisos = coalesce(permisos, '{}'::jsonb) || '{"sistemas": "editar"}'::jsonb
WHERE lower(email) IN ('js@andamiosbuenosaires.com.ar', 'jpm@andamiosbuenosaires.com.ar')
  AND (permisos->>'sistemas') IS DISTINCT FROM 'editar';

NOTIFY pgrst, 'reload schema';
