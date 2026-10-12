# Organigrama

Quién hace qué en ABA: la estructura (Dirección, áreas y puestos), el manual de funciones de cada puesto (misión, tareas con los documentos que toca, «qué NO hace», KPIs) y quién ocupa cada lugar. Ruta `/organigrama` (el menú entra por el Lienzo, `/organigrama/lienzo`).

- Propuesta de producto y arquitectura: [propuesta.md](./propuesta.md) (12/10/2026). Este documento dice qué quedó construido y con qué decisiones; ante una diferencia, manda este (y el código).
- Estado real, lo que falta y cómo retomar: [handoff.md](./handoff.md).
- Propuesta de estructura nueva (pyme familiar, circuito real), que se carga como borrador: [estructura-v2.md](./estructura-v2.md).
- **En producción desde el 12/10/2026.**

---

## 1. Qué resuelve

- **Una sola fuente para «¿a quién le pregunto?»**: el buscador cruza tareas, documentos (SOL, OPC, RS, FS, RDP, RDF, ICO), puestos y personas. Si el puesto está vacante o su ocupante está dado de baja, la respuesta sube al jefe más cercano con alguien activo.
- **El manual de funciones vivo**: cada puesto tiene su ficha, con herencia de «qué NO hace» y KPIs desde el área.
- **Que la estructura sea un documento oficial**: se arma en un borrador y se publica como versión con nota.
- **Que las personas no se carguen dos veces**: salen de Legajos y de los usuarios. Una baja en Legajos aparece sola en «Para revisar».

## 2. Decisiones (12/10/2026)

| Decisión | Por qué |
|---|---|
| **La app es dueña de la ESTRUCTURA** (áreas, puestos, jerarquía, contenido de las fichas, versiones). **Odoo/Legajos son dueños de las PERSONAS.** No se duplica ningún dato de una persona | Odoo modela jefes entre personas, no puestos con funciones; el manual no tiene lugar en `hr.employee`. Las bajas, nombres y teléfonos se mantienen solos (opción B de la propuesta § 4.6) |
| Se pueden asignar: **legajos de `personal`** (gente de obra), **usuarios del sistema** (`user_profiles`, la oficina) y un **ocupante externo de texto libre** (empresa o contratista) | Legajos es solo la gente de obra (decisión del 10/10); la oficina está en los usuarios. Lo de afuera no merece un legajo |
| Un legajo vinculado a un usuario (`personal.user_id`) es **la misma persona**: aparece una vez, como legajo | Evita duplicados en Personas y en la carga |
| Una baja en Legajos **no libera el puesto sola**: queda en «Para revisar» y una persona decide (quitar o reemplazar) | Mismo criterio que el pañol: el sistema avisa, la persona decide |
| **Montajes y Desmontajes** (o cualquier puesto con `fuente_ocupantes = 'cuadrillas'`) muestra en vivo las cuadrillas de Configuración › Cuadrillas: capataz, plantel y externos de la cuadrilla. No se le asignan personas a mano | Es la única jerarquía real que ya existe; copiarla sería mantenerla dos veces |
| **Permisos**: módulo `organigrama` del sistema existente, «ver» o «editar»; **admin siempre edita**. En la base, `org_puede_ver()` / `org_puede_editar()` | Se puede dar «ver» a toda la empresa sin abrirle Legajos (DNI, domicilio) |
| **Versionado**: la estructura va a un **borrador** (uno solo) y se **publica como versión con nota**; una versión publicada no se toca más (trigger). **Las asignaciones de personas son inmediatas**, con historial `desde`/`hasta` y modalidad titular / interino / compartido, sin pasar por el borrador | La gente cambia todas las semanas y la estructura dos veces por año: si se mezclan, nadie publica |
| **Contenido inicial**: la migración carga como **versión 1 publicada** los 24 nodos reales del organigrama original (Dirección, 5 áreas, 18 puestos, con sus tareas, documentos, «qué NO hace», KPIs y notas de diseño, y los colores de área), **sin personas**: todo vacante | El dueño ubica a la gente arrastrando en el Lienzo |
| **Fuera** de la maqueta: las 37 personas inventadas, el selector «Ver como», el banner de maqueta y los `?demo=`. Cargando, vacío y error salen de los datos reales | — |
| **Notas internas** del puesto: solo editores, en una tabla aparte (`org_notas_internas`) | La RLS es por fila, no por columna. No se versionan: son notas de trabajo |
| **Sin API route**: el navegador llama RPC de Supabase (`SECURITY DEFINER`, con el chequeo de permiso adentro) | Cada guardado es atómico en la base; no hace falta la service role ni cruzar Odoo |

