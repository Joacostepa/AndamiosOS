# Pedido de presupuesto: propuesta para reemplazar el formulario de Odoo

12/10/2026 · Propuesta, sin código todavía.

> **Actualización (12/10, más tarde):** el dueño planea conectar WhatsApp Business para que un agente junte estos datos. El análisis está en la sección 7. Resumen: primero se construye el *backend* del pedido, que sirve para cualquier canal; la puerta de entrada principal pasa a ser el agente de WhatsApp, y el formulario web queda como algo secundario.

## Para qué es

El formulario de Odoo (`…odoo.com/es_AR/alta-de-cliente`) junta los datos que hacen falta **para mandarle un presupuesto** a alguien. No es un alta de cuenta corriente ni pide documentación: tiene que ser corto, rápido desde el celular y dejarle al vendedor todo listo para cotizar.

La idea central:

> **El cliente completa un pedido de un minuto y al vendedor le llega un presupuesto ya arrancado en el asistente comercial, con la obra verificada en el catastro y el cliente listo para darse de alta. Sin copiar ni pegar nada.**

Hoy el form pide razón social, contacto, celular, mail, CUIT y domicilio. Son justo los cinco datos que el asistente exige para dar de alta un cliente nuevo y guardar el presupuesto (`faltantesParaEmitir` → `cliente_nuevo`). Esos datos ya llegan, pero quedan sueltos en un lead y el vendedor los vuelve a tipear.

---

## 1. Qué está mal hoy

| Problema | Consecuencia |
|---|---|
| El modal dice «Recibimos tus datos» **antes** de que Odoo conteste | Si el envío falla, el cliente cree que llegó |
| Pide copiar los datos y pegarlos en WhatsApp, pero no hay botón ni link | El cliente carga todo dos veces. Lo que pega no queda unido al lead |
| CUIT en texto libre (`x_studio_cuit`), sin validar | Los errores de dígito llegan al asistente y bloquean el guardado (criterio §5.20) |
| Todos los leads se llaman «Solicitud de presupuesto (web)» | En el pipeline no se distinguen |
| Cada envío crea un lead nuevo, aunque sea un cliente que ya existe | Leads duplicados y no se aprovecha el `res.partner` existente |
| La dirección de obra es un solo campo que solo exige tener un número | Sin localidad: no se sabe si es CABA, así que no se puede consultar el catastro |
| «Domicilio particular» para todos | A un consorcio o una SA le pide el domicilio particular |
| No pregunta qué necesita (fachada, bandeja de protección, alquiler sin montaje) ni la altura | El vendedor tiene que llamar para preguntarlo antes de cotizar |
| No acepta fotos de la fachada | Lo que más ayuda a cotizar llega después, suelto, por WhatsApp |
| La página se titula «My Website», no tiene captcha y vive en un dominio `*.odoo.com` | Se ve poco profesional, entra spam en el CRM y parece phishing |

---

## 2. Cómo lo vive el cliente (2 pasos, ~1 minuto)

```
 Paso 1 · Tu obra
   📍 Dirección       autocompletado de Google, se confirma con un pin en el mapa
                      (en CABA el catastro trae el frente y los pisos del lote: no se le preguntan)
   🧱 ¿Qué necesitás? [Andamio de fachada] [Bandeja de protección] [Alquiler sin montaje]
                      [Evento] [No sé, asesórenme]          ← botones grandes con dibujo
   📏 Altura aprox.   "¿cuántos pisos?" (solo si el catastro no lo sabe)
   📅 ¿Para cuándo?   [Ya] [Este mes] [Más adelante]
   📷 Fotos           "sacale una foto a la fachada" (opcional, cámara del celular)
   💬 Comentario      opcional

 Paso 2 · Tus datos
   ¿Quién pide?       [Particular] [Empresa / Consorcio / Constructora]
   CUIT               ✓ dígito verificado al instante; si falta uno, propone el CUIT corregido
                      → si ya es cliente: "¡Hola de nuevo, Consorcio X!" y no pide nada más
   Razón social, domicilio (fiscal si es empresa), contacto, celular, mail
   ☐ Aviso de datos personales (Ley 25.326, una línea con un link)

 ✅ Pedido #P-0142 recibido   (solo cuando el servidor confirmó)
   [Avisar por WhatsApp]  abre el chat con "Hola, soy Marta, mandé el pedido #P-0142
                          para Cabildo 1234" — solo el número, no todos los datos
   Mail de confirmación con el resumen
```

- Se puede usar sin CUIT: un particular que no lo tiene a mano lo deja vacío. El asistente ya acepta clientes sin CUIT.
- Hay dos maneras de entrar:
  - `/pedido` es el link genérico, para la web, el cartel de obra con QR o Instagram;
  - `/pedido/[token]` lo genera el vendedor cuando ya habló con el cliente. Llega con lo que ya se sabe precargado y queda vinculado a ese vendedor.

