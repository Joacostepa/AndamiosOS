-- ============================================================
-- Cotizaciones: datos comerciales y técnico-vendedor
-- ============================================================

-- Técnico-vendedor responsable
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES user_profiles(id);

-- Datos comerciales del prospect (metadata ya existe como JSONB, usamos campos ahí)
-- metadata.tipo_cliente_perfil: "busca_precio" | "busca_profesionalismo" | "busca_velocidad" | "busca_seguridad"
-- metadata.etapa_cliente: "cotizando" | "contratado" | "licitacion" | "listo_contratar"
-- metadata.fecha_proyectada: date string
-- metadata.rol_contacto: "decide" | "traslada" | "influye"
-- metadata.hay_competencia: boolean
-- metadata.tipo_producto_fachada: "andamio_completo" | "bandeja_peatonal"
-- metadata.metros_cuadrados: number (para andamio completo)
-- metadata.metros_lineales: number (para bandeja peatonal)
-- metadata.precio_referencia_m2: number
-- metadata.precio_referencia_ml: number
