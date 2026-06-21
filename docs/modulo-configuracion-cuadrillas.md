# Módulo: Configuración de Cuadrillas
> Instrucciones de UI/UX para Claude Code — Andamios Buenos Aires (ABA)
> Stack: React + Node.js
> Pasar junto con `modulo-planificacion.md` como contexto base.

---

## Contexto y motivación

Hasta ahora el personal se asignaba manualmente en cada jornada desde el panel de planificación. Este documento introduce dos cambios:

1. **Pantalla de configuración de cuadrillas** — donde se define la composición base (responsable + personal habitual) de cada cuadrilla.
2. **Precarga automática de personal en el panel de jornada** — al asignar una OT a una cuadrilla, el personal base se carga automáticamente sin que el operador tenga que seleccionarlo desde cero.

### Reglas de negocio
- Cada cuadrilla tiene un **responsable** (un operario que lidera el equipo) y un **plantel base** de operarios.
- El personal base es la composición habitual pero **no es fija por jornada** — se puede modificar puntualmente desde el panel de planificación sin afectar la configuración base.
- Las cuadrillas pueden estar **activas o inactivas**. Solo las activas aparecen en el tablero de planificación.
- Para subdivisiones temporales (ej: partir una cuadrilla en dos), se crea una nueva cuadrilla, se le asigna personal, y se desactiva cuando ya no se necesita.
- Un operario puede pertenecer al plantel base de **solo una cuadrilla** a la vez. Puede figurar como "Sin cuadrilla" si aún no fue asignado.
- Los operarios de **depósito** no aparecen en este módulo — solo operarios de tipo `'obra'`.
- Los camiones **no pertenecen a ninguna cuadrilla** — son flota compartida que se asigna por viaje desde el panel de planificación.

---

## Ruta

`/configuracion/cuadrillas`

Accesible desde el menú de configuración de la app (ícono de engranaje en el sidebar).

---

## Pantalla: Configuración de cuadrillas

### Header de página

```
Cuadrillas                                           [+ Nueva cuadrilla]
Composición base de cada cuadrilla · se precarga al planificar cada jornada
```

- Título: 22px, font-weight 500
- Subtítulo: 13px, terciario
- Botón "Nueva cuadrilla": fondo `#D85A30`, blanco, ícono `ti-plus`
  - Al hacer clic: abre modal de creación (ver más abajo)

---

### Grid de cuadrillas

Layout: grilla de 3 columnas con `gap: 12px`.

Cada cuadrilla es una **card** con tres secciones:

---

#### Card de cuadrilla — Header

```
┌─────────────────────────────────────────────────┐
│  [C1]  Cuadrilla 1              [Activa]  [···] │
│        5 operarios                              │
└─────────────────────────────────────────────────┘
```

- Avatar circular 36px con iniciales (C1, C2...), fondo `#FAECE7`, texto `#993C1D`
- Nombre de cuadrilla: 14px, font-weight 500
- Contador de operarios: 11px, terciario
- Badge de estado:
  - Activa: fondo `#EAF3DE`, texto `#3B6D11`
  - Inactiva: fondo `--color-background-secondary`, texto terciario
- Botón `···` (ícono `ti-dots-vertical`): abre menú con opciones:
  - "Editar nombre"
  - "Desactivar cuadrilla" / "Activar cuadrilla" (toggle según estado)
  - Separador
  - "Eliminar cuadrilla" (solo si no tiene jornadas futuras asignadas — destructivo, con confirmación)

**Cards inactivas:** `opacity: 0.55`, avatar con fondo `--color-background-secondary` y texto terciario.

---

#### Card de cuadrilla — Responsable

```
┌─────────────────────────────────────────────────┐
│  [JR]  RESPONSABLE                  [Cambiar]   │
│        Juan Ramírez                             │
└─────────────────────────────────────────────────┘
```

- Fondo sutil: `rgba(216,90,48,0.03)` (coral muy suave)
- Borde inferior: `0.5px solid --color-border-tertiary`
- Avatar 28px, fondo `#D85A30`, texto blanco — diferenciado del resto del personal
- Label "RESPONSABLE": 10px, uppercase, `#D85A30`, letter-spacing 0.04em
- Nombre: 12px, font-weight 600, color primario
- Botón "Cambiar": 10px, terciario, sin fondo
  - Abre dropdown/popover con lista de operarios del plantel base de esa cuadrilla para seleccionar el nuevo responsable

> El responsable es siempre uno de los operarios del plantel base, no alguien externo.

---

#### Card de cuadrilla — Personal base

