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
  /**
   * Dónde colgarlo si `ancla` no está en pantalla, en vez de saltearlo. Para los pasos que
   * explican algo que no siempre se ve —el triage, un día sin obras nuevas— pero que no se
   * puede dejar sin enseñar. El texto tiene que funcionar colgado de cualquiera de las dos.
   */
  anclaAlternativa?: string;
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
  // Los dos del triage se cuelgan del encabezado si ese día no hay obras nuevas: es la
  // primera decisión del módulo, y antes quien entraba un día sin recién llegadas no la
  // aprendía nunca.
  {
    ancla: "grupo-recien-llegadas",
    anclaAlternativa: "bandeja-header",
    titulo: "Lo primero de todo: ¿aplica o no aplica?",
    texto:
      "Toda obra nueva cae primero en <b>Recién llegadas</b> y no se mueve hasta que decidas.<br><br>" +
      "<b>Aplica</b> significa que el cliente pide documentación: la obra entra a la cola con la nómina de " +
      "ART ya cargada. Si la venta dice que llevamos técnico de Seguridad e Higiene, ese papel se suma solo.",
    lado: "bottom",
  },
  {
    ancla: "grupo-recien-llegadas",
    anclaAlternativa: "bandeja-header",
    titulo: "\"No aplica\" habilita la obra en el acto",
    texto:
      "Es para las obras donde <b>no hay que mandarle nada a nadie</b>: el cliente no pide papeles. La obra " +
      "queda <b>habilitada</b> y en <b>verde</b> ahí mismo, lista para armar.<br><br>" +
      "Ojo con los botones de ese grupo: <b>sin casillas tildadas actúan sobre todas</b>. Si querés decidir " +
      "sólo algunas, tildalas primero. Si te equivocaste, se trae de vuelta desde <b>No aplican</b>, al pie.",
    lado: "bottom",
  },
  {
    ancla: "fila-obra",
    titulo: "Qué te dice cada fila",
    texto:
      "A la derecha, <b>qué falta y de quién es el próximo paso</b>. Si dice qué hacer —\"mandar Nómina ART\", " +
      "\"habilitar\"— es tuyo; si dice \"el cliente revisa…\", es del cliente.<br><br>" +
      "Los <b>días</b> cuentan desde que está así y se ponen en rojo cuando ya son demasiados: al día " +
      "siguiente si es tuyo, a la semana si es del cliente. Abajo, cuántos requisitos están aprobados " +
      "sobre el total.",
    lado: "bottom",
  },
  {
    ancla: "grupos",
    titulo: "Los grupos en rojo son los urgentes",
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
      "Cuando quieras volver a ver esto, o leer la guía escrita, está en <b>¿Cómo funciona?</b>, acá arriba.",
    lado: "bottom",
  },
];

export const PASOS_FICHA: PasoTour[] = [
  {
    ancla: "veredicto",
    titulo: "La respuesta, arriba de todo",
    texto:
      "Si esta obra se puede armar y qué le falta. Es lo que pregunta Operaciones cuando llama, así que está " +
      "primero.<br><br>" +
      "Dice lo mismo que el tablero: en <b>verde</b> está resuelta; en <b>ámbar</b> falta algo que avisa pero " +
      "no frena —la documentación nunca frena—; en <b>rojo</b> el tablero no deja confirmar, porque el " +
      "cliente pidió esperar el permiso emitido.",
    lado: "bottom",
  },
  {
    ancla: "boton-habilitar",
    titulo: "Habilitar es una decisión tuya",
    texto:
      "El botón se prende cuando <b>todos</b> los requisitos están aprobados. Mientras falten, te dice cuántos.<br><br>" +
      "No pasa solo: alguien lo decide, y queda registrado <b>quién y cuándo</b>. Al apretarlo, Operaciones " +
      "recibe un aviso: desde ese momento la obra se puede programar.",
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
    ancla: "boton-revertir",
    titulo: "Revertir, si te apuraste",
    texto:
      "Vuelve la obra a la cola sin habilitar. Te pide el <b>motivo</b> porque Operaciones recibe un aviso " +
      "urgente con ese texto: quizás ya la planificaron confiando en la habilitación.<br><br>" +
      "Las jornadas no se borran del tablero: qué hacer con ellas lo decide quien planifica. Si después la " +
      "volvés a habilitar, también les avisa.",
    lado: "bottom",
  },
  {
    ancla: "boton-consulta",
    titulo: "Cuando primero hay que preguntar qué pide",
    texto:
      "Algunos clientes no dicen qué documentación quieren hasta que les preguntás. Este botón deja " +
      "registrado que ya preguntaste: mientras no salga ningún papel, la pelota es del cliente.<br><br>" +
      "Si mandás los papeles directamente, no hace falta: marcar un requisito como enviado ya pasa la pelota.",
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
      "cuando eso pasa, estás sin cobertura.<br><br>" +
      "Cargá acá la fecha y, 30 días antes, la obra aparece en la bandeja en <b>Vencen en menos de 30 días</b>. " +
      "No llega ningún aviso aparte: es la bandeja la que te lo muestra, así que sin la fecha cargada nadie " +
      "se entera.",
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
      "Los botones de a uno siguen estando para cuando va de a uno, y deshacer una aprobación te pide " +
      "confirmación.",
    lado: "top",
  },
  {
    ancla: "agregar-requisito",
    titulo: "Y si el cliente pide algo que no está en el combo",
    texto:
      "Lo escribís acá con el nombre que quieras y listo — pasa a ser un requisito más de esta obra, con " +
      "los mismos estados y los mismos botones.<br><br>" +
      "Sirve para los pedidos raros: un formulario propio del consorcio, una constancia puntual. Los del " +
      "paquete que ese cliente no pida, sacalos con el tacho: se puede mientras estén pendientes.",
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
      "Es la conversación de los <b>papeles</b>: la de Operaciones con la obra va aparte, en el tablero, para " +
      "que ninguna tape a la otra. El <b>chinche</b> deja la nota arriba y marca la obra en la bandeja.",
    lado: "top",
  },
  {
    ancla: "permiso",
    titulo: "El permiso es otro trámite",
    texto:
      "Va por separado de la documentación y es lo único que puede frenar un armado.<br><br>" +
      "Si lleva permiso y con qué se arma lo contesta <b>Comercial al cotizar</b>, y el trámite lo actualiza la " +
      "gestoría de permisos. Acá se lee: si algo está mal, se corrige en la venta, en Odoo.<br><br>" +
      "Si el cliente pidió esperar el permiso emitido, el tablero no deja confirmar la jornada; si va con " +
      "número de expediente y no está cargado, pide un motivo. A los desarmes no los frena.",
    lado: "left",
  },
  {
    ancla: "historial",
    titulo: "Los botones sólo registran",
    texto:
      "Ninguno manda mails. El correo lo mandás vos por fuera y acá marcás que lo hiciste. Lo único que sale " +
      "solo es el aviso a Operaciones cuando habilitás o revertís.<br><br>" +
      "Lo que aporta el sistema es la <b>fecha</b>: poder demostrar qué papel mandaste y cuándo. Por eso todo " +
      "queda en el historial —también lo que se deshace o se quita— y no se puede borrar: un error se corrige " +
      "agregando, no tapando.<br><br>" +
      "Si querés el detalle completo, está en <b>¿Cómo funciona?</b> arriba.",
    lado: "top",
  },
];
