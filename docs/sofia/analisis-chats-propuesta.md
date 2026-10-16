# Propuesta de cambios para Sofía, a partir de unas 3.000 charlas de WhatsApp de ABA

*Para que la apruebe JS. La base es la síntesis de 28 lotes de charlas anonimizadas, de abril de 2025 a octubre de 2026, y la configuración vigente en `main`. Leí `docs/sofia/handoff.md`, la §12 de `crm-propuesta.md`, `prompt.ts`, `herramientas.ts`, `facil.ts`, `texto.ts`, `saludo.ts`, `horario.ts`, `vista.ts`, `turno.ts` y las migraciones `20261019000001` y `20261019000002`. No toqué nada del repo. No hay precios ni montos en este documento.*

*Una aclaración que vale para todo el documento. Muchos hallazgos describen lo que pasa hoy en el **número viejo** (11 2734 4214): el saludo automático que se repite, el menú, el bucle con un bot y los clientes con obra en curso. El número de Sofía es otro y al principio se publica sólo en la web. Por eso, al principio, algunos casos (obra en curso, CV, bots) le van a llegar a Sofía menos de lo que indican los chats. Los cambios igual conviene hacerlos, porque son baratos y esos casos van a llegar cuando el número se difunda.*

*Los parámetros `clientes_datos_empresa` y `clientes_guia_trabajos` se editan en Parámetros. Las migraciones usan `ON CONFLICT DO NOTHING`, así que los cambios de las secciones B y C se cargan desde la app y no con una migración.*

---

## Respuestas de JS (16/10) y qué se aplicó

Respuestas a la §4:
1. **Pago:** no se acepta efectivo. Se hace factura B.
2. **Venta:** sí, se vende multidireccional nuevo.
3. **Período mínimo:** Sofía dice que existe, sin decir cuál.
4. **Zona del alquiler simple:** fuera de CABA se retira en el depósito; la entrega depende del tamaño del pedido (si es grande, sí).
5. **Visita técnica:** no tiene costo.
6. **Garantía del alquiler simple:** dos servicios a nombre de la persona y el DNI.
7. **Alquiler simple:** sigue habiendo, y los pedidos los toma Sofía.
8. **Bandeja y tiempo de obra:** sí, Sofía lo pregunta, y una duración («2 meses») no cuenta como fecha.
9. **D1:** sí, «pintar» y «silleta» dejan de sacar la bandeja de fácil.
10. **Gama alta:** suma todo (Layher, instituciones, industria y licitaciones).
11. **Servicios:** se ofrece todo (escaleras, capacitación, apuntalamiento y eventos).
12. **Búsquedas laborales:** por ahora, «le paso tu mensaje al responsable de personal». Más adelante: que Sofía junte los datos y los mande ordenados por Slack.
13. **Estafas:** se avisa a una persona sólo cuando ya pagó.
14. **Validez del presupuesto:** Sofía no la dice.
15. **Lo que ABA no hace** (C2): confirmado tal cual.

Aplicado en la rama `feat/sofia-analisis-chats`: A1 a A14 en `prompt.ts`, D1, D3 (sin la bandera `urgente`), D5 y D6 en el código, y B1 y C1/C2 en la migración `20261020000001` (los textos de Parámetros). Quedan para después: D4 (campos nuevos en la ficha), D7 (cliente que vuelve, depende del paso 2b), D8 (aviso de 24 a 48 h sin respuesta) y la bandera `urgente`.

---

## 1. Resumen en 10 líneas

1. Se analizaron unas 3.000 charlas de clientes. En el 62% no se sabe cómo terminaron (1.873). Del resto (1.146): avanzó o cerró el 24% (272), se perdió el 39% (444) y el cliente dejó de contestar el 38% (430).
2. Los pedidos se reparten así: alquiler simple sin montaje, alrededor de 1.000 (un tercio); bandeja o protección peatonal, unos 550; interior, industria o estructura especial, unos 400; fachada o medianera, unas 360; eventos, unos 230; fuera de rubro o compra, unos 240; sin dato del trabajo, unos 140.
3. La causa de pérdida que más se podría evitar es **la demora de ABA**: aparece en 18 lotes y más de 130 chats. Lo que más declaran los clientes es el precio (25 lotes, más de 120 chats), y casi nunca se revierte una vez que el cliente decidió.
4. **El formulario de alta mandado al principio es donde más se corta la charla** (26 lotes, más de 200 chats). Cuando se pregunta primero por el trabajo, el cliente sigue más.
5. **En el alquiler simple, la plantilla «te va a contactar ventas» o la del 0810 suele ser el último mensaje de ABA**, aunque el cliente ya haya dado cuerpos, días y zona (unos 145 chats).
6. **Escriben muchos que no son clientes** (más de 150 chats: CV, proveedores, bots, spam, estafas) y **clientes con obra en curso** (más de 100). Hoy todos reciben el saludo de venta.
7. Las estafas que usan el nombre de ABA (hormigoneras y andamios falsos) suman unos 90 chats, concentrados en 2026.
8. Lo que más falta en el relevamiento: la dirección exacta, la altura en metros, el tiempo de obra, quién arma y si trabajan con silleteros. Las preguntas que más se repiten son por el permiso de vereda, el período mínimo, la forma de pago y el IVA.
9. El cliente de **gama alta e institucional** (hoteles, hospitales, shoppings, bancos, patrimonio, plantas con orden de compra) está entre los que más cierran. Hoy el código lo detecta sólo por la palabra «multidireccional».
10. Muchas cosas de Sofía ya están bien encaminadas: no da precios, saluda una sola vez, no usa menú, trata de vos, pregunta primero el trabajo y no promete plazos. La mayoría de los cambios **agregan casos y textos**, no cambian el enfoque.

---

## 2. Cambios propuestos

### (a) Instrucciones de Sofía (`prompt.ts`)

