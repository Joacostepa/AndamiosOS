# Habilitaciones: el recorrido "¿Cómo funciona?"

Los dos recorridos actuales se capturaron paso a paso en `capturas/tour-*` y su texto quedó en `evidencia/recorridos.json`. Abajo va:
1. qué falta, qué está mal y qué sobra;
2. el borrador completo de los pasos nuevos, en formato `PasoTour`;
3. las anclas `data-tour` que habría que agregar.

No se tocó `tour.ts`.

---

## 1. Diagnóstico de los recorridos actuales

### 1.1 Bandeja (`PASOS_BANDEJA`, 7 pasos)

Con los datos de hoy se ven **4 de 7** (`tour-bandeja-real-paso01..04`). Hoy no hay obras en "Recién llegadas" ni grupos urgentes, así que los tres pasos de esos grupos se saltean. Con los grupos inyectados se ven los 7 (`tour-bandeja-INYECTADA-paso01..07`).

**Paso 1. `bandeja-header`, "Esta es tu cola de trabajo"**
- Se ve: sí.
- Qué no es cierto: nada. Le falta decir que la prioridad ordena dentro del grupo.

**Paso 2. `grupo-recien-llegadas`, "¿aplica o no aplica?"**
- Se ve: **no**, se saltea si no hay obras nuevas.
- Qué no es cierto: falta decir que, si la venta lleva técnico de SyH, se suma ese papel.

**Paso 3. `grupo-recien-llegadas`, "No aplica habilita en el acto"**
- Se ve: **no**, se saltea.
- Qué no es cierto: no avisa que **sin casillas tildadas los botones actúan sobre todo el grupo**, que es la trampa más cara de la pantalla.

**Paso 4. `fila-obra`, "Qué te dice cada fila"**
- Se ve: sí.
- Qué no es cierto, aunque es el paso más importante:
  - "La **etapa** dice de quién es el próximo movimiento": la fila no muestra la etapa.
  - El "esperando al cliente / esperando a <técnico>" sale de la modalidad de permiso, no de la etapa (`habilitaciones-errores.md` §2).
  - "Los **días** que lleva esperando, en rojo cuando son demasiados": siempre dicen 0 (`habilitaciones-errores.md` §1).
- Qué no explica:
  - el semáforo;
  - los chips Pantalla, SyH y de prioridad;
  - el triángulo de observados;
  - el chinche;
  - la fecha;
  - el reloj.

**Paso 5. `grupos`, "Los grupos de arriba son los urgentes"**
- Se ve: **no**, se saltea si no hay obras críticas o atrasadas.
- Qué no es cierto: dice "de arriba", y los urgentes no van arriba: va primero "Recién llegadas".

**Paso 6. `no-aplican`, "Las descartadas quedan al pie"**
- Se ve: sí.
- Qué no es cierto: nada. Pero hay dos listas más al pie (Pospuestas y Habilitadas) que nadie explica.

**Paso 7. `bandeja-header`, "Ahora entrá a una obra"**
- Se ve: sí.
- Qué no es cierto: "el recorrido sigue adentro". En dev el de la ficha no arranca solo (`habilitaciones-errores.md` §15).

**Lo que ningún paso de la bandeja explica:**
- el **buscador**, y que mientras buscás se abren solas las listas del pie;
- **posponer** (el reloj): por qué existe, el tope de 10 días, la vuelta automática y el aviso cuando Operaciones planifica;
- la lista **Pospuestas**, con Reactivar y Cambiar fecha;
- la lista **Habilitadas**, con Revertir, y por qué pide confirmación;
- el **panel de Planificación**: sólo lectura, el filtro "Solo sin habilitar" y que se recuerda abierto;
- el **aviso amarillo** de desincronizadas y Reintentar;
- los chips **Pantalla**, **SyH** y de **prioridad**, y el triángulo de **observados**.

### 1.2 Ficha (`PASOS_FICHA`, 12 pasos)

En una obra en gestión se ven 12/12 (1210, 1235). En una **habilitada**, 9/12 (233): se saltean los dos de `boton-habilitar` y el de `boton-consulta`, y nada explica "Revertir". En una **no aplica** también se saltean, porque el bloque entero no se dibuja.

