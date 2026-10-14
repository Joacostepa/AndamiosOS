# El parte del capataz, ampliado: qué sumar, cuándo y dónde vive

> Pregunta del dueño (10/10): «ya que vamos a hacer trabajar al capataz, ¿no conviene que el parte tenga más información?». Propuso 7 cosas: viajes adicionales, incidencias, material pedido de más, fotos de amarres, medidas finales, quién aprobó en obra y firma del cliente con sus datos.
> Decisión ya tomada: **el parte lo completa el capataz** (el «a cargo»), **lo valida la oficina**, y mientras tanto la oficina puede cargarlo **en nombre de** él.
> Este documento continúa [`rediseno.md`](./rediseno.md) (§5.2 flujo del capataz y §11 fases) y la maqueta [`maqueta.html`](./maqueta.html) (`renderCapataz`). Leí el código y los docs. No toqué el repo.

---

## 0. La respuesta corta

**Sí, conviene, pero no como «más campos en el parte».** Si el capataz tiene que pasar por 12 preguntas todos los días, en dos semanas toca «Así fue» sin leer, y el dato queda peor que si no se hubiera pedido. Eso ya pasó una vez en este repo: la tabla vieja `partes_obra` (Supabase, marzo) tenía `metros_montados`, `material_utilizado`, `clima` y `firmado_por`, y el diseño fundacional (`docs/producto/diseno-producto-v1.md`, M06) pedía «Metros montados» y «Firma del cliente o responsable de obra». No los llenó nadie: el parte que sobrevivió (Odoo `x_aba_parte_diario`) es el austero.

La forma de sumar información sin perder calidad es un **parte por momentos**:

- **Todos los días, lo mismo de la propuesta** (~20 s): ¿cómo terminó?, quién no fue, a qué hora terminaron. Más **una sola pregunta nueva de un toque: «¿Cuánto les falta?»**, que reemplaza a «¿Terminó la obra?».
- **Dos botones fijos en el link, a cualquier hora: «Pedir algo» y «Pasó algo».** No son parte del cierre: se tocan **cuando pasa**, no a las 17 de memoria. Cubren los puntos 1, 2 y 3 del dueño y dos que faltaban: **el cliente pide un trabajo adicional** y **esperas que no son culpa nuestra**.
- **Bloques que aparecen solos sólo cuando corresponde**:
  - **primer día de un armado**: fotos del «antes» (daños que ya tenía la fachada);
  - **termina un armado o una ampliación**: **medidas finales** (sugeridas, se confirman con un toque), **fotos guiadas** con los **amarres**, «¿sobró material?» y la **entrega al cliente con firma**;
  - **termina un desarme**: faltantes y roturas, fotos del «después».
- **«Quién aprobó en obra» (punto 6) no se pregunta suelto**: es el que firma la entrega (punto 7) o el que pidió el trabajo adicional. Un «quién aprobó» por día no tiene a quién aprobar.

**La mitad de lo que pidió el dueño ya existe en algún lado** (§1). El parte no lo vuelve a cargar: **dispara o vincula**. Los fletes extra ya los cuenta la Hoja del día con los «Hecho» del chofer. Los pedidos de material tienen cola propia (`hd_pedidos`, que ya acepta el canal `link`). Las incidencias tienen modelo en Odoo (`x_aba_incidencia`). Y la firma en pantalla, con su constancia y su PDF, ya está hecha en Permisos.

**Tiempo para el capataz**: un día típico, **20 a 60 s**. El primer día de un armado, **+45 s**. El día de la entrega, **5 a 8 min** con el cliente presente, o **2 a 4 min** si se le manda el link. El último día de un desarme, **1 a 3 min**.

---

## A. Qué existe hoy (para no duplicar)

### A.1 Inventario

| Pieza | Dónde | Datos | ¿Vive? | Qué implica para el parte |
|---|---|---|---|---|
| **Parte diario** | Odoo `x_aba_parte_diario` + líneas `x_aba_mano_obra`, `x_aba_flete` (cantidad, tercerizado, costo), `x_aba_incidencia` (tipo + descripción), `x_aba_foto` (momento: antes/durante/final/**incidencia**/**entrega**) | `lib/odoo/partes.ts`, `tipos-parte.ts` | **Sí**, 1276 partes | El parte ya tiene **dónde guardar incidencias, fletes y fotos de entrega**. Lo que no tiene: medidas estructuradas, receptor/firma, faltantes. |
| **As-built** | `OT.x_ejecutado_real` (foto de esta intervención) + `venta.x_estructura_actual/fecha/ot_id` (estado vigente, lo hereda el desarme). UI: `ComoQuedoArmado` precargado con `x_detalle_tecnico`; reglas `faltaAsBuilt` / `asBuiltAEnviar`; sólo para `DEJAN_ESTRUCTURA` (armado, ampliación, desmonte parcial) | `partes.ts` `actualizarOt()`, `como-quedo-armado.tsx` | **Sí**, al cerrar la OT | Las **medidas finales** (punto 5) son **el as-built hecho con números**. No es un campo nuevo: es mejorar este. |
| **Medidas vendidas** | `sale.order`: `x_trabajo_obra` (tipo), `x_permiso_base`, `x_permiso_altura`, `x_permiso_metros_lineales`, `x_permiso_m2` (solapa «Trabajo a ejecutar» → «Qué se arma») | `lib/permisos-via-publica/generacion.ts`, `encomienda.ts` | Sí, en ventas nuevas con permiso | **Son la precarga** de «medidas finales». Además: si lo armado supera los m² del permiso, es un problema legal que hoy nadie ve. |
| **Medidas escritas por el capataz** | `fotos_obra.descripcion`: «Pantalla 8,59 x 2,50 de alto con alambre pua y 20 esferas» (el comentario del código la llama «un as-built escrito por quien estuvo parado ahí») | Supabase, import único de Telegram | Import histórico | **Los capataces ya reportan medidas finales**, por Telegram, en texto libre. Se pide algo que ya hacen, en un formato que sirve. |
| **Contactos de la obra** | Odoo `x_aba_contacto_obra` (nombre, rol, teléfono, email), cuelgan de la **venta**. Contacto de SyH del cliente: `x_hab_syh_nombre/celular/email`; `x_syh_presencial` | `asignaciones.ts` §Contactos, `lib/odoo/trabajo.ts` | **Sí**; el link del capataz ya muestra «Contacto en obra: Carlos Ferrari (encargado) [Llamar]» | **Precarga de «quién recibe / quién aprobó»**: el capataz elige de la lista, no escribe. |
| **Firma en pantalla** | `components/permisos-via-publica/firma-pad.tsx` (canvas, sin librería) + `tintaDeFirma`/`MINIMO_TINTA_FIRMA` (en el navegador y en el servidor) + `documentos-firmados.ts` (pdf-lib, constancia al pie: quién, DNI, carácter, cuándo; se guardan IP, dispositivo y sha256) + `POST /api/public/permiso/[token]/firmar` | Permisos | **Sí**, en producción | **El 80 % de la firma del cliente está hecho**, incluida la lección de SANTA FE 3085: se presentó «firmado» sin trazo y el Gobierno lo observó. |
| **Viajes y fletes** | `hd_viajes`: tipo (lleva/busca/mueve/lleva_material/trae_material/…), `estado` hecho/no_pudo, `hecho_at`, `hecho_por`, `no_pudo_motivo`, `flete_externo`, `carga`, `foto_path` (foto del remito, ya desde el link del chofer) | Hoja del día | **Sí** desde el 10/10 | **Los «viajes adicionales» (punto 1) ya quedan registrados con hora.** La precarga del parte ya propone los fletes a partir de los viajes hechos. El capataz **no** los declara. |
| **Pedidos** | `hd_pedidos`: `que` (texto), tipo, OT, urgencia (`frena`/`hora`/`cliente`/`hoy`/`cuando_se_pueda`), `necesita` (camión/hidrogrúa), `pidio_persona_id`, **`canal` ya admite `'link'`**, estado | Hoja del día §7 | **Sí** (los carga el coordinador). **«Pedir material o un viaje» desde el link = Pendiente 15, no implementado** (no aparece en `components/hoja-dia/celular`) | **«Material pedido de más» (punto 3) entra por acá.** Falta un dato: **el motivo** (¿faltó en el cómputo? ¿cambió el alcance? ¿se rompió?). |
| **Solicitudes extra** | `/solicitudes-extra`, Supabase `solicitudes_extra` + ítems; motivos `error_computo` / `cambio_alcance` / `reemplazo_danado` / `otro`; urgencia; aprobador; remito | Pantallas de marzo | **No en la práctica**: cuelga de la tabla vieja `obras` (uuid) y del catálogo de piezas. La Hoja del día **decidió no reutilizarla** (§13, Pendiente 21) | **No duplicar**: se toma **su vocabulario de motivos** y se agrega a `hd_pedidos`. La pantalla vieja, fuera del menú. |
| **Incidentes** | `/incidentes`, Supabase `incidentes`: tipos (accidente, cuasi accidente, daño material, robo, reclamo del cliente, desvío operativo, observación de seguridad), severidad, acciones tomadas/correctivas, responsable, estado, cierre | Pantalla de marzo, en el menú «Campo» | **No en la práctica**: cuelga de `obras` (uuid), no de las OT | Hay **dos modelos de incidencia**: el vivo (`x_aba_incidencia`, línea del parte, que lee el informe de obra) y el muerto (con seguimiento, que es lo que le falta al vivo). |
| **Inspecciones** | `/inspecciones`, Supabase `inspecciones`: tipo (propia/tercero/cliente/organismo), resultado (aprobado/observado/rechazado), próxima, acciones | Pantalla de marzo | **No**: cuelga de `obras` (uuid) | Concepto correcto (M26: «si pasa algo y no hay registro de inspección, la empresa queda expuesta»), datos muertos. **La inspección no es del capataz** (§B.3). |
| **Habilitaciones** | Requisitos por OT, SyH (`REQUISITO_SYH`), permisos | En producción | Sí | **No es «habilitar el andamio para usarlo»**: es la documentación para **poder entrar** (ART, seguros, SyH). Pero sus **requisitos por obra** son el lugar natural para «esta obra exige fotos de amarres / planilla propia / inspección semanal». |
| **Informe de obra** | Lee `x_aba_incidencia`, `x_aba_flete` y fotos; anomalía «Obra sin fotos: no hay constancia de entrega»; **«Informe de entrega al cliente» quedó fuera de alcance** | En producción | Sí | La constancia de entrega es justo lo que el informe dice que falta. Y la hace sin sumarle trabajo a nadie más. |
| **Pañol** | Control de salida por cuadrilla (Bien / Incompleta, con foto), faltante → pérdida a los 15 días, robo con denuncia | En producción (fase 1) | Sí | Es de **herramientas, máquinas y EPP**, no del material de andamio. Los faltantes del desarme **no** van al pañol. |
| **Depósito y remitos** | `/logistica/remitos`, `/deposito/stock`: Supabase, `obras` (uuid), catálogo de piezas | Pantallas de marzo | No atado a OT | No hay stock de andamio por OT. Un faltante declarado en el desarme es **un aviso** a depósito y comercial, no un movimiento de stock. La Hoja del día lo prevé para su fase 3 («viaje Trae hecho → remito»). |
| **Link del capataz** | `/h/[token]`, Telegram, cola sin señal, «Recibido / Entendido», el principio «**en el celular sólo se toca; no se escribe**» | Hoja del día §12 | Sí (falta activar Telegram) | Es **la misma puerta**. Sus pendientes «Avisar: falta alguien» y «Pedir material» son exactamente los botones de este diseño. |
| **Voz y WhatsApp** | `lib/voz` (ElevenLabs, asistente comercial), `lib/whatsapp` (API del asistente) | Sí | — | Hay base para **transcribir un audio** del capataz y para **mandarle la constancia al cliente** por WhatsApp. |
| **Clima** | `lib/clima/pronostico.ts`; campo `clima` en `DatosCierre` | Sí | — | **No se le pregunta al capataz**: se completa solo. |
| **Código muerto** | `hooks/use-partes.ts` (`partes_obra`), fichadas sobre `obras` | — | No | Ya está en la propuesta §9.3: borrar o archivar. |

