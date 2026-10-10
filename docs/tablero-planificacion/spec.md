# Tablero de Planificación de Cuadrillas — Especificación

M�dulo nuevo para la app web de ABA, que **reemplaza al módulo de planificación actual**.

> **Instrucción inicial para Claude Code:** antes de escribir nada, explorá la app existente. Identificá el stack, cómo se conecta hoy a Odoo, dónde vive el módulo de planificación actual, y qué componentes de UI y utilidades ya existen. **Respetá el stack, las convenciones de código, el sistema de diseño y la capa de acceso a Odoo que ya están.** No introduzcas librerías nuevas si algo equivalente ya está en el proyecto. Al terminar la exploración, resumí qué encontraste y qué vas a reutilizar antes de empezar a implementar.

---

## 1. Qué problema resuelve

Operaciones planifica hoy en una planilla de Google donde las obras se ordenan por día. El problema central: **una obra que dura varias jornadas solo figura el día que arranca**, así que al planificar el viernes nadie ve que la cuadrilla ya está tomada desde el lunes. Eso genera sobreasignación.

Tampoco hay noción de capacidad: la mayoría de las obras ocupa una fracción de jornada (0,25 o 0,5) y una cuadrilla hace tres o cuatro por día, pero nada indica cuánto queda libre.

**El tablero resuelve las dos cosas por la forma, no por avisos.**

## 2. Forma del tablero

Grilla semanal:

- **Filas:** las cuadrillas activas (hoy son 3, el diseño debe tolerar hasta ~8).
- **Columnas:** los días. Lunes a sábado por defecto; domingo oculto salvo que tenga algo asignado.
- **Celdas:** las asignaciones de esa cuadrilla ese día.

Debajo, una **bandeja de obras sin asignar**, de la que se arrastra a las celdas.

### Comportamiento de las tarjetas

**Obra de una jornada o menos** → tarjeta dentro de la celda, mostrando su fracción (¼, ½, ¾, 1).

**Varias obras el mismo día** → se apilan en la misma celda. El orden de apilado representa el orden previsto del día.

**Obra de varios días** → **una sola tarjeta que abarca visualmente las celdas contiguas** (`grid-column: span N`). Se arrastra completa y se mueven todos sus días juntos. Ocupa el 100% de cada día que abarca.

### Indicador de capacidad

Cada celda muestra una barra de ocupación con la suma de fracciones:

- menos de 100% → barra parcial + texto `"50% · queda ½"`
- 100% → barra completa + `"completa"`
- más de 100% → **barra en rojo + `"SOBREASIGNADA"`**. No se bloquea: se permite y se advierte, porque a veces la jornada se estira.

### Estados visuales

| Elemento | Representación |
|---|---|
| Asignación **confirmada** | tarjeta con fondo sólido, color de la cuadrilla |
| Asignación **tentativa** | tarjeta con borde punteado y fondo transparente |
| Habilitación **verde / amarillo / rojo / vencida** | punto de color en la esquina de la tarjeta |
| Urgencia **alta** | franja o borde izquierdo rojo |
| Celda vacía | fondo tenue con la palabra "libre" |

Las tentativas **sí ocupan capacidad**. Son borrador, no reserva ficticia.

## 3. Interacciones

- Arrastrar una tarjeta entre celdas (cambia cuadrilla y/o fecha).
- Arrastrar desde la bandeja de sin asignar a una celda.
- Arrastrar una tarjeta fuera de la grilla → vuelve a sin asignar.
- Cambiar el estado tentativo/confirmado con un clic o un toggle en la tarjeta.
- Reordenar tarjetas dentro de una celda (define el orden del día).
- Editar la fracción desde la tarjeta.
- Navegar entre semanas; botón "hoy".
- Clic en la tarjeta → panel lateral con el detalle de la OT y link a Odoo.

**Toda escritura va a Odoo por API.** Sin base de datos propia, sin duplicación. Optimistic UI local, y si la escritura falla se revierte y se avisa.

## 4. Modelo de datos en Odoo

### 4.1 Modelo nuevo a crear: `x_aba_asignacion`

La OT hoy tiene **una sola** fecha programada, insuficiente para un tablero. Y crear partes diarios al planificar no sirve, porque la planificación es un borrador que se mueve todo el tiempo y los partes son registros pesados (llevan fotos, horas, incidencias).

Por eso se necesita un objeto liviano y descartable:

| Campo | Tipo | Notas |
|---|---|---|
| `x_ot_id` | many2one → `x_aba_orden_trabajo` | obligatorio |
| `x_fecha` | date | obligatorio |
| `x_cuadrilla_id` | many2one → `x_aba_cuadrilla` | puede ser vacío (sin asignar) |
| `x_fraccion` | selection | `0.10` / `0.25` / `0.50` / `0.75` / `1` |
| `x_estado` | selection | `tentativa` / `confirmada` |
| `x_orden_dia` | integer | posición dentro del día |
| `x_notas` | char | nota corta de coordinación |

Una obra de 4 jornadas son 4 registros de asignación. Moverla = actualizar las 4 fechas.

**Relación con el parte diario:** cuando la jornada se ejecuta, la asignación da origen a un `x_aba_parte_diario`. La asignación es la intención; el parte es el hecho. No se reemplazan: conviven.

> Este modelo **todavía no existe en Odoo**. Hay que crearlo antes o en paralelo. Si no está disponible, implementar la capa de datos contra una interfaz que lo abstraiga para poder conectarlo después.

### 4.2 Modelos existentes a leer

**`x_aba_orden_trabajo`** — campos relevantes:

