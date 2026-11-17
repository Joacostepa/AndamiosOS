-- ========================================================================
-- Links para compartir una charla de WhatsApp de clientes (JS, 16/11)
-- ========================================================================
--
-- «Compartir link» en la charla arma una página pública (/charla/<token>) con la ficha, las
-- fotos, los audios, los videos y la charla entera, para pasarla por Slack o WhatsApp a quien
-- todavía no usa la bandeja. Cualquiera con el link la abre hasta `vence_at` (30 días); después
-- muestra que venció y se genera otro desde la charla. Se puede cortar antes (`revocado_at`).
--
-- El token es aleatorio (24 bytes, base64url): no se adivina. Sin políticas: la leen y escriben
-- sólo las rutas del servidor (service role).

CREATE TABLE IF NOT EXISTS cli_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NOT NULL UNIQUE,
  conversacion_id UUID NOT NULL REFERENCES cli_conversaciones(id) ON DELETE CASCADE,
  creado_por      UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  vence_at        TIMESTAMPTZ NOT NULL,
  revocado_at     TIMESTAMPTZ,
  revocado_por    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  visitas         INT NOT NULL DEFAULT 0,
  ultima_visita_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cli_links_conversacion_idx ON cli_links (conversacion_id);

ALTER TABLE cli_links ENABLE ROW LEVEL SECURITY;

-- Cuenta una visita (para ver en la charla si alguien lo abrió).
CREATE OR REPLACE FUNCTION cli_link_visita(p_id UUID) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE cli_links SET visitas = visitas + 1, ultima_visita_at = now() WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION cli_link_visita(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cli_link_visita(UUID) TO service_role;
