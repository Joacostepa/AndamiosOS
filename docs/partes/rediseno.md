# Partes de Obra — auditoría UX y propuesta de rediseño

> Alcance: `/partes` (`src/app/(dashboard)/partes/page.tsx`, `src/components/partes/*`), y lo que lo alimenta o se le superpone: Hoja del día (`src/components/hoja-dia/`, `cerrar-jornada.tsx`, `usePrecargaCierre`), tablero (`formulario-cierre.tsx`, `tablero-board.tsx`), fichadas, informe de obra, fotos de Telegram (`fotos_obra`). Leí el código y los docs; no toqué nada.
> Fecha: 10/10/2026, el mismo día que la Hoja del día salió a producción.

---

## 0. Resumen ejecutivo

**El diagnóstico en una línea:** `/partes` está muy bien pensado *campo por campo* (los comentarios son de lo mejor del repo: sacaron el sector, el objetivo, el default de 1 persona, el guardado que trababa todo), pero sigue siendo una pantalla para **reconstruir de memoria** a la mañana siguiente algo que el sistema, desde hoy, **ya vio pasar**. La Hoja del día sabe quién fue, quién estuvo a cargo, a qué hora llegó el camión y a qué hora los fue a buscar. `/partes` no lo lee.

**Los tres hallazgos más graves**

1. **Hay dos caminos para crear un parte, y el "oficial" es el peor.** El tablero manda a `/partes` diciendo "con dos lugares para cargarlo terminan divergiendo", y el comentario de `page.tsx` dice que es "el ÚNICO lugar donde se crea un parte". Pero desde el PR #3 la Hoja del día crea partes con `FormularioCierre`, que **sí** viene precargado desde la hoja (capataz, personas por tramo horario, camión en obra, fletes) y admite varias líneas de mano de obra. `/partes` no usa `usePrecargaCierre` (aunque la API dice explícitamente "la pide quien cierra partes (Planificación o Partes)"), arranca el capataz vacío y sólo acepta una línea.
2. **La deuda real no está en pantalla.** El badge del sidebar cuenta *todas* las jornadas confirmadas sin parte de cualquier fecha anterior (`contarPendientes`). La pantalla muestra el día elegido más las *tentativas* vencidas. Una jornada **confirmada** del martes pasado sin parte sólo aparece si alguien retrocede día por día hasta encontrarla. El badge puede decir 14 y "ayer" decir "0 sin cargar".
3. **Lo que se tipea vive en memoria.** Borradores y fotos (en base64) están en `useState`. Recargar, cerrar la pestaña o navegar al tablero se lleva todo, sin aviso (`/partes` no tiene `beforeunload`; el cajón del tablero sí). El guardado masivo además corta en el primer error (`break`), así que una falla en la fila 2 deja sin intentar la 3, 4 y 5.

**Qué propongo, en una línea:** pasar de *"cargar partes"* a *"confirmar el día"*. El parte deja de ser un formulario y pasa a ser **una declaración con evidencia, en dos firmas**: el capataz declara a la tarde desde el link que ya abre (tres toques, sin escribir), y la oficina confirma a la mañana en una cola de triage donde cada dato dice de dónde salió. El caso típico es un toque *porque hay evidencia*, no porque se asuma el plan.

**En qué supera al concepto inicial** (detalle en §4):

| Concepto inicial | Lo que agrego / corrijo |
|---|---|
| Triage "Como estaba previsto / Con cambios / No se hizo" | El "un toque" se habilita **según el nivel de evidencia**, no siempre. Confirmar el plan sin evidencia es exactamente el "Confirmar como planificado" que el código ya marca como fuente de horas-hombre inventadas. Y un cuarto estado real: **"Falta un dato"** (con a quién preguntarle), que hoy no tiene dónde vivir. |
| "El sistema propone" con Hoja del día + fichadas + fotos de Telegram | Fichadas **no sirve** hoy (Supabase, tabla vieja `obras`, QR, sin uso operativo) y las fotos de Telegram son **un import único**, no un flujo vivo. La evidencia fuerte que sí existe y nadie usa: los **"Hecho" con hora** de los viajes del chofer (llegada real del "Lleva", salida real del "Busca") y el **"Recibido"** del capataz. Y la mejor evidencia es la que todavía no se pide: **el capataz declarando a las 16:30**. |
| Una fila por OT | La unidad de lo que la oficina *sabe* es **la cuadrilla en un día** (así llega la info: "lo de Ortega"). Se confirma el capataz y la gente **una vez por cuadrilla**, y se reparte en sus obras con `horariosCierre`, que ya existe. |
| Editar los deltas (personas, horas) | Editar **personas, no números**: la hoja tiene los nombres; tocar "Ávila no fue" es más rápido y más verificable que cambiar 5 por 4. El número se deriva. |
| Guardado por fila + autosave | Además: **borrador en servidor** (sobrevive al cierre de pestaña y a cambiar de equipo), fotos subidas **al elegirlas** y no al guardar, **clave de idempotencia** (hoy un paso fallido puede duplicar), y **Deshacer 10 s** como en la Hoja del día. |
| Tira semanal de deuda | La tira incluye **las confirmadas sin parte** (hoy invisibles) y abre en **el día más viejo con deuda**, no en "ayer" (el lunes, "ayer" es domingo). |
| Cierre de OT + anomalías | Cierre de OT como **cola propia** (OTs con todas sus jornadas cerradas y sin finalizar) con el as-built mostrado como **diferencia contra el detalle técnico**, y anomalías basadas en **los datos reales medidos** (cuadrilla mediana 5, 74,5% de fletes = 1, 42% de desarmes con las horas copiadas del armado). |
| Atajos de teclado / una tarjeta en celular para el capataz | El capataz **no carga partes**: la decisión del dueño y el doc de la Hoja dicen "en el celular sólo se toca, no se escribe". El capataz declara en su link (3 toques); la tarjeta-a-la-vez en celular es para la **oficina cuando está fuera** (Juan Agustín en la calle). |

---

## 1. El trabajo real (quién, cuándo, desde dónde)

Lo reconstruyo de los comentarios y docs; donde es inferencia lo digo.

| | Hoy | Desde que hay Hoja del día |
|---|---|---|
| **Quién carga** | Alguien de oficina (Planificación/Operaciones; en la práctica Juan Agustín o quien él delegue). No estuvo en la obra. | Igual, más la opción de "Cerrar jornada" desde la tarjeta de la hoja después de las 16. |
| **Cuándo** | "A primera hora lo del día anterior" (por eso la fecha por defecto es ayer). Con los WhatsApp/Telegram de ayer abiertos al lado. | Puede cerrarse el mismo día a la tarde. |
| **Desde dónde** | Escritorio. Nada en la pantalla está pensado para teléfono (inputs de 32 px, textos de 10–11 px, filas de una línea con truncado). | Igual. |
| **Con qué información** | Memoria + mensajes de los capataces + notas del día (por eso `NotasDelDia` está arriba). | La hoja tiene: a cargo, integrantes, ausencias, contratistas, modo del chofer, viajes con "Hecho" a la hora real, "Recibido" del capataz. |
| **Volumen** | ~5 jornadas por día ("un día entero son cinco filas"). 1276 partes históricos. | 5 cuadrillas. |
| **Qué está en juego** | Costo de mano de obra (Odoo calcula hh × tarifa), informe de obra (margen, ritmo, sugerido de desarme), as-built para el desarme, constancia fotográfica ante reclamos. | Lo mismo. |

**Lo que eso implica para el diseño:** el usuario no es quien sabe; es quien **junta** lo que otros saben. La herramienta correcta no es un formulario más rápido sino una **mesa de verificación**: muestra lo que dicen las fuentes, marca dónde no coinciden, y pide decidir sólo eso.

---

## 2. Auditoría priorizada

Severidad: **S1** = pierde o corrompe datos que van al costo; **S2** = fricción que rompe el hábito o lleva a cargar mal; **S3** = inconsistencia/accesibilidad; **S4** = pulido.

### S1 — Datos

