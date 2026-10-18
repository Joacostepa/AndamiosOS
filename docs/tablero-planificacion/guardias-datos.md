> Medición del 18/10/2026, solo lectura contra Odoo y Supabase, para la propuesta de [guardias.md](guardias.md). Los scripts quedaron en una carpeta temporal de la sesión y no se guardaron en el repo.

# Qué tan al límite está la agenda: medición con datos reales (solo lectura)

## Qué datos hay y qué no

- **Tablero:** las asignaciones en Odoo arrancan el 17/08/2026 y el registro de movimientos (`plan_movimientos`) el 12/09. De ahí salen unas 5 semanas de uso real, no 6 meses. La C4 trabaja fija desde el 21/09 y la C5 desde el 24/09.
- **Partes:** hay 1539, con datos útiles desde marzo de 2026. Hasta agosto la cuadrilla figura por el nombre del puntero (MIÑO, HEPPER…), así que para ese período solo se puede contar cuántas cuadrillas trabajaron por día.
- **Clima:** el campo `x_clima` de los partes está vacío. La lluvia la saqué del histórico diario de Open-Meteo para CABA, consultado solo para leer.
- **Lo que no se puede reconstruir antes de septiembre:** las OTs se importaron en bloque el 15 y 16/08 (986 OTs), así que antes de esa fecha no hay "cuándo entró" ni un estimado previo a la ejecución.

## 1. Ocupación de las cuadrillas

Cuento como día hábil de lunes a sábado sin feriados (el sábado se trabaja como un día más). La carga de cada cuadrilla en un día es la suma de las fracciones asignadas, apoyos incluidos.

**Lo que ya pasó, del 01/09 al 17/10, según el tablero:**

| | Ocupación media | Días llenos | Días con más de 1 jornada | Vacíos |
|---|---|---|---|---|
| C1 | 96% | 38 de 40 | 0 | 1 |
| C2 | 91% | 32 de 40 | 5 | 2 |
| C3 | 90% | 30 de 40 | 5 | 2 |
| C4 | 51% (casi llena desde el 21/09) | 18 de 40 | 0 | 17 |
| C5 | 31% (desde el 24/09) | 10 de 40 | 5 | 26 |

- **Semana a semana, C1 a C4:** 78% la del 14/09, 93% la del 21/09, 75% la del 28/09 (lluvia), 98% la del 05/10 y 90% la del 12/10. Con las 4 cuadrillas trabajando fijas, la ocupación ronda el **90%**, y llega a 93–98% en las semanas sin lluvia.
- **La C1 está tomada por una sola obra:** el armado de San Martín (S01520) dura 29 jornadas, hasta el 02/11. Para lo flexible quedan en la práctica C2, C3 y C4.
- **Cotejado con los partes:** entre el 01/09 y el 16/10, sobre 39 días hábiles hubo parte en 38 días para C1, 37 para C2, 37 para C3 y 23 para C4. No apareció ningún parte sin asignación en el tablero.

**Lo que ya estaba planificado de antemano.** Reconstruí cómo estaba el plan cada viernes a la noche: tomé el estado actual y deshice los movimientos hacia atrás. Solo 15 de 1900 jornadas no cuadraron.

| Foto del viernes | Semana siguiente C1–C4 | Semana +2 | Semana +3 | C5 en la semana siguiente |
|---|---|---|---|---|
| 18/09 | 90% | 81% | 75% | 0% |
| 25/09 | 98% | 85% | 89% | 33% |
| 02/10 | 99% | 86% | 68% | 83% |
| 09/10 | 92% | 68% | 11% | 52% |
| 16/10 | 75% | 54% | 30% | 67% |
| **Promedio** | **91%** | **75%** | **55%** | **47%** |

- **El viernes, la semana siguiente ya está casi completa:** queda alrededor de 2 cuadrilla-días libres de 24.
- **El dato más fuerte:** cada día hábil a las 21 h, la mediana de jornadas libres en los 3 días hábiles siguientes es **0,5 de 12** (C1 a C4). En 20 de 27 días quedaba 1 jornada libre o menos, y en 3 días no quedaba ninguna. La C5 tenía mediana de 1,9 libres de 3.
- **Hoy (18/10), mirando hacia adelante:**
  - Semana del 19/10: C1–C4 al 75%, con 6 cuadrilla-días vacíos; C5 al 67%.
  - Semana del 26/10: C1–C4 al 58%; C5 al 100%.
  - Semana del 02/11: C1–C4 al 55%; C5 al 100%.

