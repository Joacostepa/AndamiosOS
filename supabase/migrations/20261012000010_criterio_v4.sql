-- ========================================================================
-- Criterio v4: §3 sólo reglas, §9 editar antes que re-emitir, «desglosado» = modelo D
-- ========================================================================
--
-- Decisiones de Joaquín (12/10, auditoría del asistente comercial):
--   · §3 "Tarifario de referencia" → "Tarifas: cómo se aplican". Salen los casos y valores
--     "de la época" (comparables, evolución de la tarifa, alerta de agosto): los valores están en
--     Parámetros y los importes salen del motor. Las reglas (rango de 6 m, encuadre A/B,
--     mecanismo industrial, recargos, rendimiento por altura, §3.5) quedan todas.
--   · §9: al reactivar una cotización vieja, si está en presupuesto o enviada se edita con el
--     mismo número; se re-emite sólo si está confirmada o cancelada, o si el vendedor lo pide.
--   · §1: el modelo D también se dice «desglosado» o «abierto».
--
-- Sólo se crea si el vigente es EXACTAMENTE el v3 del 26/09 (md5): si alguien lo editó desde
-- Parámetros → Criterio, falla y no pisa nada. Idempotente (no hace nada si ya existe la v4).
-- Las conversaciones abiertas siguen con su criterio; la v4 vale para las nuevas.
--
-- Aplicar con: node --env-file=.env.local scripts/apply-migration.mjs <este archivo>

DO $mig$
DECLARE
  v4 CONSTANT TEXT := $crit$
# Criterios de cotización — Andamios Buenos Aires

**Documento de referencia permanente · Emprendimientos y Estructuras SA**

Versión cargada en AndamiosOS a partir del **v2 de agosto 2026**, que consolida las reglas de precio,
el checklist previo, las señales de alerta y los criterios comerciales surgidos de las cotizaciones
reales emitidas entre febrero y agosto de 2026. Valores netos, sin IVA.

> **Los números vigentes viven en Parámetros de cotización.** Donde este texto dice
> **[Parámetro: …]** hay que tomar el valor de la tabla de parámetros. Los números que aparecen en
> los casos (Corrientes 2810, Ayacucho 1075, AGE, etc.) son **valores de la época**: sirven para
> entender el criterio y como comparables, no como tarifa. Si un número de este texto no coincide
> con la tabla, **manda la tabla**.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| 🔒 **Regla fija** | Criterio establecido por Joaquín. No se cambia sin que él lo diga. |
| 💲 **Tarifa vigente** | Está en Parámetros, con su fecha. Se desactualiza: verificar contra órdenes recientes en Odoo (precios recientes por producto) antes de usarla. |
| 🧠 **Criterio propuesto** | Lógica aplicada y aceptada en un caso concreto, nunca declarada como regla general. Aplicar y **avisar** que se está aplicando. |
| ⚠️ **Ambigüedad abierta** | Dos criterios que conviven sin resolución. **Marcar y preguntar** antes de usar. |

---

# 1. Los cuatro modelos de cotización

Antes de tocar un número hay que definir **con qué modelo se cotiza**. Es la decisión de mayor
impacto y la que más veces se cambia a mitad de camino.

| Modelo | Cuándo se usa | Estructura del precio | Renovación |
|---|---|---|---|
| **A — Bandeja / pantalla por m.l.** | Protección peatonal aislada, sin estructura de fachada | $/m.l. × metros, primer mes todo incluido | [Parámetro: Renovación de bandejas y fachadas] |
| **B — Fachada por m²** | Estructura sobre fachada, con o sin bandeja y media sombra | $/m² × superficie, primer mes todo incluido | [Parámetro: Renovación de bandejas y fachadas] |
| **C — Alquiler puro (sin montaje)** | El cliente arma; ABA provee material y, opcionalmente, acompañamiento | Canon de material (lista vigente) + líneas separadas | [Parámetro: Renovación de alquiler puro] |
| **D — Desagregado por ítem** (el vendedor también dice «desglosado» o «abierto») | Industria, etapas, geometría no estándar, licitaciones grandes | Canon + MO por jornada-cuadrilla + flete + ingeniería + S&H + viáticos | Se declara aparte, por etapa |

🔒 **Regla de corte.** Si la mano de obra supera aproximadamente el [Parámetro: Corte de mano de obra]
del primer mes, el esquema "todo incluido + renovación" deja de servir: la renovación queda absurda
porque arrastra mano de obra ya pagada. Ahí se abre en dos líneas — **mano de obra por única vez** y
**alquiler por mes**. (Criterio aplicado en la torre anexa de AGE, donde la MO era el 80 % del primer
mes.)

---

# 2. Cómo se cotiza cada unidad de negocio

## 2.1 Estructura en fachada — por m²

🔒 Precio = **$/m² × metros lineales de desarrollo × altura**. El desarrollo es la suma de los
frentes (en esquina, cada cara por separado), **no el perímetro del lote**.

🔒 El valor del primer mes es **todo incluido**: alquiler, armado, desarme, traslados y costos
operativos. Va como **un solo renglón**.