| # | Hallazgo | Dónde | Por qué importa |
|---|---|---|---|
| 1.1 | **Dos caminos de creación con capacidades distintas.** Hoja del día → `FormularioCierre` con precarga y varias líneas de mano de obra; `/partes` sin precarga y con una sola línea. El comentario de `page.tsx` ("ÚNICO lugar") y el de `tablero-board.tsx` ("con dos lugares terminan divergiendo") quedaron desactualizados. | `page.tsx` L31, `cerrar-jornada.tsx`, `formulario-cierre.tsx` L177 | El mismo día cargado por dos personas da partes distintos. El 409 evita el duplicado *por asignación*, no la divergencia de criterio. |
| 1.2 | **`/partes` no usa la precarga de la hoja.** Capataz vacío siempre, personas = dotación de la OT (no la gente que fue), horario 08–17 fijo. | `borradorDe()` | Es *el* dato que la hoja resolvió. Se vuelve a tipear de memoria lo que el sistema ya sabe, y la memoria pierde contra la hoja. |
| 1.3 | **El borrador vive en memoria**, fotos incluidas (base64 en `useState`). Sin `beforeunload`, sin persistencia local ni en servidor. | `page.tsx` `borradores` | Una recarga a las 9:40 se lleva 20 minutos de trabajo y las fotos. Las fotos son la constancia ante el cliente. |
| 1.4 | **"Confirmar como planificado" no termina nada.** Llena los borradores con el plan, pero el capataz arranca vacío y es obligatorio: ninguna fila queda guardable. El atajo produce filas "34 hh sin guardar" plegadas y un toast "N filas incompletas" recién al tocar Guardar. | `confirmarComoPlanificado()`, `erroresDe()` | O el atajo no sirve, o —si mañana se precarga el capataz— pasa a ser un "inventar hh" de un clic sin mirar. Tal como está, es lo peor de los dos mundos. |
| 1.5 | **Riesgo de duplicado si falla "marcar la jornada".** El parte se crea, el `write` del vínculo `x_parte_id` falla, la fila sigue "sin parte" en la próxima lectura y el próximo guardado crea otro. El código lo sabe (lo dice el comentario de `incompletos`) y sólo lo avisa en un toast. | `cerrarJornada()` en `lib/odoo/partes.ts` | No hay clave de idempotencia. Con autosave o reintentos automáticos esto se multiplica: es requisito, no mejora. |
| 1.6 | **Las horas por defecto (08:00–17:00) no se distinguen de las confirmadas.** Un parte con el horario por defecto intacto se ve igual que uno donde alguien chequeó. | `borradorDe()` | Es el origen del "42% de desarmes con exactamente las mismas horas que el armado" que encontró el informe de obra: artefacto de carga. |
| 1.7 | **Fotos al costo equivocado.** El parte sube fotos a Odoo (`x_aba_foto`, `ir.attachment`). El módulo de fotos de Telegram decidió explícitamente *no* hacerlo ("consume la cuota de Odoo Online, que se paga cara") y las guarda en Supabase Storage. | `crearFotos()` vs `fotos-telegram.ts` | Dos criterios de almacenamiento para la misma cosa; el de partes es el caro y el lento (por eso `maxDuration = 300`). |

### S2 — Fricción y carga cognitiva

| # | Hallazgo | Dónde |
|---|---|---|
| 2.1 | **La deuda no se ve**: badge = confirmadas sin parte de *cualquier* fecha; pantalla = el día + tentativas vencidas (60 días, máx. 50). Las confirmadas de días anteriores no tienen lugar. Para encontrar el pendiente del martes hay que ir día por día con la flecha. | `contarPendientes()` vs `fetchListadoJornadas()` |
| 2.2 | **El lunes abre en domingo.** "Ayer" es una regla de calendario, no de trabajo. | `useState(() => subDays(new Date(), 1))` |
| 2.3 | **Corregir un parte guardado no se puede desde acá, y no hay link.** La fila cargada se muestra en lectura y el comentario dice "para corregirlo está el formulario del tablero", pero no hay botón que lleve. | `FilaJornada` L602 |
| 2.4 | **El guardado masivo es un momento de ansiedad**: N escrituras secuenciales, progreso "Guardando 3 de 5", y el resultado repartido en hasta cuatro toasts (éxito, fotos, pasos fallidos, incompletas) que compiten. Lo importante (qué quedó mal en *qué fila*) termina en un toast, no en la fila. | `guardarTodo()` |
| 2.5 | **Corta en el primer error** (`break`): la fila 2 falla por un 502 de Odoo y la 3–5, que estaban bien, ni se intentan. | `guardarTodo()` |
| 2.6 | **La fila expandida es un formulario largo**: estado, personas, desde, hasta, 5 atajos, hh, capataz, fletes, quedó en obra, tercerizado, costo, observaciones, fotos, incidencia, cierre de OT, as-built. Todo al mismo nivel visual, aunque el 98% de los partes sólo necesita 3 de esos datos. | `FilaJornada` |
| 2.7 | **La fila plegada no dice lo que hay que decidir.** Muestra cuadrilla, dirección y "sin cargar". No muestra quién fue, ni si hay algo raro, ni qué falta. Para saber si una fila es "la fácil" hay que abrirla. | `FilaJornada` L213–270 |
| 2.8 | **Multi-obra se repite**: una cuadrilla con 3 obras exige elegir el mismo capataz 3 veces y razonar los horarios de cada obra a mano. La hoja ya los calcula (`horariosCierre`). | `FilaJornada` |
| 2.9 | **Una sola línea de mano de obra**: "5 de 8 a 12 y 3 de 12 a 17" no entra. O se miente el promedio o se va al tablero. | `aDatosCierre()` |
| 2.10 | **Contratistas invisibles**: la precarga los suma a las personas (decisión 5 del 10/10), pero en `/partes` nada dice "incluye 3 de Quintana". El costo se prorratea igual y nadie lo ve. | — |
| 2.11 | **"Falta el capataz" cuando nadie sabe quién estuvo** no tiene salida: la fila queda como borrador en memoria (ver 1.3) hasta que alguien pregunte por WhatsApp y vuelva. No existe el estado "esperando un dato". | `erroresDe()` |

### S3 — Consistencia y accesibilidad

| # | Hallazgo |
|---|---|
| 3.1 | **Colores hardcodeados** que rompen el tema oscuro del escritorio: fondo `#FDECEA` de "no ejecutado", chip `#FAEEDA/#854F0B` de "sin confirmar", `#B42318`, `#639922`, `#D92D20`. En oscuro, una fila rosa claro con texto claro. El resto del sistema ya tiene tokens (`OK`, `PELIGRO`, `text-hd-verde`). |
| 3.2 | **Botones-toggle sin `aria-pressed`** ("Se ejecutó / No se ejecutó", "Igual a lo previsto / Hubo diferencias", "Quedan más / Finalizar OT"): el estado elegido es sólo color de fondo. |
| 3.3 | **La fila plegada es un `<button>` sin `aria-expanded` ni `aria-controls`**; el ícono de estado (check/cruz/cuadrado punteado) no tiene texto alternativo. |
| 3.4 | **Tipografía de 9–11 px** en datos que se leen (peso de foto 9 px, ayudas 10 px, etiquetas 11 px). La Hoja del día de escritorio usa 13 px de base. |
| 3.5 | **Inputs de hora como texto libre** sin `inputMode="numeric"` ni patrón; los de personas sí lo tienen. |
| 3.6 | **Lenguaje mezclado**: "puntero" (Odoo, Hoja del día: "Jornada cerrada · puntero Ortega") vs "capataz" (`/partes`) vs "a cargo" (Hoja). Es la misma persona con tres nombres. |
| 3.7 | **Dos visuales para el mismo hecho**: "Jornada cerrada 17:20 · puntero Ortega, 5 personas" (Hoja) vs "5p · 08:00–17:00 · 1 flete 36 hh" (`/partes`). |
| 3.8 | **Código muerto que confunde**: `src/hooks/use-partes.ts` (tabla Supabase `partes_obra`, modelo viejo con firma, metros, clima) y la página de fichadas sobre la tabla vieja `obras`. Alguien que llegue nuevo va a creer que esos son los partes. |