### A.2 Las tres conclusiones del inventario

1. **Los módulos de «Campo» del menú (Solicitudes extra, Incidentes, Inspecciones) son andamiaje de marzo sobre la tabla vieja `obras`.** Tienen los conceptos correctos y nada conectado a las OT de Odoo. No hay que construir encima de ellos ni duplicarlos. Hay que **sacarlos del menú** (hoy confunden) y reconstruir sobre OT sólo lo que el parte necesite, cuando lo necesite.
2. **Lo vivo y reutilizable es**: `hd_pedidos` (pedidos), `hd_viajes` (fletes con hora), `x_aba_incidencia` y `x_aba_foto` (en el parte), el as-built (`x_ejecutado_real` / `x_estructura_actual`), las medidas de la venta (`x_permiso_*`), `x_aba_contacto_obra` (contactos) y la firma de Permisos.
3. **Faltan tres cosas, y son nuevas**: (a) **la constancia de entrega** (receptor, firma, PDF, envío al cliente); (b) **las medidas finales con números** (hoy el as-built es texto); (c) **los faltantes y roturas del desarme** (hoy no hay dónde ponerlos).

---

## B. Evaluación punto por punto

**Escalas.** Valor: quién lo usa después y cuánto le cuesta no tenerlo. Frecuencia: cada cuánto aparece. Costo para el capataz: toques, tipeo, tiempo, señal. Riesgo de mal llenado: alto = se puede tocar sin mirar o se adivina.

### B.1 Los 7 del dueño

| # | Punto | Valor (quién lo consume) | Frecuencia | Costo para el capataz | Riesgo de mal llenado | ¿Ya existe? | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | **Viajes adicionales (fletes extra)** | **Medio-alto.** Costo de la obra (informe), comercial (si fue por un cambio del cliente, se cobra) | 1 de cada 4 jornadas (el 74,5 % de los partes lleva 1 flete) | **Cero** si no se le pregunta | Alto si se le pregunta: no sabe contar viajes «redondos» | **Sí**: `hd_viajes` con `hecho_at`; la precarga del parte ya los propone | **No va como campo.** Los cuenta el sistema. Lo que falta es **por qué** hubo un viaje de más, y eso lo dice el **pedido** que lo originó (punto 3). La oficina lo ve armado: «3 fletes = 1 planificado + 2 por el pedido de Diego de las 10:20». |
| 2 | **Incidencias** | **Alto.** Seguridad y legal (accidente: denuncia a la ART en el día), comercial (daño a terceros, problema con el cliente), costo (paradas) | Rara, y **en cualquier momento** | 30–60 s con chips, foto y audio | Medio: se subdeclara por miedo; «otro» como cajón de sastre | **Sí**: `x_aba_incidencia` en el parte (vivo). `/incidentes` (muerto, con seguimiento) | **Sí, pero como evento** («Pasó algo»), en el momento y no a las 17. Termina en `x_aba_incidencia` al confirmar el parte. Un accidente avisa al instante. |
| 3 | **Material pedido de más** | **Alto.** Oficina técnica (desvío del cómputo), comercial (cambio de alcance = adicional), depósito | 1–3 por semana en total (estimado; medirlo) | 20–40 s: qué (dictado), para qué obra (preelegida), motivo (chip), ¿frena? | Medio: el «qué» en texto libre; el motivo es lo que más importa y lo más fácil de saltear | **Sí**: `hd_pedidos` (canal `link` previsto) y el vocabulario de motivos de `solicitudes_extra` | **Sí, como «Pedir algo»**, que crea el pedido en la cola del coordinador. **El motivo es obligatorio (un chip)** porque ahí está el valor: sin motivo es logística, con motivo es costo y desvío. |
| 4 | **Fotos de los amarres** | **Alto.** Seguridad y legal (prueba de que estaba bien anclado si hay viento, un colapso o un reclamo), técnico de la obra, clientes con SyH exigente | 1 vez por armado o ampliación (y más seguido si el cliente lo exige) | 1–2 min, guiado | **Alto**: fotos lejanas, oscuras o repetidas que no prueban nada | No (el parte acepta fotos, pero no guiadas ni obligatorias) | **Sí**, dentro del bloque de **fin de armado**, con **fotos guiadas** (encuadre de ejemplo, contador). Propuesta: **siempre** en estructuras de fachada (nos protegen a nosotros). «Si la obra lo requiere» define el **plus**: frecuencia semanal o la planilla del cliente. |
| 5 | **Medidas finales** | **Alto.** Comercial (desarme y adicionales), técnico, permisos (lo armado contra los m² del permiso), informe de obra, futura cotización | 1 vez por armado o ampliación | 30–60 s si se sugieren; 2 min si hay que corregir | Medio-alto: estimadas a ojo, unidades confusas (ml / m² / alto) | **Parcial**: as-built en texto; medidas vendidas en la venta; los capataces ya las mandan por Telegram | **Sí.** Se pregunta **con la forma de lo vendido** («base × alto», «metros lineales de pantalla»), **nunca en m²**. Se precarga con lo vendido: el caso normal es un toque. **Valida el técnico.** |
| 6 | **Quién aprobó en obra** | Medio por sí solo; **alto** atado a la entrega o a un adicional | — | — | Alto si se pregunta todos los días (se elige cualquiera) | **Sí**: los contactos de la obra | **No va suelto.** Se resuelve adentro de la **entrega** (quién recibe y firma) y adentro de «el cliente pide algo más» (quién lo pidió). |
| 7 | **Firma del cliente al entregar** | **Muy alto.** Legal (custodia y responsabilidad por el uso desde la entrega), comercial (fecha de entrega, fin de los reclamos tipo «no estaba terminado»), cobranza | 1 vez por armado o ampliación | 2–4 min con el cliente presente; 30 s si se manda el link | Medio: firma del portero, DNI inventado, cliente apurado | **Parcial**: firma + PDF + constancia hechos en Permisos | **Sí, en una segunda etapa** (necesita el texto del acta, ver §B.2). Con **tres caminos**: firma en el celular, link al responsable o «no hay nadie». **Nunca traba al capataz**: se puede ir sin firma, y la oficina sigue. |

### B.2 La firma del cliente: valor legal, cómo hacerla y qué pasa si no está

**Qué vale (lectura de producto, no dictamen: lo tiene que validar un abogado).**

- En Argentina, el **CCyC art. 288** dice que en un documento electrónico el requisito de firma se cumple con **firma digital** (Ley 25.506: certificado de un certificador licenciado). Una firma **dibujada en pantalla** es **firma electrónica**: vale como prueba, pero si el cliente la desconoce, **nos toca a nosotros probar** que es suya. Es la misma calidad que Permisos ya usa para el acta y la nota («firma electrónica… no firma digital», `docs/permisos/modulo.md`).
- La fuerza de la constancia no está en el garabato sino en **la evidencia que la rodea**. Por eso el diseño junta, en un solo PDF con hash: el **nombre**, el **DNI** y el **carácter** del firmante (dueño, administrador, jefe de obra, encargado, SyH), el **contacto elegido de la lista de la obra** (con su teléfono), **fecha, hora, IP, dispositivo y ubicación** (si el teléfono la da), las **fotos de entrega con hora**, las **medidas entregadas** y el **texto de lo que se acepta**. Al instante, **copia al cliente por WhatsApp o mail**. Si el cliente recibe el PDF y no objeta, eso también es prueba.
- **Lo que más protege es una cláusula, no una pantalla.** En las condiciones del presupuesto: «La estructura se considera entregada y aceptada al firmarse la constancia de entrega por el responsable designado o, en su defecto, si no se formulan observaciones dentro de las 48 h de enviada la constancia al contacto de la obra». Con eso, «no había nadie» deja de ser un agujero. **Es decisión del dueño, con el abogado** (§D.4).
- **Qué conviene que diga el acta** (lo redacta el abogado con HyS): obra, OT, fecha y hora; qué se entrega (las medidas y el tipo), «según la memoria de cálculo»; que el andamio se entrega **apto para uso**; que **sólo personal de ABA puede modificarlo, ampliarlo o quitar amarres**; que el cliente debe avisar si ve un daño y **no usarlo** después de un temporal sin revisión; quién recibe. Es una constancia de **entrega y uso**, no una conformidad de calidad genérica.
- **Datos personales (Ley 25.326)**: se pide **lo mínimo para identificar** (nombre, DNI, carácter). **No se pide foto del DNI** (es excesivo y riesgoso de guardar). Va un aviso de una línea («Tus datos quedan sólo en la constancia de esta entrega»). El bucket es privado y se lee con URL firmada, igual que `permisos`.