🔒 Incluye por defecto: estructura completa, bandeja de protección peatonal en fenólico, una fila
completa de tablones (o niveles cada 2 m si se aclara), cobertura en tela media sombra y acceso
por escalera escotilla.

🔒 **Renovación mensual** = [Parámetro: Renovación de bandejas y fachadas] del canon locativo.

### Escalonamiento por altura

🔒 En estructuras altas no se cotiza un $/m² plano: se parte en dos tramos y **se promedia en un
único renglón**, con la aclaración del escalonamiento en la descripción. Joaquín pidió
expresamente que no se muestre partido en dos renglones.

- Corrientes 2810 (42 m): hasta 21 m a $40.000, de 21 a 42 m a $50.000 → renglón único $45.000/m² (valores de la época).
- Ayacucho 1075: mitad inferior $45.000, mitad superior $65.000 (valores de la época).

🔒 **El salto del tramo alto se pregunta en cada obra.** No hay porcentaje fijo: los casos reales
van de +25 % a +44 %. Ofrecer las opciones al cotizar:

| Opción | Salto | Cuándo |
|---|---|---|
| **A** | [Parámetro: Salto del tramo alto — opción A] | Altura moderada, acceso normal, sin complicación de acarreo |
| **B** | [Parámetro: Salto del tramo alto — opción B] | Edificio alto con caída marcada de rendimiento (referencia Ayacucho 1075) |
| **C** | Otro | Lo define Joaquín para el caso |

Sea cual sea, el resultado **se promedia y va como un renglón único**, con el escalonamiento
aclarado en la descripción.

### Obras por fases con reubicación del material

🔒 Cuando el mismo material rota entre posiciones (frente → laterales → contrafrente), **cada
fase se factura al valor completo**, no como un alquiler largo. Fundamento: cada fase tiene
armado, desarme y traslados propios. La composición del $/m² es aproximadamente **35 % alquiler /
65 % mano de obra y operativo**, así que la remobilización es la mayor parte del costo.

⚠️ **ABIERTO — pendiente de definición de Joaquín.** Hay tensión con el criterio de etapas del
modelo D, que dice que el material no se multiplica (hay un solo juego) y sólo se multiplica la
mano de obra. Cobrar el valor completo por fase implica volver a cobrar también el alquiler sobre
material que ya está pago. Mientras no esté resuelto: **marcar el caso y preguntar** antes de
emitir una propuesta por fases.

## 2.2 Bandejas y pantallas de protección peatonal — por metro lineal

🔒 Se cotiza por metro lineal. Primer mes todo incluido, renovación [Parámetro: Renovación de
bandejas y fachadas].

🔒 **Mínimo facturable: [Parámetro: Mínimo facturable de bandeja]**, aunque el frente sea más corto.
En el PDF va **la medida real** en las secciones 1 y 2; el mínimo se declara explícitamente en el
alcance y en el renglón de la oferta.

🔒 **Concertina perimetral antitrepa** = [Parámetro: Concertina perimetral] del valor del metro de la
bandeja. Se factura también sobre el mínimo facturable. Se computa sobre los m.l. del desarrollo, no
de la estructura.

🔒 **Etapas.** Si el cliente no va a trabajar los frentes en simultáneo, dividir la propuesta en
etapas por frente, **con el monto de renovación indicado por etapa**, no globalizado.

## 2.3 Alquiler de material sin montaje

Torres móviles, apuntalamiento, componentes sueltos.

🔒 El canon de 30 días se computa **pieza por pieza a la lista de alquiler vigente**, y sobre ese
total se aplica el [Parámetro: Recargo sobre la lista de alquiler] como criterio comercial.

🔒 Ítems **fuera de la lista** (puntales telescópicos, vigas H20, caño estructural, ruedas): canon
mensual = [Parámetro: Canon de ítems fuera de lista] del **valor de compra neto**.

🔒 **No apilar los dos criterios sobre el mismo ítem.** Si salió de la lista, lleva el recargo sobre
lista; si salió del valor de compra, lleva el % del valor de compra y nada más.

🔒 **Criterio unificado (agosto 2026).** Las dos reglas viejas no eran equivalentes (el 10 % del
valor de compra daba ~2,4x lista y el +80 % daba 1,8x): un mismo presupuesto salía con dos políticas
comerciales distintas según de dónde viniera cada pieza. Manda el recargo sobre lista, porque es el
criterio que Joaquín fijó deliberadamente; el % del valor de compra de Parámetros es su equivalente.
Si en algún caso se quiere sostener un premio por ítem fuera de lista —rotación baja, reposición
difícil, riesgo de pérdida— que sea un recargo **declarado y explícito**, no el subproducto de dos
fórmulas distintas.

🔒 **Renovación** = [Parámetro: Renovación de alquiler puro]: no hay componente de mano de obra que
descontar.

## 2.4 Venta de material

🔒 **Siempre preguntar con qué criterio se amortiza antes de cotizar una venta.** No hay default.
Ofrecer las opciones: [Parámetro: Venta — amortización opción A] de canon, [Parámetro: Venta —
amortización opción B] (equivalente a la lista en USD), u otro plazo que indique Joaquín. Conviven
tres referencias:

