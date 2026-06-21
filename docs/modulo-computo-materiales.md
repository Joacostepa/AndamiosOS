# Módulo: Cómputo de Materiales
> Instrucciones de UI/UX para Claude Code — Andamios Buenos Aires (ABA)
> Stack: React + Node.js · Integrado con Odoo vía API

---

## Contexto del módulo

El cómputo de materiales es el primer paso operativo de cada obra. Lo realiza **Oficina Técnica** una vez que Comercial confirma la obra en Odoo. El cómputo queda como la **línea base de materiales** de la que se desprenden todos los remitos (entrega, sobrante y devolución) y los análisis de desvío posteriores.

Este módulo tiene **dos pantallas**:
1. **Home del módulo** — vista general de todos los cómputos por estado
2. **Pantalla de cómputo** — donde se seleccionan materiales y cantidades para una obra específica

---

## Identidad visual

Derivada del logo de ABA:

| Token | Valor |
|---|---|
| Color primario / acción | `#D85A30` (coral ABA) |
| Color primario hover | `#C04E27` |
| Fondo primario acento | `#FAECE7` |
| Texto sobre acento | `#993C1D` |
| Borde acento | `#F0997B` |
| Avatar / iniciales | fondo `#FAECE7` · texto `#993C1D` |
| Pendiente (amarillo) | borde `#EF9F27` · badge fondo `#FAEEDA` · texto `#854F0B` |
| En proceso (azul) | borde `#378ADD` · badge fondo `#E6F1FB` · texto `#185FA5` · barra `#378ADD` |
| Completado (verde) | borde `#639922` · badge fondo `#EAF3DE` · texto `#3B6D11` |

Usar CSS variables del sistema (`--color-background-primary`, `--color-text-secondary`, etc.) para todo lo que no sea color de marca, para garantizar compatibilidad con modo oscuro.

---

## Pantalla 1 — Home del módulo

### Ruta sugerida
`/computos`

### Layout general
- Header de página con título, subtítulo y botón "Nuevo cómputo"
- Tres secciones verticales: Pendientes · En proceso · Completados
- Sin tabs ni filtros adicionales — la división por estado es suficiente

### Header de página
```
Cómputos de materiales                          [+ Nuevo cómputo]
Cómputo madre de cada obra · línea base para remitos y desvíos
```
- Botón "Nuevo cómputo": fondo `#D85A30`, texto blanco, ícono `ti-plus`
- Al hacer clic abre un selector de obra (solo obras sin cómputo asignado aún, traídas desde la API)

---

### Sección 1 — Pendientes de cómputo

**Cuándo aparece una obra acá:** cuando la obra fue confirmada en Odoo y sincronizada a la app, pero todavía no tiene ningún cómputo iniciado.

**Header de sección:**
```
🕐 Pendientes de cómputo   [2]
```
- Ícono: `ti-clock` color `#BA7517`
- Badge contador: fondo `#FAEEDA`, texto `#854F0B`

**Card de obra pendiente:**
```
┌─ [borde izquierdo amarillo #EF9F27, 3px] ────────────────────────────────┐
│  Edificio Madero 1240                                    [Computar →]     │
│  OBR-2026-0007 · Torres del Puerto S.A. · Inicio: 15 jul · 👤 Martín G.  │
└───────────────────────────────────────────────────────────────────────────┘
```

Campos en la línea de metadata (separados por punto · ):
- Código de obra (gris claro)
- Cliente (gris medio)
- Fecha de inicio (gris claro)
- Separador punto
- Avatar con iniciales + nombre del responsable de cómputo

**Avatar del responsable:**
- Círculo 18×18px, fondo `#FAECE7`, texto iniciales `#993C1D`, font-size 9px
- Nombre completo en gris medio a continuación

**Botón "Computar":**
- Fondo `#D85A30`, texto blanco, ícono `ti-calculator`
- Al hacer clic navega a la Pantalla 2 con la obra precargada

---

### Sección 2 — En proceso

**Cuándo aparece una obra acá:** cuando el cómputo fue iniciado pero aún no confirmado.

**Header de sección:**
```
⟳ En proceso   [2]
```
- Ícono: `ti-loader` color `#185FA5`
- Badge contador: fondo `#E6F1FB`, texto `#185FA5`

**Card de obra en proceso:**
```
┌─ [borde izquierdo azul #378ADD, 3px] ─────────────────────────────────────────────┐
│  Torre Catalinas Norte                          [====65%====]   [✏ Continuar]      │
│  OBR-2026-0005 · Grupo Inmobiliario Norte · 👤 Martín García                      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Barra de progreso:**
- Ancho 80px, alto 5px, border-radius 99px
- Fondo: `--color-background-secondary`
- Relleno: `#378ADD`
- Porcentaje calculado: `(categorías con al menos 1 ítem cargado / total de categorías) * 100`
- Mostrar porcentaje como texto a la derecha de la barra

**Botón "Continuar":**
- Estilo secundario (borde, sin fondo)
- Ícono `ti-pencil`
- Navega a Pantalla 2 con el cómputo en el estado guardado

---

### Sección 3 — Completados

