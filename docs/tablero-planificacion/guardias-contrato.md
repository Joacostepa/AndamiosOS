# Guardias y comodines: contrato de construcción (18/10/2026)

Es lo que se construye y va a producción, con las decisiones de JS del 18/10. **Si este documento
contradice a `guardias.md`, `comodines.md` o la maqueta, manda este.** El por qué de cada regla está
en esos documentos. La maqueta (`maqueta-guardias.html`) es la referencia visual: la guardia es un
bloque rayado ámbar claro, nunca rojo.

Palabras: **guardia** (jornada reservada para lo imprevisto) y **comodín** (desarme que ya puede
ir cualquier día). Las dos son palabras internas. **JS** = Joaquín Stepansky, el dueño, el único que
autoriza.

---

## 1. Guardias

### 1.1 Qué es

Una jornada entera (fracción 1) de una cuadrilla propia, en un día hábil, que el sistema reserva
para lo que no se puede prever. **Ocupa capacidad como cualquier tarjeta** (cuenta en la celda, en
el riel, en "N de 6 j", en "libre X j" y en el asistente comercial), pero se muestra y se cuenta
aparte ("libre 0 · guardia 1", "5 de 6 j + 1 guardia").

Cada guardia tiene:
- **estado:** activa | usada | rellenada | sacada;
- **origen:** sistema | persona;
- **uso:** urgencia | lluvia | atraso | comodin | obra_comun | deposito, con la OT si la hay;
- quién y cuándo cambió el estado, y el motivo si lo hubo.

Se recomienda construirla sobre `tablero_tareas` con tipo `guardia`, porque las tareas ya ocupan
capacidad, el corrimiento las respeta y el asistente las lee. El arquitecto decide; si elige otra
cosa, lo justifica.

### 1.2 Quién las pone: el sistema, solo

- **Cuándo:** todos los **viernes a las 10 h de Argentina (13 UTC)**, con una corrida programada.
  Cubre la **semana siguiente y la otra** (+1 y +2), lunes a sábado. La semana en curso nunca.
- **Cuántas:** **2 por semana, siempre**, mientras haya lugar. No es "solo lo que falta": una celda
  libre no está protegida y la vende cualquiera.
- **Días:** preferentemente **martes y jueves**. Si ese día no hay ninguna celda libre en una
  cuadrilla candidata, se busca el día hábil más cercano de la misma semana, en este orden:
  - para el martes: miércoles, lunes;
  - para el jueves: miércoles, viernes.

  Las dos guardias de una semana nunca van el mismo día.
- **Cuadrillas candidatas:**
  - activas y **no tercerizadas** (`x_tercerizada = false`). **La C5 nunca lleva guardia**: es
    subcontratada y no tiene disponibilidad asegurada;
  - **como mucho una guardia por cuadrilla por semana**;
  - **rotan:** entre las candidatas con lugar, se elige la que menos guardias tuvo en las últimas
    4 semanas; si empatan, la de menor número.
- **Dónde no van nunca:**
  - una celda que no esté **totalmente libre** (sin asignación, sin tarea, sin apoyo);
  - en medio de una obra de varios días de esa cuadrilla (el día anterior y el siguiente tienen la
    misma OT);
  - domingo, feriado o un día suspendido;
  - una jornada ya cerrada.
- **Nunca mueve una obra.** Si en una semana no entra ninguna (o solo una), queda así, y el
  indicador lo muestra en ámbar.
- **Una sola vez por semana.** Si la semana ya tiene sus guardias (activas, usadas o rellenadas),
  no se agregan. Si JS **autorizó sacar** una guardia, esa semana no se repone.
- Antes de escribir, la corrida **vuelve a leer** la grilla: no confía en lo que leyó antes.
- La corrida se puede volver a correr sin duplicar nada (idempotente).
- **Avisa:** cuando termina, deja una alerta para Planificación y JS con lo que puso. Ejemplo:
  "Puse 2 guardias para la semana del 02/11: mar 03/11 C2, jue 05/11 C3". Si no pudo poner alguna,
  dice por qué.
- **Arranque (18/10):** una corrida inicial "como si hoy fuera viernes", que cubre las semanas del
  26/10 y del 02/11.

### 1.3 El candado: qué puede hacer cada uno

**Planificación** (quien puede editar la planificación) **puede, sin pedir nada:**
1. **Usarla para una urgencia.** Solo si la OT tiene urgencia alta o media **y** se creó en Odoo en
   los **últimos 3 días hábiles**. Una OT más vieja no era imprevista: pasa por JS.
2. **Usarla para lluvia.** Lo que el corrimiento del día mueve sobre una guardia la consume
   (uso: lluvia).
3. **Usarla para un armado atrasado:** un apoyo (`x_apoyo`) a un armado en curso que ya se pasó
   de su duración estimada.
4. **Rellenarla con un comodín** desde las **13 h del día hábil anterior** a la guardia.
5. **Correrla dentro de la misma semana**, a otra celda totalmente libre de una cuadrilla propia
   (otro día u otra cuadrilla), con las mismas reglas de "dónde no van nunca".

