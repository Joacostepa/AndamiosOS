-- ============================================================
-- AndamiosOS — Organigrama
--
-- Diseño en docs/organigrama/modulo.md (y la propuesta, docs/organigrama/propuesta.md § 4).
-- Lo que hay que saber para leer esto:
--
-- 1. LA APP ES DUEÑA DE LA ESTRUCTURA; ODOO/LEGAJOS, DE LAS PERSONAS (decisión 12/10/2026).
--    Acá viven las áreas, los puestos, la jerarquía y el manual de funciones (misión, tareas,
--    «qué NO hace», KPIs). Las personas NO se copian: un ocupante apunta a un legajo
--    (`personal`), a un usuario (`user_profiles`) o, para alguien de afuera, a un nombre libre.
--    Una baja en Legajos (personal.activo = false) no toca nada acá: la pantalla «Para revisar»
--    la muestra y una persona decide.
--
-- 2. ESTRUCTURA VERSIONADA, OCUPACIÓN INMEDIATA. La estructura se arma en un BORRADOR (a lo
--    sumo uno) y se publica como versión nueva con una nota; una versión publicada no se toca
--    más (trigger org_version_inmutable). Quién ocupa qué puesto va en org_ocupantes, con
--    historial por fechas (desde/hasta), y no pasa por el borrador.
--
-- 3. IDENTIDAD ESTABLE. org_nodos.id no cambia entre versiones (el contenido de cada versión
--    está en org_nodo_version): las asignaciones sobreviven a las publicaciones. La `clave` es
--    la de la URL (?puesto=stock). Cuando un puesto deja de existir (se publica sin él o se
--    descarta el borrador que lo creó), sus ocupantes vigentes terminan y la clave se libera.
--
-- 4. LA INTEGRIDAD LA GARANTIZA LA BASE: un solo nodo raíz por versión, el padre tiene que
--    estar en la misma versión y nada puede quedar dependiendo de sí mismo (trigger diferido
--    org_nodo_version_sin_ciclos: se chequea al final, así un cambio de varias filas que pasa
--    por un estado intermedio raro —deshacer varios movimientos de una— no falla de gusto).
--
-- 5. SE ESCRIBE POR RPC (SECURITY DEFINER), cada una con su chequeo de permiso: crear,
--    guardar, publicar y descartar el borrador son atómicos. Las políticas de RLS igual están
--    en todas las tablas (lectura con org_puede_ver(), escritura con org_puede_editar()).
--
-- 6. CONTENIDO INICIAL: si no hay ninguna versión, siembra como VERSIÓN 1 publicada los 24
--    nodos del organigrama original (src/lib/organigrama/estructura-base.ts), SIN personas.
--
-- Se aplica a mano con `npx supabase db query --linked -f <este archivo>` (NUNCA db push) y
-- es idempotente: se puede correr dos veces (scripts/probar-migracion.mjs lo verifica). Sin
-- BEGIN/COMMIT propios para que el probador la pueda envolver en su ROLLBACK.
-- ============================================================

-- ========================
-- Tablas
-- ========================