**Cuándo aparece una obra acá:** cuando el cómputo fue confirmado por Oficina Técnica.

**Header de sección:**
```
✓ Completados   [3]                                    [👁 Ocultar completados]
```
- Ícono: `ti-circle-check` color `#3B6D11`
- Badge contador: fondo `#EAF3DE`, texto `#3B6D11`
- Botón toggle alineado a la derecha

**Toggle "Ocultar / Mostrar completados":**
- Por defecto: completados visibles, botón dice "Ocultar completados" con ícono `ti-eye-off`
- Al hacer clic: lista se oculta, aparece en su lugar un aviso clickeable:
  ```
  [👁 Mostrar 3 cómputos completados]   (borde punteado, fondo transparente)
  ```
- Al hacer clic en el aviso: vuelven a aparecer y el botón cambia a "Ocultar completados"
- Guardar preferencia en `localStorage` para que persista entre sesiones

**Card de obra completada:**
```
┌─ [borde izquierdo verde #639922, 3px, opacidad 0.7] ───────────────────────┐
│  Refacción Palermo Soho                                           [👁 Ver]  │
│  OBR-2026-0003 · Arq. Fernández & Asoc. · Completado 2 jun · 👤 Martín G. │
└─────────────────────────────────────────────────────────────────────────────┘
```
- Card completa con `opacity: 0.7` para restar protagonismo visual
- Botón "Ver": fondo `#EAF3DE`, texto `#3B6D11`, borde `#C0DD97`, ícono `ti-eye`
- Navega a Pantalla 2 en modo solo lectura (sin edición)

---

## Pantalla 2 — Cómputo de una obra

### Ruta sugerida
`/computos/:obraId`

### Modos
- **Edición** — obra en estado pendiente o en proceso
- **Solo lectura** — obra completada (todos los controles deshabilitados, sin botón "Confirmar")

---

### Header de pantalla
```
[← Obras]   Edificio Madero 1240   [Cómputo en curso]         [💾 Guardar borrador]
            Cliente: Torres del Puerto S.A. · Inicio: 15 jul 2026 · 👤 Martín García
```

Componentes:
- Botón "← Obras": estilo secundario, navega a `/computos`
- Título de obra: font-size 16px, font-weight 500
- Badge de estado inline:
  - "Cómputo en curso" → fondo `#FAECE7`, texto `#993C1D`
  - "Completado" → fondo `#EAF3DE`, texto `#3B6D11`
- Línea de metadata: cliente · fecha inicio · avatar + nombre responsable
- Botón "Guardar borrador": fondo `#D85A30`, texto blanco, ícono `ti-device-floppy`
  - Guarda el estado actual sin confirmar
  - Disponible solo en modo edición

---

### Layout principal
```
┌──────────────────┬──────────────────────────────────────────────────┐
│   SIDEBAR        │   PANEL PRINCIPAL                                │
│   260px fijo     │   flex: 1                                        │
│                  │                                                  │
│   Categorías     │   Buscador                                       │
│                  │   Lista de materiales                            │
│                  │                                                  │
└──────────────────┴──────────────────────────────────────────────────┘
[  BARRA DE RESUMEN INFERIOR — ancho completo  ]
```

---

### Sidebar — Categorías

- Título de sección: "Categorías", 11px, uppercase, letter-spacing 0.06em, color terciario
- Una fila por categoría del catálogo

**Fila de categoría:**
```
[ícono]  Marcos y tubos                [12]
```
- Ícono Tabler representativo por categoría (ver mapeo abajo)
- Nombre de categoría, 13px
- Badge con cantidad de ítems en esa categoría: fondo `--color-background-secondary`, texto terciario, border-radius 99px

**Estado activo:**
- Fondo `#FAECE7`
- Texto y badge en `#993C1D` / fondo badge `#F5C4B3`

**Mapeo de íconos sugerido por categoría** (ajustar según categorías reales del catálogo):
| Categoría | Ícono Tabler |
|---|---|
| Marcos y tubos | `ti-barrier-block` |
| Tablones y plataformas | `ti-layout-board` |
| Bases y husillos | `ti-anchor` |
| Crucetas y diagonales | `ti-augmented-reality` |
| Seguridad y red | `ti-shield` |
| Accesorios y fijaciones | `ti-tool` |

> Las categorías deben cargarse dinámicamente desde el catálogo de materiales existente en la app. El ícono puede ser configurable o usar uno genérico `ti-package` como fallback.

---

### Panel principal

#### Buscador
```
[�search]  Buscar material...
```
- Fondo `--color-background-secondary`, borde `--color-border-tertiary`
- Filtra la lista de materiales de la categoría activa en tiempo real (no requiere Enter)
- Ícono `ti-search` en gris terciario

#### Header de lista
```
Marcos y tubos · 12 materiales                    3 seleccionados
```
- Nombre de categoría activa · total de ítems (gris medio, 13px)
- Contador de ítems con cantidad > 0 en esta categoría (gris terciario, 12px)

#### Lista de materiales

Una fila por material del catálogo en la categoría seleccionada:

