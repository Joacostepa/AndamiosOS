# Habilitaciones: revisión y propuesta de rediseño

9 de octubre de 2026 · revisión del módulo entero (bandeja, ficha, panel de planificación, diálogos, ayuda y recorrido) con el código, la captura de JS, las capturas de la prueba y datos reales leídos con SELECT de Supabase y lecturas de Odoo. No se escribió nada.

Maqueta: https://claude.ai/artifact/5LdNNShsQpMyWnPdBr9fUe.

---

## En dos minutos

- **El número más importante de la fila está roto.** "0 d" no es real: 78 de las 81 OTs activas tienen `x_hab_dias = 0`. LAS FLORES 701 lleva 15 días esperando que el cliente apruebe y Av. Corrientes 4285, 11. Las dos deberían estar en rojo y se ven en gris.
- **"Esperando a STEPANSKY, Gabriel" tampoco es real.** El texto sale de si la venta tiene modalidad de permiso cargada y no del grupo. El técnico ya no es quien frena la documentación.
- **La cola real es otra.** De las 18 obras abiertas, 14 se arman "con el permiso emitido" y sólo una lo tiene. Agustina lo resuelve a mano: 12 de las 15 pospuestas dicen "LLEVA PERMISO". La bandeja no muestra el estado del permiso.
- **Falta el estado "lista para habilitar".** Habilitar es lo que más vale, y una obra con todo aprobado aparece como "esperando al cliente".
- **La propuesta:** una bandeja que dice en cada fila el próximo paso, hace cuánto espera y cuándo se arma, con la acción de un clic en la misma fila. Un grupo automático "Esperan el permiso" reemplaza al posponer manual. Una ficha con una sola tarjeta de estado arriba y los papeles al centro. Y la planificación como una hoja que se abre encima.

---

## 1. Diagnóstico

Ordenado por cuánto le cuesta a Agustina en el día a día. Cada punto lleva qué pasa, la evidencia y lo que le cuesta.

### D1. La fila no dice cuánto hace ni quién tiene la pelota

- **"0 d" en todas las filas es un error.**
  - `x_hab_dias` es un computado de Odoo que cuenta desde `x_hab_fecha_consulta`. Leí el compute en `ir.model.fields`: si no hay fecha de consulta, devuelve 0.
  - Desde que "triar no es consultar" (`servicio.ts:690-698`), la consulta sólo se carga con el botón "Ya le consulté al cliente". Ese botón tiene 0 usos en los últimos 30 días; el último fue el 3/9.
  - Medido hoy: 78 de 81 OTs activas tienen 0. Las otras 3 están habilitadas.
  - Aunque alguien cargue la consulta, el campo es `store=true` y no depende de "hoy". Queda congelado en el valor del día en que se escribió.
- **"esperando a STEPANSKY, Gabriel" es otro error.**
  - `fila-bandeja.tsx:60-62` arma el texto con `fila.modalidad ? "esperando al cliente" : "esperando a {técnico}"`. No mira en qué grupo está la fila.
  - LAS FLORES 701 (S02651, torre) y Azcuénaga 1013 (S00064, cercha) no tienen `x_lleva_permiso` cargado, así que dicen "esperando a STEPANSKY" para siempre, aunque estén en el grupo "falta que el cliente valide".
  - La modalidad se carga al cotizar desde el 4/9 y el candado dejó de pedírsela a nadie. "Esperar al técnico" ya no es un estado del trabajo de Agustina.
- **Lo que le cuesta.** El umbral rojo (`UMBRAL_DIAS`, `derivacion.ts:292`) existe para que nada espere 399 días sin que se vea, y hoy nunca se prende. LAS FLORES 701 (mandado el 24/9, umbral 7 días) y Av. Corrientes 4285 (mandado el 28/9) se ven igual que Azcuénaga 1013, que se mandó hoy. Para saber a quién reclamar, Agustina tiene que abrir cada ficha.

### D2. No existe "lista para habilitar", y la acción que más vale está a dos pantallas

- **Los grupos salen de la etapa de Odoo, no de los papeles.** La etapa es por fechas: `c` significa "se mandó al menos un papel" (`derivacion.ts:244-245`). Una obra con todo aprobado sigue en "Ya le mandamos todo — falta que el cliente valide · esperando al cliente".
- **Caso real: Av. Corrientes 4285.**
  - Tiene la Nómina ART aprobada desde el 28/9. Se habilitó y se revirtió el 7/10.
  - La bandeja dice que espera al cliente.
  - El historial dice "Se revirtió la habilitación" sin motivo, así que nadie sabe por qué.
- **Lo que le cuesta.**
  - El 75% de las obras tiene un solo requisito (152 de 202 con requisitos), casi siempre la Nómina ART. Su trabajo entero es: Aplica → Marcar enviado → Aprobar → Habilitar.
  - Hoy hace falta abrir la ficha para cada paso menos el primero. En los últimos 30 días hizo 135 envíos y 225 aprobaciones, uno por uno, entrando a cada obra.

### D3. La mayor parte de la cola espera el permiso, y la bandeja no lo sabe

