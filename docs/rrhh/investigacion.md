# Módulo RRHH — investigación

*17/10/2026. Los cuatro informes de investigación que usó el panel, tal cual los entregaron. La propuesta final está en [`propuesta.md`](./propuesta.md) y el debate en [`debate.md`](./debate.md). Dos datos de estos informes los corrigió la auditoría: el bot de Telegram **no** está funcionando (falta crearlo) y el 82 % de Habilitaciones es solo la Nómina ART.*

1. [Humand: comunicación interna, cultura y personal de obra](#informe-1-humand-comunicación-interna-cultura-y-personal-de-obra)
2. [Humand: gestión de personas, administración y precios](#informe-2-humand-gestión-de-personas-administración-y-precios)
3. [AndamiosOS: qué hay hoy de personas y RRHH](#informe-3-andamiosos-qué-hay-hoy-de-personas-y-rrhh)
4. [Normativa: obligaciones de RRHH, laborales y de SyH](#informe-4-normativa-obligaciones-de-rrhh-laborales-y-de-syh)

---

# Informe 1: Humand: comunicación interna, cultura y personal de obra

*(humand-comunicacion)*

# HUMAND: comunicación interna, cultura y personal de obra (relevamiento para ABA)

*Relevamiento al 17/10/2026. Quién lo hizo: analista de producto, frente comunicación interna, cultura y personal frontline/deskless.*

## 0. Cómo se hizo y qué tan confiable es

- **Fuente principal: el centro de ayuda oficial.** Lo bajé completo: 597 artículos en español (es-419) desde la API pública de Zendesk de Humand (`help.humand.co/api/v2/help_center/es-419/articles.json`). Las páginas HTML del centro de ayuda tienen un bloqueo de Cloudflare, pero la API está abierta. Ahí está lo más concreto: cómo funciona cada cosa, sus límites y lo que **no** hace.
- **Sitio comercial (humand.co/es).** Las páginas de módulos son marketing y tienen poco detalle. Las páginas de "releases" se arman con JavaScript y no traen contenido legible, así que no las usé.
- **Casos de clientes:** Mirgor, Loginter, Yagmour, IMI SAS, X-28 Alarmas, Grupo del Pilar, PECOM y David Sartor.
- **Reseñas:**
  - App Store: metadatos y 62 reseñas recientes de AR, MX, CO, CL y PE, bajadas del RSS de Apple.
  - Capterra, G2, Software Advice y Google Play no los pude leer: dan 403 o no encontré el ID del paquete. Lo de Capterra sale solo de los extractos del buscador.
- **Precio:** no está publicado. El único número es "desde US$4 por usuario por mes", del extracto de Capterra en el buscador. **No pude verificarlo.**

---

## 1. Resumen ejecutivo

1. Humand tiene tres "caras":
   - **App:** móvil Android/iOS/Huawei, más la web app.humand.co.
   - **Web:** para la persona en una computadora.
   - **Admin:** panel en admin.humand.co, pensado para PC.

   Todo se apoya en dos piezas: **segmentaciones** (atributos de la persona, como área, sede, jerarquía o modalidad) y **permisos por rol** (más de 80 permisos en 24 módulos). Cada módulo se prende o se apaga desde *Admin > Apps*.
2. El frente de comunicación tiene estas piezas:
   - **Muro** (feed) con publicaciones segmentadas, fijadas, programadas, con aprobación, encuestas rápidas, "Novedades importantes" con push o email, traducción automática e IA para mejorar el texto.
   - **Grupos** abiertos, cerrados o secretos.
   - **Noticias**, tipo revista: unidireccional y solo se publica desde Admin.
   - **Chat** individual o grupal, con notas de voz, archivos, llamadas, videollamadas, "leído por" en grupos y bot.
   - **Transmisiones en vivo.**
3. El frente de cultura tiene estas piezas:
   - **Encuestas** comunes, sin anonimato forzado.
   - **People Experience**: clima con dimensiones, eNPS, mapa de calor y umbral de anonimato.
   - **Reconocimientos** con puntos y canje de premios.
   - **Cumpleaños y aniversarios** con saludo automático por chat.
   - **Eventos** con invitación y RSVP.
   - **Marketplace** entre empleados.
4. Herramientas de soporte:
   - **Librería de conocimiento** (artículos segmentados con métricas).
   - **Formularios y trámites** (con firma y aprobaciones en varias etapas).
   - **Centro de notificaciones.**
   - **Estadísticas de uso.**
   - **Buscador universal.**
   - **Accesos rápidos.**
   - **Sammy**, el asistente de IA que responde con la librería y con vacaciones.
5. **Para personal sin mail:**
   - Sirve un login con **usuario** (puede ser DNI o legajo) y contraseña inicial que da RRHH, o un **código por SMS** (OTP).
   - El **Kiosk** es una tablet compartida para **fichar** con PIN o reconocimiento facial, y guarda las fichadas sin señal. **Kiosk sirve solo para asistencia**, no para comunicar ni hacer trámites.
6. **Lo que no encontré documentado:**
   - Que la app funcione **offline**. Solo el Kiosk de fichadas.
   - **Integración con WhatsApp.** Lo único que hay es un "acceso rápido" que abre un link wa.me, y WhatsApp como canal de soporte de Humand.
   - Confirmación de lectura obligatoria ("leí y entendí") en el muro o en noticias.
   - Mensajes de audio desde RRHH a una lista de difusión.
7. **Lo que más critican los usuarios de la app** (App Store, sobre todo personal operativo de LatAm):
   - Problemas de login y sesiones que se caen.
   - Lentitud y cuelgues.
   - Videos que se reproducen solos en segundo plano.
   - PDFs y recibos que no cargan después de una actualización.
   - Tope de 10 fotos por envío.
   - Fichar con selfie obligatoria les parece "intrusivo".
   - Soporte que no responde al empleado.

---

## 2. Funciones, una por una

Formato de cada ficha: **qué hace**, **quién la usa**, **cómo se usa en el celular** y **límites o detalles**.

### 2.1 Muro (Feed / red social interna)
- **Qué hace:**
  - Es un feed cronológico de la "comunidad". Se puede reaccionar con cualquier emoji y comentar con foto, video, GIF o mención.
  - Texto enriquecido: negrita, listas, títulos y atajos tipo markdown.
  - Hasta 10.000 caracteres, 10 fotos y 100 MB de adjuntos por publicación.
- **Quién publica:** solo quien tiene el permiso "Crear posteos en el muro". Hay más permisos separados:
  - Adjuntar archivos (PDF, documentos). Este no afecta fotos, videos, GIF ni encuestas.
  - Fijar publicaciones (va atado al permiso de eliminar).
  - Aprobar publicaciones.
  - Enviar push.
  - Crear transmisiones en vivo.
  - Traducir.
- **Segmentación:** al publicar se toca "Alcance" y se eligen segmentaciones. Funciona igual en la app y en la web. Entre categorías distintas aplica Y; dentro de la misma categoría, O. Ejemplo: Área=Obra Y Sede=(Norte O Sur).
- **Programación:**
  - Se puede programar con fecha y hora, y reprogramar o editar.
  - La programación usa la hora del dispositivo. No se puede fijar un huso horario de la comunidad.
- **Aprobación de publicaciones:**
  - Si se activa, lo que publica un empleado queda en "Publicaciones pendientes" hasta que alguien lo aprueba.
  - Las ediciones de publicaciones ya aprobadas también pasan por aprobación, mostrando el antes y el después.
  - Si se rechaza, el autor **no recibe aviso**.
- **Novedades importantes:**
  - Una publicación marcada como importante sube a una sección destacada arriba del muro.
  - Puede disparar push o email, pero solo si el post **no está segmentado**.
  - Tiene una vista previa con vencimiento de 1 a 7 días, y la fecha de vencimiento no se puede cambiar.
  - En el celular se ve 1 novedad; en la web, hasta 2.
- **Encuesta rápida en un post:** opciones de voto, con votantes ocultos o visibles y fecha y hora de cierre.
- **Publicar en nombre de otro (borradores para revisar):** comunicación arma el post "a nombre del director", el director lo revisa y lo aprueba desde su app, y sale con su nombre.
- **Usuario genérico:** se recomienda crear un usuario "RRHH" o "Comunicación" para publicar como institución.
- **IA "Mejorar con IA":**
  - Cinco opciones: más profesional, más amigable, corporativo, más resumido o más extenso.
  - No inventa datos, no traduce y no publica sola.
  - Solo funciona en posts nuevos.
- **Traducción automática:** cada persona elige su idioma y aparece "Ver traducción" en posts escritos en otro idioma.
- **Desactivar comentarios** en un post puntual.
- **Métricas:**
  - En los posts de grupos hay un "Análisis" con: visto por (cantidad), reacciones, comentarios y la lista nominal de quién vio, reaccionó o comentó, exportable.
  - Para el muro general, el reporte de posts **viene apagado** y hay que pedírselo a soporte. El reporte masivo de todas las publicaciones se pide al ejecutivo de cuentas.
- **Email:** cada usuario puede activar un aviso por mail de cada post nuevo. Viene apagado.
- Fuentes del centro de ayuda (`https://help.humand.co/hc/es-419/articles/<ID>`): 26833661912979, 40004700214163, 43355395918995, 50854146958739, 26815444179987, 39137334551827, 41723511066003, 45900295242131, 51392833005715, 55706646294163, 44038760766483, 26832465977747, 49752460219411, 56445300236819.

### 2.2 Grupos
- **Tipos:**
  - **Abierto:** cualquiera lo ve y entra.
  - **Cerrado:** se ve, pero para entrar hay que pedir y un admin aprueba.
  - **Secreto:** solo lo ven sus miembros; los asigna Admin.
- **Configuración:**
  - Quién publica: todos o solo los admins del grupo.
  - Si se aprueban los posts.
  - Si un miembro puede salir. No pueden salir quienes entraron por segmentación automática.
- **Miembros:** se agregan a mano, por segmentación ("todos los de Obra") o por link.
- **Admin de grupo:**
  - Manda push a los miembros, modera (borra posts y comentarios), fija y aprueba.
  - Puede ser cualquier empleado. No necesita ser admin de Humand.
  - No hay límite de miembros ni de grupos.
- **Notificaciones:**
  - Cada persona decide por grupo si recibe push de posts de miembros. Viene **apagado**.
  - Cuando publica un admin, el push le llega a todos aunque la persona lo tenga apagado. También puede publicar en silencio.
- **Publicaciones programadas** en el grupo.
- **Grupos multiempresa:** siempre secretos, con usuarios de otras comunidades de Humand. Por ejemplo, proveedores o clientes que también usan Humand.
- **Reportes** de grupos y de miembros, que se envían por mail.
- Fuentes: 28701433894291, 26848476826003, 51604555710099, 50627005710099, 38834073603475, 49839265200403.

### 2.3 Noticias (revista)
- **Qué hace:** artículos con portada, título, cuerpo, adjuntos (video, imagen, PDF, Excel, Word), tópicos y audiencia segmentada. Se puede notificar por push o email y programar.
- **Quién:** **se publica solo desde Admin**. El empleado lee, reacciona y comenta.
- **Límites (FAQ oficial):**
  - Es "un módulo unidireccional".
  - Las métricas de lectura no se ven desde Admin; hay que pedirle un reporte al ejecutivo de cuentas.
  - Si después se amplía la segmentación, a los nuevos **no les llega push**.
  - El remitente de los mails es fijo (notify@email.humandhq.co).
- Fuentes: 21725450120339, 21725466155795, 34236006148499.

### 2.4 Chat
- **Qué hace:**
  - Chats individuales y grupales, con archivos de todo tipo y **notas de voz**.
  - Galería por chat con multimedia, archivos y audios.
  - Llamadas de audio y videollamadas uno a uno o grupales, con pantalla compartida.
  - Fondos y desenfoque, que se eligen solo desde la web.
- **"Leído por":** en chats grupales, quien mandó un mensaje ve quién lo leyó y a qué hora.
- **Administración:**
  - Hay admins de chat grupal, que pueden sacar gente.
  - Permisos: ver chats, crear grupales y **bloquear archivos en chats**.
- **Bot:** saludos de cumpleaños o aniversario, y Sammy IA dentro de Chats.
- **Del lado comercial:** "si alguien se va, no se lleva nada", y los accesos se controlan desde un panel.
- **No encontré:** canales de difusión estilo "lista de WhatsApp", horario de desconexión, ni moderación de chats privados.
- Fuentes: 55993154519955, 55741121008275, 55707020197395, 36056548526227, 50979352339475, y https://humand.co/es/modulos/chat/

### 2.5 Transmisiones en vivo
- Se transmite desde la app (botón en el Muro) con comentarios, aviso de inicio, **subtítulos automáticos** y la opción de volver atrás en vivo. Queda grabada. Se puede transmitir a grupos y dentro de eventos.
- Fuentes: 38856926664083, y https://humand.co/es/modulos/live-streaming/

### 2.6 Encuestas (módulo común)
- **Qué hace:** se arma desde Admin con secciones, preguntas obligatorias y ramificación por respuesta. Hay mensaje automático al terminar, audiencia segmentada y la opción de **anonimato** en Ajustes.
- **Tipos de respuesta:**
  - Texto y área de texto.
  - Número entero o decimal.
  - Teléfono.
  - Opción única, múltiple, tabla de doble entrada o desplegable.
  - Calificación.
  - Fecha y hora.
  - **Subir archivos.**
  - **Subir fotos o videos.**
  - **Firma.**
  - Bloque sin respuesta, para instrucciones.
  - Autorelleno con datos del perfil.
- **Gestión:**
  - Resultados en vivo: cuántos respondieron y cuántos no, y tiempo promedio.
  - Botón "Notificar a los usuarios" que todavía no respondieron.
  - Reporte Excel con segmentaciones y campos del perfil; cada respuesta también en PDF.
- **En el celular:** se responde **una sola vez**, y la persona ve y descarga sus respuestas.
- **Uso típico** según Humand: onboarding, pulso de un equipo o sede, feedback de capacitaciones, entrevistas de salida, e incluso elección de menú.
- Fuentes: 25864792405011, 25881750310035, 25880711902099, 26736626237075, 26724529330451.

### 2.7 People Experience (clima / eNPS)
- **Metodología:**
  - Afirmaciones con escala Likert, agrupadas en **dimensiones** (bienestar, liderazgo, etc.).
  - Índice de **favorabilidad** por pregunta y por dimensión.
  - Escalas a medida, con opción de excluir neutros o invertir.
  - Banco de preguntas.
- **eNPS** con la pregunta estándar 0–10, que no se puede modificar, y comparación con referencias de la industria.
- **Resultados:**
  - Participación, eNPS, dimensiones, **mapa de calor** y filtros por segmentación, edad y antigüedad.
  - Edad y antigüedad se calculan solos desde la fecha de nacimiento y de ingreso.
  - Hay vista por jefe directo.
  - Se puede comparar contra hasta 4 encuestas anteriores.
- **Anonimato:** "100% anónimas", con umbral por defecto de **3 personas bajo un mismo líder** para ver respuestas y **10 respuestas para ver comentarios**. El umbral se cambia vía ejecutivo de cuentas.
- **Requisitos:** los datos tienen que estar limpios: fecha de ingreso, fecha de nacimiento, jefe directo, departamento y segmentaciones. Los análisis toman la foto de la nómina **del día del lanzamiento**.
- **En el celular:** *Apps > Experiencia del colaborador*, donde figuran las encuestas pendientes; se responde y se envía.
- Fuentes: 30117876692627, 35336221773971, 36564184954643, 40152251881107, 55546990768787, 46867772577043, 30207726626835.

### 2.8 Reconocimientos (kudos) y canje
- **Qué hace:**
  - Reconocer a una o varias personas (hasta 30 por reconocimiento) eligiendo una **categoría o valor** y escribiendo el motivo, con foto o video opcional.
  - Cada reconocimiento suma **puntos**, que se canjean por **productos** cargados por RRHH dentro de "períodos de canje".
  - RRHH marca cada canje como "Entregado".
- **Configuración:**
  - Cuántos puntos tiene cada persona para dar. Con 0, la persona solo recibe.
  - Quién puede recibir.
  - Carga masiva por Excel, hasta 2.000 filas.
  - Ajuste manual del saldo.
  - Los puntos no vencen, salvo que la empresa lo decida.
- **Visibilidad:** los reconocimientos se ven en el muro; hay ranking mensual y estadísticas por segmentación.
- **En el celular:** se da reconocimiento desde la app; **el canje solo se hace desde la app móvil**.
- Fuentes: 26526937701011, 32975150767251, 26591927686931, 26648902768787, 33480811883283, 33441592935699, 26726607350291.

### 2.9 Cumpleaños y aniversarios
- **Qué hace:**
  - Calendario de cumpleaños y de aniversarios laborales.
  - Push el día del cumpleaños.
  - **Felicitación automática por Chat** de un usuario bot (con nombre y avatar propios), con texto y/o imagen y variables como {firstName}.
  - Se puede diferenciar por **un** segmento. El ejemplo de la ayuda es justamente "Operativos vs Administrativos".
- **Límites:**
  - El horario del push se configura en **UTC**: para que llegue a las 9 de Argentina hay que poner 12:00.
  - El usuario **no puede apagar** las notificaciones de cumpleaños.
  - La felicitación automática se activa vía ejecutivo de cuentas.
  - Se puede segmentar quién ve los cumpleaños de quién.
- Fuentes: 27010644553363, 25823864705683, 36601557284755, 25824177114131.

### 2.10 Eventos
- **Qué hace:**
  - Nombre, portada, fecha y hora, descripción, presencial con ubicación o virtual con link externo, y quién puede verlo.
  - Invitaciones filtrando por segmentación.
  - Muro propio del evento.
  - Co-organizadores, que se gestionan solo desde la web.
  - Agregar al calendario y exportar invitados.
- **Ojo:** al crear el evento hay que destildar "Invitar a todos los miembros de la comunidad", si no **sale un push a todos**.
- Fuentes: 38184919530003, 48732680372243, 54363044573459.

### 2.11 Librería de conocimiento
- **Qué hace:**
  - Artículos y subartículos con contenido multimedia.
  - Adjuntos PDF/Office/CSV de hasta 100 MB recomendados.
  - Embebe Google Maps, Sheets y Slides.
  - Editores delegados.
  - Visibilidad por toda la comunidad, por segmento o por personas. La segmentación del artículo padre filtra todo lo de abajo.
- **Métricas por artículo:** vistas totales, vistas únicas y descargas, desglosadas por segmento.
- **Sammy IA** responde preguntas usando los artículos que se le conecten, y cita el artículo de donde sacó la respuesta.
- Fuentes: 26495244326547, 40249682321043, 36558520816147, 26726269675795, 56444991621395.

### 2.12 Formularios y trámites
- **Tipos:**
  - **Regular:** mismas preguntas y tipos que las encuestas.
  - **PDF:** se sube un PDF y se le ponen campos de texto, número, **firma** y autorelleno encima.
- **Ajustes:** límite de envíos por persona, responsables notificados, edición posterior, **plazos (SLA)** para atender y **flujo de aprobación de varias etapas** (usuario fijo, jefe directo, jefe del jefe).
- **En el celular:**
  - *Apps > Formularios y trámites*, con las pestañas "Disponibles" y "Completados".
  - En "Completados" se ve el estado, se cancela o se descarga.
  - Los aprobadores reciben push y mail, y pueden aprobar desde la app, incluso en forma masiva.
- **Límite conocido:** si el flujo pide "jefe directo" y la persona no tiene uno cargado, la solicitud queda trabada para siempre.
- *Gestión de Servicios* (mesa de ayuda con tickets) reemplazó a los viejos "Canales de consulta". Le corresponde a otro frente, pero la menciono porque los casos la usan como el lugar único para las consultas del personal.
- Fuentes: 25752807819539, 25753369155219, 25753972192531, 26725663104019, 26827478989715, 38405980912019.

### 2.13 Notificaciones
- **Centro de notificaciones** (campanita): chats, grupos, librerías, reconocimientos, cursos, desempeño y vacaciones.
- **Push:** el remitente decide en algunos módulos (admin de grupo, Novedades importantes, Noticias); el usuario controla el resto desde el sistema operativo.
- **Usuarios "inactivos"** (dados de alta pero que nunca entraron): **solo** les llega mail de algunas cosas, como noticias notificadas, librerías y aprobaciones. **No** les llegan encuestas, formularios, capacitaciones ni documentos. Sin mail personal cargado, a un operario que nunca abrió la app no le llega nada.
- Fuentes: 38834618712083, 26632677286803, 26632649681043.

### 2.14 Otras piezas útiles del frente
- **Estadísticas de adopción:** usuarios activados, sin ingresar y activos por semana y mes; actividad de 28 días; usuarios más activos. Se filtran por hasta 5 segmentaciones. (26363705576467, 54993719844755)
- **Perfil y directorio ("Personas"):** foto, puesto, contacto, campos a medida y **estado personalizado** (en reunión, enfermo, de vacaciones) con duración. (54348021622675, 26613398173459)
- **Organigrama.** (26814702404115)
- **Buscador universal:** posts, grupos, personas y noticias; respeta permisos e ignora tildes. (53904287002771)
- **Accesos rápidos:** íconos segmentados en la home que abren un link, un teléfono, un mail o un **chat de WhatsApp (wa.me)**. (25821484866067, 33463621096339)
- **Términos y condiciones o mensaje de bienvenida** en el primer ingreso. (26531420367891)
- **Marketplace:** compraventa entre empleados. Tiene una sola moneda genérica, precios enteros y es global; para segmentarlo se usan grupos. (26832203408915)
- **Sammy IA:** asistente en Chats que responde con la librería y con vacaciones y permisos (saldo, estado, y carga de una solicitud con confirmación). Nombre y foto son configurables y se puede habilitar por rol. El caso OXXO dice que Sammy redujo a la mitad más de un millón de gestiones al año (dato del proveedor). (56444991621395, 56218112597267, 53904309912851)

---

## 3. Lo pensado para personal de obra (deskless)

| Tema | Qué hay (verificado) | Qué no está o no pude verificar |
|---|---|---|
| **Alta sin mail** | El "Usuario" es un texto libre de hasta 100 caracteres (`. @ - +`). La ayuda da como ejemplo **usar el DNI** y después pasar al legajo vía API. Carga masiva por Excel (hasta 1.500 filas) con usuario, nombre, teléfono, fecha de ingreso y de nacimiento. (25891716710163, 21686811595667) | — |
| **Login** | Tres métodos, según lo que active la empresa: (a) usuario y **contraseña inicial que entrega RRHH**; (b) **código SMS de 6 dígitos (OTP)**, válido 60 segundos, que se activa para **toda** la comunidad sin excepciones; (c) SSO con Google, Microsoft, Okta o Apple. Si alguien no tiene mail, el admin le genera una contraseña nueva y se la pasa "por un canal seguro". Si falla el SMS, el empleado contacta a soporte por WhatsApp. (25970560191379, 27011322972051, 21698647526675) | La página de Construcción dice que se entra "con su número de teléfono, no se necesita correo" (https://humand.co/es/soluciones/construccion/). Otra página habla de "número de empleado o identificador interno". Son lo mismo que (a) y (b). |
| **Kiosk (tablet compartida)** | App "Humand Kiosk" en una tablet, que se vincula con un código de 12 dígitos y se asocia a una sede. Se ficha con **PIN** o **reconocimiento facial sin contacto**. Si hay coincidencias dudosas, la persona elige su nombre de una lista. **Guarda las fichadas sin señal y las sincroniza después.** Sirve "incluso para colaboradores sin correo corporativo o teléfono móvil". (38516937220755, 44616649395987, 49239673652243, https://humand.co/es/modulos/kiosk/) | **Es solo para asistencia.** No muestra comunicados ni permite hacer trámites ni encuestas. |
| **Fichada desde el celular** | Política de marcaje por app con geolocalización y validación facial opcional. (36990054910867) | Una reseña de Argentina (10/2026) se queja de la selfie obligatoria: "demasiado intrusiva". |
| **App liviana y celulares viejos** | La ayuda dice que pesa 49 MB, pide Android 10 o más e iOS 13 o más, y promete un consumo de datos "similar a WhatsApp" gracias a compresión y caché. (25970467695763, 26682474550675, 26687710522771) | **Está desactualizada:** según App Store hoy la versión 4.4.4 (15/10/2026) pesa **~187 MB** y pide **iOS 16.4**. El peso de Android no lo pude verificar. No hay números medidos de consumo de datos. |
| **Offline** | Solo las fichadas del Kiosk. | **No hay ninguna documentación de que la app (muro, chat, formularios) funcione sin conexión.** |
| **Idiomas** | La interfaz está en español, inglés, italiano, francés, portugués, noruego y búlgaro, y el listado de App Store trae más. Los posts del muro se traducen automáticamente. Las transmisiones en vivo tienen subtítulos automáticos. (38847470125075, 39137334551827) | No hay lectura en voz alta ni modo de accesibilidad para baja alfabetización. |
| **WhatsApp** | Solo un "acceso rápido" con link wa.me y WhatsApp como canal de soporte de Humand hacia los admins. (33463621096339, 26689200822803) | **No hay integración**: no manda avisos, encuestas ni recibos por WhatsApp. El discurso comercial es *reemplazar* WhatsApp ("si alguien se va, no se lleva nada"). |
| **Supervisión sin PC** | Casi todo lo diario se hace desde la app: publicar, segmentar, aprobar posts, gestionar grupos, aprobar formularios, dar reconocimientos. Hay acceso al Admin desde el celular. (21698637427987) | Armar encuestas, formularios, noticias y cargas masivas es tarea de Admin en una PC. |
| **Implementación** | Humand acompaña con onboarding: segmentaciones, carga de contenido, calendario de publicaciones, campaña de lanzamiento, estrategia de adhesión. Después, success semanal con métricas. (26671184229139) | — |

### Casos con personal operativo (datos del proveedor, no auditados)
- **Grupo Mirgor** (manufactura, unas 3.000 personas, plantas en Río Grande y Buenos Aires): la mayoría "no está sentada frente a un escritorio ni tiene mail corporativo". Logró 80% de participación en las plantas, 97% de activos por mes y 86% por semana. Usa el muro como canal principal. https://humand.co/es/caso-de-exito/grupo-mirgor/
- **Loginter** (logística y transporte, unos 1.500 usuarios entre choferes, puerto y depósito): antes usaban cartelera física y mail, y "la comunicación llegaba a la mitad de la empresa". No exigir mail fue la clave, pero quedó **cerca del 70%** activo. Usa red social, chat directo con el jefe y firmas. https://humand.co/es/caso-de-exito/loginter/
- **Yagmour** (retail, fábrica, depósito y locales): solo el 50% tenía PC o mail. 99% de activación y 97% de activos por semana. Usan sobre todo fichada, recibos, vacaciones, comunicación y solicitudes. https://humand.co/es/caso-de-exito/yagmour/
- **IMI SAS** (Colombia; ingeniería, montaje y mantenimiento industrial, con frentes de obra repartidos): es el caso más parecido a ABA. 100% de adopción, 91% de activos por semana, 11.500 hojas de papel ahorradas en un año, y certificados, vacaciones y permisos digitalizados. https://humand.co/es/caso-de-exito/imi-sas/
- **X-28 Alarmas** (unas 340 personas; el tamaño más cercano a una pyme): personal de producción sin PC. Usa el muro como canal central y un portal de servicios (más de 900 interacciones por trimestre). Sumaron **proveedores externos** a la app para comunicaciones importantes. https://humand.co/es/caso-de-exito/x-28-alarmas/
- **Grupo del Pilar** (distribución, 1.800 personas en 8 provincias): 100% de recibos digitales y la organización operando en 3 meses. https://humand.co/es/caso-de-exito/grupo-del-pilar/
- **David Sartor** (agro): antes, la comunicación iba por "mails, grupos de WhatsApp y reuniones presenciales". Hoy 70% activos por semana y +15 puntos en indicadores de comunicación. https://humand.co/es/caso-de-exito/david-sartor/
- **PECOM** (energía, 2.500 personas, oficinas y yacimientos): 82% activos por semana; foco en onboarding. https://humand.co/es/caso-de-exito/pecom/

No encontré ningún caso publicado de **menos de 100 empleados** ni ninguno de alquiler o montaje de andamios. La página de Construcción muestra logos (Techint, Tenaris, Holcim, MRV, ArcelorMittal), pero sus contadores de adopción aparecen en "0%" porque no cargan.

---

## 4. Puntos débiles

### 4.1 Lo que dicen los usuarios (reseñas reales de App Store)
- **Datos generales:**
  - App Store Argentina: 4,93 sobre 5 con 2.854 calificaciones. El promedio está inflado por los 5 estrellas que se dejan en el onboarding.
  - En las 62 reseñas recientes con texto de AR, MX, CO, CL y PE hay 42 de 5 estrellas y **19 de 1 a 3**.
- **Lo que se repite:**
  - **Login y sesión:** "cada 1 mes ya no podés entrar… cada minuto pide contraseña" (AR, 2024); "2 semanas y no puedo ingresar… ya había actualizado mi número" (MX, 2025, posiblemente OTP); "ni siquiera podemos iniciar sesión y nadie apoya de soporte" (MX).
  - **Rendimiento:** "se queda pegada, no actualiza la lectura de notificaciones" (CO, 10/2026); "demasiado lenta… la búsqueda de grupos o publicaciones es muy difícil" (CO, 2026); "se cierra constantemente" (MX).
  - **Videos y audio que se reproducen solos en segundo plano**, aun con la app cerrada (AR 01/2026, PE 02/2026, CO 2026).
  - **Actualizaciones que rompen cosas:** "no funciona la última actualización… necesito acceder a mis recibos" (AR, 01/2026); "el lector de PDF no carga" (AR, 03/2026); "no deja descargar los PDF de las nóminas" (MX).
  - **Fotos:** "solo deja enviar 10 fotos a la vez" para evidencias de trabajo (MX, 08/2026). Coincide con el límite documentado de 10 fotos por post.
  - **Privacidad:** selfie para fichar, "solicita demasiados accesos" (AR, 10/2026).
  - **Conectividad:** "no puedo utilizarla con datos y únicamente puedo acceder mediante red wifi" (AR, 2025).
  - **Uso real:** "para firmar los recibos nomás" (AR). Para muchos empleados es solo la app de los recibos.
- **Capterra, G2 y GetApp:** casi no aportan críticas. Según extractos del buscador, Capterra tiene unas 6 reseñas (4,5/5). Las únicas contras son "un par de bugs" resueltos rápido por soporte. No pude abrir esas páginas.

### 4.2 Límites que surgen del propio centro de ayuda
- **No hay confirmación de lectura obligatoria** ("leí y acepto") para comunicados del muro o de noticias. Lo que existe:
  - "Visto por" en posts de grupos.
  - "Leído por" en chats grupales.
  - La firma dentro de formularios o documentos.
- **Noticias es unidireccional** y sin métricas de lectura en el Admin. Al ampliar la audiencia no se manda push.
- El **push de Novedades importantes no funciona con posts segmentados**.
- **Husos horarios:** los posts usan la hora del dispositivo y los cumpleaños se configuran en UTC.
- **Anonimato del clima:** el umbral es 3 personas por líder y 10 respuestas para ver comentarios. En una empresa de 40 con cuadrillas de 3 a 5, muchos cortes quedan ocultos, o hay riesgo de identificar a la gente si se baja el umbral.
- **Depende de datos limpios:** jefe directo, fecha de ingreso y nacimiento, departamento y segmentaciones. Sin jefe directo cargado, las aprobaciones se traban.
- **A los usuarios "inactivos" sin mail no les llega nada.** La adopción depende de que el primer ingreso funcione.
- **Varias funciones se activan solo vía el ejecutivo de cuentas:** OTP, felicitaciones automáticas, reporte del muro, cambio del umbral de anonimato, logs de seguridad.
- **No hay offline** fuera del Kiosk, **no hay WhatsApp** y **no se publica precio.**

---

## 5. Lectura para ABA (opinión del analista, para el debate)

Esto no es una propuesta cerrada. Son referencias para la discusión entre agentes.

- **Lo que más rinde con 40 personas**, ordenado por impacto y costo:
  1. **Comunicados segmentados Oficina/Obra/Cuadrilla**, con "importante" fijado arriba y **confirmación de lectura nominal**. Esto último Humand *no* lo tiene bien resuelto y en obra hace falta, por ejemplo para cambios de seguridad.
  2. **Felicitación automática de cumpleaños y aniversarios con mensaje distinto para obra y oficina.** Es barato y muy valorado en una pyme familiar.
  3. **Reconocimientos simples atados a valores**, sin un catálogo de canje complejo. El canje con productos y períodos es demasiado para 40 personas.
  4. **Pulso corto y anónimo** de 3 a 5 preguntas más eNPS, con resultados **solo a nivel empresa u obra/oficina** por el umbral de anonimato.
  5. **Librería de conocimiento** con procedimientos de montaje, EPP, convenio UOCRA, beneficios y teléfonos útiles, y un asistente tipo Sammy que conteste con eso.
  6. **Formularios con foto y firma desde el celular.** Probablemente ya esté cubierto por partes, incidentes e inspecciones de AndamiosOS.
- **Lo que Humand demuestra que funciona con operarios:**
  - Que el usuario sea el DNI y entrar con SMS.
  - Un Kiosk compartido para quien no tiene celular.
  - Segmentar por tipo de personal.
  - Que el jefe directo apruebe desde el celular.
  - Una campaña de lanzamiento con métricas de activación.
- **Dónde ABA puede hacerlo mejor que Humand,** porque ya tiene el agente de WhatsApp y un kiosco propio en AndamiosOS:
  - Mandar el aviso o la encuesta **por WhatsApp**, con un link mágico o respuesta directa en el chat, para no depender de que instalen una app pesada.
  - Confirmación de lectura real.
  - Que el kiosco de obra muestre comunicados además de fichar.
  - Que funcione con poca señal.
  - Las críticas de App Store (login, peso, videos solos, recibos que no abren) son justamente los riesgos que hay que evitar.
- **Lo que no vale la pena copiar** para 40 personas:
  - Marketplace.
  - Grupos multiempresa.
  - Transmisiones en vivo.
  - Mapa de calor y comparativas de clima.
  - Videollamadas propias (ya existen Meet o WhatsApp).

---

## 6. Fuentes

**Centro de ayuda oficial de Humand.** Leído vía la API pública `https://help.humand.co/api/v2/help_center/es-419/articles.json` (597 artículos). Cada artículo está en `https://help.humand.co/hc/es-419/articles/<ID>`. Los principales:
- **Muro:** 26833661912979 (segmentar), 40004700214163 (lógica de segmentación), 43355395918995 y 50854146958739 (Novedades importantes), 26815444179987 (FAQ del muro), 39137334551827 (traducción), 41723511066003 (publicar en nombre de otro), 45900295242131 y 51392833005715 (aprobación), 55706646294163 (IA), 44038760766483 (encuesta en el muro), 26832465977747 (reporte), 56445300236819 (adjuntos).
- **Grupos:** 28701433894291, 26848476826003, 49752460219411, 51604555710099, 50627005710099.
- **Noticias:** 21725450120339, 21725466155795, 34236006148499.
- **Chat:** 55993154519955, 55741121008275, 55707020197395. **Transmisiones en vivo:** 38856926664083.
- **Encuestas:** 25864792405011, 25881750310035, 25880711902099, 26724529330451.
- **People Experience:** 30117876692627, 35336221773971, 36564184954643, 40152251881107, 55546990768787.
- **Reconocimientos:** 26526937701011, 32975150767251, 26591927686931, 26648902768787, 33480811883283, 26726607350291.
- **Cumpleaños:** 27010644553363, 25823864705683, 36601557284755, 25824177114131.
- **Eventos:** 38184919530003, 48732680372243, 54363044573459.
- **Librería:** 26495244326547, 40249682321043, 36558520816147, 26726269675795.
- **Formularios:** 25752807819539, 25753369155219, 25753972192531, 26725663104019, 26827478989715.
- **Notificaciones:** 38834618712083, 26632677286803.
- **Estadísticas:** 26363705576467, 54993719844755.
- **Otros:** 54348021622675 (estado), 53904287002771 (buscador), 33463621096339 (WhatsApp), 26832203408915 (Marketplace).
- **Sammy:** 56444991621395, 56218112597267, 53904299618707.
- **Login y usuarios:** 25970560191379, 27011322972051, 21698647526675, 25891716710163, 21686811595667.
- **App:** 25970467695763, 26682474550675, 26687710522771, 38847470125075.
- **Kiosk:** 38516937220755, 44616649395987, 49239673652243.
- **Implementación y permisos:** 26671184229139, 26597023405459, 50979352339475.

**Sitio de Humand:**
- https://humand.co/es (índice de módulos)
- https://humand.co/llms.txt
- https://humand.co/es/modulos/red-social-interna/
- https://humand.co/es/modulos/chat/
- https://humand.co/es/modulos/noticias/
- https://humand.co/es/modulos/encuestas/
- https://humand.co/es/modulos/people-experience/
- https://humand.co/es/modulos/reconocimientos/
- https://humand.co/es/modulos/cumpleanos-y-aniversarios/
- https://humand.co/es/modulos/live-streaming/
- https://humand.co/es/modulos/kiosk/
- https://humand.co/es/soluciones/construccion/
- https://humand.co/es/soluciones/logistica/
- https://humand.co/es/compara/gestion-de-equipos-de-planta-y-sucursales/
- https://humand.co/es/casos-de-exito
- https://humand.co/es/cantidad-de-colaboradores/menos-de-499/

**Casos:** /es/caso-de-exito/ más grupo-mirgor, loginter, yagmour, imi-sas, x-28-alarmas, grupo-del-pilar, pecom y david-sartor (todos en humand.co).

**Reseñas y metadatos:**
- App Store, ID 1510279082: `https://itunes.apple.com/lookup?id=1510279082&country=ar` y el RSS `https://itunes.apple.com/{ar,mx,co,cl,pe}/rss/customerreviews/id=1510279082/sortby=mostrecent/json`.
- Capterra https://www.capterra.com/p/10020153/Humand/ y https://www.capterra.es/software/1065630/humand. Dan 403; usé solo los extractos del buscador (6 reseñas, "desde US$4/usuario/mes", sin verificar).
- Software Advice https://www.softwareadvice.com/product/450764-Humand/ (403).
- TrustRadius https://www.trustradius.com/products/humand/pricing (sin precios).
- No encontré la ficha de Google Play.

**Prensa** (contexto: Serie A de US$66M, 1,6 millones de usuarios, más de 1.500 empresas):
- https://eleconomista.com.ar/negocios/startup-argentina-levanta-us-66-millones-wall-street-va-80-laboral-n92843
- https://www.forbesargentina.com/innovacion/tras-perseguir-marcos-galperin-dos-argentinos-sub-25-crearon-humand-app-crear-comunidades-digitales-corporativas-n37336
- https://infonegocios.info/nota-principal/comunicacion-interna-rr-hh-en-una-sola-app-asi-funciona-humand-la-plataforma-creada-por-dos-emprendedores-que-se-conocieron-por-marcos-galperin

El volcado completo del centro de ayuda quedó en `/private/tmp/claude-501/-Users-joaquin-Desktop-Proyectos-AndamiosOS/d6b9a456-65b1-48a8-a553-07aa82ba4088/scratchpad/humand/all.json`, por si otros agentes lo necesitan.

---

# Informe 2: Humand: gestión de personas, administración y precios

*(humand-gestion)*

# HUMAND: gestión de personas, administración y precios

**Relevamiento al 17/10/2026, para Andamios Buenos Aires.**

**Cómo lo armé:** la fuente principal es el centro de ayuda oficial de Humand (help.humand.co). WebFetch lo bloquea (403), así que bajé por su API pública los 597 artículos en español (locale es-419) y los leí. Sumé las páginas de producto de humand.co, la prensa y la legislación argentina. Capterra, GetApp, Software Advice y G2 también devuelven 403, así que de esos sitios solo tengo lo que aparece en los resultados de búsqueda. Lo marco cada vez que pasa.

---

## 1. Resumen

- **Qué es.** Una app "todo en uno" de comunicación interna y RRHH pensada para el **personal operativo sin computadora**. Tiene tres partes: Humand App (Android, iOS y Huawei), Humand Web (app.humand.co) y Humand Admin (admin.humand.co, conviene usarlo desde la PC). Tiene más de 30 módulos que se prenden y apagan desde el Admin.
- **Lo más útil para ABA en este frente:**
  - Recibos de sueldo con firma electrónica y opción de firmar en disconformidad.
  - Vacaciones y licencias con plantillas armadas según la Ley de Contrato de Trabajo.
  - Fichada con GPS y reconocimiento facial.
  - Kiosk en tablet compartida, que funciona sin señal.
  - Bolsa de horas.
  - Mesa de ayuda interna con flujos de aprobación.
  - Onboarding con firma de documentos.
- **No hace falta mail corporativo para entrar.** Se entra con usuario y contraseña o con código por SMS.
- **Precio: no es público.** Cotizan por empresa según cantidad de personas, módulos y armado inicial, con implementación incluida. Los agregadores de reseñas muestran un piso de **US$ 4 por usuario por mes**, pero no lo pude confirmar en la página. Para 40 personas mi estimación va de **US$ 2.000 a 5.000 por año**, según los módulos (detalle en la sección 6).
- **Límites que pesan en obra:**
  - La app pide Android 10 o más.
  - No hay modo sin conexión documentado para fichar desde la app; solo el Kiosk lo tiene.
  - La geocerca trabaja contra "sedes" fijas, así que cada obra tendría que cargarse como sede.
  - No tiene integración nativa con Odoo ni con sistemas de sueldos argentinos como Tango o Bejerman.
  - "Insights" mide cuánto se usa la plataforma, no indicadores de RRHH.

---

## 2. Cómo está armado

- **Comunidad.** Cada empresa es una "comunidad" con su logo, color, idioma y zona horaria.
- **Segmentaciones.** Son la columna vertebral: grupos con ítems (por ejemplo área, sede, convenio) que se usan para asignar políticas, permisos, contenidos y flujos. Entre categorías distintas se combinan con Y, y dentro de una misma categoría con O.
- **Regiones y sedes.**
  - Cada región tiene sus feriados (se importan por país y año) y su zona horaria.
  - Cada sede tiene coordenadas y una tolerancia de distancia, y es la base de la geocerca para fichar.
- **Jefe directo y aprobador designado** en el perfil de cada persona. De ahí salen el organigrama, las aprobaciones y el rol "Managers".

---

## 3. Funciones de este frente

### 3.1 Legajo digital (Usuarios)
- **Qué hace.** Es el perfil de cada empleado con:
  - Datos personales, de contacto y de trabajo.
  - **Campos personalizados** de tipo número, fecha, texto, usuario o listas. Para cada uno se define quién lo ve (todos, solo administradores, o la persona y los administradores) y si la persona lo puede editar.
  - **Historial laboral** de puestos, departamento, jefe y aprobador, con fechas. Siempre tiene que haber un puesto vigente, para que quede trazabilidad.
  - Pestaña de **documentos** con totales, pendientes de firma y carpetas.
- **Quién lo usa.**
  - RRHH lo carga y edita.
  - El empleado ve y edita lo que se le habilite desde "Perfil".
- **Flujo.**
  - Altas individuales o masivas por Excel.
  - Asignación masiva de jefes, puestos y aprobadores.
  - Desactivar a alguien conserva sus datos. Eliminarlo borra posteos, cursos realizados, tickets, segmentaciones y políticas de vacaciones. Los documentos firmados quedan, pero a nombre de "usuario eliminado".
  - Para el usuario se puede usar DNI y después cambiarlo al número de legajo por API.
- **No verificado:** alertas de vencimiento de documentos del legajo (por ejemplo carnet, apto médico o ART). No las encontré en ningún artículo.

### 3.2 Documentos personales y firma de recibos de sueldo
- **Qué hace.** Distribuye PDF (también XML) a cada persona en carpetas de hasta 3 niveles, clasificados por "tipo de documento" (Recibo, SAC, Contrato…), con pedido de firma opcional.
- **Carga masiva**, de hasta 10.000 archivos por tanda (recomiendan 500 a 1.000):
  - Acepta un ZIP con un PDF por persona, o un **"PDF sábana"** con todos los recibos juntos, que Humand corta solo.
  - Identifica a cada persona por el nombre del archivo, por su identificador interno o por un **campo del PDF como CUIL o DNI**.
  - Antes de enviar muestra un resumen con errores.
  - Opciones del envío: notificar, pedir firma, permitir firma en disconformidad y elegir la página donde va la firma (primera o última).
- **Del lado del empleado:** abre "Mis documentos", toca "Firmar documento" (o "firmar en disconformidad" si está habilitado), dibuja la firma y confirma. Lo puede hacer desde la app o desde la web. **No puede descargar el documento sin firmarlo antes**, sea conforme o disconforme.
- **Del lado de RRHH:**
  - Filtra por estado: no requiere firma, pendiente, firmado, firmado conforme y firmado no conforme.
  - Manda recordatorios a quienes tienen pendientes.
  - Descarga en ZIP los documentos filtrados; el link llega por mail y dura 1 hora.
  - Puede nombrar "responsables" por carpeta, con acceso solo a esa carpeta.
- **Seguridad opcional:** pedir la contraseña para abrir los documentos, con sesión de 5 minutos.
- **Tipo de firma:** **firma electrónica, no firma digital**, en palabras de Humand. Así funciona:
  - Usa cifrado con clave pública y privada para asegurar autenticidad y que el documento no se modifique después.
  - En el PDF queda impreso "Firmado por" y la fecha y hora con huso horario.
  - Si alguien edita el PDF fuera de Humand, la firma deja de ser íntegra. Se puede comprobar en validadordefirmas.gob.ar.
  - Humand afirma que es válida en Argentina, México, Estados Unidos, Uruguay, Ecuador, Colombia y España, y que la usan empresas que cotizan en bolsa.
- **Validez legal en Argentina** (esto es mi lectura, conviene confirmarlo con el contador o un abogado laboral):
  - **Res. 346/2019** (Secretaría de Trabajo): habilitó el recibo digital sin autorización previa, pero exigía **firma digital** de ambas partes bajo la Ley 25.506, opción de firmar en disconformidad y que el trabajador pudiera guardar sus recibos. Con esa regla, la firma electrónica de Humand quedaba débil como prueba (iProfesional, 2024).
  - **Ley 27.802 de Modernización Laboral** (Boletín Oficial del 06/03/2026). El **art. 38** reemplaza el art. 139 de la LCT: el recibo se entrega "mediante el sistema que permita su firma de manera digital o electrónica como constancia de entrega". El art. 40 reemplaza el art. 143 y dice que los recibos digitalizados "tendrán la misma validez que en formato papel".
  - **Qué significa:** con la ley nueva, la firma electrónica de Humand sirve como **constancia de entrega**. Según PASBBA Abogados, eso no equivale a consentimiento sobre cada concepto del recibo, y la obligación de probar la entrega sigue vigente.
  - **Pendiente:** no confirmé si la Res. 346/19 sigue vigente en lo que no contradice la ley. El Decreto 407/2026 reglamentario lo vi citado por terceros, no en el Boletín Oficial.

### 3.3 Vacaciones y permisos
- **Qué hace.** Maneja tipos de licencia por días u horas, con categorías: vacaciones, matrimonio, maternidad, paternidad, duelo, **accidente laboral**, enfermedad, examen, suspensiones, trabajo remoto y otras. Calcula saldos solo.
- **Plantillas por país**, entre ellas Argentina. La guía para Argentina propone:
  - 14 días anuales, ciclo de octubre a septiembre, acreditados al inicio del ciclo.
  - +7 días a los 5, 10 y 20 años de antigüedad.
  - Días corridos.
  - Proporcional para ingresos nuevos: 1 día cada 20 trabajados si al 31/12 la persona tiene menos de 6 meses.
- **Reglas configurables:**
  - Medio día, mínimos y máximos por pedido, permisos por horas en fracciones de 1 a 60 minutos.
  - Días de anticipación, bloqueo de pedidos retroactivos, bloqueo para ingresos recientes.
  - Bloques de 7 días y que empiecen un lunes.
  - Remanente, vencimiento y límites de saldo.
  - Período bloqueado.
  - **Adjunto opcional u obligatorio**, por ejemplo un certificado médico.
  - Campos extra en el pedido, por ejemplo quién lo reemplaza.
- **Flujo.**
  1. El empleado pide desde la app o la web y sigue el estado: en proceso, aprobada, rechazada o cancelada.
  2. La aprobación tiene **hasta 3 etapas**. Puede aprobar una persona puntual, un grupo, el jefe directo, el jefe del jefe o un aprobador designado. Con que apruebe uno de la etapa alcanza.
  3. El aprobador puede dejar un **sustituto** mientras está ausente.
  4. El jefe o el admin puede **pedir en nombre del empleado**, y el admin además puede autoaprobar. Esto le sirve al que no tiene celular.
- **Otras funciones:**
  - Al aprobarse se puede generar un **comprobante en PDF** que va a los documentos de la persona, con firma opcional.
  - Calendario de ausencias del equipo y calendario público.
  - Carga masiva de ausencias históricas.
  - Reportes de saldos por ciclo en CSV o Excel.
- **Límites documentados:**
  - El motivo de rechazo **no lo ve el empleado** (está en las preguntas frecuentes).
  - Si cambia el aprobador, las solicitudes ya enviadas siguen con el anterior.
  - Para que la ausencia aparezca en asistencia, la persona tiene que tener un turno asignado ese día.

### 3.4 Control de asistencia (fichadas)
- **Formas de fichar**, definidas en "políticas de marcaje" por grupo: desde la app, desde la web y desde el Kiosk. Además se pueden sumar relojes externos (ZKTeco por alianza, otros relojes biométricos por API).
- **En la app:**
  - Reconocimiento facial, que verifica que haya una persona real frente a la cámara. Hay una versión "flexible": si no reconoce a la persona igual registra la fichada y avisa al supervisor.
  - Registro de ubicación con precisión de hasta 30 m. **Solo se toma al iniciar y al terminar la jornada**, sin rastreo continuo.
  - **Geocerca** opcional: bloquea fichar fuera del radio de la sede.
  - Modo trabajo remoto, donde la ubicación queda solo como dato informativo.
  - Si el teléfono no da ubicación, la fichada se guarda como "Ubicación no disponible".
- **Incidencias automáticas**, comparando contra lo programado:
  - Ausencia.
  - Tardanza, con tolerancia configurable. Por defecto la documentación dice 10 minutos en un artículo y 15 en otro.
  - Fuera de ubicación.
  - Horas extra.
  - Incumplimiento horario (30 minutos o más por debajo de lo programado).
  - Olvido de marcaje: el reloj se cierra solo.
  - A las 00:00 se corta la jornada automáticamente.
- **Horas categorizadas:** extra, nocturnas, feriado, domingo, según reglas lógicas. Cada categoría puede **requerir aprobación** del líder, con aprobación masiva.
- **Bolsa de horas:** acumula horas para compensar con francos o con pago. Tiene reinicio semanal, mensual, trimestral o anual y un tope.
- **Reportes** detallados y consolidados por día, semana, **quincena** o mes. Las horas validadas "pueden enviarse a sistemas externos" para la liquidación (no hay detalle de con qué sistemas).
- **Quién lo usa:** el empleado ficha, el jefe ve a su equipo y descarga reportes, y RRHH configura todo y corrige fichadas a mano.

### 3.5 Horarios laborales y turnos
- **Horarios laborales:** días y franjas por persona o grupo, con carga masiva y horario nocturno.
- **Turnos laborales:**
  - Cuadrante semanal, repositorio de turnos y **plantillas** (4x2, 6x1, mañana y tarde…) con repetición automática.
  - Alertas de superposición.
  - El empleado ve su agenda en la app.
  - La página de producto menciona **intercambio de turnos** entre empleados; no lo vi detallado en el centro de ayuda.

### 3.6 Humand Kiosk
- **Qué es.** Una app para tablet o celular compartido que hace de reloj, vinculada desde el Admin con un código de 12 dígitos y asociada a una sede o centro de costo.
- **Cómo se identifica la persona:** con **PIN** o con **reconocimiento facial sin tocar**. Si el sistema encuentra varias caras parecidas, muestra una lista para elegir.
- **Sin mail ni celular propio.** Según la página de producto, **las fichadas se guardan sin conexión y se sincronizan cuando vuelve la señal**.
- **No vi que sirva para firmar ni ver recibos.** Es solo para fichar.

### 3.7 Organigrama
- Se arma solo a partir de las relaciones de jefe directo.
- Muestra nombre, antigüedad, departamento, puesto, mail y foto.
- **Una persona solo puede tener un jefe.** Lo de más de un jefe figura "en desarrollo".

### 3.8 Onboarding (y pre-boarding)
- **Procesos armados por pasos con tareas** de distinto tipo:
  - Leer.
  - Cuestionario.
  - **Pedir documentos**, que se guardan en el legajo.
  - **Formulario PDF** para completar y firmar.
  - **Firmar documento**, con la misma firma electrónica.
  - Completar datos personales.
  - Encuesta de experiencia.
  - Tareas para un "buddy" o un responsable puntual.
- **Asignación** manual o automática por fecha de ingreso y segmentación. La automática corre a las 10:00 hora de Argentina.
- **Pre-boarding:** si la fecha de ingreso es futura, la persona entra a un espacio restringido con cuenta regresiva y su lista de tareas.
- **Seguimiento:** el jefe ve el avance de su equipo en la app, y hay reportes en el Admin.

### 3.9 Evaluación de desempeño y competencias
- Ciclos con plantilla y banco de preguntas.
- Direcciones 360: hacia abajo, autoevaluación, hacia arriba, entre pares, externos y otros.
- Escalas propias, pesos por dirección, sección y pregunta.
- Etapa opcional de **calibración** por comité.
- **Matriz 9-box.**
- **Resumen escrito por IA** para el líder (solo desde la web).
- Resultados que se comparten al cerrar el ciclo.
- Se pueden sumar objetivos y competencias (banco de competencias, perfiles y ponderación).

### 3.10 Objetivos
- Ciclos de objetivos y medición binaria, numérica, monetaria o porcentual.
- Pesos por objetivo, flujo de aprobación de objetivos y fórmulas de puntaje propias.
- Tope de avance, carga masiva y reportes de participación.
- Se integran a la evaluación de desempeño.

### 3.11 Aprendizaje
- **Cursos** con lecciones (video, PDF, texto), evaluaciones con intentos limitados y encuesta de satisfacción.
- **Rutas** de varios cursos y categorías.
- **Certificados** personalizados.
- **Validación con firma al terminar el curso**, que sirve como constancia de capacitación.
- Recordatorios por push o mail, reportes por persona y por evaluación, reinicio o cierre forzado del avance.

### 3.12 Beneficios
- **Lo que dice la página:** catálogo de beneficios centralizado, con criterios de quién puede acceder y paquetes según perfil.
- **No verificado:** si incluye un marketplace de descuentos de terceros o solo el catálogo propio de la empresa. La página no lo explica y el centro de ayuda no tiene una sección de Beneficios.

### 3.13 Mesa de ayuda (Gestión de servicios), flujos de trabajo y formularios
- **Portal de servicios:**
  - El empleado inicia un pedido desde un catálogo, por ejemplo certificado laboral, cambio de datos, adelanto o préstamo, ropa o equipo de protección, insumos o reporte de un problema.
  - Sigue el estado, comenta y adjunta archivos.
  - Al cerrar responde una encuesta de satisfacción anónima.
- **Panel del agente y del coordinador:** mesas de ayuda, grupos, vistas guardadas, tareas asignadas, constancia en PDF y métricas (volumen y estado).
- **Flujos de trabajo:**
  - Se arman en un editor visual a partir de un disparador (cuando alguien inicia el servicio).
  - Pasos: aprobaciones (todos, o "el primero en responder"), tareas, cambios de estado.
  - Ramas que dependen de datos del pedido, del perfil o de la segmentación.
  - Estados: borrador, activo e inactivo.
- **Formularios y trámites:** formulario normal o PDF con campos para completar, aprobación en varias etapas (persona puntual, jefe, jefe del jefe), aprobación masiva y reportes en Excel.
- **SLA:** la página de producto **no los detalla**.

### 3.14 Sammy (asistente con IA)
- Responde con la base de conocimiento de la empresa: políticas, manuales y beneficios.
- **Conectado a Vacaciones,** contesta "¿cuántos días me quedan?" y puede iniciar un pedido de vacaciones, siempre con confirmación de la persona.
- Se le puede cambiar el nombre y la foto, y se habilita por permiso.

### 3.15 Analítica (Estadísticas / Insights)
- **Lo verificado:** métricas de **adopción** de la plataforma: usuarios activos e inactivos, participación, dispositivo, departamento y los más activos. Se filtra por hasta 5 segmentaciones y los datos tienen 1 hora de atraso.
- **No encontré** tableros de rotación, ausentismo, dotación ni costo laboral. Los datos de RRHH salen de los reportes de cada módulo (asistencia, saldos, desempeño) en Excel o CSV.

### 3.16 Otros módulos (mención breve)
- **Reclutamiento:** empleos, sitio de empleos, postulaciones internas y referidos.
- **Políticas, Archivos, Reserva de espacios, Encuestas y People Experience.**
- Estos son de otro frente de la investigación.

---

## 4. Seguridad, acceso y roles

- **Formas de entrar:**
  - Usuario y contraseña. **No hace falta mail.** Si alguien sin mail olvida la contraseña, el aviso va al mail de soporte de la empresa y un admin la resetea.
  - **Código por SMS.** Lo activa el ejecutivo de cuenta de Humand y rige para toda la comunidad, sin excepciones.
  - Inicio de sesión único con Google, Microsoft, Okta, Apple o SAML.
- **Roles y permisos:**
  - Roles fijos: "Administrador total", "Todos los usuarios" y **"Managers"**. Este último lo integra automáticamente cualquiera que tenga gente a cargo, con alcance sobre todo su equipo.
  - Roles a medida, asignados a mano (hasta 100 personas) o por segmentación.
  - Permisos generales o **específicos** (por ejemplo, solo sobre un grupo). Si una persona tiene los dos tipos, rige el más amplio.
  - Responsables por carpeta de documentos.
- **Registro de actividad** (auditoría) de inicios de sesión y cambios de usuarios, roles y segmentaciones, para cualquier período.
- **Infraestructura:**
  - Corre en AWS, en varias zonas y con backups diarios.
  - Recuperación ante desastres: RPO de 24 h y RTO de 10 min.
  - Disponibilidad garantizada de 99,9% mensual.
  - Pruebas de penetración externas cada 6 meses.
  - Humand dice tener **SOC 2** auditado por Scytale, con el informe disponible bajo acuerdo de confidencialidad.
  - Ojo: las certificaciones ISO 27001 y otras que lista la página de seguridad son **de AWS**, no de Humand.
  - Menciona GDPR, la ley de datos de México y la LGPD de Brasil. La Ley 25.326 de Argentina aparece solo de pasada.
- **Tecnología:** React Native, Node.js y PostgreSQL. La app pesa 49 MB y pide **Android 10 o más** o iOS 13 o más.

---

## 5. Integraciones

- **API pública REST (JSON)** documentada en Swagger, con claves de API separadas para pruebas y producción. Permite:
  - Altas, bajas y modificaciones de usuarios.
  - Segmentaciones.
  - **Carga de documentos personales**, o sea recibos.
  - Archivos, noticias, posteos y reconocimientos.
  - **Lectura de solicitudes de vacaciones.**
  - Envío de fichadas desde relojes externos.
  - Humand aclara que "no todos los métodos están documentados" por seguridad.
- **Webhooks:** por ahora solo para eventos de **Usuarios y Chats**.
- **Sistemas nombrados:** SAP, SuccessFactors, Fortia, Workbeat, Intelesis, Node-RED, Meta4, PeopleSoft y Active Directory, más ZKTeco para relojes.
- **Sistemas de sueldos argentinos y Odoo:** no aparecen Tango, Bejerman ni Odoo. Con AndamiosOS (Odoo + Supabase) habría que integrar por la API, a medida.
- **En la práctica, sin integración:**
  - Los recibos de cualquier sistema de sueldos entran como PDF sábana identificados por CUIL.
  - Las horas y novedades salen por reporte en Excel.

---

## 6. Precios

### Lo que es dato
| Fuente | Qué dice |
|---|---|
| Comparativa de Humand (20/05/2026) | "Humand se cotiza por organización en función del número de colaboradores, módulos activados y necesidades de setup, con implementación incluida." "Hay trial disponible." Precio "Personalizado". |
| humand.co | No hay página de precios (probé /precios, /pricing, /planes: todas dan 404). El botón "Empieza gratis hoy" lleva a un formulario de contacto. |
| Centro de ayuda ("¿Cómo contratar Humand?") | Hay que pedir demo o contacto comercial. |
| Capterra, GetApp, Software Advice (**solo por resultados de búsqueda**, las páginas dan 403) | "Desde US$ 4 por usuario por mes", con prueba gratis. Nota 4,5 sobre 5 con solo 6 reseñas. |
| Appvizer | "Precio a pedido". |
| Forbes Argentina (13/05/2026) e Infobae (25/02/2026) | Facturación estimada de US$ 20 millones al año. Más de 1,6 millones de usuarios y más de 1.500 empresas (Forbes dice más de 2.000). |

**Ojo con un error que circula:** el dato "Business para 250 a 2.000 empleados, US$ 20.000 al año según Capterra" que aparece en las búsquedas **es de Workvivo, no de Humand**. Lo verifiqué en la comparativa original.

**No encontrado:** si cobran por módulo o por paquete, si hay un mínimo de usuarios o de facturación, si cobran en dólares o en pesos, el IVA y el costo de los SMS.

### Lo que es estimación (mía)
- **Promedio general:** US$ 20 millones dividido 1,6 millones de usuarios da unos US$ 12,5 por usuario por año, o sea alrededor de **US$ 1 por usuario por mes**. Ese promedio está inflado por clientes grandes con descuento por volumen; una pyme seguramente paga bastante más por persona.
- **Para 40 personas:**

| Escenario | Supuesto | Por mes | Por año |
|---|---|---|---|
| Piso publicado en agregadores | US$ 4 por usuario | US$ 160 | ~US$ 1.900 |
| Módulos de RRHH (documentos, vacaciones, asistencia, turnos, mesa de ayuda) | US$ 6 a 10 por usuario | US$ 240 a 400 | ~US$ 2.900 a 4.800 |
| Si hay un mínimo de facturación por contrato | sin dato | ? | ? |

- **Costos aparte probables:** tablets para el Kiosk; relojes ZKTeco si se quieren; quizás los SMS para entrar.
- **Recomendación:** pedir cotización por escrito y ya armada en dos escenarios: (a) solo documentos, vacaciones y asistencia; (b) suite completa. Preguntar el mínimo, la moneda y si sube el precio al renovar.

---

## 7. Límites y puntos a validar para ABA (oficina y obra)

1. **Celulares de gama baja.** Android 10 o más es obligatorio, así que los equipos con Android 8 o 9 quedan afuera. La app pesa 49 MB y promete consumir pocos datos, pero no publica cifras.
2. **Sin señal.** Solo el Kiosk documenta que guarda fichadas sin conexión. Para la app no encontré modo sin conexión: sin GPS la fichada queda "sin ubicación".
3. **Obras que cambian.** La geocerca valida contra sedes con coordenadas fijas, así que habría que dar de alta y asignar una sede por obra. La alternativa es "trabajo remoto" con la ubicación como dato informativo, sin control.
4. **Firma de recibos.** Es firma electrónica. Con la Ley 27.802 (art. 38) alcanza como **constancia de entrega**. Conviene validarlo con el estudio contable o laboral antes de dejar el papel.
5. **Convenio UOCRA.** No hay nada específico del convenio. Las horas al 50% y al 100% y la quincena se podrían armar con horas categorizadas y reportes quincenales, pero no lo vi probado. Fondo de cese e IERIC: no aparecen.
6. **Organigrama con un solo jefe por persona.** No sirve para una cuadrilla de apoyo con dos capataces.
7. **"Insights" no es analítica de RRHH.** Mide uso de la plataforma; ausentismo y horas salen por Excel.
8. **Sin integración nativa con Odoo ni con sueldos argentinos.** Se puede integrar por API, y los webhooks son limitados.
9. **Personas sin celular.** Hay salidas: el jefe pide vacaciones en su nombre, y se ficha en el Kiosk con PIN o cara. No vi forma de firmar recibos sin la app o la web propias.
10. **Detalles chicos:** el motivo de rechazo de vacaciones no lo ve el empleado; el código por SMS se activa para todos sí o sí; eliminar un usuario borra historial.

## 8. Preguntas para una demo o cotización
- Precio para 40 usuarios por módulo, si hay mínimo, moneda, IVA, implementación y si sube al renovar.
- ¿La app ficha sin conexión? ¿Funciona en Android 8 o 9?
- ¿Se puede firmar un recibo desde el Kiosk?
- ¿Tienen geocercas por obra temporal o deberíamos crear una sede por obra?
- ¿Tienen clientes bajo convenio UOCRA? ¿Exportan novedades para Tango o Bejerman, o una integración con Odoo?
- ¿Qué posición tienen sobre la Res. 346/19 después de la Ley 27.802? ¿Ofrecen firma digital con certificador licenciado?
- ¿Tienen alertas de vencimiento de documentos del legajo (ART, aptos médicos, carnets)?

---

## Fuentes

**Humand, sitio y producto**
- https://humand.co/es (módulos)
- https://humand.co/es/modulos/documentos/
- https://humand.co/es/modulos/legajo-digital/
- https://humand.co/es/modulos/vacaciones-y-permisos/
- https://humand.co/es/modulos/control-de-asistencia/
- https://humand.co/es/modulos/kiosk/
- https://humand.co/es/modulos/turnoslaborales/
- https://humand.co/es/modulos/gestion-de-servicios/
- https://humand.co/es/modulos/beneficios/
- https://humand.co/es/modulos/insights/
- https://humand.co/es/modulos/integraciones/
- https://humand.co/es/modulos/seguridad-y-privacidad/
- https://humand.co/es/compara/mejores-plataformas-de-experiencia-del-empleado/ (precios y aclaración sobre Workvivo)

**Centro de ayuda de Humand** (https://help.humand.co/hc/es-419, artículos clave)
- Tipo de firma: https://help.humand.co/hc/es-419/articles/26527731653907
- Firma electrónica y validez legal: https://help.humand.co/hc/es-419/articles/26527758890387
- Firmar un documento: https://help.humand.co/hc/es-419/articles/26735370000787
- Distribución masiva por CUIL o DNI: https://help.humand.co/hc/es-419/articles/53250531731475
- Preguntas frecuentes de documentos: https://help.humand.co/hc/es-419/articles/26724188129939
- Responsables de carpeta: https://help.humand.co/hc/es-419/articles/40590233400851
- Vacaciones en Argentina: https://help.humand.co/hc/es-419/articles/26854816956947
- Proporcional para ingresos nuevos en Argentina: https://help.humand.co/hc/es-419/articles/49460084396691
- Aprobadores: https://help.humand.co/hc/es-419/articles/22607533164307
- Reglas de solicitud: https://help.humand.co/hc/es-419/articles/49396592311571
- Pedir en nombre de otro: https://help.humand.co/hc/es-419/articles/38834895208083
- Preguntas frecuentes de vacaciones: https://help.humand.co/hc/es-419/articles/33734035467027
- Políticas de marcaje: https://help.humand.co/hc/es-419/articles/36990054910867
- Geocerca: https://help.humand.co/hc/es-419/articles/51392849332499
- Geolocalización: https://help.humand.co/hc/es-419/articles/31008935692307
- Incidencias: https://help.humand.co/hc/es-419/articles/32752586846227
- Bolsa de horas: https://help.humand.co/hc/es-419/articles/55232592090643
- Aprobación de horas extra: https://help.humand.co/hc/es-419/articles/50620086847507
- PIN en Kiosk: https://help.humand.co/hc/es-419/articles/50588123082387
- Plantillas de turnos: https://help.humand.co/hc/es-419/articles/53700183747475
- Historial laboral: https://help.humand.co/hc/es-419/articles/53677389835411
- Pre-boarding: https://help.humand.co/hc/es-419/articles/53254967021715
- Firma en onboarding: https://help.humand.co/hc/es-419/articles/55007886527891
- 9-box: https://help.humand.co/hc/es-419/articles/35176623622291
- Flujos de trabajo: https://help.humand.co/hc/es-419/articles/50575676675859
- Sammy y vacaciones: https://help.humand.co/hc/es-419/articles/56217547504147
- Estadísticas: https://help.humand.co/hc/es-419/articles/26363705576467
- Roles y permisos: https://help.humand.co/hc/es-419/articles/47389902583827
- Rol Managers: https://help.humand.co/hc/es-419/articles/55932615833107
- Código por SMS: https://help.humand.co/hc/es-419/articles/27011322972051
- Inicio de sesión: https://help.humand.co/hc/es-419/articles/25970560191379
- SOC 2: https://help.humand.co/hc/es-419/articles/26733947039891
- API: https://help.humand.co/hc/es-419/articles/26406045370259
- Integraciones: https://help.humand.co/hc/es-419/articles/26597023405459
- Versiones mínimas: https://help.humand.co/hc/es-419/articles/26687710522771
- Cómo contratar: https://help.humand.co/hc/es-419/articles/26856465625235

**Reseñas** (solo por resultados de búsqueda, las páginas dan 403)
- https://www.capterra.com/p/10020153/Humand/
- https://www.getapp.com/hr-employee-management-software/a/humand/
- https://www.softwareadvice.com/product/450764-Humand/
- https://www.appvizer.com/hr/hrms/humand

**Prensa**
- https://www.forbesargentina.com/daily-cover/de-perseguir-galperin-su-auto-sumarlo-su-ronda-us-66-millones-camino-fundadores-humand-n88708
- https://www.infobae.com/economia/2026/02/25/una-startup-argentina-de-recursos-humanos-recibio-una-inversion-de-usd-66-millones-los-apoyan-galperin-y-otros-cinco-unicornios/

**Legislación argentina**
- Ley 27.802 en el Boletín Oficial: https://www.boletinoficial.gob.ar/detalleAviso/primera/339128/20260306
- Res. 346/19 (análisis): https://abogados.com.ar/resolucion-no-3462019-del-ministerio-de-produccion-y-trabajo-recibo-de-sueldo-digital/23487
- https://www.iprofesional.com/legales/412943-cual-es-la-diferencia-entre-firma-digital-y-firma-electronica
- https://pasbba.com.ar/nuevo-recibo-sueldo-claves-tecnicas-para-empresas/
- https://calcularsueldo.com.ar/normas-y-leyes/14140/asi-deben-ser-los-recibos-de-sueldo-en-2026-tras-la-reforma-laboral.html

**Datos crudos descargados:** `/private/tmp/claude-501/-Users-joaquin-Desktop-Proyectos-AndamiosOS/d6b9a456-65b1-48a8-a553-07aa82ba4088/scratchpad/humand-gestion/kb.json` (los 597 artículos del centro de ayuda, sirve para cruzar datos con los otros equipos).

---

# Informe 3: AndamiosOS: qué hay hoy de personas y RRHH

*(andamiosos-actual)*

# AndamiosOS: qué hay hoy de personas y RRHH (relevamiento del código, 17/10/2026)

No modifiqué nada. Lo que no pude verificar (datos de producción, Odoo en vivo) está marcado.

## 0. Resumen

- **No hay un registro único de empleados.**
  - **Legajos** (`personal`) es solo la gente de obra. Lo decidió JS el 10/10: el sync de Odoo no crea legajos para administrativos.
  - **La oficina** existe solo como usuarios del sistema (`user_profiles`) y, en Odoo, como `hr.employee`.
  - El **Organigrama** junta las dos fuentes.
- **Odoo es el dueño de los datos de la persona** (`hr.employee`, en un solo sentido). Un webhook y un cron diario mantienen Legajos.
  - Según `docs/equipos-del-dia/handoff.md`: 31 empleados de obra con régimen `operarios` (30 activos) y 15 de oficina con `administrativos`.
- **La asistencia "oficial" ya existe en Odoo**: el modelo `x_parte_diario`, que carga Juan Pablo a mano, una fila por empleado por día, y "se usa para liquidar". La app la lee pero no la escribe.
- **El personal de obra no se loguea.** Usa tres cosas, todas sin cuenta:
  - un link diario con token (`/h/<token>`);
  - un bot de Telegram;
  - el kiosco compartido del pañol, con credencial QR y PIN.
- **Hay módulos de RRHH armados en marzo que nunca se terminaron**: Legajos/documentos, Fichadas, Incidentes, Inspecciones y Vehículos. Tienen pantallas básicas, varios cuelgan de la tabla vieja `obras` (uuid) y no de las OT de Odoo, y les faltan piezas clave (subir archivos, vencimientos automáticos).
- **Riesgo de privacidad:** la RLS de `personal`, `documentos` y `fichadas` deja leer a cualquier usuario logueado (`USING (true)`). El permiso de módulo solo protege la pantalla. Esto hay que resolverlo antes de guardar recibos, certificados médicos o sueldos.

---

## 1. Qué existe (por módulo)

| Módulo | Rutas | Estado real | Qué hace con personas |
|---|---|---|---|
| **Legajos** (módulo `personal`) | `src/app/(dashboard)/personal/page.tsx`, `personal/[id]/page.tsx`, `src/hooks/use-personal.ts`, `src/components/personal/hoja-dia-legajo.tsx` | Vigente pero básico | Lista y alta manual. La ficha tiene las pestañas "Datos" y "Documentos" y tres tildes de la Hoja del día: Puede estar a cargo, Puede manejar, Telegram. **No hay pantalla para editar**: `useUpdatePersonal` existe y no lo usa nadie. "Cargar documento" guarda **solo metadatos** (tipo, emisión, vencimiento): no sube el archivo y `archivo_url` nunca se llena |
| **Sync Odoo → Legajos** | `src/lib/personal/sync-odoo.ts` (lógica pura con tests), `sync-odoo-servidor.ts`, `src/app/api/odoo/webhooks/empleados/route.ts`, `src/app/api/cron/personal-odoo/route.ts` (08:30 todos los días, `vercel.json`), `scripts/personal-sincronizar-odoo.mjs`, `scripts/hoja-dia-vincular-personal.mjs` | En producción | Cruza por `odoo_employee_id`, después por DNI, después por nombre. Crea legajos solo para operarios activos. Actualiza `activo`, `odoo_tarea` y el teléfono (solo si estaba vacío). Lo dudoso lo manda a la campanita (alerta `personal_odoo`). Nunca borra |
| **Fichadas** | `src/app/(dashboard)/fichadas/{page,qr,escanear}`, `src/app/api/fichadas/route.ts`, migración `20260331000008_fichadas.sql` | Prototipo del 31/03, sin cambios desde entonces | QR dinámico que genera un supervisor, geocerca contra `obras.latitud/longitud` (tabla vieja), registro de dispositivo. "Escanear" está dentro del dashboard (pide login) y **la persona se elige de un desplegable**: no prueba quién ficha. El doc de la Hoja del día dice que las ausencias "no se deducen de fichadas". No verifiqué si tiene datos en producción |
| **Hoja del día** (ausencias, quién va) | `src/lib/hoja-dia/*`, `src/components/hoja-dia/*`, `src/app/api/hoja-dia/*`, `src/app/h/[token]/*`, migración `20261011000001_hoja_del_dia.sql`, `docs/equipos-del-dia/modulo.md` | En producción | `hd_integrantes`: quién fue con qué cuadrilla cada día y quién estuvo a cargo. `hd_ausencias`: ausencias previstas (enfermedad, ART, personal, vacaciones, trámite, suspendido, sin aviso; también parciales por hora), que se anulan y no se borran. Lee `x_parte_diario` de los últimos 3 días hábiles para detectar ART largas. La API de ausencias ya acepta el módulo `personal` (pensada para "RRHH desde Personal"), **pero hoy solo se cargan desde la Hoja del día** |
| **Cuadrillas** | `src/app/(dashboard)/configuracion/cuadrillas`, `src/components/cuadrillas/*`, `src/lib/cuadrillas.ts`, migración `20260621000003_cuadrillas_config.sql`, `docs/cuadrillas/modulo.md` | Vigente | `cuadrillas.responsable_id` y `cuadrilla_personal`: plantel base, una cuadrilla por persona |
| **Organigrama** | `src/app/(dashboard)/organigrama/*`, `src/components/organigrama/*`, `src/lib/organigrama/*`, migración `20261012000003_organigrama.sql`, `docs/organigrama/modulo.md` | En producción desde el 12/10 | Puestos con misión, tareas, documentos, "qué NO hace" y KPIs, con versiones que se publican. `org_ocupantes` acepta `personal_id`, `usuario_id` o `nombre_libre`, con historial `desde/hasta` y modalidad titular/interino/compartido. "Para revisar" muestra bajas con puesto, vacantes y sobrecarga. "Tu lugar". La ficha de persona muestra solo contacto laboral. Funciona con RPC `SECURITY DEFINER` (`org_leer`, etc.). **Es lo más cercano a un "directorio de la empresa"** |
| **Pañol / kiosco** | `src/app/kiosco/*`, `src/components/panol/kiosco/*`, `src/lib/panol/*`, migración `20261010000001_panol.sql`, `docs/panol/modulo.md` | En producción | Identifica a la persona con credencial QR impresa o PIN de 4 dígitos (`pan_credenciales`, HMAC). Sesión corta (`pan_sesiones`). Personas externas en `pan_personas_externas`. **El EPP con talle ya entra como insumo con variantes.** La constancia de entrega firmada (Res. SRT 299/2011, Disp. SRT GP 2/2021) quedó para la fase 2 |
| **Partes de obra** | `src/app/(dashboard)/partes`, `src/lib/odoo/partes.ts`, `docs/partes/*` | Vigente; rediseño solo en papel | El parte va a Odoo (`x_aba_parte_diario`) con líneas `x_aba_mano_obra` **por tarea y cantidad de personas, no por persona**. Odoo calcula las horas-hombre y el costo. El rediseño prevé que el capataz declare desde el celular |
| **Habilitaciones** | `src/app/(dashboard)/habilitaciones`, `docs/habilitaciones/modulo.md` | En producción | Pide papeles de personal por obra: la **Nómina ART** aplica en el 82 % de las obras, más seguro, cláusula de no repetición y capacitaciones. La nómina **no se genera desde Legajos**: se sube como archivo ("la manda el contador") |
| **Incidentes / Inspecciones** | `src/app/(dashboard)/incidentes`, `inspecciones`, migración `20260331000002_fase3_schema.sql` | Prototipo del 30/03 | `incidentes.personas_involucradas` es un JSONB libre, no está atado a `personal`. Cuelgan de la tabla vieja `obras`. No hay circuito de accidente laboral ni denuncia a la ART |
| **Vehículos** | `src/app/(dashboard)/vehiculos` | Prototipo del 30/03 | `vehiculos.chofer_habitual_id` apunta a `personal`. No guarda el registro de conducir del chofer (no existe el tipo de documento) |
| **Usuarios** | `src/app/(dashboard)/configuracion/usuarios`, `src/app/api/usuarios/*`, `src/components/usuarios/*` | En producción | Alta con contraseña temporal (`debe_cambiar_clave`), perfil y permisos por módulo. Solo admin |
| **Sistemas** (propuesta, sin código) | `docs/sistemas/propuesta.md`, `maqueta.html` (sin commitear) | Diseñado | Reportes con captura, bandeja de JS y un **recorrido obligatorio** para todos. Comparte patrón con comunicados y onboarding |

## 2. Qué datos de personas se guardan y dónde

| Dato | Dónde vive | Dueño |
|---|---|---|
| Nombre, DNI (`identification_id`), celular, activo/baja, tarea (`x_tarea`: andamista/chofer/herrero), régimen (`x_regimen_liquidacion`) | Odoo `hr.employee` | Odoo |
| Legajo de obra: nombre, DNI (o `TMP-…` provisorio), CUIL, nacimiento, domicilio, teléfono, email, contacto de emergencia, puesto (enum de 9 valores), categoría, especialidad, ingreso, ART, obra social, `estado_habilitacion`, observaciones | Supabase `personal` (`20260330000001_initial_schema.sql`) | La app. Hoy la mayoría de estos campos se carga a mano y probablemente esté vacía (**no verificado**) |
| Vínculos del legajo: `odoo_employee_id`, `odoo_tarea`, `user_id` (usuario del sistema), `telegram_chat_id/usuario/vinculado_at`, `puede_estar_a_cargo`, `puede_manejar` | `personal` (migraciones de pañol y hoja del día) | La app |
| Documentos de la persona (DNI, alta AFIP, ART, curso de altura, psicofísico, seguro de vida, EPP, inducción) con emisión y vencimiento | Supabase `documentos`, polimórfica (`entidad_tipo='personal'`) | La app. **Sin archivo y sin cron que recalcule el estado**: las funciones `actualizar_estado_documentos()` y `actualizar_habilitacion_personal()` existen en la migración inicial y nadie las llama |
| Oficina: email, nombre, apellido, teléfono, rol, permisos | Supabase `user_profiles` | La app. **No tiene `odoo_employee_id`** (solo `comercial_vendedores` lo tiene) |
| Asistencia diaria (presente/ausente/suspendido + tipo) | Odoo `x_parte_diario` | Juan Pablo, a mano |
| Ausencias previstas | `hd_ausencias` | La app (planificador) |
| Quién fue a qué obra con quién, quién estuvo a cargo | `hd_integrantes` / `hd_hojas` | La app |
| Horas-hombre y costo de mano de obra | Odoo, el parte (calculado) | Odoo |
| Puesto que ocupa, jefe, historial de puestos | `org_ocupantes` | La app |
| PIN y credencial | `pan_credenciales` | La app |
| Retiros y préstamos de herramientas y EPP por persona | `pan_vales`, `pan_movimientos`, `pan_saldos` | La app |
| Sueldos | No hay `hr.payslip` ni `hr.contract` en el código. En Dirección los sueldos aparecen como asientos contables devengados (`src/lib/direccion/*`). **Quién liquida (¿estudio contable?) no está en el repo** | — |

## 3. Cómo acceden hoy oficina y obra

- **Oficina**
  - Supabase Auth con email y contraseña (`src/app/(auth)/login`, `signInWithPassword`; el alta da una contraseña temporal).
  - Dashboard con sidebar, tema oscuro por defecto.
  - La campanita (`alertas`, por destinatario o por rol) más el espejo en Slack.
- **Obra.** No hay cuentas.
  - **Link diario `/h/<token>`** (capataz y chofer):
    - un token de 32 caracteres por persona y día, que vence a las 23:59 del día siguiente;
    - pantalla clara de alto contraste, sin sesión, `no-referrer`;
    - service worker propio (`src/app/h/sw.js/route.ts`) para funcionar sin señal;
    - "Recibido", "Hecho" y "No pude" se encolan si no hay red;
    - límite de pedidos por token.
  - **Bot de Telegram** (`src/lib/hoja-dia/telegram.ts`, `src/app/api/telegram/webhook`):
    - se vincula una sola vez con `t.me/<bot>?start=<código>`;
    - después el bot le escribe primero a la persona, sin plantillas de Meta;
    - tiene botones de respuesta;
    - la empresa ya usa un grupo de Telegram para fotos de obra (`src/lib/mapa-obras/fotos-telegram.ts`).
  - **Kiosco del pañol** (`/kiosco`): un dispositivo compartido con un usuario de módulo `panol-kiosco`. Cada operación arranca con "¿Quién sos?" (QR o PIN) y vuelve a preguntar a los 60 segundos sin uso.
  - **WhatsApp a obra: solo manual.** Links `wa.me` armados con el texto (`src/lib/panol/whatsapp.ts`, que también normaliza teléfonos argentinos).
  - **Fichadas:** existe la pantalla, pero pide login (ver §1).

## 4. Roles y permisos (cómo se sumaría un módulo RRHH)

- **Una sola fuente:** `src/lib/auth/acceso.ts`.
  - `DEFINICION` define los módulos con `{id, titulo, grupo, rutas}`, nivel `ver`/`editar` por usuario en `user_profiles.permisos` (jsonb), y las banderas `soloLectura`, `incluidoEn` y `exigeExplicito`. `exigeExplicito` es lo que usa Dirección › Socios: ni el admin lo trae solo, lo cual sirve para datos sensibles (sueldos, salud).
  - `APIS` mapea cada prefijo de API a sus módulos. Una API que no está en la lista queda solo para admin.
  - `PERFILES` son plantillas: admin, operativo, deposito, campo, comercial.
- **Dónde se aplica:**
  - el proxy (`src/proxy.ts` y `src/lib/supabase/proxy.ts`) bloquea páginas y APIs llamando a `mi_acceso()`;
  - las rutas públicas van en `publicPaths` (`/h/`, `/permiso/`, `/api/public`, webhooks, crons);
  - el menú está en `src/lib/constants/navigation.ts`, grupo "Personal y flota": Legajos, Fichadas, Vehículos, Organigrama.
- **Ojo con la RLS vieja:**
  - `personal`, `documentos` y `fichadas` tienen SELECT `USING (true)` para cualquier logueado;
  - el INSERT/UPDATE usa `get_user_role() IN ('admin','operativo')`, el rol y no el permiso;
  - los módulos nuevos (Hoja del día, Organigrama) ya usan RLS por permiso o RPC `SECURITY DEFINER`. Ese es el patrón a copiar.

## 5. Integración con Odoo (lo relevante a RRHH)

- **Cliente:** `src/lib/odoo/client.ts` (`searchRead`, `create`, `write`, `read`, `executeKw`).
- **`hr.employee`** se lee en `sync-odoo.ts` y solo 7 campos: `name, active, identification_id, mobile_phone, work_phone, x_tarea, x_regimen_liquidacion`.
  - No se leen departamento, jefe (`parent_id`), puesto, fecha de ingreso, CUIL, nacimiento, contrato ni foto.
  - La propuesta del organigrama pedía chequear si `hr.department` y `parent_id` tienen datos. No encontré constancia de que se haya hecho (**no verificado**).
- **Otros usos de `hr.employee`:**
  - `x_puntero_id` del parte (quién estuvo a cargo);
  - `x_studio_tcnico` de la venta (técnico asignado);
  - `comercial_vendedores.odoo_employee_id`.
- **`x_parte_diario`** (la asistencia) se lee en `src/lib/hoja-dia/servicio.ts` (`leerAsistencia`). Escribirla desde la app ("Asistencia de hoy" precargada) está propuesto como fase 2 en `docs/equipos-del-dia/modulo.md` §13, sujeto a que lo aprueben Juan Pablo y JS.
- **Automatismos de Odoo:** cuando hay un `base.automation` sobre `hr.employee`, Odoo llama por webhook a `/api/odoo/webhooks/empleados?secret=…` (en `after()`, de forma idempotente).
- **No se usan** `hr.attendance`, `hr.leave` ni `hr.payslip`. No sé si están instalados en la instancia (**no verificado**).

## 6. Notificaciones y canales disponibles

| Canal | Dónde | A quién llega |
|---|---|---|
| Campanita (`alertas`, `alertas_lecturas`) | `src/lib/alertas/servicio.ts`, `src/components/layout/campanita.tsx` | Usuarios logueados, por id o por rol. Deduplica por `alertas.clave` |
| Slack (webhooks por canal: syh, logística, permisos, pañol) | `src/lib/alertas/slack.ts` | Oficina |
| Telegram bot | `src/lib/hoja-dia/telegram.ts`, `hd_telegram_*` | Obra (vinculados). Ya registra el envío y la respuesta de cada mensaje |
| WhatsApp Cloud API (Meta) | `src/lib/whatsapp/api.ts`, `procesar.ts`, `tandas.ts` | Hoy solo los números de vendedores (asistente) y de clientes (Tomás). Escribirle primero a un empleado requeriría plantillas aprobadas por Meta |
| wa.me manual | `src/lib/panol/whatsapp.ts` | Cualquiera con celular cargado |
| Mail SMTP (Google Workspace) | `src/lib/mail.ts` | Solo envía. Obra no tiene mail |
| Voz (ElevenLabs) y transcripción de audio | `src/lib/voz/*`, `src/app/api/comercial/asistente/transcribir` | Hoy comercial. Se podría reusar para comunicados en audio y para recibir pedidos por audio |
| Push web | **No existe.** Hay `manifest.json` (PWA del escritorio) y un service worker solo en `/h/` | — |

## 7. Piezas reutilizables para RRHH

1. **Link con token sin login** (`/h/<token>`, `hd_links`, `src/lib/hoja-dia/tokens.ts`, `reglas-publico.ts`, `publico.ts`). Ya resuelve offline, alto contraste, conteo de "abierta/recibida" y límite de abuso. Sirve de base para un "Mi legajo / Mis recibos / Mis pedidos" del operario sin crearle cuenta.
2. **Bot de Telegram**: el canal de llegada a obra que ya está vinculado y funcionando. Comunicados con "Entendido", pedidos de vacaciones o adelantos con botones, avisos de vencimiento.
3. **Kiosco QR + PIN** (`pan_credenciales`, `pan_sesiones`, `src/components/panol/kiosco/sesion`). Identifica a la persona en un equipo compartido. Sirve para fichar en el depósito, firmar la entrega de EPP o leer un comunicado en la tablet.
4. **Firma con el dedo y PDF firmado**:
   - `src/components/permisos-via-publica/firma-pad.tsx` (canvas, valida que haya trazo de verdad);
   - `src/lib/permisos-via-publica/documentos-firmados.ts` (pdf-lib, constancia al pie con quién, DNI y cuándo, más hash);
   - el portal con token `src/app/permiso/[token]` y `src/app/api/public/permiso/[token]/firmar`.

   Encaja directo con la constancia de EPP (Res. SRT 299/11), la firma de recibos, sanciones y reglamento interno.
5. **PDF**: `@react-pdf/renderer` (`src/lib/cotizador/pdf/documento.ts`, `src/components/pdf/pdf-download-button.tsx`, etiquetas del pañol) y `pdf-lib`.
6. **Subir archivos**:
   - `src/components/upload/file-upload.tsx` (Supabase Storage, con modo cámara);
   - buckets privados con URLs firmadas (patrón de `fotos-telegram.ts`);
   - nombres seguros (`src/lib/hoja-dia/archivo-seguro.ts`).
7. **Ausencias** (`hd_ausencias` y su API): es la base natural de "licencias y vacaciones". Ya usa los tipos de `x_parte_diario`.
8. **Organigrama**: directorio, jefe directo (para saber quién aprueba qué) y "Tu lugar".
9. **Historial y Deshacer** (`hd_historial`), `audit_log` con trigger sobre `personal` y `documentos`, y el patrón de parámetros con historial (`pan_parametros_historial`, `hd_parametros_historial`).
10. **Recorrido guiado** (`src/hooks/use-tour.ts`, driver.js) y el recorrido obligatorio que propone Sistemas. Sirven para onboarding y para comunicados que hay que leer sí o sí.
11. **Crons** (`vercel.json`, protegidos con `CRON_SECRET`) y el barrido diario de alertas (`/api/alertas/barrido`), que pueden sumar vencimientos de documentos y cumpleaños.
12. **Sync con Odoo con decisión pura y tests** (`sync-odoo.ts`): el mismo esquema se puede extender a más campos de `hr.employee`.

## 8. Sistema de diseño

- **Base:** Tailwind v4 más shadcn sobre `@base-ui/react` (`src/components/ui/*`: sheet, dialog, tabs, table, select, switch, calendar, etc.).
- **Compartidos** en `src/components/shared/*`: `DataTable` (TanStack), `PageHeader`, `EmptyState`, `StatusBadge`, `chatter`, `confirm-dialog`.
- **Tokens** en `src/app/globals.css` (566 líneas, oklch):
  - primario coral ABA `#D85A30` (`--primary: oklch(0.62 0.16 42)`), radio de 0.5rem, sidebar oscuro;
  - paleta pastel `--tb-*` (azul, ámbar, verde, rosa, violeta, teal, coral, gris), que también son los colores de área del organigrama;
  - tokens `--hd-*` de la Hoja del día.
- **Tipografía:** DM Sans y JetBrains Mono (`src/app/layout.tsx`). El escritorio arranca en tema oscuro (`next-themes`, `defaultTheme="dark"`).
- **Celular de obra:** el link `/h/` fuerza tema claro, blanco, con zoom habilitado. Hay un marco de teléfono para previsualizar (`src/components/hoja-dia/celular/marco-telefono.tsx`, `celular.module.css`). Las maquetas previas viven como HTML sueltos en `docs/*/maqueta.html`.

## 9. Huecos evidentes

1. **No hay un registro único de empleados**: la oficina no tiene legajo. Para RRHH hace falta una ficha por persona, de oficina y de obra, colgada de `hr.employee`.
2. **Legajos está a medias**: no se puede editar, los documentos no tienen archivo, nada recalcula vencimientos, no avisa y faltan tipos (registro de conducir, apto médico, certificado de curso con entidad).
3. **Privacidad**: RLS abierta en `personal`, `documentos` y `fichadas`. Datos sensibles (salud, sueldos, sanciones) necesitan RLS por permiso y probablemente `exigeExplicito`.
4. **Recibos de sueldo**: no hay nada (ni carga, ni firma, ni entrega). Tampoco se sabe de dónde salen (¿el contador?).
5. **Vacaciones y licencias**: no hay pedido ni aprobación por parte del empleado, ni saldo de días. Lo único que hay son ausencias que carga el planificador.
6. **Asistencia doble carga**: Juan Pablo carga `x_parte_diario` aparte de lo que ya sabe la Hoja del día. La fase 2 ("Asistencia de hoy" precargada que escribe en Odoo) está diseñada y sin hacer.
7. **Fichadas**: el prototipo no identifica a la persona y está atado a la tabla vieja `obras`. Sirve para descartarlo o rehacerlo, no para extenderlo.
8. **Comunicación interna**: no hay comunicados, cartelera, encuestas, cumpleaños ni reconocimientos. Hay canales (Telegram, Slack, campanita) pero ningún contenido de RRHH.
9. **EPP**: el stock por talle existe. La constancia de entrega firmada y digital (Res. SRT 299/11) está pendiente como fase 2 del pañol.
10. **Seguridad e higiene y accidentes**: Incidentes es un prototipo sin vínculo a `personal`. No hay circuito de accidente de trabajo y ART, aunque la ART aparece como tipo de ausencia.
11. **Capacitaciones e inducción**: solo existen como tipo de documento. No hay registro de quién hizo qué curso ni cuándo vence.
12. **Onboarding y offboarding**: el alta llega sola desde Odoo, pero no hay checklist (credencial del pañol, vincular Telegram, EPP, inducción, nómina ART). La baja no recupera herramientas ni EPP, salvo lo que ya avisa el pañol.
13. **Push**: no hay notificaciones push. Para obra, Telegram cubre ese papel.
14. Limpieza (no hace a RRHH): hay unas 20 carpetas vacías tipo "X 2" (copias de Finder) en `src/app/api/hoja-dia`, `src/components/hoja-dia`, `src/app/h` y otras.

## 10. No verificado (requiere producción o Odoo en vivo)

- Cuántos legajos tienen CUIL, ART, obra social y documentos cargados.
- Si `fichadas` tiene filas.
- Cuántos operarios tienen Telegram vinculado.
- Si Odoo tiene instalados `hr.attendance`, `hr.leave`, `hr.payslip` o `hr.contract`, y si `hr.department` y `parent_id` tienen datos.
- Quién liquida sueldos y en qué formato llegan los recibos.
- Si todo el personal de obra usa Telegram (está documentado que la empresa lo usa para fotos; no sé si llega a todos).

## 11. Sugerencias de ingeniería para la propuesta (para no duplicar)

- **El ancla de la persona es `hr.employee`.** Hay que ampliar el sync a la oficina (hoy los ignora) o crear una ficha RRHH que apunte a `odoo_employee_id`, `personal.id` y `user_profiles.id`, siguiendo la regla del organigrama ("la misma persona aparece una vez").
- **Ausencias y licencias**: extender `hd_ausencias` (agregar estado de pedido y aprobación) en lugar de crear otra tabla.
- **Asistencia**: no inventar otro registro. Hay que hacer la fase 2 de la Hoja del día que escribe en `x_parte_diario`.
- **Obra**: armar sobre el link con token, el bot de Telegram y el kiosco con PIN. Nada de cuentas ni contraseñas para el operario.
- **Firma y PDF**: reusar la firma con el dedo y el PDF firmado de Permisos para recibos, EPP y reglamento.
- **Permisos**: un módulo nuevo en `acceso.ts`, con `exigeExplicito` para lo sensible y RLS por permiso desde el día uno. Además, cerrar la RLS de `personal`, `documentos` y `fichadas`.

---

# Informe 4: Normativa: obligaciones de RRHH, laborales y de SyH

*(normativa-sector)*

# Obligaciones de RRHH, laborales y de Seguridad e Higiene para ABA: informe para diseñar el módulo RRHH

**Fecha:** 17/10/2026. **Alcance:** pyme de unas 40 personas, con personal de obra bajo UOCRA (Ley 22.250 y CCT 76/75) y personal de oficina (probablemente CCT 130/75 de Comercio o fuera de convenio; eso hay que confirmarlo con el contador).

Cada punto está marcado así:
- **[Verificado]**: lo leí en el texto oficial (Boletín Oficial, argentina.gob.ar o el anexo de la norma).
- **[Secundaria]**: viene de estudios contables o jurídicos y no lo contrasté con la norma.
- **[No confirmado]**: hay que validarlo con el contador, con Seguridad e Higiene (HyS) o con la ART.

---

## 0. Lo que cambió en 2026

En 2026 se publicó la **Ley 27.802 de Modernización Laboral** (BO 06/03/2026) y sus decretos reglamentarios **407/2026 y 408/2026** (BO 01/06/2026). Cambian varias bases del módulo:

1. **No hace falta llevar libros laborales** "en soporte físico ni digital". La registración se cumple con el alta y la baja en los sistemas de ARCA, y ningún otro organismo puede pedir requisitos adicionales (art. 52 LCT, reglamentado por Dec. 407/26, Anexo I, art. 1). **[Verificado]**
2. **Personal UOCRA:** el alta, la baja y las modificaciones se hacen ante ARCA, ya no ante el IERIC. La "constancia fehaciente de la registración" del trabajador de la construcción pasa a ser la que surge de ARCA (Dec. 407/26, arts. 17 a 20). ARCA y el IERIC tenían 120 días para adecuar sistemas, y mientras tanto el IERIC funciona como "canal transitorio" (art. 21). El 01/10/2026 el IERIC informó que sigue en adecuación y que **las inspecciones mantienen su rutina** hasta que se implemente la interoperabilidad. **[Verificado]**
3. **Recibo de sueldo:**
   - Se elimina el doble ejemplar. La constancia de entrega puede ser una **firma digital o electrónica** (art. 139 LCT).
   - Se agrega el inciso j): las contribuciones que paga el empleador.
   - El Dec. 407/26 obliga a un formato de **4 secciones**, con un **resumen del costo laboral total** en el anverso y un modelo obligatorio (Anexo III).
   - Conservación: 2 años para lo laboral y 10 para lo previsional. La versión digitalizada tiene la misma validez que el papel (art. 143). **[Verificado]**
4. **Certificados médicos:** tienen que traer diagnóstico, tratamiento y días de reposo. Se emiten **electrónicamente** desde plataformas registradas en el ReNaPDiS y los firma un profesional inscripto en el REFEPS. El papel solo se acepta si se acredita falta de conectividad o una caída del sistema (art. 210, reglamentado por Dec. 407/26). **[Verificado]**
5. **Vacaciones:** se notifican por escrito con **30 días** de anticipación (antes eran 45). Se pueden fraccionar en tramos de 7 días o más. Al menos una vez cada 3 años tienen que caer en verano (art. 154). **[Verificado]**
6. **Fondo de Asistencia Laboral (FAL):**
   - Contribución mensual del empleador: **2,5% para MiPyMEs**, sobre la base de las contribuciones al SIPA.
   - **Excluye a los trabajadores de la Ley 22.250**, así que para ABA aplica solo al personal de oficina.
   - El Dec. 408/26 corrió la vigencia al **01/11/2026**, es decir, dentro de dos semanas.
   - Faltan normas complementarias de ARCA y la CNV; no confirmé si ya salieron. **[Verificado: ley y prórroga / No confirmado: operatoria]**
7. **Certificado de trabajo (art. 80):** se da por cumplido si queda disponible en formato digital o en ARCA (RG ARCA 5848/2026). **[Secundaria]**
8. **Renuncia:** se puede hacer por telegrama digital o ante la autoridad administrativa (art. 240). **[Verificado]**

**Para el diseño:** AndamiosOS no tiene que llevar un "libro". Su rol es llevar el **legajo y la trazabilidad** (quién recibió qué, cuándo y con qué firma), conciliar contra ARCA y controlar vencimientos.

---

## 1. Tabla maestra de obligaciones y documentos

Columnas: **Quién** = quién lo genera · **Aplica a** = O (obra), Of (oficina), Ambos · **Vence / frecuencia** · **Digitalizable**.

### 1.A Registración y liquidación

| Documento / obligación | Quién | Aplica a | Vence / frecuencia | Digitalizable | Riesgo si falta | Estado |
|---|---|---|---|---|---|---|
| **Alta en ARCA** (Simplificación Registral / "Mi Simplificación", app "Alta Ya") | Contador o administración | Ambos | Antes del primer día de trabajo. La **baja**, dentro de los 5 días corridos del cese (según fuentes viejas) | Sí, la constancia sale de ARCA en PDF | Trabajo no registrado: multas de ARCA, presunciones a favor del trabajador (art. 55 LCT), sin cobertura de ART | Obligación verificada; plazos exactos de RG 2988 y sus modificaciones **no confirmados** |
| **F.931** (DDJJ mensual de cargas sociales) y su pago | Contador | Ambos | Mensual | Ya es digital (ARCA). La genera el sistema de sueldos | Deuda, intereses, multas. Además el comitente lo pide para dejar entrar a obra | Verificado. Si el servicio "Libro de Sueldos Digital" sigue como vía del F.931 después del Dec. 407 está **no confirmado** (hay opiniones encontradas) |
| **Recibo de sueldo** con el formato de 4 secciones y el costo laboral | Contador (liquidación). ABA distribuye y junta las firmas | Ambos | Mensual, más SAC y liquidaciones finales | **Sí**: entrega con firma electrónica o digital del trabajador como constancia (art. 139) | Sin constancia de pago firmada el pago es difícil de probar en juicio; multa administrativa | Verificado (Ley y Dec. 407). Ver §3 sobre el tipo de firma |
| **Conservación de recibos y constancias** | ABA | Ambos | **10 años** (previsional) | Sí, con la misma validez | Imposible defenderse en juicios e inspecciones | Verificado |
| **Pago en cuenta sueldo** sin costo ni límite de extracción | Administración | Ambos | Mensual | — | — | Verificado (art. 124, según elDial) |
| **FAL 2,5%** | Contador vía ARCA | **Solo oficina** | Mensual desde 01/11/2026 | Sí (ARCA) | Deuda de seguridad social | Ley verificada; operatoria **no confirmada** |
| **Certificado art. 80** al cese | Contador / ARCA | Ambos | Al cese (elDial menciona 45 días hábiles) | Sí (RG 5848/26) | Multa del art. 80 | Secundaria |

### 1.B Construcción: Ley 22.250, IERIC y UOCRA

| Documento / obligación | Quién | Aplica a | Vence / frecuencia | Digitalizable | Riesgo si falta | Estado |
|---|---|---|---|---|---|---|
| **Fondo de Cese Laboral**: depósito mensual del **12% el primer año y 8% después**, en una cuenta bancaria a nombre del trabajador. Con el reingreso vuelve al 12% | Contador. Depósito bancario | O | Mensual. Las fuentes ubican el depósito en los primeros 15 días del mes siguiente | Sí, la constancia bancaria se adjunta al legajo | Mora automática e intimación. Juicio con indemnización de **30 a 90 días** de remuneración (art. 18) | Porcentajes y art. 17/18: secundaria consistente. Plazo de depósito **no confirmado** |
| **Entrega al cese de la acreditación del Fondo de Cese** (libreta o constancia con los depósitos) | Administración | O | **Dentro de las 48 h** del fin de la relación (art. 17) | Sí, como PDF del banco/IERIC más una constancia de entrega firmada | Indemnización del art. 18 | Secundaria (citada en sentencia de la CNAT) |
| **Inscripción de ABA en el Registro (IERIC)** y su **Certificado del Empleador digital** con token (Res. IERIC 49/2025) | Administración (Portal del Empleador del IERIC) | Empresa | Renovación anual: así fue históricamente; vigencia actual **no confirmada** | Sí, el certificado ya es digital y se valida por CUIT y token | Inspecciones y multas del IERIC. Los comitentes lo piden | Secundaria. El IERIC sigue inspeccionando |
| **Credencial de Registro Laboral / libreta del trabajador** | Antes la gestionaba el empleador ante el IERIC | O | — | — | — | **En transición.** Desde el Dec. 407/26 la constancia fehaciente es la de ARCA. **No confirmé** si el IERIC sigue emitiendo credenciales ni si los comitentes la siguen pidiendo. Conviene que el sistema guarde el dato como **opcional** |
| **Aportes y contribuciones convencionales UOCRA** (cuota sindical, seguro de vida y sepelio del convenio, otras) | Contador | O | Mensual | Lo liquida el sistema de sueldos | Reclamos sindicales | **No confirmado:** montos y vigencia 2026. La Ley 27.802 y el Dec. 407 pusieron topes a ciertos aportes convencionales y una contribución empresaria del 2% (acuerdo 30/07/2026) **no fue homologada** según CAMARCO |
| **Escalas y categorías CCT 76/75** (ayudante, medio oficial, oficial, oficial especializado, sereno) | Contador | O | Con cada acuerdo paritario | Tabla en el sistema | Diferencias salariales | Secundaria. No encontré "capataz" como categoría en las tablas consultadas |

### 1.C ART, salud y accidentes

| Documento / obligación | Quién | Aplica a | Vence / frecuencia | Digitalizable | Riesgo si falta | Estado |
|---|---|---|---|---|---|---|
| **Contrato con la ART**, más el **certificado de cobertura con nómina** | ART, a pedido de ABA | Ambos | El comitente suele pedirlo **todos los meses** o por obra | Sí, en PDF | Sin cobertura, el empleador responde directo por el accidente | Práctica de mercado (pliegos de ARSAT, UBA, etc.) **[Secundaria]** |
| **Cláusula de no repetición** a favor de cada comitente | ART | O | Por comitente, normalmente mensual o con vencimiento | Sí, en PDF | No te dejan entrar a obra | Práctica de mercado **[Secundaria]** |
| **Denuncia de accidente o enfermedad a la ART** | ABA (capataz, oficina, HyS) | Ambos | **Inmediata** (Dec. 717/96, art. 1). Si la ART no rechaza en **10 días**, se entiende aceptado | Sí, la ART suele tener un canal online | Responsabilidad del empleador. El trabajador puede denunciar directo | Secundaria (cartillas y guías) |
| **Examen preocupacional** | Empleador, que lo puede acordar con la ART | Ambos | **Antes del inicio** de la relación. Obligatorio | Sí: guardar el apto, no la historia clínica completa | Preexistencias que no se pueden probar. Sanción de la SRT | **Verificado** (Res. SRT 37/10) |
| **Declaración jurada de antecedentes médicos** del trabajador | Trabajador | Ambos | En el preocupacional | Sí | Ídem | Verificado (Res. SRT 37/10) |
| **Exámenes periódicos** | ART | O (hay exposición a agentes de riesgo) | Según el agente de riesgo (Anexo II de la 37/10). Incluyen un clínico anual | El sistema registra la fecha y el resultado (apto / no apto) | Enfermedad profesional sin detectar | Verificado en lo general. La frecuencia por agente **no confirmada** (el anexo no se lee en la web) |
| **Examen por transferencia de tareas** | Empleador si hay nueva exposición; si no, optativo (ART) | Ambos | Al cambiar de puesto | Sí | — | Verificado |
| **Examen posterior a ausencia prolongada** | ART. Optativo | Ambos | Al volver; el criterio de días lo define cada ART | Sí | — | Verificado |
| **Examen de egreso** | ART. Optativo | Ambos | De 10 días antes a 30 días después del cese | Sí | — | Verificado |
| **Apto médico psicofísico vigente para trabajo en altura** | ART o médico laboral | O | "Vigente": la periodicidad **no está definida** en la Res. 61/23 | Sí, como apto con fecha de vencimiento | No se puede asignar a la persona a tareas en altura | Obligación verificada (Res. SRT 61/23, punto 8). Periodicidad **no confirmada**: definirla con la ART |
| **Certificado médico por enfermedad** | Médico, desde plataforma ReNaPDiS | Ambos | Por cada ausencia. El trabajador tiene que **avisar el primer día** (art. 209) | **Sí, y ahora es la regla** (PDF con firma digital del médico) | Si no avisa, pierde el salario de esos días (art. 209) | Verificado |

### 1.D Seguridad e Higiene en obra

| Documento / obligación | Quién | Aplica a | Vence / frecuencia | Digitalizable | Riesgo si falta | Estado |
|---|---|---|---|---|---|---|
| **Aviso de inicio de obra a la ART** | ABA / HyS | O | **5 días hábiles antes** de cada obra (Res. SRT 51/97, art. 1). Online según Res. SRT 13/18 | Sí | La ART informa a la SRT, que abre sumario | Verificado. **No confirmado:** si ABA, como subcontratista de andamios, hace el aviso en **cada** obra o lo resuelve el contratista principal. Definirlo con HyS y la ART |
| **Programa de Seguridad**, que integra el Legajo Técnico. Incluye la **nómina del personal "actualizada de inmediato" ante altas o bajas** | Servicio de HyS. Firman empleador, director de obra y HyS; lo aprueba la ART | O | Por obra, si supera 4 m de altura, 1000 m², hay excavación o demolición, etc. | Sí | Sumario de la SRT | Verificado (Res. 51/97) |
| **Programa de Seguridad Único** (hay comitente o contratista principal) y coordinación sin contratista principal | Contratista principal o comitente. ABA adhiere | O | Por obra | Sí | Te frenan en la obra | Verificado en lo general (Res. 35/98 y 319/99) |
| **Legajo Técnico de obra** y horas profesionales de HyS según el tamaño | HyS | O | Por obra / continuo | Sí | Sanción de la SRT | Verificado en lo general (Res. 231/96, Dec. 911/96). Las horas por dotación **no las extraje** |
| **Capacitación básica** con constancias **firmadas por el trabajador** | HyS | O | Al ingreso (un checklist de ART menciona 15 días) y luego continua | **Sí** | Sanción; mala defensa ante un accidente | Secundaria. Plazo **no confirmado** |
| **Constancia de entrega de ropa de trabajo y EPP**: un formulario por trabajador | Pañol / HyS. Firma el trabajador | **Ambos** (oficina si usa EPP) | En cada entrega | **Sí, admitida expresamente** (Disp. GP SRT 3/2022). Ver §3 | Sanción; responsabilidad en accidentes | **Verificado** (Res. SRT 299/11 más el anexo de la Disp. 3/22) |
| **Relevamiento General de Riesgos Laborales** (versión Dec. 911/96) | HyS / ART | Empresa | Al afiliarse y luego periódico (las fuentes dicen anual) | Sí | — | **No confirmado** |
| **Registro de acciones de los Servicios de HyS y de Medicina** en las herramientas de la SRT | Servicios de HyS y Medicina | Empresa | Plazos que fije la SRT | Sí | — | Verificado en lo general (Res. SRT 905/15, art. 6) |

### 1.E Trabajo en altura (Res. SRT 61/2023)

**Es el bloque más relevante para ABA.** Rige desde marzo de 2024, se aplica sobre el Dec. 911/96 y todo lo que pide va al **legajo técnico de obra**. Todo lo de esta sección está **[Verificado]** en el texto del Anexo I.

| Obligación | Quién | Frecuencia | Digitalizable |
|---|---|---|---|
| **Procedimiento de trabajo seguro** escrito, si la plataforma está a 6 m o más | Responsable de HyS | Antes del inicio de la obra | Sí |
| **Permiso de Trabajo Seguro (PTS)**, a 6 m o más, vinculado a una capacitación de riesgos **con registro de trabajadores**. Lo firma HyS, su auxiliar o el responsable de la tarea en altura | Capataz o responsable de altura | **Diario** | **Sí, ideal para el celular** |
| **Capacitación semanal** dentro del PTS, con registro de trabajadores. Firman HyS **y** el responsable de altura | HyS + capataz | **Semanal** | Sí |
| **Charla de seguridad de 5 minutos**, "documentada fehacientemente" | Responsable de la tarea en altura | **Diaria** | Sí: asistencia con firma o validación en el celular |
| **Responsable de la tarea en altura** presente siempre: personal jerárquico operativo, **designado y capacitado** por el empleador | ABA | Permanente | Registrar la designación y su capacitación |
| Si ABA estuviera en el programa **PESE** (Res. 363/16, empleadores con siniestralidad elevada): HyS presente en el frente de trabajo y **2 PTS por día** (a la mañana y después del almuerzo) | HyS | Diario | Sí |
| **Viento:** entre 30 y 40 km/h solo con autorización de HyS; con más de 40 km/h se suspende | HyS | Por jornada | Sí: registrar la autorización o la suspensión en el PTS |
| **Aptitud:** personal elegido por experiencia o capacitación, **con apto médico psicofísico vigente**, más una capacitación específica obligatoria | ABA | Continuo | **Sí, como matriz de habilitación persona-tarea** |
| **Programa de capacitación en altura** para todos los niveles (superior, intermedio y operativo): objetivo, duración, contenido | HyS | Anual / continuo | Sí |
| **Capacitación anual específica** en riesgos de altura, más un **simulacro de rescate semestral** con memoria descriptiva, registro de participantes y **material audiovisual** | Contratista principal con HyS | Anual / semestral | Sí (fotos y video) |
| Capacitación obligatoria para operar plataformas elevadoras móviles de personas (PEMP) e izaje | ABA | Según el plan | Sí |
| **Plan de Rescate en Altura** dentro del Programa de Seguridad, a 6 m o más | HyS | Por obra | Sí |
| **Análisis de Trabajo Seguro (ATS)** firmados por los participantes | HyS | Por etapa de obra | Sí |
| **Registro del EPP de altura entregado a cada puesto**: almacenaje, condiciones de uso, **fechas y características de cada inspección**. Piezas identificadas para tener trazabilidad | ABA / pañol | Continuo | **Sí. Se cruza con el módulo de depósito y pañol** |
| El EPP de altura es **intransferible** durante la tarea | — | — | Sí: asignación por persona |
| Arnés con **dispositivo antitrauma** a 6 m o más | Pañol | — | Atributo del equipo |
| Equipo multimarca revisado y autorizado **antes de cada uso diario**, con constancia | HyS o responsable de altura | Diario | Sí |
| **Lista de verificación del andamio y sus anclajes** (planillas del Anexo III), como parte del PTS, a más de 6 m | HyS, auxiliar o responsable de altura | **Diario** | **Sí** |
| Cartel **"EQUIPO NO HABILITADO"** mientras se monta y **"EQUIPO LIBRADO A USO"** firmado al terminar | HyS o responsable de altura | Por montaje | Sí: registro digital con foto y QR del cartel |
| **Planes de montaje y desmontaje** de andamios firmados por un **profesional matriculado**. Cálculos de estabilidad a 6 m o más | Oficina técnica | Por equipo / obra | Sí |
| **Andamios colgantes:** plan de montaje firmado por el director de obra, el representante técnico y HyS. **Control mensual** documentado | Oficina técnica / HyS | Mensual | Sí |
| Andamios móviles: control **diario** de frenos | Capataz | Diario | Sí |
| Toda la documentación **en la obra**, ordenada, junto con las constancias de visita de la ART | ABA | Permanente | **Sí: "carpeta de obra" accesible desde el celular** |

---

## 2. Vacaciones, licencias y ausencias (LCT)

| Tema | Regla | Estado |
|---|---|---|
| **Días de vacaciones** | 14 días si la antigüedad es menor a 5 años; 21 de 5 a 10; 28 de 10 a 20; 35 desde 20 (art. 150 LCT) | Lo saco del texto clásico de la LCT. **No verifiqué** si la 27.802 lo tocó; las guías consultadas no lo mencionan |
| **Período y aviso** | Entre el 1/10 y el 30/04, salvo acuerdo. Aviso por escrito con **30 días** de anticipación. Fracciones de 7 días o más. Verano al menos cada 3 años. Si te enfermás durante las vacaciones, se interrumpen y el saldo se reprograma | Verificado |
| **Licencias especiales** (art. 158 LCT): nacimiento, matrimonio, fallecimiento de familiares, examen | Días según el art. 158 | **No confirmé** la redacción vigente después de la 27.802 ni si el CCT 76/75 o el 130/75 mejoran los días |
| **Enfermedad inculpable** | Aviso el primer día. Certificado digital (ReNaPDiS/REFEPS). Control médico del empleador; si hay discrepancia, junta médica oficial o instituto inscripto en el Registro Federal de Establecimientos de Salud (REFES) con 5 años o más de antigüedad | Verificado |
| **Accidente de trabajo** | Va por ART, no por enfermedad inculpable | Verificado en lo general |
| **Banco de horas** | Requiere acuerdo voluntario y por escrito (art. 197 bis) | Secundaria |

---

## 3. Qué hace falta para que lo digital valga

### Recibo digital
- La ley ahora admite "firma digital **o electrónica**" del trabajador como constancia de entrega (art. 139, Ley 27.802). **[Verificado]**
- La **Res. 346/2019** (ex MPyT) pedía **firma digital de la Ley 25.506 de ambas partes**. Por jerarquía, debería prevalecer la ley nueva. **No confirmé** si la 346/19 se derogó o se adecuó, ni si hay una norma del Ministerio de Capital Humano que reglamente el art. 139. **[No confirmado]**
- La normativa vieja (Res. ST 1362/12) pedía que el trabajador pudiera marcar **conformidad o disconformidad** y que el recibo estuviera disponible durante el plazo de prescripción. **No confirmé** su vigencia, pero tiene sentido incluirlo igual.
- **Diseño mínimo sugerido:**
  - Identidad validada: DNI más código por WhatsApp o SMS, o selfie.
  - Hash del PDF, sello de tiempo y log de auditoría.
  - Opción "firmo en disconformidad" con campo de texto.
  - Descarga permanente para el trabajador.
  - Conservación de 10 años.
  - El modelo del Anexo III del Dec. 407 lo genera el sistema de liquidación del contador. No lo pude leer porque es una imagen.

### Constancia digital de EPP (Disp. GP SRT 3/2022, anexo) **[Verificado]**
- **Contenido mínimo:**
  - Empleador: razón social, CUIT, dirección, localidad, provincia, código postal.
  - Trabajador: nombre, apellido, DNI, puesto, EPP necesarios y **conformidad**.
  - Cada EPP: producto, cantidad, tipo o modelo, marca, si tiene certificación (sí/no), fecha de entrega.
  - Un campo de observaciones.
- **Validación:** la norma sugiere expresamente DNI, huella o reconocimiento facial, **geolocalización**, **QR o código de barras del EPP**, **firma con token** de doble llave, y análisis de imágenes. Todo es opcional, pero marca el estándar.
- **Almacenamiento:** un repositorio propio con respaldo; sugiere la nube con confidencialidad.
- **Acceso:** se debe **dar acceso a la ART** al almacén de constancias y permitir auditorías de los organismos de control.
- **Desarrollo:** puede ser propio. Exige confidencialidad, integridad, persistencia en los plazos legales y autenticación de usuarios. Hay que respetar la Política de Seguridad de la Información de la SRT.

### Certificados médicos
- Desde el Dec. 407 la regla es el certificado electrónico emitido por una plataforma ReNaPDiS. El sistema debería permitir subir el PDF y registrar el número de matrícula y la plataforma emisora.
- **No confirmé** que exista un verificador público para validarlo automáticamente.

### Datos de salud
- Aptos, certificados y diagnósticos son **datos sensibles** (Ley 25.326). Hay que separar permisos: el capataz ve "apto / no apto y vencimiento", nunca el diagnóstico.
- *Esto es criterio mío sobre la ley de datos personales; no lo investigué en esta tarea.*

### Notificaciones
- **No encontré** en la Ley 27.802 una regla general de domicilio digital laboral.
- WhatsApp sirve para avisos, pero **no lo trataría como notificación fehaciente** para sanciones o despidos. Para eso: carta documento o telegrama.
- El aviso de vacaciones "por escrito" se puede resolver con un documento firmado electrónicamente en el sistema, con el mismo criterio que el recibo (inferencia, **no confirmado**).

---

## 4. Documentación que piden los comitentes para entrar a obra

Esto **varía según el pliego de cada comitente**. Es lo que aparece en pliegos públicos (ARSAT, UBA Exactas, contratistas privados) y en la práctica del sector. **[Secundaria]**

1. **Constancia de alta en ARCA** de cada persona que entra.
2. **F.931** del último mes, con su comprobante de pago.
3. **Certificado de cobertura de la ART con nómina** y **cláusula de no repetición** a favor del comitente. Se suele renovar **todos los meses**. Algunos piden que figure expresamente "**trabajos en altura**".
4. **Seguro de vida obligatorio** (Dec. 1567/74). Sigue vigente; la Res. SSN 39.766/16 fija el capital en 5,5 SMVM, monto a confirmar con la aseguradora. Además, el **seguro de vida del convenio** (UOCRA o el art. 97 del CCT 130/75, que cubre 12 sueldos de Administrativo A).
5. **Certificado del Empleador del IERIC**, digital con token. A veces piden la credencial del trabajador (ver la transición en §1.B).
6. **Aviso de obra** sellado o aceptado por la ART y **Programa de Seguridad** aprobado.
7. **Constancias de capacitación y de entrega de EPP**. **Aptos médicos**, sobre todo para altura.
8. Si entran autónomos o monotributistas (fleteros, subcontratistas): **seguro de accidentes personales** con no repetición.
9. **Listado de personal actualizado** con altas y bajas.

**Para el software:** esto se resuelve con un **"pasaporte de obra"** por persona: documentos con vencimiento, semáforo y un **paquete por comitente** (ZIP o link con los PDF vigentes de la cuadrilla asignada a esa obra). Así administración no arma la carpeta a mano cada mes.

---

## 5. Calendario de vencimientos que el sistema tiene que controlar

| Frecuencia | Qué |
|---|---|
| **Diario** (por obra) | PTS; charla de 5 minutos; verificación del andamio y del EPP de altura antes del uso; frenos de andamios móviles; control de viento |
| **Semanal** | Capacitación de riesgos dentro del PTS |
| **Mensual** | F.931 y pago; depósito del Fondo de Cese (12% / 8%); FAL desde 11/2026 (oficina); recibos y sus firmas; certificado de ART con nómina y cláusula de no repetición por comitente; control de andamios colgantes; aportes UOCRA y de Comercio |
| **Semestral** | Simulacro de rescate en altura (si ABA es el principal o participa) |
| **Anual** | Capacitación específica de altura; programa de capacitación; renovación de la inscripción IERIC (a confirmar); clínico anual de los periódicos; RGRL (a confirmar) |
| **Por evento** | Alta antes de empezar; baja dentro de 5 días; entrega del Fondo de Cese dentro de 48 h del cese; certificado art. 80; preocupacional antes de empezar; aviso de obra 5 días hábiles antes; denuncia de accidente inmediata; aviso de enfermedad el primer día; vacaciones avisadas 30 días antes; examen por cambio de tarea |
| **Por persona, con fecha propia** | Apto psicofísico de altura; constancias de capacitación; EPP (vida útil e inspección del arnés); carnet de conducir de los choferes (no lo investigué, sale del módulo vehículos) |

---

## 6. Lo que no pude confirmar y conviene validar

1. **Tipo de firma del recibo:** si alcanza con firma electrónica simple o sigue pidiéndose firma digital (Res. 346/19 frente al nuevo art. 139). → Contador o abogado laboral.
2. **Si el servicio "Libro de Sueldos Digital" de ARCA sigue siendo obligatorio** como vía del F.931 después del Dec. 407. → Contador.
3. **IERIC después del Dec. 407:** si sigue la renovación anual, si se siguen emitiendo credenciales y qué piden hoy las inspecciones (el IERIC dice que "mantiene la rutina"). → Contador o el propio IERIC.
4. **Ley 22.250, art. 15:** el plazo exacto del depósito mensual del Fondo de Cese. No pude abrir el texto consolidado.
5. **Plazos exactos de alta y baja** en la RG 2988 y sus modificaciones (RG 4355/18, 5508/24).
6. **Periodicidad del apto psicofísico de altura** y de los periódicos por agente de riesgo (Anexo II de la Res. 37/10). → ART.
7. **Si ABA hace el aviso de obra y su propio Programa de Seguridad** en cada obra donde monta, o se cuelga del programa único del principal. → HyS y ART.
8. **Contenido del CCT 76/75:** ropa de trabajo, licencias especiales, seguro de vida y sepelio, cómo se trata al capataz. No encontré el texto completo online.
9. **Convenio del personal de oficina** (¿Comercio 130/75?) y vigencia 2026 del seguro de vida art. 97 y del aporte "La Estrella" frente a los topes del Dec. 407.
10. **FAL:** normas complementarias de ARCA y la CNV para el arranque del 01/11/2026.
11. **Capacitación básica a los 15 días del ingreso** (Res. 231/96) y horas de HyS por dotación.
12. **Art. 158 LCT (licencias especiales)** después de la 27.802.

---

## 7. Implicancias directas para el diseño del módulo

- **Dos experiencias distintas.**
  - **Obra**, desde el celular y con WhatsApp: firmar el recibo, confirmar la entrega de EPP con foto o QR, firmar el PTS y la charla diaria, subir el certificado médico, avisar la ausencia el primer día y ver su "pasaporte" (aptos, cursos, EPP).
  - **Oficina**, desde la web: legajo, vencimientos, paquetes por comitente, conciliación con ARCA y la ART.
- **El capataz como actor central:** arma el PTS diario, da la charla de 5 minutos, hace las verificaciones del andamio y denuncia accidentes. Encaja con los partes de trabajo y cuadrillas que ya existen.
- **Matriz de habilitación persona-tarea:** no se asigna a una cuadrilla de altura a alguien sin apto vigente o sin la capacitación de altura. Encaja con habilitaciones.
- **EPP trazable por pieza** (Res. 61/23, punto 34): se cruza con depósito y pañol.
- **Repositorio auditable** con acceso de solo lectura para la ART (exigido para el EPP digital) y retención de 10 años.
- **Permisos separados para datos de salud.**

---

## Fuentes

**Oficiales**
- [Ley 27.802 – Boletín Oficial 06/03/2026](https://www.boletinoficial.gob.ar/detalleAviso/primera/339128/20260306)
- [Ley 27.802 – Biblioteca AFIP/ARCA](https://biblioteca.afip.gob.ar/dcp/LEY_C_027802_2026_02_27)
- [Decreto 407/2026 y sus anexos I y III – BO 01/06/2026](https://www.boletinoficial.gob.ar/detalleAviso/primera/342620/20260601)
- [Decreto 408/2026 (FAL) – BO 01/06/2026](https://www.boletinoficial.gob.ar/detalleAviso/primera/342622/20260601)
- [Res. SRT 51/97 – texto](https://www.argentina.gob.ar/normativa/nacional/44588/texto)
- [Res. SRT 61/2023 – BO](https://www.boletinoficial.gob.ar/detalleAviso/primera/300086/20231206)
- [Res. SRT 61/2023 – Anexo I (PDF)](https://argentina.gob.ar/normativa/394625_res61-1_pdf/archivo)
- [Res. SRT 37/2010 – texto](https://www.argentina.gob.ar/normativa/nacional/163171/texto)
- [Disposición GP SRT 3/2022 (EPP digital) y anexo](https://www.boletinoficial.gob.ar/detalleAviso/primera/277246/20221205)
- [Res. SRT 503/2014](https://www.argentina.gob.ar/normativa/nacional/227747/texto)
- [Res. SRT 905/2015](https://www.argentina.gob.ar/normativa/nacional/246509/texto)
- [IERIC – portal y novedades](https://www.ieric.org.ar)
- [IERIC – procedimientos inspectivos sin cambios hasta la implementación del Dec. 407/26](https://www.ieric.org.ar/destacados/procedimientos-inspectivos-sin-cambios-hasta-implementacion-del-decreto-407-26/)
- [FAQ SRT](https://argentina.gob.ar/sites/default/files/faqsrt_.pdf)

**Secundarias**
- [elDial – guía de la Ley 27.802](https://novedades.eldial.com/2026/04/ley-27802-guia-didactica-de-la-reforma.html)
- [Estudio CyT – recibo 2026](https://estudiocyt.com.ar/en/blog/news-2/recibo-de-sueldo-2026-que-cambia-con-la-ley-27-802-de-modernizacion-laboral-41)
- [iProfesional – nuevo recibo](https://www.iprofesional.com/impuestos/456096-asi-sera-el-nuevo-recibo-de-sueldo-como-se-debe-generar-y-que-caracteristicas-tiene)
- [Contadores en Red – IERIC y LSD (04/09/2026)](https://contadoresenred.com/ieric-perdio-el-control-sobre-la-registracion-laboral-y-ahora-intenta-tener-acceso-al-servicio-de-libro-de-sueldos-digital-de-arca/)
- [Estudio Vilaplana – Dec. 408/2026](https://estudiovilaplana.com.ar/2026/06/01/decreto-408-2026-reglamentacion-fondo-asistencia-laboral-fal/)
- [RSM – Dec. 407/2026](https://www.rsm.global/argentina/en/node/646)
- [Estudio O'Farrell – Dec. 407/2026](https://www.estudio-ofarrell.com/en/?p=25997)
- [Tributum – Res. IERIC 49/2025](https://tributum.news/res-49-2025-ieric-construccion-empleadores-certificado-digital-autenticidad-vigencia-emision-papel-2025-sustitucion/)
- [Abogados.com.ar – Res. 346/2019](https://abogados.com.ar/resolucion-no-3462019-del-ministerio-de-produccion-y-trabajo-recibo-de-sueldo-digital/23487)
- [Abogados.com.ar – art. 18 Ley 22.250](https://abogados.com.ar/tienen-por-satisfecho-el-recaudo-formal-exigido-por-el-art-18-de-la-ley-22250/29771)
- [Estudio Vilaplana – trabajadores de la construcción](https://estudiovilaplana.com.ar/trabajadoresconstruccion/)
- [EconoBlog – Fondo de Cese](https://www.econoblog.com.ar/6293/fondo-del-cese-laboral)
- [CAMARCO – Res. SRT 61/23](https://www.camarco.org.ar/2023/12/13/la-srt-aprobo-nuevas-medidas-de-seguridad-a-partir-de-una-iniciativa-de-uocra-y-camarco/)
- [Tributum – contribución UOCRA 2%](https://tributum.news/uocra-acuerdo-por-contribucion-empresaria-del-2-para-cct-76-75-y-577-10/)
- [Ignacio Online – seguros CCT 130/75](https://www.ignacioonline.com.ar/empleados-de-comercio-seguros/)
- [Ignacio Online – Res. 204/88](https://www.ignacioonline.com.ar/resolucion-mtss-204-1988-seguro-de-vida-obligatorio-empleados-de-comercio-cct-130-75-articulo-97/)
- [Blog del Contador – Seguro Colectivo de Vida Obligatorio](https://blogdelcontador.com.ar/resolucion-3976616-superintendencia-de-seguros-de-la-nacion-nuevo-valor-del-seguro-colectivo-de-vida-obligatorio)
- [Blog del Contador – RG 2988](https://blogdelcontador.com.ar/resolucion-general-2988-afip-programa-simplificacion-registral-su-implementacion/)
- [Blog del Contador – Libro de Sueldos Digital](https://blogdelcontador.com.ar/libro-de-sueldos-digital-desde-septiembre-todos-los-empleadores-quedan-obligados)
- [ARSAT – documentación de ingreso de personal](https://www.arsat.com.ar/wp-content/uploads/2021/08/3.-Anexo-III-Documentacion-Requerida-para-Ingreso-de-Personal-IoT.pdf)
- [UBA Exactas – norma de contratistas](https://exactas.uba.ar/higieneyseguridad/wp-content/uploads/2019/08/Norma-de-contratistas.pdf)
- [Contadores en Red – UOCRA julio 2025](https://contadoresenred.com/uocra-cct-76-75-acuerdo-salarial-julio-2025/)

Las copias de los anexos oficiales que leí (Res. SRT 61/23, Disp. 3/22 y Dec. 407/26) quedaron en `/private/tmp/claude-501/-Users-joaquin-Desktop-Proyectos-AndamiosOS/d6b9a456-65b1-48a8-a553-07aa82ba4088/scratchpad/dl/`.
