# Módulo Hoja del día — propuesta

Estado: propuesta v2 (10/10/2026). Incorpora las siete decisiones del dueño del 10/10 (§19): las cuatro de la v1 (chofer, capataz, link, ausencias) y las tres de la tarde (los camiones, el coordinador y el despacho en vivo), más la octava (10/10, última hora): **el envío es por Telegram, no por WhatsApp** (§11). La base (datos, lógica, APIs y bot) está construida en la rama `feat/hoja-del-dia`; las pantallas no. Ver `implementacion.md` y `handoff.md`. Maqueta (v2, cuadrillas + camiones y despacho): https://claude.ai/artifact/RLVbM2WyaRS9iGk3gR1PKb

> La carpeta se llama `equipos-del-dia` provisoriamente; el nombre que se propone es **Hoja del día** (ver §1). Si se aprueba, se renombra a `docs/hoja-del-dia/`.

El Tablero de Planificación dice **qué obra hace cada cuadrilla cada día**. La Hoja del día agrega **con quién y con qué**, maneja **la hoja de ruta de cada camión** (lo planificado la noche anterior y lo que entra durante el día) y lo lleva al celular del capataz y del chofer. Tiene que contestar siete preguntas:
- **Quién va mañana en cada cuadrilla, y quién está a cargo.**
- **Quién los lleva, en qué vehículo, y cuándo los busca.**
- **Qué tienen que hacer en cada obra, a qué hora y con quién hablar.**
- **Quién falta, hasta cuándo, y qué cuadrilla quedó corta.**
- **Qué hace cada camión hoy, en qué orden, y por dónde anda ahora.**
- **Qué pidieron las obras, el depósito o compras que todavía no tiene camión, y qué es lo más urgente.**
- **¿Le llegó al capataz y al chofer? ¿Vieron el último cambio?**

Lo maneja **el coordinador de la operación** (hoy, Juan Agustín, que también arma el tablero; ver Pendiente 14 en §19). En este documento "Juan Agustín" y "el coordinador" son la misma persona.

**Reglas de velocidad** (si no se cumplen, el coordinador vuelve al WhatsApp suelto):
- Armar un día típico de 5 cuadrillas, partiendo de "Empezar como hoy": **menos de 5 minutos**, envío incluido.
- Un cambio por ausencia sobre una hoja ya enviada (sacar a uno, poner a otro y avisarle al capataz): **menos de 30 segundos**.
- **Cargar un pedido que entra por teléfono** (qué, dónde, para cuándo): **menos de 20 segundos**, con el teléfono todavía en la oreja.
- **Despachar un pedido urgente**: desde que se corta el llamado hasta el WhatsApp del chofer abierto con el viaje escrito, **menos de 30 segundos**.
- **Saber por dónde anda cada camión** mirando la vista Camiones, sin llamar a nadie: **menos de 5 segundos**.
- El capataz abre el link y sabe **dónde va, a qué hora y con quién en menos de 10 segundos**, sin hacer scroll. "Recibido" es **un toque**.
- El chofer ve **su próximo viaje sin scroll** y lo cierra con **un toque ("Hecho")**, sin escribir nada.

---

## 1. Nombre, palabras y estructura

**Hoja del día.** Es la palabra que ya se usa en obra para "el papel con lo que hay que hacer", es corta, y no choca con nada del sistema:

| Palabra | Por qué no |
|---|---|
| "Equipos del día" | En el Pañol **"equipo de cuadrilla"** son sogas, cabos de vida y roldanas ("Control del equipo de una cuadrilla"). El capataz vería "tu equipo" en dos lugares con dos sentidos. |
| "Armado del día" | **Armado** es un tipo de OT (`x_tipo`), con su flecha y su color azul. |
| "Salida" | El kiosco del Pañol ya tiene **"Salida con una cuadrilla"**, y pasa la misma mañana. Por eso el chofer tampoco tiene un botón "Salí". |
| "Asignación", "Parte", "Jornada", "Plan" | Ya tomadas por el tablero y los partes. Por eso un pedido no se "asigna" a un camión: se **pone** en un camión. |
| "Retiro" / "Retirar" | Es la acción principal del kiosco del Pañol ("Retirar") y un tipo de tarea del tablero. Los viajes dicen **"Trae"** (de una obra) y **"Busca la compra"** (de un proveedor). |
| "Despacho" (como módulo aparte) | Ver "Un módulo, dos vistas", abajo. La palabra queda libre para hablar ("el despacho de la mañana"), pero no es un botón ni una pantalla. |

"Hoja" hoy aparece sólo en los PDF ("hoja A4"), que nadie ve como módulo.

Palabras del módulo, siempre las mismas:
- **Hoja**: lo de una cuadrilla en un día. "La hoja de la Cuadrilla 3 del martes".
- **Quiénes van**: las personas de esa hoja. Nunca "equipo", nunca "dotación" en pantalla. La cantidad esperada se dice "**4 de 5 personas**".
- **A cargo**: el capataz del día. En el celular: "**A cargo: Ortega**". En el parte sigue siendo "puntero" (es el campo de Odoo).
- **Encuentro**: dónde y a qué hora se junta la gente ("7:00 en el depósito").
- **Lleva y trae** / **Todo el día** / **Sin chofer**: los tres modos del chofer de una cuadrilla.
- **Camión**: un vehículo con su chofer de ese día. Es la fila de la vista Camiones. Incluye la hidrogrúa y la S10 (en la oficina todo lo que sale a la calle a llevar algo es "el camión").
- **Viaje**: una parada del camión, con lo que hace ahí ("Lleva 6 tablones y 2 bases a Av. Cabildo 3260"). Ver §6.
- **Pedido**: algo que alguien necesita que haga un camión y **todavía no tiene camión**. Ver §7. (En Permisos existe "pedido a Segucom" y en el Pañol "pedido de reposición"; en esta pantalla "pedido" sólo es esto, y Comercial dice "orden de venta".)
- **Hecho** / **No pude**: lo que marca el chofer.
- **Lista de carga**: lo que el depósito tiene que cargar, en qué camión y a qué hora.
- **Flete de afuera**: un viaje que hace un tercero (el semi de Fernando).
- **Ausencia**: alguien que no está disponible, con motivo y fechas.
- **Enviada / Abierta / Recibida**: los estados de una hoja mandada.

### Un módulo, dos vistas

Decisión propuesta: **un solo módulo, Hoja del día, con dos vistas: "Cuadrillas" y "Camiones"**, y la cola de **Pedidos** al costado de "Camiones". No un módulo "Despacho" aparte. Por qué:
- **Es el mismo dato.** El "lleva" de las 7:00 de la Cuadrilla 2 es una casilla en la tarjeta de la cuadrilla **y** el primer viaje del camión de Kiska. Dos módulos serían dos lugares para el mismo viaje, o un módulo que escribe en el otro.
- **Los choques cruzan las dos vistas.** Desviar a Kiska a una compra puede dejar a la Cuadrilla 3 sin quien la busque; sacar a Borda de la Cuadrilla 1 la deja sin hidrogrúa. El aviso tiene que salir en la tarjeta de la cuadrilla y en la fila del camión.
- **Es la misma persona**, a dos horas distintas: a la tarde arma mañana (más en "Cuadrillas"); de 7 a 17 despacha (casi todo en "Camiones").
- **El chofer tiene un solo link** con todo su día.

### Navegación

```
Operaciones › Planificación
  [ Tablero ] [ Hoja del día ]                               ← pestañas de Planificación (como en la v1)
                 └ [ Cuadrillas ] [ Camiones ]  [Hoy · mar 13] [Mañana · mié 14] ‹ ›
                                     └ Pedidos (cola, a la izquierda, siempre abierta)
```

- Rutas: `/planificacion/hoja` (Cuadrillas) y `/planificacion/hoja/camiones` (Camiones), las dos con `?dia=`.
- **Abre en la vista y el día que corresponde a la hora**: de 6:00 a 15:00, **Hoy · Camiones**; después de las 15:00, **Mañana · Cuadrillas**. Siempre se puede cambiar, y recuerda la última elegida durante el día.
- En "Cuadrillas" la cola de pedidos no se ve, pero arriba hay un contador que lleva a ella: "**Pedidos: 2 sin camión**" (en rojo si alguno frena una obra).
- Desde el encabezado de cada día del tablero: "Hoja: 3 de 5 enviadas · 2 pedidos sin camión".

## 2. La unidad: la cuadrilla en un día (y el camión en un día)

- **Todo cuelga de (cuadrilla, fecha)**: `cuadrilla_odoo_id` + `YYYY-MM-DD`. **Nunca** del id de `x_aba_asignacion`, que se borra y se recrea cada vez que se mueve o se corre una obra.
- **Las obras de la hoja no se cargan: se leen del tablero**, en el orden del día (`x_orden_dia`). Si Juan Agustín mueve una obra en el tablero, la hoja cambia sola (ver §11, "cambios después de enviar").
- **La gente, el capataz, el chofer y el vehículo son de la cuadrilla-día y valen para todas sus obras.** Es lo que pasa en el 70% de los casos (una sola obra) y en casi todo el 30% restante, que son 2 a 4 obras chicas (¼ o ½ jornada) que la cuadrilla hace una detrás de otra.
- **Una persona va en una sola cuadrilla por día.** No hay "advertencia" para esto: si la ponés en otra, se mueve. La app pregunta "Ramírez está en la Cuadrilla 5. ¿Lo pasás a la 3?" → **"Pasarlo"**. Así nunca hay dos lugares a la vez para un operario.
- **El chofer en "Lleva y trae" es la excepción**: no es de la cuadrilla, puede llevar a varias (ver §4).
- **Los viajes cuelgan de (vehículo, fecha)**: cada vehículo tiene, cada día, un chofer y una lista ordenada de viajes (§6). Los viajes de una cuadrilla además apuntan a su hoja.

### Casos que no son "una cuadrilla, una obra"

| Caso | Cómo se resuelve |
|---|---|
| **Varias obras en el día** (Conte: Juramento, Cuba y Cabildo) | La hoja lista las obras en orden, con hora aproximada de cada una (se calcula por la fracción: arranca 8:00, ¼ ≈ 2 h 15). Van todos juntos. |
| **Alguien se separa** ("Benítez y Ríos van directo a Cabildo a las 13") | Fase 1: una **nota por persona** ("va directo a la 2.ª obra, 13:00") que se ve en el celular al lado del nombre. Si pasa seguido, fase 2: "Dividir" la gente por obra. |
| **Refuerzo de otra cuadrilla** ("REFUERZO DE CUADRILLA OBRA PEWMA") | Es poner a alguien en otra cuadrilla ese día. El plantel base no cambia. En la hoja se ve "Romero (de la Cuadrilla 4)" sólo en el escritorio. |
| **Cuadrilla sin obras ese día** ("CUADRILLA NO DISPONIBLE Y REPARTIDA EN 1 Y 2") | No tiene hoja. Su gente aparece en "Sin asignar" para repartirla. Si estaba en la precarga, sale con aviso "La Cuadrilla 5 no tiene obras el martes: Miño, Valenzuela y Aguirre quedaron sin asignar". |
| **Cuadrilla suspendida** (lluvia, `plan_suspensiones`) | La hoja muestra "Suspendida · lluvia" y no se manda. Si ya se había mandado, aparece "Avisar a Conte que se suspende". Sus viajes de lleva y trae quedan "Anulado · la cuadrilla se suspendió" y el camión aparece libre. |
| **Tercerizada** (`x_tercerizada`, ej. Quintana) | Tiene hoja con sus obras, instrucciones, chofer y vehículo de ABA si los usa. **No se carga su gente** (no está en Legajos). El "a cargo" puede ser una persona externa (`pan_personas_externas`) con celular, y se le manda el link igual. |

## 3. El capataz se elige cada día

Decisión del dueño (10/10): **el planificador decide el capataz de cada cuadrilla todos los días.** La app sugiere, nunca decide.

- **Quién puede estar a cargo**: una marca nueva **"Puede estar a cargo"** en Legajos (`personal.puede_estar_a_cargo`). Arranca con Conte, Miño, Ortega, Hepper, Sack y Pérez (los punteros reales de las últimas 4 semanas). Es independiente del puesto: Ortega figura como chofer y actúa de capataz.
- **El capataz es uno de los que van** (cuenta como 1 de las 5 personas). Se marca tocando su nombre → **"Poner a cargo"**. En la tarjeta va primero, con "a cargo" escrito al lado.
- **Sugerencia, en este orden** (se muestra en gris con el porqué y un botón **"Usar"**):
  1. **El que tuvo esta obra ayer**: "Ortega (ayer en Rivadavia 6150)". En una obra de varios días importa más que siga el mismo capataz que la misma cuadrilla.
  2. **El que tuvo esta cuadrilla el último día**: "Sack (la tuvo el lunes)".
  3. **El responsable de Configuración de cuadrillas.**
  - Si el sugerido está ausente o ya a cargo de otra cuadrilla, se salta al siguiente y se dice: "Miño (Hepper está a cargo de la 4)".
- **"Empezar como hoy" copia también el capataz** (ver §8). La hoja es un borrador hasta que se manda: **mandarla es la decisión**. Antes de enviar, la lista de envío muestra a quién le llega cada hoja, que es el capataz que quedó.
- **Sin capataz**: la tarjeta dice "**Sin nadie a cargo**" y figura en "Falta para mandar". Se puede mandar igual eligiendo **quién recibe la hoja** (cualquiera de los que van con celular cargado). Advierte, no bloquea.

## 4. Chofer y vehículo de la cuadrilla: tres modos

Decisión del dueño (10/10): **depende del día.** Cada hoja tiene un selector de tres opciones, siempre visible:

**[ Sin chofer ] [ Lleva y trae ] [ Todo el día ]**

| Modo | Qué significa | Qué se carga | Cuenta en "quiénes van" |
|---|---|---|---|
| **Sin chofer** | Van por su cuenta a la obra. | Nada más. El encuentro pasa a "8:00 en la obra". | — |
| **Lleva y trae** | Un chofer los lleva (y/o material), se va a hacer otros viajes y vuelve a buscarlos. No es de la cuadrilla. | Chofer, vehículo, **hora de "lleva"** y **hora de "busca"** (aproximadas). Se puede sacar "busca" ("vuelven por su cuenta"). | No |
| **Todo el día** | El chofer queda con la cuadrilla, la mueve entre obras y puede ayudar como operario. | Chofer y vehículo. | **Sí**: Nuñez + 4 = "5 de 5 personas". |

- **Por defecto** se propone el chofer y el vehículo del día anterior de esa cuadrilla; si no hay, el **chofer habitual del vehículo** (`vehiculos.chofer_habitual_id`): Kiska con el Iveco AF 669 ZL, Borda con el Agrale de la hidrogrúa AB 831 LC, Nuñez con el Iveco AB 799 CA.
- **La hidrogrúa** es un vehículo más (tipo "hidrogrúa"). Lo normal es Borda **todo el día** con una cuadrilla que la necesita. En el celular del capataz se lee "Borda queda todo el día con la hidrogrúa (Agrale AB 831 LC)".

### Lleva y trae: son viajes del camión

El proyecto abandonó las franjas (`planificacion_viajes` se dropeó sin uso). Se vuelve a algo mínimo: **viajes con una hora aproximada**, no franjas. Y **son los mismos viajes de la vista Camiones** (§6): no hay dos listas.

- Al elegir "Lleva y trae", la app arma sola los viajes de esa cuadrilla en la fila del camión elegido:
  - **Lleva** a la hora del encuentro, del depósito a la primera obra (hora **fija**: la gente está esperando).
  - **Busca** a la hora de fin de la última obra (17:00 por defecto, hora **fija**).
  - Si hay varias obras lejos entre sí, Juan Agustín puede sumar **"Mueve"** (de una obra a la otra, con hora). Lo normal es que las obras chicas del mismo día estén cerca y no haga falta.
- Cada viaje tiene una **carga** opcional: "lleva 20 tablones y 2 escaleras para Cabildo". Así entran los fletes que acompañan a la cuadrilla.
- **Lo que en la v1 era el renglón "Además" del chofer desaparece**: los viajes sueltos ("Busca 100 tablones en Galvanizados Sanz, 10 h") son viajes como cualquier otro desde la fase 1, y casi siempre nacen de un pedido (§7).
- Cambiar la hora de un "lleva" o un "busca" en la vista Camiones cambia la hoja de esa cuadrilla, y al revés. Si la hoja ya estaba enviada, queda "Cambiada después de enviar" con "Avisar a Ortega" (§11).
- **Todo el día** también se ve en la vista Camiones: la fila del camión de Borda dice "Todo el día con la Cuadrilla 1 · Av. del Libertador 5980". Se le pueden poner viajes **de esa misma cuadrilla** ("16:00 trae lo desarmado de San Juan 2840 al depósito") sin aviso; cualquier otro viaje lo saca de la cuadrilla y avisa (§9).

### Cómo se evita que un chofer o un vehículo esté en dos lugares

| Situación | Texto en la tarjeta | Botón |
|---|---|---|
| Un chofer **Todo el día** puesto en otra cuadrilla | "Borda está todo el día con la Cuadrilla 1" | "Pasarlo acá" / "Elegir otro" |
| Un vehículo **Todo el día** puesto en otra cuadrilla | "El AB 831 LC está todo el día con la Cuadrilla 1" | "Elegir otro" |
| Un chofer **Lleva y trae** con dos viajes a menos de 45 min | "Kiska lleva a la Cuadrilla 2 y a la 3 a las 7:00" | "Cambiar hora" |
| Un chofer **Todo el día** que además tiene viajes de Lleva y trae | "Nuñez está todo el día con la 5 y lleva a la 4 a las 7:00" | "Elegir otro" |
| Vehículo en taller o fuera de servicio (`vehiculos.estado`), o con un viaje de "Taller / VTV" a esa hora | "El AF 669 ZL está en la VTV de 14:00 a ~15:30" | "Elegir otro" |
| Vehículo con VTV, seguro o CNRT vencidos (`documentos`) | "El AH 410 LD tiene la VTV vencida desde el 02/10" | — (advierte, no bloquea) |
| Chofer ausente | "Kiska se retira a las 14 (trámite)" si es parcial; "Kiska no viene (vacaciones)" si es todo el día | "Elegir otro" |
| Un viaje del camión hace llegar tarde al "busca" | "Kiska llegaría ~16:50 a buscar a la Cuadrilla 3 (16:30)" | "Ver el camión" (abre la vista Camiones en esa fila) |

