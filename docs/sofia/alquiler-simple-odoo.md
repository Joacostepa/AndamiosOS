# Alquiler simple en Odoo: lo que hay y cómo lo usa Tomás

**12/11/2026.** Lo relevó Claude en Odoo, sólo leyendo, para programar la §10 de [alquiler-simple-propuesta.md](./alquiler-simple-propuesta.md). El código está en `src/lib/odoo/alquiler-simple.ts`, con tests en `alquiler-simple.test.ts`.

Se miraron las **117 órdenes con contrato «Simple» desde mayo de 2026**: 83 confirmadas, 32 en borrador y 2 canceladas. De esas, 92 son de Tamara, 16 de Rocío, 7 de JS y 2 de Agustina. En detalle se revisaron S02365, S02997, S03023, S03026, S02761 y S02872.

## 1. Cómo es una orden de alquiler simple hoy

**Es una orden del módulo Alquiler de Odoo, no una venta común.** Tiene `is_rental_order` y el período en `rental_start_date` y `rental_return_date`, guardados en UTC. Las líneas no guardan las fechas: `start_date` y `return_date` se calculan de la orden.

| Campo de `sale.order` | Lo que tiene | Lo que pone Tomás |
|---|---|---|
| `x_studio_tipo_de_contrato` | `"Simple"` | igual |
| `is_rental_order` | `true` | igual |
| `rental_start_date` / `rental_return_date` | entrega y fin, a la misma hora; S03023 va del 12/11 al 12/12 | entrega a la hora en que empieza la franja; fin = entrega + 30 días, a la misma hora |
| `carrier_id` | el método de envío del barrio | el de la tanda nueva (§3) |
| `x_studio_horario_entrega` | un desplegable: `08:00 - 12:00`, `09:00 - 13:00`, `10:00 - 14:00`, `13:00 - 16:00`, `08:00 - 17:00` | la franja de la mañana o la de la tarde; la franja de una hora no está en la lista y queda vacío |
| `x_direccion_obra` | la dirección de entrega | la de los servicios del cliente (§6) |
| `x_obra_provincia` | «Ciudad Autónoma de Buenos Aires» o «Buenos Aires», y muchas veces vacío | igual |
| `origin` | «NOMBRE - SIMPLE» | igual |
| `user_id` / `team_id` | Tamara (73) / Sales (1) | siempre Tamara (73), decisión de JS del 12/11 (`VENDEDORA_ALQUILER_SIMPLE` en `aprobar.ts`) |
| `tag_ids` | la etiqueta `crm.tag` 4 «SIMPLE» (en la mayoría) | igual |
| `sale_order_template_id` | 9 «Plantilla Simples» | **no se asigna**; se copia su texto (ver §5) |
| `note` | las condiciones de la plantilla: alquiler sin montaje, retiro con 24 h, gente para cargar y pagaré de $ 2.500.000 | el texto de la plantilla 9, leído de Odoo |
| `validity_date` | 15 días (`number_of_days` de la plantilla) | hoy + 15 |
| `payment_term_id` | vacío en 110 de las 117 | vacío |
| `opportunity_id` | «Propuesta S0xxxx — CLIENTE — dirección — fecha» | lo vincula quien llama, con `vincularOportunidad` de `presupuestos.ts` |
| `x_asistente_ref` | vacío (es la marca del asistente comercial) | la marca de idempotencia, por ejemplo `tomas-as:<id de la cotización>` |

`x_studio_estado_de_obra` es obligatorio, pero Odoo lo completa solo con «Pendiente de Armado», como en las órdenes del asistente.

**Las líneas**, en el orden de la plantilla (S03023):

```
MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80          4 × 40.000   is_rental
  del 12/11/2026 09:00 al 12/12/2026 09:00
TABLON METALICO 2.50 m                            4 × 30.000   is_rental
JUEGO DE RUEDAS DE ANDAMIO STANDARD (4 U)         1 × 40.000   is_rental
MODULO BARANDA DE ANDAMIO STD 1,30 X 2,50 X 1,80  1 × 40.000   is_rental
CABALLITO                                         1 × 140.000  is_rental + is_delivery (producto 2)
```