- **El permiso es la espera principal.** De las 18 obras abiertas (5 en trámite y 13 pospuestas), 14 tienen `x_permiso_modalidad = esperar_permiso`. Sólo una tiene el permiso emitido (Triunvirato 4528). Seis están presentadas y siete no tienen el trámite cargado.
- **Posponer se usa como "espera el permiso" escrito a mano.** 12 de las 15 posposiciones vigentes tienen motivo "LLEVA PERMISO" o una variante ("Lleva permiso", "va con permiso esperando aprobacion"…). Hay 52 posposiciones en el historial y obras pospuestas dos veces: Triunvirato se pospuso el 21/9 y otra vez el 7/10.
- **La fila sólo muestra la modalidad.** Dice "Se arma con el permiso emitido", pero no si el permiso está presentado, emitido o sin presentar (`x_tramite_estado`, que ya se lee en `mapPermiso`).
- **Lo que le cuesta.**
  - Triunvirato 4528 es hoy la obra más urgente de la cola: permiso emitido, planificada para el 19/10 y la Nómina sin mandar. En la bandeja se ve igual que Acuña de Figueroa 1312, que tiene el permiso sin presentar.
  - Cada obra con permiso se pospone, vuelve, se mira y se vuelve a posponer. Son 13 filas plegadas que en realidad están esperando lo mismo.

### D4. Los títulos de los grupos describen etapas de Odoo, no lo que hay que hacer

- **"Falta consultar, o el cliente no dijo qué pide"** junta "la pelota es nuestra" (etapa `a`) con "la pelota es del cliente" (`b`). En la práctica la etapa `b` no existe, porque nadie registra la consulta. Las dos obras de ese grupo tienen la Nómina sin mandar: la pelota es nuestra. Igual la fila dice "esperando al cliente".
- **"Ya le mandamos todo"** es la etapa `c`, o sea "se mandó el primer papel". En una obra de 8 papeles con uno mandado, el título es falso.
- **"13 pospuestas" contra "5 en trámite".** El encabezado presenta como secundario lo que es el 72% del trabajo abierto, y lo pliega al pie.

### D5. La ficha pone la decisión debajo de cuatro bloques de contexto, y en modo oscuro no se lee

- **El orden (`[otId]/page.tsx:137-230`) es:**
  1. Veredicto
  2. Qué hay que ejecutar
  3. Fechas
  4. Aviso de SyH
  5. Bloque de habilitar
  6. Línea de posponer
  7. Barra de triage
  8. Columnas de documentación y permiso
  9. Requisitos
  10. Notas e historial
- **Lo que queda escondido.**
  - En una obra nueva, el Aplica / No aplica es el bloque 7.
  - En la Nómina ART, que es lo que se toca en cada visita, "Marcar enviado" está en el bloque 9, debajo del pliegue (captura `ficha-1204`).
- **Tres lugares dicen el estado con palabras distintas:**
  - el veredicto ("Se puede armar, con pendientes");
  - la columna "Documentación del cliente" (cuatro etapas con puntos, más "Nuestra — falta consultarle…");
  - el bloque de habilitar ("Falta aprobar 1 de 1").
- **En modo oscuro hay texto ilegible.** El veredicto, la modalidad elegida y la caja "Sin definir…" tienen fondos claros fijos con texto claro encima. Se ve en las capturas `ficha-1204`, `ficha-1236` y `ficha-1288`: el título del veredicto directamente no se lee. Hay 43 colores hex fijos en el módulo.

### D6. Siete señales por fila, y las que más se repiten no distinguen nada

- **Cada fila puede llevar:** punto de semáforo, chip de tipo (columna fija de 124 px), prioridad, "Pantalla", SyH, observados y chinche. Además lleva "N d · esperando a" y la fecha.
- **"Pantalla" ya no separa nada.** El chip se justificó con 26 de 65 obras activas. Hoy está en 15 de las 18 abiertas. Si casi todas lo tienen, ya no sirve para encontrar las rápidas.
- **"Armado" tampoco.** Está en 17 de las 18 obras abiertas, y ocupa 124 px de cada fila para decir lo que casi todas son.
- **El punto de semáforo repite al grupo, y su tooltip miente.** Amarillo dice "Habilitación próxima a vencer" (`colores.ts:283`), pero en el compute de Odoo amarillo es `en_curso`. Rojo dice "crítica" y es "sin empezar".

### D7. El panel de planificación ocupa un tercio de la pantalla y contesta otra pregunta

- **Es una columna fija de 380 px** (`panel-planificacion.tsx:77`) que se abre sola desde 1280 px de ancho y se recuerda entre visitas.
- **Por defecto muestra todo:** "63 jornadas · 5 sin habilitar", con 58 tarjetas verdes "Habilitada" (`useState(false)` en la línea 132).
- **Cuenta jornadas, no obras.** Avenida Raúl Scalabrini Ortiz 945 aparece dos veces el mismo día (`agenda.ts:80-101`).
- **La pregunta de Agustina es "¿qué se arma pronto sin estar lista?".** Eso se contesta mejor en la bandeja, ordenando por fecha de armado. La bandeja ya tiene `primeraJornada` en cada fila y sólo la muestra en las pospuestas.

### D8. Gestos que avisan a otra oficina sin red

- **Revertir desde la ficha es un clic.** No pide confirmación ni motivo (`bloque-habilitacion.tsx:69-83`). Le manda a Operaciones un aviso **crítico** que pide "revisalas". En la lista sí confirma, pero tampoco pide motivo.
- **Volver a habilitar después de revertir no avisa.** La clave del aviso es única por OT (`alertas/servicio.ts:73-83`). Corrientes 4285 tiene `ot_habilitada` (28/9) y `ot_deshabilitada` crítica (7/10). Si hoy se habilita de nuevo, Operaciones se queda con la alarma como última noticia.
- **El triage por lote sin selección actúa sobre todo el grupo** (`page.tsx:583-585`). "Aplica" y "No aplica" cambian todas las filas visibles. Lo único que lo dice es la palabra "todas" en 11 px.

### D9. La ayuda y el recorrido enseñan cosas que ya no son ciertas

