# Módulo Habilitaciones

Gestión de los permisos y la documentación que hacen falta para poder armar una obra.

Reemplaza la planilla `Seguimiento de obras (DOCS TRACKER)`.

---

## Lo que este módulo REEMPLAZA

**Esto no se construye sobre terreno vacío.** Hoy conviven dos implementaciones parciales
en Supabase que quedan muertas con este diseño. Si no se retiran, van a existir dos
`/permisos` con datos distintos.

| Qué | Dónde | Qué hace hoy |
| --- | --- | --- |
| `/habilitaciones/page.tsx` | app | Lista OTs de Supabase; botón "Habilitar" que setea el booleano `habilitacion_aprobada` |
| `/permisos/page.tsx` + `use-permisos.ts` | app | CRUD contra `permisos_municipales` |
| `permisos_municipales` | Supabase (`fase3_schema.sql`) | Tabla con `estado_permiso` (en_tramite / aprobado / rechazado / vencido / en_renovacion), organismo, fechas, costo, responsable |
| `useOrdenesPendientesHabilitacion()` | `use-ordenes-trabajo.ts` | La cola actual: `requiere_habilitacion && !habilitacion_aprobada` |
| `ordenes_trabajo.requiere_habilitacion` / `.habilitacion_aprobada` | Supabase | El estado booleano que reemplaza `x_hab_*` |

**Plan de retiro:**

1. Construir el módulo nuevo contra Odoo.
2. Migrar las obras **activas** (§ Fuera de alcance).
3. Borrar las dos rutas, el hook `use-permisos.ts` y `useOrdenesPendientesHabilitacion()`.
4. Dejar `permisos_municipales` y las dos columnas booleanas en la base sin uso, y
   borrarlas en una migración posterior una vez verificado que nada las lee.

No dejar las pantallas viejas "por las dudas": dos colas de habilitación con datos
distintos es peor que ninguna.

Es el tercer desdoblamiento Supabase/Odoo del proyecto, después de `/planificacion` vs
`/tablero` y `/ordenes-trabajo`. Vale revisar si quedan más antes de seguir sumando
módulos.

---

## Contexto operativo

- **Usuaria única:** Agustina Munaretti (`am@andamiosbuenosaires.com.ar`, uid 63 en Odoo).
  No hay asignación, derivación ni bandeja compartida. `x_hab_responsable_id` se llena
  solo con ella — hoy ese campo está **vacío en las 400 OTs**, así que el módulo lo empieza
  a usar, no lo hereda.
- **Volumen:** ~68 obras nuevas por mes, unas **3 por día hábil**. Misma escala que la
  carga de partes. Es una cola de trabajo diaria, no un sistema documental.
- **Las obras entran solas:** al crearse la OT en Odoo aparece la habilitación. Agustina
  **no crea nada**; su primera acción es el triage.
- **Los botones sólo registran la gestión.** No redactan ni envían mails: ella manda el
  correo por fuera y marca acá que lo hizo. Lo que aporta el sistema es la **fecha**.
  Esta regla vale para *todos* los botones del módulo, incluido el pedido de modalidad al
  técnico (§ Candado).
- **Punto de partida real:** de las **48 OTs activas**, 31 tienen `x_hab_estado` vacío y
  36 están en etapa `a`. La cola arranca casi entera desde cero.

---

## Por qué no alcanza con mejorar la planilla

Medido sobre las 3427 filas del tracker:

**1. La planilla modela objetos; el trabajo son transiciones.** Una obra no "tiene
documentación": está esperando que el cliente diga qué pide, o esperando validación, o
vencida. Cada estado tiene una acción y un reclamo distintos. La planilla tiene dos
casillas (`Enviado`, `Aprobado`) para un proceso de cinco pasos.

**2. No hay fechas, así que no hay tiempo.** No se puede saber qué está trabado ni hace
cuánto, ni demostrarle a un cliente que se le reclamó. Las 297 obras sin modalidad de
permiso definida llevan una **mediana de 399 días** esperando respuesta interna; 169 de
ellas más de un año. Eso sólo se ve calculándolo desde afuera.

**3. Mezcla dos trámites distintos en una fila.** La documentación del cliente y el
permiso municipal avanzan por separado, se reclaman a personas distintas y sólo se
cruzan para decidir una cosa: si la obra se puede armar.

**4. El número de expediente no se guarda en ningún lado.** 115 obras se armaron
amparadas en un expediente cuyo identificador no está en la planilla ni en Odoo.

**5. La aprobación es global.** En una obra exigente el cliente aprueba 7 documentos y
observa 2. Con un solo tilde eso no se puede representar — y ese rebote es justamente lo
que hace que una habilitación tarde semanas.

---

## Dónde vive cada dato