- Cada pieza lleva en la descripción el nombre del producto y, abajo, el período en hora argentina.
- **El flete** va en una sola línea con el producto 2, «[Delivery_007] Envío estándar (flete)». Lleva `is_delivery` y el nombre del barrio como descripción, y además la orden tiene `carrier_id`. En algunas órdenes la descripción es la del producto con el período: son fletes cargados a mano.
- **El mínimo operativo** es otra línea de alquiler, por la diferencia hasta $ 500.000 (S02365: 257.000).
- **En las órdenes reales todas las líneas tienen `is_rental`, el flete también.** Tomás hace lo mismo.
- IVA 88 en todas las líneas.

**La renovación** (más de 30 días, o vencida sin aviso) va en la **misma orden**, ya confirmada. Se agrega una línea «RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)» por el monto, con el período hasta la nueva devolución, y se corre `rental_return_date` (S02761: 83.333 = 500.000 ÷ 30 × 5). Como la orden ya está confirmada, la carga una persona. `lineaRenovacion()` sólo arma la línea.

## 2. Los productos

Ninguno tiene `default_code`. Todos tienen precio de lista $ 1, IVA 88, unidad «Units» y se pueden alquilar (`rent_ok`). Por eso el mapa va **por id fijo**, la misma regla de `cotizacion_productos_odoo`. `verificarProductosAlquilerSimple()` chequea que sigan activos y con el mismo nombre. Contra Odoo, el 12/11 dio todo bien.

| Código del motor | id | Producto en Odoo | Usos desde mayo |
|---|---|---|---|
| `modulo_130x250` | 138 | MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80 | 72 |
| `modulo_090x250` | 139 | MODULO DE ANDAMIO PASILLO 0,90 X 2,50 X 1,80 | 25 |
| `modulo_130x150` | 142 | MODULO DE ANDAMIO JUNIOR 1,30 X 1,50 X 1,80 | 1 |
| `modulo_090x150` | 148 | MODULO DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,80 | 2 |
| `baranda_130` | 149 | MODULO BARANDA DE ANDAMIO STD 1,30 X 2,50 X 1,80 (mide 1 m; el nombre está mal) | 57 |
| `baranda_090` | 150 | MODULO BARANDA DE ANDAMIO PASILLO 0,90 X 2,50 X 1,00 | 20 |
| `baranda_130` en torres junior (por cada una, 2 y 2) | 8 y 105 | BASTIDOR BARANDA - 1,30m. x 1.00 h · RIENDA ANDAMIO JR 1.50 m - HORIZONTAL | 1 |
| `baranda_090` en torres junior | 171 | MODULO BARANDA DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,00 | — |
| `tablon_250` | 119 | TABLON METALICO 2.50 m | 98 |
| `tablon_150` | 117 | TABLON METALICO 1.50 m | 4 |
| `ruedas_juego` | 141 | JUEGO DE RUEDAS DE ANDAMIO STANDARD (4 U) | 75 |
| `tornillones_juego` | 176 | TORNILLON DE 600 mm. POR UNIDAD (BASE FIJA): **va por unidad**, 4 por juego a $ 9.000 | 6 |
| mínimo operativo | 170 | MÍNIMO OPERATIVO Andamios Bs. As. | 59 |
| renovación | 193 | RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE) (es un servicio y no se vende suelto: `sale_ok` en false) | 18 |
| flete | 2 | [Delivery_007] Envío estándar (flete) | 85 |
| recargo por la franja | 178 | ADICIONAL VARIOS - SERVICIOS EXTRA - MANO DE OBRA (ver §7) | 1 |

**No existe un módulo baranda estándar junior** (1,30 × 1,50). En S02997, Tamara lo armó con 2 «BASTIDOR BARANDA - 1,30m. x 1.00 h» (id 8) y 2 «RIENDA ANDAMIO JR 1.50 m - HORIZONTAL» (id 105), y así lo arma Tomás (12/11: los dos activos y alquilables).

Hay otros productos que no usa el alquiler simple de Tomás: «TORNILLON ... (BASE MÓVIL)» (177), la rienda JR diagonal (106, que Odoo dice de 1,65 y mide 1,77), los bastidores sueltos y la escalera interna.

## 3. Los fletes

- **Los métodos 354 a 450 son la tanda del 31/3/2026**: 97 barrios y localidades, todos activos. **Los 159 a 255 son los viejos** (4/11/2025), con los mismos 97 nombres. Fuera de esos dos rangos sólo existe el 1, «Standard delivery».
- Son métodos `base_on_rule`, con `fixed_price` en 0. El precio sale de su **única regla** de `delivery.price.rule`: «cantidad >= 0», en `list_base_price`. Los 97 son así, sin nombres repetidos.
- **Cada precio nuevo es exactamente el viejo × 1,2.**
- Todos usan el producto 2.

