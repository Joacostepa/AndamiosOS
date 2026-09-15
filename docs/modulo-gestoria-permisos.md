# Módulo Gestoría de Permisos (vía pública)

Automatización de punta a punta del **permiso de uso de andamio en la vía pública** que ABA
tramita ante el GCBA para sus clientes: legajo del cliente, documentos propios, encomienda
en el CPAU, presentación en TAD, seguimiento, subsanaciones, entrega del permiso y
renovación.

Estado: **diseño** (2026-09-14). Nada de esto está construido todavía.

---

## Qué reemplaza

Hoy lo hace una persona (Tamara) a mano, siguiendo tres instructivos "pendientes de
revisión" y usando:

| Qué | Dónde |
| --- | --- |
| Formularios del cliente | Google Forms por tipo de dueño (consorcio / empresa / persona física) + planillas de respuestas |
| Informe técnico | Copia a mano de un modelo `.docx` según sistema (multidireccional / bastidor / mixto) |
| Croquis | Canva `Croquis Implantación del Andamio`, editado a mano por obra |
| Encomienda | Web del CPAU (RETP) a mano, firma pegada con ilovepdf, pago con tarjeta, carga en tramites.cpau.org |
| Seguro | Pedido de endoso a Gonzalo Costa (productor) por mail |
| Presentación y seguimiento | TAD a mano, entrando con Clave Ciudad y mirando "Mis trámites" |
| Registro | Planilla `Seguimiento de obras (DOCS TRACKER)` |

**Objetivo:** que nadie tenga que hacer el trámite. La app lo lleva sola y una persona sólo
interviene cuando algo se traba (y durante el período supervisado, § Supervisión).

---

## Relación con Habilitaciones

Este módulo **no reemplaza** a Habilitaciones: lo alimenta.

- Los datos de permiso ya viven en `sale.order` (`x_lleva_permiso`, `x_permiso_modalidad`,
  `x_tramite_estado`, `x_expediente_nro`, `x_expediente_fecha`, `x_permiso_fecha`). Siguen
  siendo la fuente que lee el candado del tablero.
- Este módulo es **quien escribe** `x_tramite_estado`, `x_expediente_*` y `x_permiso_fecha`,
  que hoy se cargan a mano. El detalle fino (observaciones, documentos, tareas del robot)
  vive en Supabase.
- Las tres vías de la guía al cliente son las modalidades que ya existen:

| Guía al cliente | `x_permiso_modalidad` | Qué necesita de este módulo |
| --- | --- | --- |
| Vía A · Permiso emitido | `esperar_permiso` | llegar a `emitido` |
| Vía B · Expediente en trámite | `con_expediente` | llegar a `presentado` (hay EX) |
| Vía C · Se arma sin esperar | `sin_permiso` | **igual se tramita** (JS, 2026-09-15): la modalidad dice cuándo se puede armar, no si hay gestión |

---

## Flujo

```
Venta confirmada con la línea "SERVICIO GESTIÓN PERMISO IMPLANTACIÓN…"
  └─ se abre el trámite ─┬─ mail al cliente con el link a su portal
                         ├─ mail a Gonzalo pidiendo endoso de la póliza
                         ├─ se generan croquis + informe técnico
                         └─ robot: encomienda en el CPAU (crear → firmar → pagar → cargar)
Cliente carga su legajo en el portal
  └─ la IA revisa cada documento y los cruza entre sí
       ├─ algo mal → aviso al cliente con el motivo exacto (mail + portal)
       └─ todo OK
Legajo del cliente OK + seguro endosado + encomienda aprobada + croquis + informe
  └─ robot presenta en TAD → EX-AAAA-NNNNNNNN → x_tramite_estado = presentado
Seguimiento diario (robot en "Mis trámites" + mails de notificación)
  ├─ Subsanación → la IA lee la observación y la divide:
  │     lo nuestro  → se corrige solo (seguro, nota, croquis, informe…)
  │     del cliente → se le pide exactamente eso
  │     → robot subsana con el mismo EX
  └─ Tramitación → robot descarga "S/PERMISO DE USO" → al cliente
                   → x_tramite_estado = emitido, x_permiso_fecha
Vencimiento − 30 días corridos → se arma la renovación
```

**Lo nuestro arranca apenas se confirma que lleva permiso, sin esperar el pago**
(instructivo): seguro, croquis, informe. **El link al cliente sale después de que paga**
(decidido 2026-09-14), con un botón "Cobrado — enviar link" en la ficha. Más adelante la app
puede sugerirlo sola cuando detecte el anticipo en la venta de Odoo, pero el envío lo
confirma una persona.

La encomienda (que se paga) también espera el cobro, para no gastar en obras que se caen.

---

## Estados del trámite

| Estado | Quién tiene la pelota | Sale cuando |
| --- | --- | --- |
| `abierto` | ABA | se mandó el link al cliente |
| `esperando_cliente` | cliente | subió todo lo obligatorio |
| `en_revision` | IA | la IA terminó (OK u observado) |
| `observado_cliente` | cliente | subió lo que se le pidió |
| `preparando` | ABA (robot) | seguro, encomienda, croquis e informe listos |
| `listo_para_presentar` | ABA | se presentó (o se aprobó, si está supervisado) |
| `presentado` | GCBA | TAD lo pasa a Subsanación o Tramitación |
| `subsanacion` | ABA / cliente | se subsanó en TAD |
| `emitido` | — | se entregó el permiso al cliente |
| `vigente` | — | faltan 30 días para vencer |
| `renovando` | ABA | se presentó la renovación |
| `cerrado` / `cancelado` | — | — |
| `trabado` | persona | alguien lo destraba (error del robot, caso raro) |

Estados de TAD tal como aparecen: **Iniciación** (no revisado), **Subsanación** (hay que
corregir, mismo EX), **Tramitación** (salió el permiso — confirmar siempre en
Notificaciones).

---

## Piezas

### 1. Portal del cliente

Link público por trámite (`/permiso/[token]`), sin login, como `/cotizador`.

- El cliente elige **quién es el dueño del lote** y el portal pide el legajo que corresponde:

| Dueño | Documentos |
| --- | --- |
| Consorcio | Aviso/Permiso de obra · Acta de Asamblea (designación de administrador, legalizada, vigente) · Reglamento de copropiedad · DNI del administrador (frente y dorso) · Constancia de CUIT del consorcio · Nota de solicitud firmada · Acta de compromiso firmada |
| Empresa | Aviso/Permiso de obra · Poder certificado por escribano · Estatuto certificado · Acta de directorio (designación de autoridades) · DNI del apoderado · Constancia de CUIT · Nota de solicitud firmada · Acta de compromiso firmada |
| Persona física | Aviso de obra · DNI · Constancia de CUIT · Nota de autorización · Acta de compromiso · Título de propiedad |
| Inquilino | Lo del tipo de dueño correspondiente, a nombre del cliente, **más** contrato de alquiler y nota del dueño autorizando (va en "Otra documentación") |