-- Versiones: a lo sumo UN borrador; la vigente es la única 'publicada'.
CREATE TABLE IF NOT EXISTS org_versiones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        INTEGER,                               -- se asigna al publicar (1, 2, 3…); NULL en borrador
  estado        TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'publicada', 'archivada')),
  nota          TEXT,                                  -- «Depósito pasa a reportar a Dirección»
  cambios       JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(cambios) = 'array'),  -- el diff legible, calculado al publicar
  basada_en     UUID REFERENCES org_versiones(id) ON DELETE SET NULL,
  publicada_at  TIMESTAMPTZ,
  publicada_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_versiones_numero_si_publicada CHECK ((estado = 'borrador') = (numero IS NULL)),
  CONSTRAINT org_versiones_fecha_si_publicada CHECK (estado = 'borrador' OR publicada_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS org_versiones_un_borrador ON org_versiones ((true)) WHERE estado = 'borrador';
CREATE UNIQUE INDEX IF NOT EXISTS org_versiones_una_vigente ON org_versiones ((true)) WHERE estado = 'publicada';
CREATE UNIQUE INDEX IF NOT EXISTS org_versiones_numero ON org_versiones (numero) WHERE numero IS NOT NULL;

-- Identidad estable de cada caja (dirección, área o puesto).
CREATE TABLE IF NOT EXISTS org_nodos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave      TEXT NOT NULL UNIQUE CHECK (btrim(clave) <> ''),   -- slug para la URL: 'stock', 'montajes'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- Contenido de cada nodo en cada versión (el «manual de funciones»).
CREATE TABLE IF NOT EXISTS org_nodo_version (
  version_id       UUID NOT NULL REFERENCES org_versiones(id) ON DELETE CASCADE,
  nodo_id          UUID NOT NULL REFERENCES org_nodos(id) ON DELETE RESTRICT,
  depende_de       UUID,                                -- padre EN ESTA VERSIÓN; NULL = raíz
  tipo             TEXT NOT NULL CHECK (tipo IN ('direccion', 'area', 'puesto')),
  titulo           TEXT NOT NULL CHECK (btrim(titulo) <> ''),
  rol              TEXT,                                -- el «subtitle» del original: «Stock e Inventario»
  color            TEXT CHECK (color IN ('azul', 'ambar', 'verde', 'rosa', 'violeta', 'teal', 'gris')),  -- clave --tb-*; solo áreas/dirección
  mision           TEXT,
  tareas           JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tareas) = 'array'),   -- [{ "texto": "...", "docs": [{ "codigo": "RS", "rol": "emite" }] }]
  no_hace          JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(no_hace) = 'array'),  -- ["No entrega material sin Solicitud aprobada", …]
  kpis             JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(kpis) = 'array'),
  nota_diseno      TEXT,                                -- PÚBLICA: «Separado de Operaciones a propósito»
  fuente_ocupantes TEXT NOT NULL DEFAULT 'manual' CHECK (fuente_ocupantes IN ('manual', 'cuadrillas')),
  orden            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, nodo_id),
  CONSTRAINT org_nodo_version_padre_en_version FOREIGN KEY (version_id, depende_de)
    REFERENCES org_nodo_version (version_id, nodo_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS org_nodo_version_una_raiz ON org_nodo_version (version_id) WHERE depende_de IS NULL;
CREATE INDEX IF NOT EXISTS org_nodo_version_padre ON org_nodo_version (version_id, depende_de);
CREATE INDEX IF NOT EXISTS org_nodo_version_nodo ON org_nodo_version (nodo_id);

-- Notas internas: tabla aparte porque la RLS es por fila, no por columna, y estas no las ve
-- quien solo lee. No se versionan (son de trabajo: «entrevistas en noviembre»).
CREATE TABLE IF NOT EXISTS org_notas_internas (
  nodo_id    UUID PRIMARY KEY REFERENCES org_nodos(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL CHECK (btrim(texto) <> ''),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- Ocupación: NO versionada; con historial por fechas (hasta IS NULL = vigente).
-- Quién: un legajo (gente de obra), un usuario (oficina) o alguien de afuera con nombre libre
-- (empresa o contratista). Exactamente uno de los tres.
-- Modalidad: titular, interino o compartido (en pantalla, compartir es tener dos titulares;
-- 'compartido' queda para marcarlo explícito si algún día hace falta).
CREATE TABLE IF NOT EXISTS org_ocupantes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nodo_id      UUID NOT NULL REFERENCES org_nodos(id) ON DELETE CASCADE,
  personal_id  UUID REFERENCES personal(id) ON DELETE CASCADE,
  usuario_id   UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  nombre_libre TEXT CHECK (nombre_libre IS NULL OR btrim(nombre_libre) <> ''),   -- «Servicios Edilicios Sur»
  modalidad    TEXT NOT NULL DEFAULT 'titular' CHECK (modalidad IN ('titular', 'interino', 'compartido')),
  desde        DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  hasta        DATE,
  motivo_fin   TEXT,                                    -- 'puesto eliminado', 'borrador descartado', …
  nota         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_ocupantes_una_persona CHECK (num_nonnulls(personal_id, usuario_id, nombre_libre) = 1),
  CONSTRAINT org_ocupantes_fechas CHECK (hasta IS NULL OR hasta >= desde)
);
-- Una persona no ocupa dos veces el mismo puesto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS org_ocupantes_vigente_personal ON org_ocupantes (nodo_id, personal_id) WHERE hasta IS NULL AND personal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_ocupantes_vigente_usuario ON org_ocupantes (nodo_id, usuario_id) WHERE hasta IS NULL AND usuario_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_ocupantes_vigente_libre ON org_ocupantes (nodo_id, lower(btrim(nombre_libre))) WHERE hasta IS NULL AND nombre_libre IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_ocupantes_nodo ON org_ocupantes (nodo_id);
CREATE INDEX IF NOT EXISTS org_ocupantes_personal ON org_ocupantes (personal_id) WHERE personal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_ocupantes_usuario ON org_ocupantes (usuario_id) WHERE usuario_id IS NOT NULL;

-- ============================================================
-- Permisos (módulo «organigrama» de src/lib/auth/acceso.ts; admin siempre edita)
-- ============================================================
CREATE OR REPLACE FUNCTION org_puede_ver() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'organigrama' IN ('ver', 'editar'))
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION org_puede_editar() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'organigrama' = 'editar')
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION org_exigir_editor() RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT org_puede_editar() THEN
    RAISE EXCEPTION 'No tenés permiso para editar el organigrama.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- El día en Buenos Aires (un interino «desde hoy» es hoy de acá, no de UTC).
CREATE OR REPLACE FUNCTION org_hoy() RETURNS DATE
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date; $$;

-- ============================================================
-- Triggers de integridad
-- ============================================================

-- Nada depende de sí mismo. Es un CONSTRAINT TRIGGER DIFERIDO: corre al final de la
-- transacción y mira la fila como quedó, así un guardado de varias filas se juzga por el
-- resultado y no por el orden en que se escribieron.
CREATE OR REPLACE FUNCTION org_evitar_ciclo() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_padre UUID;
BEGIN
  SELECT depende_de INTO v_padre FROM org_nodo_version WHERE version_id = NEW.version_id AND nodo_id = NEW.nodo_id;
  IF NOT FOUND OR v_padre IS NULL THEN RETURN NULL; END IF;
  IF v_padre = NEW.nodo_id THEN
    RAISE EXCEPTION 'Un puesto no puede depender de sí mismo.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    WITH RECURSIVE arriba(id) AS (
      SELECT v_padre
      UNION                                   -- UNION (no ALL): corta aunque ya hubiera un ciclo
      SELECT v.depende_de
        FROM org_nodo_version v JOIN arriba a ON v.nodo_id = a.id
       WHERE v.version_id = NEW.version_id AND v.depende_de IS NOT NULL
    )
    SELECT 1 FROM arriba WHERE id = NEW.nodo_id
  ) THEN
    RAISE EXCEPTION 'Ese movimiento deja al puesto dependiendo de sí mismo (ciclo).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS org_nodo_version_sin_ciclos ON org_nodo_version;
CREATE CONSTRAINT TRIGGER org_nodo_version_sin_ciclos
  AFTER INSERT OR UPDATE OF depende_de ON org_nodo_version
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION org_evitar_ciclo();

-- Una versión publicada (o archivada) no se toca: los cambios van en un borrador.
CREATE OR REPLACE FUNCTION org_version_inmutable() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  v_ids := CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.version_id]
                      WHEN 'DELETE' THEN ARRAY[OLD.version_id]
                      ELSE ARRAY[OLD.version_id, NEW.version_id] END;
  -- Si la versión ya no está (se está borrando un borrador en cascada), no hay nada que cuidar.
  IF EXISTS (SELECT 1 FROM org_versiones WHERE id = ANY (v_ids) AND estado <> 'borrador') THEN
    RAISE EXCEPTION 'Esa versión ya está publicada: no se modifica. Los cambios van en un borrador.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS org_nodo_version_inmutable ON org_nodo_version;
CREATE TRIGGER org_nodo_version_inmutable
  BEFORE INSERT OR UPDATE OR DELETE ON org_nodo_version
  FOR EACH ROW EXECUTE FUNCTION org_version_inmutable();

