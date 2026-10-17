# Saludo con voz de Sofía: recomendación final

## 1. La recomendación

Sofía manda el saludo por escrito en todas las charlas. En la mitad de ellas, antes de ese texto, manda también una nota de voz corta, y se mide durante 8 semanas si el audio ayuda o molesta. La idea de JS de mandar sólo el audio, y el texto únicamente si el cliente se queja, no conviene. Audio más texto, en cambio, se puede probar sin riesgo. El audio no va a quien se identifica como empresa o institución. Además, cuando una persona del equipo toma la charla, que mande su propio audio: esa es la cercanía real.

## 2. Por qué

- **Con el texto siempre presente, la objeción más fuerte desaparece.** Tres expertos (UX, marca y riesgos) se oponían al audio para todos porque en la notificación se vería sólo «🎤 0:07»: sin marca, sin «asistente digital» y con aspecto de estafa. Pero WhatsApp muestra en la notificación y en la lista de chats el último mensaje. Si el audio sale primero y el texto después, lo que se lee es «Acá Sofía, asistente digital de Andamios Buenos Aires». Ese argumento era el que más pesaba y deja de aplicarse.
- **Mandar sólo el audio sí es un problema.** Los 13 «no puedo escuchar» en 18 meses cuentan sólo a los que se quejaron. El que está en la obra o en una reunión no lo escribe: deja la charla para después, y la demora es la causa de pérdida más evitable. Hay un caso concreto en el código: si el cliente manda sólo «Hola», el saludo es lo único que recibe (`turno.ts`). Con sólo audio, se quedaría frente a una nota de voz sin nada escrito. Y el aviso de que Sofía es una IA tiene que poder leerse, también por las personas hipoacúsicas.
- **Mandar audio sólo cuando el cliente arranca con audio es demasiado poco.** Pasa en el 2,9 % de las charlas, unas 6 por mes. No da la cercanía que busca JS y no permite medir nada.
- **En ABA el audio es normal.** El 23 % de las charlas tiene audios del cliente y ABA ya manda audios en 714 charlas. Uno de 6 a 7 segundos es más corto que los habituales (18 s).
- **La gama alta es la excepción.** Hoteles, hospitales y licitaciones buscan profesionalismo y pueden leer un audio que no pidieron como algo informal. Son pocas charlas pero de mucho valor, y el volumen no alcanza para medir ese segmento. Por eso se los excluye de entrada en vez de arriesgarse.

## 3. Cómo sería

**Quién recibe audio y quién no:**

| Situación | Qué recibe |
|---|---|
| El cliente arranca con un audio | Audio y texto (fuera del experimento) |
| El perfil o Odoo lo identifican como empresa o institución (`nombreParaSaludo`, paso 2b) | Sólo texto |
| Todos los demás, grupo A (mitad, por hash del teléfono) | Audio y texto |
| Todos los demás, grupo B | Sólo texto, como hoy |

**Orden de envío:** primero el audio. Sofía espera el wamid y después manda el texto. Si el audio falla por cualquier motivo, se saltea y sale sólo el texto: el saludo nunca se cae.

**Guion del audio** (6 a 7 s, tres versiones: buen día, buenas tardes, buenas noches):
> «¡Hola, buen día! Soy Sofía, la asistente digital de Andamios Buenos Aires. Contame qué necesitás, que te voy respondiendo por escrito.»

La frase «asistente digital» queda dentro de los primeros 3 segundos. El cierre deja claro que la charla sigue por escrito, para que el cliente no espere hablar por voz.

**Texto que va siempre:**
> «¡Buen día Carlos! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te puedo ayudar.»

Ojo: hoy el código no dice «asistente digital». La constante `CUERPO` en `src/lib/clientes/saludo.ts`, línea 20, dice «Acá Sofía de Andamios Buenos Aires…». Hay que corregirlo antes de publicar el número, se haga o no el audio.

**La voz:**
- Pregenerada, sin el nombre del cliente. Con el nombre se suman 2 a 3 segundos de demora y hay riesgo de que lo pronuncie mal.
- De la biblioteca de ElevenLabs. No se clona a nadie del equipo.
- Femenina y adulta, sobria y cálida, con acento rioplatense y voseo. Ni locutora ni tono de call center.
- Se eligen escuchando 2 o 3 muestras. **Si ninguna suena rioplatense de verdad, no se hace audio:** una voz «casi porteña» es peor que no tener voz.
- Se guarda el ID de la voz, la fecha y el plan de ElevenLabs.

**Si el cliente dice que no puede escuchar:** como el texto ya está, no hace falta reenviar nada. Hay dos cuidados:
- Una regla para Sofía: nunca manda audios fuera del saludo, y si el cliente pide algo por escrito, lo escribe.
- Un regex chico («no puedo escuchar», «por escrito», «sin auriculares»…) que sólo cuente esos casos para la medición.

**Lo que suma más cercanía, y no es de Sofía:** cuando alguien del equipo toma la charla, que mande un audio real y corto. Por ejemplo: «Hola Carlos, soy Martín de ABA. Ya vi lo de la fachada en Palermo, te mando el presupuesto hoy antes de las 6.» Es opcional. Sofía le deja al vendedor un resumen de 2 líneas para que lo grabe rápido.