**Cómo se hace en el celular (tres caminos, el capataz elige uno).**

| Camino | Cuándo | Cómo | Fuerza | Costo para el capataz |
|---|---|---|---|---|
| **A. Firma acá** | El responsable está en la obra | Se le da el celular: lee el resumen (medidas + 3 fotos + el texto corto del acta), **elige quién es de la lista** (o «Otra persona»), escribe su **DNI** (teclado numérico) y su **carácter** (chips) y firma con el dedo. Se controla el trazo como en Permisos | **La más alta** (presencial, con hora y lugar) | 2–4 min, la mayoría del cliente |
| **B. Mandarle el link** | El responsable no está, pero hay alguien de la lista con celular | «Mandarle a Carlos Ferrari (encargado) para que confirme» → WhatsApp con link a la misma constancia: ve fotos y medidas, confirma con su DNI y firma en **su** teléfono (o toca «Confirmo la recepción», que deja el número de WhatsApp como identidad) | Alta: el número de teléfono identifica, y el cliente queda con copia | 20–30 s |
| **C. No hay nadie** | Obra cerrada, sin responsable | «Entregué sin firma»: quedan las fotos de entrega con hora y lugar. La oficina recibe «Entrega sin firma: Thames 1820» y decide: mandar el link al contacto de la venta, llamar, o dejar correr las 48 h si la cláusula existe | La de las fotos y la cláusula | 10 s |
| *(Transitorio)* **Papel** | Mientras no esté la pantalla, o si el cliente lo pide | Acta impresa, el cliente firma y el capataz le saca una foto («Foto del acta firmada»). La oficina la valida | Media-alta (firma ológrafa, pero en una foto) | 1 min |

**Reglas firmes**
- **El portero no firma.** Si el capataz elige «Otra persona», el carácter es obligatorio y la oficina lo ve marcado: «Firmó **otra persona**: Rubén, portero». Si el carácter no figura entre los aceptados, se le manda además el link al responsable de la venta.
- **La oficina no puede firmar «en nombre de» el cliente.** En el modo transitorio («carga la oficina en nombre del capataz»), la entrega sólo puede quedar **B (link)**, **C (sin firma)** o **papel**.
- **Sin señal**: la firma, el DNI y las fotos quedan en el teléfono con la hora del trazo («Firmado 16:52 · se manda cuando vuelva la señal»). El PDF lo arma el servidor al llegar, con la hora del trazo y no la de subida, y la cola sin señal de la Hoja del día ya sabe hacer eso.

### B.3 Puntos que no estaban en la lista (y si van o no)

| Punto | Valor | Frecuencia | Costo | Riesgo | ¿Existe? | Veredicto |
|---|---|---|---|---|---|---|
| **«¿Cuánto les falta?»** (avance en jornadas, no en metros) | **Alto para planificación**: la duración estimada falla seguido (lo dice `partes.ts`: «una obra estimada en 3 jornadas que lleva 5») y el tablero no se entera hasta el último día | Diaria, en OTs de varios días | **1 toque** | Bajo: es su juicio y es lo que mejor sabe | No (sólo «¿Terminó la obra?» el último día) | **Sí, ya.** Reemplaza a «¿Terminó la obra?» y la generaliza: `Terminamos hoy · Mañana · 2 días · Más`. «Terminamos hoy» dispara el bloque de entrega o de fin de desarme. Planificación ve «Carlos dice que faltan 2; el tablero tiene 1». |
| **El cliente pide un trabajo adicional en obra** («agregame dos cuerpos», «subí la pantalla un nivel») | **Muy alto, comercial**: es plata que hoy se regala o se discute después. Además es una regla de seguridad (no se modifica sin la OT) | Semanal (estimado) | 30 s: quién lo pidió (lista), qué (audio + foto) | Bajo | Hay OT adicional (`es_adicional`, `push-ot.ts`) del lado de la app vieja | **Sí, ya**, dentro de «Pasó algo» → **«El cliente pide algo más»**. Mensaje claro al capataz: «**No lo hagas hasta que te confirmemos.** Le avisamos a comercial». Comercial cotiza o arma la OT adicional. |
| **Esperas y trabas que no son nuestras** (no abren, no hay luz, otro gremio en el medio, el cliente cambia el lugar) | **Alto, comercial**: hoy se pierde la hora y no queda prueba. Ya existe el motivo «Cliente no habilitó el acceso», pero sólo para el día entero | Semanal | 15 s: tipo (chip) + cuánto (30 min · 1 h · 2 h · medio día) + foto opcional | Bajo | Parcial (`MOTIVOS_NO_EJEC` sólo si no se trabajó) | **Sí, ya**, dentro de «Pasó algo» → **«Nos hicieron esperar»**. Va como `x_aba_incidencia` tipo `problema_cliente` con la duración. |
| **Fotos del «antes»** (fachada, vereda y marquesinas antes de armar) | **Alto, legal**: el reclamo típico es «me rompieron la fachada o el toldo». Sin foto previa, no hay defensa | Primer día de cada armado | 45 s, 2–4 fotos guiadas | Bajo | El momento `antes` existe en `x_aba_foto` | **Sí, ya.** Es el mejor dato por segundo invertido de toda la lista. |
| **¿Sobró material?** (al terminar el armado) | Medio-alto, depósito: en alquiler, el material **es** el negocio, y lo que sobra en la obra es stock parado | 1 vez por armado | 1 toque; si sí, un pedido «Trae material» (dictado) | Bajo | `hd_pedidos` tipo `trae_material` | **Sí, ya**, en el bloque de fin de armado. |
| **Faltantes y roturas en el desarme** | **Alto**: depósito (qué controlar al llegar), comercial (cobrar al cliente piezas perdidas o dañadas), costo | 1 vez por desarme (y cuando aparecen en el armado) | 1–2 min con chips de piezas comunes y +/− | Medio: conteo a ojo. **Es un aviso, no un inventario**: el depósito lo verifica | No | **Sí, segunda etapa.** El conteo fino es del depósito al descargar. El capataz avisa «faltan ~6 tablones, hay 2 bases dobladas», con foto. |
| **Fotos del «después»** (al terminar el desarme) | Medio-alto, legal: «quedó todo limpio y sin daños» | 1 vez por desarme | 45 s | Bajo | `x_aba_foto` momento `final` | **Sí, segunda etapa**, junto con los faltantes. |
| **Tarjeta de andamio** (verde: apto / roja: no usar) | Medio-alto, seguridad: es práctica de las constructoras grandes y de los clientes industriales | Al entregar y al modificar | 20 s (foto de la tarjeta colgada) | Bajo… si existen las tarjetas físicas y la capacitación | No | **Después**, y **es decisión del dueño** (es un cambio de práctica en obra, no de software). Si se adopta, entra como una foto más del bloque de entrega. |
| **Checklist de seguridad diario** (EPP, arnés, charla) | Medio para HyS | Diaria | 20–40 s | **Muy alto: se tilda todo sin mirar** | El pañol registra el EPP | **No al parte.** Un checklist diario de toques es teatro: produce un 100 % de «sí» que no protege a nadie. Si un cliente exige un ATS o un permiso de trabajo, va como **requisito de esa obra** (Habilitaciones) con su propio formato. |
| **Inspecciones periódicas del andamio en uso** | **Alto, legal** (M26) | Semanal o mensual, según la obra o el cliente | — | — | `/inspecciones` (muerto) | **No es del capataz que arma**: la hace un técnico o HyS, a veces otra cuadrilla. **Después**, reconstruida sobre las OT, y el link de quien inspecciona puede reutilizar las mismas fotos guiadas. |
| **Metros montados por día** (para facturar) | **Bajo**: la facturación sale del presupuesto (lo vendido) y del alquiler. Las diferencias las cubren **las medidas finales** y el **adicional** | Diaria | 30 s | **Alto** (adivinado) | `partes_obra.metros_montados` (muerto) | **No.** Para avance sirve «¿cuánto les falta?», y para facturar, las medidas finales. |
| **Material utilizado por día** | Bajo | Diaria | Alto | Alto | `partes_obra.material_utilizado` (muerto) | **No.** Ningún capataz cuenta piezas todos los días. |
| **Clima** | Bajo-medio | Diaria | — | — | Campo `clima` + `lib/clima` | **No al capataz**: se completa solo. Si llovió y no se trabajó, ya está «No se pudo → Lluvia». |
| **Estado de la obra para el cliente** (resumen con fotos) | Medio-alto, comercial y experiencia | Diaria o al hito | **Cero** para el capataz | — | No | **Después**, como **salida** del parte confirmado (fotos + «hoy armamos hasta el 4.º piso; faltan 2 días»), no como más carga. |
| **Firma del capataz** | Bajo | — | — | — | `partes_obra.firmado_por` (muerto) | **No hace falta**: su declaración desde **su** link personal, con su token y su hora, ya es su firma. |

---

## C. El parte del capataz, por momentos

### C.1 Principios (los de la Hoja y la propuesta, y cuatro nuevos)

1. **Se toca, no se escribe.** Las excepciones aceptadas son el **DNI** (teclado numérico) y, si no hay otra, un número de medida (teclado numérico con la sugerencia ya puesta). El texto libre se reemplaza por **«Contalo con tu voz»**: se graba un audio y la oficina recibe el audio y la transcripción.
2. **Nada aparece si no corresponde.** Cada bloque tiene un **disparador** que sale de la OT y de la jornada (tipo, primera o última, lo que dijo el capataz). El capataz nunca elige «qué tipo de parte es hoy».
3. **Lo que pasa se avisa cuando pasa.** «Pedir algo» y «Pasó algo» están siempre a la vista en el link, desde el «Recibido» hasta la noche. El cierre de las 17 sólo **muestra** lo que se avisó en el día («Hoy avisaste: 1 pedido, 1 espera de 1 h»): no lo vuelve a preguntar.
4. **El capataz testimonia; no decide.** No cambia gente, horarios ni instrucciones (decisión del dueño). Declara lo que vio, pide y avisa. El costo, la OT y el cobro los decide la oficina.
5. **Fotos guiadas, no «mandá fotos».** Cada foto pedida tiene nombre, encuadre de ejemplo (un dibujo) y un contador («Amarres: 3 de 4»). Se puede saltear con un motivo de un toque («No se ve desde abajo», «No hay luz»), y ese salteo le llega a la oficina.
6. **Valores sugeridos siempre.** Medidas = lo vendido; quién recibe = el contacto de la obra; motivo del pedido = el más común para ese tipo de OT. El caso normal es **«Sí, así»**.
7. **Nunca traba.** Ningún bloque impide cerrar el día. Lo que falta queda como **pendiente de la oficina**, con nombre: «Entrega sin firma», «Faltan fotos de amarres».
8. **Sin señal, igual.** Todo entra en la cola del teléfono con la hora del toque, como «Recibido» hoy.