-- Una versión publicada no se borra ni se reescribe: solo pasa de 'publicada' a 'archivada'
-- cuando se publica otra. (Que se borre un usuario sí puede dejar en NULL quién la publicó.)
CREATE OR REPLACE FUNCTION org_versiones_proteger() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'Una versión publicada no se borra.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado <> 'borrador' AND (
       NEW.numero IS DISTINCT FROM OLD.numero OR NEW.nota IS DISTINCT FROM OLD.nota
       OR NEW.cambios IS DISTINCT FROM OLD.cambios OR NEW.publicada_at IS DISTINCT FROM OLD.publicada_at
       OR NEW.basada_en IS DISTINCT FROM OLD.basada_en
       OR (NEW.estado <> OLD.estado AND NOT (OLD.estado = 'publicada' AND NEW.estado = 'archivada'))) THEN
    RAISE EXCEPTION 'Una versión publicada no se modifica.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_versiones_proteger ON org_versiones;
CREATE TRIGGER org_versiones_proteger
  BEFORE UPDATE OR DELETE ON org_versiones
  FOR EACH ROW EXECUTE FUNCTION org_versiones_proteger();

CREATE OR REPLACE FUNCTION org_tocar_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS org_ocupantes_updated_at ON org_ocupantes;
CREATE TRIGGER org_ocupantes_updated_at
  BEFORE UPDATE ON org_ocupantes
  FOR EACH ROW EXECUTE FUNCTION org_tocar_updated_at();

-- ============================================================
-- Funciones internas (no se exponen)
-- ============================================================

-- Los nodos de una versión, como los lee la app (claves en vez de ids).
CREATE OR REPLACE FUNCTION org_nodos_json(p_version UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'clave', n.clave, 'depende_de', p.clave, 'tipo', nv.tipo, 'titulo', nv.titulo, 'rol', nv.rol,
           'color', nv.color, 'mision', nv.mision, 'tareas', nv.tareas, 'no_hace', nv.no_hace, 'kpis', nv.kpis,
           'nota_diseno', nv.nota_diseno, 'fuente_ocupantes', nv.fuente_ocupantes, 'orden', nv.orden)
         ORDER BY nv.orden, n.clave), '[]'::jsonb)
    FROM org_nodo_version nv
    JOIN org_nodos n ON n.id = nv.nodo_id
    LEFT JOIN org_nodos p ON p.id = nv.depende_de
   WHERE nv.version_id = p_version;
$$;

CREATE OR REPLACE FUNCTION org_version_json(v org_versiones) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', v.id, 'numero', v.numero, 'estado', v.estado, 'nota', v.nota, 'cambios', v.cambios,
    'publicada_at', v.publicada_at, 'created_at', v.created_at,
    'autor', (SELECT NULLIF(btrim(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')), '')
                FROM user_profiles u WHERE u.id = COALESCE(v.publicada_por, v.created_by)));
$$;

-- Escribe en una versión (en borrador) las filas que manda la app: [{clave, depende_de (clave),
-- tipo, titulo, …}]. Crea la identidad (org_nodos) de las claves nuevas.
CREATE OR REPLACE FUNCTION org_escribir_nodos(p_version UUID, p_filas JSONB) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(COALESCE(p_filas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Formato inválido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO org_nodos (clave)
  SELECT DISTINCT btrim(f->>'clave') FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) f
  ON CONFLICT (clave) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) f
     WHERE NULLIF(f->>'depende_de', '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM org_nodos n WHERE n.clave = f->>'depende_de')
  ) THEN
    RAISE EXCEPTION 'Un puesto apunta a un jefe que no existe.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO org_nodo_version (version_id, nodo_id, depende_de, tipo, titulo, rol, color, mision, tareas,
                                no_hace, kpis, nota_diseno, fuente_ocupantes, orden)
  SELECT p_version, n.id, p.id, f->>'tipo', btrim(f->>'titulo'), NULLIF(btrim(f->>'rol'), ''),
         NULLIF(f->>'color', ''), NULLIF(btrim(f->>'mision'), ''),
         COALESCE(f->'tareas', '[]'::jsonb), COALESCE(f->'no_hace', '[]'::jsonb), COALESCE(f->'kpis', '[]'::jsonb),
         NULLIF(btrim(f->>'nota_diseno'), ''), COALESCE(f->>'fuente_ocupantes', 'manual'),
         COALESCE((f->>'orden')::int, 0)
    FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) f
    JOIN org_nodos n ON n.clave = btrim(f->>'clave')
    LEFT JOIN org_nodos p ON p.clave = NULLIF(f->>'depende_de', '')
  ON CONFLICT (version_id, nodo_id) DO UPDATE SET
    depende_de = EXCLUDED.depende_de, tipo = EXCLUDED.tipo, titulo = EXCLUDED.titulo, rol = EXCLUDED.rol,
    color = EXCLUDED.color, mision = EXCLUDED.mision, tareas = EXCLUDED.tareas, no_hace = EXCLUDED.no_hace,
    kpis = EXCLUDED.kpis, nota_diseno = EXCLUDED.nota_diseno, fuente_ocupantes = EXCLUDED.fuente_ocupantes,
    orden = EXCLUDED.orden;
END;
$$;

-- Después de publicar o descartar: los nodos que no están ni en la vigente ni en el borrador
-- dejan de existir. Sus ocupantes vigentes terminan hoy (con el motivo) y la clave se libera
-- (un puesto nuevo con la misma clave no hereda el historial). Si el nodo no quedó en ninguna
-- versión ni tiene historial, se borra.
CREATE OR REPLACE FUNCTION org_liberar_nodos(p_motivo TEXT) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nodo RECORD;
BEGIN
  FOR v_nodo IN
    SELECT n.id, n.clave FROM org_nodos n
     WHERE NOT EXISTS (SELECT 1 FROM org_nodo_version nv JOIN org_versiones v ON v.id = nv.version_id
                        WHERE nv.nodo_id = n.id AND v.estado IN ('publicada', 'borrador'))
       AND position('~' IN n.clave) = 0
  LOOP
    UPDATE org_ocupantes SET hasta = GREATEST(desde, org_hoy()), motivo_fin = p_motivo
     WHERE nodo_id = v_nodo.id AND hasta IS NULL;
    IF NOT EXISTS (SELECT 1 FROM org_nodo_version WHERE nodo_id = v_nodo.id)
       AND NOT EXISTS (SELECT 1 FROM org_ocupantes WHERE nodo_id = v_nodo.id) THEN
      DELETE FROM org_nodos WHERE id = v_nodo.id;
    ELSE
      UPDATE org_nodos SET clave = v_nodo.clave || '~' || left(v_nodo.id::text, 8) WHERE id = v_nodo.id;
    END IF;
  END LOOP;