- **45 minutos** es un parámetro (el tiempo mínimo entre dos viajes de un mismo chofer cuando no hay duraciones). No se calculan distancias: es un aviso para que Juan Agustín mire, no un ruteo. En la vista Camiones el cruce se calcula con las duraciones típicas de §6.
- **Una ausencia parcial** ("se retira a las 14") se cruza con los viajes: si Kiska tiene un "busca" a las 17:00, sale "Kiska se retira a las 14 y busca a la Cuadrilla 2 a las 17:00".

## 5. Ausencias

Decisión del dueño (10/10): **las carga el planificador (o RRHH) con anticipación**; las del día se avisan por teléfono y el planificador las refleja. **El capataz no carga ausencias. No se deducen de fichadas.**

**Pero ya existe la asistencia diaria** (Odoo `x_parte_diario`): Juan Pablo Mansilla carga una fila por empleado por día, el mismo día o después, con presente / ausente / suspendido y el tipo (ART, personal, enfermedad, vacaciones, injustificada; suspensión por lluvia, descanso, sanción). La regla para no duplicar:

- **Mirando hacia adelante manda la Hoja del día** (ausencias previstas, en Supabase). **Mirando hacia atrás manda la asistencia** (Odoo, la de Juan Pablo, que es la que se usa para liquidar). Nadie carga lo mismo dos veces:
  - **Ausencia prevista** (Supabase `hd_ausencias`): persona, **desde**, **hasta** (o "sin fecha de alta"), tipo, nota, y si es **parcial** ("llega a las 10", "se retira a las 14").
  - **Los tipos son los mismos valores que `x_parte_diario`**, más "trámite" para las parciales. Así, en la fase 2, la asistencia del día se precarga con la ausencia prevista y Juan Pablo sólo confirma.
- **ART largas, desde la asistencia**: cada mañana la app lee la asistencia de los últimos 3 días hábiles. Si alguien figura con ART (o enfermedad) y **no tiene ausencia prevista**, aparece en la hoja **ya como no disponible**, con "según la asistencia":
  - "Medina · ART desde el 13/10 (según la asistencia)" → **"Cargar hasta cuándo"** / **"Ya tiene el alta"**.
  - De las 140 ausencias de 4 semanas, 94 son ART de 7 personas: con esto Juan Agustín no tiene que acordarse de ninguna.
- **Lo que hoy está en notas** ("AVILA - AUSENTE x MÉDICO", "CONTE SE RETIRA 11hs x RENOVACIÓN REGISTRO") pasa a ser una ausencia. Las notas del día del tablero siguen para todo lo demás.
- **Las ausencias de los choferes** pegan en sus viajes: "KISKA - SE RETIRA 14hs x RENOVACIÓN REGISTRO" hace que los viajes de Kiska después de las 14 salgan con aviso en la vista Camiones (§9).

### Dónde se cargan

- **En la hoja**: tocás el nombre → **"No viene…"** → motivo rápido (**Enfermedad · Personal · Vacaciones · ART · Trámite · Suspendido · Sin aviso**) → **"Sólo hoy"** (por defecto) o **"Hasta…"**. Sale de la cuadrilla en el mismo toque.
- **En la lista "Ausencias"** (un panel del mismo módulo): las vigentes y las próximas, de todo el personal, con **"Nueva ausencia"** (persona, desde, hasta, tipo). Ahí cargan las vacaciones con semanas de anticipación, Juan Agustín o RRHH.
- **Tabla de lo que pasa según cuándo se carga**:

| Cuándo | Qué pasa |
|---|---|
| Antes de armar la hoja | La persona aparece en "No disponibles" con el motivo y la fecha de vuelta, y no entra en la precarga. |
| Con la hoja armada, sin enviar | Sale de la cuadrilla, y la tarjeta dice "Falta 1 persona (4 de 5)" con la sugerencia de quién poner. |
| Con la hoja **enviada** | Lo mismo, y la hoja pasa a **"Cambiada después de enviar"** con **"Avisar a Ortega"** (ver §11). |
| El mismo día, a las 6:40 | Igual que la anterior, desde **Hoy**. Es el caso que tiene que salir en menos de 30 segundos. |
| Persona que es el capataz del día | "Ortega no viene: la Cuadrilla 3 quedó sin nadie a cargo" → sugerencia de quién poner a cargo entre los que van. |
| Persona que es chofer | Su camión queda "Sin chofer" en la vista Camiones, con sus viajes. Las cuadrillas que dependen de esos viajes quedan con "Sin chofer para llevarlos". "Elegir otro chofer" pasa todos los viajes de una vez. |

## 6. El viaje

**Un viaje es una parada del camión con lo que hace ahí.** Es la unidad de la vista Camiones, del link del chofer y de la lista de carga.

### Qué tiene un viaje

| Dato | Ejemplo | Cómo se carga |
|---|---|---|
| **Camión** (vehículo + chofer del día) | Iveco AB 497 YY · Gómez | Arrastrando a la fila, o "Poner en…" |
| **Tipo** | Lleva material | Se deduce del destino; se cambia con un chip |
| **Hacia** | Av. Cabildo 3260 (la OT) · Galvanizados Sanz (un lugar) · "Planta de VTV" | Buscador: obras del día primero, después lugares frecuentes, después texto |
| **Desde** | Juramento 2145 | **Por defecto, donde terminó el viaje anterior** (el primero sale del depósito). Se cambia sólo si hace falta. |
| **Qué lleva o trae** | "6 tablones y 2 bases (de lo desarmado)" | Texto corto. Si viene de un pedido, ya está escrito. |
| **Hora** | "10:45" fija · "~11:30" estimada | Ver abajo |
| **Pedidos** | El de Conte de las 10:20 | Uno o varios (los que van al mismo lugar en la misma vuelta) |
| **Prioridad** | Antes de las 13 | La del pedido más urgente que lleva |
| **Estado** | Planeado · Hecho 10:52 · No pude (no estaba listo) · Anulado | Lo marca el chofer o el coordinador |

### Tipos

| Tipo | Cómo lo lee el chofer | De dónde sale casi siempre | Duración típica (parámetro) |
|---|---|---|---|
| **Lleva cuadrilla** | "Lleva a la Cuadrilla 2 a Juramento 2145" | La hoja (§4) | 45 min |
| **Busca cuadrilla** | "Busca a la Cuadrilla 3 en Rivadavia 6150" | La hoja (§4) | 45 min |
| **Mueve cuadrilla** | "Mueve a la Cuadrilla 2 de Cuba 1980 a Cabildo 3260" | La hoja (§4) | 30 min |
| **Lleva material** (a obra) | "Lleva 6 tablones y 2 bases a Av. Cabildo 3260" | Pedido de obra, o armado que arranca | 1 h |
| **Trae material** (de obra) | "Trae lo desarmado de Juramento 2145 al depósito" | Desarme que termina, sobrante, pedido de obra | 1 h 30 |
| **Busca compra** (proveedor) | "Busca la compra en Galvanizados Sanz: 100 tablones" | Compras, cajón del tablero | 1 h |
| **Entre depósitos** | "Lleva 40 caños del depósito al depósito 2" | Depósito | 1 h |
| **Taller / VTV / trámite** | "VTV del AF 669 ZL · turno 14:00" | Vehículos, notas del día | 1 h 30 |
| **Otro** | Lo que diga el texto | — | 1 h |

- **"Pedido urgente de obra" no es un tipo**: es un "Lleva material" con la prioridad "Frena la obra". Lo que importa para despachar es qué hay que hacer y cuán urgente es, y esas son dos cosas distintas.
- **"Imprevisto" tampoco se carga**: un pedido es imprevisto si se cargó el mismo día para el mismo día. Lo calcula la app, y sirve para el reporte de §15 ("Cabildo pidió 3 veces fuera de plan").

### La hora: fija o estimada

- **Fija** cuando hay alguien esperando a esa hora: el lleva y el busca de una cuadrilla, un turno de VTV, un horario prometido al cliente. Se escribe "**10:45**".
- **Estimada** en todo lo demás: la app la calcula con el orden y las duraciones típicas ("**~11:30**"). Así el coordinador no escribe horas: **ordena**.
- Si una fija no se puede cumplir con lo que va antes, sale el aviso (§9).

### Varios pedidos, un viaje

- Dos pedidos al mismo lugar en la misma vuelta van en **un viaje** (soltar un pedido sobre un viaje que va al mismo destino lo suma: "Cabildo 3260 · 6 tablones y 2 bases + 1 escalera").
- Un viaje "Hecho" deja **Hechos** todos sus pedidos.

### Fletes de afuera

- Abajo de los camiones hay una fila **"Fletes de afuera"**: viajes que hace un tercero ("Semi de Fernando · Mekano al depósito · 8:00"). Se cargan igual, con el nombre del flete en vez del chofer, y no tienen link.
- Sirven para que la cola no muestre como "sin camión" algo que ya está resuelto y para que el parte tenga el flete tercerizado (§13).

## 7. Pedidos

**Un pedido es algo que tiene que hacer un camión y que todavía no tiene camión.** Cuando se pone en un camión, se vuelve (o se suma a) un viaje.

### De dónde entran

| Desde | Cómo | Quién lo carga | Fase |
|---|---|---|---|
| **Un capataz que llama o escribe** ("en Cabildo faltan 6 tablones y 2 bases") | **"Nuevo pedido"** en la vista Camiones (tecla **N**) | El coordinador | 1 |
| **El link del capataz**: "Pedir material o un viaje" | Un formulario de tres campos en el celular | El capataz; el coordinador lo revisa | 2 (Pendiente 15) |
| **El cajón del tablero** ("RETIRAR 100 TABLONES EN GALVANIZADOS SANZ") | Menú del pendiente → **"Pasar a pedido"**. El pendiente queda tildado con "→ pedido" | Quien planifica | 1 |
| **El tablero de mañana** (armados que arrancan, desarmes que terminan) | **Sugeridos**, solos (ver abajo) | La app propone, el coordinador acepta | 1 |
| **Compras** (no hay módulo de compras: nadie usa `purchase.order` desde el código) | "Nuevo pedido" a un **lugar** de tipo proveedor, con qué buscar | Quien compró (oficina) o el coordinador | 1 |
| **El depósito** ("llevar 40 caños al depósito 2", "devolver el alquilado") | "Nuevo pedido" | El encargado del depósito (con permiso, §14) | 1 |
| **Vehículos** (VTV, service, taller) | "Nuevo pedido" de tipo Taller / VTV; fase 2, solo desde los mantenimientos programados | El coordinador | 1 manual, 2 solo |
| **Tareas del tablero** de tipo traslado o retiro | Sugeridos | La app propone | 2 |

### Lo mínimo para cargarlo (menos de 20 segundos)

Tres campos, con el teclado y sin mouse:

```
Nuevo pedido
Qué        [6 tablones y 2 bases                         ]
Dónde      [cab▏]  → Av. Cabildo 3260 · Cuadrilla 2 (Conte) · hoy 13:00
Para cuándo  [Frena la obra] [Antes de las __] [Hoy] [Mañana] [Cuando se pueda]
             Antes de las [13:00]
Pidió Conte (a cargo de la Cuadrilla 2)            ⋯ Más (trae / necesita hidrogrúa / nota)
                                                   [Guardar]  [Guardar y poner en un camión]
```

- **Qué**: texto libre. No se elige del catálogo (el catálogo de piezas está atado a la tabla vieja de obras; ver §13).
- **Dónde**: el buscador muestra primero **las obras del día** con su cuadrilla, después **los lugares frecuentes** (depósitos, proveedores, taller, planta de VTV), y si no está, se escribe la dirección.
- **Para cuándo**: un chip. Lo normal es **"Hoy"**.
- **Se deduce solo**:
  - el **tipo**: a una obra → "Lleva material" (con "**Es para traer**" para invertirlo); a un proveedor → "Busca compra"; a un taller → "Taller / VTV"; a un depósito → "Entre depósitos";
  - **quién pidió**: el que está a cargo de esa obra hoy según la hoja ("Pidió Conte"). Se cambia con un toque;
  - el **día**: hoy hasta las 15:00, mañana después (se cambia con el chip).
- **Opcional** (en "Más"): **"Necesita hidrogrúa"** o **"Necesita camión"** (no entra en la S10), **"Le prometimos al cliente"**, nota.
- **"Guardar y poner en un camión"** (Enter dos veces) deja el pedido elegido en la cola y resalta los camiones sugeridos (§9).

### Para cuándo y prioridad

La app **ordena** la cola; **el coordinador decide**. Nada de ruteo automático.

1. **Frena la obra** (la cuadrilla está parada o va a estarlo): arriba de todo, en rojo, con el tiempo que lleva esperando: "**Frena la obra · hace 12 min**".
2. **Antes de las 11** (hora límite): por la hora más cercana. Gris mientras falte más de 1 hora; ámbar en la última hora; rojo si ya no llega ningún camión según las estimaciones ("Antes de las 11 · ningún camión llega a tiempo").
3. **Le prometimos al cliente**: después de los que tienen hora.
4. **Hoy**.
5. **Cuando se pueda** (esta semana): plegados al fondo.
- Dentro del mismo grupo, el más viejo primero.
- **El orden a mano gana**: arrastrar un pedido dentro de la cola lo deja ahí con "orden a mano". Si el coordinador sabe algo que la app no sabe, manda él.

**Cómo ayuda la app sin decidir**, en cada pedido de la cola:
- **Cerca**: el camión que está o va a estar más cerca del destino, en línea recta (las obras ya tienen coordenadas en Odoo, `x_obra_lat` / `x_obra_lng`; los lugares se geocodifican igual): "**Cerca: Gómez en Juramento 2145 (1 km)**".
- **Libre**: el primer camión que queda libre: "**Libre: Kiska, vuelve al depósito ~10:45**".
- **Lo que no sirve**: "Borda está todo el día con la 1 (hidrogrúa)"; "la S10 no tiene chofer hoy".
- Nunca pone un pedido en un camión sola.

### Estados de un pedido y de quién es la pelota

La cola se agrupa como el resto del proyecto, por **de quién es la pelota**:

| Grupo | Estado | Texto en la cola | Botón |
|---|---|---|---|
| **Para hacer vos** | Sin camión | "6 tablones y 2 bases → Av. Cabildo 3260 · pidió Conte · antes de las 13" | "Poner en un camión" |
| | No se pudo (vuelve solo a la cola) | "Kiska no pudo en Galvanizados Sanz: no estaba listo (10:12)" en rojo | "Poner en un camión" / "Esperar…" |
| | En un camión, sin avisar | "En el AB 497 YY · Gómez todavía no sabe" | "Avisar a Gómez" |
| | Sugerido (mañana) | "Arranca el armado de Gurruchaga 1650 (Cuadrilla 4): llevar el material" | "Aceptar" / "No hace falta" |
| **Esperando a otro** | Esperando | "Busca compra en Galvanizados Sanz · **lo tienen a las 15**" | "Ya está" |
| | Avisado y no visto (más de 10 min) | "Gómez no abrió el viaje nuevo (10:23)" | "Llamar a Gómez" |
| **En camino** | En un camión | "Lo lleva Gómez · ~10:45 · avisado 10:23 · visto 10:24" (plegado) | — |
| **Hechos hoy** | Hecho | "Entregado 10:52 · Gómez" (plegado) | — |

- **"Esperar…"** pide un motivo corto (chips: **"No está listo"**, **"Falta en el depósito"**, **"Espera al cliente"**, **"Otro"**) y, si hay, desde qué hora. Vuelve a "Para hacer vos" solo a esa hora.
- **"Ya no hace falta"** (menú ⋯) lo anula con motivo. Nada se borra.
- **"Pasar a mañana"** (menú ⋯) le cambia el día y lo deja primero de mañana con "**viene de ayer**".
- Un pedido de **hoy** sin camión a las **15:00** pasa a la línea "Falta para mandar" de mañana como "**Quedó sin hacer hoy**" con "Pasar a mañana".

### Sugeridos de la noche anterior

Para mañana, la app propone pedidos a partir del tablero (en los partes, 131 de 134 jornadas tuvieron flete: casi toda obra mueve material):
- **Primer día de un armado** → "Llevar el material a Gurruchaga 1650 (arranca el armado)". 
- **Último día de un desarme** → "Traer lo desarmado de Juramento 2145 al depósito".
- Si la cuadrilla de esa obra va **Todo el día** con un camión, el sugerido ya se propone en ese camión ("Nuñez trae lo de San Juan 2840 al terminar").
- **"Aceptar"** lo pasa a la cola como cualquier pedido; **"No hace falta"** lo descarta y no vuelve a aparecer para esa obra y ese día.
- El qué lleva queda "**material del cómputo**" hasta que el depósito lo complete. No se calcula de ningún lado en la fase 1.

## 8. Escritorio: vista Cuadrillas

Ruta: **`/planificacion/hoja`**. Es la vista para armar mañana. Desde el encabezado de cada día del tablero se llega con un clic ("Hoja: 3 de 5 enviadas").

### Lo que se ve

```
┌ Hoja del día  [Cuadrillas][Camiones]  [Hoy · lun 12] [Mañana · mar 13] ‹ ›   3 de 5 listas · 0 enviadas · Pedidos: 2 sin camión   [Enviar a los capataces] ┐
│ Falta para mandar: Cuadrilla 5 sin nadie a cargo · Cuadrilla 4: 4 de 5 personas · Kiska lleva a la 2 y la 3 a las 7:00 · 3 sugeridos sin revisar         │
├──────────────────────────────────────────────────────────────────────────────┬────────────────────────────┤
│ ● Cuadrilla 1 · Borrador                          ● Cuadrilla 2 · Borrador   │ Gente                       │
│  1  Av. del Libertador 5980  ↑ 1 j   8:00          1  Juramento 2145  ↓ ¼ j   │ [Buscar…]                   │
│  Quiénes van · 5 de 5                               2  Cuba 1980   ○ ¼ j      │ Sin asignar (2)             │
│  Sack a cargo · Arrieta · Godoy · Sosa · Borda      3  Av. Cabildo 3260 ↑ ½ j │   Ramírez · Paz             │
│  [Sin chofer][Lleva y trae][Todo el día]            Quiénes van · 5 de 5      │ No disponibles (3)          │
│  Borda · Agrale hidrogrúa AB 831 LC                 Conte a cargo · …         │   Medina · ART (según asist.)│
│  Encuentro 7:00 en el depósito                      Kiska lleva 7:00 · busca …│   Ávila · enfermedad · hoy  │
│  + Instrucciones                                    + Instrucciones           │ Choferes                    │
│                                                                               │   Kiska · 6 viajes          │
│ ● Cuadrilla 3 …        ● Cuadrilla 4 …         ● Cuadrilla 5 …               │ Vehículos                   │
│                                                                               │   AB 497 YY · 2 viajes      │
└──────────────────────────────────────────────────────────────────────────────┴────────────────────────────┘
```

