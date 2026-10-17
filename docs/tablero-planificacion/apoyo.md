# Dos cuadrillas en la misma obra con un solo parte

## 1. La recomendación

Una obra puede llevar una **cuadrilla principal** y, cuando hace falta, una o más **cuadrillas de apoyo**. Hay **un solo parte por obra y por día**. Lo carga la principal y le cierra la jornada también al apoyo: no queda nada en rojo y no se cuenta doble.

La base es el diseño "principal + apoyo". Le sumo cuatro ideas de los otros dos diseños:
- Cada renglón de gente del parte dice **de qué cuadrilla es**.
- En el parte hay un tilde **"fue / no fue"** para el apoyo.
- El avance de la obra cuenta **días distintos**, como protección extra.
- El horario del apoyo se precarga según si va el día entero o medio día.

## 2. Cómo funcionaría en el día a día

**Ejemplo.** Thames 1820 es una obra de 3 días, a cargo de la **Cuadrilla 2**. El martes necesitás más gente y mandás también a la **Cuadrilla 3**, sólo a la tarde.

**En el tablero (el planificador)**
- Tocás la tarjeta de Thames del martes y elegís "Sumar apoyo". Indicás la cuadrilla (C3), los días (martes) y cuánto tiempo (½ jornada).
- En la fila de la C3 aparece una tarjeta rayada: "Apoyo · Thames 1820 (parte: C2)". Ocupa capacidad de verdad, así que la C3 muestra "libre ½ j". Si le querés meter otra obra de día entero, salta el aviso de sobrecarga de siempre.
- La tarjeta principal muestra un chip "+C3 ½".
- La obra sigue diciendo "3 d": no aparece como obra partida y en la bandeja no faltan días de más.
- Si movés la obra de día, el apoyo se mueve con ella. El apoyo no se mueve de fecha por su cuenta. Sí podés pasarlo a otra cuadrilla.

**En el parte (hoy la oficina, más adelante el capataz de la C2)**
- En Partes del día, Thames sale **una sola vez**. Adentro tiene dos renglones de gente ya cargados:
  - Cuadrilla 2: 5 personas de 8 a 17.
  - Apoyo Cuadrilla 3 ☑ fue: 4 personas de 13 a 17.
- Las personas del apoyo salen de la Hoja del día de la C3. Si no hay Hoja, ese campo arranca vacío y hay que completarlo, para no inventar horas.
- Capataz, fletes, fotos, notas e incidencias van **una sola vez**.
- Se guarda una vez y quedan cerradas las dos jornadas:
  - ninguna tarjeta queda con "Sin parte";
  - el contador de partes pendientes del menú no suma deuda falsa;
  - la obra avanza **un día**, no dos;
  - el flete no se carga dos veces.

**Lo que ve la otra cuadrilla (la C3)**
- En su Hoja del día tiene Thames con la dirección, el horario y las instrucciones de siempre.
- En lugar de "Cerrar jornada" dice: "Hoy apoyás Thames 1820, el parte lo hace la Cuadrilla 2". No tiene que cargar nada.

**Regla para Operaciones.** Si mandás 1 o 2 personas sueltas, no es un apoyo: se siguen pasando de cuadrilla en la Hoja del día, como hoy ("Romero (de la Cuadrilla 4)"). El apoyo es para cuando sale otra cuadrilla entera, con su vehículo o su capataz.

## 3. Por qué esta y no las otras

- **Un parte compartido entre dos cuadrillas iguales (puntaje 6/10).** No hay un dueño claro: "el primero que lo abre lo arranca", y no se sabe quién saca las fotos ni quién contesta "¿cuánto falta?". Además necesita un candado entre Supabase y Odoo para que no se creen dos partes, editar el parte puede borrar la gente de la otra cuadrilla, y es el más caro (7 a 10 días).
- **El refuerzo como un dato dentro de la única jornada (puntaje 5,5 y 6,5/10).** Para Odoo y para la Hoja del día, la segunda cuadrilla no tendría nada ese día y figuraría libre. Habría que sumar su ocupación a mano en cada lugar, y el trabajo para que aparezca en la Hoja termina siendo mayor. Encima admite un solo refuerzo por día.

## 4. Casos borde y cómo se resuelven

- **Apoyo todos los días de la obra.** Va un apoyo por día. La duración sigue en días de calendario: si mandás dos cuadrillas para terminar antes (una obra de 4 días que hacés en 2), la achicás a mano. Cuando sumes apoyo a todos los días, el sistema puede ofrecerte "¿Achicás la obra a N días?".
- **Apoyo un solo día.** Es el caso normal, porque el apoyo se marca día por día.
- **El apoyo tiene otra obra a la mañana.** Su fila muestra ½ + ½ = 1,00. Los horarios salen de su Hoja: de 8 a 13 su obra (con su propio parte) y de 13 a 17 el apoyo (dentro del parte de Thames). Si la misma persona aparece en dos partes del mismo día con horarios que se pisan, /partes avisa ("Romero figura en dos partes del 12/11").
- **Al final el apoyo no fue.** Se destilda "fue" en el parte, y la jornada del apoyo se borra o se reprograma. No queda pegada a un parte en el que no trabajó.
- **Lluvia o suspensión.**
  - Si se suspende la principal, el apoyo se corre con ella.
  - Si se suspende sólo el apoyo, se saca y queda registrado: "Thames 1820 se queda sin el apoyo de C3 el martes".
  - Si el parte sale "no ejecutado", al reprogramar se ofrece recrear también el apoyo (tildado de entrada).
