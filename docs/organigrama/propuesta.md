# Propuesta: Organigrama en Andamios-OS

Rediseño del organigrama interactivo («organigrama-aba») para sumarlo como módulo de Andamios-OS. Propuesta de producto y arquitectura (12/10/2026).

> **Documento histórico.** Es la propuesta con la que se diseñó el módulo; lo construido y sus decisiones finales están en [modulo.md](./modulo.md) y el estado en [handoff.md](./handoff.md). Ante una diferencia, mandan esos dos y el código. La § 6 (especificación de la maqueta con datos inventados) y la § 4.6 (decisión abierta Odoo vs app, ya resuelta) quedaron superadas. Los informes citados abajo eran archivos de trabajo y no están en el repo.

Insumos:
- `informe-organigrama.md`: el análisis de la app original.
- `informe-andamios-os.md`: cómo está hecha Andamios-OS.
- Lectura directa de:
  - `src/app/(dashboard)/deposito/panol/layout.tsx`
  - `src/components/permisos-via-publica/ui.tsx`
  - `src/components/hoja-dia/comunes/hoja-lateral.tsx`
  - `src/app/globals.css`
  - `src/lib/tablero/colores.ts`
  - el `seedData.js` original.

---

## 1. Diagnóstico

### Qué funciona (y hay que conservar)

- **El contenido vale más que el software.** El original tiene:
  - 1 dirección, 5 áreas, 18 puestos y 82 tareas;
  - para cada área: misión, «qué NO hace», KPIs y notas de diseño. Por ejemplo, «Depósito SEPARADO DE OPERACIONES a propósito».

  Es un **manual de funciones**, y está atado al circuito documental que la app ya usa (SOL, OPC, RS, FS, RDP, RDF, ICO).
- **El modelo mental es correcto.**
  - Hay tres niveles (Dirección → Área → Puesto) y un color por área.
  - Un puesto puede tener varias personas, como «Capataces / Cuadrillas» o «Choferes».
  - La vacante se ve y se puede filtrar.
- **«Carga por persona»** muestra quién acumula puestos. Es el indicador más útil para el dueño.
- **El panel de detalle funciona como ficha de puesto**: descripción, tareas, «qué no hace», KPIs y notas.

### Qué no funciona

| Problema | Consecuencia |
|---|---|
| No hay autenticación. Firestore está abierto y el equipo, con teléfonos y emails, lo puede leer cualquiera | Riesgo real de datos personales. **Hay que revisar las reglas del proyecto `orgama-aba` ya mismo**, independientemente de esta propuesta |
| El equipo es propio y está duplicado | Las personas no coinciden con Legajos ni con Odoo. Las bajas no se reflejan |
| El árbol se guarda como un blob JSON y la vacante tiene dos fuentes de verdad | Los contadores no coinciden, las asignaciones se filtran de un organigrama a otro y el último que escribe pisa al resto |
| El `confirm` de eliminar está invertido, y «Resetear» e «Importar» borran el equipo global | Se puede perder una rama entera o a todas las personas con un clic |
| Mover un nodo bajo un descendiente lo borra | Hay pérdida silenciosa de datos |
| Las acciones aparecen solo con hover, el drag & drop es HTML5 y el pan/zoom es solo de mouse | No sirve en el celular, que es donde están los capataces |
| No hay URL por puesto | No se puede mandar «mirá lo que hace Control de Stock» por WhatsApp |
| El PDF sale en una sola página gigante, hecho con html2canvas (que además falla con `oklch`) | No se puede imprimir para una reunión ni para colgar en el depósito |
| Hay multi-organigrama sin dueño | No queda claro cuál es el vigente. Hace falta «vigente + borrador», no N organigramas sueltos |
| La búsqueda solo encuentra nombres de nodo y tareas | La pregunta real, «¿a quién le pregunto por X?», no tiene respuesta |
| El contraste en claro y oscuro está por debajo de AA y el color es el único canal | No cumple las reglas del sistema de diseño de Andamios-OS |

**Conclusión:** del original se conservan **el contenido y tres conceptos** (vacante, carga por persona y ficha de puesto). El software se rehace entero sobre lo que Andamios-OS ya tiene: Legajos, usuarios, cuadrillas, permisos por módulo y `HojaLateral`.

---

## 2. Mejoras priorizadas

### Imprescindibles (sin esto no tiene sentido incorporarlo)

1. **Las personas salen del sistema y no se cargan dos veces.**
   - Los ocupantes apuntan a `personal` (la gente de obra, sincronizada con Odoo) o a `user_profiles` (la oficina).
   - *Por qué:* es la única forma de que bajas, teléfonos y nombres estén al día sin mantenimiento. Además elimina los dos bugs de fondo del original.
2. **Permisos con el módulo `organigrama` (ver / editar) y RLS.**
   - *Por qué:* el original es público. Acá lo puede ver toda la empresa sin tener acceso a Legajos (DNI, domicilio), y solo lo edita RRHH o la gerencia.
3. **Modelo normalizado, con trigger anti-ciclos y una sola raíz.**
   - *Por qué:* la integridad la garantiza la base y no el cliente. Así es imposible «mover bajo un descendiente» y que desaparezca una rama.
4. **Celular primero para leer.**
   - Nada depende del hover. Hay una lista por áreas en lugar de un lienzo con zoom, y botones de `h-10`.
   - *Por qué:* capataces y encargados lo van a abrir desde la obra.
5. **Buscador «¿A quién le pregunto?»** sobre tareas, documentos, puestos y personas.
   - *Por qué:* es la pregunta que hace la gente todos los días («¿quién emite la OPC?», «¿quién firma el RDF?»). Hoy la respuesta está escondida en el manual.
6. **Una URL por puesto y por persona** (`?puesto=stock`).
   - *Por qué:* se puede compartir, el botón Atrás funciona y abre directo la ficha.
7. **Eliminar y mover con seguridad.**
   - No se borra un puesto que tiene dependientes: primero hay que moverlos o subirlos, con un texto claro.
   - «Mover a…» usa un selector jerárquico que excluye al propio puesto y a sus descendientes.
   - *Por qué:* en el original estos eran los bugs que destruían datos.

### Importantes (le dan el valor diferencial)

8. **Ficha de puesto como manual de funciones**: misión, tareas con los documentos que emite, firma o recibe, «qué NO hace», KPIs propios o del área, y a quién reporta.
   - *Por qué:* es lo que se usa para incorporar a alguien y para cortar discusiones de «eso no me toca».
9. **Borrador y «Publicar versión».**
   - Los cambios de estructura no impactan hasta que se publican, y cada versión queda con fecha, autor y nota.
   - *Por qué:* el organigrama es un documento oficial que se comunica. Hoy cualquier edición es instantánea y no deja rastro.
10. **Ocupación separada de la estructura.**
    - Asignar o quitar a una persona es inmediato y no requiere publicar.
    - Hay modalidad *titular / interino* con fecha de inicio.
    - *Por qué:* la gente cambia todas las semanas y la estructura, dos veces por año. Si se mezclan, nadie publica nada.
11. **Bandeja «Para revisar»**: bajas con puesto asignado, vacantes, interinos viejos, quien tiene 3 o más puestos, activos sin puesto y fichas incompletas.
    - *Por qué:* convierte el organigrama en algo vivo. Es el mismo patrón que el aviso «Legajo dado de baja con cosas a cargo» del pañol.
12. **Cuadrillas en vivo debajo de Montajes.**
    - Muestra capataz → plantel, leído de `cuadrillas` y `cuadrilla_personal`, sin copiar nada.
    - *Por qué:* es la única jerarquía real que ya existe y se mantiene en Configuración › Cuadrillas.
13. **Impresión A4**: el mapa en apaisado y, opcionalmente, una ficha por página.
    - *Por qué:* para reuniones, legajos de inducción y colgar en el depósito.

### Deseables (más adelante, si se usa)

14. **Historial con «Comparar con la vigente»** (diff de estructura y de tareas).
15. **Foto** desde `hr.employee.image_128` de Odoo, vía una API del servidor.
16. **Vista «Circuito documental»**: qué puesto emite, firma y recibe cada documento, armada a partir de las tareas.
17. **Diferencias con Odoo** en la bandeja («Odoo dice que X depende de Y»), si Odoo llega a tener la jerarquía cargada.
18. **KPIs conectados a datos reales**, por ejemplo la diferencia de stock que ya calcula el pañol.
19. **Escenarios** («¿y si Cobranzas pasa a Tesorería?»): serían borradores con nombre. Hoy alcanza con uno solo.

**Lo que se descarta a propósito:**
- el lienzo con pan/zoom;
- el drag & drop para reparentar (se reemplaza por «Mover a…» y «Subir/Bajar»);
- el multi-organigrama;
- el undo/redo de 30 pasos (se reemplaza por borrador + «Deshacer» en el toast);
- el import/export JSON (las versiones cumplen ese papel);
- elegir el color con color picker (se elige de una paleta de 8 tonos).

---

## 3. Rediseño

### 3.1 Concepto

> **«Quién hace qué en ABA, en una pantalla y en el bolsillo.»**
> No es un dibujo de cajas: es el **manual de funciones vivo** de la empresa. La estructura es oficial y versionada; las personas salen de Legajos y de los usuarios, y se actualizan solas.

Tres ideas guían el diseño:

1. **El organigrama de ABA es ancho y bajo**: 3 niveles y como mucho 7 puestos por área. No necesita un lienzo con zoom. Alcanza con un **mapa por columnas** (una por área) que entra en una pantalla de notebook y en una A4 apaisada, y que en el celular se convierte en una lista de áreas desplegables.
2. **La pregunta manda sobre el dibujo.** Arriba de todo hay un buscador: «¿A quién le pregunto por…?». Responde con la tarea, el puesto, la persona y un botón para llamar.
3. **Lo que está mal salta solo.** Las vacantes, las bajas, los interinos y la sobrecarga se ven en el mapa como chips con ícono y texto. Además aparecen en una bandeja para quien puede corregirlos.

### 3.2 Para quién

| Quién | Dispositivo | Qué viene a hacer | Pantallas |
|---|---|---|---|
| **Dueño / Dirección** | Notebook | Ver la estructura completa, detectar huecos y sobrecarga, aprobar cambios, imprimir para una reunión | Mapa, Para revisar, Versiones, Imprimir |
| **Administración / RRHH** (editores) | Notebook | Asignar personas, cubrir vacantes con interinos, resolver bajas, editar fichas en borrador y publicar | Ficha de puesto (con asignar), Para revisar, modo Borrador, Personas |
| **Encargados** (depósito, logística, oficina técnica) | Notebook y celular | Leer qué le toca a cada puesto de su área y qué NO, ver a quién reporta su gente y mostrar la ficha a quien entra | Mapa (su columna), Ficha de puesto, Buscador |
| **Capataces / gente de obra** | Celular | «¿A quién le pregunto por el remito?», «¿quién es mi jefe?», ver su cuadrilla y llamar | Buscador, «Tu lugar», Ficha de persona |

