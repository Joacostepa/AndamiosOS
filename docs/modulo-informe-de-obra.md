# Módulo Informe de Obra (cierre)

Informe que se genera al cerrarse una obra y consolida todo su ciclo: lo estimado contra
lo real, el costo, las jornadas, las incidencias y los huecos de registro.

**Se llama "informe de obra", no "parte de cierre".** El proyecto ya usa "parte" para dos
cosas distintas: `/partes` son los partes diarios, y `cierre.ts` / `formulario-cierre.tsx`
en el tablero son el cierre de una jornada. Un tercer "parte de cierre" sería la tercera
cosa compartiendo las mismas dos palabras, y el nombre termina metido en tablas y rutas.
Tabla: `informes_obra`. Rutas: `/informes-obra` y `/informes-obra/[saleOrderId]`.

> **Todos los números de este documento salen de las ventas CONFIRMADAS**
> (`state in ('sale','done')`): 840 de 2291. Una cotización en borrador no tiene obra que
> analizar. Medido sobre el total de `sale.order` los porcentajes son otros — aclararlo
> evita que alguien reproduzca las cifras y llegue a un resultado distinto.
>
> Los conteos son del 19/08/2026 y **se mueven todos los días**: las obras se siguen
> cerrando. Están para dimensionar, no para testear.

**Es el último eslabón del circuito.** Hoy lo que pasa en obra alimenta el costo y el
margen, pero nunca vuelve a la cotización. Este informe es el que cierra ese lazo.

---

## Qué es y qué no

**Es un informe de control, no un resumen.** Un informe de obra que sólo lista lo que
pasó no lo lee nadie dos veces. Arranca por lo que salió distinto de lo previsto, sigue
por los huecos de registro y termina en qué usar para cotizar. Todo lo demás es contexto.

**Es interno.** El informe muestra desvíos de estimación y márgenes: no es para el
cliente. Un informe de entrega al cliente —fotos, fechas, constancia— es otro documento y
queda fuera de alcance.

---

## Disparador

Se genera cuando la venta cumple **las dos condiciones**:

```
x_studio_estado_de_obra = 'Desarmado'
AND trim(x_studio_tipo_de_contrato) = 'Obra'
```

**Cuidado con el valor del tipo de contrato:** en Odoo la opción es `'Obra '`, **con un
espacio al final**. Comparar contra `'Obra'` no matchea ninguna de las 611. Normalizar
siempre con `trim`.

### Qué queda afuera, y por qué

| Tipo de contrato | Confirmadas | Sobre 2291 totales | Trato |
| --- | --- | --- | --- |
| Obra | 611 (73%) | 1983 | Genera informe |
| **Simple** | 160 (19%) | 237 | **Otra unidad de negocio. No genera nada, ni aparece como pendiente** |
| **Alquiler Sin Montaje** | 69 (8%) | 69 | **No hay obra que analizar** |

Sobre las ~313 ventas confirmadas hoy en `Desarmado`, quedan **~278 de tipo Obra**.

### Reapertura

Si la obra vuelve de `Desarmado` a `Armado` (una ampliación, un error), el informe
existente **se conserva** marcado como reabierto, y al cerrarse otra vez se genera una
versión nueva. No se borra: es el registro de lo que se sabía en ese momento.

---

## Dos formatos según el costeo

`x_estado_costeo` ya está calculado en Odoo y dice si la obra está bien costeada.

Tiene **7 valores**, no 4. Los tres que hoy no aparecen en obras desarmadas igual son
alcanzables, y cada uno necesita su mensaje:

| Estado de costeo | Hoy | Formato y mensaje |
| --- | --- | --- |
| `completo` | ~252 | Informe completo |
| `sin_ot` | ~16 | Corto: "sin ninguna OT registrada; el margen no es real" |
| `falta_armado` | ~6 | Corto: "falta la OT de armado; el costo está incompleto" |
| `falta_desarme` | ~6 | Corto: "falta la OT de desarme" |
| `sin_mo` | 0 | Corto: **"hay OTs pero ningún parte con horas-hombre; sólo se computaron fletes"** — es un caso distinto de `sin_ot` y necesita su propio texto |
| `pendiente` | 0 | No debería darse en `Desarmado`. Si aparece, informe corto señalando la contradicción de estado |
| `no_aplica` | 0 | Alquiler sin montaje: ya queda afuera por el filtro de tipo de contrato |