```
┌─────────────────────────────────────────────────┐
│  PERSONAL BASE                                  │
│  [ML] M. López                             [×]  │
│  [RS] R. Sosa                              [×]  │
│  [PG] P. González                          [×]  │
│  [AT] A. Torres                            [×]  │
│  [+ Agregar operario]                           │
└─────────────────────────────────────────────────┘
```

- Label "PERSONAL BASE": 10px, uppercase, terciario
- Cada fila: avatar 24px (fondo `--color-background-secondary`, texto secundario) + nombre + botón `×`
- Botón `×` visible solo en hover de la fila. Al hacer clic quita al operario del plantel base (con confirmación si el operario es el responsable actual).
- Botón "Agregar operario": ancho completo, borde dashed, ícono `ti-plus`
  - Abre dropdown con operarios disponibles (tipo `'obra'` y que no pertenezcan ya al plantel base de ninguna cuadrilla, o que estén "Sin cuadrilla")
  - Al seleccionar, el operario se agrega al plantel base

**Cards inactivas:** no muestran botones de edición (solo lectura).

---

#### Card especial — Nueva cuadrilla

Última posición en el grid. Card con borde dashed:

```
┌ - - - - - - - - - - - - - - - - - - - - - ┐
│                                             │
│              [+]  (círculo dashed)          │
│           Nueva cuadrilla                  │
│     Para divisiones temporales             │
│          o nuevos equipos                  │
│                                             │
└ - - - - - - - - - - - - - - - - - - - - - ┘
```

- Altura mínima: 180px
- Hover: fondo `--color-background-secondary`, borde y texto en `#D85A30`
- Al hacer clic: mismo comportamiento que el botón "Nueva cuadrilla" del header

---

### Pool de operarios (sección inferior)

Debajo del grid de cuadrillas, una sección que muestra todos los operarios de tipo `'obra'`:

```
Pool de operarios de obra
Todos los operarios disponibles para asignar a cuadrillas · los de depósito no aparecen acá
```

Grid de 4 columnas, una fila por operario:

```
┌──────────────────────────────────────────────────────────────────────┐
│  [JR] J. Ramírez          [Cuadrilla 1]                              │
│  [ML] M. López            [Cuadrilla 1]                              │
│  [BM] B. Morales          [Sin cuadrilla]                            │
│  [SR] S. Romero           [Sin cuadrilla]                            │
└──────────────────────────────────────────────────────────────────────┘
```

- Avatar 28px, fondo `--color-background-secondary`
- Nombre: 12px
- Badge de cuadrilla:
  - Asignado: fondo `#EAF3DE`, texto `#3B6D11`, nombre de la cuadrilla
  - Sin cuadrilla: fondo `--color-background-secondary`, texto terciario, "Sin cuadrilla"
- El pool es solo lectura — la asignación se gestiona desde las cards de cuadrilla

---

### Modal: Nueva cuadrilla / Editar nombre

```
┌─────────────────────────────────┐
│  Nueva cuadrilla                │
│                                 │
│  Nombre                         │
│  [Cuadrilla 5            ]      │
│                                 │
│  (el responsable y personal     │
│   se asignan después)           │
│                                 │
│  [Cancelar]    [Crear]          │
└─────────────────────────────────┘
```

- Input de nombre con placeholder "Ej: Cuadrilla 5, Cuadrilla 1B"
- Al crear: la cuadrilla aparece en el grid como activa y vacía (sin responsable ni personal)
- El avatar se genera automáticamente con las iniciales del nombre

---

## Cambios en el panel de jornada (módulo de Planificación)

### Precarga automática del personal base

Al asignar una OT a una cuadrilla (por drag & drop o por "Asignar OT"), el panel de jornada debe:

1. Consultar la composición base de la cuadrilla asignada
2. Precargar el campo "Personal asignado" con todos los operarios del plantel base
3. Mostrar el responsable de la cuadrilla primero en la lista, con su badge destacado en coral

```
Personal asignado

[JR] Juan Ramírez    RESPONSABLE    [×]
[ML] M. López                       [×]
[RS] R. Sosa                        [×]
[PG] P. González                    [×]
[+ Agregar operario]
```

**El responsable en el panel de jornada:**
- Badge "RESPONSABLE" en coral `#D85A30` a la derecha del nombre, 10px, uppercase
- Avatar con fondo `#D85A30` y texto blanco (mismo que en la card de configuración)
- Aparece siempre primero en la lista, no se puede quitar sin confirmación

