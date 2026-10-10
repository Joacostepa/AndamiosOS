# Habilitaciones: inventario de acciones y funciones

Prueba del 09/10/2026 contra Supabase y Odoo de producción, con `npm run dev -- -p 3100`, Playwright a 1440×900 y el tema oscuro, que es el que viene por defecto. Algunas capturas también van en claro.

## Cómo se probó

- **Escritura cortada.** Todo request que no fuera GET/HEAD se interceptó en el navegador con `context.route('**/*')`:
  - se registró (método, URL, body) en `evidencia/requests-cortados.jsonl`;
  - se contestó con un mock armado según lo que devuelve cada ruta (`scripts/harness.mjs`). Los mocks que devuelven `gestion` simulan el cambio sobre la ficha real, así la UI muestra lo que mostraría.
  - Hubo 44 requests cortados en las corridas válidas, más 9 de una primera corrida abortada.
- **Log del dev server.** 228 requests: **todos GET**, ningún POST/PUT/PATCH/DELETE.
- **Base antes y después.** Ninguna fila nueva atribuible a la prueba (ver `docs/habilitaciones/errores.md` §D).
- **Datos inyectados.** Hoy no hay obras en "Recién llegadas" ni en grupos urgentes, ni desincronizadas. Para ver el triage por lote, los grupos rojos y el aviso amarillo se **modificó la respuesta del GET** de la bandeja en el navegador. No escribe nada. Se marca **[inyectado]**.
- **Leyenda de la columna "Prueba":**
  - **En vivo**: se apretó en la app y el request quedó cortado (o es sólo lectura);
  - **Inyectado**: en vivo, pero con datos inyectados;
  - **Código**: sólo leído del código, sin probar en vivo.

**Total: 79 acciones o funciones, en 68 entradas (algunas agrupan dos o tres botones). 69 probadas en vivo** (4 de ellas sólo con datos inyectados) **y 10 sólo desde el código.** Las de código son: Reintentar/reconciliar, el refresco automático, la caja de error de sync y los 7 procesos de fondo de la sección 5.

Ids de OT usados:
- **1210**: LAS FLORES, validación, SyH, 8 requisitos;
- **1235**: Huergo, sin triar y pospuesta;
- **1204**: Triunvirato, etapa a, Pantalla, lleva permiso;
- **1288**: Azcuénaga, desarme, prioridad media;
- **1236**: Corrientes 4285, todo aprobado;
- **233**: habilitada por excepción;
- **1270**: con nota fijada;
- **1002**: no aplica;
- **1237**: pospuesta;
- **1212**: no lleva permiso;
- **1287**: no lleva permiso pero espera el permiso;
- **581**: desarme con expediente sin número;
- **1142**: con un adjunto.

---

## 1. Bandeja (`/habilitaciones`)

### 1.1 Abrir la bandeja
- **Dónde y cuándo.** Al entrar. Se relee cada 2 minutos y al volver a la pestaña; `staleTime` de 60 s.
- **Qué manda.** `GET /api/habilitaciones`. Tardó unos 2,4 s.
- **En el servidor (`fetchBandeja`).**
  - Lee de Odoo las OTs activas con su venta y las primeras jornadas.
  - Lee de Supabase `hab_requisitos` y `ot_comentarios` (ámbito habilitación, fijadas).
  - **Puede escribir:**
    - siembra `hab_ots` de las OTs nuevas, con aviso `ot_nueva` a la campanita y a Slack #syh y #logística;
    - siembra el requisito "Documentación de técnico de SyH" (aplica + `x_syh_presencial`=sí);
    - resuelve las pospuestas: update condicionado en `hab_ots`, `hab_gestiones` tipo `posposicion` y avisos `hab_pospuesta` a Slack #syh.
  - En esta prueba no escribió nada.
- **Prueba.** En vivo.

### 1.2 Grupos de trabajo
Los grupos son "Recién llegadas", "Se arman en 3 días", "Fecha pasada", "Falta consultar…", "Ya le mandamos todo…" y "Vencen en <30 días".
- **Dónde.** Arriba. Sólo se dibujan los que tienen filas. Hoy hay 2, con 5 obras.
- **Cómo se arman.** `agruparBandeja` en el cliente, con `x_hab_alerta` y `x_hab_etapa` de Odoo. Son excluyentes y se ordenan por prioridad y fecha.
- **¿Son plegables?** **No.** Hacer clic en el título no hace nada. Sólo se pliegan las tres listas del pie.
- **Prueba.** En vivo. Los grupos "Recién llegadas" y "Se arman en 3 días" se vieron inyectados.

