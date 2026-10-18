> Segunda ronda del panel de expertos, 18/10/2026 (operaciones, comercial, producto; debate y síntesis), sobre dos ideas de JS: guardias automáticas desde el principio y "comodines". Extiende [guardias.md](guardias.md). **Estado: en propuesta, esperan las decisiones de JS (sección 11).** Datos en [comodines-datos.md](comodines-datos.md).

# Guardias automáticas y comodines: propuesta del panel para JS

## Decidido por JS el 18/10: guardias con candado

Esto **reemplaza** lo que la propuesta de abajo dice sobre qué puede hacer Planificación con una
guardia (§3 "Qué puede hacer Planificación" y "Si alguien suelta una obra encima"). La idea de JS: las
guardias existen para que no se pueda achicar el lugar protegido "como si nada".

- **Las pone el sistema** (viernes 10 h), como dice §3.
- **Planificación puede, sin pedir nada:**
  - **usarla para lo imprevisto:** urgencia, lo corrido por lluvia, armado atrasado;
  - **rellenarla con un comodín** desde las 13 h del día anterior;
  - **correrla dentro de la misma semana**, a otra celda libre (otro día u otra cuadrilla). El lugar
    protegido de la semana no cambia.
- **Necesita autorización de JS (solo JS):**
  - **sacarla**;
  - **meter una obra común encima.** Se elimina el "con motivo escrito, no se bloquea".
  - Planificación toca "Pedir autorización" con el motivo. A JS le llega por Slack o la app, con
    Aprobar y Rechazar. Hasta que responda, la guardia sigue puesta.
- **Lo legítimo lo resuelve el sistema:** si una cuadrilla no puede trabajar ese día (licencia,
  camión roto), el sistema corre la guardia a otra cuadrilla de la misma semana.
- **Propuesto, a confirmar con JS: la trampa de la urgencia.** Una urgencia usa la guardia sin
  permiso solo si la OT se creó en los últimos 3 días hábiles; si no, no era imprevista y pasa por
  JS. Todas las urgencias van al resumen del lunes con su motivo.
- **Respuestas de JS a las decisiones pendientes (18/10), mandan sobre todo lo de abajo:**
  - **Sí:**
    - tamaño de 2 j por semana, martes y jueves, rotando entre C2 y C4;
    - la urgencia usa la guardia sin permiso solo si la OT se creó en los últimos 3 días hábiles;
    - lo normal espera 1 o 2 días más;
    - el depósito cuenta como trabajo (JS cree que casi no va a pasar);
    - orden de relleno: apoyo, comodín, tentativa, depósito;
    - "Meter urgente" escribe `x_urgencia`;
    - "comodín" es palabra interna.
  - **C5:** subcontratada, sin disponibilidad asegurada ni plantel fijo. Fuera de las guardias y fuera
    de la capacidad segura. En una urgencia, se consulta si está disponible.
  - **Desarmes (corrige §4):** no se adelantan, se pueden atrasar. Hoy Comercial llama 10 días antes
    del vencimiento del contrato; si el cliente terminó, carga el desarme "a partir de" esa fecha. Si
    está cargado, el cliente lo pidió. Por eso se descartan: el dato "¿Se puede adelantar?", el
    "retiro coordinado" con aviso, la fecha "a más tardar", la regla de no adelantar lo no pedido, el
    llamado a 14 días, la cláusula del presupuesto (queda anotada para más adelante, no ahora) y el
    papel de Tomás. Qué se cobra si nos pasamos es tema de Comercial, no de este módulo.
  - **Fuera de tema:** el camión lo organiza Operaciones, los desarmes no necesitan permisos, los
    capataces no influyen, y la limpieza de OTs y ventas no tiene que ver con esto.
  - **Pendiente de JS:** qué sería el tipo "servicio" y para qué; si un comodín es un desarme cuyo
    "a partir de" ya llegó; y cuánto puede esperar un desarme después de esa fecha.
  - **Arranque:** JS quiere armar ya las guardias de las próximas semanas, "como si hoy fuera
    viernes".