**No todo va a Odoo.** El criterio no es "el ERP es la verdad", es **un dueño por dato**.
Los tres desdoblamientos del proyecto (planificación, OT, habilitaciones) no pasaron por
usar Supabase: pasaron porque el mismo hecho tenía dos dueños.

La pregunta para cada modelo es: **¿alguien lo lee desde Odoo?**

| Dato | Vive en | Por qué |
| --- | --- | --- |
| Estado y fechas de habilitación | **Odoo** (`x_hab_*`, ya existe) | El tablero lo lee; Comercial ve si se puede armar |
| Modalidad de permiso y número de expediente | **Odoo**, en `sale.order` | Decisión del cliente con peso legal: vive con el contrato y tiene que sobrevivir años |
| Requisitos (estado, motivo, adjuntos) | **Supabase** | Nadie los lee desde Odoo |
| Historial de gestiones | **Supabase** | Ídem |
| Notas de obra | **Supabase** | Ídem |
| Paquetes de requisitos | **Supabase** | Configuración de la app, no del ERP |
| Estado de sincronización y triage | **Supabase** (`hab_ots`) | Es plomería de la app |

### Por qué importa: latencia, no carga

**No es una discusión de volumen.** 3400 escrituras mensuales son ~113 por día: para
cualquier base eso no es nada, y usarlo como argumento invita a descartarlo.

El costo real es de **latencia por interacción**. `lib/odoo/client.ts` limita la
concurrencia porque Odoo Online la limita, y **cada llamada tarda ~800 ms** sin importar
cuántas haya. Marcar un requisito como aprobado contra Odoo le mete 800 ms a un clic que
debería ser instantáneo. En una obra exigente son 9 requisitos con varias transiciones
cada uno: la pantalla se vuelve pegajosa.

Contra Supabase esas escrituras son locales, optimistas y sin cola.

### Efecto colateral que juega a favor: el candado no depende de Supabase

Los tres campos que decide el candado —`x_permiso_modalidad`, `x_tramite_estado`,
`x_expediente_nro`— viven **todos en `sale.order`, en Odoo**. La documentación, que es lo
que vive en Supabase, **no bloquea nada**.

Así que el tablero nunca necesita a Supabase para decidir si una jornada se puede
confirmar. Si Supabase estuviera caído, la planificación sigue funcionando y sólo se
pierde la gestión documental. Eso es lo que hace defendible el reparto.

### Referencias a la OT y ciclo de vida

`odoo_ot_id` es una **referencia blanda**: no hay FK ni cascade contra Odoo.

- **OT cancelada** (`x_estado = 'cancelada'`): la habilitación sale de la cola y de los
  contadores, pero **los requisitos, notas y gestiones se conservan**. Es el registro de
  que se gestionó, y borrarlo destruye la evidencia de trabajo hecho.
- **OT borrada en Odoo**: las filas quedan huérfanas. El job de reconciliación las marca
  `huerfana` en vez de borrarlas, y se listan aparte. Borrar en cascada desde un sistema
  que no controlamos es la forma de perder datos sin enterarse.

---

## La derivación ya existe en Odoo — y la app no la puede pisar

Esta sección reemplaza a la regla de derivación que se había diseñado desde la app.
**Introspeccionado en Odoo 19: cuatro de los trece campos `x_hab_*` son computados,
`store=true` y `readonly`.**

```
x_hab_semaforo  ← compute(x_hab_estado, x_hab_vencimiento, x_estado)
x_hab_etapa     ← compute(x_hab_estado, x_hab_semaforo, x_hab_fecha_consulta, x_hab_fecha_envio)
x_hab_alerta    ← compute(x_hab_semaforo, x_fecha_programada, x_estado)
x_hab_dias      ← compute(x_hab_fecha_consulta, x_hab_fecha)
```

Esto es mejor que derivar desde Supabase y empujar: **el semáforo se recalcula en la
misma transacción que su input**, así que no puede quedar viejo respecto de él. Se cae
por completo el job de reconciliación del semáforo, y con él la clase entera de bugs
"el tablero muestra otra cosa que la ficha".

**`readonly` es de interfaz, no del ORM.** Probado contra Odoo 19: un write por RPC sobre
`x_hab_etapa` **se acepta y el valor queda**, hasta que cambia alguno de sus `depends` y
el compute lo pisa. O sea que escribir un derivado no da un error —da una mentira con
fecha de vencimiento, que es peor—. La disciplina de no tocarlos no la impone Odoo: la
impone que `escribirInputs()` sea la única puerta de escritura del módulo hacia la OT.

Las seis transiciones están verificadas contra Odoo real
(`triage no aplica → f/gris`, `consulta → b/rojo`, `envío → c/amarillo`,
`aprobado → d/verde`, `vencimiento pasado → e/vencida`, `sin consulta → a/rojo`).

### Los cuatro inputs que sí escribe la app

