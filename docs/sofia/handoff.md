# Handoff: CRM con Tomás (antes Sofía), el agente de WhatsApp para clientes

**Actualizado el 26/11/2026.** **Desde el 17/10 el agente se llama Tomás** (JS eligió una voz de hombre para el saludo con audio). La carpeta, los nombres internos del código (`atenderConSofia`, `FichaSofia`…) y la historia de abajo siguen diciendo Sofía.

 El estado de abajo es el vigente. La historia del 12/10 está más abajo, en «Historia: la charla del 12/10».

Para retomar, decí: «Leé docs/sofia/handoff.md y seguimos con el CRM de WhatsApp».

**Para seguir (26/11):**
- Que JS confirme que el audio grabado desde la bandeja llega (arreglo `399bee8`, ver abajo). Si falla de nuevo, probar variantes por la API con la ventana abierta en el número de JS, nunca en la charla de un cliente.
- Ver en charlas nuevas que Tomás ya no diga «no puedo ver el video» ni «no puedo abrir el link» (prompt `tomas-2026-11-26-nunca-no-puedo-ver`).
- Para más adelante: abrir del lado del servidor los links de Google Maps (la dirección) y de YouTube (el título).

**De antes (25/11, al cierre):**
- El alquiler #1045 sigue en error («Falta a nombre de quién va el presupuesto»): falta que alguien toque «Reintentar» en la tarjeta. Con el arreglo de hoy tiene que salir (la ficha ya tiene el nombre).
- Proponerle a JS mover las funciones de Vercel a Oregón (`pdx1`, con `regions` en vercel.json): hoy corren en iad1 (Washington) y Supabase está en us-west-2, así que cada consulta cruza Estados Unidos. Es un cambio de toda la app: revisar antes dónde está Odoo y los crons.
- Preguntarle a JS si el «¡» de apertura («¡Buen día!») también se saca: por ahora sólo se sacó el «¿».
- El modo «en espera» del 24/11 todavía no se vio con charlas reales.
- La asignación #1060 (escalera para comprar, Córdoba) quedó esperando el OK: hay que contestarle al cliente que no vendemos escaleras y descartarla. Preguntarle a JS si alquilamos escaleras; si no, sumarlas a «lo único que no alquilamos».

**26/11 a la tarde: nunca «no puedo ver el video»** (prompt `tomas-2026-11-26-nunca-no-puedo-ver`). Marcelo mandó un link de YouTube con el armado de una rampa y Tomás contestó «El video no lo puedo ver, pero se lo paso al equipo»; con Oscar (13/11), «El link no lo puedo abrir» ante un Google Maps. JS: que nunca diga que no puede ver videos; si no puede abrir algo, que lo pida en otro formato, y con YouTube que diga que lo mira con el equipo. Ahora, en el prompt: nunca dice que no puede ver, abrir o escuchar algo; videos y links a videos o redes (YouTube, Instagram, TikTok, Facebook, Drive) → «se lo paso al equipo para que lo mire» y sigue (lo que diga que hay que mirar va al resumen); un link con un dato que necesita (Maps) → pide el dato como un pedido normal; un archivo importante → que lo mande como foto o PDF; un audio sin transcribir → que lo escriba. Los textos internos de foto, archivo y video pasaron de «lo ve el equipo, vos no» a «lo mira el equipo». Idea para más adelante: abrir del lado del servidor los links de Google Maps (sacar la dirección) y el título de los de YouTube (oEmbed), así Tomás tiene el dato.

**26/11 a la tarde: los audios de la bandeja siguieron fallando** (131053 también subidos a WhatsApp, a las 13:25, con `48cdff7` ya desplegado: el problema no era el Content-Type). Comparado con el saludo con voz, que llega bien: la grabación de Chrome salía a 48 kHz, empezando en -0,0065 s y con `language=eng`; el saludo es Opus a 16 kHz, desde 0 y sin metadatos. `argumentosNotaDeVoz` ahora convierte como el saludo (`asetpts=N/SR/TB,aresample=16000`, 24 kb/s, sin metadatos; con el orden al revés el M4A del iPhone quedaba en -0,000063 s), con test (`399bee8`, en producción). **Sin confirmar:** falta la prueba de JS. Si vuelve a fallar, el siguiente paso es probar contra Meta con la ventana abierta en el número de JS (que le escriba al número de clientes) mandando variantes por la API.

**26/11: pegar capturas y mandar audios desde la bandeja.** JS: «que se puedan pegar capturas de pantalla y se envíen como imágenes» y «enviar audios desde el chat».
- Pegar (`caja-respuesta.tsx`, `pegar`): una imagen pegada en la caja se adjunta como foto (mismo camino que el clip: `subirArchivo` → /adjuntos → /responder). Si el portapapeles trae texto (una celda de Excel), se pega el texto. Lo que no es JPG ni PNG se redibuja como PNG; una imagen de más de 4,5 MB (captura Retina) se pasa a JPG (`entraEnWhatsapp`, también para el clip), porque WhatsApp rechaza fotos de más de 5 MB. Nombre `captura-AAAAMMDD-HHMM.png`.
- Audios: con la caja vacía, el botón de mandar es un micrófono (`useGrabador`, MediaRecorder). Graba hasta 5 minutos (después queda para escucharlo y mandarlo); la papelera descarta. Chrome graba WebM/Opus, Safari y el iPhone MP4/AAC, Firefox Ogg. /adjuntos acepta esos tipos (`AUDIOS_GRABADOS` en `audio-saliente.ts`); /responder lo baja, lo pasa con ffmpeg a Ogg/Opus mono 32 kb/s (`aNotaDeVoz`, con test para WebM y M4A), guarda el .ogg en lugar del original y lo manda como nota de voz (`mandarAudio` en envio.ts, `voice: true`). Si el envío falla, la grabación queda para volver a mandarla. Lo revisó un agente independiente (doble clic en el micrófono que arrancaba dos grabaciones, la grabación que se perdía si fallaba el envío, carreras al descartar, capturas de más de 5 MB, el iPhone cortando el micrófono): corregido.
- Sin probar todavía en el iPhone ni en Safari de la compu con la sesión de JS: el permiso del micrófono lo pide el navegador la primera vez.
- **26/11, la primera prueba de JS falló** («No se pudo subir el archivo: revisá el formato y el tamaño», 131053, llegó por el aviso de estado después de que Meta aceptara el envío). El .ogg estaba bien (Opus, mono, 48 kHz, 16 s). El problema: por link, Meta baja el archivo y mira el Content-Type, y Storage lo sirve como `audio/ogg` a secas (WhatsApp sólo acepta `audio/ogg; codecs=opus`). Arreglo: `mandarAudio` sube el audio a WhatsApp (`subirMedio`, `/{phone_number_id}/media`, con el tipo `audio/ogg; codecs=opus`) y lo manda por id (`48cdff7`, en producción desde el 26/11). Se probó que Meta acepta la subida del audio de la prueba; el envío real lo prueba JS. El saludo con voz (`mandarNotaDeVoz`, apagado) sigue por link: si se vuelve a prender, pasarlo a `subirMedio`.

**26/11: la imagen de referencia de la bandeja no salía nunca.** Tomás la pedía bien (`mostrar_referencia` con bandeja, 4 veces desde el 19/11), pero volvía `no_se_pudo` y él seguía sin mencionarla. En los logs de Vercel: `ENOENT … referencia.jpg`. La copia en JPG se armaba con ffmpeg con el fondo blanco como segunda entrada infinita (`lavfi color`) y, al azar, ffmpeg terminaba bien sin escribir el archivo. Fachada salió a la primera y quedó guardada (por eso andaba siempre); torre, a la tercera; bandeja, nunca. Arreglo: filtro de una sola entrada (`FILTRO_COPIA` en `referencias.ts`, con test que convierte 5 veces un PNG transparente), se verifica que la copia exista y, si no se puede armar, sale el render original (PNG de hasta 5 MB). Además se subió a mano la copia de la bandeja (`comercial/referencias/1790449014914-6b9229e5.jpg`), así que sale desde el 26/11 sin esperar el deploy. Ojo: torre no tiene render «por defecto» y se usa el más nuevo, un PNG de 110 KB (la copia pesa 20 KB): si JS prefiere otro, se marca en Parámetros → Renders.