### 3.3 Mapa de pantallas

```
/organigrama                       Mapa (pestaña 1) + buscador; ?puesto=… y ?persona=… abren la hoja lateral
/organigrama/personas              Personas (pestaña 2)
/organigrama/revisar               Para revisar (pestaña 3, solo editores)
/organigrama/versiones             Versiones (pestaña 4, solo editores)
/organigrama/imprimir              Vista de impresión A4 (sin pestañas, abre desde el botón Imprimir)
```

Layout con pestañas como links, igual que el pañol: migas «Personal y Flota › Organigrama», un `h1` y la `nav` con `border-b`. Los lectores ven solo «Mapa · Personas».

### 3.4 Reglas visuales comunes

- **Tema oscuro por defecto.** Todo se resuelve con tokens (`bg-card`, `border`, `text-muted-foreground`, `var(--tb-*)`). No hay ningún hex en TS.
- **Color de área = identidad, nunca estado.** Se usan los pares `--tb-*` ya calibrados en claro y oscuro.

  | Área | Tono `--tb-*` | Por qué |
  |---|---|---|
  | Dirección General | `gris` | Neutro: no es un área |
  | Técnico-Comercial | `teal` | Es el más cercano al cian original |
  | Operaciones | `ambar` | Es el más cercano al naranja original |
  | Depósito y Control de Materiales | `violeta` | Es igual al original |
  | Administración y Finanzas | `verde` | Es igual al original |
  | Sistemas y Mantenimiento | `rosa` | Es el más cercano al coral original. **No** se usa `coral`, que es de la marca y del botón |

  - El color se aplica como **franja izquierda de 3 px** (`border-l-[3px]` con `var(--tb-X-borde)`) y como **punto con el nombre del área**.
  - El fondo de la tarjeta queda en `bg-card`. Solo el encabezado de la columna lleva `var(--tb-X-bg)` con `var(--tb-X-text)`.
  - Así el ámbar de Operaciones no se confunde con el chip «aviso», que además siempre tiene ícono y texto.
- **Estados como `Chip` del kit de permisos** (`src/components/permisos-via-publica/ui.tsx`):
  - `aviso`: «Vacante», «3 puestos»;
  - `bloqueo`: «Dado de baja»;
  - `neutro`: «Interino desde 01/08», «Externo»;
  - `marcha`: «Cubierto por interino» (lo tiene otro, no hay que hacer nada urgente).

  Siempre llevan ícono o texto. La tarjeta vacante, además, tiene **borde punteado** (`border-dashed`) como segundo canal.
- **Un solo botón coral por pantalla**, que es la próxima acción:

  | Pantalla | Botón coral |
  |---|---|
  | Mapa (lector) | Ninguno |
  | Mapa (editor, fuera del borrador) | Ninguno («Editar estructura» es outline) |
  | Mapa en borrador | «Publicar versión» |
  | Ficha de un puesto vacante (editor) | «Asignar persona» |
  | Imprimir | «Imprimir» |

  El resto de los botones son `outline` o `ghost`.
- **Tipografía y medidas del pañol**:
  - títulos `text-2xl sm:text-3xl font-bold tracking-tight`;
  - migas `text-[12.5px] text-muted-foreground`;
  - filas `text-[13.5px]`;
  - contenedores `rounded-md border bg-card`;
  - botones `h-9 max-sm:h-10`.
- **Avatares**: `Avatar` + `AvatarFallback` con iniciales y `AvatarGroup` + `AvatarGroupCount` para los puestos colectivos («+3»). No hay fotos en la fase 1.
- **Íconos lucide**: `Network` para el módulo, `Search`, `Phone`, `UserPlus`, `ArrowUpRight`, `MoveRight`, `Printer`, `History`, `TriangleAlert`. No hay emojis.
- **Accesibilidad**:
  - las tarjetas son `<button>` o `<a>` reales;
  - la hoja lateral es un `Sheet` de Base UI (con Esc y trampa de foco);
  - los botones de ícono llevan `aria-label`;
  - los chips no dependen del color;
  - los pares nuevos se suman a `npm run contraste`.

---

### 3.5 Pantalla 1: Mapa (`/organigrama`)

**Desktop (≥ lg):**

```
Personal y Flota › Organigrama                                     [Imprimir] [Editar estructura]
Organigrama
────────────────────────────────────────────────────────────────────────────────────────────────
 Mapa   Personas   Para revisar (6)   Versiones
────────────────────────────────────────────────────────────────────────────────────────────────
┌ 🔍 ¿A quién le pregunto por…?  (tarea, documento, puesto o persona) ─────────────────────────┐
└──────────────────────────────────────────────────────────────────────────────────────────────┘
 [Todo] [Vacantes 3] [Interinos 1] [Bajas 1]                    Versión 3 · vigente desde 01/09

                         ┌──────────────────────────────────────┐
                         │▌DIRECCIÓN GENERAL                    │
                         │  Gerencia General · (RF) Ricardo F.  │
                         └──────────────────┬───────────────────┘
      ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
┌─────┴──────┐ ┌─────────┴────┐ ┌───────────┴──┐ ┌─────────────┴┐ ┌───────────────┴┐
│● Técnico-  │ │● Operaciones │ │● Depósito y  │ │● Administr.  │ │● Sistemas y    │  ← encabezado
│  Comercial │ │  G. Romero   │ │  Control Mat.│ │  y Finanzas  │ │  Mantenimiento │    con tinte
│  M.Iglesias│ │  7 puestos   │ │  S.Domínguez │ │  N. Quiroga  │ │  T. Vidal      │    --tb-X-bg
├────────────┤ ├──────────────┤ │  Reporta a   │ ├──────────────┤ ├────────────────┤
│▌Ventas     │ │▌Planificación│ │  Dirección   │ │▌Facturación  │ │▌Soporte IT     │
│ (LB)(FS)   │ │ (CM)         │ ├──────────────┤ │ (NQ) 3 puest.│ │ (TV)           │
│▌Oficina    │ │▌Supervisión  │ │▌Control de   │ │┆Cobranzas   ┆│ │▌Mant. Edilicio │
│ Técnica    │ │ (WA)         │ │ Stock (SD)   │ │┆⚠ Vacante   ┆│ │ Externo        │
│ (IP)(MI)   │ │▌Montajes y   │ │▌Preparación  │ │▌Tesorería    │ └────────────────┘
└────────────┘ │ Desmontajes  │ │ (MC)(BA)     │ │ (SM)         │
               │ 3 cuadrillas │ │▌Recepción y  │ │▌Costos, Ctrl │
               │ (RG)(HV)(DL) │ │ Devoluciones │ │ y RRHH (NQ)  │
               │ ▸ ver plantel│ │ ⛔ Dado baja │ └──────────────┘
               │▌Taller (OP)  │ └──────────────┘
               │▌Logística    │
               │ (JO)(CR)     │
               │┆Seguridad   ┆│
               │┆◷ Interino  ┆│
               │┆Mant.Vehíc. ┆│
               │┆⚠ Vacante   ┆│
               └──────────────┘
```

**Componentes:**
- `BuscadorPregunta`: input grande (`h-11`) con el ícono `Search`. Al escribir, despliega los resultados debajo, en un `Popover` o en un panel inline (ver Pantalla 4). El atajo `/` le da foco.
- `FiltrosMapa`: chips-botón con contador.
  - Un filtro **no atenúa al 15 %**: las tarjetas que no coinciden se colapsan en una línea por columna («+4 puestos cubiertos»).
  - Así se conserva el contexto sin ruido y sin problemas de contraste.
- `TarjetaDireccion`, `ColumnaArea` y `TarjetaPuesto`.
  - La tarjeta lleva franja de área, título, subtítulo (el rol), avatares de ocupantes y, si corresponde, un chip de estado.
  - Toda la tarjeta es un link a `?puesto=<clave>`, con `scroll={false}` para no saltar.
- `ConectoresSimples`: líneas con bordes CSS. Son una línea vertical desde la Dirección y una horizontal sobre las columnas, **sin pseudo-elementos con conteo de hijos**. Si un puesto tiene sub-puestos, se muestran indentados dentro de la columna, con `border-l` y padding.
- `MontajesCuadrillas`: dentro de la tarjeta de Montajes, «3 cuadrillas» con los capataces y un botón «Ver plantel». Ese botón abre la ficha en la sección Cuadrillas.
- Línea de versión: «Versión 3 · vigente desde 01/09». Si hay borrador y el usuario es editor, se suma `Chip neutro` «Borrador con 2 cambios».

**Estados:**

| Estado | Qué se ve |
|---|---|
| Cargando | `Skeleton` con la misma forma: 1 tarjeta arriba y 5 columnas de 3 rectángulos |
| Vacío (no hay versión publicada) | `EmptyState` con el ícono `Network`: «Todavía no hay un organigrama publicado». Si es editor, se suma el botón **coral** «Empezar desde la estructura base», que siembra el seed |
| Error | `Aviso tono="bloqueo"` «No pudimos cargar el organigrama. Probá recargar.» con el mensaje del servidor |
| Vacante | Tarjeta `border-dashed`, `Chip aviso` «Vacante» y avatar vacío (`UserRound` en `text-muted-foreground`) |
| Vacante cubierta por interino | `border-dashed` + `Chip marcha` «Interino», con su avatar |
| Ocupante dado de baja | `Chip bloqueo` «Dado de baja». La persona aparece tachada solo en la ficha |
| Sin permiso | El proxy redirige a `inicioDe(acceso)`. No se pinta nada |
| Lector | Sin «Editar estructura» ni «Para revisar» ni «Versiones». Los chips de estado sí se ven, porque informan a quién no preguntar |

**Celular (< md):**

```
Personal y Flota › Organigrama
Organigrama
 Mapa  Personas
┌ 🔍 ¿A quién le pregunto por…? ┐   ← sticky arriba
└───────────────────────────────┘
┌ Tu lugar ───────────────────────┐   ← solo si el usuario tiene legajo con puesto
│ Capataz · Cuadrilla 1           │
│ Montajes y Desmontajes          │
│ Reportás a Gustavo Romero  [📞] │
└─────────────────────────────────┘
┌▌Dirección General      (RF)  › ┐
├▌Técnico-Comercial   2 puestos ▾┤
├▌Operaciones  7 · ⚠ 1 vacante  ▾┤   ← desplegado:
│   Planificación          (CM) › │
│   Montajes · 3 cuadrillas      › │
│   ┆Seguridad · Interino      › │
│   ...                           │
├▌Depósito  3 · ⛔ 1 baja       ▾┤
├▌Administración  4 · ⚠ 1      ▾┤
└▌Sistemas  2                  ▾┘
```

