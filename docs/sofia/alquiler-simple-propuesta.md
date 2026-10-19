# Alquiler simple que cotiza Tomás: propuesta

**Borrador del 18/10/2026, para que lo revisen JS y Tamara antes de programar.** Sale de lo que explicó JS el 18/10 y de lo que se cobró en Odoo desde mayo (unas 180 líneas de alquiler y 91 fletes). Lo marcado con ❓ está sin confirmar.

## 1. Qué es

Hoy, un tercio de los pedidos que llegan por WhatsApp son alquileres simples: el cliente retira o se lo llevamos, y lo arma él. Unos 145 chats terminaron en «te va a contactar ventas» y se perdieron por la demora.

La idea es que Tomás los atienda de punta a punta, como con la bandeja:
1. pregunta lo necesario;
2. aconseja qué conviene;
3. arma el presupuesto con reglas escritas;
4. **lo aprueba JS** con la misma tarjeta;
5. sale por WhatsApp.

Tomás no calcula estructuras. Lo que se sale de las reglas pasa a un vendedor.

## 2. Cómo es el andamio (lo que tiene que saber Tomás)

- **Módulo:** 2 bastidores, 2 riendas cortas (las horizontales) y 2 riendas largas (las diagonales). Mide **1,80 m de alto**.
- **Bastidores:** de **1,30 m** (el estándar) o de **0,90 m** (el de pasillo). Son siempre los mismos; no hay bastidores junior.
- **Largo:** **2,50 m**, o **1,50 m** el junior. En el junior cambian sólo las riendas (riendas JR) y los tablones.
- **Tablones:** son la plataforma. Miden **30 cm de ancho** y se ponen uno al lado del otro. Hay de 2,50 y de 1,50 m.
- **Ruedas:** un juego de 4, con horquilla giratoria y freno. Suman **15 cm** de alto.
- **Tornillones de regulación:** van en lugar de las ruedas si el piso es desparejo.
- **Módulo baranda:** va arriba de todo. Son 2 bastidores de baranda de **1 m** de alto y 2 riendas cortas, una de cada lado. **La baranda nunca es junior.**
- **Altura:** se apilan **hasta 3 módulos estándar (2,50 × 1,30) sin anclar**. Si hay que anclar, va a un vendedor.
- **Módulos en fila:** si el trabajo es largo, se ponen módulos uno al lado del otro y comparten un bastidor. **Se cobran como módulos independientes.**

## 3. Qué pregunta Tomás (en este orden y sin interrogatorio)

1. **Qué trabajo van a hacer y hasta qué altura tienen que llegar.** Si es adentro, también **la altura del techo**.
2. **Cuánto espacio tienen para el andamio:** el ancho y el largo libres en el piso.
3. **Cómo es el piso:** liso o desparejo (vereda rota, tierra, escalón).
4. **Dónde es** (para el flete) **y cuántos días.** Si lo retiran, el flete no va.
5. **Para cuándo lo necesitan.** La entrega es siempre **al día siguiente o después** (ver la §6).

Si el cliente ya sabe qué quiere («2 módulos con ruedas»), Tomás no repite las preguntas: chequea que lo que pide le sirva (la altura y el techo) y cotiza.

## 4. Cómo arma el andamio

**La altura.** Con ruedas, la plataforma queda a 15 cm más 1,80 m por cada módulo:

| Módulos | Plataforma | Llega a trabajar hasta (plataforma + 2 m) | Techo mínimo, para no golpearse la cabeza (plataforma + 1,90 m) |
|---|---|---|---|
| 1 | 1,95 m | ~3,95 m | 3,85 m |
| 2 | 3,75 m | ~5,75 m | 5,65 m |
| 3 | 5,55 m | ~7,55 m | 7,45 m |

- Tomás elige **la menor cantidad de módulos que llega**.
- Si es adentro, chequea que entre la cabeza. Si no entra, va a un vendedor (ver ❓5).
- Si tiene que llegar a más de ~7,5 m, hay que anclar y va a un vendedor.
- ❓ Confirmar los «+ 2 m» (lo que alcanza una persona parada) y el «+ 1,90 m» (cabeza y casco).

**El ancho y el largo**, según el espacio libre:
- ancho de 1,30 m o más: **estándar**; entre 0,90 y 1,30: **pasillo**; menos de 0,90: va a un vendedor;
- largo de 2,50 m o más: **2,50**; entre 1,50 y 2,50: **junior**; menos de 1,50: va a un vendedor;
- si necesita cubrir un largo mayor, se ponen varias torres en fila y cada una se cobra entera.

**Cada torre lleva:**
- los módulos apilados;
- **1 módulo baranda** arriba (Tomás siempre la aconseja);
- **piso completo de tablones arriba**: 4 en el estándar y 3 en el pasillo (❓ confirmar los 3; en Odoo a veces aparecen 2);
- **1 juego de ruedas**, o tornillones si el piso es desparejo.