**Paso 1. `veredicto`, "La respuesta, arriba de todo"**
- En modo oscuro el título del veredicto no se lee (`habilitaciones-errores.md` §4): el paso resalta una caja ilegible.
- No aclara que "con pendientes" en verde quiere decir que la documentación avisa pero no frena.
- El veredicto contradice al tablero en desarmes y en obras sin permiso (`habilitaciones-errores.md` §6).

**Pasos 2 y 3. `boton-habilitar`**
- Correctos.
- Les falta lo más importante del gesto: **habilitar le avisa a Operaciones** (campanita y Slack de logística). "Después podés revertirlo" no dice que revertir manda un aviso **crítico**.

**Paso 4. `boton-consulta`, "Triar no es consultar"**
- "Este botón es lo único que mueve la pelota de tu lado al del cliente": **no es cierto.**
  - Marcar un requisito como enviado lleva la obra a la etapa `c` (del cliente) sin pasar por acá.
  - En producción el botón se usó **0 veces**: todas las obras saltan de `a` a `c`.

**Paso 5. `barra-triage`**
- Correcto.
- En el estado "en gestión" la barra es una línea gris de 11 px: el globo resalta algo casi invisible.

**Paso 6. `vencimiento`**
- Promete más de lo que hay:
  - "El sistema **te avisa solo**… es el único aviso que te llega sin que tengas que acordarte de mirar": no existe ningún aviso de vencimiento, ni campanita ni Slack. Sólo entra al grupo "Vencen en menos de 30 días" de la bandeja, que hay que mirar. Y avisos que sí llegan solos hay otros: OT nueva y pospuesta planificada.
  - "El semáforo cambia cuando ya venció": depende de un campo calculado de Odoo que puede no recalcularse (`habilitaciones-errores.md` §C).
  - La caja dice "Odoo avisa solo al pasar la fecha".

**Paso 7. `paquetes`**
- Correcto: los cuatro paquetes y sus cantidades coinciden con los datos.

**Paso 8. `requisitos`**
- Correcto.
- No avisa que "Volver a pendiente" no queda en el historial (`habilitaciones-errores.md` §12).

**Paso 9. `agregar-requisito`**
- "También podés borrar los del paquete…" es correcto, pero el borrado no pide confirmación ni deja rastro.

**Paso 10. `notas`**
- **No es cierto**: "Con el chinche… además aparece en el tablero para quien planifica la obra". Desde que se separaron los hilos, el tablero sólo muestra el de Operaciones (`habilitaciones-errores.md` §14).
- No explica que son dos conversaciones separadas.

**Paso 11. `permiso`**
- **Desactualizado:**
  - "La modalidad la define el técnico, no vos": desde el 4/9 la contesta **Comercial al cotizar** (`x_lleva_permiso` + `x_permiso_modalidad`, obligatorios para confirmar la venta).
  - "Si la modalidad no está definida, [el tablero] avisa y registra el pedido al técnico": `friccionDelTablero` ya no incluye `pedir_modalidad`.
- Tampoco dice que el candado sólo aplica a armados y ampliaciones.

**Paso 12. `historial`**
- "Ninguno manda mails" es cierto, pero habilitar y revertir **sí avisan** a Operaciones.
- "No se puede borrar nada del historial" es cierto para `hab_gestiones`. Pero:
  - los envíos y las aprobaciones no dicen qué papel (`habilitaciones-errores.md` §9);
  - borrar requisitos, adjuntos o una aprobación no queda en ningún lado.

**Lo que ningún paso de la ficha explica:**
- "Qué hay que ejecutar" y por qué está en esta pantalla;
- "Fechas y planificación": planificada confirmada o tentativa;
- la caja de **SyH** y el requisito que se crea solo;
- **"Mandarle los papeles a"**: el contacto de la obra;
- **posponer** desde la ficha y la caja ámbar de pospuesta;
- **Reclamar al cliente**;
- los **adjuntos** (el clip);
- las **etapas** de la columna de documentación;
- **Revertir** en una obra habilitada;
- el **aviso de error de sincronización**;
- la planificación (el botón).

### 1.3 Problemas de mecánica (no de texto)