### C.2 El mapa de momentos

```
                 ┌──────────── siempre a la vista en el link (de "Recibido" a la noche) ─────────────┐
                 │   [ Pedir algo ]   material · un viaje · una herramienta  → hd_pedidos            │
                 │   [ Pasó algo  ]   accidente · casi · se rompió algo · daño a terceros · robo      │
                 │                    nos hicieron esperar · el cliente pide algo más · otro          │
                 └────────────────────────────────────────────────────────────────────────────────────┘

 PRIMER DÍA de armado/ampliación ── al tocar "Recibido" o al "Hecho" del Lleva ──▶ [Fotos del antes]  (45 s)

 TODOS LOS DÍAS, fin de jornada ── (fin de la hoja, o "Hecho" del Busca) ──▶ NÚCLEO (20 s)
        ¿Cómo terminó? · (si hubo cambios: quién no fue, a qué hora) · ¿Cuánto les falta?
                                                                     │
                       "Terminamos hoy" + armado/ampliación/desmonte parcial
                                                                     ▼
                         BLOQUE ENTREGA (4–7 min): medidas → fotos guiadas (amarres) →
                                               ¿sobró material? → entrega al cliente
                       "Terminamos hoy" + desarme
                                                                     ▼
                         BLOQUE FIN DE DESARME (1–3 min): ¿faltó o se rompió algo? → fotos del después
```

### C.3 Núcleo diario (todos los días)

**Disparador**: la hora de fin de la hoja (`finJornada`) o el «Hecho» del «Busca» del chofer, lo que pase primero. Mensaje de Telegram con botones y el mismo flujo en `/h/<token>`.
**Precarga**: los que van según la hoja, menos las ausencias; la hora del «Busca» o de la hoja; lo que avisó en el día.

| Paso | Pantalla (texto exacto) | Toques |
|---|---|---|
| N1 | **¿Cómo terminó Thames 1820?** · «Vos + Matías, Ezequiel, Franco, Gustavo · hasta las 16:00» · `Así fue` · `Hubo cambios` · `No se pudo` · abajo, chico: «Hoy avisaste: 1 pedido (6 tablones, entregado 10:52)» | 1 |
| N1b | *(si Hubo cambios)* **Tocá a quien NO fue** · chips con los nombres · **Terminamos a las** `12:00` `15:00` `16:00` `17:00` · `Listo` | 2–4 |
| N1c | *(si No se pudo)* **¿Por qué no se pudo?** · los `MOTIVOS_NO_EJEC` en botones grandes | 1 |
| N2 | *(sólo si la OT tiene más de una jornada)* **¿Cuánto les falta en esta obra?** · `Terminamos hoy` · `Mañana terminamos` · `Faltan 2 días` · `Más de 2` · debajo: «En el tablero quedaba 1 día» | 1 |
| N3 | *(si «Terminamos hoy» y no hay bloque)* → listo. *(si hay bloque)* → **«Antes de irte: la entrega»** (C.6) o **«Antes de irte: el desarme»** (C.7) | — |
| Fin | Sello verde: **«Listo, gracias»** · «La oficina lo confirma mañana a primera hora.» · sin señal: **«Mandado · se envía cuando vuelva la señal»** | — |

**Lo valida la oficina**: igual que en la propuesta §5.3. «¿Cuánto falta?» aparece en la tarjeta como evidencia **Declarada** y, si no coincide con el tablero, como aviso: «Carlos dice que faltan 2 días; el tablero tiene 1 → `Sumar una jornada` · `Dejar así`». **Va a**: borrador → `x_aba_parte_diario`; «cuánto falta» → aviso al tablero (no lo cambia solo).

### C.4 «Pedir algo» (cualquier momento)

**Disparador**: botón fijo en el link, debajo de la obra: **`Pedir algo`** (material, un viaje o una herramienta). Reemplaza el «Pedir material o un viaje» de la Pendiente 15 de la Hoja.
**Precarga**: la obra en la que está ahora (la de la hoja según la hora); la urgencia «Hoy»; el motivo más común.

| Paso | Pantalla | Toques |
|---|---|---|
| P1 | **¿Qué necesitás?** · `Material` · `Que nos traigan o lleven algo` · `Una herramienta o máquina` | 1 |
| P2 | **Decilo con tu voz** · botón grande 🎤 **`Mantené apretado y hablá`** · «Ej.: 6 tablones y 2 bases» · al soltar se ve la transcripción: «6 tablones y 2 bases» · `Está bien` · `Grabar de nuevo` · (chico: «Prefiero escribir») | 2 |
| P3 | **¿Por qué hace falta?** · `Faltó para lo que hay que armar` · `El cliente pidió más` · `Se rompió o vino fallado` · `Vino de menos en la carga` · `Otro` | 1 |
| P4 | **¿Los frena?** · `Sí, estamos parados` · `Lo necesitamos hoy` · `Para mañana` | 1 |
| Fin | **«Pedido mandado a Juan Agustín»** · «Lo vas a ver en *Para tu obra*.» · si «estamos parados»: **«Si en 15 min no tenés respuesta, llamalo»** `Llamar a Juan Agustín` | — |

- *(Si el motivo es «El cliente pidió más»)* aparece P3b: **¿Quién lo pidió?** con los contactos de la obra (`x_aba_contacto_obra`) + `Otra persona`, y la aclaración: **«Si es trabajo nuevo, no lo hagas hasta que te confirmemos.»** Ese pedido se copia también como **«El cliente pide algo más»** (C.5), que va a comercial.
- **Va a**: `hd_pedidos` con `canal='link'`, `pidio_persona_id`, `urgencia` (`frena` / `hoy` / `cuando_se_pueda`), y **dos columnas nuevas**: `motivo` (`falta_computo` / `cambio_alcance` / `reemplazo_danado` / `falta_carga` / `otro`; el vocabulario viene de `solicitudes_extra`) y `audio_path`. Entra en la cola como «**Sin revisar · lo pidió Diego desde el link**» (texto ya previsto en el doc de la Hoja).
- **Lo valida la oficina**: el coordinador lo despacha como cualquier pedido. **En el parte**, la tarjeta muestra los viajes atados a ese pedido y su motivo: «2 fletes extra · motivo: *faltó para lo que hay que armar* (pedido de Diego 10:20)». La persona que confirma el parte puede marcar el flete como **a cargo del cliente** (si el motivo fue «el cliente pidió más»), y queda la nota para comercial. Oficina técnica ve los pedidos con motivo `falta_computo` por obra: es su **desvío del cómputo**.

### C.5 «Pasó algo» (cualquier momento)

**Disparador**: botón fijo **`Pasó algo`**, al lado de «Pedir algo».

| Paso | Pantalla | Toques |
|---|---|---|
| I1 | **¿Qué pasó?** · `Alguien se lastimó` (rojo) · `Casi pasa algo` · `Se rompió algo` · `Dañamos algo del cliente o de un vecino` · `Nos robaron` · `Nos hicieron esperar` · `El cliente pide algo más` · `Otra cosa` | 1 |
| I1-rojo | *(Alguien se lastimó)* Antes de cualquier otra cosa: **«Primero, la persona. Si es grave, llamá al 107 o al SAME.»** · `Llamar a la ART` · `Llamar a Juan Agustín` · después: **¿Quién?** (chips de los que van) · **¿Cómo está?** `Sigue trabajando` · `Lo llevan al médico` · `Emergencia` | 3 |
| I2 | **Contalo con tu voz** (🎤, igual que P2) · opcional | 1–2 |
| I3 | **Sacá una foto** · `Abrir la cámara` · `Sin foto` | 1–2 |
| I-espera | *(Nos hicieron esperar)* **¿Por qué?** `No nos abrieron` · `No había luz o agua` · `Otro gremio en el medio` · `Cambiaron dónde armar` · `Otra` · **¿Cuánto?** `30 min` `1 h` `2 h` `Medio día` | 2 |
| I-cliente | *(El cliente pide algo más)* **¿Quién lo pidió?** (contactos de la obra + `Otra persona`) · 🎤 **¿Qué pide?** · foto opcional · aviso fijo: **«No lo hagas hasta que te confirmemos. Le avisamos a comercial.»** | 3 |
| Fin | **«Avisado a Juan Agustín»** (y, si fue un accidente: «y a Seguridad e Higiene») | — |

- **Va a**: una tabla de **novedades de obra** en Supabase (ver §C.9) atada a `ot_id` (Odoo), fecha y cuadrilla, con `origen`, audio, fotos y ubicación. **Al confirmar el parte** se escribe como línea `x_aba_incidencia` (el modelo vivo, el que lee el informe de obra), con el tipo de Odoo que corresponda: `accidente`, `rotura_material`, `problema_cliente` (esperas, daños, el cliente pide), `parada_obra`, `otro`. **No se escribe en `/incidentes` (tabla vieja).**
- **Avisos al instante** (no esperan el parte): accidente → Juan Agustín + dueño + HyS, en rojo; robo o daño a terceros → Juan Agustín + comercial; «el cliente pide algo más» → comercial (el vendedor de la venta, `user_id`) con la foto y el audio.
- **Lo valida la oficina**: cada novedad es un renglón en la tarjeta del parte con su chip de origen. Acciones: `Va al parte` (por defecto) · `No va al parte` (con motivo) · y según el tipo, `Avisar a comercial` · `Crear adicional` · `Marcar espera a cargo del cliente`. El seguimiento de un accidente (acciones correctivas, cierre) **no es del parte**: va al módulo de incidentes reconstruido sobre las OT, en la etapa 3. Hasta entonces, queda en la nota de la novedad.

