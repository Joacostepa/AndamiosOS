# Módulo: Planificación
> Instrucciones de UI/UX para Claude Code — Andamios Buenos Aires (ABA)
> Stack: React + Node.js · Integrado con Odoo vía API

---

## Contexto del módulo

La Planificación es el módulo que usa el área de **Operaciones** para distribuir las Órdenes de Trabajo (OTs) habilitadas en el calendario semanal, asignando cuadrillas, personal de obra, camiones y choferes por jornada.

### Reglas de negocio clave
- La **jornada estándar** es de 07:00 a 17:00, con almuerzo de 12:00 a 13:00 (8 horas netas de trabajo).
- Las **cuadrillas** son slots de trabajo fijos (Cuadrilla 1, Cuadrilla 2, etc.), pero el **personal varía por jornada** — no hay un equipo fijo.
- Los **camiones** son vehículos fijos, pero el **chofer varía por jornada**.
- Los choferes **no permanecen en obra toda la jornada** — hacen viajes con franja horaria definida (salida → llegada estimada). Un mismo camión puede hacer múltiples viajes en el día a distintas obras, siempre que no se superpongan.
- Una cuadrilla puede tener **múltiples OTs en el mismo día** — deben cubrir la jornada completa.
- La **duración estimada de la OT** viene de Técnica/Comercial y es referencia intocable, pero Operaciones puede ajustar las **horas asignadas por jornada** sin modificar la duración original.
- Solo pueden planificarse OTs en estado **"Habilitada"** (habilitaciones ya aprobó). Las OTs pendientes de habilitación son visibles en la cola pero bloqueadas.
- Operaciones puede **bloquear franjas horarias** en cualquier cuadrilla (ej: almuerzo, feriado, capacitación).

---

## Identidad visual

Usar los mismos tokens del sistema ABA:

| Token | Valor |
|---|---|
| Acción primaria | `#D85A30` |
| Fondo acento suave | `#FAECE7` |
| Texto sobre acento | `#993C1D` |

### Color por tipo de OT (consistente en toda la app)
| Tipo | Fondo | Borde izq. | Texto |
|---|---|---|---|
| Armado | `#E6F1FB` | `#378ADD` | `#0C447C` |
| Desarme | `#FAEEDA` | `#EF9F27` | `#633806` |
| Mantenimiento | `#EAF3DE` | `#639922` | `#27500A` |
| Adicional | `#FBEAF0` | `#E06090` | `#72243E` |
| Bloqueado | `var(--color-background-secondary)` | `var(--color-border-secondary)` | `var(--color-text-tertiary)` |

### Indicadores de estado de jornada (dot en cada bloque)
| Estado | Color |
|---|---|
| Jornada completa (personal + camión + chofer asignados) | `#639922` (verde) |
| Falta completar asignación | `#EF9F27` (amarillo) |

### Barra de capacidad de recursos
| Estado | Color barra |
|---|---|
| < 50% ocupado | `#639922` (verde) |
| 50–90% ocupado | `#EF9F27` (amarillo) |
| 100% ocupado | `#D85A30` (coral) |

---

## Estructura general del módulo

El módulo tiene **una sola pantalla principal** con cuatro zonas:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TOPBAR — título, navegación de semana, botones de acción               │
├──────────────┬──────────────────────────────────┬───────────┬───────────┤
│              │                                  │           │           │
│  COLUMNA DE  │     GRILLA DE DÍAS               │  PANEL    │   COLA    │
│  RECURSOS    │     (5 columnas = Lun–Vie)        │  JORNADA  │  OTs sin  │
│  (fija)      │                                  │  (slide)  │  asignar  │
│              │                                  │           │           │
└──────────────┴──────────────────────────────────┴───────────┴───────────┘
```

- La **columna de recursos** y la **grilla de días** hacen scroll vertical sincronizado.
- La **grilla de días** hace scroll horizontal si hay más de 5 días visibles.
- El **panel de jornada** aparece al hacer clic en un bloque OT — se desliza desde la derecha empujando la cola, que se oculta temporalmente.
- La **cola de OTs** es fija a la derecha y siempre visible salvo cuando el panel está abierto.

---

## Zona 1 — Topbar

```
Planificación    [< ]  16 – 20 jun 2026  [ >]  [Hoy]        [🚫 Bloquear horario]  [+ Asignar OT]
```

**Componentes:**
- Título "Planificación", 15px, font-weight 500
- Navegación de semana: botones `‹` y `›` + label con rango de fechas + botón "Hoy"
- Botón **"Bloquear horario"**: estilo secundario (borde, sin fondo), ícono `ti-ban`. Abre un modal para seleccionar cuadrilla, día y franja horaria a bloquear, con campo de motivo opcional.
- Botón **"Asignar OT"**: fondo `#D85A30`, blanco, ícono `ti-plus`. Alternativa al drag & drop — abre selector de OT + cuadrilla + día.

