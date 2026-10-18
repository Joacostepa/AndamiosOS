> Registro del equipo de UX/UI (17/10/2026). La maqueta final ([maqueta.html](./maqueta.html)) aplicó después las críticas: donde este texto y la maqueta no coincidan, vale la maqueta. En la maqueta, el técnico de SyH aparece como «HyS (técnico, ejemplo)» (sólo nombres inventados).

# Maqueta de RRHH: especificación de UX para los constructores

*Base: `docs/rrhh/propuesta.md` (secciones 3, 4, 7 y 11) y las maquetas `docs/sistemas/maqueta.html`, `docs/partes/maqueta.html` y `docs/sofia/crm-maqueta.html`. Se entrega un solo archivo: `docs/rrhh/maqueta.html`.*

---

## 0. Decisiones que tomó esta especificación (leer antes que nada)

La maqueta tiene que ser coherente: cada número que cambia en una pantalla cambia en todas. Para eso hubo que resolver cosas que la sección 11 de la propuesta dejaba abiertas o contradictorias. Las dos primeras afectan a toda la maqueta.

**D-1. Fecha de la maqueta: viernes 16/10/2026, 18:30, y no viernes 17/10.** El 17/10/2026 cae sábado (lo verifiqué). Todos los días de la semana que nombra la propuesta están corridos un día: "lunes 20/10" es martes, "martes 21/10" es miércoles y "lunes 27/10" es martes. Si "hoy" pasa a ser el viernes 16/10, todo cierra y se conservan las fechas sin día de la semana.

| Propuesta | Maqueta |
|---|---|
| Hoy, viernes 17/10 | **Hoy, viernes 16/10/2026** |
| La cuadrilla 3 sale el lunes 20/10 | **Lunes 19/10**, 7:00 |
| Turno en la ART: martes 21/10, 8 h | **Martes 20/10**, 8 h |
| El arnés en el pañol desde el lunes 27/10 | **Desde el lunes 26/10** |
| "Firmado el 17/10 a las 18:42" | **"Firmado el 16/10 a las 18:42"** |
| "Se envía el lunes 7:00" | Se programa para el domingo 18/10 y sale el **lunes 19/10 a las 7:00** |
| Walter: el registro vence el 29/10, "en 12 días" | Vence el 29/10, **en 13 días** |
| Lucas: baja el 15/10, Fondo de Cese antes del 17/10 a la tarde | Se mantiene: el 15/10 es jueves y 48 h después es el sábado 17/10 |
| Vacaciones de Ramiro, 05/01 al 18/01 | **Martes 05/01/2027 al lunes 18/01/2027** (14 días) |

**D-2. Cada recorrido arranca de su propio estado inicial.** El estado por defecto es "viernes 16/10, 18:30, antes de todo", con los números de la sección 11. Al empezar un recorrido, la maqueta pone el estado que ese recorrido necesita (por ejemplo, saca el "hoy no voy" de Mauro para que se vea cómo entra). Lo que se hace navegando libre queda hecho hasta tocar «Reiniciar maqueta».

**D-3. Recibo de septiembre de Ramiro.** La sección 11 lo da firmado el 06/10 (O3) y a la vez lo firma en el recorrido (M3). Queda así: **septiembre arranca "sin abrir"** (Ramiro es uno de los 4 que no lo abrieron) y **agosto aparece firmado conforme el 05/09 a las 09:12**, para mostrar la evidencia de una firma sin hacer el recorrido.

**D-4. El comunicado del arnés es solo para obra.** "38 de 45" no cierra con un alcance de obra. Queda **23 de 30 con "Entendido", 7 pendientes**. El "7" del tablero (O1) se mantiene.

**D-5. Destrabe o advertencia.** El destrabe solo existe en modo bloqueo. Hay un interruptor global **Habilitación: Advertencia (etapa 1) / Bloqueo (etapa 3)**, que arranca en Advertencia. En O1, la tarjeta se llama "Asignados con advertencia esta semana: 1" en modo Advertencia y "Destrabes de esta semana: 1" en modo Bloqueo. El caso previo es de Darío Coria, el martes 13/10.

**D-6. A Brian no lo destraba el planificador.** Le falta el preocupacional, que la Res. SRT 37/10 exige antes de empezar. La sección 11 lo llama "bloqueo real". En O9 no tiene botón «Destrabar» y se le indica hablar con RRHH. Va marcado como **decisión de la maqueta a confirmar por JS**.

**D-7. Ver el recibo sin PIN.** C3 dice que los recibos "se abren con conexión y PIN". M3 dice que Mauro, sin PIN, "lo puede ver y bajar igual". Se sigue M3 (y C1: siempre se puede descargar) y **se marca como decisión a confirmar**.

**D-8. Firma de la oficina (O15).** La oficina no tiene PIN del pañol: firma **con su sesión de AndamiosOS**, con una confirmación explícita. Se marca como decisión a confirmar.

**D-9. Kiosco (M10).** Ningún personaje de la sección 11 está "sin celular" y además tiene un recibo pendiente. Queda así:
- Variante por defecto: **Mauro, lunes 19/10 a las 7:05**, con el PIN recién entregado en el pañol. Tiene 1 recibo y 1 comunicado. Esto cierra el recorrido de "sin PIN".
- Variante: **Brian, sin celular según el relevamiento**. Tiene 1 comunicado y el reglamento interno para firmar. No tiene recibo de septiembre porque entró el 06/10.

**D-10. Jefe de Lucía.** Para que el Ing. Pablo Rinaldi tenga a quién aprobarle algo, en la maqueta es el jefe directo de Lucía "según el organigrama (ejemplo)".

**D-11. "Hoy no voy" a confirmar: 2.** Son Mauro (enfermo, con link de ReNaPDiS) y **Walter (trámite: renovación del registro)**. Lo de Walter cierra con su vencimiento del 29/10.

**D-12. Funciones sin pantalla propia en la sección 11.** Entran como subestados para que se vea toda la propuesta (sección 8 de este documento): G1 «Otros pedidos», G2 «Qué hago si…», E2 cumpleaños, G4 vista de JS, C2 exportación para la ART, el relevamiento del canal (etapa 0) y la variante "recibos contratados afuera".

---

## 1. Cómo se navega la maqueta

### 1.1 Estructura de la página

De arriba hacia abajo:

1. **Barra de la maqueta.** Queda fija arriba y está fuera de la app. Usa el estilo `.bar` de Sistemas: píldoras y segmentados, mono para las etiquetas.
2. **Franja "Qué estás viendo".** Una línea que se puede desplegar.
3. **Escenario.** Muestra el marco de la oficina, el teléfono o la tablet del kiosco.
4. **Barra de recorrido.** Flota abajo dentro del escenario, solo mientras hay un recorrido activo.

### 1.2 Barra de la maqueta (orden de izquierda a derecha)

| Control | Valores | Qué hace |
|---|---|---|
| Marca | «RRHH · maqueta · datos de ejemplo» con el cuadradito coral | Fijo |
| **Selector de mundo** (segmentado grande, el control principal) | **«Oficina · escritorio»** / **«Obra · celular y kiosco»** | Cambia el escenario y el índice. Recuerda la última pantalla de cada mundo |
| **Pantallas** (botón con ícono `list`) | Abre el índice (1.3) | Atajo de teclado: `i` |
| **Recorridos** (botón con ícono `route`) | Abre la lista de recorridos (1.4) | |
| **Ver como** (select) | Oficina: Carolina (RRHH, por defecto) · Daniela (planificación) · JS (dirección) · Ing. Rinaldi · Lucía. Obra: Ramiro (por defecto) · Mauro · Tito (capataz) · Walter · Brian (kiosco) · Lucas (dado de baja) | Cambia los permisos, la campanita, el inicio del link y los botones visibles. Cada pantalla trae su persona por defecto |
| **Señal** (solo en Obra) | Con señal / **Sin señal** | Muestra la barra ámbar y encola las acciones (6.1, regla 9) |
| **Habilitación** | Advertencia / Bloqueo | D-5. Se nota en O1, O2, O9 y M8 |
| **Recibos** | Se construyen / Se contratan afuera | Cambia O10, M2, M3 y O15 (decisión de la etapa 0) |
| **Etapas** (botón) | Abre el panel de etapas (1.6) | |
| Tema (solo para Oficina) | Claro / Oscuro | Arranca en **oscuro**, como AndamiosOS. Obra es **siempre clara** |
| «Reiniciar maqueta» | | Vuelve al estado por defecto (D-2) |

En pantallas de menos de 760 px, la barra hace scroll horizontal y los controles secundarios (Señal, Habilitación, Recibos y Tema) pasan a un menú «Opciones».

### 1.3 Índice de pantallas

Es un panel lateral de 360 px desde la izquierda, y a pantalla completa en el celular. Tiene dos columnas, una por mundo; en el celular van una debajo de la otra. Cada ítem muestra:
- el código en mono;
- el nombre corto;
- un chip de etapa con su color: 0 gris, 1 azul, 2a coral, 2b coral claro, 3 verde, 4 neutro con borde punteado;
- la persona por defecto, en gris.

La pantalla actual va marcada. Al tocar un ítem se cambian el mundo y la persona.

**Oficina · escritorio**

| Código | Nombre corto | Etapa | Persona por defecto |
|---|---|---|---|
| O1 | Tablero de RRHH | 1 (se completa en 2 y 3) | Carolina |
| O2 | Personas | 1 | Carolina |
| O3 | Ficha de obra · Ramiro | 1 (Recibos desde 2a) | Carolina |
| O4 | Ficha de oficina · Lucía | 1 | Carolina |
| O5 | Vencimientos | 1 | Carolina |
| O6 | Subir documento | 1 | Carolina |
| O7 | Control de la Nómina ART | 1 | Carolina |
| O8 | Carpeta por comitente | 3 | Carolina |
| O9 | Hoja del día con habilitación | 1 (advertencia) · 3 (bloqueo) | Daniela |
| O10 | Recibos del mes | 2a, solo si se construye | Carolina |
| O11 | Comunicados | 2b | Carolina (publica JS) |
| O12 | Ausencias y vacaciones | 2b (hoy no voy) · 3 (vacaciones) | Daniela |
| O13 | Novedades del mes | 3 | Carolina |
| O14 | Altas y bajas | 3 | Carolina |
| O15 | Mi espacio · Lucía | 2b–3 | Lucía |

**Obra · celular y kiosco**

| Código | Nombre corto | Etapa | Persona por defecto |
|---|---|---|---|
| M1 | El mensaje de WhatsApp | 2a | Ramiro |
| M2 | Inicio del link | 2a–2b | Ramiro |
| M2-P | Otros pedidos | 3 | Ramiro |
| M2-Q | Qué hago si… | 4 (la ficha de accidente se puede adelantar) | Ramiro |
| M3 | Firmar el recibo | 2a | Ramiro (variante Mauro) |
| M4 | Comunicado con "Entendido" | 2b | Ramiro |
| M5 | Hoy no voy | 2b | Mauro |
| M6 | Pedir vacaciones | 3 | Ramiro |
| M7 | Mis papeles | 2b | Ramiro (variantes Mauro y Walter) |
| M8 | Capataz: pedir por otro | 2b–3 | Tito |
| M9 | Kiosco: entrega de EPP | 2a | Néstor y Ramiro |
| M10 | Kiosco: lo pendiente | 2a–2b | Mauro (variante Brian) |

Al pie del índice va un renglón: «Lo que no está en la maqueta a propósito → Etapas». Abre el panel de 1.6 en su última sección.

### 1.4 Recorridos

La lista se abre desde «Recorridos». Cada fila muestra número, título, una línea de "qué se ve", la cantidad de pasos y los mundos que toca (íconos `monitor` y `smartphone`). Al elegir uno:
- la maqueta pone el estado inicial del recorrido (D-2);
- va al paso 1;
- muestra la **barra de recorrido**, abajo, centrada, de 560 px como máximo y en `--card` con sombra: «Recorrido 1 · Paso 3 de 8 — Ramiro abre el link desde WhatsApp», con [Anterior] [Siguiente] [Salir].

