# Referentes y patrones (resumen del informe de investigación)

## Referentes y qué copiar
- **ServiceTitan Dispatch Board**: fila por técnico + bandeja de trabajos sin asignar. Copiar: click-to-drop (tocar ficha, tocar destino) además de arrastrar; bloquear lo ya en curso; desasignar siempre manda a una cola visible.
- **Salesforce Dispatcher Console**: lista + Gantt + mapa sincronizados; alertas que avisan pero no bloquean (triángulo ámbar), el despachante decide. No poner los tres paneles por defecto.
- **Dynamics 365 Schedule Board**: arrastrar no valida → el tablero miente. Lección: validar AL SOLTAR y mostrar la advertencia sobre la tarjeta.
- **Jobber**: vista de día con una columna por integrante; cajón de "sin programar"; mapa como cajón secundario con pines del color de cada recurso; ícono explícito de "sin asignar".
- **Onfleet**: barra con "Sin asignar" arriba y cada chofer con su lista ordenada; se arrastra al nombre (va al final) o a una posición. El orden que ve el coordinador = el que ve el chofer en su app. Estados con color: gris sin asignar, violeta asignada, azul en camino, verde hecha, rojo fallida; punto dorado de demora.
- **Procore Resource Planning (LaborChart)**: banco de gente disponible como columna fija; arrastrar persona a obra; "Guardar y avisar" como paso explícito separado de guardar.
- **Bridgit Bench**: "rol vacío" como hueco visible ("falta 1 oficial en Cuadrilla 3") con sugerencias de reemplazo.
- **Assignar**: personas, camiones o cuadrillas enteras con la misma mecánica de arrastre.
- **Skedulo**: vista previa de dónde cae al arrastrar; ajuste grueso (30 min alcanza).
- **Float**: filas placeholder; asignaciones tentativo vs confirmado (sirve para el borrador de la noche anterior).
- **React Flow / tldraw / Miro**: ningún producto de despacho usa conectores libres como interacción principal (spaghetti, sin tiempo). Usar conectores como CAPA DE RESALTADO: al seleccionar/pasar el mouse por un camión se dibuja el conector hacia la/s cuadrilla/s que atiende.

## Patrón recomendado: una pantalla, tres modos del día (Armar · Mañana · En curso)
**Armar (noche anterior)** — lienzo de columnas: [Banco: disponibles/ausentes] · Cuadrilla 1…5 · Depósito · [Flota].
- Encabezado de columna = obra (dirección, tarea); las obras vienen del tablero; obra sin cuadrilla queda en cajón con contador rojo.
- Personas: tarjetas compactas; capataz primero y marcado.
- Ranura de movilidad: el camión se arrastra desde Flota; al soltar, interruptor "Todo el día" (anclado, borde sólido, color del camión) o "Lleva y trae" (ficha con hora de ida y vuelta; el camión vuelve a Flota como disponible entre esas horas). El chofer se suelta SOBRE la ficha del camión.
- Validación al soltar sin modales: borde ámbar + ícono ("Pérez ya está en Cuadrilla 2", "la hidrogrúa ya está tomada 9–11"); avisa y deja; ofrecer la solución en una línea.
- Click-to-drop, Deshacer siempre visible (Ctrl+Z), "Copiar de ayer".
- Borrador vs publicado; botón "Publicar y avisar" con resumen ("Se avisa a 3 capataces y 2 choferes; estos son los cambios").

**Mañana (ausencias)** — marcar ausencia no saca a la persona: queda tachada y deja un HUECO visible ("falta 1"); el Banco se ordena con sugeridos para el hueco arriba (mismo rol, libre, suele ir con esa cuadrilla, depósito con gente de más); arrastrar al hueco o "Usar". Si falta un chofer, sus camiones se ponen ámbar. Barra superior de pendientes ("2 huecos · 1 camión sin chofer · 1 obra sin cuadrilla") que lleva al lugar. "Publicar cambios" avisa sólo a los afectados.

**En curso** — columnas compactadas en una tira arriba (estado de cada cuadrilla); abajo banda horaria por camión 7–18 h con línea de "ahora". Cola de pedidos a la izquierda ordenada por urgencia; pedido se arrastra a la fila de un camión (cae en el primer hueco o donde se suelta; reordenable); el orden de la fila es el orden del chofer. Estados sin GPS marcados por el chofer: Pendiente (gris) · Asignado (contorno color camión) · Salió (relleno) · Hecho (tilde verde) · No se pudo (rojo, vuelve a la cola con motivo); punto ámbar de demora; "hace cuánto no hay noticias" en vez de inventar posición. Asignaciones bloqueadas por defecto ("Editar asignaciones"). Mapa como cajón opcional con pines de obras y depósito.

## Recursos compartidos sin confundir
1. El chofer es atributo del viaje/tramo, no del camión. En la banda por camión cada bloque muestra el avatar del chofer; si maneja A de 7 a 10 y B de 11 a 15, su avatar aparece en las dos con badge "1/2", "2/2"; hover resalta sus tramos y atenúa el resto.
2. Interruptor "Agrupar por: Camión / Chofer".
3. Choques: franja ámbar rayada en los dos bloques y mensaje concreto.
4. Lleva y trae en la banda en segmentos: ida → en obra (rayado claro: el camión está libre) → vuelta, con viajes intermedios en el hueco. Borde punteado (lleva y trae) vs sólido (todo el día).
5. Un color fijo por camión en todas las vistas (ficha, banda, pin, conector). Los estados no usan esos colores (relleno/íconos).
6. Barra fina de capacidad en cada camión y chofer (horas ocupadas).

## Errores a evitar
Arrastre como única forma; arrastrar sin validar; conflictos como modales; mezclar colores de estado y de recurso; spaghetti de conectores siempre visibles; mapa protagonista sin GPS; no separar borrador de publicado / avisar a todos ante cada cambio; editar lo que ya pasó; orden del tablero distinto al del celular; desasignar sin destino; replicar la grilla en el celular; sin deshacer ni "copiar de ayer".

## Librerías (para implementar después)
dnd-kit (MIT) para columnas y banco; banda horaria propia en CSS grid; conectores con SVG superpuesto. Bryntum sólo si la banda crece mucho (comercial).