- Las áreas son desplegables. Como no hay `accordion` en `ui/`, se usa `<details>`/`<summary>` estilado o un botón con `aria-expanded`. Hay una sola abierta por defecto: la del usuario, o ninguna.
- No hay pan ni zoom. Las filas tienen `min-h-11` para el dedo.
- **«Tu lugar»** usa el legajo vinculado al usuario (`personal.user_id`), o el `user_profiles` del usuario si es de oficina. Muestra su puesto, su cuadrilla y a quién reporta, con el link `tel:`.
- Las acciones de editor no se muestran en el celular, salvo «Asignar persona» dentro de la ficha. Editar la estructura es una tarea de escritorio.

---

### 3.6 Pantalla 2: Ficha de puesto (hoja lateral, `?puesto=<clave>`)

Usa `HojaLateral` (560 px; ancho completo en el celular). El pie se ve solo si es editor.

```
┌──────────────────────────────────────────────────────────┐
│ Control de Stock                                     [X] │
│ ● Depósito y Control de Materiales · Stock e Inventario  │
├──────────────────────────────────────────────────────────┤
│ ┌ Quién lo ocupa ────────────────────────────────────┐   │
│ │ (SD) Sergio Domínguez   Titular · desde 03/2021    │   │
│ │      También: Encargado de Depósito   [📞] [›]     │   │
│ └────────────────────────────────────────────────────┘   │
│ Reporta a: Encargado de Depósito → Dirección General     │
│ Le reportan: —                                           │
│ ┌ Para qué está ─────────────────────────────────────┐   │
│ │ (misión; si falta: «Falta la misión» solo a editor)│   │
│ └────────────────────────────────────────────────────┘   │
│ ┌ Qué hace (6) ──────────────────────────────────────┐   │
│ │ 1 Inventario de materiales actualizado             │   │
│ │ 2 Verificar stock disponible vs SOL    [SOL usa]   │   │
│ │ 3 Emitir Orden de Preparación de Carga [OPC emite] │   │
│ │ 4 Emitir Remitos de Salida             [RS emite]  │   │
│ │ ...                                                │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌ Qué NO hace (del área) ────────────────────────────┐   │
│ │ ✕ No entrega material sin Solicitud aprobada       │   │
│ │ ✕ No recibe sin remito  ...                        │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌ Cómo se mide (del área) ───────────────────────────┐   │
│ │ Diferencia stock físico vs sistema (<1%) · ...     │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌ Por qué está así ──────────────────────────────────┐   │
│ │ «Separado de Operaciones a propósito…»  (nota      │   │
│ │  pública de diseño, del área)                      │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌ Nota interna (solo editores) ──────────────────────┐   │
├──────────────────────────────────────────────────────────┤
│                      [Copiar link] [Editar ficha] [Asignar persona]│ ← coral solo si vacante
└──────────────────────────────────────────────────────────┘
```

**Componentes:**
- Las cajas son `Caja` de `hoja-lateral.tsx`.
- Los chips de documento muestran el **código + el rol** (emite / firma / recibe / usa). Al tocarlos se abre la búsqueda por ese documento («¿quién más toca el RS?»).
- **Herencia del área.** Si el puesto no tiene «qué no hace» o KPIs propios, se muestran los del área con la etiqueta «(del área)». Así se resuelve que el seed solo los tenga cargados en las áreas.
- «Reporta a» es una cadena de links clicables hacia arriba. «Le reportan» lista los puestos hijos.
- Si el puesto es **Montajes y Desmontajes** (con la fuente `cuadrillas`), aparece la caja **Cuadrillas**:

```
┌ Cuadrillas (en vivo, de Configuración › Cuadrillas) ─┐
│ Cuadrilla 1 · Capataz (RG) Ramón Giménez     [📞]    │
│   Operarios: (AL)(EF)(JP)(MS)(CV)  5                  │
│ Cuadrilla 2 · Capataz (HV) Héctor Villalba   [📞]    │
│   Operarios: 4                                        │
│ Cuadrilla 3 · Capataz (DL) Diego Ledesma · 3 + 1 ext. │
└──────────────────────────────────────────────────────┘
```

  Cada cuadrilla se despliega en filas: nombre, `Chip neutro` «Externo · Montajes del Oeste» si corresponde, y teléfono.

**Estados:**

| Estado | Qué se ve |
|---|---|
| Vacante | Caja «Quién lo ocupa» con `Aviso tono="aviso"` «Este puesto está vacante. Las preguntas sobre estas tareas van a {responsable del área}». Así hay a quién preguntar igual. El editor ve el botón coral «Asignar persona» |
| Interino | La fila del ocupante lleva `Chip neutro` «Interino desde 01/08 · 72 días» y «Titular en: Supervisión de Obras» |
| Baja | La fila tachada, `Chip bloqueo` «Dado de baja en Legajos el 05/10». El editor ve «Quitar del puesto» y «Asignar reemplazo» |
| Puesto que no existe (clave inválida) | `Aviso bloqueo` «Ese puesto no está en el organigrama vigente» y un link al mapa |
| Cargando | `Skeleton` de 3 cajas |

**Celular:** la hoja ocupa la pantalla completa, el teléfono es un botón `tel:` de `h-10` y la caja de tareas va primero, antes de la misión, porque es lo que se viene a buscar.

### 3.7 Pantalla 3: Ficha de persona (hoja lateral, `?persona=<id>`)

```
┌──────────────────────────────────────────────┐
│ (NQ) Natalia Quiroga                     [X] │
│ Usuaria de la app · Administración           │
├──────────────────────────────────────────────┤
│ [📞 11 5555-0142]  [WhatsApp]                │
│ ┌ Puestos (3) ───────────── ⚠ 3 puestos ┐    │
│ │ ● Responsable Admin. y Finanzas  Titular│  │
│ │ ● Facturación                    Titular│  │
│ │ ● Costos, Control y RRHH         Titular│  │
│ └────────────────────────────────────────┘    │
│ Reporta a: (RF) Ricardo Fernández Bustos     │
│ Le reportan: (SM) Silvia Moreno · Cobranzas  │
│              (vacante)                        │
│ [Ver legajo ↗]  ← solo con permiso «personal» │
└──────────────────────────────────────────────┘
```

- **Solo muestra datos de contacto laborales**: teléfono y, si es usuario, email. Nunca DNI, domicilio ni datos de salud. Para eso está el link a Legajos, que respeta su permiso.
- Estados: «Sin puesto en el organigrama» (`Chip neutro`), y la baja (`Aviso bloqueo` «Dado de baja en Legajos. Sigue figurando en 1 puesto»).

### 3.8 Pantalla 4: Buscador «¿A quién le pregunto?»

Está integrado en el Mapa. Los resultados aparecen en un panel debajo del input, que reemplaza el mapa mientras hay texto. Esc o borrar el texto vuelven al mapa.

```
┌ 🔍 remito ────────────────────────────────────────────────┐
└───────────────────────────────────────────────────────────┘
 Documentos
 ┌ RS · Remito de Salida ─────────────────────────────────┐
 │ Emite: Control de Stock → (SD) Sergio Domínguez [📞]   │
 │ Firma: Montajes y Desmontajes (capataces) · Logística  │
 └────────────────────────────────────────────────────────┘
 ┌ RDF · Remito de Devolución Final ──────────────────────┐
 │ Firma: Montajes · Recibe: Recepción y Devoluciones     │
 │        ⛔ el ocupante está dado de baja → preguntá a   │
 │        Sergio Domínguez (Encargado de Depósito)        │
 └────────────────────────────────────────────────────────┘
 Tareas (5)
  «Transporte con **remito** correspondiente»
     Repartos y Logística · (JO)(CR)                     ›
  «Firma de **Remito**s de Salida (RS) al recibir»
     Montajes y Desmontajes · 3 capataces                ›
 Puestos (0) · Personas (0)
```

- **Coincidencia sin tildes y sin mayúsculas**, con resaltado (`<mark>` con `bg-amber-500/20`, sin depender del color: también va en negrita).
- **Orden de los grupos**: Documentos → Tareas → Puestos → Personas. Cada grupo muestra como mucho 5 resultados y el link «Ver los N».
- **Respuesta útil siempre.** Si el puesto que contesta está vacante o su ocupante está dado de baja, el resultado sube un nivel: dice quién responde en su lugar, que es el ocupante del puesto padre más cercano con alguien activo. Esto se calcula con la función pura `quienResponde(clave)`.
- Sin resultados: «No encontramos “{texto}”. Probá con otra palabra (p. ej. “stock”, “factura”, “SOL”).»
- **Celular:** el input es sticky y cada resultado es una fila de `min-h-12` con el botón de llamada a la derecha.

### 3.9 Pantalla 5: Personas (`/organigrama/personas`)

```
 🔍 Buscar persona        [Todas 36] [Sin puesto 1] [2+ puestos 4] [Bajas 1]
┌──────────────────────────────────────────────────────────────────────────┐
│ (NQ) Natalia Quiroga   ● Admin. y Finanzas ● Facturación ● Costos…  ⚠ 3 │
│      Usuaria · reporta a Ricardo Fernández Bustos                        │
├──────────────────────────────────────────────────────────────────────────┤
│ (WA) Walter Acosta     ● Supervisión ● Seguridad (Interino)          2   │
├──────────────────────────────────────────────────────────────────────────┤
│ (LF) Leandro Funes     Sin puesto · Legajo activo                         │
│ ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

- Es una lista agrupable por área, que es lo predeterminado, o plana. El cambio se recuerda en `localStorage` con try/catch, como en permisos.
- **«Carga»** se calcula sobre los puestos donde la persona es titular o interina; las áreas cuentan como un puesto de responsable.
  - Con 1 puesto, no se muestra nada.
  - Con 2, se muestra el número en `text-muted-foreground`.
  - Con 3 o más, `Chip aviso` «3 puestos».
- El origen de la persona va como `Chip neutro`: «Legajo», «Usuario» o «Externo». Al tocar la fila se abre la ficha de persona.
- **Estado vacío del filtro:** «Nadie sin puesto. Bien.»
- **Celular:** filas apiladas y chips de área en una línea con `overflow-x-auto`.

### 3.10 Pantalla 6: Para revisar (`/organigrama/revisar`, solo editores)

```
 6 cosas para revisar