---

## Zona 2 — Columna de recursos

Ancho fijo: **156px**. Hace scroll vertical sincronizado con la grilla.

### Header
```
RECURSOS
```
11px, uppercase, terciario.

### Separadores de sección
Filas de 24px de alto, fondo `--color-background-secondary`, con ícono y label:
- `ti-users` · "Cuadrillas"
- `ti-truck` · "Camiones"

Estas filas de separador también aparecen como celdas vacías en la grilla de días para mantener el alineamiento visual.

### Fila de recurso

Altura mínima: **90px**. Contiene dos elementos:

**1. Identificación del recurso:**
```
[Avatar]  Cuadrilla 1
          Ramírez · López · Sosa
```
- Avatar circular 24px con iniciales (C1/C2 para cuadrillas en coral `#FAECE7`/`#993C1D`; T1/T2 para camiones en azul `#E6F1FB`/`#185FA5`)
- Nombre del recurso, 12px, font-weight 500
- Para cuadrillas: lista de personal asignado ese día (actualizada dinámicamente según panel), 10px, terciario
- Para camiones: patente del vehículo, 10px, terciario

**2. Barra de capacidad:**
```
[████████░░]  2h disp. de 8h · 6h asignadas
```
- Track: 100% de ancho, 4px de alto, border-radius 99px
- Fill: porcentaje de horas ocupadas sobre 8h netas
- Label debajo: "Xh disp. de 8h · Yh asignadas", 9px
- Para camiones: la capacidad se calcula sumando las franjas horarias de los viajes asignados, no las horas de jornada completa
- Cuando está al 100%: label en `#D85A30` con texto "0h disp. · jornada completa"

> La barra de capacidad que se muestra en la columna de recursos corresponde siempre al **día actualmente en foco** (el primer día visible o el día seleccionado). Si el usuario está navegando la semana, mostrar la capacidad del lunes de esa semana por defecto.

---

## Zona 3 — Grilla de días

### Header de días
Fila fija de 40px de alto. Una columna por día (Lun–Vie):
```
Lun    Mar    Mié    Jue    Vie
 16     17     18     19     20
```
- Nombre del día: 10px, terciario
- Número del día: 13px, font-weight 500
- **Hoy**: fondo `#FAECE7`, número en `#D85A30`

### Celdas de la grilla

Una celda por intersección recurso × día. Altura mínima **90px**, se expande si hay múltiples OTs.

**Comportamiento hover:** fondo `--color-background-secondary`. Aparece botón "＋ OT" de 22px de alto con borde punteado al fondo de la celda.

**Celda de hoy:** fondo `rgba(216,90,48,0.03)`

**Celda de separador de sección:** altura 24px, fondo `--color-background-secondary`, sin contenido.

### Bloques de OT

```
┌── [borde izq. 3px color por tipo] ─────────────────┐
│  Madero 1240                          [● dot estado] │
│  Armado · 6h                                        │
└─────────────────────────────────────────────────────┘
```

- Border-radius 4px
- Padding: 4px 6px
- Nombre de la obra: 10px, font-weight 500, overflow ellipsis
- Tipo y horas de jornada: 9px, color secundario del tipo
- Dot de estado (6px) alineado a la derecha del nombre
- **Hover:** opacity 0.85, cursor pointer
- **Seleccionado (panel abierto):** outline `2px solid #D85A30`, outline-offset 1px
- **Clic:** abre el Panel de Jornada

### Bloque de franja bloqueada

```
┌── [borde izq. gris] ──────────────┐
│  🍽 Almuerzo                       │
│  12:00 – 13:00                    │
└────────────────────────────────────┘
```
- Fondo y borde de la variante "bloqueado"
- Nombre del bloqueo (ej: "Almuerzo", "Capacitación", "Feriado")
- Franja horaria
- No se puede asignar OTs que se superpongan con un bloqueo