| Momento en el módulo | Escribe |
| --- | --- |
| Triage "aplica" | `x_hab_estado = 'pendiente'` + `x_hab_responsable_id = Agustina` |
| Triage "no aplica" | `x_hab_estado = 'no_aplica'` → etapa `f`, semáforo `gris` |
| Se consultan los requisitos al cliente | `x_hab_fecha_consulta` → etapa `b`, arranca `x_hab_dias` |
| Primer requisito pasa a `enviado` | `x_hab_fecha_envio` → etapa `c` |
| Se aprueba el último requisito | `x_hab_estado = 'habilitada'` + `x_hab_fecha` → etapa `d` |
| Se carga el vencimiento | `x_hab_vencimiento` → dispara `vencida` sola al pasar la fecha |

**La etapa se maneja por fechas, no por conteo de requisitos.** El compute de Odoo lee
`x_hab_fecha_consulta` y `x_hab_fecha_envio`, no sabe cuántos requisitos hay. Etapa `a`
significa "sin fecha de consulta", no "sin requisitos cargados". Es una diferencia real:
si Agustina carga requisitos sin marcar la consulta, la obra se queda en `a`. Por eso
**crear los requisitos y escribir `x_hab_fecha_consulta` tiene que ser una sola acción.**

### Valores reales, introspeccionados

`x_hab_estado` (escribible): `pendiente` · `en_curso` · `habilitada` · `no_aplica`.
Hoy 31 de 48 OTs activas lo tienen **vacío**; el compute trata el vacío como `pendiente`.

`x_hab_etapa` (computado, 6 valores):

| Valor | Etiqueta en Odoo | Compute de Odoo |
| --- | --- | --- |
| `a` | 1. FALTA CONSULTAR REQUISITOS AL CLIENTE | sin `x_hab_fecha_consulta` |
| `b` | 2. ESPERANDO REQUISITOS DEL CLIENTE | con `x_hab_fecha_consulta` |
| `c` | 3. DOCUMENTACION ENVIADA - ESPERANDO VALIDACION | con `x_hab_fecha_envio` |
| `d` | 4. HABILITADA | `x_hab_estado = 'habilitada'` |
| `e` | HABILITACION VENCIDA - RENOVAR | semáforo `vencida` |
| `f` | NO APLICA | `x_hab_estado = 'no_aplica'` |

`x_hab_semaforo` (computado): `rojo` · `amarillo` · `verde` · `vencida` · `gris`.

`x_hab_alerta` (computado): `ok` · `proxima` (programada sin habilitar) · `critica`
(faltan 3 días o menos) · `atrasada` (fecha pasada sin habilitar) · `vencida`.
Hoy sobre las 48 activas: 35 `ok`, 9 `critica`, 4 `proxima`.

**`ordenes.ts` sólo filtra por `critica` y `proxima`**: `atrasada` y `vencida` existen y
no se usan en ningún lado. La bandeja las incorpora (§ Pantalla 1).

`x_hab_requisitos` (text libre, escribible) queda **obsoleto**: lo reemplaza la tabla
`hab_requisitos` en Supabase. No se borra el campo, se deja de escribir.

### Qué queda de la sincronización

Los cuatro inputs se escriben a Odoo en background con el patrón de
`sincronizarFechaProgramada()` (`lib/odoo/asignaciones.ts`): va en `after()`, fuera del
camino crítico, porque la UI es optimista. Son **4 a 6 escrituras por obra**, no una por
transición de requisito.

**Sigue pudiendo fallar en silencio**, y por eso hace falta la tabla `hab_ots`:

1. **Marca local.** `sync_estado` (`pendiente` / `sincronizado` / `error`) + `sync_error` +
   `sync_intentos`, igual que el patrón `odoo_sync_estado` del push de adicionales.
2. **Job de reconciliación.** Recalcula los cuatro inputs desde los requisitos y repara
   Odoo donde difiera. Idempotente. Ya no tiene que tocar el semáforo, sólo los inputs.
3. **Visibilidad.** Contador de OTs desincronizadas en la bandeja, con acción de reintento.
   Si nadie puede ver que hay 12 en error, el job no alcanza.

**`x_hab_estado` sí es editable en Odoo a mano**, a diferencia de los computados. Si
alguien lo cambia ahí, la próxima reconciliación lo pisa. Un dueño, una dirección.

---

## Modelo de datos

### Lo que falta y hay que crear

**Nada de permiso municipal existe en Odoo.** Verificado en `x_aba_orden_trabajo`,
`x_aba_obra` y `sale.order`: cero campos de permiso, expediente o gestoría.

#### a) Permiso — en `sale.order`, no en la OT

El permiso es municipal, por dirección/estructura. El armado y el desarme de la misma
obra **comparten el permiso**, así que va en la venta y no en cada OT.

