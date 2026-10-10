# Módulo Pañol — propuesta

Estado: propuesta v2 (10/10/2026). Incorpora la revisión de circuito completo y las decisiones del dueño. **La fase 1 está en producción desde el 10/10** (ver `docs/panol/handoff.md`); la fase 2 (§12) sigue pendiente. Maqueta: https://claude.ai/artifact/JKriLmTTNgnWXNXrnRsCcM

El pañol tiene que contestar cuatro preguntas:
- **Qué insumo se llevó quién, y para qué obra.**
- **Dónde está cada herramienta, y quién la tiene** (una persona, una cuadrilla o una obra).
- **Qué falta, qué se perdió y quién responde.**
- **Qué tiene un mantenimiento o una inspección pendiente.**

Para el operario, la regla es que un retiro se hace en **menos de 10 segundos**: escanea, toca la cantidad y confirma. Si no es así de rápido, la gente no lo registra.

---

## 1. Qué se controla

### Tipos de artículo

| Tipo | Cómo se cuenta | Ejemplos | ¿Vuelve? |
|---|---|---|---|
| **Insumo** | por cantidad | tornillos, precintos, alambre, discos de corte, cinta | no (salvo los sobrantes) |
| **Herramienta con número** | por unidad, cada una con su QR | amoladoras, atornilladoras, alargues, arneses, cabos de vida, roldanas, sogas, eslingas | sí |
| **Herramienta a granel** | por cantidad | llaves comunes, martillos, niveles chicos | sí |

- **Seguridad crítica** no es un tipo aparte: es una marca que se le pone a un artículo (arneses, cabos de vida, eslingas, roldanas, sogas de izado). Esos artículos tienen inspección y **no se pueden usar con la inspección vencida** (ver §8). Todo lo que es de seguridad crítica se maneja con número, para poder seguir unidad por unidad.
- **"Equipo de cuadrilla"** tampoco es un tipo: es lo que queda a nombre de una cuadrilla (ver "Quién lo tiene").
- **EPP con talle** (guantes, botines, ropa) entra en la **fase 1** como insumo, con **variantes por talle**: cada talle tiene su propio stock. El EPP que vuelve (un casco o un arnés personal) es una herramienta con número. La constancia firmada de la Res. SRT 299/2011 es de la fase 2.
- **Unidades**: cada artículo tiene una unidad de retiro (unidad, metro, rollo, par, kg). Si se compra en otra, se guarda la unidad de compra con un factor de conversión (por ejemplo, una bolsa de 100 son 100 unidades). Los retiros se registran siempre en la unidad de retiro.
- **Stock**: cada artículo tiene un **mínimo**, que dispara la alerta, y un **reponer hasta**, que es la cantidad a la que conviene volver. La diferencia entre el stock actual y "reponer hasta" es la cantidad sugerida para pedir.

### Quién lo tiene (titular)

Lo que está afuera del pañol siempre tiene un **titular**, que es distinto de la ubicación:
- **Una persona**: por ejemplo, una amoladora para un trabajo puntual. Tiene fecha de devolución prevista.
- **Una cuadrilla**, con su **capataz como responsable**. Las cuadrillas se toman de la tabla `cuadrillas` de AndamiosOS (`responsable_id → personal`). Las de Odoo (`x_aba_cuadrilla`) no tienen capataz y se usan solo para saber, desde Planificación, en qué obra está cada una hoy.
  - **Las máquinas (atornilladoras, alargues) y el equipo (sogas, cabos de vida, roldanas) se quedan con la cuadrilla** y van con ella de obra en obra. No tienen fecha de vuelta. Si en una salida se marca "vuelve hoy", queda como préstamo del día.
  - En cada movimiento se guarda **quién era el capataz en ese momento**. Si después cambia el capataz, el historial no se reescribe.
- **Una obra**: para lo que queda fijo en el lugar.

Las cuadrillas retiran **varias cosas en un solo vale** y devuelven **en partes**.

## 2. Dónde está (ubicaciones)

- **Ubicaciones del pañol**: un árbol, por ejemplo **Pañol › Estantería E3 › Estante 2 › Cajón E3-2-04**. Hay un solo pañol más el depósito; sumar otro más adelante no cambia el modelo.
- **Ubicaciones de afuera**: **Obra (OT)**, **Camioneta** (fase 2), **Taller externo**, **Faltante**, **Perdida/Robada** y **Baja**.

