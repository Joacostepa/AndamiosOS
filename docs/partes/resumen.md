# Partes de obra: el circuito nuevo, en una página

> Para revisar con quien carga los partes, junto con la maqueta.
> Maqueta: https://claude.ai/artifact/RzqxoYYA7Mapz2zaMYLK73 (copia en [`maqueta.html`](./maqueta.html)).
> Esta página publicada: https://claude.ai/artifact/LgEDNFwT2GbsqWURFeSFg6
> Detalle: [`rediseno.md`](./rediseno.md) y [`parte-capataz.md`](./parte-capataz.md). Octubre 2026.

## La idea

Hoy la oficina **reconstruye el día de memoria** a la mañana siguiente: quién fue, a qué hora terminaron, cuántos fletes hubo. Con el circuito nuevo, **el parte lo completa el capataz**, que es quien estuvo en la obra, y **la oficina lo valida**. La oficina deja de tipear y pasa a revisar.

Mientras los capataces aprenden, la oficina sigue cargando, pero **"en nombre del" capataz** y con el mismo flujo que él. Cuando un capataz arranca, su parte entra solo y no hay que rehacer nada.

## Quién hace qué

| | El capataz (en su celular) | La oficina ("Partes del día") | El técnico ("Cierres de obra") |
|---|---|---|---|
| **Cuándo** | Al terminar la jornada; pedidos y novedades cuando pasan | A la mañana siguiente | Cuando termina una obra |
| **Qué hace** | Confirma con toques: quién fue, a qué hora terminaron, si se hizo, cuánto falta. Manda fotos. Pide material o viajes. Avisa si pasó algo | Revisa cada cuadrilla y confirma. Si algo no coincide, elige qué vale. Si falta un dato, le pregunta al capataz | Valida medidas finales y fotos de amarres. Revisa la constancia de entrega. Cierra la OT |
| **Cuánto tarda** | 20 a 60 segundos por día; 5 a 8 minutos el día de entrega | Un toque si hay evidencia; un poco más si algo no coincide | Unos minutos por obra |

## Qué cambia para quien carga partes

1. **Llega todo precargado** desde la Hoja del día, desde los "Hecho" del chofer y desde lo que declaró el capataz. Cada dato dice **de dónde salió**.
2. **La unidad es la cuadrilla en el día**, no cada obra por separado. La gente se confirma una vez, por nombre: se toca a quien no fue.
3. **Confirmar de un toque sólo si hay respaldo** (lo declaró el capataz o lo registró el chofer). Si sólo está el plan, pide confirmarlo a mano. Así no entran horas inventadas.
4. **Si falta un dato, se guarda igual** y queda "esperando respuesta" del capataz, el técnico o el chofer.
5. **Nada se pierde:** cada cambio queda guardado como borrador, y después de confirmar hay 10 segundos para deshacer.
6. **Lo atrasado está a la vista:** una tira con la semana muestra qué días deben partes, y la pantalla abre en el más viejo.
7. **Las novedades del capataz llegan con una acción sugerida:** pedidos, esperas, pedidos del cliente, faltantes del desarme.
8. **Cerrar una obra va aparte**, en "Cierres de obra", y no frena el parte del día.

## Para charlar juntos

- ¿Cómo es hoy una mañana de carga? ¿Cuánto tarda, y qué es lo que más cuesta averiguar?
- ¿Se reconocen los casos de la maqueta? ¿Falta algún caso que pase seguido?
- ¿Quién confirma los partes cuando esta persona no está?
- Las alertas de horas-hombre (cuadrilla de más de 8, desarme con las mismas horas que el armado, 3 fletes o más): ¿tienen sentido? Se ajustan después de dos semanas de uso.
- ¿Qué capataces pueden arrancar primero declarando desde el celular?

## Lo que decide la dirección (no frena la charla)

- El texto del acta de entrega y la cláusula de aceptación a las 48 h (con el abogado y Seguridad e Higiene).
- Si la fecha de entrega arranca el alquiler o la facturación.
- Que las medidas y los amarres los valide el técnico de la obra.
- Si los faltantes del desarme se cobran al cliente.
- La regla para el capataz: no hacer trabajos que pide el cliente sin el OK de comercial.
- Dónde se guardan las fotos (Odoo o Supabase con link en Odoo).

## Por dónde se empieza

1. **Ya (unos 4 días):** la pantalla actual usa la precarga de la Hoja del día, no corta el guardado en el primer error, guarda borradores y muestra lo atrasado. Sirve para cualquiera de los caminos.
2. **Después (8 a 10 días):** la pantalla nueva de "Partes del día", con evidencia y confirmación por cuadrilla.
3. **Con Telegram activo:** el capataz declara desde el celular y se suman los cierres de obra, los pedidos y las novedades.
4. **Al final:** la constancia de entrega con firma del cliente y el cierre del desarme.