```
┌─────────────────────────────────────────────── [grid: 1fr 130px 36px] ──┐
│  Marco metálico 2m          [−] [  48  ] [+]              [✓]           │
│  Unidad                                                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Estado inactivo** (cantidad = 0, no seleccionado):
- Borde `--color-border-tertiary`, fondo `--color-background-primary`
- Controles `[−]` y `[+]` deshabilitados con `opacity: 0.3`
- Input de cantidad en 0, color terciario
- Botón derecho: ícono `ti-plus`, color terciario, borde secundario

**Estado activo** (cantidad > 0, seleccionado):
- Borde `#F0997B`, fondo `#FAECE7`
- Controles `[−]` y `[+]` habilitados, color `#993C1D`, borde `#F0997B`
- Input de cantidad activo
- Botón derecho: fondo `#D85A30`, borde `#D85A30`, ícono `ti-check` en blanco

**Comportamiento del botón `+` (activar ítem):**
- Si el ítem está inactivo: al hacer clic → pone cantidad en 1 y activa el ítem
- Si el ítem está activo: al hacer clic → resetea cantidad a 0 y desactiva el ítem (pide confirmación si cantidad > 1)

**Comportamiento de los controles de cantidad:**
- Botón `−`: decrementa en 1, mínimo 1 (no puede ir a 0 desde acá; para quitar usar el botón `✓/+`)
- Botón `+`: incrementa en 1
- Input: editable directamente, solo números enteros positivos, validar al perder foco

**Datos de cada fila traídos del catálogo:**
- `nombre` — nombre del material
- `unidad` — texto debajo del nombre (ej: "Unidad", "Metro lineal", "Par")
- `id` — para asociar la cantidad al cómputo

---

### Barra de resumen inferior

Fija al fondo del módulo, separada por borde superior:
```
┌──────────────────────────────────────────────────────────────────────┐
│  [3]              [88]              [6]           [✓ Confirmar       │
│  Ítems            Unidades          Categorías       cómputo]        │
│  seleccionados    totales                                            │
└──────────────────────────────────────────────────────────────────────┘
```

- Fondo `--color-background-secondary`
- Tres métricas acumuladas de TODO el cómputo (no solo la categoría visible):
  - **Ítems seleccionados**: count de materiales con cantidad > 0
  - **Unidades totales**: suma de todas las cantidades
  - **Categorías**: total de categorías con al menos 1 ítem cargado
- Valores en coral `#D85A30`, labels en gris terciario 11px
- Botón "Confirmar cómputo":
  - Fondo `#D85A30`, texto blanco, ícono `ti-clipboard-check`
  - Solo disponible en modo edición
  - Al hacer clic: modal de confirmación → al confirmar, cambia estado del cómputo a "Completado" y redirige al home

---

## Modelo de datos (referencia para el backend)

```js
// Cómputo
{
  id: String,
  obraId: String,              // referencia a la obra en Odoo
  obraNombre: String,
  obraCliente: String,
  obraFechaInicio: Date,
  responsableId: String,       // usuario de la app
  responsableNombre: String,
  estado: 'pendiente' | 'en_proceso' | 'completado',
  fechaCreacion: Date,
  fechaUltimaEdicion: Date,
  fechaConfirmacion: Date | null,
  items: [
    {
      materialId: String,      // id del catálogo
      materialNombre: String,
      categoriaId: String,
      categoriaNombre: String,
      unidad: String,
      cantidad: Number         // entero positivo
    }
  ]
}
```

---

## Comportamiento del progreso

El porcentaje mostrado en las cards "En proceso" se calcula en el frontend:

```js
const progreso = (
  categoriasConItems.length / totalCategorias.length
) * 100;
```

Donde `categoriasConItems` son las categorías que tienen al menos un material con `cantidad > 0`.

---

## Guardado automático

- Cada cambio de cantidad o activación/desactivación de ítem dispara un `PATCH /computos/:id` con debounce de 1500ms
- Si el cómputo estaba en estado `pendiente`, al primer guardado pasa automáticamente a `en_proceso`
- El botón "Guardar borrador" fuerza el guardado inmediato (sin debounce)
- Si hay cambios sin guardar y el usuario intenta salir: mostrar dialog de confirmación

---

## Estados y transiciones

```
[pendiente] ──── usuario abre y edita ────▶ [en_proceso]
                                                  │
                          usuario hace clic en "Confirmar cómputo"
                                                  │
                                                  ▼
                                           [completado]
```

- `pendiente → en_proceso`: automático al primer guardado
- `en_proceso → completado`: manual, requiere confirmación explícita
- `completado → en_proceso`: no permitido desde la UI (si se necesita, debe ser acción administrativa)

---

## Notas de implementación

- Las obras disponibles para computar se traen de Odoo vía API filtrando por estado confirmado y sin cómputo asignado
- El catálogo de materiales ya existe en la app — reutilizar el endpoint existente, filtrando por `categoriaId`
- El responsable de cómputo se asigna al crear el cómputo (puede ser el usuario logueado por defecto, con opción de cambiar)
- En modo solo lectura (cómputo completado): deshabilitar todos los inputs, ocultar botones de acción, mostrar badge "Completado" en el header
- La barra de resumen es visible en ambos modos (edición y solo lectura)