En los pasos que piden una acción, el elemento lleva el anillo coral del recorrido de Sistemas (`.tour .ring`) y la barra dice «Tocá "Firmo conforme" para seguir». **«Siguiente» hace la acción por vos**, para que JS pueda pasar rápido. Al cambiar de mundo, el escenario hace un fundido corto de 150 ms (ninguno con `prefers-reduced-motion`) y la barra avisa: «Ahora, en la oficina: Carolina ve la firma».

Los doce recorridos, con sus pasos, están en la sección 7.

### 1.5 Franja "Qué estás viendo"

Va debajo de la barra, en todas las pantallas. Cerrada ocupa una línea:

`O3 · Ficha de persona de obra` · **La usa:** Carolina (RRHH) · **Por:** web de AndamiosOS · **Etapa 1** · **Funciones:** A1, A2, B1 · [Más ▾]

Desplegada muestra hasta 3 viñetas: para qué sirve, qué decide JS y de dónde sale en la propuesta. El chip de etapa usa el mismo color que el índice. El texto de cada pantalla está en la sección 3, en el renglón **Franja**.

### 1.6 Panel «Etapas»

Panel lateral derecho de 420 px. Responde "¿qué entra primero?":
- **Etapa 0 (sin código):** relevamiento del canal (ver O2), inventario de quién lee `personal`, ancla de la oficina (pregunta 5), las tres cotizaciones de recibos, contador, ART y abogado, y la constancia de vacaciones en PDF para esta temporada.
- **Etapas 1, 2a, 2b, 3 y 4:** la lista de funciones de la sección 7 de la propuesta. Cada función lleva sus pantallas como links (por ejemplo «B3 → O9, O2»).
- **Fuera:** muro, chat, evaluación 360, cursos, puntos y canjes, fichada con selfie, app para instalar, pulso con mapa de calor. Una línea de por qué en cada uno, de la sección 5.
- **Carriles aparte:** asistencia que escribe `x_parte_diario` (Juan Pablo y JS) y el módulo de SyH (PTS, charla de 5 minutos, verificación del andamio, aviso de accidente).
- **G3, pulso semestral:** "solo si sobra; no se maqueta".

### 1.7 Estado compartido

- Un solo objeto en memoria con las personas, los documentos, los recibos, los comunicados, las ausencias, los pedidos, los destrabes y la cola de WhatsApp. Todas las pantallas leen de ahí.
- `localStorage` se usa solo para el mundo y la pantalla actuales, el tema y si el índice está abierto, siempre dentro de try/catch. La maqueta tiene que arrancar bien sin él.
- Las acciones muestran un toast abajo a la derecha en la oficina y arriba en el celular: «Listo», y «Deshacer» cuando se puede.

---

## 2. Datos de ejemplo

Todos los datos son inventados. En el pie de O1, O2 y O10 va el texto «Datos de ejemplo: nombres, montos y obras inventados». Los montos llevan el chip **EJEMPLO**.

### 2.1 Elenco (sección 11) con los datos que se suman

| Persona | Puesto y lugar | Canal | PIN | Estado clave |
|---|---|---|---|---|
| Ramiro Ledesma | Oficial montador, cuadrilla 3 | WhatsApp (Android, con datos) | Sí | Todo en verde. Ingresó en 03/2019 y le corresponden 21 días |
| Mauro Giménez | Ayudante, cuadrilla 3 | WhatsApp | **No** | Apto de altura vencido el 02/10. Turno en la ART el martes 20/10 a las 8 h (se agenda en R7). Hoy no va: enfermo |
| Héctor «Tito» Paz | Capataz, cuadrilla 3, responsable de la tarea en altura | WhatsApp | Sí | Curso de altura hasta el 15/11. En el PDF del contador figura como «PAZ, HECTOR OMAR» |
| Walter Sosa | Chofer del camión con hidrogrúa | **Telegram** | Sí | Registro vence el 29/10. Hoy no va: trámite |
| Néstor Aguirre | Encargado de pañol | WhatsApp | Sí | Atiende el kiosco. Cumple años el sábado 17/10 |
| Brian Quiroga | Medio oficial, alta del 06/10, cuadrilla 3 desde el 19/10 | **Kiosco (sin celular)** | Sí (entregado el 06/10) | Sin preocupacional. No figura en la Nómina ART del 01/10 |
| Lucas Ferreyra | Ayudante, baja del 15/10 (era de la cuadrilla 3) | — | Revocado | Checklist de baja abierto |
| Carolina Benítez | Administración, operadora de RRHH | Web | — | |
| Lucía Ferraro | Comercial | Web | — | Le quedan 14 días. Recibo de septiembre abierto sin firmar |
| Ing. Pablo Rinaldi | Oficina técnica, jefe de Lucía (D-10) | Web | — | |
| Daniela Ojeda | Logística y planificación | Web | — | Arma la Hoja del día |
| Sergio Molina | Montador de "Montajes Molina" (contratista) | — | — | Apto hasta el 20/11 |
| JS | Dueño y director | Web | — | Publica comunicados y recibe los destrabes |
| Iñaki Capurro | Técnico de SyH (nombrado en el repo) | Web | — | Solo se lo nombra: «HyS revisa después» |

### 2.2 Personas de relleno, para tablas y listas

Son inventadas y no aparecen en ningún otro lugar del repo. Usarlas solo donde haga falta llenar.

**Obra:**
- Gustavo Arce: oficial, cuadrilla 1, apto hasta el 05/11.
- Nicolás Olmedo: medio oficial, cuadrilla 1, curso hasta el 09/11.
- Hugo Ponce: ayudante, cuadrilla 1. "A regularizar": preocupacional de 2016 sin archivo. **No dio consentimiento** para la carpeta.
- Cristian Maidana: chofer, registro hasta el 14/11.
- Fernando Lencina: medio oficial, cuadrilla 2. Curso de altura vencido el 28/09. Canal **sin relevar**, sin PIN.
- Darío Coria: ayudante, cuadrilla 2. Asignado con advertencia el 13/10.
- Matías Sequeira, Raúl Galván y Pedro Robledo: los 3 en disconformidad con el recibo.
- Javier Moyano, Diego Cáceres, Ariel Ayala, Leandro Juárez y Omar Salvatierra: pendientes de firma y de comunicado.

**Contratistas (Montajes Molina):**
- Ezequiel Zárate: seguro de accidentes personales hasta el 12/11.
- Julián Barrios.
- Omar Duarte.

**Oficina:** Paula Montenegro, Silvia Carrizo y Andrés Galván (ojo: no confundirlo con Raúl Galván).

### 2.3 Obras

| Obra | Comitente | Paquete | Cuadrilla |
|---|---|---|---|
| Fachada Av. Cabildo 2350 | Constructora Vértice SA | Básico (Nómina ART) | 3, desde el lunes 19/10 a las 7:00 |
| Torre Parque Chas, calle Bauness 1800 | Desarrollos Ombú SRL | Completo | 1 |
| Colegio en Ramos Mejía | — | Básico + no repetición | 2 |

### 2.4 Números iniciales y cómo cambian

| Contador | Inicial | Cambia con |
|---|---|---|
| Dotación | 45 (30 de obra y 15 de oficina) + 4 de contratistas | No cambia (Lucas ya no cuenta y Brian sí) |
| Relevamiento del canal | 31 de 45 | No cambia |
| Fuera de la Nómina ART | 1 (Brian) | Pasa a 0 al subir la nómina nueva en O7 |
| Vencidos | 2 (Mauro y Lencina) | Pasa a 1 al subir el apto nuevo de Mauro (R7) |
| Vencen en 30 días | 6: Walter 29/10, Arce 05/11, Olmedo 09/11, Zárate 12/11, Maidana 14/11, Tito 15/11 | No cambia |
| Hoy no voy a confirmar | 2 | Cada confirmación en O12 resta 1 |
| Recibo de septiembre | 36 firmados (33 conformes y 3 en disconformidad), 5 abiertos sin firmar (Mauro entre ellos), 4 sin abrir (Ramiro entre ellos). Pendientes: 9 | Ramiro abre: 6 abiertos y 3 sin abrir. Ramiro firma: **37** y 8 pendientes. Mauro firma en el kiosco: **38** y 7 pendientes |
| Comunicado del arnés | 23 de 30 «Entendido», 7 pendientes (Ramiro, Mauro, Brian, Lencina, Moyano, Cáceres y Ayala) | Ramiro: 24 y 6. Mauro en el kiosco: 25 y 5 |
| Asignados con advertencia o destrabes | 1 (Coria, 13/10) | Mauro (R6): 2 |
| Saldo de Ramiro | 21 | Aprobado su pedido: le quedan 7 |
| Saldo de Lucía | 14 | Aprobado su pedido: 0 |

---

## 3. Pantallas

### 3.0 Marco de la oficina, común a O1–O15

- **Marco:** el de `docs/sistemas/maqueta.html`, con sus tokens copiados tal cual (son espejo de `src/app/globals.css`): riel oscuro de 52 px que se abre a 248 px al pasar el mouse, header de 56 px con búsqueda «Buscar… ⌘K», campanita con número, avatar y botón «Reportar». Contenido con padding de 22 px por 24 px. Fuentes DM Sans y JetBrains Mono. Íconos de lucide 0.460.0 desde unpkg.
- **Menú lateral, grupo «Personal y Flota»** (se agregan dos ítems a los de hoy):
  - **RRHH** (ícono `id-card`, chip «Nuevo»), con subítems: Tablero (O1), Personas (O2), Vencimientos (O5), Ausencias y vacaciones (O12, con número), Recibos (O10), Comunicados (O11), Novedades del mes (O13), Altas y bajas (O14). Lo ven Carolina y JS. Daniela ve solo «Ausencias y vacaciones».
  - **Mi espacio** (ícono `user-round`): lo ven todos los de la oficina (O15).
  - Siguen Legajos, Fichadas, Vehículos y Organigrama.
- **O7 y O8** viven en *Operaciones › Habilitaciones*. **O9** vive en *Operaciones › Planificación › Hoja del día*.
- **Encabezado de cada página:** h1 de 26 px, subtítulo gris y acciones a la derecha (`.ph`).
- **Campanita según quién mira:**
  - Carolina: «Mauro Giménez avisó que hoy no va», «Ramiro Ledesma firmó el recibo de septiembre» (después de R1), «Vence el registro de Walter Sosa en 13 días».
  - JS: «Daniela destrabó a Mauro Giménez para el lunes 19/10: "…motivo…"» (después de R6) y **«Mañana, sábado 17/10, cumple años Néstor Aguirre. Llamalo.»** (E2).
  - Lucía: «Comunicado: el viernes 30/10 la oficina cierra a las 15 h».
- **Componente compartido "Cola de WhatsApp"** (modal ancho): ver 3.0.1.

#### 3.0.1 Cola de WhatsApp (la usan O1, O3, O5, O8, O10, O11 y O12)

Mandar a mano es la base del canal, así que tiene que ser rápido y sin errores.
- **Título:** «Mandar por WhatsApp · 9 personas». **Subtítulo:** «Se abre WhatsApp con el mensaje armado. Vos tocás Enviar.»
- **Lista:** una fila por persona con nombre, canal y estado. El estado es «Por mandar», «Abierto» o «Mandado».
  - Los de **Telegram** dicen «Le llega por Telegram» y se marcan solos.
  - Los de **kiosco** dicen «No tiene celular: le aparece en el kiosco».
  - Los **sin relevar** dicen «Sin relevar: avisale al capataz».
- **A la derecha:** la vista previa del texto, que se puede editar y lleva el link de ejemplo `aba.ar/r/k7Q2x9` (ejemplo).
- **Botón principal:** «Abrir WhatsApp de Ramiro (1 de 7)». En la maqueta no abre nada: pasa la fila a «Abierto» y aparece «Marcar como mandado y seguir».
- **Aviso fijo al pie:** «No se manda nada a obra después de las 21 h ni los domingos.»
  - Si la hora de la maqueta es posterior (no lo es por defecto), el botón cambia a «Programar para mañana 7:00».
- **El texto nunca incluye montos ni motivos.**

---

### O1. Tablero de RRHH