- **El de la ficha no arranca solo.** En dev nunca arranca (Strict Mode, `use-tour.ts:63-74`). El último paso de la bandeja promete que sigue adentro. Hay que hacerlo idempotente: marcar "visto" recién cuando el driver efectivamente abre, o no cancelar el timeout en la limpieza.
- **El orden de la ficha salta.** Va de vencimiento a paquetes, después notas, después **permiso** (que está arriba, al lado de la documentación) y después historial: la pantalla sube y baja. El borrador de abajo sigue el orden visual.
- **Si no hay obras nuevas, se pierden los pasos del triage.** Quien entra un día sin recién llegadas nunca aprende el triage, que es la primera decisión de todo el módulo. Una salida sería un campo `anclaAlternativa` en `PasoTour`: si no está `grupo-recien-llegadas`, el paso se cuelga de `bandeja-header`. Es un cambio en `use-tour.ts`, fuera de `tour.ts`.
- **Hay que subir la versión de la clave** (`hab:tour-bandeja:v2`, `hab:tour-ficha:v2`), así los que ya vieron la v1 ven la nueva.
- **En modo oscuro** los globos se ven bien, pero varios elementos que resaltan tienen el texto ilegible (veredicto, barra de recién llegada, pospuesta, permiso). Ver `habilitaciones-errores.md` §4.

---

## 2. Borrador de los pasos nuevos

Criterio:
- se mantiene la regla del encabezado de `tour.ts`, **por qué y no dónde hacer clic**;
- todo lo que dicen es cierto con el código de hoy;
- donde un paso depende de que se arregle algo de `habilitaciones-errores.md`, va un comentario `// OJO:`.

Siguen el orden visual de la pantalla, y los pasos sin ancla se saltean solos como hasta ahora.