- **Requisito para que el candado valga:** hoy el servidor no valida permisos al cambiar
  asignaciones y la RLS de Supabase está abierta (auditoría del 08/10 en el handoff). Hay que cerrar
  eso antes o junto con la etapa 1; un candado solo en pantalla se saltea.

## 1. Respuesta corta

- **Guardias automáticas desde el primer día: sí.** La guardia nunca mueve una obra ni hace llamar a un cliente. Ocupa un lugar libre a dos semanas, y si queda mal se saca con un toque. El panel se pasó por completo a tu postura.
- **Comodines: sí, y es la mejor idea de las dos.** Ya existen, pero sin nombre: hoy tapamos huecos adelantando desarmes sin haberlo acordado con el cliente. Hay dos condiciones: que el cliente lo acepte en forma explícita, y salir a buscarlos antes, porque hoy casi no hay.

## 2. Lo que mostraron los datos

- **Los desarmes son los que más se mueven.** Son el 20% de las jornadas del tablero, pero suman el 41% de los cambios de fecha y el 55% de los que se avisan con 3 días o menos. En 5 semanas, 30 desarmes se adelantaron 55 veces, 40 de ellas con 3 días o menos de aviso. En 54 de esas 55 no quedó escrito el motivo.
- **Hoy casi no hay comodines.** Encontramos unas 4 OTs que suman 2,4 jornadas. El cliente pide el desarme unos 7 días antes de que termine el mes pagado y se hace a los 4 días.
- **Pero entran todas las semanas.** Llegan unos 4,6 desarmes o servicios no urgentes por semana con 5 o más días hábiles de margen, unas 5,3 jornadas.
- **No se pueden sacar de lo que ya está cargado.** La urgencia figura "baja" en 68 de 71 desarmes y la firmeza "confirmada" en 69, porque son los valores que quedan por defecto. El techo está cargado en 1 de 71 y el contacto en 9 de 71. La ventana real del cliente está en las observaciones, escrita a mano.
- **El fin del mes pagado es el techo natural.** La fecha de devolución de la venta se renueva cada unos 30 días, y el desarme se hace en mediana 1 día antes de esa fecha.
- **Alquiler:** adelantar un desarme que el cliente ya pidió, dentro de un mes ya facturado, no hace perder nada. Solo 6 de 63 ventas se facturaron después del desarme.
- **Permisos:** al desarme no lo frenan. El sistema ya lo trata así, porque "desarmar es lo que resuelve el problema". El vencimiento del permiso solo funciona como fecha límite.
- **Lo que no se pudo medir:**
  - si el cliente acepta un aviso corto;
  - si tiene que estar presente;
  - hasta cuándo vale el permiso;
  - el camión y el flete;
  - el tiempo de viaje.

## 3. Guardias automáticas desde el día 1

- **Cuándo se ponen:** los viernes a las 10 h, solas y sin pedir confirmación. Cubren la semana +2, y la +1 si hay celdas libres.
  - La regla es la de siempre: llegar a 2 jornadas por semana sumando lo que está libre y las guardias, martes y jueves, rotando entre la C2, la C3 y la C4, y como mucho una guardia por cuadrilla por semana.
  - El día que se active hay una corrida extra para las semanas del 26/10 y del 02/11, que están al 58% y al 55%.
- **Salvaguardas:**
  - antes de escribir, vuelve a leer la grilla;
  - solo ocupa celdas libres;
  - nunca va sobre algo confirmado o fijo, en medio de una obra de varios días, en domingo, en feriado ni en un día suspendido;
  - nunca mueve una obra;
  - si no corre o no hay lugar, el indicador queda en ámbar y se avisa a Planificación.
- **Cómo se explica en pantalla:**
  - la tarjeta dice "Guardia · la puso el sistema el vie 23/10";
  - al tocarla explica por qué está ahí: *"Semana del 02/11 con 0 j libres; jueves le tocaba a la C3 por rotación."*;
  - el viernes sale un aviso por la campanita y por Slack: *"Puse 2 guardias para la semana del 02/11: mar C2, jue C3. [Ver]"*.
