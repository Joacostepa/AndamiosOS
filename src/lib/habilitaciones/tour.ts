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
//
// v2 (09/10): reescrito para el rediseño —grupos por de quién es la pelota, el botón del
// paso en la fila, la ficha con una sola tarjeta de estado—. Subir la versión hace que a
// todos les aparezca de nuevo una vez. Diagnóstico y borrador en docs/habilitaciones/recorrido.md.

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
export const TOUR_BANDEJA = "hab:tour-bandeja:v2";
export const TOUR_FICHA = "hab:tour-ficha:v2";

export const PASOS_BANDEJA: PasoTour[] = [
  {
    ancla: "bandeja-header",
    titulo: "Tu cola, ordenada por lo que hay que hacer",
    texto:
      "Las obras aparecen solas cuando existe la OT en Odoo: acá no se da de alta nada.<br><br>" +
      "Los grupos dicen <b>de quién es la pelota</b>: lo urgente, lo nuevo, lo que tenés que hacer vos, lo que " +
      "espera al cliente y lo que espera el permiso. Arriba, cuántas hay en cada uno: tocá un número y te lleva.",
    lado: "bottom",
  },
  {
    ancla: "grupo-urgentes",
    titulo: "Lo urgente va primero",
    texto:
      "Obras que se arman en 3 días o menos, o cuya fecha ya pasó, y siguen sin habilitar. Le gana a todo: " +
      "una obra nueva que se arma pasado mañana está acá, no en Nuevas.<br><br>" +
      "Una obra aparece en <b>un solo grupo</b>, el más urgente que le corresponda: así los números sirven " +
      "para decidir por dónde empezar.",
    lado: "bottom",
  },
  {
    ancla: "grupo-nuevas",
    anclaAlternativa: "bandeja-header",
    titulo: "Lo primero de cada obra: ¿pide papeles?",
    texto:
      "Toda obra nueva cae en <b>Nuevas</b> y no se mueve hasta que decidas.<br><br>" +
      "<b>Aplica</b>: el cliente pide documentación. La obra pasa a la cola con la nómina de ART cargada, y si " +
      "llevamos técnico de Seguridad e Higiene, ese papel se suma solo.<br>" +
      "<b>No aplica</b>: no hay que mandarle nada a nadie. Queda <b>habilitada</b> en el acto.<br><br>" +
      "Con las casillas resolvés varias juntas. Si te equivocás, el aviso de abajo trae <b>Deshacer</b>.",
    lado: "bottom",
  },
  {
    ancla: "fila-obra",
    titulo: "Qué te dice cada fila",
    texto:
      "En el medio, <b>el próximo paso</b> y hace cuánto está así. Los días se ponen en rojo cuando ya son " +
      "demasiados: al día siguiente si el paso es tuyo, a la semana si espera al cliente.<br><br>" +
      "Después, <b>cuándo se arma</b>: la primera jornada del tablero si ya está planificada, o la fecha " +
      "programada. En rojo si faltan 3 días o menos.<br><br>" +
      "Los carteles aparecen sólo si cambian algo: prioridad, desarme, SyH, papeles observados o una nota fijada.",
    lado: "bottom",
  },
  {
    ancla: "accion-fila",
    titulo: "El botón hace el paso",
    texto:
      "<b>Marcar enviado</b>, <b>Aprobó</b>, <b>Habilitar</b>: lo que se resuelve en un clic se resuelve en la " +
      "fila, sin abrir la obra. Ninguno manda mails: el correo lo mandás vos, acá queda la fecha.<br><br>" +
      "Si te equivocaste, el aviso trae <b>Deshacer</b>. Habilitar es la excepción: le avisa a Operaciones que " +
      "ya puede programar, así que primero te pregunta.<br><br>" +
      "En <b>⋯</b> está lo demás: posponer, marcar que no aplica, ver la OT en Odoo.",
    lado: "left",
  },
  {
    ancla: "grupo-cliente",
    titulo: "Esperando al cliente",
    texto:
      "Ya se le mandó todo y falta que apruebe. Los días cuentan desde el papel más viejo que sigue sin " +
      "respuesta.<br><br>" +
      "Pasada la semana aparece <b>Reclamar</b>: no manda nada, registra la fecha. Es lo que después te deja " +
      "decir \"te lo pedí tres veces desde el 4 de agosto\".",
    lado: "bottom",
  },
  {
    ancla: "grupo-permiso",
    titulo: "Las que esperan el permiso vuelven solas",
    texto:
      "Si el cliente pidió no armar sin el permiso emitido, mandar los papeles ahora no sirve: se vencen antes " +
      "de que entre la cuadrilla.<br><br>" +
      "Esas obras esperan acá, plegadas, y <b>vuelven solas</b> cuando la gestoría marca el permiso como " +
      "emitido, o 10 días antes de armar. Te llega un aviso. No hace falta posponerlas.",
    lado: "top",
  },
  {
    ancla: "buscador",
    titulo: "Para encontrar una obra, escribí",
    texto:
      "Busca en todas las obras activas, también las pospuestas y las resueltas, por dirección, cliente, OT " +
      "o venta. Mientras buscás se abre todo lo plegado: si la obra está, la ves.",
    lado: "bottom",
  },
  {
    ancla: "pospuestas",
    titulo: "Las pospuestas",
    texto:
      "Para cuando falta mucho para la obra por otro motivo que el permiso. Vuelven solas en la fecha que " +
      "elegiste, o antes si Operaciones la planifica, y te llega un aviso. <b>Reactivar</b> la trae ya.",
    lado: "top",
  },
  {
    ancla: "resueltas",
    titulo: "Lo resuelto queda al pie",
    texto:
      "Las habilitadas y las que no aplican. No hay nada que hacer con ellas, pero si te apuraste se corrige " +
      "desde acá.<br><br>" +
      "<b>Revertir</b> te pide el motivo, porque Operaciones recibe un aviso urgente con ese texto: quizás ya " +
      "la planificaron.",
    lado: "top",
  },
  {
    ancla: "boton-planificacion",
    titulo: "Lo que viene en dos semanas",
    texto:
      "Las jornadas que Operaciones ya puso en el tablero, empezando por las que no están habilitadas. Es " +
      "<b>sólo lectura</b>: planificar es de Operaciones.",
    lado: "bottom",
  },
  {
    ancla: "boton-ayuda",
    titulo: "Ahora entrá a una obra",
    texto:
      "Abrí cualquiera de la lista: el recorrido sigue adentro.<br><br>" +
      "Cuando quieras volver a ver esto, o leer la guía escrita, está en <b>¿Cómo funciona?</b>.",
    lado: "bottom",
  },
];