### S4 — Pulido

- El link `?fecha=…&ot=…` resalta la fila pero no la abre ni hace scroll.
- El pie suma horas-hombre guardadas y en borrador en el mismo número, sin distinguirlas.
- "Agregar jornada no planificada" vive al final de la lista, debajo de todo; es justo la excepción que se olvida.
- Sin estado de error para la lista misma (si `/api/planificacion/jornadas` falla, queda el skeleton o la data vieja por `keepPreviousData`, sin aviso).

### Lo que está muy bien y hay que conservar

- **Derivar las filas de las asignaciones** en vez de materializar partes pendientes (`jornadas.ts`): la jornada vuelve a tentativa y desaparece sin borrar nada. Intocable.
- **La jornada perdida no se mueve, se reprograma creando otra**: preserva el registro de "se fue y no se pudo".
- **Personas vacío si la OT no tiene dotación**, nunca 1.
- **As-built precargado con el detalle técnico** y exigiendo que el texto cambie si dijeron "hubo diferencias".
- **"Qué hay que ejecutar" + técnico** en la fila.
- **Las 5 salidas como atajo** (cubren el 99%) y el turno que cruza la medianoche con "+1 día".
- **POST crea, nunca reescribe (409)**.
- **Guardar lo que está listo y dejar el resto** (sólo falta que no corte en el primer error).

---

## 3. Crítica honesta del concepto del líder

**Lo que está bien y me quedo:**
- **Triage en vez de formulario**: correcto. La pantalla tiene que preguntar "¿esto es así?" y no "¿qué pasó?".
- **El sistema propone, el humano confirma, con evidencia al lado**: es el principio central, y la Hoja del día ya lo practica ("Sugerido según la Hoja del día").
- **Guardado por fila**: correcto, y además resuelve 1.3, 2.4 y 2.5 de un saque.
- **Deuda visible por día**: correcto, y es la que forma el hábito (el badge solo no alcanza; dice cuánto pero no dónde).
- **Cierre de OT como momento propio**: correcto; hoy es un recuadro coral escondido al final de un formulario largo, y es una de las dos decisiones con consecuencias más largas (la otra es el as-built).

**Lo que hay que corregir:**

1. **"Como estaba previsto" en un toque es peligroso si "previsto" = el plan.** El plan es intención. El código ya lo dice: "Atajo, nunca la acción principal: usado sin mirar mete horas-hombre inventadas, que van derecho al costo de la obra". Un botón grande de "Como estaba previsto" convierte ese atajo en la acción principal. **La solución no es sacarlo sino condicionarlo**: el toque único existe cuando hay evidencia que confirma el plan (capataz declaró, hoja con "Recibido" y "Busca" hecho). Sin evidencia, la tarjeta pide lo mínimo (personas por nombre y un chip de horario) antes de confirmar.
2. **Las fuentes nombradas no son las que hay.**
   - *Fichadas*: es un módulo de QR con geocerca sobre la tabla Supabase vieja `obras` (uuid), no sobre las OT de Odoo. No hay señal de que se use en campo. No se puede prometer "horas desde fichadas".
   - *Fotos por Telegram*: `fotos_obra` se llenó con `importar-fotos-telegram.mjs`, un **import único** desde el export de Telegram Desktop ("un bot NO puede leer el historial del grupo"). Para que lleguen solas hay que sumar el bot al grupo (con modo privacidad desactivado) y atarlas a OT+fecha por la caption: es trabajo nuevo, y el matcher actual ata a la **venta**, no a la OT ni al día.
   - *Asistencia de Odoo* (`x_parte_diario`, de Juan Pablo): esa sí existe y la Hoja ya la lee. Dice presente/ausente, no horas.
   - *Viajes "Hecho" del chofer*: existen (`hecho_at`), tienen hora real, y nadie los usa como evidencia de horario. Son la mejor fuente de "a qué hora empezó y terminó" que hay hoy.
3. **La unidad no es la OT, es la cuadrilla-día.** La oficina recibe "lo de Ortega", no "lo de la OT 1432". Una cuadrilla con tres obras son tres filas y tres veces el mismo capataz en el concepto.
4. **El capataz no carga partes.** El concepto propone "una-tarjeta-a-la-vez en celular para el capataz". El doc de la Hoja (§12) dice "Nada de formularios: en el celular sólo se toca; no se escribe", y es decisión del dueño que el capataz no cambie gente ni horarios. Lo que sí puede hacer es **declarar** con botones grandes, igual que "Recibido" y "Hecho". La confirmación queda en la oficina.
5. **Le falta un estado.** Tres decisiones no alcanzan: lo que más traba hoy es la fila que **no se puede decidir** ("nadie sabe quién estuvo a cargo"). Necesita un lugar propio, persistente, con a quién preguntarle y un botón para preguntar.
6. **Autosave sin idempotencia es más peligroso que el botón Guardar.** Hoy el riesgo de duplicado está acotado a un clic humano; con reintentos automáticos se repite solo. Primero la clave, después el autosave.

---

## 4. Principios de diseño

1. **Confirmar, no reconstruir.** Toda pantalla arranca con lo que el sistema ya sabe. Si un campo está vacío, es porque nadie lo sabe, y eso se dice.
2. **Cada dato dice de dónde salió.** Cuatro niveles, siempre visibles: **Declarado** (lo dijo el capataz) · **Registrado** (lo vio el sistema: "Hecho 16:32") · **Según la hoja** (estaba planeado en la hoja del día) · **Según el plan** (sólo el tablero / la OT). Lo cargado a mano se marca **Corregido**.
3. **El toque único se gana con evidencia.** Confirmar en un toque está disponible cuando los datos que van al costo (personas, horario) tienen al menos un nivel *Registrado* o *Declarado*. Si no, la tarjeta pide lo mínimo.
4. **Lo raro sube solo.** Nadie tiene que abrir una tarjeta para saber si es fácil. Las diferencias entre fuentes y las anomalías se ven plegadas.
5. **Nada vive sólo en la pantalla.** Cada toque se guarda en el servidor al instante; el parte en Odoo se escribe una vez, con clave, y con 10 s para deshacer.
6. **Una persona, un nombre.** "A cargo" en todos lados (como la Hoja); "puntero" queda como nombre técnico de Odoo.
7. **La fuente declara, la oficina confirma.** El capataz no edita el parte; el parte no se escribe sin una persona de oficina.
8. **La deuda tiene fecha.** El pendiente se muestra en el día en que pasó, y la pantalla abre en el más viejo.
9. **Las consecuencias largas se preguntan aparte.** Cerrar una OT y el as-built no son un campo del parte: son un paso con su propia pantalla y su propio "¿seguro?".

---

## 5. El nuevo modelo

### 5.1 De "parte" a "jornada confirmada en dos firmas"

```
         TABLERO                 HOJA DEL DÍA                 CAPATAZ (link /h/…)            OFICINA (/partes)               ODOO
    ───────────────          ───────────────────          ─────────────────────────        ──────────────────────         ──────────
    asignación (plan)  ──▶  quién va, a cargo,      ──▶  16:00+ "¿Cómo terminó?"     ──▶  cola de triage por        ──▶  x_aba_parte_diario
    fracción, OT             chofer, viajes, Hecho         [Así fue] [Distinto] [No]        cuadrilla-día, con            (una escritura,
                             (Registrado)                  (Declarado)                      evidencia y diferencias       con clave)
                                                                                            [Confirmar] → 10 s Deshacer
                                                                                            [Falta un dato] → pregunta
                                                                                            por Telegram
```

- **La asignación es la intención; la declaración es el testimonio; el parte es el hecho confirmado.** Conviven, como dice el §13 de la Hoja.
- La **declaración del capataz** y el **borrador de la oficina** viven en Supabase (son datos de proceso, nadie los lee desde Odoo: mismo criterio de §14 de la Hoja). El **parte** sigue en Odoo, sin cambios de modelo.
- `/partes` y "Cerrar jornada" de la Hoja pasan a usar **el mismo componente de confirmación** (ver §7). Un solo camino de creación con dos puertas.