Pero el motivo más fuerte es que **es el único join que existe**: `x_obra_id` está vacío
en las 1003 OTs y `x_order_id` está al 100%.

Verificado que una venta no cubre más de una dirección: de **567 ventas con OTs**, 436
tienen exactamente 2 (armado + desarme) y 131 tienen una. Cruzando las direcciones del
nombre de cada OT, **hay un solo caso** con direcciones aparentemente distintas
(`S00249`), y es la misma dirección con el rango de numeración escrito de dos formas. No
hay contraejemplos: el permiso por venta no tiene caso de borde.

```
x_permiso_modalidad   selection  sin_permiso | con_expediente | esperar_permiso | (vacío = sin definir)
x_permiso_definida    date       cuándo el técnico definió la modalidad
x_tramite_estado      selection  no_presentado | presentado | emitido
x_expediente_nro      char       número de expediente
x_expediente_fecha    date       fecha de presentación
x_permiso_fecha       date       fecha de emisión
x_permiso_doc_ids     many2many  ir.attachment
```

`x_permiso_modalidad` es **decisión del cliente**; la transmite el técnico de la obra.
`x_tramite_estado` es gestión de ABA y avanza sola.

**Quién es el técnico — corregido.** El campo `x_tecnico` **no está en `sale.order`**:
está en `x_aba_orden_trabajo`, es un `char` de dos letras (`GS` / `JS` / `JR`) y está
cargado en 399 de 400 OTs. Un char no rutea a nadie.

`sale.order` sí tiene **`x_studio_tcnico`**, many2one a `hr.employee`, cargado en 362 de
400 ventas, con los nombres completos (Jorge Riveros, Gabriel Stepansky, Joaquin
Stepansky). **Ése es el campo a usar** para el pedido de modalidad: llega a una persona.
`x_tecnico` de la OT queda como respaldo para las ventas sin `x_studio_tcnico` cargado.

#### b) Requisitos — tabla `hab_requisitos` (Supabase)

```sql
create table hab_requisitos (
  id            uuid primary key default gen_random_uuid(),
  odoo_ot_id    bigint not null,                  -- referencia blanda, sin FK
  nombre        text   not null,                  -- "Nómina ART", "Seguro de caución"
  estado        text   not null default 'pendiente'
                check (estado in ('pendiente','enviado','observado','aprobado')),
  fecha_envio       date,
  fecha_resolucion  date,                         -- cuándo se aprobó u observó
  motivo_obs        text,                         -- por qué lo rebotaron
  origen        text not null default 'manual'
                check (origen in ('paquete','manual')),
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on hab_requisitos (odoo_ot_id);
```

**`estado` va como `text` + `check`, no como enum.** El resto del esquema usa enums
(`estado_permiso`, `tipo_incidente`), pero éste es el más probable de crecer: ya se ven
candidatos como `no_aplica` o `vencido`. Alterar un enum en Postgres es doloroso; mover un
check constraint es una línea.

**`observado` es el estado clave** y el que hoy no existe. Con el motivo al lado, Agustina
sabe qué corregir sin volver a leer el mail.

#### c) Notas — tabla `hab_notas` (Supabase)

```sql
create table hab_notas (
  id          uuid primary key default gen_random_uuid(),
  odoo_ot_id  bigint not null,
  texto       text   not null,
  fijada      boolean not null default false,
  autor_id    uuid   not null references user_profiles(id),
  created_at  timestamptz not null default now()
);
create index on hab_notas (odoo_ot_id);
```

#### d) Historial — tabla `hab_gestiones` (Supabase)

```sql
create table hab_gestiones (
  id          uuid primary key default gen_random_uuid(),
  odoo_ot_id  bigint not null,
  tipo        text   not null
              check (tipo in ('triage','consulta','reclamo','envio','aprobacion',
                              'observacion','permiso','renovacion','excepcion')),
  detalle     text,
  autor_id    uuid   not null references user_profiles(id),
  created_at  timestamptz not null default now()
);
create index on hab_gestiones (odoo_ot_id, created_at desc);
```

**Append-only, y la restricción vive en la base.** RLS con política de `select` e
`insert`, y **sin política de `update` ni `delete`**. Si el valor del módulo es poder
demostrar que se reclamó tres veces desde el 4 de agosto, ese registro no puede depender
de que la UI se porte bien. Una gestión mal cargada se corrige agregando otra.

#### e) Estado por OT — tabla `hab_ots` (Supabase)

Una fila por habilitación. **No existía en el diseño anterior**, y sin ella el estado de
sincronización no tiene dónde vivir: las otras tres tablas cuelgan de `odoo_ot_id` y la OT
está en Odoo.