- **El chinche.** Dicen que "además aparece en el tablero para quien planifica la obra" (`tour.ts:195`, `ayuda/page.tsx:227`). Es falso: el tablero lee sólo el ámbito `operaciones` (`api/planificacion/comentarios/route.ts:26`).
- **La modalidad.** Dicen que "la define el técnico… el tablero avisa al confirmar y registra el pedido" (`tour.ts:204`, `ayuda/page.tsx:246`). Es falso desde el 3/9 y el 4/9: se carga al cotizar y el candado ya no la pide.
- **"Es la mitad de los casos"** (`tour.ts:56`, `ayuda/page.tsx:85`). Medido: 28 "no aplica" sobre 244 obras triadas (11%), y 5 sobre 190 en los últimos 45 días.
- **"La etapa dice de quién es el próximo movimiento"** (`tour.ts:64`, paso "fila-obra"). La fila no muestra la etapa.

### D10. Las notas se usan para otra cosa que la prevista

- **Para qué se usan.** De las últimas 12 notas de habilitación, 7 son listas de razones sociales con CUIT para la cláusula de no repetición. Son datos del requisito, no charla.
- **Dónde están.** Al pie de la ficha, en una grilla de dos columnas con el historial, lejos del requisito que las usa.

---

## 2. Errores de funcionamiento

No son de diseño: el sistema muestra algo falso o se comporta distinto de lo que dice.

| # | Error | Dónde | Evidencia |
|---|---|---|---|
| E1 | "0 d" en todas las filas y en la ficha. El tablero tampoco muestra nunca "N días en trámite" (`panel-ot.tsx:872` lo oculta si es 0) | compute `x_hab_dias` en Odoo · `odoo/habilitaciones.ts:399` · `fila-bandeja.tsx:134` | 78 de 81 OTs activas en 0. El compute cuenta desde la consulta, que nadie carga; y es `store=true` sin "hoy" en sus dependencias |
| E2 | "esperando a {técnico}" en filas que esperan al cliente | `fila-bandeja.tsx:60-62` | LAS FLORES 701 y Azcuénaga 1013 en "falta que el cliente valide" |
| E3 | "Sin definir hace 0 días" siempre | `columna-permiso.tsx:47-51`: con `modalidadDefinida` nulo calcula `diasEntre(hoy, hoy)` | captura `ficha-1288` |
| E4 | El veredicto de la ficha no coincide con el tablero | `derivacion.ts:481-503` usa `friccionAlConfirmar`, que no mira el tipo de OT y todavía incluye `pedir_modalidad` | Azcuénaga 1013 (desarme) dice "Falta la documentación del cliente y la modalidad de permiso". Un desarme con "esperar permiso" diría "No se puede armar" aunque el tablero lo deja confirmar. Corrientes 4285 dice "Falta la documentación" con 1/1 aprobado |
| E5 | Texto ilegible en modo oscuro | 43 hex fijos en el módulo; veredicto `[otId]/page.tsx:140-144`, modalidad `columna-permiso.tsx:117-121`, chip Pantalla `chip-pantalla.tsx:27` | capturas `ficha-1204`, `ficha-1236`, `ficha-1288`, `bandeja-01` |
| E6 | Los grupos "Se arman en 3 días o menos" y "Fecha pasada" pueden no aparecer | `x_hab_alerta` es `store=true` y usa `date.today()` en el compute; no hay cron que lo recalcule (revisé `ir.cron`) | Latente: hoy las 17 alertas coinciden con lo que darían, pero sólo se actualizan cuando alguien escribe la OT |
| E7 | Volver a habilitar después de revertir no avisa a Operaciones | `claveDe("ot_habilitada", otId)` es única para siempre | Corrientes 4285. La regla es deliberada, pero en este caso deja la alarma crítica como última noticia |
| E8 | El tooltip del semáforo dice "próxima a vencer" cuando la obra está en curso | `colores.ts:283` (compartido con el tablero) | compute de `x_hab_semaforo` |
| E9 | La ayuda y el recorrido afirman cosas falsas (chinche en el tablero, modalidad que pide el técnico) | ver D9 | — |

---

## 3. Principios del rediseño

1. **La bandeja contesta "¿qué hago ahora, y con cuál empiezo?".** Los grupos dicen de quién es la pelota. Dentro de cada grupo se ordena por prioridad y por cuándo se arma.
2. **Cada fila dice tres cosas en castellano:** el próximo paso, hace cuánto espera y cuándo se arma. Los días los calcula la app con fechas propias, no con un computado congelado.
3. **Lo que se resuelve en un clic se resuelve en la fila.** Marcar enviado, aprobar y habilitar, para el 75% de obras con un solo papel. Siempre con el nombre de la obra en el aviso y con Deshacer cuando es reversible.
4. **Una señal por idea.** Un chip aparece sólo si cambia lo que hay que hacer: prioridad, permiso, SyH, observado o un tipo que no sea armado. Lo normal no lleva marca, que es la regla que ya usa la prioridad baja.
5. **El permiso es la espera principal, así que se ve.** Esperar el permiso es un estado del sistema, no un motivo escrito a mano.
6. **Lo que avisa a otra oficina pide confirmación y motivo.** El motivo viaja en el aviso.
7. **Se respetan las decisiones firmes.** Un dueño por dato. El historial no se edita. La documentación no bloquea el tablero. Ningún botón manda mails: todos registran.

---

## 4. Propuesta por pantalla

### 4.1 Bandeja

**Encabezado.**
- Título: **Habilitaciones**.
- En lugar del subtítulo "Las obras entran solas al crearse la OT en Odoo", va un **resumen accionable**. Cada parte es un enlace que baja a su grupo:
  > **1 para hacer** · 2 esperando al cliente · 13 esperan el permiso · 2 pospuestas
  - Si hay urgentes, van primero y en rojo: "**1 urgente** · …".
  - Lo que entra solo se explica en la guía, no todos los días.