## 3. Pantallas

Pestañas como links (mismo esqueleto que el pañol): **Lienzo · Mapa · Personas** para todos; **Para revisar (N) · Versiones** solo para editores. Imprimir se abre desde el Mapa.

- **Lienzo** (`/organigrama/lienzo`, propuesta § 7): el árbol animado. Se arrastran puestos (con su rama), vacantes y áreas nuevas desde la caja de herramientas, personas desde el banco, el tacho para eliminar, deshacer/rehacer (⌘Z / ⇧⌘Z), «Conocé ABA», «Seguí el papel» y pantalla completa (`F`). Atajos con `?`. El primer cambio de estructura abre el borrador solo.
  - **Lista / Árbol** (selector en la barra, tecla `L`, recordado en `localStorage` `organigrama.lienzo.forma`; por defecto **Árbol**). En las dos, la Dirección arriba y las áreas en abanico. **Lista**: los puestos de cada área en columna con sangría. **Árbol** (compacto, no puro): los puestos se abren debajo de su área con bus horizontal y bajadas; con más de 3 hijos van en grilla de 2 columnas (3 o más si quedarían más de 4 filas), el tronco baja por el hueco entre columnas y la última fila incompleta va centrada. Profundidad arbitraria, colapsar, vista previa al arrastrar y zoom semántico funcionan igual. Al cambiar, cada tarjeta y cada conector viajan con spring a la forma nueva (los codos de lista y árbol tienen la misma forma de `d`, así se transforman) y después la cámara encuadra. Con el lienzo de menos de 768 px (celular) siempre es lista y el selector no aparece.
  - **Encuadres** (Encuadrar, el inicial, el del foco, el recorrido y el papel) caen dentro del área que no tapan los paneles flotantes: se miden en el momento (`data-panel` = arriba / abajo / izquierda / derecha: barra, banco, caja de herramientas, minimapa y zoom, tarjeta del recorrido o del papel; en el foco, también la hoja lateral) y `areaLibre` (`layout.ts`) elige, entre los huecos libres, el que muestra más grande lo que se encuadra.
- **Mapa** (`/organigrama`): columnas por área en desktop, áreas desplegables en el celular, buscador «¿A quién le pregunto?», filtros (vacantes, interinos, bajas), «Tu lugar» para quien tiene puesto, y el modo borrador con el menú ⋯ (editar ficha, agregar, mover, subir/bajar, eliminar).
- **Fichas** (hojas laterales `?puesto=` y `?persona=`): quién ocupa, reporta a / le reportan, misión, tareas con documentos, «qué NO hace», KPIs, nota de diseño, nota interna (editores), cuadrillas en vivo. La de persona muestra solo contacto laboral; «Ver legajo» solo con permiso de Legajos.
- **Personas**: todas (legajos activos, usuarios activos, externos), con carga por persona y filtros.
- **Para revisar**: bajas con puesto, vacantes, sobrecarga (3+ puestos), interinos, activos sin puesto, fichas incompletas.
- **Versiones**: el borrador y las publicadas con fecha, autor, nota y «Ver cambios».
- **Imprimir**: A4 con `window.print()`, tokens claros forzados.

Estados: mientras carga, un esqueleto con la forma de la pantalla; si falla, `Aviso` con el mensaje del servidor y «Reintentar»; si no hay ninguna versión publicada, `EmptyState` con «Empezar desde la estructura base» (RPC `org_sembrar`) para editores.

## 4. Datos

Migración `supabase/migrations/20261012000003_organigrama.sql`.

| Tabla | Qué guarda |
|---|---|
| `org_versiones` | Una fila por versión: `estado` borrador / publicada / archivada, `numero` (al publicar), `nota`, `cambios` (el diff legible, calculado al publicar), `publicada_at/por`. A lo sumo un borrador y una publicada (índices únicos parciales) |
| `org_nodos` | La identidad estable de cada caja (`id`) y su `clave` de URL (`stock`, `montajes`). No cambia entre versiones: las asignaciones apuntan acá |
| `org_nodo_version` | El contenido de cada nodo en cada versión: `depende_de`, `tipo`, `titulo`, `rol`, `color` (clave `--tb-*`), `mision`, `tareas` (JSONB con `docs`), `no_hace`, `kpis`, `nota_diseno`, `fuente_ocupantes`, `orden` |
| `org_notas_internas` | Nota interna por nodo (solo editores, sin versionar) |
| `org_ocupantes` | Quién ocupa qué: `personal_id` **o** `usuario_id` **o** `nombre_libre` (exactamente uno), `modalidad`, `desde`, `hasta` (NULL = vigente), `motivo_fin` |

