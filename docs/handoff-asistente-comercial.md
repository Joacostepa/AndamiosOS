# Handoff — Asistente comercial (actualizado 2026-09-26, a la noche)

Para retomar en una sesión nueva. Cómo funciona el módulo, cómo se configura y cómo se prueba
está en `docs/modulo-asistente-comercial.md`; esto es el estado, lo que falta y el orden para
seguir. El plan original (aprobado el 26/09) está en
`~/.claude/plans/buenas-ahora-quiero-que-flickering-haven.md`.

Para arrancar: "Leé docs/handoff-asistente-comercial.md y docs/modulo-asistente-comercial.md y
seguimos con lo que falta". **Empezar por § "Lo primero en la sesión nueva".**

---

## Estado al cierre del 26/09

En producción: `https://andamios-os.vercel.app/comercial/asistente` y `/comercial/parametros`.

| Qué | Estado |
| --- | --- |
| Chat: texto, dictado, fotos, planos, audios transcriptos | ✅ En producción |
| Presupuestos: motor, borrador, PDF, guardar en Odoo con confirmación, re-emitir, mail | ✅ Probado punta a punta contra Odoo real |
| Consultas de Odoo y pendientes del día | ✅ |
| Tablero de planificación (sólo lectura) | ✅ Desde `c9cc288` |
| Voz en vivo (ElevenLabs) | ✅ Probada por el agente real en modo texto y por JS desde la app |
| Opcionales estándar (concertina, técnico de SyH, memoria de cálculo) | ✅ Desde `2ddfa47`, con el criterio v2 (ver § siguiente) |
| Mensaje de WhatsApp para el cliente, solo y con su nombre | ✅ 26/09 a la noche (ver § más abajo) |
| A Odoo va sólo la base (sin opcionales) | ✅ 26/09 a la noche; S02715 y S02716 corregidas |
| Buscador de conversaciones, archivar y eliminar las vacías | ✅ 26/09 a la noche (ver § más abajo) |
| Voz en vivo más fluida (ElevenLabs, esfuerzo `low`, respuestas descartadas) | ✅ `0ea373a` (ver § más abajo) |
| Frente del lote verificado contra el catastro de la Ciudad | ✅ 26/09 a la noche (ver § más abajo) |
| WhatsApp | Construido y probado simulando a Meta. **Sin configurar: lo postergó JS** |
| Parámetros de cotización (7 pestañas) | ✅ |

**Commits en main:**

- `d4538c5`: el módulo;
- `c9cc288`: el tablero y la doc de ElevenLabs;
- `2ddfa47`: los opcionales estándar y este handoff;
- `de3a070`: el mensaje de WhatsApp y la base sola en Odoo;
- el siguiente: el buscador de conversaciones.

**Base y servicios:**

- **Supabase:**
  - migraciones `20260926000001` a `…08` aplicadas. La `…06`, después del deploy de `2ddfa47`;
    la `…07` (la búsqueda), antes del deploy del buscador; la `…08` (criterio v3), después de
    `29d73c2`;
  - criterio v3 vigente (el frente del lote contra el catastro);
  - lista de alquiler JUN26 (48 piezas) activa.
- **Odoo:** campo `sale.order.x_asistente_ref` (id 37954).
- **ElevenLabs:**
  - la cuenta es de JS;
  - el agente es "Asistente ABA" (`agent_6901m3exw16xeykr468230jm6t73`), configurado por API;
  - la voz la eligió JS: femenina argentina, `2KrcT8wE5IyKnWz2nknz` (la de fábrica era
    *Eric*, `cjVigY5qzO86Huf0OWal`);
  - las variables `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` y `ELEVENLABS_LLM_SECRETO` están en
    Vercel (Production) y en `.env.local`.
- **Sin datos de prueba:** base, Storage y Odoo verificados limpios. En ElevenLabs
  (Conversaciones) quedan unas charlas de prueba.
- **Usuarios:** por ahora lo usa sólo Joaquín (admin). Gabriel y Jorge todavía no tienen usuario.