**A1. Agregar a «Qué hace ABA» los servicios que faltan y una lista de lo que ABA no hace, cada cosa con una salida.** Prioridad **alta**.
- **Qué cambia:**
  - Hoy la lista tiene bandeja, fachada, alquiler sin montaje y gestión del permiso. Faltan torres y plataformas para interiores e industria, eventos (escenarios, tarimas, gradas), torres de apuntalamiento y multidireccional. **A CONFIRMAR POR JS**, porque el prompt dice «no inventes servicios».
  - La lista de lo que no hace iría en los datos de ABA (C2): balancín y colgante eléctrico, silleta, montacargas, tubos de escombro, truss, hormigoneras y herramientas.
  - Regla nueva: cuando dice que no, Sofía pregunta enseguida qué trabajo tiene que hacer («No trabajamos balancines, ¿qué trabajo tenés que hacer?»), porque a veces se resuelve con estructura tubular. No promete esa alternativa: junta el trabajo y, si puede servir una estructura tubular, lo pasa con `pedir_tecnico`.
- **Por qué:** los pedidos fuera de rubro aparecen en unos 14 lotes y más de 90 chats. El «no» seco corta la charla. Cuando ABA ofreció una alternativa, la charla siguió (C1139, C0663, C0410, C3570, C3803). Eventos e interiores juntos son más del 20% de los pedidos y el prompt no los nombra.

**A2. Clasificar el mensaje antes de abrir un relevamiento.** Prioridad **alta**.
- **Qué cambia:** una sección nueva, «Si no es un pedido nuevo», con estos casos:
  1. **Obra en curso**: «tengo alquilado», «el retiro», «el desarme», «la renovación», «hasta qué fecha». Sofía no hace el relevamiento ni cotiza. Pregunta la dirección de la obra y qué necesita, y deriva con el motivo nuevo `obra_en_curso` (ver D3). Si lo que cuenta es un problema con la estructura armada, se aplica `seguridad_obra`, que tiene prioridad.
  2. **Cobranza, factura o pagos de una obra ya hecha**: motivo nuevo `administracion`. Sofía no habla de importes ni de deudas.
  3. **Busca trabajo**: texto fijo (ver C2) y `fuera_de_tema`.
  4. **Proveedores y publicidad**: `fuera_de_tema` con un resumen de una línea, sin el saludo de venta.
  5. **Mensajes personales para Joaquín**: `fuera_de_tema` con el resumen «mensaje personal», sin copiar ni resumir lo que dice.
  6. **Spam, contestador automático o bot**: `[nada]`. No se contesta, para no entrar en un ida y vuelta (ver D5).
  7. **Estafa**: texto fijo y el motivo según el caso (ver A3).
- **Por qué:** hay unos 28 hallazgos con más de 150 chats de quienes no son clientes, y unos 22 con más de 100 de obras en curso que hoy reciben el saludo comercial (C0099, C2777, C3073, C0248, C1038, C1897, C2945, C3204). En un lote, un bot quedó en bucle durante un año (C0960–C1129). La síntesis de derivación pide no tocar ni resumir lo personal.

**A3. Respuesta fija ante una estafa.** Prioridad **alta**.
- **Qué cambia:** si preguntan por una hormigonera, un trompito, un combo o andamios en venta con anticipo, o si «es real este número», Sofía contesta una variante de este texto: «Esa publicación no es de ABA. Nosotros no vendemos hormigoneras ni pedimos adelantos por publicaciones en redes. Es una estafa: no pagues y denunciá la publicación.» Sin insultos.
  - El texto no dice «no vendemos andamios», porque la venta todavía no está definida (C2).
  - Habla de la publicación y nunca acusa a quien escribe.
  - Si la persona dice que **ya pagó**, deriva con el motivo nuevo `estafa_pago` (D3). Mientras no exista, usa `enojo_reclamo`.
  - El código ya marca «estaf…» como enojo, así que el pedido no sale fácil, y está bien. El cambio es que Sofía tenga el texto y no improvise.
- **Por qué:** 9 hallazgos y más de 90 chats, muy frecuente en 2026 (C2957, C2981, C3019, C2574, C3391, C3789). Una vez ABA trató de estafa una consulta que era legítima.

**A4. Separar «seguridad en una obra de ABA» de «se cae algo de mi edificio».** Prioridad **alta**.
- **Qué cambia:** hoy `seguridad_obra` se dispara ante «se cayó algo, peligro», y el texto fijo manda llamar al teléfono de guardia, que es el de JS. Pero muchos pedidos de bandeja nacen justamente de un desprendimiento: «se está cayendo revoque de un balcón». Propongo esta aclaración:
  - `seguridad_obra` **sólo** cuando el problema es con una estructura **ya armada por ABA** («el andamio que nos pusieron», «la bandeja de ustedes») o si hay alguien herido.
  - Si el problema es del edificio y todavía no hay nada de ABA armado, Sofía **no sigue el relevamiento completo**. Pide sólo la dirección de la obra (y los metros de frente, si el cliente los sabe), no opina sobre riesgos ni responsabilidades y deriva enseguida con el motivo nuevo `desprendimiento` (D3). Ese motivo es urgente y avisa al equipo, pero sin el texto de guardia.
- **Por qué:** la síntesis de derivación pide escalar en el momento ante «desprendimiento» o «se está cayendo», sin seguir el relevamiento. En unos 45 chats, en los grupos de bandeja que lo nombran, el pedido nace de un desprendimiento (C0418, C1354, C3356). Mandarle el texto de guardia a un consorcio que pide presupuesto asusta y le llena el teléfono a JS.

**A5. Alquiler simple: confirmar que no hay montaje ni fachada, y cerrar con un acuse claro.** Prioridad **alta**.
- **Qué cambia:**
  - **Antes** de `preparar_pedido_simple`, una pregunta: «¿Lo arman ustedes, o necesitás que lo armemos?». Si menciona fachada, vereda o protección, va por el camino de bandeja o fachada.
  - Sumar a lo que junta: para qué lo usa y a qué altura trabaja (va en `notas`).
  - **Cierre:** que le diga en una línea lo que anotó y que el presupuesto le llega **por este mismo chat**, sin mandarlo a otro número.
  - Nunca la plantilla genérica de «ventas se va a comunicar».
- **Por qué:**
  - Unos 145 chats terminan en la plantilla de ventas o en la del 0810 («Hola no se contactaron», «que hago? pido ppto ahi?»: C1040, C1349, C1557, C1842, C3575, C3793).
  - Hubo pedidos con fachada o montaje mal mandados a Alquileres (C2217, C2215, C2169).
  - «¿Lo armarías vos?» es una de las dos preguntas que definen el camino (22 lotes, unos 120 chats).