### 1.3 Fila de obra
- **Qué muestra.**
  - el punto del semáforo;
  - el chip del tipo de OT;
  - los chips de **prioridad** (alta/media), **Pantalla** y **SyH**;
  - el triángulo rojo de observados con su número;
  - el chinche si hay nota fijada;
  - la línea de contexto: cliente · modalidad · "x/y requisitos";
  - "N d · esperando a …";
  - la fecha programada;
  - el reloj para posponer.
- **Lo que no anda.** Los días y el "esperando a" (`docs/habilitaciones/errores.md` §1 y §2).
- **Prueba.** En vivo.

### 1.4 Abrir la ficha desde la fila
- **Qué hace.** El link lleva a `/habilitaciones/:otId`.
- **Prueba.** En vivo.

### 1.5 Buscador
- **Dónde.** Debajo del encabezado.
- **Cómo filtra.** En el navegador, sobre lo ya cargado: por palabras en cualquier orden, sin tildes. Busca en:
  - dirección, título, cliente, orden de venta y número de OT;
  - técnico y tipo;
  - "prioridad"/"urgente", motivo de urgencia, modalidad y clasificación;
  - quién la habilitó, "pospuesta", motivo de posposición y notas fijadas.
- **Mientras se busca:**
  - el encabezado dice "N de M en trámite coinciden";
  - Pospuestas, No aplican y Habilitadas **se abren solas**;
  - el triage dice "las N que coinciden".
- **Cómo se borra.** Escape o la X.
- **Qué manda.** Nada.
- **Prueba.** En vivo: "corrientes" → 1 de 5; "stepansky gabriel" → 4; "1288"; "S02651"; un texto sin resultados; Escape y la X. El triage con búsqueda se vio inyectado.

### 1.6 Casillas de selección (triage)
- **Dónde.** Sólo en "Recién llegadas".
- **Qué hace.** El encabezado pasa a "N seleccionadas". **Sin selección los botones actúan sobre todo el grupo** ("todas").
- **Prueba.** Inyectado.

### 1.7 Triage por lote: "Aplica"
- **Dónde.** Encabezado de "Recién llegadas".
- **Qué valida.** Zod: entre 1 y 100 ids.
- **Qué manda.** `POST /api/habilitaciones/triage {otIds:[1002,1018], decision:"aplica"}`.
- **En el servidor.**
  - En `hab_ots`: `triage`, `triage_fecha`, `triage_autor` y `sync_estado=pendiente`.
  - Siembra el paquete por defecto (Básico = Nómina ART) en las que no tienen requisitos.
  - Escribe una fila en `hab_gestiones` (tipo `triage`) por obra.
  - En `after()` hace el push a Odoo de los 5 inputs `x_hab_*` de cada OT.
  - No avisa.
- **Se deshace.** Sí, con decisión `pendiente`, desde la ficha o desde "No aplican". El historial queda.
- **Prueba.** Inyectado.

### 1.8 Triage por lote: "No aplica"
- **Qué manda.** El mismo POST con `decision:"no_aplica"`. Sin selección mandó las 4 obras del grupo.
- **En el servidor.**
  - Lo mismo que "Aplica", sin sembrar.
  - En Odoo la obra queda `x_hab_estado=habilitada`, verde, con `x_hab_fecha` igual al día del triage.
- **Se deshace.** De a una, desde "No aplican".
- **Prueba.** Inyectado.

### 1.9 Posponer desde la fila (el reloj)
- **Dónde.** En todas las filas de los grupos.
- **Qué abre.** Un diálogo con:
  - atajos: "10 días antes de la obra" (sólo si hay fecha), "1 semana" y "2 semanas";
  - un calendario que no deja elegir antes de mañana ni después del tope (10 días antes de lo primero entre la fecha programada y la primera jornada);
  - un motivo opcional de hasta 500 caracteres.
- **Cuándo no se puede.** Si la obra va dentro de los 10 días, el diálogo dice que no se puede y no ofrece botón.
- **Qué manda.** `POST /api/habilitaciones/:id/posponer {hasta, motivo}`.
- **En el servidor (`posponer`).**
  - Valida que la fecha sea posterior a hoy y que la OT exista. Recorta la vuelta: si la obra va antes, la devuelve antes. Si la vuelta queda hoy o antes, contesta 400.
  - En `hab_ots` escribe `pospuesta_hasta`, `motivo`, `por`, `el` y `aviso` (la primera jornada).
  - Escribe en `hab_gestiones` (tipo `posposicion`).
  - **No toca Odoo.** No avisa.