END;
$$;

-- Carga una estructura como versión publicada nueva (la siembra).
CREATE OR REPLACE FUNCTION org_sembrar_interno(p_filas JSONB, p_nota TEXT) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO org_versiones (estado) VALUES ('borrador') RETURNING id INTO v_id;
  PERFORM org_escribir_nodos(v_id, p_filas);
  UPDATE org_versiones SET estado = 'archivada' WHERE estado = 'publicada';
  UPDATE org_versiones
     SET estado = 'publicada', numero = (SELECT COALESCE(max(numero), 0) + 1 FROM org_versiones),
         nota = p_nota, cambios = '[]'::jsonb, publicada_at = now(), publicada_por = auth.uid()
   WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- RPC que usa la app
-- ============================================================

-- Todo lo que necesita la pantalla, en una sola lectura consistente. El borrador y las notas
-- internas, solo para editores. De las personas, solo lo laboral (nombre, teléfono, email,
-- activo): nunca DNI, domicilio ni datos de salud — para eso está Legajos con su permiso.
CREATE OR REPLACE FUNCTION org_leer() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_editor   BOOLEAN := org_puede_editar();
  v_vigente  UUID;
  v_borrador UUID;
BEGIN
  IF NOT org_puede_ver() THEN
    RAISE EXCEPTION 'No tenés acceso al organigrama.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_vigente FROM org_versiones WHERE estado = 'publicada';
  IF v_editor THEN SELECT id INTO v_borrador FROM org_versiones WHERE estado = 'borrador'; END IF;

  RETURN jsonb_build_object(
    'yo', (SELECT jsonb_build_object('usuario_id', u.id, 'personal_id', (SELECT pe.id FROM personal pe WHERE pe.user_id = u.id))
             FROM user_profiles u WHERE u.id = auth.uid()),
    'puede_editar', v_editor,
    'versiones', COALESCE((SELECT jsonb_agg(org_version_json(v) ORDER BY v.numero DESC)
                             FROM org_versiones v WHERE v.estado <> 'borrador'), '[]'::jsonb),
    'borrador', (SELECT org_version_json(v) FROM org_versiones v WHERE v.id = v_borrador),
    'nodos_vigentes', CASE WHEN v_vigente IS NULL THEN '[]'::jsonb ELSE org_nodos_json(v_vigente) END,
    'nodos_borrador', CASE WHEN v_borrador IS NULL THEN NULL ELSE org_nodos_json(v_borrador) END,
    'notas', CASE WHEN v_editor THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('clave', n.clave, 'texto', ni.texto))
                                                FROM org_notas_internas ni JOIN org_nodos n ON n.id = ni.nodo_id), '[]'::jsonb)
                  ELSE '[]'::jsonb END,
    'ocupantes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                             'id', o.id, 'clave', n.clave, 'personal_id', o.personal_id, 'usuario_id', o.usuario_id,
                             'nombre_libre', o.nombre_libre, 'modalidad', o.modalidad, 'desde', o.desde, 'hasta', o.hasta)
                           ORDER BY o.desde, o.created_at)
                             FROM org_ocupantes o JOIN org_nodos n ON n.id = o.nodo_id), '[]'::jsonb),
    -- Legajos: los activos y los que el organigrama todavía nombra (una baja con puesto).
    'personal', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'id', pe.id, 'nombre', pe.nombre, 'apellido', pe.apellido, 'telefono', pe.telefono,
                            'email', pe.email, 'activo', pe.activo, 'odoo_tarea', pe.odoo_tarea, 'user_id', pe.user_id)
                          ORDER BY pe.apellido, pe.nombre)
                            FROM personal pe
                           WHERE pe.activo
                              OR EXISTS (SELECT 1 FROM org_ocupantes o WHERE o.personal_id = pe.id)
                              OR EXISTS (SELECT 1 FROM cuadrillas c WHERE c.activo AND c.responsable_id = pe.id)
                              OR EXISTS (SELECT 1 FROM cuadrilla_personal cp JOIN cuadrillas c ON c.id = cp.cuadrilla_id
                                          WHERE c.activo AND cp.personal_id = pe.id)), '[]'::jsonb),
    -- Usuarios (la oficina): los activos, salvo los dispositivos que solo tienen el kiosco del
    -- pañol, y los que el organigrama todavía nombra.
    'usuarios', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'telefono', u.telefono,
                            'email', u.email, 'activo', u.activo)
                          ORDER BY u.apellido, u.nombre)
                            FROM user_profiles u
                           WHERE (u.activo AND NOT (COALESCE(u.permisos, '{}'::jsonb) ? 'panol-kiosco'
                                                    AND (SELECT count(*) FROM jsonb_object_keys(COALESCE(u.permisos, '{}'::jsonb))) = 1))
                              OR EXISTS (SELECT 1 FROM org_ocupantes o WHERE o.usuario_id = u.id)), '[]'::jsonb),
    -- Externos de cuadrillas tercerizadas: solo para mostrar el plantel en vivo.
    'externos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'id', x.id, 'nombre', x.nombre, 'apellido', x.apellido, 'empresa', x.empresa,
                            'telefono', x.telefono, 'activo', x.activo, 'cuadrilla_id', x.cuadrilla_id))
                            FROM pan_personas_externas x JOIN cuadrillas c ON c.id = x.cuadrilla_id
                           WHERE x.activo AND c.activo), '[]'::jsonb),
    -- Cuadrillas en vivo (Configuración › Cuadrillas): capataz y plantel activo. No se copian.
    'cuadrillas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                              'id', c.id, 'nombre', c.nombre, 'orden', c.orden, 'responsable_id', c.responsable_id,
                              'es_temporaria', c.es_temporaria,
                              'plantel', COALESCE((SELECT jsonb_agg(cp.personal_id ORDER BY pe.apellido, pe.nombre)
                                                     FROM cuadrilla_personal cp JOIN personal pe ON pe.id = cp.personal_id
                                                    WHERE cp.cuadrilla_id = c.id AND pe.activo
                                                      AND cp.personal_id IS DISTINCT FROM c.responsable_id), '[]'::jsonb))
                            ORDER BY c.orden, c.nombre)
                              FROM cuadrillas c WHERE c.activo), '[]'::jsonb)
  );