El stock se lleva **por artículo, ubicación y titular**. Así se puede saber, por ejemplo, que de 10 martillos 5 están en el pañol, 3 los tiene Diego y 2 la Cuadrilla 5.

## 3. Cómo se registra (un solo historial)

- **Un único historial de movimientos, al que solo se le agregan filas.** Cada movimiento guarda:
  - qué artículo o qué unidad, y cuánto;
  - desde dónde y hacia dónde;
  - el **titular** (persona o cuadrilla, y el capataz de ese momento);
  - **quién lo registró** y desde qué dispositivo;
  - la obra (OT), cuándo y una nota.
- **El stock nunca se edita a mano**: es la suma de los movimientos, y lo mantiene un trigger (`pan_saldos`).
- **Tipos de movimiento**: retiro, devolución, devolución de sobrante, ingreso por compra, transferencia (obra↔obra, persona↔cuadrilla, cuadrilla↔cuadrilla), ajuste por conteo, envío a taller y vuelta del taller, faltante, pérdida o robo, recuperada, baja y **anulación**.
- **Cómo se corrige un error.** El **Deshacer** dura unos 10 segundos. Después, un encargado puede **anular** un movimiento: indica un motivo y se genera el movimiento inverso, enlazado al original. Nada se borra.
  - Ejemplo: alguien cargó 1000 en lugar de 100. Se anula y se carga bien.
  - Ejemplo: se cargó a la obra equivocada. Se anula y se vuelve a cargar con la OT correcta.
- **Obra**: el retiro se asigna a una OT de Odoo, y se propone la de la cuadrilla de hoy según Planificación, o la última que usó esa persona. **La obra no es obligatoria**: sin OT, el retiro va a "Taller/Depósito".
  - La **devolución de un sobrante** pregunta de qué obra vuelve y propone la del último retiro de ese artículo. Así el consumo por obra no queda inflado.
- **Stock negativo**: se avisa pero no se bloquea. Aparece en la bandeja para que lo revise un encargado.
- **Movimientos simultáneos**: si dos kioscos prestan la misma unidad al mismo tiempo, la RPC resuelve el conflicto. Si se escanea dos veces la misma unidad con número, el segundo escaneo se ignora.

## 4. QR y etiquetas

- **Qué lleva cada QR**: una dirección corta (`https://<dominio>/p/E7K2QX`) con un código de 6 a 8 caracteres que no dice nada por sí mismo. La tabla `pan_codigos` traduce el código a lo que está etiquetado.
  - Escaneado con la **cámara del celular**, abre la ficha (pide login).
  - Escaneado con el **escáner de la app**, se procesa en el momento, sin cambiar de pantalla.
- **Qué se etiqueta**:
  - un QR por **cajón**;
  - un QR por **estante** (al escanearlo, abre la lista de lo que hay en ese estante);
  - un QR por **herramienta con número**;
  - un QR por **credencial** de persona.
  - Los códigos de barras de fábrica también se leen.
- **Reimprimir anula el código viejo.** Si una etiqueta se rompe, se reimprime con un código nuevo y el viejo queda inválido. Si alguien escanea el viejo, la app lo avisa.
- **Sin QR o sin alta**: en el kiosco, la opción **"No tiene código"** permite buscar por nombre o por foto. Si el artículo no está cargado, **"Me llevo algo que no está"** pide un texto libre y una foto opcional, se registra igual y aparece en la bandeja para que alguien le dé de alta. Nunca hay que llevarse algo sin registrarlo.
- **Etiquetas**:
  - Corrección de error **Q**, o **H** en las herramientas que se golpean.
  - **25 mm** para cajones y herramientas, **40–50 mm** para estantes.
  - **Poliéster o vinilo laminado**.
  - Se generan en PDF con `qrcode` y `@react-pdf/renderer`, que ya están en el proyecto.
  - Al dar de alta N unidades, los códigos se generan solos y quedan esperando en "Etiquetas › Solo las nuevas".
- **Escáner**: `barcode-detector`. En Android usa la lectura nativa; en iPhone, una versión en WASM que servimos nosotros.
  - La cámara se pide una sola vez y queda abierta mientras se usa el pañol.
  - Siempre están disponibles la **linterna** y **"Escribir el código"**.

## 5. Quién lo hace

### Dispositivos

