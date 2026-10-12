# Hoja del día: propuesta de rediseño

## La idea central

Una sola pantalla: el tablero del día. Cada cuadrilla es una tarjeta y el **Depósito es una más**. Gente y camiones son fichas que se arrastran. Lo que hoy está repartido entre "Cuadrillas" y "Camiones" queda junto, y cada cosa se cambia en un solo lugar.

Arriba se elige el **momento del día**: Armar (la noche anterior), Mañana (ausencias y cambios) o En curso (seguimiento). La información es la misma; cambia qué se destaca.

Tres reglas recorren todo:

- **Arrastrar es el verbo.** Persona a cuadrilla, camión a cuadrilla, chofer sobre camión, pedido a la fila de un camión. También se puede tocar la ficha y después el destino, o usar las teclas 1 a 5, D (depósito) y B (Banco).
- **Avisa pero no frena.** Si algo no cierra, la tarjeta se pone ámbar con una línea y un botón que lo arregla ("Nuñez no puede manejar el AB 799 CA y el AB 497 YY a la vez → Correr el material a 7:50"). Sin ventanas que corten.
- **Una sola bandeja, "Para resolver"**, igual en los tres momentos. Arriba, un resumen ("1 hueco · 2 sin chofer · 1 choque") que te lleva al problema.

## Cómo funciona cada momento

**Armar (la noche anterior).** A la izquierda, el **Banco** (disponibles, los que no vienen, contratistas) y la **Flota** (camiones y choferes, con una barrita de cuánto del día tienen ocupado). En el medio, las tarjetas: la obra del Tablero con candado y link "cambiar obra en el Tablero", el encuentro, "Quiénes van 4 de 5" con los huecos marcados, y la movilidad. "Copiar del lunes" trae gente, camiones y también los viajes sueltos. Al soltar un camión se pregunta una sola cosa: **"¿Se queda todo el día o los deja y vuelve?"**. El chofer se suelta arriba del camión. Al pasar el mouse por un camión o un chofer, una línea de color muestra a qué cuadrillas atiende (sólo cuando la pedís, para que no se arme una maraña). Todo es borrador hasta "Publicar y avisar", que muestra a quién le llega y qué cambió.

**Mañana (ausencias y cambios).** Quien no viene queda **tachado** y deja un **hueco**. Arriba del Banco aparece **"Para los huecos"** con reemplazos y el motivo ("suele ir con la 3", "del depósito, quedan 4") y un botón **Usar**. Si falta un chofer, sus camiones se ponen ámbar y se sugiere quién puede manejar. Si alguien se va a media jornada ("Sack se retira a las 14"), la tarjeta muestra "4 desde 14:00" y la bandeja ofrece quién refuerza y quién queda a cargo. **"Publicar cambios" avisa sólo a los afectados.**

**En curso (seguimiento).** Aparecen el **mapa** (obras del color de su cuadrilla, depósito y camiones en su **última noticia**: sin GPS, el camión está donde fue su último "Salí" o "Hecho", y se aclara hace cuánto), la **línea de tiempo de 7 a 18** con la línea de "ahora" (lleva y trae en tramos ida, *libre*, vuelta; todo el día como banda rayada) y la **cola de pedidos** por urgencia. Un pedido arrastrado a la fila de un camión **cae en el primer hueco libre**, y mientras lo arrastrás ves dónde. Si la cuadrilla tiene su camión todo el día, aparece "Que lo lleve la 1 en su camión". Estados siempre iguales (pendiente, asignado, salió, hecho, no se pudo, y un punto ámbar de demora) y acciones a la vista: **Hecho, Volver a la cola, Pasar a mañana, Anular**. "No se pudo" lo devuelve a la cola con el motivo. Si sacás un camión con pedidos, te pregunta qué hacer; al cierre, se ofrece pasar los pendientes a mañana. **Un pedido nunca queda colgado.**

## Por qué la banda es "por Camión" con interruptor