**Comportamiento de la precarga:**
- Los cambios que se hagan en el panel de jornada (quitar operarios, agregar refuerzos) son **solo para esa jornada específica** — no modifican la composición base de la cuadrilla
- Si el operador quita un operario de una jornada, no se pregunta si quiere quitarlo de la cuadrilla — la modificación es puntual por defecto

**Texto informativo debajo del personal:**
```
Personal precargado desde Cuadrilla 1 · modificaciones solo afectan esta jornada
```
10px, terciario, italic.

---

### Indicador de responsable en el tablero

En el bloque de OT dentro del tablero semanal, agregar una línea con el responsable de cuadrilla:

```
┌─ [borde azul] ──────────────────────────┐
│  Madero 1240                    [● dot]  │
│  Armado · J2/5 · 6h                     │
│  J. Ramírez (resp.)                     │  ← nuevo
└─────────────────────────────────────────┘
```

- Nombre del responsable: 9px, terciario, al pie del bloque
- Solo visible si la jornada ya tiene personal asignado
- Si el bloque es muy pequeño (altura mínima), omitir esta línea

---

## Modelo de datos

### Cuadrilla
```js
{
  id: String,
  nombre: String,               // "Cuadrilla 1", "Cuadrilla 1B"
  iniciales: String,            // "C1", generado automáticamente
  estado: 'activa' | 'inactiva',
  responsableId: String,        // debe ser un operario del plantelBase
  plantelBase: [
    {
      operarioId: String,
      nombre: String,
      iniciales: String
    }
  ],
  fechaCreacion: Date,
  esTemporaria: Boolean         // true para cuadrillas de subdivisión
}
```

### Modificación al modelo de Asignación de jornada
```js
{
  // ... campos existentes ...
  personal: [
    {
      operarioId: String,
      nombre: String,
      iniciales: String,
      esResponsable: Boolean    // nuevo campo
    }
  ]
}
```

---

## Endpoints nuevos o modificados

```
// Obtener todas las cuadrillas (con plantel base)
GET /cuadrillas
query params: ?estado=activa|inactiva|todas (default: todas)

// Crear cuadrilla
POST /cuadrillas
body: { nombre: String }

// Actualizar cuadrilla (nombre, estado, responsable, plantel)
PATCH /cuadrillas/:id
body: { nombre?, estado?, responsableId?, plantelBase? }

// Eliminar cuadrilla
DELETE /cuadrillas/:id
// Solo permitir si no tiene jornadas futuras asignadas

// Obtener operarios de obra (para el pool y dropdowns)
GET /operarios?tipo=obra

// Endpoint modificado: al crear asignación de jornada,
// el backend debe precargar el plantel base si no se envía personal
POST /asignaciones
body: {
  otId, cuadrillaId, fecha, horasJornada,
  personal: []   // si viene vacío, backend precarga el plantel base de la cuadrilla
}
```

---

## Lógica de precarga en el frontend

```js
// Al soltar una OT en el tablero sobre una cuadrilla:
const cuadrilla = await getCuadrilla(cuadrillaId);

const personalPrecargado = cuadrilla.plantelBase.map(op => ({
  operarioId: op.operarioId,
  nombre: op.nombre,
  iniciales: op.iniciales,
  esResponsable: op.operarioId === cuadrilla.responsableId
}));

// Ordenar: responsable primero, resto en el orden del plantel
const personalOrdenado = [
  ...personalPrecargado.filter(p => p.esResponsable),
  ...personalPrecargado.filter(p => !p.esResponsable)
];

// Abrir panel de jornada con personal precargado
openPanelJornada({ cuadrillaId, personal: personalOrdenado });
```

---

## Notas de implementación

- La pantalla de configuración de cuadrillas vive en `/configuracion/cuadrillas`, separada del tablero de planificación. Accesible desde el menú de configuración (ícono engranaje).
- No implementar drag & drop entre cuadrillas en esta pantalla — la asignación de operarios se hace solo con los dropdowns/selects.
- Un operario puede estar en el plantel base de una sola cuadrilla, pero puede ser agregado puntualmente a una jornada de otra cuadrilla desde el panel de planificación (sin cambiar su cuadrilla base).
- Al desactivar una cuadrilla, verificar si tiene jornadas futuras asignadas. Si las tiene, mostrar advertencia: "Esta cuadrilla tiene X jornadas planificadas en el futuro. Desactivarla no eliminará esas asignaciones."
- El campo `esTemporaria` en la cuadrilla es informativo — no cambia ningún comportamiento, solo sirve para filtrar en reportes futuros.
