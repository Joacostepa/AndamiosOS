# Hoja del día — contrato para las pantallas

Estado: 10/10/2026. La **base** está construida en la rama `feat/hoja-del-dia`: migración, lógica pura, servicio, APIs, link público, bot de Telegram, hooks y la precarga de "Cerrar jornada". **Faltan las pantallas** (este documento es para quien las construye). La especificación de comportamiento es `modulo.md`; la maqueta aprobada, la referencia visual y de textos.

## 1. La idea en tres líneas

1. `GET /api/hoja-dia?fecha=…` devuelve **el día entero** (`DiaHoja`, en `src/lib/hoja-dia/tipos.ts`).
2. **Todas las cuentas se hacen en el navegador** con las funciones puras de `src/lib/hoja-dia/estado.ts` (las mismas que usa el servidor para los mensajes): `problemas(dia, c, ahora)`, `bandeja(dia, ahora)`, `calcVeh(dia, veh)`, `dondeAnda(…)`, `camionesQueSirven(…)`, etc. No hay endpoints de "cuentas": si la pantalla necesita un dato derivado, está en `estado.ts`.
3. **Cada gesto es un POST** con `{ accion, … }` que devuelve `{ ok, texto, historialId }`: `texto` es el aviso en palabras ("Ramírez pasó a la Cuadrilla 3") y `historialId` el "Deshacer". Los hooks ya muestran el toast con Deshacer y refrescan el día.

### La hora: minutos desde las 0:00 del día de la hoja

Todo instante del payload (enviada, abierta, hecho, creado, esperando hasta) viaja como **minutos desde las 0:00 del día de la hoja, en Buenos Aires** (`Minutos`). Puede ser negativo (−300 = 19:00 del día anterior) o pasar de 1440. `hm(m)` lo muestra ("18:42"); `useAhora(fecha)` da el `ahora` en esa escala y avanza solo cada 30 s. Las horas "de reloj" (`Hora`) son strings `"7:45"`.

- `esHoy(ahora)`, `esPasado(ahora)`, `ahora < 0` = es mañana.
- `hoyManana(fecha, ahora)` → "hoy" / "mañana" / "el martes".

## 2. Rutas de API

Permisos: el proxy y cada ruta (segunda llave). `GET` pide "ver", el resto "editar". Módulo nuevo **`hoja-dia`** ("Hoja del día", grupo Operaciones, ruta `/planificacion/hoja`, que cubre `/planificacion/hoja/camiones`). Gana la ruta más larga: quien tiene Planificación sin Hoja del día **no** abre `/planificacion/hoja`.

| Ruta | Método | Módulos | Cuerpo / respuesta |
|---|---|---|---|
| `/api/hoja-dia?fecha=` | GET | hoja-dia | → `DiaHoja` |
| `/api/hoja-dia` | POST/PATCH | hoja-dia | `AccionHoja` → `Resultado` |
| `/api/hoja-dia/precarga` | POST | hoja-dia | `{ fecha, modo: "hoy"\|"plantel"\|"vacio" }` → `Resultado & { avisos: string[] }` |
| `/api/hoja-dia/viajes` | POST/PATCH | hoja-dia | `AccionViaje` → `Resultado & { viajeId?, avisarA?, avisarDeposito? }` |
| `/api/hoja-dia/pedidos` | POST/PATCH | `crear`: hoja-dia, planificacion o panol · resto: hoja-dia | `AccionPedido` → `Resultado & { pedidoId? }` |
| `/api/hoja-dia/ausencias?desde=` | GET | hoja-dia, personal | → `{ ausencias: Ausencia[] }` (vigentes y próximas) |
| `/api/hoja-dia/ausencias` | POST | hoja-dia, personal | `AccionAusencia & { fechaVista? }` → `Resultado` |
| `/api/hoja-dia/lugares` | POST | hoja-dia | `{ accion: "crear"\|"editar", … }` |
| `/api/hoja-dia/contratistas?mes=YYYY-MM` | GET | hoja-dia | → `ResumenMesContratistas` (`contratistas-servidor.ts`): por contratista, jornadas-persona, días, total estimado, detalle por día y prorrateo por obra; `sinTablero` si Odoo no contestó |
| `/api/hoja-dia/contratistas` | POST | hoja-dia (editar) | `AccionContratista`: `{ accion: "crear", nombre, referente?, celular?, valorJornada?, nota? }` · `{ accion: "editar", contratistaId, …, activo? }` (baja = `activo: false`; no se borra) |
| `/api/hoja-dia/personas` | POST | hoja-dia | `{ accion: "celular", personaId, telefono }` · `{ accion: "puede_estar_a_cargo", personaId, valor }` · `{ accion: "puede_manejar", personaId, valor }` (sólo Legajos) (con el id de un contratista, "celular" guarda el del referente en `hd_contratistas`) |
| `/api/hoja-dia/envios?fecha=` | GET | hoja-dia (editar) | → `{ filas: Preparado[] }` (sólo lee: el link se crea al mandar; sin link, `link`/`waLink` en null) |
| `/api/hoja-dia/envios` | POST | hoja-dia | ver §2.3 |
| `/api/hoja-dia/telegram` | GET / POST | hoja-dia | estado del bot / `{ accion: "vincular"\|"desvincular", personaId }` |
| `/api/hoja-dia/deshacer` | POST | hoja-dia | `{ historialId }` → `{ ok, texto, historialId }` (409-ish si algo cambió después: el error lo dice) |
| `/api/hoja-dia/historial?fecha=&hojaId=\|viajeId=\|pedidoId=` | GET | hoja-dia | → `{ historial: […] }` (línea de tiempo) |
| `/api/hoja-dia/cierre?cuadrilla=&fecha=&ot=` | GET | hoja-dia, planificacion, partes | → `PrecargaCierre` (ya conectado a "Cerrar jornada") |
| `/api/public/hoja/[token]` | GET / POST | **público** (token) | → `VistaPublica` / `{ accion, viajeId?, motivo?, at? }` |
| `/api/public/hoja/[token]/archivo/[id]` | GET | **público** (token) | el archivo (plano o foto de la OT), servido por la app: imágenes y PDF en línea, el resto se descarga; nosniff + CSP |
| `/api/public/hoja/[token]/viaje/[id]/foto` | POST (multipart `foto`) | **público** (token) | la foto del remito del chofer (sus viajes, imagen por bytes, ≤ 4 MB) |
| `/api/hoja-dia/foto?viajeId=` | GET | hoja-dia | → `{ url }` firmada 10 min (bucket privado) |
| `/api/telegram/webhook` | POST | **público** (secreto) | el bot (no lo llama la pantalla) |