### C.6 Bloque «Entrega» (termina un armado, una ampliación o un desmonte parcial)

**Disparador**: «¿Cuánto les falta?» → `Terminamos hoy`, en una OT de `DEJAN_ESTRUCTURA`. O, si no contestó eso, `ultimaDeLaOt` + «Así fue». **Precarga**: medidas vendidas (`x_permiso_base`, `x_permiso_altura`, `x_permiso_metros_lineales`, `x_trabajo_obra`) y el `x_detalle_tecnico`; los contactos de la obra; si la obra exige fotos de amarres (regla §D.4-3).

Encabezado fijo del bloque: **«Antes de irte: la entrega de Thames 1820»** · barra de 4 pasos: `Medidas · Fotos · Material · Entrega`.

**E1 — Medidas (30–60 s)**

```
¿Quedó así?
Medianera contrafrente
   9 m de largo  ×  15 m de alto
   ménsulas en el piso 4 · bandeja de 6 m

[        Sí, quedó así        ]
[   Cambió algo   ]
```
- `Cambió algo` → una fila por medida con **− / +** de a 0,5 m (largo / alto / metros de pantalla / metros de bandeja) y el número grande en el medio. Tocar el número abre el teclado numérico. Debajo: chips de lo que suele cambiar: `Más alto` · `Más bajo` · `Un sector menos` · `Se agregó un sector` · `Sin bandeja` · 🎤 `Contalo` (para lo que no entra en números: «la pantalla del frente no se hizo, sólo el lateral»).
- Se pregunta **con la forma de lo vendido** (base × alto, o metros lineales de pantalla): **nunca m²**. Los m² los calcula el sistema.
- Control: si la medida nueva difiere más del 30 % de lo vendido: **«¿Seguro? Vendido: 15 m de alto. Pusiste 21.»** `Sí, 21` · `Corregir`.

**E2 — Fotos guiadas (1–3 min)**

```
Fotos de la entrega            3 de 6
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Frente  │ │ Lateral │ │Amarres 1│   ← cada casilla con un dibujo de ejemplo
│   ✓     │ │   ✓     │ │   ✓     │
└─────────┘ └─────────┘ └─────────┘
┌─────────┐ ┌─────────┐ ┌─────────┐
│Amarres 2│ │ Bandeja │ │ Tarjeta │
│  [📷]   │ │  [📷]   │ │ (si hay)│
└─────────┘ └─────────┘ └─────────┘
Amarres: una foto de cerca por cada línea de amarres,
que se vea el anclaje a la pared.
[ Seguir ]          No puedo sacar alguna ›
```
- La lista sale del **tipo de trabajo**: fachada = frente completo + lateral + **amarres (una por línea, mínimo 2)** + bandeja si lleva; pantalla = frente + extremos + bases; torre = 2 lados + base + arriostramiento.
- **Amarres obligatorios** en las obras que los requieren (§D.4-3): sin ellos, `Seguir` dice **«Faltan 2 fotos de amarres»** y deja seguir sólo con un motivo: `No se ve desde abajo` · `No hay luz` · `Las saco mañana` · `No lleva amarres`. Ese salteo le llega a la oficina como pendiente.
- Las fotos se suben **al sacarlas** (comprimidas, `comprimirFoto`) a Storage, con hora y ubicación. El momento queda guardado (`final` / `amarre` / `entrega`).

**E3 — ¿Sobró material? (10 s)**
- **¿Sobró material para traer al depósito?** · `No` · `Sí` → 🎤 «¿Qué sobró?» → crea un pedido **«Trae material»** de esa obra (`hd_pedidos`, `tipo='trae_material'`, `canal='link'`).

**E4 — Entrega al cliente (camino A, B o C de §B.2)**

```
¿Quién recibe la obra?
  [ Carlos Ferrari · encargado ]   ← contactos de la obra
  [ Laura Méndez · administradora ]
  [ Otra persona ]
  ───────────────
  [ No hay nadie: entregar sin firma ]
```
- Elige un contacto → **«¿Está acá con vos?»** · `Sí, firma ahora` (A) · `No, mandarle el link` (B).
- **A — Firma ahora**: pantalla «**Para Carlos**» (para pasarle el celular): resumen (dirección, «Medianera 9 × 15 m · ménsulas piso 4 · bandeja 6 m», 3 miniaturas) + texto corto del acta (5 renglones, `Leer el acta completa`) + **DNI** (teclado numérico, 7 u 8 dígitos) + **Carácter**: `Dueño` `Administrador` `Jefe de obra` `Encargado` `Seguridad e Higiene` `Otro` + recuadro **«Firmá acá con el dedo»** (`FirmaPad`, `Borrar`) + `Confirmo que recibo el andamio`. Al terminar: **«Listo. Le mandamos una copia a Carlos por WhatsApp.»** y el celular vuelve al capataz con **«Entregado y firmado 16:52»**.
- **B — Link**: **«Le mandamos a Carlos un WhatsApp para que confirme»** · `Mandar` · el capataz ve **«Esperando la confirmación de Carlos»** y se puede ir.
- **C — Sin firma**: **«Entregás sin firma. Las fotos quedan como prueba y la oficina se lo manda al responsable.»** · `Entendido`.
- **Otra persona**: nombre (🎤 o teclado), DNI y carácter obligatorios. Si el carácter es `Otro`, se le manda además el link al contacto principal.

**Fin del bloque**: **«Obra entregada · Thames 1820»** · resumen de cuatro renglones (medidas, fotos, material, firma) · `Listo`.

**Lo valida la oficina (y quién)**

| Qué | Quién valida | Cómo | Va a |
|---|---|---|---|
| Medidas | **El técnico de la obra** (JS, GS), no la persona de partes | En la **cola de cierres de OT** (propuesta §5.5): «Vendido 9 × 15 · Entregado 9 × **16,5** (declarado por Carlos) · 3 fotos». `Aceptar` (genera el texto del as-built: «Medianera contrafrente 9 m × 16,5 m (vendido 15). Ménsulas en piso 4. Bandeja 6 m.») · `Corregir` · `Llamar a Carlos`. Si los m² superan el permiso: aviso a Permisos | `OT.x_ejecutado_real` + `venta.x_estructura_actual` (como hoy) **y** campos numéricos nuevos (§D.4-6) |
| Fotos de amarres | **El técnico o HyS** | Galería con la grilla de casillas: `Amarres bien` · `Pedir corrección` (vuelve al capataz como tarea del día siguiente: «Volver a Thames: reforzar amarre 2») | `x_aba_foto` (momento `entrega`/`final`, con la URL de Storage) o sólo Storage + vínculo (decisión 2 de la propuesta) |
| Constancia | **La oficina** (partes / Juan Agustín) | Ve el PDF, el firmante y su carácter con un chip: **Firmó el responsable** / **Firmó otra persona** / **Confirmó por link** / **Sin firma** / **Papel**. Acciones: `Reenviar al cliente` · `Mandar link al responsable de la venta` · `Marcar aceptada por las 48 h` (si la cláusula existe) | Tabla `entregas` (Supabase) + PDF en Storage + adjunto en la OT de Odoo |
| Sobrante | El coordinador | Es un pedido más en la cola | `hd_pedidos` |

### C.7 Bloque «Fin de desarme»

**Disparador**: «Terminamos hoy» (o `ultimaDeLaOt` + «Así fue») en una OT de desarme.

| Paso | Pantalla | Toques |
|---|---|---|
| D1 | **¿Faltó o se rompió algo?** · `No, está todo` · `Sí` | 1 |
| D2 | *(si Sí)* **Tocá lo que falta o se rompió** · chips con − / + : `Tablones` `Bases` `Crucetas` `Barandas` `Rodapiés` `Ménsulas` `Amarres` `Escaleras` `Ruedas` `Otro` · cada uno con dos contadores: **Falta** y **Roto** · 🎤 `Contalo` · 📷 `Foto de lo roto` | 3–8 |
| D3 | **Fotos del después** · casillas `Frente sin andamio` · `Vereda` · `Algo que haya quedado marcado` (opcional) | 2–3 |
| D4 | **¿Quedó material en la obra para buscar?** · `No` · `Sí` → crea el pedido «Trae material» | 1 |
| Fin | **«Listo. El depósito lo controla al descargar.»** | — |

- **Es un aviso, no un inventario.** El conteo que vale es el del depósito al descargar. Hoy no hay stock de andamio por OT, así que el faltante declarado va a una nota para depósito y comercial, no a un movimiento.
- **Va a**: novedades de obra (`tipo='faltante'`), y al confirmar el parte, `x_aba_incidencia` tipo `rotura_material` con el detalle («Faltan ~6 tablones; 2 bases dobladas»). Aviso a depósito («Llega de Cabildo 2150: dicen que faltan 6 tablones») y a comercial («¿Se le cobra al cliente?»).
- **Lo valida la oficina**: `Confirmado por depósito` · `Depósito contó otra cosa` (con el número) · `Cobrar al cliente` → nota a comercial. Cuando exista el remito de devolución (fase 3 de la Hoja), esto se convierte en su **diferencia**.

### C.8 Primer día de armado: «Fotos del antes»

**Disparador**: primera jornada de una OT de armado o ampliación, al tocar «Recibido» después de la hora de llegada, o al «Hecho» del «Lleva» a esa obra.
**Pantalla**: **«Antes de empezar: cómo está la fachada»** · «Si después hay un reclamo, estas fotos te cubren.» · casillas `Fachada completa` · `Vereda` · `Algo que ya esté roto` (opcional: toldo, marquesina, revoque) · `Seguir` · `Ahora no` (vuelve a aparecer a la hora; no insiste más de dos veces).
**Va a**: `x_aba_foto` / Storage con el momento `antes`. **La oficina no valida nada**: se muestran en la tarjeta («3 fotos del antes») y en un reclamo están en la ficha de la obra.

### C.9 Datos (lo mínimo nuevo)