```ts
export const TOUR_BANDEJA = "hab:tour-bandeja:v2";
export const TOUR_FICHA = "hab:tour-ficha:v2";

export const PASOS_BANDEJA: PasoTour[] = [
  {
    ancla: "bandeja-header",
    titulo: "Esta es tu cola de trabajo",
    texto:
      "Las obras aparecen solas cuando existe la OT en Odoo: acá no se da de alta nada. " +
      "Y la lista está ordenada por <b>qué hay que hacer</b>, no por obra — cada grupo es una " +
      "acción distinta, así que empezás por el de arriba y bajás.<br><br>" +
      "Dentro de cada grupo van primero las de prioridad alta y media: esa prioridad la decide " +
      "quien carga la OT, no esta pantalla.",
    lado: "bottom",
  },
  {
    ancla: "grupo-recien-llegadas",
    titulo: "Lo primero de todo: ¿aplica o no aplica?",
    texto:
      "Toda obra nueva cae acá y no se mueve hasta que decidas.<br><br>" +
      "<b>Aplica</b> significa que el cliente pide documentación para dejarnos entrar: la obra " +
      "pasa a la cola con la nómina de ART ya cargada. Si la venta dice que llevamos técnico de " +
      "Seguridad e Higiene, ese papel se suma solo.",
    lado: "bottom",
  },
  {
    ancla: "grupo-recien-llegadas",
    titulo: "\"No aplica\" habilita la obra en el acto",
    texto:
      "Es para cuando <b>no hay que mandarle nada a nadie</b>. La obra queda <b>habilitada</b> y en " +
      "verde para Operaciones, sin pasar por ningún papel.<br><br>" +
      "Ojo con los botones de este grupo: <b>sin casillas tildadas actúan sobre todas</b>. Es a " +
      "propósito —resolver diez obras de un clic es lo que mantiene la bandeja limpia—, pero si " +
      "querés decidir sólo algunas, tildalas primero. Si te equivocaste, se trae de vuelta desde " +
      "<b>No aplican</b>, al pie.",
    lado: "bottom",
  },
  {
    ancla: "fila-obra",
    titulo: "Qué te dice cada fila",
    // OJO: no menciona los "días" ni el "esperando a…" porque hoy están mal (errores.md §1 y
    // §2). Cuando se arreglen, sumar: "a la derecha, cuántos días lleva esperando y a quién —
    // en rojo cuando ya son demasiados".
    texto:
      "El punto es el semáforo que ve Operaciones en el tablero: rojo sin empezar, amarillo en " +
      "curso, verde habilitada.<br><br>" +
      "Los carteles dicen qué cambia tu trabajo: <b>Pantalla</b> es una obra simple que se " +
      "habilita rápido; <b>SyH</b> es un papel más, el de nuestro técnico; el triángulo rojo son " +
      "papeles que el cliente rebotó, y el chinche, una nota que alguien quiso que veas. Abajo, " +
      "cuántos requisitos están aprobados sobre el total.",
    lado: "bottom",
  },
  {
    ancla: "posponer-fila",
    titulo: "Posponer: no mandes los papeles demasiado temprano",
    texto:
      "Si la obra va dentro de un mes, mandar la nómina hoy no sirve: se vence antes de que entre " +
      "la cuadrilla. Con el reloj la sacás de la cola hasta una fecha.<br><br>" +
      "Vuelve sola <b>10 días antes</b> de la obra, o antes si Operaciones la planifica: por eso el " +
      "calendario no te deja elegir después. Si ya falta menos que eso, no se puede posponer — es " +
      "momento de mandar los papeles.",
    lado: "left",
  },
  {
    ancla: "grupos",
    titulo: "Los grupos en rojo son los urgentes",
    texto:
      "Obras que se arman en 3 días o menos, o cuya fecha ya pasó, y siguen sin habilitar. Son " +
      "las que mirás primero.<br><br>" +
      "Una obra aparece en <b>un solo grupo</b>, el más urgente que le corresponda. Si estuviera en " +
      "dos, los números dejarían de servirte para decidir por dónde empezar.",
    lado: "top",
  },
  {
    ancla: "buscador",
    titulo: "Para encontrar una obra, escribí",
    texto:
      "La bandeja tiene todas las obras activas: también las habilitadas, las pospuestas y las " +
      "que no aplican. Buscar por dirección, cliente, número de OT u orden de venta es más rápido " +
      "que abrir tres listas.<br><br>" +
      "Mientras buscás, las listas del pie se abren solas: si la obra está ahí, la ves sin tener " +
      "que adivinar dónde quedó.",
    lado: "bottom",
  },
  {
    ancla: "aviso-desincronizadas",
    titulo: "Si aparece este aviso amarillo",
    texto:
      "Quiere decir que tu cambio se guardó, pero no llegó a Odoo: el tablero de Operaciones " +
      "puede estar mostrando un semáforo viejo.<br><br>" +
      "<b>Reintentar</b> vuelve a mandar lo pendiente. Si después de un par de intentos sigue, " +
      "avisá: es la conexión con Odoo, no algo que hayas hecho mal.",
    lado: "bottom",
  },
  {
    ancla: "pospuestas",
    titulo: "Las pospuestas esperan al pie",
    // OJO: la vuelta se calcula sólo al abrir la bandeja (resolverPospuestas). Si se suma al
    // barrido diario, cambiar "cada vez que alguien abre la bandeja" por "todos los días".
    texto:
      "No suman al total porque todavía no hay nada que hacer con ellas. Cada una dice cuándo " +
      "vuelve y quién la pospuso.<br><br>" +
      "La vuelta se recalcula cada vez que alguien abre la bandeja: si Operaciones la planificó " +
      "antes, la fecha se adelanta y llega un aviso. Si querés trabajarla ya, <b>Reactivar</b> la " +
      "trae de vuelta.",
    lado: "top",
  },
  {
    ancla: "no-aplican",
    titulo: "Las descartadas también quedan al pie",
    texto:
      "Plegadas y sin sumar al total: no hay nada que hacer con ellas. Pero si marcaste una de " +
      "más, desde acá la traés de vuelta a la cola, con sus papeles y su historial intactos.",
    lado: "top",
  },
  {
    ancla: "habilitadas",
    titulo: "Y las habilitadas, por si te apuraste",
    texto:
      "Habilitar saca la obra de la cola. Esta lista existe para que, si te equivocaste, la " +
      "encuentres sin acordarte de la dirección.<br><br>" +
      "<b>Revertir</b> te pide confirmación porque le manda a Operaciones un aviso <b>crítico</b>: si " +
      "la obra ya estaba planificada, la jornada sigue en el tablero y alguien tiene que decidir " +
      "qué hacer con ella.",
    lado: "top",
  },
  {
    ancla: "boton-planificacion",
    titulo: "Qué se viene en las próximas dos semanas",
    texto:
      "El panel muestra las jornadas que Operaciones ya puso en el tablero y cuáles todavía no " +
      "están habilitadas: lo que se te viene encima, sin tener que preguntar.<br><br>" +
      "Es <b>sólo lectura</b> a propósito: planificar es de Operaciones, y mover una jornada desde " +
      "otra oficina es la forma de que cambie sin que quien planifica se entere. Si lo dejás " +
      "abierto, la próxima vez sigue abierto.",
    lado: "bottom",
  },
  {
    ancla: "boton-ayuda",
    titulo: "Ahora entrá a una obra",
    // OJO: "el recorrido sigue adentro" depende de arreglar el arranque automático de la ficha
    // (errores.md §15).
    texto:
      "Abrí cualquiera de la lista: adentro es donde se trabaja de verdad, y el recorrido sigue " +
      "ahí.<br><br>" +
      "Cuando quieras volver a ver esto, o leer la guía escrita, está en <b>¿Cómo funciona?</b>.",
    lado: "bottom",
  },
];

export const PASOS_FICHA: PasoTour[] = [
  {
    ancla: "veredicto",
    titulo: "La respuesta, arriba de todo",
    // OJO: hasta arreglar errores.md §6, el veredicto también pide permiso en desarmes y en
    // obras que no llevan permiso. Y en modo oscuro el título no se lee (§4).
    texto:
      "Si esta obra se puede armar y qué le falta, cruzando la documentación con el permiso. Es " +
      "lo que pregunta Operaciones cuando llama, así que está primero.<br><br>" +
      "La documentación avisa pero <b>no frena</b>: el tablero deja confirmar igual. El permiso sí " +
      "puede frenar un armado, cuando el cliente pidió esperar el permiso emitido.",
    lado: "bottom",
  },
  {
    ancla: "que-ejecutar",
    titulo: "Qué se va a armar",
    texto:
      "Es el mismo texto que ve Operaciones en el tablero. Está acá porque los papeles dependen " +
      "de la obra: una torre de un día no pide lo mismo que una fachada de seis meses, y antes " +
      "había que ir a buscarlo a Odoo.",
    lado: "bottom",
  },
  {
    ancla: "fechas-obra",
    titulo: "Cuándo va, de verdad",
    texto:
      "Qué tan urgente es el trámite no lo dice la fecha programada sola: una obra con jornadas " +
      "<b>confirmadas</b> la semana que viene no puede esperar; una que sigue sin planificar, " +
      "sí.<br><br>" +
      "A la izquierda, lo acordado con el cliente; a la derecha, lo que Operaciones ya puso en el " +
      "tablero.",
    lado: "bottom",
  },
  {
    ancla: "aviso-syh",
    titulo: "Cuando llevamos técnico de SyH",
    texto:
      "Si la venta dice que ponemos técnico de Seguridad e Higiene, hay un papel más: la " +
      "documentación de ese técnico, que el cliente tiene que aprobar antes de dejarlo entrar." +
      "<br><br>" +
      "Por eso aparece también como <b>requisito</b> en la lista de abajo: un cartel avisa, un " +
      "requisito se persigue.",
    lado: "bottom",
  },
  {
    ancla: "contacto-papeles",
    titulo: "A quién mandarle los papeles",
    texto:
      "Es la persona de la obra que valida la documentación y nos deja entrar. La carga Comercial " +
      "en la venta.<br><br>" +
      "Está pegada a los botones porque es el dato que necesitás justo ahora: desde el celular, " +
      "tocás el teléfono y llamás. Si no aparece, es una venta vieja que no lo tiene.",
    lado: "bottom",
  },
  {
    ancla: "boton-habilitar",
    titulo: "Habilitar es una decisión tuya",
    texto:
      "El botón se prende cuando <b>todos</b> los requisitos están aprobados; mientras falten, te " +
      "dice cuántos.<br><br>" +
      "No pasa solo: alguien lo decide y queda registrado <b>quién y cuándo</b>. Al apretarlo, " +
      "Operaciones recibe un aviso en la campanita y en Slack: desde ese momento la obra se puede " +
      "programar.",
    lado: "bottom",
  },
  {
    ancla: "boton-habilitar",
    titulo: "Y si el cliente autoriza sin los papeles",
    texto:
      "Pasa: te autoriza por teléfono y la documentación llega el lunes. Para eso está " +
      "<b>habilitar por excepción</b>, que te pide escribir el motivo.<br><br>" +
      "Existe a propósito. Un sistema que no admite lo que pasa en la realidad termina esquivado " +
      "por afuera, y ahí sí no queda registro de nada.",
    lado: "bottom",
  },
  {
    ancla: "boton-revertir",
    titulo: "Revertir, si te apuraste",
    // OJO: hoy el aviso de revertir —y el de volver a habilitar— sale una sola vez por obra
    // (errores.md §13). Si se cambia, el texto sigue valiendo.
    texto:
      "Vuelve la obra a la cola y le manda a Operaciones un aviso <b>crítico</b>, porque quizás ya " +
      "la planificaron confiando en la habilitación.<br><br>" +
      "Las jornadas no se borran: qué hacer con ellas lo decide quien planifica.",
    lado: "bottom",
  },
  {
    ancla: "boton-consulta",
    titulo: "Cuando primero hay que preguntar qué pide",
    // OJO: 0 usos en producción y es lo único que alimenta x_hab_dias (errores.md §1). Decidir
    // si se queda; si se saca, borrar este paso.
    texto:
      "Algunos clientes no dicen qué documentación quieren hasta que les preguntás. Este botón " +
      "deja registrado que ya preguntaste: la pelota pasa al cliente y queda la fecha para poder " +
      "reclamar.<br><br>" +
      "Si mandaste los papeles directamente, no hace falta: marcar un requisito como enviado ya " +
      "pasa la pelota.",
    lado: "left",
  },
  {
    ancla: "barra-pospuesta",
    titulo: "Posponer, también desde acá",
    texto:
      "Lo mismo que el reloj de la bandeja: si falta mucho para la obra, la sacás de la cola y " +
      "vuelve sola 10 días antes.<br><br>" +
      "Si ya está pospuesta lo vas a ver en ámbar, arriba: antes de ponerte a mandar papeles, " +
      "conviene saber que esta obra no está en la cola.",
    lado: "bottom",
  },
  {
    ancla: "barra-triage",
    titulo: "Acá también decidís si aplica",
    texto:
      "Lo mismo que en la bandeja, pero para esta obra sola y con la vuelta atrás a mano.<br><br>" +
      "Acordate: <b>no aplica</b> es cuando no hay que mandarle documentación a nadie, y deja la " +
      "obra <b>habilitada</b> en el acto. Los requisitos, las notas y el historial no se borran.",
    lado: "bottom",
  },
  {
    ancla: "reclamar",
    titulo: "Reclamar no manda nada: registra la fecha",
    texto:
      "El mail lo mandás vos, como siempre. El botón deja anotado que reclamaste y cuántas " +
      "veces.<br><br>" +
      "Ese número es lo que después te deja decirle al cliente \"te lo pedí tres veces desde el " +
      "4 de agosto\", con el historial en la mano.",
    lado: "top",
  },
  {
    ancla: "vencimiento",
    titulo: "El vencimiento",
    // OJO: si se agrega un aviso real (campanita/Slack) cuando falten 30 días, decirlo acá.
    texto:
      "Muchas habilitaciones caducan: la nómina de ART vence, el seguro vence. Si la obra sigue " +
      "armada cuando eso pasa, estamos sin cobertura.<br><br>" +
      "Cargá acá la fecha y la obra va a aparecer en el grupo <b>Vencen en menos de 30 días</b> " +
      "de la bandeja. No llega ningún aviso aparte: es la bandeja la que te lo muestra, así que " +
      "sin la fecha cargada nadie se entera.",
    lado: "top",
  },
  {
    ancla: "permiso",
    titulo: "El permiso es otro trámite",
    // OJO: la ficha todavía deja cambiar la modalidad, y el cambio no queda en el historial
    // (errores.md §8). Si queda editable, sumar por qué y que se registre.
    texto:
      "Va por separado de la documentación. Si lleva permiso y con qué se arma lo contesta " +
      "<b>Comercial al cotizar</b>: acá lo ves.<br><br>" +
      "Lo que movés vos es el trámite —presentado, emitido— y el número de expediente. Esos " +
      "datos manejan el candado del tablero: un armado que espera el permiso emitido no se " +
      "puede confirmar, y uno que va con expediente pide el número. A los desarmes no los frena.",
    lado: "left",
  },
  {
    ancla: "paquetes",
    titulo: "Los combos: no cargues los papeles a mano",
    texto:
      "Cada cliente pide una lista distinta, pero se repiten. Por eso hay <b>paquetes</b> ya " +
      "armados: elegís uno y te crea todos los requisitos de una.<br><br>" +
      "<b>Básico</b> es sólo la nómina de ART. <b>+ No repetición</b> le suma la cláusula. " +
      "<b>+ SVO</b> agrega el SVO y el aviso de obra. <b>Completo</b> son los ocho, para los " +
      "clientes más exigentes.<br><br>" +
      "Es un punto de partida, no una jaula: si cambiás a otro, <b>no se borra</b> lo que ya " +
      "mandaste ni lo que agregaste a mano.",
    lado: "bottom",
  },
  {
    ancla: "requisitos",
    titulo: "Los papeles, uno por uno",
    texto:
      "Cada requisito va <b>pendiente → enviado → aprobado</b>. Si el cliente rebota alguno, lo " +
      "marcás <b>observado</b> y te pide el motivo: sin eso la fila se ve en rojo y no dice qué " +
      "corregir, que es justo lo que te obliga a volver a leer el mail.<br><br>" +
      "Arriba aparecen los botones para mover todos juntos, porque casi siempre va un solo mail " +
      "con todo. Lo observado queda afuera a propósito: necesita que alguien lo mire.",
    lado: "top",
  },
  {
    ancla: "adjuntos",
    titulo: "Los archivos van colgados de cada papel",
    // OJO: si se agrega confirmación al borrar (errores.md §12), sacar la última oración.
    texto:
      "Con el clip le adjuntás el PDF a ese requisito y no a la obra. Si el cliente observa las " +
      "capacitaciones, sabés exactamente qué archivo reemplazar, en vez de adivinar cuál de los " +
      "nueve PDFs era.<br><br>" +
      "Ojo: borrar un archivo o un requisito no pide confirmación ni queda en el historial.",
    lado: "left",
  },
  {
    ancla: "agregar-requisito",
    titulo: "Y si el cliente pide algo que no está en el combo",
    texto:
      "Lo escribís acá con el nombre que quieras y pasa a ser un requisito más de esta obra, con " +
      "los mismos estados y los mismos botones.<br><br>" +
      "Sirve para los pedidos raros: un formulario propio del consorcio, una constancia puntual. " +
      "Los del paquete que ese cliente no pida, sacalos con el tacho.",
    lado: "top",
  },
  {
    ancla: "notas",
    titulo: "Las notas: lo que no entra en ningún campo",
    texto:
      "\"El administrador atiende después de las 11\", \"la nómina la manda el contador\". Lo que " +
      "hoy vive en tu cabeza o en un mail viejo, y que la próxima persona que agarre la obra no " +
      "tiene forma de saber.<br><br>" +
      "Es la conversación de los <b>papeles</b>. La de Operaciones con la obra va aparte, en el " +
      "tablero, para que ninguna tape a la otra. El <b>chinche</b> deja la nota arriba y marca la " +
      "obra en la bandeja.",
    lado: "top",
  },
  {
    ancla: "historial",
    titulo: "Los botones registran; el historial no se borra",
    texto:
      "Ningún botón manda mails: el correo lo mandás vos y acá queda la <b>fecha</b>. Lo único que " +
      "sale solo es el aviso a Operaciones cuando habilitás o revertís.<br><br>" +
      "El historial no se puede editar ni borrar: un error se corrige agregando, no tapando. Si " +
      "querés el detalle completo, está en <b>¿Cómo funciona?</b>.",
    lado: "top",
  },
];
```

