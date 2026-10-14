# Relevamiento técnico (resumen, para que la maqueta sea implementable)

## Fuentes de datos
- Odoo es dueño del tablero (no se escribe desde la hoja): cuadrillas, obras del día por cuadrilla (asignaciones con orden y fracción), OT (tipo, detalle, contacto, planos), coordenadas de la obra, parte diario. "Cerrar jornada" escribe el parte (la hoja sólo lo precarga). Las obras son de solo lectura en la hoja: moverlas de cuadrilla es del Tablero.
- Supabase guarda todo lo demás: hojas, integrantes, renglones de vehículo, viajes, pedidos, contratistas, ausencias, links/envíos, Telegram, historial/Deshacer, lugares (depósito Cucha Cucha 2345, proveedores, VTV), parámetros, caché de tiempos de Google.

## Entidades
- Hoja = cuadrilla × día (encuentro: depósito/obra/otro + hora; nota; recibe).
- Integrante: persona en una hoja; una persona va a UNA sola cuadrilla por día (índice de la base: ponerla en otra la mueve); uno solo a cargo por hoja. Candidatos a cargo marcados en Legajos.
- Renglón de vehículo: vehículo + chofer (cualquiera puede faltar) + modo lleva_trae | todo_el_dia. Hoja sin renglones = van por su cuenta. Varios por hoja.
- Viaje: parada de un camión. Tipos: lleva/busca/mueve (de la cuadrilla) · lleva_material/trae_material/compra/entre_depositos/taller/otro. Estados planeado/hecho/no_pudo/anulado. Hora fija o estimada; "vuelve al depósito" con hora de llegada. Chofer por viaje (vacío = el que maneje ese camión a esa hora). Flete de afuera = viaje sin vehículo propio. Lleva y busca van a la primera/última obra del día de esa cuadrilla.
- Pedido: algo que hay que llevar/buscar sin camión todavía; estados sin_camion/esperando/en_camion/hecho/anulado; urgencia frena/hora/cliente/hoy/cuando_se_pueda; varios pedidos pueden ir en un viaje. Sugeridos calculados (primer día de armado → llevar material; último de desarme → traer).
- Contratista: sólo cantidad por hoja ("+3 de Quintana"); puede quedar a cargo.
- Ausencia: desde/hasta, tipo, parcial ("se retira a las 14"); también las de la asistencia de Odoo.
- Envío: link por persona/día/rol con foto de lo enviado → "cambiada después de enviar"; estados enviada/abierta/recibida/cambio. Telegram con respaldo WhatsApp a mano.
- Historial + Deshacer de cada gesto.

## Gestos que existen (el diseño nuevo los reusa)
Gente: agregar (arrastrar, soltar sobre otro = reemplaza, teclas 1–5), sacar, a cargo, recibe, nota. Vehículos: sumar/quitar/cambiar renglón, modo, chofer, encuentro, hora del lleva, vuelta al depósito, busca (mismo/otro camión/a definir/vuelven solos), carga. Contratistas ±. Viajes: crear, poner pedido en camión (orden entre vecinos o sumarlo a un viaje), mover (a otra fila u orden), hora, volver a la cola, anular, hecho, no pudo, correr horas, chofer de un viaje, elegir otro chofer del camión, que lo lleve con la cuadrilla. Pedidos: crear, aceptar/descartar sugerido, esperar, pasar a mañana, anular, ordenar. Precarga: como hoy / plantel base / vacío. Envíos: enviar, enviar todos, reenviar, no hace falta avisar. Ausencias. Link del celular: recibido, entendido, hecho, no pude, foto del remito.

## Avisos esenciales (núcleo de reglas)
Sin nadie a cargo; ausente en la hoja o chofer ausente; faltan personas; renglón sin chofer/vehículo; viaje sin chofer; mismo chofer o vehículo en dos lugares a la vez (hoy fragmentado en 7 claves: unificar); viaje de hora fija que no entra / busca llega tarde; lleva o busca sin camión; cambió después de enviar / sin enviar; chofer marcó "No pude"; pedido que frena la obra / nadie libre. El resto (VTV vencida repetida, "no tocó Recibido", "sin noticias") es ruido o secundario.

## Restricciones que un diseño nuevo debe respetar
1. Una persona en un solo lugar por día (cuadrilla o, a futuro, depósito).
2. Las obras vienen del tablero de Odoo; la hoja no crea ni mueve obras (sí puede mostrar "ir al Tablero").
3. Sólo hay hoja si la cuadrilla tiene obras ese día (cambiaría para el depósito).
4. ~280 ms por ida a Supabase: los gestos tienen que verse al instante (optimista) y confirmarse después.
5. Varias personas pueden editar a la vez: un cambio de otro llega como "cambió, refrescá".
6. Mantener el vocabulario y el celular de capataz/chofer.

## Depósito (no existe hoy como sector)
Hoy es sólo un lugar (origen/vuelta de camiones, punto de encuentro) y un contacto ("Avisar al depósito", lista de carga). El puesto jefe_deposito no aparece en el panel. El Tablero ya tiene "tareas operativas de tipo Depósito" (p. ej. "la 3 va al depósito el martes") que la hoja ignora. Para tratarlo como sector: una hoja de "sector" (no una cuadrilla de Odoo), con la misma regla de una persona en un solo lugar; siempre presente aunque no haya obras; puede tener encargado, recibir su hoja (lista de carga como contenido) y tener vehículos (autoelevador). No genera parte en Odoo (decisión del dueño: no va en el parte).