- **Qué puede hacer Planificación:**
  - **sacarla** con un toque. Aparecen 4 botones opcionales para el motivo: licencia, zona lejos, viene una obra grande u otro;
  - **moverla** a otra celda libre;
  - **marcar "esta semana sin guardias"** para una cuadrilla.
  - **Lo que Planificación saca, el sistema no lo vuelve a poner esa semana.**
- **Si alguien suelta una obra encima:** la obra no se apila. Toma el lugar y la guardia queda "usada", todo en un solo lote que se deshace entero.
  - Si es una urgencia, algo corrido por lluvia o un comodín desde las 13 h del día anterior, no pide nada.
  - Si es un comodín antes de esa hora o una obra común, pide una línea de motivo.
  - Si la obra dura más que la guardia, avisa antes: *"las otras 2 jornadas caen en días llenos"*.

## 4. Comodines

**Qué es un comodín.** Es una OT que cumple todo esto:
- es un desarme, un retiro de material o un mantenimiento preventivo;
- dura 1 jornada o menos (63 de 71 desarmes cumplen);
- **la pidió el cliente**;
- **el cliente aceptó que le avisemos el día anterior**;
- tiene contacto, teléfono y forma de acceso cargados;
- la habilitación está en verde o amarillo.

Quedan afuera:
- el desmonte parcial, salvo que Planificación lo marque a mano con la obra terminada;
- las constructoras que presentan la nómina con 48 a 72 h de anticipación;
- los armados, siempre.

**Un dato nuevo en Odoo, sin valor por defecto.** La pregunta es "¿Se puede adelantar?", con dos opciones: "No, fecha fija" o "Sí, avisando el día anterior". Se agrega un desplegable de acceso: sin presencia, portero o encargado, o tiene que estar el cliente. Si queda vacío, no es comodín. Si tuviera un valor por defecto, en un mes valdría lo mismo que la urgencia.

**Quién lo marca y cuándo:**
- quien carga el desarme en Odoo (Sandra, Agustina, Rocío o Tamara), en la misma llamada en que el cliente lo pide, con una pregunta de una línea;
- Planificación también lo puede marcar desde la ficha de la OT;
- Tomás solo anota lo que dijo el cliente. No pregunta, porque si pregunta parece que prometemos.
- En el resumen del lunes se ve qué porcentaje quedó sin responder, por persona.

**Qué se acuerda con el cliente.** "Comodín" es una palabra interna. Al cliente se le ofrece un **"retiro coordinado"**: *"Lo retiramos a más tardar el 30/10. Si se libera un lugar antes, te avisamos el día anterior hasta las 15 h. ¿Quién nos abre?"*
- Sin descuento: lo que gana el cliente es la garantía de la fecha.
- Para un consorcio, además, sacar el andamio antes es un beneficio.

**Fecha límite.** La app la calcula cada vez que lee la OT, sin escribir nada en Odoo. Es la más temprana entre:
- el fin del mes pagado;
- el vencimiento del permiso de vía pública;
- el vencimiento de la habilitación;
- el techo que pidió el cliente.

**Que no espere para siempre.** El comodín va siempre en la grilla, en su **fecha "a más tardar"**: 2 días hábiles antes del límite, para tener margen por lluvia. Esa es la fecha que se le dice al cliente.
- Si ninguna guardia lo usa, se hace ese día y listo.
- Si a 5 días hábiles del límite todavía no tiene fecha, salta un aviso.

**Permisos.** No le impiden a un desarme ser comodín: solo le ponen la fecha límite. Hay que preguntarle a quien gestiona los permisos si el retiro necesita corte de calzada o tiene horario de carga. Si es así, esa obra va con "fecha fija".

**Alquiler.**
- Nunca se adelanta un desarme que el cliente no pidió.
- Adelantar uno pedido no pierde facturación.
- El riesgo es el inverso: pasarnos del mes pagado. Por eso la fecha "a más tardar" va antes del límite. Qué se cobra si nos pasamos lo decidís vos (pregunta 5).

## 5. Cómo se ven y cómo se usan en el tablero

