# Relevamiento de software para modelar andamios: qué copiar y dónde está el hueco para ABA

**Advertencia de método.** Casi todo lo que encontré es material del fabricante: páginas de producto, brochures, release notes y prensa del rubro. No encontré reseñas independientes en G2, Capterra, Reddit ni foros con críticas concretas de velocidad o de curva de aprendizaje. Lo que digo sobre críticas de usuarios es inferencia mía a partir de requisitos y limitaciones declarados, y lo marco como inferencia. Los "-80% de tiempo de dibujo" son números de marketing.

Para el contexto de ABA usé `docs/oficina-tecnica/handoff.md`: la propuesta previa de diseñador para fachadas rectas, `ModeloAndamio → Pieza[]`, sin precio en 3D.

---

## 1. Producto por producto

### Avontus Designer (Avontus, Canadá). El estándar de facto del alquilador o montador
- **Plataforma y precio:** solo Windows ([avontus.com/llm-info-page](https://www.avontus.com/llm-info-page/)). Designer cuesta USD 199 cada 28 días más USD 545 de alta; Professional, USD 299 más 645 de alta; Quantify (inventario y alquiler), USD 349 más 1.495 ([guideflow](https://www.guideflow.com/blog/scaffolding-software)).
- **Cómo se arranca:**
  - Se importa un PDF, un DWG o una imagen satelital y se calca encima ([avontus.com/designer](https://www.avontus.com/designer/)).
  - Se dibujan *walls* (muros) sobre la planta, se seleccionan y con **"Wall Scaffold"** se andamian automáticamente, con los parámetros del grupo *Bay Size/Elevation* (largo de vano, alturas de nivel). Esos parámetros quedan guardados en el dibujo y se puede regenerar ([release 2014 R1](https://docs.avontus.com/docs/avontus-designer-2014-r1)).
- **Cómo se edita:**
  - Se trabaja **vano a vano**: se arrastra un *Standard Bay* desde la cinta y sus defaults (largo, nodos, tablones, rodapié, baranda, durmiente) salen de *Global Options*.
  - Los ***Connector Bays*** son vanos trapezoidales deformables que tapan esquinas a cualquier ángulo y huecos raros ([working-with-bays](https://docs.avontus.com/docs/working-with-bays)).
- **Quiebres y retranqueos:** se resuelven con distintas variantes de esquina: vano conector de 4 patas, esquinas con vanos independientes, ajuste menor de vanos y relleno automático con tubo y grampa ([2014 R1](https://docs.avontus.com/docs/avontus-designer-2014-r1)). También hay ménsulas en esquina ([corner bracket](https://docs.avontus.com/docs/placing-a-corner-bracket-between-two-side-brackets)) y andamios circulares ([circular](https://docs.avontus.com/docs/working-with-circular-scaffolds)).
- **Lista de materiales:**
  - Sale con un clic, con cantidades y pesos.
  - Las "scaffold units" del BOM se pueden filtrar por tipo de vano ([2016 R2](https://docs.avontus.com/docs/avontus-designer-2016-r2)).
  - El *Material Master* se mapea a los códigos del propio inventario, y hay más de 40 catálogos de fabricantes (ringlock, cuplock, kwikstage).
- **Precio de la obra:** no está en Designer. Se exporta a Quantify, que cotiza y gestiona el alquiler.
- **Salidas:** plantas, vistas y 3D con modos de sombreado, DWG y PDF. Avontus Viewer (gratis) permite recorrido 3D y AR para el cliente.
- **Verificaciones:** las páginas que leí no muestran cálculo estructural.
- **Señal de curva de aprendizaje:** Avontus tuvo que meter una biblioteca de videos cortos con un visor al costado de la app ([blog](https://www.avontus.com/blog/scaffold-designer-training-features-release)). Inferencia mía: la herramienta no se entiende sola.

### Layher LayPLAN Suite. Lo más parecido al material de ABA (Allround)
- **LayPLAN CLASSIC:** es un programa *standalone* "sin conocimientos de CAD".
  - Tiene **aplicaciones predefinidas**: fachada SpeedyScaf (bastidor), circular, *birdcage* Allround, torres libres Allround y techos temporales.
  - Se cargan unos pocos "datos clave" y se elige una variante de montaje. En segundos sale una propuesta que **ya incluye anclajes, diagonales y protección lateral**.
  - Largo, alturas y superficies se recalculan en vivo, y la **lista de materiales se actualiza en tiempo real** para transporte y montaje.
  - Genera croquis 2D de montaje automáticos y tiene un visor 3D integrado ([layher.com CLASSIC](https://www.layher.com/en/products/layplan-suite/overlay_layplan_classic), [BIC Magazine](https://www.bicmagazine.com/departments/engineering-construction/digital-processes-aid-scaffold-planning-and-design/)).
  - Layher lo posiciona para "planificación preliminar y cotización" de fachadas simples.
- **LayPLAN CAD:** es un plug-in de AutoCAD (desde 2024 también de BricsCAD).
  - Hace 3D libre, con biblioteca de piezas, conjuntos prearmados y dibujos plantilla.
  - Tiene chequeo visual de colisiones, IDs de pieza automáticas y lista en tiempo real.
  - Exporta a **RSTAB** para el cálculo estructural.
  - **El flujo típico es arrancar en CLASSIC y exportar a CAD** ([layher.com CAD](https://www.layher.com/en/products/layplan-suite/overlay_layplan-cad), [Bricsys](https://www.bricsys.com/news/layplan-cad-3d-scaffolding-with-bricscad)).
- **Material Manager:** listas de material y planos de montaje aislados. Hay un visor VR. Se baja desde el portal myLayher, con prueba de 30 días y sin precio público ([brochure](https://layher.com/-/media/project/layher/layherkg/downloads/en_brochure_systemsolutions_digitalisationsoftware_8121223.pdf)).
- **Limitación:** CLASSIC solo hace lo que está predefinido y es solo Layher ([guideflow](https://www.guideflow.com/blog/scaffolding-software)). Los pórticos peatonales no aparecen como plantilla. Para eso hay que pasar a CAD, es decir, a AutoCAD.

### PERI QuickSolve y PERI CAD
- **QuickSolve:** es una **web app gratuita** que no requiere instalación, pensada para estructuras simples. Incluye un planificador de fachada PERI UP Easy/Flex.
  - Se "crea el layout del edificio en la app" y se cargan algunos datos.
  - Muestra soluciones en 3D y una lista de piezas con imagen de cada artículo. **Se pueden ajustar las cantidades o agregar material a mano**, y se puede **considerar el inventario propio** antes de armar la lista.
  - Exporta una ficha PDF ([peri.sg](https://www.peri.sg/products/software-and-apps/peri-quicksolve.html), [peri.ltd.uk](https://peri.ltd.uk/products/peri-quicksolve.html)).
- **PERI CAD:** es de escritorio y para "CAD designers experimentados". Automatiza las fachadas PERI UP T72/T104, Rosett y Flex y las escaleras de acceso. Lo demás se planifica a mano ([peri-usa](https://www.peri-usa.com/products/peri-cad-software.html)).
- **Patrón:** PERI separa una herramienta gratis, web y rápida para el 80% de los casos de una CAD pesada para el resto. Es el mismo patrón que Layher.

### HAKI: Configurator (web) y Lasco (escritorio)
- **Configurator web:** se elige el sistema (Universal, HAKITEC, puente HBS), se cargan medidas de edificio y vano, tipo de piso y altura de nivel, y **el diseño sale automático**.
  - Muestra el 3D, una lista de materiales **con pesos** exportable a PDF o Excel, y planos PDF o DWF.
  - Exporta un `.DAT` para seguir en Revit si el proyecto se complica ([ca.haki.com/configurator](https://ca.haki.com/configurator)).
- **Lasco:** escritorio gratis. Genera 3D a partir de PDF 2D o 3D y saca la lista de materiales ([haki.com/lasco](https://haki.com/service-and-support/design-tools/lasco)).

### scaffmax (SoftTech, Alemania)
- Es SketchUp más el motor MapMax, en Windows.
- Se modela el edificio a partir de **superficies base** (huellas extruidas) y **se andamia automáticamente muro por muro**.
- Exporta listas de piezas a Excel, GAEB XML o BAP-XML. Soporta catálogos de varios fabricantes, entre ellos ULMA ([hilfe.softtech.de](https://hilfe.softtech.de/x/yAHuAQ), [softguide](https://www.softguide.de/programm/scaffmax)).
- **Patrón:** primero se modela **el edificio** y el andamio se deriva de él.

### ScaffPlan (Australia)
- Es un plug-in de Tekla o SketchUp. Cuesta £2.600 por usuario y año en SketchUp y £3.550 en Tekla ([guideflow](https://www.guideflow.com/blog/scaffolding-software)).
- Tiene modelado automático y lista de materiales desde el modelo. **ScaffBlock** sirve para armar bloques reutilizables más rápido y **Phase Manager** para las fases de obra ([scaffmag](https://scaffmag.com/scaffolding-news/products-services/scaffplan-unveils-powerful-software-enhancements-with-new-version/)).
- Soporta Altrad Futuro y Metrix, Scafom-Rux y HAKI.

### Scaffcalc (Suecia, 2019)
- Es la **única plataforma 100% web** que encontré que junta **diseño 3D, cálculo de cargas y cotización instantánea**.
- Tiene planes Go, Pro, Expert y Enterprise, sin precio público. Dice tener más de 140 empresas en Europa ([guideflow](https://www.guideflow.com/blog/scaffolding-software), [funnelfeedr](https://funnelfeedr.com/en/company/se/scaffcalc-ab-5592291362)).
- No pude confirmar qué norma usa ni si soporta multidireccional.
- Es el competidor conceptual más cercano a lo que quiere ABA.

### Plug-ins de Revit: SMART Scaffolder (CADS) y NTI Scaffplanner
- **SMART Scaffolder:** con "Create Scaffold" arma el andamio alrededor de muros o líneas del modelo Revit y tiene una herramienta de lista de materiales. Está orientado a tubo y grampa UK y soporta Revit 2024–2026 ([Autodesk App Store](https://marketplace.autodesk.com/apps/a203e888-cb0a-411f-8f49-e1c129cf039a)). La versión de escritorio importa DXF, DWG y PDF y exporta IFC ([scaffmag](https://scaffmag.com/business/smart-scaffolder-v5-3-launches)).
- **NTI Scaffplanner:** Revit, con Layher, HAKI, Alustar y otros, y precio a cotizar ([nti-group](https://www.nti-group.com/is/vorur/nti-vorur/nti-scaffplanner/)).
- Los dos son para equipos BIM. Exigir Revit es una barrera enorme para una oficina técnica como la de ABA.

### Otros
- **iScaf** (con iQuote e iRent) y **model IT** (CADS, Kwikstage independiente y *birdcage*, salida DXF).
- **ScaffApp:** app Android de estimación en obra, basada en Kwikstage. Tiene calculadoras de carga por pata, lista de materiales, peso y largo de vano ([scaffoldersforum](https://scaffoldersforum.com/goto/post?id=326737)).
- **100Rails:** importa listas de materiales de Avontus, iScaf, MecCAD, SmartScaffolder y LayPLAN. Advierte que **todos se instalan localmente y no corren en el navegador** ([100rails](https://100rails.helpscoutdocs.com/article/313-cad-and-scaffold-designing-options)).
- **Scafflink, Altrad/Plettac y ULMA:** no encontré herramientas propias públicas.
- **El pedido que se repite en los foros:** "algo donde meta las medidas y me dé la lista de materiales para Layher" ([scaffoldersforum](https://scaffoldersforum.com/threads/scaffold-calculators.42711/latest)). Es una necesidad real y está mal resuelta.

---

## 2. Cómo resuelve cada uno los casos de ABA

| Caso | Mejor solución vista | Cómo |
|---|---|---|
| **Fachada recta** | LayPLAN CLASSIC, HAKI Configurator, QuickSolve | Formulario corto (largo, alto, ancho, nivel) → todo automático, con anclajes y diagonales |
| **Fachada con quiebres y retranqueos** | Avontus, scaffmax | Se dibuja la planta como polilínea (*walls*) → andamiado por tramo → esquina resuelta por regla (conector o vano independiente) |
| **Torre** (acceso, escalera, móvil) | LayPLAN CLASSIC (torre libre), PERI CAD (escaleras de acceso) | Plantilla paramétrica: base × altura × tipo de acceso |
| **Pórtico o paso peatonal** | Ninguno como plantilla simple; LayPLAN CAD o Avontus a mano | Vigas puente y celosías dibujadas pieza a pieza → **hueco** |
| **Bastidor prearmado** | LayPLAN CLASSIC (SpeedyScaf), scaffmax | Plantilla de fachada de marcos |
| **Lista de materiales** | Todos | Contando piezas del modelo, con pesos; Avontus la mapea al inventario propio |
| **Verificación** | Scaffcalc (integrada), LayPLAN CAD → RSTAB | Normalmente afuera o con un exportador |
| **Precio** | Scaffcalc (integrado), Avontus → Quantify | Siempre en un módulo aparte del diseñador |

---

## 3. Los 10 patrones que conviene copiar

1. **Plantillas antes que dibujo libre** (LayPLAN CLASSIC, HAKI Configurator). Se elige "Fachada / Torre / Pórtico", se completan 4–6 campos y el andamio completo sale en segundos.
2. **El generador pone los accesorios obligatorios solo**: anclajes, diagonales, barandas, rodapiés y bases. LayPLAN lo entrega "con anclajes, diagonales y protección lateral". Nadie debería tener que agregar barandas a mano.
3. **Planta como polilínea y andamiado por tramo** (Avontus *Wall Scaffold*, scaffmax). Para quiebres y retranqueos, se dibujan segmentos con largo y ángulo y cada tramo hereda los parámetros.
4. **Parámetros guardados en el modelo, siempre regenerables** (Avontus). Se cambia la altura de nivel y se regenera sin perder lo tocado a mano. Encaja con `ModeloAndamio → construir() → Pieza[]`.
5. **Vano comodín para lo raro** (*Connector Bay*). Esquinas en ángulo y huecos que no cierran con medidas estándar se resuelven con un elemento deformable o un relleno automático, sin bloquear al usuario.
6. **Lista de materiales en vivo, al costado del 3D** (LayPLAN "real time"). Cada cambio actualiza cantidades y kg y no hay un botón de "calcular".
7. **Ajuste manual de la lista sobre lo generado** (QuickSolve). Se puede sumar o restar material extra o de reposición sin tocar el modelo. Clave para la realidad de obra.
8. **Mapeo al inventario propio** (Avontus Material Master, QuickSolve "considerar inventario"). Cada pieza genérica se vincula a un código de `catalogo_piezas` y Odoo, y se avisa si falta stock.
9. **Dos niveles: rápido y avanzado** (CLASSIC → CAD, QuickSolve → PERI CAD, HAKI Configurator → Revit). Lo rápido resuelve el 80%. Lo avanzado puede ser una edición vano a vano dentro del mismo modelo, no otro programa.
10. **Salida comercial en un clic**: PDF con imagen 3D, vista y lista (ficha de QuickSolve), y un visor compartible para el cliente (Avontus Viewer).

## 4. Cinco errores a evitar

1. **Depender de un CAD anfitrión** (AutoCAD, Revit, SketchUp, Tekla). Suma licencias de £2.600 o más por año y obliga a saber CAD. LayPLAN CAD y PERI CAD son "para CAD designers experimentados".
2. **Arrancar pieza por pieza.** Un modelador donde se colocan verticales y horizontales una a una es lento. La unidad mínima tiene que ser el **vano** o el **módulo**, nunca el tubo.
3. **Plantillas cerradas sin salida.** LayPLAN CLASSIC "solo lo predefinido" deja tirado al usuario cuando la fachada tiene un quiebre. Toda plantilla tiene que poder editarse vano a vano después.
4. **Ser tan completo que hace falta una videoteca para usarlo.** Avontus agregó videos con un visor al costado de la app, lo que indica (inferencia mía) una curva de aprendizaje alta. Para ABA: si no se entiende en 10 minutos, falló.
5. **Mezclar diseño con precio o cálculo opaco.** Todos separan diseñador y cotizador, y conviene sostener eso (el handoff ya lo dice). Sobre el cálculo: mostrar veredictos sin norma explícita ni supuestos es peligroso, y Scaffcalc no publica qué norma usa. Los bugs de M05 y M07 del handoff, que dan "ok" falso, son exactamente este riesgo.

## 5. El hueco que ABA puede aprovechar (simple > completo)

- **Web, en español y sin instalar.** Fuera de QuickSolve, del HAKI Configurator (atados a su marca y a pocos sistemas) y de Scaffcalc (sueco, cerrado, sin precio), todo es Windows o un plug-in. No encontré nada pensado para Latinoamérica, ni con normativa argentina (CIRSOC 102, SRT).
- **Multimarca, multidireccional y bastidor en el mismo modelo.** LayPLAN CLASSIC tiene SpeedyScaf y Allround, pero solo Layher. ABA necesita **su** parque real (Allround o roseta y bastidores prearmados) mapeado a **sus** códigos de Odoo.
- **El pórtico peatonal o vehicular sobre vereda como plantilla de primera clase.** Ningún producto lo trae como plantilla simple: todos lo mandan a CAD. En CABA es un caso diario por la normativa de vereda. Es el diferencial más claro.
- **Diseño → cómputo → remito → cotizador dentro del mismo sistema**: `computos`, `catalogo_piezas`, remitos y `balance-material` ya existen en Andamios OS. Avontus cobra aparte por Designer más Quantify para lograr eso.
- **Precarga desde la venta** (`x_permiso_base/altura/metros_lineales` en Odoo). Nadie arranca un diseño con los datos de la venta ya cargados.
- **Veredictos solo cuando son confiables.** Conviene arrancar con la lista de materiales, el peso y la imagen, y sumar M03, M05 y M11 recién cuando estén corregidos y con la norma visible. Mejor sin veredicto que con un "ok" falso.

**Forma sugerida** (simple > completo): tres plantillas, Fachada (planta como polilínea), Torre y Pórtico, cada una con 4–6 campos. El sistema elige entre multidireccional y bastidor con su biblioteca de vanos estándar. Después se puede editar vano a vano, con una lista de materiales en vivo al costado (kg y códigos de Odoo), ajuste manual y un botón "Generar cómputo" que lo manda a `computos`. El objetivo es que una fachada con un quiebre se arme en menos de 2 minutos.