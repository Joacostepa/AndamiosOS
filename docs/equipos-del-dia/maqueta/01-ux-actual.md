# Relevamiento de usabilidad de la Hoja del día actual (resumen)

## Mapa mental: ~40 conceptos
- Unidad (hoja, cuadrilla-día, "Quiénes van X de Y", a cargo, recibe): conservar, es su idioma.
- Estado de envío (Borrador, Enviada, Abierta, Recibida, Cambiada después de enviar, sin avisar, foto, No hace falta avisar, Telegram/a mano): FUSIONAR en un semáforo por persona: no se mandó / lo vio / lo confirmó / hay cambios.
- Transporte (renglón, modo Lleva y trae/Todo el día/Van por su cuenta, lleva, busca en 4 variantes, mueve, vuelve al depósito + llega, carga, encuentro): FUSIONAR; casi todo se resuelve dibujando el día del camión. Hoy son 9 controles en el editor.
- Chofer (elegido, habitual, del camión del día, resuelto, puede manejar, también maneja): ESCONDER; el usuario sólo debería ver "quién maneja este tramo".
- Viajes (9 tipos, suelto, ficha, fija/estimada, Hecho/No pude/Anulado, Correr horas, Taller/VTV, flete de afuera): conservar viaje y estado; esconder el tipo; fija/estimada con un candado.
- Pedidos (5 prioridades, 4 grupos, sugerido, cajón del tablero, pasar a pedido, poner en un camión, Cerca/Libre): FUSIONAR: sugerido, cajón y pedido son "algo que hay que mover" con tres orígenes.
- Bandejas ("Falta para mandar", "Ahora:", avisos en tarjetas y filas, campanita): FUSIONAR en una sola.
- Otros (ausencias en panel aparte, instrucciones, contratistas, cerrar jornada, historial, deshacer, lista de carga): conservar; ausencias dentro del panel de gente.
Las dos fuentes principales de confusión: (1) renglón de la tarjeta ↔ ficha en Camiones = el mismo viaje editable en dos lugares con dos interfaces; (2) chofer de la cuadrilla ↔ chofer del viaje ("Conte en dos filas").

## Los 3 momentos hoy
A. Tarde anterior: "Empezar como hoy" (2 toques, bien) pero no copia viajes sueltos ni sugeridos → hay que ir a Camiones. Revisar 5 tarjetas densas sin vista de un pantallazo de "quién va con quién en qué". Asignar transporte: 6–10 toques por cuadrilla en selects nativos sin disponibilidad. Mandar: 2 toques, bien.
B. Mañana: ausencia y reemplazo ~8 toques (ok), pero hasta las 15 abre en Camiones. Si falta un chofer, la solución ("Elegir otro chofer") está en el menú de la fila de Camiones, no en la tarjeta. Cambiar camión/chofer da resultados distintos según dónde se haga. Cuadrilla extra no se puede crear desde la hoja.
C. Durante el día: poner un pedido en un camión ~6 toques con teclado (lo mejor resuelto). "Que lo lleve con la cuadrilla" sólo aparece después de un choque rojo. Sugerido aceptado queda colgado si cambia el plan → anular a mano. Seguimiento: anchos de ficha = duración típica, estado en detalles chicos; en Cuadrillas no se ve dónde está cada cuadrilla. "Sin noticias" es un mensaje de falta de dato, no de acción. Tres caminos distintos para avisar cambios.

## Top 15 problemas
1. Mismo dato editable en dos vistas con modelos y precedencias invisibles.
2. Un chofer aparece en varias filas porque las filas son por camión.
3. No hay vista única del día (persona → cuadrilla → camión → hora).
4. Editor de transporte = formulario de ~9 controles sin disponibilidad ni choques antes de elegir.
5. Los vehículos no se arrastran (el dueño espera arrastrar camiones a cuadrillas).
6. Viajes que quedan colgados cuando cambia la hoja; anular a mano.
7. Tres bandejas distintas con textos casi iguales.
8. Textos de choque larguísimos que exigen entender el modelo (26 tipos de problema).
9. El chofer habitual sigue apareciendo (primero en selects, tooltips).
10. "Modo" es abstracto (taxonomía, no gesto).
11. El seguimiento no se ve en Cuadrillas.
12. La línea de tiempo usa duraciones típicas (los anchos mienten).
13. Vista por defecto según la hora choca con el uso real de las 6:30.
14. Acciones clave escondidas en menús ⋯.
15. El depósito no existe como destino de gente: quien está en el depósito figura "Sin asignar" y genera ruido.

## Qué funciona y hay que conservar
Vocabulario ("Quiénes van 4 de 5", "a cargo", "Encuentro", "Lleva / Trae / Busca", marca + patente); "Empezar como hoy" y "la gente sigue a la obra"; arrastrar personas, soltar sobre un nombre para reemplazar, teclas 1–5; Deshacer con nombre en cada gesto y respuesta al instante; Nuevo pedido con teclado (N, tres campos); "Cerca / Libre" como sugerencia; agrupación "de quién es la pelota" (Para hacer vos / Esperando / Listas); el celular (Recibido, Hecho/No pude, sin señal, aviso de cambio con Entendido); Telegram con respaldo a mano; "Todo el día" como banda rayada sobre la fila.

## Principios para el rediseño
1. Una sola superficie: el tablero del día. Cuadrillas y Depósito como columnas/carriles; camiones como recursos que se enganchan; viajes como conectores visibles camión → cuadrilla/obra. "Armar" y "seguir" son dos zooms de lo mismo, no dos modelos.
2. El recurso es el sustantivo, arrastrar es el verbo. Camión soltado en una cuadrilla pregunta una sola cosa: "¿Se queda o los deja?" (reemplaza el "modo").
3. La persona es la fila: si Conte maneja dos camiones, UNA fila de Conte con dos tramos de color (alternar por chofer / por camión).
4. Una entidad, un lugar para editarla.
5. Cero viajes huérfanos: si cambia la hoja, se recalculan o se ofrece "¿Lo sacamos también?" en el toast.
6. Avisos como acciones: una línea, verbo + botón resuelto ("Conte no puede estar en dos camiones a las 8 → [Llevar el material en el Agrale]"); detalle en tooltip.
7. Una bandeja, igual en los tres momentos.
8. Lo sugerido nunca parece asignado: gris/fantasma con "Usar" explícito.

## Depósito como sector
Carril/tarjeta "Depósito" siempre presente, mismos gestos (arrastrar, tecla, "Pasar a…", "No viene", encargado de turno). Sale de "Sin asignar" y no dispara "falta gente". "Empezar como hoy" lo copia. Sus tareas a la vista: la lista de carga es su contenido ("7:00 cargar el Iveco AB 799 CA para la C1", "~11:15 recibir lo desarmado de Juramento"), pedidos entre depósitos y devoluciones. Su encargado recibe la hoja. Es origen y destino de conectores (los camiones que vuelven al depósito se ven llegar). Gente que cambia de sector en el día ("depósito hasta las 10, después refuerza la C3"). Llamarlo "Depósito" y su tarjeta "Quiénes están". Respuestas del dueño: el depósito hace carga y descarga y mantenimiento; su gente puede salir a reforzar una obra durante el día; NO va en el parte de Odoo.