Resumen de la lista nueva, en pesos netos, con la entrega y el retiro:

| Rango | Barrios y localidades |
|---|---|
| 105.600 a 124.200 | Paternal 105.600 · Agronomía, Chacarita, Villa Mitre, Villa Pueyrredón, Villa Real, Villa Santa Rita y Villa Urquiza 109.200 · Almagro, Villa Crespo y Villa del Parque 114.600 · Belgrano R, Caballito, Parque Chas y Villa Ortúzar 124.200 |
| 130.800 a 171.600 | Belgrano C, Coghlan, Parque Chacabuco y Villa Devoto 130.800 · Monte Castro, Versalles y Villa Luro 133.200 · **Palermo**, Balvanera, Colegiales, Flores, Floresta y Las Cañitas 140.400 · Boedo y Villa Riachuelo 148.200 · Núñez 150.600 · Villa Soldati 155.400 · Liniers y Vélez Sarsfield 158.400 · Barracas, Barrio Norte, Constitución, La Boca, Mataderos, Monserrat, Nueva Pompeya, Parque Avellaneda, Parque Patricios, Saavedra, San Cristóbal y San Nicolás 163.200 · San Telmo y Villa Lugano 171.600 |
| 187.200 | Puerto Madero, Recoleta y Retiro |
| GBA, 196.800 a 667.200 | Villa Martelli 196.800 · Avellaneda, Caseros, Ciudadela, Florida, Ingeniero Budge, La Tablada, Villa Fiorito y Villa Madero 219.000 · Olivos y Vicente López 225.600 · La Lucila 231.000 · Munro 231.600 · San Martín, Valentín Alsina y Villa Lynch 247.200 · Banfield, Lomas de Zamora y Villa Adelina 257.400 · San Isidro 262.800 · Martínez 281.400 · Santos Lugares 286.800 · Ramos Mejía 296.400 · Sarandí 300.600 · Burzaco 304.800 · José L. Suárez 332.400 · Don Torcuato 339.000 · Boulogne 344.400 · Lanús, Quilmes y San Fernando 345.600 · Nordelta 381.000 · Tigre 387.000 · Escobar y Pacheco 410.400 · Garín, Hurlingham, Ituzaingó, José C. Paz, Longchamps y Maschwitz 432.000 · Benavídez 495.000 · Pilar 545.400 · Berazategui 553.200 · Dock Sud 603.600 · Ezeiza 667.200 |

`fletesAlquilerSimple()` los lee de Odoo y los guarda 10 minutos en memoria. **Sólo usa los 51 barrios de CABA** (`BARRIOS_CABA_EN_LISTA`): JS decidió el 12/11 que no se entrega ni se retira en provincia, así que los 46 del conurbano se descartan, y `fleteParaUbicacion` no da flete fuera de CABA aunque la localidad esté en la lista. El método **«RETIRO» (418) es el barrio de Retiro** (187.200), no el retiro en el depósito.

**El barrio de la dirección** sale de USIG, el servicio del GCBA: es gratis, no pide clave y cubre el AMBA.
- El normalizador da la localidad y el partido en el conurbano, y el punto.
- En CABA, `datos_utiles` da el barrio oficial a partir del punto.
- Si USIG no reconoce la dirección (un country, un nombre propio), se geocodifica con Places (`geocodificarDireccion`) y se le pregunta a USIG por ese punto.
- Sin localidad escrita, se toma CABA: es la regla de `geocodificar-reglas.ts`.

Para encontrar el flete, `buscarFletePorBarrio`:
- compara sin tildes, sin mayúsculas y sin puntos;
- prueba los alias obvios: «Constitucion» → CONTITUCION (en Odoo está con la errata), «Villa Gral. Mitre» → VILLA MITRE, «Boca» → LA BOCA, «Palermo Soho» → PALERMO, y **«Belgrano» a secas → BELGRANO C**, el más caro (JS, 12/11). Los alias del conurbano se sacaron;
- por último, saca el «Este/Oeste» del final («Lanús Este» → LANUS).

