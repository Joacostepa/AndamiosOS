# Módulo Sistemas: propuesta

Pedido de JS (17/10/2026): que todos puedan anotar errores, correcciones o mejoras del sistema desde cualquier pantalla, con capturas; que le lleguen a una lista de revisión; y que a todos les aparezca un recorrido obligatorio la próxima vez que entren.

Maqueta interactiva: `docs/sistemas/maqueta.html`, publicada en https://claude.ai/artifact/TnCcT8Kchr8hVynzNAGMGK

La armaron cuatro agentes: relevamiento del código, capturas de pantalla (con pruebas reales en Chromium y WebKit), producto y UX, y datos y backend.

---

## 1. Qué ve cada uno

**Cualquier usuario**
- Un botón **Reportar** (megáfono) en el header, a la izquierda de la campanita. En el celular queda solo el ícono.
- También está en el menú del avatar y en ⌘K («Reportar algo del sistema»).
- No se usa un botón flotante: tapa el tablero, el mapa y los botones Guardar del celular, y se lee como «chat de soporte».
- Al tocarlo, **primero se saca la foto** y después se abre el panel, así el panel no sale en la captura.
- **El panel:**
  - La captura, con **Marcar** (lápiz, recuadro y **Tapar** en negro), **Sumar imagen** (galería, archivo o pegar) y **Quitar**.
  - El tipo, en tres tarjetas:
    - **Error:** algo no anda.
    - **Corrección:** anda, pero algo está mal.
    - **Mejora:** anda, pero se podría hacer mejor.
  - Una descripción con un ejemplo que cambia según el tipo.
  - Si eligió Error, una sola pregunta: «¿Te frena el trabajo?».
  - Si en esa pantalla ya hay un reporte abierto, le aparece «¿Es alguno de estos?» con el botón **Me pasa lo mismo**, que suma a la persona al reporte que ya existe.
  - Una línea plegable que muestra qué se manda solo (pantalla, navegador, versión y errores).
- **Mis reportes:** cada reporte con una barra de estado (Enviado → Joaquín ya lo vio → Lo están arreglando → ¡Listo!), la conversación y, cuando se resuelve, «Ya está, gracias» / «Sigue pasando». «Sigue pasando» lo reabre.
- **Campanita:** avisa cuando cambia el estado o le escriben.

**JS: bandeja en /sistemas/revision**
- Pestañas por estado: Nuevo, Visto, En curso, Resuelto y Descartado (con motivo).
- Una franja con 5 métricas, filtros y una lista con detalle al costado.
- **Orden:** primero lo que frena el trabajo, después lo que tiene más «me pasa lo mismo», después lo más viejo.
- **Detalle:**
  - captura grande, con el interruptor «con marcas / original»;
  - conversación con respuestas rápidas;
  - prioridad (la pone JS, no el usuario) y a cargo;
  - contexto técnico plegado;
  - Marcar duplicado, Descartar y **Resolver y avisar** (con el mensaje para el usuario).
- **Copiar para Claude Code:** arma un prompt con:
  - lo que dijo la persona;
  - la ruta y los docs del módulo;
  - la versión desplegada;
  - los errores de consola y los pedidos que fallaron;
  - el enlace a la captura;
  - el pedido de poner «Sistemas #N» en el commit;
  - el pedido de redactar 2 líneas para avisarle a la persona.
- Lista y no kanban: con una sola persona revisando, arrastrar tarjetas no suma.

**Recorrido obligatorio**
- Dura un minuto: bienvenida más 5 pasos con «Siguiente» (el botón Reportar, la captura, los tipos, qué se manda y la campanita con Mis reportes). Sin reporte de práctica, por decisión de JS (§5).
- No se puede cerrar ni saltear.
- El progreso se guarda **en la base**: si recarga, retoma donde quedó, y no se lo vuelve a pedir en otro dispositivo.
- No interrumpe:
  - arranca recién después de `/cambiar-clave`;
  - se posterga en `/p/…`, `/fichadas/escanear` y `/kiosco`;
  - no le sale a la cuenta técnica del pañol.
- La misma mecánica sirve para **Novedades del sistema**: obligatorias o «para leer», con una lista en el menú del avatar para volver a verlas.

## 2. Cómo se construye

**Captura de pantalla.**
- Se probaron 6 librerías contra capturas nativas:
  - **html2canvas falla entera** con los colores `oklch()` de la app.
  - modern-screenshot y dom-to-image pierden el scroll del `<main>`.
  - **`@zumer/snapdom@3.3.4`** salió idéntica, tarda menos de 0,6 s en una tabla de 3000 filas y anda en WebKit (Safari).
- Se carga recién al tocar el botón.
- **Mapas y Modelador:** antes de capturar, cada canvas WebGL entrega una foto de sí mismo (`map.redraw()` o `renderer.render()` más `toDataURL`). Sin eso salen en blanco.
- **Plan B, siempre visible:** pegar con Ctrl+V, subir desde la galería y, en la PC con Chrome, «captura exacta» con `getDisplayMedia`.
- **Formato:** WebP 0,85 (Safari no genera WebP y entrega PNG), con 1920 px como máximo de lado largo. Pesa entre 100 y 400 KB.
- **Editor de marcas:** propio, con canvas 2D y sin librería. Se sube solo la versión aplanada, nunca la original sin tapar.