- **Arriba**: el día (por la tarde abre en "Mañana", antes del mediodía en "Hoy"; el sábado, "Mañana" es el lunes), el resumen "3 de 5 listas · 0 enviadas", el contador de pedidos y **el único botón coral: "Enviar a los capataces"** (después de enviar pasa a **"Avisar cambios (1)"** si hay cambios, o desaparece). La lista de envío incluye a los choferes (§11).
- **"Falta para mandar"**: una línea con todo lo que impide decir "listo", cada cosa clickeable (lleva a la tarjeta o a la vista Camiones). Si no falta nada: "Todo listo para mandar". Es la bandeja del día (ver abajo).
- **Una tarjeta por cuadrilla con obras**, en el orden y el color del tablero. Cada tarjeta, de arriba abajo:
  1. **Encabezado**: "Cuadrilla 3" y el estado en texto ("Borrador", "Enviada 18:42", "Abierta 20:15", "Recibida 20:16", "Cambiada después de enviar").
  2. **Obras del tablero**, sólo lectura: número de orden, dirección corta (`direccionCorta()`), flecha y color del tipo, fracción y hora de inicio estimada. Un clic abre la ficha de la OT de siempre. Si una obra tiene pedidos o viajes de material ese día, una línea gris abajo: "Material: lo lleva Gómez 8:00".
  3. **Quiénes van**: nombres con `nombrePropio()`; el que está a cargo primero con "a cargo"; el chofer de "Todo el día" al final con "chofer". A la derecha, "5 de 5" (la dotación prevista es el máximo `x_personal_por_jornada` de sus obras). "+ Agregar".
  4. **Chofer**: el selector de tres modos y, según el modo, chofer, vehículo y horas.
  5. **Encuentro**: "7:00 en el depósito" (con chofer) o "8:00 en la obra" (sin chofer). Se cambia con un clic.
  6. **"+ Instrucciones"** (ver §10). Si hay, se ve el primer renglón.
  7. **El problema de la tarjeta, en una línea de texto** (si hay). Una señal por idea: nada de íconos sueltos.
- **Panel "Gente"** a la derecha, siempre abierto en escritorio:
  - **Sin asignar**: los que pueden ir y no están en ninguna hoja. Primero los que pueden estar a cargo.
  - **No disponibles**: ausentes con motivo y vuelta ("Medina · ART · sin fecha de alta").
  - **Ya asignados**: atenuados, con la cuadrilla ("Conte · 2").
  - **Choferes**: con lo que tienen ("Kiska · 6 viajes", "Borda · todo el día con la 1", "Nuñez · libre"). Un clic lleva a su fila en Camiones.
  - **Vehículos**: patente en JetBrains Mono, tipo y estado ("AB 831 LC · hidrogrúa · con la 1", "AB 497 YY · camión · 2 viajes", "AH 410 LD · VTV vencida").

### Cómo se asigna (pocos toques)

- **Arrastrar** un nombre del panel a una tarjeta. Soltarlo sobre otro nombre lo **reemplaza** (el reemplazado vuelve a "Sin asignar").
- **Teclado**: en "+ Agregar" se escribe "ram" → Enter. En el panel, con un nombre seleccionado, las teclas **1–5** lo mandan a esa cuadrilla.
- **Tocar un nombre** en una tarjeta abre su menú: **"Poner a cargo"** · **"Pasar a…"** · **"No viene…"** · **"Nota"** ("va directo a la 2.ª obra") · **"Sacar"**.
- **Todo cambio tiene "Deshacer"** en el aviso, con nombre: "Ramírez pasó a la Cuadrilla 3 · Deshacer".
- **Dos personas armando a la vez** (Juan Agustín y Ezequiel): se ve en vivo, como el tablero (Realtime).

### La precarga: no empezar nunca de cero

Si el día está vacío, en lugar de las tarjetas vacías aparece:

> **El martes 13 todavía no tiene hojas.**
> **"Empezar como hoy"** · "Empezar con el plantel base" · "Empezar vacío"

- **"Empezar como hoy"** (el recomendado; "hoy" = el último día hábil con hojas): copia a cada cuadrilla su gente, quién estuvo a cargo, el modo de chofer, el chofer, el vehículo y el encuentro, y arma sus viajes de lleva y trae. Las instrucciones **no** se copian (son de cada obra y cada día), ni los viajes sueltos (son de ese día).
  - Si una obra sigue de ayer pero cambió de cuadrilla en el tablero, la gente **sigue a la obra**, no a la cuadrilla (continuidad en obra).
  - Saca a los ausentes y lo dice: "Ávila no entra: vacaciones hasta el 16/10. La Cuadrilla 3 quedó con 4 de 5."
  - Saca a los de cuadrillas que mañana no tienen obras y los deja en "Sin asignar".
- **"Empezar con el plantel base"**: usa el responsable y el plantel de Configuración de cuadrillas. Sirve un lunes después de vacaciones; hoy el plantel está desactualizado (falta la Cuadrilla 5), así que no es el recomendado.
- Se puede **"Copiar como hoy"** una sola tarjeta desde su menú ⋯.

### La bandeja del día: "¿qué falta para mandar mañana?"

La línea "Falta para mandar" se despliega en una lista agrupada por **de quién es la pelota**:

| Grupo | Situación | Texto | Botón |
|---|---|---|---|
| **Para hacer vos** | Sin nadie a cargo | "Cuadrilla 5 · sin nadie a cargo · Sugerido: Miño (la tuvo el 09/10)" | "Usar" |
| | Menos gente que la prevista | "Cuadrilla 4 · 4 de 5 personas" | "Agregar" |
| | Ausente puesto en una hoja | "Ávila está en la Cuadrilla 3 y no viene (enfermedad)" | "Sacarlo" |
| | Chofer o vehículo en dos lugares | "Kiska lleva a la 2 y a la 3 a las 7:00" | "Cambiar hora" |
| | Lleva y trae sin chofer elegido | "Cuadrilla 2 · falta el chofer" | "Elegir" |
| | El que recibe la hoja no tiene celular | "Miño no tiene celular cargado" | "Cargar celular" |
| | Sugeridos sin revisar | "3 pedidos sugeridos para mañana" | "Ver" (abre Camiones) |
| | Pedidos de mañana sin camión | "Galvanizados Sanz · viene de hoy · sin camión" | "Ver" |
| | Hojas sin enviar | "2 hojas sin enviar" | "Enviar" |
| | Hoja cambiada después de enviar | "Cuadrilla 3 cambió después de enviar: no va Ávila, va Ramírez" | "Avisar a Ortega" |
| **Esperando al capataz o al chofer** | Enviada y no abierta | "Hepper no la abrió · enviada 18:45" | "Reenviar" / "Llamar" |
| | Cambio enviado y no visto | "Ortega no vio el cambio de las 6:43" | "Llamar" |
| **Listas** | Recibida | "Conte · recibida 20:16" (plegado) | — |

- **Más gente que la prevista** no es problema: se muestra "6 de 5" en gris, sin color.
- **Cuándo se pone en rojo** (parámetros): sin enviar a las **19:00** del día anterior; enviada y no abierta a las **6:30** del día. Antes de eso, el texto va en gris.
- Esto también entra a la campanita (`crearAlertas`) de quien tenga "editar" en Hoja del día, sólo los rojos.

## 9. Escritorio: vista Camiones (el despacho en vivo)

Ruta: **`/planificacion/hoja/camiones`**. Es la pantalla del coordinador de 7 a 17. También se usa la tarde anterior para ordenar los viajes de mañana.

### Lo que se ve (martes 13, 10:24)

```
┌ Hoja del día  [Cuadrillas][Camiones]  [Hoy · mar 13] [Mañana · mié 14]   10:24   Lista de carga   [Nuevo pedido] ┐
│ Ahora: 1 pedido frena una obra · 1 viaje sin avisar · Kiska no pudo en Galvanizados Sanz                             │
├───────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────┤
│ Pedidos                    3  │            7     8     9     10  ┃  11    12    13    14    15    16    17            │
│ Para hacer vos (2)            │ Kiska · Iveco AF 669 ZL                     Libre · vuelve al depósito ~10:45      │
│ ┌ Antes de las 13 · hace 4 min│  [✓ Lleva C2 Juramento][✓ Lleva C3 Rivadavia][✗ Sanz]┃      [VTV 14:00–~15:30][Busca C3 16:30][Busca C2 17:00]│
│ │ 6 tablones y 2 bases        │ Gómez · Iveco AB 497 YY                     Ahora: cargando en Juramento 2145     │
│ │ → Av. Cabildo 3260          │  [✓ Lleva Gurruchaga 8:00]   [Trae Juramento ~10:15]┃          [Trae Rivadavia 15:00]  │
│ │ pidió Conte (Cuadrilla 2)   │ Borda · Agrale hidrogrúa AB 831 LC                                                │
│ │ Cerca: Gómez en Juramento   │  [════════ Todo el día con la Cuadrilla 1 · Av. del Libertador 5980 ════════]     │
│ │   2145 (1 km)               │ Nuñez · Iveco AB 799 CA                                                           │
│ │ Libre: Kiska ~10:45         │  [════ Todo el día con la Cuadrilla 5 · San Juan 2840 ════][Trae al depósito 16:00]│
│ │ [Poner en un camión]        │ Sin usar: AH 410 LD (VTV vencida) · S10 (sin chofer) · moto · autoelevadores        │
│ └                             │ Fletes de afuera                                                                  │
│ Kiska no pudo: Sanz (10:12)   │  —                                                                                │
│ Esperando a otro (0)          │                                                                                   │
│ En camino (2) · Hechos (3)    │                                                                                   │
└───────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Arriba**: el día, la hora, **"Lista de carga"** y el único coral: **"Nuevo pedido"** (tecla **N**). Abajo, la línea **"Ahora:"** con lo que pide atención, cada cosa clickeable (es la bandeja del despacho; ver "Avisos").
- **A la izquierda, la cola de Pedidos** (§7), siempre abierta.
- **A la derecha, una fila por camión** (vehículo con su chofer de ese día), en este orden: los que tienen viajes, los de "Todo el día", y al final "Sin usar" en una sola línea.
  - **Encabezado de la fila**: "Kiska · Iveco AF 669 ZL" (patente en JetBrains Mono) y, a la derecha, **dónde anda** en palabras (ver abajo).
  - **Los viajes como fichas sobre una línea de tiempo aproximada** de 7 a 18. Cada ficha dice tipo corto y destino ("Lleva C2 Juramento", "Sanz", "VTV"). El ancho es la duración típica, no la real.
    - **Hecho**: gris con ✓ y la hora real ("✓ 7:35").
    - **El que está haciendo ahora** (el primero sin hacer): borde marcado.
    - **No pude**: tachado con el motivo.
    - **Hora fija**: con la hora escrita; **estimada**: con "~".
    - **Sin avisar**: punteado, con "sin avisar".
  - **La línea de "ahora"** cruza todas las filas, en coral (coral = hoy).
- **En pantallas angostas** (o con la tecla **L**), la línea de tiempo pasa a **lista ordenada** por camión: "1 · ✓ 7:35 Lleva a la C2 a Juramento 2145 · 2 · ✓ 8:25 … · 3 · ~10:45 …". Es la misma información; la línea de tiempo sirve para ver huecos, la lista para leer.
- **"Fletes de afuera"** es la última fila (§6).

### Dónde anda cada camión, sin GPS

Se deduce de los viajes y de los "Hecho" del chofer, y se dice en palabras en el encabezado de la fila:

| Situación | Texto |
|---|---|
| Antes del primer viaje | "En el depósito · sale 7:00" |
| Hizo uno y tiene el siguiente | "Hizo Juramento 2145 (7:35) · ahora hacia Rivadavia 6150 (~8:15)" |
| Pasó la hora estimada del que está haciendo y no marcó nada (más de 1 hora, parámetro) | "**Sin noticias desde las 9:40** · tenía Sanz a las 10:00" en ámbar |
| Marcó "No pude" | "No pudo en Galvanizados Sanz (no estaba listo) · vuelve al depósito" |
| Sin más viajes | "**Libre** desde las 10:12 · en el depósito ~10:45" |
| Todo el día | "Con la Cuadrilla 1 en Av. del Libertador 5980" |
| En taller o VTV | "En la VTV hasta ~15:30" |
| Terminó | "Terminó 17:20 · 6 viajes" |

- No se toca `vehiculos.estado` (`en_ruta`): ese campo es para "en taller" y "fuera de servicio", que carga Vehículos.
- El coordinador puede **marcar "Hecho" por el chofer** (cuando lo llamó y le dijo que ya está): el viaje queda "Hecho 9:55 · marcado por Juan Agustín".

### Cómo se despacha

1. **Entra el llamado**: N → qué, dónde, para cuándo (§7) → **"Guardar y poner en un camión"**.
2. **La app resalta los camiones que sirven**, con el porqué en la fila: "**Cerca**: en Juramento 2145, a 1 km", "**Libre** ~10:45", y atenúa los que no ("Todo el día con la 1"). Las teclas **1–4** eligen el sugerido de ese número.
3. **Se suelta el pedido en la fila**, en el lugar del orden donde va (entre dos fichas, o al final). Sobre una ficha que va al mismo destino, se suma a ese viaje.
4. **La app recalcula las horas estimadas** de lo que viene después y muestra los choques que aparecen (ver "Avisos").
5. **Aviso con nombre**: "Pedido de Conte en el AB 497 YY (Gómez), ~10:45 · **Avisar a Gómez** · Deshacer".
6. **"Avisar a Gómez"** abre WhatsApp con el viaje escrito (§11). Gómez aprieta el link y ve "Nuevo viaje" arriba de todo (§12).
   - Si el pedido lo hizo un capataz, en el menú del aviso está **"Avisar a Conte"**: "Conte, los 6 tablones y 2 bases para Cabildo los lleva Gómez, ~10:45." (opcional; el capataz también lo ve en su link).
   - Si hay que cargar algo en el depósito, **"Avisar al depósito"** (§13).

**Lo que se mide**: del corte del llamado al WhatsApp de Gómez abierto, **menos de 30 segundos** (cargar 15 s, poner 3 s, avisar 2 s y apretar Enviar en WhatsApp).

### Reordenar, mover, sacar

- **Arrastrar una ficha dentro de la fila** cambia el orden; las estimadas se recalculan; las fijas no se mueven (si dejan de cerrar, aviso).
- **Arrastrar una ficha a otra fila** la pasa a otro camión. Si ya estaba avisado, el chofer anterior queda con "**Sacaste un viaje a Kiska**" → "Avisar a Kiska".
- **Menú de la ficha**: **"Marcar hecho"** · **"Pasar a otro camión"** · **"Volver a la cola"** · **"Cambiar hora"** · **"Fijar hora"** · **"Anular"** (con motivo). Un clic en la ficha abre la hoja del viaje con todo (§6) y su historial.
- **"Correr horas"** en el encabezado de la fila: corre todas las estimadas desde ahora (cuando el camión viene atrasado).
- **Todo cambio tiene "Deshacer"**.

### Avisos

Advierten, no bloquean. Salen en la fila del camión, en el pedido y en la línea "Ahora:".

| Situación | Texto | Botón |
|---|---|---|
| Viajes que no entran en el tiempo (con las duraciones típicas) | "Kiska: Sanz termina ~11:00 y Gurruchaga es a las 10:45" | "Correr horas" / "Cambiar orden" |
| Llega tarde a algo con hora fija | "Kiska llegaría ~16:50 a buscar a la Cuadrilla 3 (16:30)" | "Pasar el viaje a otro" / "Avisar a Ortega" |
| **Una cuadrilla queda sin que la busquen** (se sacó o se pasó el "busca") | "Nadie busca a la Cuadrilla 3 en Rivadavia 6150" | "Elegir chofer" / "Vuelven por su cuenta" (avisa a Ortega) |
| Una cuadrilla queda sin que la lleven | "Nadie lleva a la Cuadrilla 2 a Juramento 2145 a las 7:00" | "Elegir chofer" |
| **Pedido en un camión que no sirve** | "El pedido necesita hidrogrúa y el AB 497 YY es camión" | "Elegir otro" |
| **Sacar a un chofer de Todo el día** | "Borda está todo el día con la Cuadrilla 1. Si lo sacás, la 1 se queda sin hidrogrúa de 11 a 12:30" | "Sacarlo un rato y avisar a Sack" / "Elegir otro" |
| **Vehículo en taller o VTV** a esa hora | "El AF 669 ZL está en la VTV de 14:00 a ~15:30" | "Ponerlo después" / "Elegir otro" |
| Vehículo con VTV, seguro o CNRT vencidos | "El AH 410 LD tiene la VTV vencida desde el 02/10" | — |
| Chofer con ausencia parcial | "Kiska se retira a las 14 y tiene 2 viajes después" | "Pasarlos a otro" |
| Hora límite en riesgo | "Lo necesitan antes de las 13 y llega ~13:20" | "Ponerlo antes" / "Avisar a Conte" |
| **Pedido que frena una obra sin camión** | "Frena la obra: Cabildo 3260 espera 6 tablones hace 12 min" (rojo) | "Poner en un camión" |
| **Nadie libre** para un pedido con hora | "Nadie libre a las 15: Kiska en la VTV hasta ~15:30, Gómez en Rivadavia 6150" | "Ponerlo igual…" / "Pasar a mañana" / "Flete de afuera" |
| Lugar cerrado a esa hora (horario del lugar) | "Galvanizados Sanz atiende hasta las 16 y Kiska llega ~16:20" | "Ponerlo antes" |
| Viaje sin avisar (más de 2 min) | "Gómez no sabe del viaje a Cabildo" | "Avisar a Gómez" |
| Aviso no visto (más de 10 min) | "Gómez no abrió el viaje nuevo (10:23)" | "Llamar a Gómez" |
| Sin noticias | "Kiska: sin noticias desde las 9:40 (tenía Sanz a las 10:00)" | "Llamar a Kiska" / "Marcar hecho" |
| **El chofer marcó "No pude"** | "Kiska no pudo en Galvanizados Sanz: no estaba listo (10:12)" (rojo) | "Volver a la cola" / "Esperar…" / "Llamar a Kiska" |

- Los rojos van también a la campanita del coordinador. El "No pude" además sale en `#logistica-operativa` (fase 2; en la fase 1 se ve en vivo en la pantalla).