| Dónde | Dispositivo | Modo |
|---|---|---|
| **Pañol** | celular o tablet **fijo y compartido** | **kiosco** (ver abajo) |
| **Pañol / depósito** | celular de **quien esté a cargo** | login propio: ingresos, revisión de devoluciones, conteos, anulaciones |
| **Depósito** | **tablet** | kiosco, más conteo, control de cuadrilla y "¿Qué hay afuera?" |
| **Oficina** | **computadora** | bandeja, catálogo, ubicaciones, etiquetas, configuración, reportes, mantenimiento |

No conviene que cada operario use su celular personal: tendría que instalar la app, en el iPhone la sesión no se comparte entre Safari y la app instalada, y dependería de sus datos móviles.

### El kiosco

- El dispositivo queda logueado con un **usuario de kiosco**, marcado como tal. Ese usuario **solo puede registrar movimientos a través de RPC** y no puede entrar a las pantallas de oficina.
- **No cuenta como encargado**: no recibe avisos, no figura en la lista de encargados y no aprueba nada.
- **Cada operación empieza con "¿Quién sos?"**: se escanea la credencial o se ingresa un PIN de 4 dígitos.
  - Esto vale también para la **vuelta de una cuadrilla**.
  - Después de confirmar, o tras 60 segundos sin uso, vuelve a preguntar quién es.
- **El PIN**:
  - es único por persona y se guarda hasheado;
  - se bloquea después de 3 intentos fallidos;
  - si alguien lo olvida, un encargado le genera uno nuevo desde el celular o desde la oficina.
- **Credencial perdida**: se reimprime, y la vieja queda anulada.

### Personas

- La lista sale de **`personal`** (Legajos).
- Las **cuadrillas tercerizadas** también retiran. Su gente no está en Legajos, así que se carga con un **alta rápida de persona externa** (nombre, DNI, empresa, cuadrilla). Recibe credencial igual que el resto y queda marcada como externa.

### Quién está a cargo

- Hay un responsable del pañol, pero no siempre está y a veces lo reemplazan otras personas. **No existe un rol único de "pañolero".**
- Está **a cargo** cualquiera que tenga permiso **"editar" en Pañol** (se da por persona en Usuarios) y que tenga su legajo vinculado (`personal.user_id`, un campo nuevo).
  - En el kiosco, un encargado se identifica con su credencial y su PIN, y así se le habilitan las funciones de encargado (aprobar, anular, recibir la devolución de algo con falla).
- Los avisos de "Les avisamos a los encargados del pañol" llegan a todos ellos.
- Cuando no hay nadie, **el kiosco funciona en autoservicio** y todo queda registrado. Cada mañana, un encargado revisa el **resumen de lo que se movió sin nadie a cargo**.

### Quién puede hacer qué

| Acción | Operario (kiosco) | Encargado | Oficina (ver) | Admin |
|---|---|---|---|---|
| Retirar, devolver, pedir prestado, devolver sobrante, salida y vuelta de cuadrilla | sí | sí | — | sí |
| Contar | — | sí | — | sí |
| Aprobar un ajuste de conteo (no puede aprobarlo quien contó) | — | sí | — | sí |
| Anular un movimiento, pasar a pérdida, dar de baja | — | sí | — | sí |
| Ingreso de compra, alta de artículo o de unidad | — | sí | — | sí |
| Configuración | — | — | — | sí |
| Ver la bandeja y los reportes | — | sí | sí | sí |

**Los retiros de insumos no piden aprobación**, pero siempre queda registro.

## 6. Flujos

### Kiosco (pañol / depósito)
1. **Retiro de insumos**: ¿Quién sos? → **Retirar** → se escanea el cajón o el estante (o "No tiene código") → cantidad (−/+ grandes, +5, +10, "caja") → **Agregar** → se escanea el siguiente → **Confirmar retiro**, con la obra propuesta → pantalla verde con **Deshacer** → vuelve a "¿Quién sos?".
2. **Devolución de sobrante**: ¿Quién sos? → **Devolver sobrante** → se escanea → cantidad → **¿De qué obra vuelve?** (se propone una) → vuelve al stock.
3. **Préstamo de herramienta** a una persona: se escanea la herramienta → obra y **fecha de devolución prevista** → confirmar. **Con seguridad crítica e inspección vencida no se presta**, y la app propone otras unidades que están al día.
4. **Devolución de herramienta**: se escanea → **¿En qué estado vuelve?** (**Bien** / **Con falla** / **Incompleta**).
   - Si vuelve con falla o incompleta: motivo, foto opcional, queda "En revisión" y se abre un correctivo.
   - **Si figura a nombre de otra persona**, la app pregunta: "Lo tiene Diego. ¿Te lo pasó o lo devolvés por él?".
     - **Me lo pasó**: se registra la transferencia y queda a nombre de quien escanea.
     - **Lo devuelvo por él**: se registra la devolución, indicando quién la trajo.