**Necesita autorización de JS** (y solo de JS):
- **sacar** una guardia;
- **poner una obra común** sobre una guardia;
- **un comodín antes de las 13 h** del día hábil anterior;
- **una urgencia que no cumple la regla** del punto 1.

**Cómo se pide:**
- Planificación toca "Pedir autorización" y escribe el motivo (obligatorio, una línea).
- La solicitud queda guardada y a JS le llega un aviso en la app. Si hay un canal de Slack
  configurado, también por Slack.
- JS ve la solicitud con **Aprobar** y **Rechazar**.
  - Si aprueba, la acción pedida se ejecuta (o queda habilitada para quien la pidió); la guardia
    queda "sacada" o "usada (obra_comun)" con el motivo.
  - Si rechaza, no pasa nada y quien pidió se entera.
- **Hasta que JS responda, la guardia sigue puesta.**
- Quién es "JS" se resuelve con un permiso explícito (como el módulo `sistemas` con
  `exigeExplicito`), dado **solo** a js@andamiosbuenosaires.com.ar. Ningún admin lo trae solo.

**El candado vale en el servidor, no solo en pantalla.** Toda escritura que ponga algo en la celda
de una guardia, la saque o la mueva pasa por una validación del lado del servidor. Esto incluye:
- soltar una obra;
- mover un bloque;
- el editor de jornadas;
- sumar un apoyo;
- el corrimiento;
- borrar una tarea;
- y cualquier ruta que escriba asignaciones o tareas.