| Pieza | Qué | Dónde |
|---|---|---|
| `hd_cierres` (de la propuesta) | Se le suma `falta` (`hoy`/`1`/`2`/`mas`) y `origen` (ver abajo) | Supabase |
| **`obra_novedades`** (nueva) | `id`, `ot_id`, `fecha`, `cuadrilla_odoo_id`, `tipo` (`accidente` / `casi` / `rotura` / `dano_terceros` / `robo` / `espera` / `pedido_cliente` / `faltante` / `otro`), `detalle` JSON (quién, cuánto, piezas, contacto), `audio_path`, `transcripcion`, `fotos[]`, `geo`, `estado` (`nueva` / `va_al_parte` / `no_va` / `derivada`), `incidencia_odoo_id`, `origen`, `declarado_por`, `declarado_at`, `cargado_por`, `en_nombre_de` | Supabase. **Reemplaza** a `incidentes` (la vieja) para lo nuevo |
| `hd_pedidos` | + `motivo`, + `audio_path` | Supabase (columnas nuevas) |
| **`entregas`** (nueva) | `ot_id`, `venta_id`, `medidas_vendidas` JSON, `medidas_entregadas` JSON, `fotos[]` con `casilla`, `salteos[]` con motivo, `receptor` {`contacto_id`, `nombre`, `dni`, `caracter`, `otra_persona`}, `camino` (`firma` / `link` / `sin_firma` / `papel`), `firma_path`, `pdf_path`, `sha256`, `ip`, `ua`, `geo`, `firmado_at`, `enviado_at`, `canal_envio`, `estado` (`borrador` / `firmada` / `esperando_link` / `confirmada_link` / `sin_firma` / `aceptada_tacita` / `validada`), `validada_por/at`, `origen` | Supabase + bucket privado `entregas` |
| **`origen`** (en todas) | `capataz_link` · `capataz_telegram` · `oficina_en_nombre` (+ `cargado_por` = usuario y `en_nombre_de` = personal) | — |
| Odoo | **Sin modelos nuevos.** Opcional (decisión): en `x_aba_orden_trabajo`, `x_real_base`, `x_real_altura`, `x_real_ml` (números del as-built) y `x_entrega_fecha`, `x_entrega_estado` | Odoo Studio |

### C.10 Tiempo para el capataz

| Día | Qué ve | Tiempo |
|---|---|---|
| **Típico** (armado o desarme en curso) | Núcleo (1–2 toques) + «¿Cuánto falta?» | **15–25 s** |
| Típico con un pedido | + «Pedir algo» a media mañana | **+30–40 s** |
| Típico con una espera o un pedido del cliente | + «Pasó algo» | **+20–40 s** |
| **Primer día de armado** | + fotos del antes | **+45 s** |
| **Día de entrega** (armado terminado), cliente presente | Núcleo + medidas (30–60 s) + 6 fotos (1,5–3 min) + sobrante (10 s) + firma (2–4 min, la mayoría del cliente) | **5–8 min** |
| Día de entrega, con el link | Igual, con la firma en 30 s | **2–4 min** |
| **Último día de desarme** | Núcleo + faltantes (0–2 min) + fotos del después (45 s) | **1–3 min** |
| Accidente | «Pasó algo» rojo | 1 min (y las llamadas) |

Promedio semanal estimado por capataz (5 días, 1 entrega cada 2 semanas): **~3–5 min por semana**, más los minutos del día de entrega. La señal sólo hace falta para mandar: todo se guarda en el teléfono.

---

## D. Recomendación

### D.1 Sumar ya, junto con la fase 2 de la propuesta («el capataz declara»)

1. **Núcleo + «¿Cuánto les falta?»**: 1 toque, gran valor para planificación, y reemplaza una pregunta que ya estaba.
2. **«Pedir algo»** sobre `hd_pedidos` con **motivo obligatorio**: cubre los puntos 1 y 3 sin duplicar nada y cierra la Pendiente 15 de la Hoja.
3. **«Pasó algo»** con esperas y «el cliente pide algo más»: cubre el punto 2 y dos fuentes de plata que hoy se pierden. Termina en `x_aba_incidencia`.
4. **Fotos del antes** el primer día: lo más barato y lo que más protege.
5. **Entrega, primera parte**: medidas sugeridas (punto 5) + fotos guiadas con amarres (punto 4) + «¿sobró material?». **Sin firma todavía.** Las medidas las valida el técnico en la cola de cierres de OT, y el as-built pasa a salir de números.

### D.2 Sumar después

6. **Constancia de entrega con firma** (puntos 6 y 7), con los tres caminos y la copia al cliente por WhatsApp. **Necesita antes** el texto del acta (abogado + HyS) y la cláusula de las condiciones comerciales. Mientras tanto: **acta en papel + foto** como camino transitorio.
7. **Fin de desarme**: faltantes y roturas + fotos del después + material para buscar.
8. **Resumen al cliente** como salida del parte confirmado.
9. **Tarjeta de andamio**, si el dueño la adopta como práctica.
10. **Inspecciones y seguimiento de incidentes** reconstruidos sobre las OT, con un link propio para quien inspecciona (técnico o HyS).

### D.3 No sumar al parte (y por qué)

- **Fletes como campo**: ya los registra el chofer con hora. Se pide el **motivo** a través del pedido.
- **«Quién aprobó» todos los días**: no hay qué aprobar. Vive en la entrega y en el adicional.
- **Metros montados y material utilizado por día**: datos adivinados que no usa nadie. Ya fracasaron una vez (`partes_obra`).
- **Checklist de seguridad diario**: produce un 100 % de «sí» que no protege. Si una obra lo exige, va como requisito de esa obra.
- **Clima**: sale solo.
- **Firma del capataz**: su link personal ya lo identifica.
- **Foto del DNI del cliente**: excesiva para lo que prueba, y riesgosa de guardar.
- **Inspección del andamio en uso**: no es del capataz que arma.

### D.4 Decisiones del dueño

1. **El acta de entrega**: el texto (abogado + HyS) y la **cláusula de aceptación por silencio a las 48 h** en las condiciones del presupuesto. Sin cláusula, «no había nadie» queda sin respaldo.
2. **¿La entrega arranca algo que se cobra?** Si la fecha de entrega conforme marca el inicio del alquiler o de la facturación, la constancia pasa a ser un dato de cobranza y conviene en la etapa 1, no en la 2. (No encontré en el código cómo se define hoy el inicio del alquiler.)
3. **Fotos de amarres: ¿siempre o sólo si la obra lo exige?** Recomiendo **siempre en estructuras de fachada** (nos protegen a nosotros) y que «si la obra lo requiere» agregue la frecuencia semanal o la planilla del cliente, cargada como requisito en Habilitaciones.
4. **Quién valida medidas y amarres**: recomiendo **el técnico de la obra** (JS, GS), en la cola de cierres de OT. No la persona que confirma partes.
5. **Faltantes del desarme: ¿se cobran?** ¿Con qué evidencia (declaración + conteo del depósito + fotos)? ¿Quién avisa al cliente?
6. **Medidas en Odoo: ¿números o sólo texto?** Recomiendo **números en la OT** (`x_real_base`, `x_real_altura`, `x_real_ml`) además del texto del as-built. Es lo que permite comparar con el permiso y cotizar mejor. Son tres campos de Studio.
7. **Regla para el capataz**: «**Un trabajo que pide el cliente en la obra no se hace sin el OK de comercial**». Es una regla de seguridad y de cobro, y hay que decirla en la capacitación.
8. **Los módulos viejos de «Campo»** (Solicitudes extra, Incidentes, Inspecciones): **sacarlos del menú ya**. Hoy prometen algo que no está conectado a nada.
9. **Canal al cliente**: WhatsApp (ya hay integración del asistente comercial) o mail. Recomiendo WhatsApp con el mail de respaldo.
10. **Tarjeta de andamio**: ¿se adopta? (tarjetas físicas + capacitación).
11. **Transición «en nombre de»**: ¿hasta cuándo? Propuesta: medir el % de declaraciones del capataz por semana y retirar el modo cuando pase del 80 % sostenido durante 3 semanas.

### D.5 Plan por fases (días de una persona que conoce el repo)

| Etapa | Contenido | Esfuerzo | Depende de |
|---|---|---|---|
| **0 (ya)** | Sacar Solicitudes extra, Incidentes e Inspecciones del menú (o marcarlas «en revisión»); redactar el acta y la cláusula (fuera del software) | 0,25 d + el abogado | — |
| **1 — Núcleo ampliado** | Va con la fase 2 de la propuesta (`hd_cierres`, pantalla de declaración, 8–10 d). Suma: «¿Cuánto falta?» y su aviso al tablero (0,5 d); fotos del antes (0,5 d); modo «en nombre de» con el mismo flujo en la oficina y el `origen` en todo (1 d) | **+2 d** | Telegram activo |
| **2 — Pedir algo / Pasó algo** | `hd_pedidos.motivo/audio_path` + pantalla «Pedir algo» (1,5 d); `obra_novedades` + «Pasó algo» con sus ramas (2 d); audio y transcripción (1 d, reutilizando lo de `lib/voz` o un STT); avisos inmediatos (0,5 d); novedades en la tarjeta de la oficina → `x_aba_incidencia` al confirmar (1 d) | **6 d** | Etapa 1 |
| **3 — Entrega sin firma** | Medidas sugeridas desde la venta, con − / + y control de rango (1,5 d); fotos guiadas por tipo de trabajo, con casillas, salteo con motivo y subida a Storage (2 d); sobrante → pedido (0,25 d); validación en la cola de cierres de OT con el texto del as-built generado (1,5 d); campos numéricos en Odoo (0,5 d) | **6 d** | Cola de cierres (propuesta 2.5) |
| **4 — Constancia con firma** | Tabla `entregas` + bucket (0,5 d); pantalla «Para Carlos» reutilizando `FirmaPad` y `tintaDeFirma` (1 d); PDF de la constancia con pdf-lib y la constancia al pie, adaptado de `documentos-firmados.ts` (1,5 d); camino B, link público con token y confirmación del cliente (1,5 d); envío por WhatsApp/mail (1 d); estados y acciones en la oficina, incluida la aceptación por silencio (1 d); papel + foto (0,25 d) | **7 d** | Texto del acta |
| **5 — Fin de desarme** | Faltantes y roturas, fotos del después, material para buscar, avisos a depósito y comercial, validación | **3 d** | Etapa 2 |
| **6 — Después** | Resumen al cliente (2 d), inspecciones sobre OT (4 d), seguimiento de incidentes (3 d), tarjeta de andamio (1 d) | 10 d | Decisiones 10 y otras |