### 5.2 El flujo del capataz (nuevo, 3 toques, ~15 s)

A partir de la hora de fin de jornada (parámetro de la hoja; hoy `finJornada` = 17) o cuando el chofer marca "Hecho" en el "Busca", el link `/h/<token>` y el bot de Telegram le muestran al **a cargo**:

1. **"¿Cómo terminó Rivadavia 6150?"** → `[ Así fue ]` `[ Hubo cambios ]` `[ No se pudo ]`
   - Debajo, lo que está diciendo que "fue así": "Vos + Cabrera, Acosta, Villalba, Ramírez · hasta 16:30".
2. Si **Hubo cambios**: chips grandes con los nombres; toca **a quien no fue** (o "Se fue antes" → 12:00 / 15:00), y un chip "Terminamos a las…" con 4 horas. Sin teclado.
   Si **No se pudo**: los mismos motivos de `MOTIVOS_NO_EJEC` en botones grandes (igual que el "No pude" del chofer).
3. **"¿Terminó la obra?"** sólo si es la última jornada de la OT: `[ Sí, terminamos ]` `[ Quedan días ]`. Si es armado y dice que sí: `[ Quedó como el plano ]` `[ Quedó distinto — te llama ${técnico} ]`. El texto del as-built lo escribe la oficina; el capataz sólo marca que hubo diferencia (y queda la tarea "llamar a Ortega por el as-built").
4. **"Mandá las fotos"** (opcional): botón de cámara del link; sube directo a Storage atado a OT+fecha. O, en Telegram, mandarlas como respuesta al mensaje del bot (ver §9, fase 3).

Si sin señal: queda "Mandado · se envía cuando vuelva la señal", con la hora del toque (patrón que la Hoja ya tiene).

> Por qué esto respeta las decisiones del dueño: el capataz no cambia gente, horarios ni instrucciones del plan; **testimonia** lo que pasó. Es el mismo gesto que "Recibido".

### 5.3 El flujo de la oficina (la mañana)

1. **Abre `/partes`.** Llega al **día más viejo con deuda** (si no hay deuda vieja, al último día hábil). Arriba, la tira semanal.
2. **Ve una tarjeta por cuadrilla-día**, ordenadas por "cuánto hay que pensar": primero las que tienen diferencias o anomalías, al final las listas para confirmar. (Orden alternativo por cuadrilla, para quien prefiere el orden fijo; se recuerda la preferencia.)
3. **Tarjeta lista** (declaración del capataz + hoja coinciden): una oración y un botón. `Confirmar` (o `Enter`) → la tarjeta se pliega en "Confirmado · Deshacer" y el foco pasa a la siguiente. Escritura a Odoo a los 10 s.
4. **Tarjeta con diferencias**: la diferencia está resaltada en la oración ("Ortega dijo **4**; la hoja tenía **5** — Ávila figura ausente en la asistencia"). Se elige qué fuente vale con un toque, o se corrige.
5. **Tarjeta sin evidencia** (no hubo hoja, el capataz no declaró): pide los mínimos — quién estuvo a cargo, personas (chips por nombre si hay hoja; número si no) y un chip de horario. Nada más está a la vista.
6. **No se puede decidir**: `Falta un dato` → elige qué falta (a cargo / personas / horario / si se hizo) y a quién preguntarle (el a cargo, el técnico, el chofer). `Preguntar por Telegram` le manda un mensaje con botones ("¿Quién estuvo a cargo en Juramento el martes? [Conte] [Miño H.] [Otro — llamame]"). La tarjeta queda en **"Esperando a Conte"** en la tira, persistida. La respuesta la vuelve a poner como "lista".
7. **Excepciones** (incidencia, flete tercerizado y su costo, observaciones, más fotos): en `Más…` dentro de la tarjeta, que abre el editor completo (el mismo de hoy, reordenado; ver §7.4).
8. **Cierres de OT**: los que surgieron en la mañana van a una **cola aparte** ("3 obras para cerrar"), no dentro del parte. Ver §5.5.
9. **Al terminar**: "Martes 13 confirmado · 5 jornadas · 168 hh (un martes normal: 150–190)". Si se va del rango, se dice cuál tarjeta empuja.

### 5.4 Niveles de evidencia, por dato

| Dato | Registrado (lo vio el sistema) | Declarado (capataz) | Según la hoja | Según el plan |
|---|---|---|---|---|
| **¿Se hizo?** | "Lleva" hecho a la obra + "Busca" hecho | Así fue / No se pudo | Hoja enviada y "Recibido" | Asignación confirmada |
| **A cargo** | — | Quien declara (si es el a cargo de la hoja) | `aCargoDe(h)` | Responsable de cuadrilla (desactualizado: no usar) |
| **Personas** | Asistencia de Odoo (presentes) | Nombres que no tocó como ausentes | Integrantes − ausencias + contratistas | Dotación de la OT |
| **Desde** | `hecho_at` del "Lleva" a esa obra / encuentro | "Empezamos a las…" (sólo si cambió) | Hora de la obra en la hoja | 08:00 |
| **Hasta** | `hecho_at` del "Busca" / del "Lleva" a la siguiente obra | "Terminamos a las…" | `horariosCierre()` | 17:00 o fracción × 8 |
| **Fletes** | Viajes hechos a esa OT (`fletesDelDia`) | — | Viajes planeados | 1 (regla vigente) |
| **Camión en obra** | — | — | Modo "todo el día" | No |
| **Fotos** | Subidas desde el link / Telegram con OT+fecha | — | — | — |

Regla de **un toque**: *¿Se hizo?*, *personas* y *hasta* tienen nivel Registrado o Declarado, y no hay diferencia entre fuentes de más de 1 persona o 30 minutos. Todo lo demás puede venir de la hoja o del plan (está marcado).

### 5.5 Cierre de OT como momento propio

- **Cuándo aparece**: una OT entra en la cola "Para cerrar" cuando (a) se confirma el parte de su `ultimaDeLaOt`, o (b) el capataz dijo "Sí, terminamos", o (c) tiene todas sus jornadas con parte y sigue en proceso hace más de 3 días (hoy "acumula OTs abiertas para siempre", dice `formulario-cierre.tsx`).
- **La pantalla de cierre** (un panel lateral):
  1. "¿Terminó Rivadavia 6150 · Armado?" con la evidencia: jornadas hechas vs estimadas (`x_duracion_est`), lo que dijo el capataz, última foto "Terminado".
  2. **As-built como diferencia**: a la izquierda el detalle técnico de la OT, a la derecha un editor que arranca con ese texto; los cambios se resaltan (diff de palabras). Botón principal `Quedó igual`. Si el capataz marcó "Quedó distinto", el botón principal es `Llamar a Ortega` y `Quedó igual` queda secundario.
  3. "Esto es lo que va a leer Comercial para emitir el desarme" (copy actual, se conserva).
  4. Si es armado y queda desarme pendiente: el sugerido de desarme del informe de obra ("Sugerido: 2 jornadas. El armado llevó 3").
- **Quién**: la oficina. El técnico de la obra (`tecnico`) recibe aviso en la campanita cuando hay as-built con diferencias.

### 5.6 Anomalías (de horas-hombre y otras)

Reglas iniciales, todas derivadas de lo medido en el repo; cada una dice **por qué** y **contra qué**:

| Regla | Umbral inicial | Fuente del umbral |
|---|---|---|
| Personas fuera de rango | < 2 o > 8 | Cuadrilla mediana 5 (54,8% de 1300 líneas) |
| hh muy por encima de la fracción planificada | hh > fracción × 8 × personas previstas × 1,3 | Escala de `x_duracion_est` (1 = 8 h) |
| Horario por defecto intacto en una jornada parcial | 08–17 con fracción ≤ ½ | `ATAJOS_SALIDA`, 5 salidas cubren el 99% |
| Horas copiadas | Mismas personas y horario que el parte anterior de la misma obra (y en desarme, que el armado) | 42% de desarmes con horas idénticas al armado (informe de obra) |
| Fletes atípicos | ≥ 3 en una jornada | 74,5% de las líneas de flete = 1 |
| Turno largo | > 10 h efectivas | `MAX_HORAS_TURNO` = 12 (el rechazo duro); 10 es aviso |
| Contratistas sin cantidad | contratista en la hoja sin "cuántos" | `problemas()` de la hoja |
| Día total fuera de banda | hh del día fuera de p10–p90 del mismo día de semana, 8 semanas | nuevo (endpoint de historia) |

