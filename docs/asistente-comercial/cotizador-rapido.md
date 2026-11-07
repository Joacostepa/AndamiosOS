# Cotizador rápido: propuesta (07/11)

**Qué es:** una variante del asistente comercial pensada para cotizar más rápido.
- **Pedido de JS:** el chat funciona, pero no es expeditivo tener que escribirle todo. Quería una pantalla con botones y campos, donde la IA interprete lo que haga falta y el chat quede como apoyo.
- **Cómo se armó:**
  - un equipo de 9 agentes: 3 estudiaron el motor, el uso documentado y las pantallas; 3 diseñaron una variante cada uno (formulario primero, pegá y la IA completa, celular en obra); 2 las juzgaron y 1 escribió la conclusión;
  - un análisis aparte del uso real en producción (115 conversaciones del 26/09 al 05/11, sólo lectura). Ese análisis corrigió la conclusión del equipo.

**Prototipo para probar (privado):** https://claude.ai/artifact/G8nibwjcBsZXfD42gpWifY. Es una sola página que funciona como app: pegar, interpretar, completar con botones, chat que propone cambios y guardado simulado. El intérprete es de prueba (expresiones regulares), no Claude, y el catastro y Odoo están simulados.

**Lienzo con las pantallas (privado):** https://claude.ai/artifact/SMnMiM3NM98QJGooTn2889. Pantallas:
- escritorio de bandeja, recorrido completo;
- desglosado;
- fachada en esquina;
- abrir un S0;
- celular.

Ningún cálculo de la maqueta consulta la red: todo sale de las tarifas de `TARIFAS_AGO26`.

**Estado (07/11):** JS probó el prototipo y pidió implementarlo. Está construido en `/comercial/asistente/cotizar` (botón «Cotizar» en el asistente). Las preguntas de abajo se resolvieron por defecto como en el prototipo; JS puede cambiarlas.

## Lo que se construyó (07/11)

**Cómo está hecho.** Cada presupuesto del cotizador es una conversación del asistente con su borrador, la misma que usa el chat. Así el cajón «Asistente» trabaja sobre el mismo presupuesto.

- **`src/lib/cotizador-rapido/formulario.ts`** (puro, con tests): `formularioDesdeBorrador` y `aplicarFormulario`.
  - Toca sólo lo que maneja la pantalla, y sólo si cambió. No pisa lo que agregó el chat: fletes, SyH con otras jornadas, plan de pagos.
  - Arma los textos de la propuesta (referencia, Sección 1 y 2) mientras el vendedor no los edite a mano.
  - Lo propio de la pantalla va en `DatosBorrador.cotizador`: tipo, domicilio = obra, filas sin monto y marcas de la IA.
- **`propuesta.ts`** (puro, con tests): lo que leyó la IA va sólo a los campos vacíos. Lo que choca con algo cargado vuelve como cambio para aplicar o descartar.
- **`interpretar.ts`:** una llamada a Opus 5.5 con esfuerzo `low` y salida estructurada. Recibe texto, imágenes y PDF, y devuelve cada campo con su cita y si lo dedujo.
- **APIs**, en `/api/comercial/asistente/cotizador`:
  - `GET`: tarifas y renders;
  - `POST`: presupuesto nuevo;
  - `PUT /:id`: guardar el formulario, con versión y 409 si cambió;
  - `POST /:id/accion`: las herramientas del asistente sin el modelo (catastro, canal, buscar clientes, editar o re-emitir un S0, PDF, proponer el guardado), con el mismo candado que un turno del chat;
  - `POST /:id/interpretar`;
  - `POST /acciones/:id`: confirmar el guardado sin un turno del modelo, que tarda lo que tarda Odoo.
- **Pantalla:** `src/components/cotizador/` (`inicio`, `editor`, `secciones`, `campos`).
  - El motor corre en el navegador para mostrar el precio al instante.
  - El servidor guarda a los 0,7 s y es el que manda.