```sql
create table hab_ots (
  odoo_ot_id     bigint primary key,
  triage         text check (triage in ('aplica','no_aplica')),   -- null = recién llegada
  triage_fecha   timestamptz,
  triage_autor   uuid references user_profiles(id),
  sync_estado    text not null default 'pendiente'
                 check (sync_estado in ('pendiente','sincronizado','error','huerfana')),
  sync_error     text,
  sync_intentos  integer not null default 0,
  sync_fecha     timestamptz,
  created_at     timestamptz not null default now()
);
```

Resuelve dos cosas de una. La segunda es la que importa en el uso diario: **hace que el
triage sea optimista.** Si "aplica / no aplica" escribiera sólo en Odoo, resolver 4 obras
de un clic serían 4 RPCs de 800 ms — exactamente la latencia que este reparto existe para
evitar, y en la acción más frecuente del módulo.

#### f) Paquetes de requisitos — tabla `hab_paquetes` (Supabase)

Tabla de configuración editable desde la app: `id`, `nombre`, `requisitos text[]`,
`orden`, `activo`. Cuatro presets iniciales, derivados de las combinaciones reales del
tracker (1364 obras desde 2025):

| Paquete | Incluye | Cubre |
| --- | --- | --- |
| Básico | Nómina ART | **82%** de las obras |
| + No repetición | Básico + Cláusula de no repetición | +2% |
| + SVO | anterior + SVO + Aviso de obra | +3% |
| Completo | anterior + P.S 319/99 + E.P.P + Capacitaciones + 931 | +1% |

El resto se arma a medida. **El paquete es un punto de partida, no una jaula:** una vez
aplicado, los requisitos se agregan y se quitan uno por uno.

#### g) Adjuntos — bucket privado nuevo

Los archivos de requisitos van a **Supabase Storage**, con prefijo
`habilitaciones/{odoo_ot_id}/{requisito_id}/`. No a `ir.attachment`: los seis PDFs de
capacitaciones de una obra no tienen por qué vivir en el ERP.

**Hay que crear el bucket.** El proyecto no tiene ninguno reutilizable: la única migración
de storage es `20260331000014_storage_logo.sql` y `supabase/config.toml` no declara
buckets. Hace falta un bucket **privado** con sus políticas de RLS — es alcance del módulo,
no algo que ya esté.

Los documentos del permiso son la excepción y se quedan en `ir.attachment`
(`x_permiso_doc_ids`): son parte del contrato y tienen que sobrevivir con la venta.

---

## Pantalla 1 — Bandeja · `/habilitaciones`

Agrupada por **acción pendiente**, ordenada por qué se cae primero. Sin buscador ni
paginado: con 19 en trámite no hay que encontrar nada.

```
Habilitaciones
Las obras entran solas al crearse la OT en Odoo · 19 en trámite

▸ Recién llegadas — definir si aplica · 4     [marcar todas: aplica / no aplica]
▸ Se arman en 3 días o menos y no están listas · 9     ← fondo --bg-danger
▸ Fecha pasada y siguen sin habilitar · 2              ← fondo --bg-danger
▸ Esperando respuesta del cliente · 7
▸ Documentación enviada, esperando validación · 4
▸ Vencen en menos de 30 días · 3
```

**Cuatro de los seis grupos ya están calculados en Odoo.** No hay que derivarlos:

| Grupo | Se saca de |
| --- | --- |
| Recién llegadas | `hab_ots.triage is null` |
| Se arman en 3 días o menos | `x_hab_alerta = 'critica'` (hoy 9) |
| Fecha pasada sin habilitar | `x_hab_alerta = 'atrasada'` |
| Esperando respuesta del cliente | `x_hab_etapa = 'b'` |
| Documentación enviada | `x_hab_etapa = 'c'` |
| Vencen en menos de 30 días | `x_hab_vencimiento` entre hoy y hoy+30 |

Cada fila: obra, contexto en una línea, **antigüedad** (`x_hab_dias`, ya computado) y la
acción principal al lado.

**Los grupos son excluyentes.** Una obra que se arma en 2 días y además espera al cliente
califica para dos, así que se asigna por **prioridad descendente** en el orden de arriba:
cae en el primero que cumple y no aparece dos veces. Los contadores tienen que sumar el
total en trámite. Si una obra aparece duplicada, los números dejan de servir para decidir
por dónde empezar.

- **No hay botón "Nueva obra".** Las habilitaciones nacen con la OT.
- **Triage por lote.** Con ~68 entradas por mes, si el triage no es de un clic la bandeja
  se llena de ruido y deja de significar algo — que es exactamente lo que le pasó a la
  planilla. Selección múltiple + "aplica / no aplica" para todas. Escribe en `hab_ots`
  al instante y sincroniza `x_hab_estado` en background.
- **La decisión del triage es de Agustina**, sin regla automática por ahora.
  "No aplica" → `x_hab_estado = 'no_aplica'` → etapa `f` y semáforo `gris` por compute de
  Odoo, y sale de la cola.