En las órdenes de Odoo los tablones van sólo en el nivel de arriba: por ejemplo, S02365 tiene 3 módulos y 4 tablones.

## 5. Precios (+ IVA)

**Por pieza: módulo, módulo baranda o tablón.** Valen igual en el estándar, el pasillo y el junior:

| Días | Precio |
|---|---|
| Hasta 14 | $ 13.000 |
| 15 a 29 | $ 16.000 |
| 30 | $ 18.000 |
| Más de 30 | $ 18.000 por cada 30 días (❓ ¿y las fracciones? Propuesta: un mes o fracción) |

**Ruedas:** $ 30.000 el juego de 4, sin importar los días. ❓ En septiembre y octubre aparecen también $ 47.000 y $ 60.000: ¿subió?

**Tornillones:** ❓ en Odoo se cobraron $ 9.000, $ 17.500 y $ 19.375 cada uno. Propuesta: $ 9.000 cada uno, 4 por torre.

**Flete:** el de la lista por barrio de Odoo, **la tanda del 31/3/2026** (los métodos de envío 354 a 450). Va una sola línea por pedido. ❓ ¿Cubre la entrega y el retiro? Si el barrio no está en la lista, va a un vendedor.

**Mínimo operativo: $ 500.000 netos, con el flete adentro.** Si el material más el flete no llega, se agrega la línea «MÍNIMO OPERATIVO» por la diferencia, como ya se hace en Odoo.

Los precios van en Parámetros, no en el código. En Odoo los productos tienen precio de lista $ 1.

### Ejemplo

Pintar un cielorraso de 3,80 m en Palermo, adentro, piso liso, 30 días.

| | Cant. | Precio | Total |
|---|---|---|---|
| Módulo STD 1,30 × 2,50 × 1,80 | 1 | 18.000 | 18.000 |
| Módulo baranda STD | 1 | 18.000 | 18.000 |
| Tablón metálico 2,50 | 4 | 18.000 | 72.000 |
| Juego de ruedas (4 u.) | 1 | 30.000 | 30.000 |
| Flete Palermo | 1 | 140.400 | 140.400 |
| Mínimo operativo | 1 | | 221.600 |
| **Total** | | | **$ 500.000 + IVA** |

La plataforma queda a 1,95 m: llega a ~3,95 m y la cabeza entra justo (3,80 − 1,95 = 1,85 m, ❓ apenas por debajo de 1,90).

## 6. Condiciones que Tomás siempre explica (JS, 18/10)

**La entrega es de un día para el otro, nunca el mismo día.**
- Tomás lleva al cliente a recibirlo al día siguiente o más adelante.
- Si el cliente lo necesita sí o sí en el día, **pasa automáticamente a un vendedor**.

**Los requisitos para alquilar:**
- **foto del DNI, de frente y de dorso;**
- **dos servicios a su nombre** (luz, gas, agua, internet…), o uno si no tiene dos;
- Tomás **verifica que la dirección del DNI coincida con la de los servicios**. Si no coincide, **avisa** (❓ ¿al cliente, al equipo o a los dos?);
- Tomás no repite por escrito el número de DNI ni los datos de los servicios, sólo confirma que los recibió.

**Tiene que haber gente para cargar y descargar.** El material va con un chofer que, por el seguro, no puede entrar a ningún domicilio: lo deja en la puerta, y del lado del cliente tiene que haber quien baje y suba los equipos.

**El retiro se pide con un día de anticipación como mínimo.**
- No se retira en el mismo día en que avisan.
- **Si llega la fecha de vencimiento y el cliente no avisó, el alquiler sigue corriendo** (❓ ver cómo se cobra en la §9).

Cómo lo dice Tomás: claro y amable, como información útil y no como una advertencia. Por ejemplo: «Te cuento cómo funciona: te lo llevamos mañana; el chofer lo deja en la puerta, así que tiene que haber alguien para bajarlo. Para el retiro, avisanos con un día de anticipación; si no, el alquiler sigue corriendo». Las condiciones van también en el presupuesto.

## 7. Cómo vende Tomás

JS quiere que Tomás sea un excelente vendedor: que el cliente quiera alquilar.