- Descarga de **nota de solicitud, acta de compromiso y nota del dueño ya completadas**, para
  sólo firmar y subir.
- Muestra el estado en lenguaje del cliente, qué falta y por qué se rechazó algo.
- Recordatorios automáticos si no carga (cadencia a definir).
- El token es aleatorio, se guarda hasheado y se puede revocar.

**Mapeo a los casilleros de TAD** (lo que confunde en consorcios): estatuto → Reglamento
de copropiedad; designación de autoridades → Acta de Asamblea; poder → Acta de Asamblea
(otra vez); DNI del apoderado → administrador; Otra documentación → Acta de compromiso.

### 2. Revisión con IA

Claude lee cada PDF o foto (con visión) y devuelve, por documento, `ok` u `observado` con
un motivo en castellano para el cliente. Además cruza el legajo:

- Que se lea y sea el documento que dice ser.
- **Que el peticionante del Aviso de Obra sea el dueño del lote** — el error más caro.
- Acta de Asamblea / designación de autoridades **vigente**.
- Coincidencia de CUIT, razón social y dirección entre documentos y con la venta.
- Firmas presentes en nota y acta.
- Dirección del Aviso de Obra = dirección de la obra.

Regla: la IA **nunca aprueba en silencio** algo dudoso; ante la duda marca `observado` para
persona. Cada revisión queda guardada (modelo, fecha, veredicto, motivo).

### 3. Documentos generados

| Documento | Fuente | Notas |
| --- | --- | --- |
| **Croquis** | Plantillas por tipo, tomadas del Canva actual | Portada · plancheta de la manzana con el lote marcado · vista del sector a ocupar con medidas (pantalla 3D / frontal, estructura, torre, evento) · dirección · firma de Hougassian |
| **Plancheta de manzana** | Datos catastrales públicos de la Ciudad (USIG / Ciudad 3D) | Da también sección, manzana y parcela para el formulario de TAD |
| **Informe técnico** | Los tres modelos del Drive (multidireccional / bastidor / mixto), ya firmados | Completa obra, fecha, medidas, **módulos en planta = ml ÷ 2,50**, **módulos en altura = alto ÷ 2**; saca las secciones que no aplican (tabla abajo); agrega portada |
| **Nota de solicitud** | Plantilla | Prellenada, la firma el cliente |
| **Acta de compromiso** | Formulario del GCBA | Prellenada, la firma el cliente |
| **Nota del dueño** (inquilinos) | Plantilla del Drive | Prellenada, la firma el dueño |

**Secciones del modelo multidireccional según lo que se arma** (30 páginas; de la 18 en
adelante —verticales, horizontales, diagonales, tablón, roseta, puños— y las normas de
cálculo quedan siempre):

| Sección | Pantalla | Estructura | Torre |
| --- | :-: | :-: | :-: |
| 3.a Puntos de apoyo | ✓ | ✓ | ✓ (si va apoyada) |
| 3.b Ruedas de horquilla / 3.c Ruedas de gran porte | — | — | la que corresponda |
| 3.d Plataformas de trabajo | — | ✓ | ✓ |
| 3.e Protección para tránsito peatonal | ✓ | si lleva pantalla | — |
| 3.f Media sombra | — | ✓ | según obra |
| 3.g Arriostramientos (a caño y nudo / b base de fijación) | — | uno de los dos | — |
| 3.h Escaleras internas / 3.i Escotilla | — | según obra | según obra |
| 3.j Esferas de seguridad | ✓ | ✓ | — |

Lo que dice "según obra" necesita un dato que hoy no está en Odoo → se pregunta al cotizar
junto con base y altura, o se asume un estándar que valide Hougassian.

Firma de Hougassian: **autorizada** por él (2026-09-14). Cada uso queda registrado (qué
documento, qué trámite, cuándo).

### 4. Medidas: de dónde salen

De las **líneas de la venta** en Odoo, no de campos sueltos:

| Línea | Qué da |
| --- | --- |
| `PANTALLA / BANDEJA DE PROTECCIÓN POR M/L` | `product_uom_qty` = metros lineales. Altura 3,00 m y ancho 1,30 m estándar |
| `ALAMBRE TIPO CONCERTINA…` | lleva alambre |
| `ESTRUCTURA PARA FACHADA POR M2` | sólo m² — **falta base y altura** |
| `SERVICIO GESTIÓN PERMISO IMPLANTACIÓN…` | **disparador** del trámite |

Tipo de estructura: `sale.order.x_trabajo_obra` (pantalla_proteccion, estructura_pantalla,
torre, …).

**A agregar en Odoo:** base y altura de la estructura, **obligatorias al cotizar cuando
lleva permiso** (decidido 2026-09-14). Sin eso no hay croquis, encomienda ni informe.

m² para la encomienda: pantalla = ml × 4; estructura = base × altura.

### 5. Correo

**Arranca con `js@andamiosbuenosaires.com.ar`** (decidido 2026-09-14) y después se muda a
una casilla propia. Para que la mudanza sea un cambio de configuración y no de código:

- La casilla es **una variable de entorno** (`PERMISOS_MAIL`), no está escrita en ningún lado.
- Acceso por Gmail API. La app sólo procesa mensajes con la etiqueta **`Permisos`**, que
  pone un filtro de Gmail (remitentes de TAD, CPAU, Gonzalo, y respuestas a hilos que abrió
  la app). No lee el resto de la casilla aunque técnicamente pueda.
- Todo lo que manda la app sale en hilos propios con un identificador del trámite en el
  asunto, para enganchar las respuestas.

| Sale | Entra |
| --- | --- |
| Link del portal y recordatorios al cliente | Notificaciones de TAD (subsanación, permiso) |
| Motivos de rechazo al cliente | Endoso de la póliza (Gonzalo) |
| Pedido de endoso a Gonzalo (CUIT, razón social, coasegurado GCBA) | Encomienda aprobada por el CPAU (reenvío automático desde Hougassian) |
| Permiso emitido al cliente | Respuestas del cliente |

Cuando se mude: crear la casilla, cambiar la variable, cambiar el filtro, y actualizar el
mail de aviso de TAD y el **domicilio electrónico del acta de compromiso** (hoy
`JS@…`, ahí llegan notificaciones legales).

### 6. Robot

TAD y el CPAU no tienen API: el robot es un navegador automático (Playwright) que usa las
páginas como una persona.

**Arquitectura — pensada para cambiar de lugar sin tocar nada:**