- **Depende de** la pregunta 7: quién toma hoy el pedido simple.

**A6. Guardar el formulario de alta para el final, y hacerlo de vos y flexible.** Prioridad **alta**. Ya va en esa dirección; esto lo deja escrito.
- **Qué cambia:**
  - Regla explícita: «Nunca pidas razón social, CUIT, mail ni domicilio antes de entender el trabajo y la obra».
  - A un particular: «no hace falta razón social, alcanza con tu nombre».
  - El CUIT, sólo si es empresa o hace falta para facturar (ya está en el prompt).
  - Si el cliente ya mandó un dato, no se lo vuelve a pedir: está en el aviso de la ficha.
- **Por qué:** es el hallazgo más repetido (26 lotes, más de 200 chats): «son necesarios tantos datos? solo quiero un presupuesto». Preguntar primero por el trabajo retiene mejor (C0772, C0812, C2394, C2469, C1434).

**A7. Ante «¿cuánto sale?», explicar de qué depende el precio y pedir lo que falta.** Prioridad **media**.
- **Qué cambia:** hoy dice «el presupuesto lo prepara el equipo». Propongo: «El valor depende de las medidas, el tiempo y si lo armamos nosotros. Con [lo que falta] te lo preparan y te llega por acá». Sin cifras, sin aproximados y sin rangos.
  - Si el cliente habla de **pocos días o de un evento de un día**, avisar sin cifras: «hay un período mínimo de alquiler, así que conviene que me digas el tiempo real». Esto queda **sujeto a que JS confirme C2 y la pregunta 3**.
- **Por qué:**
  - Pedir un «aproximado» antes de dar datos aparece en 5 lotes y más de 30 chats (C0303, C0380, C3788, C3939).
  - El mínimo sorprende al que necesita pocos días: «2 dias sale casi lo mismo que 15 dias?», unos 20 lotes y más de 80 chats (C0800, C0892, C2287, C3299, C3808).

**A8. Desambiguar altura, dirección y vocabulario.** Prioridad **media**. Va en la guía (B1), con una línea en el prompt que la mande a usar.
- **Por qué:**
  - Dirección: unos 60 chats y 16 lotes, con ABA repreguntando hasta 3 veces (C0285, C1201, C2946).
  - Altura: «10m altura final o 10m pie de operario?» (15 lotes; C0780, C1067, C2069, C2376).

**A9. Antes de pasar un trabajo no fácil, cerrar con un resumen escrito que el cliente confirme.** Prioridad **media**.
- **Qué cambia:** antes de `pedir_tecnico` en fachada, interior, industria o eventos, Sofía manda 3 a 5 renglones (tarea, dirección, medidas o altura, tiempo de obra, quién arma y si trabajan con silleteros) y pregunta «¿está bien así?». Lo mismo va en el `resumen` de la herramienta, que admite 600 caracteres.
- **Por qué:** lo hablado por llamada o audio se pierde (9 lotes, unos 50 chats). El resumen que queda escrito después de una llamada es justo la ficha que necesita el técnico (C1028, C2042, C2361, C3401). Los conflictos después de la propuesta vienen de medidas que no quedaron escritas.

**A10. Si el cliente pide una llamada, ofrecer seguir por escrito y anotar el horario.** Prioridad **media**.
- **Qué cambia:** hoy pasa directo a `pide_persona`. Propongo que Sofía diga «Dale, se lo paso al equipo. Si querés, mientras tanto contame acá lo básico así ya lo tienen. ¿En qué horario te queda cómodo que te llamen?», que anote el horario en el resumen y que derive igual. No promete quién llama ni cuándo, y no insiste si el cliente no quiere escribir.
- **Por qué:** muchos clientes de obra no pueden hablar y prefieren todo por escrito (C1559, C1594, C1596). Además, lo que se habla por llamada no queda escrito (tono 1.6: 11 lotes, unos 95 chats).

**A11. Señales de cierre: derivar en el momento.** Prioridad **alta**.
- **Qué cambia:** después de mandada una propuesta, si el cliente escribe «avanzamos», «aprobado», «¿cómo seguimos?», «¿cuándo lo pueden instalar?» o «reservame la fecha», o si avisa que manda el comprobante o la orden de compra, o si pide la factura del anticipo o los datos para pagar, Sofía deriva con el motivo nuevo `quiere_avanzar` (D3).
  - Contesta «Buenísimo, ya le aviso al equipo para seguir».
  - No escribe nada de pago ni de fechas.
  - Los comprobantes que llegan como foto o PDF no los ve: alcanza con lo que el cliente escribe alrededor.
- **Por qué:** 26 lotes y más de 150 chats muestran las mismas señales (C0630, C2347, C3562, C3814). Hoy caerían en `pregunta_presupuesto` o `regateo_o_pago`, que no tienen prioridad.
- **Ojo:** «echeq», «efectivo» y «cheque» están en la lista `descuento` de `facil.ts`. Un «¿aceptan echeq?» de quien quiere cerrar hoy queda marcado como regateo. Para la tarjeta no cambia nada, pero conviene que la persona lo sepa.

**A12. Objeción de precio: pedir el otro presupuesto y derivar antes de que el cliente decida.** Prioridad **media**.
- **Qué cambia:** dentro de `regateo_o_pago`, Sofía puede agregar «Si tenés otro presupuesto, mandámelo y lo ve el equipo». No compara, no dice qué incluye o deja de incluir el otro, no promete igualar y no menciona promociones.
- **Por qué:** lo que rescató ventas fue mostrar qué incluye ABA y **negociar antes de que el cliente decida** (C0418, C2172, C3400, C3694). Cuando la rebaja llega después del «no», no sirve (C0683, C2525, C2803). Esa explicación la da una persona, no Sofía.

