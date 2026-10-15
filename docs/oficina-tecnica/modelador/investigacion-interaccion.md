# Modelador ABA: patrones de UX para modelar rápido y fácil

## 0. Lo que conviene copiar

- **Layher LayPLAN CLASSIC.** Cargás los datos clave y en segundos tenés andamio, anclajes, diagonales, protección lateral, lista de materiales y croquis 2D. No hace falta saber CAD. LayPLAN CAD queda para las estructuras complejas y puede arrancar de lo que generó CLASSIC. La lección es tener **dos niveles: generador paramétrico primero y edición fina después** ([LayPLAN CLASSIC](https://www.layher.com/en/products/layplan-suite/overlay_layplan_classic), [LayPLAN CAD](https://www.layher.com/en/products/layplan-suite/overlay_layplan-cad), [folleto digitalización](https://www.layher.com/-/media/project/layher/layherkg/downloads/en_systemsolutions_digitalisationsoftware.pdf)).
- **Avontus Designer.** Dibujás los muros, los seleccionás y apretás "Wall Scaffolding". El layout sale de las medidas y cotas, con offset al muro y espaciado de diagonales. Después se ajusta por vano ("Bay Details", "Side Settings", "Bay Level"). Funciona con muros encadenados en cualquier ángulo ([Placing scaffolds around walls](https://docs.avontus.com/docs/placing-scaffolds-around-walls), [Working with wall scaffolds](https://docs.avontus.com/docs/working-with-wall-scaffolds-1), [Lift & Access](https://www.liftandaccess.com/news/new-release-avontus-scaffold-designer-software-available)).
- **SketchUp.** Tiene inferencias visibles ("on edge", "on face"). En push/pull hacés clic y soltás en vez de arrastrar, tipeás la medida exacta mientras movés, y con doble clic repetís la última altura ([foro SketchUp](https://forums.sketchup.com/t/is-it-possible-to-snap-push-pull/29190), [Lynda Push/Pull](https://www.lynda.com/SketchUp-tutorials/PushPull-3D/777383/5024982-4.html)).
- **Configuradores (investigación WII'18 y UNamur).** El sistema tiene que *prevenir* lo incompatible, *propagar* la única opción posible explicando por qué, y *proponer la reparación* en lugar de solo marcar el error. Un relevamiento de 54 configuradores encontró que la mayoría repara mal ([ceur-ws Vol-2068](https://ceur-ws.org/Vol-2068/wii1.pdf), [UNamur](https://researchportal.unamur.be/en/publications/representing-repairs-in-configuration-interfaces-a-look-at-indust/)).
- **Figma, Excalidraw y Tinkercad (criterio propio, sin fuente puntual).** Toman de Figma el panel de propiedades contextual a la selección y la edición de varios elementos a la vez, con "Mixed" cuando los valores difieren. De Excalidraw, atajos de una sola tecla y cero modales. De Tinkercad, primitivas que arrastrás a una grilla que imanta y "agujeros" como objetos de primera clase, que es la analogía directa para las aberturas.
- **Restricción de la casa.** Ya está decidido que el 3D es de escritorio para Oficina Técnica, con un único `ModeloAndamio → Pieza[]` del que salen el render, el cómputo y el cálculo (`docs/oficina-tecnica/handoff.md` §2 y §6). La UX tiene que editar **ese modelo paramétrico, nunca piezas sueltas**, salvo en un modo excepción.

## 1. La unidad de edición: vano × nivel

El usuario no piensa en "verticales y horizontales". Piensa en **"tramo de 12 m, 8 cuerpos, vanos de 2,57, 6 niveles de 2 m"**. Propongo esta jerarquía:

- **Obra.** Contiene los elementos y el terreno.
- **Elemento.** Puede ser Fachada (tramos encadenados), Torre, Pórtico o Volado/Puente.
- **Tramo.** Es una línea en planta con largo, ángulo, retiro al muro y ancho (0,73 o 1,09).
- **Celda vano × nivel.** Es lo que se selecciona y edita.
- **Piezas.** Las genera el sistema y solo se ven en el modo excepción.

Cada celda tiene **estado**: con plataforma o sin ella, tipo de baranda, diagonal, anclaje, si está anulada (abertura u obstáculo) o si es una ménsula. Las reglas, como diagonal cada 5 vanos o anclajes según el patrón, se aplican **por tramo**. La celda puede sobreescribirlas y queda marcada con un puntito de override, como hace Figma con las instancias.

## 2. Tres modelos de interacción

### A. Asistente paramétrico, tipo LayPLAN CLASSIC o configurador

Es un formulario lateral con largo, altura, ancho, sistema (multidireccional o bastidor), cubierta y terreno. El 3D se regenera en vivo.

- **Pros:** el aprendizaje es nulo y el resultado sale en segundos. Siempre es válido porque el generador aplica las reglas. Es ideal para precargar desde Odoo (`x_permiso_altura`, `metros_lineales`).
- **Contras:** se cae ante lo real (quiebres, marquesina, árbol, retranqueo) y termina en "exportar y corregir a mano en otro lado". Cada caso nuevo agrega un checkbox y el formulario se vuelve un monstruo.

### B. Dibujar en planta y extruir, tipo Avontus "Wall Scaffold" o SketchUp

Calcás la línea de fachada en planta, clic a clic con inferencias (ortogonal, 45°, paralelo, largo tipeado), sobre un DXF o una imagen de catastro. Después "levantás" la altura arrastrando o tipeándola. El generador llena vanos y niveles y ajusta los largos a medidas estándar.

- **Pros:** resuelve quiebres, esquinas y retranqueos de forma natural, y la geometría queda fiel a la obra.
- **Contras:** dibujar exige precisión y destreza de CAD. Las esquinas y uniones entre tramos son una fuente de casos raros. Para una torre suelta es excesivo.

### C. Híbrido: plantilla, después manipulación directa sobre la grilla de celdas, con panel de propiedades sincronizado

**Esta es la recomendada.** El flujo arranca eligiendo una plantilla: Fachada recta, Fachada en L, Torre de acceso, Torre escalera, Torre móvil, Pórtico peatonal o Pórtico vehicular. La plantilla se coloca con medidas precargadas de Odoo. A partir de ahí se edita de tres formas equivalentes:

1. **Manijas en el 3D o el alzado.** Arrastrás el extremo del tramo para sumar vanos y el borde superior para sumar niveles. El movimiento salta de a un vano o un nivel, nunca en continuo.
2. **Panel de propiedades** con los mismos valores en números.
3. **Selección de celdas en el alzado**, como en una planilla, para aplicar abertura, ménsula, sin plataforma, lona, etc.

La planta sirve para los quiebres: partís el tramo con `K` y rotás el nuevo a 90° o 45°.

- **Pros:** tiene la velocidad de A en el 80 % de los casos y la flexibilidad de B solo cuando hace falta. El alzado con grilla de celdas es el lenguaje que ya habla la OT, porque es como dibujan hoy a mano.
- **Contras:** hay que mantener tres vistas sincronizadas. Además hay que diseñar bien las uniones entre tramos y entre elementos, por ejemplo una torre adosada a una fachada o un pórtico como base de una fachada.

**Cómo se evita lo inválido en C.** Hay tres capas:

1. **Imposible por construcción.** Las manijas solo saltan a medidas del catálogo (0,73 / 1,09 / 1,57 / 2,07 / 2,57 / 3,07), los niveles van de a 0,5 m en multidireccional o al alto del marco en bastidor, y no se puede borrar una vertical que carga.
2. **Propagación explicada.** Por ejemplo, al poner lona el sistema sube la densidad de anclajes y muestra un toast: "Agregué 6 anclajes porque la lona aumenta el viento (M05)". El toast trae el botón "Deshacer esto".
3. **Error en vivo con reparación.** La celda o el tramo se pinta de rojo en todas las vistas. El panel de verificación dice qué falla (M03 esbeltez 4,7 > 3,5) y ofrece 1–2 arreglos de un clic: "Agregar patas de gallo" o "Anclar al nivel 3".

Mientras M05/M07 tengan los bugs del handoff (§3), el semáforo tiene que decir **"predimensionado"**, no "verificado".

## 3. Las 15 microinteracciones que lo hacen "súper ágil"

1. **Tipear mientras arrastrás.** Con la manija activa, escribir `14` + Enter fija 14 m y el sistema redondea al vano estándar mostrando "14,00 → 13,98 (2×2,57 + 3×3,07)". Es el VCB de SketchUp.
2. **Expresiones en los campos.** Se puede escribir `12+2,5` o `*2`, y en edición múltiple `+1` suma un nivel a todo lo seleccionado.
3. **Rellenar el largo.** Ponés el largo libre de fachada y el sistema propone la combinación de vanos que menos desperdicia, con 2–3 alternativas en chips ("menos piezas", "vanos iguales", "menos peso").
4. **Arrastrar para sumar vanos y niveles con conteo en vivo:** "+3 vanos · +214 kg · 46 piezas". El 3D aparece en fantasma antes de soltar.
5. **Pintar celdas.** Elegís una herramienta (abertura, ménsula, sin plataforma, lona) y barrés con el mouse sobre el alzado, como un pincel de planilla.
6. **Selección por fila o columna.** Clic en el rótulo del nivel o del vano para seleccionar toda la fila o columna. Shift extiende el rango y Alt+clic selecciona "todas las iguales".
7. **Hover con ficha.** Al pasar sobre una pieza en 3D se resalta, y aparece una ficha con código, largo, peso y en qué celda está. Clic fija la ficha.
8. **Obstáculo como objeto.** Arrastrás una caja ("marquesina", "árbol", "cable", "toldo") a la planta o al alzado. Las celdas que choca se marcan, y el sistema sugiere ménsula, puente o retiro.
9. **Abertura como agujero**, al estilo Tinkercad. Un rectángulo sobre el alzado anula celdas y propone una viga puente arriba con un clic.
10. **Doble clic repite.** Sobre una celda aplica la última operación, igual que el doble clic de push/pull.
11. **Duplicar con offset.** `Ctrl+D` sobre un tramo o una torre la copia al lado, pegada y alineada. Sirve para torres en serie o pórticos repetidos.
12. **Undo granular con historial visible.** Cada paso tiene nombre ("Pintar lona N2–N6"). `Ctrl+Z` no rompe la selección y el historial se puede clickear.
13. **Vistas sincronizadas con selección compartida.** Lo que seleccionás en el alzado se ve seleccionado en planta y en 3D. Además está la tecla `Tab`, que alterna la vista grande.
14. **Barra inferior viva**, siempre visible, sin abrir nada: m² de fachada, toneladas, piezas, cantidad de anclajes y el semáforo M03/M05/M11.
15. **Paleta de comandos.** `Ctrl+K` con lenguaje de obra: "torre 2,57×2,57 h 10", "lona", "anclajes cada 4 m", "exportar imagen".

## 4. Set mínimo de atajos

| Tecla | Acción |
|---|---|
| `V` | Seleccionar |
| `F` | Nueva fachada (dibujar tramo en planta) |
| `T` / `P` | Nueva torre / nuevo pórtico (plantilla en el cursor) |
| `K` | Partir tramo (quiebre) |
| `O` | Abertura u obstáculo |
| `B` | Pincel de celdas; los números `1–5` cambian el pincel |
| `1` `2` `3` (sin pincel) | Vista planta / alzado / 3D |
| `Tab` | Alternar vista grande y vistas chicas |
| `Shift` arrastrando | Bloqueo de eje y ángulo de 45° |
| `Enter` | Confirmar el valor tipeado |
| `Esc` | Cancelar herramienta o vaciar la selección |
| `Supr` | Borrar (respeta el mismo patrón del organigrama, commit 428d7f3) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Deshacer / rehacer |
| `Ctrl+D` | Duplicar alineado |
| `Ctrl+K` | Paleta de comandos |
| `Z` | Encuadrar la selección (Shift+Z: todo) |
| `?` | Hoja de atajos |

La regla es una tecla por herramienta, sin modificadores para lo frecuente. Cada botón muestra su atajo en el tooltip.

## 5. Onboarding: la primera fachada en menos de 2 minutos

El objetivo es que el usuario llegue a "tengo 3D, lista de materiales e imagen" sin leer nada.

1. **Entrada desde la venta (0:00–0:15).** El botón "Diseñar andamio" en la obra o el cómputo abre el modelador con la plantilla **Fachada recta** ya instanciada con largo, altura y m² de Odoo. No hay pantalla vacía. Si no hay datos, aparece una galería de 7 plantillas con miniatura 3D, y la primera dice "Fachada recta · recomendada".
2. **Tres preguntas sobre el 3D (0:15–0:45).** Son chips grandes, no un formulario:
   - Sistema: Multidireccional o Bastidor
   - Ancho: 0,73 o 1,09
   - Cubierta: nada, malla o lona

   Cada respuesta cambia el 3D al instante, para que se entienda la relación causa-efecto.
3. **Primera manipulación guiada (0:45–1:15).** Un único coach mark pulsante sobre la manija del extremo dice "Arrastrá para alargar o tipeá el largo". Cuando lo hace, aparece el segundo, sobre el alzado: "Seleccioná celdas y apretá O para una abertura (puerta, local)". Son solo dos tips y se descartan solos al usarlos.
4. **Recompensa visible (1:15–1:40).** La barra inferior ya muestra toneladas, piezas y el semáforo. Un tip señala "Ver lista de materiales" y se abre el panel con piezas agrupadas por código y peso.
5. **Cierre (1:40–2:00).** El botón primario **"Generar cómputo"** y el secundario "Imagen para propuesta", que exporta un PNG con encuadre 3/4 y fondo limpio.

**Además:**

- Un **modo práctica** con la obra de ejemplo "Paraná 631". Es un sandbox que no guarda.
- Un **checklist lateral colapsable**: "Primera torre", "Primer pórtico", "Primer quiebre". Enseña de a poco sin tutorial largo.
- Los **mensajes de error escritos como arreglos**, por ejemplo "Te faltan 2 anclajes en N4 → Agregar". Nunca un código pelado.
- La **medición**: tiempo hasta el primer cómputo, por usuario. Si la mediana pasa de 2 min, se rediseña el paso donde se trabe.

## 6. Recomendación

Para la maqueta, conviene el **modelo C** con dos vistas como mínimo: alzado de celdas y 3D. La planta se puede posponer si la v1 cubre fachada recta, fachada en L, torre y pórtico, porque las L se resuelven con la tecla `K` en el alzado desplegado.

Las microinteracciones a probar primero son la 1, la 3, la 4, la 5, la 9 y la 14, y el test de usabilidad se hace con 2–3 personas de OT con el cronómetro de los 2 minutos.

El generador por plantilla (modelo A) va como "motor" escondido detrás de C, igual que Layher usa CLASSIC para alimentar CAD.

**Fuentes:**
- [LayPLAN CLASSIC](https://www.layher.com/en/products/layplan-suite/overlay_layplan_classic)
- [LayPLAN CAD](https://www.layher.com/en/products/layplan-suite/overlay_layplan-cad)
- [Layher, folleto de digitalización](https://www.layher.com/-/media/project/layher/layherkg/downloads/en_systemsolutions_digitalisationsoftware.pdf)
- [Avontus, Placing scaffolds around walls](https://docs.avontus.com/docs/placing-scaffolds-around-walls)
- [Avontus, Wall scaffolds](https://docs.avontus.com/docs/working-with-wall-scaffolds-1)
- [Lift & Access, nueva versión de Avontus](https://www.liftandaccess.com/news/new-release-avontus-scaffold-designer-software-available)
- [Foro SketchUp, snap en push/pull](https://forums.sketchup.com/t/is-it-possible-to-snap-push-pull/29190)
- [Lynda, Push/Pull](https://www.lynda.com/SketchUp-tutorials/PushPull-3D/777383/5024982-4.html)
- [WII'18, configuradores](https://ceur-ws.org/Vol-2068/wii1.pdf)
- [UNamur, reparaciones en configuradores](https://researchportal.unamur.be/en/publications/representing-repairs-in-configuration-interfaces-a-look-at-indust/)
- /Users/joaquin/Desktop/Proyectos/AndamiosOS/docs/oficina-tecnica/handoff.md

Lo de Figma, Excalidraw, Tinkercad, IKEA y Floorplanner sale de mi criterio, porque no encontré documentación específica de esas herramientas.