┌ ⛔ Bajas con puesto (1) ─────────────────────────────────────────────────┐
│ Nicolás Herrera · Recepción y Devoluciones · baja en Legajos 05/10      │
│                                   [Quitar del puesto] [Asignar reemplazo]│
├ ⚠ Vacantes (3) ─────────────────────────────────────────────────────────┤
│ Cobranzas · Administración · vacante desde 15/07           [Asignar]     │
│ Mantenimiento de Vehículos · Operaciones · desde siempre   [Asignar]     │
│ Seguridad y Formación · cubierta por Walter Acosta (interino) [Ver]      │
├ ⚠ Acumulan 3 o más puestos (1) ─────────────────────────────────────────┤
│ Natalia Quiroga · 3 puestos                                 [Ver]        │
├ ◷ Interinos (1) ────────────────────────────────────────────────────────┤
│ Walter Acosta en Seguridad y Formación · 72 días                         │
├ Activos sin puesto (1) ─────────────────────────────────────────────────┤
│ Leandro Funes · operario · sin cuadrilla                    [Asignar]    │
├ Fichas incompletas (18) ────────────────────────────────────────────────┤
│ 16 puestos sin misión · 18 sin KPIs propios          [Editar en borrador]│
└──────────────────────────────────────────────────────────────────────────┘
```

- Hay secciones `Seccion` con el contador en una pastilla y un orden fijo por gravedad. Las acciones son `outline` (no hay coral: no hay una próxima acción única).
- **Vacío:** `EmptyState` con el ícono `Check`: «Todo en orden. No hay vacantes, bajas ni sobrecargas.»
- El contador de la pestaña («Para revisar (6)») suma solo bajas, vacantes sin interino y sobrecargas, que son las cosas accionables.

### 3.11 Pantalla 7: Modo borrador (editar la estructura)

Se entra con «Editar estructura» en el Mapa. Si no hay borrador, se crea uno como copia de la versión vigente.

```
┌ BORRADOR · 2 cambios sin publicar · lo ven solo los editores ───────────────────┐
│                                   [Ver cambios] [Descartar borrador] [Publicar versión] ← coral
└─────────────────────────────────────────────────────────────────────────────────┘
 (el mismo mapa; cada tarjeta muestra un botón ⋯ SIEMPRE visible, no con hover)
 │▌Control de Stock          [⋯]│ → Editar ficha · Agregar puesto debajo ·
 │ (SD)   ● modificado           │   Mover a… · Subir · Bajar · Eliminar
 │ + Agregar puesto en Depósito  │ ← al pie de cada columna
```

- **Marcas de cambio**: `Chip neutro` «nuevo», «modificado» o «movido» en las tarjetas tocadas. Los cambios no son de estado, así que no llevan color.
- **Editar ficha**: es una `HojaLateral` con formulario (react-hook-form) para título, rol, área/padre (solo lectura, se cambia con Mover), misión, tareas, «qué NO hace», KPIs, nota de diseño (pública) y nota interna.
  - Las **tareas** son una lista con un input por fila, el selector de documentos (código + rol), y los botones ↑ ↓ y quitar. Todos son botones visibles con `aria-label`.
  - En el pie van «Cancelar» y «Guardar en borrador» (este es el coral de la hoja; el de «Publicar» queda en la barra, fuera de la hoja).
- **Mover a…**: `Dialog` con un árbol indentado y un buscador.
  - El propio puesto y sus descendientes aparecen deshabilitados, con «(depende de este puesto)».
  - El padre actual aparece marcado como «actual».
- **Eliminar**: se usa `ConfirmDialog variant="destructive"`.
  - Si el puesto tiene dependientes, el texto dice: «Control de Stock tiene 2 puestos debajo. ¿Los subimos a Depósito y Control de Materiales?», con los botones [Cancelar] y [Subirlos y eliminar]. **Cancelar nunca borra nada.**
  - Si tiene ocupantes: «Sergio Domínguez queda sin este puesto al publicar.»
- **Ver cambios**: `Dialog` con la lista legible del diff («Nuevo puesto: Coordinador Logístico, debajo de Repartos y Logística», «Control de Stock: +1 tarea»).
- **Publicar**: `Dialog` con el resumen de cambios y la «Nota de la versión» (obligatoria y corta). Al confirmar se muestra el toast «Publicaste la versión 4» y desaparece la barra.
- **Las asignaciones de personas no pasan por el borrador**: son inmediatas y se hacen desde la ficha en cualquier momento.
- **Celular:** la barra del borrador se ve («Hay un borrador. Editalo desde una computadora.»), pero el mapa queda en solo lectura.

### 3.12 Pantalla 8: Versiones (`/organigrama/versiones`, solo editores)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Borrador · 2 cambios · Natalia Quiroga · hace 2 días      [Abrir]     │
├──────────────────────────────────────────────────────────────────────┤
│ v3 · VIGENTE · 01/09/2026 · Ricardo Fernández Bustos                 │
│ «Se formaliza Seguridad y Formación dentro de Operaciones»           │
│ 1 puesto nuevo · 4 tareas                     [Ver cambios]           │
├──────────────────────────────────────────────────────────────────────┤
│ v2 · 02/06/2026 · «Depósito pasa a reportar a Dirección»  [Ver cambios]│
│ v1 · 15/03/2026 · «Estructura inicial»                               │
└──────────────────────────────────────────────────────────────────────┘
```

- **Fase 2:** se muestran la lista y el «Ver cambios» de cada versión contra la anterior.
- **Fase 3:** «Ver esta versión», que es el mapa en solo lectura con la barra «Versión 2 · no vigente».
- Estado vacío: «Solo existe la versión inicial.»

### 3.13 Pantalla 9: Imprimir A4 (`/organigrama/imprimir`)

```
 Qué imprimir:  (•) Solo el mapa  ( ) Mapa + fichas de puesto  ( ) Un área: [Depósito ▾]
 [Volver]                                                   [Imprimir]  ← coral
 ┌──────────── vista previa (hoja A4 apaisada, fondo blanco) ────────────┐
 │  ANDAMIOS BUENOS AIRES · Organigrama · versión 3 · 01/09/2026          │
 │  (mapa de 5 columnas en tamaño fijo, sin chips de estado internos)     │
 └────────────────────────────────────────────────────────────────────────┘
```

- Se imprime con `window.print()` y CSS de impresión, **sin html2canvas ni jsPDF**:
  - `@page { size: A4 landscape; margin: 10mm }` para el mapa;
  - `@page ficha { size: A4 portrait }` y `page: ficha` en cada ficha, que es una página con nombre (soportado en Chromium);
  - `break-before: page` antes de cada ficha;
  - la UI se oculta con `print:hidden`.
- **OJO con el tema oscuro**: la app arranca en oscuro. La vista de impresión envuelve todo en `.org-impresion` y **redefine los tokens en claro** (`--background`, `--foreground`, `--card`, `--border` y los `--tb-*` de claro) dentro de `@media print` y también en pantalla, para que la vista previa sea fiel. Si no, sale texto claro sobre papel blanco.
- **Contenido impreso**:
  - la versión, la fecha y «Impreso el …»;
  - en la hoja, los ocupantes con nombre y **sin teléfonos**;
  - las vacantes como «Vacante» en texto.
- **Celular:** se muestra un aviso: «Para imprimir, abrilo desde una computadora». El botón igual funciona.

---

## 4. Modelo de datos propuesto

### 4.1 Principios

1. **Estructura y ocupación son cosas distintas.** La estructura (nodos, jerarquía y manual) es versionada y se publica. La ocupación (quién está en qué puesto) es inmediata y tiene historial propio por fechas.
2. **Identidad estable del nodo.** `org_nodos.id` no cambia entre versiones; el contenido de cada versión vive en `org_nodo_version`. Así las asignaciones apuntan a algo que sobrevive a las publicaciones.
3. **Las personas no se copian.** Se referencian por `personal_id` o `usuario_id`. Para la oficina que no usa la app, se usa `odoo_employee_id`, y como último recurso `nombre_libre` (externos).
4. Las áreas son nodos de `tipo = 'area'`. El área de un puesto es el ancestro `area` más cercano, y se deriva sin guardarse.

### 4.2 Tablas

Prefijo `org_`. Las migraciones son idempotentes y se aplican a mano según la convención del repo.

```sql
-- Versiones: a lo sumo UN borrador; la vigente es la última 'publicada'.
CREATE TABLE IF NOT EXISTS org_versiones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        INTEGER,                       -- se asigna al publicar (1, 2, 3…); NULL en borrador
  estado        TEXT NOT NULL CHECK (estado IN ('borrador','publicada','archivada')),
  nota          TEXT,                          -- «Depósito pasa a reportar a Dirección»
  basada_en     UUID REFERENCES org_versiones(id),
  publicada_at  TIMESTAMPTZ,
  publicada_por UUID REFERENCES user_profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID DEFAULT auth.uid() REFERENCES user_profiles(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_versiones_un_borrador ON org_versiones ((true)) WHERE estado = 'borrador';
CREATE UNIQUE INDEX IF NOT EXISTS org_versiones_una_vigente ON org_versiones ((true)) WHERE estado = 'publicada';
CREATE UNIQUE INDEX IF NOT EXISTS org_versiones_numero ON org_versiones (numero) WHERE numero IS NOT NULL;

-- Identidad estable de cada caja (dirección, área o puesto).
CREATE TABLE IF NOT EXISTS org_nodos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave      TEXT NOT NULL UNIQUE,             -- slug para la URL: 'stock', 'montajes'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid() REFERENCES user_profiles(id)
);

-- Contenido de cada nodo en cada versión (el «manual»).
CREATE TABLE IF NOT EXISTS org_nodo_version (
  version_id  UUID NOT NULL REFERENCES org_versiones(id) ON DELETE CASCADE,
  nodo_id     UUID NOT NULL REFERENCES org_nodos(id) ON DELETE RESTRICT,
  depende_de  UUID REFERENCES org_nodos(id),   -- padre EN ESTA VERSIÓN; NULL = raíz
  tipo        TEXT NOT NULL CHECK (tipo IN ('direccion','area','puesto')),
  titulo      TEXT NOT NULL,                   -- «Control de Stock»
  rol         TEXT,                            -- ex subtitle: «Stock e Inventario»
  color       TEXT CHECK (color IN ('azul','ambar','verde','rosa','violeta','teal','gris')), -- solo áreas/dirección; clave --tb-*
  mision      TEXT,
  tareas      JSONB NOT NULL DEFAULT '[]',     -- [{ "texto": "...", "docs": [{ "codigo":"RS", "rol":"emite" }] }]
  no_hace     JSONB NOT NULL DEFAULT '[]',     -- ["No entrega material sin Solicitud aprobada", …]
  kpis        JSONB NOT NULL DEFAULT '[]',     -- ["Diferencia stock físico vs sistema (<1%)", …]
  nota_diseno TEXT,                            -- PÚBLICA: «Separado de Operaciones a propósito»
  fuente_ocupantes TEXT NOT NULL DEFAULT 'manual' CHECK (fuente_ocupantes IN ('manual','cuadrillas')),
  orden       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, nodo_id),
  FOREIGN KEY (version_id, depende_de) REFERENCES org_nodo_version (version_id, nodo_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS org_nodo_version_una_raiz ON org_nodo_version (version_id) WHERE depende_de IS NULL;
CREATE INDEX IF NOT EXISTS org_nodo_version_padre ON org_nodo_version (version_id, depende_de);

-- Notas internas: tabla aparte porque RLS es por fila, no por columna, y estas no las ve el lector.
CREATE TABLE IF NOT EXISTS org_notas_internas (
  nodo_id    UUID PRIMARY KEY REFERENCES org_nodos(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID DEFAULT auth.uid() REFERENCES user_profiles(id)
);

-- Ocupación: NO versionada; con historial por fechas (hasta IS NULL = vigente).
CREATE TABLE IF NOT EXISTS org_ocupantes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nodo_id          UUID NOT NULL REFERENCES org_nodos(id) ON DELETE CASCADE,
  personal_id      UUID REFERENCES personal(id) ON DELETE CASCADE,
  usuario_id       UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  odoo_employee_id BIGINT,
  nombre_libre     TEXT,                       -- externos: «Servicios Edilicios Sur»
  modalidad        TEXT NOT NULL DEFAULT 'titular' CHECK (modalidad IN ('titular','interino')),
  desde            DATE NOT NULL DEFAULT current_date,
  hasta            DATE,
  motivo_fin       TEXT,                       -- 'baja', 'cambio de puesto', 'reemplazo'
  nota             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID DEFAULT auth.uid() REFERENCES user_profiles(id),
  CHECK (num_nonnulls(personal_id, usuario_id, odoo_employee_id, nombre_libre) = 1),
  CHECK (hasta IS NULL OR hasta >= desde)
);
-- Una persona no ocupa dos veces el mismo puesto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS org_ocupantes_vigente_personal ON org_ocupantes (nodo_id, personal_id) WHERE hasta IS NULL AND personal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_ocupantes_vigente_usuario  ON org_ocupantes (nodo_id, usuario_id)  WHERE hasta IS NULL AND usuario_id IS NOT NULL;
```