## 2. Turbulencia: cuánto se mueve la agenda

Desde el 14/09 hay 710 movimientos registrados: 195 obras puestas en la grilla, 400 obras movidas, 70 sacadas de la grilla, 23 corrimientos, 13 obras fijadas y 9 soltadas.

- **De los 400 movimientos:** 146 postergan la obra, 120 la adelantan y 134 la cambian de cuadrilla en el mismo día.
- **Cambios de fecha reales (mover y correr), 289 en total.** Por semana:
  - 14/09: 51
  - 21/09: 36
  - 28/09: 81 (lluvia)
  - 05/10: 97
  - 12/10: 24 (semana corta)
- **Con cuánta anticipación se cambia la fecha:** 18 veces el mismo día o con la fecha ya pasada, 25 para el día siguiente, 64 con 2 o 3 días, 94 con 4 a 7 días y 88 con más de 7. Es decir, **107 de 289 (37%) se mueven con 3 días o menos.**
- **Obras movidas:** 96 obras tuvieron al menos un cambio de fecha. 68 se movieron más de una vez, 43 tres veces o más y 16 cinco veces o más. Hay obras con 14 movimientos (S02025 y S01483). De las 128 obras que se pusieron en la grilla desde el 14/09, **79 (62%) se movieron después.**
- **Corrimientos:** todos por lluvia, en 4 tandas. El 29/09 se corrieron 6 obras y 40 jornadas. El 03/10, 13 obras y 17 jornadas. El 07/10 se corrieron 2 obras y después se deshizo.
- **Días suspendidos (`plan_suspensiones`):** hay 5 marcas, todas por lluvia: el 29/09 (C1 y C2) y el 03/10 (C2, C3 y C4).
- **Obras sacadas de la grilla:** 70 veces, sobre 47 obras distintas. 25 de esas veces fue con 3 días o menos.
- **Cuándo se planifica:** los movimientos se concentran de martes a jueves (cerca de 150 por día) contra unos 100 los lunes y viernes.

## 3. Urgencias y trabajos cortos

Desde el 01/09 entraron **164 OTs nuevas**, entre 20 y 33 por semana (12 en la semana del feriado).

- **Por tipo:** 81 armados, 68 desarmes y 15 "servicios" (7 de tipo otro, 4 de mantenimiento, 4 de desmonte parcial).
- **Trabajos cortos:** contando los servicios y los armados o desarmes de media jornada o menos, son **28 OTs, 3 a 6 por semana.**
- **Urgencia:** 12 en alta y 19 en media, o sea **4 a 8 por semana.**

Días desde que se crea la OT:

| | Cuántas | Hasta que se pone en la grilla | Hasta la primera fecha (P25 / mediana / P75) | Hasta el primer parte |
|---|---|---|---|---|
| Todas | 164 | 0,7 | 3 / 8 / 17 | 7 |
| Urgencia alta o media | 31 | 0,7 | 2 / 6 / 8 | 3 |
| Cortas y servicios | 28 | 0,5 | 1 / 2,5 / 6 | 2 |
| Armados | 74 | 0,7 | 7 / 13 / 29 | 9,5 |
| Desarmes | 62 | 0,7 | 2 / 7 / 10 | 7 |

- **Lo que demora es encontrar lugar, no planificar:** las OTs entran a la grilla en menos de un día, pero la primera fecha libre cae a una semana o más.
- **Obras metidas "a presión"** (aproximación): busqué cuándo poner una obra en la grilla coincidió con que la misma persona, dentro de los 30 minutos, movió o sacó otra obra de esa misma cuadrilla y día.
  - Pasó en **60 de 195 obras puestas (31%)** y desplazó a 84 obras.
  - En 22 de esos casos la fecha estaba a 3 días o menos.
  - La que entró era de urgencia alta en 3 casos, media en 6 y baja en 51. O sea que **se aprieta también por obras normales, no solo por urgencias.**

## 4. Desarmes no urgentes como relleno

