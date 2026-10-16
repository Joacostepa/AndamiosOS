# Handoff: CRM con Sofía, el agente de WhatsApp para clientes

**Actualizado el 16/10/2026.** El estado de abajo es el vigente. La historia del 12/10 está más abajo, en «Historia: la charla del 12/10».

Para retomar, decí: «Leé docs/clientes/handoff.md y seguimos con el CRM de WhatsApp».

- **La propuesta** (cerrada por un equipo de agentes y auditada, con las decisiones de JS en la §12): [crm-propuesta.md](./crm-propuesta.md).
- **La maqueta:** [crm-maqueta.html](./crm-maqueta.html), publicada en https://claude.ai/artifact/6mhAeU4umDQLv152rDai8e.
- **Las cuentas de los socios** (borrador para que lo corrija JS): [cuentas-socios.md](./cuentas-socios.md).

---

## Estado al 16/10

**En producción y probado por JS el 15/10 a la noche:** un mensaje al número nuevo entra a la bandeja, se toma la charla, se contesta desde la app y le llega al cliente.

| Qué | Dónde | Estado |
|---|---|---|
| Etapa 0: la bandeja (Comercial → WhatsApp de clientes) | `src/lib/clientes/`, `/comercial/clientes` | ✅ En producción, probada |
| Paso 4: qué es fácil, a quién va y el filtro de plata | `facil.ts`, `asignacion.ts`, `filtro-salida.ts` | ✅ En producción |
| Paso 5: Sofía | `turno.ts`, `prompt.ts`, `herramientas.ts`, `agente.ts`; el núcleo compartido con el asistente en `src/lib/ia/nucleo.ts` | ✅ En producción y **prendida** (`clientes_ia_activa = 1`) para las pruebas internas de JS |
| Paso 6: la tarjeta de aprobación y «Revisar charlas» | `aprobacion.ts`, `aprobar.ts`, `tarjeta-aprobacion.tsx`, `/comercial/clientes/revisar` | ✅ En producción. **Todavía no se aprobó nada de verdad** |
| Saludo según la hora | `saludo.ts` (`saludoDelMomento`, `saludoInicial`) | ✅ En producción |

**El saludo** (decisión de JS, 15 y 16/10). Lo arma el código, una sola vez, y el nombre sale del perfil de WhatsApp:
> ¡Buen día Carlos! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te puedo ayudar.

- Hasta las 12:59 dice buen día, hasta las 19:59 buenas tardes y después buenas noches.
- Sin línea de aviso al pie. Si le preguntan, Sofía **nunca niega ser una IA**.
- JS insistió en sacar «digital» y dijo que en Argentina no hay ley que lo exija. Se le explicó que lo piden las condiciones de uso de Claude y aceptó «asistente digital». **No volver a ofrecer esconderlo.**

### Meta (WhatsApp Cloud API)

- **Portfolio** «Andamios Buenos Aires», **verificado** el 15/10 (EMPRENDIMIENTOS Y ESTRUCTURAS S A).
- **App de Meta:** «AndamiosOS» (id 1072332035564720), «Sin publicar», y funciona igual.
- **Número de clientes:** **+54 9 11 7637 8551** (eSIM de Claro). Phone number ID `1403629372834757`, WABA `2233102921415343`.
  - Registrado (CONNECTED, CLOUD_API). El nombre visible está en revisión.
  - La eSIM queda en un celular, **inactiva pero sin dar de baja**: si Meta vuelve a pedir un código por SMS, se activa un rato.
  - **Nunca abrir WhatsApp con ese número en ningún celular:** lo desconecta de la API.
- **Webhook:** `https://andamios-os.vercel.app/api/whatsapp/webhook` (campo `messages`), con la WABA suscripta a la app.
- **Medio de pago:** Visa 4560, en ARS.
- **Variables en Vercel (Production):**
  - `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_CLIENTES_PHONE_NUMBER_ID`;
  - los secretos también están en `.env.local`, con el PIN del número en `WHATSAPP_CLIENTES_PIN`.