- **En la grilla:** el comodín conserva el color de su tipo de obra. Lleva un **ícono de naipe** y un chip "‹‹ puede ir antes · desde 20/10". No lleva borde punteado, que quiere decir tentativa: la fecha "a más tardar" es firme.
- **En la bandeja**, un grupo **"Comodines (4 · 2,4 j)"**:
  - muestra también los que ya están en la grilla, ordenados por límite;
  - cada tarjeta dice dónde está hoy, el "desde", el límite, el acceso y la zona;
  - de ahí se arrastran.
- **Arriba del tablero**, un contador: "Comodines: 4 · 2,4 j".
- **Arrastrar y soltar:**
  - al levantar un comodín, se iluminan las guardias donde entra (por ventana, límite y habilitación) y el resto se atenúa;
  - al soltarlo sobre una guardia, en un solo lote que se deshace entero:
    1. la obra se adelanta: se mueve, no se copia;
    2. la guardia queda "rellenada con S02658";
    3. se libera su fecha original, más adelante, donde es fácil volver a llenarla;
  - también se puede soltar en cualquier celda libre, sin motivo.
- **Comodín previsto:** 2 días hábiles antes, la guardia ya muestra *"si no entra nada: retiro S02658"* en lugar de "Depósito". Si el acceso exige que esté el cliente, una persona le avisa entonces: *"Puede ser el jueves; te confirmamos el miércoles a las 13 h"*.
- **Relleno de las 13 h del día anterior.** La regla filtra lo que es válido y propone en este orden:
  1. apoyo a un armado con atraso real;
  2. comodín, primero el previsto y después el de límite más cercano;
  3. adelantar una tentativa;
  4. depósito.

  El armado va primero porque detrás hay otros gremios esperando. Si el comodín espera, no pierde nada.
- **La IA** ordena los candidatos válidos y lo explica en una línea, por ejemplo: *"S02658, Palermo, 1 j: misma zona que la C3 ese día, vence el 02/11"*. Tomás redacta el aviso y lo manda una persona. La IA no elige dónde van las guardias ni mueve nada sola.

## 6. ¿Alcanzan?

| | Por semana |
|---|---|
| Guardias que llegan sin usar a las 13 h (estimado) | 1 a 1,5 j |
| Desarmes y servicios con 5 o más días hábiles de margen | 4,6 OTs, 5,3 j |
| Si acepta la mitad de los clientes | unas 2,6 j: alcanza |
| Si acepta un tercio | unas 1,8 j: justo |

- **La foto de cada día a las 13 h:** había, en mediana, 3 candidatos ya pedidos, suponiendo que todos los clientes aceptaran. Con la mitad serían 1 o 2, y algunos días ninguno. Esos días se rellena con apoyo, una tentativa o depósito.
- **Las primeras 2 o 3 semanas van a ser flojas.** La reserva hoy es de 2,4 jornadas y casi ningún desarme tiene contacto cargado. No hay que leerlo como que falló.
- **Si sobran:** se hacen en su fecha y no pasa nada. Es una señal para subir la guardia a 2,5 jornadas.
- **Si faltan:** la lista de ventas a 14 días del fin del período sale todos los días (punto 7). No se espera a una alarma.

## 7. La alternativa que recomienda el panel: salir a buscar los comodines

Marcar comodines solo aprovecha lo que ya llega, y hoy llega tarde. Proponemos dos cosas:

- **Un llamado a 14 días del fin del mes pagado.** La IA arma cada día la lista con un borrador y llama una persona. El guion ofrece primero renovar: *"Te vence el 31/10. ¿Seguís otro mes? Si ya terminaste, coordinamos el retiro antes de esa fecha."*
  - El pedido llega una semana antes que hoy, con el doble de ventana, y ya nace como comodín.
  - Hoy son 22 ventas, unas 21,5 jornadas.
  - De paso aparecen las 10 ventas con la fecha de devolución vencida sin actualizar, que pueden tener meses sin facturar.
  - **Riesgo:** que el llamado invite a cortar a un cliente que iba a renovar. Por eso primero se prueba con 10 clientes y se miden las renovaciones.
- **En los presupuestos nuevos:** *"Retiro coordinado con aviso de 24 h dentro de los 5 días hábiles desde el pedido; fecha fija a pedido."* Sin recargo. Hoy solo 10 de 71 desarmes tienen una fecha comprometida, así que en los hechos la mayoría de los clientes ya acepta esto.