5. **Salida con una cuadrilla**: ¿Quién sos? → ¿Para qué cuadrilla? (propone la de hoy según Planificación) → se escanea todo, máquinas, equipo e insumos → **control de salida** por máquina (**Bien** / **Incompleta**, con foto opcional) → obra → confirmar. Queda el vale a nombre del capataz. Se puede marcar "vuelve hoy".
6. **Vuelta de una cuadrilla**: **¿Quién sos?** → cuadrilla → se escanea lo que vuelve. La app muestra lo que **sigue afuera**.
   - Cada máquina vuelve con **Bien** / **Con falla** / **Incompleta** (el mismo criterio que la devolución de herramienta), comparado con cómo salió. Si vuelve con falla, se abre un correctivo.
   - **Cerrar por hoy** deja el resto a nombre de la cuadrilla.
   - Los insumos no se devuelven acá: lo que sobra va por "Devolver sobrante".

### Encargado (tablet o celular)
7. **Conteo cíclico**: se escanea el estante → la app lista lo que debería haber → **se carga lo contado sin ver lo esperado**.
   - Se puede agregar **"Encontré otra cosa"**.
   - Las herramientas con número se cuentan escaneándolas una por una; las a granel, por cantidad.
   - Lo esperado se calcula **al cerrar el conteo**, descontando lo que se movió mientras se contaba.
   - Si la diferencia supera el umbral, queda en **"Ajustes por aprobar"**, y la tiene que aprobar otro encargado.
8. **Control del equipo de una cuadrilla** (periódico): se elige la cuadrilla → se escanea lo que tiene.
   - Lo que no aparece queda como **Faltante**, a cargo del capataz.
   - Lo que tiene la inspección vencida queda marcado **"No usar"**.
9. **Transferencia** desde "¿Qué hay afuera?": **Pasar a…** otra persona, otra cuadrilla u otra obra.
10. **Ingreso de compra**: artículo, cantidad en la unidad de compra (se convierte sola), **costo unitario**, proveedor, número de remito o factura y fecha.
11. **Alta de unidades**: artículo, cantidad de unidades, número de serie, fecha y costo de compra. Los códigos se generan solos y quedan listos en Etiquetas.
12. **Faltante → pérdida**:
    - Un faltante sin resolver pasa a **pérdida a los 15 días**. La app lo propone y lo confirma un encargado, que puede indicar **robo** y cargar el número de denuncia.
    - Si después aparece, se registra **"Recuperada"** y vuelve al pañol.
    - La **baja** (rota sin arreglo o vida útil cumplida) lleva motivo.
13. **Anulación** de un movimiento: un encargado, con motivo (ver §3).

### Oficina
14. **Bandeja: "¿qué hago ahora?"**, en este orden:
    - **Ajustes por aprobar.**
    - **Stock negativo.**
    - **Reponer**: lo que está bajo el mínimo, con la cantidad sugerida y "Agregar a la lista de reposición".
    - **Vencidas sin devolver**: préstamos a personas, con aviso por WhatsApp.
    - **Faltantes de cuadrilla**: a cargo del capataz, con los días que lleva cada uno.
    - **En revisión**: lo que volvió con falla.
    - **En taller externo**: lo que pasó la fecha de regreso.
    - **Inspecciones y preventivos que vencen**, incluido lo que está afuera, con la cuadrilla.
    - **Artículos sin alta**: lo que se llevó con "Me llevo algo que no está".
    - **Movido sin nadie a cargo**: el resumen del día anterior.
15. **Personas que se van**: si se da de baja un legajo, o se disuelve una cuadrilla, que tiene cosas a cargo, aparece un **aviso en la bandeja** con la lista para reasignar. **La baja no se bloquea.**
    - Si cambia el capataz, el equipo pasa al nuevo responsable y el cambio queda en el historial.

## 7. Avisos

- Pasan por `crearAlertas` y quedan en la bandeja. A los **encargados** también les llegan por el **canal de Slack del pañol**.
  - `crearAlertas` hoy reparte por rol, no por permiso de un módulo, así que hay que sumarle un destino "canal Pañol".