Los tipos (`AccionHoja`, `AccionViaje`, `AccionPedido`, `AccionAusencia`, `Resultado`) están en `src/lib/hoja-dia/acciones.ts` (esquemas zod con los campos exactos); `Preparado` y `EstadoTelegram` en `envios.ts`; `VistaPublica` en `publico.ts`; `PrecargaCierre` en `servicio.ts`. Se importan **sólo como tipo** (`import type`): esos módulos son del servidor.

### 2.1 `AccionHoja` (POST /api/hoja-dia)

| `accion` | Campos | Para |
|---|---|---|
| `crear_hoja` | fecha, cuadrilla | Una tarjeta nueva (cuadrilla que entró al tablero después de la precarga) |
| `agregar` | fecha, cuadrilla, personaId, reemplaza?, aCargo? | Arrastrar / "+ Agregar" / teclas 1–5. Si estaba en otra, **la mueve** (la UI pregunta antes "¿Lo pasás a la 3?"). `reemplaza`: soltar sobre otro nombre |
| `sacar` | fecha, personaId | "Sacar" |
| `a_cargo` | fecha, cuadrilla, personaId \| null | "Poner a cargo" / "Usar" la sugerencia. Devuelve `avisarA` si el anterior ya tenía la hoja |
| `recibe` | fecha, cuadrilla, personaId \| null | Mandar sin nadie a cargo |
| `nota_persona` | fecha, personaId, nota | "va directo a la 2.ª obra" |
| `modo` | fecha, cuadrilla, modo | El selector de tres sobre el PRIMER vehículo ("sin" saca todos; si no hay, suma uno) |
| `chofer` | fecha, cuadrilla, choferId | Soltar un chofer (llena el renglón sin chofer, cambia el chofer si hay uno solo —el camión queda— o suma un renglón; sin vehículos, suma uno de Lleva y trae con encuentro en el depósito) |
| `vehiculo` | fecha, cuadrilla, vehiculoId | El camión del primer vehículo |
| `vehiculo_sumar` | fecha, cuadrilla, modo (`lleva_trae`/`todo_el_dia`), choferId?, vehiculoId? | "+ Otro vehículo" / "+ Lleva y trae" / "+ Todo el día" (sin nada, el primero propone el de ayer) |
| `vehiculo_quitar` | fecha, cuadrilla, filaId | "Quitar" un vehículo (con su lleva; el busca que lo seguía queda a definir, o se va si nadie más los lleva) |
| `vehiculo_cambiar` | fecha, cuadrilla, filaId, modo?, choferId?, vehiculoId? | El modo, el chofer o el camión de un vehículo (independientes: sólo se propone el otro si falta) |
| `encuentro` | fecha, cuadrilla, lugar, hora, texto? | (en el depósito, mueve el "lleva" del que los lleva) |
| `lleva` | fecha, cuadrilla, hora, filaId? | La hora del lleva de un vehículo (sin filaId, el que los lleva; ése mueve el encuentro) |
| `vuelta` | fecha, cuadrilla, filaId?, vuelve, llega? | "Después vuelve al depósito" (llega null = la estimada) |
| `busca` | fecha, cuadrilla, hora \| null | La hora del busca; null = "vuelven por su cuenta"; una hora sin busca lo crea con el que los lleva |
| `busca_con` | fecha, cuadrilla, filaId? \| vehiculoId?, choferId? | Quién los busca: ese vehículo de la hoja (lo sigue), otro camión/chofer, o sin vehículo = a definir. Con otro camión, la pantalla manda el `choferId` que resolvió (`choferSugerido`): el servidor escribe el mismo que se vio al instante |
| `mueve` | fecha, cuadrilla, otId, hora | Viaje "Mueve" entre obras |
| `carga_lleva` | fecha, cuadrilla, carga \| null, filaId? | Lo que lleva el "lleva" (sale en la lista de carga) |
| `nota` | fecha, cuadrilla, nota | Nota de toda la cuadrilla |
| `instrucciones` | fecha, otId, cuadrilla?, horaInicio?, hoy?, chips? | "+ Instrucciones" (sigue a la obra si cambia de cuadrilla) |
| `copiar_como_hoy` | fecha, cuadrilla | Menú ⋯ de la tarjeta |
| `pasar_chofer` | fecha, cuadrilla, desde, choferId? | "Sacarlo de la 1": saca de `desde` los vehículos de ese chofer |
| `liberar` | fecha, cuadrilla | Hoja de una cuadrilla que se quedó sin obras (también saca a los contratistas) |
| `contratista_sumar` | fecha, cuadrilla, contratistaId, n (±1…60, ≠ 0) | Arrastrar del panel (+1), el − / + del chip, "Agregar a la Cuadrilla N…" (+N), "+ Agregar". Crea la fila si no estaba; no baja de 0 ("¿cuántos?") |
| `contratista_quitar` | fecha, cuadrilla, contratistaId | "Quitar de la Cuadrilla N" (si estaba a cargo, la hoja queda sin nadie a cargo) |
| `contratista_nota` | fecha, cuadrilla, contratistaId, nota | "Nota" del chip ("traen su arnés") |