- **"Aplica" crea directamente el paquete Básico** (Nómina ART) sin pasar por el selector
  de paquetes, y escribe `x_hab_fecha_consulta` en el mismo gesto —si no, la obra se queda
  en etapa `a` con requisitos cargados—. Cubre el **82%** de las obras: para esas, el
  trabajo entero de configurar requisitos es un clic. El listado de requisitos es
  maquinaria para el 18% restante —y ahí se justifica de sobra— pero **el caso común no
  debe tocarlo**. Cambiar el paquete o agregar requisitos queda en la ficha.
- **La antigüedad se muestra siempre**, en rojo cuando pasa el umbral del grupo.
- **La espera interna se ve igual que la externa:** "31 d · esperando a JR" al lado de
  "14 d · esperando al cliente". Los 399 días de mediana existen porque nadie los veía.
- **Contador de desincronizadas**, si hay alguna, con acción de reintento.

---

## Pantalla 2 — Ficha · `/habilitaciones/[otId]`

### Veredicto, arriba de todo

Una línea que responde lo único que le importa a Operaciones:

```
✕  No se puede armar · programada para mañana
   Falta la respuesta del cliente sobre requisitos y la modalidad de permiso
```

Se calcula cruzando los dos trámites. Es lo que alimenta el candado (§ Candado).

### Los dos trámites, en columnas

Van en paralelo porque avanzan por separado y se reclaman a **tres interlocutores
distintos**: el cliente, el técnico y el gobierno.

**Izquierda — documentación del cliente.** Las 4 etapas con su fecha:
requisitos consultados → esperando al cliente → documentación enviada → validada.
Son `x_hab_etapa` `a`→`d`; `e` (vencida) y `f` (no aplica) son terminales y se muestran
como estado, no como paso. Debajo, el selector de paquete y el listado de requisitos
(§ Pantalla 3). Botón: `Reclamar al cliente · 3er reclamo`.

**Derecha — permiso municipal.** Arriba la **decisión del cliente** (3 opciones,
excluyentes); si está sin definir, muestra hace cuántos días y a qué técnico se espera
(`sale.order.x_studio_tcnico`). Debajo el **trámite de ABA**: presentado → expediente Nº →
emitido, con fechas. Botón: `Registrar pedido de modalidad a Jorge Riveros`.

### Historial

Lista cronológica de `hab_gestiones`, con fecha y autor. Sólo lectura.

---

## Pantalla 3 — Requisitos y notas

Parte de la ficha. Es lo que hace usable una obra exigente.

### Listado de requisitos

Una fila por requisito, con **estado propio**:

| Estado | Ícono | Muestra |
| --- | --- | --- |
| Aprobado | check verde | fecha, cantidad de archivos |
| Observado | alerta roja, fila `--bg-danger` | **el motivo escrito**, acción "Corregir" |
| Enviado | reloj ámbar | fecha, días sin respuesta |
| Por preparar | círculo punteado | si fue agregado a mano, la fecha |

- `+ Agregar requisito`: nombre libre. Queda como cualquier otro.
- Se pueden quitar los que el cliente no pide.
- **Los archivos cuelgan del requisito, no de la obra.** Si observan las capacitaciones,
  se sabe exactamente qué reemplazar.
- Contador en el encabezado: `9 requisitos · 5 aprobados`.
- El **primer** requisito que pasa a `enviado` escribe `x_hab_fecha_envio` (etapa `c`);
  aprobar el **último** pendiente escribe `x_hab_estado = 'habilitada'` y `x_hab_fecha`
  (etapa `d`). Son los dos únicos puntos donde el listado toca Odoo.

### Notas de la obra

Lista con texto, autor y fecha. Las **fijadas** van arriba, con ícono ámbar.

Son cosas como "el administrador sólo atiende martes y jueves" o "la nómina la piden con
foto carnet de cada operario, si falta una rebotan todo el paquete". Hoy eso vive en la
cabeza de Agustina y en su casilla de mail: si está de licencia, se pierde.

**Las notas son de la obra, no de Agustina.** Deben verse también desde la ficha de la
OT y desde el panel del tablero, no encerradas en este módulo.

---

## Candado: dónde bloquea y dónde no

Hay **tres situaciones de permiso** que tienen que frenar al confirmar, no una. Un
candado que sólo mira `esperar_permiso` deja pasar justamente los dos agujeros que este
módulo existe para tapar.

| Situación | Al confirmar | Por qué |
| --- | --- | --- |
| `esperar_permiso` y trámite no emitido | **Bloqueo** con salida por excepción | El cliente dijo explícitamente que no quería armar sin permiso |
| **Modalidad sin definir** | **Un clic que registra el pedido al técnico** (ver abajo) | Son 297 obras con mediana de **399 días** esperando respuesta |
| **`con_expediente` sin `x_expediente_nro` cargado** | **Motivo escrito obligatorio** | Son 115 obras armadas amparadas en un expediente cuyo número no está en ningún lado. Si el campo existe pero confirmar no lo exige, en un año medimos lo mismo |
| Todo lo demás | Sin fricción | |