- **Franja:** La usa Carolina (RRHH) · Web · Etapa 1, se completa en la 2 y la 3 · Reúne B1, B2, B3, C1, D1 y E1. *Más:* "Es lo primero que abre la operadora cada mañana: qué la obliga a hacer algo hoy." · "Si no hay alguien nombrado que lo mire, el semáforo miente (riesgo 1)."
- **Objetivo:** ver en 5 segundos qué hay que resolver hoy.
- **Jerarquía:**
  1. **Encabezado:** «RRHH», con el subtítulo «Viernes 16/10/2026 · 45 personas: 30 de obra y 15 de oficina · 4 de contratistas». Acción secundaria: «Exportar constancias de EPP para la ART» (C2).
  2. **"Para hoy"**: una grilla de tarjetas de 3 columnas en escritorio y 1 en el celular, ordenadas por urgencia. Cada tarjeta tiene un número grande (28 px), un título, 1 o 2 líneas de detalle y un botón:

| # | Tarjeta | Detalle | Botón |
|---|---|---|---|
| 1 | **Fuera de la última Nómina ART: 1** (borde rojo) | «Brian Quiroga · Fachada Av. Cabildo 2350 · sale el lunes 19/10 a las 7:00» | «Pedir actualización al contador» |
| 2 | **Vencidos: 2** | «Mauro Giménez, apto de altura (02/10) · Fernando Lencina, curso de altura (28/09)» | «Ver vencidos» → O5 |
| 3 | **Hoy no voy a confirmar: 2** | «Mauro Giménez (con certificado) · Walter Sosa (trámite)» | «Abrir bandeja» → O12 |
| 4 | **Vencen en 30 días: 6** | «El primero: registro de Walter Sosa, 29/10» | «Ver vencimientos» → O5 |
| 5 | **Recibo de septiembre: 9 de 45 sin firmar** | «5 abiertos sin firmar · 4 sin abrir · 29 firmaron en 72 h» | «Reenviar por WhatsApp» → cola |
| 6 | **Comunicados sin «Entendido»: 7** | «Arnés: retiro y devolución diaria (obra)» | «Reenviar por WhatsApp» → cola |
| 7 | **Asignados con advertencia esta semana: 1** / **Destrabes de esta semana: 1** (D-5) | «Darío Coria, martes 13/10» | «Ver destrabes» → popover con la lista: persona, quién, motivo y «HyS revisó: no» |

  3. **"Este mes"**, en una fila más chica: «Novedades de octubre: cierra el 31/10» → O13 · «Altas y bajas: 1 alta con faltantes y 1 baja abierta» → O14 · «Relevamiento del canal: 31 de 45» → O2 filtrado.
- **Acciones:**
  - «Pedir actualización al contador» abre el mismo modal de mail que O7 (O7, primera acción).
  - «Exportar constancias de EPP para la ART» abre un modal con «Desde / hasta», «Personas: todas» y dos salidas: «Armar ZIP» o «Copiar link temporal (vence en 7 días)». Lleva la nota «Hay que confirmar con la ART que esto alcanza como "acceso"».
- **Ver como JS (G4):** el mismo tablero sin botones de acción, con una tarjeta más: «Ausentismo de octubre: 3,1 % (ejemplo)». La campanita muestra el cumpleaños.
- **Estado vacío** (para usar en un recorrido de reset): «Todo en orden: no hay vencimientos, firmas ni avisos pendientes.»

### O2. Personas

- **Franja:** Carolina · Web · Etapa 1 · A1, con el relevamiento del canal de la etapa 0. *Más:* "No hay columna de CUIL ni DNI: los datos sensibles salen de la tabla (A2)." · "El canal se carga persona por persona en la etapa 0."
- **Objetivo:** encontrar a cualquiera y ver si puede salir a obra y por dónde le llega el link.
- **Jerarquía:**
  1. **Banner de la etapa 0** (info, se puede cerrar): «Relevamiento del canal: 31 de 45. Faltan 14: preguntales qué celular tienen, si tienen datos y si usan WhatsApp o Telegram.» [Ver los 14]
  2. **Pestañas con número:** Todos 49 · Obra 30 · Oficina 15 · Contratistas 4.
  3. **Filtros:** búsqueda «Buscar por nombre, CUIL o cuadrilla» (el CUIL se puede buscar pero no se muestra), chip «Habilitación» (Todas / No habilitados / Vence pronto / A regularizar), chip «Canal» (WhatsApp / Telegram / Kiosco / Sin relevar) y chip «Sin PIN».
  4. **Tabla** (`.tbl`, encabezado fijo, filas de 40 px): Nombre · Puesto · Cuadrilla o área · Habilitación · Canal · PIN · Última firma.
- **Filas** (mostrar estas 15 y al pie «Mostrando 15 de 49»):
  - Ramiro Ledesma · Oficial montador · Cuadrilla 3 · Habilitado (verde) · WhatsApp · Sí · Recibo de agosto, 05/09.
  - Mauro Giménez · Ayudante · C3 · **No habilitado: apto de altura vencido el 02/10** (rojo; en modo Advertencia el chip dice «Advertencia: apto vencido el 02/10», en ámbar con borde rojo) · WhatsApp · **No** · —.
  - Héctor «Tito» Paz · Capataz · C3 · Vence pronto: curso, 15/11 (ámbar) · WhatsApp · Sí.
  - Brian Quiroga · Medio oficial · C3 desde el 19/10 · **No habilitado: falta el preocupacional** (rojo en los dos modos, D-6) · Kiosco (sin celular) · Sí.
  - Walter Sosa · Chofer hidrogrúa · Logística · Vence pronto: registro, 29/10 · Telegram · Sí.
  - Néstor Aguirre · Encargado de pañol · Depósito · Habilitado · WhatsApp · Sí.
  - Gustavo Arce · Oficial · C1 · Vence pronto: apto, 05/11 · WhatsApp · Sí.
  - Fernando Lencina · Medio oficial · C2 · Advertencia: curso de altura vencido · **Sin relevar** · No.
  - Hugo Ponce · Ayudante · C1 · A regularizar: preocupacional sin archivo (azul grisáceo) · WhatsApp · Sí.
  - Lucas Ferreyra · Ayudante · — · Baja el 15/10 (gris; la fila en gris) · — · Revocado.
  - Carolina Benítez · Administración · Oficina · — · Web · —.
  - Lucía Ferraro · Comercial · Oficina · **sin semáforo de obra** (guion) · Web · —.
  - Ing. Pablo Rinaldi · Oficina técnica · Oficina · — · Web · —.
  - Daniela Ojeda · Logística y planificación · Oficina · — · Web · —.
  - Sergio Molina · Montador · Montajes Molina (contratista) · Habilitado · — · —.
- **Acciones:**
  - Al tocar una fila se abre O3, O4 o, para un contratista, un **panel lateral "Papeles para entrar a obra"** (B5): apto hasta el 20/11, EPP, alta del contratista, seguro de accidentes personales con no repetición. Botón «Subir documento» (O6) y la nota «Los contratistas no tienen ficha completa ni recibos».
  - «Nueva alta» → O14, en modo alta nueva.
  - «Exportar» → menú «Excel (sin datos sensibles)».
- **Estado vacío de búsqueda:** «No encontramos a nadie con "xxx". Probá con el apellido o el CUIL.»
- **Ver como Daniela:** la tabla es igual, sin los botones «Nueva alta» y «Exportar». No hay datos sensibles que ocultar porque no están en la tabla.

### O3. Ficha de persona de obra (Ramiro Ledesma)

- **Franja:** Carolina · Web · Etapa 1, la pestaña Recibos desde la 2a · A1, A2, B1, C0. *Más:* "La pestaña Sensible deja registro de cada lectura: eso pide A2." · "La evidencia de la firma es lo que ABA tendría que mostrar si alguien la desconoce (Ley 25.506, a confirmar con el abogado)."
- **Encabezado:** avatar «RL», «Ramiro Ledesma», chips **Habilitado** (verde) y **Obra**. Línea: «Oficial montador · Cuadrilla 3 · Capataz: Héctor "Tito" Paz · Ingreso 03/2019 (7 años: 21 días de vacaciones) · UOCRA · Categoría oficial · Responsable de la tarea en altura: no». **Acciones:** «Mandar link por WhatsApp ▾» (menú: Recibo de septiembre / Mis papeles / Comunicado pendiente; abre la cola) · «Subir documento» (O6) · «Editar».
- **Pestañas:** Datos · Papeles (3) · Ausencias y vacaciones · Recibos · **Sensible** (con candado).
- **Datos** (grilla clave-valor `.kv`):
  - Celular 11 5555-0123 (ejemplo).
  - **Canal: WhatsApp**, relevado el 03/10: Android, con datos.
  - PIN del pañol: sí, entregado en persona el 12/05/2025.
  - **Adhesión al canal digital: firmada en papel el 03/10/2026** [Ver escaneo].
  - Jefe según el organigrama: Tito Paz.
  - Odoo: vinculado.
  - CUIL, DNI, domicilio y nacimiento: visibles para Carolina y JS. Para cualquier otro aparecen enmascarados («20-•••••••-3») con la nota «Solo RRHH y JS».
- **Papeles** (tabla): Tipo · Estado · Vence · Entidad · Archivo.
  - Apto psicofísico de altura · **Vigente** · 14/03/2027 · (ejemplo) · «Solo la constancia "apto"» [Ver].
  - Curso de altura · Vigente · 10/06/2027 · «Capacitaciones Sur (ejemplo)» · con firma de asistencia [Ver].
  - EPP · Entregado el 08/09/2026 (pasa a **16/10/2026** después de R8) · [Ver constancia PDF].
  - Preocupacional y Alta en ARCA · «No se exige: ingresó antes de la puesta en marcha» (gris).
- **Ausencias y vacaciones:** «Saldo 2026: 21 días · Usados: 0 · Pedidos: 14 (05/01 al 18/01, **pendiente**)». Lista de ausencias del año: 2, con aviso. Después de R5 aparece: «Aprobado por Daniela Ojeda · Constancia de aviso firmada el 16/10».
- **Recibos** (tabla): Período · Estado · Detalle · Evidencia.
  - Septiembre 2026 · **Sin abrir** · «Enviado el 06/10 · recordatorio el 16/10 a las 18:30». Después de R1: **«Firmado conforme el 16/10 a las 18:42, desde su celular»** [Ver evidencia].
  - Agosto 2026 · Firmado conforme · 05/09 09:12, desde su celular [Ver evidencia].
  - Julio 2026 · En papel (antes del piloto).
- **Modal "Evidencia de la firma"** (línea de tiempo vertical, en mono):
  - Link creado el 16/10 a las 18:30.
  - Enviado por WhatsApp por Carolina Benítez a las 18:30.
  - Abierto a las 18:39, en Android con Chrome.
  - PIN del pañol validado a las 18:41.
  - Firmado conforme a las 18:42.
  - IP 181.•••.•••.12.
  - Hash del documento `a3f9 51c0 … 7e2d`.
  - Constancia al pie del PDF [Ver].
  - Adhesión al canal digital del 03/10 [Ver].
  - Pie: «Si Ramiro desconoce la firma, esto es lo que ABA tiene que poder mostrar.»
- **Sensible:** tarjeta con candado: «Salud, sueldo y sanciones. Lo ven solo RRHH y JS.» [Ver (queda registrado)].
  - Al tocar, se confirma: «Tu lectura queda registrada: Carolina Benítez, 16/10 a las 18:50.» [Ver] [Cancelar].
  - Ya abierta muestra:
    - **Salud:** constancias apto / no apto con fecha, nunca el estudio.
    - **Sanciones:** «Ninguna». Nota: «Se notifican por carta documento, nunca por WhatsApp.»
    - **Sueldo:** «Lo ves en Recibos.»
    - **Registro de lecturas:** «16/10 18:50 · Carolina Benítez · Sensible» · «02/10 11:05 · JS · constancia de apto».
- **Ver como Daniela:** la pestaña Sensible dice «No tenés permiso para ver esto. Lo ven RRHH y JS.», sin botón. Recibos queda oculto. En Datos, lo sensible aparece enmascarado.

### O4. Ficha de persona de oficina (Lucía Ferraro)