**A13. Detalles de texto.** Prioridad **baja**.
- **Consorcio:** preguntar una vez si hay asamblea o reunión del consejo y para cuándo, y si lo decide la administración. Va en `descripcion_obra` hasta que exista el campo D4 (unos 20 lotes; C1393, C2568, C3101, C3386).
- **Licitación:** preguntar «¿ya tienen la obra o la están cotizando? ¿Es una licitación?» y anotar la fecha de entrega (unos 12 lotes; C2958, C3279, C3561, C3787).
- **Leads de la landing** que llegan con «Estaba viendo este link… necesito más información»: tratarlos como un «hola» y preguntar el trabajo (6 lotes, unos 35 chats; C0736, C0739, C3495).

**A14. Sacar «en un rato» del cierre cuando algo queda pendiente.** Prioridad **alta**. *(Nuevo, agregado en la revisión.)*
- **Qué cambia:** hoy el prompt da como ejemplo «Ya tengo todo, te lo confirmo en un rato con el presupuesto». «En un rato» es un plazo. Propongo cambiarlo por «Ya tengo todo. El presupuesto lo prepara el equipo y te llega por este mismo chat».
- **Por qué:** la demora es la causa de pérdida evitable más fuerte (18 lotes, más de 130 chats), y las promesas que no se cumplen aparecen en unos 18 hallazgos con más de 100 chats («Todavía no me contactó ningún técnico»). La regla de JS es no dar plazos.

### (b) Guía de trabajos (parámetro `clientes_guia_trabajos`)

**B1. Propuesta de texto nuevo.** Prioridad **alta**. Reemplaza al actual: conserva sus 6 líneas y suma las que salen de los chats. Una línea por caso, como pide el parámetro:

```
- Siempre, antes que nada, preguntá qué trabajo va a hacer y dónde. Nunca decidas el tipo de andamio sin saber el trabajo. El alta (a nombre de quién, CUIT) va al final.
- Si el cliente ya contó algo (en el primer mensaje o en el texto de la web), no lo vuelvas a preguntar: confirmalo y seguí con lo que falta.
- Dirección: pedí calle y altura de la OBRA (no la de su casa u oficina) y explicá para qué: «para ver el frente y calcular el traslado». Si es esquina, preguntá por qué calle o por las dos. Si da sólo el barrio, repreguntá una vez.
- Altura: pedila en metros. Si dice pisos o «cuerpos», aceptalo y anotalo así. Preguntá si es la altura de la plataforma o hasta dónde tiene que llegar con las manos.
- Fotos: pedí una o dos fotos del lugar (del frente, o del interior si es adentro). Si es raro, que marque las medidas sobre la foto o mande un croquis a mano. Si tiene planos, mejor en CAD con vistas y cortes.
- Palabras del cliente: «defensa», «pantalla», «caja» o «protección» casi siempre es bandeja; «piso falso» es una plataforma; «andamio de pasillo» es el módulo angosto; «cuerpo» es un módulo. Si no estás segura, preguntá «¿a qué le llamás…?» o pedí una foto de referencia.
- Obra que da a la vereda en CABA (construcción, demolición, refacción de fachada): la Ciudad pide bandeja de protección peatonal. Preguntá los metros de frente y si trabajan sólo desde la vereda o también en altura.
- Bandeja: la pregunta que decide es «¿van a trabajar con silleteros o necesitan andamio para el frente?». Con silleteros, puede alcanzar con la bandeja. Preguntá si hay cocheras, portones o marquesinas que haya que dejar libres.
- Si escriben porque se desprende revoque o un balcón y todavía no hay nada de ABA armado: pedí sólo la dirección de la obra y pasalo enseguida a una persona como urgente. No opines sobre el riesgo ni sobre quién es responsable.
- Trabajo sobre la fachada en altura (pintar, revocar, impermeabilizar, reparar balcones o cornisas, cambiar ventanas, revestimiento): estructura de fachada, casi siempre con bandeja abajo. Preguntá ancho y alto en metros (o pisos), si trabajan toda la fachada a la vez o por etapas, el tiempo de obra y si trabajan con silleteros.
- Medianera: preguntá si tienen planos, porque la altura no se mide desde abajo. Si es apuntalamiento, una medianera agrietada o una excavación al lado, juntá fotos y pasalo a una persona.
- Trabajo puntual en altura (un techo, una pared interior, un cartel, luces, un galpón): torre móvil o alquiler de material sin armado. Preguntá la altura de trabajo, si es adentro o afuera, si el piso es parejo y quién lo arma. Para casas, sólo en CABA.
- Alquiler sin armado: qué piezas y cuántas, por cuántos días, para qué, si lo retira o se lo llevamos y a qué barrio. Preguntá si lo arman ellos. Si menciona fachada, vereda o protección, no es alquiler simple.
- Tiempo de obra (en fachada, alquiler, eventos e interiores): preguntá cuánto tiempo calculan. Si no saben, anotá «no sabe» y seguí: no frena el pedido.
- Eventos (escenario, tarima, gradas, stand, escenografía): fecha y lugar del evento, día y horario de armado y de desarme (a veces es de noche), medidas y altura, cuánta gente sube a la vez y qué hace, si es adentro o afuera y si llega un camión. Después pasalo a una persona.
- Interiores, industria y plantas: largo, ancho y alto, niveles de trabajo, metros de acarreo desde donde descarga el camión, si hay ascensor o montacargas, horarios y requisitos para entrar (seguridad e higiene, inducción, seguros, memoria de cálculo). Juntá lo básico y pasalo a una persona.
- Licitaciones, pliegos y obras por etapas: no contestes punto por punto. Preguntá si ya tienen la obra o la están cotizando, la fecha de entrega de la oferta, a quién va la propuesta y qué documentación piden. Después pasalo a una persona.
- Consorcios: preguntá si lo decide la administración o una asamblea, y para cuándo. Pedí el mail de la administración si lo quieren por mail.
- Si no entendés qué trabajo es, preguntá con palabras simples («¿qué van a hacer: pintar, arreglar algo, construir?»).
```

- **Respaldo de cada línea**, en la sección «Relevamiento» de la síntesis:
  - 1.2 (unos 120 chats);
  - 1.3 (unos 150);
  - 1.4 (unos 60);
  - 1.5 (15 lotes);
  - 1.6, con un checklist por tipo de trabajo que aportan todos los lotes;
  - 1.10 (2 lotes, 13 chats de vocabulario).