- **⚠️ El token es de usuario y vence el 14/12/2026.**
  - El permanente (usuario del sistema `andamiosos-api`, id 61595559895577, que ya tiene la app y la WABA asignadas) quedó trabado por la **aprobación de pares**: tiene que aprobarlo otro administrador del portfolio (la agencia, que estaba de viaje).
  - Cuando lo aprueben: «Generar token» → nunca vence → los dos permisos de WhatsApp → reemplazar `WHATSAPP_TOKEN` en Vercel y en `.env.local`.
  - Sugerido a JS: pasar a la agencia a «socio» con acceso sólo a los anuncios.
- **El MCP de Meta** (`whatsapp_business_tools`) está agregado, pero Meta todavía no lo habilitó para la cuenta de JS («Not yet available»).

### Base (Supabase), migraciones aplicadas

- `20261016000001` (bandeja) y `20261016000002` (parámetros de fácil);
- `20261017000001` y `20261017000002` (Sofía);
- `20261018000001` (aprobación).

Parámetros en Parámetros → Agente de clientes:
- `clientes_ia_activa` = 1;
- modelo Opus 5.5, esfuerzo bajo;
- topes de US$ 1 por teléfono y US$ 15 por día;
- horario de 8 a 17;
- `clientes_telefono_guardia` = +54 11 2734-4214 (columna `texto`).

### Decisiones de JS (15/10)

Están todas en la §12 de la propuesta. Las principales:
- la bandeja a $140.000;
- fácil = hasta 25 m.l., con 1 jornada de armado y 1 de desarme;
- siempre «+ IVA»;
- los clientes nuevos se reparten por turno entre Jorge, Gabriel y JS;
- en la etapa 1 aprueba JS;
- la IA atiende las 24 h;
- el número se publica primero sólo en la web.

JS **no quiere** correr los guiones de ataque (`scripts/test-agente-clientes.mts`) ni una lista de teléfonos de prueba: el número no lo tiene nadie y él hace pruebas internas.

## Lo que falta

0. **⚠️ ANTES DE PUBLICAR EL NÚMERO: el saludo tiene que volver a decir «asistente digital».**
   - El 16/10, JS sacó «asistente digital» del saludo (`CUERPO` en `src/lib/clientes/saludo.ts`, commit `361cb44`) para las pruebas internas: «hasta que lancemos vamos a dejarlo así».
   - Hoy dice «¡Buen día Joaquin! Acá Sofía de Andamios Buenos Aires…».
   - Mientras el número lo tenga sólo JS, no confunde a nadie. Ante un cliente real, Sofía tiene que decir que es una asistente digital: lo piden las condiciones de uso de Claude.
1. **Que JS pruebe a Sofía** (el saludo, el catastro, «¿sos un bot?», un descuento, «tabla floja») y la tarjeta. **Aprobar crea una orden real en Odoo** (en borrador): borrarla después, o usar «Lo tomo yo».
2. **La plantilla de Meta «Tu presupuesto está listo»**, con el PDF de encabezado, para mandar con la ventana de 24 h cerrada. Hoy queda «falta la plantilla».
3. **Paso 2b:** la búsqueda del cliente por teléfono en Odoo (historial y deuda, F5/F7), el «lead sin orden» y el botón «Presupuestar». Hoy la tarjeta dice «no se pudo revisar».
4. **Cargar en Parámetros** las cuentas de los socios y «Hoy no estoy»; las parejas están en el código (`PAREJAS_15_10`).
5. **Confirmar con JS el apellido de Gabriel** (`TECNICOS_COMPLETOS` en `aprobacion.ts`).
6. **El token permanente** antes del 14/12.
7. **Más adelante:**
   - el paso 8, que es el seguimiento con plantillas y consentimiento;
   - el paso 9, la tarifa del alquiler simple con Tamara;
   - limpiar las WABA viejas del portfolio;
   - publicar el número en la web.