- **Franja:** Carolina · Web · Etapa 1 · A1 · **Depende de la pregunta 5** (cómo se ancla la oficina). *Más:* "La oficina no entra a Legajos de obra ni a la Hoja del día: se respeta la decisión del 10/10."
- **Encabezado:** «Lucía Ferraro», chip **Oficina**, sin semáforo de obra. Línea: «Comercial · Jefe directo (organigrama): Ing. Pablo Rinaldi (ejemplo) · Ingreso 02/2023 · Convenio: a confirmar con el contador (¿Comercio 130/75?)».
- **Banner gris:** «Ficha de oficina: no aparece en Legajos de obra, en la Hoja del día ni en el kiosco. Cómo se ancla lo decide JS (pregunta 5).»
- **Pestañas:** Datos · Papeles (solo generales, sin apto de altura) · Ausencias y vacaciones (le quedan 14 días; tiene un pedido del 28/12 al 10/01) · Recibos (septiembre: «Abierto el 08/10, sin firmar») · Comunicados (1 sin leer: «La oficina cierra a las 15 h el viernes 30/10») · Sensible (igual que O3).
- **Acciones:** las de O3 sin «Mandar link por WhatsApp». En su lugar va «Avisar por campanita».

### O5. Vencimientos

- **Franja:** Carolina · Web · Etapa 1 · B1, B5. *Más:* "El sistema avisa solo a los 30 y a los 7 días, por campanita y Slack, y a la persona por su canal." · "La periodicidad del apto de altura la fija la ART (pregunta 12)."
- **Jerarquía:**
  1. **Pestañas:** Vencidos (2) · Próximos 30 días (6) · 31 a 60 días (1) · Todos.
  2. **Filtros:** Tipo (Apto de altura / Curso / Registro / Preocupacional / Seguro AP / EPP) · Cuadrilla · Propios o contratistas.
  3. **Tabla:** casilla · semáforo · Persona · Tipo · Vence · «hace 14 días» o «en 13 días» · Último aviso · Acción.
- **Filas:**
  - **Vencidos:**
    - Mauro Giménez · Apto de altura · 02/10 · hace 14 días · «Avisado el 25/09 por WhatsApp» · [Pedir turno a la ART].
    - Fernando Lencina · Curso de altura · 28/09 · [Avisar a la persona] (sin relevar: «Avisale al capataz»).
  - **30 días:**
    - Walter Sosa · Registro de conducir · 29/10 · en 13 días · «Aviso automático a 30 días: 29/09 por Telegram» · [Avisar a la persona].
    - Arce · Apto · 05/11.
    - Olmedo · Curso · 09/11.
    - Ezequiel Zárate (Montajes Molina) · Seguro AP con no repetición · 12/11.
    - Maidana · Registro · 14/11.
    - Tito Paz · Curso de altura · 15/11.
  - **31 a 60 días:** Sergio Molina (contratista) · Apto · 20/11.
- **Acciones:**
  - **«Pedir turno a la ART»** abre un modal: «Pedí el turno a la ART y anotalo acá.» Campos: fecha y hora (de ejemplo, «martes 20/10, 8:00») y lugar («ART, sede de ejemplo»).
    - [Guardar turno] deja un chip «Turno: martes 20/10 a las 8 h» en la fila y un toast: «¿Le avisamos a Mauro?» [Avisar].
  - **«Avisar a la persona»** abre la cola de WhatsApp con el texto: «Hola Mauro, se te venció el apto de altura. Ya te sacamos turno en la ART: martes 20/10 a las 8. Mirá tus papeles acá: aba.ar/r/… (ejemplo).»
    - El tono es de cuidado («te sacamos turno»), nunca de reto.
  - **«Subir el nuevo»** abre O6 con la persona y el tipo cargados.
  - **Varias filas seleccionadas:** «Avisar a los 3 seleccionados».
- **Estado vacío:** «No vence nada en los próximos 30 días.»

### O6. Subir documento (modal de 560 px)

- **Franja:** Carolina · Web · Etapa 1 · B1. *Más:* "Del apto médico se guarda la constancia «apto / no apto», no el estudio." · "Las capacitaciones son un tipo de documento."
- **Campos, en orden:**
  1. Persona: buscador, cargado si se viene de otra pantalla.
  2. **Tipo** (select): Apto psicofísico de altura · Curso o capacitación · Preocupacional · Registro de conducir · Alta en ARCA · Seguro de accidentes personales (contratistas) · Sanción (restringido).
  3. Resultado, solo en aptos: **Apto / No apto** (dos botones segmentados).
  4. Emisión y Vencimiento (fecha). Pista: «La periodicidad del apto la fija la ART.»
  5. Entidad: en cursos y aptos.
  6. Archivo o foto: zona para soltar archivos con el texto «Arrastrá el PDF o sacá una foto con el celular». En cursos: «Firma de asistencia (opcional)».
  7. Casilla **«Solo se guarda la constancia apto / no apto, no el estudio»**: tildada y bloqueada en los aptos, con la pista «Es un dato de salud (Ley 25.326)».
- **Tipo Sanción:** caja ámbar: «Las sanciones se notifican por carta documento o telegrama, nunca por WhatsApp ni Telegram. Acá solo se guarda la constancia. La ven RRHH y JS.»
- **Acciones:** [Cancelar] [Guardar].
  - Guardar el apto nuevo de Mauro (vence en 2027) deja el toast «Guardado. Mauro Giménez ya está habilitado para salir a obra.» y actualiza O1, O2, O5, M7 y M8.
- **Errores:**
  - Archivo de 14 MB: «El archivo pesa 14 MB. Subí uno de menos de 10 MB o una foto.»
  - Vencimiento anterior a la emisión: «El vencimiento no puede ser antes de la emisión.»
  - Faltan campos: el botón queda deshabilitado y el campo que falta se resalta.

### O7. Control contra la Nómina ART (Habilitaciones › Fachada Av. Cabildo 2350)

- **Franja:** Carolina · Web, dentro de Habilitaciones · Etapa 1 · B2. *Más:* "El 82 % de las obras pide solo la Nómina ART: este control barato cubre casi todo." · "La nómina es un documento de la empresa que manda el contador."
- **Jerarquía:**
  1. **Encabezado de la obra:** «Fachada Av. Cabildo 2350 · Constructora Vértice SA · Paquete Básico (Nómina ART)». Pestañas de Habilitaciones con «Nómina ART» activa.
  2. **Alerta roja:** «Brian Quiroga no figura en la Nómina ART del 01/10. La cuadrilla 3 sale el lunes 19/10 a las 7:00. Pedile al contador la nómina actualizada.»
  3. **Tarjeta:** «Última Nómina ART subida: 01/10/2026 (septiembre) · 44 CUIL leídos» [Ver PDF].
  4. **Tabla «Cuadrilla 3 · lunes 19/10»:**
     - Héctor Paz: Figura.
     - Ramiro Ledesma: Figura.
     - Mauro Giménez: Figura, con un link chico al costado: «Apto vencido → Hoja del día».
     - **Brian Quiroga: No figura** (rojo), con la nota «Alta del 06/10, posterior a la nómina».
- **Acciones:**
  - **«Pedir nómina actualizada al contador»** abre un modal con el mail armado:
    - Para: «Estudio contable (ejemplo)».
    - Asunto: «Nómina ART actualizada: alta de Brian Quiroga».
    - Cuerpo: «Hola, ¿nos mandás la nómina de la ART actualizada? Entró Brian Quiroga el 06/10 y sale a obra el lunes 19/10. Gracias. Carolina.»
    - Botones: [Copiar] [Abrir en el mail]. Después la tarjeta queda con «Pedida al contador el 16/10 a las 18:55».
  - **«Subir nómina nueva»**: zona para soltar archivos. Al terminar: «Leímos 45 CUIL. Brian Quiroga ya figura.» La alerta pasa a verde y O1 queda en 0.
  - **«Ver en la Hoja del día»** → O9.
- **Variante:** chip ámbar «La nómina es de septiembre y estamos en octubre», aunque figuren todos.

### O8. Carpeta completa por comitente (Habilitaciones › Torre Parque Chas)

- **Franja:** Carolina · Web · **Etapa 3** · B4 (prioridad "conviene") y B5. *Más:* "Solo la pide el ~1 % de las obras." · "Separa los papeles de la empresa de los de cada persona; de salud va solo la constancia «apto», con consentimiento."
- **Encabezado:** «Torre Parque Chas, calle Bauness 1800 · Desarrollos Ombú SRL · Paquete Completo».
- **Bloque Empresa** (lista con estado):
  - F.931 de septiembre y su pago: vigentes.
  - Certificado de la ART con nómina (01/10).
  - Cláusula de no repetición a favor de Desarrollos Ombú SRL.
  - Seguro de vida.
  - Certificado del IERIC: «Opcional (transición a ARCA)», en gris.
- **Bloque Personas de la cuadrilla 1** (tabla): Persona · Apto (solo constancia) · Cursos · EPP · Consentimiento.
  - Gustavo Arce: completo, consentimiento sí.
  - Nicolás Olmedo: curso vence el 09/11, en ámbar.
  - **Hugo Ponce: fila en gris, consentimiento no**. Nota: «Su apto no se incluye».
  - Sergio Molina (Montajes Molina): apto, seguro AP.
- **Acciones:**
  - «Armar ZIP» → «ZIP listo: 14 archivos, 3,2 MB. Sin el apto de Hugo Ponce (falta su consentimiento).» [Bajar].
  - «Copiar link temporal (vence en 7 días)» → toast «Link copiado. Vence el 23/10.»
  - «Pedir consentimiento» en la fila de Hugo: abre la cola de WhatsApp. El consentimiento se firma con la pieza de firma (C0).

### O9. Hoja del día con habilitación (Daniela Ojeda, lunes 19/10)

- **Franja:** Daniela (planificación) · Web · Etapa 1 en modo advertencia, etapa 3 en modo bloqueo · B3 y B2. *Más:* "A las 6:30 no hay nadie más: por eso el planificador puede destrabar, con motivo, y a JS le llega el aviso al instante." · "Daniela ve el estado, nunca el estudio."
- **Layout:** el de la Hoja del día. A la izquierda, la columna «Disponibles»; a la derecha, las tarjetas de cuadrilla.
  - **Cuadrilla 3 → Fachada Av. Cabildo 2350, 7:00:** Tito Paz (capataz, chip «Responsable de altura»), Ramiro Ledesma y **Brian Quiroga** con un chip rojo «No puede salir a obra: alta nueva sin preocupacional» y otro rojo «No figura en la Nómina ART».
  - **Cuadrilla 2 → Colegio en Ramos Mejía:** advertencia ámbar «La cuadrilla no tiene responsable de la tarea en altura designado» y Lencina con «Curso de altura vencido» (es una advertencia, no un bloqueo).
  - **Disponibles:** Mauro Giménez, con un punto rojo y «Apto de altura vencido el 02/10».
- **Acción principal:** arrastrar a Mauro a la cuadrilla 3. Para quien no usa mouse hay un botón alternativo «Asignar a… ▾».
  - **Modo Advertencia:** aparece un aviso ámbar debajo del nombre: **«Apto de altura vencido el 02/10. Queda registrado si lo asignás.»** [Asignar igual] [Elegir a otro]. Al asignar queda el chip «Asignado con advertencia» y O1 sube a 2.
  - **Modo Bloqueo:** el aviso es rojo: **«Mauro no puede salir a obra: apto de altura vencido el 02/10.»** [Destrabar] [Elegir a otro].
    - [Destrabar] abre el modal **«Destrabar a Mauro Giménez para el lunes 19/10»**, con un campo **Motivo (obligatorio, lo leen JS y HyS)**, de 15 caracteres como mínimo. El texto de ejemplo dice «Tiene turno en la ART el martes, va solo a tareas en planta baja».
    - Nota del modal: «**Le avisamos a JS ahora.** HyS (Iñaki Capurro) lo revisa después.»
    - Botón: «Destrabar y avisar a JS», deshabilitado hasta que haya motivo.
    - Resultado: toast «Destrabado. Le avisamos a JS a las 19:02.», chip «Destrabado» con el motivo en un tooltip, la campanita de JS y O1 en «Destrabes de esta semana: 2».
- **Brian (D-6):** al intentar moverlo o tocar su chip: «El preocupacional es obligatorio antes de empezar. No se destraba desde la Hoja: hablá con Carolina (RRHH).» [Elegir a otro]. Sin botón «Destrabar».
- **Variante de repetición:** un segundo destrabe de la misma persona en el mes muestra «Es el segundo destrabe de Mauro este mes: a JS le llega una alerta.»

