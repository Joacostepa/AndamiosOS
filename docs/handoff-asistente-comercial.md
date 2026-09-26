# Handoff — Asistente comercial (actualizado 2026-09-26, cierre del día)

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
| WhatsApp | Construido y probado simulando a Meta. **Sin configurar: lo postergó JS** |
| Parámetros de cotización (7 pestañas) | ✅ |

**Commits en main:** `d4538c5` (el módulo), `c9cc288` (el tablero y la doc de ElevenLabs) y
`2ddfa47` (los opcionales estándar y este handoff).

**Base y servicios:**

- **Supabase:**
  - migraciones `20260926000001` a `…06` aplicadas, la última después del deploy de `2ddfa47`;
  - criterio v2 vigente;
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
  Sin Planificación, el asistente no les muestra el tablero. Decisión pendiente: ¿también las
  asistentes comerciales?
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
- **Latencia en voz.** Una consulta con dos búsquedas en Odoo tarda unos 12 a 15 s; la frase de
  espera sale a los 3 s. Si molesta, bajar `asistente_esfuerzo_voz` a `low` en Parámetros (no
  hace falta deploy) y medir.
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
