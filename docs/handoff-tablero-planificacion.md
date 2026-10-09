# Handoff — Tablero de planificación (actualizado 2026-10-09)

Para retomar en una sesión nueva: "Leé docs/handoff-tablero-planificacion.md y seguimos con las
mejoras del tablero". Acá van el estado, lo pendiente y las mejoras pedidas, la más nueva arriba.
Los specs de junio (`modulo-planificacion.md`, `modulo-planificacion-mejoras-v2.md`) y el de agosto
(`ABA-Tablero-Planificacion-SPEC.md`) son el diseño original: el código ya se apartó en varias
cosas, así que ante la duda manda el código y los comentarios largos que tiene cada archivo.

---

## Pendiente ahora

1. **Probar la ficha nueva de la OT y la bandeja nueva en el tablero publicado** (09/10, ver abajo). Se validó con
   `tsc` y `eslint`, pero nadie la vio andando: el dev local redirige a `/login` y no había
   sesión. Mirar sobre todo "Planificar…" desde la bandeja, que la ficha pase sola a modo grilla
   al planificar, las flechas ‹ › y el panel a ancho completo en el celular.
2. **Ver la tapa de suspensión andando con un corrimiento real.** La del 29/09 JS ya la vio
   (02/10) y pidió más color: se cambió a la opción B, que falta mirar en el tablero publicado.
3. **Lo que dejó la auditoría del 08/10** (detalle abajo, en "Auditoría UX y técnica"). Lo más
   urgente: el candado que falla abierto para Depósito y Campo, y la RLS abierta.

---

## 09/10 — la ficha de la OT, rediseñada