- **Se deshace.** Con Reactivar.
- **Prueba.** En vivo:
  - 1288, sin fecha: con "2 semanas" y motivo mandó `{hasta:"2026-10-23", motivo}`;
  - 1204, a 10 días: "no se puede".

### 1.10 Pospuestas: desplegar
- **Dónde.** Al pie. Muestra "Vuelve el …", quién la pospuso, el motivo y la jornada planificada.
- **Prueba.** En vivo: 13 obras.

### 1.11 Pospuestas: "Cambiar fecha"
- **Qué hace.** Abre el mismo diálogo, con la fecha guardada.
- **Qué manda.** El mismo POST.
- **Prueba.** En vivo: 1237. "2 semanas" aparece apagado porque pasa el tope; con "1 semana" mandó `{hasta:"2026-10-16"}`.

### 1.12 Pospuestas: "Reactivar"
- **Qué manda.** `POST /api/habilitaciones/:id/posponer {hasta:null}`.
- **En el servidor.** Pone en null los cinco campos `pospuesta_*` y escribe en `hab_gestiones` "Se reactivó". No toca Odoo.
- **Se deshace.** Volviendo a posponer.
- **Prueba.** En vivo: 1235.

### 1.13 No aplican: desplegar y "Volver a la cola"
- **Qué manda.** `POST /api/habilitaciones/triage {otIds:[id], decision:"pendiente"}`. No pide confirmación.
- **En el servidor.**
  - En `hab_ots`: `triage`, `triage_fecha` y `triage_autor` en null, **y borra `hab_fecha_consulta`**.
  - Escribe en `hab_gestiones` "Vuelta a la cola".
  - Hace el push a Odoo.
  - No borra requisitos, notas ni historial.
- **Prueba.** En vivo: 1002.

### 1.14 Habilitadas: desplegar y "Revertir"
- **Qué hace.** Pide **confirmación** con un diálogo: "vuelve a la cola… Operaciones recibe un aviso".
- **Qué manda.** `POST /api/habilitaciones/:id/habilitacion {habilitar:false, faltan:0}`.
- **En el servidor.** Es lo mismo que el punto 2.6.
- **Prueba.** En vivo: se probó cancelar y después confirmar en 1285.

### 1.15 Aviso amarillo de desincronizadas y "Reintentar"
- **Dónde.** Sólo si hay filas con `sync_estado=error`. Hoy hay 0.
- **Qué manda.** `POST /api/habilitaciones/reconciliar`.
- **En el servidor.**
  - Relee hasta 200 OTs `pendiente`/`error`.
  - Marca `huerfana` las que ya no existen en Odoo.
  - Re-empuja los inputs a Odoo de cada una.
  - Es idempotente.
- **Prueba.** El aviso se vio **inyectado**. **El botón NO se tocó**: sólo código.

### 1.16 Refresco automático y "Las obras entran solas"
- **Qué hace.** Relee cada 2 minutos y al volver a la pestaña, con la misma lógica del 1.1.
- **Prueba.** Código.

---

## 2. Ficha (`/habilitaciones/:otId`)

### 2.1 Abrir la ficha
- **Qué manda.** `GET /api/habilitaciones/:id`, unos 5,5 s en dev. Después:
  - `GET /api/habilitaciones/:id/adjuntos`;
  - `GET /api/habilitaciones/paquetes`.
- **En el servidor.**
  - Lee la OT de Odoo con su agenda y su venta.
  - Lee la cabecera de Supabase y el RPC `hab_gestion_de`.
  - Si la OT no tenía cabecera, la **siembra y avisa `ot_nueva`**.
  - No resuelve pospuestas: sólo las muestra.
- **Prueba.** En vivo: 14 obras.

### 2.2 Encabezado
- **Qué muestra.**
  - dirección y chips de tipo, prioridad (con el motivo escrito) y Pantalla;
  - número y cliente;
  - "Ver la OT en Odoo";
  - los botones Planificación y ¿Cómo funciona?.
- **Prueba.** En vivo.

### 2.3 Veredicto
- **Qué es.** "Se puede armar / con pendientes / No se puede armar" más lo que falta. Se calcula en el cliente con `veredicto()`.
- **Lo que no anda.** Ver `docs/habilitaciones/errores.md` §4 (contraste) y §6 (contradice al tablero).
- **Prueba.** En vivo.

