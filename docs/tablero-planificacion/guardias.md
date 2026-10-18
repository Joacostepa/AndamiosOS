> Propuesta del panel de expertos del 18/10/2026 (capacidad, jefe de operaciones, producto e IA; debate y síntesis). **Estado: en propuesta, esperan las decisiones de JS (sección 10).** Los datos que la sostienen están en [guardias-datos.md](guardias-datos.md).

# Propuesta final del panel: "Guardias" en el tablero de planificación

## 1. En una frase

Es una tarjeta "Guardia" en el tablero. Guarda una jornada de una cuadrilla propia para lo que no se puede prever: urgencias, servicios cortos, días de lluvia y armados que se pasan. Se pone con dos semanas de anticipación, cuando todavía hay lugar. Si el día anterior a las 13 h nadie la usó, se convierte en trabajo real.

## 2. El problema en números

Los datos salen de 5 semanas de tablero, del 14/09 al 17/10, y de los partes desde marzo.

- **Estás al límite de verdad, pero sobre todo en los días que vienen.** Cada noche quedan, en mediana, **0,5 jornadas libres de 12** en los próximos 3 días hábiles de C1 a C4. En 20 de 27 días quedaba 1 o menos. El viernes, la semana siguiente ya está al **91%**. En cambio, la semana +2 está al 75% y la +3 al 55%. Lugar hay, pero lejos.
- **El costo es reprogramar todo el tiempo.** Hay entre 50 y 100 cambios de fecha por semana. **El 62%** de las obras que se ponen en la grilla se mueve después, y **el 37%** de los cambios se hace con 3 días o menos de aviso.
- **No se aprieta solo por urgencias.** De las 60 obras metidas "a presión", **51 tenían urgencia baja**. Se promete la primera fecha libre que se ve, y esa fecha es mañana.
- **Lo que se repite y se puede medir:**
  - lluvia: unos 0,8 días hábiles por semana;
  - urgencias: 4 a 8 por semana;
  - trabajos cortos: 3 a 6 por semana;
  - armados: 6 de 51 se pasaron, sumando 11 días.
  - Todo eso pide **1,5 a 2 cuadrilla-días por semana** de lugar libre. Hoy el plan deja 0,5.
- **La C1 está tomada por San Martín hasta el 02/11.** Lo flexible queda en C2, C3 y C4.
- **No hay con qué rellenar.** La bandeja tiene 1 obra. Hay 86 ventas con el andamio en obra y sin OT de desarme, unas 125 jornadas, pero no sabemos si alguna se puede adelantar.

**Lo que no se pudo medir:**
- si la demanda supera lo que hacemos (ver punto 9);
- cuánto tiempo de viaje se come una media jornada;
- si hay obras de "urgencia baja" que en realidad eran urgentes, porque casi nadie carga la urgencia.

## 3. Cómo funciona

**La guardia** es una tarea del tablero de tipo `guardia`, guardada en `tablero_tareas`. Ocupa capacidad como cualquier tarea y lleva un estado: activa, usada, rellenada o perdida.

**Cuánto se reserva.** La meta es **2 jornadas por semana, libres o en guardia**, en las cuadrillas flexibles.
- **Solo se reserva lo que falta.** Si la semana ya tiene 2 jornadas libres, no se pone ninguna guardia.
- Son cerca del 11% de C2 a C4, o el 8% cuando vuelva la C1.

**Unidad y lugar.**
- **Jornada entera, martes y jueves**, en una cuadrilla de C2 a C4 que va rotando. Así no le toca siempre al mismo capataz.
- Una urgencia espera como mucho 2 días hábiles. Hoy la mediana hasta el primer parte es de 3.
- Planificación puede partir una guardia en dos medias si caen en la misma zona.
- La C1 entra a la rotación cuando no tenga una obra de más de 10 jornadas.

**Cuándo se pone.** El viernes, para la semana +2, que hoy está al 75%.
- **Nunca se mueve una obra para crear una guardia.** Si no hay lugar, la guardia no se pone y el indicador queda en ámbar.
- Nunca va en medio de una obra de varios días, sobre algo confirmado o fijo, ni en domingos o feriados.
- **Si arrancamos ya:** las semanas del 26/10 y del 02/11 están al 58% y al 55%, así que las guardias entran sin tocar nada.

**Lluvia.** El pronóstico que tenemos da milímetros, no probabilidad (`src/lib/clima/pronostico.ts`). La regla es:
- si se pronostican **5 mm o más** un día, la guardia del día hábil siguiente **no se libera**: queda para recibir lo que se corra;
- si hay una celda libre, se suma una guardia más.