**Contratistas y "a cargo"**: `a_cargo` acepta el id de un contratista (que tenga gente en esa hoja y no esté a cargo de otra ese día): escribe `hd_hojas.a_cargo_contratista_id` y saca el a cargo de los integrantes; poner a cargo a una persona (o `agregar` con `aCargo`) lo saca al contratista. `personaId: null` saca a los dos.

### 2.2 `AccionViaje` y `AccionPedido`

- Viajes: `crear` (también Taller/VTV con `tipo:"taller"` y fletes de afuera con `fleteExterno`; con `pedidoId` + `fleteExterno` el pedido queda atado al flete, "en camino · flete de X"), `poner_pedido` {pedidoId, vehiculoId, sobre?, orden?} (soltar entre dos fichas: `orden` = el promedio de los `orden` vecinos; sobre una ficha al mismo destino: `sobre` = id del viaje), `mover` {viajeId, vehiculoId \| null, orden?, hora?}, `hora` {viajeId, hora \| null, noAntesDe?} (fijar / cambiar / "estimada"), `volver_a_cola`, `anular` {motivo}, `hecho` (marcado por el coordinador), `no_pudo` {motivo}, `deshacer_estado`, `ok_todo_el_dia` ("Sacarlo un rato"), `correr_horas` {fecha, vehiculoId}, `chofer_del_camion` {fecha, vehiculoId, choferId} ("Elegir otro chofer" pasa los viajes pendientes con chofer elegido y los renglones de las hojas con ese camión; los sin chofer lo siguen solos), `chofer` {viajeId, choferId} (el chofer de UN viaje; el lleva de un vehículo de la hoja cambia el renglón, el busca/mueve se suelta; `null` en un viaje suelto = "el que maneje el camión"), `vuelven_solos` {fecha, cuadrilla}, `con_lleva` {viajeId, llevaId} ("Que lo lleve Conte con la Cuadrilla 1": los pedidos del material pasan al lleva, la carga se suma a la del lleva y el material se anula con `sacarDeSuViaje`; `planConLleva` de estado.ts).
- **El chofer de un viaje (11/10, `fix/hoja-dia-chofer-de-pedidos`)**: `hd_viajes.chofer_id` se guarda sólo si alguien lo eligió (o en los viajes de un renglón de la hoja, que llevan el del renglón). `crear`, `poner_pedido`, `aceptar_sugerido` y `mover` de un viaje suelto a otro camión lo dejan en `null` = "el que maneje ese camión a esa hora": `choferDe` → `choferEnCamion` (el renglón de `hd_hoja_vehiculos` con ese camión ese día —"Todo el día" manda; con varios choferes, el del lleva de antes—, si no el viaje anterior/siguiente de la fila con chofer elegido, si no `hd_camiones_dia`, si no el habitual). `choferSugerido` / `choferParaOrden` dicen lo mismo para mostrar. El link del chofer (`publico.ts`, `porQueNoPuedeMarcar`) resuelve igual con el día leído. Al borrar un viaje de la hoja (`escribirPlanVehiculos`), sus pedidos vuelven a la cola con historial.
- Pedidos: `crear` {que, hacia, urgencia, horaLimite?, …; `tipo` y `pidioId` se deducen si no vienen: `tipoPorDestino`, `pidioPorDefecto`; `fecha` por defecto hoy hasta las 15 y mañana después; `cajonPendienteId` tilda el pendiente del cajón}, `aceptar_sugerido` / `descartar_sugerido` {fecha, key} (la `key` de `sugeridosDe`), `esperar` {motivo, hasta?}, `ya_esta`, `pasar_a_manana`, `anular` {motivo?}, `orden_manual` {orden \| null}, `visto` (el rojo del "No pude").
- Las respuestas traen `avisarA` (id o lista de choferes que ya tenían su hoja y ahora tienen un cambio) y `avisarDeposito` (true si el viaje sale del depósito con carga hoy): son los botones del aviso ("Avisar a Gómez", "Avisar al depósito").

