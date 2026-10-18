# Módulo RRHH — propuesta

*17/10/2026. Redacción final sobre la propuesta de consenso del panel (Directora de RRHH de pymes, Jefe de obra y SyH, Arquitecto de producto), con todos los cambios que pidió la auditoría. El registro completo está en [`investigacion.md`](./investigacion.md) (los cuatro informes) y [`debate.md`](./debate.md) (propuestas, réplicas y auditoría). Qué se cambió por la auditoría y qué no, en la sección 9.*

**Convención:** lo que no está verificado lo digo. "De memoria" quiere decir que lo citó alguien del equipo sin abrir la norma. Nada de la parte legal reemplaza al contador ni a un abogado laboral.

---

## 1. Resumen

1. **No se compra Humand entero.** Armamos un módulo de RRHH chico dentro de AndamiosOS, apoyado en piezas que **sí** están en producción: `hr.employee` de Odoo con su sync, la Hoja del día, el kiosco del pañol con PIN o QR y la firma con PDF de Permisos. Para **recibos y vacaciones**, que es lo que Humand hace bien y lo más caro de construir, la decisión se toma con cotizaciones en la mano antes de la etapa 2a (sección 2).
2. **El canal de obra es un link con token por documento o pedido**, no un bot. El bot de Telegram **todavía no está andando**: en `docs/README.md` la Hoja del día figura "En producción (falta Telegram)" y el paso de crear el bot sigue sin tildar en `docs/equipos-del-dia/handoff.md`. Además estaba pensado para capataces, choferes y depósito, no para los ~20 montadores y ayudantes. El link viaja por **WhatsApp manual desde la oficina** (wa.me, unos minutos por envío para 45 personas), por Telegram para quien lo tenga y, si algún día hace falta, por WhatsApp Cloud. Nadie tiene que instalar nada.
3. **Lo primero es tener los papeles en orden:**
   - una ficha por persona, de oficina y de obra, con los datos sensibles separados y con lectura auditada;
   - documentos con archivo, vencimiento y semáforo;
   - un control barato que cubre el 82 % de las obras: **avisar si alguien de la cuadrilla asignada no figura en la última Nómina ART subida**;
   - que nadie salga a obra sin apto de altura vigente (en ABA casi todo el montaje es altura).
4. **Después, lo que el operario hace desde el celular sin cuenta:** firmar la entrega de EPP (en el kiosco), firmar el recibo si se decide construirlo, confirmar comunicados con "Entendido", avisar "hoy no voy", pedir vacaciones y ver "Mis papeles".
5. **Antes de escribir código:**
   - nombrar a la persona de administración que opera el módulo;
   - relevar **persona por persona** qué celular tiene, si tiene datos y si usa WhatsApp o Telegram;
   - inventariar qué pantallas leen `personal` antes de tocar la RLS;
   - que JS decida cómo entra la oficina (hoy, por decisión suya del 10/10, los 15 administrativos no tienen legajo);
   - respuestas del contador, de la ART y de un abogado laboral.
6. **Quedan fuera:** muro, chat, evaluación 360, LMS, puntos y canjes, fichada con selfie. Van por carriles aparte: la asistencia que escribe en Odoo (deciden Juan Pablo y JS) y un módulo de SyH (PTS, charla de 5 minutos, verificación del andamio y **aviso de accidente**).
7. **Somos unas 45 personas, no 40:** Odoo tiene 30 de obra activos y 15 de oficina.

---

## 2. Comprar, construir o combinar

### 2.1 Costos de cada lado

- **Humand.** El precio **no es público**. El único número es "desde US$ 4 por usuario por mes", de extractos del buscador de Capterra, sin verificar. Para 45 personas eso da unos US$ 2.150 por año; la estimación del analista para los módulos de RRHH va de US$ 6 a 10 por usuario, o sea US$ 3.200 a 5.400 por año. No se sabe si hay mínimo, la moneda, el IVA ni el costo de los SMS.
- **Construir.** Sumando las etapas 0 a 3 (sección 7) da **unas 15 a 22 semanas, o sea 4 a 5 meses de JS y Claude**, que compiten con Sistemas y con el rediseño de partes. Más el mantenimiento: guardar PDF durante 10 años, reglas laborales como parámetros con historial, exportación para la ART y, quizás, WhatsApp Cloud. Nadie lo pasó a plata.
- **Lo que pesa:** lo que Humand **no** cubre (vencimientos, altura, Nómina ART, EPP) está todo en la etapa 1 y es barato. Lo que Humand **sí** cubre (recibos y vacaciones) cae en las etapas 2 y 3 y es lo más caro de construir. Por eso la comparación se hace función por función.

### 2.2 Función por función

| Función | ¿Humand la tiene? | Construir en AndamiosOS | Decisión |
|---|---|---|---|
| Ficha de persona | Sí (legajo con campos a medida y historial) | M. Reusa el sync de Odoo y el organigrama | **Construir.** Igual hace falta para todo lo demás |
| Documentos con vencimiento y semáforo | **No** (no encontramos alertas de vencimiento) | M. Reusa `documentos`, la subida de archivos y el barrido de alertas | **Construir** |
| Control contra la Nómina ART y habilitación para salir a obra | No | S + S. Se cuelga de Habilitaciones y la Hoja del día | **Construir** |
| Constancia de EPP | No | M. Fase 2 del pañol, ya prevista | **Construir** |
| Comunicados con "Entendido" nominal | No hay confirmación obligatoria | S–M | **Construir** |
| "Hoy no voy" con certificado | Adjunto obligatorio en licencias | S | **Construir** (escribe en `hd_ausencias`, que ya usa la Hoja del día) |
| **Recibos firmados** | **Sí, maduro**: PDF sábana cortado por CUIL, firma electrónica, disconformidad | M + M (pieza de firma más recibos), unas 3 a 4 semanas, más 10 años de guarda y la prueba de la firma a cargo nuestro | **Decidir con tres cotizaciones** antes de la etapa 2a |
| **Vacaciones con saldo** | **Sí**, con plantilla argentina y pedir en nombre de otro | M. Amplía `hd_ausencias` | Va atada a la decisión de recibos: si se contrata afuera, ver si conviene sumar vacaciones o mantenerlas acá para no tener dos fuentes de ausencias |

### 2.3 Recomendación

- **Construir la etapa 1 sin esperar a nadie.** Es lo que Humand no tiene y lo que deja a una cuadrilla en la puerta.
- **En la etapa 0, pedir tres cotizaciones por escrito para recibos (y vacaciones):**
  1. el portal de recibo digital del sistema de sueldos del contador, si lo tiene (puede ser lo más barato);
  2. Humand, solo recibos y vacaciones, para 45 usuarios, con mínimo, moneda, IVA y aumento al renovar;
  3. un proveedor local de recibo digital. **Todavía no identificamos ninguno.**
- **Tener esas respuestas es condición de entrada de la etapa 2a**, no un plan B a los 6 meses. Si el portal del contador o un proveedor resuelve los recibos por poco, se contrata y AndamiosOS solo guarda la constancia. Si no, se construye C0 y C1.
- **Pros y contras de Humand para ABA:** pide Android 10 o más; la app de iOS pesa unos 187 MB (versión 4.4.4; el dato de 49 MB del centro de ayuda está desactualizado y el peso en Android no se pudo verificar); sin modo offline salvo el Kiosk; sin WhatsApp; sin Odoo; geocerca por "sede" fija; organigrama con un solo jefe por persona; reseñas de App Store que se quejan del login, la lentitud y recibos que no abren; ningún caso publicado de menos de 100 empleados. A favor: los recibos y las vacaciones están resueltos y probados.

---

## 3. Usuarios y canales

### 3.1 El canal de obra, corregido

- **Hoy no hay un canal de obra para los montadores.** El link `/h/` es para capataz y chofer, y el bot de Telegram no está creado.
- **La base es el link con token** (un token **por documento o pedido**, no el diario). Ahí van los botones Entendido, Firmar y Pedir. La página es HTML liviana, de tema claro y alto contraste, y funciona con poca señal reusando el service worker de `/h/`.
- **Por dónde viaja el link es otra decisión**, persona por persona según el relevamiento de la etapa 0:
  - **WhatsApp manual desde la oficina** (wa.me con el texto armado, como ya hace el pañol con `src/lib/panol/whatsapp.ts`). Es el canal por defecto: el brief dice que la obra usa WhatsApp.
  - **Telegram** para quien ya lo tenga, cuando se cree el bot pendiente de la Hoja del día. Es un transporte más, no la interfaz.
  - **WhatsApp Cloud** solo si mandar a mano se vuelve una carga. Desde el 1/7/2025 Meta cobra **por mensaje**, y las plantillas de utilidad dentro de la ventana de atención de 24 h son gratis. La tarifa exacta para Argentina no la verificamos.
  - **Kiosco del pañol** con PIN o QR para quien no tiene celular, y el capataz como puente.
- **No se construyen menús de bot como interfaz principal.**

### 3.2 Quién usa qué

