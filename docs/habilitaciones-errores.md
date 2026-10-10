# Habilitaciones: errores y contradicciones

Prueba del 09/10/2026, entre las 19:56 y las 20:30, contra datos reales y con la escritura cortada en el navegador (ver `habilitaciones-inventario.md`).
El tema por defecto de la app es **oscuro** (`src/app/layout.tsx:49`, `defaultTheme="dark"`), así que la mayoría de los usuarios ve la pantalla como en las capturas `*-oscuro-*`.

Orden: primero lo que confunde o rompe el trabajo diario, después lo cosmético.
Cada entrada lleva:
- **Repro**: cómo reproducirlo;
- **Dónde**: archivo y línea;
- **Captura**: la imagen en `capturas/`.

---

## A. Errores confirmados

### 1. "0 d" en todas las filas: el contador de días no mide nada
- **Qué pasa.** Toda la bandeja dice `0 d`: 78 de 81 filas están en 0 y las otras 3 en 12. La columna lee `x_hab_dias` de Odoo.
  - El cálculo de Odoo (`ir.model.fields`, leído por RPC) es `d = 0; if x_hab_fecha_consulta: d = (x_hab_fecha or hoy) - consulta`. O sea: **sin fecha de consulta da 0**.
  - Hoy 75 de las 81 OTs activas no tienen consulta. El botón "Ya le consulté al cliente" se usó **0 veces**: no hay ninguna gestión `consulta` con "Se le consultó…".
  - Las 37 obras con consulta la heredaron del triage viejo, que la sellaba al marcar "Aplica".
  - Además es un `store=True` que depende de `today()`: aunque hubiera consulta, el número se congela en el valor del último write.
- **Consecuencias.**
  - El rojo por umbral (`UMBRAL_DIAS`) no se prende nunca.
  - El paso del recorrido "al lado van los días que lleva esperando, en rojo cuando ya son demasiados" describe algo que no pasa.
- **Repro.** Abrir `/habilitaciones`: todas las filas en trámite dicen `0 d`.
- **Dónde.**
  - `src/components/habilitaciones/fila-bandeja.tsx:50` y `:132-135`;
  - `src/lib/odoo/habilitaciones.ts:399`;
  - el compute de `x_hab_dias` en Odoo;
  - `src/lib/habilitaciones/servicio.ts:686-698`: el triage ya no sella la consulta.
- **Captura.** `bandeja-01-arriba.png`.

### 2. "esperando a STEPANSKY, Gabriel" en "Ya le mandamos todo": confirmado
- **Qué pasa.** El texto de espera de la fila sale de la **modalidad de permiso**, no de la etapa de la documentación: `fila.modalidad ? "esperando al cliente" : "esperando a <técnico>"`. Casos reales:
  - **1288 Azcuénaga 1013** (desarme, grupo "Ya le mandamos todo"): no tiene modalidad, así que dice "esperando a STEPANSKY, Gabriel". En realidad espera que el cliente valide la nómina enviada, y además un desarme no necesita modalidad.
  - **1204 Triunvirato y 1214 Acuña de Figueroa**: etapa `a` ("Nuestra — falta consultarle al cliente"), pero tienen modalidad, así que dicen "esperando al cliente". Es al revés: la pelota es nuestra.
  - **Recién llegadas** sin triar (probado con datos inyectados) dicen "esperando a <técnico>".
- **Contexto.** La modalidad ahora la contesta Comercial al cotizar (desde el 4/9), así que "esperando al técnico" tampoco describe a nadie.
- **Dónde.**
  - `src/components/habilitaciones/fila-bandeja.tsx:60-62`;
  - la línea de contexto con "modalidad sin definir" está en `:54`.
- **Captura.** `bandeja-01-arriba.png`, `bandeja-20-INYECTADA-recien-llegadas-y-critica.png`.

### 3. El grupo "Ya le mandamos todo — falta que el cliente valide" mezcla tres situaciones
- **Qué pasa.** El grupo es la etapa `c` de Odoo (`x_hab_fecha_envio` con valor), o sea "se mandó **al menos un** papel". Hoy contiene:
  - **1236 Av. Corrientes 4285**: 1/1 **aprobado**. El cliente ya validó todo y falta que **nosotros** apretemos "Habilitar obra". No hay grupo ni señal de "lista para habilitar".
  - **1210 LAS FLORES 701**: 5/8 aprobados.
  - **1288**: 0/1.
- **Además.** La guía dice "le mandaste al menos un papel", que es lo correcto; el título del grupo dice "todo".
- **Dónde.**
  - `src/lib/habilitaciones/derivacion.ts:215`, que es el título;
  - `src/lib/habilitaciones/derivacion.ts:244-245`, que es `grupoDe`.