### Orden de bloques dentro de una celda
Los bloques se muestran apilados verticalmente en orden cronológico (por hora de inicio de la jornada). Si no hay hora definida, por orden de creación.

### Drag & drop
- Los ítems de la **cola de OTs** son arrastrables (`draggable`)
- Al arrastrar sobre una celda válida, mostrar highlight de drop target (borde `#D85A30` punteado, fondo `#FAECE7` suave)
- Al soltar: crear la asignación en estado "sin completar" (dot amarillo) y abrir automáticamente el Panel de Jornada para completar personal y camión
- Si la celda pertenece a un camión: la OT se agrega como viaje (no como jornada de cuadrilla)
- Si la OT está bloqueada (pendiente de habilitación): mostrar tooltip "Esta OT aún no está habilitada" y no permitir el drop

---

## Zona 4 — Cola de OTs sin asignar

Ancho: **172px**. Fija a la derecha. Se oculta cuando el panel de jornada está abierto.

### Header
```
SIN ASIGNAR    [4]
```
Badge contador: fondo `#FAEEDA`, texto `#854F0B`.

### Hint de drag
```
[icono drag-drop]  Arrastrá al tablero
```
10px, terciario, con borde punteado. Solo visible si hay OTs en la cola.

### Ítem de OT en la cola

```
┌──────────────────────────────────┐
│  Tigre Industrial                │
│  [Armado]    [🕐 3 días]         │
└──────────────────────────────────┘
```

- Nombre: 11px, font-weight 500
- Badge de tipo con color correspondiente
- Duración estimada total (en días): ícono `ti-clock`, 9px, terciario
- Borde: `--color-border-tertiary`
- Hover: borde `#D85A30`
- Cursor: `grab`

### OTs bloqueadas (pendientes de habilitación)

```
┌──────────────────────────────────┐
│  Belgrano R 2140          🔒     │
│  [Armado]    Esperando hab.      │
└──────────────────────────────────┘
```
- Opacity 0.6, cursor `not-allowed`
- Ícono de candado visible
- Tooltip al hover: "Habilitaciones aún no aprobó esta OT"
- No son arrastrables

---

## Zona 5 — Panel de Jornada

Se desliza desde la derecha al hacer clic en un bloque de OT. Ancho: **236px**. Reemplaza la cola mientras está abierto.

### Header del panel
```
Madero 1240 — Armado
[Armado]  Lun 16 jun · Cuadrilla 1
```
- Fondo `--color-background-secondary`
- Nombre de obra + tipo de OT: 13px, font-weight 500
- Badge de tipo + fecha + recurso: 10px, terciario

### Cuerpo del panel — dos columnas

El panel se divide en dos columnas internas:

---

#### Columna izquierda: Cuadrilla

**Título:** "CUADRILLA 1 — ESTA JORNADA"

**Barra visual de jornada:**
```
07:00    10:00    13:00    16:00   17:00
[══════════Madero 6h══════╪🍽╪══Adic 2h══]
```
- Track de 100% de ancho, 28px de alto, border-radius 6px
- Los bloques OT se posicionan proporcionalmente según horario (07:00 = 0%, 17:00 = 100%)
- Bloque de almuerzo siempre visible como franja gris (12:00–13:00)
- Cada bloque con color de su tipo de OT
- Las etiquetas dentro de los bloques muestran nombre de obra + horas

**Barra de capacidad resumen:**
```
[████████████████████████░░]  0h disponibles · jornada completa
```
Misma lógica de color que la columna de recursos.

**Duración de esta OT en esta jornada:**
```
[  6  ] hs esta jornada
Duración original: 8hs (de técnica) — no se modifica
```
- Input numérico editable: cuántas horas se trabaja en esta OT este día específico
- Nota en gris: duración original como referencia intocable

**Personal asignado:**

Lista de chips de operarios disponibles de obra (excluyendo operarios de depósito):
```
[JR] J. Ramírez         [×]
[ML] M. López           [×]
[RS] R. Sosa            [×]
[+ Agregar operario]
```
- Avatar 20px, iniciales, fondo `#FAECE7`, texto `#993C1D`
- Botón `×` para quitar
- Botón "Agregar operario": abre dropdown/popover con lista de operarios de obra disponibles (que no estén asignados a otra cuadrilla en esa misma franja)
- Operarios ya asignados en otra cuadrilla ese día aparecen con opacity 0.4 y "ya asignado" como tooltip