- A la derecha: `Próximas 2 semanas` (abre la planificación encima) y `¿Cómo funciona?`.
- Buscador igual que hoy, con el placeholder "Buscar por dirección, cliente, OT o venta".

**Grupos.** Son excluyentes y van en este orden. Las reglas se derivan en la app con una función pura, como `grupoDe` hoy.

| # | Título exacto | Texto gris a la derecha | Qué entra | Abierto |
|---|---|---|---|---|
| 1 | **Urgentes: se arman en 3 días o menos** | sin habilitar | no habilitada y se arma en ≤ 3 días o la fecha ya pasó. Se calcula con la fecha de armado (sección 4.2), no con `x_hab_alerta` | sí, encabezado en rojo suave. Sólo si hay |
| 2 | **Nuevas: ¿piden papeles?** | Aplica crea la Nómina ART · No aplica la deja habilitada | sin triar | sí |
| 3 | **Para hacer** | la pelota es nuestra | aplica, no habilitada, y hay algo nuestro: papeles por mandar, algo observado, o todo aprobado sin habilitar | sí |
| 4 | **Esperando al cliente** | en rojo después de 7 días | aplica, no habilitada, todo mandado y algo sin aprobar | sí |
| 5 | **Esperan el permiso** | vuelven solas cuando sale el permiso o 10 días antes de armar | modalidad "con el permiso emitido", trámite sin emitir y faltan más de 10 días para armar (cambio grande, sección 6) | plegado, con el contador en el resumen |
| 6 | **Pospuestas** | vuelven solas en la fecha elegida | pospuestas a mano por otro motivo | plegado |
| 7 | **Vencen en menos de 30 días** | — | habilitadas con vencimiento cerca, como hoy | sí, si hay |
| — | **Resueltas** | 59 habilitadas · 4 no aplican | pie plegado con dos pestañas: `Habilitadas (59)` y `No aplican (4)` | plegado |

- **Orden dentro de cada grupo:** la regla de hoy (prioridad alta, media, baja), pero por **fecha de armado** en vez de fecha programada. Sin fecha va al final.
- **Triage por lote:** las casillas quedan sólo en "Nuevas". No hay botones a nivel grupo. Con al menos una tildada aparece una barra: `2 seleccionadas · [Aplica] [No aplica] · Cancelar`. Cada fila nueva tiene además sus propios `Aplica` y `No aplica`.
- **Pie:** se va el "no cuentan en el total", que hoy se repite tres veces. El resumen de arriba ya dice qué cuenta.

### 4.2 Fila

Hay cuatro columnas en escritorio. En el teléfono se apilan: obra, después próximo paso y fecha, después el botón a lo ancho.

1. **Obra.**
   - Línea 1: dirección en semibold, más hasta dos chips.
   - Línea 2, en gris: `Cliente · S02563 · Pantalla de protección`. Qué se arma pasa a texto.
   - Chips posibles, en este orden:
     - `Prioridad alta` (rojo lleno) o `Prioridad media` (ámbar).
     - `Desarme`, `Ampliación` o `Desmonte parcial`. Armado no lleva chip.
     - `SyH`.
     - `1 observado`.
2. **Próximo paso.** Línea 1 con el estado; línea 2 con los días y el detalle. Sale de la tabla de abajo.
3. **Se arma.**
   - Línea 1: `lun 19 oct`.
   - Línea 2: `en 10 d · planificada` si sale de la primera jornada del tablero, o `en 15 d · programada` si sale de `x_fecha_programada`. Sin ninguna de las dos: `Sin fecha`.
   - En rojo cuando faltan 3 días o menos, o con `pasó hace 2 d`.
4. **Acción.** Un botón y un menú `⋯` con: `Posponer…`, `Marcar que no aplica`, `Ver la OT en Odoo`.

**Textos exactos por estado.**

| Situación | Próximo paso (línea 1) | Línea 2 | Botón |
|---|---|---|---|
| Sin triar | **¿Pide papeles?** | `entró hace 2 d` (rojo después de 3) | `Aplica` · `No aplica` |
| Aplica, un papel sin mandar | **Mandar la Nómina ART** | `desde el triage, hace 3 d` · o `volvió hoy: la planificaron` | `Marcar enviado` |
| Aplica, varios sin mandar | **Mandar 3 papeles** | `hace 3 d` | `Marcar 3 enviados` |
| Mandados en parte | **Faltan mandar 2 de 8** | `hace 5 d` | `Abrir` |
| Algo observado | **Corregir: Capacitaciones** | `observado hace 2 d` | `Abrir` |
| Todo aprobado | **Lista para habilitar** | `aprobada el 28 sep` | `Habilitar` (verde) |
| Esperando, un papel | **Falta que apruebe la Nómina ART** | `mandada hoy` | `Aprobó` |
| Esperando, varios | **Falta que apruebe 3 de 8** | `mandados hace 15 d · 1 reclamo` (rojo después de 7) | `Aprobar 3` · y `Reclamar` si está en rojo |
| Espera el permiso | **Permiso presentado** / **Permiso sin presentar** | `EX-2026-45086999 · vuelve el dom 18 oct` | `⋯` (incluye `Pasar a Para hacer`) |
| Pospuesta | **Pospuesta: 16/11 montaje** | `vuelve el lun 12 oct` | `Reactivar` |
| Habilitada (Resueltas) | **Habilitada el 28 sep** | `por Agustina` · `por excepción: el cliente autorizó por teléfono` | `Revertir…` |
| No aplica (Resueltas) | **No pide papeles** | `habilitada desde el 3 sep` | `Volver a la cola` |