| Usuario | Quién es | Canal | Qué hace en RRHH |
|---|---|---|---|
| **Operario de obra** (oficial montador, medio oficial, ayudante) | ~30 personas con capataces y choferes, bajo UOCRA. Celular, muchas veces Android de gama baja, datos limitados, sin mail | **Link con token** que llega por WhatsApp (o Telegram). **Kiosco** si no tiene celular | Firma la entrega de EPP y el recibo, confirma comunicados, avisa "hoy no voy", pide vacaciones, mira "Mis papeles" (el semáforo también sin señal) |
| **Capataz** | Responsable de la cuadrilla y, muchas veces, de la tarea en altura | Su link de la Hoja del día y el link de RRHH. **Regla del minuto:** nada diario le puede llevar más de un minuto ni ir sin datos precargados | Pide en nombre de un operario, opina sobre vacaciones (no aprueba). Ve solo "apto / no apto / vence" y "ausente con aviso", nunca un motivo médico |
| **Chofer y pañol** | Obra y depósito | Link y kiosco | El pañol entrega EPP con firma en el kiosco. El chofer tiene el registro de conducir en sus papeles |
| **Planificador** | Arma la Hoja del día | Web | Ve advertencias o bloqueos de habilitación al asignar y **puede destrabar en el momento con motivo** (aviso inmediato a JS). Ve los "hoy no voy". Aprueba vacaciones de obra junto con JS |
| **Operador de RRHH** (administración, a nombrar) | Dueño del módulo | Web, campanita y Slack | Mantiene fichas y vencimientos, sube recibos, arma las novedades del mes para el contador, controla la Nómina ART, maneja altas y bajas. **Ve todos los sueldos** si corta el PDF sábana |
| **Personal de oficina** | ~15 personas: dirección, comercial, administración, oficina técnica, logística, sistemas. Convenio a confirmar (¿Comercio 130/75?) | **Web de AndamiosOS y campanita**, con la sesión que ya tienen | Lo mismo que obra pero desde la web: recibos, vacaciones, comunicados, su ficha. **Pesa lo mismo que obra en la maqueta.** Cómo se los ancla es pregunta para JS (sección 10, pregunta 5) |
| **JS** | Dueño y director | Web y campanita. Aviso el día anterior a cada cumpleaños | Publica comunicados (audio grabado por él), aprueba vacaciones de oficina y las de obra con el planificador, recibe el aviso de cada destrabe, mira el tablero |
| **Juan Pablo** | Sistemas. Hoy carga `x_parte_diario` | Web | Carril aparte: asistencia precargada |
| **HyS** | El repo nombra a **Iñaki Capurro** como "técnico de SyH" con legajo (`docs/equipos-del-dia/handoff.md:259`). Falta confirmar si es el responsable o solo un técnico, y si hay un servicio externo | Web | Revisa los destrabes de habilitación. Sus constancias de capacitación alimentan los papeles de cada persona. Recibe las alertas de accidente (en el módulo de SyH) |
| **Contratistas** (cuadrillas tercerizadas, en `pan_personas_externas` y `hd_contratistas`) | Entran a obra con ABA. El comitente y la Res. SRT 61/23 les piden aptos y EPP igual | Los papeles los sube la oficina o el contratista | Figuran en el control de habilitación y en la carpeta por comitente (sección 4, B5) |
| **ART** | Externa | **Exportación a pedido** (link temporal o ZIP) de las constancias de EPP, en lugar de un acceso propio | Audita. La Disp. GP SRT 3/2022 pide "dar acceso"; confirmar con la ART que una exportación a pedido alcanza |

**Reglas para todo lo que va a obra:**
- Nada se manda después de las 21 h ni los domingos, salvo una emergencia.
- Ningún audio ni video se reproduce solo.
- Las pantallas son HTML livianas; el PDF baja solo si la persona lo pide.

---

## 4. Funciones

Prioridad: **I** = imprescindible, **C** = conviene, **SS** = solo si sobra. Esfuerzo: **S** = días, **M** = 1 a 2 semanas, **L** = 3 semanas o más.

### A. Base

**A1. Ficha única de persona** · I · M
- **Inspiración Humand:** Legajo digital.
- **Usuarios:** operador de RRHH y JS. El operario ve un resumen en "Mis papeles" (C3).
- **Cómo:**
  - una ficha por persona, de oficina y de obra, anclada en `hr.employee` por `odoo_employee_id`;
  - **el ancla de la oficina es decisión de JS** (pregunta 5). La recomendación es una tabla propia de RRHH (por ejemplo `rrhh_personas`) que apunte a `odoo_employee_id`, `personal.id` (si es de obra) y `user_profiles.id` (si tiene usuario), siguiendo la regla del organigrama de "la misma persona aparece una vez". Así la oficina **no** entra a Legajos de obra, la decisión del 10/10 queda en pie y no hay riesgo de que aparezca en la Hoja del día o el kiosco (hoy los filtra `esPersonalDeObra`, que depende de la tarea de Odoo; igual hay que verificarlo);
  - campos: contacto, CUIL, fecha de ingreso y de nacimiento, convenio, categoría, jefe (del organigrama), si es responsable de la tarea en altura (designación y capacitación, Res. SRT 61/23) y documentos;
  - salud, sueldos y sanciones en tablas aparte (A2).
- **Reutiliza:** el sync de Odoo (`sync-odoo.ts`) ampliado a más campos y a la oficina, el organigrama y `audit_log`.

**A2. Permisos y privacidad** · I · **M** (no S)
- **Inspiración Humand:** roles y permisos.
- **El problema:** hoy cualquier usuario logueado puede leer DNI, CUIL, domicilio, nacimiento y `telegram_chat_id` de `personal` (`supabase/migrations/20260330000002_rls_policies.sql:161` y `:191`). Pero **cerrar `personal` entera rompe pantallas que funcionan**: varias la leen embebida desde el navegador y, con el SELECT restringido, devuelven `personal: null` sin error:
  - `src/hooks/use-cuadrillas.ts:24`
  - `src/hooks/use-vehiculos.ts:28`
  - `src/hooks/use-remitos.ts:46,62,83`
  - `src/hooks/use-solicitudes-extra.ts:35,52`
  - `src/hooks/use-fichadas.ts:22`
- **Cómo:**
  1. **inventario de consumidores** de `personal`, `documentos` y `fichadas` antes de tocar nada (los de arriba y los que aparezcan);
  2. **sacar los campos sensibles a tablas nuevas de RRHH** con RLS por permiso o RPC `SECURITY DEFINER` (el patrón de Organigrama y Hoja del día);
  3. dejar en `personal` solo nombre, apellido, puesto y activo, con lectura abierta para los logueados;
  4. `documentos` y `fichadas`: cerrar con el mismo inventario previo;
  5. módulo `rrhh` en `acceso.ts`, con `exigeExplicito` para salud, sueldos y sanciones;
  6. **registro de lectura** de datos sensibles: `exigeExplicito` restringe, pero no deja constancia de quién miró qué. Cada apertura de un certificado, un recibo ajeno o una sanción queda registrada.
- **Reutiliza:** `acceso.ts`, `exigeExplicito`, el patrón de Dirección › Socios y `audit_log`.

### B. Papeles y habilitación

**B1. Documentos con archivo, vencimiento y semáforo** · I · M
- **Inspiración Humand:** ninguna. Humand no avisa vencimientos.
- **Usuarios:** operador de RRHH; el capataz y el planificador ven solo el estado.
- **Cómo:**
  - subida real del archivo (hoy `archivo_url` nunca se llena);
  - tipos nuevos: apto de altura, registro de conducir, curso con entidad, preocupacional, constancia de alta en ARCA;
  - un cron recalcula el estado y avisa 30 y 7 días antes por campanita y Slack, y a la persona por su canal;
  - **las capacitaciones son un tipo de documento**, con entidad, firma de asistencia y vencimiento;
  - las **sanciones** son un tipo restringido que solo guarda la constancia; se notifican por carta documento, nunca por WhatsApp ni Telegram;
  - del apto médico se guarda **la constancia "apto / no apto" con su fecha**, no el estudio.
  - Los papeles de los **contratistas** usan los mismos tipos (B5).
- **Reutiliza:** `documentos`, `file-upload.tsx`, buckets privados con URL firmada, `archivo-seguro.ts`, `actualizar_estado_documentos()` (existe y nadie la llama) y `/api/alertas/barrido`.

**B2. Control contra la última Nómina ART** · I · S *(reemplaza a la carpeta completa en la etapa 1)*
- **Por qué:** según `docs/habilitaciones/modulo.md` (línea 392), el paquete **Básico, que es solo la Nómina ART, cubre el 82 % de las obras**. "+ No repetición" suma un 2 %, "+ SVO y aviso de obra" un 3 %, y el **Completo, con EPP, capacitaciones y F.931, apenas un 1 %**. Los papeles por persona casi no se piden; la Nómina ART es un documento de la empresa que manda el contador.
- **Cómo:** cuando la Hoja del día asigna una cuadrilla a una obra que pide la Nómina ART, el sistema compara la gente asignada con **la última Nómina ART subida** y avisa si alguien no figura o si la nómina es de un mes anterior. El operador le pide al contador la actualización antes de que la cuadrilla salga.
- **Reutiliza:** Habilitaciones (donde ya se sube la nómina), Cuadrillas y la Hoja del día. Requiere que la nómina se cargue con la lista de CUIL (a mano o leída del PDF).