```
App (Vercel)  ──escribe──▶  tabla permiso_tareas (Supabase)  ◀──toma── Robot
      ▲                                                             │
      └──────── resultado + capturas (Storage) ◀────────────────────┘
```

- La app **nunca** habla con TAD ni con el CPAU: sólo anota tareas (`cpau_crear_encomienda`,
  `tad_presentar`, `tad_subsanar`, `tad_revisar_estados`, `tad_descargar_permiso`, …).
- El robot consulta la tabla cada ~30 s, toma una tarea, la ejecuta, guarda resultado y
  **capturas de cada paso** (comprobante de lo que se envió), y la marca `ok` / `error`.
- Las credenciales (Clave Ciudad, CPAU, tarjeta) viven **sólo en el entorno del robot**.
- Una tarea que falla dos veces pasa el trámite a `trabado` y avisa por Slack.

**Dónde corre:**

1. **Ahora: en la Mac de JS** (decidido 2026-09-14). IP argentina, costo cero. El robot
   sólo trabaja con la Mac prendida y despierta; si está apagada, las tareas esperan en la
   cola y se ejecutan al prenderla — no se pierde nada.
2. **Después: servidor chico en la nube** (el mismo robot, empaquetado). Antes de mudarlo
   se prueba si TAD/AGIP aceptan IPs de fuera de Argentina; si no, proveedor argentino o
   mini PC en la oficina.

**Valores fijos que carga el robot:**

- *CPAU (RETP):* tipo Habilitación · encomienda Habilitación Estructura Transitoria ·
  comitente Emprendimientos y Estructuras S.A. · frentes: calle + altura desde/hasta ·
  destino Otros · zona Corredor alto · m² según § 4 · descripción "Pantalla 20 x 1,30" /
  "Estructura B x H". Luego: firma, compra "Encomienda de habilitación de cartel o
  estructuras transitorias", carga en tramites.cpau.org con n° de encomienda y comprobante.
- *TAD:* representado Emprendimientos y Estructuras S.A. · trámite "Solicitud de Permiso de
  Uso de Andamios" · carácter Representante Técnico · solicitud Andamio · personería
  Jurídica · domicilio de la obra con comuna, barrio, sección, manzana, parcela · fechas
  desde hoy hasta **+6 meses** (decidido 2026-09-14) · seguro compañía y vencimiento
  · declaración jurada Sí · adjuntos según § 1.

### 7. Pantalla interna

Una ficha por trámite con **todo**: estado actual y quién tiene la pelota, línea de tiempo
completa (cada mail, revisión de la IA, tarea del robot con sus capturas, cambio de estado
en TAD), texto literal de cada subsanación, legajo con el estado de cada documento, datos
del expediente, vencimiento. Más una bandeja con los trabados y los que necesitan a una
persona.

---

## Supervisión

Por decisión de JS el objetivo es que no intervenga nadie. Igual, los **primeros ~10
trámites** quedan en modo supervisado: el robot deja todo listo en TAD y espera un clic
"Presentar" en la app antes de confirmar. Es una declaración jurada de la empresa; se
apaga con un interruptor en Configuración una vez visto que el robot presenta bien.

---

## Modelo de datos (Supabase, propuesto)

| Tabla | Qué guarda |
| --- | --- |
| `permiso_tramites` | Cabecera: venta y OT de Odoo, dirección, datos catastrales, tipo de dueño, estado, token del portal (hash), mail del cliente, EX, estado TAD, fechas desde/hasta, n° de encomienda, estado de seguro, medidas (snapshot), supervisado |
| `permiso_documentos` | Un documento del legajo: clave, origen (cliente / ABA / GCBA), estado (falta / cargado / revisando / ok / observado), archivo en Storage, versión, veredicto de la IA |
| `permiso_eventos` | Línea de tiempo append-only: tipo, detalle, actor (cliente / IA / robot / persona / GCBA / correo), adjunto |
| `permiso_tareas` | Cola del robot: tipo, estado (pendiente / tomada / esperando_aprobacion / ok / error), payload, resultado, capturas, intentos |
| `permiso_mensajes` | Mails enviados y recibidos: id de Gmail, hilo, dirección, trámite |

Bucket privado `permisos`. Sin datos de tarjeta en la base, nunca.

Migraciones con la convención de siempre y aplicadas de a una (ver memoria: nunca
`supabase db push`).

---

## Seguridad

- Los instructivos tenían **Clave Ciudad, usuario del CPAU y la tarjeta completa en texto
  plano**. Se rotan todas antes de la prueba y **no** se copian a código, docs ni base.
- Credenciales sólo en el entorno del robot. En la nube: gestor de secretos del proveedor.
- Tarjeta: **virtual con límite bajo** (prepaga cargada con lo justo o corporativa con tope).
- El portal expone documentos de terceros (DNI, actas): token largo, expira al cerrar el
  trámite, archivos sólo por URL firmada de corta duración.

---

## Fases

| # | Qué | Depende de |
| --- | --- | --- |
| 0 | **Prueba del robot** en la Mac: entrar a TAD y al CPAU, recorrer el trámite sin presentar. Detectar captcha / validación por celular | credenciales nuevas |
| 1 | Trámite + estados + línea de tiempo + pantalla interna; apertura automática desde la venta | — |
| 2 | Portal del cliente + correo (js@) + recordatorios | 1 |
| 3 | Revisión con IA | 2 |
| 4 | Documentos generados (croquis, plancheta, informe, nota, acta) + base/altura en Odoo | 1 |
| 5 | Robot CPAU (encomienda completa) + pedido de endoso | 0, 4 |
| 6 | Robot TAD: presentar, seguimiento diario, subsanación, descarga del permiso | 0, 3, 5 |
| 7 | Renovaciones + mudanza del robot a la nube + casilla propia | 6 |

La fase 0 va primero porque es la única que puede invalidar el plan. 1–4 no dependen del
robot y avanzan en paralelo.

---

## Resultado de la prueba del robot (fase 0, 2026-09-14)

Scripts en `robot/` (sólo lectura), credenciales en `robot/.env.robot` (ignorado por git).