Si no encuentra el barrio, o si coinciden dos, devuelve null y el pedido va a un vendedor.

Probado contra USIG con direcciones de órdenes reales:

| Dirección | Barrio oficial (USIG) | Flete que se elige | El que usó Tamara |
|---|---|---|---|
| Dorrego 3307 | Palermo | PALERMO | PALERMO |
| Darwin 1299 | Villa Crespo | VILLA CRESPO | VILLA CRESPO |
| Junín 1276 | Recoleta | RECOLETA | RECOLETA |
| Manzanares 1666 | Núñez | NUNEZ | NUNEZ |
| Pinzón 46 | Boca | LA BOCA | LA BOCA |
| Saraza 5545 | Villa Lugano | VILLA LUGANO | VILLA LUGANO |
| Cuenca 2347 | Villa del Parque | VILLA DEL PARQUE | VILLA DEL PARQUE |
| Calle Dr. Juan F. Aranguren 1712 | Caballito | CABALLITO | CABALLITO |
| Vera 1357 | **Chacarita** | CHACARITA (109.200) | VILLA CRESPO |
| Pareja 3157 | **Villa Pueyrredón** | VILLA PUEYRREDON (109.200) | AGRONOMIA en S03024, VILLA DEVOTO en S02889 |
| Sánchez de Bustamante 1491 | **Recoleta** | RECOLETA (187.200) | ALMAGRO |
| Av. Monroe 3980 | **Villa Urquiza** | VILLA URQUIZA (109.200) | BELGRANO C |
| Maipú 2000, Olivos | Olivos (Vicente López) | ninguno: provincia, se ofrece el depósito (antes OLIVOS) | — |
| Libertador 15000, San Isidro | Acassuso (San Isidro) | ninguno: provincia, se ofrece el depósito | — |
| H. Yrigoyen 10000, Lomas | Temperley (Lomas de Zamora) | ninguno: provincia, se ofrece el depósito | — |

## 3 bis. El retiro en el depósito (12/11)

Lo relevó Claude en Odoo, sólo leyendo: **no hay un campo ni una etiqueta para «retira en depósito»**. Las órdenes que retiran hoy (S03008, S02929, S02769, S01665, S01563) van:
- **sin método de envío** (`carrier_id` vacío) y **sin línea de flete**;
- con la dirección de la obra **«RETIRA DE CUCHA CUCHA 2345»** o «RETIRA CUCHA CUCHA 2345 - DEPOSITO ANDAMIOS BUENOS AIRES»;
- casi todas con «Horario Entrega» en «08:00 - 17:00».

Tomás hace lo mismo, con el depósito que confirmó JS el 12/11 (Cucha Cucha 2345, el de esas órdenes): sin `carrier_id` ni línea de flete, con el mínimo operativo igual, y `x_direccion_obra` = «RETIRA DE CUCHA CUCHA 2345 - DEPOSITO ANDAMIOS BUENOS AIRES (obra: …)» (`DIRECCION_RETIRA_EN_DEPOSITO`). La nota de condiciones (`note`) no es la de la «Plantilla Simples» (habla del camión y del pagaré): es `NOTA_RETIRA_EN_DEPOSITO`, la del depósito, sin pagaré. El período empieza a las 10 o a las 13, según la franja. «Horario Entrega» queda en «13:00 - 16:00» a la tarde y vacío a la mañana (10 a 12 no está en el desplegable).

## 4. Los adjuntos

Los adjuntos de una orden son `ir.attachment` con `res_model` en `sale.order` y `res_id` igual al id de la orden. Hoy se ven así los presupuestos en PDF, las órdenes de compra del cliente y las capturas («image.png»).
- `adjuntarArchivosAOrden` sube las fotos del DNI y los servicios del mismo modo.
- Para no subir dos veces el mismo archivo, compara el sha1, que Odoo guarda en `checksum`.
- Si se le pasa una nota, deja una nota interna en el chatter con los archivos.
- Acepta JPG, PNG, WEBP y PDF.
- Los adjuntos los ve quien tiene acceso a Ventas. No son públicos ni tienen token de acceso.

## 5. Cómo crea la orden Tomás