Los pedidos se ponen en un camión (importa si es hidrogrúa, caja larga o camioneta), así que de entrada hay una fila por camión, con color fijo. Para evitar "Conte en dos filas": cada tramo lleva la cara del chofer con **1/2 o 2/2** si maneja más de un camión; al pasar el mouse se resaltan todos sus tramos; y **Agrupar por: Chofer** deja **una fila por persona** con cada tramo del color del camión. Los estados nunca usan los colores de camión: se marcan con forma (relleno, contorno, tilde, cruz, rayado).

## El depósito

Siempre presente aunque no haya obras, con los mismos gestos (arrastrar, "no viene", "a cargo"). Su tarjeta dice "Quiénes están" y muestra **Carga y descarga**, que se arma sola con los camiones y viajes del día ("6:45 cargar el AB 799 CA para la 2", "~17:55 recibir lo desarmado de Juramento"), **Mantenimiento** para tildar y el autoelevador. **Para reforzar una obra**, arrastrás a la persona del depósito a la cuadrilla y la pantalla pregunta: "¿Refuerza desde las 11:00 o va todo el día?". Queda en el depósito con "→ 3 desde 11:00" y en la cuadrilla con borde punteado; la bandeja pregunta cómo llega ("Que lo lleve el AB 799 CA 10:25" o "Va por su cuenta"). La gente del depósito deja de figurar "sin asignar" y no entra en el parte de Odoo.

## Qué desaparece de la pantalla actual, y por qué

- **Cuadrillas y Camiones como dos mundos**: el mismo viaje se editaba en dos lugares con reglas distintas.
- **El formulario de transporte de ~9 controles**: queda soltar el camión y una pregunta.
- **"Chofer habitual" a la vista**: sólo importa quién maneja cada tramo.
- **Tres bandejas parecidas**: queda una.
- **Avisos que explicaban el modelo**: ahora son una línea con verbo y botón.
- **"Sin noticias" como alarma**: pasa a "última noticia hace X", y "demora" sólo si un viaje tenía que salir y nadie marcó nada.
- **Acciones escondidas en menús ⋯**: quedan a la vista.

## Decisiones abiertas (para vos)

1. **Encuentro del depósito**: ¿siempre 7:00, o lo marca el encargado cada día?
2. **Refuerzos**: cuando alguien del depósito sale a una obra, ¿lo lleva casi siempre un camión o va por su cuenta? Según eso, la pregunta del transporte aparece sola o queda opcional.
3. **Un chofer que cambia de camión**: ¿pasa por el depósito a cambiarlo, o el otro camión puede estar en otro lado? Esto define si avisamos "cambiás de camión: pasá por el depósito".
4. **Quién puede tocar lo que ya salió**: en En curso, ¿lo hecho y lo que está en viaje queda bloqueado salvo que toques "Editar"?
5. **Publicar**: a la noche, ¿mandás todo de una vez (como en la maqueta) o preferís mandar cuadrilla por cuadrilla?
6. **Pantalla por defecto a las 6:30**: ¿abre en Mañana, o siempre donde la dejaste?

## Cómo se implementaría

Se reusa casi todo: hojas, integrantes (una persona en un solo lugar), renglones de vehículo (todo el día / lleva y trae), viajes con estados y chofer por viaje, pedidos, ausencias (también parciales y de Odoo), envíos con la foto de lo mandado, Telegram, historial con Deshacer y el celular. Las reglas de avisos ya existen: hay que juntarlas (las 7 claves de "mismo chofer o camión en dos lugares" pasan a una) y escribir cada aviso como acción. Lo nuevo:

una **hoja de sector "Depósito"** (no es cuadrilla de Odoo: siempre presente, sin parte, con encargado y lista de carga), el **refuerzo con hora** como segunda ubicación con horario, **gestos optimistas** (cada arrastre se ve al instante y se confirma contra la base, que tarda ~280 ms, con "cambió, refrescá" si otro editó), la **banda horaria propia** con **conectores SVG** como resaltado, y el arrastre con **dnd-kit** (también con teclado). Las obras siguen siendo del Tablero.
