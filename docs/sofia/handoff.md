# Handoff: CRM con Tomás (antes Sofía), el agente de WhatsApp para clientes

**Actualizado el 17/10/2026.** **Desde el 17/10 el agente se llama Tomás** (JS eligió una voz de hombre para el saludo con audio). La carpeta, los nombres internos del código (`atenderConSofia`, `FichaSofia`…) y la historia de abajo siguen diciendo Sofía.

 El estado de abajo es el vigente. La historia del 12/10 está más abajo, en «Historia: la charla del 12/10».

Para retomar, decí: «Leé docs/sofia/handoff.md y seguimos con el CRM de WhatsApp».

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
| **Saludo con nota de voz** (17/10) | `voz.ts` (genera, procesa con ffmpeg, verifica con speech-to-text y guarda en Storage `comercial/voz/saludo/v1/`), `mandarNotaDeVoz` en `envio.ts`, `enviarAudio` en `whatsapp/api.ts`; interruptor `clientes_saludo_voz` = 1 | ✅ En producción, con `ELEVENLABS_VOZ_API_KEY` en Vercel. Si el audio falla, sale sólo el texto y la charla anota «No salió el audio del saludo». Falta que JS lo pruebe por WhatsApp |
| Perfil del WhatsApp de clientes | logo (aro rojo), info «Andamios y bandejas de protección · CABA y GBA», descripción, Maturín 2570, info@…, la web y la categoría | ✅ Cargado por API el 16/10 |

**El saludo** (decisión de JS, 15 y 16/10; con voz y con Tomás desde el 17/10). Lo arma el código, una sola vez, y el nombre sale del perfil de WhatsApp. Sale **sólo como nota de voz** (WhatsApp le pone la transcripción abajo; JS lo probó el 17/10 y pidió sacar el texto, que repetía lo mismo):
> 🎤 «Carlos, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?»

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
   - Hoy dice «¡Buen día Joaquin! Acá Tomás de Andamios Buenos Aires…» y el audio «Joaquin, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?».
   - Para lanzar: cambiar `CUERPO` y `guionSaludoVoz` en `saludo.ts` (por ejemplo «Tomás, asistente digital de Andamios Buenos Aires, ¿en qué te ayudo?») y **subir `CARPETA` a `voz/saludo/v2` en `voz.ts`**, así no se reusan los audios viejos.
   - Mientras el número lo tenga sólo JS, no confunde a nadie. Ante un cliente real, Tomás tiene que decir que es un asistente digital: lo piden las condiciones de uso de Claude.
0b. ~~Cargar `ELEVENLABS_VOZ_API_KEY` en Vercel~~: **hecho el 17/10** por CLI (`vercel env add`, a pedido de JS) y redesplegado. El valor es la clave «Sofía saludo» de ElevenLabs, la misma que está en `.env.local` como `ELEVENLABS_API_KEY` y ahora también como `ELEVENLABS_VOZ_API_KEY`. Tiene permisos de TTS y speech-to-text. La `ELEVENLABS_API_KEY` de Vercel es otra (la de transcribir) y no se toca.
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
10. **Búsquedas laborales por Slack** (idea de JS, 16/10): que Sofía junte los datos de quien busca trabajo (nombre, puesto, zona, experiencia) y los mande ordenados por Slack al responsable de personal. Hoy sólo le dice «le paso tu mensaje al responsable de personal» y deriva con `fuera_de_tema`.
11. **Lo que quedó de la propuesta del análisis de chats:** D4 (campos nuevos en la ficha: altura en metros, tiempo de obra, quién arma, silleteros, etapa de decisión, quién decide, origen), D7 (cliente que vuelve, depende del paso 2b), D8 (aviso si un pedido pasa 24 a 48 h sin respuesta) y la bandera `urgente` para «para hoy» y «para mañana».
12. ~~Confirmar el echeq~~: JS confirmó el 16/10 que se acepta (transferencia o echeq, nunca efectivo).
13. **Alquiler simple que cotiza Sofía (pendiente; JS quiere trabajarlo bien en otra sesión, 16/10).** La idea es un «alquiler simple fácil», como la bandeja: reglas escritas, borrador con el cotizador de la app y la misma tarjeta de aprobación.
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
       - Cómo funciona: `voz.ts` genera con v4, procesa con la misma cadena de `audio-whatsapp.py` (con `ffmpeg-static`), transcribe y compara (`audioDiceElGuion`: si se come el nombre o «Andamios», lo genera de nuevo; dos intentos), guarda en Storage por momento del día y nombre y lo manda con `voice: true` (nota de voz). La primera vez tarda unos 4 s; después, 0,3 s.
       - Probado desde la Mac contra Storage: `buenas-tardes-joaquin.ogg` quedó generado (Ogg/Opus, 4,9 s, 14 KB).
       - **Probado por JS el 17/10 a las 13:52:** llegó como nota de voz (con la onda, el micrófono y el logo) y WhatsApp mostró la transcripción. Desde `5ef0f1c` sale sólo el audio. Si en el celular llega como audio común y no como nota de voz (sin la onda ni la foto del perfil), Meta ignoró `voice: true`: revisar el formato.
   - **Para seguir (antes de elegir):** probar sin ambiente y con otra prosodia (por ejemplo «¡Hola Jorge, buen día! ¿Cómo andás? …»), estabilidad 0 en v3, otras voces con v3, o grabar una voz real con consentimiento. Todavía no hay nada programado en Sofía.

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