| Sitio | Resultado |
| --- | --- |
| **CPAU RETP** (`retp.cpau.org`) | ✅ Login OK, sin captcha. Formulario ASP.NET clásico con ids estables (`ctl05_usernameTextBox`…). Se lee el histórico: ~10 encomiendas del 2 al 11/09 → **~25–30 por mes** |
| **AGIP Clave Ciudad** (`claveciudad.agip.gob.ar`) | ✅ Login OK con CUIT + clave, sin captcha. Hay que tocar "Clave Ciudad" para que aparezca el formulario (la portada ofrece miBA). Selector de representado con las 3 razones sociales |
| **Firewall de AGIP** | ⚠️ Bloquea URLs inexistentes ("Attack ID") y probablemente el user agent headless. El robot se presenta como Chrome común y **nunca prueba URLs a ciegas** |
| **TAD por AGIP** | ❌ La tarjeta TAD ya no está en AGIP para ninguna razón social; la tarjeta MiBA da "Algo salió mal". El instructivo quedó viejo en este paso |
| **TAD por miBA** (`tad.buenosaires.gob.ar/tramitesadistancia`) | ✅ Login con la cuenta miBA de Jorge Patricio Riveros Zanetta (**nivel 3, sin código de verificación**). Representa a Emprendimientos y Estructuras desde el desplegable. Lee **Mis trámites** (16 en curso, con estado Iniciación / Subsanación) y **Notificaciones** (469, con "NOTIFICACION PERMISO.-" descargable). Plataforma TAD 2.1.5 |

**Cambios respecto del instructivo:** el trámite ahora se llama *"Solicitud de permiso para
la instalación de andamios en el espacio publico"*, el organismo es **SSGOU**
(`EX-AAAA-NNNNNNNN- -GCABA-SSGOU`), y Mis trámites tiene solapas nuevas (Tareas pendientes,
Pagos pendientes, Borradores, Trámites externos). **Ojo con "Borradores":** abrir el
formulario de inicio probablemente crea un borrador; la próxima prueba tiene que verificarlo
antes de tocar "Iniciar trámite".

### Lo que se aprendió recorriendo TAD y el CPAU por dentro

**Navegación TAD** (SPA Angular, versión 2.1.5): entrar por URL directa rebota a la portada —
siempre se navega con el menú. Las tablas de todas las solapas conviven en el DOM (usar sólo
filas visibles). Solapas de Mis trámites: En curso · Tareas pendientes · Pagos pendientes ·
Pagados · Borradores (quedó en "Cargando..." en 3 corridas) · Finalizados · Trámites externos.

**Foto del 14/09:** 16 expedientes en curso — 8 en Subsanación, 5 en Iniciación (dos viejos,
de 12/2025 y 04/2026, con organismo DGPF: parecen trabados), 3 en Tramitación. 2 tareas de
subsanación pendientes. 3 finalizados en "Guarda temporal". 469 notificaciones.

**⚠️ Abrir el detalle de un expediente agrega una "Constancia de Consulta del Expediente" al
expediente** (quedaron dos de las pruebas). El seguimiento diario se hace **desde la lista**
(estado por fila) y el detalle se abre sólo cuando el estado cambió.

**Detalle de expediente:** Tus documentos (paginado de a 5) · Trámites asociados ·
Tramitación conjunta · Detalle de Movimientos (ubicación actual y días de permanencia, p. ej.
`SSGOU-GOPEP → SANTANDREAE`). Cada documento es descargable. Documentos que presentamos,
con el nombre exacto del casillero:
Nota de solicitud… · Seguro de Responsabilidad Civil (solo hoja de asegurados y fecha de
vencimiento) · Informe Técnico del andamio… · Certificado de Encomienda Profesional… · Croquis
del lugar a instalar · Aviso de obra… · Copia autenticada del estatuto… · Copia autenticada del
instrumento de designación de autoridades vigente · Poder autenticado por escribano público ·
Copia del DNI del apoderado · Otra documentación. El GCBA agrega: Carátula, Pase, Presentación
Ciudadana, Constancia de apoderamiento, Documento de validación externa, Grupos seleccionados.

**Subsanación:** el GCBA sube un Informe `IF-…` "SUBSANACION sobre expediente EX-…" con un
**Motivo en texto libre** y la lista de documentos a corregir (por número IF). Ejemplo real:
*"DEBERAN SUBSANAR POLIZA DE SEGURO- LA MISMA NO INCLUYE COMO COASEGURADO AL CONSORCIO DE
LAPRIDA 1845 Y SIGUEN SIN AGREGAR LA CLAUSULA DE NO REPETICION AL GCBA"*. En Tareas
pendientes aparece con ícono `build`; abre un asistente de 3 pasos (datos → adjuntar →
confirmar) cuyo paso 1 repite el motivo.
→ **La póliza es causa recurrente de subsanación**: la revisión con IA de nuestros propios
documentos antes de presentar (coasegurado = titular del lote, cláusula de no repetición a
favor del GCBA, vigencia ≥ fin del permiso) ahorra idas y vueltas.

**Paso 2 de la subsanación** pide sólo los casilleros observados (en el ejemplo, únicamente
"Seguro de Responsabilidad Civil…", obligatorio) y **ya muestra "Confirmar trámite"** —
el paso 3 es un resumen. El robot nunca debe tocar ese botón sin la aprobación del modo
supervisado.

**Ficha oficial del trámite** (`idTipoTramite=324`, nivel mínimo 1, organismo que figura:
DGPCIURB). Requisitos textuales que la IA tiene que verificar antes de presentar:
- Nota de solicitud firmada por representante legal, **con vigencia y descripción del trabajo**.
- Póliza de RC: **cobertura mayor a $1.000.000**, **GCBA como asegurado adicional**, que
  consigne que **se mantiene su absoluta indemnidad** y que está cubierto en la medida de su
  interés. En la práctica además piden **coasegurado al titular del lote** y **cláusula de no
  repetición a favor del GCBA** (subsanaciones reales).
- Informe técnico firmado por profesional competente.
- Certificado de encomienda **documento completo**.
- Croquis del lugar.
- Aviso de obra ante DGROC y DGIUR.
- Persona humana: DNI ambas caras + poder por escribano. Persona jurídica: estatuto
  autenticado, designación de autoridades vigente, poder por escribano, DNI del apoderado.
- **Todo en PDF, y la póliza no puede estar encriptada** (el sistema la rechaza).

**Iniciar trámite** abre primero un modal *"Seleccionar representación"*: "Haré el trámite a
mi nombre" o "Elegir persona a representar" (TECNO ESTRUCTURAS S.A. / EMPRENDIMIENTOS Y
ESTRUCTURAS S.A.) → Confirmar. Después, el **mismo asistente de 3 pasos que la subsanación**:
1. *Datos del solicitante* (razón social, CUIT, mail de aviso, teléfono; datos del apoderado)
   → Continuar.
2. *Adjuntá documentación*: botón **Completar** de "Datos del trámite" (el formulario que
   termina en la carátula) + un **Adjuntar** por casillero.
3. *Resumen* → Confirmar trámite → sale el EX.

La prueba se detuvo en el paso 1 a propósito: pasar al 2 probablemente crea un borrador, y
la solapa Borradores no carga como para limpiarlo. Lo que falta ver (campos del modal
"Completar") se conoce por la carátula y el instructivo; se verifica con el primer trámite
real en modo supervisado.