- Lista de venta en **USD**, convertida al **T.C. oficial BNA billete vendedor** del día (criterio
  general de conversión de la casa). Referencias de la época: módulo estándar USD 260, tablón
  metálico 2,50 m USD 195.
- Precio derivado de la amortización del canon a 36 meses (criterio aplicado en Merba).
- Contrastada contra la propia lista en USD, la lista real equivale a ~24 meses. Con 36 la venta
  queda ~50 % por encima de nuestro propio precio de lista.

**Nunca elegir por default.** Preguntar, aplicar lo que se indique, y dejar escrito en la nota de
la orden qué plazo se usó.

---

# 3. Tarifas: cómo se aplican

> 💲 Los valores están en **Parámetros de cotización** (grupos Bandejas, Fachadas, Complementarios y
> Mano de obra) y los importes salen siempre del motor. Acá van sólo las reglas para aplicarlos.
> Usar siempre la tarifa de Parámetros, aunque una cotización vieja diga otra.

## 3.1 Bandeja y pantalla de protección peatonal ($/m.l.)

| Altura | Tarifa |
|---|---|
| **3,00 m** (estándar) | [Parámetro: Bandeja 3 m] |
| **6,00 m** | [Parámetro: Bandeja 6 m] (rango) |
| **8,00 m** | [Parámetro: Bandeja 8 m] |
| **9,00 m sobre terreno de terceros**, **pasarela ancha con vigas reticuladas** | caso a caso |

Una cotización anterior a la tarifa vigente que se reactiva se actualiza a valor de hoy, no se
parchea (cómo, en §9).

**Efecto volumen:** a igual altura, más metros bajan el unitario.

🔒 **La tarifa de 6 m es un rango, no un valor.** Se define caso por caso según:

- **Volumen.** Es el factor dominante.
- **Complejidad del apoyo.** Ménsulas sobre alero, apoyo sobre estructura de terceros o
  transiciones empujan al techo del rango (Azopardo 505).
- **Contexto comercial.** Competencia activa o cliente recurrente.

Piso y techo en [Parámetro: Bandeja 6 m]. Fuera de ese rango, **preguntar**.

## 3.2 Estructura de fachada ($/m²)

| Rango | Contenido típico |
|---|---|
| [Parámetro: Fachada — piso de licitación] | Piso competitivo de licitación, gestoría e ingeniería absorbidas |
| [Parámetro: Fachada — estándar] | Estructura con bandeja en PB, 1–2 filas de tablones. **Valor de lista CABA** |
| [Parámetro: Fachada — con núcleo de escaleras] | Con núcleo de escaleras interno, 2 filas completas, media sombra |
| [Parámetro: Fachada — completa o superficie chica] | Bandeja + media sombra + 2 filas de tablones, o superficie chica |
| [Parámetro: Fachada — acceso comprometido] | Interior, patio, acceso comprometido, fases con remobilización |
| [Parámetro: Fachada — fuera del AMBA o patrimonial] | Fuera del AMBA, o envolvente patrimonial de alta exigencia |

🔒 **El encuadre se pregunta en cada obra**, porque cambia cómo se le presenta el número al
cliente aunque el importe final sea el mismo:

| Opción | Encuadre | Cómo se ve en la propuesta |
|---|---|---|
| **A** | **Rango por complejidad** | El $/m² sale de lo que la obra requiere. No hay descuento que mostrar. |
| **B** | **Lista con bonificación declarada** ([Parámetro: Fachada — valor de lista]) | Se muestra el valor de lista y el descuento (§4.6). La renovación se calcula sobre lista, no sobre el bonificado. |

La opción B conviene cuando querés que el cliente vea que le hiciste un precio; la A, cuando no
querés fijar un ancla de la que después haya que defenderse. **Preguntar antes de emitir.**

## 3.3 Ítems complementarios

| Ítem | Valor | Nota |
|---|---|---|
| Concertina perimetral | [Parámetro: Concertina perimetral] del valor del m.l. de bandeja | Sobre los m.l. del desarrollo |
| Gestoría permiso vía pública GCBA | [Parámetro: Gestoría permiso vía pública (CABA)] | Sólo CABA. Fuera de CABA cambia el nombre del ítem y probablemente el valor; si no está confirmado, **dejarlo afuera** (La Plata → Municipalidad) |
| Media sombra | [Parámetro: Media sombra] | Sube la carga de viento: puede exigir anclajes adicionales |
| Fenólico 18 mm | [Parámetro: Fenólico 18 mm (estimado)] | No está en lista — **validar antes de usarlo en volumen** |
| Ingeniería — memoria de cálculo | [Parámetro: Ingeniería — memoria de cálculo] | Opcional de toda bandeja y fachada. **Pasados los 6 m de altura es obligatoria** (Decreto 911/96, §6.1) y va en la base. Obra compleja (torres altas, industria, geometría especial): [Parámetro: Ingeniería — obras complejas]; piso [Parámetro: Ingeniería — torre simple]. |
| Técnico de Seguridad e Higiene | [Parámetro: Técnico de Seguridad e Higiene] por jornada de armado y de desarme (una jornada corta cuenta entera) | Opcional de toda bandeja y fachada; en la base si el cliente lo pide |
| Flete | [Parámetro: Flete GBA cercano] · [Parámetro: Flete CABA] · [Parámetro: Flete La Plata] | Fuera de CABA va como **renglón aparte** |