**Quién la usa.**
- Sin pedir nada: una urgencia, un servicio o trabajo corto, recuperar un día de lluvia o un armado que se pasó.
- **Una obra común pide motivo escrito**, con el mismo aviso que ya sale al confirmar fuera de la ventana. No se bloquea.
- La regla entra en una línea: *"la guardia es para lo que no se podía prever; para lo demás, motivo escrito"*.

**Cuando entra una urgencia, en este orden:**
1. La guardia más cercana.
2. Lo libre de la C5, si su contrato lo permite.
3. Recién ahí, mover una tentativa, con motivo, y avisar a quien haya que avisar.

**Liberación: el día anterior a las 13 h, hora argentina.**
- Desde que se crea, la guardia ya tiene abajo un relleno de base que siempre sirve: depósito o mantenimiento de material.
- A las 13 h del día anterior se propone el mejor relleno real, en este orden:
  1. **apoyo al armado con más riesgo de pasarse** (`x_apoyo` ya existe: ocupa capacidad y no suma días);
  2. **adelantar una tentativa** de las semanas siguientes, si su piso lo permite;
  3. **un desarme que el cliente ya pidió** con ventana amplia;
  4. **depósito**, que es el piso.
- Planificación confirma con un clic. Si nadie confirma, queda depósito y no se escribe nada en Odoo.
- **El capataz nunca recibe "guardia" a las 7: recibe una obra o depósito.**

**Corrimiento por lluvia.**
- Hoy, un día que solo tiene tareas ya frena la cascada (`corrimiento.ts`, cerca de la línea 196), pero lo que cae ahí se suma y queda pasado.
- El cambio: lo que cae sobre una guardia **la consume**, y la guardia pasa a "usada por lluvia".

**Asistente comercial.** `consultarPlanificacion` ya lee las tareas, así que ve la guardia como ocupada. Se le agrega una respuesta: "primera fecha sin tocar guardia". Es la palanca más barata, porque ataca las 51 obras normales metidas a presión.

**Por qué esto y no lo otro:**
- **Colchón al final de cada armado.** Lo descartamos: solo se pasa el 12% de los armados, así que el 88% de esos colchones habría que liberarlo y rellenarlo a último momento. Un fondo común cubre lo mismo con menos lugar.
- **Topes por horizonte (85, 80 y 70%).** Lo descartamos: era un segundo sistema que hacía lo mismo, y se contaba dos veces la reserva.
- **Proteger solo los próximos 3 días.** Lo descartamos: a 3 días ya no hay lugar, y reservar ahí obliga a mover obras con aviso corto. Es justo lo que queremos bajar.
- **Media jornada diaria.** No es confiable con los viajes en CABA y GBA mientras un capataz no diga lo contrario.

## 4. Qué hace la IA y qué no

**Regla fija, en código que se puede probar y explicar:**
- cuánto se reserva y dónde va;
- la hora de liberación;
- quién puede usar la guardia;
- qué rellenos son válidos (ventana, habilitación, capacidad, fijas).

Si la IA decidiera dónde bloquear, nadie podría explicar por qué es el jueves en la C3. Eso va contra lo que ya está escrito en el código.

**Claude** usa el núcleo de `src/lib/ia/`, con un pedido único y respuesta estructurada, igual que `revision-poliza`. **Propone y una persona confirma.**
- **A las 13 h del día anterior:** ordena los rellenos que ya pasaron la regla y lo explica en una línea. Por ejemplo: *"Apoyo a S02025: lleva 1 día de atraso y termina el viernes."*
- **Cuando se toca "meter urgente":** dice qué guardia usar o, si no queda ninguna, qué tentativa conviene mover y a qué cliente hay que avisar.
- **El lunes:** te arma un resumen con las guardias usadas, en qué se usaron, cuántas se rellenaron y cuántas terminaron en depósito.
- **Más adelante, como apuesta:** arma la lista de desarmes probables entre las 86 ventas, con un borrador de consulta al cliente que manda una persona o Tomás con confirmación.

**Siempre lo decide una persona:**
- la urgencia de cada OT;
- aceptar cada propuesta;
- usar una guardia para una obra común;
- llamar al cliente.

La IA no mueve obras sola ni toca obras confirmadas o fijas. **Si se apaga la IA, las guardias siguen funcionando.**

Para ser claros con lo que pediste: el bloqueo lo propone una regla, no la IA. La IA sirve para encajar el relleno, que es un rompecabezas de ventanas, habilitaciones y cuadrillas, y para explicar el plan.

## 5. Cómo se ve en el tablero

