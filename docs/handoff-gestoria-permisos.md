# Handoff — Gestoría de permisos de andamio (actualizado 2026-09-17, mediodía)

Para retomar en una sesión nueva. El diseño completo y todo lo aprendido está en
`docs/modulo-gestoria-permisos.md`; esto es el estado, **lo que falta para que el circuito
quede 100 % automático** y el orden para seguir.

Para arrancar: "Leé docs/handoff-gestoria-permisos.md y docs/modulo-gestoria-permisos.md y
seguimos con lo que falta". **Empezar por § "17/09 — primera encomienda cerrada sola", seguir con
§ "Noche 16/09", § "Estado 16/09 19:00" y § "Estado 16/09 11:30".**

---

## 17/09 — primera encomienda cerrada sola (S01826, Nahuel Huapi 5100)

**El cierre automático de la encomienda funcionó de punta a punta con un caso real.** No fue
S02086 como estaba previsto: Tamara tocó "Armar la encomienda ahora" en **S01826** a las 9:24
(tarea **51**, pedida por tam@). Sin que nadie tocara el CPAU:

| Hora | Etapa | Detalle |
| --- | --- | --- |
| 9:25:28 | Resumen OK | 100 m², NAHUEL HUAPI 5082–5100 (pantalla de 25 ml) |
| 9:25:40 | Finalizada | R.Nro **00329522249** |
| 9:25:52 | Firmada | registro bajado del Histórico y firmado (JS y Hougassian) |
| 9:26:38 | Pagada | **operación 292177**, autorización 008017. Pantalla de Decidir (`live.decidir.com/forms/Transaccion`): *"¡Su operación fue realizada con éxito!"* |
| 9:27:00 | Cargada | Plataforma: *"Su tramite fue informado con exito. ¿Desea cargar otro tramite para el mismo Profesional? Si No"* (diálogo "ATENCION" dentro de la página) |
| 9:44 | Visada | el CPAU le manda a Hougassian "Certificado de Encomienda Profesional" desde atencion@cpau.org |
| 10:05 / 10:13 | Reenvío | Hougassian lo reenvía a rr@ y después a permisos-andamio@ (**a mano** desde Outlook, "RV: Encomienda") |
| 11:29:47 | Certificado | `2897802.pdf` (RETP 2897802), 6 hojas: registro ×3, certificación ×2, comprobante ("EVHA Reg.Habilit. Hasta 120 · Enc Nº:2933/329522249 · 50000.00") |

Los avisos "pagada", "cargada" y "certificado recibido" salieron a `#permisos-de-andamio-`.

**Lo que se aprendió:**
- **El reenvío de Hougassian cayó en Spam** de permisos-andamio@ y quedó ahí de 10:13 a ~11:25, hasta
  que alguien lo movió a Recibidos. Por eso el certificado y el aviso llegaron 1 h 16 tarde.
  **Arreglo (`643d2b0`):** el robot busca en todo el correo ("Todos", incluye lo archivado) y en Spam;
  si lo encuentra en Spam, el aviso lo dice. **Pendiente de JS:** filtro de Gmail en
  permisos-andamio@ para `edyhougassian@hotmail.com` → "Nunca enviarlo a Spam". No se sabe si
  Hougassian armó una regla o reenvía a mano (el de hoy fue a mano, reenvío de un reenvío).
- **Con el código del 16/09 a la noche el robot habría frenado después de pagar:** no reconocía
  "realizada con éxito" (buscaba "exitos" sin tilde). Se corrigió a la mañana, antes de la corrida
  (`643d2b0`): "éxito" cuenta como aprobado; si la pantalla dice aprobado y rechazado a la vez es
  dudoso y frena **sin** liberar la traba del pago (un rechazo la libera y "Reanudar" vuelve a
  cobrar); el comprobante se guarda en el bucket antes de decidir.