**Contexto automático.**
- Lo junta `src/instrumentation-client.ts` (Next 16) con buffers en memoria:
  - los últimos errores de consola;
  - los pedidos que fallaron (sin cuerpos ni tokens);
  - las últimas pantallas visitadas.
- El SHA del deploy se expone con `NEXT_PUBLIC_SHA` en `next.config.ts`. Si el del navegador y el del servidor no coinciden, la pestaña estaba vieja.
- El servidor sanea JWT, mails y query params.

**Datos.**
- **Tablas:**
  - `sis_reportes`, con número correlativo #N, tipo, estado, prioridad, `duplicado_de`, ruta, SHA y contexto `jsonb`;
  - `sis_reporte_capturas`, con 6 como máximo;
  - `sis_reporte_eventos`, una sola línea de tiempo para mensajes, cambios de estado y notas internas;
  - `recorridos_vistos`, genérica, por usuario, clave y versión.
- **Escritura:** se escribe solo por RPC `SECURITY DEFINER`, con un límite de 20 reportes por persona por día.
- **Archivos:** bucket privado `sistemas` (5 MB, imágenes), con subida por URL firmada (el patrón de `api/comercial/asistente/adjuntos`) y lectura con URLs firmadas.
- **Permisos:** un módulo `sistemas` con `exigeExplicito` en `acceso.ts`. Reportar y Mis reportes son de todos, y la revisión es solo de quien tenga el módulo.
  - Hay que separar las rutas (`/sistemas/mis-reportes` y `/sistemas/revision`): `RUTAS_DE_TODOS` compara por prefijo.
- **Avisos:** van por `crearAlertas()` con tipos nuevos y siempre con `createAdminClient()`, porque la RLS de `alertas` no deja insertar a los roles campo, depósito ni comercial.

**IA.** En la etapa 1, nada: el prompt para Claude Code se arma sin IA. Más adelante:
- duplicados por «firma de error» más la ruta (sin IA);
- título automático en `after()`;
- nota de voz con la transcripción de ElevenLabs que ya está en el repo.

## 3. Etapas

**Etapa 1 (≈ 8 a 10 días-persona):**
- migraciones (tablas, RPC, bucket y `recorridos_vistos`);
- permisos y menú;
- captura y contexto;
- panel de reporte;
- Mis reportes;
- avisos;
- bandeja con «Copiar para Claude Code»;
- recorrido obligatorio.

**Etapa 2:**
- sugerencia de duplicados;
- captura exacta con `getDisplayMedia`;
- lista de Novedades;
- quién falta hacer el recorrido;
- limpieza de capturas huérfanas;
- script para bajar las capturas desde Claude Code.

**Etapa 3:**
- nota de voz;
- reportar desde el kiosco;
- enriquecer el prompt con IA;
- retención de capturas viejas.

## 4. Riesgos

- **Privacidad:** las capturas pueden mostrar sueldos o Dirección › Socios. Se cubre con Tapar, el aviso en pantallas sensibles, el bucket privado, el módulo explícito y alertas con títulos genéricos (cualquier admin ve todas las alertas).
- **Envolver `fetch` y `console`** puede afectar el streaming del asistente. El wrapper no lee el body, va todo en try/catch, y antes de desplegar se corre el e2e del asistente.
- **Agujero negro:** si nadie contesta, la gente deja de reportar. Por eso se avisa en cada cambio, el descarte exige motivo, hay «Sigue pasando» y la meta de primera respuesta es de 2 días hábiles.
- **Celulares reales:** snapdom se probó en WebKit de escritorio. Falta probarlo en un iPhone y un Android.

## 5. Lo que decidió JS (17/10)

1. **Nombre en los textos: «Sistemas», sin nombres propios.** Por ejemplo, «Lo revisan en Sistemas», «Mandar a Sistemas» o «Sistemas ya lo vio». En la conversación, los mensajes de los revisores salen firmados como «Sistemas».
2. **Revisan JS y Juan Pablo Mansilla (jpm@).** En la interfaz no aparecen sus nombres. El módulo `sistemas` con `exigeExplicito` se les da a los dos, y ningún otro admin lo trae solo. Los avisos de reporte nuevo les llegan a los dos.
3. **El recorrido es sin reporte de práctica, pero obligatorio para todos los que entran**, también los usuarios nuevos (`paraNuevos: true`).
   - Son solo tarjetas con «Siguiente»; no se puede cerrar ni saltear.
   - En el paso 2 el panel se abre solo, para mostrar la captura, los tipos y el botón Mandar, y se cierra en el paso 5.
   - Se registra recién al tocar «Entendido» en el último paso.
4. **Slack: sí.** Los errores que frenan el trabajo se espejan en un canal nuevo, #sistemas, con `DESTINOS` en `alertas/slack.ts` y un webhook nuevo. El resto queda solo en la campanita.
5. **Nota de voz: etapa 2.** En la etapa 1 no hay botón «Dictar».
6. **Sin asignación.** Todo queda en JS: no hay campo «A cargo» ni se reasigna. Juan Pablo puede ver, responder y cambiar estados.

Cómo cambia el resto de la propuesta:
- Se sacan del alcance la tabla de práctica y `es_prueba`.
- La etapa 2 suma la nota de voz.
- El recorrido de la maqueta (`sis-recorrido-v2`) ya refleja el punto 3.

Juan Pablo es Juan Pablo Mansilla (jpm@andamiosbuenosaires.com.ar, operativo).