**B3. Habilitación para salir a obra** · I · S
- **Inspiración Humand:** ninguna.
- **El cambio:** la Hoja del día no conoce el concepto de "tarea en altura" (no hay ningún campo así en `src/lib/hoja-dia`). Como en ABA casi todo el montaje es altura, **el control es "habilitado para salir a obra"** y se aplica a todo el personal de obra.
- **Qué se controla:**
  - **apto psicofísico de altura vigente**: para todo el personal de obra, propio o de contratista;
  - **preocupacional y alta en ARCA**: solo para **las altas posteriores a la puesta en marcha**. A los veteranos no se los frena por un preocupacional de hace años que no está en un archivo cargable; se los marca "a regularizar";
  - capacitación de altura y, cuando el pañol tenga la trazabilidad, arnés asignado vigente: **advertencia**;
  - que la cuadrilla tenga un responsable de la tarea en altura designado: **advertencia**.
- **Cómo se prende:**
  - mientras la carga de aptos del personal de obra no llegue al 100 %: **advertencia con registro**;
  - desde ahí: **bloqueo**, pero **el planificador lo puede destrabar en el momento** con motivo escrito; a JS le llega el aviso al instante y HyS lo revisa después. A las 6:30 no suele haber nadie más para destrabar, y si el sistema no deja, la gente igual va a la obra y el sistema queda desactualizado.
- **Reutiliza:** Hoja del día y Cuadrillas.

**B4. Carpeta completa por comitente** · C · M *(baja de I a C por la auditoría)*
- **Para:** el ~1 % de obras con paquete Completo y los pliegos que pidan papeles por persona.
- **Cómo:**
  - un botón desde Habilitaciones arma un ZIP o un link con los PDF vigentes;
  - **separa documentos de la empresa** (F.931 y su pago, certificado de la ART con nómina, cláusula de no repetición, seguro de vida, certificado del IERIC) **de los de la persona** (apto, cursos, EPP);
  - **de salud va solo la constancia "apto"**, nunca el estudio, y **con consentimiento** de la persona registrado en su ficha.
- **Reutiliza:** Habilitaciones, Cuadrillas, la Hoja del día y B1.

**B5. Contratistas** · C · S
- Las personas de las cuadrillas tercerizadas (`pan_personas_externas`, `hd_contratistas`) pueden tener documentos de B1 (apto, EPP, alta del contratista, seguro de accidentes personales con no repetición si son autónomos) y entran al control de B3 y a la carpeta de B4.
- No tienen ficha completa ni recibos: solo papeles para entrar a obra.

### C. Firma y documentos del operario

**C0. Pieza común de firma y link por documento** · I · M
- **Inspiración Humand:** Documentos y firma.
- **Cómo:**
  - un token **por documento o pedido**, que llega por el canal de cada persona;
  - **segundo factor: el PIN del pañol**. Hoy es de 4 dígitos y no se sabe cuántos operarios lo tienen. **Si no lo tiene, se le entrega en persona** (en el pañol o en el obrador); no se usa el DNI como respaldo, porque los 3 últimos dígitos son 1.000 combinaciones que conocen otros;
  - firma con el dedo y PDF con hash;
  - **evidencia completa de cada firma**: registro del token (creado, enviado, abierto), PIN validado, fecha y hora, IP o dispositivo, hash del documento y constancia al pie. Con firma electrónica, si el trabajador la desconoce, la validez la tiene que probar ABA (Ley 25.506, art. 5; de memoria, a confirmar con el abogado);
  - **adhesión al canal digital firmada una vez en papel** por cada persona: dice que acepta recibir y firmar documentos por este medio;
  - se construye una vez y se usa en EPP, recibos, constancia de vacaciones y reglamento.
- **Reutiliza:** `firma-pad.tsx`, `documentos-firmados.ts`, el patrón de `/permiso/[token]` y `pan_credenciales`.

**C1. Recibos de sueldo firmados** · I · M · *solo si en la etapa 0 se decide construir*
- **Inspiración Humand:** Documentos.
- **Cómo:**
  - se sube el PDF sábana del contador y el sistema lo corta por CUIL;
  - aviso con link por el canal de cada uno;
  - firma conforme o en disconformidad, con campo de texto;
  - **siempre se puede descargar, aunque no esté firmado** (Humand no lo permite y no lo copiamos). Se registran la apertura y la descarga, sabiendo que **eso solo no es una constancia firmada** y que va a bajar la tasa de firma;
  - recordatorio a quien no firmó y conservación por 10 años;
  - la oficina firma desde la web; quien no tiene celular, en el kiosco;
  - **piloto de 3 meses en paralelo con el papel**, midiendo cuántos firman en 72 h.
- **Reutiliza:** C0 y `pdf-lib`.

**C2. Constancia digital de entrega de EPP** · I · M
- **Inspiración Humand:** ninguna. Es la fase 2 del pañol.
- **Cómo:**
  - en el kiosco: PIN o QR, ítems con talle, marca, certificación y fecha, y firma en pantalla;
  - contenido de la Disp. GP SRT 3/2022;
  - el PDF va a la ficha;
  - **exportación a pedido para la ART** en lugar de un acceso propio.
  - **El QR por pieza de EPP de altura, con vida útil e inspecciones, es del pañol**, no de RRHH. RRHH solo lee si el arnés asignado está vigente.
- **Reutiliza:** el kiosco, `pan_vales`, `pan_movimientos` e insumos con variantes.
- **Nota:** `docs/panol/modulo.md:230` cita la "Disp. SRT GP 2/2021". El informe de normativa verificó la **Disp. GP SRT 3/2022**. Hay que unificar ese documento del pañol.

**C3. "Mis papeles"** · C · S
- **Inspiración Humand:** Perfil.
- **Cómo:**
  - en el link: semáforo del apto, cursos, EPP, recibos y saldo de vacaciones (desde la etapa 3);
  - **lo que queda guardado en el celular para mostrar en el portón es solo el semáforo** (nombre, apto sí/no y vencimiento, cursos vigentes). **Nunca recibos ni certificados**: esos se abren con conexión y PIN;
  - botón "avisar un dato mal".
- **Reutiliza:** el service worker de `/h/` y el alto contraste.

### D. Ausencias, licencias y novedades

*Para la gente de obra se amplía `hd_ausencias`, sin otra tabla. Para la oficina, `hd_ausencias.persona_id` apunta a `personal(id)` (`supabase/migrations/20261011000001_hoja_del_dia.sql:434`), así que depende de la pregunta 5: o se le suma una referencia a la ficha de RRHH, o la oficina entra a `personal`.*

**D1. "Hoy no voy"** · I · S
- **Inspiración Humand:** adjunto obligatorio en licencias.
- **Cómo:**
  - en el link, el motivo en botones;
  - **certificado médico electrónico** (ReNaPDiS): se acepta **PDF, link o foto del QR**, porque muchas veces llega así; se registran la matrícula y la plataforma. La foto del papel queda como excepción;
  - entra como "a confirmar" y lo ve el planificador;
  - **el capataz ve solo "ausente con aviso"**. "Enfermedad" ya es un dato de salud.
- **Reutiliza:** `hd_ausencias` (se le agrega el estado), la API de ausencias (ya acepta el módulo `personal`) y la subida de archivos por token.

**D2. Vacaciones y licencias con saldo** · I · M
- **Inspiración Humand:** Vacaciones y permisos (plantilla argentina, pedir en nombre de otro).
- **Cómo:**
  - el saldo sale de la antigüedad según el art. 150 de la LCT, como **parámetro con historial**;
  - pedido por link o web; el capataz o el planificador pueden pedir en nombre de otro;
  - **en obra aprueban el planificador o JS**, el capataz solo pide u opina; **en oficina, el jefe directo o JS**;
  - **el motivo de rechazo se le muestra al empleado**;
  - constancia de aviso con 30 días de anticipación, firmada con C0;
  - botón "¿cuántos días me quedan?" en el link;
  - sugerencia de turnos por cuadrilla para la temporada de 1/10 a 30/04 (si JS la quiere).
- **Reutiliza:** `hd_ausencias`, el organigrama y C0.

**D3. Novedades del mes para el contador** · I · S *(nuevo, pedido por la auditoría)*
- **Por qué:** es lo que más trabajo le da a RRHH en una pyme y ninguna propuesta lo tenía.
- **Cómo:** un export mensual por persona con ausencias, vacaciones, licencias, ART, adelantos (si se definen), altas y bajas, en el formato que pida el contador. **No escribe `x_parte_diario`**: lo lee junto con `hd_ausencias` y arma el archivo.
- **Reutiliza:** `hd_ausencias`, la lectura de `x_parte_diario` que ya hace la Hoja del día (`leerAsistencia`) y el sync de altas y bajas.

### E. Comunicación

