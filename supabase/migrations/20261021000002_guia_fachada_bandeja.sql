-- ========================================================================
-- WhatsApp de clientes — el andamio de fachada siempre lleva bandeja (17/10)
-- ========================================================================
--
-- JS (17/10), al ver una charla de prueba en la que Tomás preguntaba «¿además del andamio
-- necesitan la bandeja de protección sobre la vereda?»: «Siempre que va el andamio en la
-- fachada, ese andamio debería contar con bandeja de protección en planta baja para proteger a
-- los peatones, no es opcional».
--
-- La guía de trabajos (clientes_guia_trabajos, la edita JS en Parámetros) decía «estructura de
-- fachada, casi siempre con bandeja abajo». Se cambia sólo esa frase, y sólo si sigue escrita
-- así: si JS ya la editó, no se pisa. Las instrucciones del agente (prompt.ts) dicen lo mismo.
--
-- Aplicar: npx supabase db query --linked --workdir <repo> -f <este archivo>
-- Idempotente: si la frase ya no está, el replace no hace nada.

DO $mig$ BEGIN

  UPDATE cotizacion_parametros
  SET texto = replace(texto,
        'estructura de fachada, casi siempre con bandeja abajo.',
        'estructura de fachada, siempre con bandeja de protección peatonal en planta baja (no es opcional: no preguntes si la necesitan).')
  WHERE clave = 'clientes_guia_trabajos'
    AND texto LIKE '%estructura de fachada, casi siempre con bandeja abajo.%';

END $mig$;
