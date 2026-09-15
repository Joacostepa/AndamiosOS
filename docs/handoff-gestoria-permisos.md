# Handoff — Gestoría de permisos de andamio (actualizado 2026-09-15, noche)

Para retomar en una sesión nueva. El diseño completo y todo lo aprendido está en
`docs/modulo-gestoria-permisos.md`; esto es el estado, **lo que falta para que el circuito
quede 100 % automático** y el orden para seguir.

Para arrancar: "Leé docs/handoff-gestoria-permisos.md y docs/modulo-gestoria-permisos.md y
seguimos con lo que falta".

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

**Qué construir** (mismo patrón que la encomienda):
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