export const PASOS_FICHA: PasoTour[] = [
  {
    ancla: "estado",
    titulo: "Lo que sigue, arriba de todo",
    texto:
      "Qué hay que hacer con esta obra, con su botón; cuándo se arma; y qué hace el tablero con ella.<br><br>" +
      "La documentación <b>nunca frena</b> al tablero: avisa. Lo único que frena un armado es el permiso, " +
      "cuando el cliente pidió esperarlo emitido.",
    lado: "bottom",
  },
  {
    ancla: "barra-triage",
    titulo: "Primero: ¿pide papeles?",
    texto:
      "<b>No aplica</b> es cuando no hay que mandarle documentación a nadie, y deja la obra <b>habilitada</b> " +
      "en el acto. Si después resulta que sí pedía, se deshace.",
    lado: "bottom",
  },
  {
    ancla: "boton-habilitar",
    titulo: "Habilitar es una decisión tuya",
    texto:
      "Con todos los papeles aprobados aparece este botón. No pasa solo: alguien lo decide y queda " +
      "registrado <b>quién y cuándo</b>. Operaciones recibe el aviso de que ya puede programar.",
    lado: "bottom",
  },
  {
    ancla: "boton-revertir",
    titulo: "Revertir, si te apuraste",
    texto:
      "La obra vuelve a la cola sin habilitar. Te pide el <b>motivo</b> porque Operaciones recibe un aviso " +
      "urgente con ese texto. Las jornadas no se borran del tablero: lo decide quien planifica.",
    lado: "bottom",
  },
  {
    ancla: "mas-acciones",
    titulo: "Lo que no es el paso de hoy",
    texto:
      "<b>Habilitar sin todos los papeles</b>: el cliente autorizó por teléfono y la documentación llega el " +
      "lunes. Te pide el motivo. Existe a propósito: lo que no se puede registrar se termina haciendo por " +
      "afuera, sin rastro.<br><br>" +
      "También: posponer, registrar un reclamo, registrar que le consultaste qué pide, marcar que no aplica.",
    lado: "left",
  },
  {
    ancla: "requisitos",
    titulo: "Los papeles, uno por uno",
    texto:
      "Cada papel va <b>pendiente → enviado → aprobado</b>. Si el cliente rebota uno, marcalo <b>observado</b> " +
      "con el motivo: así la fila dice qué corregir sin volver a leer el mail.<br><br>" +
      "Arriba están los botones para mover todos juntos. Deshacer una aprobación te pide confirmación, y " +
      "todo queda en el historial.",
    lado: "top",
  },
  {
    ancla: "contacto-papeles",
    titulo: "A quién mandárselos",
    texto:
      "La persona de la obra que valida la documentación, cargada en la venta. Tocás el teléfono y llamás.",
    lado: "bottom",
  },
  {
    ancla: "paquetes",
    titulo: "Los combos",
    texto:
      "<b>Básico</b> es la nómina de ART. <b>+ No repetición</b> suma la cláusula. <b>+ SVO</b> agrega el SVO y " +
      "el aviso de obra. <b>Completo</b> son los ocho.<br><br>" +
      "Cambiar de paquete <b>no borra</b> lo que ya mandaste ni lo que agregaste a mano.",
    lado: "bottom",
  },
  {
    ancla: "agregar-requisito",
    titulo: "Lo que no está en el combo",
    texto:
      "Un formulario propio del consorcio, una constancia puntual: lo escribís y pasa a ser un papel más. Los " +
      "que el cliente no pide, sacalos con el tacho mientras estén pendientes.",
    lado: "top",
  },
  {
    ancla: "vencimiento",
    titulo: "El vencimiento",
    texto:
      "La nómina vence, el seguro vence. Con la fecha cargada, 30 días antes la obra vuelve a aparecer en la " +
      "bandeja. No llega ningún aviso aparte: sin la fecha, nadie se entera.",
    lado: "top",
  },
  {
    ancla: "notas",
    titulo: "Las notas",
    texto:
      "Lo que no entra en ningún campo: las razones sociales y CUIT de la cláusula, \"el administrador " +
      "atiende después de las 11\".<br><br>" +
      "Es la conversación de los papeles; la de Operaciones va aparte, en el tablero. El <b>chinche</b> deja " +
      "la nota arriba y la marca en la bandeja.",
    lado: "top",
  },
  {
    ancla: "permiso",
    titulo: "El permiso se lee acá, se corrige en Odoo",
    texto:
      "Si lleva permiso y con qué se arma lo carga Comercial al cotizar; el trámite y el expediente los " +
      "actualiza la gestoría. Si algo está mal, se corrige en la venta, en Odoo.",
    lado: "left",
  },
  {
    ancla: "historial",
    titulo: "El historial no se borra",
    texto:
      "Qué papel se mandó y cuándo, cada reclamo, lo que se deshizo o se quitó. No se puede editar: un error " +
      "se corrige agregando, no tapando.",
    lado: "left",
  },
];