| Campo | Uso en el tablero |
|---|---|
| `x_name` | título: `"Armado · S02301 · Teruel — Tagle 2661"` |
| `x_order_id` | many2one a `sale.order` |
| `x_tipo` | `armado` / `desarme` / `ampliacion` / `desmonte_parcial` / `mantenimiento` / `otro` |
| `x_estado` | `pendiente` / `en_proceso` / `completada` / `cancelada` |
| `x_urgencia` | `baja` / `media` / `alta` |
| `x_motivo_urgencia` | se muestra si es alta |
| `x_duracion_est` | duración estimada; misma escala que la fracción |
| `x_jornadas_num` | float derivado de la anterior |
| `x_personal_por_jornada` | dotación prevista |
| `x_cuadrilla_prevista_id` | sugerencia inicial de cuadrilla |
| `x_hab_semaforo` | `rojo` / `amarillo` / `verde` / `vencida` / `gris` |
| `x_hab_alerta` | `ok` / `proxima` / `critica` / `atrasada` / `vencida` |
| `x_hab_vencimiento` | fecha |
| `x_tecnico` | iniciales: `JS`, `JR`, `GS` |
| `x_contacto_obra`, `x_tel_obra` | contacto en obra |
| `x_observaciones` | notas de coordinación |
| `x_dias_obra`, `x_horas_hombre` | ejecución real |
| `x_cant_docs`, `x_doc_ids` | documentación adjunta |

**`x_aba_cuadrilla`** — `x_name`, `x_activa`, `x_tercerizada`. Solo mostrar las activas.

**`x_aba_parte_diario`** — para marcar en el tablero las jornadas ya ejecutadas. Campos: `x_orden_trabajo_id`, `x_fecha`, `x_cuadrilla_id`, `x_estado` (`previsto`/`ejecutado`/`no_ejecutado`), `x_motivo_no_ejec`, `x_horas_hombre`.

## 5. Qué obras entran al tablero

Filtrar `x_aba_orden_trabajo` por:

- `x_estado` en `pendiente` o `en_proceso`
- la orden de venta debe tener `x_studio_tipo_de_contrato = 'Obra '` (con espacio final, así está en la base). Se excluyen "Simple" (módulos hogareños) y "Alquiler Sin Montaje".

**Las obras sin habilitar entran igual.** La fecha se acuerda con el cliente mientras el trámite avanza en paralelo. El semáforo advierte; no bloquea.

## 6. Reglas de negocio

1. **Una jornada son 8 horas efectivas**, de 8 a 12 y de 13 a 17. La hora de almuerzo no se trabaja.
2. **Fracciones válidas:** `0.10` (trabajo mínimo, ~1,5 h con viaje), `0.25` (2 h), `0.50` (4 h), `0.75` (6 h), `1` (jornada completa).
3. **Capacidad diaria de una cuadrilla = 1,00.** La suma de fracciones asignadas la puede superar, pero se marca en rojo.
4. **Una obra de más de una jornada ocupa 1,00 en cada día** que abarca.
5. **Las obras se planifican en días corridos.** La discontinuidad real se registra después en los partes, no acá.
6. **Domingo no se trabaja**; sábado sí. Domingo se oculta salvo que tenga algo.
7. Una obra puede necesitar **más de una cuadrilla el mismo día**. Se representa como dos asignaciones, una en cada fila.
8. **La app es la única que escribe asignaciones.** En Odoo se ven en solo lectura.

## 7. Panel lateral de la OT

Al hacer clic en una tarjeta, sin salir del tablero:

- Título, tipo, técnico, urgencia y motivo si es alta
- Semáforo de habilitación con fecha y vencimiento
- Contacto en obra con nombre y teléfono (link `tel:`)
- Observaciones
- Documentos adjuntos de la orden, con vista previa
- Duración estimada contra horas reales ejecutadas
- Link para abrir la OT en Odoo

## 8. Criterios de aceptación

- [ ] Una obra de 4 jornadas asignada al martes ocupa martes a viernes, y el viernes **no acepta** otra obra en esa cuadrilla sin marcar sobreasignación.
- [ ] Arrastrar esa obra al miércoles mueve los 4 días juntos.
- [ ] Tres obras de ¼, ¼ y ½ en un mismo día suman 100% y la celda lo indica.
- [ ] Una obra de ½ agregada a una celda que ya tiene 75% marca sobreasignación en rojo.
- [ ] Una asignación tentativa se distingue visualmente y ocupa capacidad.
- [ ] El semáforo de habilitación se ve en cada tarjeta sin abrir nada.
- [ ] Todo cambio persiste en Odoo y sobrevive a un refresco.
- [ ] Un error de escritura revierte el cambio en pantalla y avisa.
- [ ] Las celdas libres se distinguen de un vistazo.

## 9. Fuera de alcance

- Carga de partes diarios (vive en Odoo).
- Circuito de habilitación (vive en Odoo, lo gestiona otra persona).
- Costos y márgenes (viven en Odoo).
- Creación de órdenes de trabajo (nacen desde la orden de alquiler en Odoo).

## 10. Notas de implementación

- El tablero se consulta muchas veces por día y se edita en ráfagas. Traer la semana completa en una sola llamada y actualizar de a un registro.
- Ante conflicto de edición simultánea, gana la última escritura y se refresca la vista.
- El estado `tentativa` es el modo de trabajo normal. No forzar confirmación para poder mover cosas.
- Pensado para escritorio. Si hay uso en tablet, la grilla debe poder scrollear horizontal sin romper el arrastre.
