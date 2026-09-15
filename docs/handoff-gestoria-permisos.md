# Handoff — Gestoría de permisos de andamio (actualizado 2026-09-15, 19:20)

Para retomar en una sesión nueva. El diseño completo y todo lo aprendido está en
`docs/modulo-gestoria-permisos.md`; esto es el estado, **lo que falta para que el circuito
quede 100 % automático** y el orden para seguir.

Para arrancar: "Leé docs/handoff-gestoria-permisos.md y docs/modulo-gestoria-permisos.md y
seguimos con lo que falta". **Empezar por § "Estado al cierre 15/09 18:00".**

---

## Estado al cierre 15/09 19:20 — S02466 presentado en TAD, número de expediente en espera

### Lo primero en la sesión nueva

1. **Ver si apareció el EX de S02466** (trámite `c877aee2-fa45-4bb3-9e53-78ea9b60eb1c`,
   tarea **39**). A las 19:09 el robot tocó "Confirmar trámite" con los 11 adjuntos del
   borrador 12989635 y el formulario guardado. TAD mostró *"Generación de trámite pendiente ·
   Número de expediente en espera · Tenemos problemas para generar el expediente electrónico…
   podrás visualizarlo en Trámites en curso"* (captura `39-03-confirmar-1.png`).
   - **Se vincula solo** (`vincularPresentaciones` en `robot/worker-tad.mjs`). Condiciones: el
     expediente está en curso, se creó ese día o después, no tiene trámite y su carátula tiene
     la misma sección/manzana/parcela que la obra (011-063-021A). Queda en
     `pvp_tramites.expediente_id`, con la venta por `numero`, y escribe `presentado` en Odoo.
     En el log: "Presentación GUIDO 1923 → EX-…".
   - Si aparecen dos de esa parcela, avisa (`presentado_varios`) y se vincula a mano.
   - **No volver a presentar:** la app ya no lo deja.
2. **S02465 (Salguero 359):** la encomienda del CPAU (Registro Web 00329521985) espera que JS
   firme, pague y cargue a mano en tramites.cpau.org. Después sube el certificado visado en la
   ficha.

### Lo que se aprendió a la tarde-noche (15/09, implementado salvo lo marcado)

- **"Volver a presentar" que no crea la tarea:** la ruta corta a los 60 s (504) cuando USIG no
  responde (`normalizar`, 3 × 20 s). No quedan ni tarea ni evento: volver a tocarlo.
  *Pendiente:* usar la obra de la presentación anterior si USIG falla.
- **Abrir TAD en el navegador corta la sesión del robot**, aunque se cierre enseguida.
  `sesionViva` mira la página sin recargar, y el robot cae en el login de miBA (tarea 36).
  *Pendiente:* verificar la sesión recargando y reintentar si aparece el login.
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
- **Sospecha sin confirmar:** un borrador deja de cargar sus documentos (el robot espera 3 × 3
  min y frena) cuando **una subida falla o queda a medias**:
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
  - durante un reintento, "Probar ahora" y "Dejar de reintentar".

### Pendientes chicos que salieron hoy

- **Tarea `tomada` para siempre:** si se para el robot en medio de una presentación, la tarea
  queda así. Arreglarlo al arrancar el worker (devolver las tomadas viejas) o en el SIGTERM.
- **Salir ordenado de la ventana de Adjuntar** cuando el robot se frena ahí, si se confirma la
  sospecha de los borradores.
- **Bajar lo que el robot escribe en Supabase en cada vuelta.**
- **Rotar `PERMISOS_MAIL_CLAVE`:** se escribió en el chat el 15/09.
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

Todos publicados. El robot de la Mac quedó reinstalado con `bed4c04`.

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
| 7 | **Presentar en TAD** → EX → `presentado` en Odoo | ❌ **no existe** |
| 8 | Seguimiento diario de TAD (estados, motivo, permiso, Odoo) | ✅ |
| 9 | **Subsanación** (clasificar el motivo, corregir, subsanar en TAD) | ❌ sólo lee el motivo y avisa |
| 10 | Permiso emitido → al cliente | 🟡 se descarga y escribe Odoo; **no se le manda al cliente** |
| 11 | **Renovación** (vence − 30 días) | ❌ |

Último commit: `c626b41` (encomienda del CPAU supervisada), publicado en Vercel y el robot de
la Mac reinstalado con ese código.

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
