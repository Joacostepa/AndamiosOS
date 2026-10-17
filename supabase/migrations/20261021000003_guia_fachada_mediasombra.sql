-- ========================================================================
-- WhatsApp de clientes — fachada: bandeja si pasa gente abajo, media sombra siempre (17/10)
-- ========================================================================
--
-- JS (17/10), precisando la regla de 20261021000002: «la regla importa siempre y cuando pueda
-- llegar a haber circulación de personas por debajo del andamio mientras trabajan. Lo mismo la
-- cobertura en media sombra: en fachadas siempre se instala para que contenga polvo,
-- salpicaduras, agua si hidrolavan, revoque si están picando; queda todo contenido en el andamio
-- y cae sobre la bandeja».
--
-- Cambia la frase que dejó 20261021000002 en clientes_guia_trabajos, sólo si sigue escrita así
-- (si JS ya la editó en Parámetros, no se pisa). Las instrucciones (prompt.ts) dicen lo mismo.
--
-- Aplicar: npx supabase db query --linked --workdir <repo> -f <este archivo>
-- Idempotente: si la frase ya no está, el replace no hace nada.

DO $mig$ BEGIN

  UPDATE cotizacion_parametros
  SET texto = replace(texto,
        'estructura de fachada, siempre con bandeja de protección peatonal en planta baja (no es opcional: no preguntes si la necesitan).',
        'estructura de fachada, siempre con media sombra (contiene polvo, salpicaduras, agua del hidrolavado y revoque) y con bandeja de protección en planta baja si puede pasar gente por debajo mientras trabajan: a la calle, siempre (no lo preguntes); en contrafrente o patio interno, preguntá si circula gente por abajo.')
  WHERE clave = 'clientes_guia_trabajos'
    AND texto LIKE '%estructura de fachada, siempre con bandeja de protección peatonal en planta baja (no es opcional: no preguntes si la necesitan).%';

END $mig$;