**De dónde salen los días.** Los calcula la app; no usa `x_hab_dias`.
- **Nuevas:** desde que la obra entró (`hab_ots.created_at`). Rojo después de 3 días, como hoy.
- **Para hacer:** desde el triage, o desde que volvió de pospuesta, lo más reciente. Rojo después de 3 días. Es un umbral nuevo y lo decide JS.
- **Esperando al cliente:** desde el papel mandado más viejo que sigue sin respuesta (`min(fecha_envio)` de los requisitos en "enviado"). Rojo después de 7 días, como hoy.

**Avisos después de un clic.** Llevan el nombre de la obra, porque el botón está en una lista:
- `Av. Triunvirato 4528: Nómina ART marcada como enviada` · [Deshacer]
- `LAS FLORES 701: 3 papeles aprobados · lista para habilitar` · [Deshacer]
- `Av. Corrientes 4285 habilitada · Operaciones recibió el aviso`. Sin Deshacer, porque revertir también avisa.
- `Av. Ingeniero Huergo 1145: aplica · se creó la Nómina ART` · [Deshacer]

Deshacer agrega una línea al historial, como cualquier corrección. No borra nada.

### 4.3 Ficha

**Arriba:**
- `← Habilitaciones` a la izquierda y `Ver la OT en Odoo ↗` a la derecha.
- Título: la dirección, con los mismos chips que la fila.
- Debajo: `Armado · S02563 · Daniel Horacio Cavalleri · Pantalla de protección`.

**Tarjeta de estado.** Es una sola, ancha, y reemplaza al veredicto, al bloque de habilitar, a la barra de triage, a la línea de posponer y a la columna "Documentación del cliente".

- A la izquierda va el **estado en una frase** y, debajo, dos líneas de contexto:
  - `Se arma el lun 19 oct (en 10 días) · Cuadrilla 3, tentativa`
  - `En el tablero: se puede confirmar. La documentación no frena.`, o `En el tablero: no deja confirmar hasta que salga el permiso.`
  - Esta segunda línea se calcula con `friccionDelTablero` (arregla E4).
- A la derecha va **el botón del paso** y un menú `Más ▾`.
- Debajo, una línea de pasos con fecha, hecha con los requisitos y no con las etapas de Odoo: `Aplica · 18 sep` → `Mandada` → `Aprobada` → `Habilitada`.

| Estado | Frase | Botón principal |
|---|---|---|
| Nueva | **¿Esta obra pide papeles?** · "Si no pide nada, No aplica la deja habilitada en el acto." | `Aplica` · `No aplica` |
| Para hacer | **Mandar la Nómina ART** / **Mandar 3 papeles** / **Corregir lo observado** | `Marcar enviado` / `Ir a los papeles` |
| Lista | **Lista para habilitar** · "Los 8 papeles están aprobados." | `Habilitar obra` (verde) |
| Esperando | **Esperando que el cliente apruebe** · "Mandados el 24 sep (hace 15 días) · 1 reclamo, el 1 oct" | `Reclamar al cliente` · `Aprobar 3` |
| Permiso | **Espera el permiso municipal** · "Presentado el 7 oct · EX-2026-45086999. Vuelve a Para hacer cuando salga, o el dom 18 oct." | — (sólo `Más`) |
| Habilitada | **Habilitada el 28 sep por Agustina** · "Operaciones ya puede confirmar." | `Revertir…` |
| No aplica | **No pide papeles** · "Quedó habilitada el 3 sep." | `Volver a la cola` |

`Más ▾` lleva:
- `Posponer…`
- `Habilitar sin todos los papeles…`
- `Marcar que no aplica`
- `Registrar que le consulté qué pide` (sale de la vista principal; 0 usos en 30 días)
- `Ver la OT en Odoo`

**Abajo hay dos columnas.** En el teléfono, una debajo de la otra.

- **Izquierda (la de trabajo):**
  1. **Papeles que pide el cliente.**
     - Encabezado: `0 de 1 aprobado` · `Paquete: Básico ▾`.
     - Primera línea: `Mandárselos a Daniel H. Cavalleri · +54 11 •••• 6813 · k•••@gmail.com [Copiar mail]`.
     - Filas con estado y un botón por fila:
       - pendiente → `Marcar enviado`
       - enviado → `Aprobado` · `Observado…`
       - observado → `Mandé la corrección`
       - aprobado → nada (`⋯` → `Volver a pendiente`)
     - Los adjuntos van como clip con el número. Borrar pasa al `⋯`.
     - Botones masivos, como hoy: `Marcar 3 enviados` · `Aprobar 3`.
     - Debajo: `Agregar un papel que pide el cliente`.
     - Pie: `La documentación vence el [fecha] · la bandeja te avisa 30 días antes`.
  2. **Notas de la obra.** Justo debajo, porque ahí van los CUIT de la cláusula.
     - Placeholder: "Ej: razones sociales y CUIT para la cláusula de no repetición".
     - Un solo botón `Agregar` y la casilla `Fijar arriba`.
- **Derecha (contexto):**
  1. **Cuándo se arma.** Primera jornada, cuadrilla y estado, programada y comprometida, y el enlace `Ver en el tablero`.
  2. **Qué hay que ejecutar.** El texto de la OT, plegado a 3 líneas con `ver todo`.
  3. **Permiso municipal**, en modo lectura:
     - `Se arma con el permiso emitido · Emitido el 22 sep · EX-2026-42727922`
     - `Venta S02563 ↗`
     - `Editar` despliega los controles de hoy.
     - Agustina cargó 8 cambios de permiso en 30 días, 5 de ellos "sin permiso" en obras viejas. Se mantiene editable, pero no ocupa media pantalla.
  4. **Historial.** Las 5 últimas y `Ver todo (12)`. Igual que hoy: no se edita.