END;
$$;

-- Abre el borrador (copia de la vigente). Si ya hay uno, lo devuelve.
CREATE OR REPLACE FUNCTION org_crear_borrador() RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vigente UUID;
  v_id      UUID;
BEGIN
  PERFORM org_exigir_editor();
  -- Dos editores que abren el borrador a la vez: el segundo espera y recibe el mismo.
  PERFORM pg_advisory_xact_lock(hashtext('org_versiones'));
  SELECT id INTO v_id FROM org_versiones WHERE estado = 'borrador';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id INTO v_vigente FROM org_versiones WHERE estado = 'publicada';
  IF v_vigente IS NULL THEN
    RAISE EXCEPTION 'Todavía no hay un organigrama publicado.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO org_versiones (estado, basada_en) VALUES ('borrador', v_vigente) RETURNING id INTO v_id;
  INSERT INTO org_nodo_version (version_id, nodo_id, depende_de, tipo, titulo, rol, color, mision, tareas,
                                no_hace, kpis, nota_diseno, fuente_ocupantes, orden)
  SELECT v_id, nodo_id, depende_de, tipo, titulo, rol, color, mision, tareas, no_hace, kpis, nota_diseno,
         fuente_ocupantes, orden
    FROM org_nodo_version WHERE version_id = v_vigente;
  RETURN v_id;
END;
$$;

-- Guarda cambios del borrador de una vez: {upsert: [filas], borrar: [claves], notas: [{clave, texto|null}]}.
CREATE OR REPLACE FUNCTION org_guardar_borrador(p_version UUID, p_cambios JSONB) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_estado TEXT;
  v_nota   JSONB;
  v_nodo   UUID;
BEGIN
  PERFORM org_exigir_editor();
  SELECT estado INTO v_estado FROM org_versiones WHERE id = p_version FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Ese borrador ya no existe (lo publicó o lo descartó otra persona). Recargá la página.' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM org_nodo_version nv USING org_nodos n
   WHERE nv.version_id = p_version AND nv.nodo_id = n.id
     AND n.clave IN (SELECT jsonb_array_elements_text(COALESCE(p_cambios->'borrar', '[]'::jsonb)));

  PERFORM org_escribir_nodos(p_version, COALESCE(p_cambios->'upsert', '[]'::jsonb));

  FOR v_nota IN SELECT * FROM jsonb_array_elements(COALESCE(p_cambios->'notas', '[]'::jsonb)) LOOP
    SELECT id INTO v_nodo FROM org_nodos WHERE clave = v_nota->>'clave';
    CONTINUE WHEN v_nodo IS NULL;
    IF NULLIF(btrim(v_nota->>'texto'), '') IS NULL THEN
      DELETE FROM org_notas_internas WHERE nodo_id = v_nodo;
    ELSE
      INSERT INTO org_notas_internas (nodo_id, texto) VALUES (v_nodo, btrim(v_nota->>'texto'))
      ON CONFLICT (nodo_id) DO UPDATE SET texto = EXCLUDED.texto, updated_at = now(), updated_by = auth.uid();
    END IF;
  END LOOP;
END;
$$;

-- Publica el borrador como la versión vigente nueva, con su nota y el resumen de cambios.
CREATE OR REPLACE FUNCTION org_publicar(p_version UUID, p_nota TEXT, p_cambios JSONB DEFAULT '[]'::jsonb) RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_estado TEXT;
  v_numero INTEGER;
BEGIN
  PERFORM org_exigir_editor();
  IF NULLIF(btrim(p_nota), '') IS NULL THEN
    RAISE EXCEPTION 'Escribí una nota corta para la versión.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('org_versiones'));
  SELECT estado INTO v_estado FROM org_versiones WHERE id = p_version FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Ese borrador ya no existe (lo publicó o lo descartó otra persona). Recargá la página.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_nodo_version WHERE version_id = p_version AND depende_de IS NULL) THEN
    RAISE EXCEPTION 'El borrador está vacío.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(numero), 0) + 1 INTO v_numero FROM org_versiones;
  UPDATE org_versiones SET estado = 'archivada' WHERE estado = 'publicada';
  UPDATE org_versiones
     SET estado = 'publicada', numero = v_numero, nota = left(btrim(p_nota), 300),
         cambios = CASE WHEN jsonb_typeof(p_cambios) = 'array' THEN p_cambios ELSE '[]'::jsonb END,
         publicada_at = now(), publicada_por = auth.uid()
   WHERE id = p_version;
  PERFORM org_liberar_nodos('puesto eliminado');
  RETURN v_numero;
END;
$$;

-- Descarta el borrador. Los puestos que solo existían en él dejan de existir.
CREATE OR REPLACE FUNCTION org_descartar_borrador(p_version UUID) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM org_exigir_editor();
  PERFORM pg_advisory_xact_lock(hashtext('org_versiones'));
  DELETE FROM org_versiones WHERE id = p_version AND estado = 'borrador';
  PERFORM org_liberar_nodos('borrador descartado');
END;
$$;

-- Asignaciones (inmediatas): {upsert: [{id, clave, personal_id|usuario_id|nombre_libre, modalidad,
-- desde, hasta}], borrar: [ids]}. De un ocupante que ya existe solo cambian modalidad y fechas.
-- Borrar es para deshacer una asignación recién hecha; quitar a alguien es ponerle `hasta`.
CREATE OR REPLACE FUNCTION org_guardar_ocupantes(p_cambios JSONB) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM org_exigir_editor();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_cambios->'upsert', '[]'::jsonb)) f
              WHERE NOT EXISTS (SELECT 1 FROM org_nodos n WHERE n.clave = f->>'clave')) THEN
    RAISE EXCEPTION 'Ese puesto no existe.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  DELETE FROM org_ocupantes
   WHERE id IN (SELECT (jsonb_array_elements_text(COALESCE(p_cambios->'borrar', '[]'::jsonb)))::uuid);

  INSERT INTO org_ocupantes (id, nodo_id, personal_id, usuario_id, nombre_libre, modalidad, desde, hasta)
  SELECT COALESCE((f->>'id')::uuid, gen_random_uuid()), n.id,
         (NULLIF(f->>'personal_id', ''))::uuid, (NULLIF(f->>'usuario_id', ''))::uuid, NULLIF(btrim(f->>'nombre_libre'), ''),
         COALESCE(NULLIF(f->>'modalidad', ''), 'titular'),
         COALESCE((NULLIF(f->>'desde', ''))::date, org_hoy()), (NULLIF(f->>'hasta', ''))::date
    FROM jsonb_array_elements(COALESCE(p_cambios->'upsert', '[]'::jsonb)) WITH ORDINALITY AS t(f, i)
    JOIN org_nodos n ON n.clave = f->>'clave'
   ORDER BY i
  ON CONFLICT (id) DO UPDATE SET
    modalidad = EXCLUDED.modalidad, desde = EXCLUDED.desde, hasta = EXCLUDED.hasta,
    motivo_fin = CASE WHEN EXCLUDED.hasta IS NULL THEN NULL ELSE org_ocupantes.motivo_fin END;