- **El tiempo de obra no se pregunta en bandeja** hasta que JS conteste la pregunta 8. En `facil.ts`, «plazo», «fecha» y cualquier día de la semana marcan `fecha` y sacan la bandeja de fácil.
- **Ojo con la línea de silleteros:** sin el cambio D1, un cliente que escribe «pintar» o «silleta» nunca sale fácil. Ver D1.

### (c) Datos de ABA (parámetro `clientes_datos_empresa`)

**C1. Corregir o confirmar lo que hoy dice.** Prioridad **alta**. Todo **A CONFIRMAR POR JS** antes de cargarlo.
- **Formas de pago.** Hoy dice «transferencia bancaria o efectivo». En los chats aparecen **transferencia y echeq, sin tarjeta ni link de pago**. El efectivo aparece casi siempre unido al pedido de «sin IVA», que Sofía tiene que derivar. ¿Se acepta efectivo? ¿Se nombra el echeq? (Unos 20 lotes, más de 90 chats: C0029, C0201, C1919, C3196, C3828.)
- **Zona.** Hoy dice «obras grandes en todo el país; alquiler simple sólo en CABA». Los chats coinciden en lo básico pero son inconsistentes: se rechazan alquileres chicos en el GBA cercano y se aceptan obras en Pilar, Campana o La Plata (C1880, C3852, C3267, C2914). Propongo sumar: «En alquiler simple fuera de CABA se puede retirar en el depósito». Sofía nunca rechaza por zona: anota la localidad y deriva.
- **Seguros.** Hoy dice «sí, trabajamos con seguro». Propongo: «El personal tiene ART y hay seguro de responsabilidad civil. El seguro cubre lo que pase con el andamio, no con la obra. Pedidos como cláusula de no repetición o alta en plataformas de ingreso: se toman y los gestiona el equipo». (Unos 15 lotes, más de 60 chats: C3214, C3658, C2093.)
- **Permisos.** Hoy dice «sí, gestionamos los permisos municipales». Propongo sumar:
  - «La gestión del permiso de vereda es un opcional del presupuesto.»
  - «El aviso de obra es otro trámite y lo hace el cliente.»
  - «Si el andamio no ocupa la vereda, no hace falta permiso.»
  - Que en Provincia no se pide permiso de andamio.
  
  Sigue sin decir plazos. Es la consulta más repetida: 25 lotes y más de 90 chats («Eso es el aviso de obra no el permiso del andamio»: C2532, C3265, C3407, C3596, C3823).
- **Facturación.** Hoy dice «hacemos factura A». ¿A consumidor final o a un consorcio se le hace factura B? Los particulares preguntan seguido. Sofía sigue sin hablar de IVA.

**C2. Datos que faltan.** Uno por línea, todos **A CONFIRMAR POR JS**:
- **Lo que no hacemos:** balancín y colgante eléctrico, silleta, montacargas, guinche, tubos de escombro, truss, hormigoneras, herramientas. **Escaleras:** hay chats en que se alquilan y chats en que no (C1232, C1682).
- **Venta de andamios:** en 2025 se cotizó; en 2026 se negó y también se ofreció multidireccional nuevo o reacondicionado (C0023, C0521, C3292, C3300, C3803). Hasta que JS lo defina, la regla para Sofía es «lo consulto con el equipo» y derivar.
- **Período mínimo:** «Hay un período mínimo de alquiler; el detalle va en el presupuesto». Sin número. Los chats dan cifras distintas según el caso.
- **Quién arma:** «En obras con montaje arma y desarma personal de ABA, con ART y seguro. En alquiler simple arma el cliente, salvo que contrate el montaje».
- **Logística del alquiler simple:**
  - el cliente pone gente para descargar;
  - para retirar en el depósito: nombre, DNI y patente;
  - las entregas son en franjas de mañana o de tarde, y no hay entregas los domingos. Sofía lo dice como dato y nunca como promesa de un día o de una hora.
  
  Respaldo: C0108, C0125, C0247, C1543, C2212.
- **Garantía del alquiler simple:** existe y sólo se usa ante robo, rotura o pérdida. ¿Qué se pide? Avisarlo antes evita sustos (C0196, C1162, C1949, C2315, C2403, C0133).
- **Medidas fijas que Sofía puede dar sin calcular:** alto y base del módulo, anchos disponibles, tipo de escalera. JS tiene que pasar los valores exactos. Sofía no calcula configuraciones (C0108, C0125).
- **Visita técnica:** ¿tiene costo? Los chats se contradicen: «sin costo» (C0267, C0383) y «se descuenta si se aprueba» (C3622, C3647). Hasta definirlo, Sofía no habla del costo.
- **Memoria de cálculo e ingeniería:** se cotizan aparte. Es una pregunta para JS, no un dato para Sofía: ¿es obligatoria por encima de cierta altura? Los chats dicen 6 m. Sofía no opina sobre cuándo hace falta.
- **Estafas:** el texto fijo de A3. Sólo hace falta confirmar la redacción.
- **Búsquedas laborales:** hoy hay tres destinos (un mail, el jefe de personal y la web: C0099, C2777, C0632). Como Sofía no escribe mails, teléfonos ni links, el texto podría ser «Gracias. Le paso tu mensaje al responsable de personal».

**C3. Que no entre en los datos de ABA**, porque son decisiones comerciales o plazos y se derivan: financiación a consorcios, pago sin IVA o en efectivo, porcentaje de anticipo, precio por m², plazos de armado, plazo del permiso, la anticipación con que se toma un pedido de alquiler simple (los chats dicen 24 h) y la validez del presupuesto. Coincide con la decisión de JS de que Sofía no da plazos.

### (d) Reglas de código

**D1. `facil.ts` / `PALABRAS` → `otro_trabajo`: no descartar las bandejas para silleteros.** Prioridad **alta** (decide JS).
- **Qué pasa hoy:** `otro_trabajo` incluye `pint[aou]…`, `silleta` y `andami…`. Un cliente que escribe «bandeja para pintar el frente con silleta», o «sólo la bandeja, no necesito andamio», **nunca sale fácil**, aunque sea exactamente una bandeja sola.
  - Lo verifiqué en `texto.ts`: `patronPalabra` busca la palabra entera, así que «silleteros» hoy **no** salta. Sí saltan «silleta», «pintar» y «andamio».