- **SyH:** cuando corresponde, en la tarjeta de estado va el chip `SyH` y la línea `El cliente contrató técnico de SyH: mandá también su documentación`. El requisito propio sigue en la lista.

### 4.4 Panel de planificación

- **Deja de ser una columna fija** de 380 px que se recuerda abierta. Se abre **encima, como hoja, en todas las pantallas**, desde `Próximas 2 semanas`. Es el mismo componente que ya se usa en pantallas angostas (`PanelPlanificacionHoja`).
- **Arranca filtrado** en `Sin habilitar (5)`. `Ver todo (63 jornadas)` queda como segunda opción.
- **Una tarjeta por obra y día.** Si hay dos cuadrillas, la tarjeta dice "Cuadrilla 5 · 2 jornadas".
- **Cada tarjeta muestra el mismo "próximo paso" que la fila**, en vez de sólo "Habilitada" o "Sin habilitar".
- **El trabajo diario lo cubre la bandeja.** La columna "Se arma" y el orden por fecha contestan "qué se arma pronto sin estar lista" sin abrir el panel.

### 4.5 Diálogos

**Triage.** No hay diálogo, porque es reversible y no avisa a nadie. El aviso posterior lleva Deshacer.
- Una obra: `Av. Ingeniero Huergo 1145: no aplica · quedó habilitada` [Deshacer].
- Por lote: `2 obras: no aplican · quedaron habilitadas` [Deshacer].

**Habilitar con todo aprobado.** No hay diálogo: es un clic, como hoy, desde la fila o la ficha.

**Habilitar sin todos los papeles.** Hoy se despliega dentro de la página; pasa a ser un diálogo.
- Título: **¿Habilitar sin todos los papeles?**
- Texto: "Falta aprobar: Nómina ART. Queda registrado con tu nombre y el motivo, y Operaciones recibe el aviso de que ya se puede programar."
- Campo: **¿Por qué se habilita igual?** Placeholder: "Ej: el cliente autorizó por teléfono; manda la nómina el lunes". Es obligatorio.
- Botones: `Cancelar` · `Habilitar igual`.

**Revertir.** El mismo diálogo en la ficha y en Resueltas.
- Título: **¿Revertir la habilitación de Av. Corrientes 4285?**
- Texto: "Vuelve a la cola sin habilitar y Operaciones recibe un aviso urgente con este motivo. Si tiene jornadas en el tablero, siguen ahí: lo decide Operaciones. Los papeles y el historial no se tocan."
- Campo: **Motivo (lo lee Operaciones)**. Placeholder: "Ej: lleva permiso y todavía no salió". Es obligatorio.
- Botones: `Cancelar` · `Revertir y avisar` (estilo destructivo).
- El motivo va a `hab_gestiones` ("Se revirtió la habilitación: …") y a la descripción del aviso.

**Posponer.**
- Título: **Posponer hasta…**
- Texto: "Sale de la cola y vuelve sola en la fecha que elijas. Si Operaciones la planifica para antes, vuelve antes y te avisa."
- Atajos: `10 días antes de armar · mar 13 oct` · `En 1 semana` · `En 2 semanas`. Debajo, el calendario.
- Motivo con opciones rápidas: `Lleva permiso` · `El cliente avisa` · `Fecha a confirmar` · y un texto libre `Otro motivo`. Hoy hay 5 formas distintas de escribir "lleva permiso". Cuando exista "Esperan el permiso", la primera opción se va.
- El botón dice la fecha: `Posponer hasta el mar 13 oct`.
- Si no se puede, el texto es "No se puede posponer: se arma el lun 19 oct y faltan menos de 10 días para mandar los papeles." y el único botón es `Entendido`.

### 4.6 Ayuda y recorrido

- **Corregir ya, sin esperar el rediseño** (E9):
  - el chinche no aparece en el tablero;
  - la modalidad se carga al cotizar y el candado sólo frena por permiso sin emitir o expediente sin número;
  - "la mitad" pasa a "una de cada diez";
  - el paso de la fila no habla de "etapa".
- **Guía.** Se reordena por las preguntas de Agustina:
  1. ¿Qué es cada grupo?
  2. ¿Qué significa cada frase de la fila?
  3. ¿Cuándo vuelve una obra?
  4. ¿Qué pasa si habilito o revierto?
  5. ¿Qué no hace el sistema? No manda mails.
- **Recorrido.** Se sube `TOUR_BANDEJA` y `TOUR_FICHA` a `v2` para que se muestre una vez más con la estructura nueva. Los pasos están en la sección 7.

---

## 5. Qué se saca

- El **panel lateral fijo** de 380 px. Queda la hoja.
- El **punto de semáforo** de la fila, que repite el grupo y tiene el tooltip equivocado.
- El chip **"Pantalla"** violeta. Pasa a texto en la línea 2.
- El chip **"Armado"** en columna de 124 px. Sólo lleva chip lo que no es armado.
- **"0 d · esperando a {técnico}".** Lo reemplazan el próximo paso y los días calculados.
- El subtítulo **"Las obras entran solas al crearse la OT en Odoo"** y los tres **"no cuentan en el total"**.
- En la ficha:
  - la columna **"Documentación del cliente"** con las cuatro etapas;
  - el **veredicto** como caja propia;
  - la **barra de triage** y la **línea de posponer** sueltas.
  - Todo eso entra en la tarjeta de estado.
- El botón **"Ya le consulté al cliente"** a la vista. Pasa a `Más`.
- **"Registrar pedido a {técnico}"** y el cartel "Sin definir hace N días · esperando a…". Era el circuito de la modalidad, que ya se resuelve al cotizar.
- Los **botones de triage a nivel grupo** que actúan sin selección.