END;
$$;

-- «Empezar desde la estructura base» (estado vacío): solo si todavía no hay ninguna versión.
CREATE OR REPLACE FUNCTION org_sembrar(p_filas JSONB) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM org_exigir_editor();
  PERFORM pg_advisory_xact_lock(hashtext('org_versiones'));
  IF EXISTS (SELECT 1 FROM org_versiones) THEN
    RAISE EXCEPTION 'El organigrama ya tiene una versión cargada.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN org_sembrar_interno(p_filas, 'Estructura inicial');
END;
$$;

-- ============================================================
-- RLS: se lee con el módulo en «ver» (o más); se escribe con «editar». El borrador y su
-- contenido, y las notas internas, solo los ven los editores.
-- ============================================================
ALTER TABLE org_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_nodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_nodo_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_notas_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_ocupantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organigrama: leer" ON org_versiones;
CREATE POLICY "Organigrama: leer" ON org_versiones FOR SELECT TO authenticated
  USING ((SELECT org_puede_ver()) AND (estado <> 'borrador' OR (SELECT org_puede_editar())));

DROP POLICY IF EXISTS "Organigrama: leer" ON org_nodo_version;
CREATE POLICY "Organigrama: leer" ON org_nodo_version FOR SELECT TO authenticated
  USING ((SELECT org_puede_editar())
         OR ((SELECT org_puede_ver())
             AND EXISTS (SELECT 1 FROM org_versiones v WHERE v.id = version_id AND v.estado <> 'borrador')));

DROP POLICY IF EXISTS "Organigrama: leer" ON org_nodos;
CREATE POLICY "Organigrama: leer" ON org_nodos FOR SELECT TO authenticated USING ((SELECT org_puede_ver()));

DROP POLICY IF EXISTS "Organigrama: leer" ON org_ocupantes;
CREATE POLICY "Organigrama: leer" ON org_ocupantes FOR SELECT TO authenticated USING ((SELECT org_puede_ver()));