## Historia: la charla del 12/10


## De qué se trata

Hoy, cuando alguien pide presupuesto, casi siempre por WhatsApp, le mandan el link de un formulario web de Odoo:

`https://emprendimientos-y-estructuras-sa.odoo.com/es_AR/alta-de-cliente`

Ese formulario crea un `crm.lead`. **Sirve solo para juntar los datos necesarios para mandar un presupuesto.** No es un alta de cuenta corriente. JS lo aclaró cuando le propuse pedir ART, documentos y firmas: eso no va.

Los datos que pide el formulario (razón social, contacto, celular, mail, CUIT y domicilio) son exactamente los que el asistente comercial exige para dar de alta un cliente nuevo (`faltantesParaEmitir` → `cliente_nuevo` en `src/lib/asistente/borrador.ts`). Hoy esos datos quedan sueltos en el lead y el vendedor los vuelve a tipear.

## Qué se decidió

1. **Lo que más vale es el backend del pedido, no el formulario.** El circuito es:
   pedido ordenado → lead bien titulado en Odoo → chequeo de canal → aviso al vendedor → botón **«Presupuestar»**, que abre el asistente con el borrador precargado.
   Ese circuito sirve para cualquier puerta de entrada.
2. **La puerta principal va a ser un agente de WhatsApp para clientes**, no un formulario. JS lo planteó y el análisis le dio la razón, con condiciones:
   - el agente es aparte del asistente comercial;
   - tiene herramientas acotadas;
   - nunca da precios ni plazos;
   - se presenta como asistente virtual de ABA (decidido el 26/09);
   - pasa la charla al vendedor por su nombre («te va a escribir Gabriel»).
3. **El formulario web queda para el final y liviano**, solo para lo que no llega por WhatsApp (la web, Instagram y el mail).
4. **Número nuevo, propio, para el agente.** Lo recomendé y JS dijo «perfecto».
   - Una línea de Claro (o de la compañía que usen) a nombre de Emprendimientos y Estructuras SA, conectada **directo a la Cloud API de Meta, sin proveedor intermediario**.
   - El 11 2734 4214 sigue en la app del celular para las llamadas y los clientes actuales. Se le configura un mensaje automático que derive al número nuevo.
   - Motivo: la coexistencia (compartir el número entre la app y la API) obliga a usar un proveedor, deja ese número sin llamadas de voz y no la soporta el WhatsApp nativo de Odoo.

## Orden de construcción

| # | Qué | Tamaño | Depende de |
|---|---|---|---|
| 0 | Arreglos en el formulario de Odoo: título «My Website», botón `wa.me` en el modal en vez de copiar y pegar, campos `x_studio_*` visibles en formularios web | 10 min, lo hace JS en Odoo | — |
| 1 | **Backend del pedido.** Al principio se alimenta con los leads que ya crea el formulario de Odoo: «Presupuestar» desde un lead existente | ~1 semana | — |
| 2 | **Agente de WhatsApp para clientes**, etapa supervisada | ~1,5–2,5 semanas | Número nuevo y cuenta de Meta |
| 3 | Formulario web liviano `/pedido` y `/pedido/[token]` | ~1 semana | 1 |
| 4 | Autocompletar el CUIT desde ARCA | ~2–3 días | JS autoriza el certificado en ARCA |

### Etapa 1 en concreto
- **Tabla `pedidos_presupuesto` en Supabase**, el modelo canónico del pedido: obra, tipo de trabajo, altura, fecha, fotos, datos del cliente, origen, vendedor y estado.
- **Lead en Odoo:**
  - título útil, por ejemplo «Av. Cabildo 2450 · Fachada · Consorcio X»;
  - `partner_id` si el CUIT ya existe (`clientePorCuit`);
  - `source_id` y fotos como `ir.attachment`.
  - Falta el modo «lead sin orden» en `vincularOportunidad` (`src/lib/odoo/presupuestos.ts`), que hoy espera un `ordenId`.