- **Se rompe el camión de la principal.** Un botón "Hacer principal" intercambia los roles de las dos cuadrillas ese día.
- **Sumar el apoyo después de cargar el parte.** El apoyo queda vinculado a ese parte y aparece el aviso "sumá la gente de C3 al parte", con el enlace para editarlo. El parte no se toca solo.
- **Desconfirmar.** Desconfirmar la principal desconfirma sus apoyos. Si ya tiene parte, no se puede, igual que hoy.
- **Dos apoyos el mismo día (C3 y C4).** Se permite: el parte lleva tres renglones.
- **Dejar la obra principal sin apoyo con el deshacer.** El deshacer del tablero también restaura los apoyos que se movieron con ese gesto.
- **Alguien edita a mano en Odoo y deja dos principales o un apoyo sin obra.** El tablero lo muestra en rojo, y un control periódico (que sólo lee) lista esos casos.
- **Jornales.** No cambia nada: el parte nunca guardó nombres. La presencia de cada persona sigue saliendo de la Hoja del día y de la asistencia de Odoo. Lo que mejora es el costo de la obra: queda un parte con toda la gente y el flete cargado una sola vez.
- **Los 8 casos viejos con dos partes de cuadrillas distintas** (OT 20, 21, 58 y 396) quedan como están, salvo que decidas lo contrario.

## 5. Plan por etapas (sección técnica)

**Etapa 1, lo que resuelve el problema (2 a 3 días; tiene que salir todo junto)**
- **Odoo.** Un script nuevo, `scripts/odoo-add-apoyo-a-asignacion.mjs`, que agrega dos campos:
  - `x_aba_asignacion.x_apoyo` (sí/no, por defecto no; no hay que migrar las 337 asignaciones que ya existen);
  - `x_aba_mano_obra.x_cuadrilla_id`, **obligatorio desde esta etapa**.
- **Avance** (`src/lib/odoo/asignaciones.ts`). `DOM_TOMADAS` y `DOM_HECHAS` excluyen los apoyos, y el conteo pasa a ser por días distintos (OT y fecha). Con eso se corrigen solos "faltan N de M" y `ultimaDeLaOt`.
- **Cierre** (`src/lib/odoo/partes.ts`).
  - `cerrarJornada` les escribe el mismo `x_parte_id` a los apoyos de esa OT y fecha que todavía no tienen parte.
  - Si alguien intenta cerrar un apoyo, responde "lo carga la Cuadrilla N" (409).
  - El aviso de parte duplicado deja de saltar por el apoyo.
- **Listado** (`src/lib/odoo/jornadas.ts`). `fetchListadoJornadas` muestra la obra una vez, con sus apoyos adentro, y `contarPendientes` excluye los apoyos.
- **Pantalla** (`src/app/(dashboard)/partes/fila-jornada.tsx` y `page.tsx`). Una sub-fila por cada apoyo con el tilde "fue", personas y horario, y una línea de mano de obra por cuadrilla.
- **Tablero.** Tipos con `apoyo` (`src/lib/tablero/tipos.ts`), la clave de agrupación en `bloques.ts`, la tarjeta rayada y el chip "+C3", "Sumar apoyo" desde la ficha (`panel-ot.tsx`), y `planPorObra` y `panelBloque` contando fechas distintas y sin tomar los apoyos.

**Etapa 2, que no se rompa al mover (unos 2 días)**
- Un helper `apoyosDe(otId, fecha)` en `src/lib/tablero/`, con tests. Lo usan:
  - mover la tarjeta;
  - confirmar y desconfirmar;
  - devolver a la bandeja;
  - el deshacer (`tablero-board.tsx`);
  - el editor de jornadas (`dialogo-jornadas.tsx`), que suma una columna "Apoyo".
- Validaciones en el servidor (`src/app/api/planificacion/asignaciones/route.ts`): no puede haber apoyo sin principal, más de una principal por obra y día, ni el apoyo en la misma cuadrilla que la principal.
- "Hacer principal".
- "Sumar apoyo" también desde la Hoja del día.

**Etapa 3, la Hoja y los casos finos (1 a 2 días)**
- `precargaCierre` (`src/lib/hoja-dia/servicio.ts`) trae los renglones del apoyo desde la Hoja de la otra cuadrilla y los fletes una sola vez.
- El cartel "el parte lo hace C2" en `cerrar-jornada.tsx`.
- Correr el día que conoce los apoyos (`corrimiento.ts`) y reprogramar que recrea el apoyo.
- El aviso de la misma persona en dos partes.
- El arrastre con Alt para crear un apoyo.

**Después.** Cuando se haga el rediseño del parte del capataz, hay que sumarle el bloque "Gente de apoyo", con los nombres de la Hoja de la otra cuadrilla.

En total son **5 a 8 días**. No se toca la estructura del parte ni hay tablas nuevas en Supabase.

## 6. Lo que tenés que decidir antes de arrancar

1. Cuando mandás dos cuadrillas, ¿casi siempre una ayuda a la otra, o muchas veces son dos frentes iguales, cada uno con su capataz y que rinden cuentas por separado? Si es lo segundo, conviene revisar la recomendación.
2. Si mandás apoyo para terminar antes, ¿te sirve que la duración siga en días y que la achiques vos (con el sistema ofreciéndotelo)? ¿O preferís que el sistema piense en jornadas de cuadrilla?
3. ¿Te alcanza con que el parte lo cargue la principal, incluida la gente del apoyo? ¿O el capataz del apoyo necesita dejar sus propias fotos u observaciones?
4. Si al final el apoyo no fue, ¿su jornada se borra o se reprograma sola como tentativa?
5. ¿La cuadrilla de apoyo suele ir con su propio camión? Eso define si va una línea de flete por cuadrilla o una sola.