### La tarde anterior en Camiones

- "Mañana" muestra los lleva y busca de las hojas, los **sugeridos** (§7), los pedidos de mañana y los que **vienen de hoy**.
- El coordinador los acepta y los ordena igual que en vivo. Los viajes que estén en la fila a la hora de enviar van en el mensaje de cada chofer (§11).
- "Falta para mandar" (§8) incluye "sugeridos sin revisar" y "pedidos de mañana sin camión".

### Lista de carga

**"Lista de carga"** abre una hoja lateral con lo que el depósito tiene que cargar, por hora de salida del depósito:

```
Lista de carga · martes 13
7:00  AF 669 ZL · Kiska   20 tablones, 2 escaleras → Cabildo 3260 (va con la Cuadrilla 2)
7:30  AB 497 YY · Gómez   Material del armado de Gurruchaga 1650 (según cómputo)
11:00 AF 669 ZL · Kiska   1 escalera, 10 caños de 3 m → Gurruchaga 1650 · nuevo 11:06
Para recibir:
~11:15 AB 497 YY · Gómez  Lo desarmado de Juramento 2145
~16:30 AB 799 CA · Nuñez  Lo desarmado de San Juan 2840
```

- Sólo los viajes que **salen del depósito con carga** y los que **vuelven al depósito con carga**.
- **"Copiar para WhatsApp"** e **"Imprimir"**. En vivo, lo nuevo aparece marcado "nuevo 11:06".
- Fase 2: la misma lista en la tablet del pañol, como pantalla "**Para cargar**", que se actualiza sola.

## 10. Qué hay que hacer: tipo de trabajo e instrucciones

**"Tipo de trabajo" no se vuelve a cargar.** Ya está en la OT y se muestra tal cual:
- **Tipo** (`x_tipo`): armado, desarme, ampliación, desmonte parcial, mantenimiento, otro — con la flecha y el color del tablero.
- **Qué hay que hacer** (`x_detalle_tecnico`): "ARMAR PANTALLA DE 12.50ML + ALAMBRE DE PUA".
- **Observaciones de Comercial** (`x_observaciones`): 3 renglones y "ver más". No se ocultan (decisión del 09/10 en la ficha).
- **Planos y fotos** (`x_instrucciones_ids`): fila de 3 miniaturas y "ver los 12". **Se sirven a través de la app** (hoy se piden a Odoo y sólo cargan con sesión de Odoo abierta; en el celular del capataz no la hay).
- **Contacto en obra** (`x_contacto_obra`, `x_tel_obra`) con **"Llamar"**, y la **dirección** (`x_direccion_obra`) con **"Cómo llegar"** (Google Maps).

**Lo que agrega Juan Agustín, por obra y por día** (en "+ Instrucciones"):
- **Hora de inicio** en esa obra (si no es la estimada).
- **"Hoy"**, un texto corto: lo que toca **ese día** de una obra de varios días. "Hoy: bajar hasta el 2.º piso; la pantalla de PB queda armada." Es lo que `x_detalle_tecnico` no dice.
- **Motivos rápidos** (chips que se tildan, salen escritos en el celular):
  - "Llevar arnés y cabo de vida"
  - "Pasar por el depósito antes"
  - "Llamar al encargado al llegar"
  - "Tiene que estar el encargado"
  - "Llevar la documentación (ART y seguro)"
  - "Hidrogrúa en obra"
  - "Terminar sí o sí hoy"
  - La lista es un parámetro. Si un texto libre se repite mucho, se vuelve chip.
- **Una nota para toda la cuadrilla** (no de una obra): "Los tablones para Cabildo van en el camión de las 7:00". Va arriba de todo en el celular.

**Qué no se usa**: `x_aba_asignacion.x_notas` (nadie lo usa y se pierde al mover), ni las notas del día del tablero (son internas de la oficina). Las instrucciones viven en Supabase, colgadas de (cuadrilla, fecha, OT).

**El material no va en las instrucciones**: lo que lleva o trae un camión va en sus viajes (§6), y el capataz lo ve en "Para tu obra" (§12).

**EPP y herramientas**: fase 1, por chips. Fase 2: la hoja muestra "Lo que tiene la cuadrilla según el Pañol" (sogas, cabos de vida, máquinas), así el capataz sabe qué no tiene que ir a buscar.

## 11. Enviar a los capataces y a los choferes

### Estados de una hoja

| Estado | Qué significa | Cómo se ve en la tarjeta |
|---|---|---|
| **Borrador** | Se está armando. El capataz no ve nada. | "Borrador" en gris |
| **Enviada** | Telegram confirmó el envío (o, a mano, el coordinador marcó que lo mandó por WhatsApp). | "Enviada 18:42" |
| **Abierta** | El capataz abrió el link (la app lo sabe sola, como el portal de Permisos). | "Abierta 20:15" |
| **Recibida** | El capataz tocó "Recibido". | "Recibida 20:16" en verde |
| **Cambiada después de enviar** | Algo cambió desde lo que se le mandó. | "Cambiada después de enviar" en ámbar, con el resumen |

- **No hay "Confirmar"** (en el tablero ya significa "la fecha se le promete al cliente").
- Cada envío guarda **una foto de lo enviado** (`hd_hojas.enviado`). "Cambiada" es la diferencia entre la hoja de ahora y esa foto. Por eso un cambio en el tablero (obra que entra o sale) también la marca.
- **Los viajes de un chofer** tienen los mismos estados, como conjunto ("Tus viajes del martes"): Enviados / Abiertos / Recibidos / Cambiados. Cada viaje nuevo o cambiado durante el día queda "sin avisar" hasta que se avisa.

### Fase 1: por Telegram, con el camino manual de respaldo

**Decisión del dueño (10/10, última hora): Telegram en vez de WhatsApp.** La empresa ya usa Telegram (las cuadrillas mandan las fotos de obra a un grupo) y un **bot de Telegram** puede escribirle primero a quien lo vinculó, sin plantillas de Meta ni número de empresa. Por eso **el envío automático pasa a la fase 1**. El `wa.me` del Pañol queda como camino manual para quien no vinculó Telegram o cuando Telegram falla.

**Vincular a cada persona, una vez.** El bot no puede escribirle a nadie que no le haya escrito antes. Desde Legajos o desde la Hoja del día, "Vincular Telegram" arma un link `t.me/<bot>?start=<código>` (código de un solo uso, por persona) que se le manda **una sola vez** por WhatsApp o en persona. Al tocarlo, Telegram abre el chat con el bot, el bot guarda el chat en su legajo y le contesta "**Listo, Ortega. Acá te van a llegar tus hojas del día.**" En la lista de envío se ve quién está vinculado y quién no.

"Enviar a los capataces" abre una hoja lateral con una fila por persona que recibe algo (capataces y choferes):

```
Mandar las hojas del martes 13                                       [Enviar todo por Telegram]
Conte · Cuadrilla 2 · 3 obras            Telegram           Enviada 18:42 ✓
Ortega · Cuadrilla 3 · Rivadavia 6150    Telegram           Recibida 20:16
Miño · Cuadrilla 5 · sin celular         sin Telegram       [Cargar celular] [Vincular Telegram]
Kiska · chofer · 6 viajes                Telegram           Enviada 18:43
Gómez · chofer · 2 viajes                WhatsApp (a mano)  [Abrir WhatsApp]
…
```

- **"Enviar todo por Telegram"** manda lo pendiente a los vinculados de una vez. La fila pasa a "Enviada" **sólo si Telegram confirmó el envío**. Si falla (bloqueó el bot, borró el chat), la fila lo dice en palabras y ofrece "Abrir WhatsApp" con el mismo texto.
- **A mano** (sin Telegram): "Abrir WhatsApp" abre `wa.me` con el mensaje escrito; Juan Agustín aprieta Enviar allá y la fila pasa a "Enviada 18:42 · Deshacer" (la app no puede saber si lo mandó: por eso el Deshacer, y por eso "Abierta" es la confirmación de verdad).
- **El mensaje de Telegram** es corto, se lee en la notificación, y trae dos botones: **"Ver la hoja"** (abre `/h/[token]`) y **"Recibido"** (un toque desde la notificación, sin abrir nada; el mensaje queda editado con "✓ Recibido 20:16"):

> Hola Ortega, tu hoja del martes 13/10: Cuadrilla 3, a cargo vos. Encuentro 7:45 en el depósito, te lleva Kiska. Obra: Av. Rivadavia 6150. Cuando la veas tocá "Recibido".

- Al chofer, sus viajes, con los mismos dos botones ("Ver tus viajes" / "Recibido"):

> Hola Kiska, tus viajes del martes 13/10: 7:00 lleva a la Cuadrilla 2 a Juramento 2145; 7:45 lleva a la Cuadrilla 3 a Rivadavia 6150; ~10:00 busca la compra en Galvanizados Sanz: 100 tablones; y 3 más. Cuando los veas tocá "Recibido".

- Por WhatsApp (a mano) el texto es el mismo con el link escrito ("Mirá todo acá: https://…/h/…").
- Pendiente 2 ("¿desde qué WhatsApp?") deja de importar para la hoja: sale del bot. El `wa.me` manual sale del WhatsApp de quien lo abre.

### Durante el día: avisar un viaje nuevo

- Cada viaje que se pone, se saca o se cambia de orden en un camión con chofer ya avisado deja un **"Avisar a Kiska"** en el aviso, en la fila y en la línea "Ahora:" (§9).
- Por Telegram, un viaje nuevo llega con los botones **"Hecho"** y **"No pude"** (No pude abre los motivos rápidos como botones) además de "Entendido" y "Ver tus viajes": el chofer lo cierra sin abrir el link. Mensajes:

> Gómez, viaje nuevo (10:23): después de cargar en Juramento 2145, llevá 6 tablones y 2 bases a Av. Cabildo 3260 (Conte, antes de las 13). Mirá tus viajes: https://…/h/… (el mismo link)

> Kiska, cambió tu orden (11:06): antes de la VTV, llevá 1 escalera y 10 caños de 3 m a Gurruchaga 1650 (Hepper). Mirá: https://…/h/…

> Kiska, te saqué un viaje (12:40): Galvanizados Sanz pasa a mañana. Mirá: https://…/h/…

- Si son varios cambios seguidos al mismo chofer, el botón los junta: **"Avisar a Kiska (2 cambios)"**.
- **Al depósito**, cuando el viaje nuevo sale del depósito con carga: "**Avisar al depósito**" (al número del encargado de turno, parámetro):

> Depósito: a las 11:00 carga Kiska (AF 669 ZL): 1 escalera y 10 caños de 3 m para Gurruchaga 1650.

### Fase 2: lo que queda del envío automático

- Con Telegram, el envío ya es automático en la fase 1 (un botón manda todo). Queda para la fase 2: **envío programado** a la hora parámetro (19:00) de las hojas listas, **recordatorio a las 6:00** al que no la abrió, y **avisar solo** un viaje nuevo al ponerlo (con "Deshacer" de 10 segundos antes de salir).
- La plantilla de Meta ya no hace falta para la hoja. El `wa.me` sigue como plan B por fila.

### Cambios después de enviar

- **Sólo se reenvía a los afectados**. La app calcula a quién le cambió algo:
  - al **capataz** de la hoja que cambió (gente, obras, horario, encuentro, chofer, lleva y busca, instrucciones);
  - al **chofer** si cambiaron sus viajes;
  - si cambió **quién está a cargo**, al nuevo (link nuevo) y al anterior ("Ya no estás a cargo de la Cuadrilla 3 el martes").
- El botón coral pasa a **"Avisar cambios (2)"** y la lista muestra **qué cambió en palabras**:

> Ortega · Cuadrilla 3 · "No va Ávila (enfermedad). Va Ramírez." [Abrir WhatsApp]

- Mensaje de cambio (por Telegram con el botón **"Entendido"**, que vale como un nuevo "Recibido"):

> Ortega, cambió tu hoja de hoy (6:43): no va Ávila, va Ramírez. Mirá: https://…/h/… (el mismo link)

- **El link no cambia** con los cambios: es el mismo de la persona para ese día. Al abrirlo, el capataz ve arriba el cambio (ver §12).
- **Persona nueva en la hoja**: en la misma fila aparece **"Avisar a Ramírez"** (opcional), con un mensaje simple sin link: "Ramírez, hoy vas con la Cuadrilla 3 (a cargo Ortega). Encuentro 7:45 en el depósito, los lleva Kiska." En la fase 1 los operarios no tienen link (ver §12).
- **Cambios chicos que no se avisan**: corregir una nota interna, el vehículo de un chofer que ya lo sabe, o una hora estimada que se corrió. Por eso el envío no es automático: Juan Agustín decide si avisa. Lo que no avisa queda como "Cambiada después de enviar" hasta que avise o toque **"No hace falta avisar"**. Las horas **estimadas** nunca marcan "cambiada" (sólo las fijas y el orden).

## 12. El celular del capataz y del chofer

Abre desde el link de WhatsApp, **sin usuario ni contraseña**: `/h/[token]`. El token es de **esa persona y ese día** (ver §14).

### Para quién está hecho

Manos sucias o con guantes, al sol, a las 6:30 en el colectivo o en la caja del camión, con datos móviles flojos; el chofer, además, **con el camión estacionado en doble fila y apurado**. Por eso:
- **Tema claro de alto contraste siempre** (el oscuro del escritorio no se lee al sol). Texto de 17 px, títulos de 20 px.
- **Botones de 56 px o más**, y los importantes abajo, al alcance del pulgar.
- **Lo importante arriba, sin scroll**: dónde, a qué hora, con quién.
- **Texto antes que íconos**. "Llamar", "Cómo llegar", "Recibido", "Hecho".
- **Nada de formularios**: en el celular sólo se toca; no se escribe.
- **Se actualiza solo** cada 30 segundos mientras está abierto, y al volver a la app.

### Qué ve el capataz, de arriba abajo

```
Martes 13/10 · Cuadrilla 3
A cargo: vos (Ortega)

┌ Cambió a las 6:43 ───────────────────────┐
│ No va Ávila. Va Ramírez.     [Entendido] │
└──────────────────────────────────────────┘

Encuentro 7:45 en el depósito
Te lleva Kiska · Iveco AF 669 ZL
Los busca a las 16:30 en Rivadavia 6150

1 · 8:30 · Av. Rivadavia 6150
↓ Desarme · jornada completa · día 2 de 3
Hoy: bajar hasta el 2.º piso; la pantalla de PB queda armada.
· Llevar arnés y cabo de vida
· Llamar al encargado al llegar
Para tu obra: a las 15:00 Gómez trae lo desarmado al depósito
Qué hay que hacer: DESARMAR ANDAMIO FRENTE 6 PISOS + PANTALLA PB
Observaciones: El portero abre a las 8. No usar el ascensor… ver más
Planos y fotos  [▢][▢][▢]  ver los 9
Contacto en obra: Carlos Ferrari (encargado)        [Llamar]
[Cómo llegar]

Quiénes van (5)
Ortega (a cargo) · Cabrera · Acosta · Villalba · Ramírez    [Llamar] por cada uno

¿Falta alguien, falta material o hay un problema?
[Llamar a Juan Agustín]

[            Recibido            ]   ← fijo abajo, coral
```

- **Varias obras** (Conte): cada obra es un bloque numerado con su hora; la primera abierta, las demás plegadas con dirección, hora y tipo a la vista. Arriba, la nota de la cuadrilla ("Los tablones para Cabildo van en el camión de las 7:00").
- **"Para tu obra"**: los viajes y pedidos de material de cada obra, con su estado, en una línea: "**Tu pedido de las 10:20** (6 tablones y 2 bases): lo lleva Gómez, ~10:45" → "**Entregado 10:52**". Es lo que evita el "¿y el camión?" por teléfono. Si el chofer marcó "No pude", el capataz ve "**No se pudo: … Juan Agustín ya sabe**".
- **Planos y fotos**: tocar una miniatura abre el visor a pantalla completa, con zoom y deslizar. Los PDF se abren con el visor del teléfono.
- **"Recibido"** es el único coral. Al tocarlo pasa a "**Recibido 20:16**" en verde y la hoja de Juan Agustín se actualiza en vivo.
- **Si cambió algo después de que la abrió**: la tarjeta ámbar de arriba dice qué cambió, en palabras, y "Entendido" vale como un nuevo "Recibido". Lo cambiado queda marcado en su lugar (por ejemplo, "Ramírez · nuevo") hasta que toca "Entendido".

### Qué puede hacer y qué no (capataz)

| Puede | No puede |
|---|---|
| Ver su hoja de ese día, con todo lo de §10 y "Para tu obra" | Cargar ausencias (decisión del dueño) |
| Tocar "Recibido" / "Entendido" | Cambiar gente, horarios ni instrucciones |
| Llamar al contacto de obra, a cada uno de los que van, al chofer que lo lleva y a Juan Agustín | Ver las hojas de otras cuadrillas ni los viajes de otros |
| Abrir Maps, planos y fotos | Ver DNI, legajos ni nada que no sea de su día |
| | Pedir material desde el link (fase 2, Pendiente 15) |

**Avisar "falta Fulano" desde el celular** — recomendación:
- **Fase 1: por teléfono.** El botón **"Llamar a Juan Agustín"** (el coordinador de ese día, `hd_parametros`) está siempre a la vista. A las 6:40 una llamada es más rápida y segura que un formulario, y respeta la decisión del dueño: la ausencia la carga el planificador.
- **Fase 2: botón "Avisar: falta alguien"**, que **no** carga la ausencia: le pide al capataz tocar el nombre de quien falta y manda un aviso a la bandeja de Juan Agustín y a `#logistica-operativa` ("Ortega avisa: falta Ávila en la Cuadrilla 3, 6:41"). Juan Agustín la carga con un toque desde el aviso. Sirve cuando nadie atiende el teléfono. Pendiente del dueño (§19).