- **Aconseja, no impone.** Arma la opción recomendada y explica en una línea por qué, pensando en el cliente: «Te sumé la baranda: arriba vas a estar a casi 2 m y es lo que te cuida si das un paso atrás».
- **Siempre aconseja la baranda y el piso completo de tablones.** Si el cliente no quiere la baranda, Tomás insiste una vez con buenos modos. ❓ ¿Se cotiza sin baranda si el cliente insiste? Propuesta: con 1 módulo sí, con 2 o más no.
- **Usa el mínimo a favor del cliente.** Si el pedido no llega a $ 500.000, se lo dice de frente y le muestra qué le entra sin costo extra: más días, otra torre o el piso completo. Ejemplo: «El mínimo es $ 500.000 + IVA con el flete. Con eso te alcanza para tenerlo el mes entero en vez de una semana».
- **Resuelve dudas de uso con lo que sabe:** cuánto alcanza, si entra, ruedas o tornillones.
- **No inventa:** lo que no está en estas reglas lo pregunta al equipo o lo pasa a un vendedor.
- **Cierra con un paso concreto:** «¿Te lo reservo para el lunes?». La aprobación de JS va por detrás, y el cliente no espera más que unos minutos.
- **Siempre «+ IVA».**

## 8. Cuándo NO es fácil (va a un vendedor)

- lo necesitan para el mismo día;
- hay que anclar, o la altura de trabajo pasa de ~7,5 m;
- el techo no deja pararse con el módulo que hace falta;
- el espacio mide menos de 0,90 m de ancho o de 1,50 m de largo;
- el barrio no está en la lista de fletes;
- piden piezas que no están en la sección 2 (puntales, caños, nudos, paso peatonal, escalera, ménsulas);
- piden montaje;
- ❓ más de **10 módulos** en total (la orden más grande con flete por barrio tuvo 10);
- las reglas que ya existen: palabras de alerta, deuda (F7) o gama alta.

## 9. Lo que falta confirmar (❓)

1. Los márgenes de altura: alcance plataforma + 2 m, cabeza plataforma + 1,90 m.
2. Cuántos tablones lleva el pasillo de 0,90: ¿3?
3. ¿El flete por barrio cubre la entrega y el retiro?
4. El precio de las ruedas ($ 30.000 o más) y el de los tornillones.
5. **Techos bajos:** con 1 módulo y ruedas, hace falta un techo de 3,85 m para pararse. Si el techo es de 3 m, ¿se pueden poner los tablones más abajo dentro del bastidor, o se usa sin ruedas, o va a un vendedor?
6. El pasillo de 0,90 y el junior: ¿también hasta 3 de alto sin anclar, o menos por ser más angostos?
7. Más de 30 días: ¿mes o fracción?
8. ¿Se cotiza sin baranda si el cliente insiste?
9. El tope de cantidad para que salga solo (propuesta: 10 módulos).
10. ¿Cuánto mide la rienda JR diagonal: 1,65 m (como dice Odoo) o 1,77 m?
11. **Los documentos:**
    - ¿se piden en todos los alquileres, o no a una empresa con CUIT ni a un cliente que ya alquiló?
    - ¿en qué momento? Propuesta: cuando el cliente acepta el presupuesto, antes de confirmar la entrega. Sin documentos no se entrega;
    - ¿dónde se guardan? Propuesta: adjuntos en la orden de Odoo, no en la charla;
    - si la dirección no coincide, ¿qué hace Tomás: lo avisa al equipo y sigue, o el alquiler queda frenado hasta que alguien lo revise?
12. **Si vence y no avisaron:** ¿cómo se cobra lo que sigue corriendo? ¿Por día, por semana, o por otro mes entero? En Odoo aparece «RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)».
13. **El aviso para el retiro:** ¿a qué número llaman o escriben: a este mismo WhatsApp o al 11 2734-4214? ¿Hay días u horarios en que no se entrega ni se retira (sábados, domingos, feriados)?

## 10. Qué hay que programar (después del ok)

- **Las reglas y el cálculo:** `src/lib/clientes/alquiler-simple.ts`, con la altura, las torres, las piezas, el precio por tramo, el flete por barrio y el mínimo, más los tests con los casos de arriba.
- **La herramienta de Tomás:** `cotizar_alquiler_simple`, que devuelve el detalle y si salió fácil, y un bloque de la guía de venta en el prompt.
- **El flete:** leerlo de Odoo (los métodos de envío 354 a 450) por el barrio de la dirección, que ya se geocodifica.
- **La tarjeta de aprobación:** la misma de la bandeja. Al aprobar, crea la orden en Odoo con los productos de alquiler y las fechas, el método de envío del barrio y la línea de mínimo operativo si hace falta.
- **Parámetros:** los precios por tramo, las ruedas, los tornillones, el mínimo y el tope de módulos.
- **La fecha de entrega:** nunca hoy; si piden para hoy, se deriva sola. La fecha y el período van en la orden.
- **Los documentos:** Tomás ya recibe imágenes por WhatsApp. Hace falta un paso «documentación», en el que lee las fotos, compara la dirección del DNI con la de los servicios y deja la marca «coincide» o «no coincide» en la ficha y en la tarjeta. Las fotos se guardan con acceso restringido.
- **Las condiciones** (la entrega en la puerta, el retiro con un día de anticipación, el alquiler que sigue corriendo) van en el prompt de Tomás y en el texto del presupuesto.