### La fricción tiene que caer en quien puede resolverla

**Modalidad sin definir: no se pide motivo escrito.** Quien confirma es Operaciones, y
Operaciones **no puede** definir la modalidad — sólo pueden JR, GS o JS. Pedirle un texto
por algo que no está en su mano lo entrena a escribir "no sé" o un punto, que es el mismo
"candado que estorba se rompe" aplicado a la fricción blanda.

En su lugar, el diálogo dice:

> Esta obra no tiene modalidad de permiso definida hace **47 días**.
> Confirmar deja registrado el pedido a **Jorge Riveros**; Agustina lo ve en su bandeja.
> [ Cancelar ]  [ Confirmar y registrar el pedido ]

**El texto dice lo que el sistema hace, no más.** Los botones sólo registran: no se manda
ningún mail ni notificación, y el técnico no entra a este módulo. Prometer "le manda el
pedido a JR" sería mentirle a Operaciones sobre algo que nadie va a recibir. Si más
adelante se define un canal real, se cambia el texto (§ Fuera de alcance).

**Deduplicado.** Un bloque de 4 jornadas confirmadas no genera 4 `consulta` idénticas: si
ya hay una para esa venta de menos de 7 días, no se crea otra. Si es más vieja, se crea y
se cuenta —`2º pedido a JR`, igual que el reclamo al cliente—, que además es el dato que
después se quiere mostrar.

**`con_expediente` sin número sí lleva motivo escrito.** Ahí el dato lo tiene Agustina, es
nuestro, y quien confirma puede conseguirlo. Queda como gestión de tipo `excepcion`.

**Medición:** de las 48 OTs activas, 9 (**19%**) caerían hoy en "modalidad sin definir"
—2 explícitas y 7 sin registro en el tracker—. Por debajo del 30% que haría de esto un
peaje. Conviene volver a medirlo cuando confirmar esté en uso real: en el último mes hubo
sólo 7 jornadas confirmadas, muestra insuficiente para concluir nada.

| Momento | Comportamiento |
| --- | --- |
| Arrastrar la obra al tablero | **Permitido**, con candado visible en la tarjeta |
| **Confirmar la jornada** | Según la tabla de arriba |
| Cargar el parte | **Nunca bloqueado** |

**Por qué en confirmar y no en planificar.** Planificar es un borrador: poner una obra
tentativa para la semana que viene sabiendo que el permiso sale en tres días es legítimo.
Bloquear ahí frena a Operaciones por un dato que depende de terceros, y la reacción va a
ser buscarle la vuelta — marcar mal la modalidad, planificar en otro lado. Un candado que
estorba se rompe.

Confirmar ya significa algo preciso en el sistema (`cierre.ts`): *"es el momento en que
la fecha se le promete al cliente y la cuadrilla queda tomada"*. Ahí sí corresponde
preguntar si el permiso está.

**Cargar el parte nunca se bloquea.** Si la cuadrilla fue igual, se registra igual. Un
sistema que no deja anotar lo que pasó garantiza datos falsos.

### Con salida, no muro

El bloqueo se saltea con **"Confirmar de todas formas"**, exigiendo un motivo escrito.
Queda como fila de `hab_gestiones` de tipo `excepcion`, con autor y fecha, visible en la
ficha.

Esto no debilita el candado: lo hace útil. Sin salida, alguien va a cambiar la modalidad
a `sin_permiso` para poder confirmar, y se pierde el dato **y** el rastro. Con salida,
cada excepción queda registrada.

### La documentación no bloquea

Sigue siendo advertencia, como hoy. No es inconsistencia: la documentación es papelería
nuestra que se resuelve en el día; la modalidad de permiso es una **instrucción del
cliente sobre cómo asumir un riesgo legal**, y saltearla no es un atraso administrativo.

Lo que sí: las OTs con `x_hab_alerta = 'critica'` (hoy 9) llevan franja roja en el
tablero. Visible en las dos pantallas, bloqueante en ninguna.

---

## Criterios de aceptación

1. Crear una OT en Odoo hace aparecer la obra en `Recién llegadas` sin intervención.
2. Marcar "no aplica" la saca de la cola y deja `x_hab_estado = 'no_aplica'`; Odoo computa
   etapa `f` y semáforo `gris` sin que la app los escriba.
3. El triage acepta selección múltiple y resuelve varias obras de un clic, sin esperar a
   Odoo (escribe `hab_ots` y sincroniza en background).
4. Cada fila de la bandeja muestra la antigüedad, y en rojo cuando pasa el umbral.
5. Aplicar el paquete "Completo" crea sus requisitos como registros editables; agregar
   uno a mano queda indistinguible del resto salvo por `origen`.