**Total de lo recomendado (etapas 1 a 5): ~24 días** sobre lo que ya suma la propuesta. Etapas 1 y 2 = lo que más rinde por día (pedidos con motivo, esperas y adicionales del cliente: plata que hoy se pierde).

---

## E. Especificación para actualizar la maqueta

### E.1 Vista del capataz (`renderCapataz`)

**Selector de escenario** arriba del celular (en el panel `.cap-nota`): `Día normal` · `Primer día` · `Día de entrega` · `Último día de desarme` · y el check que ya existe `Simular sin señal`. Cada escenario carga su obra (§E.4).

**Pantalla «Durante el día»** (paso nuevo `dia`, es la portada antes de las 16):
```
Viernes 16 · Cuadrilla 1                         10:12
1 · Thames 1820 · Armado · día 6 de 6
Recibido 7:31 ✓
Para tu obra: tu pedido de las 10:20 (6 tablones y 2 bases) — lo lleva Kiska, ~10:45

[      Pedir algo       ]   [      Pasó algo       ]

A las 16:00 te preguntamos cómo terminó.       [Ver el cierre ahora]
```

**Pasos** (`state.ui.cap.paso`) y textos exactos:

| `paso` | Título | Cuerpo | Botones (`data-accion`/`data-v`) |
|---|---|---|---|
| `dia` | (lo de arriba) | | `cap-pedir`, `cap-paso` `cap` `cierre` |
| `antes` *(Primer día)* | **Antes de empezar: cómo está la fachada** | «Si después hay un reclamo, estas fotos te cubren.» · casillas `Fachada completa`, `Vereda`, `Algo que ya esté roto (opcional)` | `cap-foto` por casilla · `Seguir` · `Ahora no` |
| `inicio` | **¿Cómo terminó Thames 1820?** | «Vos + Matías, Ezequiel, Franco, Gustavo · hasta las 16:00» · «Hoy avisaste: 1 pedido (entregado 10:52)» | `Así fue` · `Hubo cambios` · `No se pudo` |
| `cambios` / `nose` | (iguales a hoy) | | |
| `falta` | **¿Cuánto les falta en esta obra?** | «En el tablero quedaba 1 día.» | `Terminamos hoy` · `Mañana terminamos` · `Faltan 2 días` · `Más de 2` |
| `ent-medidas` | **¿Quedó así?** | encabezado «Antes de irte: la entrega» + barra `Medidas · Fotos · Material · Entrega` · «Medianera contrafrente · **9 m** de largo × **15 m** de alto · ménsulas en piso 4 · bandeja de 6 m» | `Sí, quedó así` · `Cambió algo` |
| `ent-medidas-edit` | **¿Cómo quedó?** | filas `Largo [−] 9 m [+]`, `Alto [−] 16,5 m [+]`, `Bandeja [−] 6 m [+]` · chips `Más alto` `Un sector menos` `Se agregó un sector` `Sin bandeja` · 🎤 `Contalo` · aviso de rango si > 30 % | `Listo` |
| `ent-fotos` | **Fotos de la entrega · 3 de 6** | grilla de casillas (Frente, Lateral, Amarres 1, Amarres 2, Bandeja, Tarjeta opcional) · «Amarres: una foto de cerca por cada línea de amarres, que se vea el anclaje a la pared.» | casilla → `cap-foto` (simula: aparece la miniatura) · `Seguir` · `No puedo sacar alguna` |
| `ent-salteo` | **¿Por qué no podés?** | «Faltan 2 fotos de amarres.» | `No se ve desde abajo` · `No hay luz` · `Las saco mañana` · `No lleva amarres` |
| `ent-material` | **¿Sobró material para traer al depósito?** | | `No` · `Sí` (→ 🎤 simulado «20 tablones y 4 bases» → `Mandar pedido`) |
| `ent-quien` | **¿Quién recibe la obra?** | botones `Carlos Ferrari · encargado`, `Laura Méndez · administradora`, `Otra persona` · separador · `No hay nadie: entregar sin firma` | |
| `ent-esta` | **¿Carlos está acá con vos?** | | `Sí, firma ahora` · `No, mandarle el link` |
| `ent-firma` | **Para Carlos** | «Thames 1820 · Medianera 9 × 16,5 m · ménsulas piso 4 · bandeja 6 m» · 3 miniaturas · acta corta: «Recibo el andamio armado en la obra indicada, apto para uso. Sólo personal de ABA puede modificarlo o quitar amarres. Si veo un daño, aviso y no lo uso.» `Leer el acta completa` · **DNI** [campo numérico] · **Carácter** chips · recuadro **Firmá acá con el dedo** (canvas real o simulado) · `Borrar` | `Confirmo que recibo el andamio` (deshabilitado hasta DNI + carácter + trazo) |
| `ent-link` | **Le mandamos a Carlos un WhatsApp para que confirme** | vista previa del mensaje: «Hola Carlos, soy Carlos Benítez de Andamios Buenos Aires. Terminamos el andamio de Thames 1820. Mirá las fotos y confirmá la recepción acá: abaos.ar/e/7KQ2» | `Mandar` |
| `ent-sinfirma` | **Entregás sin firma** | «Las fotos quedan como prueba y la oficina se lo manda al responsable.» | `Entendido` |
| `ent-fin` | **Obra entregada · Thames 1820** | 4 renglones: «Medidas: 9 × 16,5 m (cambió el alto)» · «Fotos: 5 de 6 (amarres 2: las saco mañana)» · «Material: pedido para traer 20 tablones y 4 bases» · «Firmó Carlos Ferrari, encargado · 16:52» / «Esperando que confirme Carlos» / «Sin firma» | `Listo` |
| `des-falta` *(Desarme)* | **¿Faltó o se rompió algo?** | | `No, está todo` · `Sí` |
| `des-piezas` | **Tocá lo que falta o se rompió** | filas con dos contadores `Falta [−] 6 [+]` `Roto [−] 0 [+]` para Tablones, Bases, Crucetas, Barandas, Rodapiés, Ménsulas · 🎤 · 📷 `Foto de lo roto` | `Listo` |
| `des-despues` | **Fotos del después** | casillas `Frente sin andamio`, `Vereda`, `Algo que quedó marcado (opcional)` | `Seguir` |
| `des-fin` | **Listo. El depósito lo controla al descargar.** | | `Listo` |
| `pedir-1` | **¿Qué necesitás?** | | `Material` · `Que nos traigan o lleven algo` · `Una herramienta o máquina` |
| `pedir-voz` | **Decilo con tu voz** | botón 🎤 `Mantené apretado y hablá` (simula 1,5 s «Grabando…» → transcripción «6 tablones y 2 bases») | `Está bien` · `Grabar de nuevo` · link `Prefiero escribir` |
| `pedir-motivo` | **¿Por qué hace falta?** | | `Faltó para lo que hay que armar` · `El cliente pidió más` · `Se rompió o vino fallado` · `Vino de menos en la carga` · `Otro` |
| `pedir-quien` *(si «El cliente pidió más»)* | **¿Quién lo pidió?** | contactos + `Otra persona` · aviso ámbar «Si es trabajo nuevo, no lo hagas hasta que te confirmemos.» | |
| `pedir-urg` | **¿Los frena?** | | `Sí, estamos parados` · `Lo necesitamos hoy` · `Para mañana` |
| `pedir-fin` | **Pedido mandado a Juan Agustín** | «Lo vas a ver en *Para tu obra*.» (+ si frena: «Si en 15 min no tenés respuesta, llamalo» `Llamar a Juan Agustín`) | `Volver` |
| `paso-1` | **¿Qué pasó?** | botones (el primero en rojo) `Alguien se lastimó` · `Casi pasa algo` · `Se rompió algo` · `Dañamos algo del cliente o de un vecino` · `Nos robaron` · `Nos hicieron esperar` · `El cliente pide algo más` · `Otra cosa` | |
| `paso-herido` | **Primero, la persona** | «Si es grave, llamá al 107 o al SAME.» | `Llamar a la ART` · `Llamar a Juan Agustín` · después chips ¿Quién? y ¿Cómo está? `Sigue trabajando` `Lo llevan al médico` `Emergencia` |
| `paso-espera` | **¿Por qué esperaron?** | chips de motivo + **¿Cuánto?** `30 min` `1 h` `2 h` `Medio día` | `Listo` |
| `paso-cliente` | **¿Quién lo pidió?** → 🎤 **¿Qué pide?** | aviso fijo «No lo hagas hasta que te confirmemos. Le avisamos a comercial.» | `Mandar` |
| `paso-voz-foto` | **Contalo con tu voz** · **Sacá una foto** | | `Mandar` |
| `paso-fin` | **Avisado a Juan Agustín** (+ «y a Seguridad e Higiene» si hubo herido) | | `Volver` |

**Panel derecho «Así le llega a la oficina»**: además del chip «Declarado 16:41 por Carlos», una lista que crece con cada bloque: `Pedido 10:20 · 6 tablones y 2 bases · faltó para lo que hay que armar · frena`, `Espera 1 h · no nos abrieron`, `Falta: terminamos hoy`, `Medidas: 9 × 16,5 (vendido 9 × 15)`, `Fotos: 5 de 6 · amarres 2 salteada (las saco mañana)`, `Entrega: firmó Carlos Ferrari (encargado) 16:52`.

### E.2 Tarjeta de la oficina

**Chip de origen** en la cabecera de la tarjeta (reemplaza o acompaña a «Declarado 16:41»):
- `Declarado por Carlos · 16:41` (ícono persona, verde): la declaró el capataz desde su link.
- `Cargado por Juan Agustín en nombre de Carlos · 9:05` (ícono lápiz, gris con borde punteado): modo transitorio. **No habilita el toque único** de la propuesta (no hay segunda firma), y la cuenta del pie dice «3 de 6 declaradas por el a cargo».
- `Sin declarar` (gris): igual que hoy.