### 2.3 Envíos (POST /api/hoja-dia/envios)

| `accion` | Campos | Qué hace |
|---|---|---|
| `preparar` | fecha, personaId | Texto (con link), `waLink`, `link`, `telegram` (se le puede mandar por Telegram) |
| `enviar` | fecha, personaId, canal `"telegram"\|"manual"` | Telegram: manda y marca "Enviada" **sólo si Telegram contestó ok**; si falla, `enviado:false`, `texto` = el error en palabras y `waLink`/`mensaje` para mandarlo a mano. Manual: marca enviada (con `historialId` para Deshacer). Manda lo que corresponde según el estado: la hoja, el cambio, el viaje nuevo o "ya no estás a cargo" |
| `enviar_todos` | fecha | Todo lo pendiente por Telegram → `{ enviados, aMano: Preparado[], errores }` |
| `no_hace_falta` | fecha, personaId | El cambio queda "sin avisar" en gris |
| `reenviar` | fecha, personaId, canal | |
| `anular_link` | fecha, personaId | |
| `avisar_operario` | fecha, personaId, canal \| `"no_hace_falta"` | "Avisar a Ramírez" |
| `avisar_deposito` | fecha, viajeId, canal | |
| `avisar_capataz` | fecha, pedidoId, canal | "Avisar a Conte" (su pedido va en tal camión) |
| `avisar_mensaje` | fecha, tipo (`sacar_rato`\|`tarde`\|`vuelven_solos`\|`lista_carga`), viajeId?, cuadrilla?, canal `auto` | El servidor arma texto y destinatario; Telegram si hay vínculo, si no `waLink` |

Telegram: `GET /api/hoja-dia/telegram` → `{ configurado, bot, vinculados: [{ personaId, usuario, desde }] }`. `POST { accion:"vincular", personaId }` → `{ link, waLink, texto }`: **el link de vinculación se copia o se manda una vez por WhatsApp** (`waLink`). `Persona.telegram` (en el día) dice si está vinculada.

## 3. Hooks (`src/hooks/use-hoja-dia.ts`)

```ts
const { data: dia } = useHojaDia(fecha);           // DiaHoja
const ahora = useAhora(fecha);                      // Minutos, avanza sola
useAvisosHojaDia(fecha);                            // en vivo: otros coordinadores, links, Telegram y el tablero
const hoja = useAccionHoja(fecha);    hoja.mutate({ accion: "agregar", fecha, cuadrilla: 3, personaId });
const viaje = useAccionViaje(fecha);  const pedido = useAccionPedido(fecha);
const aus = useAccionAusencia(fecha); const precarga = usePrecarga(fecha);   // precarga: el toast lo arma la pantalla con r.avisos
const persona = useAccionPersona(fecha); const lugar = useAccionLugar(fecha);
const contratista = useAccionContratista(fecha);    // alta / edición / baja
const resumen = useResumenContratistas("2026-10"); // "Contratistas · octubre"
const deshacer = useDeshacer(fecha);
const envios = useEnvios(fecha, abierta);  const enviar = useEnviar(fecha);
const tg = useTelegram(); const vincular = useVincularTelegram();
const historial = useHistorialHoja({ hojaId });
usePrecargaCierre(cuadrillaOdooId, fecha, otId);    // ya usado por formulario-cierre.tsx
```

Los gestos (`useGesto`) ya muestran el toast con "Deshacer" (9 s), avisan por el canal en vivo y refrescan el día **en segundo plano** (`refrescarHoja`: uno por ráfaga, nunca con un gesto en vuelo). Los errores salen como toast con el texto del servidor. **Los de las tarjetas (`useAccionHoja`) son optimistas** desde el 10/10 (noche): `optimista.ts` (puro, con tests) calcula el día nuevo con las reglas de estado.ts (los vehículos y sus lleva/busca con `planVehiculos`, el mismo plan que escribe el servidor) y se ve al instante; si el servidor rechaza, vuelve atrás. Viajes, pedidos, envíos y precarga esperan al servidor. Ver handoff.md, "Latencia".

## 4. Qué función de `estado.ts` alimenta cada parte de la pantalla