### O10. Recibos del mes

- **Franja:** Carolina · Web · **Etapa 2a, solo si se decide construir** (con 3 cotizaciones) · C0 y C1. *Más:* "Piloto de 3 meses en paralelo con el papel, midiendo cuántos firman en 72 h." · "Se puede bajar sin firmar, a diferencia de Humand."
- **Banner superior:** «Solo si en la etapa 0 se decide construir los recibos. Hoy se comparan tres cotizaciones: portal del contador, Humand y un proveedor local.»
- **Pestañas:** Estado de septiembre (por defecto) · Cargar un mes.
- **Estado de septiembre:**
  - Métricas (`.metrics`): **36 firmados** (33 conformes · 3 en disconformidad) · **5 abiertos sin firmar** · **4 sin abrir** · «Firmaron en 72 h: 29 de 45 (meta del piloto)».
  - Filtros por estado: Todos / Sin abrir / Abiertos / Firmados / Disconformidad.
  - Tabla: Persona · Canal · Enviado · Abierto · Firmado · Tipo · [Evidencia]. Ramiro aparece «Sin abrir»; Mauro, «Abierto el 07/10» con el chip «Sin PIN».
  - **Disconformidades:**
    - Matías Sequeira: «Me faltan 4 horas extra del 12/09».
    - Raúl Galván: «No figura el presentismo».
    - Pedro Robledo: «La categoría dice ayudante y soy medio oficial».
    - Cada una con [Responder] (abre la cola de WhatsApp) y [Marcar resuelta].
  - Acciones: **«Recordatorio a pendientes (9)»** → cola · «Ver disconformidades».
- **Cargar un mes** (asistente de 3 pasos, sobre el ejemplo de septiembre):
  1. «Subí el PDF del contador con todos los recibos (sábana)» → «recibos-septiembre-2026.pdf · 45 páginas».
  2. **«Encontramos 44 recibos por CUIL. 1 sin coincidencia.»** Tarjeta con la miniatura de la página 31: «PAZ, HECTOR OMAR · el CUIL salió cortado». Select «Asignar a…» → Héctor "Tito" Paz → «Asignado».
  3. «Enviar a 45»: oficina 15 por campanita · obra 30: 24 por WhatsApp (cola manual), 2 por Telegram, 2 en el kiosco y 2 sin relevar («se los damos en papel»). Aviso: «No se manda después de las 21 h ni los domingos.» [Enviar] → cola de WhatsApp.
- **Variante «Se contratan afuera»:** la pantalla cambia a «Los recibos los maneja el portal del contador (ejemplo). Acá queda solo la constancia: 36 de 45 firmados, importado el 16/10.» con [Importar constancias]. El asistente no aparece.

### O11. Comunicados

- **Franja:** Carolina redacta y JS publica · Web; a la obra le llega por WhatsApp, Telegram o kiosco · Etapa 2b · E1. *Más:* "Solo para lo importante: seguridad, horarios, feriados, pagos, convenio." · "Audio grabado por una persona, nunca voz sintética." · "Se usa para cuidar, no para sancionar."
- **Layout de dos columnas** (`.split`):
  - **Izquierda, la lista:**
    - «El arnés se retira y se devuelve en el pañol todos los días» · Obra · 15/10 · **23 de 30 Entendido** · audio de JS, 40 s.
    - «La oficina cierra a las 15 h el viernes 30/10» · Oficina · 16/10 · 11 de 15.
  - **Derecha, el detalle del arnés:**
    - el texto completo (el mismo que M4);
    - el reproductor **detenido**;
    - una barra de progreso de 23 de 30;
    - la tabla de los **7 pendientes**, con canal y último envío: Ramiro (WhatsApp), Mauro (WhatsApp), Brian (Kiosco: «lo ve al pasar por el pañol»), Lencina (sin relevar: «avisale al capataz»), Moyano, Cáceres y Ayala (WhatsApp).
    - Botón: «Reenviar a pendientes por WhatsApp (5)» → cola.
    - Pie: «Se usa para cuidar, no para sancionar.»
- **«Nuevo comunicado»** (formulario en el panel derecho):
  - **Alcance:** chips Todos / Oficina / Obra / Cuadrilla ▾ / Persona ▾, combinables con «y» u «o». Se ve en vivo: «Le llega a 30 personas: 24 por WhatsApp, 2 por Telegram, 2 en el kiosco y 2 sin relevar.»
  - **Tema:** Seguridad / Horarios / Feriado / Pagos / Convenio.
  - **Texto:** 400 caracteres como máximo, con contador. Pista: «Corto: se lee en el celular, al sol.» Ejemplo cargado: «Desde el lunes 2/11 se entra a las 7:00 (ejemplo).»
  - **Audio (opcional):** [Grabar audio]. Mientras graba: punto rojo, mm:ss y [Parar]. Después: «Lo grabó: JS · 0:38» [Escuchar] [Borrar]. Nota: «Nunca voz sintética.»
  - **Cuándo:** Ahora / Programar. Si se programa para el domingo 18/10 a las 10:00, aparece un aviso ámbar: **«Los domingos no se manda nada a obra. Se envía el lunes 19/10 a las 7:00.»**
  - [Publicar]. Lo publica JS; viendo como Carolina, el botón dice «Mandar a JS para publicar».

### O12. Ausencias y vacaciones (bandeja)

- **Franja:** Daniela (obra), Rinaldi o JS (oficina) y Carolina (lectura y constancias) · Web · Etapa 2b para el «Hoy no voy», etapa 3 para vacaciones y pedidos · D1, D2, G1. *Más:* "En obra aprueban el planificador o JS; el capataz solo opina." · "El motivo del rechazo lo ve el empleado."
- **Pestañas:** Hoy no voy (2) · Vacaciones (2) · Pedidos (1) · Historial.
- **Hoy no voy:**
  - **Mauro Giménez · viernes 16/10 · Enfermedad.**
    - Certificado: «Link ReNaPDiS · Matrícula MN 000000 (ejemplo) · Plataforma (ejemplo)».
    - Para Daniela el certificado figura como «Certificado cargado»; el archivo lo abre solo RRHH, y esa lectura queda registrada.
    - [Confirmar] [Pedir más datos].
  - **Walter Sosa · viernes 16/10 · Trámite**: «Renovación del registro». [Confirmar].
  - Nota fija: «El capataz ve solo "ausente con aviso".»
  - Al confirmar, el chip pasa a «Confirmado», O1 resta 1 y la ausencia entra en O13.
- **Vacaciones:**
  - **Ramiro Ledesma · martes 05/01 al lunes 18/01/2027 · 14 días** (tiene 21; le quedarían 7).
    - **Opinión de Tito Paz:** «Sí, pero que no salga junto con Giménez».
    - **Cobertura:** una mini grilla de la cuadrilla 3 del 28/12 al 24/01, con una barra por persona. Leyenda: «Esa quincena sale 1 de 4 · Temporada del 1/10 al 30/04».
    - [Aprobar] [Rechazar con motivo].
    - **Aprobar** → «Aprobado. Falta la constancia de aviso con 30 días de anticipación (antes del 06/12).» [Generar constancia de aviso] → «Constancia lista. Le mandamos el link a Ramiro para firmar.» → cola.
    - **Rechazar** → modal «Motivo (lo ve Ramiro)», con el ejemplo cargado: «Esa quincena salen dos de la cuadrilla 3, ¿podés la siguiente?».
  - **Lucía Ferraro · lunes 28/12 al domingo 10/01 · 14 días.**
    - Viendo como Daniela: «La aprueba su jefe directo: Ing. Pablo Rinaldi», sin botones.
    - Viendo como Rinaldi: [Aprobar] [Rechazar con motivo].
- **Pedidos (G1, etapa 3):** «Gustavo Arce · cambio de CBU · adjuntó la constancia» [Hecho]. Nota: «Los adelantos no están: esperan a que JS defina el tope y quién aprueba.»

### O13. Novedades del mes para el contador

- **Franja:** Carolina · Web · Etapa 3 · D3. *Más:* "Es lo que más trabajo le da a RRHH en una pyme." · "Lee `x_parte_diario` y `hd_ausencias`, pero no escribe nada."
- **Encabezado:** «Octubre 2026 · cierra el 31/10 · Formato: el que pida el contador (a definir en la etapa 0)».
- **Filtro:** «Solo con novedades» (encendido).
- **Tabla:** Persona · Con aviso · Sin aviso · Enfermedad · Vacaciones · Licencia ART · Alta o baja · Diferencia con el parte.
  - Mauro: enfermedad 1 (16/10).
  - Walter: con aviso 1 (trámite).
  - Brian: **Alta 06/10**.
  - Lucas: **Baja 15/10**.
  - Lencina: sin aviso 1, con el chip ámbar «El parte de Odoo dice presente el 09/10 y la Hoja dice ausente».
- **Acciones:** [Revisar diferencias (1)] filtra y deja elegir cuál vale · [Exportar para el contador ▾] (Excel / CSV) → «novedades-octubre-2026.xlsx (ejemplo)» · [Marcar como enviado] → chip «Enviado al contador el 31/10».
- **Nota:** «Los adelantos no figuran hasta que JS los defina.»

### O14. Altas y bajas

- **Franja:** Carolina · Web · Etapa 3 · F1. *Más:* "Solo bloquea lo legal, y eso lo hace la habilitación (B3)." · "La baja corta los accesos: PIN, credencial, links y usuario."
- **Lista a la izquierda:**
  - «Baja · Lucas Ferreyra · 15/10 · 6 de 9».
  - «Alta · Brian Quiroga · 06/10 · 8 de 10 · Bloquea: preocupacional».
- **Baja de Lucas** (checklist con casillas grandes):
  - **Devolución de EPP y herramientas:** botines (devueltos), casco (devuelto), **arnés A-0142 pendiente**. El dato sale del saldo del pañol.
  - **Fondo de Cese:** «Acreditar dentro de las 48 h: **antes del sábado 17/10 a la tarde**». Va en rojo porque vence mañana. [Adjuntar constancia].
  - **Certificado del art. 80:** [Adjuntar].
  - **Accesos:**
    - PIN del pañol revocado el 15/10.
    - Credencial revocada.
    - **2 links pendientes invalidados** (recibo de septiembre y comunicado del arnés).
    - Telegram: no tenía.
    - Usuario del sistema: no tenía.
  - Nota: «El recibo de septiembre se le entrega en papel con la liquidación final.»
  - [Cerrar baja]: deshabilitado, con la leyenda «Faltan 3».
- **Alta de Brian:**
  - **Preocupacional: falta (bloquea)** [Subir] → O6.
  - Alta en ARCA: listo.
  - **Nómina ART: no figura en la del 01/10** → O7.
  - Inducción firmada: listo.
  - EPP entregado el 06/10: listo.
  - Credencial y PIN entregados en persona: listo.
  - Relevamiento del canal: sin celular → kiosco.
  - Adhesión al canal digital firmada en papel: listo.
  - **Reglamento: pendiente** («lo firma en el kiosco»).
- **Acciones:** tildar, [Adjuntar constancia], [Cerrar].

### O15. Mi espacio (Lucía Ferraro, en la web)

- **Franja:** Lucía (oficina) · Web y campanita, con su sesión · Etapa 2b–3 · C1, D2, E1, A1. *Más:* "La oficina pesa lo mismo que la obra: hace lo mismo, desde la web." · "Cómo firma la oficina queda para decidir (D-8)."
- **Encabezado:** «Hola, Lucía». Tres tarjetas en fila y, debajo, «Mis datos».
  1. **Recibo de septiembre · Para firmar.**
     - [Ver y firmar] abre un panel con la vista del PDF (marca de agua **EJEMPLO**), «Neto $ 1.234.567,89 (EJEMPLO)», [Bajar el PDF] y las dos opciones: «Firmo conforme» / «Firmo en disconformidad» (con campo de texto).
     - Al elegir, se confirma: «Vas a firmar el recibo de septiembre con tu usuario de AndamiosOS. Queda registrado: fecha, hora y equipo.» [Firmar].
     - Resultado: «Firmado el 16/10 a las 19:10».
  2. **Vacaciones · Te quedan 14 días.**
     - [Pedir vacaciones] abre un formulario con desde y hasta. Si el tramo es de menos de 7 días: «Los tramos tienen que ser de 7 días o más.» → «Pedido a Ing. Pablo Rinaldi».
     - El estado del pedido se ve en la tarjeta. Si lo rechazan, se ve el motivo.
  3. **Comunicado sin leer:** «La oficina cierra a las 15 h el viernes 30/10.» [Entendido]. La campanita baja en 1.
  - **Mis datos:** clave-valor y [Avisar un dato mal] → «¿Qué dato está mal?» → «Le avisamos a Carolina».