## 4. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Una voz que suena humana hace creer que atiende una persona | «Asistente digital» en el audio y en el texto. Sin muletillas ni risitas |
| Se parece a una estafa en un número nuevo | El texto con la marca queda visible en la notificación. El audio nunca pide datos ni plata. Sofía tiene una respuesta fija para «¿es real este número?»: remite a la web y a la oficina de Maturín 2570 y aclara que nunca pide pagos |
| Gama alta lo ve informal | Queda excluida del audio. Audio de 7 s como máximo |
| Audio y texto juntos se sienten como mucho | El audio no repite el texto palabra por palabra, el texto es una línea, y se mide |
| El cliente empieza a contestar con audios | ElevenLabs ya transcribe. Se mide si sube la proporción de audios |
| Bloqueos o denuncias bajan la calidad del número en Meta | Se revisa la calificación de calidad en WhatsApp Manager todas las semanas |
| El enlace o el `media_id` vence y el audio falla | Se saltea y sale el texto |
| ElevenLabs da de baja la voz | Los 3 archivos quedan generados y guardados |

## 5. Cómo medirlo

**Antes de lanzar (1 o 2 horas de script sobre la exportación de 18 meses).** Un adelanto, ya calculado el 17/10: cuando el último mensaje de una tanda de ABA es un audio, el cliente contesta en 24 h el 96 % de las veces (en unos 30 min en promedio); cuando es un texto, el 88 % (en unos 46 min). Hay sesgo, porque ABA manda audios con la charla ya avanzada, pero no muestra que el audio perjudique. Lo que falta es: comparar las charlas en las que el primer mensaje de ABA fue un audio contra las que empezó con texto. Qué porcentaje de clientes respondió y en cuánto tiempo. Tiene sesgos, pero es gratis y es el único dato real que ya existe. Si ahí el audio sale claramente peor, se reconsidera todo antes de construir.

**El experimento, que Sofía corre sola:**
- Asignación 50/50 por hash del teléfono, guardada en la charla, para que el mismo cliente siempre vea lo mismo. No se alternan semanas, porque cada semana trae otra mezcla de obras.
- Dura 8 semanas o hasta 200 charlas por grupo, lo que llegue primero.
- Sofía calcula todos los lunes:
  1. **La métrica que decide:** el porcentaje de charlas en que el cliente vuelve a escribir dentro de las 24 h después del saludo.
  2. El porcentaje de charlas que llegan a datos completos para presupuestar.
  3. Las frases de fricción cada 100 charlas: «no puedo escuchar», «por escrito», «¿sos un bot?», «¿es real?».
  4. Bloqueos y calificación de calidad del número.
  5. Si Meta manda el estado `played`: el porcentaje de audios escuchados.

**Qué número decide:** el audio queda si, en el grupo con audio, se cumplen las tres condiciones:
- la respuesta al saludo no baja más de 5 puntos frente al grupo con sólo texto;
- la llegada a datos completos no baja;
- hay como mucho 3 frases de fricción cada 100 charlas.

**Corte anticipado:** si con 60 charlas por grupo el audio está 10 puntos o más abajo en la respuesta al saludo, se apaga.

Aclaración honesta: con el volumen que va a tener el número al principio (100 a 200 charlas por mes, publicado sólo en la web), el experimento detecta un daño claro, no una mejora fina. La decisión es «el audio no perjudica, entonces queda porque JS valora la cercanía», no «el audio vende más». Para medir una mejora hacen falta unas 300 charlas por grupo, y eso recién se puede pensar cuando el número esté en todos los canales.

## 6. Qué hay que construir y cuánto lleva

Según el experto técnico, son unas 250 a 350 líneas con los tests, **1 a 2 días**:

- Script local que se corre una vez: ElevenLabs con salida `opus_48000_32` (o ffmpeg si no sale en contenedor Ogg) y subida a Storage. En Vercel no hay ffmpeg, por eso se genera antes.
- `src/lib/whatsapp/api.ts`: `enviarAudio` con `type: "audio"` y `voice: true`, en OGG/Opus mono. Para arrancar se manda por `link` y no hace falta guardar el `media_id`.
- `envio.ts`: `mandarAudio` y una fila de tipo audio en `cli_hilo`.
- `saludo.ts`: corregir «asistente digital» en `CUERPO`, la asignación del A/B, la exclusión de empresas, la clave del audio según el momento del día y el regex de fricción.
- `turno.ts`: mandar el audio antes del texto y saltearlo si falla, más una nota en `saludoEnviado` para el modelo y la regla de no mandar otros audios.
- Webhook: registrar `played` si llega. En la bandeja: que se vea el audio que sale.
- El reporte semanal de las métricas.
- Prueba en un iPhone y un Android: que se vea como nota de voz y que el orden sea audio y después texto.

## 7. En qué no hubo acuerdo y qué queda abierto

- **Audio para todos o sólo como espejo.** UX, marca y riesgos querían audio sólo cuando el cliente arranca con audio. Lo resolví a favor de probarlo con todos: su argumento principal (la notificación) se resuelve mandando el texto último, y quedarse con el espejo es igual a no hacerlo. Su preocupación por la gama alta y por la sospecha de estafa queda en la exclusión de empresas y en las métricas de fricción.
- **Orden de los mensajes.** El escéptico quería primero el texto. Elegí primero el audio para que la notificación muestre el texto, esperando el wamid entre uno y otro. La demora que se suma es menor a un segundo.
- **Excluir a la gama alta desde el principio o después de medir.** Comercial y técnico preferían medir primero. La excluí de entrada porque el volumen no alcanza para medir ese segmento y ahí el error cuesta caro.
- **Queda abierto:**
  - Si Meta manda el estado `played` para este número. Si no lo manda, no se sabe cuántos escuchan el audio.
  - Si existe en ElevenLabs una voz rioplatense creíble. Si no existe, no hay audio.
  - Si el equipo va a grabar el audio cuando toma la charla. Lo decide JS con el equipo.
  - ~~Una diferencia en los datos de base (7.465 frente a 5.245 audios)~~: aclarado. Los 7.465 del análisis anterior cuentan todos los audios de las charlas de clientes, de los dos lados; 5.245 son sólo los del cliente.