| Pantalla | Funciones |
|---|---|
| Encabezado "3 de 5 listas · 0 enviadas" y botón coral | `bandeja(dia, ahora)` (`listasN`, `total`, `enviadas`), `pendientesEnvio(dia)` ("Enviar a los capataces" vs "Avisar cambios (n)") |
| "Falta para mandar" (la bandeja) | `bandeja(dia, ahora)` → `vos` (Para hacer vos), `esp` (Esperando al capataz o al chofer), `listas`. Cada item trae `t`, `rojo`, `gris` y `bs: Boton[]` |
| Día vacío | `cuadrillasConObras(dia)` sin hojas → precarga |
| Tarjeta | `cuadrillasConHoja`, `hojaDeCuadrilla`, `obrasCon(dia, c)` (hora de cada obra), `genteDe(h)`, `aCargoDe(h)`, `vanDe`, `prevista`, `encTxt`, `estadoHoja(dia, c, ahora)`, `problemas(dia, c, ahora)` (`card` + `bs`), `nuevosEnHoja(dia, c)` ("Avisar a Ramírez"), `suspendida(dia, c)` |
| Sugerencia de a cargo | `sugerirACargo(dia, c)` → `{ pid, por }` ("Ortega (ayer en Rivadavia 6150)") |
| Panel Gente | `panelGente(dia)` (sin asignar, no disponibles, asignados, choferes, vehículos); `sinAsignar`, `sugerirPersona`; buscar con `normalizar()` |
| Vehículos de la tarjeta | `vehiculos.ts`: `planVehiculos` (lo que va a pasar con un gesto; el servidor y el optimista hacen lo mismo. Un viaje sigue a su renglón sólo en lo que el gesto le cambió; una hoja sin renglones con un lleva del código viejo lo adopta como fila implícita; el mismo vehículo dos veces en una hoja es `NoSePuede`), `correrLlegada`, `llevaDeFila`, `quienBusca`, `resumenLegado`; vista-cuadrillas.ts: `resumenVehiculos`, `buscaTxt`, `horasDeFila`, `opcionesChofer(dia, c, filaId)`, `opcionesVehiculo(dia, c, filaId)` (`deshabilitada` = ya va en otro renglón de la hoja); estado.ts: `vehiculosDe`, `filaQueLleva`, `modoDe`, `choferesTodoDe`, `genteConChoferes`, `choferesElegibles`, `puedeManejar`, `vehiculoDeChofer`, `vencimientosTxt` |
| Ausencias | `ausenciaDe`, `parcialDe`, `ausTexto(a, true, fecha)`; `Ausencia.id === null` ⇒ "según la asistencia" (botones "Cargar hasta cuándo" = `crear` con `origen:"asistencia"`, "Ya tiene el alta" = `alta` con `personaId`, `desde`, `tipo`) |
| Vista Camiones: filas | `choferesTxt(dia, veh)` / `choferesDeFila` (quién lo maneja en cada tramo), `choferDe` / `choferEnCamion` (el chofer de un viaje: el guardado o el que maneja el camión a esa hora), `choferSugerido` / `choferParaOrden` (lo mismo para un viaje nuevo, para mostrar), `textoNoEntra` ("El AB 799 CA no llega: …"), `llevasParaMaterial` / `botonesConLleva` / `planConLleva` (el material que puede ir con el lleva de la cuadrilla), `crucesChofer` (el mismo chofer en dos camiones), `filasCamiones(dia)`, `calcVeh(dia, veh)` (`t`, `fin`, `dur`, `conflicto`, `i`), `cortoV`, `horaTxt`, `dondeAnda(dia, veh, ahora)` (encabezado, con `tono`), `camionesSinUsar(dia)`, `fletesDeAfuera(dia)`, `viajeSinAvisar(dia, v)` (ficha punteada) |
| Tiempo de viaje y Maps (Camiones, tarjeta) | rutas.ts: `tramoDe(dia, v)` (Google o la típica, para "~35 min en auto"), `tramoEntre(dia, desdeKey, haciaKey)` (sólo Google), `comoLlegarViaje(dia, v)`, `recorridoCamion(dia, veh)`, `recorridoChofer(dia, ch)`, `depositoSinUbicar(dia)`; tiempos.ts: `tiempoTxt`, `tiempoTitulo`; el componente `comunes/tiempo-tramo.tsx` |
| Línea "Ahora:" | `ahoraItems(dia, ahora)` |
| Avisos de una fila | `avisosVeh(dia, veh, ahora)`, `avisosChofer(dia, ch, ahora)` |
| Cola de pedidos | `cola(dia, ahora)` (`vos`, `esp`, `camino`, `hechos`), `estadoPedido`, `ordenCola`, `sugeridosDe(dia, ahora)`, `vieneDeAyer` |
| Poner en un camión | `camionesQueSirven(dia, pedido, ahora)` (`orden` = las teclas 1–4, `cerca`, `libre`, `no` con el porqué, `nadieLibre`), `txtCerca`, `txtLibre`, `txtNadieLibre`, `posicionAuto` |
| Nuevo pedido | `tipoPorDestino`, `pidioPorDefecto`, `fechaPorDefecto`; buscador: `dia.obras` (con `cuadrillaOdooId`), `dia.lugares` |
| Lista de carga | `listaCarga(dia, ahora)`, `textoListaCarga` ("Copiar para WhatsApp") |
| Lista de envío | `destinatarios(dia)`, `estadoEnvio`, `afectadosPorCambio(dia)` + `mensajes.ts`: `mensajeDe`, `filaEnvio`, `estadoCorto`, `canalDe` (o directamente `useEnvios`) |
| "Ver como Ortega" (vista previa) | La misma `VistaPublica` del link no se puede pedir sin token; usar `useEnvios`→`link` y abrirlo, o armar con `obrasCon`/`viajesChofer` |
| Cerrar jornada | ya conectado (`fletesDelDia`, `PrecargaCierre`; `personas` y `horariosCierre` suman la gente de los contratistas, `contratistas` = "3 de Quintana" para el aviso) |
| Contratistas (tarjeta, panel, resumen) | estado.ts: `contratistasDe`, `deContratistas`, `vanDe` (los suma), `aCargoDe` (persona ?? contratista), `aCargoIntegrante`, `aCargoContratista`, `cantidadDe`, `cuadrillasDeContratista`, `aCargoDeContratista`, `diferenciasContratistas`, `esContratista`, `contratista`. contratistas.ts: `chipsContratistas`, `resumenContratistas` ("3 de Quintana"), `vanEnPalabras` ("3 de Quintana + Ramírez"), `panelContratistas`, `destinosContratista`, `resumenMes`, `pesos`, `leerPesos`, `rangoMes`, `mesTexto` |