### 4. Modo oscuro: hay cajas con el texto ilegible (y es el tema por defecto)
- **Qué pasa.** Varias cajas tienen el fondo claro fijo en `style` y el texto con el color del tema, que en oscuro es claro. Resultado: texto claro sobre fondo claro.
- **Cajas confirmadas en captura:**
  - **El veredicto**, el título sobre todo ("Se puede armar, con pendientes…"). Es lo primero que se lee. `[otId]/page.tsx:140-144`. Captura: `ficha-10-veredicto-oscuro-1210.png`.
  - **"Recién llegada — falta definir si aplica"** y su botón "No aplica". `[otId]/page.tsx:278`. Captura: `ficha-50-barras-pospuesta-y-triage-oscuro-1235.png`.
  - **"Pospuesta hasta el…"** y los botones "Cambiar fecha" / "Reactivar". `[otId]/page.tsx:352-354`. Misma captura.
  - **El permiso "Sin definir… esperando a…"** y su botón "Registrar pedido a…". `columna-permiso.tsx:141`. Captura: `ficha-12-columna-permiso-1210.png`.
  - **La caja de "Habilitar por excepción"**: la ayuda, el texto que se escribe en el textarea y "Cancelar". `bloque-habilitacion.tsx:174`. Captura: `ficha-30-habilitar-excepcion.png`.
  - **Un requisito observado**: el nombre y el botón "Corregir y reenviar". `listado-requisitos.tsx:188`. Captura: `ficha-21-requisito-observado.png`.
  - **El diálogo de posponer cuando "no se puede posponer"**. `dialogo-posponer.tsx:115`. Captura: `dialogo-posponer-dentro-de-10-dias-1204.png`.
  - **El aviso amarillo de desincronizadas** y su botón "Reintentar". `habilitaciones/page.tsx:180`. Captura: `bandeja-21-INYECTADA-aviso-desincronizadas.png`.
  - **El encabezado rojo de los grupos urgentes** (crítica y atrasada): el título no se lee. `habilitaciones/page.tsx:595`. Captura: `bandeja-20-INYECTADA-…`.
- **Mismo patrón, sin captura propia:**
  - el bloque "Habilitada el…" (`bloque-habilitacion.tsx:58`);
  - la nota fijada (`notas-obra.tsx:62`);
  - la caja de error de sync (`[otId]/page.tsx:201`).
- **En claro está todo bien:** `ficha-60-CLARO-1210.png`, `ficha-61-CLARO-1235-…png`.

### 5. Se puede habilitar (y consultar) una obra que todavía no se trió, y queda en un estado incoherente
- **Qué pasa.** `BloqueHabilitacion` sólo se esconde con `triage === "no_aplica"`. Con `triage = null` ("Recién llegada") muestra igual "Habilitar obra", "Habilitar igual, por excepción" y "Ya le consulté al cliente".
- **Qué queda si se habilita así.** La obra queda con `habilitada_el` y `triage` nulo:
  - Odoo la pinta de verde;
  - en la bandeja sigue en **"Recién llegadas"** (`grupoDe` mira primero el triage);
  - **no** aparece en "Habilitadas", porque ese filtro exige `triage === "aplica"`.
- **Repro.** Probado en 1235 (Huergo 1145, sin triar): el POST `/api/habilitaciones/1235/habilitacion {habilitar:true, faltan:1, motivo}` se cortó.
- **Dónde.**
  - `src/components/habilitaciones/bloque-habilitacion.tsx:33`;
  - `src/lib/habilitaciones/servicio.ts:264-266`;
  - `src/lib/habilitaciones/derivacion.ts:241`.

### 6. El veredicto contradice al tablero en desarmes y en obras que "no llevan permiso"
- **Qué pasa.** `veredicto()` usa `friccionAlConfirmar`, que no mira el tipo de OT ni `llevaPermiso`. El tablero usa `friccionDelTablero`, que sólo frena armados y ampliaciones. Casos reales:
  - **581 Billinghurst 2330 (desarme)**: "Se puede armar, con pendientes · Falta el número de expediente". El tablero no lo pide para un desarme, y la palabra es "armar". Captura: `ficha-57-CLARO-…-581.png`.
  - **233 Callao 1810 (desarme habilitado)** y **1288 (desarme)**: "Falta la modalidad de permiso".
  - **1212 Av. Forest (no lleva permiso)**: el veredicto dice "Falta la modalidad de permiso". Dos centímetros más abajo, la columna dice "No lleva permiso de implantación: no hay trámite que gestionar" y ofrece igual "Registrar pedido a RIVEROS,". Captura: `ficha-55-no-lleva-permiso-1212.png`.
  - **1002 (no aplica, habilitada)**: "Se puede armar, con pendientes", por la modalidad vacía de una venta vieja.