### 2.4 Contexto de la obra
- **Qué muestra.**
  - "Qué hay que ejecutar": `x_detalle_tecnico` y la clasificación;
  - "Fechas y planificación": programada, comprometida, piso y techo, jornadas del tablero con cuadrilla y estado, y "con parte";
  - el link "Ver en el tablero".
- **Prueba.** En vivo. Es sólo lectura.

### 2.5 Aviso SyH y "Mandarle los papeles a"
- **El aviso SyH.** Una caja ámbar si `x_syh_presencial`=sí.
- **El contacto.** Sale de `x_hab_syh_nombre`, `x_hab_syh_celular` y `x_hab_syh_email` de la venta. El teléfono es un link `tel:` y el mail, `mailto:`. Sólo aparece si hay algún dato.
- **Prueba.** En vivo: 1210 y 1235. Los links no se abrieron.

### 2.6 "Habilitar obra"
- **Dónde y cuándo.** En el bloque de habilitación, si la obra no es "no aplica" ni está habilitada. Está **apagado** mientras falte aprobar algo y dice "Faltan aprobar N de M" o "No hay requisitos cargados".
- **Qué manda.** `POST /api/habilitaciones/:id/habilitacion {habilitar:true, faltan:0, motivo:null}`.
- **En el servidor.**
  - En `hab_ots`: `habilitada_el`=hoy, `habilitada_por` y `sync_estado`.
  - En `hab_gestiones`: "aprobacion · Habilitada con todos los requisitos aprobados".
  - En `after()`:
    - push a Odoo: `x_hab_estado=habilitada` y `x_hab_fecha`;
    - **aviso `ot_habilitada` (alta)** a la campanita y a Slack #logística, **una vez por OT para siempre**.
- **Se deshace.** Con Revertir.
- **Prueba.** En vivo: 1236.

### 2.7 "Habilitar igual, por excepción"
- **Qué hace.** Abre una caja con un textarea. El botón queda apagado sin motivo.
- **Qué valida el servidor.** `faltan>0` exige motivo; si no, contesta 400. El motivo puede tener hasta 1000 caracteres.
- **Qué manda.** `{habilitar:true, faltan:3, motivo:"…"}`.
- **En el servidor.** Lo mismo que el 2.6, con `habilitada_motivo` y el detalle "Habilitada por excepción — …". El aviso dice "por excepción".
- **Ojo.** También aparece en obras **sin triar** (`docs/habilitaciones/errores.md` §5).
- **Prueba.** En vivo: 1210 y 1235.

### 2.8 "Revertir" (en la ficha)
- **Dónde.** En la caja verde de una obra habilitada. **No pide confirmación.**
- **Qué manda.** `{habilitar:false, faltan:0}`.
- **En el servidor.**
  - Pone en null `habilitada_*`.
  - En `hab_gestiones`: "Se revirtió la habilitación".
  - Push a Odoo, que la vuelve a `en_curso`/`pendiente`.
  - **Aviso `ot_deshabilitada` (crítica)** a la campanita y a Slack #logística, una vez por OT.
- **Prueba.** En vivo: 233 y 1210 (mock).

### 2.9 "Ya le consulté al cliente"
- **Cuándo aparece.** Mientras no haya fecha de consulta. Desaparece al usarlo.
- **Qué manda.** `POST /api/habilitaciones/:id/consulta`, sin body.
- **En el servidor.**
  - En `hab_ots`: `hab_fecha_consulta`=hoy.
  - En `hab_gestiones`: `consulta`.
  - Push a Odoo (etapa a→b; empiezan a contar los `x_hab_dias`).
- **Se deshace.** **No** hay forma desde la UI. Sólo se borra con "Volver a la cola".
- **Uso real.** 0 veces en producción.
- **Prueba.** En vivo: 1210.

### 2.10 Posponer desde la ficha
- **Cuándo aparece.** La línea "¿Falta mucho para la obra? Posponela" sale si la obra no está habilitada ni es "no aplica". Abre el mismo diálogo del 1.9.
- **Prueba.** En vivo: 1210, que da "no se puede".

### 2.11 Barra de pospuesta: "Cambiar fecha" y "Reactivar"
- **Dónde.** Caja ámbar en las obras pospuestas.
- **Qué manda.** Los mismos POST del 1.11 y el 1.12.
- **Prueba.** En vivo: 1235. "10 días antes" mandó `{hasta:"2026-11-06"}` y Reactivar, `{hasta:null}`.