**Ningún valor cae en un `else` mudo.** Si aparece uno no contemplado, el informe lo dice
en vez de no decir nada.

**Las mal costeadas también generan informe.** Si sólo se generara para las costeadas,
esas ~28 desaparecen y nadie se entera de que existen. El informe corto dice qué falta:

> Esta obra se cerró **sin ninguna OT registrada**. No hay costo de mano de obra ni de
> fletes, así que el margen del 100% no es real. Facturado: $4.598.000.

Nada más. Es una alerta de una línea que convierte al módulo en detector de obras mal
cerradas — un problema que hoy no ve nadie y que suma **$183 millones facturados**.

---

## Cómo se dispara (mecanismo)

**Un cron diario, no un webhook.**

El proyecto ya tiene infraestructura de webhook (`base.automation` sobre
`x_aba_orden_trabajo` pegando a `/api/odoo/webhooks/...`), pero acá no conviene:

- El disparador es un cambio en `sale.order`, no en la OT: habría que crear otra
  automatización sobre un modelo que hoy no tiene ninguna.
- El informe no es urgente. Que aparezca a la mañana siguiente no cambia nada.
- Un webhook perdido deja la obra sin informe **para siempre y en silencio**. Un cron que
  barre es idempotente: lo que no se generó ayer se genera hoy.

### Infraestructura que hay que crear

**No hay `vercel.json` en el proyecto:** la entrada de cron se crea desde cero.

Y hay un problema concreto que va a romper en el primer write si no se contempla: **una
llamada de cron no trae cookies.** El patrón de rutas del proyecto usa el cliente de
Supabase con sesión, contra RLS que exige `authenticated`. El endpoint tiene que:

1. Validar un header contra `CRON_SECRET` y rechazar todo lo demás con 401.
2. Escribir con **service role**, no con el cliente de sesión.

Ese patrón ya existe en `/api/odoo/webhooks/*` y `/api/odoo/sync/*`: es reutilizar, no
inventar. Pero hay que hacerlo explícito o el cron corre, no falla visiblemente, y no
escribe nada.

```json
// vercel.json
{ "crons": [{ "path": "/api/informes-obra/generar", "schedule": "0 9 * * *" }] }
```

(`0 9 UTC` = 06:00 ART.)

```
Cron diario → /api/informes-obra/generar
  1. searchRead en sale.order:
       state in ('sale','done')
       AND x_studio_estado_de_obra = 'Desarmado'
       AND trim(x_studio_tipo_de_contrato) = 'Obra'
  2. Descarta las que ya tienen informe vigente (reabierta_en is null)
  3. Genera y guarda las que faltan
  4. Detecta reaperturas: informes vigentes cuya venta ya NO está en Desarmado
     → sella con reabierta_en
```

El backfill es **el mismo endpoint**, sin el paso 2. Una sola implementación.

**Lectura masiva, no por obra.** Cada RPC a Odoo Online tarda ~800 ms sin importar la
concurrencia. Resolver 278 obras de a una serían ~1400 llamadas: 18 minutos y riesgo de
429. Se traen las ventas y todas sus dependencias en ~6 `searchRead` con dominios `in`, y
los informes se arman en memoria.

**Generación manual** desde la pantalla, para regenerar después de corregir datos.

---

## Dónde se lee (pantallas)

Sin esto el módulo no lo ve nadie.

### 1. Lista · `/informes-obra`

Ítem en el sidebar. Una fila por informe, ordenada por fecha de cierre descendente:
dirección, cliente, venta, fecha de cierre, desvío de jornadas y de horas-hombre, y un
punto rojo si tiene inconsistencias.

Chips de filtro con contador, mismo patrón que `/ordenes-trabajo`:
`Todas` · `Con inconsistencias` · `Mal costeadas` · `Desvío > 50%`.