### Los botones (`Boton.a`)

Los problemas y avisos traen sus botones como datos (`{ l: "Usar Miño", a: "usarCargo", c: 5, p: "<id>" }`). La pantalla los traduce a gestos:

| `a` | Gesto |
|---|---|
| `sacar` | `hoja {accion:"sacar", personaId:p}` |
| `usarCargo` | `hoja {accion:"a_cargo", cuadrilla:c, personaId:p}` |
| `agregar` | `hoja {accion:"agregar", cuadrilla:c, personaId:p}` |
| `focoAgregar` | foco en "+ Agregar" de la tarjeta `c` |
| `chEd` | abre el editor de chofer de `c` (foco en `foco`: "lleva"/"busca") |
| `pasarChofer` | `hoja {accion:"pasar_chofer", cuadrilla:c, desde:from}` |
| `irA` / `verCamion` / `verViaje` / `irCamiones` / `tablero` | navegación (tarjeta `c`, fila `veh`, ficha `id`, vista Camiones, tablero) |
| `elegirChoferViaje` | elegir camión → `viaje {accion:"mover", viajeId:id, vehiculoId}` |
| `vuelvenSolos` | `viaje {accion:"vuelven_solos", cuadrilla:c}` (después, "Avisar a …") |
| `okTodo` / `volverCola` / `marcarHecho` | `viaje {accion:"ok_todo_el_dia"\|"volver_a_cola"\|"hecho", viajeId:id}` |
| `conLleva` | `viaje {accion:"con_lleva", viajeId:id, llevaId:con}` ("Que lo lleve Conte con la Cuadrilla 1", en el aviso de "no entra" y en el menú del viaje) |
| `avisarChofer` / `abrirEnvio` / `reenviar` / `avisarTarde` | la lista de envío (filtrada a `p`) / `envios {accion:"reenviar"}` |
| `llamar` | `tel:` con el celular de `p` |
| `dlgCel` | diálogo "Cargar celular" → `personas {accion:"celular"}` |
| `esperar` / `poner` / `pasarManana` / `fleteDe` | pedido `id`: diálogo Esperar…, modo "poner en un camión", `pedido {accion:"pasar_a_manana"}`, alta de flete de afuera |
| `liberar` | `hoja {accion:"liberar", cuadrilla:c}` |
| `sumarContratista` | `hoja {accion:"contratista_sumar", cuadrilla:c, contratistaId:p, n}` ("Poner 1" de "Falta cuántos van de Quintana") |

## 5. El link público (`/h/[token]`)

`GET /api/public/hoja/[token]` → `VistaPublica` (`src/lib/hoja-dia/publico.ts`):