Una anomalía **no bloquea**: cambia el botón de "Confirmar" a "Confirmar igual" y pide un toque más, y queda registrada para el informe de obra (que ya tiene "Detección de inconsistencias").

---

## 6. Arquitectura de pantalla

### 6.1 Escritorio — `/partes`

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Partes                                                              [ + Jornada no planificada ]│
│                                                                                                │
│ ┌─ Semana ──────────────────────────────────────────────────────────────────────────── ‹  › ─┐ │
│ │  Más viejas   Lun 5   Mar 6   Mié 7   Jue 8   Vie 9   Sáb 10   Dom 11                       │ │
│ │     ●2          ✓       ●1      ✓      ◐3      ●5      ·        ·                           │ │
│ │                                         ▲ esperando 1                                       │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────── ┘ │
│                                                                                                │
│ Sábado 10 de octubre · 5 jornadas en 3 cuadrillas · 2 listas · 2 para revisar · 1 sin datos     │
│ Nota: Faltó el chofer de la C2 a la mañana (Juan Agustín, 7:10)                       Ver / Anotar │
│                                                                                                │
│ ── Para revisar ───────────────────────────────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ▾ Cuadrilla 3 · a cargo Ortega                         Declarado 16:41 por Ortega         │ │
│ │                                                                                          │ │
│ │   ↓ Rivadavia 6150 · Desarme · día 2 de 3                                     Téc. JS    │ │
│ │   Ortega + Cabrera, Acosta, Villalba, ~~Ávila~~ · 7:45–16:30 · 30 hh · 2 fletes          │ │
│ │   ▲ Ortega dijo 4 personas; la hoja tenía 5. La asistencia marca a Ávila ausente.        │ │
│ │       [ Vale lo de Ortega (4) ]   [ Vale la hoja (5) ]                                   │ │
│ │   Evidencia: Lleva hecho 8:22 · Busca hecho 16:32 · 6 fotos (ver)                        │ │
│ │                                                                                          │ │
│ │   [ Confirmar ↵ ]   No se hizo   Falta un dato   Más…                                    │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ▸ Cuadrilla 2 · a cargo Conte · 3 obras          ⚠ 52 hh: más de lo habitual para ½+½+¼  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                │
│ ── Sin datos de la obra ───────────────────────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ▾ Sin cuadrilla en la hoja · Gurruchaga 1650 · Ampliación                Según el plan   │ │
│ │   No hubo hoja ese día para esta obra: completá lo mínimo.                               │ │
│ │   A cargo  [ Buscar…            ]   Personas [ 5 ]   Terminaron  [12:00][15:00][17:00][…]│ │
│ │   [ Confirmar ]   No se hizo   Falta un dato                                             │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                │
│ ── Listas para confirmar (2) ──────────────────────────────── [ Confirmar las 2 · ⇧↵ ]─────── │
│ │ ▸ Cuadrilla 1 · Sack · Juramento 2145 · Armado ½   Sack + 4 · 8:00–12:15 · 21 hh  Declarado│ │
│ │ ▸ Cuadrilla 4 · Hepper · Cabildo 3260 · Armado 1   Hepper + 5 · 7:50–16:55 · 47 hh Declarado│ │
│                                                                                                │
│ ── Confirmadas (0) ──────────────────────────────────────────────────────────────────────────  │
│                                                                                                │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Sábado: 0 de 5 confirmadas · 0 hh   ·   Un sábado normal: 80–140 hh      2 obras para cerrar│ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Notas:
- **Tres grupos fijos** ("Para revisar", "Sin datos de la obra", "Listas") y "Confirmadas" plegado al final. Confirmar en lote **sólo** existe para el grupo "Listas", que por definición tiene evidencia. Reemplaza a "Confirmar como planificado".
- **Tachado** para quien no fue: se lee de un vistazo y es reversible con un clic en el nombre.
- **Cuadrilla con varias obras**: la cabecera lleva el a cargo y la gente una vez; adentro, una línea por obra con su tramo horario (`horariosCierre`). Confirmar la tarjeta confirma todas sus obras (cada una es su propio parte en Odoo, como hoy).
- **"Más…"** abre el editor completo dentro de la tarjeta (no un modal).
- **Tira semanal**: `✓` todo confirmado, `●N` N sin confirmar, `◐N` parcial, `·` sin jornadas, "esperando N" debajo cuando hay preguntas abiertas. "Más viejas" agrupa todo lo anterior a la semana con su cuenta (y abre una lista por fecha).
- **"2 obras para cerrar"** en el pie abre la cola de cierres de OT.

**Atajos de teclado** (con `?` muestra la ayuda; foco visible siempre):

| Tecla | Acción |
|---|---|
| `J` / `K` o `↓` / `↑` | Tarjeta siguiente / anterior |
| `Enter` | Confirmar la tarjeta con foco (si pide "Confirmar igual", el segundo `Enter`) |
| `⇧ Enter` | Confirmar todas las "Listas" |
| `N` | No se hizo → foco en los motivos (`1`–`7` eligen) |
| `D` | Falta un dato |
| `E` o `Espacio` | Abrir / plegar ("Más…") |
| `1` / `2` | En una diferencia, elegir fuente izquierda / derecha |
| `Z` o `⌘Z` | Deshacer la última confirmación (mientras dure la ventana) |
| `[` / `]` | Día anterior / siguiente con deuda |
| `F` | Agregar fotos a la tarjeta con foco |

### 6.2 Celular — la oficina fuera de la oficina (una tarjeta a la vez)

```
┌───────────────────────────────┐
│ ‹  Sábado 10        2 de 5  › │
│ ▓▓▓▓░░░░░░  ● ● ◐ ○ ○         │
├───────────────────────────────┤
│ Cuadrilla 3 · Ortega          │
│ Declarado 16:41               │
│                               │
│ ↓ Rivadavia 6150              │
│ Desarme · día 2 de 3          │
│                               │
│ Quiénes fueron                │
│ [Ortega ✓][Cabrera ✓]         │
│ [Acosta ✓][Villalba ✓]        │
│ [Ávila ✗ ausente]             │
│                               │
│ 7:45 → 16:30  ·  30 hh        │
│ Busca hecho 16:32             │
│                               │
│ ⚠ Ortega dijo 4; la hoja 5.   │
│                               │
│ [ 6 fotos ▢▢▢ ]               │
├───────────────────────────────┤
│ [ No se hizo ] [ Falta dato ] │
│ [         Confirmar         ] │  ← 56 px, coral, al pulgar
└───────────────────────────────┘
```
- Deslizar a la izquierda = siguiente sin decidir; nunca "deslizar para confirmar" (un gesto accidental no puede escribir costo).
- Confirmar → "Confirmado · Deshacer" 10 s abajo, y pasa sola a la siguiente.

### 6.3 Celular — el capataz (en `/h/<token>`, después del fin de jornada)

```
┌───────────────────────────────┐
│ Sábado 10 · Cuadrilla 3       │
├───────────────────────────────┤
│ ¿Cómo terminó                 │
│ Rivadavia 6150?               │
│                               │
│ Vos + Cabrera, Acosta,        │
│ Villalba, Ávila · hasta 16:30 │
│                               │
│ [        Así fue          ]   │
│ [      Hubo cambios       ]   │
│ [      No se pudo         ]   │
│                               │
│ [ Mandar fotos ]              │
└───────────────────────────────┘
        │ Hubo cambios
        ▼
┌───────────────────────────────┐
│ Tocá a quien NO fue           │
│ [Cabrera ][Acosta  ]          │
│ [Villalba][Ávila ✗ ]          │
│                               │
│ Terminamos a las              │
│ [12:00][15:00][16:30][17:00]  │
│                               │
│ [          Listo           ]  │
└───────────────────────────────┘
        ▼ (si es la última jornada)
┌───────────────────────────────┐
│ ¿Terminó la obra?             │
│ [   Sí, terminamos   ]        │
│ [    Quedan días     ]        │
│        ▼ Sí + armado          │
│ [ Quedó como el plano ]       │
│ [ Quedó distinto      ]       │
│   (te llama JS para anotarlo) │
└───────────────────────────────┘
```
Mismo estilo del link actual: claro siempre, 17 px, botones de 56 px, nada de teclado.