- **Probado:**
  - 11 tests nuevos; pasan los 1654 del repo;
  - `scripts/test-cotizador-rapido.mts` contra la base, el catastro y Odoo reales, sin escribir en Odoo: IA 4,8 s y US$ 0,02, Florida 375 → vecina 371, conflicto de canal, sin faltantes y guardado propuesto.

**Sin probar:** la pantalla con sesión (Claude no tiene login) y un guardado real en Odoo desde el cotizador. El guardado usa el mismo ejecutor que el botón del chat.

**Pendiente:**
- Sumar el costo de `interpretar` a la pestaña Uso y al tope diario. Hoy no se registra en `asistente_mensajes`.
- Armador de cuotas en la pantalla (hoy se pide por el chat).
- Copiar los renglones de la orden vieja al re-emitir (hoy se muestran como referencia).

---

## Recomendación

**Una sola pantalla.** Arriba va la caja «Pegá, soltá o dictá lo que tengas». Recibe texto, capturas, PDF, fotos o un número S0.

**Debajo, los botones de tipo:**
- Bandeja
- Desglosado
- Fachada
- Abrir un S0
- Otra cosa (va al chat)

**Al elegir el tipo** se abre un formulario por secciones con los campos del motor. A la derecha, un resumen que se recalcula en cada cambio: base, lo que va sólo en el PDF, IVA, total, renovación y faltantes como enlaces. Abajo, el botón «Guardar en Odoo» con un diálogo de confirmación.

**El chat** pasa a ser un cajón lateral que trabaja sobre el mismo borrador. Lo que propone llega como un parche que se aplica o se descarta con un botón.

**Lo que hace la IA:**
- interpretar lo pegado y llenar sólo los campos vacíos, con la marca «IA» y la cita de dónde sacó cada dato;
- en lo que deduce y mueve plata (altura, metros, CABA o no), un borde punteado y un ✓ obligatorio;
- interpretar correcciones en palabras, como «sacá el técnico y poné 20 m» o «+35 % a la mano de obra», y devolverlas como parche.

**Lo que no hace la IA:** calcular, consultar el catastro, completar jornadas ni guardar. El catastro y el conflicto de canal corren solos al salir del campo de dirección.

**Lo que se mantiene igual que hoy:** el motor (`recalcular` y `faltantesParaEmitir` son funciones puras), la confirmación antes de Odoo, los opcionales estándar y que a Odoo va sólo la base.

## Lo que mostró el uso real

| Dato | Valor |
|---|---|
| Guardados OK | 104 (98 nuevos, 6 re-emisiones) en 88 conversaciones |
| Mezcla de los nuevos | bandeja 48 % · desglosado D 26 % · fachada 19 % · alquiler C 4 % |
| Sobre un S0 que ya existía (ediciones, re-emisiones y copias) | 23 % de los guardados |
| Por presupuesto (mediana) | 4 mensajes · 1,6 min de espera · **4,6 min de punta a punta** |
| Bandeja (mediana) | 3 mensajes escritos · 4,0 min |
| Espera | es un tercio del tiempo; el resto es leer y escribir |
| Primer mensaje con imagen | 44 % (11 llegan sólo con la imagen) |
| Jornadas | faltan en el 82 %; 50 mensajes son exactamente «1 de armado 1 de desarme» |
| Render | falta en el 90 %; 61 mensajes piden «el estándar» |
| $/m² en fachada | lo dictó el vendedor en las 16 nuevas; $ 45.000 en 10 |
| Líneas a mano | 70 renglones en 22 presupuestos, casi todos D: montos que dicta el vendedor, traslados de envío y retiro, etapas |
| Mail desde Odoo | ofrecido después de cada guardado, aceptado 0 veces |
| Audios adjuntos | 0; la voz se usó para consultas y salió poco útil |