**Resultado de la fase 0: todo lo que el robot necesita hacer en TAD y en el CPAU es
posible**, sin captcha ni verificación por código. Lo único que no se probó es el clic final
de "Confirmar trámite" / "Finalizar", que queda para el primer trámite supervisado.

**Carátula (lo que el GCBA leyó del formulario):** carácter Representante Técnico · Andamio ·
Persona Jurídica · calle y altura, barrio, comuna, **sección / manzana / parcela** · CP ·
razón social y CUIT de EyE · representante legal (JS, apoderado) · domicilio comercial ·
contacto con mail `tam@` · fechas desde/hasta (6 meses) · seguro compañía y vencimiento ·
DJ Sí.

**Permiso emitido:** es una **Resolución** `RESOL-AAAA-NNNN-GCABA-SSGOU` que llega como
notificación "NOTIFICACION PERMISO.-" (`RS-…`, descargable, con acuse de lectura). Trae
titular (el dueño/administrador, no EyE), representante técnico (Hougassian), medidas
(largo × ancho de acera × alto), **vigencia "hasta el día …"** y vencimiento del seguro →
todo parseable para cerrar el trámite y programar la renovación. Ojo: la vigencia otorgada
puede ser menor a la pedida (pedido 09/03/2027 en otro caso; este salió hasta 24/02/2027).

**CPAU:** el **certificado visado se descarga desde el Histórico** (columna Certificado) → no
hace falta esperar que Hougassian lo reenvíe. El asistente de Nuevo RETP es un Wizard
ASP.NET con ids estables (`ContentPlaceHolder1_Wizard1_ddlTipoRetpId`, `…txtMatNro`,
`…txtComNroDoc`, botones `…NextButton`); avanzar con Siguiente sin Finalizar no guarda nada.
Pago: acepta Visa, MasterCard, Amex y débito Visa/Maestro, **o transferencia bancaria por
el importe exacto** al CBU del CPAU — alternativa a tener tarjeta en el robot.

## Fase 1a — espejo de TAD (construida 2026-09-14)

| Pieza | Dónde |
| --- | --- |
| Tablas `pvp_expedientes`, `pvp_eventos`, `pvp_tareas`, `pvp_robot` + bucket `permisos-via-publica` | `supabase/migrations/20260914000001_permisos_via_publica.sql` (aplicada) |
| Robot | `robot/worker-tad.mjs` — `npm run robot:tad` (o `-- --una-vez`) |
| Pantalla | `/permisos-via-publica` y `/permisos-via-publica/[id]` |
| APIs | `GET /api/permisos-via-publica`, `GET …/[id]`, `POST …/revisar` |
| Permisos | módulo `permisos-via-publica` en `src/lib/auth/acceso.ts` (perfil Oficina lo trae) |
| Avisos | tipos `permiso_novedad` y `permiso_robot` → campanita + `#syh-documentacion-de-obra` |