---

## 7. Componentes y estados clave

### 7.1 `TarjetaJornada` (cuadrilla-día)

| Estado | Visual | Acción principal |
|---|---|---|
| **Lista** | Una línea; chip "Declarado"/"Registrado" | `Confirmar` |
| **Con diferencias** | Abierta; la diferencia en la oración con dos botones de fuente | Elegir fuente → `Confirmar` |
| **Con anomalía** | Línea con ⚠ y el motivo en palabras | `Confirmar igual` (dos pasos) |
| **Sin evidencia** | Abierta con los 3 mínimos | Completar → `Confirmar` |
| **Falta un dato** | Plegada, chip ámbar "Esperando a Conte · preguntado 8:12" | `Ver respuesta` / `Preguntar de nuevo` / `Lo resuelvo yo` |
| **Guardando** (ventana de 10 s) | Verde tenue, "Confirmado · Deshacer (8)" | `Deshacer` |
| **Escribiendo en Odoo** | Spinner chico en el chip, no bloquea | — |
| **Confirmada** | Va al grupo "Confirmadas"; "Cerrada 9:14 por Juan Agustín · a cargo Ortega, 4 personas · 30 hh" (mismo texto que la Hoja) | `Corregir` (PATCH, editor completo) |
| **Confirmada con avisos** | Como confirmada + franja ámbar *en la tarjeta*: "Las 2 fotos no subieron · Reintentar" / "La jornada no quedó marcada · Reintentar vínculo" | Reintentar el paso, idempotente |
| **Error al confirmar** | Franja roja en la tarjeta, el borrador intacto | `Reintentar` |
| **No se hizo** | Fondo con token `PELIGRO` tenue (no hex); motivo + "Reprogramada al 14/10" o "Volvió a la bandeja" | `Corregir` |
| **Conflicto** (otro la confirmó mientras tanto, 409) | "Conte la confirmó desde la Hoja del día a las 17:20" + lo que dice ese parte | `Ver parte` / `Descartar mi borrador` |

### 7.2 `ChipEvidencia`

Cuatro variantes con ícono + texto (nunca sólo color): **Declarado** (persona), **Registrado** (reloj), **Según la hoja** (hoja), **Según el plan** (tablero, en gris y con borde punteado: es la que hay que mirar). Tooltip con el detalle: "Busca marcado Hecho por Kiska a las 16:32".

### 7.3 `TiraSemana`

- Botones de día con `aria-label="Martes 6: 1 sin confirmar"`; navegable con flechas; el día actual de trabajo con borde.
- Estado de carga por día (no bloquea la tarjeta abierta).
- **Error**: "No se pudo traer la semana · Reintentar" en la tira; las tarjetas del día abierto siguen.

### 7.4 Editor completo ("Más…")

El formulario de hoy, **reordenado por frecuencia** y en dos columnas en escritorio: (1) gente y horario —con **varias líneas** de mano de obra, como en `FormularioCierre`—, (2) fletes y camión, (3) fotos, (4) observaciones, (5) incidencia (oculta hasta pedirla, como hoy). El cierre de OT **sale** de acá (va a su cola). Es un solo componente para `/partes`, la Hoja del día y el tablero (reemplaza la duplicación entre `fila-jornada.tsx` y `formulario-cierre.tsx`).

### 7.5 `PanelFotos`

- Subida **al elegir**: cada foto pasa por `comprimirFoto` y sube a Supabase Storage con estado por foto (subiendo / lista / falló · reintentar). El borrador guarda la ruta, no el base64.
- Fotos **sugeridas**: las que llegaron por el link o por Telegram para esa OT y esa fecha aparecen como "Sugeridas (6) · Sumar todas".
- Momento por foto (como hoy), con "Terminado" por defecto.

### 7.6 Estados de pantalla

| Estado | Qué se ve |
|---|---|
| **Vacío — no hay deuda** | "Todo confirmado hasta el viernes 9. La próxima jornada para confirmar es la de hoy, después de las 17." |
| **Vacío — día sin jornadas** | "El domingo 11 no tuvo jornadas en el tablero. ¿Se trabajó igual? [+ Jornada no planificada]" |
| **Fecha futura** | "El lunes 12 todavía no pasó. Para planificar, andá al tablero." |
| **Cargando** | Skeleton con la forma de las tarjetas; la tira semanal primero. |
| **Odoo lento/caído** | Las tarjetas se ven (vienen de Supabase + caché); confirmar queda en cola: "Odoo no responde. Tus confirmaciones quedan guardadas y se mandan solas." |
| **Lista de empleados no disponible** | Como hoy (bien resuelto): "No se pudo traer la lista de empleados de Odoo · Reintentar", **pero** si la hoja tiene a cargo, se usa ese y no se bloquea. |
| **Sin conexión (escritorio)** | Franja: "Sin conexión. Lo que confirmes se guarda en este equipo y se manda cuando vuelva." Borrador en IndexedDB además del servidor. |
| **Salir con cosas a medias** | No hace falta preguntar: está todo guardado. Sólo se avisa si hay una foto subiendo. |

### 7.7 Accesibilidad (requisitos)

- Toggles con `aria-pressed`; tarjetas plegables con `aria-expanded`/`aria-controls`; el estado de cada tarjeta en texto (no sólo ícono).
- Colores sólo desde tokens con variante oscura; contraste AA medido en los dos temas.
- Texto mínimo 12 px en datos, 13 px en lo que se lee de corrido.
- Atajos de una letra desactivables y nunca activos dentro de un campo de texto.
- El "Deshacer" se anuncia por `aria-live="polite"`; los errores por `assertive`.
- Objetivos táctiles de 44 px en la vista de celular de oficina, 56 px en el link del capataz.

---

## 8. Microcopy

**Botones principales**
- `Confirmar` · `Confirmar igual` (con anomalía) · `Confirmar las 2` (lote de listas)
- `No se hizo` · `Falta un dato` · `Más…` · `Corregir`
- Capataz: `Así fue` · `Hubo cambios` · `No se pudo` · `Listo` · `Sí, terminamos` · `Quedan días` · `Quedó como el plano` · `Quedó distinto`

**Oraciones de la tarjeta**
- Lista: "Ortega + 4 · 7:45–16:30 · 30 hh · 2 fletes"
- Diferencia: "Ortega dijo **4 personas**; la hoja tenía **5**. La asistencia marca a Ávila ausente."
- Diferencia de horario: "La hoja decía hasta las 17:00; a las **16:32** Kiska marcó que los buscó."
- Sin evidencia: "No hubo hoja ese día para esta obra: completá lo mínimo."
- Contratistas: "Incluye 3 de Quintana (se pagan por jornada)."
- Horario por defecto: "8 a 17 es el horario de siempre, no lo dijo nadie. ¿Fue así?"

**Anomalías** (siempre "qué" + "contra qué")
- "52 hh: más de lo habitual para ½ + ½ + ¼ jornada con 5 personas (≈ 50 máx.)."
- "Mismas personas y horario que el armado de esta obra. ¿Se copió?"
- "3 fletes en una jornada: 3 de cada 4 jornadas llevan 1."
- "El sábado da 210 hh; un sábado normal es 80–140. Lo que más suma: Cuadrilla 2 (52 hh)."

**Falta un dato**
- Título: "¿Qué falta para confirmarla?"
- Opciones: "Quién estuvo a cargo" · "Cuántos fueron" · "A qué hora terminaron" · "Si se hizo"
- Botón: `Preguntarle a Conte por Telegram` · secundario `Lo averiguo yo`
- Chip: "Esperando a Conte · preguntado 8:12"
- Mensaje del bot: "Hola Conte. ¿Quién estuvo a cargo en Juramento 2145 el martes 6? [Yo] [Miño H.] [Otro, te llamo]"