- **Además.** "Se puede armar, con pendientes" sale en caja **verde** con tilde aunque falte la documentación.
- **Dónde.**
  - `src/lib/habilitaciones/derivacion.ts:481-524`, sobre todo `:486`;
  - `src/components/habilitaciones/columna-permiso.tsx:84-131`: muestra la modalidad y el pedido aunque `llevaPermiso === false`.

### 7. El permiso: "Sin definir hace 0 días" siempre, y el botón dice "Registrar pedido a STEPANSKY,"
- **Los días.** `diasEntre(permiso.modalidadDefinida ?? hoyISO(), hoyISO())` sólo se evalúa cuando `modalidadDefinida` es null, así que siempre es `diasEntre(hoy, hoy) = 0`. Está en `columna-permiso.tsx:47-51`.
- **El nombre.** `tecnicoNombre.split(" ")[0]` sobre "APELLIDO, Nombre" (formato de `hr.employee`) devuelve "STEPANSKY,", con la coma. Está en `columna-permiso.tsx:162`.
- **Captura.** `ficha-61-CLARO-1235-…png`.

### 8. Cambiar la modalidad de permiso desde la ficha no deja rastro
- **Qué pasa.** La ruta escribe la modalidad en la venta de Odoo **siempre**. Al historial sólo la manda si se estaba **definiendo** (`definiendo = modalidad && !enOdoo.permiso.modalidad`).
- **Ejemplo.** Pasar de "esperar permiso emitido" a "sin expediente ni permiso" saca el bloqueo del tablero y no queda en ningún lado quién lo hizo.
  - Probado en 1204: PATCH `{modalidad:"sin_permiso"}` sobre una venta "lleva permiso · esperar permiso", cortado.
  - Borrar el número de expediente tampoco se registra.
- **Además.**
  - Desde el 4/9 la modalidad la contesta Comercial al cotizar y es obligatoria para confirmar la venta, pero la ficha la sigue ofreciendo como botones editables, incluso cuando "No lleva permiso".
  - No hay forma de volver a "sin definir" ni de dejar el trámite vacío.
- **Dónde.**
  - `src/app/api/habilitaciones/[otId]/permiso/route.ts:50-60`;
  - `src/components/habilitaciones/columna-permiso.tsx:106-131`.

### 9. El historial no dice qué papel se mandó, aprobó u observó
- **Qué pasa.** `hab_mover_requisito` guarda como detalle **el motivo** (o null), no el nombre del requisito. Hoy en producción hay:
  - 109 "Envío" sin detalle;
  - 53 "Aprobación" sin detalle.
- **Más ruido en el mismo tipo.** "Aprobación" se usa también para "Obra habilitada" y para "Se revirtió la habilitación".
- **Por qué importa.** El argumento del módulo es "poder demostrar que reclamaste tres veces"; para un papel puntual, no se puede.
- **Repro.** Ficha de 1210: el historial muestra cinco "Aprobación" sin texto. Captura: `ficha-1210-validacion-con-syh.png`.
- **Dónde.** `supabase/migrations/20260904000001_habilitaciones_mover_requisito.sql:122` (y `:111-118`).

### 10. "Corregir y reenviar" conserva la fecha del primer envío
- **Qué pasa.** Después de reenviar un observado, la fila sigue diciendo "Enviado el 24 sep · 15 d sin respuesta", aunque se haya reenviado hoy. La fecha usa `COALESCE(fecha_envio, current_date)` y no se pisa.
- **Por qué importa.** El "días sin respuesta" del reenvío queda inflado.
- **Dónde.** La misma migración, `:94-96`. La UI está en `listado-requisitos.tsx:181-199`.

### 11. El desplegable de paquetes muestra el UUID después de aplicar uno
- **Qué pasa.** Al elegir "Completo", el `Select` (no controlado) queda mostrando `c49701aa-e4e0-47a7-9144-67…` en lugar del nombre: `SelectValue` muestra el `value` crudo.
- **Captura.** `ficha-25-paquete-aplicado-mock.png`.
- **Dónde.** `src/components/habilitaciones/listado-requisitos.tsx:119-139`.

### 12. Borrar no pide confirmación ni deja rastro (requisitos, adjuntos y "Volver a pendiente")
- **El tacho del requisito.**
  - Borra en un clic incluso un requisito **aprobado** (probado con "E.P.P" de 1210).
  - No escribe nada en `hab_gestiones`.
  - Deja huérfanos sus archivos en Storage: `borrarRequisito` sólo borra la fila.