### 2.12 Triage en la ficha
- **Recién llegada.** Barra con "Aplica" y "No aplica". Manda `POST /api/habilitaciones/triage {otIds:[id], decision}`.
  - **Prueba.** En vivo: 1235, las dos.
- **"Marcar que no aplica" (en gestión).** Un link discreto, sin confirmación. Manda `decision:"no_aplica"`.
  - **Prueba.** En vivo: 1210.
- **"Volver a la cola" (no aplica).** Manda `decision:"pendiente"`.
  - **Prueba.** En vivo: 1002.
- **En el servidor.** Lo mismo que el 1.7, el 1.8 y el 1.13.

### 2.13 Etapas de la documentación
- **Qué muestra.** La lista de las 4 etapas con fecha, más "etapa · N d" en el encabezado de la columna. Sólo lectura.
- **Prueba.** En vivo (ver `docs/habilitaciones/errores.md` §16).

### 2.14 "Reclamar al cliente"
- **Qué muestra.** "Reclamar al cliente · Nº reclamo" y la aclaración "No manda mail: registra la fecha".
- **Qué manda.** `POST /api/habilitaciones/:id/gestiones {tipo:"reclamo", detalle:"2º reclamo al cliente"}`.
- **En el servidor.** Escribe en `hab_gestiones`. Zod valida el tipo y un detalle de hasta 1000 caracteres. No toca Odoo.
- **Se deshace.** No: el historial es append-only por RLS.
- **Prueba.** En vivo: 1210.

### 2.15 "Vence el" (vencimiento)
- **Qué es.** Un input de fecha. Guarda al salir del campo, si la fecha cambió.
- **Qué manda.** `PATCH /api/habilitaciones/:id {vencimiento:"2026-12-31"|null}`.
- **En el servidor.**
  - En `hab_ots`: `hab_vencimiento` y `sync_estado`.
  - Push a Odoo de `x_hab_vencimiento`.
  - No registra nada en el historial.
- **Se deshace.** Sí, borrando la fecha. Pero ver `docs/habilitaciones/errores.md` §B: puede no mandarse.
- **Prueba.** En vivo: cargar. Borrar no disparó request (explicado en errores).

### 2.16 Permiso: "¿Lleva permiso?"
- **Qué es.** Una caja de sólo lectura con `x_lleva_permiso` de la venta.
- **Prueba.** En vivo: 1204 (sí), 1212 (no) y 1210 (sin contestar).

### 2.17 Permiso: "Con qué se arma" (modalidad)
- **Qué es.** 3 botones. **Siguen siendo editables**, aunque la modalidad se contesta al cotizar.
- **Qué manda.** `PATCH /api/habilitaciones/:id/permiso {modalidad}`.
- **En el servidor.**
  - Exige que la OT tenga venta.
  - Escribe en la **venta de Odoo** de forma sincrónica, en el camino crítico: `x_permiso_modalidad`, y `x_permiso_definida` si es la primera vez.
  - Va a `hab_gestiones` **sólo si se estaba definiendo** (`docs/habilitaciones/errores.md` §8).
- **Se deshace.** Sólo eligiendo otra. No se puede volver a "sin definir".
- **Prueba.** En vivo: 1210 y 1204.

### 2.18 Permiso: "Trámite de ABA"
- **Qué es.** Los botones No presentado / Presentado / Emitido.
- **Qué manda.** `PATCH …/permiso {tramite}`. La primera vez agrega `expedienteFecha` o `permisoFecha` de hoy.
- **En el servidor.** Escribe `x_tramite_estado` y las fechas en la venta. En `hab_gestiones`: "Trámite: …".
- **Ojo.** Lo del candado del tablero (esperar permiso / emitido) cambia al instante.
- **Prueba.** En vivo: 1204, Presentado y Emitido.

### 2.19 Permiso: "Expediente N°"
- **Qué es.** Un input que guarda al salir del campo.
- **Qué manda.** `PATCH …/permiso {expedienteNro}`.
- **En el servidor.** Escribe `x_expediente_nro` en la venta y "Expediente …" en `hab_gestiones`. Si se borra, no queda registro.
- **Prueba.** En vivo: 1210.

### 2.20 Permiso: "Registrar pedido a <técnico>"
- **Cuándo aparece.** Cuando no hay modalidad, incluso si la obra "no lleva".
- **Qué manda.** `POST …/gestiones {tipo:"consulta", detalle:"Nº pedido de modalidad a …"}`.
- **En el servidor.** Escribe en `hab_gestiones`. No notifica a nadie.
- **Prueba.** En vivo: 1210.