**Por qué no se usa la tabla `org_areas`** que propone el informe: en el seed, las áreas tienen el mismo contenido que los puestos (misión, «qué no hace», KPIs, nota) y además un responsable que es un ocupante. Si son nodos, una sola ficha y un solo flujo de asignación sirven para todo.

**Por qué las tareas van en JSONB y no en una tabla**: son pocas (~82), se editan como lista ordenada y se versionan junto con el nodo. La búsqueda se hace en el cliente sobre la versión vigente, que pesa unos pocos KB. Si algún día hace falta buscar en el servidor, se agrega una columna `tsvector` generada.

**Cuadrillas:** con `fuente_ocupantes = 'cuadrillas'`, los ocupantes del puesto se leen en vivo:
- los capataces, de `cuadrillas.responsable_id` (con `activo`);
- el plantel, de `cuadrilla_personal`;
- los externos, de `pan_personas_externas.cuadrilla_id`.

No se escribe nada en `org_ocupantes` para ese puesto.

**Vista de personas** (`org_personas`, `security_invoker = true`): es la unión de `personal` (activo o no) y `user_profiles`, deduplicada por `personal.user_id`. Expone solo `id, origen, nombre, apellido, telefono, email, activo, personal_id, usuario_id`, **sin DNI ni domicilio**. Es lo que lee el organigrama, para que el permiso `organigrama: ver` no abra datos de Legajos.
- OJO: la RLS de `personal` hoy permite SELECT a cualquier autenticado, así que la vista no agrega exposición nueva.
- Aun así conviene que la API devuelva solo estas columnas.

### 4.3 Trigger anti-ciclos

```sql
CREATE OR REPLACE FUNCTION org_evitar_ciclo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.depende_de IS NULL THEN RETURN NEW; END IF;
  IF NEW.depende_de = NEW.nodo_id THEN
    RAISE EXCEPTION 'Un puesto no puede depender de sí mismo' USING ERRCODE = 'check_violation';
  END IF;
  -- Serializa las ediciones de un mismo borrador: dos movimientos cruzados
  -- (A bajo B y B bajo A al mismo tiempo) no pueden pasar los dos el chequeo.
  PERFORM 1 FROM org_versiones WHERE id = NEW.version_id FOR UPDATE;
  IF EXISTS (
    WITH RECURSIVE arriba(id) AS (
      SELECT NEW.depende_de
      UNION                                   -- UNION (no ALL): corta aunque ya hubiera un ciclo
      SELECT v.depende_de
        FROM org_nodo_version v JOIN arriba a ON v.nodo_id = a.id
       WHERE v.version_id = NEW.version_id AND v.depende_de IS NOT NULL
    )
    SELECT 1 FROM arriba WHERE id = NEW.nodo_id
  ) THEN
    RAISE EXCEPTION 'Ese movimiento deja al puesto dependiendo de sí mismo (ciclo)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS org_nodo_version_sin_ciclos ON org_nodo_version;
CREATE TRIGGER org_nodo_version_sin_ciclos
  BEFORE INSERT OR UPDATE OF depende_de ON org_nodo_version
  FOR EACH ROW EXECUTE FUNCTION org_evitar_ciclo();
```

Además hay un trigger `org_version_inmutable`: rechaza INSERT, UPDATE y DELETE en `org_nodo_version` cuando la versión no está en `estado = 'borrador'`. Es la garantía de que una versión publicada no se toca.

La misma regla vive como función pura en `src/lib/organigrama/arbol.ts` (`creaCiclo(nodos, id, nuevoPadre)`), con tests, para deshabilitar las opciones en «Mover a…» antes de llegar a la base.

### 4.4 RLS y funciones

```sql
CREATE OR REPLACE FUNCTION org_puede_ver() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'organigrama' IN ('ver','editar'))
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;
CREATE OR REPLACE FUNCTION org_puede_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.activo AND (p.rol::text = 'admin' OR p.permisos->>'organigrama' = 'editar')
                   FROM user_profiles p WHERE p.id = auth.uid()), false);
$$;
```

| Tabla | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `org_versiones` | `org_puede_ver() AND (estado <> 'borrador' OR org_puede_editar())` | `org_puede_editar()`. Publicar va por RPC |
| `org_nodos` | `org_puede_ver()` | `org_puede_editar()` |
| `org_nodo_version` | `org_puede_ver()` y la versión no es borrador, o `org_puede_editar()` | `org_puede_editar()` (y el trigger de inmutabilidad) |
| `org_notas_internas` | `org_puede_editar()` | `org_puede_editar()` |
| `org_ocupantes` | `org_puede_ver()` | `org_puede_editar()` |

**RPC** (`SECURITY DEFINER`, cada una chequea `org_puede_editar()`):
- `org_crear_borrador()`: copia las filas de la vigente a una versión nueva en `borrador`. Si ya hay un borrador, lo devuelve.
- `org_publicar(p_borrador uuid, p_nota text)`: en una transacción pasa la vigente a `archivada` y el borrador a `publicada`, con el `numero` siguiente, `publicada_at` y `publicada_por`.
- `org_descartar_borrador(p_borrador uuid)`.

**Permisos en la app** (los 3 lugares, más las APIs):
- en `acceso.ts`, `DEFINICION`: `{ id: "organigrama", titulo: "Organigrama", grupo: "Personal y flota", rutas: ["/organigrama"] }`, después de `vehiculos`;
- en `navigation.ts`, el grupo «Personal y Flota»: `{ title: "Organigrama", href: "/organigrama", icon: Network }`;
- `APIS["/api/organigrama"] = ["organigrama"]`, si se usa una API (para Odoo o para las fotos);
- **Recomendación**: dar «ver» a todos los perfiles y «editar» al dueño y a Administración/RRHH.

### 4.5 Bajas automáticas

No hace falta un trigger que modifique datos: «Para revisar» calcula las bajas como ocupantes vigentes (`hasta IS NULL`) cuyo `personal.activo = false`, o cuyo `user_profiles.activo = false`.
- Opcional: en `sincronizarEmpleado` (sync de Odoo), cuando un legajo pasa a inactivo y tiene un ocupante vigente, se emite una alerta `organigrama_baja` en la campanita, con el mismo patrón que `personal_odoo`.
- El puesto **no se libera solo**: lo resuelve una persona («Quitar del puesto» pone `hasta = fecha de baja` y `motivo_fin = 'baja'`). Es la misma regla del pañol: el sistema avisa y la persona decide.

### 4.6 Decisión abierta: ¿quién es dueño de la jerarquía, Odoo o la app?

**Opciones:**
- **A. Odoo es el dueño.** Se leen `hr.employee.parent_id` y `department_id`/`hr.department`, y el organigrama es una vista de solo lectura sincronizada.
- **B. La app es la dueña de la estructura y Odoo, de las personas.** El organigrama de puestos y el manual viven en la app. Odoo sigue siendo la fuente de altas, bajas y teléfonos (vía Legajos).
- **C. Híbrido.** La app es la dueña, y además se compara contra Odoo y se muestran las diferencias en «Para revisar».

**Recomendación: B ahora, con la puerta abierta a C.** Razones:
1. **Odoo modela jefes entre personas, no puestos con funciones.** Lo valioso de este módulo (tareas, «qué no hace», documentos, KPIs y versiones) no tiene lugar en `hr.employee` ni en `hr.job`.
2. **En el Odoo de ABA los datos de jerarquía no son confiables o no se sabe si están**: `job_title` guarda la «Escala» y nadie leyó nunca `parent_id` ni `department_id`.
3. **La decisión del dueño del 10/10** («Legajos es la gente de obra») hace que la oficina no esté en Legajos. Con la opción A habría que traer administrativos desde Odoo solo para dibujar el árbol.
4. **Las cuadrillas, que son la jerarquía operativa real, ya viven en la app**, no en Odoo.
5. La opción B no cierra la C: si mañana se carga `department_id` en Odoo, se suma un aviso de diferencias sin cambiar el modelo.

**Antes de la fase 1**: hay que verificar en Odoo si `hr.department` y `parent_id` tienen datos. Si los tienen, sirven para **sembrar una sola vez** (`scripts/organigrama-sembrar-odoo.mjs`, en simulacro por defecto). Esta decisión es del dueño y va a `docs/organigrama/modulo.md` § Decisiones.

---

## 5. Plan por fases

| Fase | Qué entra | Para qué alcanza |
|---|---|---|
| **0: Maqueta y decisiones** (esta semana) | La maqueta navegable de §6, con datos locales. Revisión con el dueño y con 1 capataz. Decisión sobre Odoo y chequeo de `hr.department`. Definir quién tiene «editar» | Validar el concepto (mapa por columnas, buscador, ficha) antes de tocar la base |
| **1: Mínima útil** | Migración con todas las tablas de §4 (con `org_versiones`, aunque la UI de borrador todavía no exista: los editores editan la versión vigente y el trigger de inmutabilidad queda **desactivado** hasta la fase 2). Seed del `seedData` como versión 1. Mapa (desktop + celular), Ficha de puesto, Ficha de persona, Buscador (tareas, puestos y personas; documentos solo como texto), Asignar/Quitar (titular e interino), Personas, Para revisar (bajas, vacantes, carga, interinos). Módulo de permisos y menú. Docs `modulo.md` y `handoff.md` | Que toda la empresa sepa quién hace qué y que RRHH lo mantenga al día |
| **2: Documento oficial** | Borrador → Publicar con nota, Versiones (lista + ver cambios), trigger de inmutabilidad activo, chips de documento por tarea y búsqueda por documento, cuadrillas en vivo debajo de Montajes, «Tu lugar» en el celular, Imprimir A4 (mapa + fichas), alerta de baja desde el sync de Odoo | Que el organigrama se comunique como versión oficial y se imprima |
| **3: Más inteligencia** | «Ver esta versión» y comparar, fotos de Odoo, vista Circuito documental, diferencias con Odoo, KPIs conectados (pañol, partes) | Solo si las fases 1 y 2 se usan |