- **Plataforma:** la carga ya no se da por hecha si la pantalla trae un error ("el número
  ingresado no existe" también decía "ingresad"). El POST a `/grabar` es un formulario común, no
  AJAX; las validaciones del navegador salen en el diálogo "ATENCION" ("Regrese haciendo click en
  volver…").
- El CPAU visó en 17 minutos (9:27 → 9:44), en horario de oficina.

**Estado de S01826:** encomienda `ok` (subida por `robot`), pero **no se presenta todavía**: la póliza
está pedida a Segucom desde las 9:13. El informe técnico y el croquis se generaron a mano a las 9:14,
con el acta todavía observada; el acta quedó ok a las 13:14 (§ siguiente).

### Actas de asamblea rechazadas estando vigentes (17/09, mediodía)

- **Tucumán 969 (S02516)** (asamblea del 04/11/2025 que ratifica a Staino SA) y **Nahuel Huapi 5100
  (S01826)** (asamblea del 07/11/2025, mandato de Abálsamo del 01/11/2025 al 31/03/2027) quedaron
  "no vigente" en el portal y a los dos clientes les salió el mail de corrección (Tucumán dos veces).
  La IA decidía la vigencia sola y le erraba: con el mismo PDF dio vencida y vigente.
- **Arreglo:** la IA lee las fechas y el código calcula; si el acta fija un final, vale ese plazo
  aunque pase el año (JS). Detalle en el diseño, § "Noche 16/09 — revisión con IA…".
- Las dos actas se volvieron a revisar desde la Mac con el código nuevo y quedaron **ok**. A los
  clientes no les llegó ningún aviso de que ya está bien: avisarles (vendedor).
- **S01826 queda con el legajo completo;** falta sólo la póliza de Segucom para presentarse.

### Lo primero en la sesión nueva

1. **S02086 (Gascón 21): sigue sin encomienda.** Tocar "Armar la encomienda ahora" en horario de
   oficina (datos: pantalla 21 ml → 84 m², frente GASCON 21–35, consorcio CUIT 30711216258). Sigue
   esperando el endoso de la póliza.
2. **S01826:** el acta ya quedó ok (ver arriba); falta la póliza de Segucom y con eso se presenta
   sola (de 19 a 7).
3. **S02465 (Salguero 359):** la póliza quedó lista a las 11:22 y hay una `tad_presentar`
   (tarea 52) programada para las 19:00.
4. Filtro anti-Spam en permisos-andamio@ (JS).

---

## Noche 16/09 — saldo de Claude, correcciones automáticas y horario de TAD

### Lo primero mañana

1. **S02086 (Gascón 21): primera corrida real del cierre automático de la encomienda.** Antes:
   confirmar que Hougassian armó la regla de reenvío a `permisos-andamio@` (se le mandó el
   instructivo el 16/09). Después, en horario de oficina, tocar **"Armar la encomienda ahora"** y
   seguirla (§ "Cierre automático de la encomienda" abajo). S02086 además **espera el endoso de
   la póliza** ("Pedir endoso a Segucom", sigue con botón): sin eso no se presenta aunque llegue el
   certificado.
2. **S01826 (Nahuel Huapi 5100): esperar el acta de renovación del administrador.** Se le pidió al
   cliente por mail a las 22:20 (ver abajo). Cuando la suba se revisa sola; si queda ok, el legajo
   se completa y se generan informe técnico y croquis.
3. **Ver pasar solos, con un caso real**, el mail de corrección y el aviso a Slack de un documento
   observado, y una presentación programada a las 19:00. Hasta ahora sólo se probó el cálculo.
4. Siguen en pie los pendientes de § "Estado 16/09 19:00" y el cierre de la encomienda del CPAU.

### Cierre automático de la encomienda del CPAU (construido 16/09 a la noche)

**Decisión de JS:** tocar "Armar la encomienda" hace todo sin frenar. Código: `robot/cpau-cierre.mjs`
(piezas) y `continuarCierre` en `robot/cpau-encomienda.mjs` (etapas en `resultado.cierre.etapa`:
`finalizada → firmada → pagada → cargada → certificado`). `pedirEncomienda` manda `finalizar: true`.

- **Registro sin firmas:** Histórico → botón "ver" de la fila, **apenas se finaliza** (después el
  CPAU lo muestra procesado). Controla R.Nro, CUIT del propietario y 3 hojas.
- **Firmas:** JS (comitente) y Hougassian "Firma 01" (matriculado) con pdf-lib en las 3 hojas; la
  columna "Firma CPAU" nunca se toca. **JS propuso agregar el sello del CPAU nosotros: se descartó**
  (falsificar la validación del Consejo); el PDF sellado llega por mail.
- **Pago:** tienda → Comprar Ahora → Finalizar Compra → Visa Crédito → Procesar Pago → Decidir con la
  tarjeta de `robot/.env.robot` (`CPAU_TARJETA_*`, cargada el 16/09). Controla `MONTO=5000000` y
  comercio `00050711`; el n° de operación sale del POST a Decidir. **Antes de "Aceptar" anota
  `pago.intentado_at`**: si no queda confirmado, no se repite nunca solo. Sin capturas con la
  tarjeta a la vista (se suben al bucket). Comprobante = PDF de la pantalla final.
- **Plataforma** (mapeada completa del HTML): `#matricula` 12658, `#dni` 11816203, `#tyc`,
  `#validarPaso1` (POST `/Check/`) → `#tipoEnco`=`HE`, `#nroForm`=R.Nro sin ceros, `#enco` → `#tipopago`=
  `PAGO`, `#pagoseguro`=operación, `#comprobante` → `#submit_data` (POST `/grabar`). PDF ≤ 3 MB. Misma
  traba que el pago (`plataforma.intentado_at`).
- **Certificado:** el CPAU se lo manda a Hougassian; él lo reenvía a **permisos-andamio@** (IMAP, clave
  de aplicación en `robot/.env.robot`). La tarea queda `pendiente` y se revisa cada 15 min (hasta 5
  días). Toma el PDF que trae "Número de Registro <R.Nro>" + "CERTIFICA QUE", lo sube como
  `encomienda_cpau` ok (subido_por `robot`) y avisa. El cron del latido ahora también corre
  `barridoPresentaciones`, así que la presentación sale sola.
- **Errores:** antes de pagar o cargar se reintenta solo 3 veces (10 min). `CierreFrenado` (pago o
  carga intentados sin confirmar, pago rechazado, PDF incompleto) → error + aviso alto. En la ficha:
  etapas del cierre y botón **"Reanudar el cierre"** (acción `reanudar`). **No se puede "Volver a
  armar" ni "Descartar" una encomienda finalizada** (sería otra encomienda y otro pago).
- **Probado sin pagar ni enviar:** firma sobre el registro de S02128 (bien ubicada); Plataforma
  completa hasta antes de "Enviar"; pago hasta el formulario de Decidir completo sin "Aceptar"
  (operación 292168 quedó sin pagar, como la 292118 del mapeo); mail: búsqueda y chequeos con el
  PDF de S02128; **tramo final de punta a punta con el worker** (tarea de prueba 50 en "cargada":
  esperó, encontró el mail, subió el certificado y quedó `ok`; todo borrado después).
- **Sin ver todavía (primera corrida real):** la pantalla después de "Aceptar" (se reconoce por
  "aprobad…", "rechazad…"; si no dice nada claro, frena) y la de después de "Enviar" en la Plataforma
  (idem). Mirar las capturas `k..` de la tarea.
- **Presentación automática prendida** (`pvp_config.supervision.presentacion_automatica = true`, 16/09
  23:20). Al prenderla no había ningún trámite listo.
- Pruebas manuales: `robot/probar-cpau-cierre.mjs firma|plataforma|pago|mail` (ninguna paga ni envía).

**Seguridad:** la tarjeta y las dos claves de aplicación de la casilla se pasaron por el chat. La
primera clave quedó creada en otra cuenta (probablemente js@): borrarla. Cambiar la de
permisos-andamio@ cuando se pueda.

### La API de Claude se quedó sin saldo (12:32 → 22:00)

- Desde las 12:32 **todas las revisiones con IA fallaron** con `400 credit balance is too low`.
  Quedaron 7 documentos del portal en "cargado": S02086 (DNI del administrador y constancia de
  CUIT) y S01826 (constancia de CUIT, DNI del administrador, reglamento, acta de asamblea y aviso
  de obra). **El cliente vio el JSON de la API en inglés** en el portal y nadie se enteró.
- JS cargó saldo en https://console.anthropic.com/settings/billing (conviene la recarga
  automática). La clave de `.env.local` es de la misma cuenta.
- Se volvieron a revisar los 7 desde la Mac: 6 ok y el acta de S01826 observada.
- **Arreglo (`2db08a9`, `falla-ia.ts`):** quien sube el archivo (cliente o Segucom) ve sólo "No se
  pudo revisar automáticamente. Lo revisa una persona de ABA."; el error va al historial. Si la
  falla es de la cuenta (sin saldo, clave rechazada, límite de uso o API caída), sale **un aviso
  por día y por tipo** a `#permisos-de-andamio-` con qué hacer. Probado con la API real sin saldo.

### Mail automático al cliente cuando un documento queda observado

- **Pedido de JS:** que sea automático, directo al cliente y también en modo supervisado, y que lo
  que suban mal se avise por Slack.
- **Cómo quedó (`d206fa1`, `539c11b`, `1656dce`):**
  - Cuando la revisión observa un documento del portal, `pedirCorreccionAlCliente` le escribe al
    cliente con el documento, el motivo y el link del portal ("Reemplazar"). Copia a gestor y
    vendedor; respuestas al vendedor. Una vez por versión del documento (evento `link_cliente`
    con `documento_id` y `version`).
  - Aviso a Slack "Documento observado — <dirección>" con el motivo y si el mail salió
    (prioridad media) o no (alta, con el motivo: mail vacío o mal escrito).
  - Póliza de Segucom observada: aviso "Póliza observada — <dirección>". A Gonzalo no le sale
    nada automático (lo manda una persona, como siempre).
  - Botón **"Pedir corrección"** en los observados del legajo, sólo para **reenviar**; relee de
    Odoo el mail del cliente antes de mandar.
- **Vigencia del acta de asamblea con la Ley 941:** en la Ciudad el mandato del administrador dura
  un año y lo renueva la asamblea (art. 13, texto de la Ley 5932). Está en el criterio de la
  revisión y en el motivo que ve el cliente. Antes la IA decidía la vigencia sin regla.
- **S01826:**
  - El acta es de la asamblea del 13/09/2024 (designa a Matías Abálsamo desde esa fecha, sin plazo;
    el reglamento, art. 13, tampoco fija plazo), así que venció el 13/09/2025.
  - El mail del cliente estaba mal en Odoo (`@gmai.com`): se corrigió a
    `consorciosmanhuapi5100@gmail.com` en el contacto 7948 y en el trámite.
  - El pedido de corrección salió a las 22:20 con el botón (copia am@ y tam@).
- **Mandar mails desde la Mac no se puede:** `PERMISOS_MAIL_CLAVE` es variable protegida en
  Vercel y `vercel env pull` la trae vacía. Lo que tenga que mandar mail se dispara desde la app.

### Horario de presentación en TAD: de 19 a 7

- **Decisión de JS (`b5eba2a`):** a la tarde TAD falla seguido (15/09: 12 fallas de 14:10 a 18:52 y
  presentado 19:09; 16/09: 8 fallas de 12:31 a 14:27 y presentado 18:57). Son pocos datos y
  mezclados con arreglos del robot: **revisar el horario hacia el 30/09** con las horas de
  `tomada_at` y el resultado de cada `tad_presentar`.
- **Cómo quedó:**
  - Pedida fuera de horario (botón o automática), la tarea queda `pendiente` con
    `reintentar_desde` = 19:00 de ese día (`horario.ts`). La ficha dice "Programada" con
    **"Presentar ya"** (pide confirmación) y **"No presentar"**.
  - Los reintentos del robot por TAD caído siguen cada 30 min, pero dentro del horario
    (`dentroDelHorario` en `robot/tad-presentar.mjs`, duplicado a propósito).
  - Las pruebas (sólo formulario) no esperan. De 7 a 19 no se presenta: de la mañana no hay datos.
- El robot quedó reinstalado a las 22:16 con este código.

### Commits de la noche del 16/09

| Commit | Qué hace |
| --- | --- |
| `15a2b60` | Handoff al 16/09 19:00 |
| `2db08a9` | Sin saldo en Claude: el cliente no ve el error técnico y se avisa al canal |
| `d206fa1` | Mail al cliente cuando un documento queda observado; vigencia del acta con la Ley 941 |
| `539c11b` | Botón "Pedir corrección" para reenviar |
| `1656dce` | Aviso a Slack de documento o póliza observados |
| `b5eba2a` | Presentaciones en TAD de 19 a 7; fuera de horario quedan programadas |
| `c3ac518` + `93b9522` | Certificado del CPAU: une encomienda y certificación y exige registro + certificación |
| `13dc88a` | Script para cargar la tarjeta y mapeo del Histórico visado |
| `b97eb83` | Cierre automático de la encomienda: finaliza, firma, paga, carga y toma el certificado del mail |

---

## Estado 16/09 19:00 — S02128 presentado: EX-2026-41877012

**S02128 (Av. Corrientes 2810 esq. Pueyrredon) quedó presentado en TAD con número en el acto.**
Tarea **49**, borrador 13004673: a las 18:53 armó el borrador, en 2 minutos adjuntó los 11
casilleros (el estatuto de 57 páginas entró en 22 s), llenó el formulario (Balvanera, Comuna 3,
SMP 013-098-001A; corrigió por ZK 8 campos que el formulario no había registrado) y a las 18:57:03
confirmó: **EX-2026-41877012- -GCABA-SSGOU**. A las 18:57:12 escribió Odoo (S02128 presentado el
2026-09-16) y salió el aviso "Presentado en TAD" a `#permisos-de-andamio-`. El trámite quedó
`presentado` con el expediente vinculado por `numero`.

Se presentó **sin la administradora como coasegurada** en la póliza (quedaba la advertencia
`coasegurado_administrador`). Si el GCBA lo observa, entra por Subsanación.

**Costó toda la tarde. Lo que pasó, en orden:**
1. **12:31, 13:06, 13:11 y 13:35 — TAD cerraba la sesión apenas empezaba la presentación.** El
   robot caía en el login de miBA; a las 13:11 y 13:35, aunque al recargar la página dijera
   "Representando a:". La
   única que pasó el inicio (13:18) venía de un login recién hecho. **Arreglo (`70742f9`):** cada
   presentación cierra el navegador, abre uno nuevo y hace login completo. Y si TAD lo saca al
   login en el medio, es `TadNoCarga` y se reintenta sola desde el borrador. Desde entonces no
   volvió a pasar.
2. **13:24 — el estatuto (reglamento del consorcio, 9,9 MB) no quedó en el casillero** del
   borrador 12998722: TAD no contestó `personaDocumento/save`. **Arreglo (`9242a87`):** el robot
   comprime con **Ghostscript** todo PDF de más de 4 MB (`/ebook` y, si no alcanza, `/screen`, sin
   rotar y con la misma cantidad de páginas): quedó en 3,9 MB. **Ghostscript quedó instalado con
   Homebrew en la Mac mini** (como qpdf: si el robot se muda, instalarlo).
3. **13:44 y 13:48 — "Seguir desde el borrador" no abrió 12998722** (la lista de documentos no
   cargaba). Se frenó la tarea 46, se borró el borrador desde la Mac mini y se empezó de cero.
4. **14:03–14:11 — borrador nuevo 12999516:** 7 adjuntos bien y **el estatuto comprimido tampoco
   tuvo respuesta en 5 minutos**. Se descartó que fuera el peso (el de S02466 tenía 5 MB y 21
   páginas y entró). **Cambio (`c3ac552`):** la espera sube a 10 min y el motivo dice si el pedido
   salió, si el navegador lo cortó o si TAD no contestó.
5. **14:28–14:44 — "Seguir desde el borrador" tampoco abrió 12999516** (3 intentos). El tercero
   frenó con un clic tapado por el "Cargando..." de TAD (`divLoading`), que no se toma como TAD
   lento: la tarea 48 quedó en `error` sin reintento. A esa hora también falló una vuelta de
   lectura por lo mismo.
6. **18:50 — se borró 12999516, se descartó en la app y se pidió de cero** (tarea 49, a pedido de
   JS, todo desde la Mac mini). Entró todo de una.

**Conclusiones (detalle en el diseño, § "Presentación automática — 16/09"):**
- **Un adjunto que queda colgado rompe el borrador para siempre** (ya no es sospecha: 12998722 y
  12999516). "Seguir desde el borrador" no sirve: hay que borrarlo y empezar de cero.
- **TAD a la tarde no procesaba el estatuto; a la noche sí, en 22 s.** No eran las 57 páginas.
  Si un documento pesado se cuelga de día, conviene reintentar a la noche con borrador nuevo
  antes que gastar borradores a la tarde.
- **Borrar un borrador real desde acá:** frenar el robot, `node --env-file=robot/.env.robot
  robot/borrar-tad-borrador.mjs <id>` (la traba sólo deja pasar el DELETE de ese id), marcar
  `resultado.borrador_descartado` en la tarea que lo dejó y reinstalar el robot. Se hizo con
  12998722 (13:55) y 12999516 (18:48).

**Números sueltos en GDE que dejaron los dos borradores borrados:**
- de 12998722: IF-2026-41795544, IF-2026-41795589, IF-2026-41795724, IF-2026-41795817,
  RE-2026-41795950, IF-2026-41795973 y RE-2026-41796000;
- de 12999516: IF-2026-41809878, IF-2026-41809960, IF-2026-41810095, IF-2026-41810164,
  RE-2026-41810264, IF-2026-41810287 y RE-2026-41810322.

Los de la presentación (13004673) van de IF-2026-41876699 a IF-2026-41876871.

**Pendientes nuevos del robot de TAD:**
- **Clic tapado por `divLoading`** ("… intercepts pointer events"): tratarlo como `TadNoCarga`
  para que la presentación se reintente sola (tarea 48).
- **Adjunto colgado:** hoy frena con `Trabado` y el botón ofrece "Seguir desde el borrador", que
  ya se sabe que no abre. Evaluar que la ficha proponga directamente borrar y empezar de cero
  (o que el robot lo reintente de noche).
- El arreglo de `fea6fd0` (recargar para verificar la sesión) quedó reemplazado por `70742f9`.

---

## Estado 16/09 11:30 — S02466 con expediente: el circuito salió entero solo

**Lo grande del día: se presentó el primer permiso entero sin que nadie tocara TAD.** El robot
armó el borrador 12989635, adjuntó los 11 casilleros, llenó y guardó el formulario y tocó
"Confirmar trámite" a las 19:09. TAD contestó *"Generación de trámite pendiente · Número de
expediente en espera · Tenemos problemas para generar el expediente electrónico de tu trámite…
podrás visualizarlo en Trámites en curso"* (captura `39-03-confirmar-1.png`). O sea: la
presentación entró y **falta que el GCBA le asigne el número**.

**El número apareció a la madrugada y se vinculó solo.** A las 00:08:08 el robot leyó el
expediente nuevo en "En curso" y lo cruzó con la presentación por la parcela (11-63-21A):
**EX-2026-41680986- -GCABA-SSGOU**, en INICIACION, creado el 15/09. A las 00:08:14 escribió en
Odoo `x_tramite_estado = presentado`, `x_expediente_nro` y `x_expediente_fecha = 2026-09-15`
(verificado contra Odoo, sin `odoo_error`), y a las 00:08:15 salieron los avisos al canal. La
tarea **39** quedó `ok` con `etapa: presentado` y el trámite con su `expediente_id`.

**Así que el circuito completo funcionó sin que nadie tocara TAD:** encomienda, legajo,
presentación, expediente y Odoo. `vincularPresentaciones` se vio funcionando con un caso real.

### Lo primero en la sesión nueva

1. **Seguir los expedientes EX-2026-41680986 (S02466) y EX-2026-41877012 (S02128).** Ahora
   manda el GCBA: el robot mira cada 30 min y avisa cuando pasen a **Subsanación** (hay que
   corregir, ver § C) o a **Tramitación** (salió el permiso). Nada que hacer hasta entonces.
2. **S02465 (Salguero 359): falta sólo el CPAU** (trámite `abierto` al 16/09 19:00). Tiene el
   Registro Web 00329521985 y espera que se firme, pague y cargue la encomienda en
   tramites.cpau.org y se suba el certificado visado en la ficha. Con eso se presenta.
   - **S02128** ya está presentado (§ "Estado 16/09 19:00"). Era una venta de julio habilitada
     como excepción (`VENTAS_A_INICIAR_ADEMAS` en `portal.ts`), Registro Web 00329522116, primer
     trámite real con administradora coasegurada (Patricia Beatriz Saggese, CUIT 27066992220),
     que la póliza no traía: se presentó con esa advertencia.
3. **Terminar la automatización del cierre de la encomienda del CPAU** (ver la sección que
   sigue). Cuando esté, las próximas encomiendas se cierran con el robot en vez de a mano.
4. **Pendientes nuevos del robot de TAD** (§ "Estado 16/09 19:00"): el clic tapado por
   `divLoading` y qué ofrecer cuando un adjunto queda colgado.

## Cierre de la encomienda del CPAU — mapeo (16/09; construido a la noche, ver § "Noche 16/09")

**Objetivo (JS, 16/09):** que el robot haga solo lo que hoy se hace a mano después de
"Finalizar" en el RETP: bajar la encomienda, firmarla, **pagarla** y cargarla en la Plataforma
del CPAU, **sin botón de aprobación**, pago incluido. Siempre es el producto de $50.000.

**Decisiones de JS:**
- Las cuentas de perfil.cpau.org y tramites.cpau.org son **las mismas del RETP** (`CPAU_USUARIO` /
  `CPAU_CLAVE`, la cuenta de Hougassian).
- Firmas: **"Firma JS"** para el comitente y **"Firma 01"** (Hougassian) para el matriculado.
  Están en el bucket: `plantillas/comun/firma-js.png` y `firma-hougassian-encomienda.png`. La
  `firma-hougassian.png` de siempre sigue para el informe técnico.
- La tarjeta la carga JS en `robot/.env.robot`. Los 9 campos están vacíos, cada uno con su
  formato en el comentario de arriba (titular, número, vencimiento MMAA, código, mail, DNI,
  calle, número de puerta, nacimiento DDMMAAAA). Sin comillas y sin comentarios en la línea.

**Ya mapeado** (detalle técnico en el diseño, § "Cierre de la encomienda — mapeo 16/09"):
1. **Bajar la encomienda sin firmas:** del Histórico del RETP, botón de la ventana ("Show") de la
   fila → registro de 3 hojas. El CPAU le pega HTML detrás del PDF: se corta en el último `%%EOF`.
2. **Firmar:** posiciones medidas en las 3 hojas y **probado** con el registro de S02128 (en una
   copia local, no se cargó nada).
3. **Pagar:** producto 51 → Comprar Ahora → carrito → Finalizar Compra → checkout (Visa Crédito ya
   elegida) → Procesar Pago → formulario de Decidir (SPS). Sin código por SMS ni app del banco a la
   vista. **Queda sin ver lo que pasa después de "Aceptar"** (resultado y comprobante): sólo se
   ve con un pago real.
4. **Plataforma:** no tiene login. Paso 1 = matrícula + DNI del matriculado + aceptar la
   declaración jurada. **Pasos 2 y 3 sin mapear.**

**Lo que falta, en orden:**
1. **Parte 2 — mapear los pasos 2 y 3 de la Plataforma** hasta antes de "Enviar" (instructivo:
   Habilitación de Est. Trans. + n° de encomienda + PDF firmado → Siguiente → Pago electrónico +
   n° de comprobante + PDF del comprobante → Enviar).
2. **Parte 3 — construir el robot** que encadene todo después de Finalizar. El registro sin
   firmas se baja **apenas se finaliza**: después de que el CPAU lo procesa, el mismo "Show" lo
   muestra distinto (ver "El propietario" abajo).
3. **Primera corrida real** (con la tarjeta cargada): ver la pantalla después de "Aceptar", de
   dónde sale el comprobante y el número que pide la Plataforma.
4. **Seguir el visado:** lo que va a TAD como "Certificado de Encomienda Profesional" son **5
   hojas en un PDF**: el registro firmado y sellado por el CPAU (3 hojas), la certificación ("EL
   CONSEJO PROFESIONAL … CERTIFICA QUE", con QR) y el comprobante de pago de $50.000. Según JS
   (16/09), **la certificación aparece apenas se carga todo en la Plataforma y la encomienda final
   30-40 minutos después**, y hay que unir los dos PDF. Hoy se bajan a mano y se suben en la ficha
   ("1. Encomienda" + "2. Certificación", la app los une: `c3ac518`). Falta ver de qué pantalla
   salen para que el robot los baje solo.

**Cosas a tener en cuenta:**
- **El propietario: falsa alarma (revisado el 16/09 a la noche).** Los PDF que se subieron a TAD
  de S02465 y S02128, hechos por el robot, dicen "CUIT/CUIL" y el CUIT del consorcio, igual que
  Guido 1923 y los de Tamara del 01/09 (Uruguay 1275, Córdoba 2914, Anchorena 1170); todos con
  "Usuario Reg/Ins/Upd NA hougassian hougassian". Lo que decía "Documento Único 36684541" (el DNI
  de JS) era el registro de S02128 **bajado del Histórico después de que el CPAU lo procesó**
  (usuario "cristian cristian cristian", con n° de encomienda): el CPAU lo muestra así, pero no es
  lo que se presenta. No hay nada que arreglar en el robot.
- **Quedó una intención de pago sin pagar** en la cuenta de Hougassian (operación 292118), del
  mapeo. Autorizado por JS; no genera cargos.
- **Seguridad:** el PDF "INSTRUCTIVO ENCOMIENDA (pendiente de revisión)" en Descargas de la Mac
  mini tiene en texto plano la clave del CPAU y los datos completos de la tarjeta, código incluido.
  Recomendado: borrarlo, cambiar la clave del CPAU y evaluar una tarjeta virtual para el robot.
- Scripts de mapeo (sólo lectura o sin pagar): `robot/mapear-cpau-cierre.mjs` (Histórico, tienda
  y Plataforma) y `robot/mapear-cpau-compra.mjs` (compra hasta el formulario de Decidir).
  Capturas en `robot/capturas/cpau-cierre/` y `cpau-compra/`, ignoradas por git.

### Lo que se aprendió a la tarde-noche (15/09, implementado salvo lo marcado)

- **"Volver a presentar" que no crea la tarea:** la ruta corta a los 60 s (504) cuando USIG no
  responde (`normalizar`, 3 × 20 s). No quedan ni tarea ni evento: volver a tocarlo.
  *Pendiente:* usar la obra de la presentación anterior si USIG falla.
- **Abrir TAD en el navegador corta la sesión del robot**, aunque se cierre enseguida.
  `sesionViva` mira la página sin recargar, y el robot cae en el login de miBA (tarea 36).
  *Resuelto el 16/09 (`70742f9`):* cada presentación entra con navegador nuevo y login completo,
  y un login a mitad de camino se reintenta solo.
- **TAD rechaza algunos PDF con firma digital:** "No pudimos adjuntar tu documento. El archivo
  se encuentra previamente firmado o con espacios de firma". Pasó con el acta de asamblea
  (certificación digital del Colegio de Escribanos); el aviso de obra, firmado en GDE, entra.
  El robot aplana con `qpdf` todo PDF con `/ByteRange` menos el aviso de obra antes de subirlo.
  Si igual lo rechazan, elige la copia aplanada en la misma ventana.
- **No cerrar la ventana de Adjuntar:** abre "¿Abandonar el proceso de carga de
  documentación?" y tapa la página (tarea 38).
- **Sospecha confirmada:** un borrador con un adjunto rechazado o a medias no carga sus
  documentos al reabrirlo (12988373, 12989045). Con uno así, empezar de cero.
- **Borradores descartados a la noche:** 12989045 y 12989495, borrados a mano por JS.
- **Números sueltos en GDE:**
  - de 12989045: IF-2026-41668406, IF-2026-41668420, IF-2026-41668449, IF-2026-41668463,
    RE-2026-41668490, IF-2026-41668495, RE-2026-41668501 e IF-2026-41668540;
  - de 12989495: IF-2026-41670550, IF-2026-41670556, IF-2026-41670573, IF-2026-41670581,
    RE-2026-41670589, IF-2026-41670593, RE-2026-41670594 e IF-2026-41670612.
- Los de la presentación (12989635) van de IF-2026-41671148 a IF-2026-41671261.

### Cambios pedidos por JS a la noche (15/09)

- **Avisos del módulo a `#permisos-de-andamio-`** (ya no a #syh): los tres tipos (`permiso_novedad`,
  `permiso_robot` y `permiso_endoso`), desde la app y desde el robot, con `SLACK_WEBHOOK_PERMISOS`
  (en `.env.local` y en Vercel). Sin esa variable vuelven a #syh.
- **Administrador del consorcio como coasegurado:** el cliente lo carga en el primer paso del
  portal, junto con el consorcio, y sale en el pedido a Gonzalo. Si la póliza no lo trae, es una
  advertencia. Sólo obras nuevas. Detalle en el diseño, § Póliza.
- **El cliente puede leer el acta y la nota antes de firmar** ("Leer el Acta de compromiso" /
  "Leer la Nota": el PDF sin firma, marcado como borrador) y abrir lo que ya subió o firmó con
  un link de 10 minutos.
- **Aviso si el robot deja de dar señales:** cron `/api/permisos-via-publica/latido` cada 30 min
  → `#permisos-de-andamio-`. Detalle en el diseño, § Fase 1c.
- **Pendiente en la Mac (lo hace JS):** inicio de sesión automático y encendido después de un
  corte de luz, cable de red, UPS chico y frenar las actualizaciones automáticas de macOS.

### Lo que se aprendió hoy de TAD (implementado; detalle en el diseño, § Presentación automática)

- **Orden de Tamara:**
  1. Adjuntar lo que aparece **sin tocar** Persona Jurídica ni "Datos del trámite".
  2. Persona Jurídica y sus 4 casilleros nuevos.
  3. "Datos del trámite" y Confirmar.
  
  En otro orden TAD falla. El robot arma cada tanda con lo que ve en pantalla.
- **El número del adjunto puede ser RE, no sólo IF:** el croquis y "Otra documentación" salieron
  RE. El robot acepta cualquier sigla menos EX.
- **TAD sube el archivo apenas se elige** y "Adjuntar" queda desactivado hasta que termina
  (máx. 20 MB). El robot espera hasta 3 min (commit `bed4c04`).
- **Cartel "No se pudo establecer comunicación con el servicio" = TAD caído, no borrador roto.**
  El robot guarda `resultado.tad_caido` y la ficha oculta "Empezar de cero".
- **TAD caído es común (Tamara):** si la presentación frena por TAD y no se tocó Confirmar,
  vuelve sola a la cola cada 30 min, hasta 16 veces (`pvp_tareas.reintentar_desde`, migración
  `20260915000008`, ya aplicada). En la ficha aparecen "Probar ahora" y "Dejar de reintentar".
- **Sospecha confirmada el 16/09** (12998722 y 12999516, § "Estado 16/09 19:00"): un borrador
  deja de cargar sus documentos (el robot espera 3 × 3 min y frena) cuando **una subida falla o
  queda a medias**:
  - **12984454:** póliza encriptada;
  - **12988373:** el robot se cortó con el reglamento todavía subiendo;
  - **12986313:** fue durante la caída de TAD.
  
  Si vuelve a pasar con subidas completas, la sospecha es falsa.
- **Borradores descartados hoy:** 12984454, 12986313 y 12988373. Todos borrados a mano por JS.
- **Números de documento que quedaron sueltos en GDE:**
  - IF-2026-41611319 (nota);
  - de 12988373: IF-2026-41662510, IF-2026-41662519, IF-2026-41662561, IF-2026-41662588,
    RE-2026-41662633, IF-2026-41663879 y RE-2026-41663885.

### Supabase cayó y se subió a Small

A las 16:35 todo el proyecto quedó Unhealthy: API, login, storage con 544 y timeouts del
pooler. La base era NANO y tenía el Disk IO agotado. JS reinició y subió el compute a **Small**
(~US$15/mes). **Si la app o el robot se cuelgan con `fetch failed` o timeouts, probar Supabase
con curl antes de buscar en el código.**

### Operar el robot (se hizo varias veces hoy)

- **Frenar:** `launchctl bootout gui/$(id -u)/ar.com.andamiosbuenosaires.robot-tad` y esperar a
  que no quede `worker-tad.mjs`. Si cortó una presentación, la tarea queda `tomada`: pasarla a
  `pendiente` para retomarla, o a `error` con `resultado.borrador` para poder descartarla desde
  la ficha. El log muestra "Target page, context or browser has been closed".
- **Reinstalar** después de tocar el robot: `bash robot/instalar-launchd.sh`, con 0 tareas
  `tomada`.
- **No abrir TAD en el navegador mientras el robot presenta:** es la misma cuenta. Para borrar
  un borrador, frenar antes el robot. El link es https://tad.buenosaires.gob.ar/tramitesadistancia/
- **Botones de la ficha:**
  - "Seguir desde el borrador";
  - "Empezar de cero": primero se borra el borrador en TAD;
  - "Volver a presentar";
  - durante un reintento, "Probar ahora" y "Dejar de reintentar";
  - con la presentación programada para las 19:00 (desde el 16/09), "Presentar ya" y "No
    presentar";
  - en un documento observado del legajo, "Pedir corrección" (reenvía el mail al cliente).

### Pendientes chicos que salieron hoy

- **Tarea `tomada` para siempre:** si se para el robot en medio de una presentación, la tarea
  queda así. Arreglarlo al arrancar el worker (devolver las tomadas viejas) o en el SIGTERM.
- **Salir ordenado de la ventana de Adjuntar** cuando el robot se frena ahí, si se confirma la
  sospecha de los borradores.
- **Bajar lo que el robot escribe en Supabase en cada vuelta.**
- **Rotar `PERMISOS_MAIL_CLAVE`:** se escribió en el chat el 15/09.
- **Mensaje engañoso del login (16/09 11:18):** miBA aceptó la clave, pero TAD quedó en blanco en
  `tramitesadistancia/?init=` y `entrar()` tiró "miBA no dejó entrar (sigue en el login)"
  (`robot/tad-comun.mjs:93-94`). La vuelta de las 11:30 entró bien. En una vuelta no importa,
  pero **en una presentación ese mensaje no se reintenta** (`frenarPresentacion`). Separar los dos
  casos: login rechazado (no reintentar, para no bloquear la cuenta) y TAD que no carga después
  del login (`TadNoCarga`, reintentar).
- **Regenerar `SLACK_WEBHOOK_PERMISOS`** (canal `#permisos-de-andamio-`): la URL se escribió en
  el chat el 15/09. Después de regenerarlo, cambiarlo en `.env.local` (lo usa el robot) y en
  Vercel, y reinstalar el robot.

**Commits de la tarde:**

| Commit | Qué hace |
| --- | --- |
| `c0c251f` | Empezar de cero |
| `4456577` | Aviso de TAD caído |
| `2639d71` | Reintento automático |
| `4a2adc2` | Orden de Tamara |
| `92c697d` | Números RE |
| `bed4c04` | Espera de la subida |

**Commits de la noche:**

| Commit | Qué hace |
| --- | --- |
| `9c2a445` | TAD rechaza el PDF con firma digital: se aplana y se vuelve a adjuntar |
| `3ab1e89` | Aplanar antes de subir y no cerrar la ventana de Adjuntar |
| `9f7f25f` | Presentación sin número de expediente, vinculada sola cuando aparece |
| `72bda5f` | Los avisos del módulo van a `#permisos-de-andamio-` |
| `2b8d5cb` | El administrador del consorcio, también coasegurado |
| `89314b3` | El cliente puede leer el acta y la nota antes de firmarlas |
| `1f2ef33` + `b9ed63a` | Aviso a Slack cuando el robot deja de dar señales (y su arreglo en el proxy) |
| `2e22de6` | El latido también avisa cuando el robot vuelve |

**Commits del 16/09:**

| Commit | Qué hace |
| --- | --- |
| `63f46c3` | Un solo aviso "Ya tiene número de expediente" cuando se vincula una presentación |
| `dc9ae8e` | S02128 aparece para iniciar aunque sea de julio (excepción puntual) |
| `5479fce` + `f279dbf` | Handoff de las 11:30 y mapeo del cierre de la encomienda del CPAU |
| `fea6fd0` | Verificar la sesión recargando antes de presentar (reemplazado por `70742f9`) |
| `9242a87` | Los PDF de más de 4 MB se comprimen con Ghostscript antes de adjuntar |
| `70742f9` | Cada presentación entra con sesión nueva; login a mitad de camino = reintento |
| `c3ac552` | El adjunto espera 10 min y el motivo dice si el pedido salió, se cortó o no hubo respuesta |

Todos publicados. El robot de la Mac quedó reinstalado con el código de `c3ac552` (el de
`dc9ae8e` es sólo de la app). Aparte, en main hay un commit de otra sesión que no es de este
módulo: `78df0bf`, perfil Comercial para las asistentes comerciales (con su migración).

---

## Objetivo

Que nadie haga a mano el permiso de uso de andamio en vía pública (GCBA/TAD + encomienda
CPAU) que hoy hace Tamara. Hougassian autorizó su firma; Jorge Riveros Zanetta sabe que el
robot usa su cuenta miBA. Los primeros ~10 trámites van **supervisados** (el robot deja todo
listo y una persona aprueba el último clic).

## El circuito y dónde está cada paso

| # | Paso | Estado |
| --- | --- | --- |
| 1 | Venta confirmada con `x_lleva_permiso = sí` → se abre el trámite | 🟡 con botón "Iniciar trámite" (automatismo de Odoo id 52 desactivado a propósito) |
| 2 | Link del portal al cliente (mail + copiar para WhatsApp) | ✅ |
| 3 | Cliente carga el dueño del lote → pedido de endoso a Segucom (portal, recordatorios, revisión con IA de la póliza) | ✅ |
| 4 | Cliente carga el legajo → revisión con IA; acta y nota firmadas en el portal | ✅ (falta plantilla de nota del dueño para inquilinos; faltan recordatorios al cliente) |
| 5 | Legajo completo → informe técnico y croquis generados solos | ✅ (sólo multidireccional) |
| 6 | Encomienda del CPAU | 🟡 el robot completa y frena en Confirmar; "Finalizar en el CPAU" desde la ficha. **Falta firma, pago, carga y certificado** |
| 7 | **Presentar en TAD** → EX → `presentado` en Odoo | ✅ **presentó sola la primera real (S02466, 15/09)**. Si TAD deja el número "en espera", el robot lo vincula cuando aparece (falta verlo pasar una vez) |
| 8 | Seguimiento diario de TAD (estados, motivo, permiso, Odoo) | ✅ |
| 9 | **Subsanación** (clasificar el motivo, corregir, subsanar en TAD) | ❌ sólo lee el motivo y avisa |
| 10 | Permiso emitido → al cliente | 🟡 se descarga y escribe Odoo; **no se le manda al cliente** |
| 11 | **Renovación** (vence − 30 días) | ❌ |

Último commit: `2e22de6` (el latido del robot también avisa cuando vuelve), publicado en Vercel
y el robot de la Mac reinstalado con ese código.

---

## Actualización 2026-09-15 (mediodía)

- **Presentación en TAD construida, automática** (§ A). Probada por la cola en modo prueba
  (llena y guarda el formulario, verifica la parcela, borra el borrador); hoy no llega ningún
  trámite real porque falta el certificado de la encomienda.
- **591 expedientes finalizados históricos** quedaron guardados como historial (decisión de
  JS) después de que el robot empezara a leer Finalizados entero. El robot no los sigue ni abre
  su detalle. Ver diseño § "Historial de finalizados y robustez del robot".
- **IF-2026-41508096-GCABA-SSGOU** quedó creado en GDE por la prueba de Adjuntar (PDF "PRUEBA —
  NO PRESENTAR"). No se vuelve a probar Adjuntar.
- **Cada vez que se para el robot en medio de una vuelta** el log muestra "Target page, context
  or browser has been closed": no es una falla, es la interrupción.

## Actualización 2026-09-15 (tarde) — modo supervisado

- **JS quiere probar con ventas reales.** Para las primeras ~2 semanas: el link va al
  **vendedor** (no al cliente), y el endoso, la encomienda y la presentación se disparan con
  botones de la ficha; la app avisa cuando están para hacerse. Interruptores en la bandeja
  ("Modo supervisado"). Todos los mails con copia al vendedor y al gestor; respuestas al vendedor.
- **Tarjeta del CPAU:** no hace falta todavía. En la primera encomienda real, firma/pago/carga
  se hacen a mano; el robot captura lo que aparece después de Finalizar. El certificado visado
  se sube en la ficha ("Certificado visado") y eso habilita la presentación.
- **Para la prueba:** avisar a Tamara qué venta es (que no mande el Google Form ni lo tramite en
  paralelo).

## Lo que falta, en detalle

### A. Presentar en TAD (lo más importante)

Hoy es lo único que obliga a que una persona haga el trámite.

**Lo que ya se sabe** (modulo § Fase 0 y § Carátula):
- Trámite *"Solicitud de permiso para la instalación de andamios en el espacio publico"*
  (organismo SSGOU, `idTipoTramite=324`). Se entra con miBA (`robot/tad-comun.mjs → entrar`)
  y se navega **siempre con el menú**.
- **Iniciar trámite** → modal "Seleccionar representación" → EMPRENDIMIENTOS Y ESTRUCTURAS
  S.A. → Confirmar → asistente de 3 pasos:
  1. *Datos del solicitante* (razón social, CUIT, mail de aviso, teléfono, apoderado) → Continuar.
  2. *Adjuntá documentación*: botón **Completar** de "Datos del trámite" + un **Adjuntar**
     por casillero.
  3. *Resumen* → **Confirmar trámite** → sale el EX.
- Lo que va en "Datos del trámite" (sale de la carátula de trámites presentados): carácter
  Representante Técnico · Andamio · Persona Jurídica · calle y altura, barrio, comuna,
  **sección / manzana / parcela**, CP · representante legal JS (apoderado) · contacto
  `tam@` · fechas desde hoy hasta +6 meses (`pvp_tramites.permiso_hasta`) · seguro:
  compañía y vencimiento (salen de la revisión de la póliza) · declaración jurada Sí.
- Casilleros y a qué documento del trámite va cada uno: modulo § 1 ("Mapeo a los casilleros
  de TAD") y § Fase 0 (lista con los nombres exactos). En consorcios: estatuto → Reglamento;
  designación de autoridades y poder → Acta de Asamblea; DNI del apoderado → administrador;
  Otra documentación → Acta de compromiso.
- Todo en PDF; la póliza no puede pedir contraseña (las de La Mercantil con `/Encrypt` pasan).

**Mapeado el 15/09 con borradores de prueba (decisión de JS), después borrados.** Todo en
`docs/modulo-gestoria-permisos.md` § "Presentación en TAD — mapeo": borradores (llegar al
paso 1 crea uno; la solapa carga en ~18 s y permite borrar), paso 2 con el radio Persona
Física/Jurídica y los 12 casilleros, y el formulario "Datos del trámite" (iframe ZK, 53
campos con su `name`, opciones de cada desplegable, fechas dd/mm/aaaa, y **cómo cargar la
dirección para que Autocompletar llene comuna/barrio/SMP**). Los valores de ABA salen de la
carátula presentada de EX-2026-30158135. Lo único sin ver: "Guardar", los "Adjuntar" y el
Resumen/Confirmar.

**Construido el 15/09 — automática, sin aprobación (decisión de JS).** Ver
`docs/modulo-gestoria-permisos.md` § "Presentación automática". Se dispara sola cuando el
trámite está listo; hoy no llega ninguno porque falta el certificado de la encomienda (B).
Lo único sin ver es la pantalla después de "Confirmar trámite": la muestra la primera real.
Adjuntar crea un IF oficial en GDE aunque sea borrador: **no probar Adjuntar**.

**Lo que se había planeado (queda como referencia):**
- Tarea `tad_presentar` en `pvp_tareas` (migración: agregar el tipo) con `esperando_aprobacion`
  antes de "Confirmar trámite". Robot nuevo `robot/tad-presentar.mjs`, lo toma `worker-tad.mjs`
  (usa la misma sesión de TAD o una propia: decidir; hoy la sesión queda abierta entre vueltas).
- Datos catastrales: USIG + EPOK ya dan SMP (`src/lib/permisos-via-publica/catastro.ts`).
  **Verificar** de dónde salen barrio, comuna y CP (EPOK `parcela` no los trae; probar USIG
  "datos útiles" con las coordenadas de `normalizar`).
- **"Listo para presentar"**: hoy no hay máquina de estados en `pvp_tramites.estado` (queda
  `abierto`). Regla del diseño: legajo del cliente ok + póliza ok + encomienda con
  certificado + informe + croquis. Disparar la tarea ahí.
- Al salir el EX: crear/vincular `pvp_expedientes` y `pvp_tramites.expediente_id`, vínculo
  con la venta como seguro (`odoo_vinculo_por = 'numero'`), y dejar que `sincronizarOdoo`
  escriba `presentado`.
- Ojo: **abrir el detalle de un expediente agrega una Constancia de Consulta**. El paso 2 de
  una subsanación ya muestra "Confirmar trámite": nunca tocar sin aprobación.

### B. Terminar la encomienda del CPAU

Construido hasta Finalizar (`robot/cpau-encomienda.mjs`, ficha, `encomienda.ts`). Falta lo
que viene después, que **sólo se ve con la primera encomienda real**:
1. **JS carga la tarjeta en `robot/.env.robot`** (nunca por el chat ni en el repo).
2. Primera encomienda real: tocar "Finalizar en el CPAU" mirando. El robot deja las capturas
   de después de Finalizar en el bucket (`tramites/<id>/cpau/<tarea>-f*.png`) y el texto en
   `pvp_tareas.resultado.texto_final`.
3. Con eso, automatizar (según el instructivo de Tamara): **firma** (hoy la pega con
   ilovepdf), **compra** "Encomienda de habilitación de cartel o estructuras transitorias"
   ($50.000, concepto "EVHA Reg.Habilit. Hasta 120", siempre igual), **carga en
   tramites.cpau.org** con n° de encomienda y comprobante, y **bajar el certificado visado**
   desde el Histórico (columna Certificado) como documento `encomienda_cpau` (PDF completo:
   registro ×3 + certificado + comprobante de pago).
- Para probar cambios sin gastar: `node --env-file=.env.local --env-file=robot/.env.robot robot/probar-encomienda.mjs`.
- Diferencia a mirar: el frente sale de las puertas del catastro (Trelles da 1084–1090; la
  presentada decía 1084–1088).

### C. Subsanaciones

Hoy el robot lee el motivo (`pvp_expedientes.motivo_subsanacion`) y avisa. Falta:
- **IA que clasifique el motivo** en acciones: póliza → volver a pedir el endoso solo
  (`motivoDePoliza` en `tipos.ts` ya lo detecta por palabras; la póliza exige coasegurado =
  titular Y no repetición a favor del GCBA, dos cosas distintas); croquis / informe →
  regenerar; documento del cliente → pedírselo en el portal con el motivo exacto.
- **Robot `tad_subsanar`**: Tareas pendientes → ícono `build` → asistente de 3 pasos; el
  paso 2 pide **sólo los casilleros observados** y ya muestra "Confirmar trámite".
  Supervisado.
- Expedientes viejos (anteriores al portal) no tienen legajo en la app: la ficha del
  expediente ya permite pedir endoso y subir PDF a mano; decidir si alcanza.

### D. Cierre y renovación

- **Permiso al cliente:** cuando el robot baja la RS del permiso (`pvp_expedientes.permiso_path`),
  mandarla por mail al cliente del trámite (`enviarMail` en `src/lib/mail.ts`; verificar si
  soporta adjunto o mandar link firmado) y cerrar el trámite.
- **Renovación:** `pvp_expedientes.permiso_vence` ya está. En el cron `/api/alertas/barrido`
  (L–V 8 h), a vence − 30 días corridos abrir la renovación. **Averiguar** si en TAD es el
  mismo trámite o uno distinto, y qué documentos se repiten (póliza con vigencia nueva seguro).
- Vigencia otorgada puede ser menor a la pedida: usar siempre la del PDF.

### E. Cosas chicas

- **Apertura sola:** reactivar el automatismo de Odoo "AndamiosOS permisos de venta" (id 52)
  corriendo `scripts/odoo-webhook-ventas-permiso.mjs` sin `--desactivar`. JS lo dejó manual
  "por las dudas"; decidir cuándo.
- **Recordatorios al cliente** si no carga el legajo (cadencia a definir; mismo cron).
- **Nota del dueño para inquilinos:** redactar la plantilla (en el Drive sólo hay una de YPF
  Gas de 2021).
- **Interruptor de supervisión** en Configuración (encomienda y presentación) para después
  de ~10 trámites bien.
- **"Probar el circuito" de punta a punta** con JS: la prueba ya llega hasta Confirmar en el
  CPAU (con el frente de Trelles porque la dirección es inventada) y nunca finaliza.
- Vínculos del 14/09: **verificar si JS confirmó los 16 vínculos por dirección** y vinculó a
  mano los 3 sin altura (Salcedo, Parana, Pellegrini Carlos); sin eso no se escribe Odoo.

### F. Operativo

- **El robot sólo corre con la Mac mini prendida** (LaunchAgent, `robot/instalar-launchd.sh`;
  reinstalar después de cambiar código). Después: servidor en la nube, probando antes si TAD
  y AGIP aceptan IPs de afuera de Argentina.
- **Rotar credenciales:** Clave Ciudad, CPAU (Hougassian), miBA de Jorge y
  `PERMISOS_MAIL_CLAVE` (clave de aplicación de js@, quedó escrita en el chat del 15/09).
- **Casilla propia** en vez de js@: cambiar `PERMISOS_MAIL`, el mail de aviso de TAD y el
  domicilio electrónico del acta de compromiso.

---

## Orden sugerido para mañana

1. **Verificar que todo sigue vivo:** `tail ~/Library/Logs/andamios-robot-tad.log` (vueltas
   OK) y en la base `select tipo, estado, error, created_at from pvp_tareas order by created_at desc limit 5;`
   (con `npx supabase db query --db-url "$SUPABASE_DB_URL" "…"` tras `set -a; . ./.env.local; set +a`).
2. **Decidir con JS** cómo mapear el paso 2 de TAD (A: real supervisado o borrador de prueba).
3. **Construir la presentación en TAD** (A), empezando por el mapeo y los datos catastrales
   que faltan (barrio, comuna, CP).
4. En paralelo, cuando haya una encomienda real: **terminar la encomienda** (B).
5. Subsanaciones (C) → cierre y renovación (D) → chicas (E).

## Decisiones pendientes de JS

- Mapeo del paso 2 de TAD: con trámite real supervisado o con un borrador de prueba.
- Cuándo reactivar la apertura automática desde Odoo.
- Cadencia de recordatorios al cliente.
- Si los expedientes viejos se subsanan con la app o siguen a mano.
- Rotación de credenciales y casilla propia ("más adelante").
- ¿Se importan los expedientes de la planilla DOCS TRACKER?

## Reglas que no se leen en el código

- **Nunca `supabase db push`** (historial remoto vacío). Migraciones con `db query`, sin
  comentarios `--`, en un bloque `DO $mig$`.
- **TAD:** navegar siempre con el menú (URL directa rebota); sólo filas `tr:visible`; abrir
  el detalle de un expediente **agrega una Constancia de Consulta**; el paso 2 de una
  subsanación ya muestra "Confirmar trámite" → no tocar sin aprobación.
- **Firewall de AGIP:** bloquea URLs inventadas y user agent headless. No probar URLs a ciegas.
- **SUBSANACIÓN ≠ hay que corregir:** manda la tarea pendiente.
- **CPAU:** desde la pantalla 4 del asistente el botón de salir dice **"Guardar Borrador"**:
  salir por URL. Los intentos sin terminar aparecen en el Histórico sin RETP Nro: comparar
  por R.Nro (`robot/revisar-cpau-historico.mjs`). Una tarea que tocó Finalizar **nunca** se
  reintenta sola.
- **Endoso:** siempre por el portal de Segucom / mail a gcosta@segucom.com.ar, nunca Slack.
- **Pruebas:** un trámite de prueba no le escribe a nadie de afuera, no crea alertas y nunca
  finaliza la encomienda.
- La tarjeta y las credenciales viven sólo en `robot/.env.robot` (ignorado por git).