- **Chequeo de canal:** `conflictoCanal(direccion)` en `src/lib/odoo/comercial.ts`.
- **Obra:** `geocodificarDireccion` y `consultarLote` (catastro CABA, en `src/lib/catastro/caba.ts`).
- **Aviso al vendedor:** si ya es cliente, a su vendedor; si es nuevo, al canal con un botón «Lo tomo». Por Slack o Telegram (`src/lib/alertas/slack.ts`, `src/lib/hoja-dia/telegram.ts`).
- **«Presupuestar»:**
  - crea `asistente_conversaciones` y `cotizacion_borradores` del vendedor, con un `DatosBorrador` precargado (`cliente`, `obra`, `trabajo`) y las fotos copiadas a `comercial/adjuntos/<conv>/`;
  - `DatosBorrador` no tiene «fecha de inicio deseada» ni altura suelta: van en `perfilComercial` o `notasInternas`, o en un campo nuevo.

### Etapa 2 en concreto
**Qué ya existe.** La integración con WhatsApp está programada y probada contra Meta simulado, pero **nunca se configuró**:
- `src/lib/whatsapp/` (api, procesar, tandas, formato);
- el webhook `src/app/api/whatsapp/webhook/`;
- la tabla `whatsapp_entrantes`.

Ya maneja texto, audio (transcripto con ElevenLabs), imagen, PDF, ubicación y botones. **Hoy atiende solo a vendedores:** un número desconocido recibe «uso interno» (`contestarDesconocido` en `procesar.ts`).

**El asistente comercial NO se puede poner delante de clientes.** `consultar_odoo`, `precios_recientes`, `buscar_presupuestos` y `buscar_clientes` dejan ver saldos y precios de otros clientes, y con un mensaje armado a propósito (prompt injection) un cliente podría sacárselos. Además, todo cuelga de un `usuario_id` interno.

**Qué hay que construir:**
- **Ruteo:** si el teléfono no es de un vendedor (o llega por el `phone_number_id` del número nuevo), va al agente de clientes.
- **Base de datos:**
  - conversaciones de clientes con estado (recopilando / completo / derivado / cerrado) y una ficha JSONB;
  - un candado por teléfono;
  - un tope de gasto por teléfono y uno global.
- **Agente:**
  - prompt propio;
  - herramientas sin acceso a nada sensible: `anotar_dato`, `validar_cuit`, `verificar_frente_lote`, `pedir_humano`, `terminar_relevamiento`;
  - un modelo más barato que el del asistente;
  - el loop de `src/lib/asistente/turno.ts`, con el set de herramientas como parámetro.
- **Al terminar:** escribe en el backend de la etapa 1.
- **Bandeja:** ver la charla, «tomarla» a mano y pasarla a borrador.
- **Meta:**
  - ofrecer siempre hablar con una persona;
  - controlar la ventana de 24 h (hoy no se controla);
  - plantillas para seguimiento;
  - opción de darse de baja.
- **Pruebas contra prompt injection:** un `scripts/test-…-whatsapp-clientes.mts`, como el que ya existe.

**Plan previo de JS (26/09):** https://claude.ai/code/artifact/80f5a96c-2a10-4ac0-95b7-b1f3a35b3e64. Ver también `docs/asistente-comercial/handoff.md`, en `main`, sección «Agente de WhatsApp para clientes». Ese plan contemplaba que el agente cotizara solo los trabajos fáciles. **Hoy la recomendación es que no cotice** al menos hasta tener la etapa supervisada andando.

## MCP de Meta (instalado el 12/10)