---

## 6. Especificación de la maqueta (para el agente desarrollador)

### 6.1 Alcance y reglas

- **Maqueta navegable en `/organigrama` dentro de Andamios-OS**, con **datos locales en memoria**.
  - Sin Supabase, sin migraciones y sin API routes.
  - El estado vive en un `useReducer` dentro de un contexto de cliente, y se pierde al recargar. Opcional: persistir el borrador en `localStorage` con try/catch.
- **Antes de escribir código**, leer las guías de `node_modules/next/dist/docs/` (lo exige `AGENTS.md`). En particular:
  - `useSearchParams` en páginas cliente, que requiere un límite `<Suspense>`;
  - `params` como `Promise`.
- **Imitar el estilo** de:
  - `src/app/(dashboard)/deposito/panol/layout.tsx` (header + pestañas-link);
  - `src/components/permisos-via-publica/ui.tsx` (importar `Chip`, `Aviso` y `Seccion` desde ahí, sin duplicarlos);
  - `src/components/hoja-dia/comunes/hoja-lateral.tsx` (importar `HojaLateral` y `Caja`).

  Las primitivas son `src/components/ui/*` (Base UI: `render={<Link/>}` y `nativeButton={false}`, no `asChild`).
- **Colores**: solo tokens y `var(--tb-*)`. Hay un solo coral por pantalla (§3.4) y la maqueta tiene que verse bien en oscuro (el tema por defecto) y en claro.
- **Registrar el módulo**:
  - en `src/lib/auth/acceso.ts`, `DEFINICION`: `{ id: "organigrama", titulo: "Organigrama", grupo: "Personal y flota", rutas: ["/organigrama"] }`, después de `vehiculos`;
  - en `src/lib/constants/navigation.ts`, el grupo «Personal y Flota»: `{ title: "Organigrama", href: "/organigrama", icon: Network }`.

  Con eso, de entrada solo lo ve el admin, que es lo correcto para una maqueta.
- Hay un banner fijo arriba, en una línea: `Chip tono="prueba"` «Maqueta» + «Datos de ejemplo. Nada de lo que hagas acá se guarda.» y el selector **«Ver como»** (ver 6.3).
- **Calidad**:
  - `npm run lint` y `npx tsc --noEmit` sin errores;
  - tests de la lógica pura con `node:test` en `src/lib/organigrama/arbol.test.ts`, agregados al script `npm test` si hace falta, como los demás.

### 6.2 Archivos

```
src/app/(dashboard)/organigrama/
  layout.tsx                 "use client". Migas «Personal y Flota › Organigrama», h1, acciones (Imprimir, Editar estructura),
                             pestañas-link (Mapa · Personas · Para revisar (N) · Versiones; las dos últimas solo si puedeEditar),
                             banner de maqueta y <ProveedorOrganigrama>. Sin pestañas en /imprimir.
  page.tsx                   Mapa + buscador + hoja lateral según ?puesto= / ?persona= (envolver en <Suspense>).
  personas/page.tsx          Lista de personas (+ hoja de persona).
  revisar/page.tsx           Para revisar (si !puedeEditar → Aviso «No tenés acceso a esta sección» + link al mapa).
  versiones/page.tsx         Lista de versiones + diálogo «Ver cambios».
  imprimir/page.tsx          Vista A4 con opciones y window.print().

src/components/organigrama/
  proveedor.tsx              Contexto: estado (datos de maqueta + borrador + ocupantes), dispatch, «ver como», helpers
                             (usePuedeEditarOrg() que en la maqueta depende de «ver como», no de usePuedeEditar real).
  banner-maqueta.tsx         Chip «Maqueta» + selector «Ver como».
  buscador.tsx               Input «¿A quién le pregunto por…?» + panel de resultados agrupados (Documentos/Tareas/Puestos/Personas).
  filtros-mapa.tsx           Chips-botón Todo / Vacantes / Interinos / Bajas.
  mapa.tsx                   Dirección arriba + grilla de columnas (lg:grid-cols-5, md:grid-cols-2…) / acordeón en < md.
  columna-area.tsx           Encabezado con tinte --tb-X-bg + lista de TarjetaPuesto (+ «Agregar puesto» en borrador).
  tarjeta-puesto.tsx         Franja de área, título, rol, AvatarGroup de ocupantes, chip de estado, menú ⋯ en borrador.
  area-movil.tsx             Fila desplegable de área para celular.
  tu-lugar.tsx               Tarjeta «Tu lugar» (solo «ver como» capataz o persona con puesto).
  ficha-puesto.tsx           Contenido de la HojaLateral de puesto (Cajas: ocupan, reporta a, misión, tareas, no hace, KPIs, nota, cuadrillas).
  cuadrillas-en-vivo.tsx     Caja de cuadrillas para Montajes (capataz + plantel desplegable).
  ficha-persona.tsx          Contenido de la HojaLateral de persona.
  fila-ocupante.tsx          Avatar + nombre + modalidad/chips + tel: + link a persona.
  asignar-persona.tsx        Dialog con Command (buscador de personas) + modalidad titular/interino → toast con «Deshacer».
  chip-documento.tsx         «RS · emite» clicable (dispara búsqueda por ese código).
  barra-borrador.tsx         Barra sticky: «Borrador · N cambios», Ver cambios, Descartar, Publicar versión (coral).
  editor-puesto.tsx          HojaLateral con formulario (react-hook-form) de la ficha; lista de tareas con docs, ↑ ↓, quitar.
  mover-a.tsx                Dialog con árbol indentado; deshabilita propio y descendientes (creaCiclo).
  eliminar-puesto.tsx        ConfirmDialog con los textos de §3.11 (subir dependientes; nunca borra la rama).
  dialogo-publicar.tsx       Resumen de cambios + nota obligatoria → nueva versión en la lista.
  lista-personas.tsx         Filtros + filas.
  bandeja-revisar.tsx        Secciones de §3.10.
  lista-versiones.tsx        Borrador + versiones.
  impresion.tsx              Hoja A4 con tokens claros forzados (.org-impresion) + @page.
  colores-area.ts            Mapa color → clases con var(--tb-X-bg|borde|text) (sin hex).

src/lib/organigrama/
  tipos.ts                   Tipos de abajo.
  datos-maqueta.ts           El dataset (§6.4).
  arbol.ts                   Puro: hijos, ancestros, descendientes, areaDe, creaCiclo, mover, subirHijos, quienResponde,
                             cargaPorPersona, estadoPuesto, pendientes, buscar (sin tildes), diffVersiones.
  arbol.test.ts              node:test: creaCiclo (propio, descendiente, válido), subirHijos, quienResponde (vacante → padre;
                             baja → padre), cargaPorPersona (Natalia = 3), buscar('remito') encuentra RS/RDF y tareas,
                             buscar sin tildes ('logistica'), diff (nuevo/modificado/movido).
```

Archivos existentes que se tocan: `src/lib/auth/acceso.ts` (una línea) y `src/lib/constants/navigation.ts` (una línea + el import de `Network`). **No se toca nada más.**

### 6.3 Vistas e interacciones que tiene que tener

1. **Mapa (desktop).**
   - La Dirección arriba y 5 columnas de áreas con sus puestos, en el orden del seed.
   - La franja de color de área, los avatares, y los chips Vacante / Interino / Dado de baja / Externo.
   - Clic en una tarjeta → `?puesto=<clave>` abre la ficha. Clic en un avatar → `?persona=<id>`. Atrás cierra.
2. **Mapa (celular, < md).** Áreas desplegables y buscador sticky. «Tu lugar» cuando «Ver como» es Capataz.
3. **Filtros.** Vacantes, Interinos y Bajas. Las tarjetas que no coinciden se colapsan a «+N puestos» por columna (no se atenúan).
4. **Buscador.** Probar estos casos:

   | Búsqueda | Resultado esperado |
   |---|---|
   | «remito» | Docs RS, RDF y RDP + tareas |
   | «SOL» | Doc: usa Control de Stock, emite Oficina Técnica |
   | «factura» | Facturación → Natalia |
   | «quiroga» | La persona |
   | «logistica» | Sin tilde, encuentra Logística |
   | «xyz» | El estado vacío |

   Cuando el ocupante está vacante o dado de baja, el resultado muestra «preguntá a…» (usa `quienResponde`).
5. **Ficha de puesto**:
   - Quién lo ocupa (titular, interino, baja), con `tel:`.
   - Reporta a / Le reportan, como links.
   - Misión, Tareas con chips de documento, «Qué NO hace» y KPIs (con «(del área)» si se heredan), y la nota de diseño.
   - La nota interna, solo para el editor.
   - «Copiar link», que copia la URL y muestra un toast.
   - Montajes muestra la caja «Cuadrillas» con 3 cuadrillas desplegables.
6. **Ficha de persona**:
   - puestos, reporta a, le reportan y teléfono;
   - chip «3 puestos» para Natalia;
   - Aviso de baja para Nicolás;
   - «Sin puesto» para Leandro.
7. **Asignar / quitar** (editor):
   - «Asignar persona» (coral en las vacantes) abre un buscador de personas con modalidad titular/interino;
   - «Quitar» muestra un toast con «Deshacer»;
   - la asignación no marca el borrador (es inmediata).
8. **Personas.** Buscador, filtros Todas / Sin puesto / 2+ puestos / Bajas, y la agrupación por área o plana (recordada en localStorage con try/catch).
9. **Para revisar.** Las 6 secciones de §3.10 con los datos del dataset. Las acciones funcionan: quitar del puesto, abrir «Asignar» y abrir la ficha.
10. **Modo borrador** (editor, desktop):
    - «Editar estructura» → barra de borrador. El dataset ya trae un borrador con 2 cambios, así que se ve poblado de entrada.
    - Menú ⋯ siempre visible con Editar ficha, Agregar puesto debajo, Mover a…, Subir, Bajar y Eliminar.
    - Marcas de cambio en las tarjetas.
    - «Ver cambios», «Descartar» (con confirmación) y «Publicar versión» (nota obligatoria → v4 aparece en Versiones como vigente y la barra desaparece).
    - Mover a… no deja elegir descendientes. Eliminar Montajes (sin hijos) funciona. Eliminar Operaciones ofrece «Subir sus 7 puestos a Dirección General».