6. Un requisito se puede marcar `observado` con motivo, y la fila se ve en rojo con el
   motivo sin abrir nada.
7. Los adjuntos se suben contra un requisito, no contra la obra, a un bucket privado.
8. `Reclamar` no abre ningún cliente de correo: crea una gestión con fecha y autor, y el
   contador de reclamos sube.
9. El historial es append-only: no hay política de `update` ni `delete` en RLS sobre
   `hab_gestiones`, y tampoco forma de editarlo desde la UI.
10. Una OT con modalidad `esperar_permiso` y trámite no emitido **no se puede confirmar**
    en el tablero, pero **sí se puede arrastrar** y **sí se le puede cargar el parte**.
11. "Confirmar de todas formas" exige motivo y deja una gestión de tipo `excepcion`.
12. El número de expediente se guarda y se ve en la ficha y en la OT.
13. Las notas fijadas de una obra se ven desde el panel del tablero.
14. Confirmar con `con_expediente` y sin número de expediente **exige un motivo escrito** y
    deja una gestión de tipo `excepcion`.
15. Confirmar con modalidad sin definir **no pide texto**: muestra los días de espera y el
    técnico de `x_studio_tcnico`, y con un clic crea la gestión de tipo `consulta`. Una
    segunda confirmación dentro de los 7 días **no** crea una gestión nueva.
16. Marcar "aplica" crea la Nómina ART, escribe `x_hab_fecha_consulta` y no abre ningún
    selector; la OT queda en etapa `b`, no en `a`.
17. Aprobar el último requisito pendiente escribe `x_hab_estado = 'habilitada'` y
    `x_hab_fecha`, y la OT queda en etapa `d` y semáforo verde sin ninguna acción extra.
18. La app **nunca escribe** `x_hab_etapa`, `x_hab_semaforo`, `x_hab_alerta` ni
    `x_hab_dias`. Odoo no lo impide —el write se acepta y persiste hasta el próximo
    recálculo—, así que la garantía es de código: `escribirInputs()` es la única
    escritura del módulo sobre la OT.
19. Los contadores de la bandeja suman el total en trámite: ninguna obra aparece en dos
    grupos.
20. Si el push a Odoo falla, la OT queda en `hab_ots.sync_estado = 'error'`, se ve en el
    contador de desincronizadas y el job de reconciliación la repara.
21. Cancelar una OT en Odoo la saca de la cola pero **conserva** sus requisitos, notas y
    gestiones.
22. Las rutas `/permisos` y la vieja `/habilitaciones` ya no existen, y nada en el
    proyecto lee `permisos_municipales` ni `ordenes_trabajo.habilitacion_aprobada`.
23. El build y el lint del proyecto pasan sin warnings nuevos.

---

## Orden de construcción

Este es el **cuarto módulo abierto** (tablero v4, partes, OT). Habilitaciones es de otra
área y no bloquea a Operaciones hoy. Recomendación: diseñarlo ahora —está diseñado— y
construirlo **después de que partes esté andando**.

Excepción, y conviene hacerla ya: **crear los campos de permiso y expediente en
`sale.order`**. Cada obra que se arma con expediente sin guardar el número es un dato que
se pierde para siempre, y son 115 en el histórico. Es un script de campos, como el de
firmeza: `scripts/odoo-add-permiso-sale-order.mjs`.

---

## Fuera de alcance

**Migración del tracker: se migran SÓLO las obras activas.** El histórico no entra, ni
siquiera marcado como "sin dato". El módulo se apoya en que 19 filas no necesitan
buscador ni paginado; meterle 3400 filas le saca lo único que lo hace distinto de la
planilla. La planilla queda congelada como archivo consultable.

**Regla automática de triage.** Por ahora lo decide Agustina mirando. Si más adelante
aparece una regla (tipo de obra, vía pública, cliente), el sistema propone y ella
confirma, y la bandeja de entrada casi se vacía sola.

**Redacción y envío de mails.** Los botones sólo registran. Ni el reclamo al cliente ni el
pedido de modalidad al técnico mandan nada: son fechas, no mensajes. Si más adelante se
quiere un canal real —mail al técnico, actividad de Odoo, notificación en la app— hay que
definirlo, y recién ahí cambia el texto del diálogo del candado.

**Vencimiento y renovación automática.** El módulo avisa 30 días antes; qué hace la
renovación —clonar los requisitos, re-enviar todo— hay que definirlo con ella viendo un
caso real.

**Los valores `atrasada` y `vencida` de `x_hab_alerta` en el tablero.** La bandeja los usa;
si el tablero también tiene que distinguirlos (hoy sólo mira `critica` y `proxima`), es un
cambio en `lib/tablero/colores.ts` que se decide aparte.