- **Servidor oficial de Meta, en beta:** `whatsapp_business_tools` en `https://mcp.facebook.com/whatsapp_business_tools`.
- Agregado con alcance **local** (solo JS, en este proyecto, en `~/.claude.json`).
- **Falta que JS lo autentique:** `/mcp` → `whatsapp_business_tools` → login de Meta. Elegir la empresa y la app con WhatsApp.
- **Requisitos:**
  - ser admin de la empresa en Meta Business (rol MANAGE);
  - una app de Meta con WhatsApp de la que JS sea admin. Probablemente **no exista todavía**: la cuenta de Meta nunca se configuró;
  - aceptar los términos de la WhatsApp Cloud API.
- **Sirve para configurar, no para atender.** Herramientas `whatsapp_biz_*`:
  - alta y verificación de números;
  - plantillas;
  - webhooks (apuntar a `https://andamios-os.vercel.app/api/whatsapp/webhook`);
  - mensajes de prueba;
  - `system_user_token` y `verify_business`.
- **⚠️ Nunca registrar el 11 2734 4214 por API** sin que JS lo confirme: lo saca de la app del celular.
- Docs: https://developers.facebook.com/documentation/mcp/whatsapp-business-tools-mcp

## Datos de Meta que conviene recordar (investigado el 12/10/2026)

- **Precios:**
  - contestar a quien escribe es gratis dentro de las 24 h;
  - se cobran solo las plantillas que se mandan fuera de esa ventana. Utility en Argentina sale ~US$ 0,026; es un dato de terceros, hay que confirmarlo en la tabla oficial;
  - el cobro «desde el 1/10/2026 por mensajes de servicio» no está confirmado: la página oficial sigue diciendo que son gratis.
- **Política:** desde el 15/01/2026 Meta prohíbe los chatbots de IA de propósito general. La atención propia de un negocio está permitida y hay que ofrecer escalar a un humano.
- **WhatsApp Flows** (formularios dentro del chat): tienen selects, fechas, **PhotoPicker** y un endpoint para validar el CUIT. No tienen mapa: el pin de ubicación se pide aparte en el chat. Son plan B si juntar los datos duros conversando no anda.
- **Media:** las URLs de descarga vencen a los 5 minutos y los IDs a los 7 días. Hay que bajar los archivos enseguida; `bajarMedio` ya lo hace.

## Qué falta que haga o conteste JS

1. **Sacar la línea nueva** a nombre de la empresa. Que no esté registrada en ninguna app de WhatsApp. El 26/09 JS había dicho que «ya tiene un número»: confirmar si es ese o uno nuevo.
2. **Autenticar el MCP** (`/mcp`) y, si falta, crear la app de Meta con WhatsApp. Arrancar ya la **verificación del negocio**, que lleva días o semanas.
3. **Preguntar a Gabriel y a Jorge** a qué número les escriben los clientes: ¿al de la empresa o a sus celulares? Si es a sus celulares, el agente en el número de la empresa ve poco.
4. **Volumen:** ¿cuántos pedidos por día llegan?
5. Los **arreglos de 10 minutos** en el formulario de Odoo.
6. **Autorizar el certificado «ANDAMIOSOS» en ARCA** (Administrador de Relaciones: `ws_sr_constancia_inscripcion` y Padrón A13). Desbloquea la etapa 4 y la consulta de CUIT del asistente.
7. **Decisiones del formulario** (sección 6 de la propuesta). Mis recomendaciones:
   - CUIT obligatorio solo para empresas;
   - el formulario en el dominio propio;
   - «¿Cómo nos conociste?» opcional y solo en el link genérico.

## Antes de escribir código

- Partir de **`main`**, no de `docs/partes-rediseno`: esa rama tiene 69 commits menos. En `main` están `validarCuit` con propuesta de CUIT corregido, `geocodificarDireccion` y el alta sin CUIT.
- Leer `docs/asistente-comercial/modulo.md` (§WhatsApp, l.412-489) y `handoff.md` en `main`.
