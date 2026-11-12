# Alquiler simple que cotiza Tomás: propuesta

**Borrador del 18/10/2026, cerrado con JS el 12/11/2026.** Sale de lo que explicó JS el 18/10, de lo que se cobró en Odoo desde mayo (unas 180 líneas de alquiler y 91 fletes) y de las preguntas que contestó JS el 12/11 (§11, filas 1 a 15). El 12/11 a la tarde JS sumó seis decisiones más (filas 16 a 21): sólo se entrega en CABA, el retiro en el depósito, Belgrano, el peldaño en cualquier módulo, la vendedora y el pagaré. Está programado en la rama `feat/alquiler-simple` (§10).

## 1. Qué es

Hoy, un tercio de los pedidos que llegan por WhatsApp son alquileres simples: el cliente retira o se lo llevamos, y lo arma él. Unos 145 chats terminaron en «te va a contactar ventas» y se perdieron por la demora.

La idea es que Tomás los atienda de punta a punta, como con la bandeja:
1. pregunta lo necesario;
2. aconseja qué conviene;
3. arma el presupuesto con reglas escritas;
4. **lo aprueba JS** con la misma tarjeta;
5. sale por WhatsApp;
6. cuando el cliente acepta, le pide los documentos (§6).

Se lo llevamos (sólo en CABA) o lo retira el cliente en el depósito (§6).

Tomás no calcula estructuras. Lo que se sale de las reglas pasa a un vendedor.

## 2. Cómo es el andamio (lo que tiene que saber Tomás)

La ficha técnica está en [ficha-tecnica-bastidor.png](./ficha-tecnica-bastidor.png) (FT-01).

- **Módulo:** 2 bastidores, 2 riendas cortas (horizontales o longarines) y 2 riendas largas (diagonales o cruces). Mide **1,80 m de alto**.
- **Bastidores:** de **1,30 m** (el estándar) o de **0,90 m** (el angosto o de pasillo). Tienen una **escalera propia** de un lado, con peldaños a unos **0,40, 0,80 y 1,20 m**.
- **Largo:** **2,50 m**, o **1,50 m** el junior. En el junior cambian sólo las riendas y los tablones: longarín de 1,50 y diagonal de **1,77 m** (la estándar mide 2,77 m; Odoo dice 1,65 y está mal). Hay junior de 1,30 y de 0,90 de ancho.
- **Tablones:** son la plataforma. Miden **30 cm de ancho** y 7 cm de alto, y se ponen uno al lado del otro. Hay de 2,50 y de 1,50 m.
- **Ruedas:** un juego de 4, con horquilla giratoria y freno. Suman **15 cm** de alto.
- **Tornillones (bases regulables, husillos de 600 mm):** van en lugar de las ruedas si el piso es desparejo.
- **Módulo baranda:** va arriba de todo. Son 2 bastidores de baranda de **1 m** de alto (de 1,30 o de 0,90) y 2 riendas cortas.
- **Carga admisible:** 200 kg/m².
- **Altura:** se apilan **hasta 3 módulos sin anclar**, en el estándar, el angosto y el junior. Si hay que anclar, va a un vendedor.
- **Módulos en fila:** si el trabajo es largo, se ponen módulos uno al lado del otro y comparten un bastidor. **Se cobran como módulos independientes.**

## 3. Qué pregunta Tomás (en este orden y sin interrogatorio)

1. **Qué trabajo van a hacer y hasta qué altura tienen que llegar.** Si es adentro, también **la altura del techo**.
2. **Cuánto espacio tienen para el andamio:** el ancho y el largo libres en el piso.
3. **Cómo es el piso:** liso o desparejo (vereda rota, tierra, escalón).
4. **Dónde es**, para el flete. **Sólo se entrega y se retira en CABA** (JS, 12/11, fila 16): si la obra está en provincia, no hay flete y Tomás le ofrece **retirarlo en el depósito** (§6). Un cliente de CABA también lo puede elegir; si dice desde el principio que lo pasa a buscar, no hace falta la dirección.
5. **Para cuándo lo necesitan.** La entrega (o el retiro en el depósito) es siempre **al día siguiente o después**, en las franjas de la §6.

No pregunta cuántos días: se cotiza siempre el servicio de 30 días (§5).