---

#### Columna derecha: Camión y chofer

**Título:** "CAMIÓN Y CHOFER — ESTE VIAJE"

**Card de camión asignado:**
```
┌── azul ──────────────────────────────── [×] ──┐
│  [T1]  Camión 1                                │
│        Ford F-350 · ABC 123                    │
├────────────────────────────────────────────────┤
│  Chofer: [MG] M. Gómez              [Cambiar]  │
├────────────────────────────────────────────────┤
│  Franja horaria del viaje                      │
│  El chofer no permanece toda la jornada.       │
│  [07:00] → [10:30]    [3.5h]                   │
├────────────────────────────────────────────────┤
│  Viajes de Camión 1 este día                   │
│  07:00–10:30  [══ Madero 1240 ← este ══      ] │
│  13:00–15:00  [          ══ Palermo Soho ══  ] │
│  ✓ Sin superposición                           │
└────────────────────────────────────────────────┘
```

**Detalles de cada sección:**

**Camión:**
- Avatar azul con código (T1, T2)
- Nombre del camión + patente
- Botón `×` para quitar camión y empezar de cero

**Chofer:**
- Avatar coral con iniciales
- Nombre del chofer
- Botón "Cambiar": abre dropdown con lista de choferes disponibles

**Franja horaria del viaje:**
- Dos inputs `type="time"` con formato HH:MM: salida y llegada estimada
- Label calculado automáticamente con la duración en horas (ej: "3.5h")
- Texto informativo: "El chofer no permanece toda la jornada en obra"

**Mini-timeline de viajes del camión ese día:**
- Muestra todos los viajes ya asignados a ese camión en el día
- El viaje actual se resalta en azul oscuro (`#378ADD`), los otros en azul claro (`#B5D4F4`)
- Cada viaje: label con franja horaria + nombre de obra
- **Validación de superposición:**
  - ✓ "Sin superposición" en verde si no hay conflicto
  - ⚠ "Superposición con [Obra X]" en coral si las franjas se pisan — impide guardar

**Botón "Asignar camión"** (cuando no hay camión asignado aún):
```
[🚛 Asignar camión]   (borde punteado)
```
Abre un selector de camión (lista de camiones disponibles en esa franja horaria).

**Botón "Asignar otro camión"** (cuando ya hay uno, para obras que necesitan dos viajes):
```
[🚛 Asignar otro camión a esta jornada]
```

---

### Footer del panel
```
[Cancelar]         [Guardar jornada]
```
- "Cancelar": cierra panel, descarta cambios no guardados
- "Guardar jornada": fondo `#D85A30`, guarda la asignación y actualiza el tablero
  - Validaciones antes de guardar:
    - Si no hay personal: advertencia "Esta jornada no tiene operarios asignados" (se puede guardar igual con confirmación)
    - Si no hay camión: advertencia "Esta jornada no tiene camión asignado" (se puede guardar igual)
    - Si hay superposición de franjas en camión: **bloqueante**, no permite guardar

---

## Modal: Bloquear horario

Se abre con el botón "Bloquear horario" del topbar.

```
Bloquear franja horaria

Cuadrilla:  [Cuadrilla 1 ▾]
Día:        [Lun 16 jun   ▾]
Desde:      [12:00]
Hasta:      [13:00]
Motivo:     [Almuerzo          ] (opcional)

[Cancelar]    [Bloquear]
```

- Al confirmar, se crea un bloque de tipo "bloqueado" en la celda correspondiente
- Ese bloque impide asignar OTs que se superpongan con la franja
- El bloque es visible en la grilla como cualquier otro bloque, con estilo "bloqueado"
- Se puede eliminar haciendo clic en el bloque y seleccionando "Quitar bloqueo"

---

## Modelo de datos

