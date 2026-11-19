// Nombres de pila para el saludo (JS, 19/11: «¡Buenas tardes Gonprifer!», «Hola Cerrajería»).
// El saludo lleva el nombre del perfil de WhatsApp sólo si la primera palabra es un nombre de esta
// lista. Si no, sale sin nombre y Tomás le pregunta con quién habla. Se comparan normalizados
// (sin tildes ni letras dobles, como texto.ts): «Rocío» = «rocio», «Matteo» = «mateo».
//
// Un nombre real que no está sólo hace que el saludo salga sin nombre: se agrega acá.

export const NOMBRES_DE_PILA: readonly string[] = [
  // ── Hombres ──
  "aaron", "abel", "abraham", "adalberto", "adan", "adolfo", "adrian", "agustin", "alan", "alberto", "albino", "alcides", "aldo",
  "alejandro", "alejo", "alessandro", "alexander", "alexis", "alfonso", "alfredo", "alonso", "alvaro", "amadeo", "ambrosio", "americo",
  "anibal", "angel", "antonio", "aquiles", "ariel", "aristides", "armando", "arnaldo", "arturo", "augusto", "aurelio", "axel",
  "baltasar", "bautista", "benicio", "benito", "benjamin", "bernabe", "bernardo", "blas", "braian", "brian", "bruno", "camilo",
  "carlos", "cayetano", "cesar", "ciro", "claudio", "clemente", "conrado", "constantino", "cristian", "christian", "cristobal",
  "damian", "dante", "dario", "david", "demian", "diego", "dino", "domingo", "donato", "dylan", "edgardo", "edmundo", "eduardo",
  "efrain", "elias", "eliseo", "elvio", "emanuel", "emmanuel", "emiliano", "emilio", "enrique", "enzo", "eric", "erik", "ernesto",
  "esteban", "eugenio", "eusebio", "evaristo", "exequiel", "ezequiel", "fabian", "fabio", "facundo", "fausto", "federico", "felipe",
  "felix", "fermin", "fernando", "fidel", "filiberto", "flavio", "florencio", "francesco", "francisco", "franco", "fred", "gabino",
  "gabriel", "gael", "gaspar", "gaston", "genaro", "german", "gerardo", "gerónimo", "geronimo", "gianfranco", "gianluca", "gino",
  "gonzalo", "gregorio", "guido", "guillermo", "gustavo", "hector", "heriberto", "hernan", "hilario", "horacio", "hugo", "humberto",
  "ian", "iair", "ignacio", "ismael", "isaac", "isaias", "israel", "ivan", "jacobo", "jaime", "javier", "jeremias", "jesus",
  "joaquin", "joel", "jonathan", "jonatan", "jorge", "jose", "josue", "juan", "julian", "julio", "justo", "kevin", "lautaro",
  "leandro", "leo", "leon", "leonardo", "leonel", "lisandro", "lorenzo", "luca", "lucas", "luciano", "lucio", "luis", "manuel",
  "marcelo", "marcial", "marcos", "mariano", "mario", "martin", "mateo", "matias", "mauricio", "mauro", "maxi", "maximiliano",
  "maximo", "miguel", "milton", "moises", "nahuel", "napoleon", "natalio", "nazareno", "nehuen", "nelson", "nestor", "nicanor",
  "nicolas", "nico", "norberto", "octavio", "omar", "orlando", "oscar", "osvaldo", "pablo", "pascual", "patricio", "paulo",
  "pedro", "pio", "rafael", "ramiro", "ramon", "raul", "reinaldo", "renato", "ricardo", "roberto", "rodolfo", "rodrigo", "rogelio",
  "rolando", "roman", "romeo", "ruben", "rufino", "salvador", "samuel", "santiago", "santino", "saul", "sebastian", "segundo",
  "sergio", "silvio", "simon", "teodoro", "thiago", "tiago", "tobias", "tomas", "ulises", "uriel", "valentin", "valentino",
  "vicente", "victor", "walter", "wenceslao", "william", "xavier", "zacarias",
  // Diminutivos y apodos que se usan como nombre en el perfil.
  "beto", "cacho", "chino", "coco", "edu", "fede", "fer", "facu", "fran", "gabi", "gaby", "guille", "gus", "javi", "juancho",
  "juanchi", "juampi", "lucho", "manu", "marce", "nacho", "nato", "pancho", "pepe", "rama", "rodri", "santi", "seba", "tincho",
  "tito", "toto", "vicky", "pato", "pachi", "dani", "ale", "agus", "cami", "flor", "ro", "sole", "vale", "lu", "mati", "maxi",
  "nico", "pau", "joaco", "tomi", "lean", "lucy", "mili", "mica", "jose", "pepa",
  // De otros orígenes, comunes en la Argentina.
  "inaki", "jean", "pierre", "giuseppe", "giovanni", "marco", "paolo", "stefano", "franz", "hans", "klaus", "boris", "igor",
  "sergei", "vladimir", "yuri", "ali", "omar", "karim", "said", "salim", "ahmed", "abdul", "moshe", "ari", "uri", "nahuel",
  "lihuel", "ayelen", "aylen", "anahi", "ailin", "ainhoa", "naiara", "itziar", "aitor", "unai", "mikel", "joseba", "jon",
  "kim", "ming", "wei", "li", "chen", "hiro", "kenji", "akira", "yoshi",

  // ── Mujeres ──
  "abigail", "ada", "adela", "adelina", "adriana", "agostina", "agustina", "aida", "aixa", "alba", "alejandra", "alexia", "alicia",
  "alina", "alma", "amalia", "amanda", "amelia", "ana", "analia", "anabel", "anabella", "andrea", "angela", "angeles", "angelica",
  "antonella", "antonia", "araceli", "ariana", "ariadna", "aurora", "barbara", "beatriz", "belen", "berta", "bianca", "blanca",
  "brenda", "brisa", "camila", "candela", "carina", "carla", "carlota", "carmela", "carmen", "carolina", "catalina", "cecilia",
  "celeste", "celia", "chiara", "cintia", "cinthia", "clara", "claudia", "clelia", "constanza", "corina", "cristina", "dafne",
  "daiana", "dayana", "daniela", "debora", "delfina", "delia", "denise", "diana", "dolores", "dora", "elba", "elena", "eliana",
  "elisa", "elizabeth", "elsa", "elvira", "emilia", "emma", "erica", "erika", "esperanza", "estefania", "estela", "ester",
  "esther", "eugenia", "eva", "evangelina", "evelyn", "fabiana", "fatima", "felicitas", "fernanda", "fiorella", "flavia",
  "florencia", "francesca", "franca", "gabriela", "georgina", "gisela", "gimena", "ximena", "jimena", "giuliana", "gladys",
  "gloria", "graciela", "guadalupe", "helena", "hilda", "ines", "irene", "iris", "isabel", "isabella", "ivana", "jazmin",
  "jesica", "jessica", "yesica", "johana", "joana", "josefina", "juana", "julia", "juliana", "julieta", "karen", "karina",
  "katherine", "laila", "lara", "laura", "leila", "lidia", "liliana", "lola", "lorena", "lourdes", "lucia", "luciana", "lucila",
  "ludmila", "luisa", "luz", "macarena", "magali", "magdalena", "maite", "malena", "manuela", "mara", "marcela", "margarita",
  "maria", "mariana", "mariel", "marina", "marisa", "marisol", "marta", "martina", "matilde", "maura", "mayra", "melina",
  "melisa", "mercedes", "micaela", "milagros", "milena", "mirta", "miriam", "monica", "morena", "nadia", "natalia", "nayla",
  "nelida", "nerea", "nilda", "noelia", "nora", "norma", "olga", "olivia", "paola", "patricia", "paula", "paulina", "perla",
  "pia", "pilar", "priscila", "rebeca", "regina", "renata", "rita", "rocio", "romina", "rosa", "rosana", "rosario", "roxana",
  "ruth", "sabrina", "samanta", "sandra", "sara", "selena", "silvana", "silvia", "sofia", "soledad", "sonia", "stella", "susana",
  "tamara", "tatiana", "teresa", "trinidad", "valentina", "valeria", "vanesa", "vanina", "veronica", "victoria", "violeta",
  "virginia", "viviana", "yamila", "yanina", "yolanda", "zoe", "zulma", "maribel", "mirna", "elvia", "ofelia", "irma", "nelly",
  "betty", "kari", "romi", "jime", "caro", "ceci", "dani", "eli", "euge", "gise", "lau", "lore", "mari", "meli", "nati", "pao",
  "pili", "sabri", "silvi", "tami", "vero", "vivi", "majo", "maru", "luli", "juli", "rochi", "sol", "luna", "abril", "aldana",
  "ambar", "anita", "astrid", "aylin", "azul", "celina", "denisse", "dalma", "emilse", "gilda", "ileana", "irina", "jael",
  "lia", "loana", "mabel", "maia", "maya", "marianela", "mirian", "nancy", "noemi", "pamela", "rosalia", "selva", "tania",
  "thelma", "wanda", "yael", "yanela", "zaira",

  // ── Los que faltaban (revisión del 19/11) ──
  "daniel", "andres", "fabricio", "mariela", "silvina", "jorgelina", "renzo", "tadeo", "jeronimo", "mia", "bryan", "brayan",
  "lionel", "elian", "bastian", "roque", "dardo", "rene", "raul", "adrian", "alexis", "maximo", "nehemias", "neri", "nery",
  "abel", "amilcar", "anselmo", "atilio", "avelino", "basilio", "celso", "ceferino", "delfin", "eladio", "eloy", "emir",
  "fermin", "florentino", "gervasio", "gilberto", "hipolito", "ireneo", "isidro", "jacinto", "lazaro", "leopoldo", "marcial",
  "marcio", "maximino", "miqueas", "osmar", "pascual", "porfirio", "quintin", "reinaldo", "remo", "ruben", "teofilo", "tristan",
  "ulises", "valerio", "vito", "yamil", "yonatan", "jonathan", "johnny", "jhon", "john", "jose luis", "wilson", "wilfredo",
  "raquel", "gisel", "giselle", "yanet", "janet", "jennifer", "yenifer", "nicole", "nicol", "alexa", "melany", "evelin",
  "fiama", "fiamma", "anabella", "graciela", "liliana", "estela", "susana", "mirta", "elsa", "norma", "marta", "beatriz",
  "carina", "claudina", "cristal", "dahiana", "dalia", "edith", "elida", "elina", "emilce", "eugenia", "fabiola", "flora",
  "gabriela", "griselda", "hebe", "herminia", "ivonne", "jacqueline", "karin", "katia", "leonor", "lucrecia", "marcia",
  "maricel", "marilina", "marisel", "mariangeles", "micaela", "miranda", "mora", "nahir", "natacha", "nayara", "nidia",
  "oriana", "pamela", "romina", "rosalba", "rosaura", "sheila", "sol", "solange", "tiziana", "valentina", "vilma", "xiomara",
  "yesenia", "zunilda", "luz maria", "ana maria", "maria jose", "maria laura", "maria eugenia", "maria jimena", "jimena",
];