**Pedir material desde el celular** — recomendación (es distinto de cargar ausencias: no decide nada, sólo pide):
- **Fase 1: por teléfono o WhatsApp**, y el coordinador lo carga en menos de 20 segundos (§7). El capataz ya ve el estado en "Para tu obra".
- **Fase 2: botón "Pedir material o un viaje"**: qué (texto o dictado), para cuál de sus obras de hoy (preelegida), y **"¿Frena la obra?"** Sí / No. Entra en la cola como "**Sin revisar · lo pidió Conte desde el link**" y suena en la pantalla del coordinador. No reemplaza al llamado cuando frena la obra. Pendiente 15.

### Qué ve el chofer: "Tus viajes", la hoja de ruta del día

```
Martes 13/10 · Kiska · Iveco AF 669 ZL

┌ Nuevo viaje 11:06 ───────────────────────┐
│ Llevá 1 escalera y 10 caños de 3 m a      │
│ Gurruchaga 1650 (Hepper)    [Entendido]   │
└───────────────────────────────────────────┘

Ahora
3 · ~11:15 · Depósito → Gurruchaga 1650 (Palermo)
Lleva 1 escalera y 10 caños de 3 m · lo pidió Hepper
[Cómo llegar]  [Llamar a Hepper]

Después
4 · 14:00 · VTV del AF 669 ZL · turno 14:00
5 · 16:30 · Busca a la Cuadrilla 3 en Rivadavia 6150 (Ortega)
6 · 17:00 · Busca a la Cuadrilla 2 en Av. Cabildo 3260 (Conte)

Hechos
✓ 7:35 Lleva a la Cuadrilla 2 a Juramento 2145
✓ 8:25 Lleva a la Cuadrilla 3 a Rivadavia 6150
✗ 10:12 Galvanizados Sanz · no estaba listo

[Llamar a Juan Agustín]
[ No pude ]          [          Hecho          ]   ← fijo abajo; Hecho coral
```

- **Arriba, el viaje de "Ahora"** (el primero sin hacer), grande: hora, de dónde a dónde, qué lleva o trae, quién lo pidió, "Cómo llegar" (Maps con el destino) y "Llamar a…" (al capataz de esa obra o al teléfono del lugar).
- **"Hecho"** (coral, abajo): **un toque** y el siguiente sube a "Ahora". Aviso "Hecho 11:42 · Deshacer" por 10 segundos. Es lo único que el chofer tiene que hacer.
  - Si hizo otro antes del que dice "Ahora", toca ese viaje en "Después" y le aparece su propio "Hecho".
  - **Foto del remito** (opcional, sólo en "Busca compra" y en viajes de material): después de "Hecho" aparece "**Sacar foto del remito**" / "Sin foto" durante 30 segundos, y después queda como "+ foto" en el viaje hecho. Nunca es obligatoria.
- **"No pude"**: motivos rápidos en botones grandes, **un toque**: **"No estaba listo"** · **"Estaba cerrado"** · **"No había nadie para recibir"** · **"No entra en el camión"** · **"Problema con el camión"** · **"Otro (te llamo)"**. Después: "Listo, Juan Agustín ya lo ve. Si es urgente, llamalo." [Llamar a Juan Agustín]. El pedido vuelve a la cola del coordinador en rojo (§9).
- **No hay "Salí" ni "Llegué"**: con el orden y "Hecho" alcanza para saber dónde anda (§9), y cada toque de más es un toque que manejando no se hace. Si en la práctica el coordinador necesita saber "ya llegó", se agrega "Llegué" en la fase 2.
- **"Nuevo viaje"** y **"Cambió tu orden"**: tarjeta ámbar arriba con el cambio en palabras y **"Entendido"**; el viaje nuevo queda marcado "nuevo" en su lugar. "Entendido" es lo que el coordinador ve como "visto".
- **La noche anterior**, la misma pantalla con todos en "Después" y **"Recibido"** abajo en lugar de "Hecho" (igual que el capataz).
- **Todo el día** (Borda, Nuñez): "Todo el día con la Cuadrilla 1 (Sack) · Agrale hidrogrúa AB 831 LC", las obras de la cuadrilla como las ve el capataz, sin el bloque "Quiénes van" abierto, y abajo sus viajes propios si tiene ("16:00 · Trae lo desarmado de San Juan 2840 al depósito") con su "Hecho".

### Sin señal

- La primera vez que abre el link, **la hoja queda guardada en el teléfono** (datos en el almacenamiento del navegador, miniaturas en la caché). Si después no hay señal, se ve lo último descargado con una franja fija: **"Sin conexión · lo que ves es de las 20:16"**.
- "Recibido", "Hecho" y "No pude" sin señal quedan **"Hecho · se manda cuando vuelva la señal"** y se reintentan solos, con la hora en que se tocaron (no la hora en que llegaron).
- Esto entra en la fase 1: es una página de lectura con tres botones y no hace falta el offline completo que el Pañol dejó para la fase 3.

### Situaciones del link

| Situación | Qué ve |
|---|---|
| Link de una hoja todavía sin cambios | Su hoja, como arriba |
| Hoja cambiada | La tarjeta ámbar "Cambió a las 6:43: …" con "Entendido" |
| Chofer con viaje nuevo | La tarjeta ámbar "Nuevo viaje 11:06: …" con "Entendido" |
| Chofer sin viajes pendientes | "No tenés más viajes por ahora. Si te sale uno, te avisamos por acá." |
| Ya no está a cargo (lo cambiaron por otro) | "El martes 13 la Cuadrilla 3 la tiene Hepper. Si es un error, llamá a Juan Agustín." [Llamar a Juan Agustín] |
| Cuadrilla suspendida | "Suspendida · lluvia. No hay que ir. Cualquier duda, llamá a Juan Agustín." |
| Link vencido (pasó el día siguiente) | "Este link era de la hoja del martes 13. Pedile la nueva a Juan Agustín." |
| Link anulado o mal copiado | "El link no es válido." |
| Sin señal | Lo último descargado con "Sin conexión" |

### Los operarios

- **En la fase 1, no.** Se enteran por el capataz como hoy. El único mensaje es el "Avisar a Ramírez" cuando alguien entra a último momento. En la fase 2, si el dueño quiere, cada operario con celular (24 de 30 lo tienen en Odoo) recibe un mensaje corto con cuadrilla, encuentro y capataz, **sin link**: no necesitan planos ni contactos.

## 13. Después: el parte, la asistencia, los vehículos, el pañol y el depósito

**"La asignación es la intención; el parte es el hecho. Conviven."** La hoja dice quién tenía que ir y qué tenía que hacer cada camión; el parte (Odoo `x_aba_parte_diario`) dice qué pasó. La hoja **precarga** el parte, nunca lo reemplaza.

- **"Cerrar jornada"** (el formulario del tablero, desde la oficina) viene precargado desde la hoja de esa cuadrilla y ese día:
  - **Puntero** (`x_puntero_id`) = quien estuvo a cargo según la hoja, por el vínculo `personal ↔ hr.employee` (ver §14).
  - **Cantidad de personas** = los que van, menos los que se cargaron como ausentes ese día. En varias obras, la misma cantidad en cada una, con el horario estimado de cada obra.
  - **Camión en obra** (`x_camion_en_obra`) = sí si el modo fue **Todo el día**; no en los otros. Se puede cambiar.
  - **Fletes** (`x_aba_flete`, fase 1): hoy el formulario propone **1 viaje redondo** fijo (`FLETES_SUGERIDOS_POR_DIA` en `src/lib/odoo/jornadas.ts`). Pasa a proponer **los viajes hechos ese día a esa obra**: cada "Lleva cuadrilla", "Lleva material", "Trae material" o "Mueve" con destino u origen en la OT suma 1; el "Busca" no suma (cierra el redondo del "Lleva"). Si alguno fue un **flete de afuera**, se marca **tercerizado** (`x_tercerizado`) y queda el costo para completar. Al lado se lee "sugerido 2 · según la Hoja del día". Qué cuenta como viaje redondo está en Pendiente 19.
  - Todo editable: si el parte dice otra cosa, **manda el parte**.
- **Asistencia** (`x_parte_diario`, de Juan Pablo):
  - **Fase 1**: no se toca. Se lee para las ART (§5) y, al día siguiente, la bandeja muestra las **diferencias**: "Ávila figuraba en la Cuadrilla 3 el martes y la asistencia dice ausente (enfermedad)" — útil para corregir el parte y para ver qué ausencias no llegaron a la hoja.
  - **Fase 2** (si Juan Pablo y el dueño están de acuerdo): una pantalla **"Asistencia de hoy"** en AndamiosOS, precargada con la hoja (presentes = los que van; ausentes con su tipo = las ausencias previstas) que **escribe en `x_parte_diario`**. Juan Pablo sólo corrige lo que cambió. Una sola carga, en el mismo dato de Odoo que ya se usa.
- **Vehículos** (`vehiculos`, `mantenimientos`, `documentos`):
  - **Fase 1**: se lee el estado (en taller, fuera de servicio) y los vencimientos (VTV, seguro, CNRT). La VTV o el service se cargan como viaje "Taller / VTV / trámite" (hoy viven en notas del día: "IVECO AF669ZL - HACER VTV").
  - **Fase 2**: un mantenimiento con `fecha_programada` aparece solo como bloque en la fila del camión ("Service del AB 799 CA · todo el día"), y el chofer carga **los km al terminar el día** (un solo número, en su link, después del último "Hecho"), que actualizan `vehiculos.km_actual`.
- **Pañol** (fase 2): el kiosco hoy toma el capataz de la cuadrilla de `cuadrillas.responsable_id` (desactualizado). Con la hoja:
  - **"Salida con una cuadrilla"** propone la cuadrilla de quien se identifica ("¿Quién sos?" → Conte → "¿Salida con la Cuadrilla 2?") y deja **como titular al que está a cargo ese día según la hoja**. El historial guarda el capataz del momento, como ya está decidido.
  - "Control del equipo de una cuadrilla" avisa al que está a cargo hoy.
  - La ubicación "**Camioneta**" que el Pañol dejó para su fase 2 se cruza con el camión del día: lo que va en el AF 669 ZL lo tiene Kiska.
  - La pantalla "**Para cargar**" (lista de carga en vivo, §9) en la tablet del pañol.
- **Depósito y material de andamio**:
  - **Fase 1**: lo que se lleva o se trae es **texto** en el viaje. La lista de carga (§9) y "Avisar al depósito" (§11) son la forma de que el depósito se entere.
  - **Remitos** (`remitos`, `remito_items`) y **Solicitudes extra** (`solicitudes_extra`) existen en Supabase con sus pantallas (`/logistica/remitos`, `/solicitudes-extra`), pero **cuelgan de la tabla vieja `obras` (uuid), no de las OT de Odoo**, y piden ítems del catálogo de piezas. La idea de "Solicitudes extra" (pedido de material desde obra, con urgencia normal / urgente / crítica) es exactamente la de los pedidos, pero **no se reutiliza la tabla**: atarla a las OT y al catálogo es otro proyecto. Ver Pendiente 21.
  - **Fase 3**: cuando el stock de andamio se lleve por OT, un viaje "Lleva material" o "Trae material" **hecho** genera el remito de entrega o de devolución con sus ítems, y el chofer lo firma en el link.
- **Compras**: no hay módulo de compras ni se usa `purchase.order` de Odoo desde el código. En la fase 1 la compra es un pedido "Busca compra" a un **lugar** (proveedor) con qué buscar; la foto del remito del proveedor queda en el viaje. El Pañol ya registra el "Ingreso de compra" con proveedor y costo: si la compra es de pañol, el encargado la ingresa al llegar, como hoy.

## 14. Datos

### Dónde vive cada dato

La pregunta es siempre la misma: **¿alguien lo lee desde Odoo?** Si no, va a Supabase.

| Dato | Vive en | Por qué |
|---|---|---|
| Obras de cada cuadrilla cada día | Odoo `x_aba_asignacion` (no cambia) | Es el tablero. La hoja sólo lo lee. |
| Qué hay que hacer, tipo, planos, contacto, dirección, coordenadas | Odoo, la OT y la orden de venta | Lo carga Comercial. La hoja sólo lo lee. |
| Quiénes van, quién a cargo, chofer, vehículo, encuentro | **Supabase** | Nadie lo lee desde Odoo; el costeo es por cantidad. |
| Viajes, pedidos, lugares frecuentes, chofer de cada vehículo por día | **Supabase** | La flota ya vive en Supabase (`vehiculos`); nadie los lee desde Odoo. |
| Instrucciones del día | **Supabase** | Son de la operación del día; `x_notas` se pierde al mover. |
| Ausencias previstas | **Supabase** | Nadie las lee desde Odoo; hoy son texto libre. |
| Asistencia del día (lo que pasó) | Odoo `x_parte_diario` (no cambia) | La carga Juan Pablo y se usa para liquidar. |
| Puntero, cantidad de personas, camión en obra, **fletes** | Odoo, el parte (no cambia) | Odoo calcula el costo. La hoja sólo precarga el formulario; escribe "Cerrar jornada", como hoy. |
| Links, envíos, "Abierta", "Recibido", "Hecho", "No pude", fotos de remitos | **Supabase** | Son del módulo. |

Si algún día el costeo necesita **personas por nombre** en Odoo, se agregan campos al parte por script idempotente (fase 3), sin mover el dato de la hoja.

### Tablas nuevas (Supabase, prefijo `hd_`)

- **`hd_hojas`** — una por cuadrilla y día.
  - `id` uuid, `fecha` date, `cuadrilla_odoo_id` bigint, **UNIQUE (fecha, cuadrilla_odoo_id)**.
  - `chofer_modo` (`sin` / `lleva_trae` / `todo_el_dia`), `chofer_id` → personal (sólo en todo el día; en lleva y trae el chofer está en los viajes), `vehiculo_id` → vehiculos.
  - `encuentro_lugar` (`deposito` / `obra` / texto), `encuentro_hora` time.
  - `nota` (la de toda la cuadrilla).
  - `recibe_id` → personal o `recibe_externa_id` → pan_personas_externas (a quién se manda: por defecto, el que está a cargo).
  - `enviado` jsonb (foto de lo enviado), `enviada_at`, `enviada_por`, `version` int, `sin_avisar_ok_at` ("No hace falta avisar").
  - `updated_at`, `updated_by`.
- **`hd_integrantes`** — quiénes van.
  - `id`, `hoja_id`, `fecha` (repetida a propósito), `persona_id` → personal o `externa_id`, `a_cargo` bool, `es_chofer` bool, `nota` ("va directo a la 2.ª obra"), `orden`.
  - **UNIQUE (fecha, persona_id)**: una persona, una cuadrilla por día. **UNIQUE parcial (hoja_id) WHERE a_cargo**: uno a cargo por hoja.
- **`hd_camiones_dia`** — el chofer de cada vehículo cada día (reemplaza al `hd_chofer_dia` de la v1, que era el renglón "Además").
  - `fecha`, `vehiculo_id`, `chofer_id` → personal (null = sin chofer), `nota`; **UNIQUE (fecha, vehiculo_id)**. Por defecto, el chofer habitual. Lo copia "Empezar como hoy".
  - Los fletes de afuera no tienen fila acá: son viajes con `flete_externo`.
- **`hd_viajes`** — **se generaliza**: todos los viajes de todos los camiones, de cuadrilla o no.
  - `id`, `fecha`, `vehiculo_id` (null en flete de afuera), `chofer_id` (se copia del camión del día al ponerlo; se guarda para que el historial no cambie), `flete_externo` text null ("Semi de Fernando").
  - `tipo`: `lleva` / `busca` / `mueve` (cuadrilla) · `lleva_material` / `trae_material` · `compra` · `entre_depositos` · `taller` · `otro`.
  - `hoja_id` (null = no es de una cuadrilla), `cuadrilla_odoo_id` (para lleva / busca / mueve).
  - Destino: `hacia_ot_id` **o** `hacia_lugar_id` → hd_lugares **o** `hacia_texto`. Origen: igual con `desde_*`; todo null = "donde terminó el anterior".
  - `orden` int (dentro del camión y el día), `hora` time null, `hora_fija` bool, `duracion_min` (por defecto, la típica del tipo).
  - `carga` text (qué lleva o trae).
  - `estado`: `planeado` / `hecho` / `no_pudo` / `anulado`; `hecho_at`, `hecho_por` (`chofer` / user id), `no_pudo_motivo`, `anulado_motivo`, `foto_path` (remito).
  - `version` int (sube con cada cambio que se avisa), `avisado_version`, `visto_version`.
  - `created_by`, `updated_at`, `updated_by`.
- **`hd_pedidos`** — la cola.
  - `id`, `fecha` (para qué día), `que` text, `tipo` (los mismos de material, compra, entre depósitos, taller, otro), destino y origen como en `hd_viajes`.
  - `urgencia`: `frena` / `hora` / `cliente` / `hoy` / `cuando_se_pueda`; `hora_limite` time null; `necesita`: `cualquiera` / `camion` / `hidrogrua`.
  - `pidio_persona_id` → personal o `pidio_texto` ("Oficina: Andrea"); `canal`: `telefono` / `whatsapp` / `link` / `cajon` / `sugerido` / `deposito` / `oficina`.
  - `estado`: `sugerido` / `sin_camion` / `esperando` / `en_camion` / `hecho` / `anulado`; `esperando_motivo`, `esperando_hasta` time; `viaje_id` → hd_viajes (null mientras no tiene camión; **varios pedidos pueden apuntar al mismo viaje**); `orden_manual` int null.
  - `cajon_pendiente_id` (si vino del cajón), `sugerido_regla` + `sugerido_ot_id` (para que un "No hace falta" no vuelva a aparecer: **UNIQUE (fecha, sugerido_regla, sugerido_ot_id)**).
  - `nota`, `created_at`, `created_by`, `anulado_motivo`. "No se pudo" no es estado: el viaje queda `no_pudo` y el pedido vuelve a `sin_camion` con `viaje_id` null; el historial guarda el intento.
- **`hd_lugares`** — los lugares frecuentes que no son obras.
  - `id`, `nombre` ("Galvanizados Sanz"), `tipo` (`deposito` / `proveedor` / `taller` / `vtv` / `otro`), `direccion`, `lat`, `lng` (geocodificados con el mismo helper de las obras, `src/lib/odoo/geocodificar.ts`), `telefono`, `horario` ("lun a vie 8 a 16"), `nota`, `activo`.
- **`hd_instrucciones`** — por obra del día.
  - `id`, `fecha`, `cuadrilla_odoo_id`, `odoo_ot_id`, `hora_inicio` time null, `hoy` text, `chips` text[]; UNIQUE (fecha, cuadrilla_odoo_id, odoo_ot_id).
  - Si la obra se mueve a otra cuadrilla el mismo día, la instrucción **la sigue** (se busca por fecha + OT).
