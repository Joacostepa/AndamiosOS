> Medición del 18/10/2026, solo lectura contra Odoo y Supabase, para [comodines.md](comodines.md). Los scripts quedaron en una carpeta temporal de la sesión y no se guardaron en el repo.

## Comodines: qué dicen los datos (medición del 18/10, solo lectura)

Todo se midió leyendo Odoo y Supabase, sin escribir nada. Los datos de Odoo son de hoy (OTs, asignaciones, ventas, historial de cambios de fecha de las ventas, facturas). `plan_movimientos`, partes y `pj` salen de la medición de esta mañana. Los scripts quedaron fuera del repo.

### 1. Desarmes y servicios no urgentes (OTs creadas desde el 31/08, 7 semanas)

- **Cuántas:** 71 desarmes, 4 desmontes parciales, 4 mantenimientos y 7 de tipo "otro". Por semana: 18, 17, 13, 11, 11, 12 y 4 (la del 12/10 tuvo feriado y no está completa). Son **unos 10 desarmes por semana, casi todos de 1 jornada** (63 de 71), unas 10 jornadas por semana.
- **Urgencia:** 68 de 71 desarmes están en "baja" y 3 en "media". El campo `x_motivo_urgencia` está vacío en los 71. "Baja" es el valor que queda por defecto, así que **la urgencia cargada no sirve para distinguir nada.** Entre los mantenimientos y "otro" hay 4 en alta y 3 en media: esos no son de relleno.
- **Firmeza:** 69 de 71 están "confirmada". También parece el valor por defecto.
- **Ventana de los desarmes:**
  - piso (`x_fecha_desde`) cargado en 30 de 71, en mediana 3,5 días después de crear la OT;
  - techo (`x_fecha_antes_de`) cargado en 1 de 71;
  - fecha comprometida en 10 de 71.
- **De que se crea la OT al primer parte:**
  - desarme: P25 2 días, mediana 4 (4 hábiles), P75 9 y P90 12;
  - "otro": mediana 1;
  - mantenimiento: 0;
  - desmonte parcial: 7.

  **El desarme vive poco tiempo como pendiente:** se pide y a los 4 días se hace.
- Entre el primer parte y el piso pasa 1 día de mediana: se hace apenas se puede.

### 2. ¿Los desarmes son los que más se mueven? Sí, y por mucho

Cambios de fecha en `plan_movimientos` desde el 14/09, según el tipo de la OT movida:

| | OTs puestas en la grilla | Cambios de fecha | Cambios por OT | Avisados con 3 días o menos | Sacadas de la grilla |
|---|---|---|---|---|---|
| Armado | 70 | 144 | 1,36 | 37 | 42 |
| **Desarme** | 42 | **118** | **2,4** | **59** | 17 |
| Servicio | 16 | 27 | 1,69 | 11 | 11 |

- Los desarmes son cerca del **20% de las jornadas del tablero** (41 de 205), pero acumulan el **41% de los cambios de fecha** y el **55% de los cambios avisados con 3 días o menos** (59 de 107).
- **Obras metidas "a presión":** de las 84 obras desplazadas, 46 eran armados, **29 desarmes** (el 35%, todos de urgencia baja) y 9 servicios.
- **El comodín ya existe en los hechos:**
  - 30 desarmes distintos se adelantaron 55 veces en 5 semanas, en mediana 2 días;
  - 40 de esos adelantos fueron para una fecha a 3 días o menos;
  - en 18 casos la obra se hizo justo ese día.

  O sea que hoy ya se usan desarmes para tapar huecos sobre la marcha, unos 3,5 por semana, y no queda escrito el motivo (54 de 55 sin motivo).

### 3. Cuántos comodines hay hoy

Hay 60 OTs pendientes de obra: 45 armados, 13 desarmes, 1 desmonte y 1 mantenimiento.