- **Mis papeles:** «No tenés papeles de obra.»

---

### 3.1 Marcos de obra, comunes a M1–M10

- **Teléfono:** el de `docs/partes/maqueta.html`: 390 por 820 px, bisel de 11 px `--marco`, radio de 46 px, notch de 96 por 26 px y barra de estado. Abajo del marco va una línea gris: «Android de gama baja · pantalla de 360 px de ancho».
  - En pantallas de menos de 760 px el marco desaparece y el contenido ocupa todo el ancho, como en Partes.
  - **El contenido del link se diseña para 360 px de ancho** aunque el marco mida 390.
- **WhatsApp (M1):** los tokens `--wa-*` y las clases `.wa-cab`, `.wa-b` y `.wa-btns` de `docs/sofia/crm-maqueta.html`.
- **Kiosco (M9, M10):** tablet horizontal de 960 por 640 px, bisel de 14 px y radio de 28 px, que se achica para entrar. En la parte de arriba: «Pañol · Kiosco» a la izquierda y «Atiende: Néstor Aguirre» a la derecha. Sigue los tamaños del kiosco real (`src/components/panol/kiosco/ui.tsx`): botón principal `h-16 text-xl`, secundario `h-14 text-lg`, títulos `text-3xl`, campo de PIN `h-20 text-5xl`.
- **Tema de obra fijo y claro**, como en `src/app/h/[token]/layout.tsx`. No cambia con el tema oscuro:

| Uso | Valor |
|---|---|
| Fondo | `#fff` |
| Texto | `oklch(0.145 0 0)` |
| Texto secundario | `oklch(0.4 0 0)`, **nunca más claro** |
| Bordes | 2 px, `oklch(0.82 0 0)` |
| Botón principal | `oklch(0.55 0.16 42)`, texto blanco, 20 px en negrita |
| Verde | `#27500a` sobre `#eaf3de` |
| Ámbar | `#7a4405` sobre `#fef6e7` |
| Rojo | `#b42318` sobre `#fdecea` |

- **Barra sin señal:** franja ámbar fija arriba, de 48 px, con ícono `wifi-off`: **«Sin señal: lo que hagas se manda cuando vuelva.»**
- **Encabezado del link:** «ABA · Andamios Buenos Aires» en 14 px gris, y debajo el título de la pantalla en 28 px negrita. Botón «Volver» arriba a la izquierda, de 56 px de alto, con ícono y texto.

### M1. El mensaje que llega por WhatsApp

- **Franja:** Ramiro · WhatsApp, mandado a mano desde la oficina · Etapa 2a · C0 (cómo viaja el link). *Más:* "No hay bot: el link es la interfaz. Nadie instala nada." · "El texto no lleva montos ni motivos."
- **Contenido:** el chat de Ramiro con «ABA Oficina» (avatar coral «ABA»).
  - Chip de día «Martes 06/10». Mensaje entrante: «Hola Ramiro, ya está tu recibo de septiembre para firmar. Abrí este link: aba.ar/r/k7Q2x9 (ejemplo)».
  - Chip «Hoy». A las 18:30: **«Hola Ramiro, te recuerdo que tenés el recibo de septiembre para firmar. Abrí este link: aba.ar/r/k7Q2x9 (ejemplo). Es solo para vos, no lo reenvíes. Carolina, RRHH.»**
  - El link va subrayado, en `--wa-link`.
- **Variantes** (segmentado arriba, dentro del escenario y fuera del teléfono): WhatsApp · Telegram · Comunicado.
  - **Telegram (Walter):** chat con «AndamiosOS · ABA», el mismo texto y un botón debajo del mensaje: [Abrir].
  - **Comunicado:** «Hola Ramiro, hay un aviso importante de JS sobre el arnés. Leelo y tocá Entendido: aba.ar/r/… (ejemplo)».
- **Acción:** tocar el link → M2 (con señal). Sin señal, se abre la última versión guardada de M2 con la barra ámbar.

### M2. Inicio del link

- **Franja:** Ramiro · Link con token, sin cuenta ni mail · Etapa 2a–2b · C0. *Más:* "Página HTML liviana (unos 40 KB), funciona con poca señal." · "Una cosa por botón: lo que vino en el mensaje va primero."
- **Contenido (Ramiro):** «Hola, Ramiro» en 30 px. Debajo, botones de ancho completo, de **72 px de alto como mínimo**, separados 12 px, con ícono de 28 px a la izquierda, texto de 20 px en negrita, número a la derecha y subtítulo de 16 px:
  1. **Firmar recibo de septiembre** (1), en coral lleno porque es lo que vino en el mensaje.
  2. **Comunicado nuevo** (1).
  3. **Avisar que hoy no voy**.
  4. **Pedir vacaciones**, con el subtítulo «Te quedan 21 días».
  5. **Mis papeles**, con un punto verde y «Todo vigente».
  - Al pie, links de texto de 18 px con 48 px de alto de toque: «Otros pedidos» (M2-P) · «Qué hago si…» (M2-Q) · «Llamar a la oficina».
- **Después de cada acción** baja el número. Cuando no queda nada, arriba se lee «No tenés nada pendiente» y los botones 1 y 2 desaparecen.
- **Variantes por persona:**
  - **Mauro:** «Firmar recibo de septiembre» con el subtítulo «Necesitás tu PIN del pañol», y «Mis papeles» con un punto rojo y «Apto vencido · turno el martes 20/10».
  - **Tito:** primero va el botón **«Mi cuadrilla»**, con el subtítulo «1 pedido para opinar» (→ M8).
  - **Walter:** «Mis papeles» con un punto ámbar y «El registro vence el 29/10».
  - **Lucas (link inactivo):** una sola pantalla con ícono `link-2-off`: **«Este link ya no está activo. Si creés que es un error, llamá a la oficina.»** [Llamar a la oficina].
- **Sin señal:** barra ámbar. «Firmar recibo» queda con el subtítulo «Necesita señal». Los demás botones andan.
- **M2-P «Otros pedidos» (G1, etapa 3):** tres botones: «Certificado de trabajo» · «Cambiar un dato (CBU, domicilio)» · «Reponer ropa». Cada uno lleva a una pantalla con un campo y [Mandar], y termina en «Le avisamos a Carolina». Nota: «Los adelantos todavía no.»
- **M2-Q «Qué hago si…» (G2, etapa 4):** fichas de texto grande. La primera es **«Si hay un accidente»**:
  1. «Pará la tarea y no muevas al herido si no hay peligro.»
  2. «Llamá a la ART: 0800-000-0000 (ejemplo)» [Llamar], botón grande.
  3. «Avisá a tu capataz y a la oficina.»
  - Audio detenido «Tocá para escuchar». Etiqueta de la franja: «Se puede adelantar: es un texto».

### M3. Firmar el recibo (una acción por pantalla)

- **Franja:** Ramiro · Link · Etapa 2a, si se decide construir · C0 y C1. *Más:* "El segundo factor es el PIN del pañol, entregado en persona; nunca el DNI." · "Se puede bajar sin firmar."
- **3.1 Resumen:**
  - Título «Recibo de septiembre 2026».
  - Tarjeta: «Período: 01/09 al 30/09» · «Neto: $ 1.234.567,89» con el chip **IMPORTE DE EJEMPLO** · «Pagado el 05/10».
  - Link «Ver el detalle»: despliega 4 renglones en HTML (básico, presentismo, descuentos, neto), todos de ejemplo.
  - Botón secundario: **«Bajar el PDF (210 KB)»**.
  - Abajo, fijos en la zona del pulgar, dos botones de 64 px: **«Firmo conforme»** (coral) y **«Firmo en disconformidad»** (borde de 2 px).
  - Nota: «Lo podés bajar aunque no lo firmes.»
- **3.2 Solo en disconformidad:**
  - «¿Qué no está bien?», con chips de 56 px: Faltan horas · Categoría · Presentismo · Otro.
  - Campo de texto grande, de 18 px.
  - Nota: «Igual queda firmado como recibido. Carolina te contesta.»
  - [Seguir].
- **3.3 PIN:**
  - «Poné tu PIN del pañol», con el subtítulo «Son 4 números.».
  - 4 puntos y un teclado numérico de 3 por 4 con teclas de **72 px**, más [Borrar].
  - Si se equivoca: «Ese PIN no es. Te quedan 2 intentos.»
  - Al tercer error: «Por seguridad frenamos la firma. Pasá por el pañol.»
  - Link «No tengo PIN» → variante de Mauro.
- **3.4 Firma:**
  - «Firmá con el dedo», con el subtítulo «Firmás el recibo de septiembre 2026, conforme».
  - Zona de firma de ancho completo y 220 px de alto, borde de 2 px.
  - [Borrar] (secundario) y **[Listo]**, deshabilitado hasta que haya trazo.
- **3.5 Constancia:**
  - Círculo verde con check de 96 px y **«Firmado»**.
  - **«Firmado el 16/10 a las 18:42. Te queda guardado.»** · «Recibo de septiembre 2026 · Conforme».
  - [Bajar la constancia (PDF, 220 KB)] · [Volver al inicio].
- **Variante de Mauro, sin PIN** (aparece al tocar cualquiera de las dos opciones):
  - Ícono `key-round`. **«Pasá por el pañol a buscar tu PIN.»** Subtítulo: «Te lo da Néstor en persona. Son 4 números, no se lo pases a nadie.»
  - **«El recibo lo podés ver y bajar igual.»** [Ver el recibo] [Bajar el PDF] [Volver].
  - En el resumen 3.1 de Mauro, el mismo aviso va como banner arriba.
- **Sin señal:** en lugar de 3.1: «Para ver y firmar el recibo necesitás señal. Probá cuando tengas: el link sigue andando.» [Volver].

### M4. Comunicado con «Entendido»

- **Franja:** Ramiro · Link (o kiosco) · Etapa 2b · E1. *Más:* "El audio no arranca solo: lo grabó JS." · "La oficina ve quién confirmó, para volver a mandarlo; no es para sancionar."
- **Contenido:**
  - Arriba: «Aviso de JS · 15/10».
  - Título de 26 px: **«El arnés se retira y se devuelve en el pañol todos los días»**.
  - Texto de 18 px: «Desde el lunes 26/10, cada uno retira su arnés en el pañol a la mañana y lo devuelve a la tarde. Así lo revisamos todos los días. Néstor te lo tiene listo.»
  - Reproductor **detenido**: botón de play de 64 px y «Tocá para escuchar · 40 segundos · Lo grabó JS · 160 KB». Al tocar cambia a pausa con barra de progreso. Nunca arranca solo.
  - Botón fijo abajo: **«Entendido»**.
- **Al tocar:** «Listo, Ramiro. Le avisamos a la oficina que lo leíste. 16/10, 18:44.» [Volver al inicio].
- **Sin señal:** el audio dice «El audio necesita señal». «Entendido» funciona y queda «Guardado. Se manda cuando vuelva la señal», con el chip «Pendiente de mandar». Cuando vuelve la señal, el chip pasa a «Mandado».

### M5. «Hoy no voy» (Mauro)

- **Franja:** Mauro · Link · Etapa 2b · D1. *Más:* "El capataz ve solo «ausente con aviso»: «enfermedad» ya es un dato de salud." · "Se aceptan PDF, link o foto del QR del certificado electrónico."
- **5.1** «¿Por qué no venís hoy?», con el subtítulo «Viernes 16/10». Grilla de 2 por 2 con botones de 96 px: **Enfermo · Trámite · Familiar · Otro**.
- **5.2 Si es Enfermo:**
  - «Subí el certificado». Tres botones: «Sacar foto del QR» · «Pegar el link» · «Subir el PDF».
  - Al pegar el link aparece un campo con el ejemplo «https://… (ReNaPDiS, ejemplo)».
  - Link de texto: «Lo mando después».
  - **Si es Otro:** un campo opcional.