**Confirmación y errores**
- "Confirmado · Deshacer (10)"
- "Cerrada 9:14 por Juan Agustín · a cargo Ortega, 4 personas · 30 hh"
- "Se guardó el parte, pero 2 fotos no subieron. Las tenés acá: `Reintentar`."
- "Se guardó el parte, pero no quedó marcado en el tablero. `Reintentar` (no crea otro parte)."
- "Odoo no responde. Tus confirmaciones quedan guardadas y se mandan solas."
- "Conte ya la confirmó desde la Hoja del día a las 17:20."

**Tira y deuda**
- "Más viejas · 2" → "2 jornadas de antes del lunes 5 sin confirmar"
- Badge del sidebar, title: "7 jornadas sin confirmar, la más vieja del jueves 1"

**Cierre de OT**
- "¿Terminó Rivadavia 6150 · Armado? Se hicieron 3 de 3 jornadas estimadas. Ortega dijo «Sí, terminamos» a las 16:41."
- "Así quedó armado. Esto es lo que va a leer Comercial para emitir el desarme."
- "Ortega marcó que quedó distinto al plano. Llamalo antes de cerrar: `Llamar a Ortega`."

**Vocabulario**: "a cargo" (no capataz/puntero), "confirmar" (no guardar/cargar), "jornada" (no parte, en la UI; "parte" queda para el registro de Odoo y para "Ver parte").

---

## 9. Datos y back-end

### 9.1 Lo que ya existe y se reusa

| Pieza | Dónde | Uso en la propuesta |
|---|---|---|
| Listado derivado de asignaciones | `fetchListadoJornadas` | Base de las tarjetas (agrupar por cuadrilla en el cliente) |
| Precarga de cierre desde la hoja | `GET /api/hoja-dia/cierre`, `precargaCierre`, `horariosCierre` | Nivel "Según la hoja": a cargo, personas, tramos, camión, fletes |
| Viajes con `hecho_at` | `hd_viajes` | Nivel "Registrado" para desde/hasta y fletes |
| "Recibido" del capataz | `hd_links.snap_recibido` | Evidencia de "se hizo" |
| Asistencia de Odoo | `x_parte_diario` (ya leída por `leerDia`) | Nivel "Registrado" para personas |
| Ausencias y contratistas | `hd_ausencias`, `hd_hoja_contratistas` | Personas y la nota de contratistas |
| Cierre de parte | `POST/PATCH /api/planificacion/partes`, 409 si ya hay | Escritura final (sin cambios de modelo en Odoo) |
| Aviso de duplicado OT+fecha | `cerrarJornada()` | Se mantiene |
| Bot de Telegram con botones y callbacks | `lib/hoja-dia/telegram.ts`, webhook | Declaración del capataz y "Falta un dato" |
| Link del capataz con cola sin señal | `/h/[token]`, `/api/public/hoja/[token]` | Pantalla de declaración |
| Historial + Deshacer | `hd_historial`, `deshacer-regla.ts` | Patrón para "Confirmado · Deshacer" |
| Fotos en Storage | bucket `obras`, `fotos_obra` | Destino de las fotos del parte |
| Compresión en el cliente | `comprimirFoto` | Igual |
| Notas del día | `useNotasJornada` | Igual |
| Detección de inconsistencias | informe de obra | Recibe las anomalías confirmadas "igual" |

### 9.2 Lo nuevo

| Pieza | Qué es | Dónde |
|---|---|---|
| **`hd_cierres`** (declaración del capataz) | `asignacion_id` u `ot_id+fecha+cuadrilla`, `resultado` (así_fue / cambios / no_se_pudo), `ausentes[]`, `hasta`, `motivo`, `obra_terminada`, `asbuilt_distinto`, `declarado_por`, `declarado_at`, `origen` (link/telegram). | Supabase, RLS como `hd_*`, entra en `hd_aplicar` e historial |
| **`partes_borradores`** | Borrador por asignación: JSON del borrador, rutas de fotos, `estado` (borrador / esperando / confirmando / confirmado / error), `esperando` (qué falta, a quién, `preguntado_at`), `clave` (uuid de idempotencia), `parte_id` cuando se crea, `actualizado_por/at`. | Supabase |
| **Idempotencia del cierre** | El POST recibe `clave`. Antes de crear: si `partes_borradores.parte_id` ya existe para esa clave, **no crea**: completa los pasos que faltan (vincular, fotos, OT). Opcional en Odoo: campo `x_app_ref` en `x_aba_parte_diario` para buscar por clave. | `lib/odoo/partes.ts` + ruta |
| **Outbox con ventana de deshacer** | Confirmar marca `confirmando` con `escribir_desde = now()+10s`; un procesador (la misma ruta con un `after()` o un cron de 1 min) escribe a Odoo. Deshacer = volver a `borrador` si todavía no se escribió. | Supabase + ruta |
| **Reintentar pasos sueltos** | `POST /api/planificacion/partes/:id/pasos` { vincular / fotos / ot }: idempotente, sin crear parte. | Ruta nueva |
| **Listado semanal de deuda** | `GET /api/planificacion/jornadas/semana?desde=` → por día: total, confirmadas, pendientes (confirmadas **y** tentativas), esperando; más "más viejas" con el mismo límite que el badge. **Unifica badge y pantalla.** | `lib/odoo/jornadas.ts` (un `read_group` por fecha) |
| **Evidencia por jornada** | `GET /api/partes/evidencia?fecha=` → por asignación: precarga de hoja, `hd_cierres`, viajes hechos, asistencia, fotos sugeridas, y los niveles calculados. Lógica pura en `lib/partes/evidencia.ts` (testeable, como `estado.ts`). | Nuevo |
| **Fotos del parte en Storage** | Subida directa (URL firmada), `fotos_obra` con `ot_id`, `fecha`, `parte_id`, `origen` (parte/link/telegram). Decidir si a Odoo va la foto o un link (ver pendientes). | Supabase |
| **Ingesta viva del grupo de Telegram** | Sumar el bot al grupo de fotos, desactivar privacidad, guardar fotos con caption/autor/hora; matcher de `importar-fotos-telegram.mjs` adaptado a OT + fecha + cuadrilla del autor (la hoja sabe en qué obra estaba ese autor ese día: eso sube mucho la confianza). | Webhook existente |
| **"Falta un dato" por Telegram** | Mensaje con botones, callback `q:<borrador>:<opción>`, respuesta escribe en el borrador y lo vuelve "listo". | Bot existente |
| **Bandas de normalidad** | `GET /api/partes/normal?dia_semana=&tipo=` → p10/p50/p90 de hh por día de semana (8 semanas) y por tipo+fracción (12 meses). Cacheado 1 día. | Odoo `read_group` + caché |
| **Cola de cierres de OT** | Derivada (sin tabla): OTs en proceso con última jornada con parte, o con `hd_cierres.obra_terminada`, o con todas las jornadas cerradas hace > 3 días. | `lib/odoo/` |

### 9.3 Lo que se borra o se ordena

- `src/hooks/use-partes.ts` (Supabase `partes_obra`) y la referencia M17 vieja: **borrar** o mover a `archivo`.
- Fichadas: decidir si sigue (y migrarla a OT) o se esconde del menú. No tomarla como fuente.
- Unificar `fila-jornada.tsx` y la parte de edición de `formulario-cierre.tsx` en un solo editor.

---

## 10. Métricas de éxito

**Línea de base** (medir antes de tocar nada, una semana): hay que instrumentar, hoy no se registra.