- **Propuesta:** sacar `silleta` y `pint…` de `otro_trabajo`. El chequeo que importa sigue en pie: `necesitaAndamio === false` es obligatorio para que sea fácil (`facil.ts`, línea 347).
  - El costo: con este cambio, el único resguardo contra un «pintar desde un andamio» pasa a ser que la IA anote bien `necesita_andamio`. En la etapa 1 aprueba JS cada cotización, así que el riesgo es bajo.
  - «andami…» no se toca: es la defensa principal.
- **Evidencia:** los grupos de bandeja «con silleta o silleteros» suman unos 180 chats (por ejemplo, 26 y 24 en dos lotes y 40 en el último). No se sabe cuántos cumplen además con lo fácil (CABA, hasta 25 m.l., sin esquina).

**D2. `facil.ts` → `seguridad`: palabras de desprendimiento en clientes nuevos.** Prioridad **media**.
- Hoy «riesgo», «caída», «se cae» y «se está cayendo» marcan seguridad y sacan el pedido de fácil. Para un cliente nuevo está bien que lo vea una persona, porque es urgente. Lo que cambia es el prompt (A4) y el motivo (D3), para que Sofía no mande el texto de guardia.
- **Opcional:** que la tarjeta muestre «Urgente: desprendimiento» en vez de «Seguridad en obra» cuando la charla no tiene una obra de ABA. Requiere saber si es cliente, y eso depende del paso 2b.

**D3. Motivos nuevos en `MOTIVOS_DERIVACION`** (`herramientas.ts`). Prioridad **alta**.

| Motivo | Etiqueta | Para qué |
|---|---|---|
| `desprendimiento` | «Urgente · se desprende algo del edificio» | A4. Sale con `urgente: true` (avisa por `avisarUrgente`) y `textoFijo: null`, sin el texto de guardia |
| `quiere_avanzar` | «Quiere avanzar · prioridad» | A11. Para que vaya arriba hay que sumarlo a la prioridad de `vista.ts`, que hoy ordena sólo por `segmento` |
| `obra_en_curso` | «Obra en curso (retiro, desarme, renovación, material)» | A2. Que vaya a operaciones o al técnico de esa obra |
| `administracion` | «Facturas, pagos o cobranzas» | A2. Lo asigna el servidor, no Sofía |
| `estafa_pago` | «Víctima de estafa que ya pagó» | A3 |

Además, una bandera `urgente` en `BANDERAS` (`herramientas.ts`) y en `BanderaIA` (`facil.ts`) para los pedidos «para hoy» o «para mañana». Como toda bandera de la IA, sólo baja a no fácil (objeciones 1.8: 5 lotes, más de 20 chats; C0488, C2530, C3663).

**D4. Campos nuevos en la ficha** (`esquemaFicha`, `FichaSofia`, `resumenFicha`). Prioridad **media**.
- `altura_m`: la altura en metros, aparte de los pisos.
- `plazo`: el tiempo de obra, en texto («2 meses», «no sabe»).
- `quien_arma`: `cliente` o `aba`.
- `silleteros`: booleano.
- `etapa_decision`: `tiene_la_obra`, `cotizando` o `licitacion`, más una fecha en texto.
- `quien_decide`: administración, asamblea, comitente o compras.
- `origen`: cómo nos conoció. Se pregunta una vez, al final, y es opcional.
- `ya_es_cliente`: lo que dijo el cliente, no lo que sabe Odoo.

Hoy todo eso termina en `descripcion_obra` (400 caracteres) o se pierde. La tarjeta del técnico lo necesita, y también la etiqueta de tipo de cliente y origen que pide Agustina (clientes 3.3: C0062, C2533, C1990).

**D5. No saludar ni contestar a contestadores automáticos.** Prioridad **media**.
- Un detector puro, al estilo de `esSoloSaludo`, para mensajes como «Gracias por comunicarte con…», «En este momento no estamos disponibles», «Este es un mensaje automático» o «Nuestro horario de atención es…».
  - Si el **primer** mensaje es así, no se manda el saludo (cambia el flujo que hoy manda el saludo del código).
  - Si llega en medio de una charla, `[nada]`.
- **Evidencia:** el bucle de un año con un bot (C0960–C1129), contestadores de consorcios y empresas (clientes 1.3) y saludos duplicados (C3105, C3562).

**D6. `PALABRAS_GAMA_ALTA`: candidatas para que decida JS.** Prioridad **media**. No se suma nada hasta que JS lo apruebe, como dice el handoff.
- **La candidata más clara:** `layher`, una marca de sistema, que es lo que JS pidió.
- **Para que JS decida si son gama alta o un segmento aparte (`corporativo`):**
  - edificios e instituciones: «hotel», «hospital», «sanatorio», «clínica», «shopping», «sucursal bancaria», «patrimonio», «edificio histórico», «catedral», «embajada»;
  - industria: «planta industrial», «refinería»;
  - documentación: «cláusula de no repetición», «alta de proveedor», «orden de compra»;
  - licitaciones: «licitación», «pliego».
- **Evidencia:** la gama alta e institucional está entre lo que más cierra (unos 7 lotes; C0088, C0559, C0762, C2173, C3512), igual que las plantas con orden de compra (C3580, C3615). Las licitaciones casi no cierran (C2899, C3279): por eso conviene separarlas de la gama alta.
- **Ojo:**
  - La gama alta bloquea `preparar_cotizacion_facil`. Palabras comunes en pedidos normales, como «memoria de cálculo» o «seguridad e higiene», sacarían de fácil bandejas que hoy salen. Por eso no las incluyo.
  - «banco» suelto choca con «banco de trabajo»; mejor «sucursal bancaria».
  - «iglesia» ya está en la lista `EMPRESA` de `saludo.ts`. Ahí está bien: sólo evita saludar por nombre.