**25/11: lo que no vendemos (prompt `tomas-2026-11-25-no-vendemos`; `58a60e1`, en producción).** Andrés pidió precio de una escalera de 12 m para comprar (poda de palmeras, en Córdoba) y Tomás le pidió dirección, piso, cuántas y a nombre de quién, y lo pasó al equipo «para que lo evalúe» (#1060). JS: escaleras no vendemos, nos dedicamos al alquiler. Ahora: lo único que se vende es andamio multidireccional nuevo; si quiere comprar otra cosa, Tomás lo dice en una línea («Escaleras no vendemos: lo nuestro es el alquiler de andamios.»), sin datos, resumen ni pedir_tecnico; ofrece el alquiler sólo si el trabajo se hace con un andamio y es en CABA o GBA. Si pide escaleras sin decir comprar o alquilar, aclara que no las vendemos y pregunta para qué trabajo. Excepción explícita a «nunca digas que no lo hacemos». Abierto: si alquilamos escaleras (JS sólo dijo que no las vendemos).

**25/11: preguntas sin «¿» (prompt `tomas-2026-11-25-sin-apertura`; `552caca`, en producción).** JS: en Argentina no se abre la pregunta. El prompt ya no tiene ningún «¿» (los ejemplos lo enseñaban) y tiene la regla; además `sinApertura` (`sin-apertura.ts`) se lo saca a todo lo que manda ABA (Tomás y los textos fijos) en `mandarTexto` y en el epígrafe de `mandarArchivo`. Lo que escribe una persona sale como lo escribió. Las plantillas de Meta no pasan por ahí.

**25/11: la bandeja cambia de charla más rápido (`793eb2e`, en producción).** Elegir una charla usa `history.replaceState` (antes `router.replace` volvía a pedir la página al servidor); el detalle lee en paralelo y deja la charla leída en `after()`; las tarjetas se piden junto con el hilo; pasar el mouse por la lista la pide de antemano con `?previa=1` (no la deja leída ni manda tildes azules; no va por prefetchQuery para no compartir el pedido con el de verdad); `Charla` con `memo`. Pendiente proponer: las funciones de Vercel están en iad1 y Supabase en us-west-2.

**25/11: apuntalamiento de medianeras (prompt `tomas-2026-11-25-apuntalamiento-medianeras`, después `-medianeras-datos`; `d2618fb` y `ac52582`, en producción).** Un cliente mandó la foto de una viga de medianera a medianera («viga Acrow, ¿alquilan?») y Tomás no sabía que es un servicio nuestro. JS: es la viga o cercha de apuntalamiento de medianeras, típica en excavaciones de obra nueva. Ahora está en «Qué hace ABA» y tiene su bloque en «Cómo seguir según el pedido»: confirma que lo hacemos sin prometer montaje ni plazos, pide dirección, distancia entre medianeras, largo, profundidad de la excavación, tiempo, planos o cálculo, y va a pedir_tecnico. Sin imagen de referencia. Después JS pasó los datos clave (prompt `tomas-2026-11-25-medianeras-datos`): la luz entre medianeras, y si es por excavación, a qué altura del nivel 0 va la viga y cuántos metros llevan excavados (cuanto más, más complejo el montaje); van siempre en el resumen.

**25/11: un presupuesto sin nombre ya no falla al aprobar (`035acee`, en producción).** Desde el 19/11 Tomás pregunta el nombre una vez y, si no lo dan, el presupuesto sale igual; pero Odoo no da de alta un cliente sin nombre y la aprobación fallaba después del OK («Falta a nombre de quién va el presupuesto»; un alquiler quedó cuatro días sin salir). Ahora `nombreDelCliente` (`nombre-cliente.ts`): el nombre, el contacto o el perfil; si no hay nada, «Cliente WhatsApp +<teléfono>» como provisorio, con el aviso en la orden. La tarjeta avisa en ámbar «El cliente no dio su nombre» antes de aprobar (bandeja y alquiler).

**Lo último (24/11): revisión de las últimas 10 charlas** (prompt `tomas-2026-11-24-revision-de-charlas`). Lo que se vio y lo que se cambió:
- **Protección peatonal (Pablo):** pidió protección peatonal y Tomás le preguntó por silleteros, por una malla para la fachada y tres veces si iba por todo el frente. Ahora «pantalla», «pantalla de protección», «protección peatonal» y «bandeja» son lo mismo; si pide eso, no pregunta por silleteros, andamio ni malla; si la bandeja va por todo el frente se pregunta una vez y, si no aclara, es todo el frente.
- **Preguntas repetidas y el que sólo quiere precio (Marcelo, Lautaro):** cada dato se pregunta una vez (una segunda sólo si sin eso no se cotiza). Si sólo quiere el precio, no se piden mail, DNI ni CUIT (sólo a nombre de quién va).
- **Alquiler simple sin fecha (Marcelo):** la fecha y la franja eran obligatorias y Tomás insistía. Ahora `fecha_a_confirmar` en cotizar_alquiler_simple: el presupuesto sale con la primera fecha posible como provisoria (`entregaProvisoria` en `alquiler-simple.ts`; mañana o la próxima hábil, a la mañana), la aprobación la recalcula con la fecha del día, el mensaje cierra con «Cuando sepas la fecha de entrega, avisame por acá y te lo reservo», la tarjeta muestra «Fecha a confirmar» y la nota de Odoo dice que es provisoria. Al aceptar, el aviso al equipo pide poner la fecha real en la orden. Si la persona corrige la fecha en la tarjeta, deja de ser a confirmar. La franja se pregunta sólo cuando ya hay día.
- **Bandeja dada por hecha (Ana):** en una fachada, la bandeja va siempre si el andamio está sobre la vereda; si va dentro del terreno (casa retirada), Tomás pregunta si pasa gente por abajo.
- **Charla en espera sin respuesta (Ana María):** preguntó dos veces dónde estábamos después de que Tomás la pasó y nadie contestó en tres días. Ahora, con la charla en `espera_ok` (presupuesto o asignación esperando) o `derivada` por un motivo común, Tomás contesta sólo preguntas simples (dirección, horarios, cuándo le escriben) o `[nada]`, en una tanda, sin herramientas y sin cambiar el estado (`puedeContestarEnEspera` y `TEXTO_EN_ESPERA`). Nunca si la tomó una persona, ni en seguridad, urgente, reclamo, estafa, «pide una persona», «no se entienden», pausa, tope o error. Cuando contesta, queda un evento en la charla.
- **Saludo repetido:** una charla que se reabre dentro de las 12 h del saludo no se vuelve a saludar (`saludoVigente`, `saludo.ts`).
- **Prometer de más (un escenario con motores):** no confirma que hacemos algo fuera de la lista; dice que el equipo lo evalúa.
- **Para JS, no son de Tomás:** un cliente de apuntalamiento dijo que un mail a nuestro correo rebotó; otro (tablón) preguntó cuánto sale el traslado y quedó sin respuesta.
Para la próxima: revisar si el modo en espera contesta bien (y se calla cuando debe), y si los presupuestos con fecha a confirmar salen y se aprueban sin problemas.

**20/11, notificaciones push:** el iPhone de JS perdió su suscripción sin avisar (Apple seguía aceptando los avisos con 201 y el celular no los mostraba); hubo que activarlas de nuevo y se borró la vieja. Desde `79f9aaf`, al abrir la bandeja: si el dispositivo las tenía (localStorage `andamios-push-endpoint` o, si se borró, una suscripción del servidor con el mismo nombre de dispositivo) y ya no, con el permiso dado se suscribe solo y borra la anterior (`anterior` en «activar»); si no, la campana queda en rojo y avisa. Desactivarlas a propósito marca `andamios-push-apagada` y no se reactivan. No se probó en un iPhone.

**Lo último (19/11), todo en producción:** la tarjeta de la bandeja fácil con el render por defecto (`306bfa6`), las imágenes de referencia (`9495ce5`) y las mejoras por la revisión de las últimas 10 charlas (`52bc27f`) y las escaleras sin ofrecer visita (prompt `tomas-2026-11-19-escaleras-sin-visita`). El detalle, abajo. Para la próxima: volver a leer las charlas nuevas y ver si Tomás ya no repite preguntas, si la pausa al escribir se siente natural, si pregunta el nombre cuando el perfil no tiene uno y si las imágenes de referencia salen bien. En el cotizador, el mail ya no es obligatorio (`c7b5c19`, ver docs/asistente-comercial/handoff.md).

**En curso (12/11): el alquiler simple que cotiza Tomás.** JS contestó las 13 preguntas el 12/11 y sumó seis decisiones a la tarde (filas 16 a 24: sólo CABA, el retiro en el depósito de Cucha Cucha 2345, Belgrano, el peldaño en cualquier módulo, Tamara de vendedora, el pagaré, provincia sin derivar y nada de 12 a 13); están en la §11 de [alquiler-simple-propuesta.md](./alquiler-simple-propuesta.md). **En producción desde el 12/11** (`09e4fe0` en main, deploy `andamios-d1mp5x9g6`, migraciones `20261112000001` y `…02` aplicadas). JS no quiso la prueba previa contra Odoo: lo prueba él por WhatsApp. Ver el punto 13.

**19/11: escaleras y visitas** (charla de Axel, hueco de escalera curva en Defensa 613; JS: «estaría bueno que Tomás le pregunte las medidas entre las 4 paredes… para determinar los m² de plataforma»; «automáticamente le mencionó la visita técnica sin cargo, eso yo no lo haría: en todo caso lo define el equipo»; «cuando hay que montar andamios sobre escaleras, lo otro importante es el ancho de la escalera para ver qué tipo de andamio se necesita»). Prompt `tomas-2026-11-19-escaleras-sin-visita`:
- En un hueco de escalera o un andamio sobre una escalera, Tomás pregunta, además de la altura, las medidas del hueco de pared a pared (largo y ancho: los m² de plataforma) y el ancho de la escalera (define el tipo de andamio). Si no las sabe, que las mida o las marque en una foto.
- Tomás nunca ofrece una visita técnica ni dice que un técnico tiene que ir a ver (lo hizo con Axel y con Karina). Si el cliente la pide, anota los días y franjas y le dice que el equipo lo evalúa; si pregunta si tiene costo, no tiene. Se sacó «y si hace falta una visita (no tiene costo)» del flujo de fachadas e interiores, y la descripción de `pedir_tecnico` aclara que el motivo «visita» es sólo si el cliente la pidió. El renglón «Visita técnica: no tiene costo» de `clientes_datos_empresa` (Parámetros) sigue, por si pregunta.

**19/11: revisión de las últimas 10 charlas** (JS: «leé las últimas 10 charlas que tuvo Tomás para que detectes qué se puede mejorar»). Charlas del 18/11 a la tarde y del 19/11 a la mañana: Karina, Francesco, María Jimena, Laura (estafa), Elvio, gonprifer, Gaby, Dario, Eric y Miguel. Lo que se cambió (prompt `tomas-2026-11-19-revision-de-charlas`):
- **Mensajes cruzados** (Gaby, Francesco, María): el cliente escribía en el mismo segundo en que salía la respuesta y Tomás volvía a preguntar lo mismo. `seCruzaron` (`turno.ts`): si el primer mensaje nuevo es de antes de que saliera la respuesta anterior (1 s de margen, porque Meta manda la hora en segundos), el aviso le dice que no repita y que, si no cambia nada, conteste `[nada]`; si lo nuevo responde la pregunta, sigue normal. Con una ventana más larga, un «Sí» rápido se tomaba como cruce. `leerHistoria` ahora trae `created_at` y `texto`.
- **Contesta como una persona** (JS: Francesco preguntó «¿estoy hablando con una IA o escribís así de rápido?»): antes de mandar, `pausaComoPersona` espera lo que tardaría en escribirlo, contando desde el último mensaje del cliente: 3 s más ~11 caracteres por segundo, tope 40 s (`tiempoDeEscritura`), prendiendo el «escribiendo…» al empezar y cada 20 s, y nunca más allá del plazo del turno menos 60 s. Si el filtro bloquea el texto, no espera. Como la espera es antes de mirar si el cliente escribió algo más, también junta más mensajes en una respuesta. Sin `pausaEscritura` (los tests), sale enseguida.
- **Preguntas ignoradas**: si preguntó algo dos veces y no le contestaron, no lo vuelve a preguntar (a María le preguntó cinco veces quién lo armaba; a Eric, cinco veces qué trabajo).
- **El nombre del perfil** (JS: «¡Buenas tardes Gonprifer!», «Hola Cerrajería»): `nombreParaSaludo` usa el nombre sólo si la primera palabra está en `nombres-propios.ts` (lista de nombres de pila; un nombre real que falte se agrega ahí). Si no, saludo sin nombre y, en su primer mensaje, Tomás pregunta «¿Con quién tengo el gusto?» (`pedirNombre`) y lo anota en la ficha nueva `contacto` (se ve en «Copiar para Slack»).
- **«Pide una persona» por error** (Miguel: «tiene que subir una persona» al andamio): «persona» y «hablar con» sueltos ya no cuentan (`facil.ts`); sí «persona» solo, «hablar con una persona», «persona real», «hablar con alguien/un vendedor». Ese falso positivo lo sacó del alquiler simple y lo pasó al equipo sin tarjeta: quedó «Sin tomar» desde el 18/11 a las 16:10.
- **La medida del catastro** (Francesco: «me dijeron 10 m… está bueno, es más exacto»): `acepta_medida_catastro` en `anotar_ficha` borra los metros que había dicho, así la bandeja sale fácil.
- **A nombre de quién**: si no sabe, Tomás ofrece hacerlo a su nombre (a Francesco le puso «el consorcio» solo).
- **El cliente insiste en lo que pidió** (Eric, «1 cuerpo de pasillo + 1 tablón y ruedas»; JS se lo cotizó a mano): Tomás le dice una vez que no le llega cómodo y, si insiste, `insiste_en_lo_que_pidio` → se cotiza lo que pidió (`insiste` en el pedido). La seguridad no cambia: la cabeza tiene que entrar, más de 3 módulos se ancla, piso completo y baranda.
- **Módulos sobre la vereda** (María, frente de un local a 6 m; JS: «si piden módulos no estaría mal que le coticemos, pero el cliente tiene que saber que lo que debería hacer es armar una protección por las inspecciones y los peatones»): se cotiza como alquiler simple y Tomás le recomienda una vez la bandeja y ofrece cotizarla aparte.
- **Provincia** (Dario; JS: «con armado siempre vamos a provincia; sólo unos módulos con tablones no se envían»): el depósito se ofrece sólo si es un alquiler simple sin otros motivos; si igual lo ve un vendedor (anclar, montaje, muchos módulos), no se le dice que no llegamos. Sin poder retirar, Tomás le explica y le ofrece que se lo armemos (`pedir_tecnico`). Decir «lo cotiza un vendedor», no «lo arma».
- **Arreglos de la revisión independiente:** con las piezas y sin la altura (Eric) ya no le pide la altura: arma lo que pidió revisando que la cabeza entre y que no haya que anclar (`soloPiezas`); «a nombre de quién» se pregunta una vez, al final, y si no lo da el presupuesto sale igual (`nombrePreguntado`); `insiste` se borra si cambian la altura o las piezas y no saltea la confirmación del tablón en el peldaño; provincia se decide después de los motivos del cliente (antes podía decir «ofrecele el depósito» y «no le ofrezcas el depósito» a la vez); el contacto se usa como nombre en Odoo y en el mensaje del presupuesto antes que el perfil; «pide una persona» sin falsos positivos como «lo armo con una persona más», «soy el dueño», «me llaman de la obra», y con «una persona por favor», «quiero una persona», «que me llame alguien», «atención humana». Ojo: `normalizar` junta letras dobles («llame» → «lame»): en las regex va `l?lam`.
- **Para ver con JS:** en provincia, cuando lo ve un vendedor por algo que no es de armado (piezas fuera de la lista, más de 30 días), Tomás tampoco le dice que no llegamos: lo decide el vendedor.
- Quedó pendiente, del lado del equipo: Laura (estafa) quedó sin que nadie le escribiera, y «¿lo colocan ustedes?» (Gaby) y «¿estoy hablando con una IA?» (Francesco) quedaron sin respuesta cuando JS tomó la charla.

**19/11: imágenes de referencia** (JS: «cuando Tomás detecta que lo que necesita es una protección peatonal o una estructura, que le pueda enviar fotos de referencia… para verificar que lo que el cliente está pidiendo es eso»; torres sí, apuntalamiento por ahora no). Herramienta nueva `mostrar_referencia` (`tipo`: bandeja, fachada o torre): el servidor le manda al cliente el render de la biblioteca de ese tipo con un epígrafe que ya trae la pregunta («Imagen de referencia: una bandeja de protección peatonal. ¿Es algo así lo que necesitás?», o «necesita» de usted), así se entiende sola aunque la respuesta de Tomás no salga; Tomás no la repite y, si no tiene nada más que decir, contesta `[nada]`. Una vez por tipo y por charla (se mira en `cli_hilo` por `adjunto.nombre` = `referencia-<tipo>.jpg`). En una fachada manda sólo la de fachada, que ya muestra la bandeja abajo. **Nunca en el alquiler simple**, trabado en el código (`trabajo` alquiler_simple o con `alquiler` en la ficha). Como sale a mitad del turno, antes mira el estado: si la charla ya la tiene una persona, está derivada (también en ese mismo turno) o cerrada, no sale (`charla_tomada`). Lo revisó un agente independiente.
- **Qué imagen:** la de por defecto de ese tipo en la biblioteca (Parámetros → Renders) y, si no hay ninguna marcada, la más nueva. Al 19/11: bandeja «Bandeja-Pantalla Estandar», fachada «Estructura con Pantalla - Multidireccional» y torre «Torre multidireccional con escotilla» (ninguna de torre está marcada por defecto: sale la más nueva). Para cambiarla, marcar otra por defecto.
- **El archivo:** los renders son PNG de ~3 MB. La primera vez se arma una copia JPG de hasta 1600 px (~300 KB, aplanada sobre blanco por si el PNG es transparente) con ffmpeg y queda en Storage, en `referencias/<nombre del render>.jpg`. Si se reemplaza la imagen de un render con el mismo archivo, hay que borrar esa copia.
- Código: `referencias.ts` (tipos, epígrafes, `elegirRender`), `referencias-envio.ts` (la copia y el envío), `mostrarReferencia` en `herramientas.ts`, `mandarReferencia` en los servicios de `agente.ts`. Prompt `tomas-2026-11-19-imagenes-de-referencia`.

**19/11: la tarjeta de la bandeja fácil no se podía aprobar por el render** (charla de Gaby, Consorcio Lavalleja 230: la primera tarjeta fácil de verdad). `agente_facil_render` estaba vacío en Parámetros desde el 16/10, así que el borrador salía sin render y «Aprobar» decía «Falta decidir el render». Ahora, si el parámetro está vacío, se usa el render por defecto de bandeja de la biblioteca («Bandeja-Pantalla Estandar»), al armar la tarjeta y también al aprobar una ya armada (`renderBandejaFacil` en `render-bandeja.ts`, `conRenderBandeja` en `facil.ts`, `calcular` en `aprobar.ts`). Se probó contra la tarjeta real de Gaby, sin escribir nada: sin bloqueos, $ 1.400.000 + IVA.

**17/11: sin período mínimo, y el catastro sólo sobre la vereda** (JS: «eso sólo debería entrar en validez si lo que pide es una bandeja de protección o una estructura o algo que se arma sobre la vereda»; «no quiero que mencione lo del período mínimo, nosotros cotizamos igual; lo importante es saber por cuánto tiempo les va a llevar el trabajo»). En 14 días, Tomás habló del catastro o de la «puerta oficial» en eventos e interiores (Leslie, Pili, Marina) y del período mínimo en 6 charlas que no eran alquiler simple.
- `verificar_direccion` sólo consulta el catastro con `trabajo` bandeja o fachada, o con `sobre_la_vereda: true` (vallas en la vereda, una estructura en la calle). Si no, guarda la dirección y le dice a Tomás que no hable del catastro ni pida la altura (`verificaEnCatastro`). Con «puerta no oficial» pregunta una sola vez y sigue.
- Prompt: el catastro sólo sobre la vereda; nunca hablar de un período mínimo; preguntar cuánto tiempo lo necesitan. Prompt `tomas-2026-11-17-catastro-y-minimo`.
- Migración `20261117000001_clientes_sin_periodo_minimo.sql`, **aplicada el 17/11 con el OK de JS**: cambia el renglón «Período mínimo» de `clientes_datos_empresa` y el de «Dirección» de `clientes_guia_trabajos`.
- **En producción desde el 17/11** (`9cdc1ef` en main). Parámetros se lee con caché de 1 h.

**16/11: mail, DNI o CUIT, y cómo nos conoció** (JS: «no es excluyente… hay muchas personas que les molesta pasar tantos datos para un presupuesto»). **En producción desde el 16/11** (`c72084b` en main; sin migraciones: la ficha es JSONB). Sección nueva del prompt, «Los datos del cliente»: al final, cuando ya entendió el pedido, Tomás pide en un solo mensaje, aclarando que no es obligatorio, el mail (para el presupuesto formal) y, para la factura, el DNI si es una persona o el CUIT si es empresa, consorcio u organismo. En el alquiler simple, sin DNI, porque lo manda en foto si acepta (paso 7). Lo pide una sola vez, no insiste y nunca repite los datos. También pregunta una vez cómo nos conoció (Google o la web, redes, recomendación, vio un andamio o un cartel en la calle, ya trabajó con ABA, otro, con un detalle). No lo pregunta si ya es cliente, ni en urgencias, reclamos o estafas.
- Ficha: `dni` (sólo dígitos) y `origen` ({ via, detalle }), por `anotar_ficha` (`dni`, `como_nos_conocio`, `como_nos_conocio_detalle`). `ORIGENES` en `herramientas.ts`.
- Odoo: `crearCliente` carga el DNI como documento (tipo «DNI», id 5) cuando no hay CUIT. El aviso «sin CUIT» pasa a «sin CUIT ni DNI». «Cómo nos conoció» va en la nota interna de la orden (bandeja, fachada y alquiler simple).
- Se ve en «Copiar para Slack» y en el link de la charla (filas «DNI» y «Cómo nos conoció»). En el aviso a Tomás, el DNI aparece sólo como «ya lo dio».
- Prompt `tomas-2026-11-16-datos-del-cliente`.

**16/11: sin «Anotado»** (JS: Tomás repite «Anotado», «lo anoto»). **En producción desde el 16/11** (`afc5a4b` en main). Falta volver a contar en charlas nuevas si bajó. En los 10 días anteriores, 27 de 155 mensajes de Tomás decían «anot…» y 67 (43 %) arrancaban con «Perfecto», «Listo», «Dale» o «Gracias». Con Leslie, cinco seguidos. Cambios: en «Cómo hablás», nunca «anotado», «anoto», «lo anoté» ni «tomo nota», no repetir lo que el cliente acaba de decir (el dato a confirmar va dentro de la pregunta siguiente), y no arrancar cada mensaje con un acuse (nunca dos seguidos). El resumen antes de `pedir_tecnico` arranca «Te resumo:» o «Para confirmar:». La herramienta `anotar_ficha` le contestaba «Anotado: …» y Tomás lo copiaba: ahora dice «Guardado en la ficha: … (No se lo digas al cliente…)». Prompt `tomas-2026-11-16-sin-anotado`.

**16/11: «Compartir link» de la charla** (**en producción desde el 16/11**, `aead3d6` en main) (JS: mejor que copiar texto o un PDF; maqueta aprobada en https://claude.ai/artifact/X369vePBogcdamxSSqTMUr, página «Link»). En el encabezado de la charla (con la bandeja en «editar»), «Compartir link» genera y copia un link a una página pública, `/charla/<token>`, con la ficha (datos del cliente, el servicio, lo que marcó Tomás, el equipo), una galería de fotos, videos y PDF, y la charla con el estilo de WhatsApp: los audios se escuchan con su transcripción y los videos se reproducen ahí mismo.
- **Acceso:** lo abre cualquiera que tenga el link (token al azar de 24 bytes), durante 30 días (`LINK_DIAS`). Después muestra «Este link venció» y se genera otro desde la charla. Se puede cortar antes («Cortar el link»). Si ya hay uno vigente, «Compartir link» devuelve ese mismo. Generar y cortar quedan como eventos en el hilo. La página dice «Uso interno de ABA · No reenviar al cliente» y no la indexan los buscadores.
- **Siempre al día:** se arma en el servidor en cada visita, con URLs firmadas por 6 h para los archivos. Cuenta las visitas («Se abrió N veces» en la charla).
- **«Guardar PDF»** usa la impresión del navegador (en el celular, Compartir → Guardar como PDF). El PDF con el diseño de la maqueta (hojas A4 de react-pdf) no está hecho: queda pendiente si hace falta.
- **No está «Bajar todo (.zip)»** de la maqueta: cada foto o archivo tiene su botón para bajarlo. Un zip armado en el servidor choca con el límite de 4,5 MB de las respuestas de Vercel.
- Código: `src/lib/clientes/link-charla.ts`, `src/app/charla/[token]/page.tsx` (con su layout en Poppins), `src/components/clientes/compartir-link.tsx`, ruta `/api/comercial/clientes/conversaciones/:id/link` (GET, POST, DELETE). Los datos de la ficha salen de `filasCliente`, `filasServicio` y `filasEquipo` de `para-slack.ts`, así el texto para Slack y la página dicen lo mismo. `/charla/` está en las rutas públicas del proxy.
- Tabla `cli_links` (migración `20261116000003`, **aplicada el 16/11 con el OK de JS**).

**16/11: notificaciones push de la bandeja** (JS: «me gustaría que en principio me llegue todo, más ahora que quiero ir viendo las respuestas»). **En producción desde el 16/11** (`9103169` en main); JS las activó en su iPhone y andan. La campana en el encabezado de la lista activa las notificaciones en ESE dispositivo (cada celular o compu por su cuenta), con dos modos:
- **Todo:** cada mensaje del cliente («Oscar Brito: …») y cada respuesta de Tomás o texto fijo («Tomás → Oscar Brito: …»). Las de una charla se reemplazan entre sí (tag por charla), así no se apilan.
- **Sólo lo que me necesita:** Tomás pasó la charla a una persona, una tarjeta espera el OK, te pasaron una charla, o el cliente escribió en una charla tuya.
- Los avisos «⚠️» (necesita) llegan en los dos modos y tienen su propio tag. Lo que escribe una persona no se avisa.
- Código: `src/lib/push/servidor.ts` (web-push 3.6.7, VAPID), `src/lib/clientes/push.ts` (`quienesReciben`, con tests), `public/sw.js` (sólo push, sin offline), `src/components/clientes/notificaciones.tsx`, ruta `/api/comercial/clientes/notificaciones` (alcanza con ver la bandeja). Ganchos: `recibirMensajes`/`despuesDeRecibir` (cliente), `salir` en `envio.ts` (Tomás y textos fijos), `cambiarEstado` del repo de Tomás (espera_ok y derivada) y `avisarQueLaTiene` (te pasaron la charla).
- `sw.js` y `manifest.json` quedaron afuera del proxy: antes `manifest.json` rebotaba al login, así que el iPhone no podía instalar la app bien.
- Tabla `push_suscripciones` (migración `20261116000002`, **aplicada el 16/11 con el OK de JS**). Un dispositivo que el servicio de push da por muerto (404/410) se borra solo.
- **Claves:** `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en Vercel (Production), **cargadas el 16/11 por Claude con la autorización de JS** (vercel env add, la privada como sensitive) y redeploy de `9103169`. Si se cambian, las suscripciones viejas dejan de andar: hay que volver a activar en cada dispositivo. Sin claves no sale nada y la campana dice «Falta configurar las claves en el servidor».
- En el iPhone sólo anda con AndamiosOS agregada a la pantalla de inicio (iOS 16.4 o más).

**16/11: lo que alquilamos** (por la charla de Gabi Notario, BSL: pidió 30 m de vallas free standing y Tomás le dijo «no son de lo que solemos trabajar»). Decisiones de JS:
- **Alquilamos vallados:** vallas free standing, vallado de seguridad tipo reja y vallado ciego (estructura multidireccional con fenólico). Están en «Qué hace ABA» del prompt.
- **Tomás nunca dice que algo no lo alquilamos** ni «no es de lo que solemos trabajar»: ante la duda lo define el equipo (a veces conviene tercerizar el alquiler antes que no tomarlo). Junta qué, cuánto, dónde, cuándo y para qué, y lo pasa con `pedir_tecnico`, sin prometer.
- **Lo único que no alquilamos: balancines, silletas y andamios eléctricos.** Ahí lo dice en una línea y pregunta si le sirve que le coticemos andamios tubulares (nuestra especialidad) y qué trabajo tiene que hacer.
- Montacargas, guinches, tubos de escombro, truss, hormigoneras y herramientas, que antes eran «no hacemos», ahora los define el equipo.
- Prompt `tomas-2026-11-16-lo-que-alquilamos`. Migración `20261116000001_clientes_lo_que_no_alquilamos.sql` **aplicada el 16/11 con el OK de JS**: cambia sólo el renglón «Lo que no hacemos» de `clientes_datos_empresa` (Parámetros). La configuración de Tomás se lee con caché de 1 h, así que el renglón nuevo puede tardar hasta una hora en llegarle.

**16/11: «Copiar para Slack»** (JS: «como todavía no estamos usando todos la plataforma», pasar la charla por Slack). **En producción desde el 16/11** (`791337d` en main). En el encabezado de cada charla, para cualquiera que ve la bandeja:
- **Copiar para Slack** copia al portapapeles un texto con formato de Slack: los datos del cliente (nombre, teléfono, mail, CUIT, tipo, dirección y catastro), el servicio (qué pide, para qué, lo de la bandeja o la obra, la visita y todo el alquiler: lugar, días, alturas, espacio, piso, armado, entrega, presupuesto, aceptación, documentos, retiro), lo que marcó la IA, la pareja asignada, los archivos numerados con un link y la charla completa por día y hora (los audios con la transcripción; en la charla, «[Foto 1]»). El texto lo arma `textoParaSlack` (`src/lib/clientes/para-slack.ts`) en `GET /api/comercial/clientes/conversaciones/:id/slack`, que firma los links de Storage por 30 días (`LINKS_DIAS`): cualquiera con el link ve el archivo hasta que vence. Si el navegador no deja copiar, muestra el texto seleccionado para copiarlo a mano.
- **Bajar archivos** (no en el celular) baja las fotos, PDF y videos de la charla uno por uno, para arrastrarlos a Slack y que queden guardados ahí. El navegador pregunta una vez si deja bajar varios.
- **No manda nada a Slack solo:** los webhooks que hay (`src/lib/alertas/slack.ts`) no suben archivos. Para mandarlo directo a un canal o a una persona con las fotos haría falta un bot de Slack con `files:write`.
- Sigue pendiente que la asignación de técnico les avise al técnico y a la vendedora (hoy no les llega nada).

**16/11: «Asignar» en la charla** (JS: después de «Soltar» no había forma de volver a asignar). **En producción desde el 16/11** (`d4b8617` en main; sin migraciones). Falta que JS lo pruebe en la app. Botón «Asignar» en el encabezado (con la bandeja en «editar»), con dos renglones:
- **Pasar la charla a…** alguien con «WhatsApp de clientes» en «editar» (`equipoBandeja`, ruta `GET /api/comercial/clientes/equipo`): acción `pasar` de `cambiarEstado` (`bandeja.ts`). Si la tiene otra persona, pregunta «Pasarla igual». A quien la recibe le llega a la campanita (`avisarQueLaTiene`, sin Slack). «Soltar» sigue igual: la deja sin tomar.
- **Pareja:** asignar o cambiar técnico y vendedora aunque la tarjeta ya se haya confirmado (`cambiarPareja` en `aprobar.ts`, `POST …/conversaciones/:id/pareja`), con «Avisarle al cliente» opcional (sólo con la ventana abierta). No se puede mientras haya una tarjeta de cotización o asignación abajo: esas traen su propia pareja y la escribirían encima. No aplica la regla de las cuentas de los socios y los que ya son clientes («no se lo pasa a otra»): queda a criterio de quien la cambia. El encabezado muestra «Pareja: Agustina con Joaquín».
- **Al confirmar la pareja en la tarjeta,** si la charla sigue con una persona, queda con la vendedora elegida (`personaPorNombre`, por nombre de pila) y le llega a la campanita; la opción de la tarjeta dice «La sigue la vendedora». Si la vendedora no tiene la bandeja, queda con quien confirmó, como antes. `despuesDeDecidir` ahora mueve la charla sólo si nadie la tomó o la pasó mientras tanto.
- **Para que sirva, a las vendedoras hay que darles «WhatsApp de clientes» en «editar»** (Usuarios). Al 16/11 sólo lo tienen Joaquin y la cuenta «Administrador»: Agustina, Rocío, Tamara y Sandra tienen usuario pero no ese módulo.
- **Pendiente de JS:** ¿«Cambiar pareja» tiene que bloquear, como la tarjeta, a las cuentas de los socios y a los que ya son clientes de una pareja?

**13/11: los días del cliente y sin torre de más** (por la charla con Oscar Brito, que pidió 7 días y a quien Tomás le dijo «el servicio es siempre de 30 días» y le ofreció una segunda torre «sin pagar más»). Decisiones de JS:
- **Tomás nunca habla del mínimo de días, de «30 días» ni del mínimo del servicio.** Pregunta por cuántos días lo necesitan (`dias` en `cotizar_alquiler_simple` y en `PedidoAlquiler`; es un dato que falta si no lo dijo) y respeta ese tiempo.
- **El presupuesto dice esos días con el valor del servicio de 30 días:** «El servicio por los 7 días que lo necesitás, con la entrega y el retiro, sale $ 500.000 + IVA.» Pasados esos días, cada día de más se cobra por día (el valor de 30 días ÷ 30), y así lo dice el presupuesto.
- **En Odoo, la devolución es la entrega + los días que pidió** (antes, + 30). La nota interna y la tarjeta dicen «por N días (precio de 30)». Las cotizaciones armadas antes del 13/11, sin los días, valen como 30.
- **Más de 30 días no sale solo:** lo cotiza un vendedor (motivo `mas_de_30_dias`), porque el precio por más de 30 días no está programado.
- **Nunca se ofrece otra torre ni un módulo más** para llegar al mínimo: `entraSinPagarMas` queda siempre vacío, se borró `sugerenciasMinimo` y el presupuesto ya no dice «es el mínimo del servicio». El mínimo operativo se sigue cobrando igual y lo ve sólo el equipo en la tarjeta.
- **Lo otro de la charla de Oscar, también corregido:**
  - **La dirección:** «Uspallata 2863» no se ubicó porque USIG no respondía en ese momento, y la herramienta le decía a Tomás «No encontré la dirección: pedile calle y altura», así que se la pidió tres veces. Ahora `barrioDeDireccion` distingue `sin_respuesta` (USIG caído o lento) de `no_encontrada`. Con `sin_respuesta`, Tomás no se la vuelve a pedir y la busca de nuevo en la llamada siguiente. Cuando no la encuentra, la pide una sola vez. Además, con el barrio escrito («Uspallata 2863, Parque Patricios, CABA») USIG contesta «calle inexistente»: ahora se reintenta con «calle y altura, CABA» (`sinBarrio`), sólo si lo que sigue a la coma es Capital o un barrio. Probado contra USIG real.
  - **Las alturas:** Tomás no hace cuentas ni tira alturas antes de tener hasta dónde trabaja y el techo; si le preguntan por un módulo, 1,80 m.
  - **El tono:** nada de «no te lo puedo armar así»: lo dice con amabilidad y muestra el camino.
- Prompt `tomas-2026-11-13-charla-de-oscar`.

**12/11 a la noche: mejoras por las charlas de prueba de hoy** (amigos de JS que prueban; se revisaron Debi, Josefina, Tamy, Daniel y la de JS, no la de Ezequiel). **En producción desde el 12/11** (`18f6c7f` en main, desplegado solo por el push; sin migraciones). Las revisó un agente independiente y sus 7 hallazgos están corregidos. Falta que JS lo pruebe por WhatsApp: mandar una foto y un PDF, varios mensajes seguidos y un primer mensaje con el pedido completo.
- **Tomás ve las fotos y los PDF.** `archivoParaModelo` (`agente.ts`) los sube una vez a la Files API de Anthropic (ya no es beta) y guarda `anthropic_file_id` en `cli_hilo.adjunto`; `contenidoDelCliente` (`turno.ts`) los pone en el mensaje, cada uno después de su renglón. Antes de subirlo, la API lo valida y cuenta sus tokens con `count_tokens` (gratis, en base64: con `file_id` no anda), porque la historia es append-only y un archivo rechazado rompería todos los turnos que siguen. No se pasan: los PDF de más de 8 páginas o 10 MB, las fotos de más de 5 MB, lo que pase de 12.000 tokens, lo que la API no acepta, ni más de 15 archivos por charla (con más de 20 imágenes la API achica el máximo a 2000 px). En esos casos queda `anthropic_no` con el motivo y Tomás recibe «la ve el equipo». **Desde que hay un presupuesto de alquiler no se le muestran** (son el DNI y los servicios, que sigue revisando `documentos.ts` sin mostrárselos). Los videos, no. Si una foto se está bajando, espera hasta unos 9 s (`esperarAdjunto`). `borrarCharla` borra también esas copias en Anthropic. Antes Tomás decía «las fotos no las puedo ver» y a Daniel le preguntó 5 veces qué trabajo era, que estaba en el PDF.
- **Una sola respuesta cuando el cliente manda varios mensajes seguidos.** La espera antes de leer pasó de 2,5 a 5 s, y si llega algo mientras Tomás escribe, esa respuesta no sale (queda en la historia con `enviado = false`) y la tanda siguiente contesta todo junto. Nunca en la última tanda, ni en la vuelta de después de soltar el candado, ni si quedan menos de 150 s del plazo del turno (la vuelta extra ahora usa el mismo `inicio`): alguna respuesta sale siempre. Antes Josefina recibió dos respuestas casi iguales.
- **Saludo corto** (`saludoCorto`) cuando el primer mensaje ya trae el pedido: «¡Buen día Debi! Acá Tomás de Andamios Buenos Aires.», sin «Contame en qué te puedo ayudar», y enseguida la respuesta. Con la voz prendida, en ese caso va el texto corto (el audio pregunta en qué ayudar).
- **Alquiler simple:** Tomás ya no explica las condiciones antes del presupuesto (iban dos veces seguidas), no promete «en unos minutos» (tardó 48 y 26 min) y el presupuesto sale en dos mensajes, el precio y después las condiciones con el cierre (`partesDelPresupuesto`; `pasos.partesEnviadas` se guarda después de cada parte, así un reintento no repite el precio; la tarjeta muestra las dos burbujas). Tomás contesta las dudas puntuales sobre las condiciones fijas también después del presupuesto, sin derivar.
- **Prompt** (`tomas-2026-11-12-fotos-y-charlas-de-prueba`): no repetir la pregunta del mensaje anterior, no dar por hecho quién arma, el día ni la altura; confirmar la altura aproximada antes de proponer el peldaño; decir las alturas con las cifras de la herramienta.
- **Pendiente de JS (punto 7 de la revisión):** qué hace Tomás con pedidos fuera de CABA y GBA o fuera de lo común (Josefina: plataformas para un show en Mar del Plata, que terminó en una venta): ¿avisa antes, pregunta si alquila o compra, o sigue juntando datos como hoy?

- **La propuesta** (cerrada por un equipo de agentes y auditada, con las decisiones de JS en la §12): [crm-propuesta.md](./crm-propuesta.md).
- **La maqueta:** [crm-maqueta.html](./crm-maqueta.html), publicada en https://claude.ai/artifact/6mhAeU4umDQLv152rDai8e.
- **Las cuentas de los socios** (borrador para que lo corrija JS): [cuentas-socios.md](./cuentas-socios.md).

---

## Estado al 16/10 (a la tarde)

**En producción y probado por JS el 15/10 a la noche:** un mensaje al número nuevo entra a la bandeja, se toma la charla, se contesta desde la app y le llega al cliente.

| Qué | Dónde | Estado |
|---|---|---|
| Etapa 0: la bandeja (Comercial → WhatsApp de clientes) | `src/lib/clientes/`, `/comercial/clientes` | ✅ En producción, probada |
| Paso 4: qué es fácil, a quién va y el filtro de plata | `facil.ts`, `asignacion.ts`, `filtro-salida.ts` | ✅ En producción |
| Paso 5: Sofía | `turno.ts`, `prompt.ts`, `herramientas.ts`, `agente.ts`; el núcleo compartido con el asistente en `src/lib/ia/nucleo.ts` | ✅ En producción y **prendida** (`clientes_ia_activa = 1`) para las pruebas internas de JS |
| Paso 6: la tarjeta de aprobación y «Revisar charlas» | `aprobacion.ts`, `aprobar.ts`, `tarjeta-aprobacion.tsx`, `/comercial/clientes/revisar` | ✅ En producción. **Todavía no se aprobó nada de verdad** |
| Saludo según la hora | `saludo.ts` (`saludoDelMomento`, `saludoInicial`) | ✅ En producción |
| Guía de trabajos y «Gama alta» (pedido de JS, 16/10) | `clientes_guia_trabajos` (bloque del system), `tarea` en la ficha; `PALABRAS_GAMA_ALTA` en `facil.ts`, `ficha.segmento`, pastilla y orden en `vista.ts` | ✅ En producción, con la migración aplicada |
| Datos de ABA (oficina con cita previa, pagos, zona, 30 años, permisos, seguro, factura A) | parámetro `clientes_datos_empresa` (bloque del system, se edita en Parámetros) | ✅ En producción. Lo que no está ahí, Sofía lo consulta al equipo |
| «Hoy desde las 8» en vez de «hoy a primera hora» | `horario.ts` | ✅ En producción |
| Botón «Borrar» la charla (sólo admin, para probar de cero) | `borrarCharla` en `bandeja.ts`, `DELETE /api/comercial/clientes/conversaciones/:id` | ✅ En producción. No toca Odoo ni el WhatsApp del cliente |
| El nombre del cliente ya no cuenta como «pide una persona» | `facil.ts` (los nombres del equipo cuentan sólo si los pide: «hablar con Jorge», «¿está Gabriel?») | ✅ En producción. Era el motivo de que «a nombre de Joaquín» saliera no fácil |
| La tarjeta del técnico dice por qué la bandeja no salió fácil | `porQueNoFacil` (pedir_tecnico → payload → tarjeta) | ✅ En producción. Sofía sigue viendo sólo el motivo genérico |
| **El agente se llama Tomás** (17/10) | El saludo, el prompt (en masculino), la bandeja, la tarjeta, los eventos y las etiquetas de Parámetros | ✅ En producción (`ce18cdc`, migración `20261021000001` aplicada) |
| **Saludo con nota de voz** (17/10) | `voz.ts` (genera, procesa con ffmpeg, verifica con speech-to-text y guarda en Storage `comercial/voz/saludo/v5/`), `mandarNotaDeVoz` en `envio.ts`, `enviarAudio` en `whatsapp/api.ts`; interruptor `clientes_saludo_voz` | ⏸️ **APAGADO desde el 12/11** (`clientes_saludo_voz` = 0, pedido de JS: «por ahora no quiero que envíe audios»). El código sigue en producción; para volver a prenderlo, poner 1 en Parámetros → Agente de clientes, sin deploy |
| Perfil del WhatsApp de clientes | logo (aro rojo), info «Andamios y bandejas de protección · CABA y GBA», descripción, Maturín 2570, info@…, la web y la categoría | ✅ Cargado por API el 16/10 |

**12/11: el saludo sale sólo como texto.** JS apagó la nota de voz (`clientes_saludo_voz` = 0). Lo que sale hoy es el texto de respaldo de abajo («¡Buen día Carlos! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.»). Lo que sigue en este párrafo describe la voz, que queda programada pero apagada.

**El saludo** (decisión de JS, 15 y 16/10; con voz y con Tomás desde el 17/10). Lo arma el código, una sola vez, y el nombre sale del perfil de WhatsApp. Con la voz prendida, sale **sólo como nota de voz** (WhatsApp le pone la transcripción abajo; JS lo probó el 17/10 y pidió sacar el texto, que repetía lo mismo):
> 🎤 «Hola, Carlos, acá Tomás de Andamios Buenos Aires. ¿En qué te puedo ayudar?» Con la voz de **Gabi** (mendocino), a ×1,50, con el fondo bajo y la voz cerca (desde el 18/10; ver el punto 14, «18/10: menos fondo, más rápido y otro cierre»).

Si el audio falla (o `clientes_saludo_voz` = 0), sale el texto:
> ¡Buen día Carlos! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.

Así están para las pruebas internas. El de lanzamiento, abajo, tiene que decir «asistente digital».

- Hasta las 12:59 dice buen día, hasta las 19:59 buenas tardes y después buenas noches.
- Sin línea de aviso al pie. Si le preguntan, Sofía **nunca niega ser una IA**.
- JS insistió en sacar «digital» y dijo que en Argentina no hay ley que lo exija. Se le explicó que lo piden las condiciones de uso de Claude y aceptó «asistente digital». **No volver a ofrecer esconderlo.**

### Meta (WhatsApp Cloud API)

- **Portfolio** «Andamios Buenos Aires», **verificado** el 15/10 (EMPRENDIMIENTOS Y ESTRUCTURAS S A).
- **App de Meta:** «AndamiosOS» (id 1072332035564720), «Sin publicar», y funciona igual.
- **Número de clientes:** **+54 9 11 7637 8551** (eSIM de Claro). Phone number ID `1403629372834757`, WABA `2233102921415343`.
  - Registrado (CONNECTED, CLOUD_API). El nombre visible está en revisión.
  - La eSIM queda en un celular, **inactiva pero sin dar de baja**: si Meta vuelve a pedir un código por SMS, se activa un rato.
  - **Nunca abrir WhatsApp con ese número en ningún celular:** lo desconecta de la API.
- **Webhook:** `https://andamios-os.vercel.app/api/whatsapp/webhook` (campo `messages`), con la WABA suscripta a la app.
- **Medio de pago:** Visa 4560, en ARS.
- **Variables en Vercel (Production):**
  - `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_CLIENTES_PHONE_NUMBER_ID`;
  - los secretos también están en `.env.local`, con el PIN del número en `WHATSAPP_CLIENTES_PIN`.
- **Token permanente, desde el 16/10 a la noche:** `WHATSAPP_TOKEN` es el del usuario del sistema `andamiosos-api` (id 61595559895577). No vence. Está en Vercel Production y en `.env.local`.
  - Sugerido a JS: pasar a la agencia a «socio» con acceso sólo a los anuncios.
- **⚠️ El 16/10, de 08:39 a 23:11, Meta bloqueó la API** («API access blocked», código 200, en todas las llamadas y con cualquier token). Motivo: la cuenta personal de Facebook de JS, dueña de la app, quedó bloqueada por «actividad inusual» después de muchos cambios de seguridad seguidos. Mientras duró, no entró ningún mensaje y Sofía no podía contestar. Se destrabó cuando JS restauró su cuenta. **Si vuelven a dejar de entrar mensajes, lo primero es probar la API** (por ejemplo `GET /1403629372834757?fields=status`) **y entrar a facebook.com con la cuenta de JS.** Conviene sumar otra persona de confianza como administradora del portfolio.
- **El MCP de Meta** (`whatsapp_business_tools`) está agregado, pero Meta todavía no lo habilitó para la cuenta de JS («Not yet available»).

### Base (Supabase), migraciones aplicadas

- `20261016000001` (bandeja) y `20261016000002` (parámetros de fácil);
- `20261017000001` y `20261017000002` (Sofía);
- `20261018000001` (aprobación);
- `20261019000001` (datos de ABA) y `20261019000002` (guía de trabajos).

Parámetros en Parámetros → Agente de clientes:
- `clientes_ia_activa` = 1;
- modelo Opus 5.5, esfuerzo bajo;
- topes de US$ 1 por teléfono y US$ 15 por día;
- horario de 8 a 17;
- `clientes_telefono_guardia` = +54 11 2734-4214 (columna `texto`);
- `clientes_datos_empresa` y `clientes_guia_trabajos`: texto editable, una línea por dato.

### Decisiones de JS (15/10)

Están todas en la §12 de la propuesta. Las principales:
- la bandeja a $140.000;
- fácil = hasta 25 m.l., con 1 jornada de armado y 1 de desarme;
- siempre «+ IVA»;
- los clientes nuevos se reparten por turno entre Jorge, Gabriel y JS;
- en la etapa 1 aprueba JS;
- la IA atiende las 24 h;
- el número se publica primero sólo en la web.

JS **no quiere** correr los guiones de ataque (`scripts/test-agente-clientes.mts`) ni una lista de teléfonos de prueba: el número no lo tiene nadie y él hace pruebas internas.

## Lo que falta

0. **⚠️ ANTES DE PUBLICAR EL NÚMERO: el saludo (el texto Y el audio) tiene que decir «asistente digital».**
   - El 16/10, JS sacó «asistente digital» del saludo (`CUERPO` en `src/lib/clientes/saludo.ts`, commit `361cb44`) para las pruebas internas: «hasta que lancemos vamos a dejarlo así». El 17/10 confirmó que la versión de lanzamiento del audio se hace después.
   - Desde el 12/11 la voz está apagada y sale sólo el texto (antes salía el audio «Hola, Joaquin, acá Tomás de Andamios Buenos Aires. ¿En qué te puedo ayudar?», y si fallaba, el texto) «¡Buen día Joaquin! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.».
   - Para lanzar: cambiar `CUERPO` y `guionSaludoVoz` en `saludo.ts` (por ejemplo «Hola, Jorge, acá Tomás, asistente digital de Andamios Buenos Aires. ¿En qué te puedo ayudar?») y **subir `CARPETA` en `voz.ts` a la versión siguiente**, así no se reusan los audios viejos.
   - Mientras el número lo tenga sólo JS, no confunde a nadie. Ante un cliente real, Tomás tiene que decir que es un asistente digital: lo piden las condiciones de uso de Claude.
0b. ~~Cargar `ELEVENLABS_VOZ_API_KEY` en Vercel~~: **hecho el 17/10** por CLI (`vercel env add`, a pedido de JS) y redesplegado. El valor es la clave «Sofía saludo» de ElevenLabs, la misma que está en `.env.local` como `ELEVENLABS_API_KEY` (en `.env.local` no hay `ELEVENLABS_VOZ_API_KEY`: para generar saludos desde la Mac, copiarla con ese nombre). Tiene permisos de TTS y speech-to-text. La `ELEVENLABS_API_KEY` de Vercel es otra (la de transcribir) y no se toca.
1. **Que JS pruebe a Tomás** (el saludo con voz, el catastro, «¿sos un bot?», un descuento, «tabla floja») y la tarjeta. **Aprobar crea una orden real en Odoo** (en borrador): borrarla después, o usar «Lo tomo yo».
2. **La plantilla de Meta «Tu presupuesto está listo»**, con el PDF de encabezado, para mandar con la ventana de 24 h cerrada. Hoy queda «falta la plantilla».
3. **Paso 2b:**
   - ✅ **Hecho el 16/10 a la noche:** la búsqueda del cliente en Odoo (`identificarCliente` en `src/lib/odoo/comercial.ts`). Busca por `phone_sanitized` en partners, contactos y leads, con y sin el 9 del celular (`variantesTelefonoOdoo`), y por CUIT si lo dio. Devuelve F5 (orden confirmada en 12 meses), F7 (facturas vencidas) y la última orden ganada para la asignación. Si Odoo no contesta, sigue contando como «no se pudo revisar».
   - Falta: el «lead sin orden», `pedidos_presupuesto` y el botón «Presupuestar».
4. **Cargar en Parámetros** las cuentas de los socios y «Hoy no estoy»; las parejas están en el código (`PAREJAS_15_10`).
5. ~~Confirmar con JS el apellido de Gabriel~~: JS confirmó el 16/10 que «Gabriel Stepansky» está bien.
6. ~~El token permanente~~: hecho el 16/10 (usuario del sistema, no vence).
7. **Más adelante:**
   - el paso 8, que es el seguimiento con plantillas y consentimiento;
   - el paso 9, el alquiler simple fácil (ver el punto 13);
   - limpiar las WABA viejas del portfolio;
   - publicar el número en la web.
8. **Analizar los chats de clientes del celular corporativo de JS para mejorar a Sofía** (idea de JS, 16/10).
   - **Dónde quedó:** el iPhone corporativo (iPhone 16 Pro Max, **WhatsApp Business**) tiene los chats. El WhatsApp de la Mac es el personal y WhatsApp Web no guarda la historia. WhatsApp no exporta todo junto desde el iPhone, así que el camino es:
     1. una copia de seguridad del iPhone **en esta Mac, SIN encriptar** (Finder → el iPhone → General → «Respaldar todos los datos del iPhone en esta Mac» → «Realizar respaldo ahora»). JS la empezó el 16/10, se tuvo que ir y la canceló;
     2. darle a la app **Terminal** «Acceso total al disco» (Configuración del Sistema → Privacidad y seguridad). macOS no deja que Claude lea `~/Library/Application Support/MobileSync/Backup`, así que el comando lo corre JS en Terminal;
     3. exportar con el programa libre **WhatsApp Chat Exporter**: `pip install whatsapp-chat-exporter`, después `wtsexporter -i --business -j` hacia `~/Documents/clientes-sofia`, **fuera del repo y nunca en GitHub** (son datos personales de clientes);
     4. anonimizar (nombres, teléfonos, CUIT, direcciones) y analizar con un equipo de agentes: tono de JS, preguntas por tipo de trabajo, objeciones, señales de cada tipo de cliente, preguntas frecuentes, por qué se pierden. El resultado es una propuesta de cambios a la guía de trabajos, los datos de ABA y las instrucciones de Sofía, que **aprueba JS**. Los precios viejos no se usan;
     5. al terminar: **volver los respaldos del iPhone a iCloud** y **borrar la copia local** (Administrar respaldos…).
   - **Ojo:** el iPhone tiene unos 247 GB usados y la Mac unos 79 GB libres. La copia entra sólo si las fotos están en Fotos de iCloud. Si no entra, la alternativa paga es iMazing.
   - **Avance del 16/10 a la noche:**
     - La copia se hizo en un SSD externo (`/Volumes/IphoneSSD`, APFS) con `idevicebackup2` (Homebrew, `libimobiledevice`), porque Finder se trababa. iOS 26 pide el código del iPhone en cada respaldo: hay que ponerlo enseguida, si no la copia falla con «version exchange».
     - Se cortó a los 37 GB, a propósito: la base de WhatsApp Business ya estaba copiada.
     - **La fuente quedó en `~/clientes-sofia/fuente/`** (fuera del repo y fuera de iCloud, carpeta 700): `ChatStorage.sqlite`, `ContactsV2.sqlite` y `LID.sqlite` de WhatsApp Business. Son 133.554 mensajes y 4.017 chats individuales, del 23/12/2014 al 16/10/2026. Para abrirla: `sqlite3 "file:…?immutable=1"`.
     - El iPhone también tiene el WhatsApp común (2,8 M de mensajes, personal de JS): **no se toca**.
     - **Limpieza:**
       - ✅ el enlace `~/Library/Application Support/MobileSync/Backup` → SSD se deshizo el 16/10 a la noche: `Backup` volvió a ser la carpeta de la Mac;
       - falta (lo hace JS): borrar la carpeta `iPhoneBackup` del SSD (37 GB, con todo el teléfono, incluido el WhatsApp personal) y volver a activar Respaldo en iCloud en el iPhone.
     - **Exportado y anonimizado** con un script propio (SQL directo): `~/clientes-sofia/anon/chats/Cxxxx.txt`, `anon/indice.csv` y `privado/mapa.csv` (id → teléfono y nombre, sólo para JS). Son 3.995 chats: 3.007 de clientes, 627 dudosos, 352 otros y 9 del equipo. Quedan algunos nombres de pila sin tapar (los que los clientes escriben en minúscula): sirve para uso local, pero hay que mejorarlo antes de compartir algo.
     - **Analizado** por un equipo de 36 agentes (28 lotes → 6 síntesis → propuesta → revisión), el 16/10 a la noche. Resultado: **[analisis-chats-propuesta.md](./analisis-chats-propuesta.md)**, sin datos personales (verificado contra la agenda; JS pidió que vaya al repo). Las síntesis por tema quedan en `~/clientes-sofia/analisis/`.
     - **JS contestó las preguntas el 16/10** (están arriba de todo en la propuesta) y los cambios se aplicaron en la rama `feat/sofia-analisis-chats`: el prompt, los motivos nuevos de derivación, la prioridad en la bandeja, el detector de contestadores automáticos, la bandeja para silleteros, el tiempo de obra y la gama alta ampliada. Los textos de Parámetros van en la migración `20261020000001`, que sólo pisa el texto si sigue siendo el original (lo era el 16/10).
9. ~~Sumar palabras de «gama alta»~~: hecho en la rama `feat/sofia-analisis-chats` (Layher, instituciones, industria y licitaciones, aprobado por JS el 16/10). Se suman más en `PALABRAS_GAMA_ALTA` de `facil.ts`.
9b. ✅ **Fachada: media sombra siempre; bandeja si puede pasar gente abajo** (JS, 17/10).
   - En una charla de prueba, Tomás preguntó si además del andamio necesitaban la bandeja.
   - JS: la bandeja va siempre que pueda haber gente circulando por debajo mientras trabajan; la media sombra, en fachadas siempre (contiene polvo, salpicaduras, el agua del hidrolavado y el revoque, que caen sobre la bandeja).
   - Tomás ya no pregunta ninguna de las dos en una fachada a la calle. En un contrafrente o un patio interno pregunta si circula gente por abajo. Las dos van en el resumen.
   - Cambios: la guía de trabajos (decía «casi siempre con bandeja abajo»; migraciones `20261021000002` y `…03`, aplicadas) y `prompt.ts` (versión `tomas-2026-10-17-bandeja-mediasombra`).
10. **Búsquedas laborales por Slack** (idea de JS, 16/10): que Sofía junte los datos de quien busca trabajo (nombre, puesto, zona, experiencia) y los mande ordenados por Slack al responsable de personal. Hoy sólo le dice «le paso tu mensaje al responsable de personal» y deriva con `fuera_de_tema`.
11. **Lo que quedó de la propuesta del análisis de chats:** D4 (campos nuevos en la ficha: altura en metros, tiempo de obra, quién arma, silleteros, etapa de decisión, quién decide, origen), D7 (cliente que vuelve, depende del paso 2b), D8 (aviso si un pedido pasa 24 a 48 h sin respuesta) y la bandera `urgente` para «para hoy» y «para mañana».
12. ~~Confirmar el echeq~~: JS confirmó el 16/10 que se acepta (transferencia o echeq, nunca efectivo).
13. **Alquiler simple que cotiza Sofía (pendiente; JS quiere trabajarlo bien en otra sesión, 16/10).** La idea es un «alquiler simple fácil», como la bandeja: reglas escritas, borrador con el cotizador de la app y la misma tarjeta de aprobación.
   - **18/10: borrador en [alquiler-simple-propuesta.md](./alquiler-simple-propuesta.md)**, con lo que explicó JS (cómo se arma el módulo, la altura, los tablones, las ruedas y los tornillones) y lo que se cobra de verdad en Odoo:
     - se cotiza por **módulo armado** con los productos de Odoo, no con la lista por pieza de la app;
     - $ 13.000, $ 16.000 o $ 18.000 por pieza, según los días;
     - el flete por barrio de la tanda del 31/3/2026;
     - el mínimo operativo de $ 500.000 netos, con el flete incluido.
   - JS ya confirmó estas tres cosas y también las condiciones de la §6: la entrega nunca en el mismo día, el DNI y los servicios con la dirección verificada, gente para descargar y el retiro con un día de anticipación.
   - **✅ 12/11: JS contestó las 13 preguntas** (la tabla está en la §11 de la propuesta, y la propuesta ya está reescrita con las respuestas). Lo que más cambia:
     - al cliente se le pasa **un solo precio por el servicio de 30 días, con la entrega y el retiro**, aunque lo use menos; lo que pasa de 30 días (y lo que corre si no avisan) es proporcional a ese total, por día;
     - la baranda va siempre en el precio: si no la quiere, no se lleva pero se cobra;
     - las ruedas y los tornillones salen $ 36.000 los 4;
     - con techo bajo, como excepción, 1 tablón en un peldaño de la escalera del bastidor; si no sirve, a un vendedor (no se ofrecen escaleras);
     - los documentos se piden a todos, después de que acepta el precio; si el DNI no coincide se acepta, porque los servicios dicen dónde vive hoy;
     - las franjas de entrega y retiro: de 8 a 12 o de 13 a 16; los sábados de 8 a 12; ni domingos ni feriados; una franja de una hora con un 20 % de recargo;
     - el retiro se pide a este WhatsApp con 24 h, con los andamios desarmados y gente para subirlos (los choferes no entran por el seguro).
   - **Las 2 dudas que quedaban, contestadas el 12/11:** la plataforma en un peldaño se cobra igual que el módulo completo, y el recargo del 20 % es sobre el total del servicio. **Sigue programar según la §10 de la propuesta.**
   - **Las preguntas del 18/10, ya contestadas** (quedan como historia):
     1. los márgenes de altura: la persona alcanza plataforma + 2 m y la cabeza necesita plataforma + 1,90 m;
     2. cuántos tablones lleva el pasillo de 0,90 (¿3?);
     3. si el flete por barrio cubre la entrega y el retiro;
     4. el precio de las ruedas (¿$ 30.000, o subió a $ 47.000 o $ 60.000?) y el de los tornillones (propuesta: $ 9.000 cada uno);
     5. los techos bajos: si con 1 módulo no entra la cabeza (hacen falta 3,85 m de techo), ¿los tablones van más abajo, se arma sin ruedas o va a un vendedor?;
     6. si el pasillo y el junior también se apilan hasta 3 sin anclar;
     7. más de 30 días: ¿se cobra por mes o fracción?;
     8. si se cotiza sin baranda cuando el cliente insiste (propuesta: con 1 módulo sí, con 2 o más no);
     9. el tope de módulos para que salga solo (propuesta: 10);
     10. la medida de la rienda JR diagonal: ¿1,65 m (como dice Odoo) o 1,77 m?;
     11. los documentos:
         - ¿se piden siempre, o no a una empresa ni a un cliente que ya alquiló?;
         - ¿en qué momento? (propuesta: al aceptar el presupuesto; sin documentos no se entrega);
         - ¿dónde se guardan? (propuesta: adjuntos en la orden de Odoo);
         - si la dirección no coincide, ¿Tomás avisa y sigue, o el alquiler queda frenado?;
     12. si vence y no avisaron, ¿cómo se cobra lo que sigue corriendo: por día, por semana o un mes entero?;
     13. a qué número se avisa el retiro (este WhatsApp o el 11 2734-4214) y si hay días sin entregas ni retiros.
   - **Después de las respuestas:** ajustar la propuesta y programarla según su §10 (`alquiler-simple.ts`, la herramienta `cotizar_alquiler_simple`, el paso de documentación, el flete leído de Odoo y la tarjeta de aprobación). Lo que sigue más abajo en este punto es de antes y quedó superado por la propuesta.
   - **Por qué:** es un tercio de los pedidos (unos 1.000 de 3.000 chats) y donde más se pierde por demora: unos 145 chats terminan en «te va a contactar ventas».
   - **Lo que ya existe en el cotizador:**
     - la «Lista de alquiler junio 2026» (`lista_alquiler` y `lista_alquiler_piezas`, 48 piezas por componente);
     - el canon de 30 días es la lista más `alquiler_recargo_lista_pct` (80 %);
     - el período mínimo es de 30 días (`periodo_minimo_dias`) y la renovación es al 100 %;
     - los fletes: GBA cercano $ 850.000 y La Plata $ 2.500.000; **el de CABA no tiene monto** («según volumen y acceso»);
     - el módulo del motor es `cotizarAlquiler` en `src/lib/cotizador/alquiler.ts`.
   - **Lo que hay que definir con JS (y Tamara) antes de programarlo:**
     1. el flete en CABA: un monto fijo, escalones por cantidad, o que al principio sólo salga fácil si retira en el depósito;
     2. qué es un «cuerpo» o «módulo» en la lista: el cliente pide módulos y la lista está por componente (¿módulo STD = 1 bastidor de 1,30 m?). Sofía no puede deducirlo, porque sería calcular la estructura;
     3. **la lista con el 80 % no coincide con lo que se cobra en Odoo.** En las órdenes desde julio, el módulo STD sale entre 13.000 y 18.000 (la lista da unos 15.500: parecido), pero la baranda sale 13.000 a 18.000 (la lista da unos 6.200), el tablón de 2,50 sale 13.000 a 18.000 (la lista da unos 22.200) y el juego de 4 ruedas, 30.000 (la lista da unos 160.000). Hay que decidir cuál vale. En Odoo los productos tienen precio de lista 1: el precio lo escribe a mano quien arma la orden;
     4. el tope de cantidad para que salga solo y si hay que chequear stock.
   - **Reglas propuestas para «fácil»:** el cliente sabe qué piezas quiere (sin calcular nada), todas están en la lista, retira o es una entrega en CABA con flete definido, sin palabras de alerta y sin deuda (F7 ya existe).
   - **12/11: EN PRODUCCIÓN** (mergeado a main en `09e4fe0`, desplegado como `andamios-d1mp5x9g6`, con las migraciones `20261112000001` (parámetros) y `20261112000002` (carril «alquiler») aplicadas). **Nunca se probó contra Odoo, Claude, USIG ni Storage de verdad: la primera prueba la hace JS por WhatsApp.** Si al aprobar falla Odoo (por ejemplo, si no acepta `is_delivery` en el create), la tarjeta queda en error con Reintentar y no se le manda nada al cliente. Programado así: Quedó lo de la §10: el motor puro (`src/lib/clientes/alquiler-simple.ts`: la plataforma arriba o en un peldaño, torres, precio de 30 días, mínimo, recargo de franja, renovación, la modalidad envío o depósito, fechas de la §6 y motivos de la §8), el lado de Odoo (`src/lib/odoo/alquiler-simple.ts` y [alquiler-simple-odoo.md](./alquiler-simple-odoo.md): fletes 354-450 por barrio de CABA con USIG, líneas de la orden como las arma Tamara, orden en borrador idempotente, adjuntos), Tomás (`cotizar_alquiler_simple`, `cliente_acepta_alquiler`, `revisar_documentos`, `pedir_retiro`, el bloque del prompt y los documentos clasificados por el servidor con Haiku, sin que Tomás vea datos ni montos) y la tarjeta del carril «alquiler» con Aprobar, Corregir y Reintentar (`aprobacion-alquiler.ts`, `aprobar.ts`). Todo con dobles: nada se probó contra Odoo, Claude, USIG ni Storage de verdad.
     - **12/11 a la tarde, las decisiones nuevas de JS (filas 16 a 21 de la §11 de la propuesta), ya programadas en la misma rama:**
       - **sólo se entrega y se retira en CABA:** los 46 métodos de envío del conurbano no se usan (`BARRIOS_CABA_EN_LISTA`); en provincia no hay flete y Tomás ofrece retirarlo en el depósito (si no puede, no es alquiler simple);
       - **el retiro en el depósito** (Cucha Cucha 2345, días hábiles de 10 a 12 y de 13 a 16, con 24 h hasta la franja): modalidad nueva, también para CABA (`retira_en_deposito` en la herramienta). Sin flete pero con el mínimo; sin recargo de franja; condiciones propias en el prompt y en el presupuesto (sin chofer ni camión, viene con su vehículo y gente, devuelve desarmado con 24 h de aviso). En Odoo, sin línea de flete ni `carrier_id`, la dirección de la obra «RETIRA DE CUCHA CUCHA 2345 - DEPOSITO ANDAMIOS BUENOS AIRES», como Tamara marca hoy las que retiran, y una nota de condiciones propia (sin la de la plantilla, que habla del camión y del pagaré). `pedir_retiro` sirve también para la devolución en el depósito;
       - **Belgrano a secas → BELGRANO C** (alias en `src/lib/odoo/alquiler-simple.ts`);
       - **el peldaño en cualquier módulo**, como alternativa: en el techo, la plataforma más alta que deja entrar la cabeza; si no llega cómodo, se cotiza y Tomás se lo aclara para que lo confirme (`acepta_plataforma`, antes `acepta_peldano`). Ya no hay margen de 50 cm: a un vendedor sólo lo que no tiene ninguna plataforma posible o hay que anclar;
       - **la vendedora es siempre Tamara** (res.users 73, `VENDEDORA_ALQUILER_SIMPLE` en `aprobar.ts`), también en la oportunidad;
       - **el pagaré no lo pide Tomás** (es administrativo): ningún texto para el cliente ni el prompt lo nombran (con test);
       - la renovación por día no lleva el recargo de franja (ya estaba así; con test).
     - **Después, tres decisiones más de JS (filas 22 a 24) y los arreglos de una revisión independiente, también en la rama:** el depósito es **Cucha Cucha 2345** (Maturín 2570 es la oficina); en provincia, si no puede retirar en el depósito, **Tomás le dice con amabilidad que no llegamos con entregas a provincia, sin derivar**; **de 12 a 13 no se entrega ni se retira** (ninguna franja ni hora cae ahí, con test). De la revisión: una pared que ninguna plataforma alcanza con la cabeza adentro se cotiza con la más alta y se confirma (antes iba a un vendedor; ej. techo 3,20 y pared hasta 3 m, o techo 6 y pared hasta 5,80); el retiro en el depósito exige 24 h hasta el comienzo de la franja también al cotizar, al aceptar y al aprobar; un techo de hasta 7,65 m sale con 3 módulos y de 7,70 a 8 m se confirma (más de 8 m, anclar); si lo que pidió el cliente no llega, se cotiza «lo que sí le sirve» o «lo que más se acerca», sin cambiar el piso completo por un tablón en peldaño que tampoco llega; la nota interna ya no pasa el pedido a minúsculas; un presupuesto viejo con flete del conurbano da provincia. `VERSION_PROMPT` = `tomas-2026-11-12-alquiler-deposito-cucha-cucha`.
     - **Migraciones a aplicar antes de desplegar (no están aplicadas):** `20261112000001_alquiler_simple_parametros.sql` (las 6 claves de Parámetros) y `20261112000002_carril_alquiler.sql` (el CHECK de `carril` acepta «alquiler»). Las decisiones de la tarde no agregan migraciones.
     - **Falta para producción:** aplicar las dos migraciones; una prueba de punta a punta con una charla y una orden de prueba (el alta de cliente, la orden en borrador con flete y retirando en el depósito, sobre todo que Odoo acepte `is_delivery` en el create, los adjuntos y una foto real de DNI y de un servicio con Haiku); ver la tarjeta en el navegador con sesión.
     - **Lo que JS tiene que contestar:** si el techo de 7,70 a 8 m con 3 módulos (confirmando que no llega cómodo) y el corte de anclar en 8 m le sirven; si en la orden del depósito el desplegable «Horario Entrega» queda vacío a la mañana (10 a 12 no está en la lista; la tarde va como «13:00 - 16:00»); los barrios dudosos de USIG (casos como Vera 1357 que da Chacarita y no Villa Crespo); si quiere un producto propio para el recargo de franja; si las 24 h del retiro se cuentan hasta la franja; y si los dos servicios tienen que tener la misma dirección.
14. **Saludo con voz (en pruebas, 16 y 17/10; JS sigue probando: «suena raro, no me termina de cerrar ninguno»).**
   - **La idea:** que el saludo sea una nota de voz con el nombre del cliente («¡Buen día Jorge!…»), por cercanía. Un panel de expertos lo analizó: [saludo-voz-propuesta.md](./saludo-voz-propuesta.md). Recomienda audio y después el texto (no sólo audio), con un A/B por la mitad de las charlas y sin audio para la gama alta. JS quiere el nombre del cliente en el audio.
   - **Guion de prueba** (el de las pruebas internas, sin «asistente digital»; **al publicar el número, el audio también tiene que decir «asistente digital»**): «¡Buen día Jorge! ¿Cómo estás? Acá Sofía de Andamios Buenos Aires. Contame... ¿en qué te puedo ayudar?».
   - **Lo que se probó** (página de muestras: https://claude.ai/artifact/MNr2JA9b3uHHsrPhJWzyoS):
     1. cinco voces argentinas de la biblioteca: Lore (la del agente de voz, cordobesa), Sofía (`h60rOzgfLmYsntfqgGu2`), Melanie, Agustina y Martina. **JS eligió la voz «Sofía»**;
     2. el modelo rápido `eleven_flash_v2_5` (0,9 s por audio) a velocidad 1,05 / 1,10 / 1,15. A JS le gustó, pero el cierre «Contame...» sonaba cortado, también con `<break>`, con coma y con más expresividad;
     3. **`eleven_v3`, el más real**, con la etiqueta `[warmly]`. Es el que más le gustó a JS, pero lo encontró lento. Tarda unos 2,5 s en generarse. **v3 ignora `speed`**, y la etiqueta `[speaking quickly]` casi no cambia nada: se aceleró con ffmpeg (`atempo` 1,10 a 1,20, sin cambiar el tono). Una vez se comió una sílaba («Andami Buenos Aires»): en producción, cada audio nuevo se verifica con speech-to-text y se regenera si no coincide;
     4. ambiente de fondo: primero un ruido sintético (casi no se oía) y después una oficina con teclado, generada con la API de efectos de ElevenLabs, a tres niveles. **JS: «suena raro».**
   - **Lo técnico ya resuelto:** ElevenLabs entrega directo `opus_48000_32` en contenedor Ogg (`OggS`), el formato de nota de voz de WhatsApp, sin convertir. El audio se guarda por nombre, para generarlo una sola vez. Los scripts y las dos tomas de oficina están en `scripts/sofia-voz/`.
   - **La clave de ElevenLabs para estas pruebas** está en `.env.local` (`ELEVENLABS_API_KEY`, «Sofía saludo»), con permisos de TTS, voces, efectos de sonido y speech-to-text. En Vercel hay otra clave, la de transcribir los audios.
   - **17/10: Eleven v4** (salió el 28/9). Tu cuenta tiene `eleven_v4` y `eleven_v4_turbo`.
     - Muestras con la voz «Sofía» comparadas con v3, generadas con `scripts/sofia-voz/generar-v4.py`: https://claude.ai/artifact/M58oMr4JiVgq9uCBxaWcFD.
     - v4 hace una pausa real en «Contame... ¿en qué…?», que en v3 sonaba cortada. También habla más lento: 7,1 s contra 5,7 s.
     - v4 también ignora `speed`. Se acelera con ffmpeg (`atempo` 1,12).
     - En speech-to-text, v4 y el Turbo a velocidad normal dijeron el texto exacto. El Turbo con velocidad 1,12 se comió «Andamios» 2 veces de 3.
     - **Ronda 2 (17/10), a pedido de JS:** le gustó v4, pero la calidez de `[warmly]` le pareció exagerada y pidió algo más normal, una voz de mujer y una de hombre y más ruido de fondo.
       - Va sin etiqueta, con estabilidad 0,85.
       - Mujer: «Sofía». Hombre: «Tomás» (`QK4xDwo9ESPHA4JNUpX3`), con «Leandro» (`6NviSCQ9jcQTnryEFRc1`) de alternativa.
       - Las etiquetas de ambiente en el texto, como «[in a busy office]», no agregan ruido en v4: se midió el piso de ruido. El fondo se mezcla con `scripts/sofia-voz/mezclar-v4.py`.
       - Los ambientes son `amb-v4-oficina.mp3` y `amb-v4-deposito.mp3`, a -30 LUFS (medio) o -26 LUFS (notorio). La voz queda en -16 LUFS y acelerada ×1,10.
       - Las mezclas en «notorio» dan el texto exacto en speech-to-text.
     - **Ronda 3 (17/10):** saludos cortos, de unos 4,4 s, con Sofía y Tomás (`generar-cortos.py`). A JS le gustaron «mucho más».
       - El candidato es el A: «¡Hola Jorge, buen día! Soy Sofía, de Andamios Buenos Aires. ¿En qué te ayudo?».
       - Para el lanzamiento: «Soy Sofía, asistente digital de Andamios Buenos Aires».
     - **Ronda 4 (17/10):** la oficina tranquila le sonó a call center y pidió «bastante más quilombo».
       - Hay cuatro fondos nuevos: oficina caótica, depósito u obra, vereda y camioneta (`amb-q-*.mp3`, generados con `ambientes-quilombo.py`).
       - Van a -23 LUFS (fuerte) o -20 LUFS (muy fuerte), con la voz en -16 LUFS. En «muy fuerte», el speech-to-text sigue dando el texto exacto.
     - **Ronda 5 (17/10):** ninguno de los fondos de la ronda 4 le cerró a JS («se nota muy falso»).
       - Pidió sólo la voz de hombre, Tomás, y que no vuelva la de mujer.
       - Los cuatro saludos cortos (A a D) van limpios o con `nota-de-voz.py`: eco de cuarto chico, micrófono de celular y ruido de sala bajo, sin fondo inventado.
       - La página de muestras ya tiene sólo a Tomás.
       - Pendiente: si la voz es de hombre, ¿el agente sigue llamándose Sofía?
       - Lo más natural sería un fondo grabado de verdad en la oficina o el depósito.
     - **Ronda 6 (17/10): JS eligió el saludo H.**
       - Texto: «Jorge, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?».
       - JS prefiere nombrar la empresa: el cliente suele pedir precio en varios lados.
       - Pidió el saludo más rápido y que suene a «audio de WhatsApp, no un mic mega prolijo».
       - `audio-whatsapp.py` arma el audio:
         - velocidad ×1,15 o ×1,22;
         - eco de cuarto;
         - fondo (sala, oficina o depósito) debajo de la voz, antes de pasar por el micrófono;
         - el micrófono del celular y el volumen automático (`dynaudnorm`);
         - salida en Opus a 24 kb/s y 16 kHz, en `.ogg`, que es lo que se mandaría por WhatsApp.
     - **Ronda 7 (17/10):** a JS le gustó «depósito, rápido» (×1,15) y pidió más fondo y la voz un poco más lejos del micrófono.
       - El modo `lejos` de `audio-whatsapp.py` arma el depósito a -19 o -16 dB de la voz, con la voz a distancia «media» o «lejos».
       - Antes el depósito iba a -23 dB, con la voz «cerca».
       - JS eligió **«mucho más fondo, lejos»**: -16 dB y la voz lejos.
     - **Ronda 8 (17/10):** tres entornos de oficina con el depósito y los caños atrás, con la configuración elegida.
       - `amb-ofidep-1.mp3`: la puerta al depósito abierta.
       - `amb-ofidep-2.mp3`: los caños del otro lado de la pared.
       - `amb-ofidep-3.mp3`: la oficina caótica más el depósito filtrado.
       - Se arman con `generar-ambiente.py` y el modo `ofidep` de `audio-whatsapp.py`.
       - Falta que JS elija el entorno.
     - **✅ ELEGIDO (17/10):**
       - Saludo H con la voz de Tomás (`QK4xDwo9ESPHA4JNUpX3`) en `eleven_v4`, estabilidad 0,85, sin etiquetas.
       - Velocidad ×1,15, con el fondo **`amb-ofidep-1.mp3`** a -16 dB de la voz y la voz «lejos».
       - Se procesa como un audio de WhatsApp: `audio-whatsapp.py`, `armar(1.15, "ofidep-1", -16, "lejos", …)`, en Opus a 24 kb/s.
     - **Programado y desplegado el 17/10** (`ce18cdc`): el agente pasa a llamarse Tomás en todos lados (decisión de JS) y el saludo sale como nota de voz y después el texto (ver la tabla de arriba). La versión de lanzamiento con «asistente digital» queda para después (punto 0).
       - Cómo funciona: `voz.ts` genera con v4, procesa con la misma cadena de `audio-whatsapp.py` (con `ffmpeg-static`), transcribe y compara (`audioDiceElGuion`: si se come el nombre o «Andamios», lo genera de nuevo; dos intentos), guarda en Storage por nombre y lo manda con `voice: true` (nota de voz). La primera vez tarda unos 4 s; después, 0,3 s.
       - Probado desde la Mac contra Storage: `buenas-tardes-joaquin.ogg` quedó generado (Ogg/Opus, 4,9 s, 14 KB).
       - **Probado por JS el 17/10 a las 13:52:** llegó como nota de voz (con la onda, el micrófono y el logo) y WhatsApp mostró la transcripción. Desde `5ef0f1c` sale sólo el audio. Si en el celular llega como audio común y no como nota de voz (sin la onda ni la foto del perfil), Meta ignoró `voice: true`: revisar el formato.
     - **Ronda final (17/10 a la tarde): «demasiado perfecta».** A JS le dijeron que la voz de Tomás sonaba demasiado perfecta.
       - Se probó con menos estabilidad, con «eh» y con respiración (`menos-perfecto.py`).
       - JS mandó un audio suyo de referencia: «Hola, Jorge, acá Joaquín de Andamios Buenos Aires. Contame en qué te puedo ayudar». Queda en `~/Downloads`; no está en el repo.
       - Comparado: la misma velocidad (3,5 palabras/s), pero la voz de JS sube y baja (LRA 4,6 LU) y la de Tomás sale pareja (1,0 LU). La voz de ElevenLabs ya sale bastante pareja aun con estabilidad baja.
       - Speech-to-speech (la grabación de JS con la voz de Tomás) daría la entonación de JS, pero la clave «Sofía saludo» no tiene ese permiso (401). Además el nombre cambia en cada charla: habría que grabar una versión sin nombre.
       - **✅ ELEGIDO Y EN PRODUCCIÓN (`4b68f81`):**
         - el texto de JS con Tomás: «Hola, Jorge, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.»;
         - estabilidad **0,2**, a **×1,25**;
         - la voz **a un metro del celular**: el modo `1m` de `audio-whatsapp.py`, con más cuarto que voz directa (4:6), el eco con 8 ms de retraso, sin graves de cercanía (highpass de 180 Hz) y el fondo 3 dB más arriba;
         - mismo fondo (oficina + depósito 1);
         - los audios en `voz/saludo/v2/`, uno por nombre (ya no por momento del día). `joaquin.ogg` y `jorge.ogg` ya están generados.
       - **Después, el mismo 17/10 (`0deb37c` y el commit de la voz de Gabi):**
         - **El cierre:** le dijeron que «en qué te puedo ayudar» sonaba robótico. Tomás lo decía de un tirón (0,04 s entre «Contame» y «en»); en el audio de JS hay una pausa de 0,22 s. Se probaron seis cierres (`cierre.py`) y JS eligió **«Contame... en qué te puedo ayudar.»** (con puntos suspensivos, pausa de 0,48 s).
         - **La voz:** Tomás le sonaba a locutor. Se probaron seis voces conversacionales (`otras-voces.py`) y le gustó Lalo (más grande, del norte). Con seis más «al estilo de Lalo» (`otras-voces.py … como-lalo`), eligió **Gabi B, mendocino** (`xDZJO6bbSnscJEAbhpRF`). La búsqueda de voces similares de ElevenLabs devolvía casi todas de otros países.
         - **La velocidad:** JS eligió **×1,40** (modo `velocidades` de `audio-whatsapp.py`). A ×1,35 o más el transcriptor entiende «Andamis», aunque se escuche bien. Por eso **el control ahora transcribe la voz cruda**, antes de acelerarla y procesarla: sigue detectando cuando ElevenLabs se come una sílaba, y la aceleración no cambia las palabras.
         - Los audios pasan a `voz/saludo/v4/`. `joaquin.ogg` y `jorge.ogg` ya están generados.
         - El agente se sigue llamando Tomás aunque la voz sea otra: el audio dice «acá Tomás».
         - **Control del nombre por cómo suena (17/10):** el primer cliente de prueba, «iair», recibió sólo el texto. El audio estaba bien, pero el transcriptor escribió «Jair» y el control exigía el nombre letra por letra. Ahora el nombre se compara por cómo suena (h, b/v, s/z/c e y/ll/i iguales), con una letra de diferencia (dos si el nombre tiene 7 o más; ninguna si tiene 3) y sólo contra lo que no es parte del resto del saludo. Pasan Iair/Jair, Brian/Bryan y Yésica/Jésica; «José» por «Jorge» sigue sin pasar. `iair.ogg` ya está generado.
       - «Más lejos» y «muy lejos» (cambios chicos) no se notaban. A 3 metros, speech-to-text entendía «José» por «Jorge»: el control lo descartaría.
     - **18/10: menos fondo, más rápido y otro cierre.** JS: el fondo estaba muy fuerte y no se llegaba a escuchar bien la voz, y lo quería un poco más rápido.
       - Muestras: https://claude.ai/artifact/7w1ujTeknnZc1nLyETKaYd (la versión 1 tiene las seis de fondo y velocidad; la 2, los diez cierres). Se arman en el scratchpad con la misma cadena de `voz.ts`, cambiando la velocidad, el nivel del fondo y la mezcla seco:eco.
       - Con el fondo de antes, el transcriptor entendía «Pepín» por «Joaquín» en el audio final. Con el fondo bajo, entendía todo.
       - JS eligió **D**: ×1,50, el fondo a -43 LUFS (12 dB más bajo; antes -31) y más voz directa que eco (6:4; antes 4:6, «a un metro»). A ×1,60 el transcriptor ya entendía «Andami».
       - El cierre «Contame... en qué te puedo ayudar.» le sonaba raro. Se probaron otras tomas de la misma frase, el cierre más lento (×1,20 desde «Aires») y cinco frases. Eligió **H: «¿En qué te puedo ayudar?»**, sin «Contame».
       - En producción (`guionSaludoVoz` en `saludo.ts` y `FILTRO` en `voz.ts`); los audios pasan a `voz/saludo/v5/` y se generan de nuevo la primera vez que entra cada nombre. El texto de respaldo (si el audio falla) sigue diciendo «Contame en qué te puedo ayudar.».
   - **Si se quiere seguir mejorando:** grabar una voz real con consentimiento, o speech-to-speech con una clave que tenga ese permiso. Lo elegido ya está programado y en producción (`voz.ts`).
   - **VoiceStudio (18/10, para ver más adelante).** A JS se lo recomendaron como reemplazo gratis de ElevenLabs. Es un programa de código abierto que corre en la propia compu (https://github.com/debpalash/VoiceStudio, de un solo desarrollador, nuevo y en parte en beta). JS decidió no usarlo por ahora, por estos motivos:
     - el programa es AGPL, pero su modelo por defecto (OmniVoice, de k2-fsa) es **CC-BY-NC, sin uso comercial**, según la ficha oficial de Hugging Face;
     - no corre en Vercel: necesita un servidor propio con GPU o una Mac Apple Silicon prendida;
     - la voz de Gabi es de la biblioteca de ElevenLabs y no se puede clonar sin permiso;
     - la verificación del saludo y la transcripción de los audios de clientes siguen en ElevenLabs;
     - el gasto actual es chico, porque cada saludo se genera una vez por nombre;
     - no hay pruebas de cómo suena en castellano rioplatense.

     Si se retoma: probarlo en la Mac con un par de saludos para compararlo con Gabi, y antes de usarlo con clientes resolver la licencia del modelo y el servidor.

## Historia: la charla del 12/10


## De qué se trata

Hoy, cuando alguien pide presupuesto, casi siempre por WhatsApp, le mandan el link de un formulario web de Odoo:

`https://emprendimientos-y-estructuras-sa.odoo.com/es_AR/alta-de-cliente`

Ese formulario crea un `crm.lead`. **Sirve solo para juntar los datos necesarios para mandar un presupuesto.** No es un alta de cuenta corriente. JS lo aclaró cuando le propuse pedir ART, documentos y firmas: eso no va.

Los datos que pide el formulario (razón social, contacto, celular, mail, CUIT y domicilio) son exactamente los que el asistente comercial exige para dar de alta un cliente nuevo (`faltantesParaEmitir` → `cliente_nuevo` en `src/lib/asistente/borrador.ts`). Hoy esos datos quedan sueltos en el lead y el vendedor los vuelve a tipear.

## Qué se decidió

1. **Lo que más vale es el backend del pedido, no el formulario.** El circuito es:
   pedido ordenado → lead bien titulado en Odoo → chequeo de canal → aviso al vendedor → botón **«Presupuestar»**, que abre el asistente con el borrador precargado.
   Ese circuito sirve para cualquier puerta de entrada.
2. **La puerta principal va a ser un agente de WhatsApp para clientes**, no un formulario. JS lo planteó y el análisis le dio la razón, con condiciones:
   - el agente es aparte del asistente comercial;
   - tiene herramientas acotadas;
   - nunca da precios ni plazos;
   - se presenta como asistente virtual de ABA (decidido el 26/09);
   - pasa la charla al vendedor por su nombre («te va a escribir Gabriel»).
3. **El formulario web queda para el final y liviano**, solo para lo que no llega por WhatsApp (la web, Instagram y el mail).
4. **Número nuevo, propio, para el agente.** Lo recomendé y JS dijo «perfecto».
   - Una línea de Claro (o de la compañía que usen) a nombre de Emprendimientos y Estructuras SA, conectada **directo a la Cloud API de Meta, sin proveedor intermediario**.
   - El 11 2734 4214 sigue en la app del celular para las llamadas y los clientes actuales. Se le configura un mensaje automático que derive al número nuevo.
   - Motivo: la coexistencia (compartir el número entre la app y la API) obliga a usar un proveedor, deja ese número sin llamadas de voz y no la soporta el WhatsApp nativo de Odoo.

## Orden de construcción

| # | Qué | Tamaño | Depende de |
|---|---|---|---|
| 0 | Arreglos en el formulario de Odoo: título «My Website», botón `wa.me` en el modal en vez de copiar y pegar, campos `x_studio_*` visibles en formularios web | 10 min, lo hace JS en Odoo | — |
| 1 | **Backend del pedido.** Al principio se alimenta con los leads que ya crea el formulario de Odoo: «Presupuestar» desde un lead existente | ~1 semana | — |
| 2 | **Agente de WhatsApp para clientes**, etapa supervisada | ~1,5–2,5 semanas | Número nuevo y cuenta de Meta |
| 3 | Formulario web liviano `/pedido` y `/pedido/[token]` | ~1 semana | 1 |
| 4 | Autocompletar el CUIT desde ARCA | ~2–3 días | JS autoriza el certificado en ARCA |

### Etapa 1 en concreto
- **Tabla `pedidos_presupuesto` en Supabase**, el modelo canónico del pedido: obra, tipo de trabajo, altura, fecha, fotos, datos del cliente, origen, vendedor y estado.
- **Lead en Odoo:**
  - título útil, por ejemplo «Av. Cabildo 2450 · Fachada · Consorcio X»;
  - `partner_id` si el CUIT ya existe (`clientePorCuit`);
  - `source_id` y fotos como `ir.attachment`.
  - Falta el modo «lead sin orden» en `vincularOportunidad` (`src/lib/odoo/presupuestos.ts`), que hoy espera un `ordenId`.
- **Chequeo de canal:** `conflictoCanal(direccion)` en `src/lib/odoo/comercial.ts`.
- **Obra:** `geocodificarDireccion` y `consultarLote` (catastro CABA, en `src/lib/catastro/caba.ts`).
- **Aviso al vendedor:** si ya es cliente, a su vendedor; si es nuevo, al canal con un botón «Lo tomo». Por Slack o Telegram (`src/lib/alertas/slack.ts`, `src/lib/hoja-dia/telegram.ts`).
- **«Presupuestar»:**
  - crea `asistente_conversaciones` y `cotizacion_borradores` del vendedor, con un `DatosBorrador` precargado (`cliente`, `obra`, `trabajo`) y las fotos copiadas a `comercial/adjuntos/<conv>/`;
  - `DatosBorrador` no tiene «fecha de inicio deseada» ni altura suelta: van en `perfilComercial` o `notasInternas`, o en un campo nuevo.

### Etapa 2 en concreto
**Qué ya existe.** La integración con WhatsApp está programada y probada contra Meta simulado, pero **nunca se configuró**:
- `src/lib/whatsapp/` (api, procesar, tandas, formato);
- el webhook `src/app/api/whatsapp/webhook/`;
- la tabla `whatsapp_entrantes`.

Ya maneja texto, audio (transcripto con ElevenLabs), imagen, PDF, ubicación y botones. **Hoy atiende solo a vendedores:** un número desconocido recibe «uso interno» (`contestarDesconocido` en `procesar.ts`).

**El asistente comercial NO se puede poner delante de clientes.** `consultar_odoo`, `precios_recientes`, `buscar_presupuestos` y `buscar_clientes` dejan ver saldos y precios de otros clientes, y con un mensaje armado a propósito (prompt injection) un cliente podría sacárselos. Además, todo cuelga de un `usuario_id` interno.

**Qué hay que construir:**
- **Ruteo:** si el teléfono no es de un vendedor (o llega por el `phone_number_id` del número nuevo), va al agente de clientes.
- **Base de datos:**
  - conversaciones de clientes con estado (recopilando / completo / derivado / cerrado) y una ficha JSONB;
  - un candado por teléfono;
  - un tope de gasto por teléfono y uno global.
- **Agente:**
  - prompt propio;
  - herramientas sin acceso a nada sensible: `anotar_dato`, `validar_cuit`, `verificar_frente_lote`, `pedir_humano`, `terminar_relevamiento`;
  - un modelo más barato que el del asistente;
  - el loop de `src/lib/asistente/turno.ts`, con el set de herramientas como parámetro.
- **Al terminar:** escribe en el backend de la etapa 1.
- **Bandeja:** ver la charla, «tomarla» a mano y pasarla a borrador.
- **Meta:**
  - ofrecer siempre hablar con una persona;
  - controlar la ventana de 24 h (hoy no se controla);
  - plantillas para seguimiento;
  - opción de darse de baja.
- **Pruebas contra prompt injection:** un `scripts/test-…-whatsapp-clientes.mts`, como el que ya existe.

**Plan previo de JS (26/09):** https://claude.ai/code/artifact/80f5a96c-2a10-4ac0-95b7-b1f3a35b3e64. Ver también `docs/asistente-comercial/handoff.md`, en `main`, sección «Agente de WhatsApp para clientes». Ese plan contemplaba que el agente cotizara solo los trabajos fáciles. **Hoy la recomendación es que no cotice** al menos hasta tener la etapa supervisada andando.

## MCP de Meta (instalado el 12/10)

- **Servidor oficial de Meta, en beta:** `whatsapp_business_tools` en `https://mcp.facebook.com/whatsapp_business_tools`.
- Agregado con alcance **local** (solo JS, en este proyecto, en `~/.claude.json`).
- **Falta que JS lo autentique:** `/mcp` → `whatsapp_business_tools` → login de Meta. Elegir la empresa y la app con WhatsApp.
- **Requisitos:**
  - ser admin de la empresa en Meta Business (rol MANAGE);
  - una app de Meta con WhatsApp de la que JS sea admin. Probablemente **no exista todavía**: la cuenta de Meta nunca se configuró;
  - aceptar los términos de la WhatsApp Cloud API.
- **Sirve para configurar, no para atender.** Herramientas `whatsapp_biz_*`:
  - alta y verificación de números;
  - plantillas;
  - webhooks (apuntar a `https://andamios-os.vercel.app/api/whatsapp/webhook`);
  - mensajes de prueba;
  - `system_user_token` y `verify_business`.
- **⚠️ Nunca registrar el 11 2734 4214 por API** sin que JS lo confirme: lo saca de la app del celular.
- Docs: https://developers.facebook.com/documentation/mcp/whatsapp-business-tools-mcp

## Datos de Meta que conviene recordar (investigado el 12/10/2026)

- **Precios:**
  - contestar a quien escribe es gratis dentro de las 24 h;
  - se cobran solo las plantillas que se mandan fuera de esa ventana. Utility en Argentina sale ~US$ 0,026; es un dato de terceros, hay que confirmarlo en la tabla oficial;
  - el cobro «desde el 1/10/2026 por mensajes de servicio» no está confirmado: la página oficial sigue diciendo que son gratis.
- **Política:** desde el 15/01/2026 Meta prohíbe los chatbots de IA de propósito general. La atención propia de un negocio está permitida y hay que ofrecer escalar a un humano.
- **WhatsApp Flows** (formularios dentro del chat): tienen selects, fechas, **PhotoPicker** y un endpoint para validar el CUIT. No tienen mapa: el pin de ubicación se pide aparte en el chat. Son plan B si juntar los datos duros conversando no anda.
- **Media:** las URLs de descarga vencen a los 5 minutos y los IDs a los 7 días. Hay que bajar los archivos enseguida; `bajarMedio` ya lo hace.

## Qué falta que haga o conteste JS

1. **Sacar la línea nueva** a nombre de la empresa. Que no esté registrada en ninguna app de WhatsApp. El 26/09 JS había dicho que «ya tiene un número»: confirmar si es ese o uno nuevo.
2. **Autenticar el MCP** (`/mcp`) y, si falta, crear la app de Meta con WhatsApp. Arrancar ya la **verificación del negocio**, que lleva días o semanas.
3. **Preguntar a Gabriel y a Jorge** a qué número les escriben los clientes: ¿al de la empresa o a sus celulares? Si es a sus celulares, el agente en el número de la empresa ve poco.
4. **Volumen:** ¿cuántos pedidos por día llegan?
5. Los **arreglos de 10 minutos** en el formulario de Odoo.
6. **Autorizar el certificado «ANDAMIOSOS» en ARCA** (Administrador de Relaciones: `ws_sr_constancia_inscripcion` y Padrón A13). Desbloquea la etapa 4 y la consulta de CUIT del asistente.
7. **Decisiones del formulario** (sección 6 de la propuesta). Mis recomendaciones:
   - CUIT obligatorio solo para empresas;
   - el formulario en el dominio propio;
   - «¿Cómo nos conociste?» opcional y solo en el link genérico.

## Antes de escribir código

- Partir de **`main`**, no de `docs/partes-rediseno`: esa rama tiene 69 commits menos. En `main` están `validarCuit` con propuesta de CUIT corregido, `geocodificarDireccion` y el alta sin CUIT.
- Leer `docs/asistente-comercial/modulo.md` (§WhatsApp, l.412-489) y `handoff.md` en `main`.