- **En la celda:** un bloque rayado, gris o ámbar claro y nunca rojo, que dice "Guardia · si no entra nada: Depósito" (o el relleno que tenga).
- **En el encabezado del día:** "libre 0,5 · guardia 1", por separado.
- **En la fila de la cuadrilla:** "4,5 de 6 j + 1 guardia".
- **Indicador fijo:** "Lugar protegido próximos 5 días hábiles: 1,5 de 2 j". Gris si alcanza, ámbar si falta.

**Rutina:**
- **Viernes, 10 minutos:** Planificación acepta o ajusta las guardias que propone la regla para la semana +2. En la etapa 1 las pone a mano.
- **Todos los días a las 13 h:** aviso del tipo *"Mañana: guardia C3 libre → Apoyo a S02025 [Confirmar] [Otra]"*. Al confirmar se escribe en Odoo como un lote que se puede deshacer entero, igual que el corrimiento.
- **Cuando llega algo urgente:** botón "meter urgente" en la OT de la bandeja. Escribe `x_urgencia` en Odoo, así la urgencia no queda en dos lugares, y ofrece la guardia más cercana.
- **Lunes:** tu resumen.

## 6. Cuadrillas 1 a 4 siempre con trabajo, y la 5

- **Ninguna guardia llega vacía al día:** si nadie elige otra cosa, el día anterior se convierte en relleno, y el piso es depósito.
- **Lo que se mide es lo ejecutado.** La ocupación real de C1 a C4 en los partes tiene que seguir en 90% o más. Lo que baja es lo *prometido* con anticipación, no el trabajo.
- **Alarmas:**
  - si más de la mitad de las guardias termina en depósito durante 3 semanas, la guardia baja a 1,5 jornadas por semana;
  - si quedan menos de 3 jornadas de relleno real (apoyos y desarmes pedidos), se avisa a Comercial.
- **La C5** no es un sobrante. Las propias, descontando la lluvia, rinden unas 21 jornadas por semana, y se ejecutan unas 24. Sin la C5 no alcanza.
  - Mientras no se sepa cómo se le paga, **queda fuera de la rotación de guardias**.
  - Es el segundo escalón para las urgencias.
  - Hay un aviso si tiene más del 80% firme en los próximos 5 días hábiles, porque hoy ya está al 100% para el 26/10 y el 02/11.
  - Las obras con Seguridad e Higiene nuestro o con habilitación delicada no van a la C5 como urgencia.

## 7. Etapas de construcción

**Etapa 0, esta semana, sin código:**
- preguntar a los capataces de C2 a C4 si la media jornada sirve con los viajes;
- que Comercial llame a 10 clientes con andamio en obra para ver si existen desarmes "desde el X";
- tu respuesta sobre la C5.

**Etapa 1, chica y útil por sí sola: guardia manual con indicador.**
- Migración nueva sobre `tablero_tareas`: columnas `estado`, `motivo_uso` y `relleno_ot_id`. `tipo` es texto libre, así que `guardia` entra sin cambiar el tipo. Se aplica con `npx supabase db query --linked -f`.
- Vista:
  - en `celda-dia.tsx`, el rayado;
  - en `tablero-grid.tsx`, "libre / guardia" en el encabezado, la fila de la cuadrilla y el indicador;
  - en `src/lib/tablero/tareas.ts` y sus tipos, el tipo y el estado nuevos.
- En `tablero-board.tsx` (`asignarObra`): al soltar una obra sobre una guardia, aparece el aviso de motivo reusando el de "fuera de la ventana", y la guardia queda "usada".
- En `src/lib/asistente/planificacion.ts`: la respuesta "primera fecha sin tocar guardia".
- Nada nuevo bajo la query key `["tablero"]`: las tareas ya viven ahí.

**Etapa 2, la regla propone:**
- Función pura `src/lib/tablero/guardias.ts`, con tests como los de `planearCorrimiento`: dónde poner las guardias del viernes y qué rellenos son válidos a las 13 h.
- Que el corrimiento consuma la guardia, en `corrimiento.ts` y sus tests.
- El botón "meter urgente" en `panel-sin-asignar.tsx`, que escribe `x_urgencia`.
- Rutas en `/api/planificacion/guardias/…`, cargadas en el mapa `APIS` de `src/lib/auth/acceso.ts`. Si no, quedan solo para admin.
- Tareas programadas en `vercel.json`:
  - viernes a las 13 UTC (10 h de acá);
  - de lunes a sábado a las 16 UTC (13 h de acá).
- Corregir el "hoy" en UTC de `jornadas/route.ts`.
- La confirmación se graba como un lote en `plan_movimientos`, con `lote_id`.
- Agregar el tipo "servicio" a `x_tipo` en Odoo con un script `scripts/odoo-*.mjs`.