**E1. Comunicados con "Entendido" nominal** · I · S–M
- **Inspiración Humand:** Muro y Novedades importantes, mejorado: Humand no tiene confirmación obligatoria.
- **Cómo:**
  - alcance: todos, oficina, obra, una cuadrilla o una persona (lógica Y/O);
  - obra: link con botón "Entendido", que llega por WhatsApp o Telegram; oficina: campanita; sin celular: kiosco;
  - **audio opcional grabado por JS o el capataz, nunca sintético**;
  - tablero de quién no leyó, con reenvío;
  - solo para lo importante: seguridad, horarios, feriados, pagos, convenio;
  - **se usa para cuidar, no para sancionar**.
- **Reutiliza:** C0 (el link por documento), `alertas` y `alertas_lecturas`.

**E2. Aviso de cumpleaños a JS** · C · S
- **Inspiración Humand:** Cumpleaños.
- **Cómo:** a JS le llega por campanita el día anterior a cada cumpleaños y aniversario, para que llame. El saludo automático a la persona queda para cuando haya un canal automático (Telegram o WhatsApp Cloud).
- **Reutiliza:** el cron y la fecha de nacimiento que trae el sync.

### F. Ciclo de vida

**F1. Checklist de alta y de baja** · C · S
- **Inspiración Humand:** Onboarding, simplificado.
- **Alta:** preocupacional, constancia de ARCA, nómina de la ART, inducción firmada, EPP, credencial y PIN del pañol entregados en persona, relevamiento del canal (celular, datos, WhatsApp o Telegram), adhesión al canal digital firmada en papel y reglamento firmado. Solo bloquea lo legal, y eso lo hace B3.
- **Baja:**
  - devolución de EPP y herramientas;
  - acreditación del Fondo de Cese **dentro de las 48 h** (fuente secundaria) y certificado del art. 80;
  - **corte de accesos**: revocar el PIN y la credencial del pañol, invalidar los links con token pendientes, desvincular Telegram si lo tenía y dar de baja el usuario del sistema si era de oficina.
- **Reutiliza:** el pañol (saldos por persona), B1 y Usuarios.

### G. Después

**G1. Pedidos a RRHH** · C · S–M
- Certificado laboral, cambio de datos (CBU, domicilio) y reposición de ropa desde el link, con una bandeja para el operador. **Los adelantos esperan a que JS defina el tope y quién aprueba.**
- **Reutiliza:** el patrón de la bandeja de Sistemas.

**G2. "Qué hago si…"** · SS · S
- Fichas cortas con texto grande y audio: reglamento, resumen del convenio, ART, **qué hacer si hay un accidente y el teléfono de la ART**, EPP y teléfonos. La ficha de accidente se puede adelantar sola (es un texto) mientras no exista el módulo de SyH.

**G3. Pulso anónimo semestral** · SS · S
- 3 a 5 preguntas más eNPS; resultados de la empresa entera, y obra contra oficina **solo con 8 respuestas o más por grupo**; nunca por cuadrilla.

**G4. Tablero para JS** · SS · S
- Una vista del tablero del operador con dotación, ausentismo del mes, vencimientos y firmas pendientes. No es un entregable aparte.

### H. Carriles aparte, que no bloquean a RRHH