- **La X del adjunto.** Borra del bucket sin confirmar y sin registrar.
- **Subir un archivo.** Usa `upsert: true`: con el mismo nombre pisa el anterior sin aviso.
- **"Volver a pendiente".**
  - Está en el mismo lugar donde estaba "Aprobar", así que es un clic fácil de errar.
  - Deshace una aprobación sin dejar nada en el historial (la función SQL no registra el paso a `pendiente`).
- **Por qué es una contradicción.** El recorrido y la guía dicen "no se puede borrar nada del historial — un error se corrige agregando, no tapando". Las tres cosas de arriba lo contradicen.
- **Dónde.**
  - `listado-requisitos.tsx:230-242` y `:350-357`;
  - `src/lib/habilitaciones/servicio.ts:914-921`;
  - `src/hooks/use-habilitaciones.ts:363` (upsert);
  - la migración `20260904000001`, `:111-118`.

### 13. Volver a habilitar una obra revertida no le avisa a Operaciones
- **Qué pasa.** Los avisos `ot_habilitada` y `ot_deshabilitada` usan `claveDe(tipo, otId)` sin sufijo: uno por OT **para siempre**. El ciclo queda así:
  1. Habilitar avisa.
  2. Revertir avisa, en crítico, por campanita y por Slack de logística.
  3. Volver a habilitar **no avisa nada**.
- **Por qué importa.** Operaciones queda con el último aviso "se revirtió, revisá las jornadas", y nunca se entera de que se volvió a habilitar.
- **Contexto.** El comentario del código lo asume ("cuenta novedades, no transiciones"), pero en este par el silencio es el caso peligroso.
- **Dónde.** `src/app/api/habilitaciones/[otId]/habilitacion/route.ts:86-106`.

### 14. El chinche ya no lleva la nota al tablero, pero el recorrido y la guía dicen que sí
- **Qué pasa.** Desde la separación de hilos (2d562d9), el tablero sólo lee `ambito = 'operaciones'`.
  - `src/app/api/planificacion/comentarios/route.ts:26`;
  - `src/app/api/ordenes-trabajo/[id]/comentarios/route.ts:8`.
- **Qué hace hoy el chinche.** Sólo ordena la nota arriba en la ficha y pone un chinche en la fila de la bandeja.
- **Textos que dicen lo contrario.**
  - `src/lib/habilitaciones/tour.ts:195`;
  - `src/app/(dashboard)/habilitaciones/ayuda/page.tsx:227-229`.

### 15. El recorrido de la ficha no arranca solo (al menos en desarrollo)
- **Qué pasa.** `useTour` marca "visto" **antes** de abrir y programa `setTimeout(abrir, 350)`; la limpieza del efecto cancela ese timeout.
  - En la ficha `listo` es siempre `true`.
  - Con React Strict Mode, que viene prendido por defecto en el App Router en dev, el efecto corre dos veces: la primera marca y la limpieza cancela; la segunda ve "visto" y sale.
  - Resultado: el recorrido de la ficha **nunca arranca solo en dev**. Medido: `abrioSolo:false` con marca "visto" (`evidencia/recorridos.json`).
- **En la bandeja sí arranca.** Ahí `listo` pasa de false a true y la segunda pasada programa el timeout.
- **"Ver el recorrido de nuevo" de la guía** depende del arranque automático. En dev no abrió nada en 30 s, porque la bandeja ya estaba en caché y `listo` arrancó en true.
- **En producción** debería andar, porque no hay doble montaje, pero el efecto no es idempotente. Cualquier re-render que cambie `abrir` o `listo` lo cancela igual. **Sin probar en producción.**
- **Dónde.** `src/hooks/use-tour.ts:63-74`.

### 16. Las etapas de la ficha marcan como cumplidos pasos que no pasaron
- **Qué pasa.** En "Documentación del cliente", una obra en etapa `c` pinta en verde "Nuestra — falta consultarle…" y "Del cliente — tiene que decir qué papeles pide" (sin fecha), aunque la consulta nunca se registró. Es el caso de todas las de hoy.
- **Además.** El título de la columna repite el "· 0 d" del punto 1.
- **Dónde.** `src/app/(dashboard)/habilitaciones/[otId]/page.tsx:405-436`.

---

## B. Errores menores y de texto