**D7. Detectar al cliente que vuelve.** Prioridad **media**. Depende del paso 2b.
- Mientras tanto, frases como «ya soy cliente», «ya trabajé con ustedes» o «como siempre» suman una alerta, y el prompt indica no pedir el alta y derivar a una persona. «Otra obra» queda afuera porque es demasiado común.
- **Evidencia:** 9 lotes (C0328, C0780, C1597, C1684, C2343: «Ya debería estar en alta como cliente»).

**D8. Aviso al equipo si un pedido pendiente pasa 24 a 48 h sin respuesta.** Prioridad **media**, para el paso 6 o el 8.
- **Por qué:** la demora es la causa de pérdida que más se podría evitar (18 lotes, más de 130 chats). Hubo un caso que cerró con otro proveedor en 3 horas. Sofía ya no promete horarios. Falta que **alguien** controle que la persona conteste.

### (e) Para discutir (con poca evidencia)

- **Recomendados:** si viene recomendado, preguntar por quién. Hay sólo dos chats de clientes (C0737, C1549) y uno interno. Se puede cubrir con el campo `origen` de D4.
- **Validez del presupuesto:** sólo un lote la menciona (C3564, C3707) y es un plazo. Sofía no la dice hasta que JS lo defina (pregunta 14).

---

## 3. Qué NO cambiar, y por qué

- **Que no dé precios, descuentos, condiciones ni plazos.** Los chats muestran que ABA da valores «informales» por chat (unos 20 hallazgos, más de 130 chats), y eso trae sorpresas y errores que el cliente marca («No me habías dicho ese precio»: C0303, C3576). La decisión de JS es correcta.
- **Que el saludo lo arme el código, una sola vez.** Hoy el saludo automático de ABA se repite dentro de charlas abiertas (23 lotes, unos 170 chats; «eres humano?»). El diseño de Sofía ya lo evita. Sólo falta D5 para los bots.
- **Que se presente como asistente digital y nunca niegue ser una IA.** Un cliente preguntó si hablaba con una persona (C3562–C3741). La respuesta honesta, con la opción de pasar con alguien, es la correcta. Recordatorio del handoff: **antes de publicar el número, el saludo (`CUERPO` en `saludo.ts`) tiene que volver a decir «asistente digital»**.
- **Que no use menú numerado.** El menú 1️⃣/2️⃣ de 2025 cortaba charlas (C0110, C0127, C0229).
- **Vos, mensajes breves, como mucho un emoji, de usted si el cliente escribe de usted.** Coincide con el registro de ABA (26 lotes). Está bien que junte en un mensaje lo que ABA manda en ráfagas.
- **«Te escriben por este mismo chat», sin hora.** El «a más tardar mañana» de ABA muchas veces no se cumple (C0962–C1107). No prometer es lo correcto; A14 saca el último «en un rato».
- **Que pregunte primero el trabajo.** Ya está en la guía y en el prompt, y es lo que más retiene.
- **Verificar el frente en el catastro.** Responde al problema de las medidas que el cliente da mal, sobre todo en esquinas (relevamiento 1.4 y 1.6).
- **Que no calcule cuerpos ni estructuras.** Un bot anterior lo hizo, desalentó el servicio con armado y dejó visible un resumen interno (derivación, patrón 12).
- **El chequeo de dirección ya cotizada** (`conflictoCanal`, F6). Los chats muestran la misma obra cotizada dos o tres veces con precios distintos (derivación, patrón 13).
- **Que el código sólo baje a no fácil.** D1 afloja dos palabras, pero no le da a la IA ningún poder para subir.

---

## 4. Preguntas para JS que los chats no resuelven

1. **Pago:** ¿se acepta efectivo? ¿Se nombra el echeq? ¿Se hace factura B a particulares y consorcios?
2. **Venta de andamios:** ¿sí o no? ¿Y el multidireccional reacondicionado?
3. **Período mínimo del alquiler simple:** ¿hay una regla única? ¿Sofía puede decir que existe un mínimo, sin decir cuál?
4. **Zona del alquiler simple fuera de CABA:** ¿retiro en el depósito sí, entrega no? ¿Qué pasa con el GBA cercano (Vicente López, San Martín)?
5. **Visita técnica:** ¿tiene costo? ¿Se descuenta?
6. **Garantía del alquiler simple:** ¿qué se pide exactamente?
7. **Alquiler simple en 2026:** un lote dice «no estamos haciendo alquileres simples» (C0738), y después se siguen cotizando con Tamara. ¿Cuál es la regla vigente? ¿El pedido que prepara Sofía lo toma Tamara?
8. **Bandeja fácil y tiempo de obra:** ¿el precio de la bandeja fácil depende del plazo, por un mínimo mensual? Si depende, Sofía tiene que preguntarlo. Ojo: en `facil.ts`, «plazo», «fecha» y cualquier día de la semana marcan `fecha` y sacan el pedido de fácil. ¿Se afloja para que una duración («2 meses») no cuente como fecha?
9. **D1:** ¿aprobás que «pintar» y «silleta» dejen de sacar la bandeja de fácil?
10. **Gama alta:** ¿suma `layher`? ¿Suma hoteles, hospitales, bancos y patrimonio? ¿Las licitaciones y la industria son gama alta o un segmento aparte?
11. **Servicios:** ¿se ofrecen escaleras, capacitación de operarios, torres de apuntalamiento y eventos como servicio propio (A1)?
12. **Búsquedas laborales:** ¿a dónde van? Sofía no puede escribir mails ni links.
13. **Estafas:** ¿se avisa a una persona siempre, o sólo cuando ya pagaron (C3391 frente a C2300)?
14. **Validez del presupuesto:** ¿Sofía puede decirla?
15. **Fines de semana en el alquiler y seguro de caución:** son preguntas de clientes que quedaron sin contestar (C1749, C1815, C1818).
16. **Plantilla de alta en el formulario de Odoo:** está escrita de usted y en tono burocrático, y choca con el resto. ¿Se pasa a vos? Es un cambio fuera de Sofía, en el formulario web.

---

## 5. Ideas para más adelante

- **Seguimiento (paso 8):**
  - Pocos toques, y cada uno con un motivo:
    1. una pregunta concreta, ofreciendo ajustar algo;
    2. un motivo operativo o un «sin presión»;
    3. un último mensaje que ofrezca pausar o cerrar.
  - Nada de «Buen día!» suelto ni de 6 a 8 toques. El último seguimiento es el que más respuestas definitivas consigue (tono 1.1 y §2).
  - Cuando falta información: un solo recordatorio a las 24 o 48 h que diga exactamente qué falta (C0745, C3265, C3802).