`crearOrdenAlquilerSimple` se llama **sólo cuando una persona aprueba la tarjeta**:
- **Deja la orden en borrador.** No llama a `action_confirm` ni a nada que la confirme.
- **Es idempotente por la marca** (`x_asistente_ref`), como el borrador del asistente comercial:
  - si un intento anterior ya creó la orden y sigue en borrador, le reescribe los datos y las líneas;
  - si ya la confirmaron o la cancelaron, no la toca y devuelve `intacta`.
- Devuelve el neto que calculó Odoo y avisa si no coincide con la suma de las líneas.
- **No asigna la plantilla** `sale_order_template_id`: no está claro si Odoo 19 agrega las líneas de la plantilla cuando se crea por API, y serían 3 módulos, 3 tablones, ruedas, el mínimo y la renovación de más. En cambio, copia el texto de las condiciones de la plantilla en `note`.
- El cliente y la oportunidad los resuelve quien la llama, con lo que ya existe:
  - `identificarCliente` (`comercial.ts`), por teléfono o CUIT;
  - `crearCliente` y `vincularOportunidad` (`presupuestos.ts`).

## 6. Lo que no cierra

1. **Tamara usa los fletes viejos.** Desde mayo, de las 78 órdenes con método de envío, 76 usan los viejos (159-255) y 2 los nuevos. Además, el precio de la línea muchas veces se escribe a mano: en S03023 cobró CABALLITO a 140.000, cuando la lista nueva dice 124.200 y la vieja 103.500. JS decidió la tanda del 31/3 (354-450), un 20 % más cara. **Tomás va a cotizar más caro que lo que cobra hoy Tamara en el mismo barrio.**
2. **Belgrano.** USIG dice sólo «Belgrano», y la lista tiene BELGRANO C (130.800) y BELGRANO R (124.200). **Resuelto el 12/11:** JS decidió cobrar siempre BELGRANO C, el más caro.
3. **El barrio oficial no siempre es el que usó Tamara.** En los cuatro casos de la tabla de la §3, el oficial de USIG da otro flete. En Sánchez de Bustamante 1491 la diferencia es grande: Recoleta sale 187.200 y Almagro 114.600. Tomás usa el oficial, que es el criterio que se puede repetir.
4. **El conurbano.** **Resuelto el 12/11:** no se entrega ni se retira fuera de CABA. Los métodos del conurbano no se usan y en provincia Tomás ofrece retirarlo en el depósito (§3 bis).
5. **No hay un módulo baranda estándar junior.** Si todas las torres estándar son junior, cada baranda va como en S02997: 2 × «BASTIDOR BARANDA - 1,30m. x 1.00 h» (8) y 2 × «RIENDA ANDAMIO JR 1.50 m - HORIZONTAL» (105), con el precio de la pieza repartido entre las 4 unidades, así el neto no cambia. Con torres de 2,50 y junior del mismo ancho en el mismo pedido queda el de 2,50 (149) con un aviso en la tarjeta: no se sabe cuántas barandas son junior.
6. **El recargo por la franja de una hora no tiene producto.** Se usa el 178 («ADICIONAL VARIOS - SERVICIOS EXTRA - MANO DE OBRA»), con la descripción «RECARGO POR FRANJA HORARIA PACTADA (entrega de 10:00 a 11:00 h, 20 % del servicio)», con el porcentaje del parámetro `alquiler_simple_recargo_franja`. Si JS quiere un producto propio, se crea a mano en Odoo y se cambia `PRODUCTO_RECARGO_FRANJA`. Desde acá nunca se crean productos.
7. **El desplegable «Horario Entrega» no tiene franjas de una hora.** Con la franja pactada, el campo queda vacío y la hora va en la línea del recargo.
8. **Los tornillones.** Se usa el de base fija (176), 4 por juego. El de base móvil (177) se usó 4 veces y no está claro para qué.
9. **El vendedor.** **Resuelto el 12/11:** siempre Tamara (user 73), no la pareja del turno: `VENDEDORA_ALQUILER_SIMPLE` en `aprobar.ts`, en la orden y en la oportunidad.
10. **El mínimo operativo es un producto «consu» con `is_rental`.** Por eso genera un movimiento en el remito de entrega, como ya pasa en las órdenes de Tamara. Se mantiene igual.
11. **El pagaré.** Las condiciones de la plantilla piden un pagaré sin protesto de $ 2.500.000 como garantía. **Resuelto el 12/11:** Tomás no lo pide (es gestión administrativa). El texto de la plantilla se sigue copiando en `note` de la orden, como en las de Tamara.