## 3.4 Mano de obra

Unidad de cuenta: **jornada-cuadrilla**.

🔒 Base: escala **UOCRA CCT 76/75 Zona A** con carga patronal completa (~2,06x) →
[Parámetro: Persona-jornada UOCRA]. Verificar la tabla del mes en curso: se actualiza con cada
revisión salarial.

| Criterio | Recargo |
|---|---|
| **UOCRA estándar** | [Parámetro: Recargo estándar sobre UOCRA] |
| **UOCRA según trabajo** | [Parámetro: Recargo alto sobre UOCRA] |

🧠 **Tarifa top-down para industria:** [Parámetro: Jornada industrial top-down (cuadrilla de 5)] =
comparable del mes + 20 % por contexto industrial.

🔒 **En obra industrial se pregunta qué mecanismo aplicar.** Los dos llegan a valores casi iguales
por caminos distintos, así que la elección es de criterio, no de plata:

| Opción | Mecanismo |
|---|---|
| **A** | UOCRA + [Parámetro: Recargo alto sobre UOCRA] (bottom-up desde el convenio) |
| **B** | [Parámetro: Jornada industrial top-down (cuadrilla de 5)] (top-down) |

Preguntar cuál usar y **dejarlo asentado en la nota de la orden**.

🔒 **Recargos**: sábado [Parámetro: Recargo sábado] · domingo [Parámetro: Recargo domingo] ·
nocturno [Parámetro: Recargo nocturno] · condiciones de trabajo adversas (voladizo, acarreo vertical,
altura de campanario) [Parámetro: Recargo condiciones adversas].

🔒 **Fuera de radio**: jornadas de viaje a [Parámetro: Jornada de viaje], alojamiento
[Parámetro: Alojamiento] por persona y noche, comida [Parámetro: Comida] por persona y día, y **toda
movilización cuenta mínimo [Parámetro: Mínimo de una movilización]** — la cuadrilla duerme allá.

🔒 **El rendimiento de la cuadrilla cae con la altura.** En estructuras altas hay que sumar
jornadas, no sólo material. Factores de productividad en Parámetros (grupo Mano de obra), usados en
la Torre del Reloj: 1,00 hasta 10 m sobre el apoyo, crecientes en las franjas intermedias y 1,75 por
encima de 40 m.

## 3.5 Ingeniería, S&H y gestoría

🔒 Van como **líneas propias, de única vez**, y **quedan fuera de la base de cálculo de la
renovación** (ver §4.1).

---

# 4. Reglas duras — no se negocian

## 4.1 La renovación se calcula SOLO sobre el canon locativo

🔒 Nunca sobre el subtotal. Quedan fuera: flete, viáticos, ingeniería, memoria de cálculo,
Seguridad e Higiene, gestoría, venta de material y cualquier ítem de única vez. En AndamiosOS cada
línea del presupuesto lleva la marca "única vez" y el motor calcula la base con esa marca.

🔒 **Igual se verifica el bullet de renovación en el PDF antes de mandarlo.**

## 4.2 El canon corre hasta la recepción física en depósito

🔒 No se acepta la figura de "puesta a disposición". El período se computa desde la entrega hasta
la recepción efectiva del material en depósito de ABA. Sin excepción.

## 4.3 IVA siempre

🔒 [Parámetro: IVA]. Se cobra y se ingresa aunque el cliente sea exento.

## 4.4 Mínimo de alquiler

🔒 [Parámetro: Período mínimo de alquiler], aunque el cliente pida 4 días o pregunte "precio por
día". Si el pedido es notoriamente corto, conviene una sección breve en el PDF explicando por qué el
mínimo lo favorece (se hizo en Agüero 1938). Casos: González, Bernardo de Irigoyen.

## 4.5 Mínimo facturable en bandejas

🔒 [Parámetro: Mínimo facturable de bandeja]. La medida real va en el PDF; el mínimo va en el importe.

## 4.6 Bonificaciones

🔒 Se muestran como **descuento sobre el valor de lista**, y **la renovación se calcula sobre
lista, no sobre el bonificado**. Casos: Sanfelippo −15 %, Martinez −20 % con 5 % adicional en
renovación calculado sobre lista.

🔒 Si la bonificación tiene fecha límite, va escrita en **Aclaraciones** con la fecha explícita.

## 4.7 Actualización por CAC

🔒 Índice **CAMARCO/CAC**, no INDEC. En obras pagaderas en cuotas, el ajuste aplica **por cuota al
momento del pago** — en ese caso va dentro de la forma de pago y se desactiva el bullet estándar de
actualización, porque no es un mecanismo mensual automático. En cotizaciones en USD: canon fijo, sin
cláusula CAC.

## 4.8 Lo que el cliente declaró como necesidad no es un opcional