### 2.21 Requisito: avanzar de estado
Los pasos son pendiente→enviado ("Marcar enviado"), enviado→aprobado ("Aprobar"), observado→enviado ("Corregir y reenviar") y aprobado→pendiente ("Volver a pendiente").
- **Qué manda.** `PATCH /api/habilitaciones/:id/requisitos {requisitoId, estado}`.
- **En el servidor.** Un solo RPC, `hab_mover_requisito`, que:
  - actualiza estado, fechas y motivo;
  - escribe en `hab_gestiones` `envio`/`aprobacion`/`observacion` con el detalle = motivo (**sin el nombre del papel**);
  - **no registra** el paso a pendiente.
  - Después, push a Odoo en `after()`: `fecha_envio` mínima y `en_curso`.
- **Se deshace.** Con el botón siguiente, pero no hay deshacer para el historial.
- **Prueba.** En vivo: Aprobar, Corregir y reenviar, y Volver a pendiente en 1210. "Marcar enviado" es la misma llamada con `estado:"enviado"`.

### 2.22 Requisito: "Observar"
- **Cuándo aparece.** Sólo en los enviados.
- **Qué hace.** Abre un textarea.
- **Qué valida.** Sin motivo: el cliente frena con el toast "Escribí por qué lo rebotaron" y el servidor contesta 400 "Un requisito observado necesita el motivo".
- **Qué manda.** `{requisitoId, estado:"observado", motivo}`.
- **Cómo se ve.** La fila queda roja con el motivo debajo. En oscuro no se lee (`docs/habilitaciones/errores.md` §4).
- **Prueba.** En vivo: 1210, sin motivo y con motivo.

### 2.23 Masivo: "Marcar N como enviados" y "Aprobar N enviados"
- **Cuándo aparece.** Sólo si hay qué mover. No toca los observados ("N observados quedan afuera").
- **Qué manda.** `PATCH …/requisitos {todos:"enviado"|"aprobado"}`.
- **En el servidor.** RPC `hab_mover_todos`: escribe en `hab_gestiones` "N requisitos en un solo gesto" y hace el push a Odoo si movió algo.
- **Prueba.** En vivo: 1210, los dos.

### 2.24 Agregar requisito a mano
- **Qué es.** Un input con Enter o el botón "Agregar", que queda apagado si el campo está vacío.
- **Qué manda.** `POST …/requisitos {nombre}` (Zod: de 1 a 200 caracteres).
- **En el servidor.** Escribe en `hab_requisitos` con `origen=manual` y hace el push a Odoo. No registra historial.
- **Prueba.** En vivo: 1210.

### 2.25 Quitar requisito (el tacho)
- **Qué hace.** Lo quita **sin confirmación**, aun si está aprobado.
- **Qué manda.** `DELETE …/requisitos {requisitoId}`.
- **En el servidor.** Borra de `hab_requisitos` y hace el push a Odoo. **No hay historial y los archivos quedan huérfanos en Storage.**
- **Se deshace.** No: hay que volver a crearlo.
- **Prueba.** En vivo: 1210, un manual y uno aprobado.

### 2.26 Aplicar un paquete
- **Qué es.** Un desplegable con Básico·1, + No repetición·2, + SVO·4 y Completo·8.
- **Qué manda.** `POST …/requisitos {paqueteId}`.
- **En el servidor.**
  - Borra los requisitos `paquete`+`pendiente` que no están en el paquete nuevo.
  - Crea los que faltan.
  - Respeta los manuales y los ya movidos.
  - Hace el push a Odoo. No registra historial.
- **Ojo.** El desplegable queda mostrando el UUID (`docs/habilitaciones/errores.md` §11).
- **Prueba.** En vivo: 1210, Completo.

### 2.27 Adjuntos: ver la lista
- **Qué es.** El clip de cada requisito, con el número de archivos. Abre un popover.
- **De dónde sale.** Del `GET /api/habilitaciones/:id/adjuntos`, que lista Storage del lado del servidor.
- **Prueba.** En vivo: 1210 (vacío) y 1142 (1 archivo).

### 2.28 Adjuntos: subir
- **Qué es.** Un input file dentro del popover.
- **Qué manda.** **Directo a Supabase Storage desde el navegador**: `POST https://…supabase.co/storage/v1/object/habilitaciones/habilitaciones/:ot/:req/<nombre>` con `upsert:true`.
- **En el servidor.** Sólo Storage. La RLS del bucket decide. No hay historial.
- **Se deshace.** Con la X.
- **Prueba.** En vivo: cortado, 296 bytes.