**Si 20 pasos en la ficha resultan largos**, se pueden quitar sin perder lo esencial, en este orden:
1. `que-ejecutar`;
2. `fechas-obra`;
3. `barra-pospuesta` (ya lo explica la bandeja);
4. `reclamar`;
5. `boton-consulta` (si se decide sacar el botón).

---

## 3. Anclas `data-tour` nuevas

Las anclas que ya existen se mantienen con el mismo nombre: `bandeja-header`, `grupo-recien-llegadas`, `fila-obra`, `grupos`, `no-aplican`, `veredicto`, `boton-habilitar`, `boton-consulta`, `barra-triage`, `vencimiento`, `paquetes`, `requisitos`, `agregar-requisito`, `notas`, `permiso` e `historial`.

### Bandeja

- **`buscador`**
  - Dónde: `src/app/(dashboard)/habilitaciones/page.tsx:153`, en el `<div className="relative">` que envuelve el `Input`.
  - Cuándo existe: siempre.
- **`posponer-fila`**
  - Dónde: `src/components/habilitaciones/fila-bandeja.tsx:149`, en el `Button` del reloj, **sólo cuando `anclaTour`**, igual que `fila-obra`.
  - Cuándo existe: si hay algún grupo.
- **`aviso-desincronizadas`**
  - Dónde: `page.tsx:178`, en el `div` del aviso amarillo.
  - Cuándo existe: sólo con desincronizadas; si no, se saltea.
