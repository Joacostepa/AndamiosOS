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
| Vía C · Sin gestión | `sin_permiso` | nada — no se abre trámite |

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