**Frecuencia:** cada 30 min L–V 8–20 h, cada 2 h fuera de horario, y a pedido ("Revisar
ahora", el robot mira la cola cada 20 s). La sesión de TAD queda abierta entre vueltas.

**Primera vuelta (carga inicial, sin avisos):** 16 en curso + 5 finalizados, 2 motivos de
subsanación leídos, 5 permisos descargados, 4 min 22 s.

**Aprendido en la carga:**
- **SUBSANACIÓN no significa "hay que corregir".** TAD deja el estado así también después de
  subsanar, hasta que el Gobierno revisa. Lo que manda es la **tarea pendiente** (8 en
  subsanación, sólo 2 con tarea). La bandeja agrupa por tarea, no por estado.
- **Vínculo con Odoo: 0 de 21.** `x_expediente_nro` casi nunca se cargó. Sin eso la lista no
  tiene dirección: el titular que muestra TAD es siempre Emprendimientos y Estructuras.
- 2 expedientes en Tramitación no tienen notificación con "PERMISO" en el texto: el robot no
  les encontró el PDF.

## Fase 1b — carátula y vínculo con Odoo (construida 2026-09-14)

Decidido por JS: opción (a). El robot abre el detalle **una sola vez por expediente**, baja
la Carátula (`IF-… Carátula`, no la `PV-`), la guarda en el bucket y lee con `unpdf`
(`robot/caratula.mjs`): dirección, barrio, comuna, sección/manzana/parcela, fechas pedidas,
seguro y mail de contacto. Columnas nuevas en `pvp_expedientes`
(`20260914000002_permisos_via_publica_caratula.sql`, aplicada).

- `caratula_leida_at` se marca **apenas se entró al detalle**, aunque la lectura falle
  (queda `caratula_error`): cada intento cuesta una Constancia de Consulta y no se repite solo.
- El PDF trae dos domicilios con las mismas etiquetas (obra y domicilio comercial de EyE):
  la obra se lee sólo del tramo "Domicilio de donde se colocara" … "Datos persona".
- **Vínculo con Odoo:** primero por `x_expediente_nro`; si no, por dirección —calle (palabra
  más larga, sin "Av."/"del") y altura en `x_direccion_obra`, venta confirmada, la más
  reciente con fecha anterior a la presentación—. El evento registra por cuál de los dos
  se vinculó. No escribe nada en Odoo todavía.

**Resultado de la lectura de carátulas (2026-09-14):** 21 de 21 leídas.
- **3 sin altura** ("Salcedo", "Parana", "Pellegrini, Carlos"; las tres con contacto `rr@`):
  en TAD se escribió la calle sin elegirla del buscador de direcciones. La carátula misma
  no trae altura ni barrio/comuna/sección/manzana/parcela, y guarda las calles con nombre de
  persona como "APELLIDO, NOMBRE". No es un error de lectura; el parser ahora invierte el
  nombre y deja vacíos los datos catastrales (antes se comía la etiqueta siguiente: barrio =
  "Comuna:"). Esas tres se vinculan a mano.
- 2 carátulas piden "hasta 24/02/2026", antes de la presentación (error de tipeo del año).
  El permiso de una salió igual hasta 24/02/2027.
- **Vínculo por dirección: 16 de 21**, todos coherentes (misma dirección y cliente, venta
  días antes de la presentación). Sin venta: Laprida 1845 y Av. Santa Fe 4645 (no hay venta
  con esa dirección en Odoo) y las 3 sin altura. Av. Córdoba 2914 tiene dos expedientes del
  mismo día sobre la misma venta (S02419).

## Fase 1c — el robot solo y escribiendo en Odoo (construida 2026-09-14)

| Pieza | Dónde |
| --- | --- |
| LaunchAgent | `robot/instalar-launchd.sh` (`--desinstalar` para sacarlo). Log en `~/Library/Logs/andamios-robot-tad.log` |
| Vínculo y escritura | `sincronizarOdoo` en `robot/worker-tad.mjs` |
| Fechas del permiso | `robot/permiso.mjs` |
| Confirmar / descartar / vincular a mano | ficha `/permisos-via-publica/[id]` → `POST /api/permisos-via-publica/[id]/vinculo` → funciones `pvp_resolver_vinculo` / `pvp_vincular_a_mano` |
| Migración | `20260914000003_permisos_via_publica_odoo.sql` (aplicada) |

**Robot solo:** arranca al iniciar sesión, se reinicia si se cae (con 1 min entre intentos),
`caffeinate -is` evita que la Mac se duerma sola. Después de cambiar el código hay que
volver a correr el instalador (el proceso vivo tiene el código viejo).

**Vínculo:** por número de expediente es seguro y se escribe directo. Por dirección es una
**propuesta** hasta que una persona la confirma en la ficha ("Es esta venta" / "No es
esta" / "Es otra venta: S0…"). Una venta descartada no se vuelve a proponer. La altura se
compara como número entero (`ilike "712"` también encontraba "5712").

**Qué escribe en `sale.order`** (sólo lo que cambia: cada write cuesta ~1 s de cascada):

| TAD | `x_tramite_estado` | además |
| --- | --- | --- |
| Iniciación / Subsanación (en curso) | `presentado` | `x_expediente_nro` (EX completo), `x_expediente_fecha` (creación en TAD) |
| Tramitación, o archivado con el PDF del permiso | `emitido` | lo anterior + `x_permiso_fecha` |
| Archivado sin permiso, estado desconocido | — no se toca — | |

`x_permiso_fecha` = fecha de la notificación RS (`CreationDate` del PDF: el texto dice "desde
la suscripción de la presente", sin fecha). La vigencia otorgada se guarda en
`pvp_expedientes.permiso_vence`.

**No pisa** (queda en `odoo_error`, visible en la ficha): un `x_expediente_nro` cargado a mano
que no es de ninguno de nuestros expedientes de esa venta, ni un estado más avanzado (Odoo
"emitido" y TAD "presentado" = probable renovación; retroceder cerraría el candado). Dos
expedientes en la misma venta: manda el más avanzado, después el más nuevo, después el número.

**No escribe** `x_permiso_modalidad` (decisión comercial) ni `x_lleva_permiso`, ni registra
la gestión en el historial de Habilitaciones (queda en `pvp_eventos`).

## Póliza: coasegurado Y no repetición (2026-09-14)

El endoso se pide **siempre por mail a Gonzalo Costa, gcosta@segucom.com.ar** (asunto "RC"
en el historial; lo venía mandando Tamara con copia a am, gs, rr y jpm).

**Por qué se repiten las subsanaciones:** en junio Gonzalo puso por error los CUIT de los
consorcios en la cláusula de no repetición; Tamara pidió pasarlos a coasegurados y desde
entonces se pide sólo "coasegurar". Pero el GCBA pide **las dos cosas, a sujetos
distintos**:

| Qué | A favor de quién |
| --- | --- |
| Coasegurado | el titular del lote (consorcio / empresa / persona) |
| Cláusula de no repetición + asegurado adicional + indemnidad | el GCBA |

Las dos subsanaciones pendientes del 14/09 (EX-2026-40709185 Paraná 1167 y EX-2026-38571164
Ing. Huergo 913) son exactamente eso. La revisión con IA de la póliza tiene que chequear las
dos por separado. La cláusula del GCBA ya se le reclamó a Gonzalo (JS, 14/09).

### Pedido de endoso automático — decidido 2026-09-14

**Portal de Segucom, no respuesta por mail.** Gonzalo a veces manda varias pólizas en un
mail (hay que adivinar cuál es de qué obra) y si está de vacaciones el mail queda en su
casilla. Con un link lo puede resolver cualquiera en Segucom.

- **Una página fija para el productor** (`/endosos/[token]`), no un link por pedido: lista
  de endosos pendientes (obra, titular + CUIT, fechas del permiso) con "Subir póliza" por
  fila. Tres pedidos juntos se resuelven juntos.
- **Revisión al subir:** la IA lee el PDF en el momento y chequea coasegurado = titular de
  ESA fila, cláusula de no repetición a favor del GCBA, suma > $1.000.000, vigencia ≥ fin
  del permiso, no encriptado. Si falta algo se lo dice ahí mismo.
- **El mail es sólo el aviso** ("hay N endosos para pedir" + link). Sale de
  **js@andamiosbuenosaires.com.ar** por ahora (variable `PERMISOS_MAIL`); la app sólo
  manda, no lee casillas.
- Recordatorio si no se sube en ~24 h hábiles; después aviso a Tamara y #syh.
- Si igual llega por mail: botón en la ficha para que alguien de ABA suba el PDF (misma
  revisión).
- El token sólo sube pólizas y ve obra/titular/CUIT; se puede rotar. Pedido sale solo,
  sin clic de aprobación (decidido).

**Titular del lote:** no es el cliente de Odoo (muchas veces es la constructora) y **no lo
carga ABA: lo carga el cliente** en el primer paso de su portal (tipo de dueño + razón
social + CUIT). Decidido con JS (2026-09-15):
- Se arranca con **el nombre que escribe el cliente**, el CUIT validado por dígito
  verificador y cruzado después con los documentos del legajo (aviso de obra, acta,
  estatuto). Apenas se valida, sale solo el pedido a Segucom.
- **ARCA se conecta cuando esté el certificado** de la empresa (`/api/afip` hoy es un stub)
  para traer la razón social exacta por CUIT.
- El formulario de la ficha interna queda como excepción (expedientes viejos, cliente que
  no carga).
- Las respuestas de los Google Forms actuales **no se importan** por ahora.

### Apertura del trámite y link al cliente — decidido 2026-09-15

- **Disparador:** `sale.order.x_lleva_permiso = 'si'` en una venta confirmada. Es el
  "Lleva permiso de implantación (GCBA)" Sí/No de la solapa **Trabajo a ejecutar** (vista
  `sale.order.form.aba.tipo.trabajo`), obligatorio al confirmar en pantalla / estructura con
  pantalla / estructura sin pantalla. **No** la línea del producto 146 (JS): al 15/09, 38
  ventas desde agosto tienen la línea y sólo 25 el campo en Sí.
- **El link sale al confirmar la venta**, sin esperar el pago (cambia lo decidido el 14/09).
  Por lo tanto el pedido de endoso sale apenas el cliente carga el titular, también sin
  esperar el pago.
- **Sólo ventas nuevas**: las confirmadas desde que se publique. Las en curso siguen como hoy
  (Google Forms + Tamara).
- **Mail al cliente de la venta** y, además, el **link visible y copiable en la ficha**
  para mandarlo por WhatsApp. Sin mail (o con uno mal escrito) no se manda y se avisa.
- **Por ahora el inicio es MANUAL, con un botón** (JS, 2026-09-15, "por las dudas; después
  vemos si lo automatizamos"). El automatismo de Odoo "AndamiosOS permisos de venta" (id 52)
  existe pero está **desactivado**; se reactiva corriendo
  `scripts/odoo-webhook-ventas-permiso.mjs` sin `--desactivar`. Estuvo activo unos minutos
  el 15/09 y no abrió ningún trámite.

### Construido (2026-09-15)

| Pieza | Dónde |
| --- | --- |
| Tablas `pvp_tramites`, `pvp_documentos`, `pvp_productores` (+ `pvp_eventos.tramite_id`) | `supabase/migrations/20260915000001_permisos_tramites_documentos.sql` (aplicada) |
| Pedido, aviso, recordatorio, subida y revisión | `src/lib/permisos-via-publica/endosos.ts` |
| Lectura de la póliza con Claude (`claude-opus-5`) + chequeos en código | `src/lib/permisos-via-publica/revision-poliza.ts` |
| Mail saliente (SMTP de Gmail) | `src/lib/mail.ts` — variables `PERMISOS_MAIL`, `PERMISOS_MAIL_CLAVE` |
| Portal del productor | `/endosos/[token]` + `GET /api/public/endosos/[token]` + `POST …/documentos/[docId]` (URL firmada, sube directo al bucket) |
| Ficha interna | sección "Documentos del trámite": titular + CUIT (con dígito verificador), "Pedir endoso a Segucom", "Subir PDF", "Volver a pedir" |
| Recordatorios | cron `/api/alertas/barrido` (L–V 8 h): reintenta avisos, recuerda a las 24 h, alerta `permiso_endoso` a las 48 h |

**Chequeos que frenan:** es póliza, no encriptada (`/Encrypt` en el PDF), titular como
coasegurado (por CUIT; si está sólo en no repetición lo dice), no repetición a favor del
GCBA (CUIT 34-99903208-9 o nombre), suma > $1.000.000, vigencia ≥ permiso. **Se muestran y
no frenan:** GCBA asegurado adicional e indemnidad (los pide la ficha, nunca los observaron).

El link del productor se ve con el token de `pvp_productores` (sólo service role). Para
rotarlo: `update pvp_productores set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = 'segucom'`.

### Portal del cliente — construido 2026-09-15

| Pieza | Dónde |
| --- | --- |
| Columnas del cliente en `pvp_tramites` (token, mail, tipo de dueño, inquilino, link enviado) + estado `cargado` | `supabase/migrations/20260915000002_permisos_portal_cliente.sql` (aplicada) |
| Abrir trámite desde la venta, mandar link, cargar titular, registrar documentos | `src/lib/permisos-via-publica/portal.ts` (`CORTE_VENTAS = 2026-09-15`) |
| Webhook de Odoo | `POST /api/odoo/webhooks/ventas-permiso?secret=` + automatismo `scripts/odoo-webhook-ventas-permiso.mjs` (sólo `state` y `x_lleva_permiso`; **se corre después de publicar**) |
| Portal | `/permiso/[token]`: paso 1 dueño del lote (tipo, inquilino, razón social, CUIT con dígito verificador) → pide el endoso; paso 2 legajo según tipo (PDF o foto, directo al bucket) |
| Interno | bandeja "Trámites nuevos" + ficha `/permisos-via-publica/tramites/[id]` con el link para copiar y "Reenviar por mail" (relee el mail de Odoo) |

Mail sin cargar o mal escrito (`@gmai.com`, `@hotmial.com`…): no se manda, queda
`link_error` y sale una alerta para mandarlo por WhatsApp o corregirlo en Odoo.

**Revisión del legajo (2026-09-15)** — `src/lib/permisos-via-publica/revision-legajo.ts`.
Cada documento se revisa al subirlo (PDF, JPG, PNG o WEBP; sin HEIC). Claude lee y el
veredicto sale de reglas por documento: es el pedido, se lee, y según el tipo titular,
dirección de la obra, CUIT de la constancia, firma y vigencia. El cliente ve el motivo en
el portal. Si la revisión falla queda "cargado" para una persona; nunca se aprueba sola.
Probado con la prueba de JS: rechazó una propuesta comercial subida como constancia de CUIT,
una licencia de conducir como nota, y un aviso de obra de otra dirección.

**Firma en el portal (2026-09-15)** — `documentos-firmados.ts` + `POST /api/public/permiso/[token]/firmar`.
"Completar y firmar" genera con una sola firma el **Acta de compromiso** (texto del
formulario oficial del GCBA, tal cual, con los blancos completos) y la **Nota de ABA**
(membrete con el logo del bucket `empresa/logo.png`; "de solicitud" para consorcio y
empresa, "de autorización" para persona). Es **firma electrónica** (dibujada + constancia al
pie de cada página; se guardan IP, dispositivo y sha256 del PDF en la revisión), no firma
digital certificada. Domicilio electrónico del acta = `PERMISOS_MAIL`. Falta la plantilla
de la nota del dueño para inquilinos.

**Póliza, corrección (2026-09-15):** sólo se frena si el PDF **pide contraseña para abrirse**.
Las pólizas de La Mercantil Andina vienen con protección de permisos (`/Encrypt`), se abren
y TAD las acepta. A Claude no se le piden las listas (un endoso real tiene 20 páginas) sino
si figura el titular como coasegurado y el GCBA en la no repetición.

Pendiente del portal: recordatorios al cliente y el paso de trámite nuevo a expediente
cuando se presenta en TAD.

### Informe técnico y medidas — decidido 2026-09-15

- **Sistema:** se asume **multidireccional** (el único modelo firmado: "MODELO DE INFORME
  TÉCNICO MULTIDIRECCIONAL CON FIRMA.docx", Memoria de Cálculo Estructural de Hougassian).
  Una obra de bastidor sube su informe a mano en la ficha.
- **Medidas, en Odoo, solapa "Trabajo a ejecutar" → "Qué se arma"** (propuesta de JS):
  - estructura con o sin pantalla → campos **Base** y **Altura** (m² = base × altura);
  - sólo pantalla de protección → **metros lineales** traídos de la línea de pantalla de la
    orden, **editables**;
  - cualquier otro tipo → el permiso se pide por **200 m²**.
- **Secciones "según obra"** del informe: **estándar por tipo**, validado una vez por
  Hougassian. Pantalla: apoyo, protección peatonal, esferas. Estructura: además plataformas,
  media sombra, base de fijación y escalera interna.
- **Croquis (JS, 2026-09-15; Hougassian ya está al tanto):** láminas del Canva "Croquis
  Implantación del Andamio" por tipo: portada · plancheta · pantalla (render 3D con base,
  alto y ancho de bandeja + vista frontal) · estructura con pantalla y cerramiento (render +
  Largo/Ancho/Alto) · torre (render + medidas) · andamio de bastidor (frente + medidas).
  **La plancheta va DIBUJADA** con la geometría oficial (EPOK): manzana, lotes numerados,
  calles y el lote de la obra en naranja — ya se presentó así (Gorriti 6009). Las planchetas
  escaneadas no están publicadas (EPOK `planos/` da 404).
- Datos de parcela sin carga manual: USIG normaliza la dirección (`servicios.usig…/normalizar`,
  da `cod_calle`) → EPOK `catastro/parcela/?codigo_calle=&altura=` da SMP, frente/fondo y
  todas las puertas (frentes desde/hasta para el CPAU) → `geometria/?smp=` y `smp/{s}/{m}/`
  para dibujar la manzana. EPOK filtra clientes sin user agent de navegador.
- Nota del dueño para inquilinos: no hay plantilla en el Drive (sólo una de YPF Gas de 2021):
  hay que redactarla.

### Informe técnico y croquis — construido 2026-09-15

| Pieza | Dónde |
| --- | --- |
| Catastro (USIG + EPOK, con reintentos) | `src/lib/permisos-via-publica/catastro.ts` |
| Informe técnico (pdf-lib) | `informe-tecnico.ts` — texto del aceptado en EX-2026-38891134, 24–27 páginas según tipo |
| Croquis (pdf-lib) | `croquis.ts` — portada, plancheta dibujada, sector a ocupar (+ vista frontal en pantalla) |
| Orquestación | `generacion.ts` → `POST /api/permisos-via-publica/tramites/[id]/generar` y botón en la ficha |
| Imágenes y firma | bucket privado `permisos-via-publica/plantillas/` (croquis/, informe/, comun/firma-hougassian.png), sacadas de los PDF aceptados y del Canva |
| Medidas | Odoo `x_permiso_base`, `x_permiso_altura`, `x_permiso_metros_lineales`, `x_permiso_m2` |

Probado con Trelles 1086 (pantalla 8 ml → 4 × 2 módulos, manzana 057-035 con 33 lotes) y
Laprida 1845 (estructura + pantalla, manzana 015-142 con 25 lotes). Si el catastro falla,
el croquis sale con el aviso en la lámina y el documento queda observado.

**Cuándo se generan (JS, 2026-09-15):** solos, apenas todo el legajo del cliente queda
correcto (`siLegajoCompletoGenerar`, desde la revisión de cada documento y desde la firma en
el portal). Una sola vez; el botón de la ficha los regenera a mano. La encomienda del CPAU se
va a disparar en el mismo punto.

Pendiente: la lámina de bastidor del Canva (frente con Largo/Ancho/Alto) no se usa porque
el sistema es siempre multidireccional; la encomienda del CPAU (robot RETP).

### Encomienda del CPAU — lo que dice un certificado real (EX-2026-38891134, Trelles)

Bajado de TAD el 15/09. **Corrige lo anotado en § 6** (decía "destino Otros"):

| Campo del RETP | Valor en Trelles | De dónde sale al automatizar |
| --- | --- | --- |
| Tipo de Retp / Encomienda | HAB – Habilitación / HE – Habilitación Estructura Transitoria | fijo |
| Matriculado | Arq. Eduardo Hougassian, mat. 12658 (usuario `hougassian`) | fijo |
| Comitente | Joaquin Stepansky (DNI) · Emprendimientos y Estructuras S.A. · Maturin 2570, CABA · Reg.Insp.Gral.Just. 08/10/2008 nº 1809609 · tel 08103621555 · tam@ | fijo |
| Propietario del inmueble | CONS PROP TRELLES 1084 86 88 GAONA 2402 · CUIT 30641067950 | titular del lote que carga el cliente |
| Frentes | TRELLES MANUEL RICARDO (id CPAU 1478) 1084 a 1088 | puertas del lote en EPOK sobre la calle de la obra; la calle se busca en el catálogo del CPAU (sus ids no son los de USIG) |
| Clasificación | Tipo SRP – Serv. Profesionales · Destino **ADM – Administrativo** · Clase HA – Habilitación · Zona **G1 – Corredor alto** | fijo |
| Superficie / actividad | 32 m² · "Habilitación Estructura Transitoria" M2 = 32 | `x_permiso_m2` (8 ml × 4 = 32 ✓) |
| Descripción | "Pantalla de protección peatonal de 8 mts lineales." | según tipo y medidas |
| Pago | $50.000 · concepto "EVHA Reg.Habilit. Hasta 120" | **tramo hasta 120 m²**: una estructura más grande cae en otro tramo |

El certificado presentado son 5 páginas: el registro (×3), el certificado del CPAU para
habilitación y el comprobante de pago. El asistente está mapeado hasta "Datos Comitente"
(capturas `robot/capturas/cpau-0*`); el resto se mapea con `robot/mapear-cpau-wizard.mjs`
(sin finalizar, verifica que el Histórico no cambie).

Pendiente de JS: pago con tarjeta o transferencia; si la encomienda espera el cobro al
cliente (decidido el 14/09, antes de que el link saliera al confirmar la venta).

### Documentos que sube ABA — todos automáticos

Además de la póliza, los documentos propios del legajo **no los hace nadie a mano**: la
encomienda del CPAU (robot RETP, § 6), el croquis y el informe técnico (§ 3). Entran al
mismo checklist del trámite con origen `aba`, igual que los del cliente (`cliente`) y la
póliza (`productor`), y el trámite pasa a `listo_para_presentar` sólo cuando los tres
orígenes están completos y revisados.

## Decisiones pendientes

0. ~~Cuenta miBA para TAD~~ → la de Jorge Patricio Riveros Zanetta (nivel 3). Confirmar que
   él sabe que el robot la usa (es su identidad nivel 3 la que firma) y rotar la clave.

1. **Sistema de andamio** (multidireccional / bastidor / mixto): ¿está en Odoo o se asume
   multidireccional? Define qué modelo de informe técnico se usa.
2. ~~Vigencia pedida en TAD~~ → 6 meses.
3. ~~¿Qué espera el pago del cliente?~~ → el link al cliente y la encomienda; botón manual.
4. **Tarjeta:** confirmar que el pago del CPAU acepta la tarjeta elegida (hoy se paga con Visa
   crédito).
5. **Domicilio electrónico del acta de compromiso** al mudar la casilla.
6. **Renders por tipo de estructura** para el croquis (los del Canva actual alcanzan para
   pantalla, estructura, torre y evento; confirmar si hay otros tipos).
7. **Historial:** ¿se importan los expedientes de la planilla DOCS TRACKER?