### Asignación de jornada (por OT × cuadrilla × día)
```js
{
  id: String,
  otId: String,                    // referencia a la OT
  obraNombre: String,
  otTipo: 'armado' | 'desarme' | 'mantenimiento' | 'adicional',
  cuadrillaId: String,
  fecha: Date,                     // día de la jornada
  horasJornada: Number,            // horas asignadas esta jornada (editable, ≠ duración original)
  duracionOriginal: Number,        // horas totales de la OT según técnica (solo lectura)
  horaInicio: String,              // "07:00" — hora de inicio de esta jornada
  personal: [
    {
      operarioId: String,
      nombre: String,
      iniciales: String
    }
  ],
  camion: {
    camionId: String,
    nombre: String,
    patente: String,
    choferId: String,
    choferNombre: String,
    choferIniciales: String,
    franjaDesde: String,           // "07:00"
    franjaHasta: String            // "10:30"
  } | null,
  estado: 'sin_completar' | 'completa',
  // 'completa' = tiene al menos 1 operario + camión con chofer asignado
}
```

### Bloqueo de horario
```js
{
  id: String,
  cuadrillaId: String,
  fecha: Date,
  franjaDesde: String,             // "12:00"
  franjaHasta: String,             // "13:00"
  motivo: String                   // "Almuerzo", "Capacitación", etc.
}
```

### Operario (entidad del sistema)
```js
{
  id: String,
  nombre: String,
  iniciales: String,
  tipo: 'obra' | 'deposito',       // solo los de tipo 'obra' aparecen en la planificación de cuadrillas
}
```

### Camión
```js
{
  id: String,
  nombre: String,                  // "Camión 1"
  patente: String,                 // "ABC 123"
  modelo: String                   // "Ford F-350"
}
```

---

## Lógica de disponibilidad

### Disponibilidad de cuadrilla
```js
const horasOcupadas = asignacionesDelDia
  .filter(a => a.cuadrillaId === cuadrillaId && a.fecha === dia)
  .reduce((sum, a) => sum + a.horasJornada, 0);

const horasBloqueadas = bloqueosDelDia
  .filter(b => b.cuadrillaId === cuadrillaId && b.fecha === dia)
  .reduce((sum, b) => duracionEnHoras(b.franjaDesde, b.franjaHasta), 0);

const horasDisponibles = 8 - horasOcupadas - horasBloqueadas;
// 8 = horas netas de jornada (excluyendo almuerzo)
```

### Disponibilidad de camión (por franja horaria)
```js
// Verificar superposición de franjas
const hayConflicto = viajesExistentes.some(viaje =>
  viaje.franjaDesde < nuevaFranjaHasta &&
  viaje.franjaHasta > nuevaFranjaDesde
);
```

### Disponibilidad de operario
Un operario está disponible en una franja si no está asignado a otra cuadrilla en el mismo día (sin importar horario, ya que los operarios de cuadrilla van todo el día).

### Estado de jornada (dot)
```js
const estaCompleta = asignacion.personal.length > 0 && asignacion.camion !== null;
// dot verde = completa, dot amarillo = sin_completar
```

---

## Estados de la OT en el tablero

| Estado OT | Comportamiento en tablero |
|---|---|
| Habilitada | Aparece en cola, arrastrable, asignable |
| Pendiente de habilitación | Aparece en cola pero bloqueada (candado, no arrastrable) |
| En ejecución | Aparece en tablero como bloque activo |
| Cerrada | No aparece en el módulo de planificación |

---

## Navegación y vistas

### Vista semanal (default)
- 5 columnas: Lun a Vie
- Navegación con botones `‹` y `›` por semana completa
- Botón "Hoy" vuelve a la semana actual

### Vista diaria
- 1 columna = el día seleccionado
- Muestra más detalle por celda (más alto, se ven los horarios de los bloques)
- Toggle en el topbar: "Semana | Día"

---

## Notas de implementación

- Usar una librería de drag & drop compatible con React (recomendado: `@dnd-kit/core`) para el sistema de arrastre de OTs desde la cola al tablero.
- El scroll vertical de la columna de recursos y la grilla de días debe estar sincronizado — implementar con un `ref` compartido o `scrollTop` sincronizado via evento.
- Las OTs de la cola se traen filtradas por estado `"habilitada"` desde el endpoint existente de OTs.
- Los operarios se traen filtrados por `tipo: 'obra'` del endpoint de personal.
- La barra de capacidad en la columna de recursos debe recalcularse en tiempo real al modificar asignaciones en el panel (sin necesidad de recargar).
- El mini-timeline de viajes del camión en el panel debe actualizarse al cambiar la franja horaria de los inputs, validando superposición en el cliente antes de permitir guardar.
- Al cerrar el panel con "Cancelar" sin guardar, si la jornada fue recién creada por un drop, eliminarla del tablero (revertir el drop).