Si el cliente ya sabe qué quiere («2 módulos con ruedas»), Tomás no repite las preguntas: chequea que lo que pide le sirva (la altura y el techo) y cotiza.

## 4. Cómo arma el andamio

**La altura (confirmado por JS el 12/11).** Una persona parada trabaja cómoda hasta **la plataforma + 2 m**, y para no golpearse la cabeza necesita **la plataforma + 1,90 m** de techo (con casco). Con ruedas, la plataforma queda a 15 cm más 1,80 m por cada módulo:

| Módulos | Plataforma | Llega a trabajar hasta | Techo mínimo |
|---|---|---|---|
| 1 | 1,95 m | ~3,95 m | 3,85 m |
| 2 | 3,75 m | ~5,75 m | 5,65 m |
| 3 | 5,55 m | ~7,55 m | 7,45 m |

**Dónde va la plataforma (JS, 12/11, fila 19).** Hay dos lugares posibles, siempre con la base de 0,15 m (ruedas o tornillones) y hasta 3 módulos:
- **arriba de un módulo**, con el piso completo de tablones y la baranda (la tabla de arriba);
- **como alternativa, un tablón apoyado en un peldaño** de la escalera del bastidor, **en cualquier módulo**. Los peldaños están a unos 0,40, 0,80 y 1,20 m desde abajo de cada módulo: en el segundo módulo, el de 0,80 queda a 0,15 + 1,80 + 0,80 = 2,75 m. Esa plataforma es de **un solo tablón, de 30 cm**, y Tomás se lo aclara.

Cómo elige:
- **Trabajo hasta una altura** (una pared, afuera o adentro): **la menor cantidad de módulos que llega con la cabeza adentro**. Con esa cantidad, arriba si entra la cabeza; si no, el peldaño más alto del módulo de arriba que deja entrar la cabeza y llega.
- **Trabajo en el techo** (el cielorraso): **la plataforma más alta que deja entrar la cabeza** (plataforma + 1,90 ≤ techo). Si la de arriba de un módulo ya llega al techo, va esa; el peldaño, cuando acerca más al techo. Ejemplo: con un techo de 5 m, arriba de 1 módulo llega a ~3,95 m, y el peldaño de 0,80 del segundo módulo (2,75 m) llega a ~4,75 m: va el peldaño.
- Si la plataforma **no llega cómodo al techo** (plataforma + 2 m a más de 10 cm del techo), **se cotiza igual**: Tomás le aclara a qué altura queda la plataforma y hasta dónde llega a trabajar cómodo, para que lo confirme. **Ya no va a un vendedor por quedar a más de 50 cm** (era una decisión de Claude, que JS cambió).
- **A un vendedor va sólo lo que no tiene ninguna plataforma posible** (un techo de menos de 2,45 m, o una pared en que la plataforma que deja entrar la cabeza no llega) o hay que anclar: más de ~7,5 m.

Ejemplo del techo bajo: con un techo de 3 m, el peldaño de 0,80 del primer módulo deja la plataforma a 0,95 m; la cabeza entra (2,85 m) y llega hasta ~2,95 m.
- Si la plataforma que se le aclaró no le sirve, **pasa a un vendedor**. Tomás **no menciona el alquiler de escaleras**.
- **El peldaño se cobra igual que con la plataforma arriba** (JS, 12/11): el módulo completo, con la baranda, el piso de tablones y las ruedas.

**El ancho y el largo**, según el espacio libre:
- ancho de 1,30 m o más: **estándar**; entre 0,90 y 1,30: **angosto**; menos de 0,90: va a un vendedor;
- largo de 2,50 m o más: **2,50**; entre 1,50 y 2,50: **junior**; menos de 1,50: va a un vendedor;
- si necesita cubrir un largo mayor, se ponen varias torres en fila y cada una se cobra entera.

**Cada torre lleva:**
- los módulos apilados;
- **1 módulo baranda** arriba, **siempre incluido en el precio** (§7);
- **piso completo de tablones arriba**: **4 en el estándar (1,30) y 3 en el angosto (0,90)** (JS, 12/11);
- **1 juego de ruedas**, o tornillones si el piso es desparejo.

En las órdenes de Odoo los tablones van sólo en el nivel de arriba: por ejemplo, S02365 tiene 3 módulos y 4 tablones.

## 5. Precios (+ IVA)