- **"1 observado quedan afuera: hay que corregirlos."** Falla la concordancia en singular. `listado-requisitos.tsx:172`.
- **El reloj de posponer aparece en todas las filas**, también en las que no se pueden posponer (las que van dentro de los 10 días). Recién el diálogo dice que no. `fila-bandeja.tsx:148-159`. Captura: `dialogo-posponer-dentro-de-10-dias-1204.png`.
- **Triage por lote sin selección**: "Aplica" / "No aplica" actúan sobre **todo** el grupo sin pedir confirmación, y el único aviso es la palabra "todas" en gris.
  - Deshacer es de a una, desde "No aplican → Volver a la cola". No hay deshacer en el toast.
  - Probado con datos inyectados: `{otIds:[1002,1018,1022,1245], decision:"no_aplica"}`.
  - Código: `habilitaciones/page.tsx:583-627`.
- **El toast de "Aplica" dice "se creó la Nómina ART"** aunque la obra ya tuviera requisitos (en ese caso no se siembra nada). `habilitaciones/page.tsx:86` y `servicio.ts:725-747`.
- **Revertir desde la bandeja pide confirmación y desde la ficha no.** El aviso a Operaciones es el mismo, crítico. `bloque-habilitacion.tsx:69-83`.
- **Borrar el vencimiento puede no guardarse.** El campo compara contra `ficha.vencimiento`, que viene de Odoo. El push a Odoo sale en `after()`, así que si la ficha se relee antes de que llegue, una fecha recién guardada sigue figurando como vacía, y borrarla no dispara el PATCH.
  - Lo vi con el mock: cargar y después borrar mandó sólo el primer PATCH.
  - En real depende de la carrera. Lo dejo como **posible**, sin confirmar.
  - `[otId]/page.tsx:466-474`.
- **"Odoo avisa solo al pasar la fecha" (al lado del vencimiento).** No hay ningún aviso de vencimiento: no existe un tipo de alerta así en `src/lib/alertas/servicio.ts:34-53`. Lo único que pasa es que la obra entra al grupo "Vencen en menos de 30 días" de la bandeja. `[otId]/page.tsx:477-479`.
- **"El cliente contrató técnico de Seguridad e Higiene"** se puede leer como "el cliente tiene su propio técnico". El campo `x_syh_presencial` significa que ABA pone el técnico (`src/lib/odoo/trabajo.ts:84-92`). Es redacción, no lógica: el requisito que se siembra ("Documentación de técnico de SyH") es coherente.
- **"Ver en el tablero"** lleva a `/planificacion` en general, no a la semana ni a la obra. `fechas-obra.tsx:71-76`.

---

## C. Riesgos que no pude confirmar con datos

- **`x_hab_semaforo` y `x_hab_alerta` son `store=True` y calculan con `datetime.date.today()`.** Dependen de campos, no del día: pasar la fecha de vencimiento o entrar en la ventana de 3 días no los recalcula hasta el próximo write.
  - Hoy **no** encontré ninguno desfasado: las 81 OTs activas tienen `x_hab_alerta` igual a lo que daría hoy.
  - Sólo una obra cargó vencimiento alguna vez (1086), y está completada.
  - Hay que mirarlo el día que una obra en rojo entre a menos de 3 días sin que nadie la toque.
  - Si se confirma, "el semáforo cambia cuando ya venció" (recorrido y guía) y los grupos "Se arman en 3 días" y "Fecha pasada" quedan atrasados.
- **La vuelta de las pospuestas y sus avisos** se calculan sólo cuando alguien abre la bandeja (`resolverPospuestas` en `fetchBandeja`). Ya estaba anotado como pendiente. Si nadie la abre, la obra no "vuelve sola" ni avisa.

---

## D. Qué escribe la bandeja con sólo abrirla (GET)

Lo dejo acá porque contradice la idea de que mirar no toca nada. `fetchBandeja` puede escribir esto:
- sembrar `hab_ots` de OTs nuevas, con aviso `ot_nueva` a campanita y Slack (#syh y #logística);
- sembrar el requisito "Documentación de técnico de SyH";
- mover las pospuestas: escribe en `hab_ots`, en `hab_gestiones` y manda avisos `hab_pospuesta` a Slack #syh.

`fetchFicha` también siembra y avisa si la OT es nueva.

**En esta prueba no escribió nada.** Comparé la base antes y después (`evidencia/db-antes-conteos.json` y `evidencia/db-despues-conteos.json`):
- `hab_gestiones` 1086 → 1086;
- `hab_requisitos` 383 → 383;
- `ot_comentarios` 188 → 188;
- `hab_ots` sin `updated_at` nuevo;
- la única alerta nueva (20:11) es `permiso_robot`, del robot de TAD, ajena a esta prueba.