**Ruta propia y no `/obras/[saleOrderId]/informe`.** `/obras/[id]` es la pantalla legacy
de Supabase y su `[id]` es un UUID de la tabla `obras`; meter un entero de `sale.order` en
el mismo segmento dinámico son dos espacios de identificadores bajo el mismo parámetro. Y
`/obras` es candidata a retiro, como pasó con `/permisos`.

### 2. Informe · `/informes-obra/[saleOrderId]`

Las siete secciones descritas abajo. Selector de versión si hay más de una.

### 3. Enlace desde la OT

En la ficha de OT (`/ordenes-trabajo/[id]`), cuando la obra está cerrada: "Ver el informe
de esta obra". Es el camino natural desde donde alguien ya está mirando.

### Exportación

**Fuera de la v1.** El informe es interno y se lee en pantalla. El PDF corresponde cuando
se haga el informe de entrega al cliente, que es otro documento.

---

## Contenido del informe completo

### 1. Encabezado

Dirección, cliente, número de venta, período real (primera y última jornada), cantidad de
días, OTs y jornadas.

**No hay campo de dirección en `sale.order`:** sale de parsear el título de la OT con
`partesTitulo()` de `lib/tablero/titulo.ts`, como en el resto de la app.

### 2. Lo estimado contra lo real

**Esta sección es CONDICIONAL y hoy casi nunca se va a mostrar.** Ver la advertencia al
final del apartado antes de implementarla.

| Métrica | Fórmula |
| --- | --- |
| **Jornadas** | **visitas** ejecutadas contra `Σ x_duracion_est` de las OTs |
| **Horas-hombre** | `Σ x_horas_hombre` contra `Σ x_duracion_est × 5 personas × 8 h` |
| Duración | días entre la primera y la última visita |

### Se usa `x_duracion_est`, NUNCA `x_jornadas_num`

`x_jornadas_num` tiene fallback: su compute es
`float(x_duracion_est) if x_duracion_est else float(x_jornadas_estimadas or 0)`. Cuando no
hay estimación devuelve el `1` por default de la importación, y ese número **parece** una
estimación sin serlo.

**Si alguna OT de la obra no tiene `x_duracion_est`, la sección entera no se muestra.** No
se estima parcial, no se completa con el fallback, no se muestra un desvío "aproximado".

### Se cuentan VISITAS, no partes

Dos partes del mismo día son **una** visita: un traslado, una cuadrilla tomada un día.
Contar partes infla la comparación y arruina la métrica de ritmo de §7.

En S00116: **7 partes en 5 visitas**. El ritmo real es de 23 días entre visitas; contando
partes daría 15,3, que no corresponde a nada físico.

### La unidad: persona-horas, no persona-días

**No usar `x_jornadas_hombre_estimadas`.** Ese campo es `jornadas × personas`, o sea
persona-**días**. Compararlo contra `x_horas_hombre`, que son persona-**horas**, mete un
factor 8 de error.

El estimado en horas-hombre es `x_duracion_est × 5 × 8`. El 5 es la cuadrilla normal
(54,8% de 1300 líneas históricas, mediana 5); el 8 es la definición de la escala: las
etiquetas de `x_duracion_est` dicen literalmente `'0.50' → Media jornada - 4 h` y
`'1' → 1 jornada completa`.

**No calibrar el 8 contra la duración media real de una línea (4,9 h).** Que el promedio
ejecutado sea menor significa que la mayoría de las jornadas son parciales, que es justo
lo que las fracciones capturan. Calibrar mezclaría la unidad con su uso típico.

### ADVERTENCIA: hoy esta sección se muestra en ~1% de los informes

**997 de 1003 OTs no tienen `x_duracion_est`.** El campo recién pasó a ser obligatorio en
la vista de Comercial para las OTs de armado, así que se llena **de acá en adelante**.

Consecuencia: en el backfill de las ~278 obras históricas —incluida S00116— esta sección
**no aparece**. Va a empezar a poblarse con las obras que se cierren de ahora en más.

**Eso no invalida el módulo, pero sí invalida presentar §2 como su sección principal.** El
valor de los informes históricos está en la economía, la cronología, el detector de
inconsistencias y la sección para cotizar, que funcionan sin estimación. §2 es la que hace
que el módulo mejore con el tiempo, no la que lo justifica hoy.