## 3. Lo que pasa adentro

1. **Lead en Odoo bien armado**:
   - un título que sirve, por ejemplo «Cabildo 1234 · Fachada · Consorcio X»;
   - el `partner_id` si el CUIT ya existe;
   - `source_id` según de dónde vino (web, QR, link del vendedor);
   - las fotos adjuntas.
2. **Chequeo de canal automático.** `conflictoCanal(dirección)` ya existe y avisa si esa obra se cotizó en el último año, a otro cliente o por otro vendedor.
3. **Aviso al vendedor** por Slack o Telegram, con el link.
4. **Botón «Presupuestar»:**
   - abre una conversación del asistente comercial con el borrador precargado: los datos del cliente, la obra con el catastro verificado, el tipo de trabajo, la fecha y las fotos;
   - lo que falta para emitir queda reducido a lo técnico: modelo, medidas y jornadas;
   - de ahí sale el PDF y «Mandar al cliente», como hoy.

Lo que el cliente carga queda primero en una tabla propia (`pedidos_presupuesto`). A Odoo pasa limpio y sin spam: el captcha y el control de duplicados se hacen antes.

---

## 4. Qué ya existe

| Pieza | Dónde | Estado |
|---|---|---|
| Validar el CUIT y proponer el dígito faltante | `src/lib/cotizador/cuit.ts` | Listo |
| Buscar o crear el cliente sin duplicar | `src/lib/odoo/presupuestos.ts` (`clientePorCuit`, `crearCliente`) | Listo |
| Crear la oportunidad | `vincularOportunidad` | Hoy espera una orden. Falta el modo «lead sin orden» |
| Chequeo de canal | `src/lib/odoo/comercial.ts` (`conflictoCanal`) | Listo |
| Geocodificar la dirección y catastro CABA | `src/lib/odoo/geocodificar.ts`, `src/lib/catastro/caba.ts` | Listo |
| Portal público con token, fotos con URL firmada | patrón de `/permiso/[token]` | Probado, se copia |
| Asistente comercial | `src/lib/asistente/` | Falta poder abrir una conversación con el borrador precargado |
| Mail, Slack, Telegram | `src/lib/mail.ts`, `alertas/slack.ts`, `hoja-dia/telegram.ts` | Listos |
| Captcha y límite de envíos | — | Hay que agregarlo (Cloudflare Turnstile, gratis) |
| Autocompletar la razón social desde ARCA | `api/afip` es un stub | Bloqueado: falta autorizar el certificado en ARCA |

## 5. Etapas

1. **Reemplazar el form de Odoo** (~1 semana):
   - `/pedido` y `/pedido/[token]`;
   - el lead bien armado, con chequeo de canal y aviso al vendedor;
   - la confirmación real, con el botón de WhatsApp y el mail;
   - captcha y el aviso de datos personales.
2. **Conectar con el asistente:**
   - el botón «Presupuestar» con el borrador precargado;
   - el catastro en la dirección;
   - las fotos.
3. **ARCA**, cuando se autorice el certificado: con el CUIT se completan solos la razón social y el domicilio fiscal.

## 6. Decisiones que necesito

1. **¿A quién le llega cada pedido?** ¿A todos, a uno fijo, o se reparte por zona o por tipo de trabajo?
2. **¿El CUIT es obligatorio?** Propuesta: obligatorio para empresas, opcional para particulares.
3. **¿Dónde vive?** ¿Una ruta del dominio de la web (por ejemplo `andamiosbuenosaires.com.ar/presupuesto`) o la de Andamios-OS? ¿También reemplaza el formulario de contacto de la web?
4. **«¿Cómo nos conociste?»** Propuesta: sacarlo del link del vendedor, porque ya se sabe, y dejarlo en el genérico como un toque opcional.

### Mientras tanto, en Odoo (10 minutos, sin código)
- Cambiar el título «My Website» y la descripción «Contáctenos».
- Que el modal abra `wa.me/5491127344214?text=…` en lugar de pedir que copien y peguen.
- Revisar en Studio que los campos `x_studio_*` estén marcados como visibles en formularios web.

---

### Referencia: campos del formulario actual
`crm.lead`, Odoo 19.0+e:
- `partner_name`, `contact_name`, `phone`, `email_from`;
- `x_studio_cuit`, `x_studio_domicilio_particular`, `x_studio_direccion_de_la_obra`;
- `x_studio_como_nos_conociste`: `ya_soy_cliente`, `busqueda_internet`, `publicidad_online`, `via_publica`, `recomendacion`, `otro`;
- `x_studio_descripcion_del_trabajo`;
- el `name` oculto, que siempre es «Solicitud de presupuesto (web)».