**Al cliente se le pasa un solo precio: el servicio completo por 30 días, con la entrega y el retiro incluidos (JS, 12/11)**, o retirándolo en el depósito. No se le manda el precio desglosado. El detalle por pieza queda en la orden de Odoo.

**Siempre 30 días.** Aunque el cliente lo necesite por una semana, se cotiza el servicio de 30 días. Los tramos más baratos por pieza (hasta 14 días y de 15 a 29) no se usan.

**Cómo se arma el precio** (para la orden de Odoo; los precios van en Parámetros, no en el código):

| | Precio |
|---|---|
| Módulo, módulo baranda o tablón (estándar, angosto o junior) | $ 18.000 por pieza, por 30 días |
| Ruedas | $ 36.000 el juego de 4 ($ 9.000 cada una) |
| Tornillones | $ 36.000 los 4 ($ 9.000 cada uno) |
| Flete | el de la lista por barrio de Odoo |

- **El flete** es el de la tanda del 31/3/2026 (los métodos de envío 354 a 450) y **cubre la entrega y el retiro** (JS, 12/11): va una sola línea por pedido. **Sólo los 51 barrios de CABA de la lista**: los 46 métodos de localidades del conurbano no se usan (fila 16). Si el barrio no está en la lista, va a un vendedor.
- **Belgrano a secas** (USIG dice sólo «Belgrano») se cobra siempre **BELGRANO C**, el más caro (130.800; BELGRANO R sale 124.200) (fila 16).
- **Si retira en el depósito** (fila 17): no hay flete, pero el **mínimo operativo se cobra igual**: todo es material + mínimo. En el ejemplo de abajo, 162.000 de material y 338.000 de mínimo: $ 500.000 + IVA. Sin recargo de franja.
- **Mínimo operativo: $ 500.000 netos, con el flete adentro.** Si el material más el flete no llega, se agrega la línea «MÍNIMO OPERATIVO» por la diferencia, como ya se hace en Odoo.
- En Odoo los productos tienen precio de lista $ 1: el precio lo escribe la orden.

**Más de 30 días: proporcional al total con el flete (JS, 12/11).** Si el cliente lo quiere más tiempo, la renovación es el total del servicio ÷ 30 × los días de más. **La renovación no lleva el recargo de la franja de una hora** (fila 21): el recargo paga una entrega a una hora fija, no el alquiler.

**Si se vence y no avisaron, el alquiler sigue corriendo y se cobra igual, por día:** el total con el flete ÷ 30 por cada día. En Odoo va como «RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)».

### Ejemplo

Pintar una pared de patio hasta 5 m en Palermo, piso liso, espacio de sobra.

Con 1 módulo llega a ~3,95 m: no alcanza. Con **2 módulos** llega a ~5,75 m.

| | Cant. | Precio | Total |
|---|---|---|---|
| Módulo STD 1,30 × 2,50 × 1,80 | 2 | 18.000 | 36.000 |
| Módulo baranda STD | 1 | 18.000 | 18.000 |
| Tablón metálico 2,50 | 4 | 18.000 | 72.000 |
| Juego de ruedas (4 u.) | 1 | 36.000 | 36.000 |
| Flete Palermo (entrega y retiro) | 1 | 140.400 | 140.400 |
| Mínimo operativo | 1 | | 197.600 |
| **Total** | | | **$ 500.000 + IVA** |

Lo que lee el cliente: «El servicio completo por 30 días, con la entrega y el retiro, sale $ 500.000 + IVA». Si después lo quiere 10 días más: $ 500.000 ÷ 30 × 10 = $ 166.667 + IVA.

## 6. Condiciones que Tomás siempre explica (JS, 18/10 y 12/11)

JS pidió que Tomás las explique siempre y bien: son lo que evita problemas después. Hay dos modalidades: **se lo llevamos** (sólo en CABA) o **lo retira en el depósito** (más abajo). Las condiciones son distintas.

**Sólo en CABA (fila 16).** No se entrega ni se retira fuera de CABA. Si la obra está en provincia, Tomás le ofrece retirarlo en el depósito; si no puede, no es un alquiler simple (lo ve una persona).

**La entrega es de un día para el otro, nunca el mismo día.**
- Tomás lleva al cliente a recibirlo al día siguiente o más adelante.
- Si el cliente lo necesita sí o sí en el día, **pasa automáticamente a un vendedor**.