Cuando no se muestra, en su lugar va una línea: *"Sin estimación previa: las OTs de esta
obra se crearon antes de que la duración estimada fuera obligatoria."*

### 3. Economía — en pesos Y en dólares

`x_facturado_neto`, `x_costo_mano_obra`, `x_costo_fletes`, `x_costo_operativo`,
`x_margen_contribucion`, `x_margen_pct`. Formato `es-AR`.

**Y la columna en dólares, que es la que se compara entre obras:**
`x_facturado_neto_usd`, `x_costo_operativo_usd`, `x_margen_usd`, `x_margen_pct_usd`, más
`x_aba_parte_diario.x_costo_total_usd` por jornada.

Odoo convierte **cada monto al CCL de su propia fecha**: las facturas al día de emisión y
los costos al día del parte diario. Con esta inflación, un costo por jornada de mayo y
otro de agosto no se pueden poner al lado en pesos; en dólares sí. Toda la sección §7
—que es la que justifica el informe— apoya sobre eso.

**El margen en USD no coincide con el de pesos, y eso es información.** Esa diferencia es
el efecto del tipo de cambio entre las fechas de facturación y las de ejecución. Medido
sobre las 278 obras: 0,7 puntos de diferencia media, con casos de hasta 8,3.

**Resultado sobre el histórico:** el costo por hora-hombre en dólares de 261 obras
promedia **USD 18,69**, con un rango de **13,27 a 31,35**. Ése es el número reusable para
cotizar, y ese rango de 2,4× es exactamente la pregunta que el módulo abre.

**Los campos económicos son computados y `store=true` en Odoo**, encadenados:
`x_margen_pct` depende de `x_margen_contribucion` y `x_facturado_neto`, que a su vez
depende de las facturas. **El módulo los LEE y nunca los escribe** — misma regla que con
`x_hab_*`. Escribir uno lo pisa hasta el próximo recálculo y deja el número inconsistente
con las facturas.

**Aclaración obligatoria al pie, no opcional:**

> El costo incluye sólo mano de obra y fletes. No incluye el material inmovilizado
> durante la obra, amortización ni gestoría. Es contribución, no rentabilidad.

En alquiler de andamios el material **es** el negocio. Si el informe dice "91,4% de
margen" sin esa aclaración, alguien va a cotizar la próxima con ese número en la cabeza.

### 4. Cronología de jornadas

Una fila por parte, ordenada por fecha: fecha, cuadrilla, tipo (armado/desarme con los
íconos del tablero), horas-hombre, viajes de flete, y la primera línea de las notas.

**Es la estructura por defecto**, porque es la que existe siempre.

### 5. Desglose por sector — sólo cuando aporta

`x_sector` **no es el sector de la obra**: es el tipo de estructura (PANTALLA, ESTRUCTURA,
TRIBUNA, TORRE, PLATAFORMA, APUNTALAMIENTO). Y **256 de 263 obras tienen un solo valor**.

Los sectores reales (tímpano este, vestíbulo oeste) viven en el **texto libre de las
notas** de cada parte, así que no hay campo del que sacarlos de forma confiable.

**Esta sección se muestra sólo si la obra tiene más de un valor de `x_sector`
NORMALIZADO** — son ~7 de 263. En el resto se omite entera, no se muestra vacía.

Los valores están sucios y contar distintos en crudo daría falsos positivos: conviven
`ESTRUCTURA`, `ESTRUCTURAS` y `ESTRUCTURA\nTABLONES` (con salto de línea adentro), además
de `Tribuna` / `TRIBUNA` y `Portico Chico`. Una obra con `ESTRUCTURA` y `ESTRUCTURAS`
dispararía la sección por dos valores que son el mismo.

Normalizar antes de contar: `trim`, mayúsculas, colapsar espacios y saltos de línea, y
singularizar el plural final. `normalizar()` de `lib/tablero/titulo.ts` **no alcanza**:
sólo hace NFD y minúsculas.

No parsear las notas para inventar sectores: sería una heurística frágil aplicada a un 3%
de los casos.

### 6. Incidencias y registro