**Integridad en la base:**
- una sola raíz por versión y el padre en la misma versión (FK compuesta diferida);
- nada depende de sí mismo: `org_nodo_version_sin_ciclos`, un *constraint trigger* **diferido** (se juzga el resultado de la transacción, no el orden de las filas);
- una versión publicada no se toca: `org_nodo_version_inmutable` y `org_versiones_proteger` (solo puede pasar de publicada a archivada);
- una persona no ocupa dos veces el mismo puesto a la vez (índices únicos parciales).

**RPC** (todas `SECURITY DEFINER` con su chequeo de permiso; las internas no se exponen):

| RPC | Hace |
|---|---|
| `org_leer()` | Todo lo que pinta la pantalla en una lectura: versiones, nodos de la vigente (y del borrador y notas, si edita), ocupantes con historial, personas (legajos activos o nombrados; usuarios activos salvo el kiosco del pañol; externos de cuadrillas activas) y cuadrillas activas con su plantel. De las personas, solo lo laboral |
| `org_crear_borrador()` | Copia la vigente a un borrador (o devuelve el que ya hay) |
| `org_guardar_borrador(version, cambios)` | `{upsert, borrar, notas}` de una vez |
| `org_publicar(version, nota, cambios)` | El borrador pasa a vigente con número nuevo; la anterior, a archivada |
| `org_descartar_borrador(version)` | Borra el borrador |
| `org_guardar_ocupantes(cambios)` | `{upsert, borrar}` de asignaciones |
| `org_sembrar(filas)` | Siembra la estructura base si no hay ninguna versión |

Al publicar o descartar, los nodos que quedaron fuera de la vigente y del borrador **terminan a sus ocupantes vigentes** (`motivo_fin` = «puesto eliminado» / «borrador descartado») y **liberan la clave** (`stock~1a2b3c4d`), para que un puesto nuevo con la misma clave no herede el historial.

**Personas en pantalla** (`src/lib/organigrama/datos.ts`): el id lleva el origen — `p:<legajo>`, `u:<usuario>`, `e:<externo de cuadrilla>` (solo en las cuadrillas, no se asigna a mano), `x:<nombre libre>`. Los nombres de Legajos vienen en mayúsculas y se muestran como nombre propio.

## 5. Cómo se guarda (optimista)

`src/components/organigrama/proveedor.tsx` mantiene el estado que se ve y lo cambia **al instante** (las animaciones del Lienzo no esperan a la red). Cada acción calcula la **diferencia** contra lo último que se mandó (`operacionesPara`) y la encola; las RPC corren de a una, en orden. Así **deshacer/rehacer** del Lienzo —que restaura una foto— se guarda como la operación inversa sin que ninguna pantalla sepa de la base. Publicar es la única operación explícita (lleva la nota).

- Si una RPC falla: toast con el mensaje, se descarta lo que seguía en la cola y se vuelve a leer la base, que pisa lo local.
- Lo que cambian otros editores entra al volver a leer (al volver a la pestaña, después de publicar o crear el borrador), **siempre que no haya nada pendiente**; una lectura pedida antes del último cambio local no se usa (se pide otra).
- Con cambios en viaje, el header muestra «Guardando…» y el navegador avisa antes de cerrar la pestaña.

## 6. Permisos

- `src/lib/auth/acceso.ts`: módulo `{ id: "organigrama", grupo: "Personal y flota", rutas: ["/organigrama"] }`. Sin API propia (no hace falta entrada en `APIS`).
- Menú: «Personal y Flota › Organigrama» → `/organigrama/lienzo`.
- En la pantalla, `puedeEditar` sale de `org_leer()` (la base confirma); mientras carga, de `usePuedeEditar("organigrama")`.
- **Recomendación**: «ver» a todos los perfiles; «editar» al dueño y a Administración/RRHH.

## 7. Código

- Lógica pura con tests (`node:test`): `src/lib/organigrama/{arbol,lienzo,layout,circuitos,datos}.ts` y `estructura-base.ts` (los 24 nodos). El layout Árbol y `areaLibre` se prueban en `layout-arbol.test.ts`. `datos-maqueta.ts` quedó **solo para los tests** (personas inventadas para ejercitar vacantes, bajas, interinos y sobrecarga).
- Datos: `src/hooks/use-organigrama.ts` (RPC) y el proveedor.
- Pantallas: `src/app/(dashboard)/organigrama/**` y `src/components/organigrama/**` (el Lienzo en `lienzo/`).
- `scripts/organigrama-estructura-sql.mts` genera el JSON que siembra la migración; `datos.test.ts` falla si se desincroniza con `estructura-base.ts`.