**Los días y los horarios de entrega y retiro:**
- de lunes a viernes, en una de dos franjas: **de 8 a 12** o **de 13 a 16**;
- los sábados, **sólo de 8 a 12**;
- **domingos y feriados no** se entrega ni se retira;
- Tomás aclara que la hora exacta dentro de la franja **depende del recorrido de las camionetas**;
- **si el cliente necesita un horario particular,** se le ofrece pactar **una franja de una hora con un recargo del 20 %**, y Tomás explica que es **por los costos operativos**. El 20 % se calcula **sobre el total del servicio** (JS, 12/11): en el ejemplo de la §5, $ 100.000 + IVA. Así nunca se pierde un alquiler por el horario.

**Tiene que haber gente para cargar y descargar.**
- En la entrega, el cliente tiene que tener gente para **bajar** el material del camión.
- En el retiro, los andamios tienen que estar **desarmados**, y el cliente tiene que tener gente para **subirlos** al camión.
- **Por qué:** por un tema de seguros, **los choferes no pueden entrar a los domicilios.** No tienen un seguro que cubra roturas o daños. Tomás lo explica así, como el motivo por el que sí o sí tiene que haber gente.

**El retiro se coordina con 24 h de anticipación como mínimo.**
- El cliente avisa **a este mismo WhatsApp**: Tomás lo anota y avisa al equipo (JS, 12/11).
- No se retira en el mismo día en que avisan.
- **Si llega la fecha y el cliente no avisó, el alquiler sigue corriendo** y se cobra por día (§5).

**Los documentos (JS, 12/11).**
- Se piden **a todos, sin excepción** (también a empresas y a clientes que ya alquilaron).
- **Primero el precio, después los requisitos:** Tomás los pide cuando el cliente acepta el presupuesto. **Sin los documentos no se entrega.**
- Son la **foto del DNI, de frente y de dorso**, y **dos servicios** a su nombre (luz, gas, agua, internet…), o uno si no tiene dos.
- **Los servicios dicen dónde vive hoy el cliente.** Si la dirección del DNI no coincide con la de los servicios, **se acepta igual**: muchos se mudaron y no actualizaron el DNI. La dirección que queda registrada es la de los servicios.
- Las fotos se guardan **adjuntas a la orden de Odoo**.
- Tomás no repite por escrito el número de DNI ni los datos de los servicios, sólo confirma que los recibió.

**El retiro en el depósito (JS, 12/11, fila 17).** Lo puede elegir cualquier cliente, y es la única opción en provincia.
- El depósito está en **Maturín 2570 (CABA)**.
- Se retira y se devuelve **cualquier día hábil** (de lunes a viernes, no feriados) **de 10 a 12 o de 13 a 16**: de 12 a 13 el depósito para.
- El retiro y la devolución se coordinan con **24 h de anticipación**, por este mismo WhatsApp. Las mismas validaciones de fecha: nunca el mismo día.
- **No hay chofer ni camión**: el cliente viene con su vehículo y con gente para cargar.
- **La devolución, desarmado**, en el depósito, con 24 h de aviso. Si no avisa, el alquiler sigue corriendo por día.
- Sin flete, con el mínimo operativo (§5), y **sin franja de una hora ni recargo**.
- En Odoo, la orden va **sin línea de flete ni método de envío**, y la dirección de la obra dice «RETIRA DE MATURÍN 2570 - DEPÓSITO ANDAMIOS BUENOS AIRES», como marca hoy Tamara las que retiran (ver [alquiler-simple-odoo.md](./alquiler-simple-odoo.md)).

**El pagaré (fila 20).** Tomás no lo pide ni lo nombra: es gestión administrativa. Al cliente le pide sólo el DNI y los servicios.

Cómo lo dice Tomás: claro y amable, como información útil y no como una advertencia. Por ejemplo: «Te cuento cómo funciona: te lo llevamos mañana entre las 8 y las 12, según el recorrido de la camioneta. Por el seguro, el chofer no puede entrar, así que tiene que haber alguien para bajarlo. Para el retiro, avisanos por acá con 24 h de anticipación y tenelo desarmado; si no avisás, el alquiler sigue corriendo». Las condiciones van también en el presupuesto.