## 8. Qué cambia en guardias.md y en la maqueta

**En guardias.md:**
1. §3 "Cuándo se pone": las guardias las pone el sistema el viernes, con la corrida inicial, la semana +1 si hay lugar, el tope de una por cuadrilla, y sacar y mover con motivo opcional sin que vuelvan a aparecer.
2. §3 "Quién la usa": se suma el comodín, sin motivo desde las 13 h del día anterior y con una línea antes.
3. §3 "Liberación": el nuevo orden es apoyo, comodín, tentativa, depósito. Se agrega el comodín previsto desde 2 días antes.
4. §3, datos: hay que agregar `guardia` en `TIPOS_TAREA`; la base no lo valida, pero la ruta de tareas sí. Columnas nuevas: `estado`, `origen` (sistema o persona), `motivo_uso`, `motivo_saca` y `relleno_ot_id`. Se amplía el control de acciones de `plan_movimientos` y se admite un autor "sistema".
5. Sección nueva, "Comodines": lo de los puntos 4 y 5.
6. §4, la IA: ordena también los comodines. La lista a 14 días pasa de "apuesta" a la etapa 4.
7. §5, la rutina: el viernes ya no es "aceptar", es mirar el aviso y corregir.
8. §8, las métricas:
   - el adelanto de un comodín aceptado no cuenta como cambio con aviso corto, pero se mide aparte;
   - métricas nuevas: guardias rellenadas con comodín, viajes perdidos porque nadie abrió, comodines que pasaron el límite, porcentaje de desarmes marcados y guardias que sacó Planificación (si sacan más de un tercio durante 3 semanas, se revisa la regla).
9. §9.4 y §10.4 quedan resueltos para los desarmes pedidos. La pregunta abierta pasa a ser qué se cobra si nos pasamos del período.
10. §7, las etapas: se reemplazan por las del punto 9.

**En la maqueta:**
- "Qué es" y Operaciones: "Al principio se ponen a mano" pasa a ser "Se ponen solas el viernes; Planificación saca o mueve".
- La simulación:
  - un paso nuevo con el aviso del viernes;
  - un desarme con naipe en la grilla que, a las 13 h, se suelta sobre la guardia del jueves y libera su fecha;
  - la opción "Ninguno cargado todavía…" se cambia por "Retiro coordinado S02658".
- La leyenda suma el naipe y el chip "‹‹ desde".
- En la sección Comercial, "Desarmes · a definir" pasa a ser el guion del retiro coordinado.
- "Qué hay desde el primer día" y "A definir" se actualizan.
- Preguntas frecuentes nuevas: "¿Las guardias aparecen solas?", "¿Qué le digo al cliente del retiro?" y "¿El naipe quiere decir que la fecha puede cambiar?".

## 9. Etapas

**Etapa 0, esta semana, sin código:**
- cerrar las 6 OTs que ya no corren: S00719, S01592, S02265, S01483 #1122, S00128 #1143 y S01991. Si no, aparecen como comodines falsos;
- actualizar las 10 ventas con la fecha de devolución vencida;
- preguntarle a quien organiza el camión con cuánta anticipación lo necesita;
- preguntarle a quien gestiona los permisos por calzada y horarios de carga;
- consultar a los capataces sobre la media jornada;
- probar el llamado con 10 clientes;
- explicarles en 5 minutos a las chicas que cargan las OTs la pregunta del retiro coordinado.

**Etapa 1, guardias automáticas e indicador (útil sola):**
- migración en `tablero_tareas` y `guardia` en `src/lib/tablero/tipos.ts`;
- la regla, como función pura con tests, en `src/lib/tablero/guardias.ts`;
- la corrida del viernes en `/api/cron/guardias-viernes`, con su entrada en `vercel.json` y el aviso por `crearAlertas`;
- el rayado y el "la puso el sistema" en `celda-dia.tsx` y `tarjeta-asignacion.tsx`, y el indicador en `tablero-grid.tsx`;
- sacar o mover con motivo opcional;
- soltar sobre una guardia, como lote, en `tablero-board.tsx`;
- "primera fecha sin tocar guardia" en `src/lib/asistente/planificacion.ts`;
- crear ya el dato de comodín en Odoo con `scripts/odoo-add-adelantable.mjs`, para que se empiece a cargar.