- **En la bandeja "Sin asignar" no hay relleno:** hay **1 sola obra**, un armado con habilitación en curso. Las otras 59 OTs pendientes ya están en la grilla.
- **Desarmes en la grilla desde el 19/10:** 15 (14 jornadas), de urgencia baja y media.
- **Reserva latente:** hay **86 ventas con el armado terminado y sin OT de desarme**, es decir, andamios todavía en obra. 50 de ellas se armaron en los últimos 3 meses. Usando las jornadas del armado como referencia, suman unas **125 jornadas** de desarme futuro.
- **Hoy esa reserva no se ve en el tablero**, porque la OT de desarme recién nace cuando el cliente la pide.

## 5. Duración estimada contra la ejecutada

Usé solo las OTs creadas desde el 30/08, que tienen un estimado real cargado antes de ejecutar. Las anteriores parecen tener el estimado cargado en la importación, así que no sirven para esta comparación.

| | Se pasaron del estimado | Días reales contra estimados | Contra el primer plan del tablero |
|---|---|---|---|
| Armados | 6 de 51 (12%) | 72 contra 61 (**+18%**) | 52 contra 41 |
| Desarmes | 1 de 76 | 77 contra 76 (justo) | 35 contra 40 |
| Servicios | 2 de 14 | 17 contra 14 | – |

- **Cuando un armado se pasa, son 1 o 2 días.** Hay casos más largos: Copimex (S00128) pasó de 8 estimadas a 11 reales.
- **El riesgo de duración está en los armados, no en los desarmes.**

## 6. Patrones por día de la semana y por mes (marzo a octubre)

- **Lluvia:** 26 de 186 días hábiles tuvieron 5 mm o más. Es el **14%, unos 0,8 días por semana.** Abril fue el peor mes (7 días) y en septiembre y octubre hubo entre 2 y 3 por mes.
- **Cuánto pesa la lluvia:** un día de lluvia trabajan en promedio 2,4 cuadrillas propias, contra 2,9 en días secos. Con 10 mm o más varias veces no salió nadie (21/03, 06/04 y 15/04).
- **Por día de la semana:** de lunes a viernes trabajan entre 3,0 y 3,2 cuadrillas por día, y el sábado 2,5. No hay un día pico marcado. Los lunes y jueves llueven un poco más (18% y 16%), pero con pocos datos.
- **Por mes:** las cuadrillas propias por día fueron 2,8 en marzo y abril, 3,3 en mayo, 3,2 en junio, 2,7 en julio y 2,4 en agosto. Desde septiembre son 3,3 a 3,4, cerca del techo de 4.
- **Domingos:** hubo 8 con partes.

## Conclusiones

1. **La agenda está al límite de verdad.** Con 4 cuadrillas trabajando, C1 a C4 están al 90–98% y la semana siguiente está al 91% ya el viernes anterior. En los 3 días hábiles siguientes queda en promedio **media jornada libre de 12**. No hay ningún colchón para una urgencia ni para un día de lluvia.
2. **Lo que pasa hoy es reprogramar todo el tiempo.** Hay 50 a 100 cambios de fecha por semana. El 62% de las obras que se ponen en la grilla se mueve después, y el 37% de los cambios es con 3 días o menos.
3. **Las causas que se repiten se pueden medir:**
   - Lluvia: unos 0,8 días hábiles por semana.
   - Urgencias: 4 a 8 por semana.
   - Trabajos cortos: 3 a 6 por semana, que se atienden en unos 2,5 días.
   - Armados que se pasan: +18% de días.
   
   **Una reserva del orden de 1,5 a 2 cuadrilla-días por semana** cubriría la lluvia y las urgencias, pero hoy el plan deja 0,5.
4. **La C5 es el colchón de hecho:** promedia 47% reservado para la semana siguiente. Pero para el 26/10 y el 02/11 ya está completa.
5. **Falta con qué rellenar.** La bandeja está vacía y los 86 andamios en obra sin OT de desarme son trabajo que existe pero el tablero no ve. Si esos desarmes entraran antes como OTs flexibles ("a partir de…"), los huecos que se reserven podrían llenarse sin que ninguna cuadrilla quede parada.
6. **Límites de esta medición:** son 5 semanas de tablero. La forma de detectar las obras metidas "a presión" es aproximada. Las suspensiones se registran recién desde el 29/09.