🔒 Si el cliente lo pidió expresamente (ej. concertina "para evitar trepadura"), va en la base.
Los opcionales son cosas que el cliente todavía va a evaluar.

🔒 **Concertina, gestoría, técnico de SyH y memoria de cálculo van como opcionales**, fuera de la base (la memoria de cálculo, salvo que la estructura pase los 6 m: ahí es obligatoria y va en la base). Excepción: en licitación
pueden ir incluidas, pero **aclarándolo** para que el comitente sepa que las está recibiendo.

## 4.9 Los tiempos de armado y desarme no se inventan

🔒 Los confirma el técnico caso por caso. Nunca se asume un valor típico.

## 4.10 No ofrecer "supervisor durante todo el armado"

🔒 Es un cheque en blanco. Se cotizan **jornadas cerradas** más un valor de jornada adicional.

---

# 5. Checklist previo — preguntar siempre

## Nunca asumir estos dos

1. 🔒 **Jornadas de armado y desarme.** Preguntar siempre, aunque el resto de los datos haya
   venido completo. Van en la Sección 2 y en el bullet "Plazo de montaje".
2. 🔒 **Render.** Genérico de la biblioteca, o uno propio que se sube para la obra.

## Geometría

3. 🔒 Frente en m.l. y altura real. En CABA el frente se verifica SIEMPRE contra el catastro
   de la Ciudad (verificar_frente_lote): sin eso no se guarda. Si la altura no es una puerta
   oficial, preguntar cuál de las parcelas vecinas es. Si los m.l. no cierran con el frente,
   preguntar por qué (¿toma lotes vecinos?, ¿cubre sólo un tramo?). Fuera de CABA el frente lo
   tiene que dar el cliente.
4. Si es esquina (el catastro lo marca y mide cada cara): ¿los dos frentes o uno solo? Se
   anota en la decisión «esquina». (Sarmiento 1894 pasó de 39,31 a 14,25 m.l.; Esmeralda 570
   se cotizó solo sobre una calle.)
5. Altura de la bandeja. 3 m es el default y define la tarifa; cualquier otra cosa cambia el renglón.
6. ¿El precio va escalonado por altura?

## Alcance

7. ¿Qué tarea hace el cliente? Pintura con silleteros, restauración, impermeabilización, recambio
   de ventanales, revestimiento, desmontaje. Define niveles y densidad.
8. ¿Cuántas filas de tablones? ¿Niveles cada 2 m o dos filas móviles que el cliente va desplazando?
   **Es el driver más grande del material.**
9. ¿Media sombra? ¿Bandeja incluida en la estructura o aparte?
10. ¿Etapas? ¿Conviven en simultáneo o son sucesivas? Si son sucesivas, la renovación va **por
    etapa separada** y hay MO por cada rearmado.
11. Opcionales: concertina (bandejas, [Parámetro: Concertina perimetral] del metro), gestoría (sólo CABA), técnico de SyH por jornada y memoria de cálculo. Salen solos en el presupuesto; se sacan si el cliente no los quiere.

## Operación y contexto

12. Plazo de alquiler previsto (define las renovaciones y si conviene bonificar).
13. ¿Quién arma: ABA o el cliente?
14. ¿Quién retira y devuelve el material?
15. ¿Cómo entra el material y cuánto hay que acarrearlo? ¿Hace falta izaje?
16. ¿La obra está dentro o fuera de CABA? Si está afuera: **flete aparte** y cambia la jurisdicción
    del permiso.
17. ¿Sobre qué apoya la estructura? ¿Hace falta verificación estructural?
18. ¿Quién provee izaje, energía, obrador, vigilancia nocturna, acceso del personal?
19. ¿Hay inducción, habilitaciones o restricciones horarias? (banco, laboratorio, planta, edificio
    en funcionamiento)

## Del cliente — antes de escribir nada en Odoo

20. 🔒 **Validar el CUIT.** Los formularios de alta llegan con errores de dígito con frecuencia.
    Si está mal, marcarlo y **no cargarlo**. Si no se puede confirmar, dejarlo vacío y anotar que se
    confirme contra la constancia.
21. 🔒 **"Ya soy cliente" no significa que exista en Odoo.** Verificar siempre.
22. ¿La obra ya fue cotizada por otro vendedor de ABA? (ver §7)
23. Datos fiscales, contacto, cómo nos conoció.
24. Vendedor, técnico, tipo de contrato.

---

# 6. Qué mueve el precio, y cuánto

Ordenado por impacto observado (porcentajes medidos en casos reales).

