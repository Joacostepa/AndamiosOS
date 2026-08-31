// El contenido de los recorridos guiados del módulo Habilitaciones.
//
// Datos puros, separados de la mecánica a propósito: para corregir un texto se toca este
// archivo y nada más. La mecánica —arrancar, saltear pasos sin ancla, recordar que ya se
// vio— vive en src/hooks/use-tour.ts.
//
// LOS PASOS EXPLICAN POR QUÉ, NO DÓNDE HACER CLIC. Dónde está el botón se descubre solo;
// lo que no se adivina mirando la pantalla es qué significa "no aplica", por qué una obra
// está en rojo, o por qué habilitar pide un motivo cuando faltan papeles. Un tour que
// dice "acá hacés clic para triar" no le enseña nada a nadie.
//
// SON DOS TOURS Y NO UNO QUE NAVEGUE. driver.js vive en una página: cruzar de la bandeja
// a la ficha obligaría a persistir el índice del paso, re-montar el driver y esperar la
// data del otro lado. La continuidad se resuelve con el último paso de la bandeja, que
// invita a abrir una obra — y el tour de la ficha arranca solo la primera vez que se abre.

export type PasoTour = {
  /** Valor del atributo data-tour del elemento a resaltar. Sin ancla, el paso se saltea. */
  ancla: string;
  titulo: string;
  texto: string;
  /** De qué lado del elemento sale el globo. driver.js reacomoda si no entra. */
  lado?: "top" | "bottom" | "left" | "right";
};

/** Clave de localStorage. Versionada: subirla vuelve a mostrar el tour a todos. */
export const TOUR_BANDEJA = "hab:tour-bandeja:v1";
export const TOUR_FICHA = "hab:tour-ficha:v1";

export const PASOS_BANDEJA: PasoTour[] = [
  {
    ancla: "bandeja-header",
    titulo: "Esta es tu cola de trabajo",
    texto:
      "Las obras aparecen acá solas cuando Comercial crea la orden en Odoo: no se da de alta nada a mano. " +
      "Y está ordenada por <b>qué hay que hacer</b>, no por obra — cada grupo es una acción distinta, así que " +
      "empezás por el de arriba y bajás.",
    lado: "bottom",
  },
  {
    ancla: "grupo-recien-llegadas",
    titulo: "Lo primero de todo: ¿aplica o no aplica?",
    texto:
      "Toda obra nueva cae acá y no se mueve hasta que vos decidas.<br><br>" +
      "<b>Aplica</b> significa que el cliente pide documentación: la obra entra a la cola y te crea el " +
      "primer requisito para arrancar.",
    lado: "bottom",
  },
  {
    ancla: "grupo-recien-llegadas",
    titulo: "\"No aplica\" habilita la obra en el acto",
    texto:
      "Es para las obras donde <b>no hay que mandarle nada a nadie</b>: el cliente no pide papeles.<br><br>" +
      "Apretarlo no la deja en un limbo — la obra queda <b>habilitada</b> y pasa a <b>verde</b> ahí mismo, " +
      "lista para armar. No hay que hacer nada más con ella.<br><br>" +
      "Es la mitad de los casos, así que resolverlas rápido es lo que mantiene la bandeja limpia. Con las " +
      "casillas de la izquierda hacés varias juntas, y si te equivocaste se deshace.",
    lado: "bottom",
  },
  {
    ancla: "fila-obra",
    titulo: "Qué te dice cada fila",
    texto:
      "La <b>etapa</b> dice de quién es el próximo movimiento: si la pelota la tenés vos o el cliente. " +
      "Al lado van los <b>días</b> que lleva esperando —en rojo cuando ya son demasiados— y cuántos " +
      "<b>requisitos</b> están aprobados sobre el total.",
    lado: "bottom",
  },
  {
    ancla: "grupos",
    titulo: "Los grupos de arriba son los urgentes",
    texto:
      "Obras que se arman en 3 días o menos, o cuya fecha ya pasó y siguen sin habilitar. Son las que mirás primero.<br><br>" +
      "Una obra aparece en <b>un solo grupo</b>, el más urgente que le corresponda. Si estuviera en dos, los números " +
      "dejarían de servirte para decidir por dónde empezar.",
    lado: "top",
  },
  {
    ancla: "no-aplican",
    titulo: "Las descartadas quedan al pie",
    texto:
      "Plegadas y sin sumar al total: no hay nada que hacer con ellas. Pero si marcaste una de más, entrás acá y " +
      "la traés de vuelta a la cola.",
    lado: "top",
  },
  {
    ancla: "bandeja-header",
    titulo: "Ahora entrá a una obra",
    texto:
      "Abrí cualquiera de la lista y el recorrido sigue adentro, que es donde se trabaja de verdad.<br><br>" +
      "Cuando quieras volver a ver esto, el botón <b>¿Cómo funciona?</b> está siempre acá arriba.",
    lado: "bottom",
  },
];

