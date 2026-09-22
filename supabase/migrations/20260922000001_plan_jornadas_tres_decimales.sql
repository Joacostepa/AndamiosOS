-- La duración que fija Operaciones necesita un decimal más, por los tamaños por hora.
--
-- EL PROBLEMA: la columna nació en NUMERIC(5,2) porque la escala era de cuartos, y el
-- propio comentario de la tabla decía que las correcciones sub-jornada "ya se hacen
-- poniendo una fracción más chica en la grilla". Eso resultó ser falso: la fracción de la
-- grilla vive en la asignación de Odoo y se BORRA al sacar la obra del tablero, así que
-- media jornada corregida se perdía y había que volver a ponerla. Ahora esa corrección se
-- guarda acá, que es lo único que sobrevive a la vuelta a la bandeja.
--
-- Y con los tamaños de 3, 5 y 7 horas (20260920000001) las fracciones son OCTAVOS: 3 h de
-- jornada son 0,375, que en dos decimales Postgres redondea SIN AVISAR a 0,38. Una obra
-- que Operaciones dejó en tres horas volvería de la bandeja como otra cosa.
--
-- POR QUÉ 6,3 Y NO MÁS: tres decimales cubren los octavos exactos, y los enteros que ya
-- había (hasta 999 jornadas contra un tope de 200 en la API) siguen entrando holgados.
--
-- Es una ampliación de precisión: no toca ningún valor cargado ni el CHECK de positivo.

ALTER TABLE public.plan_jornadas_ot
  ALTER COLUMN jornadas TYPE NUMERIC(6,3);

COMMENT ON COLUMN public.plan_jornadas_ot.jornadas IS
  'Cuántas jornadas tiene la obra según Operaciones. Fraccionario: media jornada es 0.5 y '
  'tres horas son 0.375. NUMERIC(6,3) y no (5,2) porque los octavos tienen que entrar '
  'exactos — es lo que permite que una fracción corregida en la grilla sobreviva a que la '
  'obra vuelva a la bandeja.';