| Factor | Efecto medido |
|---|---|
| **Densidad de entablonado** | Niveles cada 2,00 m contra dos filas móviles: **+75 % sobre el canon** (Juzgado de Viedma). Cada nivel entablonado en Lasserre eran ~$2,1 M sobre el total. |
| **Altura — bandeja** | 3 m → 6 m = **+25 % a +50 %**; 3 m → 8 m = **+68 %**. |
| **Altura — fachada** | Tramo alto **+25 % a +44 %** sobre el bajo. Además, más jornadas por caída de rendimiento (factor hasta 1,75 por encima de 40 m). |
| **Fases con remobilización** | Cada fase al valor completo. Cuatro fases ≠ un alquiler largo. La MO se multiplica; el material no. En Merba, 24 jornadas fueron el **57 % del presupuesto**. |
| **Obra fuera del AMBA** | En Quequén (520 km) el alquiler fue apenas el **20 %** del total; MO + viáticos el **48 %**; flete el 10 %. El $/m² pasó de $45.000 a **$122.000**. En INTECO, viáticos y flete fueron **$18 M sobre $57 M**. |
| **Acarreo e izaje** | El cuello de botella suele ser el acarreo, no la cantidad de piezas (Merba: 133 piezas que suben por ascensor cuestan más jornadas que 260 a nivel vereda). Izaje subcontratado en Torre del Reloj: **$28.000.000**. |
| **Horario** | Sábado, domingo y nocturno con recargo (Parámetros). Casa de la Cultura se armó fin de semana; Banco Galicia solo sábados por horario bancario. |
| **Contexto industrial / planta** | Inducción, S&H en obra, ART y RC, ropa ignífuga, horarios restringidos, coordinación con el comitente, cuadrilla parada mientras se cumple el protocolo. Líneas propias de S&H e ingeniería + recargo de jornada. |
| **Exposición al viento** | CIRSOC 102 exposición D (borde de río, campo abierto): qz = **113 kg/m²** contra 75 kg/m² urbano. Más material, más anclajes, y puede cambiar el diagrama estructural entero. |
| **Pliego patrimonial** | Sin perforaciones, media sombra nueva mantenida toda la obra, inspección diaria, desarme solo con autorización escrita. La Torre del Reloj terminó en ~$124.000/m² contra $35.000/m² de las fachadas del mismo edificio. |
| **Esbeltez** | Ver §6.1. El umbral normativo es **6 m de altura → memoria de cálculo obligatoria** (Decreto 911/96). Superado el límite de autoportancia: anclajes obligatorios, autorización del comitente e ingeniería facturable aparte. |
| **Apoyo sobre estructura existente** | Verificación estructural previa. Va como **condición suspensiva** en la propuesta, no como supuesto. |
| **Geometría no estándar** | Envolventes, voladizos, colgantes, transiciones con ménsulas y vigas de reparto. |
| **Requerimientos especiales** | Lona ignífuga, red de protección, valla ciega en fenólico, bandejas en voladizo, vigas celosía. Cada uno es material y cómputo aparte. |
| **Media sombra** | Además del $/m² del tejido, sube la carga de viento y puede obligar a anclajes adicionales. **Decirlo en la propuesta.** |
| **Esquina / ochava** | Dos frentes = dos caras a computar + **1 jornada de armado adicional** como mínimo. |
| **Plazo declarado por el cliente** | Define cuántas renovaciones tiene el negocio. Un frente de 2 meses vale más que el primer mes que se cotiza. |

## 6.1 Esbeltez y autoportancia — qué dice la norma

El umbral no lo fija ABA: lo fija la normativa. Tres cosas distintas que conviene no mezclar:

🔒 **Disparador legal (Argentina).** El Decreto 911/96 —Reglamento de Higiene y Seguridad para la
Industria de la Construcción, de aplicación obligatoria en obra pública y privada— exige que
**todo andamio que supere los 6 m de altura sea dimensionado en base a cálculo**, o sea con
memoria de cálculo de la estructura montada. Ese es el corte duro, y no depende de la relación
altura/base. La norma técnica que ordena el dimensionamiento es **IRAM 3691**, que toma el
criterio general europeo con materiales locales y los reglamentos CIRSOC.

🔒 **Torres móviles sobre ruedas.** Relación altura/base máxima **3:1 en exteriores** y **3,5:1 en
interiores**, con ruedas bloqueadas durante el trabajo.

🔒 **Estructuras fijas autoportantes.** El criterio corriente es altura ≤ **4× el ancho menor de
la base**. Por encima de eso la estructura no se sostiene libre: exige arriostramiento o anclaje
estructural.

**Conclusión operativa: se adopta 4:1 para estructura fija y 3:1 para torre móvil en exterior.**
El 6:1 que aparecía en la documentación anterior no corresponde a ninguna norma y se descarta.

⚠️ El texto de IRAM 3691 no es de acceso público. Antes de usar estos umbrales como argumento
técnico frente a un comitente o en una memoria firmada, **verificarlos contra la norma vigente y
el manual del fabricante del sistema**. Acá sirven como criterio de cotización, no como
sustituto del cálculo.

---

# 7. Señales de que la obra vale más de lo que parece

Cuando aparece alguna de estas, **frenar y recotizar el alcance antes de tirar un número**.

## Señales de medición

- **Medida declarada absurda** — "20 m de ancho por 360 m de alto". Error de tipeo: no existe un
  edificio de 360 m en el país (el más alto ronda los 235). Verificar antes de calcular.
- **Frente más corto que el mínimo facturable** — se factura el mínimo. El trabajo chico no es barato.
- **Dos tramos de ochava casi iguales pero no idénticos** (4,20 y 4,26) — son las dos caras del
  chaflán, no una medida repetida por error. Se suman.