- **`hd_ausencias`**.
  - `id`, `persona_id`, `desde` date, `hasta` date null (null = sin fecha de alta), `tipo` (los de `x_parte_diario` + `tramite`), `hora_desde` / `hora_hasta` null (parciales), `nota`, `origen` (`planificador` / `asistencia`), `creada_por`, `anulada_at`, `anulada_por`. No se borran: se anulan.
- **`hd_links`** — el acceso sin contraseña.
  - `token` text UNIQUE (aleatorio, 32 caracteres, como los de Permisos), `persona_id` o `externa_id`, `fecha`, `rol` (`a_cargo` / `chofer`), `creado_at`, `expira_at`, `anulado_at`, `abierta_at` (primera), `ultima_vista_at`, `version_vista`, `recibido_at`, `recibido_version`.
- **`hd_historial`** — sólo se le agregan filas: cada cambio de la hoja, de un viaje o de un pedido (quién, cuándo, qué), los envíos y avisos, los "Recibido", "Entendido", "Hecho" y "No pude". De acá salen el "Deshacer", el "qué cambió" y la línea de tiempo de una hoja, de un camión y de un pedido.
- **`hd_parametros`** — hora límite de envío (19:00), hora de alarma de no abierta (6:30), minutos entre viajes (45), **duración típica por tipo de viaje**, **minutos para "sin noticias" (60)**, **minutos para "sin avisar" (2) y "no visto" (10)**, **distancia de "cerca" (3 km)**, **hora de corte "pasa a mañana" (15:00)**, encuentro por defecto (7:00 depósito / 8:00 obra), fin de jornada (17:00), chips de instrucciones, **motivos de "No pude" y de "Esperar"**, coordinador de guardia (para "Llamar a Juan Agustín"), **celular del depósito** (para "Avisar al depósito"), días de lectura de la asistencia (3). Con historial, como en el Pañol.

### Quién escribe qué

| Tabla | Escribe | Cómo |
|---|---|---|
| Hojas, integrantes, instrucciones, camiones del día | Quien tiene `hoja-dia` en editar | `/api/hoja-dia` |
| Viajes (poner, ordenar, mover, anular, marcar hecho por el chofer) | Quien tiene `hoja-dia` en editar | `/api/hoja-dia/viajes` |
| Viajes: "Hecho", "No pude", foto, "Entendido" | **El chofer**, por su link | `/api/public/hoja/[token]/viaje/[id]` (sólo los viajes de su token) |
| Pedidos (crear) | `hoja-dia`, `planificacion` (desde el cajón) o `panol` (el depósito), en editar | `/api/hoja-dia/pedidos` |
| Pedidos (crear, fase 2) | **El capataz**, por su link | `/api/public/hoja/[token]/pedido` |
| Lugares | `hoja-dia` en editar | `/api/hoja-dia/lugares` |
| Ausencias | `hoja-dia` o `personal` en editar | `/api/hoja-dia/ausencias` |
| Parte en Odoo | Nadie desde el módulo | Lo sigue escribiendo "Cerrar jornada"; la hoja sólo precarga |

### Vínculos que faltan (y cómo se resuelven)

1. **`personal` ↔ `hr.employee`** (para el puntero del parte, la asistencia y los celulares).
   - Campo nuevo `personal.odoo_employee_id` (UNIQUE).
   - **Script una vez**: cruza por DNI y, si no hay, por nombre normalizado; lista los que no cruzan para arreglarlos a mano en Legajos (hoy hay 30 operarios en Odoo y 28 en `personal`).
   - **Sincronización diaria Odoo → Supabase** de lo que Odoo tiene mejor: **celular** (24 de 30 cargados en Odoo, 0 en `personal`), activo, tarea (chofer / andamista). Un solo sentido; en Legajos esos campos se muestran como "de Odoo".
   - Campo nuevo `personal.puede_estar_a_cargo` bool.
2. **`cuadrillas` (uuid) ↔ `x_aba_cuadrilla` (int)**.
   - Campo nuevo `cuadrillas.odoo_cuadrilla_id` (UNIQUE). Script que los cruza por nombre una vez (lo que hoy hace `cruzarCuadrillas` en cada consulta) y **crea la Cuadrilla 5**, que falta.
   - El Pañol y el kiosco pasan a usar este campo en vez del cruce por nombre.
   - El plantel base sigue en `cuadrilla_personal` y sólo sirve para "Empezar con el plantel base".
3. **Choferes de la flota**: en `personal` hay 4 con puesto chofer (Borda, Kiska, Nuñez, Ortega) y en Odoo 3 con tarea chofer; el AB 497 YY tiene de habitual a Gómez. Se revisa a mano una vez qué choferes hay (Pendiente 22).

### Seguridad del link

- **Un token por persona y por día**, aleatorio de 32 caracteres (no adivinable, no dice nada). El link no cambia con los cambios de la hoja ni con los viajes nuevos de ese día.
- **Vence a las 23:59 del día siguiente** (para que la noche anterior y el día mismo funcione, y después no).
- **Se anula** si la persona deja de estar a cargo o de ser chofer de ese día (ve "Ya no estás a cargo…"), o desde el escritorio con "Anular link" (teléfono perdido, mensaje mandado a otro).
- **Muestra lo mínimo**: nombres y celulares de los que van ese día, contactos y archivos de las obras de esa hoja; al chofer, sus viajes con destino, carga y a quién llamar. Nada de DNI, legajo, otras cuadrillas ni viajes de otros.
- **Escribe lo mínimo**: "Recibido", "Entendido", y el chofer "Hecho" / "No pude" / foto **sólo sobre sus viajes de ese día**.
- **Los archivos** se sirven por `/api/public/hoja/[token]/archivo/[id]`, que verifica que el adjunto sea de una OT de esa hoja, con link temporal. Las fotos de remito se suben a un bucket privado por `/api/public/hoja/[token]/viaje/[id]/foto`.
- Página con `noindex`, sin cookies de sesión, y límite de pedidos por token.
- El mismo patrón que `/permiso/[token]` (`tramiteDeToken`, `anotarPortalVisto`).

### Rutas

- **`/planificacion/hoja`** (Cuadrillas) y **`/planificacion/hoja/camiones`** (Camiones), con `?dia=2026-10-13`. Paneles: "Ausencias", "Enviar", "Lista de carga", "Lugares".
- **`/h/[token]`** (público, capataz y chofer), con layout propio y tema claro.
- APIs:
  - `/api/hoja-dia` (GET del día: junta tablero, hojas, gente, vehículos, ausencias y asistencia; PATCH de hojas, integrantes, instrucciones);
  - `/api/hoja-dia/viajes` (GET de los camiones del día; POST, PATCH: poner, ordenar, mover, anular, marcar hecho);
  - `/api/hoja-dia/pedidos` (GET de la cola; POST; PATCH: esperar, anular, pasar a mañana, aceptar sugerido);
  - `/api/hoja-dia/lugares`;
  - `/api/hoja-dia/ausencias`;
  - `/api/hoja-dia/envios` (marca enviada o avisada, arma el texto y el `wa.me`, también los de viaje nuevo y del depósito);
  - `/api/public/hoja/[token]` (GET de la hoja o los viajes; POST "Recibido" / "Entendido"), `/api/public/hoja/[token]/viaje/[id]` (POST "Hecho" / "No pude"), `/api/public/hoja/[token]/viaje/[id]/foto`, `/api/public/hoja/[token]/archivo/[id]`.
- `proxy.ts`: `/h` y `/api/public/hoja` sin sesión.

### Acceso (`src/lib/auth/acceso.ts`)

- Módulo nuevo **`hoja-dia`** ("Hoja del día", grupo Operaciones, rutas `["/planificacion/hoja"]`, que cubre también `/planificacion/hoja/camiones`), con ver / editar por persona.
  - Editar: Juan Agustín, Ezequiel, Joaquín. Ver: Juan Pablo, el encargado del depósito y quien lo necesite.
- `APIS`:
  - `"/api/hoja-dia": ["hoja-dia"]`;
  - `"/api/hoja-dia/pedidos": ["hoja-dia", "planificacion", "panol"]` (el que planifica lo pasa desde el cajón; el encargado del pañol y depósito pide un viaje; los dos sin poder ponerlo en un camión, que es `/api/hoja-dia/viajes`);
  - `"/api/hoja-dia/ausencias": ["hoja-dia", "personal"]` (para que RRHH cargue vacaciones desde Personal sin ver la hoja).
- **RLS cerrada por permiso** desde el primer día (no abierta como el tablero). Lo público pasa sólo por las rutas `/api/public/hoja/*` con el cliente admin y validación del token.

### Código

- `src/lib/hoja-dia/{tipos,estado,servicio,whatsapp}.ts`. **`estado.ts` es lógica pura**, con tests `node --test`:
  - Cuadrillas: `problemasDeHoja()` y `faltaParaMandar()` (§8), `cruceDeViajes()` (§4), `precargaComoHoy()` y `precargaPlantel()`, `sugerirACargo()` (§3), `viajesPorDefecto()`, `horaEstimadaDeObras()`, `cambiosDesdeEnviado()` (la diferencia en palabras), `afectadosPorCambio()`, `ausenteEn(fecha, hora?)`.
  - Camiones: `horasEstimadas(viajes, parametros)` (fijas y estimadas), `avisosDelCamion()` (la tabla de §9), `dondeAnda(camion, ahora)` (el texto del encabezado), `ordenarCola(pedidos, ahora)`, `camionesQueSirven(pedido, camiones, ahora)` (cerca, libre, no sirve, con el porqué), `pedidosSugeridos(tablero, dia)`, `cuadrillasSinQuienLasBusque()`, `fletesDelDia(viajes, otId)`, `listaDeCarga(viajes)`, `textoDelViaje(viaje)` (cómo lo lee el chofer).
  - `whatsapp.ts` reutiliza `telefonoWhatsapp` / `linkWhatsapp` del Pañol (moverlos a `src/lib/whatsapp/link.ts`).
- `src/hooks/use-hoja-dia.ts`, `use-camiones.ts`, `use-pedidos.ts`; `src/components/hoja-dia/` (y `hoja-dia/camiones/`); en vivo con el broadcast del tablero (`src/lib/tablero/avisos.ts`): un cambio en el tablero refresca la hoja y la marca "Cambiada"; un "Hecho" del chofer refresca la fila del camión.
- El cajón del tablero (`src/components/tablero/cajon-planificacion.tsx`) suma **"Pasar a pedido"** al menú de cada pendiente; `plan_cajon_pendientes` no cambia (se tilda y el pedido guarda `cajon_pendiente_id`).
- "Cerrar jornada" (`src/components/tablero/formulario-cierre.tsx`) toma la sugerencia de viajes de `fletesDelDia()` en lugar de `FLETES_SUGERIDOS_POR_DIA`.
- "Hoy" siempre con `hoyBA()`.
- Migraciones a mano con `npx supabase db query --linked -f`, idempotentes.

## 15. Reportes (fase 2)

- **Quién fue con quién y dónde**, por persona y por período ("¿con quién trabajó Ramírez en septiembre?", "¿cuántos días estuvo Conte a cargo?").
- **Uso de choferes y vehículos** por día: todo el día / lleva y trae / viajes sueltos / libre; viajes por camión y por tipo.
- **Pedidos imprevistos por obra**: qué obras piden material fuera de plan y cuántas veces ("Cabildo 3260: 3 pedidos el mismo día"). Es una señal de cómputo flojo para Oficina técnica.
- **Tiempo de respuesta**: del pedido al "Hecho", por urgencia. Cuántos "Frena la obra" se resolvieron en menos de 1 hora.
- **"No pude" por motivo y por lugar** ("Galvanizados Sanz: 3 veces no estaba listo en octubre").
- **Ausencias** por persona y tipo, previstas contra asistencia.
- **Cuadrillas cortas**: días con menos gente que la prevista.
- **Puntualidad del envío**: a qué hora salieron las hojas y cuántas se abrieron antes de las 6:30.

## 16. Fases

**Fase 1 — lo mínimo que ya sirve**
- Vínculos: `personal.odoo_employee_id` con sincronización de celulares; `cuadrillas.odoo_cuadrilla_id` y la Cuadrilla 5; `personal.puede_estar_a_cargo`.
- **Vista Cuadrillas** `/planificacion/hoja`: Hoy / Mañana, tarjetas por cuadrilla con las obras del tablero, panel Gente (sin asignar, no disponibles, ya asignados, choferes, vehículos).
- Asignar arrastrando, con teclado y con el menú del nombre; "Poner a cargo" con sugerencia; Deshacer.
- "Empezar como hoy" (con los lleva y trae), "Empezar con el plantel base", "Copiar como hoy" por tarjeta.
- Chofer en tres modos, con vehículo y viajes "lleva / busca / mueve" con hora y carga.
- Encuentro; instrucciones por obra ("Hoy", chips, hora) y nota de la cuadrilla.
- Ausencias: desde el nombre y en la lista, con rango, sin fecha de alta y parciales; ART tomadas de la asistencia.
- Problemas en la tarjeta y "Falta para mandar" con los grupos de §8; rojos a la campanita.
- **Viajes manuales de todos los tipos** (§6), con hora fija o estimada, carga, "desde = el anterior", fletes de afuera, y **lugares frecuentes**.
- **Cola de pedidos**: "Nuevo pedido" en menos de 20 segundos, urgencia, esperar, pasar a mañana, anular; agrupada por de quién es la pelota; "Pasar a pedido" desde el cajón; **sugeridos** de armados que arrancan y desarmes que terminan.
- **Vista Camiones**: filas por camión con línea de tiempo aproximada (y lista), "dónde anda" sin GPS, poner un pedido arrastrando o con las teclas 1–4, reordenar, pasar a otro camión, volver a la cola, marcar hecho por el chofer, avisos de §9, cerca / libre por distancia en línea recta, lista de carga con "Copiar para WhatsApp".
- **Envío por Telegram** (bot, con vinculación por persona) y `wa.me` como camino manual; estados Enviada / Abierta / Recibida / Cambiada; "Avisar cambios" sólo a los afectados, con el qué cambió; "Avisar a Ramírez"; **"Avisar a Kiska"** por viaje nuevo (con "Hecho" / "No pude" en el mismo mensaje); "Avisar al depósito".
- **Celular** `/h/[token]`: el del capataz con "Recibido", "Entendido", "Llamar a Juan Agustín", planos servidos por la app, **"Para tu obra"**; el del chofer como **hoja de ruta** con "Ahora", **"Hecho"**, **"No pude"** con motivo, "Nuevo viaje" con "Entendido" y foto del remito opcional; los dos con la última copia sin señal.
- Precarga de "Cerrar jornada": puntero, cantidad de personas, camión en obra y **fletes según los viajes hechos**.

**Fase 2**
- Envío programado a las 19:00, recordatorio de las 6:00 y **viaje nuevo avisado solo** (el envío por Telegram ya está en la fase 1).
- **"Pedir material o un viaje"** desde el celular del capataz (si el dueño lo aprueba).
- "Avisar: falta alguien" desde el celular del capataz (si el dueño lo aprueba).
- "No pude" y "Frena la obra" a `#logistica-operativa`.
- "Asistencia de hoy" precargada que escribe en `x_parte_diario` (si Juan Pablo y el dueño lo aprueban); diferencias hoja / asistencia.
- Pañol: salida con la cuadrilla del día y titular = el que está a cargo según la hoja; "Lo que tiene la cuadrilla" en la hoja; ubicación "Camioneta" = el camión del día; **pantalla "Para cargar" en la tablet**.
- Vehículos: mantenimientos programados como bloque en la fila; **km al terminar el día** desde el link del chofer.
- Sugeridos desde las tareas del tablero (traslado, retiro).
- **Mapa del día**: las obras, los lugares y la última parada de cada camión, en el Mapa de obras que ya existe.
- "Llegué" en el link del chofer, si "Hecho" no alcanza.
- Mensaje corto a cada operario.
- Avisos de documentación vencida de personas (curso de altura, psicofísico).
- "Dividir" la gente por obra, si la nota por persona no alcanza.
- Vista semanal de ausencias; reportes de §15.

**Fase 3**
- Parte desde el celular del capataz (el "Cerrar jornada" en obra).
- Personas por nombre en el parte de Odoo, si el costeo lo pide.
- Nómina ART por obra cruzada con quiénes van (con Habilitaciones).
- **Remitos desde los viajes** (entrega y devolución con ítems, firmados en el link del chofer), cuando el stock de andamio se lleve por OT; pedidos con ítems del catálogo.
- **Compras**: si se instala Compras en Odoo (`purchase.order`), un pedido "Busca compra" nace de la orden de compra confirmada.
- Sugerencia automática de armado completo (no sólo copiar).

## 17. Fuera de alcance

- Liquidación de sueldos, horas extra y premios (siguen en Odoo y en la asistencia).
- Fichadas: no se deducen ausencias de ellas (decisión del dueño).
- **Ruteo automático, optimización de recorridos, tiempos de viaje según el tránsito y GPS de vehículos**: el orden lo decide el coordinador, la hora es aproximada y las duraciones son típicas por tipo. "Cerca" es distancia en línea recta, sólo para mirar.
- Mantenimiento de vehículos (sigue en Vehículos); la hoja lee el estado y los vencimientos, y ocupa el camión con el viaje de taller.
- **Compras** (órdenes de compra, precios, proveedores como cuentas): el pedido sólo dice dónde ir a buscar qué.
- **Stock de andamio y remitos** en las fases 1 y 2: el material es texto en el viaje.
- Facturar fletes al cliente: sigue siendo de Comercial y del costeo.
- Cambiar qué obra hace cada cuadrilla: eso es el tablero.
- Usuario propio para capataces, choferes u operarios.

## 18. Criterios de aceptación