### Opcionales estándar (26/09 a la tarde)

**Pedido de JS:** en toda bandeja y fachada tienen que salir, como opcionales:

- la concertina, al 10 % del metro lineal (ya existía como parámetro; ahora sale por defecto);
- el técnico de Seguridad e Higiene, a $ 250.000 por jornada;
- la memoria de cálculo, a $ 1.250.000 + IVA.

**Cómo quedó:**

- Los agrega solo `opcionalesEstandar` (`src/lib/asistente/borrador.ts`); no depende de que el
  asistente se acuerde.
- El técnico de SyH cobra las jornadas de armado + desarme (una jornada corta cuenta entera). Si
  todavía no se saben las jornadas, no aparece.
- **Pasados los 6 m de altura, la memoria de cálculo va en la base** (Decreto 911/96, criterio
  §6.1), con un aviso. 6 m justos siguen como opcional. **JS lo aprobó el 26/09.**
- Si el vendedor saca un opcional, queda en `opcionalesDescartados` y no vuelve al recalcular.
  Vuelve si se agrega a mano con `agregar_complementario`.
- La concertina sale como opcional si no se dice nada: `cotizar_bandeja` tiene
  `concertina: "opcional"` por defecto.

**Archivos:**

- `src/lib/cotizador/{tipos,tarifas,complementarios,prueba-tarifas}.ts`;
- `src/lib/asistente/{borrador,herramientas}.ts`;
- `src/lib/asistente/opcionales.test.ts` (6 tests nuevos; en total pasan 39);
- las dos migraciones y la documentación.

**Probado** con el asistente real y un PDF de vista previa:

- una bandeja de 12 m.l. da $ 1.680.000 de base, con los opcionales concertina $ 168.000,
  técnico (2 jornadas) $ 500.000 y memoria $ 1.250.000;
- «sacá el técnico» y después «cambiá a 15 m»: el técnico no vuelve y la concertina pasa a
  $ 210.000.

**Migraciones (las dos aplicadas el 26/09, en este orden):**

1. `20260926000005`: agrega los parámetros `syh_jornada` e `ingenieria_memoria`. Se aplicó antes
   del deploy.
2. `20260926000006`: se aplicó después del deploy de `2ddfa47`. Hizo tres cosas:
   - creó el criterio v2, con cuatro líneas cambiadas (§3.3, §4.8 y el punto 11 del checklist);
   - renombró `ingenieria` a "Ingeniería — obras complejas";
   - borró el rango viejo `syh`.

Verificado después:

- criterio v2 vigente y único;
- el motor carga las tarifas nuevas;
- las conversaciones nuevas arrancan con el v2;
- el historial registra los cuatro cambios.

### Mensaje de WhatsApp para el cliente (26/09 a la noche)

**Pedido de JS** (charla de la S01917 → S02716): que junto con el PDF final salga solo el
mensaje para el cliente, dirigido a él por su nombre y amable. Antes había que pedirlo, y salía
"Hola, ¿cómo estás?" sin nombre porque el borrador no tenía contacto.

**Cómo quedó:**

- La plantilla está en `src/lib/asistente/mensaje-cliente.ts`, con 5 tests. Saluda por el
  nombre, nombra la obra (lo que viene en mayúsculas de Odoo pasa a "Riobamba 651") y, si es
  una re-emisión, dice "la propuesta actualizada".
- El nombre de pila lo pasa el modelo (`mensaje_whatsapp.nombre`). En Odoo los particulares
  están de las dos maneras ("NAVALLES VERONICA", "Diego Izzo") y hay empresas con CUIT 20, así
  que con una regla se saludaría mal.
- Sale solo por dos vías: el resultado de guardar trae un `siguiente` que se lo pide al
  modelo (así vale para las conversaciones ya abiertas) y las instrucciones lo dicen para las
  nuevas.

### A Odoo va sólo la base (26/09 a la noche)