- `situacion`: `"invalido"` ("El link no es válido.") · `"vencido"` (`texto`) · `"ya_no"` (`texto`, `coordinador`) · `"suspendida"` (`texto`) · `"ok"`.
- `ok` + `rol: "a_cargo"`: `cuadrilla`, `aCargo`, `vos`, `nota`, `encuentro`, `chofer {modo, texto, nombre, telefono}`, `obras: ObraPublica[]` (hora, dirección, `mapsUrl`, tipo, detalle "jornada completa · día 2 de 3", `hoy`, `chips`, `queHacer`, `observaciones`, contacto, `archivos` con `url` propia, `paraTuObra`), `gente` (con `nuevo` para marcar "Ramírez · nuevo").
- `ok` + `rol: "chofer"`: `vehiculo`, `todo` (si va todo el día: cuadrilla y obras), `viajes: ViajePublico[]` (`texto` ya en imperativo, `hora` con "~" si es estimada, `mapsUrl`, `llamar`, `estado`, `nuevo`), `ahoraId` (el de "Ahora"), `motivosNoPude`.
- `ok` + `rol: "chofer"` también trae `recorridoUrl` ("Ver el recorrido en Maps": sus paradas que faltan, en orden; opcional por las vistas guardadas). Los `mapsUrl` de obras y viajes son "Cómo llegar" (`https://www.google.com/maps/dir/?api=1&destination=…`, al pin si hay coordenadas; `maps.ts`).
- Comunes: `fechaTxt`, `generadoAt` (para "Sin conexión · lo que ves es de las 20:16"), `cambio {hora, txt}` (la tarjeta ámbar con "Entendido"), `recibido {hora}`, `coordinador {nombre, telefono}`.
- `POST { accion: "recibido"|"entendido", version }` (si la versión es vieja: 409 "Esa hoja cambió, mirá la nueva") · `{ accion: "hecho"|"deshacer", viajeId }` · `{ accion: "no_pude", viajeId, motivo }`, con `at` (ISO) si se tocó sin señal y se manda después. Límite (hd_contar, atómico): 30 toques y 120 lecturas por minuto por token.
- La página: layout propio, **tema claro**, `noindex`, sin sesión; refrescar cada 30 s y al volver; guardar la última respuesta en `localStorage` y reintentar los toques pendientes (§12 "Sin señal"). Abrirlo ya marca "Abierta" en el escritorio.

## 6. Dónde va cada cosa

```
src/app/(dashboard)/planificacion/hoja/page.tsx            ← vista Cuadrillas (?dia=)
src/app/(dashboard)/planificacion/hoja/camiones/page.tsx   ← vista Camiones (?dia=)
src/app/h/[token]/page.tsx (+ layout.tsx propio, tema claro)  ← el celular (ruta pública: "/h/" ya está en el proxy)
src/components/hoja-dia/cuadrillas/   tarjeta, panel Gente, bandeja, selector de chofer, instrucciones, precarga, ausencias
src/components/hoja-dia/camiones/     filas con línea de tiempo y lista, cola de pedidos, nuevo pedido, lista de carga
src/components/hoja-dia/celular/      vista capataz, vista chofer, sin señal, visor de planos
src/components/hoja-dia/comunes/      lista de envío (Telegram / a mano), vincular Telegram, historial, selector de día
```

- La pestaña "Hoja del día" en Planificación y el menú: `src/lib/constants/navigation.ts` (se filtra solo con `puedeAbrir`).
- El cajón del tablero (`src/components/tablero/cajon-planificacion.tsx`): "Pasar a pedido" = `useAccionPedido().mutate({ accion:"crear", que, hacia, cajonPendienteId })`.
- Legajos: columna/acción "Telegram" (vinculado o no, "Copiar link de vinculación" con `useVincularTelegram`) y "Puede estar a cargo".
- Encabezado de cada día del tablero: "Hoja: 3 de 5 enviadas · 2 pedidos sin camión" (con `useHojaDia` + `bandeja`/`cola`; ojo: un GET por día visible).

## 7. Estado de la base

**Varios vehículos y chofer por viaje (11/10)**: `Hoja.vehiculos: VehiculoHoja[]` reemplaza a `modo/choferId/vehiculoId/choferTocadoMin` (`modoDe(h)` da el del primero). `Viaje.hojaVehiculoId` y `Viaje.vueltaLlega`. `Persona.puedeManejar`. `FotoHoja.vehs` (opcional: las fotos viejas se comparan con el primer vehículo y los demás de ahora son "va también"; los renglones se emparejan por vehículo + chofer + modo, no por id, así "Copiar como hoy" sobre una hoja enviada no marca cambios). `ChoferDeHoja.otros` (opcional). `PrecargaCierre.fletes.porVehiculo`. `PlanHoja.vehiculos` y `buscaCon`; `PlanPrecarga` ya no trae `camiones`. Migración `20261012000001_hoja_dia_vehiculos.sql`.

**Contratistas (10/10, noche)**: el referente de un contratista se trata como una persona que recibe la hoja: `DiaHoja.contratistas` viaja aparte (no está en `personas`, así no aparece en "Sin asignar" ni en ausencias), y estado.ts lo agrega a su índice de personas (`Persona.contratista: true`, id = el del contratista, nombre = el del contratista). Por eso `nombreDe`, `persona`, `recibeDe`, `destinatarios`, los envíos y los mensajes no cambian. Del lado del servidor, `quien.ts` dice en qué tabla vive cada id (`personal` / `pan_personas_externas` / `hd_contratistas`) y en qué columna va en links, códigos y mensajes de Telegram. `Hoja.contratistas` (cantidades) y `Hoja.aCargoContratistaId`; `FotoHoja.contr` (opcional: las fotos viejas no lo tienen). `VistaCapataz.van` / `vanTxt` y `GentePublica.cantidad` / `contratista` (opcionales por las vistas guardadas en el celular).

