-- Habilitar pasa de ser un EFECTO a ser una DECISIÓN.
--
-- Hasta acá `hab_estado = habilitada` se derivaba de los requisitos: la obra se
-- habilitaba sola al aprobar el último papel. Nadie decía "esta obra está habilitada",
-- pasaba — y ese clic chico ponía el semáforo en verde y destrababa la obra en el
-- tablero, sin que quedara registrado quién se hizo cargo.
--
-- El propio módulo ya reconocía esta distinción para la consulta al cliente ("es una
-- decisión, no un efecto", ver derivarInputs) y por eso `hab_fecha_consulta` se conserva
-- en vez de derivarse. Habilitar es la misma clase de cosa. Estas tres columnas son ese
-- registro: cuándo, quién, y con qué motivo si se habilitó sin tener todo aprobado.
--
-- Mientras `habilitada_el` sea NULL la derivación sigue mandando y la obra nunca llega
-- sola a `habilitada`: como mucho queda `en_curso`.

ALTER TABLE hab_ots
  ADD COLUMN IF NOT EXISTS habilitada_el     DATE,
  ADD COLUMN IF NOT EXISTS habilitada_por    UUID REFERENCES user_profiles(id),
  -- Sólo se completa cuando se habilita SIN todos los requisitos aprobados: es la
  -- excepción documentada, no un campo de notas.
  ADD COLUMN IF NOT EXISTS habilitada_motivo TEXT;

COMMENT ON COLUMN hab_ots.habilitada_el IS
  'Fecha en que alguien declaró habilitada la obra. NULL = todavía no se habilitó.';
COMMENT ON COLUMN hab_ots.habilitada_motivo IS
  'Motivo escrito, obligatorio sólo si se habilitó con requisitos sin aprobar.';

-- Las obras que YA estaban habilitadas por derivación conservan su estado: sin esto, el
-- primer recálculo las bajaría a en_curso y el tablero mostraría como pendientes obras
-- que en los hechos están resueltas.
UPDATE hab_ots
   SET habilitada_el = COALESCE(hab_fecha, CURRENT_DATE)
 WHERE hab_estado = 'habilitada'
   AND habilitada_el IS NULL;
