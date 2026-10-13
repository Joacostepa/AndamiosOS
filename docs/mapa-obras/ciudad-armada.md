# Ciudad Armada: Mapa de obras 3D

Aprobado por el dueño el 12/10/2026. Reemplaza la pantalla actual `/mapa-obras` (misma ruta, mismos permisos).

**Referencia funcional:** `docs/mapa-obras/maqueta/ciudad-armada.html` es la maqueta navegable que aprobó. Es una plantilla: `__OBRAS__`, `__INDEX__` y `/*MLCSS*/` se reemplazaban con datos, y los tiles venían empaquetados. En la app los tiles se piden directo a OpenFreeMap. La maqueta es la especificación de comportamiento y de estilo: estilo nocturno y diurno del mapa, cómo se arma la estructura sobre la vereda, etiquetas en chip, columnas, halo de las pendientes, lista, Para decidir, ficha, histórico, línea de tiempo y modo TV. La lógica JS de la maqueta (`corta`, `geom`, `decisiones`, `lblLayout`, `pill`, `style`) se puede portar casi tal cual.

**Contrato de datos:** `src/lib/mapa-obras/tipos.ts`.

## Decisiones del dueño (no reabrir)

- El mapa es **real**: calles, nombres de calles, barrios y alturas de OpenStreetMap vía OpenFreeMap. Le importa ver en qué calle está cada obra.
- **Nada de plata ni comercial**: ni montos, ni deuda, ni presupuestos.
- Se muestran las **armadas** y las **pendientes de desarme** (violeta, con pulso). Hay una vista **Histórico** con las desarmadas.
- **No hay fotos 3D de Google.** Lo que importa son las **fotos de los partes** (`x_aba_foto`) y las de Telegram, en la ficha y con visor a pantalla completa (reusar `visor-fotos.tsx`).
- Hay TVs en la oficina, así que el **modo TV** entra ya.
- Es una herramienta para la compu de la oficina y la TV. En el celular alcanza con que funcione en 2D con la lista.

## Datos reales (12/10/2026)

- 81 armadas, todas con coordenadas.
- 11 pendientes de desarme, 7 con coordenadas.
- 371 desarmadas, solo 29 con coordenadas. Por eso el cron que geocodifica tiene que incluir también desarmadas y pendientes.
- `x_permiso_altura` = 0 en todas. Las medidas se leen del texto de `x_estructura_actual` o de la OT ("Pantalla 9m x 1,25m x 2,50m H"; "Estructura de 45m. x 19 de alto"). La mayoría son pantallas de protección de 2,5 a 4 m de alto.
- `x_fecha_armado` = 2026-03-24 en muchas: es la fecha de la importación, no la del armado real. Se marca como "desde la importación".
- "Bolívar 1887 esq. Martin García" (San Telmo) se geocodificó a la ciudad de Bolívar (lat -36,2). Hay que validar que una dirección sin localidad que cae fuera del AMBA se reintente como CABA o se rechace.
- Hay direcciones sin calle y número ("INGENIERIO BUDGE PVCIA BS AS (RETIRAN ELLOS)"). Se marcan `sin_altura` y van a Para decidir con "Completar dirección".
- Fotos de partes: 560 fotos en 128 partes desde el 01/09; 40 de las 92 obras en la calle tienen fotos.

## Pantalla

- **Vistas:** En la calle | Histórico.
- **Arriba a la izquierda, contadores.**
  - En la calle: armadas, pendientes de desarme, metros lineales, fin estimado vencido, y una línea "N sin ubicación".
  - Histórico: desarmadas, con ubicación, días promedio, en la calle ese día.
- **Leyenda que también filtra**, con chips y conteos. En la calle: ≤30, 31–90, >90, Desde la importación, Sin fecha, Pendiente de desarme. Histórico: Sigue en la calle / Ya se desarmó.
- **Lista a la izquierda.**
  - Buscador por calle o dirección: filtra la lista y el mapa, y encuadra.
  - "Para decidir", máximo 6, repartidas por tipo de motivo:
    - pendiente sin fecha de desarme → "Programar desarme";
    - sin altura o lejos → "Completar dirección" / "Corregir dirección";
    - fin estimado vencido → "Confirmar con el cliente";
    - sin "qué está armado" → "Pedir lo armado al capataz".
  - Después, "Todas en la calle", con las pendientes primero y luego por días.
  - En Histórico: las desarmadas agrupadas por mes de desarme, con la etiqueta "sin ubicación".
- **Ficha a la derecha.** Contiene:
  - la dirección corta y la original con la venta;
  - el estado;
  - armada el / fin estimado o desarme programado o desarmada el;
  - el tipo;
  - las medidas, marcadas "(estimado)" si corresponde;
  - la calle en el mapa;
  - los avisos: fecha dudosa, sin altura, ubicación equivocada, sin ubicación;
  - **las fotos**: miniaturas con visor, contando de cuántos partes son y la fecha de la última;
  - qué está armado, con su fuente;
  - los botones Street View y Google Maps (links `https://www.google.com/maps/...`), "Ir a la obra" y "Abrir en Odoo".
- **Mapa.**
  - Desde lejos, una columna por obra con altura según los días y una base de 70 m.
  - De cerca (zoom ≥ 15), la estructura: parantes, travesaños, plataformas, baranda, diagonales en escalera y malla. Es `fill-extrusion` de MapLibre, sin three.js.
  - Si no hay edificio de OSM detrás, se dibuja un edificio aproximado.
  - Los edificios de OSM se vuelven translúcidos de cerca y se dibujan DESPUÉS de las estructuras; si no, las tapan.
  - Etiqueta en chip: dirección corta más subtítulo.
  - Halo que late en las pendientes.
- **Histórico.** Línea de tiempo semanal desde el 24/03/2026 hasta hoy, con la curva de obras en la calle. Al mover la fecha, el mapa muestra lo que estaba armado ese día.
- **Botones:** Día/Noche, 2D/3D, General, Modo TV.
  - El modo TV va a pantalla completa y recorre "Para decidir" más las más viejas, con titular grande, 11 s por obra. Cierra con la vista general y el resumen.
  - Se sale con Esc o tocando el mapa.