- A la **persona** o al **capataz** (que no usan Slack) se les avisa por **WhatsApp con un link**, usando `personal.telefono`, con el mismo mecanismo que ya usa Permisos. Se les avisa de:
  - préstamo vencido;
  - faltantes;
  - inspección vencida de algo que tienen.
- Plazos (son parámetros):
  - préstamo vencido: se avisa a las 24 h;
  - inspecciones: se avisa con 15 días de anticipación;
  - faltante: pasa a pérdida a los 15 días.

## 8. Mantenimiento e inspecciones

- **Estados de una herramienta con número**:
  - Disponible
  - Prestada (a una persona) / Con cuadrilla / En obra
  - En revisión
  - En mantenimiento (interno o en taller externo, con fecha de ida, fecha prevista de vuelta y fecha real de vuelta)
  - Fuera de servicio
  - Faltante
  - Perdida/Robada
  - Baja
  - Además, **"No apta"** se calcula sola: aparece cuando la inspección o el preventivo están vencidos.
- **Preventivo**: un tipo de artículo puede tener **varios planes**, cada uno cada N días o cada N préstamos. Por ejemplo, para una amoladora: cambiar los carbones cada 40 préstamos y revisar el cable cada 90 días.
  - Una herramienta con el preventivo vencido **se puede prestar con aviso**.
  - Una con la **inspección de seguridad vencida, no**.
- **Correctivo**: se abre con una falla declarada al devolver o con un reporte desde la obra. Registra diagnóstico, repuestos, costo, si se hace adentro o en un taller (ida y vuelta) y el resultado.
- **Seguridad crítica**: tiene fecha de próxima inspección y un checklist firmado por quien inspecciona.
  - **Si la inspección está vencida, no sale del pañol.**
  - **Si vence mientras está afuera** (por ejemplo, un cabo de vida con la cuadrilla): se avisa al capataz por WhatsApp y a Higiene y Seguridad. Queda "No usar" y se bloquea en la próxima salida o vuelta de esa cuadrilla.
  - Normativa: Res. SRT 61/2023 (Anexo III) e IRAM 3622.
- **Parámetros**: la frecuencia de inspección y los preventivos se definen **por tipo de artículo, con excepción por unidad**. Los valores iniciales los define Higiene y Seguridad.
  - Cada cambio queda en el historial.
  - La próxima fecha se recalcula a partir de la última inspección.
- **Nombres**: ya existe el módulo `/inspecciones` (aprobado/observado/rechazado). En el Pañol se dice siempre **"inspección de seguridad"** y se muestra dentro de la ficha de la herramienta, para no confundirlo con aquel módulo.
- **EPP (fase 2)**: la entrega por persona sirve como la constancia de la **Res. SRT 299/2011**, en formato digital según la **Disp. SRT GP 2/2021**. El trabajador confirma, y puede firmar con observaciones.

## 9. Sin señal

- **Fase 1**: hace falta conexión. Si se corta, el vale que se está armando no se pierde: aparece el aviso **"Sin conexión"** en todas las pantallas del kiosco (retiro, herramienta, cuadrilla) y se confirma cuando vuelve la señal.
- **Fase 3**: offline completo, con Serwist, IndexedDB y `client_uuid`. Los movimientos se suben sin duplicarse.

## 10. Reportes

- **Consumo**, filtrable **por obra, por cuadrilla y por persona**, y por período. Se valoriza con el **último costo de compra cargado** en el pañol. Con costos de Odoo, en la fase 3.
- **Qué hay afuera**, por titular y por obra.
- **Faltantes y pérdidas**, por capataz y por persona.
- **Diferencias de conteo.**
- **Historial y costo de mantenimiento**, por unidad.

## 11. Cómo encaja en AndamiosOS

- **Tablas**:
  - `pan_articulos`, `pan_variantes`, `pan_ubicaciones`;
  - `pan_unidades` (herramientas con número);
  - `pan_codigos` (QR, con `activo` para anular);
  - `pan_movimientos` (el historial: titular, capataz del momento y `anula_a`);
  - `pan_saldos` (por artículo, ubicación y titular; lo mantiene el trigger);
  - `pan_mantenimientos`, `pan_planes` (preventivos e inspecciones por tipo y por unidad);
  - `pan_credenciales` (QR y PIN hasheado);
  - `pan_personas_externas`;
  - `pan_parametros` (con su historial).
  - **No se reutilizan** `catalogo_piezas` ni `movimientos`, que son del stock de andamios.