**Correcciones a la conclusión del equipo:**
- **El desglosado pasa a la etapa 1.** El equipo lo había dejado para la etapa 3. Es una tabla de renglones con plantillas (mano de obra, alquiler N días, memoria, traslado de envío y de retiro, SyH, etapa), y el motor sólo suma.
- **Las imágenes entran en la etapa 1, no en la 2.** `interpretar` tiene que leer capturas y fotos desde el principio.
- **Altura de la bandeja:** las opciones son 3 · 4 · 6 · otra (no 3 · 6 · 8).
- **Botones rápidos:**
  - **1 + 1** en jornadas;
  - «Pantalla estándar» en render;
  - en fachada, $/m² en chips (35 · 40 · 45 · 60 · 75) y un campo de **total objetivo**.
- **Se saca el ofrecimiento de mandar por mail.** El mensaje de WhatsApp sale solo.
- **El dictado con Scribe no es prioridad.** En el celular alcanza con el micrófono del teclado.

## Etapas

**Etapa 1, la operación diaria (unos 14 a 16 días).** Cubre el 90 % de los guardados.
- **Pantalla:** entrada, secciones comunes (cliente, obra, jornadas y render, opcionales, plazo y pago), resumen en vivo, barra para guardar, versión celular, lista «Para seguir» y «Las pregunto después».
- **Tipos:** bandeja, desglosado con renglones y abrir un S0 (editar con el mismo número o re-emitir, con «Cambia contra Odoo»).
- **Guardar sin turno del modelo:**
  - sacar `armarPayloadGuardar` de `proponerGuardar` (`herramientas.ts`);
  - una conversación muda por borrador, porque `asistente_acciones.conversacion_id` es NOT NULL.
- **`interpretar` sobre texto e imágenes:**
  - salida estructurada con los mismos zod de `cotizar_*`;
  - llena sólo lo vacío;
  - ✓ en lo deducido;
  - parche para las correcciones.
- **Lo automático:** catastro y canal al salir de la dirección, con las caras del lote y las vecinas como opciones; CUIT validado al tipear.

**Etapa 2, fachada y extras (unos 5 a 6 días).**
- Fachada por m² con frentes del catastro, total objetivo y escalonado.
- Armador de cuotas.
- «Redactar con IA» las secciones 1 y 2.
- Ajuste global: % o total objetivo sobre cualquier tipo.
- Que el chat vea los cambios del formulario.

**Sigue en el chat:** torres por piezas, tribunas, etapas con fechas, actualizaciones por CAC con fuente y las consultas que no son cotizaciones.

**Costo de modelo estimado:** US$ 0,05 a 0,15 por presupuesto, una interpretación. Si no se pega nada, US$ 0. Hoy es US$ 1,5 a 2.

**Tiempo estimado:** una bandeja pasa de unos 4 minutos a 1 o 1,5. Es una estimación: conviene cronometrar los dos caminos en el piloto.

## Preguntas para JS

1. **¿Cuánto se precarga?**
   - ¿Los m.l. salen del frente del catastro? En las 23 alertas del catastro, la mitad de las veces eligió el catastro y la otra mitad la medida del cliente.
   - ¿La gestoría va como opcional por defecto en CABA?
   - ¿El render queda vacío y obligatorio, o viene preelegido el estándar del tipo?
2. **¿Sí al ✓ obligatorio en lo que la IA deduce y mueve plata?** ¿O alcanza con la marca «IA» y el diálogo de confirmación?
3. **¿El cotizador pasa a ser la entrada por defecto de `/comercial/asistente`, con el chat como cajón?**
4. **Ajuste global** («+35 % a la mano de obra», «llegá a este total»): ¿se reparte por renglón, o va como renglón aparte de bonificación? ¿La renovación sigue sobre la lista?
5. **¿Se prueba la maqueta de celular con Gabriel y Jorge antes de construir?** Para eso necesitan usuario.