---

## 6. Plan: cambios chicos y grandes

### Chicos (horas): se pueden hacer ya, cada uno por separado

| # | Cambio | Archivos | Tiempo |
|---|---|---|---|
| C1 | Días calculados por la app: desde que entró, desde el triage, desde el envío más viejo sin respuesta. Arregla E1 en la bandeja | `servicio.ts` (sumar `fecha_envio` al select de requisitos, `created_at` y `triage_fecha` a la cabecera), `fila-bandeja.tsx` | 2 h |
| C2 | El texto de espera según el grupo, no según la modalidad (E2) | `fila-bandeja.tsx:60` | 30 min |
| C3 | "Se arma" con la primera jornada antes que la fecha programada, con "planificada" o "programada" | `fila-bandeja.tsx`, `derivacion.ts` (orden) | 1 h |
| C4 | Urgentes calculados en la app con la fecha de armado, no con `x_hab_alerta` (E6) | `derivacion.ts:239-251` | 1 h |
| C5 | Estado "Lista para habilitar" y botón `Habilitar` en la fila | `derivacion.ts`, `fila-bandeja.tsx`, `page.tsx` | 3 h |
| C6 | Revertir con diálogo y motivo obligatorio en la ficha y en la lista; el motivo en el aviso | `bloque-habilitacion.tsx`, `page.tsx`, `api/.../habilitacion/route.ts`, `servicio.ts` | 3 h |
| C7 | Triage por lote sólo con selección; aviso con Deshacer | `page.tsx:559-647` | 1-2 h |
| C8 | Fila: sin punto, Pantalla como texto, tipo sólo si no es armado | `fila-bandeja.tsx`, `chip-tipo-ot.tsx` | 1 h |
| C9 | "Sin definir hace 0 días" (E3) y veredicto con `friccionDelTablero`, sin "falta la documentación" con todo aprobado (E4) | `columna-permiso.tsx:47`, `derivacion.ts:481` | 1 h |
| C10 | Colores fijos a tokens; arregla lo ilegible en modo oscuro (E5) | 11 archivos del módulo | 2-3 h |
| C11 | Textos falsos de ayuda y recorrido (E9) y tooltip del semáforo (E8) | `tour.ts`, `ayuda/page.tsx`, `colores.ts:283` | 1 h |
| C12 | Panel: "Sin habilitar" por defecto y una tarjeta por obra y día | `panel-planificacion.tsx:132`, `agenda.ts` | 1-2 h |
| C13 | Motivos rápidos al posponer | `dialogo-posponer.tsx` | 1 h |
| C14 | Volver a habilitar después de revertir avisa (sufijo con fecha en la clave). **Lo decide JS** (E7) | `api/.../habilitacion/route.ts` | 30 min |

Sugerencia: C1, C2, C4, C9, C10 y C11 primero. Es cerca de un día y saca todo lo que hoy muestra algo falso.

### Grandes (días)

| # | Cambio | Depende de | Tiempo |
|---|---|---|---|
| G1 | **Bandeja por próximo paso:** grupos nuevos, función de grupo pura con tests, resumen con enlaces, acciones en la fila con Deshacer, pie "Resueltas" | C1-C5 | 2-3 días |
| G2 | **"Esperan el permiso" automático:** regla de vuelta (permiso emitido, o 10 días antes de armar), migrar las 11 pospuestas "LLEVA PERMISO", el estado del trámite en la fila. **Lo decide JS** | G1 | 1-2 días |
| G3 | **Ficha nueva:** tarjeta de estado única, dos columnas, menú `Más`, permiso en lectura con `Editar`, notas debajo de los papeles | C6, C9 | 2 días |
| G4 | **Planificación como hoja** desde `Próximas 2 semanas`; sin columna fija | C12 | medio día |
| G5 | **Recorrido v2 y guía** reescritos para la estructura nueva | G1, G3 | medio día |
| G6 | **Opcional, en Odoo:** que `x_hab_dias` y `x_hab_alerta` dejen de congelarse (acción programada diaria, o contar desde el triage) para que el tablero vea lo mismo que la bandeja. **Lo decide JS** | — | medio día |

---

## 7. Anclas `data-tour`

`use-tour.ts:34` descarta **en silencio** los pasos cuya ancla no está en la página. Si se renombra un ancla sin tocar `tour.ts`, el recorrido se acorta sin avisar. Hay que coordinar con quien está completando `tour.ts` y subir las claves a `v2`.

### Bandeja

| Ancla hoy | Qué pasa | Paso del recorrido |
|---|---|---|
| `bandeja-header` | **Se queda.** Ahora lleva el resumen | "Tu cola, ordenada por lo que hay que hacer". Explica el resumen y que cada número baja a su grupo |
| `grupo-recien-llegadas` | **Se queda** en el grupo "Nuevas: ¿piden papeles?" | Se juntan los dos pasos de hoy en uno y se saca "la mitad" |
| `fila-obra` | **Se queda**, primera fila del primer grupo | Se reescribe: próximo paso, días en rojo, se arma, botón en la fila |
| `grupos` | **Desaparece.** Hoy cuelga de critica o atrasada (`page.tsx:591`) | Pasa a `grupo-urgente`, en el grupo nuevo. Sin urgentes, el paso se saltea, como hoy |
| `no-aplican` | **Cambia** a `resueltas`, en el pie con pestañas | "Lo resuelto queda al pie y se deshace desde ahí" |
| — | **Nueva:** `grupo-para-hacer` | "La pelota es nuestra; el botón de la fila resuelve el paso" |
| — | **Nueva:** `grupo-cliente` | "Los días cuentan desde el papel más viejo sin respuesta. Reclamar registra la fecha" |
| — | **Nueva:** `grupo-permiso` (con G2) | "Las que esperan el permiso no hace falta posponerlas" |
| — | **Nueva:** `accion-fila` | Opcional, si se quiere marcar el botón |