Cantidad de incidencias, fotos y estado de habilitación.

Cuando no hay fotos, decirlo con su consecuencia: sin registro visual no hay constancia
del estado de entrega, que es lo primero que se pide ante un reclamo.

### 7. Para la próxima cotización

Es la sección que justifica el informe:

- **Costo real por visita y por hora-hombre** de esta obra
- **Ritmo real**: días promedio entre **visitas** (días distintos con parte), no entre
  partes. En S00116 son 23 días, con huecos de 41 y 44: la obra se acompasa al avance del
  cliente y no se ejecuta seguida. Contando partes daría 15,3 días, que no corresponde a
  ninguna realidad física
- **Dónde están los fletes**: cuántos viajes y en qué momento del ciclo
- **Tipo de estructura**, de `x_sector`

---

## Detección de inconsistencias

Lo que convierte el informe en algo que se lee dos veces. Cada chequeo produce una entrada
en `inconsistencias`:

| Chequeo | Cómo |
| --- | --- |
| Obra cerrada sin costear | `x_estado_costeo != 'completo'` |
| Jornadas asignadas sin parte | asignaciones del tablero sin parte cargado |
| Partes sin horas-hombre | `x_horas_hombre` en 0 o vacío (hoy hay 29) |
| Partes sin cuadrilla | `x_cuadrilla_id` vacío (hoy hay 35) |
| OT sin estimación | `x_duracion_est` vacío |
| Obra sin fotos | ningún parte con fotos: no hay constancia de entrega |
| Margen fuera de rango | por encima del 95% o por debajo del 20%: casi siempre es un costo que falta, no una obra excepcional |

**El informe no bloquea por inconsistencias, las lista.** Se genera igual y las muestra
arriba.

---

## Almacenamiento

**Se guarda en Supabase, no se calcula al vuelo.** El motivo no es de conveniencia:
**congelar el informe protege el número**.

En la obra de Bencen los siete partes están valuados a $19.017 la hora, de mayo a agosto,
mientras que en el conjunto general los valores van de $18.570 a $22.745. Si el costo se
recalcula con la tarifa vigente, el mismo informe generado hoy y dentro de un año muestra
cifras distintas. Guardarlo fija **cuánto costó al momento de cerrar**, que es el número
que sirve para cotizar.

```sql
create table informes_obra (
  id                  uuid primary key default gen_random_uuid(),
  odoo_sale_order_id  bigint not null,
  version             integer not null default 1,
  generado_en         timestamptz not null default now(),
  generado_por        uuid references user_profiles(id),   -- null si fue el cron
  estado_costeo       text not null,      -- congelado: qué tan confiable era al generarse
  datos               jsonb not null,     -- el informe entero, ya calculado
  inconsistencias     jsonb not null default '[]'::jsonb,
  reabierta_en        timestamptz,        -- ver abajo: va en la versión VIEJA
  created_at          timestamptz not null default now()
);
create unique index on informes_obra (odoo_sale_order_id, version);
create index on informes_obra (odoo_sale_order_id, version desc);
```

**`datos` va en `jsonb` y no en columnas.** El informe va a cambiar de forma varias veces
en los próximos meses; con columnas habría que migrar cientos de filas en cada cambio.

**Regeneración versionada, nunca pisando.** Si alguien carga el parte que faltaba y se
regenera, sale `version = 2` y la 1 queda. Un informe que se puede reescribir no es
evidencia de nada.

**`reabierta_en` se escribe en la versión VIEJA, no en la nueva.** Cuando la obra vuelve
de `Desarmado` a `Armado`, se sella la versión vigente con la fecha de reapertura: eso
dice "este informe fue válido hasta acá". La versión que se genere al cerrarse otra vez
nace con `reabierta_en = null`, y quedará sellada sólo si vuelve a reabrirse. Así la fila
sin sellar es siempre la vigente, y la consulta de "el informe actual" es
`reabierta_en is null` sin mirar versiones.

Sigue el criterio de arquitectura del proyecto: **un dueño por dato**. Odoo es dueño de
los partes, las OTs y los costos; Supabase es dueño del informe, que es un derivado
congelado. Nadie lee el informe de obra desde Odoo.