- **Tramo suelto muy corto** (1,99 m sobre un frente) — preguntar si la bandeja tiene dónde
  apoyarse ahí. Puede requerir estructura adicional que no está en el $/m.l.
- **"Espacio libre de 6×4"** — confirmar si es el interior útil o la huella total. En Central
  Costanera esa aclaración cambió la solución estructural entera (de pared simple a doble línea de
  montantes) y bajó la tensión por anclaje de 1.083 kg a 260 kg.

## Señales de alcance

- **El cliente pide "andamio común" pero la geometría exige multidireccional.** Sembinelli pidió
  andamio común en una esquina de 25,57 m.l.; se cotizó multidireccional igual.
- **El cliente pide "precio por día".** Traduce a plazo corto, pero el mínimo es el primer período
  completo. Se cobra el mínimo igual.
- **El acceso al lugar de montaje no es directo.** Patio interno, azotea a +31 m, piso 10 por
  ascensor, 20 m de acarreo desde la descarga. El $/m² estándar **no contempla** izaje por fachada
  ni acarreo largo.
- **La obra tiene etapas.** Multiplica mano de obra, fletes internos entre etapas y renovaciones
  que hay que declarar por separado.
- **El desarme depende de la autorización de un tercero.** Devenga extensión de alquiler; hay que
  dejarlo escrito.
- **La devolución del material queda del lado del cliente.** El canon corre hasta que el material
  vuelve físicamente al depósito.
- **Aparece un pliego.** Exigencias de norma, media sombra nueva, pantallas a 45°, línea de vida,
  guardias de mantenimiento, supervisión técnica: todo eso son líneas que el cliente no pidió pero
  el pliego obliga.

## Señales de contexto que multiplican el precio

- **Planta industrial, central eléctrica, cementerio, puerto** — no es un frente de obra normal.
- **Estructura que apoya sobre losa existente** — verificación estructural a cargo del comitente,
  como condición previa a la firma.
- **Lo que se ancla es lo que se va a demoler** — el plan de arriostramiento tiene que bajar con
  el corte. Eso es ingeniería de secuencia, y es facturable.
- **Borde de río o campo abierto** — exposición D, +50 % de presión de viento.
- **Obra fuera del AMBA en temporada alta** — el alojamiento no es sólo precio, es disponibilidad.
  Conviene bloquear o cotizar contra presupuesto cerrado del hotel.
- **Material que no está en la lista de alquiler** — no hay precio de referencia. Se calcula sobre
  valor de compra y hay que decir explícitamente qué porcentaje del total está apoyado en
  estimaciones.

## Señales comerciales

- **Silletero o contratista independiente** — compite por precio, pero el riesgo de cobro sube.
  Clasificar como "Profesional de oficio / contratista independiente".
- **La misma dirección aparece en varias oportunidades** — Corrientes 2810 generó tres propuestas
  para tres empresas distintas. Puede ser competencia real, o el mismo trabajo por tres canales.
- 🔒 **La obra ya fue cotizada por otro vendedor de ABA** — riesgo de conflicto de canal.
  **Verificar en el CRM antes de emitir** (pasó en Sarmiento 1894 y Ayacucho 1075) y avisar a Joaquín.
- **El cliente llegó por cartel en obra o recomendación** — no está comparando tres presupuestos.
  Distinto de una licitación.
- **El cliente ganó una licitación con un número nuestro viejo.** Hay margen y legitimidad para
  actualizar (Viedma: valor de abril actualizado por CAC).
- **El cliente reduce el alcance después de cotizar** — pasó dos veces (Sarmiento de 39,31 a
  14,25 m.l.; Andonaegui de 46,24 a 16,24). Al reducir, **revisar también las jornadas**: con menos
  metros no se justifican las mismas.

---

# 8. Chequeos de razonabilidad antes de emitir

1. **$/m² resultante contra comparables.** FG dio $47.269/m² sobre 873 m² — alineado con los rangos
   de fachada. Si el resultado se despega, hay algo mal computado, o hay algo que justifica el
   sobreprecio y conviene **explicitarlo en la propuesta**.
2. **Ratio contra lista de material.** AGE rendía **1,37x lista** por el período. En Viedma se
   detectó que el valor viejo daba **5,3x lista** — estaba armado con un $/m² de fachada todo
   incluido, no con la lista.
3. **Peso de la mano de obra sobre el total.** Si pasa el [Parámetro: Corte de mano de obra], revisar
   las jornadas antes de mandar: son la estimación más frágil del presupuesto. Y si pasa ese umbral,
   revisar además si corresponde cambiar de modelo (§1).
4. **Sensibilidad del montaje.** En AGE, si el montaje se iba de 50 a 70 jornadas se comían $23 M
   de margen. Hacer esa cuenta en toda obra grande.
5. **Renovaciones como porcentaje del ingreso.** En AGE el 41 % del ingreso eran renovaciones — o
   sea que el negocio depende de que la obra efectivamente dure lo que dice.
