# Módulo: Planificación — Mejoras v2
> Adiciones al módulo de Planificación ya implementado.
> Pasar junto con `modulo-planificacion.md` como contexto base.

---

## Resumen de cambios

Este documento describe tres mejoras a agregar sobre el módulo de Planificación existente:

1. **Vista mensual** — nueva vista de carga y disponibilidad por mes
2. **Cola de jornadas** — las OTs multi-día exponen jornadas individuales arrastrables
3. **Menú contextual en bloques** — opción de volver una OT completa a pendiente

---

## 1. Vista mensual

### Concepto
La vista mensual no replica el detalle de la vista semanal. Su propósito es distinto: **planificación a largo plazo**. Muestra de un vistazo qué días tienen carga y qué días tienen capacidad disponible, sin entrar en el detalle de cada OT.

### Toggle de vistas
Agregar "Mes" al toggle de vistas existente en el topbar:

```
[Mes]  [Semana]  [Día]
```

Al cambiar de vista, el label de período del topbar cambia:
- Mes → "jun 2026"
- Semana → "16 – 20 jun 2026"
- Día → "mar 17 jun 2026"

Los botones `‹` y `›` navegan por mes completo cuando la vista mensual está activa.

---

### Layout de la vista mensual

La vista se organiza en **bloques de semana** apilados verticalmente. Cada bloque tiene:

```
┌─────────────────────────────────────────────────────────────┐
│  Sem. 25   Lun 16   Mar 17 ◀hoy   Mié 18   Jue 19   Vie 20 │  ← header de semana
├─────────────────────────────────────────────────────────────┤
│  👥 Cuadrillas                                               │  ← separador
├────────────┬──────────┬──────────┬──────────┬───────────────┤
│ Cuadrilla 1│ 6h ocup. │ 8h ocup. │ 4h libre │  8h libre     │
│            │ 🟦 🟦    │ 🟦       │ 🟩       │               │
├────────────┼──────────┼──────────┼──────────┼───────────────┤
│ Cuadrilla 2│ 6h libre │ 8h libre │ 8h ocup. │  6h ocup.     │
│            │ 🟧       │          │ 🟧 🟦    │  🟦           │
├─────────────────────────────────────────────────────────────┤
│  🚛 Camiones                                                 │  ← separador
├────────────┬──────────┬──────────┬──────────┬───────────────┤
│ Camión 1   │ 1 viaje  │ 1 viaje  │  libre   │   libre       │
│            │ 🟦       │ 🟦       │          │               │
└────────────┴──────────┴──────────┴──────────┴───────────────┘
```

**Columna de recurso:** 80px de ancho, fija a la izquierda. Muestra avatar + nombre del recurso.

**Celdas de día:** cada celda contiene dos elementos:
- **Pill de capacidad** (línea superior):
  - Verde `#EAF3DE` / texto `#3B6D11`: "8h libre" o "X viajes libre"
  - Amarillo `#FAEEDA` / texto `#854F0B`: "Xh ocup." (entre 1h y 7h ocupadas)
  - Coral `#FAECE7` / texto `#993C1D`: "8h ocup." o "jornada completa"
  - Para camiones: "X viaje/s" cuando tiene viajes asignados, "libre" cuando no
- **Puntitos de OT** (línea inferior): uno por OT asignada ese día, con color por tipo:
  - Armado: `#378ADD`
  - Desarme: `#EF9F27`
  - Mantenimiento: `#639922`
  - Adicional: `#E06090`
  - Tamaño: 8×8px, border-radius 2px

**Día de hoy:** header con fondo `#FAECE7`, número en `#D85A30`.

**Interacción:** clic en cualquier celda de día navega a la vista semanal posicionada en esa semana.

**Leyenda fija al pie de la vista mensual:**
```
🟩 Disponible   🟨 Parcial   🟥 Completo   🟦 Armado  🟧 Desarme  🟩 Mant.  🟪 Adicional
```

---

### Estructura de semanas en el mes