---

## Backfill

**Generar todas las que cumplen el disparador de una** (hoy ~278), llamando al mismo
endpoint del cron sin el filtro de "ya tiene informe".

Es la única forma de que aparezcan las mal cerradas. Y da material real para validar el
informe: uno diseñado sobre un solo caso puede estar sesgado por ese caso; sobre 278 se ve
enseguida qué secciones quedan siempre vacías y cuáles importan.

Los generados por el cron o el backfill llevan `generado_por = null`.

---

## Criterios de aceptación

1. Una venta `Simple` o `Alquiler Sin Montaje` no genera informe de obra ni aparece como
   pendiente.
2. La comparación del tipo de contrato usa `trim`: las 611 de tipo `'Obra '` matchean.
3. Una obra con `x_estado_costeo != 'completo'` genera el informe corto, no se saltea.
4. Una OT sin `x_duracion_est` produce "sin estimación previa", **nunca** un porcentaje de
   desvío.
5. El informe siempre muestra la aclaración de que el margen es contribución y no incluye
   material.
6. La sección por sector aparece sólo si la obra tiene más de un valor de `x_sector`
   **normalizado** (trim, mayúsculas, espacios y saltos colapsados, plural final).
7. Regenerar crea `version = 2` y conserva la 1.
8. El backfill genera **un informe por cada venta que cumple el disparador**, y ninguno
   falla. **Sin número fijo**: las obras se siguen cerrando y un criterio con una cifra
   caduca es un test que falla la semana siguiente por la razón equivocada.
9. Sobre los datos de la obra S00116 (Bencen, Talcahuano 626) el cálculo da **7 partes en
   5 visitas**, 87,5 hh, $2.023.999,50 de costo, ritmo de **23 días entre visitas**, y
   **ningún desvío**: sus dos OTs tienen `x_duracion_est` vacío. Si el informe dice "+9%"
   o "3,5×", está usando el fallback de `x_jornadas_num` —dos `1` de importación— y
   contradice el criterio 4.

   **Ojo con este caso testigo: S00116 está en `Armado`, no en `Desarmado`**, así que el
   cron NO le genera informe y no aparece en el backfill. Se verifica corriendo el cálculo
   sobre sus datos, o regenerando a mano desde la ficha —que a propósito no aplica el
   filtro del disparador, para poder inspeccionar una obra todavía abierta—.
10. Correr el cron dos veces seguidas no duplica informes.
11. El endpoint del cron rechaza con 401 sin `CRON_SECRET`, y escribe con service role:
    no depende de una sesión de usuario.
12. Una venta que vuelve a `Armado` sella su informe vigente con `reabierta_en` y no borra
    nada.
13. Dos valores de `x_sector` que sólo difieren en mayúsculas, espacios o plural **no**
    disparan la sección por sector.
14. El módulo no escribe ningún campo económico de Odoo.
15. El build y el lint del proyecto pasan sin warnings nuevos.

---

## Fuera de alcance

**Informe de entrega al cliente.** Otro documento: fotos, sectores, fechas, constancia de
trabajo realizado, sin economía. Cuando se haga, se arma sobre los mismos datos.

**Las obras mal costeadas.** El informe las detecta y las lista, pero completarlas es
trabajo de datos: hay que decidir si se cargan las OTs y partes faltantes o se aceptan como
históricas incompletas. Son $183 millones facturados.

**Comparación entre obras.** Un informe por obra no responde "¿cuánto sale armar una
pantalla de 20 ML?". Con 278 informes guardados esa pregunta se vuelve contestable, pero
es otro módulo y conviene esperar a tener datos cargados por el flujo nuevo y no
importados.

**La tarifa histórica: RESUELTO.** La pregunta era si el costo usa el valor hora de la
fecha del parte o el vigente al calcular. Verificado en el compute de Odoo: cada monto se
convierte al CCL de su propia fecha —las facturas al día de emisión, los costos al día del
parte diario—. Los costos históricos NO están valuados a una sola tarifa, y por lo tanto
las comparaciones entre obras de distintos meses **sí son válidas, en dólares**. Por eso
la columna USD entró al informe en vez de quedar fuera de alcance.