**Pedido (JS, 08/10):** después de la auditoría, analizar sólo la ficha de una OT abierta desde
la bandeja. Diagnóstico: desde la bandeja servía para leer y no para hacer nada (no tenía
acciones), la duración quedaba debajo del pliegue, el título repetía tipo, orden, cliente y
dirección en tres renglones, había dos historiales con dos formatos de fecha que parecían el
estado actual, y los comentarios vacíos ocupaban ~220px. JS aprobó una maqueta interactiva
(artifact "Ficha de OT — maqueta", https://claude.ai/artifact/RMh1bQmRzYMWMHZYcVMyXK) con un
solo cambio: **observaciones, técnico y vendedor no van ocultos** (las observaciones las carga
Comercial y suelen traer cosas críticas para Operaciones; técnico y vendedor son a quién
recurrir).

**Cómo quedó** (`panel-ot.tsx`, el orden está explicado en el encabezado del archivo):
- **Encabezado fijo**: la dirección como título, "cliente · S0xxxx" con el chip de tipo
  (`ChipTipoOt`, mismo color que la grilla), una **línea de estado** ("Sin planificar · faltan
  5 de 5 jornadas" / "Tentativa · Cuadrilla 4 · mar 13 – sáb 17 oct") y las acciones.
- **Una sola ficha para bandeja y grilla**: cambian sólo el estado y las acciones. Desde la
  bandeja: **Planificar…** (cuadrilla, día de inicio, muestra qué días ocupa y si respeta la
  ventana; pasa por `asignarObra`, la misma función que el drop), duración editable (va a
  `fijarPlan`, igual que el menú de la bandeja), "Ver en el tablero" y Odoo. Desde la grilla:
  Confirmar (lleno si es tentativa), Fijar, Jornadas, Quitar, Odoo y la fracción.
- **Al planificar desde la ficha no se cierra**: el panel guarda `seguir: true` y adopta el
  primer bloque de la obra cuando aparece, así pasa a modo grilla para confirmarla.
- **Flechas ‹ › (y ← →)** para recorrer la bandeja en el orden en que se ve, con búsqueda y
  filtros incluidos (`onOrden` de `PanelSinAsignar` → `ordenBandeja` en el board).
- **"¿Se puede ir?"**: habilitación (la etapa primero; el semáforo y `habAlerta` de detalle, ya
  no "próxima a vencer · ok"), ventana ("ya se puede" / "el plan la respeta"), comprometida,
  duración (lo ejecutado sólo si hay algo), sugerida y cuadrilla prevista.
- **Qué hay que ejecutar** con las **observaciones de comercial adentro** (3 renglones + "ver
  más", prop `observaciones` de `DetalleTecnico`) y los documentos pegados.
- **Contactos** en dos grupos: "En obra" (contacto de la OT con botón Llamar, gente de la obra,
  Maps, referencia) y "En ABA" (técnico y vendedor).
- **Comentarios** de un renglón que crece, con botón de enviar. Ya no publica dos veces con
  dos Enter, respeta la composición de tildes y los botones de fijar/borrar se ven con el foco
  y en pantallas táctiles.
- **Historia**: `historia-ot.tsx` reemplaza a `historial-confirmacion.tsx` y `movimientos-ot.tsx`
  (borrados). Junta las dos tablas en una línea de tiempo plegada, con el último evento a la
  vista y un solo formato de fecha.
- **Errores**: si falla la ficha, "Qué hay que ejecutar" muestra el error con Reintentar (antes
  el esqueleto quedaba para siempre); si fallan los comentarios ya no dice "Sin comentarios";
  si fallan los documentos, lo dice.
- **Celular**: el panel ocupa el ancho completo (antes 75%).

**Ajuste del mismo día (JS, con la ficha publicada):** los comentarios subieron a lo primero del
cuerpo, arriba de "Qué hay que ejecutar" (al pie no se leían). La duración sugerida de
Odoo, que traía un párrafo entero, quedó en un renglón dentro de Duración ("Sugerido: 1 jornada ·
usar · ver cálculo"; "usar" la fija desde la bandeja), y se ocultó el "Sin partes" del período.
Los documentos muestran una fila de 3 y "ver los N documentos" (hay obras con 97 adjuntos que
ocupaban toda la ficha); si una miniatura no carga se ve el ícono y no el nombre del archivo.

**Limpieza visual (JS, 09/10, "por qué hay tantas tipografías y colores"):**
- **Tres tamaños y dos pesos**: 17px el título (único en semibold), 14px el texto, 12px lo
  secundario y los títulos de sección. Había siete tamaños.
- **Bloques separados con una línea** (`divide-y` en el cuerpo, mismo aire en cada uno).
- **Nombres de Odoo en formato normal, sólo para mostrar**: `nombrePropio()` en `titulo.ts`
  ("JUAN CARLOS RODRIGUEZ" → "Juan Carlos Rodriguez", "RIVEROS, Jorge" → "Jorge Riveros",
  "CUADRILLA 3" → "Cuadrilla 3"; deja las siglas como SA/SRL y lo que ya viene bien escrito).
  Se aplica a cliente, cuadrilla, técnico, vendedor y contactos. En Odoo no se toca nada.
- **Color sólo con significado**: rojo = problema (ventana rota), verde = confirmada. La nota
  de duración fijada por Operaciones pasó a gris; el marrón queda para "sin estimar".
- **Encabezado compacto**: una fila (Cerrar jornada · Confirmar · Fijar · Jornadas · ⋯). Quitar
  y Odoo van al ⋯ (también desde la bandeja, para que Odoo esté siempre en el mismo lugar). La
  fracción se cambia desde la línea de estado ("Cuadrilla 3 · mié 14 oct · jornada completa ▾").
  El motivo de una obra fija bajó al cuerpo. Antes el encabezado fijo ocupaba media pantalla.
- "1 de jornada" pasó a "jornada completa", y el foco inicial va al encabezado y no a la X
  (abría remarcada).
- **La ventana del cliente, explicada** (JS no entendía "TERMINA después del 7 oct"): primero lo
  que pidió el cliente ("El cliente la necesita terminada antes del 7 oct") y abajo qué hace el
  plan, en rojo si la rompe ("El plan termina el vie 16 oct, 9 días después."). Usa las mismas
  `violaPiso`/`violaTecho` que la bandeja y la fricción al confirmar.
- **Ojo con Base UI:** un `DropdownMenuLabel` (es un `Menu.GroupLabel`) suelto, fuera de un
  `DropdownMenuGroup`, tira una excepción al abrir el menú y tumba la página entera ("This page
  couldn't load"). Pasó con el selector de fracción y se corrigió el mismo día.

**Quedó afuera:** las miniaturas de los documentos se piden directo a Odoo (`/web/content`) y
sólo cargan si el navegador tiene sesión de Odoo abierta; para que se vean siempre habría que
servirlas a través de la app. También el panel no modal en escritorio (para arrastrar con la
ficha abierta) y los
teléfonos del técnico y el vendedor (no viajan en `DetalleOt`; habría que traerlos de Odoo).

---

## 09/10 — la bandeja "Sin asignar", con la tarjeta nueva

**Pedido (JS, 09/10):** auditoría sólo de la bandeja (con captura) y maqueta de la tarjeta
nueva en el mismo artifact de la ficha (fila "Bandeja: tarjeta propuesta", modo normal y con
"Qué ejecutar" prendido). JS aprobó con dos decisiones: **sin la palabra Armado/Desarme** (la
flecha y el color alcanzan) y **sin el botón "i"** (un clic en la tarjeta abre la ficha).

**Cómo quedó** (`panel-sin-asignar.tsx`, `TarjetaOt`):
- **La dirección primero** (14px, color de texto), con la flecha del tipo. Abajo, en 12px gris,
  "Cliente · S0xxxx" con `nombrePropio()`. Con **"Qué ejecutar"** ese renglón pasa a ser lo que
  hay que hacer (2 renglones, color de texto) y la orden se va al renglón de la duración.
- **Un renglón de condiciones**: duración ("1 jornada ▾", "½ jornada", "3 h", "mínimo (~1,5 h)";
  el menú ahora marca el valor actual) · compromiso · "desde el 14 oct" **sólo si el piso
  todavía no pasó** (sin el candado, que es del permiso municipal) · "sin estimar".
- **Habilitación con texto** cuando no está al día ("Habilitación próxima a vencer", "crítica",
  "vencida"); la habilitada no dice nada. **"Urgencia media" escrita**: la pastilla ámbar
  desaparecía sobre el fondo del desarme.
- **Sin iniciales del técnico** (siguen en la búsqueda y en la ficha). El texto ya no va teñido
  del tipo en tres opacidades: el fondo sí, el texto en los grises de siempre.
- **Un clic abre la ficha, apretar y mover arrastra** (como la grilla); Enter también. El menú
  de duración tiene una guarda (`menuAbierto` / `menuCerradoEn`) porque sus clics suben por el
  portal hasta la tarjeta. Se sacó el botón "i".
- **Encabezado**: contador en gris (el ámbar es de urgencia media), buscador "Dirección, cliente
  u orden…", chips de tipo y de duración en **un solo renglón** con glifos (las horas, con coma
  decimal, en el tooltip) y `aria-pressed`.
- **Arreglos**: la búsqueda es **por palabras en cualquier orden** e incluye qué hay que ejecutar
  (`coincide()`); el grupo "Con habilitación pendiente" **se abre solo** con búsqueda o filtro;
  el balde de duración va a la escala gruesa (se acabó el chip "0.375"); el encabezado de grupo
  tiene `focus-visible` propio (el recuadro coral era el anillo de foco que quedaba puesto).
- Antes, el mismo día: el menú "1 jornada ▾" tumbaba la página (`DropdownMenuLabel` suelto, igual
  que en la ficha). Corregido en `bcd5eb5`.

**Quedó de la auditoría de la bandeja, sin hacer:** bandeja superpuesta también en tablet
(768–1024px); el candado de permiso visible en la bandeja (`useCandado` sólo mira obras con
asignaciones); el fantasma del arrastre muestra el título crudo y no la tarjeta; traer el
cliente de `sale.order` a `OtTablero` para que la búsqueda por cliente funcione siempre;
avisar "el armado no tiene fecha" en un desarme cuyo armado también está en la bandeja (a
validar con Operaciones).

---

## 08/10 — Auditoría UX y técnica (pendiente de resolver)

Cuatro auditorías de solo lectura (general, grilla y accesibilidad, paneles y diálogos, capa de
datos). Nada de esto está arreglado salvo lo de la ficha de arriba. **Confirmado leyendo el
código:**
- **Candado que falla abierto (crítico).** Depósito y Campo editan planificación pero no tienen
  el módulo habilitaciones (`acceso.ts`, `CIRCUITO`), así que `/api/habilitaciones/candado` les
  da 403. El board ignora el error de `useCandado` y confirma sin fricción. Además el PATCH de
  asignaciones no valida el permiso del lado del servidor.
- **RLS abierta**: `plan_suspensiones`, `tablero_tareas` (y según el reporte notas, jornadas,
  cajón y comentarios) tienen `FOR ALL TO authenticated USING (true)`. Cualquier usuario logueado
  puede escribir contra Supabase aunque tenga el módulo en solo lectura.
- **Carga del tablero**: `if (isLoading || !data)` va antes que `if (error)` en `tablero-board`:
  si falla la primera carga queda el esqueleto para siempre, y si falla una relectura la pantalla
  de error tapa la grilla aunque haya datos.
- **Soltar sobre una tarjeta**: una obra de la bandeja soltada encima de una tarjeta no hace
  nada (la rama `ot:` sólo acepta `celda:`), y un bloque soltado sobre una tarjeta de varios
  días cae en el primer día de esa tarjeta (`otro.fechas[0]`).
- **Editor de jornadas**: compara contra las asignaciones vivas y no contra lo que sembró al
  abrir, así que puede borrar una jornada que otro agregó mientras estaba abierto. También
  cierra antes de guardar y escribe en llamadas sueltas.
- **Correr el día** se rompe si se borra la fecha (`format` sobre fecha vacía).
- **Parte de cierre**: reintentar después de un aviso reenvía todas las fotos.
- **"Hoy" del servidor en UTC** (`jornadas/route.ts`): de 21 a 24 h cuenta jornadas de hoy como
  pasadas y deja cargar el parte de mañana.

**Reportado y sin verificar:** el tablero no usa `usePuedeEditar` (quien tiene solo lectura
arrastra y rebota); "el corrimiento quedó a medias" sale también con 409/400/403; mover un bloque
no es atómico y falta `maxDuration`; dos personas pueden planificar la misma obra a la vez;
carrera en `x_fecha_programada`; correr el día no avisa feriados; ⌘Z deshace otra cosa que el
toast; sin `KeyboardSensor` ni alternativa al arrastre; errores de Odoo en inglés; no hay tests
de `src/lib/tablero` y `npm test` falla con Node 22.16 sin `--experimental-strip-types`.

---

## 02/10 — el día suspendido queda tapado con el motivo

**Pedido (Juan Agustín, Slack 01/10, con captura):** al correr la cuadrilla 1 y la 2 por
lluvia el martes 29 quedó en blanco, "como si no lo hubiéramos utilizado". Ideal una tapa con
el motivo.

**Cómo quedó:**
- **Tabla `plan_suspensiones`** (Supabase): una fila por fecha × cuadrilla (id de Odoo), única,
  con motivo, `lote_id` del corrimiento que la creó y autor. No se deriva de `plan_movimientos`
  porque esas filas son por obra y no dicen qué día se suspendió ni para qué cuadrillas.
- **Quién queda marcado:** las cuadrillas tildadas en "Suspender un día" que tenían algo
  asignado ese día (`suspendidas` en `dialogo-correr-dia.tsx`). La destildada y la que no tenía
  nada no se tapan.
- **Se escribe en `/api/planificacion/corrimiento`** (`suspension: { dia, cuadrillaIds }`), y el
  deshacer la levanta (`levantaLote`). Si la marca falla no se rechaza el corrimiento: las
  jornadas ya se movieron en Odoo.
- **Se lee con `/api/planificacion/suspensiones`** (GET por rango, DELETE por id) y el hook
  `use-suspensiones.ts`. Clave de query **propia** (`suspensiones-tablero`), no bajo `["tablero"]`:
  `aplicarOptimista` reescribe todo lo que cuelga de esa clave como si fuera el payload de
  asignaciones. La invalidan el corrimiento y los avisos en vivo de los demás.
- **La tapa** (`TapaSuspension` en `celda-dia.tsx`), **opción B que eligió JS el 02/10** entre
  dos maquetas (la A era un bloque azul lleno, descartada porque en el tablero todo rectángulo
  lleno es una obra): rayado diagonal con borde punteado, un **sello lleno** con ícono y el
  motivo, y abajo "SUSPENDIDO". Azul de clima con nube si el motivo es lluvia, viento, tormenta o
  granizo; gris con ícono de prohibido para cualquier otro. Colores en tokens
  `--tb-suspendido-*` (claro y oscuro, `SUSPENDIDO` en `colores.ts`) y sus pares en
  `npm run contraste`. No toma el puntero (la celda sigue aceptando drop y doble clic); si
  después se asigna algo, la tarjeta va encima. Al pasar por la celda aparece una cruz para
  **quitar la marca** (no mueve jornadas). El tooltip dice quién la marcó.

**Archivos:** `supabase/migrations/20261002000001_suspensiones_del_tablero.sql`,
`src/lib/planificacion/suspensiones.ts`, `src/lib/tablero/tipos-suspension.ts`,
`src/app/api/planificacion/suspensiones/route.ts`, `src/hooks/use-suspensiones.ts`, y cambios en
`corrimiento/route.ts`, `use-tablero.ts` (`useCorrerDia`), `use-avisos-tablero.ts`,
`dialogo-correr-dia.tsx`, `tablero-board.tsx`, `tablero-grid.tsx` y `celda-dia.tsx`.

**Ideas que quedaron afuera (para decidir):**
- Marcar un día suspendido **sin correr nada** (p. ej. una cuadrilla que no salió y no tenía
  trabajo que mover). Hoy la ruta no tiene POST a propósito.
- Mostrar la suspensión en la ficha de la obra y en el panel de actividad, además de la grilla.
- Que la tapa de lluvia se ofrezca sola cuando el chip de clima del día marca lluvia fuerte.

---

## Mapa del módulo

- **Página:** `src/app/(dashboard)/planificacion/page.tsx` → `TableroBoard`
  (`src/components/tablero/tablero-board.tsx`, el que orquesta: datos, diálogos, deshacer).
- **Grilla:** `tablero-grid.tsx` (encabezado de días con feriados, clima y notas; una fila por
  cuadrilla), `celda-dia.tsx` (fondo droppable, riel de ocupación, nota de la cuadrilla, tapa
  de suspendido), `tarjeta-asignacion.tsx` (la obra en el día).
- **Ficha de la OT:** `panel-ot.tsx` (Sheet a la derecha, la misma desde la bandeja y desde la
  grilla), con `detalle-tecnico.tsx`, `comentarios-ot.tsx` e `historia-ot.tsx`.
- **Datos:** las asignaciones viven en **Odoo** (`x_aba_asignacion`, cuadrillas `x_aba_cuadrilla`)
  y se leen por `/api/planificacion/tablero` (`use-tablero.ts`, optimista). En **Supabase** viven
  lo que nadie lee desde el ERP: historial de movimientos (`plan_movimientos`, con `lote_id` y
  `motivo` para los corrimientos), notas del día (`plan_notas_dia`) y días suspendidos
  (`plan_suspensiones`).
- **Correr el día:** cálculo en `src/lib/tablero/corrimiento.ts` (`planearCorrimiento`, la misma
  función para el preview y para ejecutar), diálogo `dialogo-correr-dia.tsx`, ruta
  `/api/planificacion/corrimiento`. Deshacer = corrimiento inverso con `deshace_a`.
- **En vivo:** `use-avisos-tablero.ts` escucha los cambios de los demás e invalida las queries.
- **Colores:** todo sale de `src/lib/tablero/colores.ts` (tokens `--tb-*` en `globals.css`, claro y
  oscuro). `npm run contraste` controla el contraste del tablero.

## Reglas que no se leen en el código

- **Migraciones:** nunca `supabase db push`. Desde el 02/10 la Mac de JS tiene la CLI logueada y
  el repo vinculado a AndamiosOS (`hrlulbeepyvyjbzjfztu`): se aplican con
  `npx supabase db query --linked -f supabase/migrations/<archivo>.sql` (por la Management API, sin
  `SUPABASE_DB_URL`). Para mirar antes: `npx supabase db query --linked -o table "select …"`.
- **Nada nuevo bajo la query key `["tablero"]`** que no sea el payload de asignaciones (ver arriba).
- Lo que escriba en Odoo se agrupa y se deshace entero o no se deshace (ver los comentarios de
  `correrElDia` y `useCorrerDia`).