| Métrica | Cómo se mide | Objetivo a 8 semanas |
|---|---|---|
| **Puntualidad**: % jornadas confirmadas antes de las 10:00 del día hábil siguiente | `creadoAt` del parte vs fecha | ≥ 85% |
| **Deuda**: jornadas sin confirmar con más de 2 días hábiles | endpoint semanal | ≤ 2 sostenido; badge rara vez > 5 |
| **Tiempo por jornada**: mediana de segundos desde abrir la tarjeta hasta confirmar | evento cliente | < 15 s en "Listas", < 60 s en "Para revisar" |
| **Confirmación con evidencia**: % partes confirmados con personas y hasta en nivel Registrado/Declarado | `partes_borradores` | ≥ 70% |
| **Declaración del capataz**: % jornadas con `hd_cierres` | Supabase | ≥ 60% a 8 semanas (depende de Telegram activo) |
| **Calidad**: % partes corregidos después (PATCH) en los 14 días siguientes | `useEditarParte` / historial | < 5% |
| **Horas por defecto**: % partes con 08:00–17:00 exacto en jornadas ≤ ½ | Odoo | → 0 |
| **Copias**: % desarmes con horas idénticas al armado | informe de obra | de 42% a < 10% |
| **Duplicados**: avisos "ya existía otro parte para esa obra y fecha" por semana | pasos de `cerrarJornada` | 0 |
| **Partes con 0 hh** ejecutados | Odoo (hoy 29) | 0 nuevos |
| **Fotos**: % jornadas ejecutadas con ≥ 1 foto; fotos fallidas sin reintentar | Storage + pasos | ≥ 60%; 0 perdidas |
| **As-built**: % OTs de armado cerradas con as-built contestado | Odoo `ejecutadoReal` | 100% |
| **OTs colgadas**: OTs en proceso con todas sus jornadas cerradas hace > 7 días | cola de cierres | ≤ 1 |
| **"Falta un dato"**: mediana de horas hasta resolverse | `partes_borradores` | < 4 h hábiles |

Cualitativo: una sesión de observación con quien carga (mirar una mañana real, sin intervenir) antes de la fase 1 y otra al final de la fase 2.

---

## 11. Plan por fases

Esfuerzo en días de una persona que ya conoce el repo (como quien escribió la Hoja del día). Incluye tests de la lógica pura y la revisión de copy; no incluye esperas de Odoo/Telegram.

### Fase 0 — Quick wins sobre la pantalla actual (3–4 días)

Sin cambiar el modelo. Cada ítem es independiente y se puede mergear solo.

| # | Cambio | Resuelve | Esfuerzo |
|---|---|---|---|
| 0.1 | **Usar `usePrecargaCierre` en `borradorDe()`**: a cargo, personas, tramos (varias líneas: mostrar "2 tramos · ver" y mandar las líneas tal cual), camión, fletes; marcar "Según la Hoja del día". | 1.1, 1.2, 2.8, 2.9 | 1 d |
| 0.2 | **Borrador en `localStorage`** (sin fotos) + `beforeunload` si hay fotos sin guardar. | 1.3 parcial | 0,5 d |
| 0.3 | **No cortar en el primer error**: seguir con las demás y marcar la fila fallida *en la fila*. | 2.5, 2.4 | 0,25 d |
| 0.4 | **"Confirmar como planificado" sólo sobre filas con a cargo precargado** y abriéndolas; renombrar a "Completar con la hoja". | 1.4 | 0,25 d |
| 0.5 | **Abrir en el día más viejo con deuda** (o último hábil) + sección "Días anteriores sin parte" con las confirmadas pendientes (reusar la consulta del badge con fecha y OT). | 2.1, 2.2 | 1 d |
| 0.6 | **Botón `Corregir`** en la fila cargada que abre `FormularioCierre` con el `parteId`. | 2.3 | 0,25 d |
| 0.7 | **Tokens de color y ARIA** (`aria-pressed`, `aria-expanded`, texto del estado); tamaños mínimos. | 3.1–3.4 | 0,5 d |
| 0.8 | "a cargo" en vez de "capataz" en la UI; borrar `use-partes.ts`; actualizar los dos comentarios desactualizados. | 3.6, 3.8 | 0,25 d |

### Fase 1 — Triage en la oficina (8–10 días)

| # | Cambio | Esfuerzo |
|---|---|---|
| 1.1 | `partes_borradores` + idempotencia en el POST + ruta de reintento de pasos. **Antes que todo lo demás.** | 2 d |
| 1.2 | Fotos subidas al elegir, a Storage; el borrador guarda rutas. | 1 d |
| 1.3 | `lib/partes/evidencia.ts` (pura) + endpoint de evidencia: niveles con lo que ya hay (hoja, viajes hechos, asistencia). | 1,5 d |
| 1.4 | `TarjetaJornada` agrupada por cuadrilla-día, grupos Para revisar / Sin datos / Listas / Confirmadas, `ChipEvidencia`, diferencias con elección de fuente, personas por nombre. | 2,5 d |
| 1.5 | Confirmar por tarjeta con outbox y Deshacer 10 s; lote sólo para Listas. Estados de error/aviso en la tarjeta. | 1 d |
| 1.6 | Tira semanal + endpoint semanal; badge unificado con la tira. | 1 d |
| 1.7 | Atajos de teclado + ayuda `?`. | 0,5 d |
| 1.8 | "Falta un dato" persistido (sin Telegram todavía: "Lo averiguo yo" + nota). | 0,5 d |

Criterio de salida: una semana de uso real con la persona que carga, medición de tiempo por jornada y de puntualidad.

### Fase 2 — Dos firmas: el capataz declara (8–10 días)

Requiere Telegram activo (pendiente en el handoff de la Hoja: variables en Vercel y webhook).

| # | Cambio | Esfuerzo |
|---|---|---|
| 2.1 | `hd_cierres` + acciones en `hd_aplicar` + historial. | 1 d |
| 2.2 | Pantalla de declaración en `/h/<token>` (3 pasos, sin señal) y botones equivalentes en el mensaje de Telegram de fin de jornada. | 3 d |
| 2.3 | Nivel "Declarado" en la evidencia; regla del toque único. | 0,5 d |
| 2.4 | "Falta un dato" por Telegram con respuesta que vuelve la tarjeta a "lista". | 1,5 d |
| 2.5 | Cola de cierres de OT + panel de as-built con diff + aviso al técnico. Sacar el cierre de OT del editor del parte. | 2 d |
| 2.6 | Unificar el editor completo (`/partes`, Hoja, tablero): un solo componente. | 1,5 d |

### Fase 3 — Inteligencia y fuentes vivas (6–9 días)

| # | Cambio | Esfuerzo |
|---|---|---|
| 3.1 | Bandas de normalidad + reglas de anomalías (§5.6) + total del día contra un día normal. | 2 d |
| 3.2 | Ingesta viva de fotos del grupo de Telegram con matching por autor-cuadrilla-obra del día; fotos sugeridas en la tarjeta. | 3–4 d |
| 3.3 | Diferencias con la asistencia de Juan Pablo (ya prevista en §13 de la Hoja) y anomalías hacia el informe de obra. | 1 d |
| 3.4 | Tablero de métricas (§10) para el dueño. | 1–2 d |

**Total**: ~25–33 días de trabajo, entregable en cuatro cortes. La fase 0 sola ya elimina la mayor parte del tipeo de memoria (el 0.1 es el cambio con mejor relación esfuerzo/impacto de todo el documento).

---

## 12. Decisiones que tiene que tomar el dueño

1. **¿El capataz declara?** (Fase 2.) Es un gesto nuevo para él, aunque sea de tres toques. Propuesta: sí, con el mismo mensaje de Telegram de la hoja, a partir del fin de jornada; si no declara, nada se traba.
2. **Fotos del parte: ¿a Odoo o a Supabase con link?** Recomiendo Supabase (mismo criterio que `fotos_obra`), y en Odoo una línea `x_aba_foto` con la URL y el momento, para que el parte siga mostrando que tiene fotos.
3. **Ventana de deshacer de 10 s antes de escribir a Odoo**: retrasa el dato 10 s a cambio de corregir sin PATCH. Recomiendo sí.
4. **Fichadas**: ¿se retira del menú o se migra a OT? Mientras tanto, no es fuente de horas.
5. **Umbrales de anomalía**: los de §5.6 salen de los datos medidos; revisarlos con quien carga después de dos semanas.
6. **¿Quién confirma?** Hoy Planificación/Partes. Si la Hoja del día también confirma, tienen que ver lo mismo: con el componente único (2.6) eso queda garantizado.