Antes de desarrollar, partir de `main`: esta rama tiene 69 commits menos.

---

## 7. ¿Formulario o agente de WhatsApp? (análisis del 12/10)

**Conclusión:** casi todo el valor está en el *backend*: el pedido ordenado, el lead bien armado, el chequeo de canal, el aviso y el botón «Presupuestar» con el borrador precargado. Ese backend se construye igual sea cual sea la puerta de entrada. Un agente de WhatsApp lo usaría como herramientas. Lo único que cambia es la pantalla de carga, que es la parte barata.

### Qué hay hecho
- La integración con la WhatsApp Cloud API (`src/lib/whatsapp/`) está **programada y probada contra Meta simulado, pero nunca se configuró**. Recibe texto, audios transcriptos con ElevenLabs, fotos, PDF y ubicación, y junta los mensajes que llegan cortados en uno solo. **Hoy es solo para vendedores:** a un número desconocido le contesta «uso interno».
- El agente para clientes ya tiene un plan, postergado el 26/09 (`docs/asistente-comercial/handoff.md` ~l.541): se presenta como asistente virtual de ABA y no se hace pasar por una persona.
- **El asistente comercial no puede atender clientes tal cual.** `consultar_odoo`, `precios_recientes` y `buscar_presupuestos` dejan ver saldos y precios de otros clientes, y con un mensaje armado a propósito un cliente podría sacarle esos datos. Hace falta un agente aparte con herramientas acotadas: `anotar_dato`, `validar_cuit`, `verificar_frente_lote`, `pedir_humano`, `terminar`. Sin precios, sin consultas libres a Odoo y con un modelo más barato.

### Qué dice Meta (investigado el 12/10/2026)
- **Costo:** contestar a quien escribe es **gratis** dentro de la ventana de 24 h. Solo se pagan las plantillas que se mandan fuera de esa ventana (utility ~US$ 0,026 en Argentina, dato de terceros: hay que confirmarlo).
- **Política de IA:** desde el 15/01/2026 Meta prohíbe los chatbots de IA *de propósito general*. La atención propia de un negocio está permitida. Hay que ofrecer siempre una forma clara de hablar con una persona.
- **Coexistencia** (el mismo número en la app del celular y en la API): existe, sincroniza 6 meses de chats y los vendedores siguen viendo y contestando desde el teléfono. Limitaciones:
  - **ese número pierde las llamadas de voz**, las etiquetas y las respuestas rápidas;
  - se desconecta si el celular queda inactivo unos 14 días;
  - exige darse de alta a través de un proveedor (BSP o Tech Provider: 360dialog, Twilio, etc.);
  - **el módulo WhatsApp nativo de Odoo no la soporta.**
- **WhatsApp Flows:** formularios nativos dentro del chat, con selects, fechas, **fotos con la cámara** y un endpoint para validar el CUIT. No tienen mapa: el pin de ubicación se pide aparte en el chat.

### Orden recomendado
1. **Hoy (10 min):** los arreglos en Odoo de la sección 6.
2. **Backend del pedido (~1 semana).** Para que dé valor desde el primer día, **se alimenta con los leads que ya genera el formulario de Odoo**: el botón «Presupuestar» sale desde un lead existente. No hace falta un formulario nuevo para empezar.
3. **Agente de WhatsApp acotado (~1,5–2,5 semanas, más la aprobación de Meta).** Conversa, acepta audios, fotos y pin, valida el CUIT con código y al terminar escribe en el mismo backend. Nunca da precios ni plazos. Pasa la charla al vendedor por su nombre («te va a escribir Gabriel»). Para los datos duros (CUIT, razón social, mail) puede usar un Flow si conversando no anda bien.
4. **Formulario web liviano:** solo para lo que no llega por WhatsApp (la web, Instagram, mail). Reemplaza al de Odoo cuando se apague.

### Antes de arrancar con WhatsApp hay que saber
- **¿A qué número escriben los clientes?** ¿Al de la empresa (11 2734 4214) o al celular de cada vendedor? Si es al de cada vendedor, un agente en el número de la empresa ve poco. Hay que preguntarles a Gabriel y a Jorge.
- **¿Se reciben llamadas en el 11 2734 4214?** Con coexistencia ese número deja de recibir llamadas. Si se usa para llamadas, conviene un número nuevo solo para el agente.
- **Volumen:** ¿cuántos pedidos por día llegan? Con pocos, la etapa 2 sola ya rinde.
- **Proveedor:** elegir el BSP para la coexistencia y verificar el negocio en Meta, que lleva días o semanas. Conviene arrancarlo ya, en paralelo.