- **`pospuestas`**
  - Dónde: `page.tsx:295`, en el `<section>` de `Pospuestas`.
  - Cuándo existe: si hay alguna pospuesta.
- **`habilitadas`**
  - Dónde: `page.tsx:403`, en el `<section>` de `Habilitadas`.
  - Cuándo existe: si hay alguna habilitada.
- **`boton-planificacion`**
  - Dónde: `src/components/habilitaciones/planificacion-contexto.tsx:102`, en el `Button` de `BotonPlanificacion`.
  - Cuándo existe: siempre, en la bandeja y en la ficha.
- **`boton-ayuda`**
  - Dónde: `src/components/habilitaciones/boton-ayuda.tsx:21`, en el `Button` que se pasa a `DropdownMenuTrigger render={…}`.
  - Cuándo existe: siempre. Reemplaza al `bandeja-header` del último paso.

### Ficha

- **`que-ejecutar`**
  - Dónde: `src/app/(dashboard)/habilitaciones/[otId]/page.tsx:162`. Va en un `<div>` que envuelva `<DetalleTecnico>`, no en el componente compartido con el tablero.
  - Cuándo existe: siempre.
- **`fechas-obra`**
  - Dónde: `src/components/habilitaciones/fechas-obra.tsx:61`, en el `<section>`.
  - Cuándo existe: siempre.