- **Cambios fuera del módulo**:
  - `personal.user_id`, para vincular un encargado con su legajo;
  - una marca de **usuario de kiosco** en `user_profiles`;
  - el destino "canal Pañol" en `crearAlertas`.
- **Referencias externas**: las obras se guardan como `odoo_ot_id`, sin clave foránea. Las cuadrillas, como `cuadrillas.id` de Supabase. Planificación del día se lee de Odoo (`x_aba_asignacion`).
- **Rutas**:
  - **`/deposito/panol`**, en lugar del placeholder "Insumos";
  - `/deposito/panol/kiosco`, la pantalla del kiosco, con un layout propio;
  - `/p/[codigo]`, que resuelve un QR.
- **Acceso**:
  - el módulo `panol` se suma en `DEFINICION` y `APIS` (`src/lib/auth/acceso.ts`);
  - el kiosco solo usa RPC `security definer`, que validan la credencial o el PIN;
  - las anulaciones, las bajas, las pérdidas y las aprobaciones pasan por un guardia, como `guardia.ts` de Permisos.
- **Código**:
  - `src/lib/panol/{tipos,estado,servicio}.ts`; `estado.ts` es lógica pura, con tests `node --test`;
  - `src/hooks/use-panol.ts`;
  - `src/components/panol/`.
- **Diseño**: el mismo de la bandeja nueva (tarjeta de estado, un solo botón coral, Deshacer en el aviso, una señal por idea). En celular y tablet, botones de 56 px o más, alto contraste, todo usable con una mano y con guantes.

## 12. Fases

**Fase 1 (MVP)**
- Catálogo (los tres tipos, con la marca de seguridad crítica y EPP con talles), unidades, mínimo y "reponer hasta".
- Ubicaciones.
- Alta de unidades.
- QR para cajones, estantes, herramientas y credenciales; etiquetas en PDF; reimpresión que anula el código viejo.
- **Kiosco**:
  - "¿Quién sos?" con credencial o PIN, más personas externas;
  - retiro con vale;
  - devolución de sobrante con su obra;
  - préstamo y devolución con estado, incluido "lo tiene otro";
  - "No tiene código" y "Me llevo algo que no está".
- **Cuadrillas**: salida, vuelta y control de equipo; faltantes; transferencias.
- Ingreso de compra con costo.
- Conteo cíclico con ajustes por aprobar.
- Anulación, pérdida, recuperada y baja.
- Bandeja completa (§6.14), avisos por Slack y por WhatsApp, y resumen de lo movido sin nadie a cargo.
- Consumo por obra, por cuadrilla y por persona, con el último costo cargado.
- Parámetros de avisos y plazos.

**Fase 2**
- Mantenimiento correctivo y preventivo, con taller externo e historial y costo por unidad.
- Inspecciones de seguridad con checklist, bloqueo y "No usar" en obra.
- Constancia digital de entrega de EPP.
- Camionetas como ubicación.

**Fase 3**
- Offline completo.
- Costos desde Odoo.
- Borrador de pedido automático.
- Cargos por pérdida.
- Lotes y vencimientos.

## 13. Decisiones (10/10/2026)

1. **Pañoles**: uno solo, más el depósito.
2. **A cargo**: cualquiera con permiso "editar" en Pañol y con legajo vinculado. No hay jefe de pañol. El kiosco funciona en autoservicio y no cuenta como encargado.
3. **Insumos**: se retiran sin aprobación y siempre queda registro.
4. **Personas**: salen de `personal` (Legajos). Las tercerizadas también retiran, con un alta rápida de persona externa.
5. **Inspecciones y preventivos**: son parámetros por tipo, con excepción por unidad. Los valores iniciales los define Higiene y Seguridad.
6. **Cuadrillas**: entran en la fase 1. Las máquinas y el equipo se quedan con la cuadrilla, salvo que se marque "vuelve hoy".
7. **Faltante → pérdida**: a los 15 días, lo confirma un encargado.
8. **Persona que se va con cosas a cargo**: se avisa y la baja no se bloquea.
9. **EPP**: en la fase 1, como insumo con talles. La constancia firmada es de la fase 2.

Pendiente: ¿hay un equipo fijo en el pañol (celular o tablet), o hay que comprarlo?