- **5.3 Confirmación:** «Hoy, viernes 16/10 · Enfermo · Certificado: link» [**Mandar aviso**].
- **5.4 Listo:** **«Listo. Le avisamos a Daniela (planificación). Tu capataz ve solo que avisaste.»** · «Que te mejores.» [Volver al inicio].
- **Sin señal:** en 5.4: «Todavía no salió: se manda cuando vuelva la señal. Si es urgente, llamá a la oficina.» [Llamar a la oficina].
- **Mauro no necesita PIN acá:** es un aviso, no una firma. La franja lo aclara.

### M6. Pedir vacaciones (Ramiro)

- **Franja:** Ramiro · Link · Etapa 3 · D2. *Más:* "El saldo sale de la antigüedad (art. 150 de la LCT), cargado como parámetro con historial." · "Si lo rechazan, ve el motivo."
- **6.1** Número grande de 64 px: **«21»**, «días te quedan». Subtítulo: «Por 7 años en ABA». [**Pedir vacaciones**] · [¿Cuántos días me quedan?]. El segundo explica: «21 días. Se calcula por tu antigüedad: 7 años.»
- **6.2** «¿Desde cuándo?»: grilla de mes con celdas de 48 px y flechas de mes de 56 px. Después, «¿Hasta cuándo?». Al lado: «14 días».
  - Si el tramo es de menos de 7 días, aviso ámbar: «Los tramos tienen que ser de 7 días o más.»
- **6.3 Confirmación:** «Pedís del martes 05/01 al lunes 18/01: 14 días. Te quedarían 7.» [**Mandar pedido**].
- **6.4 Estado:** pasos verticales: Pedido (16/10) → Opinión del capataz → Aprobación (Daniela o JS) → Constancia firmada.
  - **Pendiente:** [Cancelar pedido].
  - **Aprobado:** «Aprobado por Daniela Ojeda el 16/10. Falta firmar la constancia de aviso.» [**Firmar constancia**] → el mismo flujo de PIN, firma y constancia de M3.
  - **Rechazado:** «Rechazado por Daniela: "Esa quincena salen dos de la cuadrilla 3, ¿podés la siguiente?"» [Pedir otras fechas].
- **Sin señal:** el pedido se encola, con la barra ámbar.

### M7. «Mis papeles» (funciona sin señal)

- **Franja:** Ramiro · Link, guardado en el celular · Etapa 2b · C3. *Más:* "En el celular queda solo el semáforo: nunca recibos ni certificados." · "Es para mostrar en el portón de la obra."
- **Tarjeta del portón** (ancho completo, borde de 2 px):
  - Banda verde arriba: **«HABILITADO PARA OBRA»** en 22 px negrita.
  - «Ramiro Ledesma» en 28 px y «Oficial montador · Andamios Buenos Aires». Foto opcional: un círculo de 72 px con iniciales.
  - Renglones de 20 px, cada uno con ícono y palabra de estado:
    - «Apto de altura: **vigente hasta 14/03/2027**».
    - «Curso de altura: **vigente**».
    - «EPP: **entregado 08/09**» (16/10 después de R8).
  - Pie gris: «Actualizado el 16/10 a las 18:40 · Se ve sin señal».
- **Botón secundario:** [Avisar un dato mal] → «¿Qué dato está mal?» (un botón por renglón y Otro) → [Mandar] → «Le avisamos a Carolina.»
- **Variante de Mauro:** banda roja **«APTO DE ALTURA VENCIDO»**, «Venció el 02/10.» y **«Ya te sacamos turno: martes 20/10, 8 h»** en una caja ámbar.
- **Variante de Walter:** banda ámbar «VENCE PRONTO»: «Registro de conducir: vence el 29/10 (en 13 días)».
- **Sin señal:** se ve igual, con el chip «Sin señal · guardado el 16/10 18:40». Nunca aparecen recibos ni certificados.

### M8. Capataz: pedir en nombre de otro (Tito Paz)

- **Franja:** Tito (capataz) · Link · Etapa 2b («No viene») y 3 (vacaciones) · D1 y D2. *Más:* "Regla del minuto: nada diario le puede llevar más de un minuto." · "Ve «apto / no apto / vence» y «ausente con aviso», nunca un motivo médico."
- **8.1 «Mi cuadrilla · Cuadrilla 3».**
  - Tarjeta coral arriba: **«1 pedido para opinar: Ramiro, vacaciones del 05/01 al 18/01»** (→ 8.4).
  - Lista precargada con filas de 72 px:
    - Ramiro Ledesma: «Apto».
    - Mauro Giménez: «No apto · Ausente con aviso hoy».
    - Brian Quiroga: «No apto».
  - Etiqueta de la franja: «3 toques, menos de 1 minuto».
- **8.2** Al tocar una persona: «¿Qué pedís para Mauro?», con dos botones de 96 px: **«No viene»** / **«Vacaciones»**.
- **8.3 No viene:** «¿Cuándo?» Hoy / Mañana → [Mandar]. Resultado: «Listo. Le avisamos a Daniela. Mauro lo ve en su link.»
  - Nota: «El motivo lo carga Mauro o la oficina.»
  - **Vacaciones** usa el mismo selector de fechas de M6.
- **8.4 Opinar:** «Ramiro pide vacaciones del 05/01 al 18/01».
  - «Tu opinión», con tres botones de 72 px: **Sí / No / Sí, pero…**
  - «Sí, pero…» abre un campo con un chip sugerido: «que no salga junto con Giménez».
  - [Mandar] → «Listo. Decide Daniela o JS.»

### M9. Kiosco del pañol: entrega de EPP (Néstor y Ramiro)

- **Franja:** Ramiro con Néstor · Kiosco del pañol · Etapa 2a · C2. *Más:* "Constancia con el contenido que pide la Disp. GP SRT 3/2022; el PDF va a la ficha." · "El QR de cada pieza es del pañol, no de RRHH."
- **9.1 «¿Quién sos?»:** «Acercá tu credencial a la cámara.» Un recuadro de cámara simulado y [Usar PIN]. Al tocar el recuadro se simula la lectura: «Ramiro Ledesma».
  - Error: «Eso no es una credencial. Escaneá la tuya o usá tu PIN.» Es el texto del kiosco real.
- **9.2 «Esto te llevás»** (filas de 72 px, cada una con un check grande):
  - Arnés de cuerpo entero · código A-0388 · marca (ejemplo) · certificación (ejemplo) · 16/10.
  - Casco · marca (ejemplo) · 16/10.
  - Botines de seguridad talle 42.
  - Guantes.
  - Néstor confirma con [Seguir].
  - Botón fijo arriba a la derecha: «No soy Ramiro».
- **9.3 «Firmá que lo recibiste»:** resumen de los ítems, zona de firma de 260 px y [**Firmar**]. Pie: «Constancia de entrega de EPP (Disp. GP SRT 3/2022)».
- **9.4 Pantalla verde:** **«Guardada en tu ficha»** · «Vuelve a "¿Quién sos?" en 8 s · Tocá para ir ya». Es el patrón del kiosco real.
- **Efecto en la oficina:** O3 › Papeles queda en «EPP: entregado 16/10» y M7 se actualiza.

### M10. Kiosco: lo pendiente (Mauro, lunes 19/10 a las 7:05)

- **Franja:** Mauro · Kiosco · Etapa 2a–2b · C0, C1, E1. *Más:* "Para quien no tiene celular o todavía no tenía PIN." · "Se cierra solo a los 60 segundos sin uso." · "Escena del lunes 19/10, antes de salir a la obra."
- **10.1 «¿Quién sos?» → «Poné tu PIN»** (campo `h-20 text-5xl` y teclado grande) → Mauro.
- **10.2 «Hola, Mauro. Tenés 1 recibo para firmar y 1 comunicado.»** Dos botones de 96 px: «Firmar recibo de septiembre» · «Leer comunicado». Abajo, [Salir].
  - **Recibo:** el mismo M3 en formato tablet, sin el paso del PIN porque ya lo puso para entrar. El neto aparece tapado: **«Tocá para ver el neto»**, porque el kiosco está a la vista de todos.
  - **Comunicado:** el mismo M4.
  - Después de cada uno vuelve a 10.2 con un pendiente menos. Al terminar: «No tenés nada más. ¡Buen día!», y sale solo.
- **Inactividad:** a los 45 s aparece un aviso: «¿Seguís ahí? Se cierra en 15 s.» [Sigo]. A los 60 s vuelve a «¿Quién sos?».
- **Variante de Brian (sin celular):** «Tenés 1 comunicado y 1 documento para firmar: Reglamento interno.»
- **Variante sin conexión:** «El kiosco no tiene conexión. Avisale a Néstor.»

---

## 4. Reglas de UX

### 4.1 Obra (celular y kiosco)

1. **Tamaño de toque:** **56 px de alto como mínimo** en todo lo que se toca y **64 a 72 px** en las acciones principales, a lo ancho, con 12 px de separación. En el kiosco, 64 px como mínimo. Nada de casillas ni radios chicos: las opciones son botones grandes.
2. **Tipografía:**
   - Base de 18 px y nunca menos de 16 px, ni en las notas.
   - Títulos de 26 a 30 px en negrita. Botones de 20 px en negrita.
   - Interlineado de 1,35 y números con `tabular-nums`.
   - Fechas como «martes 20/10» y horas como «a las 18:42».
3. **Contraste:** 7:1 en el texto y 4,5:1 como mínimo en los botones. Tema claro siempre, bordes de 2 px y nada de gris sobre gris. **El color nunca va solo**: el semáforo siempre lleva ícono y palabra (Vigente / Vence pronto / Vencido).
4. **Una acción por pantalla.** Un solo botón principal, fijo abajo, en la zona del pulgar. Lo secundario va como link de texto con 48 px de toque. «Volver» arriba a la izquierda, de 56 px.
5. **Sin gestos:** nada de deslizar, mantener apretado ni doble toque. Todo se hace tocando.
6. **Confirmaciones:**
   - Lo que es **firma** pasa por resumen → (texto) → PIN → firma → constancia.
   - Lo que es **aviso** (Entendido, Hoy no voy) se hace en un toque, con una pantalla final que diga a quién le llegó.
   - **Cada acción termina con una pantalla que nombra a la persona que se enteró** («Le avisamos a Daniela»).
7. **Nada se reproduce solo.** Ni audio ni video. Las animaciones duran 150 ms como máximo y no hay ninguna con `prefers-reduced-motion`.
8. **Peso:**
   - Sin imágenes pesadas: solo los íconos de lucide en línea.
   - **El PDF baja solo si la persona lo pide, y se dice cuánto pesa** («Bajar el PDF (210 KB)»).
   - La franja muestra el peso de la página («unos 40 KB»).
9. **Sin señal:**
   - Barra ámbar fija arriba.
   - Las acciones de aviso se encolan con el chip «Pendiente de mandar», que pasa a «Mandado».
   - Las de firma y recibo dicen que necesitan señal.
   - **Nunca se pierde lo que se escribió.**
   - «Mis papeles» se ve completo y con la fecha de la última actualización.
10. **Lenguaje:**
    - Vos, frases de 12 palabras como máximo y verbos en los botones («Firmar», «Mandar aviso», «Entendido»).
    - Palabras de ABA: obra, cuadrilla, capataz, pañol, apto, arnés, botines, «la oficina», «el PIN del pañol».
    - **Nunca:** token, hash, sesión, usuario, validar, error 4xx.
    - Cuidado, no control: «Ya te sacamos turno», «Que te mejores». Nunca reto ni culpa.
    - Los errores dicen qué hacer («Pasá por el pañol»).
11. **Privacidad en el celular:**
    - El mensaje de WhatsApp no lleva montos ni motivos.
    - En el teléfono solo queda el semáforo.
    - En el kiosco, el neto aparece tapado y siempre está «No soy X».
    - El capataz ve estados, nunca motivos médicos.