export const PASOS_FICHA: PasoTour[] = [
  {
    ancla: "veredicto",
    titulo: "La respuesta, arriba de todo",
    texto:
      "Si esta obra se puede armar hoy y qué le falta. Es lo único que le importa a Operaciones cuando llama " +
      "preguntando, así que está primero y no hay que buscarlo.",
    lado: "bottom",
  },
  {
    ancla: "boton-habilitar",
    titulo: "Habilitar es una decisión tuya",
    texto:
      "El botón se prende solo cuando <b>todos</b> los requisitos están aprobados. Mientras falten, te dice cuántos.<br><br>" +
      "No pasa solo: alguien tiene que decidirlo, y queda registrado <b>quién y cuándo</b>. Después podés revertirlo " +
      "si te apuraste.",
    lado: "bottom",
  },
  {
    ancla: "boton-habilitar",
    titulo: "Y si el cliente autoriza sin los papeles",
    texto:
      "Pasa: te autoriza por teléfono y la documentación llega el lunes. Para eso está <b>habilitar por excepción</b>, " +
      "que te pide escribir el motivo.<br><br>" +
      "Existe a propósito. Un sistema que no admite lo que pasa en la realidad termina esquivado por afuera, y ahí " +
      "sí no queda registro de nada.",
    lado: "bottom",
  },
  {
    ancla: "boton-consulta",
    titulo: "Triar no es consultar",
    texto:
      "Decidir que la obra necesita documentación es una cosa; <b>haberle preguntado al cliente qué pide</b> es otra.<br><br>" +
      "Este botón es lo único que mueve la pelota de tu lado al del cliente. Hasta que lo aprietes, la etapa dice " +
      "que la tenés vos — porque es verdad.",
    lado: "left",
  },
  {
    ancla: "barra-triage",
    titulo: "Acá también decidís si aplica",
    texto:
      "Lo mismo que en la bandeja pero para esta obra sola, y con la vuelta atrás siempre a mano.<br><br>" +
      "Acordate: <b>no aplica</b> es cuando no hay que mandarle documentación a nadie, y deja la obra " +
      "<b>habilitada</b> en el acto. Los requisitos, las notas y el historial no se borran.",
    lado: "bottom",
  },
  {
    ancla: "vencimiento",
    titulo: "El vencimiento — esto es lo que más te va a servir",
    texto:
      "Muchas habilitaciones caducan: la nómina de ART vence, el seguro vence. Si la obra sigue armada " +
      "cuando eso pasa, estás sin cobertura y nadie se entera.<br><br>" +
      "Cargá acá la fecha y el sistema <b>te avisa solo</b>: la obra aparece en <b>Vencen en menos de 30 días</b> " +
      "en la bandeja, y el semáforo cambia cuando ya venció.<br><br>" +
      "Es el único aviso que te llega sin que tengas que acordarte de mirar. Cargalo siempre que la " +
      "documentación tenga fecha de corte.",
    lado: "top",
  },
  {
    ancla: "paquetes",
    titulo: "Los combos: no cargues los papeles a mano",
    texto:
      "Cada cliente pide una lista distinta, pero se repiten. Por eso hay <b>paquetes</b> ya armados: elegís " +
      "uno y te crea todos los requisitos de una.<br><br>" +
      "<b>Básico</b> es sólo la nómina de ART. <b>+ No repetición</b> le suma la cláusula. <b>+ SVO</b> agrega " +
      "el SVO y el aviso de obra. <b>Completo</b> son los ocho, para los clientes más exigentes.<br><br>" +
      "El paquete es un punto de partida, no una jaula: podés cambiarlo después. Si cambiás a otro, " +
      "<b>no se borra</b> lo que ya mandaste ni lo que agregaste a mano.",
    lado: "bottom",
  },
  {
    ancla: "requisitos",
    titulo: "Los papeles, uno por uno",
    texto:
      "Cada requisito va <b>pendiente → enviado → aprobado</b>. Si el cliente rebota alguno, lo marcás " +
      "<b>observado</b> y te pide el motivo: sin eso la fila se ve en rojo y no dice qué corregir, que es " +
      "justamente lo que te obliga a volver a leer el mail.<br><br>" +
      "Arriba tenés <b>marcar todo</b> y <b>aprobar todo</b>, porque normalmente mandás un mail con todo junto. " +
      "Los botones de a uno siguen estando para cuando va de a uno.",
    lado: "top",
  },
  {
    ancla: "agregar-requisito",
    titulo: "Y si el cliente pide algo que no está en el combo",
    texto:
      "Lo escribís acá con el nombre que quieras y listo — pasa a ser un requisito más de esta obra, con " +
      "los mismos estados y los mismos botones.<br><br>" +
      "Sirve para los pedidos raros: un formulario propio del consorcio, una constancia puntual. También " +
      "podés borrar los del paquete que ese cliente no pida.",
    lado: "top",
  },
  {
    ancla: "notas",
    titulo: "Las notas: lo que no entra en ningún campo",
    texto:
      "\"El administrador atiende después de las 11\", \"la nómina la manda el contador, no el cliente\", " +
      "\"pidieron mandar todo junto y no de a uno\".<br><br>" +
      "Todo eso que hoy vive en tu cabeza o en un mail viejo, y que la próxima persona que agarre la obra " +
      "no tiene forma de saber.<br><br>" +
      "Con el <b>chinche</b> la fijás arriba, y además aparece en el tablero para quien planifica la obra. " +
      "Usalo para lo que alguien más necesita saber sí o sí.",
    lado: "top",
  },
  {
    ancla: "permiso",
    titulo: "El permiso es otro trámite",
    texto:
      "Va por separado de la documentación y puede frenar el armado.<br><br>" +
      "La <b>modalidad</b> la define el técnico, no vos: si el cliente pidió esperar el permiso emitido, el tablero " +
      "no deja confirmar la jornada. Si la modalidad no está definida, avisa y registra el pedido al técnico.",
    lado: "left",
  },
  {
    ancla: "historial",
    titulo: "Los botones sólo registran",
    texto:
      "Ninguno manda mails. El correo lo mandás vos por fuera y acá marcás que lo hiciste.<br><br>" +
      "Lo que aporta el sistema es la <b>fecha</b>: poder demostrar que reclamaste tres veces desde el 4 de agosto. " +
      "Por eso no se puede borrar nada del historial — un error se corrige agregando, no tapando.<br><br>" +
      "Si querés el detalle completo, está en <b>¿Cómo funciona?</b> arriba.",
    lado: "top",
  },
];