**Hecho**

- Migración `supabase/migrations/20261011000002_hoja_dia_contratistas.sql` (**no aplicada**; ver handoff.md): `hd_contratistas`, `hd_hoja_contratistas`, `hd_hojas.a_cargo_contratista_id`, `contratista_id` en links y Telegram, `hd_aplicar` con las tablas nuevas.
- Migración `supabase/migrations/20261011000001_hoja_del_dia.sql` (aplicada el 10/10): tablas `hd_*`, vínculos en `personal` (`odoo_employee_id`, `odoo_tarea`, `puede_estar_a_cargo`, `telegram_*`), `pan_personas_externas.telegram_*`, `cuadrillas.odoo_cuadrilla_id`, RLS por permiso, parámetros, lugares iniciales, a cargo iniciales, bucket `hoja-dia`.
- `src/lib/hoja-dia/`: `tipos.ts`, `estado.ts` (pura, con tests), `mensajes.ts`, `tokens.ts`, `telegram.ts`, `servicio.ts` (lectura del día, historial y Deshacer, precarga del parte, campanita), `acciones.ts`, `envios.ts`, `publico.ts`, `avisos.ts` (en vivo, navegador).
- `src/lib/odoo/asignaciones.ts`: `fetchTableroDeFechas`.
- APIs de §2, webhook de Telegram, hooks, "Cerrar jornada" precargado, alertas `hoja_dia` (sólo campanita).
- Scripts (no corridos): `scripts/hoja-dia-vincular-personal.mjs`, `scripts/hoja-dia-vincular-cuadrillas.mjs`, `scripts/telegram-webhook.mjs`.

**Cómo se aplica**

1. Probar (no escribe nada): envolver en `BEGIN; … ; … ; ROLLBACK;` y correr con `npx supabase db query --linked -f <archivo>` (ver handoff.md; `scripts/probar-migracion.mjs` necesita `pg` y `SUPABASE_DB_URL`, que hoy no están).
2. Aplicar: `npx supabase db query --linked -f supabase/migrations/20261011000001_hoja_del_dia.sql`.
3. Vínculos: `node --env-file=.env.local scripts/hoja-dia-vincular-cuadrillas.mjs` (mirar) → `--aplicar`; igual con `hoja-dia-vincular-personal.mjs`.
4. Permisos: dar "Hoja del día" (editar) a Juan Agustín, Ezequiel y Joaquín desde Configuración → Usuarios.
5. Telegram: crear el bot con @BotFather, cargar las variables, `node --env-file=.env.local scripts/telegram-webhook.mjs https://<dominio>`.

**Variables de entorno nuevas** (opcionales: sin ellas el envío queda manual)

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`.
- `GOOGLE_MAPS_API_KEY` (sólo servidor; si falta se usa `NEXT_PUBLIC_GOOGLE_MAPS_KEY`): tiempos de manejo de la Routes API. Sin ella, o con la API apagada, las duraciones típicas.

**Tiempos de Google (12/10, `feat/hoja-dia-google-maps`)**: `DiaHoja.tiempos?: Record<"desdeKey>haciaKey", { min, m, fuente }>` lo arma `leerDia` con `rutas-servidor.ts` (`tiemposDelDia`: caché en memoria + `hd_tiempos` leído sólo por los tramos del día, en lotes de hasta 900 filas; nunca tira) para los tramos de `paresDelDia` (rutas.ts: paradas de cada camión, su vuelta al depósito si no tiene la llegada cargada, y obra → obra de cada cuadrilla). **Sólo el GET de la pantalla** (`leerDia(f, { tiempos: "google" })`) le pide a Google lo que falta (tope 2,5 s); los gestos, los envíos y el link del celular usan lo guardado (`soloCache`, sin esperar a Google). `calcVeh` los usa por `durDe` (tiempos.ts: manejo + parada, llegada a una hora fija, vuelta real, hueco mínimo); sin tiempos, la cuenta de siempre. El contexto de un gesto (`leerContexto`) no los trae (no calcula horas); lo optimista conserva los del último GET y un tramo nuevo va con la típica hasta el refresco. Migración `20261012000002_hoja_dia_tiempos.sql` (el código tolera que no esté). Ver handoff.md, "Google Maps". Desde el 11/10 (`fix/hoja-dia-chofer-de-pedidos`) deja en el log de Vercel, una vez por motivo cada 10 min, por qué un día sale con las típicas: sin clave, lugares sin coordenadas (`paresDelDia(dia, sinCoordenadas)`), `hd_tiempos` que no se puede leer o escribir, o el pedido que no terminó (el 403 de Google ya se anotaba).

**Falta** (además de las pantallas): ver `handoff.md`.