1. Con el lunes armado, "Empezar como hoy" deja el martes con las 5 hojas precargadas, sin los ausentes y con los lleva y trae en las filas de los camiones, y se puede mandar todo en menos de 5 minutos (medido con Juan Agustín sobre un día real).
2. Una persona no puede quedar en dos cuadrillas el mismo día: ponerla en otra la mueve, con "Deshacer".
3. Un chofer en "Lleva y trae" con dos viajes a menos de 45 minutos aparece en la tarjeta y en "Falta para mandar", y se puede mandar igual.
4. Mover una obra en el tablero cambia la hoja al instante y, si estaba enviada, la marca "Cambiada después de enviar" con el qué cambió en palabras.
5. Sacar a Ávila por enfermedad, poner a Ramírez y abrir el WhatsApp para Ortega con el cambio escrito lleva menos de 30 segundos.
6. El link de Ortega abre sin login, muestra encuentro, chofer, obra y quiénes van sin scroll en un teléfono de 360 × 640, y "Recibido" actualiza la tarjeta del escritorio en menos de 5 segundos.
7. Abierto una vez y sin señal, el link muestra la última copia con "Sin conexión · lo que ves es de las HH:MM", y un "Hecho" tocado sin señal llega después con la hora en que se tocó.
8. Un link de otro día, anulado o de alguien que ya no está a cargo, muestra el texto de §12 y ningún dato de la hoja.
9. Alguien con ART en la asistencia de los últimos 3 días, sin ausencia prevista, aparece como no disponible "según la asistencia" y no entra en la precarga.
10. "Cerrar jornada" de una cuadrilla con hoja viene con el puntero, la cantidad, el camión en obra y los fletes (según los viajes hechos) precargados, y todo se puede cambiar.
11. Sin permiso `hoja-dia`, ni las pantallas ni sus APIs responden; con `panol` o `planificacion` en editar se puede crear un pedido pero no ponerlo en un camión; el link público sólo da la hoja o los viajes de su token y sólo escribe sobre ellos.
12. Un pedido que entra por teléfono se carga con el teclado (qué, dónde, para cuándo) en menos de 20 segundos, con el tipo y quién pidió deducidos.
13. Del pedido de Conte de las 10:20 al WhatsApp de Gómez abierto con el viaje escrito: menos de 30 segundos, medido con el coordinador.
14. "Hecho" en el link de Kiska actualiza su fila en menos de 5 segundos, sube el siguiente a "Ahora" y deja el pedido como hecho en la cola y en el link del capataz.
15. "No pude" con un motivo devuelve el pedido a la cola en rojo con el motivo y la hora, sin que el chofer escriba nada.
16. Sacar o pasar el "busca" de una cuadrilla sin reemplazo muestra "Nadie busca a la Cuadrilla 3…"; soltar un pedido en un camión de Todo el día o en taller muestra el aviso y deja seguir.
17. Para mañana aparecen sugeridos para cada armado que arranca y cada desarme que termina; un "No hace falta" no vuelve a aparecer.
18. `estado.ts` tiene tests de: problemas de la hoja, cruce de viajes, precarga, sugerencia de a cargo, cambios desde lo enviado, afectados, horas estimadas, avisos del camión, dónde anda, orden de la cola, camiones que sirven, sugeridos y fletes del día.

## 19. Decisiones

**Del dueño (10/10/2026)**
1. **Chofer: depende del día.** Lleva y trae, queda todo el día (puede ayudar como operario), o no hay chofer. Lo indica el planificador en cada caso.
2. **Capataz: se elige cada día.** El plantel base y el responsable sirven de sugerencia; la decisión es diaria.
3. **Celular del capataz: link sin contraseña**, la noche anterior, como `/permiso/[token]`. Sin usuario propio. (El canal pasó de WhatsApp a Telegram: decisión 8.)
4. **Ausencias: las carga el planificador (o RRHH), con anticipación.** Las del día por teléfono, y el planificador las refleja. El capataz no carga ausencias. No se deducen de fichadas.
5. **Los camiones también hacen viajes internos** (buscar compras a proveedores, mandados, etc.): **la hoja de ruta de los camiones se maneja en este módulo**, integrada con toda la operación.
6. **Lo maneja el coordinador de la operación**, que es quien detecta las prioridades.
7. **Se mandan camiones a medida que las obras piden material que no estaba previsto, por imprevistos y por compras**: hay que contemplar la planificación de la noche anterior **y** el despacho en vivo durante el día.
8. **(10/10, última hora) Telegram en vez de WhatsApp.** La hoja y los viajes salen por un **bot de Telegram** (cada persona lo vincula una vez con un link `t.me/<bot>?start=<código>`), con botones "Ver la hoja" y "Recibido"; los cambios, sólo a los afectados, con "Entendido"; el viaje nuevo al chofer, con "Hecho" y "No pude". **Reemplaza a `wa.me` + plantilla de Meta y el envío automático pasa a la fase 1.** "Enviada" se marca sólo cuando Telegram confirmó. Quien no vinculó Telegram sigue por el camino manual (`wa.me`, como el Pañol).
- Siguen valiendo: el capataz no carga ausencias; capataz y chofer ven su día por link sin login; advierte, no bloquea; un solo botón coral; rioplatense con voseo.

**Propuestas en este documento (10/10/2026, a aprobar)**
8. Nombre **Hoja del día**; en pantalla "quiénes van", "a cargo", "encuentro", "camión", "viaje", "pedido", "Hecho", "No pude".
9. **Un solo módulo con dos vistas, "Cuadrillas" y "Camiones"**, y la cola de pedidos al costado de "Camiones". No un módulo "Despacho" aparte (§1).
10. Todo cuelga de **(cuadrilla, fecha)** y de **(vehículo, fecha)**; las obras se leen del tablero; la gente vale para todas las obras del día.
11. **Una persona, una cuadrilla por día**: ponerla en otra la mueve. El chofer de "Lleva y trae" es la excepción.
12. **El viaje es la unidad del camión**: una parada con lo que se hace ahí; "desde" es donde terminó el anterior. Los lleva y trae de las cuadrillas son viajes como los demás (no hay dos listas). El renglón "Además" de la v1 desaparece.
13. Viajes con **hora fija** sólo cuando alguien espera; el resto **estimada** con duraciones típicas. Sin franjas, sin ruteo, sin GPS.
14. **El pedido** es lo que todavía no tiene camión; se carga en tres campos y el resto se deduce. "Urgente" e "imprevisto" no son tipos: urgente es la prioridad, imprevisto se calcula.
15. **La app ordena la cola y muestra cerca / libre; el coordinador decide.** El orden a mano gana.
16. **El chofer sólo marca "Hecho" y "No pude"** (con motivo de un toque); foto del remito opcional. Sin "Salí" ni "Llegué".
17. **El capataz ve el estado de los pedidos de su obra** desde la fase 1 ("Para tu obra").
18. **Ausencias previstas en Supabase; la asistencia de Odoo sigue siendo de Juan Pablo**; las ART se toman de la asistencia.
19. ~~Envío fase 1 con `wa.me`; fase 2 con plantilla de Meta~~ → **Envío fase 1 por Telegram** (decisión 8), con `wa.me` como camino manual. Token por persona y día, vence a las 23:59 del día siguiente.
20. **El chofer tiene su link; los operarios no** (fase 1).
21. La hoja **precarga** el parte, **fletes incluidos**; manda el parte.
22. **No se reutilizan `solicitudes_extra` ni `remitos`** (cuelgan de la tabla vieja `obras`); remitos desde los viajes en la fase 3.

**Pendiente:**
1. **¿"Hoja del día" como nombre?** Recomendación: sí (ver §1). Alternativa: "Cuadrillas del día" (pero ya no alcanza: ahora también están los camiones).
2. ~~**¿Desde qué WhatsApp salen las hojas y los viajes?**~~ Resuelto por la decisión 8: salen del bot de Telegram. Queda: **¿quién crea el bot con @BotFather y con qué nombre?** (recomendación: "Andamios Buenos Aires · Hoja del día", creado con una cuenta de la empresa, no personal). Lo que sigue era la pregunta original: Recomendación: un número de ABA con WhatsApp Business abierto en la computadora de operaciones, no el celular personal de Juan Agustín (que capataces y choferes agenden un solo número, y que siga andando si Juan Agustín falta). Ese mismo número sirve después para la plantilla de Meta.
3. **¿A qué hora tiene que estar mandada la hoja de mañana?** Recomendación: 19:00, y alarma a las 6:30 si alguien no la abrió.
4. **¿Quién arma la hoja y despacha si Juan Agustín no está?** Recomendación: Ezequiel, con el mismo permiso; el "Llamar a…" del celular apunta al coordinador de guardia (parámetro).
5. **¿El capataz puede avisar "falta alguien" desde el celular?** Recomendación: fase 1 sólo "Llamar a Juan Agustín"; fase 2 el botón de aviso, que no carga la ausencia.
6. **¿Juan Pablo pasa a cargar la asistencia en AndamiosOS, precargada con la hoja?** Recomendación: sí en fase 2, escribiendo en el mismo `x_parte_diario`. Hay que preguntarle a él.
7. **¿Quiénes pueden estar a cargo?** Recomendación inicial: Conte, Miño, Ortega, Hepper, Sack y Pérez.
8. **¿Pasa seguido que parte de la cuadrilla vaya a otra obra el mismo día?** Si es raro, alcanza la nota por persona; si no, "Dividir" en fase 2.
9. **¿Hay cuadrillas que van con vehículo sin chofer** (por ejemplo, el capataz maneja la S10)? Si pasa, se agrega "Manejan ellos" como cuarto caso del selector, y la S10 aparece en Camiones con "maneja Ortega".
10. **¿El chofer de "Todo el día" cuenta como una de las 5 personas?** Recomendación: sí (puede ayudar como operario), y se ve "5 de 5 (con Nuñez)".
11. **¿Los operarios reciben un mensaje?** Recomendación: no en fase 1; en fase 2, un mensaje corto sin link a los que tienen celular.
12. **Horario y encuentro estándar**: ¿7:00 en el depósito con chofer y 8:00 en la obra sin chofer? (La asistencia muestra entrada a las 7:00 y los partes inicio a las 8:00.)
13. **Tercerizadas**: ¿se les manda la hoja a su referente?
14. **¿El coordinador de la operación es Juan Agustín**, el mismo que arma el tablero? Recomendación: sí, una sola persona con las dos vistas (es quien más usa el tablero: 520 movimientos en 4 semanas). Si es otra persona, la pantalla es la misma; cambia a quién llaman capataces y choferes (coordinador de guardia).
15. **¿El capataz puede pedir material desde su link?** Es distinto de cargar ausencias: no decide, sólo pide. Recomendación: **fase 2**, después de 2 o 3 semanas de cola funcionando con pedidos cargados por el coordinador; entra como "Sin revisar" y no reemplaza al llamado cuando frena la obra. Desde la fase 1 el capataz ya ve el estado de lo que pidió.
16. **¿Al chofer le alcanza con "Hecho" y "No pude"?** Recomendación: sí; "Llegué" sólo si después el coordinador lo extraña. ¿Hay algún chofer sin smartphone o que no vaya a usar el link? En ese caso el coordinador marca "Hecho" por él cuando lo llama.
17. **¿La foto del remito es obligatoria en las compras?** Recomendación: no, opcional; si administración la necesita siempre, se vuelve obligatoria sólo en "Busca compra".
18. **Lugares frecuentes**: ¿cuántos depósitos hay, qué proveedores se visitan seguido (Galvanizados Sanz y cuáles más), qué taller y qué planta de VTV? Recomendación: cargar 10 a 15 lugares con dirección y horario antes de arrancar.
19. **¿Qué cuenta como un viaje redondo en el parte?** Recomendación: cada ida a la obra con gente o material suma 1; el "busca" no suma; los fletes de afuera van como tercerizados. Confirmar con quien cierra los partes.
20. **¿Quién prepara la carga en el depósito y cómo se entera de los viajes nuevos?** Recomendación: fase 1, la lista de carga y "Avisar al depósito" por `wa.me` al encargado de turno; fase 2, la pantalla "Para cargar" en la tablet del pañol.
21. **¿Se esconden "Solicitudes extra" y "Remitos" del menú?** Están atadas a la tabla vieja de obras y no a las OT. Recomendación: sí, al arrancar los pedidos, para que no haya dos lugares donde pedir material; los remitos vuelven en la fase 3 desde los viajes.
22. **¿Quiénes son los choferes?** En Odoo hay 3 (Borda, Kiska, Nuñez), en `personal` 4 (más Ortega) y el AB 497 YY tiene de habitual a Gómez. Recomendación: revisar la lista una vez y marcar en Legajos quién puede manejar qué (camión, hidrogrúa).
23. **¿Los fletes de afuera (el semi de Fernando) se cargan acá?** Recomendación: sí, como fila "Fletes de afuera", así el parte los toma como tercerizados.
24. **¿Hasta qué hora un pedido de hoy sin camión pasa a mañana?** Recomendación: 15:00, con "Pasar a mañana" a un toque (nunca solo).

---

## Guía para la maqueta

La maqueta tiene que dejar probar el circuito completo de un día: la tarde anterior y el despacho en vivo, con datos que parezcan reales. Escritorio en tema oscuro (el del sistema), celulares en tema claro. Un solo botón coral por pantalla. Nombres con `nombrePropio()`, patentes en JetBrains Mono.

> Los nombres de capataces, choferes, vehículos y de Juan Agustín / Juan Pablo son reales; Gómez figura como chofer habitual del AB 497 YY en la flota (confirmar, Pendiente 22). Galvanizados Sanz aparece en los pendientes del cajón. Los operarios (salvo Ávila, Cabrera, Arrieta, Coronel, Pérez, Valenzuela y Medina, que aparecen en los datos), los contactos de obra, los horarios de los lugares y la planta de VTV son de ejemplo. Las direcciones son plausibles.

### Escenario: martes 13/10/2026

Se arma el **lunes 12/10 a las 17:30**, se cambia el **martes a las 6:40** y se despacha **el martes de 7:00 a 17:00**.

**Cuadrillas y obras** (7 obras, tomadas del tablero):

| Cuadrilla | Obras (en orden) | A cargo | Quiénes van | Chofer |
|---|---|---|---|---|
| **1** | Av. del Libertador 5980 (Belgrano) · ↑ armado de pantalla · 1 j · 8:00 · "ARMAR PANTALLA DE 12.50ML + ALAMBRE DE PUA" | Sack | Sack, Arrieta, Godoy, Sosa + Borda | **Todo el día**: Borda con el Agrale hidrogrúa **AB 831 LC**. Chip "Hidrogrúa en obra". |
| **2** | 1) Juramento 2145 · ↓ desarme · ¼ j · 8:00 · 2) Cuba 1980 · ○ mantenimiento · ¼ j · ~10:15 · 3) Av. Cabildo 3260 · ↑ armado · ½ j · 13:00 | Conte | Conte, Coronel, Benítez, Ledesma, Ríos | **Lleva y trae**: Kiska, Iveco **AF 669 ZL**. Lleva 7:00 depósito → Juramento (carga: "20 tablones y 2 escaleras para Cabildo"); busca 17:00 en Cabildo. Nota de cuadrilla: "Los tablones para Cabildo van en el camión de las 7:00". Nota por persona: "Benítez y Ríos van directo a Cabildo a las 13" (opcional, para mostrar la nota). |
| **3** | Av. Rivadavia 6150 (Caballito) · ↓ desarme · 1 j · día 2 de 3 · 8:30 | Ortega | Ortega, **Ávila**, Cabrera, Acosta, Villalba | **Lleva y trae**: Kiska, mismo Iveco. Lleva **7:00** (al principio, para mostrar el choque) → se corrige a 7:45; busca 16:30. Instrucción "Hoy: bajar hasta el 2.º piso; la pantalla de PB queda armada." + "Llevar arnés y cabo de vida" + "Llamar al encargado al llegar". Contacto: Carlos Ferrari (encargado). |
| **4** | Gurruchaga 1650 (Palermo) · ↑ armado · 1 j · 8:00 · **primer día** | Hepper | Hepper, Pérez, Romero, Molina (+ falta 1) | **Sin chofer**. Encuentro 8:00 en la obra. El material lo lleva Gómez (sugerido aceptado). |
| **5** | Av. San Juan 2840 (San Cristóbal) · ↓ desarme · 1 j · 8:00 · **último día** | (sin nadie a cargo al principio → Miño) | Miño, Valenzuela, Aguirre + Nuñez | **Todo el día**: Nuñez con el Iveco **AB 799 CA**; a las 16:00 trae lo desarmado al depósito. |

**Gente que no va:**
- **Medina**: se accidentó el lunes 12 a la tarde; ART desde el 13/10, sin fecha de alta, **"según la asistencia"** (cargada por Juan Pablo en Odoo). Estaba en la Cuadrilla 4 el lunes: por eso la 4 queda con 4 de 5.
- **Paz** y **Ramírez**: sin asignar (Paz se usa para completar la 4; Ramírez queda libre para el reemplazo de las 6:40).
- **Miño** no tiene celular cargado.

**Camiones del martes** (lo que queda armado el lunes a las 18:40):

| Camión | Viajes planeados |
|---|---|
| **Kiska · Iveco AF 669 ZL** | 1) **7:00** Lleva a la C2 a Juramento 2145 (20 tablones y 2 escaleras para Cabildo) · 2) **7:45** Lleva a la C3 a Rivadavia 6150 · 3) ~10:00 **Busca compra en Galvanizados Sanz: 100 tablones** (pasado del cajón: "RETIRAR 100 TABLONES EN GALVANIZADOS SANZ") · 4) **14:00 VTV del AF 669 ZL** (turno; ~1 h 30; antes era la nota del día "IVECO AF669ZL - HACER VTV") · 5) **16:30** Busca a la C3 en Rivadavia 6150 · 6) **17:00** Busca a la C2 en Av. Cabildo 3260 |
| **Gómez · Iveco AB 497 YY** | 1) **8:00** Lleva el material del armado a Gurruchaga 1650 (sugerido "Arranca el armado de Gurruchaga 1650" → "Aceptar"; carga 7:30) · 2) ~10:15 **Trae lo desarmado de Juramento 2145 al depósito** (sugerido "Termina el desarme de Juramento 2145" → "Aceptar") · 3) **15:00** Trae de Rivadavia 6150 lo bajado hoy (pedido de Ortega del lunes: "lo de los pisos 6 a 3 ocupa la vereda") |
| **Borda · Agrale hidrogrúa AB 831 LC** | Todo el día con la C1 en Av. del Libertador 5980 |
| **Nuñez · Iveco AB 799 CA** | Todo el día con la C5 en Av. San Juan 2840 · ~16:00 Trae lo desarmado al depósito (sugerido aceptado, en su mismo camión) |
| **Sin usar** | Iveco AH 410 LD (**VTV vencida desde el 02/10**) · S10 (sin chofer: Borda está con la hidrogrúa) · moto (Mansilla) · autoelevadores |
| **Fletes de afuera** | — |