- El mes se divide en sus semanas naturales (Lun–Vie)
- Cada semana tiene su propio header con número de semana y días
- Los separadores de sección (Cuadrillas / Camiones) se repiten en cada bloque de semana para mantener legibilidad al hacer scroll vertical
- Los separadores de sección dentro de cada semana son `position: sticky; top: Npx` para que permanezcan visibles al hacer scroll dentro del mes

---

## 2. Cola de jornadas (OTs multi-día)

### Concepto
Una OT con duración estimada de N días genera N jornadas en la cola. Cada jornada es una unidad arrastrable independiente. La cola deja de mostrar OTs como ítems simples y pasa a mostrarlas como **grupos colapsables con jornadas anidadas**.

---

### Nuevo formato de ítem en la cola

```
┌─────────────────────────────────────────┐
│  Belgrano R 2140            [Armado]    │  ← header del grupo (no arrastrable)
│  5 jornadas · 0 asignadas              │
├─────────────────────────────────────────┤
│  [●1]  Jornada 1         ← siguiente ⠿ │  ← arrastrable
│  [ 2]  Jornada 2                     ⠿ │  ← arrastrable
│  [ 3]  Jornada 3                        │  ← bloqueada
│  [ 4]  Jornada 4                        │  ← bloqueada
│  [ 5]  Jornada 5                        │  ← bloqueada
└─────────────────────────────────────────┘
```

**Header del grupo:**
- Nombre de la obra (11px, font-weight 500)
- Badge de tipo de OT
- Contador: "N jornadas · X asignadas" (9px, terciario)
- No es arrastrable

**Jornadas:**
- Número de jornada en círculo de 18px
- Las dos primeras siempre disponibles para arrastrar
- Las siguientes bloqueadas hasta que la anterior esté asignada
- La "siguiente sugerida" (la de menor número sin asignar) se marca con el número en coral `#D85A30` y etiqueta "← siguiente" en coral
- Ícono de grip `ti-grip-vertical` visible solo en las arrastrables
- Las bloqueadas tienen `opacity: 0.45` y `cursor: not-allowed`

**Jornadas ya asignadas** (aparecen al principio del grupo, en gris):
- Número reemplazado por ✓ en círculo verde `#EAF3DE` / `#3B6D11`
- Texto con día asignado: "Jornada 1 · Lun 16"
- `opacity: 0.4`, no arrastrables

---

### Regla de desbloqueo de jornadas

```
// Las primeras 2 siempre están disponibles para arrastrar.
// A partir de la 3ra, se desbloquea la siguiente cuando la anterior está asignada.

const jornadasArrastrables = jornadas.filter((j, i) => {
  if (i < 2) return j.estado === 'pendiente';
  return j.estado === 'pendiente' && jornadas[i - 1].estado === 'asignada';
});
```

**Excepción:** si por razones operativas se necesita asignar jornadas fuera de orden, el usuario puede hacer clic en una jornada bloqueada y aparece un diálogo:
```
"Esta jornada aún no tiene las anteriores asignadas.
¿Querés asignarla de todas formas?"
[Cancelar]  [Asignar de todas formas]
```

---

### Modelo de datos — Jornada de OT

Agregar al modelo de OT existente:

```js
// En la OT
{
  id: String,
  // ... campos existentes ...
  duracionDias: Number,          // cantidad total de jornadas estimadas
  jornadas: [
    {
      id: String,
      otId: String,
      numero: Number,            // 1, 2, 3... N
      estado: 'pendiente' | 'asignada' | 'ejecutada',
      asignacionId: String | null  // referencia a la asignación de jornada si está asignada
    }
  ]
}
```

---

### Comportamiento al arrastrar una jornada

1. El usuario arrastra la jornada desde la cola al tablero (celda recurso × día)
2. Se crea la asignación con estado `sin_completar`
3. El panel de jornada se abre automáticamente para completar personal y camión
4. La jornada en la cola pasa a estado `asignada` y se muestra tachada con ✓
5. El contador del grupo se actualiza: "5 jornadas · 1 asignada"
6. La siguiente jornada bloqueada (si aplica) se desbloquea

**En el bloque del tablero**, mostrar el número de jornada:
```
Belgrano R 2140       [●]
Armado · J1/5 · 8h
```
Formato: "J{numero}/{total}" — ej: J1/5, J3/5