**Etapa 2, comodines visibles y arrastrables:**
- lectura del dato en `asignaciones.ts`;
- cálculo del límite en `src/lib/tablero/comodin.ts`, con la fecha de la venta, el vencimiento del permiso y el de la habilitación;
- el naipe y el chip;
- el grupo en `panel-sin-asignar.tsx`, que también muestre lo que ya está en la grilla;
- el contador en `topbar-tablero.tsx`;
- arrastrar para mover, no para crear jornadas nuevas;
- marcarlo desde la ficha de la OT;
- el aviso a 5 días hábiles del límite.

**Etapa 3, el relleno de las 13 h:**
- la corrida de las 16 UTC (13 h de acá);
- el comodín previsto;
- Confirmar u Otra, como lote;
- que el corrimiento por lluvia consuma la guardia;
- el botón "meter urgente".

**Etapa 4:** la IA ordena y explica, la lista diaria a 14 días con borrador y el resumen del lunes.

**A las 6 semanas:** recalibrar el tamaño de la guardia y la regla.

## 10. Lo que el panel no resolvió

- **Aviso al cliente con 2 o 3 días, o el día anterior.** Lo zanja la respuesta sobre el camión. Mientras tanto, el aviso previo se da solo si el acceso exige que esté el cliente.
- **Hacer obligatorio el dato en Odoo.** Exige tocar la vista de Odoo. Arranca sin ser obligatorio. Si después de 3 semanas más del 30% queda sin responder, se hace obligatorio.
- **Cuántos clientes aceptan.** Lo dicen las 10 llamadas y las primeras 3 semanas. Si acepta menos de un tercio, la palanca es la cláusula del presupuesto.
- **El camión y el lugar en el depósito.** No se midieron y pueden ser el verdadero cuello de botella.
- **Dos comodines cortos en una misma guardia.** Solo si son de la misma zona y los dos tienen acceso sin presencia. Se prueba en la práctica.
- **Que Tomás mande los avisos.** No al principio. Se revisa a las 6 semanas, según cuántos viajes se pierdan.

## 11. Tus decisiones

1. **¿Guardias puestas por el sistema desde la etapa 1, el viernes a las 10 h, con Planificación sacando o moviendo?** *Recomendación: sí.*
2. **¿"Comodín" queda como palabra interna y al cliente se le ofrece un "retiro coordinado"?** *Recomendación: sí.*
3. **¿Un dato nuevo en Odoo, "¿Se puede adelantar?", sin valor por defecto, que carga quien recibe el pedido?** *Recomendación: sí.*
4. **¿El comodín va siempre en la grilla, con fecha "a más tardar" 2 días hábiles antes del límite?** *Recomendación: sí.*
5. **Si nos pasamos del período, ¿se cobra otro mes?** *Recomendación: si es por nuestra causa, lluvia incluida, no se cobran esos días; si es por el cliente, sí. Definilo con administración: sin esto no se puede ofrecer el retiro coordinado.*
6. **¿Orden del relleno: apoyo a un armado atrasado, después comodín, después tentativa, después depósito?** *Recomendación: sí.*
7. **¿Regla firme de no adelantar nunca un desarme que el cliente no pidió?** *Recomendación: sí.*
8. **¿Prueba del llamado a 14 días con 10 clientes, con un guion que ofrece primero renovar?** *Recomendación: sí, esta semana.*
9. **¿La cláusula de retiro coordinado en los presupuestos nuevos?** *Recomendación: sí, después de la prueba.*
10. **¿Tomás solo anota y redacta, y los avisos los manda una persona?** *Recomendación: sí, y se revisa a las 6 semanas.*
11. **¿Arrancamos con la etapa 0 ya y la etapa 1 apenas esté?** *Recomendación: sí. Si la etapa 1 no llega al viernes 23/10, ese viernes Planificación pone a mano las guardias del 26/10 y la corrida inicial cubre la del 02/11.*