### 2.29 Adjuntos: abrir
- **Qué hace.** Pide una URL firmada por 10 minutos y abre una pestaña nueva.
- **Qué manda.** `POST …/storage/v1/object/sign/…` con `{expiresIn:600}`.
- **Prueba.** En vivo: 1142, cortado.

### 2.30 Adjuntos: borrar (X)
- **Qué hace.** Borra sin confirmación.
- **Qué manda.** `DELETE …/storage/v1/object/habilitaciones {prefixes:[path]}`.
- **En el servidor.** Borra de Storage. No hay historial.
- **Se deshace.** No.
- **Prueba.** En vivo: 1142, cortado.

### 2.31 Notas: "Agregar" y "Agregar y fijar"
- **Qué es.** Un textarea; los botones quedan apagados si está vacío.
- **Qué manda.** `POST /api/habilitaciones/:id/notas {texto, fijada}` (Zod: de 1 a 2000 caracteres).
- **En el servidor.** Escribe en `ot_comentarios` con `ambito='habilitacion'`. El autor sale de `auth.uid()` por default. No toca Odoo. No avisa.
- **Prueba.** En vivo: 1210, las dos.

### 2.32 Notas: fijar y desfijar (chinche)
- **Qué manda.** `PATCH …/notas {notaId, fijada}`.
- **En el servidor.** Actualiza `ot_comentarios.fijada`. Cualquiera puede hacerlo.
- **Qué efecto tiene.** La nota queda arriba en la ficha y la fila de la bandeja lleva un chinche. **No llega al tablero** (`docs/habilitaciones/errores.md` §14).
- **Prueba.** En vivo.

### 2.33 Notas: borrar
- **Cuándo aparece.** El tacho sólo sale en las notas propias.
- **Qué manda.** `DELETE …/notas {notaId}`.
- **En el servidor.** La RLS sólo deja borrar al autor. Si no borra nada, contesta error. No hay historial.
- **Prueba.** En vivo, sobre una nota mock propia.

### 2.34 "Comentarios"
- **Qué son.** En Habilitaciones, los comentarios **son** las "Notas de la obra": el hilo de habilitación.
- **El hilo de Operaciones** (el de la tarjeta del tablero, `ambito='operaciones'`) **no se ve desde Habilitaciones**, ni este desde el tablero. Están separados desde 2d562d9.
- **Prueba.** En vivo (las notas) y código (la separación).

### 2.35 Historial
- **Qué es.** La lista de `hab_gestiones`, de la más reciente a la más vieja, con tipo, fecha, detalle y autor. Es sólo lectura y append-only por RLS (INSERT sí, UPDATE y DELETE no).
- **Prueba.** En vivo.

### 2.36 Caja de error de sincronización
- **Cuándo aparece.** Si `sync_estado=error`. Muestra `sync_error` y "reintentá desde la bandeja".
- **Prueba.** Código: hoy no hay ninguna.

---

## 3. Panel de planificación (sólo lectura)

### 3.1 Botón "Planificación": abrir y cerrar
- **Dónde.** En la bandeja y en la ficha.
- **Cómo se abre.** A partir de 1280 px es una columna al costado y se recuerda en `localStorage` (`habilitaciones:planificacion-abierta`). En pantalla angosta es una hoja encima, que no se recuerda.
- **Qué manda.** `GET /api/planificacion/tablero?desde&hasta` (14 días) y la bandeja.
- **Prueba.** En vivo: tardó 2,9 s; mostró "63 jornadas · 5 sin habilitar".

### 3.2 "Solo sin habilitar"
- **Qué hace.** Filtra en el navegador.
- **Prueba.** En vivo.

### 3.3 "Actualizar" y "Actualizado hace N min"
- **Qué hace.** Relee con un GET. Además se relee sola cada 2 minutos.
- **Prueba.** En vivo.

### 3.4 Tarjeta de jornada
- **Qué muestra.** Tipo, prioridad, Pantalla, dirección, cliente, cuadrilla, tentativa o confirmada, "con parte" y el estado de la habilitación (Habilitada / Pospuesta hasta… / Sin habilitar).
- **Qué hace al tocarla.** Abre la ficha, y el panel sigue abierto.
- **Prueba.** En vivo.