### Ficha

| Ancla hoy | Qué pasa | Paso del recorrido |
|---|---|---|
| `veredicto` | **Cambia** a `estado`, en la tarjeta de estado | "Lo que sigue, arriba de todo" |
| `boton-habilitar` | **Se queda**, dentro de la tarjeta (sólo en "Lista" o como opción de `Más`) | Se ajusta: "también desde la bandeja" |
| `barra-triage` | **Cambia de lugar**: los botones Aplica / No aplica de la tarjeta, sólo en obras nuevas | Igual |
| `boton-consulta` | **Desaparece** de la vista; pasa a `Más` | Se borra el paso "Triar no es consultar", o se ancla a `mas-acciones` |
| `vencimiento` | **Se queda**, se muda al pie de los papeles | Igual |
| `paquetes` | **Se queda** | Igual |
| `requisitos` | **Se queda** | Igual |
| `agregar-requisito` | **Se queda** | Igual |
| `notas` | **Se queda**, debajo de los papeles | Se corrige: no aparece en el tablero; sirve para los CUIT de la cláusula |
| `permiso` | **Se queda**, en la columna derecha y en modo lectura | Se reescribe: lo carga Comercial al cotizar y la gestoría al presentar |
| `historial` | **Se queda**, plegado a 5 | Igual |
| — | **Nueva:** `contacto-papeles` | "A quién se los mandás" |
| — | **Nueva:** `mas-acciones` | Opcional: posponer, no aplica, excepción |

---

## 8. Riesgos y lo que tiene que decidir JS

**Riesgos.**

1. **Vocabulario nuevo.** Agustina ya aprendió los grupos actuales. Conviene sacarlo en una sola entrega, con el recorrido v2, y con títulos que nombran su gesto ("Para hacer", "Esperando al cliente").
2. **Dos verdades.** Si la app deriva días y urgencia y Odoo no, el tablero sigue mostrando `x_hab_dias = 0` y el amarillo "próxima a vencer" (`panel-ot.tsx:829-873`). Operaciones vería otra cosa que Agustina. Se mitiga con G6, o con la misma función de la app en el tablero.
3. **"Esperan el permiso" depende de `x_tramite_estado`.**
   - 7 de las 14 obras con "esperar permiso" no tienen el trámite cargado.
   - Si el dato se atrasa (robot de TAD caído, carga manual), la obra queda plegada.
   - Red de seguridad: la vuelta 10 días antes de armar sigue valiendo, y el grupo siempre muestra su número en el resumen.
4. **Botones en la fila.** Es más fácil tocar la obra equivocada.
   - Un solo botón por fila, con el nombre de la obra en el aviso.
   - Deshacer en lo reversible.
   - `Habilitar` en la fila sólo con todo aprobado.
5. **Sacar la columna fija de planificación.** El código dice que "hay quien la usa todo el día". Hay que preguntar quién antes del cambio; la hoja conserva todo.
6. **Supuestos viejos.**
   - "La mitad no aplica" (medido: 11%).
   - "Ya le consulté" (0 usos en 30 días).
   - Confirmar con Agustina antes de sacar o esconder algo.
7. **Deshacer ensucia el historial**, porque es append-only. Se acepta. Si molesta, la vista puede juntar "marcado y desmarcado en el mismo minuto".

**Decisiones para JS.**

1. ¿"Esperan el permiso" automático reemplaza al posponer "LLEVA PERMISO"? (G2)
2. ¿Volver a habilitar después de revertir avisa a Operaciones? (C14)
3. ¿Revertir pide motivo obligatorio? (C6)
4. ¿Umbral rojo de "Para hacer" en 3 días?
5. ¿Se arregla `x_hab_dias` y `x_hab_alerta` en Odoo, o se dejan de usar? (G6)
6. ¿El permiso pasa a modo lectura, con `Editar`, dentro de Habilitaciones?

---

## Anexo: datos usados (9/10/2026, sólo lectura)

- **Odoo, 81 OTs activas.**
  - Etapas: 63 `d`, 15 `a`, 3 `c`.
  - `x_hab_dias`: 78 en 0 y 3 en 12 (las habilitadas).
  - `x_hab_alerta`: 64 ok y 17 próxima; coinciden con el cálculo de hoy.
- **Las 18 abiertas.**
  - 14 "esperar permiso": 1 emitido, 6 presentados, 7 sin cargar.
  - 15 "Pantalla de protección".
  - 17 armados y 1 desarme.
- **`hab_gestiones`, últimos 30 días** (todas de Agustina):
  - 225 aprobaciones, 135 envíos, 109 triages, 65 posposiciones (más 29 automáticas), 13 reclamos, 8 cambios de permiso, 2 observaciones y 0 consultas.
- **`hab_requisitos`.** Obras por cantidad de requisitos: 152 con 1, 25 con 2, 6 con 3 y 19 con 8 o más. Por estado: 292 aprobados, 61 pendientes y 30 enviados.
- **`hab_ots`.**
  - 212 aplica, 28 no aplica y 4 sin triar.
  - En los últimos 45 días: 185 aplica y 5 no aplica.
  - Mediana del triage a la habilitación: 0 días; p90: 15 días.
- **Posposiciones vigentes:** 11 "LLEVA PERMISO", 1 "Lleva permiso" y 3 con otros motivos.
- **Avisos:** `ot_habilitada` 151, `ot_deshabilitada` 1 (Corrientes 4285), `hab_pospuesta` 53.