## 7. Cómo vende Tomás

JS quiere que Tomás sea un excelente vendedor: que el cliente quiera alquilar.

- **Aconseja, no impone.** Arma la opción recomendada y explica en una línea por qué, pensando en el cliente: «Te incluí la baranda: arriba vas a estar a casi 2 m y es lo que te cuida si das un paso atrás».
- **La baranda va siempre en el precio (JS, 12/11).** Si el cliente no la quiere, no se le lleva, pero **se cobra igual**. Tomás no la negocia: el precio es el mismo con o sin baranda.
- **Siempre el piso completo de tablones.**
- **Usa el mínimo a favor del cliente.** Si el material no llega a $ 500.000, se lo dice de frente y le muestra qué le entra sin costo extra: otra torre, un módulo más de alto o el piso completo. Ejemplo: «El mínimo es $ 500.000 + IVA con la entrega y el retiro; con eso te entra una segunda torre sin pagar más».
- **Resuelve dudas de uso con lo que sabe:** cuánto alcanza, si entra, ruedas o tornillones.
- **No inventa:** lo que no está en estas reglas lo pregunta al equipo o lo pasa a un vendedor.
- **Cierra con un paso concreto:** «¿Te lo reservo para el lunes a la mañana?». La aprobación de JS va por detrás, y el cliente no espera más que unos minutos.
- **Siempre «+ IVA».**

## 8. Cuándo NO es fácil (va a un vendedor)

- lo necesitan para el mismo día;
- hay que anclar, o la altura de trabajo pasa de ~7,5 m;
- no hay ninguna plataforma posible (el techo no deja pararse, ni con un tablón en el peldaño más bajo, o en una pared la plataforma que deja entrar la cabeza no llega), o el cliente no acepta la que se le aclaró (fila 19);
- el espacio mide menos de 0,90 m de ancho o de 1,50 m de largo;
- el barrio de CABA no está en la lista de fletes;
- la obra está en provincia y no puede retirarlo en el depósito (fila 16);
- piden piezas que no están en la sección 2 (puntales, caños, nudos, paso peatonal, escalera, ménsulas);
- piden montaje;
- **más de 10 módulos** en total, sumando todas las torres y sin contar las barandas (JS, 12/11);
- las reglas que ya existen: palabras de alerta, deuda (F7) o gama alta.

## 9. Lo que falta confirmar

Nada: las dos dudas que quedaban las contestó JS el 12/11 (filas 14 y 15 de la §11).

Supuesto de Claude, sin confirmar: los dos servicios tienen que tener la misma dirección entre sí.

Para confirmar con JS (12/11 a la tarde): en Odoo, las órdenes que hoy retiran en el depósito dicen «RETIRA DE CUCHA CUCHA 2345» en la dirección de la obra (S03008, S02929, S02769, S01563). ¿El depósito de retiro es Maturín 2570, como dijo JS, o siguen los dos? El código usa Maturín 2570.

## 10. Qué hay que programar

- **Las reglas y el cálculo:** `src/lib/clientes/alquiler-simple.ts`, con la altura (la plataforma arriba o un tablón en un peldaño de cualquier módulo), la modalidad (envío en CABA o retiro en el depósito), las torres, las piezas, el precio de 30 días, el flete por barrio, el mínimo y la renovación proporcional, más los tests con los casos de arriba.
- **La herramienta de Tomás:** `cotizar_alquiler_simple`, que devuelve el total para el cliente, el detalle para Odoo y si salió fácil, y un bloque de la guía de venta en el prompt.
- **El flete:** leerlo de Odoo (los métodos de envío 354 a 450, sólo los barrios de CABA) por el barrio de la dirección, que ya se geocodifica. En provincia no hay flete.
- **La tarjeta de aprobación:** la misma de la bandeja. Al aprobar, crea la orden en Odoo con los productos de alquiler y las fechas, el método de envío del barrio (o nada, si retira en el depósito), la línea de mínimo operativo si hace falta y siempre a nombre de Tamara.
- **Parámetros:** el precio por pieza, las ruedas, los tornillones, el mínimo, el tope de módulos y el recargo por horario.
- **La fecha y la franja de entrega:** nunca hoy (si piden para hoy, se deriva sola); ni domingos ni feriados; los sábados sólo de 8 a 12. La fecha, la franja y el período van en la orden.
- **Los documentos:** Tomás ya recibe imágenes por WhatsApp. Hace falta un paso «documentación», después de que el cliente acepta: pide las fotos, lee de los servicios la dirección actual, la deja en la ficha y en la tarjeta, y adjunta las fotos a la orden de Odoo. En la bandeja se guardan con acceso restringido.
- **El aviso de retiro:** cuando el cliente escribe para el retiro, Tomás lo anota en la charla y avisa al equipo.
- **Las condiciones** (las franjas, la gente para cargar y descargar, el seguro de los choferes, el retiro con 24 h y desarmado, el alquiler que sigue corriendo) van en el prompt de Tomás y en el texto del presupuesto.