### 3.5 Cerrar (X)
- **Prueba.** En vivo: el `localStorage` quedó en false.

---

## 4. Ayuda y recorridos

### 4.1 "¿Cómo funciona?"
- **Qué es.** Un menú con "Ver el recorrido guiado" y "Leer la guía completa".
- **Prueba.** En vivo.

### 4.2 Recorrido de la bandeja (`PASOS_BANDEJA`, 7 pasos)
- **Cómo arranca.** Solo la primera vez, o desde el menú.
- **Prueba.** En vivo: con datos reales se ven 4 de 7; con inyección, 7 de 7 (ver `docs/habilitaciones/recorrido.md`).

### 4.3 Recorrido de la ficha (`PASOS_FICHA`, 12 pasos)
- **Cómo arranca.** Solo la primera vez (en dev no arranca: `docs/habilitaciones/errores.md` §15), o desde el menú.
- **Prueba.** En vivo: 12/12 en 1210 y 1235; 9/12 en 233.

### 4.4 Página `/habilitaciones/ayuda`
- **Qué es.** La guía escrita, con un botón "Ver el recorrido de nuevo" que borra las marcas y lleva a la bandeja.
- **Prueba.** En vivo. El botón no hizo arrancar el recorrido en dev.

---

## 5. Cruce con el tablero y procesos de fondo (fuera de la pantalla del módulo)

### 5.1 Candado: lectura
- **Qué manda.** `GET /api/habilitaciones/candado?otIds=…`, que lee sólo de Odoo: modalidad, trámite y expediente de la venta, más el tipo de OT.
- **Qué devuelve.** La fricción por OT: `bloqueo` o `falta_expediente`, sólo para armado y ampliación.
- **Dónde se ve.** En la tarjeta del tablero, con el ícono del candado.
- **Prueba.** Código.

### 5.2 Candado: confirmar con fricción
- **Qué manda.** `POST /api/habilitaciones/candado {otId, tipo:"consulta"|"excepcion", motivo}`. La excepción exige motivo. La consulta se deduplica a 7 días.
- **En el servidor.** Escribe en `hab_gestiones`.
- **Prueba.** Código.

### 5.3 Push a Odoo (`sincronizarOt`)
- **Cuándo corre.** En `after()`, en cada cambio de triage, requisitos, consulta, vencimiento o habilitación.
- **Qué hace.**
  - Deriva los 5 inputs (`derivarInputs`) y los escribe en la OT.
  - Guarda el espejo y `sync_estado` en `hab_ots`.
  - Si falla, deja `error` y lo muestra el aviso amarillo.
- **Prueba.** Código.

### 5.4 Reconciliar
- Ver el 1.15. **No se tocó.**
- **Prueba.** Código.

### 5.5 Vuelta automática de pospuestas (`resolverPospuestas`)
- **Cuándo corre.** Sólo al leer la bandeja.
- **Qué hace.** Puede borrar la posposición o adelantarla, registra en `hab_gestiones` y avisa `hab_pospuesta` a Slack #syh.
- **Prueba.** Código. La base se verificó antes y después: no se disparó.

### 5.6 Siembra del requisito de SyH
- **Cuándo corre.** Al leer la bandeja, para las obras que aplican, tienen SyH y todavía no tienen el requisito. Lo crea con origen `manual` y orden 500.
- **Prueba.** Código. No hubo ninguna obra a sembrar.

### 5.7 Aviso de OT nueva
- **Cuándo corre.** Al leer la bandeja o la ficha, y en el barrido diario `/api/alertas/barrido`.
- **Qué hace.** Avisa `ot_nueva` a la campanita y a Slack #syh y #logística.
- **Prueba.** Código.

---

## Archivos de evidencia

- `evidencia/requests-cortados.jsonl`: cada POST, PATCH y DELETE cortado, con su body.
- `evidencia/requests-get.jsonl`: los GET a `/api` que salieron.
- `evidencia/pasos-0X-*.json` y `evidencia/salida-0X.txt`: el resultado de cada paso, con lo cortado y los toasts.
- `evidencia/bandeja.json`, `evidencia/fichas-datos.json` y `evidencia/fichas-texto.json`: los datos reales leídos.
- `evidencia/recorridos.json`: cada paso de cada recorrido (ancla, título, texto).
- `evidencia/db-antes-*.json` y `evidencia/db-despues-conteos.json`: los conteos de la base.
- `scripts/`: el arnés y las corridas. Las de Odoo son sólo `search_read`.