12. **Horario:** nada sale a obra después de las 21 h ni los domingos. La oficina lo ve en la cola y en el redactor de comunicados.
13. **Kiosco:**
    - Cierre por inactividad a los 60 s, con aviso a los 45 s.
    - Siempre vuelve a «¿Quién sos?».
    - Nunca muestra datos de otra persona.

### 4.2 Oficina (escritorio)

1. **Densidad:**
   - Fuente de 13 a 14 px y tablas de 13 px con filas de 40 px.
   - Encabezado de tabla fijo, columnas que se ordenan y números a la derecha.
   - El encabezado de página sigue el patrón `.ph`.
2. **Filtros:** pestañas con número para el corte principal (Obra / Oficina / Contratistas; Vencidos / 30 días), chips de filtro (`.fchip`) para lo secundario y búsqueda a la izquierda. **El número de la pestaña coincide con el de la tarjeta de O1.**
3. **Semáforo con texto en chips:** Habilitado (`--mej`), Vence pronto (`--cor`), Advertencia (`--cor` con borde `--err`), No habilitado (`--err`), A regularizar (`--info`), Baja (`--muted`).
4. **Acciones en lote:** casilla en la fila y una barra flotante «3 seleccionados · Avisar · Exportar».
5. **WhatsApp manual siempre con la cola** (3.0.1). Nunca 45 links sueltos.
6. **Datos sensibles:**
   - Enmascarados por defecto. Se abren con «Ver (queda registrado)».
   - Sin permiso: «No tenés permiso para ver esto. Lo ven RRHH y JS.»
   - Las exportaciones dicen «sin datos sensibles».
7. **Confirmación modal** para lo que no se deshace: destrabar, firmar, cerrar una baja, publicar un comunicado, rechazar. Todo lo demás termina en un toast con «Deshacer».
8. **Estados vacíos** con una frase que diga que está bien: «Todo en orden…». Nunca una tabla vacía sin texto.
9. **Montos** con formato `$ 1.234.567,89` y el chip **EJEMPLO**. **Fechas** dd/mm, con el día de la semana cuando hay un plazo cerca.
10. **Lo que todavía no está decidido** va con el chip «A decidir por JS» (pregunta n) en la franja o en la pantalla. Nunca se presenta como un hecho.
11. **En pantallas de menos de 760 px:** el riel queda en 52 px, las grillas pasan a una columna y las tablas hacen scroll dentro de su caja, nunca la página.

---

## 5. Recorridos cruzados entre oficina y obra

Cada recorrido aparece en el selector de 1.4 con este título. Entre corchetes va el mundo de cada paso: [O] oficina, [M] celular, [K] kiosco.

| # | Recorrido | Estado inicial | Pasos |
|---|---|---|---|
| R1 | **El recibo de Ramiro por WhatsApp** | Por defecto | [O] O10, Estado (36 firmados, Ramiro «Sin abrir») → [O] «Recordatorio a pendientes», cola, «Abrir WhatsApp de Ramiro» (18:30) → [M] M1 → [M] M2 → [M] M3: 3.1 conforme, 3.3 PIN, 3.4 firma → [M] 3.5, «Firmado el 16/10 a las 18:42» → [O] O10 con **37 firmados** y Ramiro en verde, campanita de Carolina → [O] O3 › Recibos › «Ver evidencia» |
| R2 | **Mauro no tiene PIN** | Por defecto | [M] M1 (Mauro) → [M] M2 (Mauro) → [M] M3, variante sin PIN → [M] «Ver el recibo» (lo ve igual) → [K] M10, lunes 19/10 a las 7:05, con PIN → firma el recibo → lee el comunicado → [O] O10 con **38 firmados** · O2 con «PIN: sí» · O11 con 25 de 30 |
| R3 | **Comunicado con «Entendido»** | Por defecto | [O] O11, detalle del arnés (23 de 30) → [O] «Reenviar a pendientes», cola → [M] M1, variante comunicado → [M] M4, tocar play (empieza detenido) → «Entendido» → [O] O11 con **24 de 30**, Ramiro sale de pendientes → [O] O1 con «Comunicados sin Entendido: 6» |
| R4 | **Mauro avisa que hoy no va** | Sin el aviso de Mauro (O1: 1) | [M] M2 (Mauro, 6:40) → [M] M5: Enfermo, link, Mandar → [O] O1 con «Hoy no voy a confirmar: 2», campanita → [O] O12 como Daniela: «Confirmar» → [M] M8 (Tito): Mauro «Ausente con aviso», sin motivo → [O] O13: Mauro con enfermedad 1 |
| R5 | **Vacaciones de Ramiro** | Sin el pedido de Ramiro | [M] M6: elegir del 05/01 al 18/01 y mandar → [M] M8 (Tito): 8.4 «Sí, pero…» → [O] O12 como Daniela: opinión y cobertura, «Aprobar», «Generar constancia de aviso», cola → [M] M2 (Ramiro): «Firmar aviso de vacaciones» → firma → [O] O3 › Ausencias: aprobado y constancia firmada, saldo de 7. **Rama:** «Rechazar con motivo» → [M] M6 en estado rechazado, con el motivo a la vista |
| R6 | **La cuadrilla 3 sale el lunes** | Habilitación en **Bloqueo** | [O] O1, tarjeta de la nómina → [O] O7: Brian no figura → «Pedir nómina al contador» → [O] O9 como Daniela: Brian bloqueado sin destrabe (D-6) → arrastrar a Mauro, cartel rojo → «Destrabar» con motivo → [O] ver como JS: la campanita con el destrabe y el motivo → [O] O1: «Destrabes de esta semana: 2». **Rama:** volver a O7, «Subir nómina nueva», Brian figura y O1 queda en 0 |
| R7 | **Apto vencido con turno** | Por defecto | [O] O5: Mauro vencido → «Pedir turno a la ART», turno el martes 20/10 a las 8 → «Avisar a Mauro», cola → [M] M7 (Mauro): banda roja con el turno → [O] miércoles 21/10: O6 con el apto nuevo de Mauro → [O] O2: Mauro «Habilitado» · O1: vencidos 1 → [M] M7 (Mauro) en verde |
| R8 | **Entrega de EPP en el kiosco** | Por defecto | [K] M9: credencial, ítems, firma, «Guardada en tu ficha» → [O] O3 › Papeles: EPP del 16/10 con su constancia → [M] M7 (Ramiro): «EPP: entregado 16/10» → [O] O1: «Exportar constancias de EPP para la ART», link temporal |
| R9 | **Una baja y un alta** | Por defecto | [O] O14, Lucas: tildar el arnés devuelto, adjuntar el Fondo de Cese (antes del sábado 17/10) → accesos cortados → [M] M2 (Lucas): «Este link ya no está activo» → [O] O14, Brian: falta el preocupacional → [O] O9: Brian bloqueado → [O] O7: Brian no figura en la nómina |
| R10 | **Lucía, desde la oficina** | Por defecto | [O] O15: firmar el recibo con la sesión → «Pedir vacaciones» del 28/12 al 10/01 → [O] O12 como Rinaldi: «Aprobar» → [O] O15: aprobado, le quedan 0, campanita → [O] O4 como Carolina: el recibo firmado y el pedido aprobado |
| R11 | **Cierre del mes** | Por defecto | [O] O13 → «Revisar diferencias»: Lencina, elegir el dato bueno → «Exportar para el contador» → «Marcar como enviado» |
| R12 | **Papeles para el comitente y contratistas** | Por defecto | [O] O2, pestaña Contratistas → Sergio Molina, panel de papeles → [O] O5: pestaña de 31 a 60 días → [O] O8: «Armar ZIP» (sin el apto de Hugo Ponce) → «Pedir consentimiento», cola |

**Tabla de efectos.** Los constructores la usan para no olvidarse de ninguna actualización:

| Acción en obra | Qué cambia en la oficina |
|---|---|
| Ramiro abre el link (M2) | O10: de «Sin abrir» a «Abierto 18:39» · la evidencia de O3 suma la apertura |
| Ramiro firma (M3) | O10: 37, con la fila en verde · O1: 8 de 45 · O3 › Recibos y evidencia · campanita de Carolina |
| Firma en disconformidad | O10: disconformidades +1, con el texto · O1 igual que la conforme |
| Entendido (M4) | O11: 24 de 30, sale de pendientes · O1: 6 |
| Hoy no voy (M5) | O1: +1 · O12: nueva fila · M8: «Ausente con aviso» · O9 (si es para hoy): chip gris · O13 al confirmar |
| Pedir vacaciones (M6) | O12: nueva fila · M8: «1 pedido para opinar» |
| Tito opina (M8) | O12: aparece «Opinión de Tito Paz» |
| Daniela aprueba o rechaza (O12) | M6: estado nuevo · M2: «Firmar aviso de vacaciones» (si se aprueba) · O3 › Ausencias |
| Avisar un dato mal (M7, O15) | Campanita de Carolina · O12 › Pedidos |
| Entrega de EPP (M9) | O3 › Papeles · M7 · exportación para la ART |
| Kiosco: Mauro firma (M10) | O10: 38 · O11: 25 · O2: PIN sí |
| Destrabe (O9) | Campanita de JS · O1: destrabes +1 · chip en O9 |
| Apto nuevo (O6) | O1, O2, O5, M7 de Mauro, M8 (Mauro «Apto»), O9 sin cartel |
| Baja cerrada (O14) | Los links de Lucas quedan inactivos en M2 · O2 con la fila en gris |
| Nómina nueva (O7) | O1: nómina 0 · O9 y O7 sin el chip de nómina de Brian |

---

## 6. Cobertura: cada función de la propuesta tiene dónde verse

| Función | Pantallas |
|---|---|
| A1 Ficha única | O2, O3, O4, O15 |
| A2 Permisos y privacidad | O3/O4 › Sensible con lectura registrada · Ver como Daniela · O2 sin CUIL |
| B1 Documentos y semáforo | O5, O6, O3 › Papeles |
| B2 Nómina ART | O7, O1, O9 |
| B3 Habilitación | O9, O2, M8, interruptor Advertencia/Bloqueo |
| B4 Carpeta por comitente | O8 |
| B5 Contratistas | O2 › Contratistas, O5, O8 |
| C0 Firma y link | M1, M2, M3, evidencia en O3, adhesión en O3 y O14 |
| C1 Recibos | O10, M3, M10, O15, interruptor de recibos |
| C2 EPP | M9, O3, exportación para la ART en O1 |
| C3 Mis papeles | M7 |
| D1 Hoy no voy | M5, M8, O12 |
| D2 Vacaciones | M6, M8, O12, O15 |
| D3 Novedades | O13 |
| E1 Comunicados | O11, M4, M10, O15 |
| E2 Cumpleaños | Campanita de JS |
| F1 Alta y baja | O14, M2 (Lucas) |
| G1 Pedidos | M2-P, O12 › Pedidos |
| G2 Qué hago si… | M2-Q |
| G3 Pulso | Panel Etapas («no se maqueta») |
| G4 Tablero de JS | O1, ver como JS |
| Etapa 0: relevamiento del canal | O2 (banner y columna), cola de WhatsApp («sin relevar») |
| Descartes y carriles aparte | Panel Etapas |

---

## 7. Lo que la maqueta deja marcado «A decidir por JS»

Cada punto se muestra con el chip en la pantalla indicada:
1. Recibos: ¿se construyen o se contratan? (pregunta 2) → O10, con el interruptor.
2. El ancla de la oficina (pregunta 5) → O4 y O15.
3. Ver y bajar el recibo sin PIN (D-7) → M3, variante de Mauro.
4. La oficina firma con su sesión (D-8) → O15.
5. El preocupacional de las altas nuevas no se destraba (D-6) → O9.
6. Quién aprueba las vacaciones (pregunta 7) → O12.
7. La periodicidad del apto (pregunta 12, a la ART) → O6 y O5.
8. Si la exportación alcanza para la ART → O1, modal de EPP.
9. Adelantos (pregunta 11) → O12, M2-P y O13.

---

**Para la propuesta:** el error de los días de la semana de la sección 11 (D-1) también está en `docs/rrhh/propuesta.md`. Conviene corregirlo ahí o avisarle al redactor. Esta especificación ya lo resuelve con «hoy = viernes 16/10/2026».