6. **Verificar el bullet de renovación en el PDF generado** (§4.1).

---

# 9. Reglas comerciales

## Frente a la competencia

🔒 **No bajar el precio antes de ver el presupuesto del otro.** Decir "lo llevo a la dirección",
nunca "te lo mejoro". Prometer antes de ver fija un piso.

🔒 **Normalizar el metraje antes de comparar.** Con Gladys/Colman, la diferencia declarada del 29 %
se derrumbó al **4 %** al comparar los mismos metros.

🔒 **Una brecha mayor al 40 % no es precio, es alcance.** No se cierra con descuento: se cierra
rediseñando el alcance (sistema mixto, plazo más corto, montaje por etapas).

🧠 **Contraoferta declarada:** *mejoramos un 15 % los valores de la competencia contra presentación
de la cotización.* Usado en Elcano 3200.

🧠 **Cuando se conoce el número del competidor**, el objetivo es quedar **10 % por debajo**, tanto
en el primer período como en la renovación (San Cristóbal / Rivadavia 2450).

🔒 **Nunca descontar por sacar el respaldo técnico.** La documentación firmada está absorbida en
el precio como el flete o el seguro; no es un ítem separable. Si el alcance cambia, cambia el precio.

🔒 **Las concesiones van sobre el canon y condicionadas** (período firme con penalidad por baja
anticipada), nunca como porcentaje plano sobre el total.

## Forma de presentar

🔒 La **renovación siempre en pesos concretos** por período, como línea del presupuesto, no sólo
como porcentaje en las condiciones de abajo.

🔒 **La pantalla no se lista como ítem separado** cuando va integrada a la estructura: un solo
número claro de canon.

🔒 Lenguaje llano: *Qué se monta · Qué incluye · Qué está incluido en el precio*.

🔒 Cuando hay **etapas que no conviven**, cada renovación va por separado y se aclara por qué.

🔒 Al **reactivar una cotización vieja**: si la orden está en presupuesto o enviada, **se edita con el
mismo número** (editar_presupuesto) y se renueva la vigencia; se emite propuesta nueva y **se cancela
la anterior** sólo si está confirmada o cancelada, o si el vendedor lo pide. Nunca quedan dos
números vivos por la misma obra.

---

# 10. Registro de negociaciones

De cada obra que se pelea por precio conviene dejar anotado: cliente y contacto, obra, propuesta
enviada, concesión máxima ofrecida, razón declarada del rechazo, hipótesis propia y resultado final.

Repetido sobre 20 negociaciones, eso responde con datos preguntas que hoy se contestan por
intuición: cuánto se pierde por precio contra cuánto por alcance, qué tipo de obra es la más
cuestionada, y cuál es la diferencia promedio del competidor más barato.

🔒 **Regla de higiene asociada:** cuando el precio se aparta del tarifario, la razón va en la nota de
la orden en Odoo. Sin eso, el criterio no es recuperable después.

---

# 11. Lo que quedó sin resolver

| # | Tema | Dónde | Estado |
|---|---|---|---|
| 1 | **Fases con remobilización** | §2.1 | ⚠️ **Abierto.** ¿Valor completo por fase, o completo menos el alquiler ya cobrado? Marcar y preguntar en cada caso. |
| 2 | **Aplicación de la tarifa de julio** | §3.1 | ⚠️ En agosto 80 de 150 líneas de bandeja seguían a valor de mayo/junio. No es un problema de criterio sino de comunicación al equipo: usar siempre Parámetros. |
| 3 | **Umbrales de esbeltez contra IRAM 3691** | §6.1 | ⚠️ Los valores adoptados (4:1 fija, 3:1 móvil exterior) son criterio de cotización. Verificar contra la norma vigente y el manual del fabricante antes de usarlos en una memoria firmada. |
| 4 | **Repricing por CAC de propuestas viejas** | — | Pendiente a medida que la inflación compone. |
| 5 | **Fenólico 18 mm** | §3.3 | Valor estimado, no está en lista. Validar antes de usarlo en volumen. |
$crit$;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cotizacion_criterios WHERE version = 4) THEN
    IF NOT EXISTS (SELECT 1 FROM cotizacion_criterios WHERE version = 3 AND vigente AND md5(contenido) = 'f56ca60a3385ae2a011ec56b44993125') THEN
      RAISE EXCEPTION 'El criterio vigente no es el v3 esperado: no se crea la v4';
    END IF;
    UPDATE cotizacion_criterios SET vigente = false WHERE vigente;
    INSERT INTO cotizacion_criterios (version, contenido, notas, vigente, autor_id) VALUES
    (4, v4, 'Joaquín (12/10): §3 sólo reglas (sin casos ni valores de la época); §9 editar con el mismo número antes que re-emitir; «desglosado» = modelo D.', true, NULL);
    INSERT INTO cotizacion_parametros_cambios (clave, antes, despues, motivo, autor_id) VALUES
    ('criterio', jsonb_build_object('version', 3), jsonb_build_object('version', 4),
     'Auditoría del asistente (12/10): §3 sin casos de la época, §9 editar antes que re-emitir, «desglosado» = D.', NULL);
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