DROP POLICY IF EXISTS "Organigrama: leer" ON org_notas_internas;
CREATE POLICY "Organigrama: leer" ON org_notas_internas FOR SELECT TO authenticated USING ((SELECT org_puede_editar()));

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_versiones', 'org_nodos', 'org_nodo_version', 'org_notas_internas', 'org_ocupantes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Organigrama: editores cargan" ON %I', t);
    EXECUTE format('CREATE POLICY "Organigrama: editores cargan" ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT org_puede_editar()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Organigrama: editores editan" ON %I', t);
    EXECUTE format('CREATE POLICY "Organigrama: editores editan" ON %I FOR UPDATE TO authenticated USING ((SELECT org_puede_editar())) WITH CHECK ((SELECT org_puede_editar()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Organigrama: editores borran" ON %I', t);
    EXECUTE format('CREATE POLICY "Organigrama: editores borran" ON %I FOR DELETE TO authenticated USING ((SELECT org_puede_editar()))', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END
$rls$;

-- Las funciones: nada para anon; las internas, para nadie de afuera.
DO $fn$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'org_puede_ver()', 'org_puede_editar()', 'org_leer()', 'org_crear_borrador()',
    'org_guardar_borrador(uuid, jsonb)', 'org_publicar(uuid, text, jsonb)', 'org_descartar_borrador(uuid)',
    'org_guardar_ocupantes(jsonb)', 'org_sembrar(jsonb)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'org_exigir_editor()', 'org_hoy()', 'org_nodos_json(uuid)', 'org_version_json(org_versiones)',
    'org_escribir_nodos(uuid, jsonb)', 'org_liberar_nodos(text)', 'org_sembrar_interno(jsonb, text)',
    'org_evitar_ciclo()', 'org_version_inmutable()', 'org_versiones_proteger()', 'org_tocar_updated_at()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END
$fn$;

-- ============================================================
-- Contenido inicial: la estructura del organigrama original como VERSIÓN 1, sin personas.
-- Solo si todavía no hay ninguna versión (correrla de nuevo no duplica nada).
-- El JSON sale de src/lib/organigrama/estructura-base.ts
-- (node --experimental-strip-types scripts/organigrama-estructura-sql.mts); datos.test.ts
-- verifica que coincidan.
-- ============================================================
DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_versiones) THEN
    PERFORM org_sembrar_interno($base$[
{"clave":"dg","depende_de":null,"tipo":"direccion","titulo":"DIRECCIÓN GENERAL","rol":"Gerencia General","color":"gris","mision":"Coordina todas las áreas. Traduce estrategia en ejecución. Define prioridades. Lidera reuniones de gestión. Resuelve conflictos interáreas.","tareas":[],"no_hace":["No opera directamente","No puentea jefaturas","No resuelve cada excepción personalmente"],"kpis":["Cumplimiento plan estratégico","Coordinación interáreas","Rentabilidad general"],"nota_diseno":null,"fuente_ocupantes":"manual","orden":0},
{"clave":"tec_com","depende_de":"dg","tipo":"area","titulo":"Dirección Técnico-Comercial","rol":"Responsable Técnico-Comercial","color":"teal","mision":"Área unificada. El vendedor capta, atiende y envía al técnico a relevar. El técnico proyecta, computa y devuelve la cotización. El vendedor negocia y cierra. Trabajan como equipo con cola de trabajo priorizada.","tareas":[],"no_hace":["El vendedor no promete fechas sin validar con el técnico","El técnico no persigue clientes","Ninguno altera alcances en obra sin bajar formalmente"],"kpis":["Ventas cerradas","Tasa de conversión","Tiempo de respuesta de cotización","Errores de cómputo","Rentabilidad por negocio","Clientes nuevos"],"nota_diseno":"CLAVE: la cola de trabajo del técnico debe ser visible y priorizada.","fuente_ocupantes":"manual","orden":0},
{"clave":"ventas","depende_de":"tec_com","tipo":"puesto","titulo":"Ventas","rol":"Ejecutivos Comerciales","color":null,"mision":null,"tareas":[{"texto":"Captación y desarrollo de clientes"},{"texto":"Atención de consultas (teléfono, WhatsApp, mail)"},{"texto":"Cotización y negociación de presupuestos"},{"texto":"Seguimiento post-venta y satisfacción"},{"texto":"Renovaciones y cartera activa"},{"texto":"Campañas Google Ads y redes sociales"},{"texto":"Estrategias SEO y contenido web"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":0},
{"clave":"oficina_tec","depende_de":"tec_com","tipo":"puesto","titulo":"Oficina Técnica","rol":"Técnicos Proyectistas","color":null,"mision":null,"tareas":[{"texto":"Relevamientos y planos en campo"},{"texto":"Renders y memorias de cálculo"},{"texto":"Proyectos y cómputo de materiales"},{"texto":"Documentación técnica de obra"},{"texto":"Criterios de montaje y estandarización"},{"texto":"Emitir Solicitud de Materiales (SOL)","docs":[{"codigo":"SOL","rol":"emite"}]}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":1},
{"clave":"ops","depende_de":"dg","tipo":"area","titulo":"Dirección de Operaciones","rol":"Responsable de Operaciones","color":"ambar","mision":"Ejecuta armados, desarmes y servicios. Planifica y programa obras. Coordina cuadrillas, supervisores y transporte. Separación clara entre Planificación (decide qué/cuándo) y Ejecución (hace).","tareas":[],"no_hace":["No vende","No define precios","No saca materiales por fuera del circuito","No entrega sin remito"],"kpis":["Cumplimiento de agenda","Horas reales vs previstas","Productividad cuadrillas","Retrabajos","% obras según programa","Desvíos operativos"],"nota_diseno":"Logística y transporte quedan acá porque son ejecución operativa. Depósito NO.","fuente_ocupantes":"manual","orden":1},
{"clave":"planif","depende_de":"ops","tipo":"puesto","titulo":"Planificación y Programación","rol":"Coordinador","color":null,"mision":null,"tareas":[{"texto":"Programar qué obra va cuándo"},{"texto":"Asignar cuadrillas y recursos"},{"texto":"Definir prioridades y secuencias"},{"texto":"Coordinar con Depósito fechas de despacho y retorno"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":0},
{"clave":"supervision","depende_de":"ops","tipo":"puesto","titulo":"Supervisión de Obras","rol":"Supervisores","color":null,"mision":null,"tareas":[{"texto":"Control de ejecución en campo"},{"texto":"Verificación de planos y diseños"},{"texto":"Reportes de avances y problemas"},{"texto":"Control de tiempos de ejecución"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":1},
{"clave":"montajes","depende_de":"ops","tipo":"puesto","titulo":"Montajes y Desmontajes","rol":"Capataces / Cuadrillas","color":null,"mision":null,"tareas":[{"texto":"Coordinación de cuadrillas de montaje"},{"texto":"Ejecución de montaje de andamios (todas las verticales)"},{"texto":"Ejecución de desmontaje y devolución de materiales"},{"texto":"Firma de Remitos de Salida (RS) al recibir","docs":[{"codigo":"RS","rol":"firma"}]},{"texto":"Emisión de Formulario de Sobrante (FS) post-armado","docs":[{"codigo":"FS","rol":"emite"}]},{"texto":"Firma de Remito de Devolución Final (RDF) al desarmar","docs":[{"codigo":"RDF","rol":"firma"}]}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"cuadrillas","orden":2},
{"clave":"taller","depende_de":"ops","tipo":"puesto","titulo":"Taller","rol":"Reparación y Fabricación","color":null,"mision":null,"tareas":[{"texto":"Reparación y fabricación de piezas"},{"texto":"Control de calidad de materiales"},{"texto":"Registro y mantenimiento de materiales"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":3},
{"clave":"logistica","depende_de":"ops","tipo":"puesto","titulo":"Repartos y Logística","rol":"Coordinador Logístico / Choferes","color":null,"mision":null,"tareas":[{"texto":"Coordinación de entregas y retiros"},{"texto":"Programación de viajes y vehículos"},{"texto":"Monitoreo de flota en tiempo real"},{"texto":"Transporte con remito correspondiente","docs":[{"codigo":"RS","rol":"usa"}]},{"texto":"Firma de RS al cargar y entregar","docs":[{"codigo":"RS","rol":"firma"}]}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":4},
{"clave":"seguridad","depende_de":"ops","tipo":"puesto","titulo":"Seguridad y Formación","rol":"SyH / Capacitación","color":null,"mision":null,"tareas":[{"texto":"Auditorías e investigación de accidentes"},{"texto":"EPP y documentación habilitante"},{"texto":"Capacitación en montaje seguro"},{"texto":"Habilitación personal de obra / seguros"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":5},
{"clave":"vehiculos","depende_de":"ops","tipo":"puesto","titulo":"Mantenimiento de Vehículos","rol":"Flota","color":null,"mision":null,"tareas":[{"texto":"Inspección y mantenimiento preventivo"},{"texto":"Gestión de repuestos e insumos"},{"texto":"Registro de historial de reparaciones"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":6},
{"clave":"deposito","depende_de":"dg","tipo":"area","titulo":"Depósito y Control de Materiales","rol":"Encargado de Depósito","color":"violeta","mision":"Custodio del inventario físico. Único habilitado para entregar o recibir material. Reporta directo a Dirección General para garantizar independencia de control frente a Operaciones.","tareas":[],"no_hace":["No entrega material sin Solicitud aprobada","No recibe sin remito","No modifica stock sin respaldo","No responde a pedidos informales"],"kpis":["Diferencia stock físico vs sistema (<1%)","Material dado de baja por daño","Tasa de diferencias al cierre (<10%)","% faltante sin justificación (<0.5%)"],"nota_diseno":"SEPARADO DE OPERACIONES a propósito. Si reporta a Operaciones, pierde capacidad de decir 'no' cuando falta documentación.","fuente_ocupantes":"manual","orden":2},
{"clave":"stock","depende_de":"deposito","tipo":"puesto","titulo":"Control de Stock","rol":"Stock e Inventario","color":null,"mision":null,"tareas":[{"texto":"Inventario de materiales actualizado"},{"texto":"Verificar stock disponible vs SOL","docs":[{"codigo":"SOL","rol":"usa"}]},{"texto":"Emitir Orden de Preparación de Carga (OPC)","docs":[{"codigo":"OPC","rol":"emite"}]},{"texto":"Emitir Remitos de Salida (RS)","docs":[{"codigo":"RS","rol":"emite"}]},{"texto":"Clasificar material devuelto (bueno/reparar/baja)"},{"texto":"Auditoría mensual de stock físico vs sistema"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":0},
{"clave":"despacho","depende_de":"deposito","tipo":"puesto","titulo":"Preparación y Despacho","rol":"Operarios de Depósito","color":null,"mision":null,"tareas":[{"texto":"Preparar cargas según OPC","docs":[{"codigo":"OPC","rol":"usa"}]},{"texto":"Conteo final ítem por ítem antes de cargar"},{"texto":"Etiquetar materiales por obra"},{"texto":"Organización y orden de almacenamiento"},{"texto":"Limpieza e identificación de defectuosos"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":1},
{"clave":"devoluciones","depende_de":"deposito","tipo":"puesto","titulo":"Recepción y Devoluciones","rol":"Control de Ingresos","color":null,"mision":null,"tareas":[{"texto":"Recibir devoluciones con RDP/RDF firmado","docs":[{"codigo":"RDP","rol":"recibe"},{"codigo":"RDF","rol":"recibe"}]},{"texto":"Verificar estado de cada ítem devuelto"},{"texto":"Registrar sobrantes (FS) y parciales (RDP)","docs":[{"codigo":"FS","rol":"recibe"},{"codigo":"RDP","rol":"recibe"}]},{"texto":"Área de cuarentena para material sin remito"},{"texto":"Actualizar stock al momento del movimiento"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":2},
{"clave":"admin","depende_de":"dg","tipo":"area","titulo":"Administración y Finanzas","rol":"Responsable Admin. y Finanzas","color":"verde","mision":"Área nueva a formalizar. Asegura orden documental, caja, facturación, cobranza y control económico. Es donde vive la conciliación de materiales por obra.","tareas":[],"no_hace":["No persigue sola información que otras áreas deben entregar","No se hace cargo de errores sin elevarlos","No solo apaga incendios"],"kpis":["Facturación emitida vs pendiente","Días de cobro","Mora","Flujo de fondos","Margen por obra","% obras conciliadas al cierre (100%)"],"nota_diseno":"NUEVA. Hoy está dispersa. Crítico formalizarla.","fuente_ocupantes":"manual","orden":3},
{"clave":"fact","depende_de":"admin","tipo":"puesto","titulo":"Facturación","rol":"Facturación","color":null,"mision":null,"tareas":[{"texto":"Emitir facturas en tiempo y forma"},{"texto":"Control documental de obra"},{"texto":"Alinear con Comercial condiciones de facturación"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":0},
{"clave":"cobr","depende_de":"admin","tipo":"puesto","titulo":"Cobranzas","rol":"Cobranzas","color":null,"mision":null,"tareas":[{"texto":"Gestión de cobro"},{"texto":"Control de deuda y mora"},{"texto":"Cuentas corrientes de clientes"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":1},
{"clave":"teso","depende_de":"admin","tipo":"puesto","titulo":"Tesorería y Pagos","rol":"Tesorería","color":null,"mision":null,"tareas":[{"texto":"Administrar flujo de fondos"},{"texto":"Ordenar pagos a proveedores"},{"texto":"Control de caja"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":2},
{"clave":"control","depende_de":"admin","tipo":"puesto","titulo":"Costos, Control y RRHH","rol":"Control de Gestión","color":null,"mision":null,"tareas":[{"texto":"Conciliación de materiales por obra (ICO)","docs":[{"codigo":"ICO","rol":"emite"}]},{"texto":"Registro de todos los remitos en sistema","docs":[{"codigo":"RS","rol":"usa"},{"codigo":"RDP","rol":"usa"},{"codigo":"RDF","rol":"usa"}]},{"texto":"Análisis de márgenes y desvíos"},{"texto":"Reportes de KPIs operativos y financieros"},{"texto":"Altas, bajas y legajos de personal"},{"texto":"Compras operativas y relación proveedores"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":3},
{"clave":"sistemas","depende_de":"dg","tipo":"area","titulo":"Sistemas y Mantenimiento","rol":"IT / Infraestructura","color":"rosa","mision":"Función combinada y liviana. Resuelve IT, automatiza lo posible, mantiene infraestructura edilicia.","tareas":[],"no_hace":["No decide prioridades de negocio","No trabaja sin coordinación con otras áreas"],"kpis":["Uptime de sistemas","Tiempo de resolución de incidentes","Mantenimiento preventivo cumplido"],"nota_diseno":"Función combinada. Si el volumen crece, se separan.","fuente_ocupantes":"manual","orden":4},
{"clave":"it","depende_de":"sistemas","tipo":"puesto","titulo":"Soporte IT y Desarrollo","rol":"Sistemas","color":null,"mision":null,"tareas":[{"texto":"Hardware, redes y software"},{"texto":"Desarrollo de software interno"},{"texto":"Automatización de tareas repetitivas"},{"texto":"Soluciones de gestión logística e inventarios"},{"texto":"Evaluación de nuevas tecnologías"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":0},
{"clave":"mant","depende_de":"sistemas","tipo":"puesto","titulo":"Mantenimiento Edilicio","rol":"Infraestructura","color":null,"mision":null,"tareas":[{"texto":"Mantenimiento preventivo (fumigación, desagües)"},{"texto":"Mantenimiento correctivo (reparaciones, filtraciones)"},{"texto":"Servicios externos (incendios, ascensor, matafuegos)"},{"texto":"Limpieza de depósitos y oficinas"}],"no_hace":[],"kpis":[],"nota_diseno":null,"fuente_ocupantes":"manual","orden":1}
]$base$::jsonb, 'Estructura inicial');
  END IF;
END
$seed$;