| Criterio | OTs | Jornadas |
|---|---|---|
| **A:** desarme o servicio, urgencia baja, sin fecha comprometida, techo vacío o más allá del 29/10 (10 hábiles), habilitación OK y piso ya pasado o vacío | 6 | 3,6 |
| **B:** igual que A, pero con piso hasta 5 hábiles para adelante | 7 | 3,9 |
| **C:** amplio, desarme o servicio no urgente y sin fecha comprometida | 7 | 3,9 |
| **D:** A, y además que no esté confirmado en la grilla | 3 | 0,9, y las 3 son OTs que ya no corren |

- **Hay que descontar OTs que ya no corren:** 6 OTs figuran "pendiente" o "en proceso" pero tienen partes de agosto o septiembre, o una fecha vencida sin parte: S00719, S01592, S02265, S01483 (la #1122), S00128 (#1143) y S01991. Habría que limpiarlas antes de construir nada.
- **Comodines reales hoy: unas 4 OTs y unas 2,4 jornadas.**
  - S01531, 0,75 j, el 20/10;
  - S02076, 0,25 j, tentativa para el 22/10;
  - S02658, 1 j, el 02/11;
  - S02277, 0,375 j, sin fecha: quedó afuera de la grilla después del 17/10.
- El desarme del Edificio 4 de Canning (S01483) ocupa 8 jornadas fijas en la C1 y no es comodín.
- En la grilla hay 14 jornadas de desarme desde el 19/10.
- **Conclusión:** hoy la reserva de comodines es casi nula, porque el desarme se pide tarde y se hace enseguida.

### 4. ¿Alcanzan para 2 guardias por semana? Sí, con margen, si se toman cuando entran

**Flujo semanal** (7 semanas, desarmes y servicios ejecutados, urgencia baja):

| Días hábiles entre que se pide y se hace | OTs por semana | Jornadas por semana |
|---|---|---|
| 3 o más | 6,0 | unas 6,6 |
| 5 o más | **4,6** | unas 5,3 |
| 8 o más | 2,4 | unas 3,1 |

Contra **2 jornadas por semana** de guardia, el flujo con 5 o más hábiles de margen es **unas 2,5 veces lo que hace falta.**

**La foto de cada día a las 13 h**, que es el momento del relleno. Tomé del 14/09 al 09/10 (23 días hábiles) y conté los desarmes o servicios que ya estaban pedidos, con el piso en mañana o antes, y que terminaron haciéndose 2 o más días hábiles después de mañana:
- **sin fecha comprometida:** mediana 3, mínimo 1; solo 1 de los 23 días hubo menos de 2;
- con o sin fecha comprometida: mediana 6, entre 4 y 10.

Para cada guardia que no se usa casi siempre hubo al menos un desarme ya pedido para adelantar.

**Salvedad:** esta cuenta muestra que el desarme se hizo después, no que el cliente hubiera aceptado ir antes. Y casi todos ya estaban puestos en la grilla, así que usarlo deja libre su fecha original, más adelante, donde es más fácil volver a llenarla.

### 5. Habilitaciones y permisos

- Los 71 desarmes están "habilitada", con etapa "4. Habilitada" y sin alerta. La habilitación se hereda del armado: la fecha de habilitación queda igual a la de creación de la OT o anterior. **La habilitación no restringe nada.**
- `x_hab_vencimiento` está cargado en 1 sola OT de todo Odoo. No se registra cuándo vence una habilitación.
- **Permiso de implantación del GCBA en la venta:** en los desarmes recientes, 8 de 71 dicen que lo llevan (8 emitidos). En las 86 ventas con andamio en obra, 19 dicen que sí, con 18 emitidos y 3 presentados.
- En Odoo solo está la fecha en que se emitió el permiso (`x_permiso_fecha`), no hasta cuándo vale. **No se puede medir si el permiso pone fecha al desarme.** Si vence, el desarme pasa a ser urgente y deja de ser comodín, así que esa fecha debería funcionar como techo. Hay que preguntarle a quien gestiona los permisos.

### 6. Cómo se crea hoy una OT de desarme

- **Todas a mano en Odoo:** ninguna de las 71 se creó desde AndamiosOS (`x_andamios_id` vacío). Las crearon Sandra Riveros (25), Agustina Munaretti (18), Rocío Riveros (15), Tamara Miguez (9) y JS (4).
- **Qué se carga:**
  - siempre: duración y fecha programada;
  - casi siempre: el detalle, en 59 de 71;
  - poco: piso en 30, observaciones en 22, comprometida en 10, contacto en 9, teléfono en 8;
  - nunca o casi nunca: techo en 1, cuadrilla prevista en 0, motivo de urgencia en 0.
- **La ventana real del cliente queda escrita en las observaciones, en texto libre.** Por ejemplo: "Cliente pide retiro a partir del 08/09", "Cliente pide Viernes 04/09" o "Contrato vence 10/09 (duración alquiler 7 días) (cliente no pidió desmontaje aún – subido por pedido de logística…)". Es decir, la información de comodín ya existe, pero no queda en campos.

### 7. Las 86 ventas sin OT de desarme: sí hay un dato para anticiparse

- **El alquiler se cobra por mes:** las facturas son "RENOVACIÓN ALQUILER… canon (mes 2, mes 3)". La fecha de devolución de la venta (`rental_return_date`) la renueva Comercial o administración más o menos cada 30 días: de los 2420 cambios registrados, unos 820 son saltos de 29 a 31 días.
- **Cuándo se pide el desarme respecto de esa fecha:** en los 71 desarmes, el pedido llegó en mediana **unos 7 días antes del fin del período pagado** (entre 1 y 15 días antes en la mayoría). El desarme se hizo en mediana **1 día antes** de ese fin, y en 38 de 63 casos cayó a 7 días o menos de él.
- **El fin del período pagado es el techo natural del comodín y sirve para anticipar quién va a pedir desarme.**
- **Hoy:** de las 86 ventas, 69 figuran "Armado" en Odoo (8 ya dicen "Desarmado", así que son datos viejos).
  - 22 tienen el período terminando **en los próximos 14 días**, con unas 21,5 jornadas de desarme estimadas (`x_dur_desarme`);
  - 37 terminan en 15 a 31 días;
  - 10 tienen la fecha vencida sin actualizar.
- `x_fecha_desmontaje` de la venta no sirve para anticipar: se completa el mismo día en que se pide el desarme (54 de 63 casos). `x_meses_alquiler` está vacío.
- **Alquiler:** en un desarme que el cliente ya pidió, adelantarlo dentro de un mes que ya está facturado no hace perder nada. Solo en 6 de 63 ventas se emitió alguna factura después del desarme, posiblemente por adicionales.
  - El problema de cortar la facturación solo existe si se adelanta un desarme que el cliente **no** pidió.
  - El riesgo inverso es que el comodín se pase del fin del período: ¿se cobra otro mes? Eso hay que definirlo.

### Lo que no se pudo sacar

- Si el cliente acepta que vayan con poco aviso, y si tiene que estar presente o dar acceso: no hay datos. Solo hay contacto cargado en 9 de 71 desarmes.
- Hasta cuándo vale el permiso del GCBA.
- El tiempo de viaje.
- La urgencia real: está en "baja" por defecto.

### En dos líneas para el panel

1. El comodín ya existe de hecho: los desarmes son el 55% de los cambios de fecha con aviso corto. El flujo (unos 4,6 por semana con 5 o más días hábiles de margen) alcanza para 2 guardias por semana, si el desarme se marca como comodín al pedirse, con ventana desde el piso hasta el fin del período pagado.
2. Hoy la reserva está vacía porque el desarme se pide unos 7 días antes del fin del período y se hace a los 4. Para anticiparse sirve consultar a los clientes cuyo período termina en 14 días o menos, que hoy son 22.