**Lugares frecuentes** cargados: Depósito · Galvanizados Sanz (proveedor, lun a vie 8 a 16) · Planta de VTV (turnos) · Taller (service).

**Lo que pasa el martes** (para el control "Ir a…" de la maqueta):

| Hora | Qué pasa | Qué hace el coordinador |
|---|---|---|
| 6:40 | Ortega llama: Ávila tiene fiebre. | El cambio de la Cuadrilla 3 (ver abajo, escritorio 14). |
| 7:35 · 8:25 | Kiska marca "Hecho" en Juramento y en Rivadavia. | Nada: la fila se actualiza sola ("Hizo Rivadavia 6150 (8:25) · ahora hacia Galvanizados Sanz (~10:00)"). |
| 8:40 | Gómez marca "Hecho" en Gurruchaga. | Nada. |
| 10:12 | **Kiska marca "No pude" en Galvanizados Sanz: "No estaba listo".** | Ve la línea roja. Llama a Sanz: lo tienen a las 15. "Esperar…" → "No está listo" → desde las 15:00. Kiska queda "Libre · vuelve al depósito ~10:45". |
| 10:20 | **Conte llama: en Cabildo faltan 6 tablones y 2 bases** (los necesita para arrancar a las 13). | N → "6 tablones y 2 bases" → "cab" Enter (Av. Cabildo 3260 · Cuadrilla 2) → "Antes de las 13" → Enter. La cola dice "**Cerca: Gómez en Juramento 2145 (1 km)** · Libre: Kiska ~10:45". Lo suelta en la fila de Gómez **entre Juramento y la vuelta al depósito**: el viaje sale "Juramento 2145 → Av. Cabildo 3260 · 6 tablones y 2 bases (de lo desarmado) · ~10:45", y la vuelta al depósito corre a ~11:15. "Avisar a Gómez" → WhatsApp. Cronómetro: menos de 30 s. |
| 10:24 | Gómez abre el link: "Nuevo viaje" → "Entendido". | La ficha pasa de "sin avisar" a "visto 10:24". |
| 10:52 | Gómez marca "Hecho" en Cabildo. | En el link de Conte: "Tu pedido de las 10:20: entregado 10:52". |
| 11:05 | **Hepper llama: en Gurruchaga falta 1 escalera y 10 caños de 3 m**, hoy. | Nuevo pedido "Hoy". Lo intenta soltar en Borda → "Borda está todo el día con la Cuadrilla 1…" → "Elegir otro". Lo pone en **Kiska** (libre, en el depósito): "~11:15 Depósito → Gurruchaga 1650". "Avisar a Kiska" y "**Avisar al depósito**" (1 escalera y 10 caños en el AF 669 ZL a las 11:00). |
| 11:42 | Kiska marca "Hecho" en Gurruchaga y saca la foto del remito interno. | — |
| 14:00 | Kiska en la VTV (la fila dice "En la VTV hasta ~15:30"). | — |
| 15:00 | **El pedido de Sanz vuelve a "Para hacer vos"** (terminó la espera). **Nadie libre**: "Kiska en la VTV hasta ~15:30 · Gómez en Rivadavia 6150". | Lo prueba en Kiska después de la VTV: "Kiska llegaría ~16:50 a buscar a la Cuadrilla 3 (16:30)" y "Galvanizados Sanz atiende hasta las 16 y Kiska llega ~16:20". "Deshacer". → **"Pasar a mañana"**: queda primero del miércoles con "viene de ayer" y "Avisar a Kiska" ("te saqué un viaje"). |
| 15:40 | Gómez marca "Hecho" en Rivadavia (lo bajado vuelve al depósito). | La lista de carga lo muestra en "Para recibir". |
| 16:20 | Nuñez marca "Hecho": lo desarmado de San Juan 2840 en el depósito. | — |
| 16:35 · 17:10 | Kiska marca "Hecho" en los dos busca. | La fila: "Terminó 17:10 · 6 viajes · 1 no pudo". |
| 17:30 | Cerrar jornada de la Cuadrilla 2. | Fletes sugeridos por obra, "según la Hoja del día": **Juramento 2145: 2** (el lleva de las 7:00 y el trae de Gómez); **Cuba 1980: 0**; **Av. Cabildo 3260: 1** (el pedido de las 10:20; el busca de las 17:00 no suma). Ver Pendiente 19. |

### Pantallas y estados — vista Cuadrillas (escritorio de Juan Agustín)

1. **Mañana vacío** (lun 12, 17:30): "El martes 13 todavía no tiene hojas." con "Empezar como hoy" · "Empezar con el plantel base" · "Empezar vacío".
2. **Recién precargado**: las 5 tarjetas en borrador; arriba "Falta para mandar" con:
   - "Cuadrilla 5 · sin nadie a cargo · Sugerido: Miño (la tuvo el 09/10)" [Usar] (la 5 no tuvo obras el lunes);
   - "Cuadrilla 4 · 4 de 5 personas" (Medina, ART según la asistencia) [Agregar];
   - "Kiska lleva a la 2 y a la 3 a las 7:00" [Cambiar hora];
   - "**3 pedidos sugeridos para mañana**" [Ver] (Gurruchaga arranca, Juramento termina, San Juan termina);
   - "Miño no tiene celular cargado" [Cargar celular] (aparece después de ponerlo a cargo).
   - Un aviso de la precarga: "Medina no entra: ART desde el 13/10 (según la asistencia). La Cuadrilla 4 quedó con 4 de 5."
3. **Panel Gente** con sus cinco grupos (Sin asignar: Paz, Ramírez; No disponibles: Medina; Ya asignados atenuados con su número; Choferes con "Kiska · 6 viajes"; Vehículos con la VTV vencida del AH 410 LD).
4. **Agregar**: arrastrar a Paz a la Cuadrilla 4 (y lo mismo con "+ Agregar" escribiendo "paz" + Enter). La 4 pasa a "5 de 5" y el problema desaparece. Aviso "Paz pasó a la Cuadrilla 4 · Deshacer".
5. **Mover a alguien ya asignado**: arrastrar a Romero a la 3 → "Romero está en la Cuadrilla 4. ¿Lo pasás a la 3?" → "Pasarlo" → la 4 vuelve a 4 de 5 (para probar y deshacer).
6. **Menú del nombre**: "Poner a cargo" · "Pasar a…" · "No viene…" · "Nota" · "Sacar".
7. **A cargo**: en la 5, "Usar" la sugerencia de Miño; aparece "Miño no tiene celular cargado" → "Cargar celular" (un campo, se guarda en Legajos) → desaparece.
8. **Selector de chofer**: cambiar la 4 entre los tres modos y ver qué campos aparecen; en la 3, cambiar la hora de "lleva" de 7:00 a 7:45 y ver desaparecer el choque (y la ficha moverse en la fila de Kiska, en Camiones). Elegir el AH 410 LD en algún lado para ver "VTV vencida" (advierte, deja seguir).
9. **Instrucciones** de la 3: hora, "Hoy", chips; y la nota de cuadrilla de la 2.
10. **Ausencias**: la lista con Medina (según la asistencia, "Cargar hasta cuándo" / "Ya tiene el alta") y "Nueva ausencia" (vacaciones de Valenzuela del 19 al 23/10, para ver que no afecta el martes).
11. **"Todo listo para mandar"** → **"Enviar a los capataces"**: la lista con Sack, Conte, Ortega, Hepper, Miño, Kiska, Gómez, Borda y Nuñez, con el mensaje de cada uno visible al pasar el mouse; "Abrir WhatsApp" (simulado) → "Enviada 18:42 · Deshacer".
12. **Ver como Ortega** / **Ver como Kiska**: un botón en la tarjeta o en la fila que muestra el celular al costado (la vista previa del link).
13. **Después del envío** (simular el paso del tiempo con un control de la maqueta "Ir a…"): Conte "Recibida 20:16", Ortega "Recibida 20:40", Sack "Abierta 21:05", Hepper "Enviada 18:44" y, a las 6:30, **"Hepper no la abrió · enviada 18:44" en rojo** con "Reenviar" / "Llamar".
14. **El cambio de las 6:40** (Hoy · mar 13): Ortega llamó, Ávila tiene fiebre.
    - Tocar a Ávila → "No viene…" → "Enfermedad" → "Sólo hoy".
    - La 3 queda "4 de 5" con la sugerencia "Ramírez (sin asignar)" → "Ponerlo".
    - La tarjeta pasa a "Cambiada después de enviar: no va Ávila, va Ramírez"; el botón coral pasa a **"Avisar cambios (1)"**.
    - La lista muestra "Ortega · No va Ávila (enfermedad). Va Ramírez." [Abrir WhatsApp] y "Avisar a Ramírez" [Abrir WhatsApp].
    - Un cronómetro discreto en la maqueta muestra cuánto se tardó (la meta son 30 s).
15. **Cambio desde el tablero**: simular que la obra Cuba 1980 se pasó a la Cuadrilla 4 → la 2 y la 4 quedan "Cambiada después de enviar", con "Avisar a Conte" y "Avisar a Hepper", y la instrucción de Cuba se va con la obra.
16. **Cerrar jornada** de la 3 en Rivadavia 6150 (martes a la tarde): puntero Ortega, 5 personas, camión en obra "no", fletes "sugerido 2 · según la Hoja del día" (lleva de las 7:45 y el trae de las 15:00), todo editable.

### Pantallas y estados — vista Camiones (despacho)

1. **La tarde anterior** (lun 12, 18:00, Mañana · mar 13): las filas con los lleva y busca que salieron de las hojas; la cola con **3 sugeridos** ("Arranca el armado de Gurruchaga 1650 · llevar el material", "Termina el desarme de Juramento 2145 · traer lo desarmado", "Termina el desarme de San Juan 2840 · Nuñez trae al terminar") con "Aceptar" / "No hace falta", y el pedido de Sanz que vino del cajón. Aceptar y soltar cada uno; agregar la VTV como viaje "Taller / VTV" con hora fija 14:00.
2. **El cajón del tablero**: el pendiente "RETIRAR 100 TABLONES EN GALVANIZADOS SANZ" → "Pasar a pedido" → queda tildado con "→ pedido" y aparece en la cola con el lugar ya elegido.
3. **Martes 9:30**, todo en orden: fichas hechas en gris con ✓, "ahora" en coral, encabezados "Hizo Rivadavia 6150 (8:25) · ahora hacia Galvanizados Sanz (~10:00)", "Con la Cuadrilla 1 en Av. del Libertador 5980", "Sin usar: AH 410 LD (VTV vencida) · S10 (sin chofer)…".
4. **10:12, "No pude"**: la ficha de Sanz tachada, la línea roja "Kiska no pudo en Galvanizados Sanz: no estaba listo (10:12)" en "Ahora:" y en la cola; "Esperar…" → chip "No está listo" → "desde las 15:00" → pasa a "Esperando a otro: lo tienen a las 15".
5. **10:20, el pedido de Conte**, con el cronómetro: Nuevo pedido con teclado (los tres campos y lo deducido: "Lleva material · pidió Conte"), "Guardar y poner en un camión", los camiones resaltados con el porqué (Gómez cerca, Kiska libre, Borda y Nuñez atenuados), soltar en Gómez entre dos fichas, horas recalculadas, aviso "Pedido de Conte en el AB 497 YY (Gómez), ~10:45 · Avisar a Gómez · Deshacer", WhatsApp simulado con el mensaje.
6. **10:35, Gómez sin abrir** (variante): "Gómez no abrió el viaje nuevo (10:23)" → "Llamar a Gómez".
7. **11:05, el pedido de Hepper**: intentar soltarlo en Borda → aviso de Todo el día → "Elegir otro" → Kiska; "Avisar a Kiska" y "Avisar al depósito".
8. **Avisos para probar**: arrastrar el "busca" de la C3 fuera de la fila de Kiska → "Nadie busca a la Cuadrilla 3 en Rivadavia 6150" → "Elegir chofer" / "Vuelven por su cuenta"; mover la VTV a las 16:00 → "Kiska llegaría tarde a buscar a la Cuadrilla 3"; Deshacer.
9. **15:00, nadie libre**: el pedido de Sanz en rojo "Nadie libre a las 15…", probarlo en Kiska después de la VTV (dos avisos), Deshacer, "Pasar a mañana" → aparece en Mañana con "viene de ayer".
10. **Sin noticias** (variante): adelantar el reloj sin que Gómez marque Rivadavia → "Gómez: sin noticias desde las 10:52 (tenía Rivadavia a las 15:00)" en ámbar → "Marcar hecho" (queda "marcado por Juan Agustín").
11. **Lista de carga** del martes, con lo nuevo de las 11:06 marcado y "Copiar para WhatsApp".
12. **Lista en vez de línea de tiempo** (tecla L o pantalla angosta).
13. **Fletes de afuera** (variante): agregar "Semi de Fernando · Mekano al depósito · 8:00".

### Pantallas y estados — celular del capataz (360 × 640, tema claro)

1. **Ortega, lunes 20:40**: su hoja completa; lo de arriba sin scroll (encuentro 7:45 depósito, Kiska con el AF 669 ZL, busca 16:30, Rivadavia 6150, quiénes van). "Recibido" coral abajo → "Recibido 20:40" verde.
2. **Ortega, martes 6:45**: la tarjeta ámbar "Cambió a las 6:43: No va Ávila. Va Ramírez." con "Entendido"; Ramírez marcado "nuevo" en Quiénes van.
3. **Conte**: tres obras, la primera abierta y dos plegadas con hora (8:00, ~10:15, 13:00); arriba la nota "Los tablones para Cabildo van en el camión de las 7:00"; Benítez y Ríos con "van directo a Cabildo a las 13".
4. **Conte, martes 10:30**: en Cabildo, "**Para tu obra**: tu pedido de las 10:20 (6 tablones y 2 bases) lo lleva Gómez, ~10:45"; a las 10:52, "Entregado 10:52".
5. **Visor de planos**: tocar una miniatura de Rivadavia 6150 → pantalla completa con zoom y deslizar.
6. **Sin señal**: la hoja de Ortega con "Sin conexión · lo que ves es de las 20:40"; tocar "Recibido" → "Recibido · se manda cuando vuelva la señal".
7. **Hepper sin chofer**: "Encuentro 8:00 en la obra · van por su cuenta" y "Para tu obra: el material lo lleva Gómez a las 8:00".
8. **Links que no sirven**: "Ya no estás a cargo" (Romero, si se lo hubiera puesto a cargo y después cambiado), "Este link era de la hoja del martes 13", "El link no es válido".
9. **Cuadrilla suspendida** (variante): "Suspendida · lluvia. No hay que ir."

### Pantallas y estados — celular del chofer

1. **Kiska, lunes 20:50**: "Tus viajes del martes 13/10", los 6 en "Después" con hora, destino, carga y "Cómo llegar" / "Llamar a Conte / Ortega"; "Recibido".
2. **Kiska, martes 8:30**: dos hechos con ✓ y la hora; "Ahora: ~10:00 · Busca la compra en Galvanizados Sanz: 100 tablones" con "Cómo llegar" y "Llamar a Galvanizados Sanz"; abajo "No pude" y "Hecho" (coral).
3. **"No pude"**: los seis motivos grandes; tocar "No estaba listo" → "Listo, Juan Agustín ya lo ve. Si es urgente, llamalo." [Llamar a Juan Agustín]; en "Hechos" queda "✗ 10:12 Galvanizados Sanz · no estaba listo".
4. **Kiska, 11:06**: tarjeta ámbar "Nuevo viaje 11:06: Llevá 1 escalera y 10 caños de 3 m a Gurruchaga 1650 (Hepper)" con "Entendido"; el viaje en "Ahora".
5. **"Hecho"** en Gurruchaga → "Hecho 11:42 · Deshacer" y "Sacar foto del remito" / "Sin foto"; el siguiente (VTV 14:00) sube a "Ahora".
6. **Gómez, 10:23**: "Nuevo viaje" con "desde Juramento 2145", para ver que el desde es donde está.
7. **Kiska, 15:05**: tarjeta "Te sacaron un viaje: Galvanizados Sanz pasa a mañana".
8. **Borda** (todo el día): "Todo el día con la Cuadrilla 1 (Sack) · Agrale hidrogrúa AB 831 LC", la obra de Libertador con "Cómo llegar", "Recibido".
9. **Nuñez** (todo el día con un viaje propio): la obra de San Juan y "~16:00 · Trae lo desarmado al depósito" con su "Hecho".
10. **Sin señal**: "Hecho" sin señal → "Hecho · se manda cuando vuelva la señal".
11. **Sin viajes pendientes**: "No tenés más viajes por ahora. Si te sale uno, te avisamos por acá."

### Interacciones que se tienen que poder probar

- Precarga "Empezar como hoy" y ver qué avisa (y los lleva y trae en las filas de Camiones).
- Arrastrar, reemplazar soltando sobre otro nombre, y "Pasarlo" desde otra cuadrilla; Deshacer.
- Agregar con teclado ("ram" + Enter) y mandar con las teclas 1–5 desde el panel.
- Poner a cargo con la sugerencia; cargar un celular que falta.
- Cambiar el modo de chofer y la hora de un viaje hasta que desaparezca el choque, desde la tarjeta y desde la fila del camión.
- Cargar una ausencia desde el nombre y desde la lista; ver la de "según la asistencia".
- Enviar (simulado), ver los estados avanzar, y el rojo de "no la abrió".
- El cambio de las 6:40 de punta a punta, con el cronómetro.
- Aceptar y descartar sugeridos; "Pasar a pedido" desde el cajón.
- **El pedido de Conte de las 10:20 de punta a punta, con el cronómetro** (meta: 30 s), usando sólo el teclado.
- Soltar un pedido entre dos fichas, sobre una ficha al mismo destino (se suma), en un camión de Todo el día y en uno en la VTV, y ver cada aviso.
- Reordenar fichas, "Correr horas", pasar una ficha a otro camión, "Volver a la cola", "Marcar hecho" por el chofer.
- "No pude" desde el celular de Kiska y verlo llegar en rojo a la pantalla; "Esperar…" y que vuelva solo a las 15:00.
- El pedido que se queda sin camión y "Pasar a mañana".
- Abrir el celular de Ortega antes y después del cambio, "Recibido", "Entendido" y sin señal; el de Conte con "Para tu obra".
- Ver la hoja de ruta de Kiska avanzar con cada "Hecho", el "Nuevo viaje" y la foto del remito; la hoja de Borda y la de Nuñez.
