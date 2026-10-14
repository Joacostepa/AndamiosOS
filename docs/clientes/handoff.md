# Handoff: pedido de presupuesto y agente de WhatsApp para clientes

Charla con JS del 12/10/2026. **Estado: hay propuesta, maqueta y el MCP de Meta instalado. Todavía no hay código.**

Para retomar, leé este archivo primero. El detalle completo está en [pedido-presupuesto-propuesta.md](./pedido-presupuesto-propuesta.md). La maqueta está en [maqueta.html](./maqueta.html) y publicada en https://claude.ai/artifact/K9cVuTzAvE87bMuwkQbNAz.

---

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