- **Asistencia precargada que escribe `x_parte_diario`** (fase 2 de la Hoja del día): el capataz confirma presentes con un toque; deciden Juan Pablo y JS; si se aprueba, un mes con las dos cargas a la vez comparando diferencias. El prototipo de Fichadas **se descarta**: no identifica a quién ficha y está atado a la tabla vieja `obras`.
- **Módulo de SyH:** PTS diario, charla de 5 minutos, verificación del andamio (Res. SRT 61/23) y **aviso de accidente** (botón del capataz con quién, dónde, foto y qué pasó; alerta a HyS y oficina por Slack #syh; checklist de la denuncia a la ART, Dec. 717/96). El aviso de accidente sale de RRHH porque Incidentes es un prototipo colgado de la tabla vieja `obras`, con `personas_involucradas` como JSONB libre: atarlo a `personal` y a las OT es una tarea M aparte. RRHH solo lee de ahí las constancias por persona y la licencia ART va a D.

### Cuántas funciones son

Son 20 piezas, pero **el núcleo de las etapas 1 a 3 son 15** (A1, A2, B1, B2, B3, C0, C2, C3, D1, D2, D3, E1, F1 y, según la decisión de compra, C1, más B4 cuando sobre). B5, E2 y G1 son chicas. G2, G3 y G4 quedan "solo si sobra". Para 45 personas y un operador de medio tiempo que todavía no existe, el orden importa más que la lista.

### Debates que se resolvieron

- **Bloqueo.** RRHH pedía bloqueo blando y después adoptó duro para altura; Obra/SyH, duro desde el día uno; Producto, advertencia hasta completar la carga. **Queda** advertencia hasta que la carga de aptos llegue al 100 % y después bloqueo. **La auditoría cambió dos cosas:** preocupacional y ARCA bloquean solo a las altas nuevas, y el planificador puede destrabar con motivo y aviso inmediato a JS (antes solo podían JS o HyS).
- **Capacitaciones.** Quedan como tipo de documento con entidad, firma y vencimiento, porque el valor está en el vencimiento, no en dictar cursos.
- **Audio de los comunicados.** Grabado por una persona: el operario presta atención cuando reconoce la voz, y una voz sintética que imite a JS confunde.
- **Segundo factor.** El PIN del pañol. **La auditoría sacó el respaldo del DNI:** si no tiene PIN, se le entrega en persona.
- **Quién aprueba las vacaciones de obra.** El planificador o JS; el capataz opina, porque la decisión es de cobertura, no de jerarquía.
- **Seguro de vida y Nómina ART.** Son documentos de la empresa, no de cada persona.
- **Asistente con IA.** Fuera. Alcanza con el botón "¿cuántos días me quedan?".
- **Reconocimiento.** Fuera como software. Premiar la "cuadrilla del mes" termina premiando la velocidad. Si JS lo menciona en un comunicado, el criterio es seguridad y orden.

---

## 5. Lo que se descarta de Humand

| Función de Humand | Por qué no |
|---|---|
| Muro social, grupos, chat, videollamadas, noticias tipo revista | Con 45 personas, WhatsApp ya cumple ese papel. Otro lugar para mirar dispersa. Lo único que tomamos es el comunicado con confirmación (E1) |
| Transmisiones en vivo, eventos con RSVP, marketplace, grupos multiempresa | Exagerado para el tamaño de ABA |
| Reconocimientos con puntos y canje | Administrar un catálogo de premios no tiene sentido, y en obra puede premiar la velocidad |
| Evaluación 360, 9-box, calibración, objetivos | Burocracia de multinacional. Si JS quiere, una charla anual con una ficha de una página |
| Aprendizaje (cursos, rutas, certificados) | La capacitación se da en obra. El sistema guarda la constancia (B1) |
| Fichada con selfie, geocerca por sede, Kiosk facial | Las obras cambian, la selfie genera rechazo (lo dicen las reseñas) y la asistencia sale de la Hoja del día y de Odoo |
| Turnos, cuadrantes, bolsa de horas | Lo cubren Cuadrillas y la Hoja del día. La bolsa de horas además exige acuerdo escrito (art. 197 bis, **fuente secundaria**) |
| Clima con mapa de calor y comparativas | Con cuadrillas de 3 a 5 personas no hay anonimato |
| Insights, traducción, "mejorar con IA", Sammy | No aportan a esta escala |
| Reclutamiento | Se contrata por recomendación |
| App nativa para instalar | El link anda con poca señal y en equipos viejos, y **no le pedimos a nadie que instale nada**: ni Humand ni Telegram |
| Recibo que no se puede descargar sin firmar; motivo de rechazo oculto | Los mejoramos a propósito: el recibo es del trabajador y el empleado tiene que saber por qué le rechazaron un pedido |

**Lo que sí copiamos como patrón:** la persona identificada por DNI o legajo, sin mail; la segmentación Y/O; pedir en nombre de otro; el "visto por" nominal; la campaña de lanzamiento con métricas de activación (para nosotros, firmas en 72 h y "Entendido").

---

## 6. Normativa: qué cubre el módulo y qué no

Lo que no está confirmado lo marco. Ninguna de estas lecturas reemplaza al contador ni a un abogado laboral.

**Cubre** (guarda la trazabilidad y controla vencimientos):

| Obligación | Norma | Cómo la cubre | Estado |
|---|---|---|---|
| Constancia de entrega del recibo con firma electrónica o digital; versión digital con la misma validez | Ley 27.802, arts. 38 y 40 (arts. 139 y 143 LCT) | C1 o el proveedor que se contrate | Verificado en el Boletín Oficial. **No confirmado:** si la Res. 346/19, que pedía firma digital, sigue vigente. Una consulta del CPCE Salta de 2026 dice solo que la firma del trabajador sigue siendo obligatoria. Papel en paralelo y consulta al abogado |
| Prueba de la firma electrónica si el trabajador la desconoce | Ley 25.506, art. 5 | C0: evidencia completa y adhesión firmada en papel | **De memoria, no verificado.** A confirmar con el abogado |
| Conservación: 2 años para lo laboral y 10 para lo previsional | Art. 143 LCT, Dec. 407/26 | Storage con respaldo, 10 años | Verificado |
| Aviso de vacaciones por escrito con 30 días; tramos de 7 días o más | Art. 154 LCT reformado | D2, y una constancia en PDF manual mientras tanto | Verificado. Días por antigüedad (art. 150): en la parte del Boletín Oficial que se leyó no aparece cambio, pero **no está verificado del todo** |
| Aviso de enfermedad el primer día; certificado electrónico ReNaPDiS / REFEPS | Arts. 209 y 210 LCT, Dec. 407/26 | D1 (acepta PDF, link o QR) | Verificado. No hay verificador público confirmado |
| Constancia de entrega de EPP, digital admitida, con acceso para la ART | Res. SRT 299/11, Disp. GP SRT 3/2022 | C2, con exportación a pedido | Verificado. Confirmar con la ART que la exportación alcanza como "acceso" |
| Apto psicofísico vigente para altura; responsable de la tarea en altura designado y capacitado; EPP de altura trazable | Res. SRT 61/23 | B1, B3, A1 y el pañol | Verificado. **La periodicidad del apto no está definida:** a fijar con la ART |
| Preocupacional antes del inicio | Res. SRT 37/10 | B1, B3 (altas nuevas) y F1 | Verificado |
| Nómina del personal actualizada; papeles que pide el comitente | Res. SRT 51/97 y pliegos | B2 y B4 | Verificado en lo general; los pliegos varían |
| Acreditación del Fondo de Cese dentro de las 48 h del cese | Ley 22.250, art. 17 | F1 | Fuente secundaria |
| Certificado del art. 80 | Art. 80 LCT, RG ARCA 5848/26 | F1 (constancia) | Fuente secundaria |
| Datos de salud como datos sensibles | Ley 25.326 | A2, lectura registrada, capataz que ve solo el estado, solo constancia "apto" a terceros con consentimiento | Criterio del panel, no investigado a fondo |
| Inscripción de la base de datos personales | Ley 25.326, art. 21 (registro ante la AAIP) | Fuera del software: trámite | **De memoria.** A confirmar con el abogado |

**No cubre** (es del contador, de SyH o de canales formales):
- Liquidación, F.931, aportes UOCRA y de Comercio, FAL desde el 01/11/2026 (contribución del empleador, solo oficina) y depósitos del Fondo de Cese. El módulo solo guarda constancias y arma las novedades del mes (D3).
- Alta y baja en ARCA, y la transición del IERIC a ARCA (Dec. 407/26, todavía en adecuación). El dato de la credencial IERIC queda opcional.
- **Libros laborales:** ya no hacen falta (art. 52 LCT y Dec. 407/26) y el módulo no lleva ningún "libro". **No está confirmado** si el Libro de Sueldos Digital de ARCA sigue siendo la vía del F.931: es tema del contador.
- PTS, charla de 5 minutos, verificación del andamio, viento, aviso de obra, Programa de Seguridad, Legajo Técnico y **denuncia de accidente**: módulo de SyH.
- **Notificación fehaciente** de sanciones o despidos: carta documento o telegrama, nunca por WhatsApp ni Telegram.

---

## 7. Etapas

Los plazos son aproximados, al ritmo actual de JS y Claude, y compiten con Sistemas y con el rediseño de partes (pregunta 10). En total, etapas 0 a 3: unas 15 a 22 semanas.

**Etapa 0, la base (1 a 2 semanas, casi sin código)**
- Nombrar al operador de RRHH y medir las horas que hoy le lleva el trabajo.
- **Relevamiento del canal, persona por persona:** qué celular tiene, si tiene datos, si usa WhatsApp o Telegram, si tiene PIN del pañol. Reemplaza a "medir cuántos tienen Telegram vinculado" (la respuesta sería casi seguro cero, porque el bot no existe).
- **Inventario de consumidores** de `personal`, `documentos` y `fichadas` (A2).
- JS decide el ancla de la oficina (pregunta 5).
- Ampliar el sync a fecha de ingreso, nacimiento, CUIL y `parent_id`, verificando si Odoo tiene esos datos. Si no, importarlos del sistema del contador; no tipearlos.
- **Contador:** quién liquida, formato del PDF y si el CUIL es legible, si su sistema ya trae portal de recibo digital (y cuánto cuesta), validez de la firma electrónica, convenio de la oficina, exportación de datos y **formato de las novedades del mes**.
- **ART:** periodicidad del apto de altura y de los periódicos; si la exportación a pedido alcanza para las constancias de EPP; si ABA hace el aviso de obra en cada obra.
- **Abogado laboral:** Res. 346/19 frente a la 27.802, prueba de la firma electrónica (Ley 25.506) e inscripción ante la AAIP.
- **Las tres cotizaciones de recibos y vacaciones** (sección 2.3).
- **Ya:** constancia de aviso de vacaciones en PDF para firmar a mano en esta temporada.
- Opcional, si sobra un rato: crear el bot de Telegram pendiente de la Hoja del día, que ya está todo escrito.

**Etapa 1, papeles en orden (unas 4 a 6 semanas)**
- A2 permisos: separación de datos sensibles y lectura registrada (**M**).
- A1 ficha única.
- B1 documentos con vencimiento y semáforo.
- B2 control contra la última Nómina ART.
- B3 habilitación para salir a obra, en modo advertencia.
- Carga inicial de aptos y documentos, en paralelo y a mano.

**Etapa 2, lo que toca al operario (unas 6 a 8 semanas, en dos partes)**
- **Condición de entrada de la 2a:** la decisión de recibos tomada con las tres cotizaciones y la respuesta del contador.
- **2a:** C0 pieza de firma y link por documento, adhesión en papel, C2 EPP en el kiosco (con el pañol) y, si se decidió construir, C1 piloto de recibos en paralelo con el papel.
- **2b:** E1 comunicados, C3 "Mis papeles" y D1 "Hoy no voy".

**Etapa 3, el día a día (unas 4 a 6 semanas)**
- D2 vacaciones y licencias con saldo.
- D3 novedades del mes para el contador.
- F1 alta y baja, con corte de accesos.
- B4 carpeta completa por comitente y B5 contratistas.
- E2 aviso de cumpleaños a JS.
- G1 pedidos (sin adelantos hasta que JS lo defina).
- **Prender el bloqueo de B3** cuando la carga de aptos esté completa.

**Etapa 4, solo si sobra:** G2 "Qué hago si…" (la ficha de accidente se puede adelantar), G3 pulso semestral y G4 tablero.

**Carriles aparte:** la asistencia en `x_parte_diario` (deciden Juan Pablo y JS) y el módulo de SyH con el aviso de accidente (JS le pone fecha y responsable).

Cada etapa cierra con su `docs/rrhh/handoff.md` y su `modulo.md`, como el resto de AndamiosOS.

**Debates sobre el orden que siguen en pie:**
- **Recibos en la 2a**, condicionados a la decisión de compra: el recibo es lo que hace que todos abran el link cada mes.
- **"Hoy no voy" en la 2b**, porque necesita el link por documento y la subida por token de la 2a.
- **Vacaciones en la 3:** aunque entraran en la 2 llegarían tarde para los turnos de enero. Esta temporada se resuelve con la constancia en PDF de la etapa 0.
- **Alta y baja en la 3** como checklist S: el bloqueo legal ya lo da B3.
- **Pulso semestral, solo si sobra:** en una pyme familiar lo que más se calla es el trato de los familiares y los favoritismos, pero con 45 personas no es urgente.
- **Cambió por la auditoría:** la carpeta completa por comitente baja de la 1 a la 3 (el 82 % de las obras pide solo la Nómina ART) y el aviso de accidente sale de RRHH al módulo de SyH.

---

## 8. Riesgos

1. **Nadie opera el módulo.** Un semáforo en verde que miente es peor que no tener semáforo. *Mitigación:* nombrarlo en la etapa 0 y medir horas ahorradas, no agregadas.
2. **El canal de obra no existe.** El bot no está creado y el link `/h/` es solo para capataz y chofer. *Mitigación:* link por documento como base, WhatsApp manual por defecto, relevamiento persona por persona, kiosco y capataz como puente.
3. **Mandar a mano por WhatsApp cansa.** Con 45 personas son minutos por envío, pero todos los meses. *Mitigación:* medirlo en el piloto; si pesa, Telegram para quien lo tenga o WhatsApp Cloud con otro número.
4. **Cerrar la RLS rompe pantallas.** *Mitigación:* inventario primero, campos sensibles a tablas nuevas, `personal` con lo básico abierto.
5. **Validez de la firma del recibo** y **la prueba a cargo de ABA.** *Mitigación:* evidencia completa, adhesión en papel, papel en paralelo y consulta al abogado.
6. **Datos sucios o ausentes** (ingreso, nacimiento, jefe, aptos, preocupacionales viejos). *Mitigación:* importar del contador, el bloqueo atado a la carga completa y preocupacional/ARCA solo para altas nuevas.
7. **Privacidad.** El operador ve todos los sueldos; los aptos salen hacia los comitentes; el celular puede perderse. *Mitigación:* lectura registrada, solo constancia "apto" con consentimiento, nada sensible guardado en el celular.
8. **El link se puede reenviar.** *Mitigación:* token por documento y PIN entregado en persona.
9. **El planificador destraba todo.** Si el destrabe es fácil, se vuelve costumbre. *Mitigación:* motivo obligatorio, aviso inmediato a JS y revisión de HyS; si se repite con la misma persona, alerta.
10. **Que se sienta como control.** *Mitigación:* uso explícito para cuidar ("te vence el apto, te sacamos turno"), horario de envío y nada que se reproduzca solo.
11. **Desconfianza a firmar en el celular.** *Mitigación:* explicación en persona en el obrador y tres meses en paralelo.
12. **Capacidad.** 4 a 5 meses que compiten con Sistemas y el rediseño de partes. *Mitigación:* la decisión de compra de recibos antes de la 2a, carriles aparte y lo de la etapa 4 solo si sobra.
13. **Reglas que cambian.** La ley laboral cambió dos veces en 2026. *Mitigación:* saldo de vacaciones y formato del recibo como parámetros con historial.
14. **El módulo de SyH sin fecha.** Quedan sin dueño el PTS, la charla y el aviso de accidente, que es lo primero que pide un inspector. *Mitigación:* JS le pone fecha y responsable; mientras tanto, la ficha "qué hacer si hay un accidente" con el teléfono de la ART.
15. **Contratistas sin control.** Entran a obra con ABA y nadie mira sus papeles. *Mitigación:* B5.
16. **Costo de mantener**, sin cuantificar: 10 años de PDF, exportaciones para la ART y, quizás, WhatsApp Cloud.

---

## 9. Lo que dijo la auditoría y qué se hizo

Veredicto de la auditoría: **aprobar con cambios mayores.** Se aplicaron todos los cambios; en tres puntos se ajustó el alcance y se explica por qué. Los archivos que citó la auditoría los volví a chequear en el repo: `docs/README.md:30` ("falta Telegram"), `docs/equipos-del-dia/handoff.md:47` y `:452` (bot sin crear), `docs/habilitaciones/modulo.md:392` (82 % = Nómina ART), `docs/equipos-del-dia/handoff.md:262` (los 15 administrativos sin legajo, a propósito) y `docs/panol/modulo.md:230` (Disp. 2/2021). No hay ningún campo de "altura" en `src/lib/hoja-dia`. `.env.local` y Vercel no los revisé.

### Hallazgos

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | El canal de obra no existe (bot sin crear, pensado para 8 a 10 personas) | **Aplicado.** El canal de base es el link con token; WhatsApp manual por defecto; Telegram y WhatsApp Cloud como transporte. Sin menús de bot. Etapa 0: relevamiento persona por persona. Se sacó la contradicción de pedir que instalen Telegram (secciones 1, 3.1, 5 y 7) |
| 2 | La carpeta por comitente estaba priorizada con el 82 % mal leído | **Aplicado.** B4 baja a C/M y va a la etapa 3. En la etapa 1 entra B2, el control contra la última Nómina ART |
| 3 | Cerrar la RLS rompe pantallas; esfuerzo M | **Aplicado.** A2 pasa a M, con inventario previo, campos sensibles a tablas nuevas y `personal` con lo básico abierto. Se listan los hooks afectados |
| 4 | La oficina en `hd_ausencias` y en el sync revierte la decisión del 10/10 | **Aplicado.** Es la pregunta 5 para JS, con la recomendación de un ancla propia de RRHH. Se sacó "ampliar el sync a la oficina" como hecho y se agregó verificar `esPersonalDeObra` |
| 5 | El bloqueo por preocupacional y ARCA frena a los veteranos; la Hoja del día no conoce "altura" | **Aplicado.** Preocupacional y ARCA bloquean solo altas nuevas; el apto de altura se controla para todo el personal de obra; B3 pasa a ser "habilitación para salir a obra"; **el planificador puede destrabar** con motivo y aviso inmediato a JS |
| 6 | Compra contra construcción no compara lo que corresponde | **Aplicado.** Tabla función por función, costo de construir en semanas (4 a 5 meses para las etapas 0 a 3) y la cotización de recibos como **condición de entrada de la 2a** |
| 7 | La firma del recibo no dice quién carga con la prueba | **Aplicado.** Evidencia completa en C0, adhesión en papel, registro de apertura y descarga con la aclaración de que no es una constancia firmada |
| 8 | Contradicciones de privacidad | **Aplicado.** El operador ve todos los sueldos (pregunta 4 lo asume); en el celular solo el semáforo; a los comitentes solo la constancia "apto" con consentimiento; lectura registrada; inscripción ante la AAIP como pregunta al abogado |
| 9 | Faltan las novedades mensuales al contador | **Aplicado.** Nueva función D3, export, sin escribir `x_parte_diario` |
| 10 | La baja no corta los accesos | **Aplicado.** F1 revoca PIN, credencial, links, Telegram y usuario |
| 11 | Faltan los contratistas | **Aplicado.** Nueva función B5 y su lugar en B3 y B4 |
| 12 | El aviso de accidente está subestimado y va mejor en SyH | **Aplicado.** Sale de RRHH al carril de SyH. **Ajuste:** dejo la ficha "qué hacer si hay un accidente" con el teléfono de la ART en G2, adelantable, porque es un texto y cubre el hueco mientras SyH no tenga fecha |
| 13 | Sobreingeniería | **Aplicado:** G2, G3 y G4 solo si sobra; el QR por pieza va al pañol; exportación a pedido en lugar de acceso propio para la ART (con la duda de si alcanza, que va a la ART). **Ajuste en E2:** en la propuesta de consenso los cumpleaños ya estaban en la etapa 3, no en la 2b, así que no había nada que sacar de ahí. Lo que sí se recortó: queda solo el aviso a JS el día anterior, y el saludo automático espera a que exista un canal automático |
| 14 | El capataz ve "enfermedad" | **Aplicado.** Ve "ausente con aviso" |
| 15 | El certificado ReNaPDiS llega como link o QR | **Aplicado.** D1 acepta PDF, link o foto del QR |
| 16 | El segundo factor es débil | **Aplicado.** Se saca el respaldo del DNI; quien no tiene PIN lo recibe en persona |

### Afirmaciones corregidas

| # | Decía | Ahora dice |
|---|---|---|
| 1 | El bot de Telegram ya funciona | Falta crearlo y estaba pensado para capataces, choferes y depósito |
| 2 | La carpeta la piden en el 82 % de las obras | El 82 % pide solo la Nómina ART; el paquete con papeles por persona, un 1 % |
| 3 | WhatsApp Cloud con costo por conversación | Desde el 1/7/2025 se cobra por mensaje; las plantillas de utilidad dentro de las 24 h son gratis; la tarifa para Argentina no está verificada |
| 4 | A la oficina le toca el FAL (tabla de usuarios) | Sacado de la tabla de usuarios; queda en "no cubre" como tema del contador |
| 5 | HyS, ¿interno o externo? | El repo nombra a Iñaki Capurro como técnico de SyH; falta confirmar si es el responsable |
| 6 | Unas 40 personas | Unas 45: 30 de obra activos y 15 de oficina en Odoo |
| 7 | A2 es esfuerzo S | Es M |
| 8 | Disp. GP SRT 3/2022 contra Disp. SRT GP 2/2021 en el pañol | Se usa 3/2022, la verificada. Queda pendiente corregir `docs/panol/modulo.md:230` (no lo toqué: no es parte de este entregable) |
| 9 | Libros laborales: ya no hacen falta | Agregado: no está confirmado si el Libro de Sueldos Digital sigue siendo la vía del F.931 |
| 10 | Art. 197 bis (bolsa de horas) | Marcado como fuente secundaria |
| 11 | Art. 150 (días por antigüedad) | Marcado como no verificado del todo |
| 12 | Res. 346/19, no confirmado | Se mantiene, con la consulta del CPCE Salta y el abogado como respaldo |

**Fuentes que sumó la auditoría:**
- [Ley 27.802, Boletín Oficial](https://www.boletinoficial.gob.ar/detalleAviso/primera/339128/20260306)
- [Res. 346/2019, Abogados.com.ar](https://abogados.com.ar/resolucion-no-3462019-del-ministerio-de-produccion-y-trabajo-recibo-de-sueldo-digital/23487)
- [Consulta sobre el nuevo recibo, CPCE Salta](https://www.consejosalta.org.ar/wp-content/uploads/CONSULTA-Nuevo-Recibo-de-Sueldos.pdf)
- [Precios de WhatsApp Business, Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Precio por mensaje desde el 1/7/2025, Gallabox](https://docs.gallabox.com/pricing-and-billing-modules/new-per-message-pricing-effective-july-1-2025)
- [Precio por mensaje, Wati](https://support.wati.io/en/articles/11561662-message-based-pricing-all-you-need-to-know)

---

## 10. Preguntas para JS

1. **¿Quién de administración opera RRHH?**
   *Recomendación:* nombrar a una persona antes de arrancar y no empezar la etapa 1 sin ella. Medir cuántas horas le saca el módulo.
2. **Recibos (y vacaciones): ¿construir o contratar?**
   *Recomendación:* construir la etapa 1 ya. Para recibos, pedir tres cotizaciones en la etapa 0 (portal del contador, Humand y un proveedor local) y decidir **antes** de la etapa 2a. Si el portal del contador lo resuelve barato, usarlo.
3. **¿Por dónde le llega el link al operario?**
   *Recomendación:* relevar a cada uno en la etapa 0. Por defecto, WhatsApp manual desde la oficina. Telegram para quien lo tenga, creando el bot pendiente de la Hoja del día. WhatsApp Cloud solo si el envío manual pesa, con un número distinto del de Tomás para no mezclar clientes con empleados (criterio del panel).
4. **¿Quién ve salud, sueldos y sanciones?**
   *Recomendación:* el operador de RRHH y JS, nadie más, tampoco los familiares que trabajan en la oficina, salvo que JS lo decida por escrito. **Asumí que el operador ve todos los sueldos** si es quien corta el PDF sábana (salvo que lo haga el contador o JS). Toda lectura de datos sensibles queda registrada. El capataz ve solo "apto / no apto / vence" y "ausente con aviso".
5. **La oficina: ¿cambiás la decisión del 10/10 de que los 15 administrativos no lleven legajo?**
   Hay dos caminos: (a) meterlos en `personal` y cuidar que no aparezcan en la Hoja del día ni en el kiosco; (b) una ficha propia de RRHH que no sea `personal`, y que `hd_ausencias` acepte esa referencia.
   *Recomendación:* (b). Respeta tu decisión, no toca la Hoja del día y la ficha de RRHH sirve igual para obra.
6. **Habilitación para salir a obra: ¿aceptás el bloqueo así?**
   *Recomendación:* sí. Apto de altura para todo el personal de obra; preocupacional y ARCA solo para quienes entren después de la puesta en marcha; advertencia hasta que la carga esté completa y bloqueo después; **el planificador puede destrabar** con motivo y te llega el aviso al instante; HyS revisa.
7. **¿Quién aprueba las vacaciones?**
   *Recomendación:* en obra, el planificador o vos, con la opinión del capataz; en la oficina, el jefe directo o vos. ¿Querés que el sistema sugiera turnos por cuadrilla para la temporada de 1/10 a 30/04?
8. **¿Le ponés fecha y responsable a un módulo de SyH** (PTS, charla de 5 minutos, verificación del andamio y aviso de accidente)? ¿Iñaki Capurro es el responsable de HyS o solo un técnico? ¿Hay un servicio externo?
   *Recomendación:* fecha propia, fuera de RRHH, y que el aviso de accidente sea lo primero que se haga ahí.
9. **¿Juan Pablo y vos aprueban la asistencia precargada que escribe `x_parte_diario`?**
   *Recomendación:* sí, en carril aparte, con un mes de doble carga comparando diferencias.
10. **¿En qué orden van RRHH, Sistemas y el rediseño de partes?**
    *Recomendación:* hacer la etapa 0 de RRHH ya (son preguntas, cotizaciones y el inventario de la RLS, que es urgente igual) y decidir después cuándo entra la etapa 1.
11. **Adelantos de sueldo: ¿con tope?, ¿quién aprueba?, ¿se piden por el link?**
    *Recomendación:* no ponerlos hasta que estén definidos.
12. **¿Pedimos a la ART** la periodicidad del apto de altura, si una exportación a pedido alcanza para las constancias de EPP y si ABA hace el aviso de obra y su propio Programa de Seguridad en cada obra?
    *Recomendación:* sí, en la etapa 0.
13. **¿Controlamos los papeles de los contratistas?**
    *Recomendación:* sí, solo apto, EPP y alta o seguro, para que entren al control de salida a obra (B5).
14. **¿Consultamos a un abogado laboral** por la firma del recibo (Res. 346/19 y Ley 25.506) y la inscripción ante la AAIP?
    *Recomendación:* sí, una consulta puntual en la etapa 0, antes de dejar el papel.
15. **¿Hacemos el pulso anónimo?**
    *Recomendación:* solo si sobra, semestral, empresa entera y obra contra oficina con 8 respuestas o más. Y no intentar adivinar quién respondió qué.

---

## 11. Pantallas para la maqueta

**Para el equipo de UX y UI.** Dos recorridos con el mismo peso, más la vista del operador:
- **OFICINA:** escritorio, dentro de AndamiosOS, con su sistema de diseño (DM Sans, primario coral ABA `#D85A30`, tema oscuro por defecto, sidebar oscuro, componentes shadcn). El módulo vive en el grupo "Personal y flota" del menú.
- **OBRA:** celular y kiosco. Tema claro, alto contraste, texto grande, botones grandes para usar con guantes y al sol, una acción por pantalla. Se muestra dentro del marco de teléfono que ya usa la Hoja del día. Tiene que verse cómo es **sin señal** y que nada se reproduce solo.

**Datos de ejemplo:** todos los nombres, obras y comitentes son **inventados**. No usar nombres reales de empleados ni de clientes. Montos de recibos: ficticios y marcados como tales. Fecha de la maqueta: viernes 17/10/2026.

**Elenco sugerido:**

| Persona | Puesto | Mundo | Para mostrar |
|---|---|---|---|
| Ramiro Ledesma | Oficial montador, cuadrilla 3 | Obra | Todo en verde, firma el recibo, pide vacaciones |
| Mauro Giménez | Ayudante, cuadrilla 3 | Obra | Apto de altura vencido el 02/10, sin PIN todavía |
| Héctor "Tito" Paz | Capataz, cuadrilla 3, responsable de la tarea en altura | Obra | Pide en nombre de otro, opina |
| Walter Sosa | Chofer del camión con hidrogrúa | Obra | Registro de conducir que vence en 12 días |
| Néstor Aguirre | Encargado de pañol | Depósito | Entrega EPP en el kiosco |
| Brian Quiroga | Medio oficial, alta del 06/10 | Obra | Alta nueva sin preocupacional cargado (bloqueo real) |
| Lucas Ferreyra | Ayudante, baja el 15/10 | Obra | Checklist de baja |
| Carolina Benítez | Administración (en la maqueta, la operadora de RRHH) | Oficina | Tablero, recibos, novedades |
| Lucía Ferraro | Comercial | Oficina | Recibo y vacaciones desde la web |
| Ing. Pablo Rinaldi | Oficina técnica | Oficina | Jefe directo que aprueba |
| Daniela Ojeda | Logística y planificación | Oficina | Planificadora que arma la Hoja del día |
| Sergio Molina | Montador de la cuadrilla tercerizada "Montajes Molina" | Contratista | Papeles de contratista |

**Obras de ejemplo:** "Fachada Av. Cabildo 2350" (comitente: Constructora Vértice SA, paquete Básico); "Torre Parque Chas, calle Bauness 1800" (comitente: Desarrollos Ombú SRL, paquete Completo); "Colegio en Ramos Mejía" (paquete Básico más no repetición).

### OFICINA (escritorio, dentro de AndamiosOS)

**O1. Tablero de RRHH (vista del operador)**
- **Muestra:** dotación (45: 30 obra, 15 oficina, más 4 de contratistas); tarjetas con "Vencen en 30 días: 6", "Vencidos: 2", "Fuera de la última Nómina ART: 1 (Brian Quiroga, obra Av. Cabildo 2350, sale el lunes)", "Hoy no voy a confirmar: 2", "Firmas pendientes del recibo de septiembre: 9 de 45", "Comunicados sin 'Entendido': 7", "Destrabes de esta semana: 1".
- **Acciones:** abrir cada lista, "Pedir actualización de nómina al contador", "Reenviar por WhatsApp", "Ver destrabes".

**O2. Personas**
- **Muestra:** tabla con filtros Obra / Oficina / Contratistas, búsqueda, columnas nombre, puesto, cuadrilla o área, semáforo de habilitación, canal (WhatsApp, Telegram, kiosco), PIN sí/no.
- **Ejemplo:** Mauro Giménez en rojo ("apto de altura vencido 02/10"); Walter Sosa en amarillo ("registro vence 29/10"); Lucía Ferraro sin semáforo de obra.
- **Acciones:** abrir ficha, "Nueva alta", exportar.

**O3. Ficha de persona de obra (Ramiro Ledesma)**
- **Muestra:** encabezado con puesto, cuadrilla 3, capataz Tito Paz, ingreso 03/2019 (7 años: 21 días de vacaciones), convenio UOCRA, categoría oficial, responsable de altura: no. Pestañas: Datos, Papeles (apto vigente hasta 14/03/2027, curso de altura vigente, EPP entregado 08/09), Ausencias y vacaciones, Recibos (septiembre firmado conforme el 06/10 09:12, desde su celular), Sensible.
- **Pestaña Sensible:** bloqueada con candado; al abrirla, aviso "Tu lectura queda registrada" y el registro de quién miró.
- **Acciones:** editar datos, subir documento, ver evidencia de una firma (token, PIN validado, hora, dispositivo, hash), "Mandar link por WhatsApp".

**O4. Ficha de persona de oficina (Lucía Ferraro)**
- **Muestra:** área comercial, jefe directo según el organigrama, convenio "a confirmar con el contador", sin pasaporte de obra. Recibos, vacaciones (saldo 14 días), comunicados.
- **Acciones:** las mismas que O3 sin las de obra.

**O5. Vencimientos**
- **Muestra:** lista ordenada por fecha con semáforo: Mauro Giménez, apto de altura, vencido; Walter Sosa, registro de conducir, 29/10; Tito Paz, curso de altura, 15/11; Sergio Molina (contratista), apto, 20/11.
- **Acciones:** "Pedir turno a la ART", "Subir el nuevo", "Avisar a la persona", filtros por tipo y por cuadrilla.

**O6. Subir documento**
- **Muestra:** diálogo con persona, tipo (apto de altura, curso, preocupacional, registro, alta ARCA, sanción restringida), emisión, vencimiento, entidad, archivo o foto, casilla "solo se guarda la constancia apto / no apto".
- **Acciones:** guardar, cancelar.

**O7. Control contra la Nómina ART (en Habilitaciones)**
- **Muestra:** obra "Fachada Av. Cabildo 2350", paquete Básico, última nómina subida el 01/10. Cuadrilla 3 asignada para el lunes 20/10: Ledesma, Giménez, Paz (figuran) y Brian Quiroga (**no figura**, alta del 06/10).
- **Acciones:** "Pedir nómina actualizada al contador" (arma el mail), "Subir nómina nueva", "Ver en la Hoja del día".

**O8. Carpeta completa por comitente** (obra "Torre Parque Chas", paquete Completo)
- **Muestra:** dos bloques. **Empresa:** F.931 de septiembre y su pago, certificado ART con nómina, no repetición a favor de Desarrollos Ombú SRL, seguro de vida, certificado del IERIC. **Personas de la cuadrilla:** apto (solo constancia), cursos, EPP. Indicador de consentimiento por persona; quien no lo dio aparece en gris.
- **Acciones:** "Armar ZIP", "Copiar link temporal (vence en 7 días)", "Pedir consentimiento".

**O9. Hoja del día con habilitación** (vista de la planificadora Daniela Ojeda)
- **Muestra:** al arrastrar a Mauro Giménez a la cuadrilla 3: en modo advertencia, cartel amarillo "Apto de altura vencido el 02/10. Queda registrado si lo asignás"; en modo bloqueo, cartel rojo y botón "Destrabar". Brian Quiroga: "Alta nueva sin preocupacional: no puede salir a obra".
- **Acciones:** "Destrabar" con motivo obligatorio ("Tiene turno en la ART el martes, va solo a tareas en planta baja") y aviso "Le avisamos a JS ahora"; elegir a otro.

**O10. Recibos del mes** (si se decide construir)
- **Muestra:** paso 1, subir el PDF sábana de septiembre; paso 2, "Encontramos 45 recibos por CUIL, 1 sin coincidencia" con la página para asignar a mano; paso 3, enviar. Después, estado: 36 firmados (33 conformes, 3 en disconformidad), 5 abiertos sin firmar, 4 sin abrir.
- **Acciones:** asignar a mano, enviar, recordatorio a pendientes, ver disconformidades.

**O11. Comunicados**
- **Muestra:** redactar con alcance (Todos / Oficina / Obra / Cuadrilla / Persona, Y/O), texto corto, audio grabado opcional, aviso de horario ("Se envía el lunes 7:00: no se manda después de las 21 h ni los domingos"). Ejemplo: "Desde el lunes 27/10 el arnés se retira y se devuelve en el pañol todos los días" (obra). Tablero: 38 de 45 "Entendido", lista de los 7 pendientes con su canal.
- **Acciones:** publicar, grabar audio, reenviar a pendientes por WhatsApp.

**O12. Ausencias y vacaciones (bandeja)**
- **Muestra:** "Hoy no voy" de Mauro Giménez a confirmar (certificado: link ReNaPDiS, matrícula cargada); pedido de vacaciones de Ramiro Ledesma del 05/01 al 18/01 con la opinión de Tito Paz ("Sí, pero que no salga junto con Giménez") y la cobertura de la cuadrilla esa quincena.
- **Acciones:** confirmar, aprobar, rechazar con motivo visible para el empleado, generar constancia de aviso con 30 días.

**O13. Novedades del mes para el contador**
- **Muestra:** octubre 2026: por persona, días de ausencia por tipo, vacaciones, licencias, ART, altas (Brian Quiroga 06/10) y bajas (Lucas Ferreyra 15/10). Diferencias con `x_parte_diario` marcadas.
- **Acciones:** revisar, exportar en el formato del contador, marcar "enviado".

**O14. Alta y baja**
- **Muestra:** baja de Lucas Ferreyra: devolución de EPP (botines y casco devueltos, arnés pendiente), Fondo de Cese a entregar antes del 17/10 a la tarde, certificado del art. 80, **accesos**: PIN revocado, 2 links pendientes invalidados, Telegram no tenía. Alta de Brian Quiroga: lo que falta y lo que bloquea (solo preocupacional).
- **Acciones:** tildar, adjuntar constancia, cerrar.

**O15. "Mi espacio" para el personal de oficina** (Lucía Ferraro, en la web)
- **Muestra:** recibo de septiembre para firmar, saldo de vacaciones, comunicado sin leer en la campanita, sus datos.
- **Acciones:** firmar con PIN o con su sesión, pedir vacaciones, "Entendido", avisar un dato mal.

### OBRA (celular, kiosco y WhatsApp)

**M1. El mensaje que llega por WhatsApp**
- **Muestra:** el chat de WhatsApp de Ramiro con el número de la oficina: "Hola Ramiro, tenés el recibo de septiembre para firmar. Abrí este link: …". Variante: el mismo aviso por Telegram. Variante: comunicado "Leé esto y tocá Entendido".
- **Acciones:** tocar el link.

**M2. Inicio del link**
- **Muestra:** "Hola Ramiro" y botones grandes con contador: "Firmar recibo (1)", "Comunicado nuevo (1)", "Avisar que no voy", "Pedir vacaciones", "Mis papeles". Barra arriba "Sin señal: lo que hagas se manda cuando vuelva" cuando corresponde.
- **Acciones:** entrar a cada uno.

**M3. Firmar el recibo**
- **Muestra:** resumen en HTML liviano (período, neto, importe ficticio), botón "Bajar el PDF" (opcional, avisa el peso), dos opciones grandes "Firmo conforme" / "Firmo en disconformidad" (con texto), pedido del PIN del pañol, firma con el dedo, constancia final "Firmado el 17/10 a las 18:42. Te queda guardado".
- **Variante:** Mauro sin PIN: "Pasá por el pañol a buscar tu PIN. El recibo lo podés ver y bajar igual".

**M4. Comunicado con "Entendido"**
- **Muestra:** texto corto y grande, reproductor de audio de JS **detenido** ("Tocá para escuchar, 40 segundos"), botón "Entendido".
- **Acciones:** escuchar, Entendido.

**M5. "Hoy no voy"**
- **Muestra:** motivos en botones (Enfermo, Trámite, Familiar, Otro); si es enfermedad, "Subí el certificado: PDF, link o foto del QR"; confirmación "Le avisamos a Daniela (planificación). Tu capataz ve solo que avisaste".
- **Acciones:** elegir, subir, mandar.

**M6. Pedir vacaciones**
- **Muestra:** "Te quedan 21 días"; elegir desde y hasta (avisa si el tramo es menor a 7 días); estado del pedido; si se rechaza, el motivo ("Esa quincena salen dos de la cuadrilla 3, ¿podés la siguiente?").
- **Acciones:** pedir, cancelar, "¿Cuántos días me quedan?".

**M7. "Mis papeles"** (funciona sin señal)
- **Muestra:** tarjeta para mostrar en el portón: nombre, foto opcional, "Apto de altura: vigente hasta 14/03/2027", "Curso de altura: vigente", "EPP: entregado 08/09". Sin recibos ni certificados. Variante de Mauro: apto en rojo con "Ya te sacamos turno: martes 21/10, 8 h".
- **Acciones:** "Avisar un dato mal".

**M8. Capataz: pedir en nombre de otro** (Tito Paz)
- **Muestra:** lista de la cuadrilla 3 precargada, elegir persona, elegir "Vacaciones" o "No viene"; para un pedido ajeno, "Tu opinión: Sí / No / Sí, pero…". Todo en menos de un minuto.
- **Acciones:** mandar.

**M9. Kiosco del pañol: entrega de EPP** (Néstor Aguirre y Ramiro)
- **Muestra:** "¿Quién sos?" con QR o PIN; lista de ítems (arnés con su código, casco, botines talle 42, guantes) con marca, certificación y fecha; pantalla de firma; constancia "Guardada en tu ficha".
- **Acciones:** escanear, confirmar ítems, firmar.

**M10. Kiosco: lo pendiente de quien no tiene celular**
- **Muestra:** después del PIN, "Tenés 1 recibo para firmar y 1 comunicado"; mismas pantallas que M3 y M4 en formato tablet; se cierra solo a los 60 segundos sin uso.
- **Acciones:** firmar, Entendido, salir.

---

*Registro: [`investigacion.md`](./investigacion.md) (los cuatro informes) y [`debate.md`](./debate.md) (propuestas, réplicas y auditoría).*