11. **Versiones.** El borrador, v3 vigente, v2 y v1, con «Ver cambios» (que es la lista `cambios` del dataset).
12. **Imprimir.** Las opciones Solo mapa / Mapa + fichas / Un área, la vista previa en claro aunque la app esté en oscuro, y `window.print()` con A4 apaisada para el mapa y vertical para las fichas.
13. **Estados de demo** con `?demo=cargando` (skeletons), `?demo=vacio` (EmptyState + coral «Empezar desde la estructura base» si es editor) y `?demo=error` (Aviso bloqueo), en el Mapa y en Personas.
14. **«Ver como»** (en el banner):

    | Opción | Qué ve |
    |---|---|
    | **Dirección (editor)** | Todo |
    | **Administración (editor)** | Todo |
    | **Encargado (lector)** | Sin Editar, Para revisar, Versiones ni notas internas |
    | **Capataz (lector, Ramón Giménez)** | Lo mismo que el lector, más «Tu lugar» |

    Si el lector entra por URL directa a `/organigrama/revisar`, ve el estado «sin permiso».

**Fuera de la maqueta**:
- persistencia, Supabase y API;
- fotos;
- «Ver esta versión» y comparar;
- la vista Circuito documental;
- arrastrar y soltar;
- la edición en el celular.

### 6.4 Dataset (`src/lib/organigrama/datos-maqueta.ts`)

**Tipos** (`tipos.ts`):

```ts
export type ColorArea = "gris" | "teal" | "ambar" | "violeta" | "verde" | "rosa" | "azul";
export type TipoNodo = "direccion" | "area" | "puesto";
export type RolDoc = "emite" | "firma" | "recibe" | "usa";
export type CodigoDoc = "SOL" | "OPC" | "RS" | "FS" | "RDP" | "RDF" | "ICO";

export type Tarea = { texto: string; docs?: { codigo: CodigoDoc; rol: RolDoc }[] };
export type Nodo = {
  clave: string;               // id estable y URL: 'stock'
  dependeDe: string | null;    // clave del padre
  tipo: TipoNodo;
  titulo: string;
  rol?: string;                // ex subtitle
  color?: ColorArea;           // solo direccion/area
  mision?: string;
  tareas: Tarea[];
  noHace: string[];
  kpis: string[];
  notaDiseno?: string;
  notaInterna?: string;
  fuenteOcupantes?: "manual" | "cuadrillas";
  orden: number;
};
export type OrigenPersona = "legajo" | "usuario" | "externo";
export type Persona = {
  id: string; nombre: string; apellido: string; origen: OrigenPersona;
  telefono?: string; email?: string; activo: boolean; bajaEl?: string; // ISO
  tarea?: "andamista" | "chofer" | "herrero"; empresa?: string;        // externos
};
export type Ocupante = { id: string; nodo: string; persona: string; modalidad: "titular" | "interino"; desde: string; hasta?: string };
export type Cuadrilla = { id: string; nombre: string; capataz: string | null; plantel: string[]; temporaria?: boolean };
export type Documento = { codigo: CodigoDoc; nombre: string };
export type Cambio = { tipo: "nuevo" | "modificado" | "movido" | "eliminado"; nodo: string; detalle: string };
export type Version = { id: string; numero: number | null; estado: "borrador" | "publicada" | "archivada"; nota: string; fecha: string; autor: string; cambios: Cambio[] };
```

**Documentos:**

| Código | Nombre |
|---|---|
| SOL | Solicitud de Materiales |
| OPC | Orden de Preparación de Carga |
| RS | Remito de Salida |
| FS | Formulario de Sobrante |
| RDP | Remito de Devolución Parcial |
| RDF | Remito de Devolución Final |
| ICO | Informe de Conciliación de Obra |

**Nodos**: copiar **textualmente** del `seedData.js` original los 24 nodos.
- Por nodo: `label` → `titulo`, `subtitle` → `rol`, `desc` → `mision`, `noHace` partido en lista, `kpis`, `tasks` → `tareas` y `note` → `notaDiseno`.
- **Las misiones de los 18 puestos quedan vacías** (como en el seed). Eso ejercita el estado «Falta la misión» y la herencia del área.
- Las claves y colores son los de la tabla:

  | Clave | Título | Depende de | Color |
  |---|---|---|---|
  | `dg` | DIRECCIÓN GENERAL | — | `gris` |
  | `tec_com` | Dirección Técnico-Comercial | `dg` | `teal` |
  | `ventas` · `oficina_tec` | Ventas · Oficina Técnica | `tec_com` | |
  | `ops` | Dirección de Operaciones | `dg` | `ambar` |
  | `planif` · `supervision` · `montajes` · `taller` · `logistica` · `seguridad` · `vehiculos` | (los 7 del seed) | `ops` | |
  | `deposito` | Depósito y Control de Materiales | `dg` | `violeta` |
  | `stock` · `despacho` · `devoluciones` | (los 3 del seed) | `deposito` | |
  | `admin` | Administración y Finanzas | `dg` | `verde` |
  | `fact` · `cobr` · `teso` · `control` | (los 4 del seed) | `admin` | |
  | `sistemas` | Sistemas y Mantenimiento | `dg` | `rosa` |
  | `it` · `mant` | (los 2 del seed) | `sistemas` | |

- `montajes.fuenteOcupantes = "cuadrillas"`.
- Una `notaInterna` de ejemplo en `cobr`: «Buscando perfil con experiencia en cuentas corrientes; entrevistas en noviembre».

**Documentos por tarea** (los `docs` que se agregan a las tareas del seed):

| Puesto | Tarea | Docs |
|---|---|---|
| `oficina_tec` | «Emitir Solicitud de Materiales (SOL)» | SOL emite |
| `stock` | «Verificar stock disponible vs SOL» | SOL usa |
| `stock` | «Emitir Orden de Preparación de Carga (OPC)» | OPC emite |
| `stock` | «Emitir Remitos de Salida (RS)» | RS emite |
| `despacho` | «Preparar cargas según OPC» | OPC usa |
| `montajes` | «Firma de Remitos de Salida (RS) al recibir» | RS firma |
| `montajes` | «Emisión de Formulario de Sobrante (FS) post-armado» | FS emite |
| `montajes` | «Firma de Remito de Devolución Final (RDF) al desarmar» | RDF firma |
| `logistica` | «Transporte con remito correspondiente» | RS usa |
| `logistica` | «Firma de RS al cargar y entregar» | RS firma |
| `devoluciones` | «Recibir devoluciones con RDP/RDF firmado» | RDP recibe, RDF recibe |
| `devoluciones` | «Registrar sobrantes (FS) y parciales (RDP)» | FS recibe, RDP recibe |
| `control` | «Conciliación de materiales por obra (ICO)» | ICO emite |
| `control` | «Registro de todos los remitos en sistema» | RS usa, RDP usa, RDF usa |

**Personas** (37 en total, contando a Laura Paz; nombres inventados; teléfonos con el prefijo ficticio `11 5555-01xx`):

| id | Nombre | Origen | Notas |
|---|---|---|---|
| `p-rfb` | Ricardo Fernández Bustos | usuario | Dirección General |
| `p-mig` | Martín Iglesias | usuario | **Dos puestos**: responsable Técnico-Comercial + Oficina Técnica |
| `p-lbe` | Lucía Benítez | usuario | Ventas |
| `p-fso` | Federico Sosa | usuario | Ventas |
| `p-ipa` | Ignacio Paredes | legajo (tecnico) | Oficina Técnica |
| `p-gro` | Gustavo Romero | usuario | Responsable de Operaciones |
| `p-cme` | Carolina Medina | usuario | Planificación |
| `p-wac` | Walter Acosta | legajo (supervisor) | Supervisión (titular) + **Seguridad y Formación (interino desde 2026-08-01)** |
| `p-rgi` | Ramón Giménez | legajo, andamista | Capataz Cuadrilla 1 (el «Ver como capataz») |
| `p-hvi` | Héctor Villalba | legajo, andamista | Capataz Cuadrilla 2 |
| `p-dle` | Diego Ledesma | legajo, andamista | Capataz Cuadrilla 3 |
| `p-alu` `p-efe` `p-jpe` `p-msa` `p-cva` | Alan Luna, Ezequiel Ferreyra, Jonathan Pereyra, Maximiliano Sánchez, Cristian Vera | legajo, andamista | Plantel Cuadrilla 1 (**5 operarios**) |
| `p-dmo` `p-lca` `p-rbr` `p-gna` | Damián Molina, Lucas Cabrera, Rodrigo Brizuela, Gonzalo Navarro | legajo, andamista | Plantel Cuadrilla 2 (4) |
| `p-fro` `p-sti` `p-mgo` | Franco Rojas, Santiago Toledo, Marcelo Godoy | legajo, andamista | Plantel Cuadrilla 3 (3) |
| `p-ext1` | Hugo Báez | externo, empresa «Montajes del Oeste» | Plantel Cuadrilla 3 (externo) |
| `p-ope` | Osvaldo Peralta | legajo, herrero | Taller |
| `p-joj` | Javier Ojeda | legajo, chofer | Repartos y Logística |
| `p-cru` | Cristian Ruiz | legajo, chofer | Repartos y Logística |
| `p-sdo` | Sergio Domínguez | usuario | Encargado de Depósito + Control de Stock (**dos puestos**) |
| `p-mco` | Matías Correa | legajo | Preparación y Despacho |
| `p-bag` | Brian Aguirre | legajo | Preparación y Despacho |
| `p-nhe` | Nicolás Herrera | legajo | Recepción y Devoluciones. **`activo: false`, `bajaEl: "2026-10-05"`** |
| `p-nqu` | Natalia Quiroga | usuario | Responsable Admin. y Finanzas + Facturación + Costos, Control y RRHH (**3 puestos → sobrecarga**) |
| `p-smo` | Silvia Moreno | usuario | Tesorería y Pagos |
| `p-tvi` | Tomás Vidal | usuario | Responsable de Sistemas + Soporte IT |
| `p-ext2` | Servicios Edilicios Sur | externo | Mantenimiento Edilicio (`nombre_libre`) |
| `p-lfu` | Leandro Funes | legajo, andamista | **Activo sin puesto ni cuadrilla** |
| `p-lpa` | Laura Paz | usuario | Ex Cobranzas. `activo: false`. Solo existe como ocupante histórico |