- **Estado «en pausa» con fecha de recontacto** acordada con el cliente, y de quién depende la decisión (consorcio, comitente, licitación, permiso), en vez de «perdido» (C1565, C2379, C2996).
- **Cierre de los perdidos:** agradecer, dejar la puerta abierta, preguntar **una sola vez** si fue por precio o con qué empresa siguió, y registrarlo. Ojo: a una clienta le molestó la insistencia (C3187).
- **Plantilla de Meta «Tu presupuesto está listo»:** que nombre la obra y no el número de propuesta, que el PDF vaya en el chat y que avise que también salió por mail y conviene mirar en spam (C0970, C1351, C2173, C3403).
- **Tablero de demoras:** cuánto tarda cada pedido derivado en recibir la primera respuesta humana y la propuesta, por persona.
- **Mapa de derivación escrito** para cuando falta alguien: técnico y propuestas a Gabriel o Jorge, eventos a Gabriel, bandejas a Jorge, alquiler simple a Tamara, facturas y cobranzas a Agustina o Sandra, agenda a Rocío, siniestros a Joaquín. Lo usaría el servidor al asignar, no Sofía, que no nombra personas.
- **Reclasificar el índice de chats:** C0029, C0062 y C0735 son internos y figuran como «cliente». Hay que sacarlos de las métricas y **no usarlos nunca como ejemplo ni para entrenar**. C0029, en particular, tiene insultos y apodos sobre clientes. Regla posible: un chat de más de 1.000 mensajes en todo el período es interno.
- **Revisar la plantilla de alta de ABA** para que no salgan variables vacías («Hola Nombre») ni restos de atajos (C0770, C2530, C3053).
- **Análisis de audios:** hay 7.465 audios de clientes sin transcribir. Si aparecen los archivos, conviene una segunda pasada sobre los chats con más huecos.

---

## Fugas

Son posibles datos personales que la anonimización dejó pasar en citas de los hallazgos. No los copié; conviene revisar estos chats:
- **Nombre de pila de un cliente:** uno de C0418, C0426, C0436, C0489, C0545, C0614, C0559.
- **Apodo de un cliente:** uno de C1206, C1224, C1236, C1287, C1162.
- **Empresa cliente nombrada:** C0029. **Cadena del cliente:** C3026.
- **Competidor con nombre comercial:** C0029.
- **Empresa cliente final de un pedido:** uno de C1141, C1144, C1203, C1206, C1253, C1296, C1327, C1342.
- **Nombre de pila en «soy … de la empresa de andamios»:** uno de C1183, C1207, C1226, C1251, C1252, C1263, C1266, C1273, C1285, C1290.
- **Nombre de pila en una cita:** uno de C3586, C3640, C3654, C3657. **La síntesis de derivación lo copia literal en su sección de fugas: hay que borrarlo de ese archivo.**
- **Institución identificable como obra:** uno de C1162, C1166, C1206, C1294, C1331.
- **Posible nombre de un responsable de proyecto:** uno de C1365, C1410, C1436, C1441, C1477.

---

## Notas de la revisión

- **Privacidad:** el documento no tenía montos, teléfonos, mails, CUIT ni direcciones con número. Saqué las referencias a C0029, C0062 y C0735 (chats internos) como ejemplos de A9, A11, A13 y D4. Avisé que la síntesis de derivación copia un nombre de pila literal en su sección de fugas.
- **Reglas de JS:**
  - Agregué A14: el prompt todavía dice «te lo confirmo en un rato», que es un plazo.
  - Saqué de los datos para Sofía la anticipación de 24 h del alquiler simple y la validez del presupuesto, porque son plazos. Pasaron a C3 o a «Para discutir».
  - El texto de estafa ya no dice que ABA no vende andamios, porque la venta no está definida.
  - A10 ya no promete quién llama.
  - A12 ya no explica qué incluye el otro presupuesto.
  - Todo C1 y C2 quedó «A CONFIRMAR POR JS», y A1 también, porque el prompt prohíbe inventar servicios.
- **Contradicciones con las síntesis:**
  - A4 decía que Sofía siguiera el relevamiento ante un desprendimiento. Derivación 3.3 pide escalar en el momento: ahora pide sólo la dirección y deriva con el motivo urgente nuevo `desprendimiento`.
  - A2 resumía los mensajes personales para Joaquín. Derivación 3.1 dice no tocarlos ni resumirlos.
  - A2 mandaba el spam a `fuera_de_tema`. Derivación dice no contestarlo: ahora es `[nada]`.
- **Evidencia:** pasaron a «Para discutir» los recomendados (dos chats de clientes) y la validez del presupuesto (un lote). `layher` y las palabras institucionales quedaron como candidatas, no como «sumar seguro». Saqué «memoria de cálculo» y «seguridad e higiene» de D6, porque sacarían de fácil bandejas comunes.
- **Ajustes al código:**
  - Saqué el punto de A13 sobre «mañana a primera hora»: `horario.ts` todavía lo devuelve, y sólo dice «hoy desde las 8» antes de que empiece el horario.
  - D1: «silleteros» hoy no salta (`patronPalabra` busca la palabra entera); sí saltan «silleta», «pintar» y «andamio». Agregué el costo del cambio y saqué la «lista informativa», que no existe.
  - D3: el motivo urgente usa el `urgente` que ya existe en el efecto (`avisarUrgente`). La prioridad de `quiere_avanzar` necesita tocar `vista.ts`. La bandera `urgente` va en `BANDERAS` y `BanderaIA`.
  - A3 y D3 ahora usan el mismo motivo: `estafa_pago`.
  - Agregué que «echeq» y «efectivo» marcan `descuento`, que «2 meses» y «plazo» chocan con la bandera `fecha` (B1 y pregunta 8) y que los parámetros se cargan en Parámetros y no por migración.
- **Contexto:** agregué la aclaración de que muchos hallazgos son del número viejo, y el número de Sofía se publica primero sólo en la web.