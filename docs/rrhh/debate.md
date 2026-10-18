# Módulo RRHH — debate

*17/10/2026. Registro del panel, tal cual: las tres propuestas iniciales, las tres réplicas, la propuesta de consenso del moderador (la versión que revisó la auditoría) y la auditoría. La versión final, con los cambios de la auditoría aplicados, está en [`propuesta.md`](./propuesta.md). Los informes de base, en [`investigacion.md`](./investigacion.md).*

**El panel:**
- **Directora de RRHH de pymes** (rrhh-pyme).
- **Jefe de obra y responsable de Seguridad e Higiene** (obra-seguridad).
- **Arquitecto de producto de AndamiosOS** (producto).
- **Moderación** del consenso y **auditoría** independiente.

1. [Propuestas iniciales](#1-propuestas-iniciales)
2. [Réplicas](#2-réplicas)
3. [Propuesta de consenso (antes de la auditoría)](#3-propuesta-de-consenso-antes-de-la-auditoría)
4. [Auditoría](#4-auditoría)

---

# 1. Propuestas iniciales

## 1.1 Propuesta de la Directora de RRHH de pymes

# Propuesta de módulo de RRHH para ABA

*Mirada de directora de RRHH. 17/10/2026.*

Mi postura: **no compraría Humand. Tomaría cinco o seis ideas de Humand y las construiría dentro de AndamiosOS.** Para 40 personas saldría entre US$ 2.000 y 5.000 por año, aunque el precio no está publicado y esa cifra es una estimación. Además Humand:
- pide Android 10 o más y obliga a instalar una app de unos 187 MB;
- no se integra con Odoo;
- no avisa vencimientos;
- no tiene confirmación de lectura;
- no usa WhatsApp.

Para ABA, lo más valioso de un módulo de RRHH no es la parte de "experiencia del empleado". Es que **administración deje de perseguir papeles y que nadie quede afuera de una obra por un apto vencido.** Primero el cumplimiento, después el clima.

---

## 1. Qué problemas resuelve

**Oficina y administración**
- La oficina no tiene legajo. Los 15 administrativos existen solo como usuarios del sistema y en Odoo.
- Los documentos de obra no tienen archivo ni aviso de vencimiento. La carpeta para cada comitente se arma a mano todos los meses, y la nómina de la ART se sube como archivo suelto.
- Los recibos se firman en papel y se archivan durante 10 años. Hay que perseguir a cada operario para que firme.
- Las vacaciones se piden de palabra. Nadie sabe el saldo, y el aviso con 30 días de anticipación que exige la ley no queda registrado.
- Juan Pablo carga la asistencia en Odoo (`x_parte_diario`), cuando gran parte ya está en la Hoja del día.
- Datos sensibles abiertos: hoy cualquier usuario logueado puede leer `personal`, `documentos` y `fichadas`.

**Obra**
- Los operarios se enteran de los cambios "por el capataz", si es que se enteran.
- Pedir vacaciones, un adelanto o un certificado laboral obliga a venir a la oficina o a llamar.
- El certificado médico llega tarde, en papel o por foto de WhatsApp, y se pierde.
- El EPP se entrega sin constancia firmada. Es un riesgo directo si hay un accidente (Res. SRT 299/11).
- Nadie sabe qué tiene vencido hasta que lo frenan en la puerta de la obra.

---

## 2. Funciones elegidas

**Canales para obra:** el link con token `/h/`, el bot de Telegram y el kiosco del pañol con PIN o QR. **Nada de cuentas ni contraseñas para el operario.** La oficina usa la web de AndamiosOS y la campanita.

### Imprescindibles

**1. Ficha única de persona** (*Humand: Legajo digital*)
- **Para quién:** todas las personas, oficina y obra. La carga administración.
- **Cómo:**
  - Una sola ficha por persona, anclada a `hr.employee`. Hay que ampliar el sync de Odoo para que incluya a la oficina.
  - Datos de contacto, CUIL, fecha de ingreso, convenio, jefe directo (sale del organigrama) y documentos con archivo adjunto.
  - El operario ve "Mi ficha" desde el link, en solo lectura, con un botón "avisar un dato mal".
  - Incluye cerrar la RLS desde el primer día, con `exigeExplicito` para salud y sueldos.
- **Esfuerzo:** M

**2. Vencimientos y pasaporte de obra** (*no viene de Humand*, que no avisa vencimientos)
- **Para quién:** administración, capataces y Habilitaciones.
- **Cómo:**
  - Semáforo por persona: apto de altura, curso de altura, preocupacional, registro de conducir, alta en ARCA.
  - Un cron avisa 30 y 7 días antes en la campanita, y por Telegram al interesado.
  - **Paquete por comitente:** ZIP o link con los PDF vigentes de la cuadrilla asignada a esa obra.
  - Bloqueo blando: la Hoja del día advierte si alguien sin apto vigente va a una tarea en altura.
- **Esfuerzo:** M. Es la función con mejor retorno: ahorra horas de administración todos los meses.

**3. Recibos con firma electrónica** (*Humand: Documentos*)
- **Para quién:** administración los sube, todos los firman.
- **Cómo:**
  - Se sube el PDF sábana del contador y el sistema lo corta por CUIL.
  - El operario recibe el aviso por Telegram, abre el link, lo ve y firma con el dedo. Se reusa la firma de Permisos: hash, fecha y DNI al pie.
  - Opción "firmo en disconformidad" con un campo de texto.
  - Recordatorio a quienes tienen la firma pendiente. Conservación por 10 años.
- **Diferencia con Humand:** Humand no deja descargar el recibo sin firmarlo. **Yo no copiaría eso.** El recibo es del trabajador, y trabarlo genera desconfianza.
- **Esfuerzo:** M

**4. Aviso de ausencia y certificado médico** (*Humand: adjunto obligatorio en licencias*)
- **Para quién:** obra y oficina.
- **Cómo:**
  - El primer día, la persona avisa por Telegram ("No voy, estoy enfermo") y sube la foto o el PDF del certificado.
  - El aviso cae en `hd_ausencias` y lo ve el planificador.
  - El capataz ve solo "ausente / enfermedad", nunca el diagnóstico.
- **Esfuerzo:** S

**5. Vacaciones y licencias con saldo** (*Humand: Vacaciones y permisos*)
- **Para quién:** todos. Aprueba el jefe directo, y JS para la oficina.
- **Cómo:**
  - Se extiende `hd_ausencias` con estado del pedido y aprobación. No se crea otra tabla.
  - El saldo sale de la antigüedad según el art. 150 de la LCT.
  - El operario pide por Telegram o por el link, o el capataz pide en su nombre.
  - Al aprobarse se genera la constancia de aviso (30 días) para firmar.
  - **El motivo de rechazo se le muestra al empleado.** Humand no lo muestra, y eso es un error.
- **Esfuerzo:** M

**6. Constancia digital de entrega de EPP** (*no viene de Humand*; es la fase 2 del pañol)
- **Para quién:** pañol entrega, el operario firma.
- **Cómo:** en el kiosco, con PIN, se cargan los ítems y talles y el operario firma en pantalla. El formato sigue la Disp. GP SRT 3/2022. La ART tiene acceso de solo lectura.
- **Esfuerzo:** M. Lo construye el pañol y RRHH lo muestra en la ficha.

### Conviene

**7. Comunicados con confirmación de lectura** (*Humand: Muro y Novedades importantes, mejorado*)
- **Para quién:** JS y administración publican.
- **Cómo:**
  - Se elige el alcance: Todos, Oficina, Obra o una cuadrilla.
  - Obra lo recibe por Telegram con un botón "Entendido" y la opción de una nota de voz (ya está ElevenLabs). Oficina lo recibe en la campanita.
  - Lista nominal de quién leyó y a quién hay que insistirle.
  - **Solo para lo importante:** seguridad, horarios, feriados, cambios de convenio. No es un muro social.
- **Esfuerzo:** S–M

**8. Cumpleaños y aniversarios** (*Humand*)
- **Para quién:** todos.
- **Cómo:**
  - Saludo automático por Telegram, con un texto para obra y otro para oficina.
  - **Más importante:** a JS le llega un aviso el día anterior para que llame o salude en persona. En una empresa familiar, eso vale más que el bot.
- **Esfuerzo:** S

**9. Checklist de alta y de baja** (*Humand: Onboarding, simplificado*)
- **Para quién:** administración.
- **Alta:** preocupacional, alta en ARCA, credencial del pañol, vincular Telegram, EPP, inducción, sumar a la nómina de la ART y firmar el reglamento.
- **Baja:** recuperar EPP y herramientas, entregar la acreditación del Fondo de Cese **dentro de las 48 h** y el certificado del art. 80.
- **Esfuerzo:** M. Evita juicios caros. Lo de las 48 h solo lo verifiqué en fuentes secundarias.

**10. "Lo que tenés que saber"** (*Humand: Librería*)
- **Para quién:** todos.
- **Contenido:** reglamento interno firmado, resumen del convenio, teléfonos de la ART y qué hacer si hay un accidente, beneficios.
- **Canal:** el link para obra y la web para oficina.
- **Esfuerzo:** S

**11. Registro de capacitaciones** (*Humand: Aprendizaje, solo la constancia*)
- **Para quién:** Seguridad e Higiene y administración.
- **Cómo:** quién hizo qué curso, la firma de asistencia y el vencimiento. Alimenta el pasaporte.
- **Límite:** la charla de 5 minutos y el PTS son de Seguridad e Higiene y de los partes. RRHH solo consume sus constancias.
- **Esfuerzo:** M

**12. Asistencia sin doble carga** (*no viene de Humand*)
- **Cómo:** se hace la fase 2 de la Hoja del día, que escribe `x_parte_diario` ya precargado. Exporta las horas extra de la quincena para el contador.
- **Prototipo de Fichadas:** se descarta, porque no identifica a la persona.
- **Esfuerzo:** M. Depende de que Juan Pablo lo apruebe.

### Después

**13. Pedidos a RRHH** (*Humand: Gestión de servicios, en versión mínima*)
- Certificado laboral, adelanto, cambio de datos o de talle de ropa. El operario pide por Telegram y administración responde.
- **Esfuerzo:** S–M

**14. Pulso anónimo semestral** (*Humand: People Experience, recortado*)
- 4 preguntas más eNPS.
- Resultados **solo de la empresa entera y de obra contra oficina**, y solo si hay 8 respuestas o más por grupo. Nunca por cuadrilla.
- **Esfuerzo:** S

**15. Tablero de RRHH para JS** (*no viene de Humand*: sus Insights miden el uso de la app, no indicadores de RRHH)
- Dotación, ausentismo del mes, vencimientos y firmas pendientes.
- **Esfuerzo:** S

**16. Reconocimiento** (*Humand: Reconocimientos, sin puntos*)
- Una mención mensual dentro del comunicado de JS. Nada más.
- **Esfuerzo:** S

---

## 3. Lo que descarto de Humand

- **Evaluación de desempeño 360, matriz 9-box, objetivos y calibración.** Con 40 personas que se ven todos los días es burocracia de multinacional. Si JS quiere ordenar la charla anual con cada uno, alcanza con un formulario de una página.
- **Canje de puntos y catálogo de premios.** Administrar stock de premios para 40 personas no tiene sentido.
- **Muro social, grupos, eventos con RSVP y marketplace.** Para eso ya está el WhatsApp de la empresa, y competir con él es perder.
- **Chat propio, videollamadas y transmisiones en vivo.** Ya existen WhatsApp, Telegram y Meet.
- **Fichada con selfie y geocerca por sede.** Las obras cambian todo el tiempo y la selfie genera rechazo, como muestran las reseñas. Además ya sabemos quién va a dónde por la Hoja del día.
- **Kiosk con reconocimiento facial.** El kiosco del pañol con PIN alcanza.
- **Noticias tipo revista, traducción automática y mapa de calor del clima.** No aportan nada a esta escala.
- **Reclutamiento y portal de empleos.** Se contrata por recomendación.
- **Asistente de IA tipo Sammy**, por ahora. Más adelante se le puede sumar a Tomás una variante interna que responda saldo de vacaciones y el reglamento.
- **App nativa para instalar.** El link con token y Telegram ya funcionan con poca señal.

---

## 4. Etapas

**Etapa 0, antes de escribir código (1 a 2 semanas)**
- Cerrar la RLS de `personal`, `documentos` y `fichadas`.
- Decidir la ficha única: el sync de Odoo pasa a incluir a la oficina.
- Preguntas al contador:
  - quién liquida y en qué formato salen los recibos;
  - si acepta firma electrónica como constancia (Res. 346/19 frente al art. 139 reformado);
  - convenio de la oficina.
- Preguntas a la ART: periodicidad del apto de altura y del examen periódico.

**Etapa 1, papeles y cumplimiento**
- Funciones: 1 (ficha única), 2 (vencimientos y pasaporte) y 4 (aviso de ausencia y certificado).
- **En paralelo:** la carga inicial de datos (fechas de ingreso, CUIL, aptos). Es trabajo manual y sin esto nada funciona.

**Etapa 2, firma y licencias**
- Funciones: 3 (recibos), 5 (vacaciones y licencias), 6 (EPP, con el pañol) y 12 (asistencia), esta última si Juan Pablo da el ok.

**Etapa 3, comunicación**
- Funciones: 7 (comunicados), 8 (cumpleaños), 9 (alta y baja), 10 ("Lo que tenés que saber") y 11 (capacitaciones).

**Etapa 4, mejora**
- Funciones: 13 (pedidos), 14 (pulso), 15 (tablero) y 16 (reconocimiento).

---

## 5. Riesgos y dudas para JS

1. **¿Quién opera RRHH?** Es la pregunta más importante. En una pyme de 40 no hay RRHH dedicada. Si nadie es dueño del módulo (subir recibos, aprobar, mantener vencimientos), se muere en tres meses. Hay que nombrar a alguien de administración y medir cuántas horas le saca, no cuántas le suma.
2. **El canal de obra.** No sabemos cuántos operarios tienen Telegram vinculado. Si no llega a todos, hay dos caminos: WhatsApp Cloud con plantillas aprobadas por Meta, que tiene un costo por conversación, o que el capataz haga de puente. Para quien no tiene celular, el kiosco y el capataz.
3. **Validez de la firma de recibos.** La Ley 27.802 abre la puerta a la firma electrónica, pero no confirmamos qué pasa con la Res. 346/19. Hasta que el abogado o el contador lo validen, conviene firmar en el sistema **y además** guardar el papel por un tiempo.
4. **Datos de salud.** Diagnósticos y certificados son datos sensibles (Ley 25.326). El capataz ve solo "apto / no apto". Hay que definir quién ve los certificados completos. Mi propuesta: administración y JS, nadie más.
5. **Clima familiar.** El "quién leyó" y el aviso de vencimientos pueden sentirse como control si se usan para retar. Úsenlos para cuidar ("te vence el apto, te sacamos turno"), no para sancionar. En el pulso anónimo con 40 personas, JS no tiene que intentar adivinar quién respondió qué.
6. **Transición del papel.** Tres meses en paralelo. Hay operarios que van a desconfiar de firmar en el celular: a ellos hay que explicarles en persona, no con un comunicado.
7. **Datos limpios.** Sin fecha de ingreso no hay saldo de vacaciones, y sin jefe directo cargado no hay aprobaciones. Esto le pasa a Humand y nos va a pasar a nosotros.
8. **Fuera del módulo:** el FAL desde el 01/11 (solo oficina) y la transición del IERIC a ARCA. Son del contador. El módulo solo guarda constancias.
9. **Límite con Seguridad e Higiene.** El PTS, la charla de 5 minutos y la verificación del andamio no van en RRHH, para no duplicar. RRHH guarda la persona y sus constancias. Seguridad e Higiene y los partes guardan la operación diaria.

---

## 1.2 Propuesta del Jefe de obra y responsable de Seguridad e Higiene

# Propuesta del módulo RRHH vista desde la obra (jefe de obra / técnico SyH)

**Mi postura:** el montador no va a instalar una app de 187 MB ni va a recordar una contraseña. Todo lo de obra tiene que entrar por donde ya entra hoy: el bot de Telegram, el link `/h/<token>` y el kiosco del pañol con PIN. Si una acción diaria le lleva más de un minuto al capataz, no se va a hacer. Lo que más tiempo le hace perder a una cuadrilla no es RRHH en sí: es quedarse en la puerta de la obra porque falta un papel. Por ahí arranco.

---

## 1. Qué problemas resuelve

### Obra
- **Cuadrilla frenada en el ingreso.** Hoy la nómina ART se sube a mano porque "la manda el contador". No hay semáforo de aptos ni de cursos. Nadie avisa que algo vence. El documento se carga sin archivo y nada recalcula los vencimientos.
- **Gente asignada a altura sin apto vigente.** La Hoja del día no sabe si la persona está habilitada. Con la Res. 61/23, si hay un accidente con alguien sin apto, el problema es grave.
- **EPP entregado sin constancia firmada.** El stock por talle existe, pero la constancia (Res. 299/11) quedó para la fase 2 del pañol. Sin ese papel, ante un accidente la empresa no tiene cómo defenderse.
- **No hay cómo avisar "mañana no voy", pedir días o un adelanto.** Hoy se hace por WhatsApp personal al que esté. No queda registro y el planificador se entera tarde.
- **El recibo no le llega de forma ordenada,** y nadie puede probar que lo recibió.
- **Comunicados de seguridad sin constancia de lectura.** Cuando cambia un procedimiento, nadie puede decir quién lo leyó.
- **Accidente:** no hay circuito. El capataz llama a quien puede y la denuncia a la ART depende de la memoria de alguien.

### Oficina y administración
- **No hay legajo único.** La oficina no tiene legajo, solo usuario de sistema.
- **Doble carga de asistencia.** Juan Pablo carga `x_parte_diario` a mano, aunque la Hoja del día ya sabe quién fue.
- **La carpeta del comitente se arma a mano todos los meses.**
- **Vacaciones sin saldo ni pedido formal.** Desde la Ley 27.802 hay que avisarlas por escrito con 30 días de anticipación.
- **Riesgo legal hoy:** la RLS abierta en `personal`, `documentos` y `fichadas` deja que cualquier usuario logueado lea todo.

---

## 2. Funciones elegidas

Prioridad: **I** = imprescindible, **C** = conviene, **D** = después. Esfuerzo: S / M / L.

| # | Función | Inspiración Humand | Para quién | Cómo la usa cada uno | Prio | Esf |
|---|---|---|---|---|---|---|
| 1 | **Legajo único** (oficina + obra) anclado a `hr.employee`, con documentos con archivo, vencimientos calculados por cron y RLS por permiso. Salud con `exigeExplicito` | Legajo digital | Administración, JS | App AndamiosOS (web). El operario no lo toca | I | M |
| 2 | **Pasaporte de obra por persona:** apto de altura, preocupacional, cursos, EPP entregado, ART/nómina, seguro de vida. Semáforo verde/amarillo/rojo y aviso a 30 y 7 días | No viene de Humand (Humand no tiene alertas de vencimiento) | Obra, capataz, administración | **Operario:** lo ve en el link de Telegram ("Mis papeles") y se lo puede mostrar al de seguridad del comitente. **Oficina:** tablero de vencimientos | I | M |
| 3 | **Bloqueo en la Hoja del día:** si no tiene apto de altura vigente no se puede asignar a tarea en altura. Lo demás vencido genera advertencia, no bloqueo | No viene de Humand | Planificador, capataz | Aviso rojo al armar la cuadrilla | I | S |
| 4 | **Paquete por comitente:** ZIP o link con los PDF vigentes de la cuadrilla asignada a esa obra | No viene de Humand | Administración, comercial | Un botón desde Habilitaciones | I | M |
| 5 | **Constancia de EPP firmada** (Res. 299/11 y Disp. 3/22): ítem, talle, marca, certificación, fecha, firma con el dedo y PDF con hash | Formularios PDF con firma (la idea); en la práctica se arma con la firma de Permisos | Obra, pañol | **Kiosco del pañol:** PIN, retira, firma en la tablet. Cero paso extra para el operario | I | M |
| 6 | **Alta (onboarding) con checklist:** preocupacional, alta ARCA, nómina ART, inducción firmada, EPP, credencial del pañol, Telegram vinculado. Sin todo en verde no sale a obra. **Baja (offboarding):** devolución de EPP y herramientas, Fondo de Cese a 48 h y certificado del art. 80 | Onboarding | Administración, HyS | Web para la oficina. La inducción la firma el operario en el kiosco | I | M |
| 7 | **Avisar ausencia y pedir días:** en el bot, "Mañana no voy" con motivo en botones y foto del certificado si hace falta. "Pedir vacaciones" con saldo visible ("te quedan 9 días"). Aprueba el planificador o JS. Escribe en `hd_ausencias` con estado | Vacaciones y permisos (saldo, adjunto obligatorio, pedir en nombre de otro) | Obra y oficina | **Obra:** Telegram. **Oficina:** web. Para el que no tiene celular, el capataz o el planificador lo carga en su nombre | I | M |
| 8 | **Asistencia precargada desde la Hoja del día hacia `x_parte_diario`:** el capataz confirma presentes con un toque. Nada de fichar con selfie | Control de asistencia (solo la idea de registrar; descarto el cómo) | Capataz, Juan Pablo | Link del capataz: lista de la cuadrilla y "Confirmar" | I | M |
| 9 | **Recibo de sueldo:** PDF sábana que se corta por CUIL, link por Telegram, firma con el dedo, conforme o disconforme con texto, siempre descargable, guardado 10 años, recordatorio a quien no firmó | Documentos y firma de recibos | Obra y oficina | **Obra:** Telegram y link. **Oficina:** web. Sin celular: firma en el kiosco | I | M |
| 10 | **Comunicados con "Entendido" nominal:** texto corto, audio opcional (grabado por JS o el capataz, no sintético), segmentado oficina / obra / cuadrilla. Reporte de quién no confirmó y reenvío | Muro + Novedades importantes. Humand no tiene confirmación obligatoria y nosotros sí | Todos | **Obra:** Telegram con botón. **Oficina:** campanita | I | S |
| 11 | **Aviso de accidente:** botón del capataz con quién, dónde, foto y qué pasó. Alerta inmediata a HyS y oficina, checklist de denuncia a la ART y teléfono de la ART a mano. Se ata a Incidentes, que hay que vincular a `personal` | No viene de Humand | Capataz, HyS, administración | Link del capataz y Telegram. Slack #syh | I | M |
| 12 | **Charla de 5 minutos y PTS diario:** el capataz elige el tema de una lista, la cuadrilla viene precargada, saca foto grupal y confirma. Registro por persona. **Puede vivir en Partes; lo decido con JS** | No viene de Humand | Capataz, HyS | Link del capataz, menos de 1 minuto | C | M |
| 13 | **Registro de capacitaciones:** quién hizo qué, cuándo vence, constancia firmada. Alimenta el pasaporte | Aprendizaje (solo la constancia con firma) | HyS, obra | Firma en el kiosco o en el link. Carga desde la web | C | S |
| 14 | **Pedidos simples:** adelanto, constancia de trabajo, cambio de datos (CBU, domicilio), reponer ropa | Gestión de servicios | Obra y oficina | Botones en el bot. Bandeja de administración | C | S |
| 15 | **Cumpleaños y aniversarios:** mensaje del bot con texto distinto para obra y oficina, y aviso a la oficina el día anterior | Cumpleaños y aniversarios | Todos | Telegram y campanita | C | S |
| 16 | **"Qué hago si…":** fichas cortas (accidente, ART, EPP, convenio, teléfonos), con texto grande y audio | Librería de conocimiento | Obra | Link desde el bot | D | S |
| 17 | **Pulso de 3 preguntas, dos veces por año,** resultado solo a nivel empresa | Encuestas / People Experience (versión mínima) | Todos | Telegram | D | S |
| 18 | **Reconocimiento simple** ("cuadrilla del mes" por seguridad u orden), sin puntos ni canje | Reconocimientos | Todos | Comunicado | D | S |

**"¿Dónde voy mañana?"** ya lo resuelve la Hoja del día. No se duplica: el bot de RRHH y el de la Hoja tienen que ser el mismo bot, con el mismo menú.

---

## 3. Lo que descarto de Humand

- **Comprar Humand.** No llega por Telegram ni por WhatsApp. No funciona offline salvo el Kiosk. Pide Android 10 o más y pesa 187 MB. No tiene integración con Odoo, no tiene pasaporte de obra, no tiene alertas de vencimiento y no bloquea asignaciones. Para 40 personas pagaríamos un estimado de US$ 2.000 a 5.000 por año para replicar mal lo que ya tenemos a medias.
- **Fichada con selfie, GPS y geocerca por sede.** Las obras cambian todo el tiempo y la selfie genera rechazo (ya lo dicen las reseñas). El capataz confirma presentes y alcanza.
- **Kiosk con reconocimiento facial.** Ya tenemos kiosco con PIN y QR.
- **Muro, grupos, chat propio, noticias tipo revista y videollamadas.** La cuadrilla ya habla por WhatsApp. Otro chat no se usa y solo dispersa.
- **Transmisiones en vivo, eventos con RSVP, marketplace y grupos multiempresa.** No corresponden a una empresa de 40 personas.
- **Clima con mapa de calor, dimensiones y eNPS comparado.** Con cuadrillas de 3 a 5 personas no hay anonimato posible, y en una familiar se habla directo.
- **Evaluación 360, matriz 9-box, objetivos y calibración.** Es burocracia que nadie de obra va a completar. Si JS quiere, una charla anual con una ficha simple, después.
- **Cursos con rutas y certificados (LMS).** El montador no va a mirar videos con datos limitados. La capacitación se da en obra; el sistema guarda la constancia.
- **Reconocimientos con puntos y canje.** No se justifica administrar un catálogo de premios.
- **Sammy (IA).** Por ahora no. Más adelante el bot puede contestar "¿cuántos días me quedan?", pero primero tiene que funcionar lo básico.

---

## 4. Etapas

**Etapa 0, la base (sin esto no se hace nada):**
- Legajo único oficina + obra.
- Cerrar la RLS.
- Tipos de documento que faltan: apto de altura, registro de conducir, curso con entidad.
- Subida real de archivos.
- Cron de vencimientos.

**Etapa 1, que nadie quede en la puerta:**
- Pasaporte (2).
- Bloqueo en la Hoja del día (3).
- Paquete por comitente (4).
- Constancia de EPP en el kiosco (5).
- Alta y baja (6).

Es lo que más plata y más riesgo ahorra.

**Etapa 2, el día a día del operario:**
- Avisar ausencia y pedir días (7).
- Asistencia a `x_parte_diario` (8).
- Comunicados con "Entendido" (10).
- Cumpleaños (15), porque es barato y sirve para que la gente empiece a usar el bot.

**Etapa 3, plata y seguridad:**
- Recibos (9), apenas el contador confirme el formato y la validez.
- Aviso de accidente (11).
- Charla y PTS (12).
- Capacitaciones (13).
- Pedidos (14).

**Etapa 4:** 16, 17 y 18.

---

## 5. Riesgos y dudas para JS

1. **¿Cuántos operarios tienen Telegram vinculado?** No está verificado y todo el plan de obra depende de eso. Hay que medirlo antes de la etapa 2. Si son pocos, hay dos salidas: plantillas de WhatsApp aprobadas por Meta (con costo y tiempo de aprobación) o el capataz como intermediario. ¿Qué preferís?
2. **¿Bloqueo duro o advertencia?** Mi postura: bloqueo duro solo para altura sin apto, y advertencia para todo lo demás, para no dejar una obra sin cuadrilla por un seguro vencido ayer. Tiene que quedar registro de quién pasó por encima de una advertencia.
3. **Recibos:**
   - ¿Quién liquida y en qué formato llega (PDF sábana con CUIL)?
   - ¿Alcanza la firma electrónica como constancia de entrega (art. 139 de la Ley 27.802 frente a la Res. 346/19)?

   Lo tienen que confirmar el contador o un abogado laboral antes de dejar el papel.
4. **Periodicidad del apto de altura y de los periódicos.** La Res. 61/23 dice "vigente" pero no fija plazo. Hay que definirlo con la ART. También hay que aclarar si ABA hace el aviso de obra y su propio programa de seguridad en cada obra, o se cuelga del contratista principal.
5. **Datos de salud.** El capataz ve solo "apto / no apto / vence"; el diagnóstico solo lo ve quien tenga permiso explícito. ¿Quién es ese responsable: vos, administración o HyS externo?
6. **Celulares viejos y datos limitados.** Recibo y pasaporte en HTML liviano, con el PDF solo si lo pide. Nada de videos ni de audios que se reproduzcan solos.
7. **Personal sin celular o con poca lectura.** Kiosco con firma, audio en los comunicados y "pedir en nombre de" para capataz y planificador.
8. **No convertir al capataz en administrativo.** Cada acción diaria tiene que llevar menos de un minuto y venir precargada. Si la charla y el PTS le suman más que eso, se dejan de hacer o se hacen "de taquito", y eso es peor que no tenerlo.
9. **Vacaciones UOCRA.** El período legal va del 1/10 al 30/04 y la temporada alta de obra cae justo ahí. ¿Querés que el sistema sugiera turnos por cuadrilla?
10. **Convenio de la oficina** (¿Comercio 130/75?) y el FAL desde el 01/11/2026, que corre solo para oficina. Lo resuelve el contador; el sistema solo necesita el dato del convenio en el legajo.

---

## 1.3 Propuesta del Arquitecto de producto de AndamiosOS

# Propuesta del arquitecto de producto: módulo RRHH de AndamiosOS

## Posición

**No contrataría Humand. Construiría un RRHH chico, encima de lo que ya tenemos.**

- Humand está pensado para comunidades de cientos de personas que tienen que instalar una app: muro, chat, grupos, LMS, desempeño. Eso a ABA no le hace falta.
- Lo que ABA necesita de verdad no lo tiene Humand:
  - papeles de obra con vencimiento;
  - la carpeta para cada comitente;
  - EPP trazable;
  - aptos de altura;
  - WhatsApp o Telegram;
  - funcionar con poca señal.
- Además, duplicaría cosas que ya andan: kiosco, Hoja del día, organigrama, ausencias.
- **Plan B honesto:** si en 6 meses no salieron los recibos firmados, contratar Humand solo para recibos y vacaciones es razonable. Mi estimación es de US$2.000 a 5.000 por año, pero **no está verificada** porque el precio no es público. No investigué proveedores locales que hacen solo recibo digital; habría que mirarlos antes de decidir.

---

## 1. Qué problemas resuelve

### Oficina (administración, JS, Juan Pablo)
- **La oficina no tiene legajo.** Legajos tiene solo a la gente de obra, y a la oficina se la conoce como usuarios del sistema o como empleados en Odoo. No hay una ficha única por persona.
- **Nada controla los vencimientos.** Aptos, cursos de altura, ART y registro de conducir no avisan cuando vencen. Los documentos guardan solo los datos: el archivo no se sube nunca.
- **La documentación para los comitentes se arma a mano todos los meses.** La Nómina ART se pide en el 82 % de las obras.
- **Recibos en papel.** No hay constancia de entrega trazable ni nada guardado por 10 años.
- **Vacaciones y licencias de palabra.** No hay saldo ni constancia del aviso con 30 días de anticipación.
- **Asistencia cargada dos veces.** Juan Pablo carga en Odoo (`x_parte_diario`) algo que la Hoja del día ya sabe.
- **Riesgo de privacidad hoy.** Cualquier usuario logueado puede leer legajos, documentos y fichadas, porque esas tres tablas no tienen restricción de lectura.

### Obra (operarios, capataces, choferes)
- Firman el recibo en papel y después no pueden volver a verlo.
- No saben cuántos días de vacaciones les quedan. Piden y avisan ausencias por WhatsApp a quien les conteste.
- Se enteran tarde, o no se enteran, de los cambios importantes (seguridad, horarios, pagos). Y nadie puede demostrar que les llegó.
- La entrega de EPP no tiene una constancia firmada válida (Res. SRT 299/11).
- Los pueden mandar a trabajar en altura con el apto vencido sin que nadie lo note.

---

## 2. Funciones elegidas

Esfuerzo: **S** = días, **M** = 1 a 2 semanas, **L** = 3 semanas o más (estimación con el ritmo actual de JS y Claude).

| # | Función | En qué se inspira | Para quién | Cómo la usa cada uno | Prioridad | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Ficha única de persona** (oficina y obra), anclada en el empleado de Odoo (`hr.employee`) | Legajo digital | Administración y JS | App web. Datos de salud y de sueldo con permiso explícito: ni el admin los ve por defecto | Imprescindible | M |
| 2 | **Documentos con archivo, vencimiento y semáforo**, con aviso en la campanita y Slack 30 y 7 días antes | No viene de Humand (no tiene alertas de vencimiento) | Administración. El capataz ve solo "apto / no apto" | App web, campanita, y Telegram a la persona | Imprescindible | M |
| 3 | **Recibos de sueldo firmados** | Documentos y firma de Humand | Ambos | Administración sube el PDF del contador con todos los recibos y el sistema lo corta por CUIL. A la persona le llega un link (Telegram/WhatsApp), firma con el dedo conforme o en disconformidad, y queda un PDF con hash. Sin celular, firma en el kiosco del pañol con PIN | Imprescindible | M |
| 4 | **Comunicados con confirmación de lectura nominal**, para oficina, obra, una cuadrilla o una persona | Muro y "Novedades importantes", pero mejor: Humand no tiene el "leí y entendí" | JS, administración y todos | Telegram/WhatsApp con botón "Entendido", campanita en la oficina y pantalla en el kiosco. Tablero de quién no leyó, con recordatorio | Imprescindible | S–M |
| 5 | **Constancia de EPP firmada** (Disp. GP SRT 3/2022), cada pieza con su QR | No viene de Humand | Pañol y obra | Kiosco: QR o PIN, firma y PDF al legajo. Es la fase 2 del pañol, ya prevista | Imprescindible (legal) | M |
| 6 | **Vacaciones y licencias**: saldo calculado según la LCT, pedido, aprobación en un paso, aviso con 30 días y constancia firmada | Vacaciones y permisos | Ambos. Aprueba el jefe según el organigrama, o JS | Obra: link o botones de Telegram. El jefe puede pedir en nombre de alguien. Oficina: app. Se construye **ampliando las ausencias que ya tiene la Hoja del día** (`hd_ausencias`), sin crear otra tabla | Conviene | M |
| 7 | **"Hoy no voy"**: aviso de ausencia el primer día, con foto del certificado | No viene de Humand | Obra | Botón en Telegram. Entra a las ausencias como "a confirmar" y el planificador lo ve en la Hoja del día | Conviene | S |
| 8 | **Carpeta por comitente** ("pasaporte de obra"): ZIP o link con los PDF vigentes de la cuadrilla asignada | No viene de Humand | Administración y Habilitaciones | App web, con un botón desde Habilitaciones | Conviene (es el ahorro de horas más grande) | M |
| 9 | **Habilitación persona-tarea**: advertencia al asignar a alguien sin apto de altura vigente o sin la capacitación | No viene de Humand | Planificador | Aviso en la Hoja del día y en Cuadrillas | Conviene | S |
| 10 | **Checklist de alta y de baja** | Onboarding | Administración | **Alta:** preocupacional, constancia de ARCA, credencial del pañol, vínculo con Telegram, EPP, inducción, nómina ART. **Baja:** devolución de herramientas y EPP, entrega de la acreditación del Fondo de Cese en 48 h, certificado del art. 80. Todo en la app web | Conviene | S–M |
| 11 | **Cumpleaños y aniversarios**: saludo automático, con un texto para obra y otro para oficina, y aviso a JS | Cumpleaños y aniversarios | Todos | Telegram/WhatsApp y campanita | Conviene (barato y en una pyme familiar se valora mucho) | S |
| 12 | **Asistencia del día precargada que se escribe en Odoo** (`x_parte_diario`) | No: es la fase 2 de la Hoja del día | Juan Pablo | App web. Termina con la doble carga | Conviene, si la aprueban Juan Pablo y JS | M |
| 13 | **Pedidos a RRHH**: adelanto, certificado laboral, cambio de datos, ropa | Gestión de servicios | Ambos | Link o Telegram. Bandeja con el mismo patrón que la de Sistemas | Después | S–M |
| 14 | **Pulso anónimo trimestral**: 3 a 5 preguntas más eNPS | People Experience | Todos | Link. Resultados **solo a nivel empresa**; obra y oficina por separado únicamente con 8 respuestas o más | Después | S |
| 15 | **Reglamento, convenio, procedimientos y teléfonos**, más un asistente que responda "¿cuántos días me quedan?" | Librería y Sammy | Todos | Telegram, reusando el armado del agente Tomás | Después | M |

### Cómo llega cada cosa a la gente de obra (vale para todo)
- **Sin cuentas ni contraseñas.** Se reusa el link con token de `/h/<token>`: funciona sin señal y es de alto contraste. Para RRHH hace falta un token **por documento o pedido**, no el diario.
- **El aviso lo manda el bot de Telegram,** que ya está vinculado y deja registro de envío y respuesta.
- **El kiosco del pañol es la salida para quien no tiene celular.**
- **Firma y PDF:** se reusan el componente de firma con el dedo y el PDF firmado de Permisos (`firma-pad.tsx` y `documentos-firmados.ts`).

---

## 3. Lo que descarto de Humand

| Función | Por qué no |
|---|---|
| Muro / red social, grupos, chat, videollamadas | Con 40 personas, WhatsApp y Telegram ya cumplen ese papel. Agregarlos es otro lugar más para mirar y con baja adopción en obra. Lo único que sirve es el comunicado con confirmación (función 4) |
| Noticias (revista), transmisiones en vivo, eventos | Exagerado para el tamaño de ABA. Un comunicado alcanza |
| Reconocimientos con puntos y canje, marketplace | Mucha administración para 40 personas. Si JS quiere reconocer a alguien, lo hace en persona o con un comunicado |
| Evaluación 360, matriz 9-box, calibración, objetivos | Tiene sentido con mandos medios y comités. En ABA ordena más una charla de JS que un ciclo de evaluación |
| Aprendizaje (cursos, rutas, certificados) | Lo que importa es **registrar** quién hizo qué curso y cuándo vence (función 2), no dictar cursos |
| Fichada con selfie, geocerca por sede, Kiosk facial | Las obras cambian todo el tiempo y la selfie genera rechazo. La asistencia ya sale de la Hoja del día y de Odoo. El prototipo de Fichadas de marzo **se descarta**: no identifica a la persona y depende de la tabla vieja de obras |
| Turnos, cuadrantes y bolsa de horas | Lo cubren las Cuadrillas y la Hoja del día. La bolsa de horas además exige acuerdo escrito, y las horas-hombre ya las calcula Odoo |
| Métricas de uso (Insights), traducción, "mejorar con IA" | No aportan nada a ABA |
| Mapa de calor del clima | Con equipos de 3 a 5 personas no se puede mostrar sin identificar a la gente |
| Reclutamiento | Se contrata poco y por boca en boca. Si hace falta, hay herramientas aparte |

---

## 4. Etapas

**Etapa 0, la base (alrededor de 1 semana)**
- Cerrar el acceso a legajos, documentos y fichadas (`personal`, `documentos`, `fichadas`) para que cada uno vea solo lo que su permiso le da, siguiendo el patrón del Organigrama.
- Crear el módulo `rrhh` en `acceso.ts`, con permiso explícito (`exigeExplicito`) para salud y sueldos.
- Ampliar la sincronización con Odoo:
  - que traiga también a la oficina;
  - que sume fecha de ingreso, fecha de nacimiento, CUIL y jefe (`parent_id`).
- Antes de diseñar los recibos, confirmar con el contador el formato del PDF y si el CUIL viene en el texto.

**Etapa 1, papeles en orden:** funciones 1, 2 y 5.
- La persona existe una sola vez, cada documento tiene su archivo y nada vence sin aviso.
- El EPP queda firmado en el kiosco.

**Etapa 2, lo que toca el operario:** funciones 3 y 4.
- Prueba con un mes de recibos **en paralelo con el papel**, y medir cuántos firman en 72 horas.
- Comunicados con "Entendido".

**Etapa 3, el día a día:** funciones 6, 7, 8, 9, 10 y 11.

**Etapa 4, después:** funciones 12, 13, 14 y 15, según cómo haya respondido la gente a las etapas 2 y 3.

Cada etapa se cierra con su handoff y su módulo en `docs/rrhh/`, como el resto de AndamiosOS.

---

## 5. Riesgos y dudas para JS

1. **Validez de la firma del recibo.** La Ley 27.802 (art. 38) admite firma electrónica como constancia de entrega. No sabemos si la Res. 346/19 sigue pidiendo firma digital. **Lo tiene que confirmar el contador o un abogado laboral antes de dejar el papel.** Mientras tanto, en paralelo.
2. **¿Quién liquida y en qué formato llegan los recibos?** No está en el repo. Si el contador no puede mandar un PDF con el CUIL legible, la función 3 se complica.
3. **Canal para la obra.** No sabemos cuántos operarios tienen Telegram vinculado.
   - WhatsApp a empleados exige plantillas aprobadas por Meta, con costo por mensaje.
   - Hay que decidir si se usa el mismo número que Tomás u otro.
   - **Mi recomendación:** Telegram primero, y para quien no lo tenga, un link wa.me que manda alguien de la oficina.
4. **Calidad de los datos en Odoo.** No verificamos si hay fecha de ingreso, fecha de nacimiento ni jefe cargados. Sin eso no hay saldo de vacaciones, cumpleaños ni aprobaciones. Puede hacer falta una carga inicial a mano.
5. **Quién ve qué.** En una empresa familiar, ¿quién de la oficina ve sueldos, certificados médicos y sanciones? Hay que definirlo antes de la etapa 1.
6. **El link se puede reenviar.** Para firmar recibos, propongo pedir además los últimos 3 dígitos del DNI o el PIN del pañol.
7. **Seguridad e Higiene no es RRHH.** El permiso de trabajo seguro diario, la charla de 5 minutos y la verificación del andamio (Res. SRT 61/23) van en un módulo de Seguridad e Higiene, o en los partes. RRHH solo **lee** de ahí las capacitaciones de cada persona. Si los mezclamos, el módulo crece sin control.
8. **Odoo tiene módulos de ausencias y asistencia que no usamos** (`hr.leave`, `hr.attendance`). No sabemos si están instalados. **Mi recomendación:** las ausencias se manejan en AndamiosOS y lo que se liquida queda en Odoo (`x_parte_diario`), sin una tercera fuente.
9. **Capacidad.** RRHH compite con Sistemas y con el rediseño de partes. Hay que elegir el orden.
10. **Cosas que no son del sistema pero vencen pronto.**
    - El Fondo de Asistencia Laboral (FAL) arranca el 01/11/2026 para la oficina. Es tema del contador.
    - Falta confirmar qué convenio tiene la oficina (¿Comercio 130/75?).
11. **Mantenimiento.** Las reglas laborales cambiaron dos veces en 2026. Saldo de vacaciones y formato del recibo tienen que ser parámetros con historial, no código fijo.

---

# 2. Réplicas

## 2.1 Réplica de la Directora de RRHH de pymes

# Debate: mirada de la directora de RRHH de pymes

## En qué acordamos los tres

- **No comprar Humand.** Lo construimos en AndamiosOS.
- **Canal de obra.** El link `/h/`, Telegram y el kiosco con PIN. Nada de cuentas.
- **Base primero.** Antes de cualquier función: cerrar la RLS y armar una ficha única anclada en `hr.employee`.
- **Vencimientos.** Semáforo y paquete por comitente.
- **Constancias firmadas.** EPP firmado en el kiosco. Recibos firmados en paralelo con el papel hasta que el contador o el abogado validen la firma.
- **Ausencias.** Las licencias se arman extendiendo `hd_ausencias`, sin una tercera fuente.
- **Comunicados.** Con "Entendido" nominal.
- **Datos de salud.** El capataz ve solo "apto / no apto".
- **Lo que se descarta.** Evaluación 360, selfie, muro, chat y puntos.

Coincidimos en el 80 %. Las diferencias están en el orden de las etapas y en qué entra dentro de RRHH.

## Lo que traen los otros y adopto

**Del jefe de obra y SyH:**
1. **Aviso de accidente.** No lo vi y es grave: la denuncia a la ART es inmediata y hoy depende de la memoria de alguien. Lo adopto, pero vive en Incidentes, vinculado a `personal`. RRHH muestra el caso en la ficha y maneja la licencia ART.
2. **Bloqueo duro solo para altura sin apto. Para todo lo demás, advertencia con registro de quién la pasó por alto.** Yo había propuesto un bloqueo blando para todo y estaba mal: la Res. 61/23 exige el apto vigente.
3. **Audio grabado por JS o por el capataz, no sintético.** Retiro mi propuesta de usar ElevenLabs. En una empresa familiar, la voz del dueño es justamente lo que da valor al audio.
4. **Un solo bot**, compartido con la Hoja del día y con el mismo menú.
5. **Vacaciones UOCRA en temporada alta.** El período legal va del 1/10 al 30/04 y coincide con la temporada fuerte de obra. Sugerir turnos por cuadrilla sirve.

**Del arquitecto de producto:**
1. **Plan B honesto.** Si en 6 meses no salen los recibos, se contrata algo externo. Le agrego una pregunta previa: **¿el sistema de liquidación del contador ya trae portal de recibo digital?** Muchos lo traen, y sería el camino más barato.
2. **El link se puede reenviar.** Para firmar el recibo, pedir además los últimos 3 dígitos del DNI o el PIN.
3. **Parámetros con historial** para el saldo de vacaciones y el formato del recibo. La ley cambió dos veces en 2026.
4. **Capacidad.** RRHH compite con Sistemas y con el rediseño de partes. JS tiene que elegir el orden.
5. **La meta de la prueba de recibos:** medir cuántos firman en 72 horas.

## Desacuerdos y mi posición final

**1. Producto deja "Hoy no voy" y vacaciones en "Conviene", etapa 3. No estoy de acuerdo.**
- **"Hoy no voy".** Es esfuerzo S y lo exige la ley: el art. 209 pide avisar el primer día, y desde el Dec. 407 el certificado es electrónico (ReNaPDiS), así que llega como PDF y es fácil de subir.
- **Vacaciones.** El aviso por escrito con 30 días es obligatorio y **el período ya empezó el 1/10**.
- **Posición:** "Hoy no voy" va en la etapa 1 y vacaciones en la 2. Mientras tanto, **esta semana**, administración usa una constancia de aviso de vacaciones en PDF para firmar. No hace falta esperar al módulo.

**2. Producto deja la carpeta por comitente en etapa 3, aunque reconoce que es el mayor ahorro de horas. Es una contradicción.**
- **Posición:** etapa 1, junto con los vencimientos. El jefe de obra lo ve igual que yo.

**3. Obra/SyH mete la charla de 5 minutos y el PTS en el módulo de RRHH.**
- Es la operación diaria de Seguridad e Higiene. Si entra a RRHH, el módulo crece sin control y el capataz termina cargando lo mismo en dos lados.
- **Posición:** va en Partes o en un módulo de SyH. RRHH solo lee las constancias.

**4. Obra/SyH dice "sin todo en verde en el alta no sale a obra". Es demasiado rígido.**
- El alta en ARCA y el preocupacional son condiciones legales previas al primer día: esas sí bloquean.
- Vincular Telegram o imprimir la credencial del pañol no pueden dejar a un montador en su casa.
- **Posición:** separar lo que bloquea por ley de lo que es pendiente de gestión.

**5. Frecuencia del pulso.**
- Producto propone trimestral: con 40 personas eso cansa y se vuelve rutina.
- Obra/SyH agrega que "en una familiar se habla directo". No siempre. Lo que más se calla en una pyme familiar es justamente el trato de los familiares y los favoritismos.
- **Posición:** semestral, solo a nivel empresa y obra contra oficina, con 8 respuestas o más por grupo. Etapa 4.

**6. Asistencia a `x_parte_diario`.**
- Obra/SyH la pone como imprescindible y Producto la deja para la etapa 4.
- Es lo que se usa para liquidar: un error ahí son sueldos mal pagados.
- **Posición:** etapa 2, con el ok explícito de Juan Pablo y un mes con las dos cargas a la vez, comparando las diferencias.

**7. Quién ve salud y sueldos.**
- Producto lo deja como pregunta abierta. Yo me la juego.
- **Posición:** una persona de administración designada, más JS. Nadie más, tampoco los familiares que trabajan en la oficina, salvo que JS lo decida por escrito.

## Lo que sobra

- **Obra/SyH:** el PTS y la charla dentro de RRHH. El seguro de vida y la nómina ART cargados "por persona": son documentos de la empresa con nómina adjunta, no de cada operario.
- **Producto:** el asistente con IA de esfuerzo M en este horizonte. El pulso trimestral.
- **Mío:** el reconocimiento mensual como función aparte. Alcanza con una línea en el comunicado de JS, sin desarrollo.

## Lo que falta en las tres propuestas

1. **Quién opera el módulo.** Solo yo lo planteé, y es lo que decide si el módulo vive o se muere. **Hay que nombrar a una persona antes de la etapa 0** y medir cuántas horas le ahorra, no cuántas le agrega.
2. **El paquete por comitente mezcla documentos de la empresa y de la persona.** Los de la empresa son el F.931, el certificado ART con nómina, la cláusula de no repetición, el seguro de vida y el certificado del IERIC. Los de la persona son el apto, los cursos y el EPP. Ninguno de los tres lo modeló así, y sin los de la empresa el ZIP no alcanza para entrar a obra.
3. **Sanciones y apercibimientos.** Nadie los trató. Van con un registro restringido en la ficha y se notifican por carta documento, nunca por Telegram ni WhatsApp. El sistema guarda la constancia, no notifica.
4. **Carga inicial de datos.** Los tres la mencionan y ninguno la presupuesta. Propuesta: importar la fecha de ingreso, el CUIL y la categoría desde el sistema del contador, no tipearlos. Hay que pedírselo en la etapa 0.
5. **Adelantos.** Tocan caja. Hay que definir un tope y quién aprueba antes de ponerlos como botón en el bot.
6. **Experiencia de oficina.** Las tres propuestas miran casi todo desde la obra. Los 15 de oficina también piden vacaciones, firman recibos y tienen convenio y FAL propios. La maqueta tiene que mostrar las dos experiencias con el mismo peso.

## Posición final

Este es el orden que defiendo. El número de cada función es el de mi propuesta; las que no tienen número vienen de las otras dos.

- **Etapa 0:**
  - Nombrar quién opera el módulo.
  - Cerrar la RLS.
  - Ficha única.
  - Importar datos desde el contador.
  - Preguntarle al contador si su sistema ya trae portal de recibo digital.
  - Constancia de vacaciones en PDF para usar ya.
- **Etapa 1:**
  - Vencimientos y pasaporte (2), con documentos de la empresa y de la persona.
  - Paquete por comitente.
  - Bloqueo duro solo para altura.
  - "Hoy no voy" (4).
  - EPP firmado en el kiosco (6).
  - Aviso de accidente, que vive en Incidentes.
- **Etapa 2:**
  - Recibos con firma (3), en paralelo con el papel.
  - Vacaciones con saldo (5).
  - Comunicados con "Entendido" y audio grabado (7).
  - Asistencia (12), con el ok de Juan Pablo.
  - Cumpleaños (8).
- **Etapa 3:**
  - Alta y baja (9), con bloqueo solo para lo legal.
  - Capacitaciones (11), leídas de SyH.
  - "Lo que tenés que saber" (10).
  - Pedidos a RRHH (13).
- **Etapa 4:**
  - Pulso semestral (14).
  - Tablero para JS (15).
  - Asistente.

---

## 2.2 Réplica del Jefe de obra y responsable de Seguridad e Higiene

# Debate: jefe de obra / SyH sobre las propuestas de RRHH y de Producto

## En qué acordamos los tres
- **Humand no se compra.** Pide Android 10, pesa 187 MB, no manda nada por WhatsApp ni Telegram y no avisa vencimientos.
- **El operario no usa cuentas.** Entra por Telegram, por el link `/h/` y por el kiosco del pañol con PIN.
- **Ficha única** anclada a `hr.employee`. Primero se cierra la RLS de `personal`, `documentos` y `fichadas`, y salud y sueldos llevan `exigeExplicito`.
- **Ausencias y licencias** se hacen ampliando `hd_ausencias`, sin otra tabla.
- **Recibo:** se sube el PDF sábana, se corta por CUIL, se puede firmar en disconformidad y siempre se puede descargar.
- **EPP:** constancia firmada en el kiosco.
- **Comunicados** con "Entendido" nominal.
- **Se descarta:** selfie, geocerca, muro, chat, 360, LMS y puntos.
- **Datos de salud:** el capataz ve solo "apto / no apto / vence".

## Lo que adopto de los otros
- **De RRHH, la pregunta "¿quién opera RRHH?".** Es el riesgo número uno y yo no lo vi. Si nadie de administración es dueño del módulo, en tres meses el pasaporte queda con datos viejos. Para una cuadrilla, un semáforo en verde que miente es peor que no tener semáforo.
- **De RRHH, que JS reciba el aviso del cumpleaños el día anterior.** En obra un llamado de JS vale más que cualquier bot.
- **De RRHH, la transición con papel en paralelo** y la explicación en persona. Al montador desconfiado no se lo convence con un comunicado: se le explica en el obrador.
- **De Producto, un token por documento o pedido** y no el diario, que vence a las 23:59 del día siguiente. También adopto pedir algo más para firmar el recibo. Prefiero el **PIN del pañol**, que ya existe y el operario ya conoce, en lugar de los 3 dígitos del DNI.
- **De Producto, QR por pieza de EPP.** La Res. 61/23 pide trazabilidad e inspección del EPP de altura. Lo agrego a mi función 5.
- **De Producto, que las reglas laborales sean parámetros con historial.** En 2026 ya cambiaron dos veces.
- **De Producto, medir cuántos firman en 72 h** durante el mes de prueba.

## Desacuerdos y posición final

**1. Altura sin apto: ¿advertencia o bloqueo?**
- RRHH propone "bloqueo blando" y Producto "advertencia".
- No estoy de acuerdo. A las 6:30, con la cuadrilla esperando en el camión, cualquier advertencia se saltea con un clic.
- La Res. 61/23 exige apto vigente para trabajar en altura. Si hay un accidente con alguien que tenía el apto vencido, que haya existido una advertencia no defiende a ABA: la empeora, porque prueba que la empresa sabía.
- **Posición final:** bloqueo duro solo para altura.
  - Lo puede destrabar únicamente JS o el responsable de HyS, con su nombre y el motivo registrados. El planificador no.
  - El bloqueo se prende recién cuando termina la carga inicial de aptos. Hasta entonces funciona como advertencia, para no frenar obras por datos sucios.
  - Todo lo demás que esté vencido genera advertencia.

**2. Pasaporte y carpeta por comitente**
- Producto lo pone como "conviene", en la etapa 3, y en la misma fila dice que es el ahorro de horas más grande. Se contradice.
- La Nómina ART se pide en el 82 % de las obras.
- **Posición final:** va en la etapa 1, como propone RRHH.

**3. Accidente laboral**
- Ninguna de las otras dos propuestas tiene un circuito para accidentes.
- La denuncia a la ART tiene que ser inmediata (Dec. 717/96). Hoy depende de que alguien se acuerde.
- **Posición final:** la versión mínima entra en la etapa 2 y es de esfuerzo S. Es un botón del capataz con quién, dónde y foto, alerta a HyS y a la oficina, y el teléfono de la ART a mano. Mi propuesta original lo dejaba en la etapa 3, y lo adelanto.

**4. Charla de 5 minutos y PTS**
- Los dos dicen que no es tema de RRHH. Acepto el límite.
- Pero el PTS es diario y es lo que primero pide un inspector. Dejarlo como "otro módulo" sin dueño ni fecha equivale a no hacerlo.
- **Posición final:** sale de RRHH, con dos condiciones:
  - JS le pone fecha a un módulo de SyH.
  - RRHH lee de ahí las constancias por persona.

**5. Audio en los comunicados**
- RRHH propone voz sintética con ElevenLabs. Para un comunicado de seguridad, una voz robótica suena a promoción y se ignora.
- El montador presta atención cuando reconoce la voz de JS o del capataz.
- **Posición final:** audio grabado por una persona. ElevenLabs queda para Tomás con los clientes.

**6. Quién aprueba las vacaciones de obra**
- Los dos dicen "el jefe directo según el organigrama". En obra ese jefe sería el capataz, y el capataz no puede aprobar: no ve las demás cuadrillas y queda mal parado con su gente.
- **Posición final:**
  - El capataz puede pedir en nombre de un operario o dar su opinión.
  - Aprueba el planificador o JS.
  - Las vacaciones de obra van en la etapa 2 y no en la 3. El período UOCRA arrancó el 1/10 y el aviso con 30 días de anticipación es obligatorio.

**7. Asistencia precargada**
- Producto la manda a la etapa 4.
- Es la doble carga que Juan Pablo hace todos los días.
- **Posición final:** si Juan Pablo da el OK, va en la etapa 2. Para el capataz es un solo toque de "Confirmar".

**8. Pulso de clima**
- Producto lo propone trimestral. Con cuadrillas de 3 a 5 personas, cuatro encuestas por año cansan y nadie contesta.
- **Posición final:** semestral, como propone RRHH. Corte obra contra oficina solo si hay 8 respuestas o más por grupo.

## Lo que sobra
- **Reconocimiento, en las tres propuestas, incluida la mía.** Si en obra se premia a la "cuadrilla del mes", se termina premiando la velocidad, y eso empuja a saltearse pasos de seguridad. Lo saco, o lo dejo solo con criterios de seguridad y orden, nunca de rapidez.
- **Asistente de IA que contesta sobre vacaciones y reglamento** (Producto 15, esfuerzo M). Hoy no hace falta: con un botón "¿cuántos días me quedan?" en el bot alcanza.
- **El tablero de RRHH para JS** no debería ser una función aparte. Puede ser una vista del tablero de vencimientos.

## Lo que falta en las tres
1. **Certificado médico electrónico.** Desde el Dec. 407/26 la regla es el certificado emitido desde una plataforma ReNaPDiS. Las tres propuestas, incluida la mía, dicen "foto del certificado". Hay que pedir el PDF y registrar la matrícula y la plataforma emisora. La foto en papel queda solo como excepción.
2. **Designación del responsable de la tarea en altura.** Según la Res. 61/23 tiene que estar designado y capacitado. Tiene que figurar en el legajo del capataz, y la Hoja del día no debería armar una cuadrilla de altura sin uno.
3. **"Mis papeles" disponible sin señal.** Que el operario pueda mostrar su pasaporte en el portón de la obra, guardado en el celular gracias al service worker de `/h/`. La carpeta que arma la oficina no siempre llega a tiempo al de seguridad del comitente.
4. **Horario de envío del bot.** Nada después de las 21 ni los domingos, salvo una emergencia. Nada de audios ni videos que se reproduzcan solos. En la obra el celular es también el teléfono de la familia.
5. **Vida útil y control del arnés** en el pasaporte, cruzado con el pañol. Si el arnés está vencido, la persona no está habilitada aunque tenga el apto vigente.

## Orden final que defiendo
- **Etapa 0:** RLS, ficha única, tipos de documento, archivos, cron de vencimientos, nombrar al dueño del módulo y medir cuántos tienen Telegram vinculado.
- **Etapa 1:** pasaporte, bloqueo de altura, carpeta por comitente, EPP con QR y firma, alta y baja.
- **Etapa 2:** aviso de ausencia con certificado electrónico, vacaciones, comunicados, asistencia (si Juan Pablo da el OK) y accidente mínimo.
- **Etapa 3:** recibos (cuando el contador confirme formato y validez), capacitaciones y pedidos.
- **Después:** cumpleaños, pulso y "Qué hago si…". De todo esto, el cumpleaños puede adelantarse, porque es barato y acostumbra a la gente a usar el bot.

---

## 2.3 Réplica del Arquitecto de producto de AndamiosOS

# Debate: posición del arquitecto de producto

## En qué acordamos los tres

- **No contratar Humand.** Los motivos son los mismos en las tres propuestas: Android 10 o más, una app de unos 187 MB, sin Odoo, sin WhatsApp, sin alertas de vencimiento y sin modo offline. Además, su precio sigue sin verificarse.
- **El operario entra sin cuenta.** Usa el link con token, el bot de Telegram o el kiosco con PIN.
- **Etapa 0 obligatoria.** Antes de cualquier otra cosa: cerrar la RLS de `personal`, `documentos` y `fichadas`, y armar una ficha única anclada en `hr.employee` que incluya a la oficina.
- **Ausencias y vacaciones.** Se amplía `hd_ausencias` en lugar de crear otra tabla.
- **Firma.** Se reusan la firma con el dedo y el PDF con hash de Permisos.
- **Recibos.** Se pueden firmar en disconformidad y siempre se pueden descargar, aunque no estén firmados.
- **Constancia de EPP en el kiosco.**
- **Comunicados con "Entendido" nominal.**
- **Descartes comunes:** muro, chat, desempeño 360, LMS, selfie con geocerca y puntos con canje.
- **Validación externa.** El contador y la ART tienen que validar dos cosas antes de dejar el papel: la firma del recibo y la periodicidad del apto de altura.

## Qué adopto de los otros

**De la directora de RRHH:**
- **"¿Quién opera RRHH?"** Es el riesgo número uno y yo no lo puse. Sin una persona de administración que sea dueña del módulo, con horas medidas, no se arranca la etapa 1. Lo sumo como condición de la etapa 0.
- **El motivo de rechazo de vacaciones se le muestra al empleado.**
- **Aviso a JS el día anterior a cada cumpleaños.** No cuesta nada y en una empresa familiar vale más que el bot.
- **Tres meses de recibos en papel en paralelo,** explicándole en persona a quien desconfíe.
- **El "quién leyó" se usa para cuidar, no para sancionar.**

**Del jefe de obra:**
- **Aviso de accidente.** No lo tenía. Lo adopto, pero vive en Incidentes, vinculado a `personal`; RRHH solo muestra el registro en la ficha.
- **Un solo bot** con el mismo menú que la Hoja del día.
- **"Mis papeles" visible en el link del operario,** para mostrarle al de seguridad del comitente. Es barato y le da al operario una razón para abrir el link.
- **Regla del minuto:** ninguna acción diaria del capataz puede llevarle más de un minuto ni ir sin datos precargados.
- **Audio grabado por una persona, no sintético.** Una voz de ElevenLabs que suena como JS en un comunicado de seguridad confunde.
- **Pasaporte y recibo en HTML liviano,** y el PDF solo cuando la persona lo pide.

**De los dos:**
- **El paquete por comitente es etapa 1, no "conviene".** Yo lo había dejado en la etapa 3 y fue un error: es el ahorro de horas más grande y aparece en el 82 % de las obras.

## Desacuerdos y posición final

### 1. Charla de 5 minutos y PTS dentro de RRHH (jefe de obra, función 12)

- **En contra.** Son operación diaria de obra (Res. SRT 61/23), con firma del capataz y de HyS, verificación del andamio y control de viento.
- Si entran en RRHH, el módulo crece sin control y queda atado al calendario de Seguridad e Higiene.
- La directora de RRHH opina lo mismo.
- **Posición final:** queda fuera de RRHH. Es un módulo de SyH o parte del rediseño de partes, con su propia decisión de JS. RRHH solo lee las constancias.

### 2. El alcance de la etapa 1 del jefe de obra

- **Lo que propone:** etapa 0 (legajo, tipos de documento, subida de archivos, cron) más etapa 1 (pasaporte, bloqueo, paquete, EPP, alta y baja).
- **El problema:** suma entre seis y ocho funciones de tamaño M y supera los dos meses al ritmo actual. No es entregable, y RRHH compite con Sistemas y con el rediseño de partes.
- **Posición final:**
  - **Etapa 1:** ficha, documentos con archivo y vencimiento, semáforo y paquete por comitente.
  - **Etapa 2:** EPP y recibos juntos, porque comparten la misma pieza: el token por documento, la firma y el PDF con hash. Se construye una sola vez y se usa dos veces. Comunicados entran en esta misma etapa.

### 3. Bloqueo duro o advertencia

- **Las posturas:** la directora de RRHH quiere bloqueo blando; el jefe de obra, bloqueo duro para altura; yo había propuesto advertencia.
- **Mi objeción al bloqueo duro desde el día uno:** con la carga inicial incompleta, un apto no cargado frena a gente que sí lo tiene vigente.
- **Posición final:**
  - Advertencia con registro de quién la pasó por alto mientras la carga de aptos no llegue al 100 % de la gente de altura.
  - Cuando llegue, bloqueo duro solo para altura sin apto vigente. Lo puede levantar únicamente HyS o JS, y queda registrado.

### 4. Asistencia hacia `x_parte_diario` como imprescindible (jefe de obra)

- **Coincido en el valor:** saca carga diaria a Juan Pablo.
- **Pero no es de RRHH:** es la fase 2 de la Hoja del día y escribe en la fuente con la que se liquida.
- **Posición final:** va por su propio carril, sin bloquear a RRHH. La prioridad la deciden Juan Pablo y JS; si dan el ok, puede adelantarse.

### 5. Recibos en la etapa 3 (jefe de obra)

- **En contra.** Según las reseñas de Humand, muchos usan la app "para firmar los recibos nomás". El recibo es lo que lleva a todos a abrir el canal todos los meses, y el piloto de 72 horas mide de verdad cuánto llega Telegram.
- **Posición final:** etapa 2, con la condición de que el contador confirme el formato del PDF.

### 6. Alta y baja como imprescindible con "sin todo en verde no sale a obra"

- Ese bloqueo ya lo da el pasaporte, así que repetirlo duplica la regla.
- El checklist tiene sentido por el plazo de 48 horas del Fondo de Cese, aunque ese dato solo está en fuentes secundarias.
- **Posición final:** checklist de tamaño S en la etapa 3, sin un bloqueo propio.

## Qué sobra

- **Registro de capacitaciones como función aparte** (aparece en las dos propuestas). Es un tipo de documento con vencimiento y ya entra en la función de documentos.
- **Reconocimiento como función.** Es una línea dentro de un comunicado, no software.
- **Tablero de RRHH para JS como entregable aparte.** Salen tres contadores de las mismas tablas; se suma a la ficha cuando haya datos.
- **Mi asistente con IA.** Lo retiro. Un botón "¿cuántos días me quedan?" en el bot resuelve lo mismo sin IA.

## Qué falta en los tres

1. **Medir la cobertura de Telegram como tarea de la etapa 0, no como riesgo.** Los tres lo nombramos y nadie lo puso en el plan, y todo lo de obra depende de ese número.
2. **El costo de mantener.** Nadie lo estimó, y hay cuatro frentes:
   - **Almacenamiento:** 10 años de PDF, con respaldo en Storage.
   - **Acceso de solo lectura para la ART** a las constancias de EPP, que la Disp. 3/22 exige.
   - **Reglas laborales como parámetros con historial:** cambiaron dos veces en 2026.
   - **WhatsApp Cloud,** si Telegram no alcanza: cuesta por conversación.
3. **La comparación de compra no está completa.** Los tres repetimos "US$ 2.000 a 5.000 por año" sin verificar, y nadie miró los proveedores locales que hacen solo recibo digital.
   - Hay que pedir dos cotizaciones por escrito: a Humand para recibos y vacaciones, y a uno de esos proveedores.
   - Con eso, la decisión se toma después de que conteste el contador, no antes.
4. **El link se puede reenviar.** Para firmar el recibo hace falta un segundo factor: los últimos dígitos del DNI o el PIN del pañol. Solo lo planteé yo.

## Plan resultante

| Etapa | Contenido |
|---|---|
| **0** | RLS, módulo `rrhh` con `exigeExplicito`, sync de la oficina, dueño del módulo nombrado, cobertura de Telegram medida y respuestas del contador y la ART |
| **1** | Ficha, documentos con vencimiento y semáforo, paquete por comitente, advertencia de altura |
| **2** | Pieza de firma, EPP, recibos en paralelo con el papel y comunicados |
| **3** | Vacaciones, aviso de ausencia, bloqueo duro de altura, alta y baja, cumpleaños |
| **4** | Pedidos, pulso y "qué hago si" |
| **Carriles aparte** | Asistencia en Odoo (decide Juan Pablo) y PTS y charla (módulo de SyH) |

---

# 3. Propuesta de consenso (antes de la auditoría)

*Esta es la versión que revisó la auditoría. La versión final, corregida, es [`propuesta.md`](./propuesta.md).*

# Módulo de RRHH para AndamiosOS: propuesta de consenso del panel

*Moderación del panel (Directora de RRHH de pymes, Jefe de obra y SyH, Arquitecto de producto). 17/10/2026. Se basa en los cuatro informes de investigación, las tres propuestas y las tres réplicas.*

---

## 1. Resumen

1. **No se compra Humand.** Armamos un módulo de RRHH chico dentro de AndamiosOS. Lo apoyamos en lo que ya funciona: `hr.employee` de Odoo, la Hoja del día, el bot de Telegram, el link con token `/h/`, el kiosco del pañol con PIN y la firma con PDF de Permisos.
2. **Lo primero es tener los papeles en orden, no la "experiencia del empleado":**
   - una ficha única por persona, de oficina y de obra;
   - documentos con archivo y vencimiento;
   - la carpeta por comitente;
   - que nadie suba a trabajar en altura sin apto vigente.
3. **Después, lo que el operario hace desde el celular sin cuenta ni contraseña:** firmar el recibo, firmar la entrega de EPP, confirmar comunicados con "Entendido", avisar "hoy no voy" y pedir vacaciones.
4. **Antes de escribir código hay que cumplir cuatro condiciones:**
   - nombrar a la persona de administración que opera el módulo;
   - cerrar la RLS abierta de `personal`, `documentos` y `fichadas`;
   - medir cuántos operarios tienen Telegram vinculado;
   - tener las respuestas del contador (formato de los recibos, validez de la firma, convenio de la oficina) y de la ART (cada cuánto se renueva el apto de altura).
5. **Quedan fuera:** el muro, el chat, la evaluación 360, el LMS, los puntos y canjes, la fichada con selfie y el PTS o la charla diaria (son de SyH, otro módulo). La asistencia que se escribe en Odoo va por un carril aparte que deciden Juan Pablo y JS.

---

## 2. Comprar, construir o combinar

| Opción | Costo | A favor | En contra |
|---|---|---|---|
| **Humand completo** | **No verificado.** El precio no es público. El único piso es "desde US$4 por usuario por mes" y sale de extractos de buscador de Capterra, sin confirmar. Para 40 personas da unos US$1.900 por año. La estimación del analista para los módulos de RRHH va de US$2.900 a 4.800 por año. No se sabe si hay mínimo, en qué moneda cobran, el IVA ni el costo de los SMS. | Producto maduro. Recibos con PDF sábana cortado por CUIL, vacaciones con plantilla argentina, onboarding. | Pide Android 10 o más. La app de iOS pesa unos 187 MB (versión 4.4.4); el dato de 49 MB del centro de ayuda está desactualizado y el peso en Android no se pudo verificar. Sin modo offline salvo el Kiosk. Sin WhatsApp ni Telegram. Sin Odoo. Sin alertas de vencimiento. Sin pasaporte de obra. Sin confirmación de lectura obligatoria. La geocerca va por "sede" fija. El organigrama acepta un solo jefe por persona. Las reseñas de App Store se quejan del login, de la lentitud y de recibos que no abren. No hay casos publicados de menos de 100 empleados. |
| **Construir en AndamiosOS** | Horas de JS y Claude, que compiten con Sistemas y con el rediseño de partes. Mantenimiento: guardar PDF durante 10 años, reglas laborales como parámetros con historial, acceso de solo lectura para la ART y, quizás, WhatsApp Cloud con costo por conversación. Nadie lo cuantificó en plata. | Reusa piezas que ya están en producción. Llega por Telegram y por link liviano, funciona con poca señal y se integra con la Hoja del día, Habilitaciones y el pañol. Cubre lo que Humand no tiene: vencimientos, carpeta por comitente, EPP trazable y bloqueo de altura. | Es trabajo propio y de largo plazo. El riesgo es que se muera si nadie lo opera. |
| **Combinación** | A definir con cotizaciones. | Si el sistema de sueldos del contador ya trae portal de recibo digital, puede ser el camino más barato para los recibos. | Agrega otro lugar donde mirar. Nadie investigó proveedores locales que hagan solo recibo digital. |

**Recomendación del panel:**
- **Construir.** Para los recibos, decidir recién cuando conteste el contador.
- **En la etapa 0, pedir dos cotizaciones por escrito:** una a Humand, solo recibos y vacaciones, y otra a un proveedor local de recibo digital. A ese proveedor todavía no lo identificamos.
- **Plan B:** si a los 6 meses de arrancar no hay recibos firmados funcionando, se contrata lo externo solo para recibos.

---

## 3. Usuarios y canales

| Usuario | Quién es | Canal | Qué hace en RRHH |
|---|---|---|---|
| **Operario de obra** (montador, ayudante) | ~30 personas bajo UOCRA. Celular, muchas veces Android de gama baja, datos limitados, sin mail. | **Bot de Telegram**, el mismo de la Hoja del día y con un solo menú. **Link con token por documento o pedido.** **Kiosco del pañol** con PIN o QR si no tiene celular. Si no tiene Telegram, wa.me manual desde la oficina. | Firma el recibo y la entrega de EPP, confirma comunicados, avisa "hoy no voy", pide vacaciones, mira "Mis papeles" (también sin señal). |
| **Capataz** | Responsable de la cuadrilla. A veces es el "responsable de la tarea en altura". | Link del capataz y bot. **Regla del minuto:** ninguna acción diaria le puede llevar más de un minuto ni ir sin datos precargados. | Pide en nombre de un operario, opina sobre las vacaciones (no las aprueba), avisa un accidente. Ve solo "apto / no apto / vence", nunca un diagnóstico. |
| **Chofer y pañol** | Obra y depósito. | Bot y kiosco. | El pañol entrega EPP con firma en el kiosco. El chofer tiene el registro de conducir en su pasaporte. |
| **Planificador** | Arma la Hoja del día. | Web. | Ve advertencias o bloqueos de altura al asignar. Ve los "hoy no voy". Aprueba vacaciones de obra junto con JS. |
| **Operador de RRHH** (administración, a nombrar) | Dueño del módulo. | Web, campanita y Slack. | Mantiene fichas y vencimientos, sube los recibos, arma la carpeta por comitente, maneja altas y bajas. Ve salud y sueldos solo si JS lo decide (pregunta 4). |
| **Personal de oficina** | ~15 personas. Convenio a confirmar (¿Comercio 130/75?). Les toca el FAL desde el 01/11. | **Web de AndamiosOS y campanita**, con la sesión que ya tienen. | Lo mismo que obra pero desde la web: recibos, vacaciones, comunicados, su ficha. **Tiene que pesar lo mismo que obra en la maqueta.** |
| **JS** | Dueño y director. | Web y campanita. Aviso el día anterior a cada cumpleaños. | Publica comunicados (con audio grabado por él), aprueba vacaciones de la oficina y las de obra junto con el planificador, levanta un bloqueo de altura, mira el tablero. |
| **Juan Pablo** | Sistemas. Hoy carga `x_parte_diario`. | Web. | Carril aparte: asistencia precargada (sección 4.H). |
| **HyS** (¿interno o externo?) | Seguridad e higiene. | Web. | Levanta un bloqueo de altura. Recibe alertas de accidente. Sus constancias de capacitación alimentan el pasaporte. |
| **ART** | Externa. | Acceso de solo lectura a las constancias de EPP (lo exige la Disp. GP SRT 3/2022). | Audita. |

**Reglas que valen para todos los canales de obra:**
- Nada se manda después de las 21 h ni los domingos, salvo una emergencia.
- Ningún audio ni video se reproduce solo.
- Las pantallas son HTML livianas y el PDF baja solo si la persona lo pide.

**Para la maqueta:**
- **Dos recorridos con el mismo peso:**
  - obra: el chat del bot y los links livianos, con tema claro, alto contraste, sin señal, y el kiosco;
  - oficina: la web de AndamiosOS, con su sistema de diseño (DM Sans, primario coral ABA, tema oscuro por defecto).
- **Más una vista del operador de RRHH** con vencimientos, carpeta por comitente y firmas pendientes.

---

## 4. Funciones

Prioridad: **I** = imprescindible, **C** = conviene, **D** = después. Esfuerzo: **S** = días, **M** = 1 a 2 semanas, **L** = 3 semanas o más.

### A. Base

**A1. Ficha única de persona**
- **Inspiración Humand:** Legajo digital.
- **Usuarios:** operador de RRHH y JS. El operario la ve en "Mis papeles" (D1).
- **Cómo se usa:**
  - una ficha por persona, de oficina y de obra, anclada en `hr.employee`;
  - campos: contacto, CUIL, fecha de ingreso y de nacimiento, convenio, categoría, jefe (sale del organigrama), si es responsable de la tarea en altura (designación y capacitación, Res. SRT 61/23) y documentos;
  - salud, sueldos y sanciones van en secciones con `exigeExplicito`.
- **Prioridad / esfuerzo:** I, M.
- **Reutiliza:** el sync de Odoo (`sync-odoo.ts`) ampliado a la oficina y a más campos, `personal` y `user_profiles` vinculados, el organigrama y `audit_log`.

**A2. Permisos y privacidad**
- **Inspiración Humand:** roles y permisos.
- **Cómo se usa:**
  - módulo `rrhh` en `acceso.ts`;
  - RLS por permiso o RPC `SECURITY DEFINER`, con el mismo patrón que Organigrama y Hoja del día;
  - cerrar la RLS `USING (true)` de `personal`, `documentos` y `fichadas`.
- **Prioridad / esfuerzo:** I, S.
- **Reutiliza:** `acceso.ts`, `exigeExplicito` y el patrón de Dirección › Socios.

### B. Papeles de obra y habilitación

**B1. Documentos con archivo, vencimiento y semáforo**
- **Inspiración Humand:** ninguna. Humand no avisa vencimientos.
- **Usuarios:** operador de RRHH y capataz (solo el estado).
- **Cómo se usa:**
  - subida real del archivo;
  - tipos nuevos: apto de altura, registro de conducir, curso con entidad, preocupacional, constancia de alta en ARCA;
  - un cron recalcula el estado y avisa 30 y 7 días antes por campanita y Slack, y a la persona por Telegram;
  - **las capacitaciones son un tipo de documento**, con entidad, firma de asistencia y vencimiento;
  - las **sanciones** son un tipo restringido que solo guarda la constancia; se notifican por carta documento, nunca por bot.
- **Prioridad / esfuerzo:** I, M.
- **Reutiliza:** `documentos`, `file-upload.tsx`, buckets privados con URL firmada, `archivo-seguro.ts`, `actualizar_estado_documentos()` (existe y nadie la llama) y `/api/alertas/barrido`.

**B2. Carpeta por comitente (pasaporte de obra)**
- **Inspiración Humand:** ninguna.
- **Usuarios:** operador de RRHH, Habilitaciones y comercial.
- **Cómo se usa:**
  - un botón desde Habilitaciones arma un ZIP o un link con los PDF vigentes;
  - **distingue documentos de la empresa** (F.931 y su pago, certificado de la ART con nómina, cláusula de no repetición, seguro de vida, certificado del IERIC) **de los de la persona** (apto, cursos, EPP);
  - sin los de la empresa, la carpeta no alcanza para entrar a obra.
- **Prioridad / esfuerzo:** I, M.
- **Reutiliza:** Habilitaciones (la Nómina ART aparece en el 82 % de las obras) y la cuadrilla asignada desde Cuadrillas y la Hoja del día.

**B3. Habilitación persona-tarea en la Hoja del día**
- **Inspiración Humand:** ninguna.
- **Usuarios:** planificador.
- **Cómo se usa:**
  - al asignar a alguien a una tarea en altura se controla el apto vigente, la capacitación de altura y, desde la etapa 2, el arnés asignado vigente;
  - también se controla que la cuadrilla de altura tenga un responsable designado;
  - arranca como **advertencia con registro** y pasa a **bloqueo duro** cuando la carga inicial esté completa (ver el debate).
- **Prioridad / esfuerzo:** I, S.
- **Reutiliza:** Hoja del día y Cuadrillas.

### C. Firma y documentos del operario

**C0. Pieza común de firma**
- **Inspiración Humand:** Documentos y firma.
- **Cómo se usa:**
  - un token **por documento o pedido** (no el diario);
  - **segundo factor: el PIN del pañol**, y los últimos 3 dígitos del DNI solo si la persona todavía no tiene PIN;
  - firma con el dedo y PDF con hash, fecha y hora, DNI y constancia al pie;
  - se construye una vez y se usa en C1, C2, la constancia de vacaciones y el reglamento.
- **Prioridad / esfuerzo:** I, M.
- **Reutiliza:** `firma-pad.tsx`, `documentos-firmados.ts`, el patrón de `/permiso/[token]` y `pan_credenciales`.

**C1. Recibos de sueldo firmados**
- **Inspiración Humand:** Documentos.
- **Usuarios:** todos. Los sube el operador de RRHH.
- **Cómo se usa:**
  - se sube el PDF sábana del contador y el sistema lo corta por CUIL;
  - aviso por Telegram y link;
  - firma conforme o en disconformidad, con un campo de texto;
  - **siempre se puede descargar, aunque no esté firmado** (Humand no lo permite y no lo copiamos);
  - recordatorio a quien no firmó y conservación por 10 años;
  - la oficina firma desde la web; quien no tiene celular, en el kiosco;
  - **piloto en paralelo con el papel** (3 meses), midiendo cuántos firman en 72 h.
- **Prioridad / esfuerzo:** I, M. Depende de que el contador confirme el formato.
- **Reutiliza:** C0, `pdf-lib` y el bot de Telegram.

**C2. Constancia digital de entrega de EPP**
- **Inspiración Humand:** ninguna.
- **Usuarios:** pañol y operario. La ART con acceso de solo lectura.
- **Cómo se usa:**
  - en el kiosco: PIN o QR, ítems con talle, marca, certificación y fecha, y firma en pantalla;
  - contenido de la Disp. GP SRT 3/2022;
  - **QR por pieza** de EPP de altura, con vida útil e inspecciones (Res. 61/23);
  - el PDF va a la ficha.
- **Prioridad / esfuerzo:** I, M. Es la fase 2 del pañol.
- **Reutiliza:** el kiosco, `pan_vales`, `pan_movimientos` e insumos con variantes.

**C3. "Mis papeles"**
- **Inspiración Humand:** Perfil.
- **Usuarios:** operario.
- **Cómo se usa:**
  - en el link: semáforo de su apto, cursos, EPP, recibos y saldo de vacaciones (desde la etapa 3);
  - **queda guardado en el celular** para mostrarlo en el portón de la obra;
  - botón "avisar un dato mal".
- **Prioridad / esfuerzo:** C, S.
- **Reutiliza:** el service worker de `/h/` y el alto contraste.

### D. Ausencias y licencias (siempre ampliando `hd_ausencias`, sin otra tabla)

**D1. "Hoy no voy"**
- **Inspiración Humand:** adjunto obligatorio en licencias.
- **Usuarios:** obra y oficina.
- **Cómo se usa:**
  - botón en el bot con el motivo en botones;
  - **se pide el certificado médico electrónico en PDF** (plataforma ReNaPDiS) y se registran la matrícula y la plataforma; la foto del papel queda solo como excepción;
  - entra como "a confirmar" y lo ve el planificador;
  - el capataz ve solo "ausente / enfermedad".
- **Prioridad / esfuerzo:** I, S.
- **Reutiliza:** `hd_ausencias` (se le agrega el estado), la API de ausencias (ya acepta el módulo `personal`), el bot y la subida de archivos por token.

**D2. Vacaciones y licencias con saldo**
- **Inspiración Humand:** Vacaciones y permisos (plantilla argentina, pedir en nombre de otro).
- **Usuarios:** todos.
- **Cómo se usa:**
  - el saldo sale de la antigüedad según el art. 150 de la LCT, como **parámetro con historial**;
  - pedido por bot, link o web; el capataz o el planificador pueden pedir en nombre de otro;
  - **en obra aprueban el planificador o JS**, y el capataz solo pide u opina; **en la oficina aprueban el jefe directo o JS**;
  - **el motivo de rechazo se le muestra al empleado**;
  - constancia de aviso con 30 días de anticipación, firmada con C0;
  - botón "¿cuántos días me quedan?" en el bot;
  - sugerencia de turnos por cuadrilla para la temporada de 1/10 a 30/04.
- **Prioridad / esfuerzo:** I, M.
- **Reutiliza:** `hd_ausencias`, el organigrama y C0.

### E. Comunicación

**E1. Comunicados con "Entendido" nominal**
- **Inspiración Humand:** Muro y Novedades importantes, mejorado: Humand no tiene confirmación obligatoria.
- **Usuarios:** publican JS y el operador de RRHH; reciben todos.
- **Cómo se usa:**
  - alcance: todos, oficina, obra, una cuadrilla o una persona (con la lógica Y/O de Humand);
  - obra: Telegram con botón; oficina: campanita; quien no tiene celular, el kiosco;
  - **audio opcional grabado por JS o el capataz, nunca sintético**;
  - tablero de quién no leyó, con reenvío;
  - solo para lo importante: seguridad, horarios, feriados, pagos, convenio;
  - **se usa para cuidar, no para sancionar**.
- **Prioridad / esfuerzo:** I, S–M.
- **Reutiliza:** el bot (registra envío y respuesta), `alertas` y `alertas_lecturas`.

**E2. Cumpleaños y aniversarios**
- **Inspiración Humand:** Cumpleaños, con el ejemplo "Operativos vs Administrativos".
- **Usuarios:** todos.
- **Cómo se usa:** saludo del bot con un texto para obra y otro para oficina, y **aviso a JS el día anterior** para que llame.
- **Prioridad / esfuerzo:** C, S.
- **Reutiliza:** el cron, el bot y la fecha de nacimiento que trae el sync.

### F. Ciclo de vida y seguridad

**F1. Checklist de alta y de baja**
- **Inspiración Humand:** Onboarding, simplificado.
- **Usuarios:** operador de RRHH.
- **Cómo se usa:**
  - **alta:** preocupacional, constancia de ARCA, nómina de la ART, inducción firmada, EPP, credencial del pañol, Telegram vinculado y reglamento firmado. Solo bloquea lo legal, y eso lo hace el pasaporte (B3);
  - **baja:** devolución de EPP y herramientas, acreditación del Fondo de Cese **dentro de las 48 h** (dato de fuente secundaria) y certificado del art. 80.
- **Prioridad / esfuerzo:** C, S.
- **Reutiliza:** el pañol (saldos por persona) y B1.

**F2. Aviso de accidente (versión mínima)**
- **Inspiración Humand:** ninguna.
- **Usuarios:** capataz, HyS y oficina.
- **Cómo se usa:**
  - botón con quién, dónde, foto y qué pasó;
  - alerta inmediata a HyS y a la oficina (Slack #syh), checklist de la denuncia a la ART (Dec. 717/96) y el teléfono de la ART a mano;
  - **vive en Incidentes**, que hay que vincular a `personal`; la ficha lo muestra y la licencia ART va a D.
- **Prioridad / esfuerzo:** I, S–M.
- **Reutiliza:** Incidentes (prototipo), Slack y el link del capataz.

### G. Después

**G1. Pedidos a RRHH**
- **Inspiración Humand:** Gestión de servicios.
- **Cómo se usa:** certificado laboral, cambio de datos (CBU, domicilio) y reposición de ropa por botones del bot, con una bandeja para el operador. **Los adelantos esperan a que JS defina el tope y quién aprueba.**
- **Prioridad / esfuerzo:** C, S–M.
- **Reutiliza:** el patrón de la bandeja de Sistemas.

**G2. "Qué hago si…"**
- **Inspiración Humand:** Librería.
- **Cómo se usa:** fichas cortas con texto grande y audio: reglamento, resumen del convenio, ART, accidente, EPP y teléfonos.
- **Prioridad / esfuerzo:** D, S.
- **Reutiliza:** el link y el bot.

**G3. Pulso anónimo semestral**
- **Inspiración Humand:** People Experience, recortado.
- **Cómo se usa:**
  - 3 a 5 preguntas más eNPS;
  - resultados de la empresa entera, y obra contra oficina **solo con 8 respuestas o más por grupo**;
  - nunca por cuadrilla.
- **Prioridad / esfuerzo:** D, S.

**G4. Tablero para JS**
- **Inspiración Humand:** ninguna (Insights mide el uso de la app).
- **Cómo se usa:** no es un entregable aparte. Es una vista del tablero de vencimientos con dotación, ausentismo del mes, vencimientos y firmas pendientes.
- **Prioridad / esfuerzo:** D, S.

### H. Carriles aparte, que no bloquean a RRHH

- **Asistencia precargada que escribe `x_parte_diario`** (fase 2 de la Hoja del día):
  - el capataz confirma presentes con un toque;
  - lo deciden Juan Pablo y JS;
  - si se aprueba, un mes con las dos cargas a la vez comparando diferencias;
  - el prototipo de Fichadas **se descarta**: no identifica a quién ficha y está atado a la tabla vieja `obras`.
- **PTS diario, charla de 5 minutos y verificación del andamio** (Res. SRT 61/23): van en un módulo de SyH o en el rediseño de partes. RRHH solo lee de ahí las constancias por persona.

### Debates sobre funciones

- **Debate: bloqueo de altura.**
  - RRHH proponía bloqueo blando y en la réplica adoptó el bloqueo duro solo para altura.
  - Obra/SyH pedía bloqueo duro: a las 6:30 una advertencia se saltea con un clic, y si hay un accidente prueba que la empresa sabía.
  - Producto pedía advertencia hasta completar la carga, para no frenar a gente con el apto vigente pero sin cargar.
  - **Queda:** advertencia con registro mientras la carga de aptos de quienes trabajan en altura no llegue al 100 %. Desde ahí, **bloqueo duro**, que solo pueden levantar JS o HyS, con nombre y motivo registrados; el planificador no.
  - **El bloqueo duro abarca** altura sin apto vigente y, por recomendación de RRHH, a quien no tenga alta en ARCA o preocupacional, que son condiciones legales previas al primer día. Lo demás vencido genera advertencia.
  - **Porque** las tres posturas coinciden en el destino y solo difieren en cuándo se prende. Atarlo a la calidad de los datos resuelve las dos objeciones.

- **Debate: capacitaciones.**
  - RRHH y Obra/SyH la querían como función propia.
  - Producto decía que es un tipo de documento.
  - **Queda como tipo de documento** con entidad, firma y vencimiento, **porque** el valor está en el vencimiento y el pasaporte, no en dictar cursos.

- **Debate: audio de los comunicados.**
  - RRHH proponía voz sintética (ElevenLabs) y en la réplica la retiró.
  - Obra/SyH y Producto preferían la voz grabada por una persona.
  - **Queda grabado por una persona, porque** el operario presta atención cuando reconoce la voz, y una voz sintética que imite a JS confunde.

- **Debate: segundo factor para firmar.**
  - Producto proponía los últimos 3 dígitos del DNI.
  - Obra/SyH, el PIN del pañol.
  - **Queda el PIN del pañol**, y el DNI solo como respaldo, **porque** el operario ya lo conoce y los dígitos del DNI los saben otros.

- **Debate: quién aprueba las vacaciones de obra.**
  - RRHH y Producto proponían "el jefe directo según el organigrama".
  - Obra/SyH decía que el capataz no ve las otras cuadrillas y queda mal parado con su gente.
  - **Queda:** el planificador o JS aprueban y el capataz opina, **porque** la decisión es de cobertura de obra, no de jerarquía.

- **Debate: seguro de vida y nómina ART.**
  - Obra/SyH los cargaba por persona.
  - RRHH decía que son documentos de la empresa con la nómina adjunta.
  - **Queda como documento de la empresa** dentro de la carpeta por comitente, **porque** se emiten una vez para todos.

- **Debate: asistente con IA.**
  - Producto lo proponía (esfuerzo M) y lo retiró.
  - Obra/SyH y RRHH decían que alcanza con un botón.
  - **Queda el botón "¿cuántos días me quedan?"**, sin IA.

- **Debate: reconocimiento.**
  - Las tres propuestas lo tenían.
  - Obra/SyH advirtió que premiar a la "cuadrilla del mes" termina premiando la velocidad y empuja a saltearse pasos de seguridad.
  - **Queda fuera como software.** Si JS lo menciona en un comunicado, el criterio es seguridad y orden, nunca rapidez.

---

## 5. Lo que se descarta de Humand

| Función de Humand | Por qué no |
|---|---|
| Muro social, grupos, chat, videollamadas, noticias tipo revista | Con 40 personas, WhatsApp y Telegram ya cumplen ese papel. Otro lugar para mirar dispersa. Lo único que tomamos es el comunicado con confirmación (E1). |
| Transmisiones en vivo, eventos con RSVP, marketplace, grupos multiempresa | Exagerado para el tamaño de ABA. |
| Reconocimientos con puntos y canje | Administrar un catálogo de premios para 40 personas no tiene sentido, y en obra puede premiar la velocidad. |
| Evaluación 360, 9-box, calibración, objetivos | Es burocracia de multinacional. Si JS quiere, una charla anual con una ficha de una página. |
| Aprendizaje (cursos, rutas, certificados) | La capacitación se da en obra. El sistema guarda la constancia (B1). |
| Fichada con selfie, geocerca por sede, Kiosk facial | Las obras cambian, la selfie genera rechazo (lo dicen las reseñas) y la asistencia sale de la Hoja del día y de Odoo. |
| Turnos, cuadrantes, bolsa de horas | Lo cubren Cuadrillas y la Hoja del día. La bolsa de horas además exige acuerdo escrito (art. 197 bis). |
| Clima con mapa de calor y comparativas | Con cuadrillas de 3 a 5 personas no hay anonimato. |
| Insights, traducción, "mejorar con IA", Sammy | No aportan a esta escala. |
| Reclutamiento | Se contrata por recomendación. |
| App nativa para instalar | El link y el bot andan con poca señal y en equipos viejos. |
| Recibo que no se puede descargar sin firmar; motivo de rechazo oculto | Los mejoramos a propósito: el recibo es del trabajador y el empleado tiene que saber por qué le rechazaron un pedido. |

**Lo que sí copiamos como patrón:**
- el usuario identificado por DNI o legajo, sin mail;
- la segmentación Y/O;
- pedir en nombre de otro;
- el bot de cumpleaños con texto distinto por segmento;
- el "visto por" nominal;
- la campaña de lanzamiento con métricas de activación (para nosotros, firmas en 72 h y "Entendido").

---

## 6. Normativa: qué cubre el módulo y qué no

Lo que no está confirmado lo marco. Ninguna de estas lecturas reemplaza al contador ni a un abogado laboral.

**Cubre** (guarda la trazabilidad y controla vencimientos):

| Obligación | Norma | Cómo la cubre | Estado |
|---|---|---|---|
| Constancia de entrega del recibo con firma electrónica o digital; versión digital con la misma validez | Ley 27.802, arts. 38 y 40 (arts. 139 y 143 LCT) | C1 | Ley verificada. **No confirmado:** si la Res. 346/19, que pedía firma digital, sigue vigente. Por eso, papel en paralelo. |
| Conservación de los recibos durante 10 años | Art. 143 LCT, Dec. 407/26 | Storage con respaldo | Verificado |
| Aviso de vacaciones por escrito con 30 días; tramos de 7 días o más | Art. 154 LCT reformado | D2 y una constancia en PDF manual mientras tanto | Verificado. Días por antigüedad (art. 150): texto clásico, no verifiqué si la 27.802 los tocó. |
| Aviso de enfermedad el primer día; certificado electrónico ReNaPDiS / REFEPS | Arts. 209 y 210 LCT, Dec. 407/26 | D1 | Verificado. No hay verificador público confirmado. |
| Constancia de entrega de EPP, digital admitida, con acceso para la ART | Res. SRT 299/11, Disp. GP SRT 3/2022 | C2 | Verificado |
| Apto psicofísico vigente para altura; responsable de la tarea en altura designado y capacitado; EPP de altura trazable e intransferible | Res. SRT 61/23 | B1, B3, C2 y A1 | Verificado. **La periodicidad del apto no está definida:** a fijar con la ART. |
| Preocupacional antes del inicio | Res. SRT 37/10 | B1, B3 y F1 | Verificado |
| Nómina del personal actualizada en el Programa de Seguridad; papeles que pide el comitente | Res. SRT 51/97 y pliegos | B2 | Verificado en lo general; los pliegos varían |
| Acreditación del Fondo de Cese dentro de las 48 h del cese | Ley 22.250, art. 17 | F1 | Fuente secundaria |
| Certificado del art. 80 | Art. 80 LCT, RG ARCA 5848/26 | F1 (constancia) | Fuente secundaria |
| Datos de salud como datos sensibles | Ley 25.326 | A2, `exigeExplicito` y el capataz que ve solo el estado | Criterio del panel, no investigado a fondo |

**No cubre** (es del contador, de SyH o de canales formales):
- Liquidación, F.931, aportes UOCRA y de Comercio, FAL desde el 01/11/2026 (solo oficina) y depósitos del Fondo de Cese. El módulo solo guarda constancias.
- Alta y baja en ARCA, y la transición del IERIC a ARCA (Dec. 407/26, todavía en adecuación). El dato de la credencial IERIC queda como opcional.
- **Libros laborales:** ya no hacen falta (art. 52 LCT y Dec. 407/26). El módulo no lleva ningún "libro".
- PTS diario, charla de 5 minutos, verificación del andamio, control de viento, aviso de obra a la ART, Programa de Seguridad y Legajo Técnico. Son de SyH (carril H).
- **La denuncia del accidente ante la ART:** F2 solo alerta y guía.
- **Notificación fehaciente** de sanciones o despidos: va por carta documento o telegrama, nunca por el bot.

---

## 7. Etapas

Los plazos son aproximados, al ritmo actual de JS y Claude, y compiten con Sistemas y con el rediseño de partes (pregunta 9).

**Etapa 0, la base (1 a 2 semanas, poco código)**
- Nombrar al operador de RRHH y medir las horas que hoy le lleva el trabajo.
- Cerrar la RLS y crear el módulo `rrhh` con `exigeExplicito` (A2).
- Ampliar el sync a la oficina y a fecha de ingreso, nacimiento, CUIL y `parent_id`, verificando si Odoo tiene esos datos. Si no los tiene, importarlos desde el sistema del contador; no tipearlos.
- **Medir la cobertura de Telegram**: cuántos operarios lo tienen vinculado.
- Contador: quién liquida, formato del PDF y si trae el CUIL legible, si su sistema ya tiene portal de recibo digital, validez de la firma electrónica, convenio de la oficina y la exportación de datos.
- ART: periodicidad del apto de altura y de los exámenes periódicos.
- Pedir las dos cotizaciones (sección 2).
- **Ya:** constancia de aviso de vacaciones en PDF para firmar a mano en esta temporada.

**Etapa 1, papeles en orden (unas 4 a 6 semanas)**
- A1 ficha única.
- B1 documentos con vencimiento y semáforo.
- B2 carpeta por comitente.
- B3 habilitación de altura, en modo advertencia.
- Carga inicial de aptos y documentos, en paralelo y a mano.

**Etapa 2, lo que toca al operario (unas 6 a 8 semanas; si hace falta se divide)**
- **2a:** C0 pieza de firma, C1 piloto de recibos en paralelo con el papel (si el contador ya confirmó) y C2 EPP con QR (con el pañol).
- **2b:** E1 comunicados, C3 "Mis papeles", D1 "Hoy no voy" y F2 aviso de accidente mínimo en Incidentes.

**Etapa 3, el día a día**
- D2 vacaciones y licencias con saldo.
- F1 alta y baja.
- E2 cumpleaños.
- G1 pedidos (sin adelantos hasta que JS lo defina).
- **Prender el bloqueo duro de B3** cuando la carga de aptos esté completa.

**Etapa 4, después**
- G2 "Qué hago si…", G3 pulso semestral y G4 tablero.

**Carriles aparte:** la asistencia en `x_parte_diario` (deciden Juan Pablo y JS) y el módulo de SyH (JS le pone fecha).

Cada etapa cierra con su `docs/rrhh/handoff.md` y su `modulo.md`, como el resto de AndamiosOS.

**Debates sobre el orden**

- **Debate: carpeta por comitente.**
  - Producto la tenía en la etapa 3 y la llamaba "el mayor ahorro de horas"; en la réplica reconoció el error.
  - RRHH y Obra/SyH la querían en la etapa 1.
  - **Queda en la etapa 1, porque** la piden en el 82 % de las obras y es lo que deja a una cuadrilla en la puerta.

- **Debate: recibos.**
  - RRHH y Producto los ponían en la etapa 2.
  - Obra/SyH, en la 3, esperando al contador.
  - **Quedan en la etapa 2a, condicionados a la respuesta del contador, porque** el recibo es lo que hace que todos abran el canal cada mes y el piloto de 72 h mide la cobertura real de Telegram. Si el contador no contestó, la 2a arranca por EPP y la pieza de firma.

- **Debate: "Hoy no voy".**
  - RRHH lo quería en la etapa 1 (esfuerzo S, art. 209).
  - Obra/SyH, en la 2.
  - Producto, en la 3.
  - **Queda en la etapa 2b, porque** necesita la subida de archivos por token y el menú del bot que se arman en la 2. Además deja agregado en `hd_ausencias` el estado "a confirmar" que vacaciones reusa en la 3.

- **Debate: vacaciones.**
  - RRHH y Obra/SyH las querían en la etapa 2 porque la temporada empezó el 1/10.
  - Producto, en la 3, por la capacidad.
  - **Quedan en la etapa 3, porque** aunque entraran en la 2 llegarían tarde para el aviso de los turnos de enero. Esta temporada se resuelve con la constancia en PDF de la etapa 0, y el sistema queda para la próxima.

- **Debate: aviso de accidente.**
  - RRHH lo quería en la etapa 1, dentro de Incidentes.
  - Obra/SyH, en la 2.
  - Producto lo adoptó sin etapa.
  - **Queda en la etapa 2b, dentro de Incidentes, porque** la denuncia es inmediata y hoy depende de la memoria de alguien. Pero Incidentes hay que atarlo primero a `personal` y a las OT.

- **Debate: alta y baja.**
  - Obra/SyH las quería imprescindibles en la etapa 1, con "sin todo en verde no sale a obra".
  - RRHH y Producto, en la etapa 3 y sin bloqueo propio.
  - **Quedan en la etapa 3 como checklist S, porque** el bloqueo legal ya lo da B3, y vincular Telegram o imprimir la credencial no puede dejar a un montador en su casa.

- **Debate: asistencia.**
  - Obra/SyH la quería imprescindible.
  - RRHH, en la etapa 2 con un mes en paralelo.
  - Producto, en un carril propio.
  - **Queda en un carril aparte con el mes en paralelo, porque** escribe en la fuente con la que se liquida y la decisión es de Juan Pablo.

- **Debate: cumpleaños.**
  - RRHH lo ponía en la etapa 2.
  - Producto, en la 3.
  - Obra/SyH lo dejaba para después, aunque se podía adelantar.
  - **Queda en la etapa 3, porque** necesita las fechas de nacimiento limpias, y en la etapa 2 el recibo ya cumple el papel de hacer que la gente abra el bot.

- **Debate: pedidos.**
  - RRHH y Obra/SyH los ponían en la etapa 3.
  - Producto, en la 4.
  - **Quedan en la etapa 3 sin adelantos, porque** reusan el patrón de la bandeja de Sistemas y "cambio de datos" responde al botón "avisar un dato mal" de C3.

- **Debate: pulso.**
  - Producto lo proponía trimestral.
  - RRHH y Obra/SyH, semestral.
  - **Queda semestral, porque** con 40 personas cuatro encuestas por año cansan.
  - Sobre si hace falta: RRHH contestó a Obra/SyH ("en una familiar se habla directo") que lo que más se calla en una pyme familiar es el trato de los familiares y los favoritismos. **Se mantiene en la etapa 4.**

---

## 8. Riesgos

1. **Nadie opera el módulo.** Si no hay un dueño, en tres meses el semáforo miente, y un verde falso es peor que no tener semáforo. *Mitigación:* nombrarlo en la etapa 0 y medir horas ahorradas, no agregadas.
2. **Telegram no llega a todos.** No está medido, y todo lo de obra depende de ese número. *Mitigación:* medirlo en la etapa 0. Para quien no lo tenga: wa.me manual desde la oficina, el kiosco y el capataz como puente.
3. **Validez de la firma del recibo.** No está confirmado qué pasa con la Res. 346/19 después de la 27.802. *Mitigación:* papel en paralelo hasta que lo valide el contador o un abogado.
4. **Datos sucios o ausentes** (fecha de ingreso, nacimiento, jefe, aptos). Sin ellos no hay saldo, ni cumpleaños, ni aprobaciones, y el bloqueo frena a quien no corresponde. *Mitigación:* importar desde el contador y el bloqueo duro atado a la carga completa.
5. **Privacidad.** Hoy la RLS está abierta, y vamos a guardar datos de salud, sueldos y sanciones. *Mitigación:* la etapa 0 cierra la RLS, con `exigeExplicito` y el capataz que ve solo el estado.
6. **El link se puede reenviar.** *Mitigación:* token por documento y PIN como segundo factor.
7. **Que se sienta como control.** "Quién leyó" y los vencimientos pueden usarse para retar. *Mitigación:* uso explícito para cuidar ("te vence el apto, te sacamos turno"), horario de envío respetado y nada que se reproduzca solo.
8. **Desconfianza a firmar en el celular.** *Mitigación:* explicación en persona en el obrador, no con un comunicado, y tres meses en paralelo.
9. **Capacidad.** RRHH compite con Sistemas y con el rediseño de partes. Las etapas 1 y 2 suman varias funciones de tamaño M. *Mitigación:* dividir la etapa 2 y dejar en carriles aparte lo que no es de RRHH.
10. **Reglas que cambian.** La ley laboral cambió dos veces en 2026. *Mitigación:* saldo de vacaciones y formato del recibo como parámetros con historial, no como código fijo.
11. **Costo de mantener**, nunca cuantificado: 10 años de PDF, acceso para la ART y, quizás, WhatsApp Cloud.
12. **El PTS y la charla quedan sin dueño** si el módulo de SyH no tiene fecha. Es lo primero que pide un inspector.
13. **La comparación de compra está incompleta.** El precio de Humand no está verificado y no se relevaron proveedores locales.

---

## 9. Preguntas para JS

1. **¿Quién de administración opera RRHH?**
   *El panel recomienda* nombrar a una persona antes de arrancar y no empezar la etapa 1 sin ella.
2. **¿Construimos, o esperamos las cotizaciones para los recibos?**
   *El panel recomienda* construir todo menos los recibos, y decidir los recibos cuando contesten el contador y las dos cotizaciones. Si el sistema de sueldos del contador ya trae portal de recibo digital, evaluarlo primero. Plan B a los 6 meses.
3. **Si Telegram no alcanza, ¿qué hacemos?** Hay dos opciones:
   - WhatsApp Cloud con plantillas de Meta, con costo por conversación y la decisión de usar el número de Tomás u otro;
   - el capataz como puente más wa.me manual.

   *El panel recomienda* Telegram primero y wa.me manual para el resto. WhatsApp Cloud solo si la medición de la etapa 0 muestra que una parte grande de la obra queda afuera. Si se usa, que sea un número distinto del de Tomás, para no mezclar clientes con empleados. Eso último es criterio del panel y no se discutió en el debate.
4. **¿Quién ve salud, sueldos y sanciones?**
   *El panel recomienda* una persona de administración designada más JS, y nadie más, tampoco los familiares que trabajan en la oficina, salvo que JS lo decida por escrito. El capataz ve solo "apto / no apto / vence".
5. **¿Aceptás el bloqueo duro de altura, y también para alta en ARCA y preocupacional?**
   *El panel recomienda* que sí, que se prenda cuando la carga esté completa, que lo destraben solo JS o HyS con motivo registrado, y que lo demás quede como advertencia.
6. **¿Quién aprueba las vacaciones?**
   *El panel recomienda:* en obra, el planificador o JS, con opinión del capataz; en la oficina, el jefe directo o JS. ¿Querés que el sistema sugiera turnos por cuadrilla para la temporada de 1/10 a 30/04?
7. **¿Le ponés fecha a un módulo de SyH** (PTS, charla de 5 minutos, verificación del andamio) **y nombrás a su responsable?** HyS, ¿es interno o externo?
   *El panel recomienda* que tenga fecha propia y que no entre en RRHH.
8. **¿Juan Pablo y vos aprueban la asistencia precargada que escribe `x_parte_diario`?**
   *El panel recomienda* que sí, en un carril aparte, con un mes de doble carga comparando diferencias.
9. **¿En qué orden van RRHH, Sistemas y el rediseño de partes?**
   *El panel recomienda* hacer la etapa 0 de RRHH ya, porque cerrar la RLS es urgente igual, y definir después el orden de la etapa 1 frente a los otros frentes.
10. **Adelantos de sueldo: ¿con tope?, ¿quién aprueba?, ¿salen por el bot?**
    *El panel recomienda* no ponerlos en el bot hasta que estén definidos.
11. **¿Pedimos a la ART** que defina la periodicidad del apto de altura y confirme si ABA hace el aviso de obra y su propio Programa de Seguridad en cada obra, o se cuelga del principal?
    *El panel recomienda* que sí, en la etapa 0.
12. **¿Hacemos el pulso anónimo?**
    *El panel recomienda* que sí, semestral, solo a nivel empresa y obra contra oficina con 8 respuestas o más, en la etapa 4. Y que JS no intente adivinar quién respondió qué.

---

# 4. Auditoría

**Veredicto: aprobar con cambios mayores.** La dirección está bien: no comprar Humand entero, construir chico, papeles primero, nada de muro ni 360. Pero hay dos fallas de base que hay que corregir antes de armar la maqueta. El canal de obra se apoya en un bot de Telegram que, según el repo, todavía no está andando y que, aunque ande, se pensó para 8 a 10 personas, no para 30. Y la prioridad de la carpeta por comitente sale de leer mal el dato del 82 %.

---

## Hallazgos

### Severidad alta

**1. El canal de obra no existe hoy, ni está pensado para los montadores.**
- `docs/README.md` dice "Hoja del día… En producción (falta Telegram)".
- En `docs/equipos-del-dia/handoff.md` (estado al 12/10, líneas 47 y 452) sigue sin tildar "crear el bot (@BotFather), cargar `TELEGRAM_BOT_TOKEN`…". `.env.local` no tiene esa variable cargada. No lo verifiqué en Vercel.
- El plan era vincular solo a "capataces, choferes y el encargado del depósito". El link `/h/` también es solo para capataz y chofer.
- O sea, la frase "lo apoyamos en lo que ya funciona: el bot de Telegram" no es cierta. Además, los ~20 ayudantes y montadores que deberían firmar el recibo, confirmar comunicados y avisar "hoy no voy" no tienen ningún canal previsto.
- Hay una contradicción: la propuesta descarta Humand porque es "una app nativa para instalar", pero le pide al operario que instale Telegram, cuando el brief dice que usa WhatsApp.
- **Cambio exigido:**
  - El canal de base es el **link con token**: ahí van los botones Entendido, Firmar y Pedir. Por qué medio viaja el link es otra decisión: WhatsApp manual desde la oficina (para 45 personas es razonable, unos minutos por envío), Telegram para quien ya lo tenga, o WhatsApp Cloud.
  - No construir menús de bot como interfaz principal.
  - En la etapa 0, en lugar de "medir cuántos tienen Telegram vinculado" (la respuesta es casi seguro cero), relevar persona por persona: qué celular tiene, si tiene datos y si tiene WhatsApp o Telegram.

**2. La carpeta por comitente (B2) está priorizada con un dato mal leído.**
- `docs/habilitaciones/modulo.md` (alrededor de la línea 392) dice que el paquete **Básico, que es solo la Nómina ART, cubre el 82 % de las obras**. "+ No repetición" suma un 2 %, "+ SVO y aviso de obra" un 3 %, y el **"Completo", con EPP, capacitaciones y F.931, apenas un 1 %**.
- O sea, los papeles por persona (apto, cursos, EPP) los piden en muy pocas obras. La Nómina ART es un documento de la empresa que manda el contador.
- La frase "queda en la etapa 1 porque la piden en el 82 % de las obras" es falsa.
- **Cambio exigido:** bajar B2 a C/M. Reemplazarla en la etapa 1 por un control barato que sí cubre el 82 %: avisar si alguien de la cuadrilla asignada a la obra no figura en la última Nómina ART subida. El ZIP con los PDF por persona queda para las obras con paquete Completo.

**3. "Cerrar la RLS" (A2, esfuerzo S) rompe pantallas que hoy funcionan.**
- Varias pantallas leen `personal` desde el navegador, embebido en sus consultas. Si se restringe el SELECT, devuelven `personal: null` sin error:
  - `src/hooks/use-cuadrillas.ts:24`
  - `src/hooks/use-vehiculos.ts:28`
  - `src/hooks/use-remitos.ts:46,62,83`
  - `src/hooks/use-solicitudes-extra.ts:35,52`
  - `src/hooks/use-fichadas.ts:22`
- Hoy cualquier usuario logueado puede leer el DNI, el CUIL, el domicilio, el nacimiento y el `telegram_chat_id` (`supabase/migrations/20260330000002_rls_policies.sql:161` y `:191`).
- **Cambio exigido:** no cerrar `personal` entera. Sacar los campos sensibles a tablas nuevas de RRHH con RLS por permiso, dejar en `personal` solo nombre, apellido, puesto y activo con lectura abierta, y hacer un inventario de consumidores antes de tocar nada. El esfuerzo real es M, no S.

**4. Oficina en `hd_ausencias` choca con una decisión de JS que nadie le planteó.**
- `hd_ausencias.persona_id` apunta a `personal(id)` (`supabase/migrations/20261011000001_hoja_del_dia.sql:434`).
- JS decidió el 10/10 que "los 15 administrativos de Odoo no llevan legajo, a propósito" (`docs/equipos-del-dia/handoff.md:262`).
- Entonces D1 y D2 para la oficina, y "ampliar el sync a la oficina", revierten esa decisión sin decirlo. Además hay que verificar que la oficina no aparezca en la Hoja del día ni en el kiosco: hoy los filtra `esPersonalDeObra`, que depende de la tarea de Odoo.
- **Cambio exigido:** que sea una pregunta explícita para JS, o un ancla de persona que no sea `personal`.

**5. El bloqueo duro por preocupacional y alta en ARCA frenaría a los veteranos.**
- Los montadores con años en la empresa muy probablemente no tienen el preocupacional en un archivo cargable.
- Además, la Hoja del día no conoce el concepto de "tarea en altura": no hay ningún campo así en `src/lib/hoja-dia`. En ABA casi todo el montaje es altura, así que B3 es en la práctica "habilitación para salir a obra".
- **Cambio exigido:**
  - preocupacional y ARCA bloquean solo a las **altas posteriores a la puesta en marcha**;
  - el apto de altura se controla para todo el personal de obra;
  - el planificador tiene que poder destrabar en el momento con motivo y aviso inmediato a JS. Si a las 6:30 no hay nadie para destrabar, la gente igual va a la obra y el sistema queda desactualizado.

### Severidad media

**6. Compra contra construcción no compara lo que corresponde.**
- No hay costo de construcción en horas. Sumando las etapas 0 a 3 dan unos 4 a 5 meses de JS y Claude, contra US$2.000 a 5.000 por año de Humand. Ese número de Humand sale de un extracto de Capterra que no se pudo verificar.
- Lo que Humand no cubre (vencimientos, altura, nómina) está todo en la etapa 1. Lo que sí cubre (recibos y vacaciones) son las etapas 2 y 3, justo lo más caro de construir.
- **Cambio exigido:** comparar función por función. Que la cotización de recibos (contador, Humand o un proveedor local) sea condición de entrada de la etapa 2a, no un plan B a los 6 meses.

**7. La firma del recibo no dice quién carga con la prueba.**
- Verifiqué en el Boletín Oficial: el art. 139, según el art. 38 de la Ley 27.802, admite firma "digital o electrónica como constancia de entrega", y el art. 143 fija 2 años para lo laboral y 10 para lo previsional, con la misma validez para lo digitalizado.
- Con firma electrónica, si el trabajador la desconoce, la validez la tiene que probar ABA (Ley 25.506, art. 5; esto lo pongo de memoria, no lo verifiqué).
- **Cambio exigido:** guardar la evidencia completa (log del token, PIN validado, hora, IP o dispositivo, hash) y hacer firmar una vez en papel la adhesión al canal digital.
- Sobre "se puede descargar sin firmar": está bien, pero hay que registrar la apertura y la descarga, y saber que eso solo no es una constancia firmada. Va a bajar la tasa de firma.

**8. Hay contradicciones de privacidad.**
- El operador de RRHH corta el PDF sábana, así que ve todos los sueldos. La pregunta 4 ("nadie más que una persona y JS") tiene que asumirlo.
- C3 guarda "Mis papeles" en el celular para usarlo sin señal. Ahí solo puede ir el semáforo, **nunca los recibos ni los certificados**.
- B2 manda aptos médicos a terceros (los comitentes). Tiene que ir solo la constancia "apto", nunca el estudio, y con consentimiento.
- Falta registrar quién leyó datos sensibles: `exigeExplicito` restringe el acceso, pero no deja auditoría de lectura.
- Falta la inscripción de la base en la AAIP (Ley 25.326, art. 21; de memoria, a confirmar con un abogado).

**9. Falta lo que más trabajo le da a RRHH en una pyme: las novedades mensuales al contador.**
- Ausencias, vacaciones, licencias, ART, adelantos y altas o bajas.
- Esto se puede hacer sin escribir `x_parte_diario`: es un export.

**10. En la baja no se cortan los accesos.**
- F1 no incluye revocar el PIN y la credencial del pañol, los links, el Telegram y el usuario.

**11. Faltan los contratistas.**
- Las cuadrillas tercerizadas (por ejemplo Quintana, en `pan_personas_externas` y `hd_contratistas`) entran a obra con ABA. El comitente y la Res. SRT 61/23 les piden aptos y EPP igual.
- La propuesta no dice nada de ellos.

**12. F2, el aviso de accidente, está subestimado.**
- Incidentes es un prototipo colgado de la tabla vieja `obras`, con `personas_involucradas` como JSONB libre.
- Atarlo a `personal` y a las OT es una tarea M aparte. Va mejor en SyH que en RRHH.

### Severidad baja

**13. Sobreingeniería que conviene sacar o mover:**
- G2, G3 y G4 quedan como "solo si sobra";
- el QR por pieza de EPP va al pañol, no a RRHH;
- el acceso propio para la ART se reemplaza por un link de exportación a pedido;
- en la etapa 2b, E2 no aporta;
- en total son 19 funciones para unas 45 personas y un operador de medio tiempo que todavía no existe.

**14. El capataz ve "enfermedad".** Ya es un dato de salud. Alcanza con "ausente con aviso".

**15. El certificado del ReNaPDiS muchas veces llega como link o QR, no como PDF.** Hay que aceptar las dos formas.

**16. El segundo factor es débil.** El PIN del pañol es de 4 dígitos y no se sabe cuántos operarios lo tienen. Los "3 dígitos del DNI" como respaldo son 1.000 combinaciones conocidas por terceros. Mejor que el respaldo sea una entrega del PIN en persona.

---

## Afirmaciones a corregir

1. **"El bot de Telegram ya funciona" o "en producción".** Según `docs/README.md` y el handoff, falta configurarlo, y estaba pensado solo para capataces y choferes.
2. **"La carpeta la piden en el 82 % de las obras".** El 82 % pide solo la Nómina ART. El paquete con papeles por persona aparece en un 1 %.
3. **"WhatsApp Cloud con costo por conversación".** Desde el 1/7/2025 Meta cobra por mensaje, y las plantillas de utilidad dentro de la ventana de atención de 24 h son gratis. La tarifa exacta para Argentina no la verifiqué. Meta publica una tabla con vigencia desde el 1/4/2026.
4. **"A la oficina le toca el FAL".** El FAL es una contribución del empleador y no tiene nada que ver con el módulo. Sacarlo de la tabla de usuarios.
5. **"HyS, ¿interno o externo?".** El repo nombra a Capurro como "técnico de SyH" con legajo (`docs/equipos-del-dia/handoff.md:432`). Confirmar si es el responsable o solo un técnico.
6. **"Unas 40 personas".** Odoo tiene 30 de obra activos y 15 de oficina, o sea unas 45.
7. **"A2 es esfuerzo S".** Es M, por el hallazgo 3.
8. **"La Disp. GP SRT 3/2022" contra la "Disp. SRT GP 2/2021" en `docs/panol/modulo.md:230`.** Unificar. El informe de normativa la verificó como 3/2022.
9. **"Libros laborales: ya no hacen falta".** Agregar que no está confirmado si el Libro de Sueldos Digital de ARCA sigue siendo la vía del F.931. Es tema del contador.
10. **"Art. 197 bis", la bolsa de horas.** No lo encontré en la parte del texto de la Ley 27.802 que leí. Marcarlo como fuente secundaria.
11. **"Art. 150, días por antigüedad".** En la parte del Boletín Oficial que leí no aparece ningún cambio, pero sigue sin verificar del todo.
12. **"Res. 346/19, no confirmado".** Correcto que quede así. Una consulta del Consejo de Ciencias Económicas de Salta de 2026 dice solo que la firma del trabajador sigue siendo obligatoria. Sumar al abogado como respaldo.

**Fuentes web:**
- [Ley 27.802, Boletín Oficial](https://www.boletinoficial.gob.ar/detalleAviso/primera/339128/20260306)
- [Res. 346/2019, Abogados.com.ar](https://abogados.com.ar/resolucion-no-3462019-del-ministerio-de-produccion-y-trabajo-recibo-de-sueldo-digital/23487)
- [Consulta sobre el nuevo recibo, CPCE Salta](https://www.consejosalta.org.ar/wp-content/uploads/CONSULTA-Nuevo-Recibo-de-Sueldos.pdf)
- [Precios de WhatsApp Business, Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Precio por mensaje desde el 1/7/2025, Gallabox](https://docs.gallabox.com/pricing-and-billing-modules/new-per-message-pricing-effective-july-1-2025)
- [Precio por mensaje, Wati](https://support.wati.io/en/articles/11561662-message-based-pricing-all-you-need-to-know)

**Archivos del repo que revisé (todos dentro de `/Users/joaquin/Desktop/Proyectos/AndamiosOS/`):**
- `docs/README.md`
- `docs/equipos-del-dia/handoff.md`
- `docs/equipos-del-dia/modulo.md`
- `docs/habilitaciones/modulo.md`
- `docs/panol/modulo.md`
- `supabase/migrations/20260330000002_rls_policies.sql`
- `supabase/migrations/20261011000001_hoja_del_dia.sql`
- `src/hooks/use-cuadrillas.ts`, `use-vehiculos.ts`, `use-remitos.ts`, `use-solicitudes-extra.ts`, `use-fichadas.ts`