**Botón nuevo en la tarjeta**: `Cargar en nombre de Carlos` (en «Más…», o como principal si está «Sin declarar»). Abre **el mismo flujo del capataz** en un panel lateral con el marco «Estás cargando por Carlos Benítez». Lo que se carga queda con `origen = oficina_en_nombre`. **En ese modo la firma del cliente no se ofrece**: sólo `Mandarle el link`, `Sin firma` o `Subir foto del acta en papel`.

**Fila «Novedades del día»** dentro de la tarjeta, debajo de la línea de la obra, un renglón por novedad con chip de origen y acciones:

| Novedad | Renglón | Acciones |
|---|---|---|
| Pedido con motivo | «🧱 Pedido 10:20 · 6 tablones y 2 bases · *faltó para lo que hay que armar* · entregado 10:52 por Kiska → **+1 flete**» | `Flete a cargo del cliente` · `Avisar a oficina técnica` (si motivo = falta de cómputo) |
| Espera | «⏱ Esperaron **1 h** · no les abrieron (8:30–9:30) · foto» | `Va al parte` (✓ por defecto) · `Marcar a cargo del cliente` · `No va` |
| El cliente pide algo más | «➕ Laura Méndez (administradora) pide sumar 2 cuerpos al lateral · audio 0:18 · foto» | `Avisado a comercial ✓` · `Crear adicional` · `No va` |
| Accidente | Renglón rojo arriba de todo: «🚑 Ezequiel se cortó la mano · sigue trabajando · 11:40» | `Va al parte` · `Abrir seguimiento` |
| Faltante (desarme) | «📦 Faltan ~6 tablones · 2 bases rotas · foto» | `Confirmado por depósito` · `Depósito contó otra cosa` · `Cobrar al cliente` |

Al `Confirmar` la tarjeta, las novedades con `Va al parte` se escriben como líneas `x_aba_incidencia`. El toast lo dice: «Confirmado · 2 novedades al parte · Deshacer (10)».

**«¿Cuánto falta?» en la tarjeta**: como evidencia de la obra: «Falta: *terminamos hoy* (Carlos)». Si no coincide con el tablero, aviso ámbar: «Carlos dice que faltan 2 días; el tablero tiene 1» → `Sumar una jornada` · `Dejar así`.

**Cola «OTs para cerrar»** (`renderCierres`), con tres secciones nuevas por OT:
1. **Medidas**: dos columnas, «Vendido · 9 × 15 m» y «Entregado · 9 × **16,5** m (Carlos)», con el cambio resaltado, 3 miniaturas y el texto del as-built generado en el editor que ya existe. `Aceptar medidas` · `Corregir` · `Llamar a Carlos`. Aviso si los m² superan el permiso: «16,5 m de alto: el permiso es por 135 m², lo armado da 148,5 m². Avisar a Permisos.»
2. **Fotos de la entrega**: grilla por casilla con el estado (✓ / salteada con motivo). `Amarres bien` · `Pedir corrección` (crea una tarea «Volver a Thames: foto del amarre 2»).
3. **Constancia**: chip de estado (`Firmó el responsable` verde · `Firmó otra persona` ámbar · `Esperando link` gris · `Confirmó por link` verde · `Sin firma` rojo · `Papel` gris) + `Ver PDF` · `Reenviar al cliente` · `Mandar link al responsable de la venta` · `Marcar aceptada (48 h sin observaciones)` (sólo pasadas 48 h desde el envío).

`Cerrar OT` queda habilitado aunque falte la constancia (no se traba), pero el botón dice `Cerrar igual (sin constancia)` y pide un toque más.

### E.3 Estados nuevos para la tira y el pie

- En la tira semanal, debajo del día: «1 entrega sin firma» (ámbar) además de «esperando N».
- En el pie del día: «Hoy: 2 pedidos (1 por falta de cómputo) · 1 espera de 1 h · 1 entrega».

### E.4 Datos de ejemplo para la maqueta (encajan con `DATOS['2026-10-16']`)

```js
// Contactos de obra (x_aba_contacto_obra), por OT
const CONTACTOS = {
  1164: [{ id: 501, nombre: 'Carlos Ferrari', rol: 'encargado', tel: '11 5555-0101' },
         { id: 502, nombre: 'Laura Méndez', rol: 'administradora', tel: '11 5555-0102' }],
  1203: [{ id: 511, nombre: 'Ing. Pablo Rey', rol: 'jefe de obra', tel: '11 5555-0201' }],
  1178: [{ id: 521, nombre: 'Marta Gil', rol: 'Seguridad e Higiene (banco)', tel: '11 5555-0301' }],
};
// Medidas vendidas (sale.order x_permiso_*) por OT
const VENDIDO = {
  1164: { tipo: 'medianera', base: 9, alto: 15, bandeja: 6, m2Permiso: 135, exigeAmarres: true },
  1203: { tipo: 'fachada', base: 18, alto: 12, bandeja: 0, m2Permiso: 216, exigeAmarres: true },
};

// v1 · Thames 1820 · armado día 6 de 6 → DÍA DE ENTREGA
Object.assign(DATOS['2026-10-16'][0], {
  origen: 'capataz_link',
  declaracion: { hora: '16:41', por: 13, tipo: 'asi', falta: 'hoy', quedoDistinto: true },
  novedades: [
    { id: 'n1', tipo: 'pedido', hora: '10:20', que: '6 tablones y 2 bases', motivo: 'falta_computo',
      urgencia: 'frena', viaje: { chofer: 'Kiska', hecho: '10:52' }, origen: 'capataz_link' },
    { id: 'n2', tipo: 'espera', hora: '08:30', motivo: 'no_abrieron', minutos: 60, fotos: 1, origen: 'capataz_link' },
  ],
  entrega: {
    ot: 1164,
    medidas: { base: 9, alto: 16.5, bandeja: 6, cambio: ['Más alto'], nivel: 'declarado' },
    fotos: [
      { casilla: 'frente', ok: true, hora: '16:10' }, { casilla: 'lateral', ok: true, hora: '16:12' },
      { casilla: 'amarres', n: 1, ok: true, hora: '16:15' }, { casilla: 'amarres', n: 2, salteo: 'Las saco mañana' },
      { casilla: 'bandeja', ok: true, hora: '16:18' },
    ],
    sobrante: { que: '20 tablones y 4 bases', pedido: 'p-77' },
    receptor: { contactoId: 501, nombre: 'Carlos Ferrari', dni: '28.456.913', caracter: 'Encargado' },
    camino: 'firma', firmadoAt: '16:52', estado: 'firmada', pdf: 'constancia-1164.pdf',
  },
});

// v2 · Diego · Corrientes + Belgrano: un pedido del cliente y un casi accidente
Object.assign(DATOS['2026-10-16'][1], {
  origen: 'capataz_telegram',
  declaracion: { ...DATOS['2026-10-16'][1].declaracion, falta: '2' },
  novedades: [
    { id: 'n3', tipo: 'pedido_cliente', hora: '11:05', obra: 'v2a', quien: { contactoId: 511, nombre: 'Ing. Pablo Rey', rol: 'jefe de obra' },
      transcripcion: 'Pide sumar dos cuerpos más en el lateral, sobre Gallo', audioSeg: 18, fotos: 1, avisado: 'comercial' },
    { id: 'n4', tipo: 'casi', hora: '14:30', obra: 'v2b', transcripcion: 'Se cayó un acople desde el tercer piso, la vereda estaba vallada, no pasó nada', fotos: 1 },
  ],
});
// El tablero tiene 1 jornada más en Corrientes: aparece "Diego dice que faltan 2; el tablero tiene 1".

// v4 · Cabildo 2150 · desarme, ÚLTIMO DÍA → bloque fin de desarme
Object.assign(DATOS['2026-10-16'][3], {
  origen: 'capataz_link',
  declaracion: { ...DATOS['2026-10-16'][3].declaracion, falta: 'hoy' },
  novedades: [
    { id: 'n5', tipo: 'faltante', hora: '12:10', piezas: [{ pieza: 'Tablones', falta: 6, roto: 0 }, { pieza: 'Bases', falta: 0, roto: 2 }],
      fotos: 2, avisado: ['deposito', 'comercial'] },
  ],
  fotosDespues: [{ casilla: 'frente_sin_andamio', hora: '11:55' }, { casilla: 'vereda', hora: '11:57' }],
});

// v6 · Juramento · cargado por la oficina EN NOMBRE DE Walter (modo transitorio)
Object.assign(DATOS['2026-10-16'][5], {
  origen: 'oficina_en_nombre', cargadoPor: 'Juan Agustín', enNombreDe: 30, cargadoAt: '09:05',
  declaracion: { hora: '09:05', por: 30, tipo: 'asi', falta: '2', viaOficina: true },
});

// Un armado que arranca: escenario "Primer día" del capataz
const PRIMER_DIA = { ot: 1230, direccion: 'Gurruchaga 1650', barrio: 'Palermo', tipo: 'ampliacion', jornadaN: 'día 1 de 3',
  fotosAntes: [] /* se llenan en la maqueta */ };

// Cola de cierres: la entrega de Thames, para renderCierres
OTS_CERRAR[0].entrega = DATOS['2026-10-16'][0].entrega;
OTS_CERRAR[0].vendido = VENDIDO[1164];   // 9 × 15 → 135 m²; entregado 9 × 16,5 = 148,5 m² > permiso → aviso
OTS_CERRAR[1].entrega = { estado: 'sin_firma', fotos: [{ casilla: 'frente', ok: true }], medidas: null };
```

### E.5 Lo que la maqueta tiene que dejar ver (criterios para revisarla)

1. En el escenario «Día normal», el capataz termina en **≤ 3 toques** y nunca ve el bloque de entrega.
2. «Pedir algo» y «Pasó algo» están en la portada del día y **no** en el cierre.
3. En el «Día de entrega» no hay texto libre obligatorio. El único teclado es el **DNI** (numérico), y el de las medidas sólo si se toca el número.
4. Se puede llegar a «Obra entregada» **sin firma** (caminos B y C) y la oficina lo ve como pendiente, no como error.
5. En la oficina, cada novedad tiene **chip de origen** y una acción por defecto. La tarjeta cargada «en nombre de» se distingue a simple vista y **no** ofrece el toque único.
6. En la cola de cierres, la medida cambiada, la foto salteada y el estado de la constancia se ven sin abrir nada.