---

## 3. Menú contextual — Volver OT a pendiente

### Cómo se activa

Clic (click derecho o clic simple con un pequeño delay de 300ms para diferenciarlo del drag) sobre cualquier bloque de OT en el tablero abre un menú contextual flotante.

> Implementar como clic simple sobre el bloque. El primer clic abre el menú contextual; si el usuario quiere editar la jornada en detalle, lo hace desde el menú.

---

### Contenido del menú

```
┌────────────────────────────────┐
│  ✏  Editar jornada             │
│  ↔  Mover a otro día           │
│  ─────────────────────────     │
│  ↺  Volver OT a pendiente      │  ← en coral #D85A30
└────────────────────────────────┘
```

**Editar jornada:** abre el panel lateral de jornada (mismo comportamiento que antes).

**Mover a otro día:** abre un date picker simple para seleccionar el nuevo día. Al confirmar, mueve el bloque al nuevo día manteniendo el recurso (cuadrilla/camión). Si el recurso no tiene capacidad ese día, mostrar advertencia pero permitir de todas formas.

**Volver OT a pendiente:** acción destructiva, requiere confirmación:

```
Modal de confirmación:

"¿Volver 'Madero 1240 — Armado' a pendiente?"

Esto quitará del tablero todas las jornadas
asignadas de esta OT (J1, J2, J3) y las
devolverá a la cola como pendientes.

[Cancelar]    [Sí, volver a pendiente]
```

Al confirmar:
- Se eliminan del tablero todos los bloques de esa OT en todas las cuadrillas y días
- Todas las jornadas de la OT vuelven a estado `pendiente` en la cola
- El grupo en la cola se resetea: todas las jornadas vuelven a aparecer como pendientes
- Las asignaciones eliminadas liberan la capacidad de los recursos en esos días

---

### Posicionamiento del menú contextual

- Aparece en la posición del clic, dentro del bloque
- Si está cerca del borde derecho o inferior de la pantalla, se reposiciona para no quedar cortado
- Se cierra con clic en cualquier otro lugar del documento
- Solo puede haber un menú contextual abierto a la vez

---

## Resumen de cambios en el modelo de datos

| Entidad | Campo nuevo | Descripción |
|---|---|---|
| OT | `duracionDias` | Cantidad de jornadas estimadas |
| OT | `jornadas[]` | Array de jornadas con estado individual |
| Jornada | `numero` | Posición en la secuencia (1 a N) |
| Jornada | `estado` | `pendiente` / `asignada` / `ejecutada` |
| Asignación de jornada | `jornadaId` | Referencia a la jornada de la OT |
| Asignación de jornada | `jornadaNumero` | Para mostrar "J2/5" en el bloque |

---

## Endpoints nuevos o modificados sugeridos

```
// Obtener jornadas de una OT
GET /ots/:otId/jornadas

// Actualizar estado de una jornada
PATCH /ots/:otId/jornadas/:jornadaId
body: { estado: 'pendiente' | 'asignada' }

// Volver OT completa a pendiente (resetea todas las jornadas)
POST /ots/:otId/volver-pendiente
→ elimina todas las asignaciones de esa OT
→ setea todas las jornadas a estado 'pendiente'

// Mover asignación a otro día
PATCH /asignaciones/:asignacionId/mover
body: { nuevaFecha: Date }
```

---

## Notas de implementación

- La vista mensual comparte los mismos datos que la vista semanal — no requiere endpoints nuevos, solo una presentación diferente de las asignaciones existentes.
- El toggle de vistas (Mes / Semana / Día) puede manejar el estado con un `useState('semana')` en el componente padre del módulo.
- Al cambiar de vista mensual a semanal por clic en una celda, pasar la semana target como parámetro al componente semanal para que se posicione correctamente.
- El menú contextual debe usar `position: fixed` (no `absolute`) para evitar que quede cortado por los contenedores con `overflow: hidden`.
- La acción "Volver OT a pendiente" es irreversible desde la UI — no implementar undo, solo confirmación modal.