**El problema:** los opcionales se cargaban en la orden como líneas con `is_optional`, pero
Odoo 19 las suma igual al `amount_untaxed`, y la oportunidad del CRM copia ese total. Pasaba
en cada bandeja y fachada desde `2ddfa47`, y es el aviso naranja "Odoo calculó un neto…".
Antes del 26/09 no había ninguna línea `is_optional` en Odoo.

**Lo que decidió JS:** a la orden va sólo la base, como hacía la skill ("la base + los
opcionales que el cliente acepte").

- Los opcionales y los adicionales quedan en el PDF adjunto y en una lista de la nota
  interna, con su precio. Si el cliente acepta uno, se agrega en ese momento.
- El resumen que se confirma lo avisa en la línea "Sólo en el PDF, no en la orden".
- Se sacó `LineaOrden.opcional` (`src/lib/odoo/presupuestos.ts`): ya no se escribe
  `is_optional`. `comercial.ts` lo sigue leyendo para las órdenes viejas.

**Órdenes corregidas en Odoo el 26/09**, con una nota en cada una que lista lo que se sacó:

| Orden | Cliente | Antes | Después |
| --- | --- | --- | --- |
| S02715 | Karina Rosso | $ 5.796.000 | $ 3.360.000 |
| S02716 | Fernando Mena | $ 3.640.000 | $ 1.890.000 |

Las oportunidades 3539 y 3541 se acomodaron solas. No quedan líneas `is_optional` en Odoo.

**Sin probar contra Odoo real:** la prueba punta a punta (`scripts/test-asistente-e2e.mts`,
~US$ 1). Pide `amount_untaxed === 12 × 140.000`, así que desde `2ddfa47` tendría que haber
fallado; con este cambio vuelve a cerrar. Correrla antes del piloto.

### Buscador de conversaciones (26/09 a la noche)

**El problema** (pedido de JS): la lista muestra las últimas 40 y los títulos son el primer
mensaje ("...", "Hola, ¿cómo estás?"). El botón de archivar aparecía sólo al pasar el mouse
(en el celular, nunca) y JS no sabía que existía.

**Cómo quedó:**

- **Búsqueda:** `asistente_buscar` (migración `…07`, con `unaccent`).
  - Encuentra las conversaciones con TODAS las palabras, en cualquier orden, sin acentos,
    entre el título, el cliente, el contacto, la obra, el número de Odoo y el texto de los
    mensajes (`humano` y `asistente`).
  - Incluye las archivadas.
  - Devuelve también el mensaje donde aparecen más palabras. El recorte y el resaltado están
    en `src/lib/asistente/busqueda.ts` (5 tests).
  - La función la puede ejecutar sólo `service_role`: con `p_todos` devolvería charlas
    ajenas. Verificado que con la clave anon da `permission denied`.
- **Admins:** un admin busca en las de todos (decisión de JS). Las ve marcadas "de Fulano",
  sin menú y en sólo lectura.
- **Lista:** cliente y obra debajo del título. Sale del borrador (`completarListado` en
  `datos.ts`), pasado por `prolijo`.
- **Archivar y desarchivar:**
  - menú "⋯", visible siempre en el celular;
  - aviso con "Deshacer";
  - escribir en una archivada la devuelve a la lista (`agregarMensajes`).
- **Eliminar:** sólo si no tiene mensajes y el borrador no está en Odoo
  (`eliminarConversacionVacia`; la API responde 409 si no). Las que tienen mensajes son el
  respaldo de lo que se guardó en Odoo y la fuente del gasto del día: borrarlas reiniciaría
  el tope.
- **Rendimiento:** recorre el texto de todas las conversaciones en cada búsqueda. Con cientos
  va sobrado; con decenas de miles, pasar a una columna de búsqueda guardada.

**Probado contra la base real:**

- la búsqueda con y sin acentos, varias palabras, número de Odoo y cliente;
- el permiso de la función;
- el borrado de una vacía de prueba y el rechazo de una con mensajes.

La pantalla no la probó Claude, que no tiene login.

### Frente del lote contra el catastro (26/09 a la noche)

**Pedido de JS:** en bandejas y estructuras "siempre hay que verificar los metros de fachada
del lote". El criterio ya lo decía ("en CABA se verifica el frente contra la parcela
(Dateas)"), pero el asistente no tenía cómo hacerlo.

**Cómo quedó:**

- **Herramienta** `verificar_frente_lote`, que consulta el catastro público del GCBA
  (`src/lib/catastro/`; detalle en el doc del módulo, § "Frente del lote").
- **Bloqueo:** faltante `frente_lote` (`chequeoLote` en `borrador.ts`). Aplica en CABA, con
  bandeja o fachada, mientras el frente no esté verificado para la dirección actual.
- **Avisos que no bloquean:**
  - `frente_mayor` y `frente_menor`, con tolerancia de 1 m o 5 %;
  - `esquina`, que es advertencia hasta que se anote `decisiones.esquina`.
- **Dónde queda:** el lote se guarda en `datos.obra.lote`. Sólo lo escribe la herramienta; el
  esquema de `actualizar_borrador` no lo acepta.
- **Tests:** 5 de la medición (`frentes.test.ts`) y 8 del motor (`lote.test.ts`).

**Probado contra el catastro real:**

| Dirección | Resultado |
| --- | --- |
| Riobamba 653 | 7,84 (AGIP 7,84) |
| Navarro 2369 | 27,04 (AGIP 27,02) |
| Chile 865 | 14,90 (AGIP 14,72) |
| Esmeralda 570 | Esquina: 25,93 + 35,82 |
| Riobamba 651 y Arengreen 655 | Puertas no oficiales: devuelve las vecinas |
| Riobamba 651, Lomas de Zamora | Fuera de CABA |

Tarda de 0,1 a 1,2 s.

**Sin probar:** una charla real con el asistente, para ver que llame a la herramienta apenas
tiene la dirección. Cuesta ~US$ 1.

**Pendiente para JS:**

- **Provincia:** ARBA (IDEBA) tiene los dibujos de las parcelas, pero sin frente ni números de
  puerta. Cerca de una dirección aparecen ~9 candidatas, así que se podría estimar pero no
  verificar. Por ahora sigue el criterio: el frente lo da el cliente.

**Criterio v3** (migración `20260926000008`, aplicada el 26/09 a pedido de JS). Cambian los
puntos 3 y 4 de Geometría:

- el frente se verifica SIEMPRE contra el catastro (`verificar_frente_lote`), ya no en Dateas;
- si la altura no es oficial, se pregunta cuál de las vecinas es;
- si los m.l. no cierran, se pregunta por qué;
- la esquina se anota como decisión «esquina».

Verificado que las conversaciones nuevas arrancan con el v3. Las abiertas siguen con el v2,
pero la herramienta y el bloqueo ya rigen para todas.

### Voz en vivo más fluida (26/09 a la noche)

**Lo que dijo JS:** "no es fluido, se siente súper robótico, se corta mucho cuando escucha
otra cosa si está abierto el micrófono".

**Lo que mostró su charla de las 17:17** (ElevenLabs `conv_5301m3fnta45egjvqkgb5kd4x1pn` más
nuestra base):

1. **La frase de espera iba en casi todas las respuestas.** La primera palabra tardaba 2,5 a
   4,4 s y la frase salía a los 3 s: "Dale, dejame ver... Dale, …".
2. **ElevenLabs descartó 6 de 14 respuestas** porque JS siguió hablando después de una pausa.
   Las nuestras quedaron guardadas, y el asistente contestaba sobre cosas que nadie escuchó.
3. **Tomó como de JS una conversación de al lado.**
4. **Un "Todavía estoy terminando lo anterior"**: el turno descartado no había soltado el
   candado.
5. **A los 7 s de silencio, ElevenLabs le hizo retomar la charla** (le manda "...").

**Lo que se cambió:**

- **ElevenLabs** (por API, el 26/09; la copia de antes quedó en el scratchpad de la sesión, no
  en el repo):
  - detección de voces de fondo encendida;
  - `turn_eagerness` en `patient`;
  - `turn_timeout` en 20;
  - que ajá, ahá, mhm, ok y okey no interrumpan.

  Verificado que cambiaron sólo esos cuatro campos.
- **Parámetros:** `asistente_esfuerzo_voz` de `medium` a `low`, con motivo en el historial.
- **Código:**
  - frase de espera a los 4,5 s y sin "Dale";
  - ya no sale al arrancar una herramienta;
  - espera de hasta 12 s si el turno anterior no soltó el candado;
  - nota de continuación (`src/lib/voz/continuacion.ts`, 4 tests);
  - en voz, el contexto de cada turno pide frases naturales y sin muletillas, y dice qué
    hacer con el "...".

  Todo esto rige también en las charlas abiertas.

**Falta:**

- **Medir la latencia con `low`.**
- **Que JS lo pruebe.** Recordarle que si tiene abierta la pantalla del agente en
  ElevenLabs, la recargue antes de guardar nada.
- **Decisión de JS: probar la voz con `eleven_v3_conversational`** (modo expresivo: más
  natural, ~280 ms, 70+ idiomas). No conserva las características de voces clonadas
  profesionales, así que la voz argentina que eligió puede sonar distinta. Hoy es
  `eleven_flash_v2_5`, la más rápida y la más plana. Se cambia y se vuelve con un solo
  `PATCH`.
- **Idea para obra: "mantener apretado para hablar"** (micrófono apagado salvo mientras se
  aprieta). Con ruido de obra, es lo único que corta el problema de raíz. No se hizo.

---

## Lo primero en la sesión nueva

1. **Preguntarle a JS cómo le va** con el chat, los audios y la voz en el celular. La pantalla
   nunca la probó Claude: no tiene login, y no hay que crear usuarios ni entrar como otro para
   probarla.
   - Si falla la voz, mirar primero la charla en ElevenLabs (Conversaciones) y los logs de Vercel
     de `/api/comercial/asistente/voz/llm`.
   - En la primera prueba de JS, el micrófono tomó una conversación de al lado: en lugares con
     gente hablando conviene el botón de silenciar.
2. **Mirar el uso real.** En `asistente_conversaciones` y `asistente_mensajes` están el canal,
   `uso` y `modelo_servido` de cada pedido. Hay que ver cuánto gasta y cuánto tarda con uso de
   verdad antes de dárselo a Gabriel y Jorge.
3. **Si JS trae correcciones**, seguir § "Cómo se va a ir mejorando".
4. **Preguntarle si probó el buscador y el menú "⋯" en el celular.** Si guardó un presupuesto
   nuevo, preguntarle si le salieron solos el mensaje de WhatsApp y la orden sin opcionales.

---

## Cómo se va a ir mejorando (acordado con JS el 26/09)

JS va a ir pasando correcciones de cómo se comporta el asistente: qué tiene que preguntar, qué
sobra, cómo contesta. Para cada una:

1. **Leer la charla de la base.** JS dice cuál es (día, hora o tema) y se busca en
   `asistente_mensajes`; no hace falta que la copie.
2. **Decidir dónde va:**
   - las reglas de cotización van en el criterio (Parámetros → Criterio: versionado, sin deploy;
     JS lo puede editar o se le pasa el texto);
   - el comportamiento del asistente va en `INSTRUCCIONES` (`src/lib/asistente/prompt.ts`);
   - lo que bloquea guardar va en `faltantesParaEmitir` (`borrador.ts`);
   - los números van en Tarifas;
   - lo que el motor tiene que hacer siempre va en el motor (como los opcionales estándar).
3. **Recordarle que los cambios de criterio o de instrucciones se ven en una conversación nueva.**
   Cada conversación queda con las que tenía al crearse. Las tarifas son la excepción: rigen al
   instante.
4. **Convertir la corrección en un caso de prueba**, para que un arreglo no rompa otra cosa
   (ver "Guiones para evaluar", abajo).

También se le propuso a JS un botón "esto estuvo mal" en cada respuesta del chat, para que
Gabriel y Jorge dejen anotado lo que no les sirvió. No contestó: queda como idea.

---

## Lo que falta

### De JS (no se puede hacer desde acá)

- **Si se toca el agente en la pantalla de ElevenLabs**, recargar la página antes: la
  configuración se hizo por API, y guardar una página abierta de antes la pisa.
- **Dar de alta a Gabriel y Jorge** con `asistente-comercial` (editar) y `planificacion` (ver).
  - Sin Planificación, el asistente no les muestra el tablero.
  - Con rol comercial, **no admin**: un admin puede abrir y buscar las charlas de todos.
    Cada vendedor ve sólo las suyas (pantallas y RLS). JS lo sabe desde el 26/09.
  - Decisión pendiente: ¿también las asistentes comerciales?
- **Revisar las tarifas.** Son las del criterio v2 (julio y agosto) y nadie las tocó desde la
  carga. Se le ofreció compararlas con lo cobrado en las órdenes de Odoo del último mes.
- **Rotar la API key de Odoo**, que está en texto plano en la skill
  (`~/Downloads/andamios-propuesta.skill`, archivo `references/odoo.md`).
- **Piloto:** 5 presupuestos reales en paralelo con la skill, comparando número por número, antes
  de dárselo a Gabriel y Jorge.
- **Opcional:** regenerar la API key de ElevenLabs, que pasó por el chat el 26/09, y actualizarla
  en Vercel y en `.env.local`.
- **WhatsApp (postergado):**
  1. app de Meta, número dedicado, 4 variables y webhook (paso a paso en el doc del módulo,
     § WhatsApp);
  2. después, cargar los WhatsApp en Parámetros → Vendedores (sólo un admin).

### De código

- **Pantalla de uso del asistente.** Estaba en el plan y no se hizo: costo y cantidad de pedidos
  por persona y por mes. Sale de `asistente_mensajes.uso`; el precio por modelo está en
  `costoUsd` (`src/lib/asistente/datos.ts`). Va como pestaña nueva en Parámetros.
- **Guiones para evaluar el asistente** (plan § 14): 12 a 15 casos sacados de propuestas reales,
  más las correcciones de JS. Tienen que comprobar que:
  - pregunte jornadas y render;
  - use el motor;
  - avise el mínimo, la esquina y el conflicto de canal;
  - no ejecute nada sin confirmación;
  - un "no, esperá" no cuente como confirmación;
  - salgan los opcionales estándar.

  Hoy hay pruebas punta a punta (`scripts/test-asistente-*.mts`) y los tests del motor, no un set
  de evaluación. Cada corrida cuesta ~US$ 0,50 a 1 por caso.
- **Latencia en voz.** Molestó (JS, 26/09): ya se bajó `asistente_esfuerzo_voz` a `low`. Falta
  medirla con uso real (ver § "Voz en vivo más fluida").
- **Borrar las 8 claves viejas de `configuracion`** (la lista está en el doc del módulo,
  § Pendiente). No las lee ningún código.
- **Más adelante:** la llamada telefónica. Es el mismo agente de voz con un número de Twilio, y el
  número que llama identifica al vendedor.
- **Chico:** `fallaDeCuenta` y `avisarFallaDeCuenta` siguen en
  `src/lib/permisos-via-publica/falla-ia.ts`. El plan decía moverlas a `src/lib/ia/`.

---

## Reglas que no se leen en el código (o que cuesta encontrar)

- **Las pruebas cuestan plata real.** Por corrida: e2e ~US$ 1, voz ~US$ 0,50, WhatsApp ~US$ 1.
  Todas limpian al final. Si una se corta, borrar a mano:
  - las conversaciones "[PRUEBA…", sus borradores y `propuestas/<borrador>/` en Storage;
  - en Odoo, el cliente "ZZ PRUEBA ASISTENTE SA" con su orden y su oportunidad.
- **Cambiar la forma de un parámetro en dos pasos** (como se hizo con `syh`):
  1. primero se agrega la clave nueva (migración compatible);
  2. se sube el código que la lee;
  3. recién después se borra la vieja.

  `tarifasDesdeParametros` tira error si falta una clave, así que un paso fuera de orden deja al
  asistente sin poder cotizar.
- **Campos nuevos del borrador**: tienen que estar en `borradorVacio()`, porque `aplicarCambios`
  ignora las claves que no conoce y se perderían al leer el borrador guardado.
- **La historia es append-only.** `asistente_mensajes.contenido` es `json` y no `jsonb` a
  propósito; nunca se reescribe un mensaje viejo.
  - El prompt del sistema (instrucciones, criterio y parámetros) se congela en cada
    conversación: un cambio vale para las conversaciones nuevas.
  - Agregar o cambiar herramientas hace que las conversaciones abiertas pierdan el caché una
    vez. No reordenarlas sin necesidad.
- **La confirmación la decide el servidor** (`verificarConfirmacion` + `esConfirmacion`). No
  aflojarla: es lo que evita que un "sí" mal entendido por voz guarde algo en Odoo.
- **ElevenLabs:**
  - `cascade_timeout_seconds` en 15. El de fábrica es 4 s: en un arranque en frío la frase de
    espera llegaba tarde, ElevenLabs repetía el pedido y el turno se procesaba dos veces.
  - LLM de respaldo desactivado: un respaldo contestaría sin ver Odoo ni las tarifas.
  - El override `custom_llm_extra_body` tiene que estar permitido, porque por ahí viaja el token
    de sesión.
  - La clave de `.env.local` puede configurar el agente por API
    (`PATCH /v1/convai/agents/{id}`) y leer sus charlas, pero no leer voces: le falta
    `voices_read`, a propósito.
  - Para probar la cadena real sin navegador:
    1. pedir una URL firmada (`GET /v1/convai/conversation/get-signed-url?agent_id=…`);
    2. abrir el WebSocket y mandar `conversation_initiation_client_data` con `text_only` y
       `custom_llm_extra_body: { asistente: firmarSesionVoz(conversacion, usuario) }`;
    3. mandar `user_message` y responder los `ping` con `pong`.

    Se hizo el 26/09; el script no quedó en el repo.
- **Voz y caché.** Pasar de chat a voz cambia el esfuerzo del pedido, y eso hace perder el caché
  de los mensajes una vez por cambio de canal (~US$ 0,40). No se usó el esfuerzo por mensaje
  (beta `mid-conversation-output-config-2026-07-01`) porque pediría guardar un tipo de mensaje
  nuevo.
- **WhatsApp:**
  - los celulares argentinos van como 549 + área + número; se busca también sin el 9;
  - hay un turno por teléfono (`whatsapp_tomar_turno`);
  - los mensajes se deduplican por `wamid`.
- **Tablero:**
  - el asistente sólo lo lee;
  - usa las mismas funciones que la pantalla (`fetchTablero`, `tareasEnRango`,
    `jornadasPlanTodas`, `ocupacionCelda`, `repartirJornadas`), así que si cambian las reglas
    del tablero, acá cambian solas;
  - exige el permiso de Planificación.
- **Migraciones:**
  - nunca `supabase db push`;
  - primero se ensayan con `scripts/probar-migracion.mjs` y después se aplican con
    `scripts/apply-migration.mjs`, SIEMPRE antes de subir el código que las necesita;
  - `pg` se instala con `npm install pg --no-save`, y cualquier otro `npm install` lo borra.
- **Avisos:** `avisar_a_joaquin` deja el aviso sólo en la campanita (`asistente_aviso` no tiene
  destino de Slack). No forzar avisos reales.

---

## Costos medidos (26/09)

- **Primer turno de una conversación:** US$ 0,45 a 0,50, porque escribe el caché del prompt
  (~34 k tokens).
- **Turnos siguientes:** US$ 0,07 a 0,20.
- **Presupuesto completo conversado:** ~US$ 1 a 3.
- **Tope diario por persona:** US$ 30 (`asistente_tope_diario_usd`, en Parámetros).