**Etapa 3, la IA:** la propuesta de relleno explicada, la urgencia ("qué guardia, a quién avisar") y el resumen del lunes. La lista de desarmes probables, solo si la prueba de la etapa 0 da bien.

**Etapa 4, a las 6 semanas:** recalibrar el tamaño de la guardia según lo que se usó de verdad.

## 8. Cómo sabemos si funciona

Se evalúa a las 6 semanas contra las 5 que ya medimos.

| Métrica | Hoy | Meta |
|---|---|---|
| **Cambios de fecha con 3 días o menos de aviso** (la principal) | 37% | menos de 20% |
| Lugar libre o en guardia en los próximos 3 días hábiles, a las 21 h (mediana) | 0,5 j | 1,5 j o más |
| **Contrapeso:** ocupación ejecutada de C1 a C4, según los partes | 90–98% | no bajar de 90% |
| Cómo terminan las guardias: urgencia, lluvia, apoyo, desarme, depósito, obra común | sin base | depósito menos de la mitad; obra común menos del 25% |

También hay que vigilar la anticipación de lo normal: la mediana hasta la primera fecha hoy es de 8 días, y si pasa de 10, revisamos.

## 9. Lo que el panel no resolvió

1. **El tamaño.** Las propuestas fueron de 1,7, 2 y 2,5 jornadas por semana. Arrancamos con 2 y lo zanja el uso real de las primeras 6 semanas (etapa 4).
2. **Jornada entera o media.** Lo zanjan los capataces en la etapa 0. Si dicen que la media sirve, se pasa a media jornada de lunes a viernes. Si no, sigue martes y jueves.
3. **¿Falta capacidad de fondo?** Una estimación dio 25 a 28 jornadas por semana de demanda contra unas 24 ejecutadas. Pero la bandeja está vacía y la semana +3 está al 55%, y eso no cierra con una cola que crece. Lo zanja recalcular la demanda con las duraciones reales de los partes durante la prueba. Si lo que entra supera a lo que se hace, ninguna guardia alcanza: la palanca es la C5 como capacidad fija.
4. **¿Los desarmes adelantados existen?** Si el alquiler corre hasta el desarme, adelantarlo pierde facturación. Lo zanjan las 10 llamadas de la etapa 0 y tu respuesta (pregunta 5). Mientras tanto, el relleno real es apoyo, adelantar tentativas y depósito.
5. **"Congelar los próximos 3 días" sin reservar nada.** Un experto cree que alcanza para frenar a Comercial. Los otros dicen que no deja lugar para la lluvia. Lo vamos a ver en la etapa 1: si el indicador solo, junto con el aviso del asistente, ya baja los cambios con aviso corto, la etapa 2 se achica.
6. **El rol de la C5.** Depende de tu respuesta.

## 10. Decisiones que tenés que tomar

1. **¿Aceptás que lo normal espere uno o dos días más para su primera fecha?** La mediana pasaría de 8 a 10 como mucho. *Recomendación: sí. Es el precio de no mover obras a último momento.*
2. **¿La C5 cobra por día trabajado, por obra o tiene un fijo?** *Recomendación:*
   - si cobra por trabajo, es el colchón más barato: se la carga menos lejos y se la llama cerca;
   - si es fija, se trata como una propia más y entra en la rotación de guardias.
3. **¿Medio día o un día en depósito cuenta como "tener trabajo"?** *Recomendación: sí, como piso, con la alarma de "más de la mitad en depósito".*
4. **¿Adelantar un desarme corta el alquiler?** *Recomendación: que Comercial llame a 10 clientes antes de construir nada sobre los desarmes.*
5. **Tamaño inicial de 2 jornadas por semana, en jornadas enteras martes y jueves, rotando entre C2 y C4.** ¿Va? *Recomendación: sí, y se revisa a las 6 semanas.*
6. **Usar una guardia para una obra común: ¿con motivo escrito, que cualquiera de Planificación puede cargar y que vos ves en el resumen del lunes?** *Recomendación: sí. No se bloquea.*
7. **¿El botón "meter urgente" escribe la urgencia en Odoo?** *Recomendación: sí. Así la urgencia la decide una persona y queda en un solo lugar.*
8. **¿Agregamos "servicio" como tipo de OT en Odoo?** *Recomendación: sí. Es un script y a quien crea la OT le lleva dos segundos.*
9. **¿Arrancamos con la etapa 1, guardias puestas a mano, para la semana del 26/10?** *Recomendación: sí. Esa semana está al 58%, así que no hay que mover ninguna obra.*