**Ocupantes** (`manual`):
- `dg`: `p-rfb`.
- `tec_com`: `p-mig`.
- `ventas`: `p-lbe` y `p-fso`.
- `oficina_tec`: `p-ipa` y `p-mig`.
- `ops`: `p-gro`.
- `planif`: `p-cme`.
- `supervision`: `p-wac`.
- `taller`: `p-ope`.
- `logistica`: `p-joj` y `p-cru`.
- `seguridad`: `p-wac` **interino** desde `2026-08-01`.
- `vehiculos`: **vacante**.
- `deposito`: `p-sdo`.
- `stock`: `p-sdo`.
- `despacho`: `p-mco` y `p-bag`.
- `devoluciones`: `p-nhe` (dado de baja → «Para revisar»).
- `admin`: `p-nqu`.
- `fact`: `p-nqu`.
- `cobr`: **vacante** (con el ocupante histórico `p-lpa`, `hasta: "2026-07-15"`, para mostrar «vacante desde 15/07»).
- `teso`: `p-smo`.
- `control`: `p-nqu`.
- `sistemas`: `p-tvi`.
- `it`: `p-tvi`.
- `mant`: `p-ext2`.
- Las fechas `desde` son variadas, entre 2019 y 2025.

**Cuadrillas** (alimentan `montajes`):
- `c1`: «Cuadrilla 1», capataz `p-rgi`, plantel `p-alu`, `p-efe`, `p-jpe`, `p-msa` y `p-cva`.
- `c2`: «Cuadrilla 2», capataz `p-hvi`, plantel `p-dmo`, `p-lca`, `p-rbr` y `p-gna`.
- `c3`: «Cuadrilla 3», capataz `p-dle`, plantel `p-fro`, `p-sti`, `p-mgo` y `p-ext1`.

**Versiones:**

| Versión | Estado | Fecha | Autor | Nota | Cambios |
|---|---|---|---|---|---|
| v1 | archivada | 2026-03-15 | Ricardo Fernández Bustos | «Estructura inicial» | Ninguno (es la base) |
| v2 | archivada | 2026-06-02 | Ricardo Fernández Bustos | «Depósito pasa a reportar a Dirección General» | `{movido, deposito, "De Dirección de Operaciones a Dirección General"}` |
| v3 | publicada (vigente) | 2026-09-01 | Ricardo Fernández Bustos | «Se formaliza Seguridad y Formación dentro de Operaciones» | `{nuevo, seguridad, "Puesto nuevo con 4 tareas"}` |
| borrador | borrador | 2026-10-10 | Natalia Quiroga | — | `{nuevo, coord_logistico, "Coordinador Logístico, debajo de Repartos y Logística"}`, `{modificado, stock, "+1 tarea: Controlar vencimiento de certificaciones de materiales"}` |

- El borrador trae como datos un nodo extra `coord_logistico` («Coordinador Logístico», rol «Coordinación de viajes», `dependeDe: "logistica"`, 2 tareas tomadas de logística). Ese nodo **solo existe en el borrador**: en el mapa vigente no aparece, y en modo borrador aparece con el chip «nuevo».
- Esto también ejercita los sub-puestos indentados dentro de una columna.

**Usuario actual por «Ver como»:**
- Dirección → `p-rfb`;
- Administración → `p-nqu`;
- Encargado → `p-sdo`;
- Capataz → `p-rgi`.

### 6.5 Criterios de aceptación de la maqueta

- [ ] `/organigrama` aparece en el menú «Personal y Flota» para el admin y en el buscador de comandos.
- [ ] El mapa muestra 1 + 5 columnas con 18 puestos. Los contadores dan:
  - 3 vacantes reales (`vehiculos`, `cobr` y `seguridad`, esta última cubierta por interino);
  - 1 baja;
  - 1 persona con 3 puestos;
  - 1 activo sin puesto.
- [ ] Cada uno de los 6 casos de búsqueda de §6.3 devuelve lo esperado. Al cambiar de «ver como», los lectores no ven acciones de edición ni notas internas.
- [ ] En el borrador se puede:
  - crear un puesto;
  - editar sus tareas con documentos;
  - moverlo (sin poder elegir descendientes);
  - eliminar uno con dependientes subiéndolos;
  - publicar (la versión 4 queda vigente).
- [ ] A 375 px de ancho no hay scroll horizontal de página, y todas las acciones se pueden tocar (`h-10`).
- [ ] En claro y en oscuro, los chips de estado tienen ícono o texto y ningún color está escrito con hex.
- [ ] La vista de impresión sale en claro con el tema oscuro activo y separa las fichas en páginas.
- [ ] `arbol.test.ts` pasa. `lint` y `tsc` están limpios.

---

## 7. Propuesta 2: Lienzo vivo (`/organigrama/lienzo`)

**Por qué.** Devolución del dueño sobre la maqueta: «me gustó, pero me imaginaba algo súper animado, didáctico: poner, sacar, agarrar, cambiar, agregar puestos, vacantes». El Mapa por columnas sirve para *leer*. El Lienzo sirve para *manipular* y para *enseñar*. Es la primera pestaña y el destino del menú. Mapa, Personas, Para revisar y Versiones siguen igual.

**Idea.** Un lienzo tipo Figma/Linear. El árbol se dibuja de arriba hacia abajo con conectores curvos, y todo lo que cambia viaja con un spring a su nuevo lugar: nada aparece ni desaparece de golpe. Usa el mismo proveedor que el Mapa:
- la estructura va al borrador; si el editor no estaba editando, entra solo con el primer cambio;
- la ocupación es inmediata;
- «Publicar versión» abre el mismo diálogo de siempre.

| Qué | Cómo se usa |
|---|---|
| **Lienzo** | Se panea arrastrando el fondo (o con un dedo). El zoom va hacia el cursor con la rueda, el pinch del trackpad o dos dedos. Hay botones + / − / encuadrar y un minimapa que se puede tocar. Al alejar por debajo del 50 %, las tarjetas se simplifican a nombre + conteo (zoom semántico). |
| **Layout** | `src/lib/organigrama/layout.ts`, puro y con tests. La Dirección y las áreas se abren en abanico, y debajo de cada área los puestos van en lista con sangría (ABA es ancho y bajo). Los conectores tienen siempre la misma forma de `d`, así motion interpola el viejo con el nuevo. |
| **Tarjetas vivas** | Llevan la franja y el punto del color de área (`--tb-*`) y los avatares de quienes ocupan el puesto. Una **vacante** tiene un borde punteado que camina, un halo que respira y el chip «Vacante». Con interino, el borde queda quieto. Los chips de Baja y Externo siguen. Las ramas se colapsan con «−» y se expanden con «+N»: los hijos entran y salen en cascada desde el padre. |
| **Caja de herramientas** | Tiene tres piezas que se arrastran: «Puesto nuevo», «Vacante» (un puesto con «Búsqueda abierta») y «Área nueva» (solo debajo de la Dirección o de otra área; toma el color libre de la paleta). Mientras se arrastra, los destinos válidos se iluminan y una **vista previa** punteada muestra dónde caería, con su conector. Las demás cajas le hacen lugar y el destino queda anclado bajo el puntero. Al soltar, el puesto nace y se edita el nombre ahí mismo. |
| **Banco de personas** | Es el dock de abajo: primero las personas «Sin puesto», después todas, con búsqueda. Si se arrastra a alguien a una vacante, el puesto se cubre con una micro-celebración. Si el puesto está ocupado, pregunta: **Reemplazar / Compartir / Como interino**. Si se arrastra un avatar fuera de su puesto, la persona vuelve al banco y el puesto queda vacante. Montajes no acepta personas (sale de las cuadrillas). |
| **Agarrar y mover** | Se arrastra un puesto sobre su nuevo jefe y la rama entera viaja con él. Sobre sí mismo o sobre un descendiente, el destino se pone rojo y tiembla, y al soltar el puesto rebota a su lugar. |
| **Tacho** | Aparece mientras se arrastra un puesto. Si el puesto tiene dependientes, pregunta: «Subirlos a {jefe}» o «Borrar toda la rama». Cancelar no toca nada. |
| **Deshacer / rehacer** | ⌘Z / ⇧⌘Z / Ctrl+Y y botones. Guarda fotos del borrador y de la ocupación (acción `restaurar` del proveedor). No intercepta las teclas si el foco está en un campo o en un diálogo. Los toasts traen «Deshacer». |
| **Foco** | Al hacer clic en un puesto, la cámara encuadra su cadena de mando hasta la Dirección, el resto se atenúa, la cadena se dibuja con un trazo y se abre la ficha de siempre (`?puesto=`). Con `?persona=` se resaltan los puestos de esa persona. En el lienzo, la hoja lateral no lleva velo, para que se vea el foco. |
| **Conocé ABA** | Es un recorrido para la inducción: la cámara vuela área por área. La tarjeta cuenta qué hace el área (misión), quién la lidera, cuántos puestos, personas y vacantes tiene, y «por qué está así». Se navega con Anterior / Siguiente / ← → / Esc. |
| **Seguí el papel** | Hay tres circuitos (`src/lib/organigrama/circuitos.ts`): **Sale material** (SOL → OPC → RS), **Vuelve material** (FS → RDF) y **Cierre y cobro** (ICO → factura). Un papelito viaja por los conectores de puesto en puesto, y en cada parada se lee qué hace ese puesto con el documento y quién responde (si la parada está vacante, sube con `quienResponde`). Se reproduce solo o paso a paso. Un test verifica que cada parada exista y que el puesto tenga esa tarea con ese documento. |
| **Contadores** | Puestos, personas con puesto / activas y vacantes. Cuentan hasta el valor nuevo y dan un saltito cuando cambian. |
| **Celular** | Paneo con un dedo y pinch con dos. Para arrastrar hay que mantener presionado (380 ms). También se puede tocar una persona o una herramienta y después tocar el puesto. No hay scroll horizontal de página. |
| **Accesibilidad y movimiento** | Con «reducir movimiento» (`MotionConfig reducedMotion="user"`), las cajas cambian de lugar sin viajar, la cámara salta, el papel no vuela y no hay pulsos ni chispas. Las tarjetas son `<button>`. Hay atajos (`?`) y tema oscuro y claro con tokens. Hay un solo coral: «Publicar versión». |

**Técnica.** Se usa `motion` (motion/react).
- La cámara son tres motion values (x, y, k) aplicados a un solo `transform`.
- Las tarjetas se mueven con `animate={{ x, y }}` y spring, nunca con top/left.
- El arrastre es propio: `elementsFromPoint` + `data-destino`. Funciona igual con zoom y con touch.
- Las tarjetas están memoizadas.

**Archivos.**
- `src/components/organigrama/lienzo/*`: `lienzo`, `tarjeta`, `conectores`, `camara`, `arrastre`, `herramientas`, `banco`, `barra`, `navegacion`, `didactico`, `dialogos-lienzo`, `piezas` y `comun`.
- `src/lib/organigrama/{layout,lienzo,circuitos}.ts` con `layout.test.ts` y `lienzo.test.ts`.
- La ruta `src/app/(dashboard)/organigrama/lienzo/page.tsx`.

**Límites conocidos.**
- El historial de deshacer vive mientras el lienzo está abierto; se pierde al cambiar de pestaña.
- Reordenar hermanos arrastrando (subir y bajar) sigue en el menú ⋯ del Mapa.
- La edición completa de la ficha sigue en «Editar ficha».