Si no cumple las reglas, la ruta responde con un error claro en castellano ("Esa jornada es una
guardia: para usarla con una obra común hace falta la autorización de JS").

### 1.4 Lluvia y corrimiento

- Lo que el corrimiento del día (`planearCorrimiento`) hace caer sobre una guardia **la consume**:
  la guardia pasa a "usada (lluvia)" y la cascada **se frena ahí**, en esa cuadrilla.
- Hoy un día que solo tiene tareas frena la cascada pero lo que cae se suma. Con la guardia, lo que
  cae la reemplaza.
- El deshacer del corrimiento devuelve la guardia a "activa".

### 1.5 El día anterior a las 13 h

- **Corrida programada de lunes a sábado a las 13 h de Argentina (16 UTC).** Para cada guardia
  activa de mañana (el día hábil siguiente), deja una alerta a Planificación: "Mañana: guardia C3
  libre. Para rellenar: …", con los candidatos en este orden:
  1. apoyo a un armado atrasado;
  2. comodín (primero el que más espera);
  3. adelantar una tentativa de las semanas siguientes, si su piso lo permite;
  4. depósito.
- Desde ese momento, soltar un comodín sobre la guardia no pide autorización.
- **Si nadie la rellena, el capataz recibe "Depósito · mantenimiento de material".** El capataz
  **nunca ve la palabra "guardia"**: ni en la Hoja del día, ni en el pizarrón, ni en el mensaje de
  Telegram. Planificación sí la ve en el tablero.
- Sin IA en esta etapa. El orden lo da una regla.

### 1.6 Cómo se ve en el tablero

- **Tarjeta:**
  - bloque rayado ámbar claro, con borde, sello "GUARDIA", ícono de escudo y "1 j";
  - segundo renglón "si no entra nada: Depósito" (o el comodín previsto, si lo hay);
  - con tokens de color en claro y oscuro (`--tb-guardia-*`), y sus pares en `npm run contraste`.
- **Origen:** "La puso el sistema el vie 23/10". Al tocarla, se ve **por qué está ahí** ("jueves
  le tocaba a la C3 por rotación") y su historia (usada, autorizaciones).
- **Estados:**
  - usada o rellenada: se ve la obra que la usa, con un chip "de guardia";
  - sacada: no se ve en la grilla, pero queda en la historia.
- **Encabezado del día:** "libre X · guardia Y", sumando las cuadrillas visibles.
- **Fila de la cuadrilla:** "4,5 de 6 j + 1 guardia".
- **Indicador arriba:** "Lugar protegido próximos 5 días hábiles: X de N j", donde N son las
  guardias que corresponden a esos días.
  - Va en gris si están todas activas y en ámbar si falta alguna o ya se usaron.
  - Cuenta celdas libres de cuadrillas propias más guardias activas.
- **Acciones sobre la guardia:**
  - para Planificación: correr dentro de la semana (arrastrando o con un menú) y "Pedir
    autorización" (sacar u obra común);
  - para JS: además, Sacar directamente y la bandeja de solicitudes con Aprobar y Rechazar.
- **Al soltar una obra sobre una guardia:**
  - si es una urgencia que cumple, lluvia, apoyo a un atrasado o comodín desde las 13 h, la usa;
  - si no, ofrece "Pedir autorización a JS" con el motivo; no se apila ni se suma.
  - La obra **reemplaza** a la guardia, en un solo lote que se deshace entero.
- **"Meter urgente"** en la bandeja y en la ficha de la OT:
  - escribe `x_urgencia = alta` y `x_motivo_urgencia` en Odoo (el motivo es obligatorio);
  - muestra la guardia más cercana que puede usar.
- Respetar las reglas del módulo: nada nuevo bajo la query key `["tablero"]` que no sea el payload
  de asignaciones; lo que escribe en Odoo se agrupa y se deshace entero o no se deshace.

---

## 2. Comodines

### 2.1 Qué es

Los desarmes **no se adelantan; se pueden atrasar**. Comercial llama unos 10 días antes del
vencimiento del contrato, y si el cliente terminó carga el desarme "a partir de" esa fecha
(`x_fecha_desde`, el piso). Si un desarme está cargado, el cliente lo pidió.

**Un comodín es una OT que cumple todo esto:**
- es de tipo **desarme**;
- está pendiente o en proceso, con jornadas por planificar o planificadas que todavía no se
  hicieron;
- no tiene urgencia alta;
- dura **1 jornada o menos**;
- su **piso ya llegó**, o llega antes del día donde se lo quiere poner (sin piso cargado, cuenta
  desde que se creó la OT);
- **no lleva más de 7 días hábiles esperando** desde el piso.

**Se calcula, no se guarda:** no hay campo nuevo en Odoo. **Nunca se pone un comodín antes de su
piso.**

### 2.2 Cuando espera demasiado

Pasados **7 días hábiles desde el piso** sin hacerse, deja de ser comodín.
- Se muestra como **urgente** en el tablero y en la bandeja ("Esperando hace 8 días hábiles"), y
  deja una alerta a Planificación. **No escribe nada en Odoo.**
- Es un valor configurable en un solo lugar (`DIAS_MAX_COMODIN = 7`).

### 2.3 Cómo se ve y se usa

- **En la grilla y en la bandeja:** conserva el color de su tipo, con un **ícono de naipe** y un
  chip "comodín · desde 20/10". Si está cerca del límite, el chip lo dice ("comodín · quedan 2 d").
- **En la bandeja**, un grupo **"Comodines (N · X j)"** arriba, que también incluye los que ya
  están en la grilla, ordenados por cuánto esperan. Cada tarjeta muestra dónde está hoy (fecha y
  cuadrilla, o "sin fecha") y el piso.
- **Arrastrar:**
  - al levantar un comodín, se resaltan las guardias donde puede ir (piso, fecha y candado) y lo
    demás se atenúa;
  - al soltarlo sobre una guardia, en **un solo lote que se deshace entero**: el comodín se
    **mueve** (no se copia) a la celda de la guardia, la guardia queda "rellenada (comodín, OT)" y
    se libera su fecha anterior;
  - antes de las 13 h del día hábil anterior, pide autorización de JS (1.3);
  - también se puede soltar en una celda libre común, como cualquier obra.
- **Alerta de las 13 h (1.5):** los comodines aparecen como candidatos, primero el que más espera.

---

## 3. Seguridad (requisito para que el candado valga)

La auditoría del 08/10 (`handoff.md`, "Auditoría UX y técnica") encontró cosas que hay que cerrar
en esta entrega:
- **El servidor no valida permisos** en el PATCH de asignaciones (y hay que revisar las demás rutas
  de planificación). Toda ruta de planificación que escribe tiene que validar del lado del servidor
  que el usuario puede editar la planificación (`src/lib/auth/acceso.ts`).
- **RLS abierta** (`FOR ALL TO authenticated USING (true)`) en `plan_suspensiones`,
  `tablero_tareas` y las demás tablas `plan_*` del tablero. Cualquiera con sesión escribe directo.
  - Cerrar las escrituras directas desde el navegador en las tablas que importan para el candado
    (`tablero_tareas`, guardias, solicitudes).
  - **Antes de cerrar una tabla, revisar quién la escribe hoy desde el navegador** y pasar esas
    escrituras por rutas del servidor, para no romper el cajón, las notas ni los comentarios.
- **El candado de habilitaciones falla abierto** para Depósito y Campo: si la consulta da error, el
  tablero confirma sin fricción. Tiene que fallar cerrado o avisar.
- No tocar lo que no hace falta: el objetivo es que el candado de las guardias no se pueda saltear y
  no romper nada de lo que anda.

---

## 4. Producción

- **Migraciones:** archivos nuevos en `supabase/migrations/` con fecha 20261018…. Se aplican con
  `npx supabase db query --linked -f <archivo>`. **Nunca `supabase db push`.** Las aplica Claude
  (el orquestador) al final, no los agentes.
- **Las tareas programadas** van en `vercel.json`, protegidas como las que ya existen (mirá cómo se
  validan `/api/cron/*`).
- **Pruebas:** funciones puras con tests (`npm test`) para la regla de dónde van las guardias, el
  candado (qué se permite y qué pide autorización), el cálculo de comodín y el consumo por el
  corrimiento.
- **Verificación:** `npx tsc --noEmit`, `npx eslint` sobre lo tocado, `npm test` y `npx next build`.
- **Documentación:**
  - actualizar `docs/tablero-planificacion/handoff.md`: una entrada nueva arriba y el mapa del
    módulo;
  - agregar `docs/tablero-planificacion/guardias-handoff.md` con mapa de archivos, cómo correr la
    corrida a mano y cuidados.
- **Textos de la interfaz:** en castellano rioplatense, cortos, sin jerga.