## 11. Lo que decidió JS el 12/11

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Márgenes de altura | Plataforma + 2 m para trabajar; plataforma + 1,90 m de techo para la cabeza |
| 2 | Tablones del angosto | Piso completo: 4 en el de 1,30 y 3 en el de 0,90 |
| 3 | ¿El flete cubre ida y vuelta? | Sí: la lista de Odoo cubre la entrega y el retiro |
| 4 | Ruedas y tornillones | $ 36.000 el juego de 4, los dos ($ 9.000 por unidad) |
| 5 | Techo bajo | Como excepción, 1 tablón en un peldaño de la escalera del bastidor (0,40 / 0,80 / 1,20 m). Si no le sirve, a un vendedor; no se ofrecen escaleras |
| 6 | Angosto y junior apilados | Hasta 3 sin anclar, igual que el estándar |
| 7 | Más de 30 días | Siempre se cotiza el servicio de 30 días con flete, en un solo precio, aunque lo use menos. Lo que pasa de 30 días es proporcional al total con el flete |
| 8 | Sin baranda | La baranda va siempre en el precio; si el cliente no la quiere, no se lleva pero se cobra igual |
| 9 | Tope para que salga solo | 10 módulos |
| 10 | Rienda JR diagonal | 1,77 m (ficha técnica FT-01) |
| 11 | Documentos | A todos, sin excepción; primero el precio y después los requisitos; adjuntos en la orden de Odoo; si el DNI no coincide se acepta, porque los servicios dicen dónde vive hoy |
| 12 | Si vence sin aviso | Sigue corriendo, por día, proporcional al total con el flete. Tomás tiene que explicar siempre las condiciones de la §6 |
| 13 | Aviso de retiro y días | A este mismo WhatsApp. Ni domingos ni feriados; sábados de 8 a 12; de lunes a viernes, de 8 a 12 o de 13 a 16; una franja de una hora con un 20 % de recargo |
| 14 | La plataforma en un peldaño, ¿se cobra igual? | Sí, igual que el módulo completo |
| 15 | El recargo del 20 % por la franja de una hora | Sobre el total del servicio |
| 16 | ¿Hasta dónde se entrega? ¿Y Belgrano? | Sólo en CABA: no se entrega ni se retira en provincia, y los métodos de envío de localidades del conurbano no se usan. En provincia, Tomás ofrece retirarlo en el depósito. Belgrano a secas se cobra siempre BELGRANO C (el más caro) |
| 17 | Retiro en el depósito | Modalidad nueva, también para clientes de CABA. Maturín 2570 (CABA), días hábiles de 10 a 12 y de 13 a 16 (de 12 a 13 para), retiro y devolución con 24 h de aviso, nunca el mismo día. Sin flete, con el mínimo operativo de $ 500.000. Sin chofer ni camión: viene con su vehículo y gente para cargar; devuelve desarmado. Sin recargo de franja |
| 18 | Vendedor de las órdenes de Tomás | Siempre Tamara (res.users 73), no la pareja del turno |
| 19 | La plataforma en un peldaño, ¿sólo en el primer módulo? | En cualquier módulo, como alternativa: «no tiene que ir a ningún vendedor salvo que sea algo complejo». En el techo, la plataforma más alta que deja entrar la cabeza; si no llega cómodo, se cotiza y se le aclara para que lo confirme. A un vendedor, sólo si no hay ninguna plataforma posible o hay que anclar |
| 20 | El pagaré de la plantilla | Tomás no lo pide: es gestión administrativa |
| 21 | ¿La renovación por día lleva el recargo de franja? | No (ya estaba así) |