- **`aviso-syh`**
  - Dónde: `[otId]/page.tsx:178`, en el `div` de "El cliente contrató técnico…".
  - Cuándo existe: sólo con SyH.
- **`contacto-papeles`**
  - Dónde: `src/components/habilitaciones/bloque-habilitacion.tsx:100`, en el `<p>` de "Mandarle los papeles a".
  - Cuándo existe: si la venta tiene el contacto y la obra no está habilitada.
- **`boton-revertir`**
  - Dónde: `bloque-habilitacion.tsx:69`, en el `Button` "Revertir" de la rama habilitada.
  - Cuándo existe: sólo en las habilitadas. Es el reemplazo natural de los dos pasos de `boton-habilitar`, que en esas obras se saltean.
- **`barra-pospuesta`**
  - Dónde: `[otId]/page.tsx:340` y `:352`. Va en el `div` de las **dos** ramas de `BarraPospuesta`: la línea "¿Falta mucho…?" y la caja ámbar.
  - Cuándo existe: si la obra no está habilitada ni es "no aplica".
- **`reclamar`**
  - Dónde: `[otId]/page.tsx:441`, en el `div` del botón "Reclamar al cliente".
  - Cuándo existe: siempre.
- **`adjuntos`**
  - Dónde: `src/components/habilitaciones/listado-requisitos.tsx:325`, en el `Button` del clip, **sólo en el primer requisito**. Se pasa una prop `anclaTour` desde el `map`, igual que la fila de la bandeja.
  - Cuándo existe: si hay al menos un requisito.

**Nota para el rediseño en paralelo:** el contrato son los nombres de las anclas, no los componentes. Si el rediseño mueve los bloques, alcanza con que el atributo viaje con el elemento. El orden de `PASOS_FICHA` de arriba sigue el orden visual de hoy: si el rediseño reordena la ficha, hay que reordenar los pasos para que el recorrido no salte.
