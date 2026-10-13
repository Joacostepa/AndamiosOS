# Handoff — Mapa de obras (Ciudad Armada)

## Estado (12/10/2026)

**En producción** desde el merge `6350fdd` a `main` (rama `feat/ciudad-armada`). Vercel lo publicó sin errores. Reemplazó a la pantalla vieja: misma ruta `/mapa-obras`, mismo módulo de permisos `mapa-obras`. **Sin migraciones.**

- Diseño y decisiones del dueño: [ciudad-armada.md](./ciudad-armada.md).
- Contrato de datos: `src/lib/mapa-obras/tipos.ts`.
- Maqueta aprobada (con mapa real y obras reales del 12/10): [maqueta/ciudad-armada.html](./maqueta/ciudad-armada.html). Es una plantilla: los `__OBRAS__`/`__INDEX__` se llenaban con datos.

### Decisiones del dueño (no reabrir)

- El mapa es **real**: calles, nombres, barrios y alturas de OpenStreetMap vía OpenFreeMap. Le importa ver en qué calle está cada obra.
- **Nada de plata ni comercial**: ni montos, ni deuda, ni presupuestos. Se descartaron las lentes «Plata» y «Comercial» de la primera propuesta.
- **No van las fotos 3D de Google** (Photorealistic 3D Tiles). Le parecieron innecesarias.
- Lo importante son las **fotos de los partes** en la ficha.
- Hay TVs en la oficina: el **modo TV** es parte del módulo.
- Herramienta de escritorio y de TV. En el celular alcanza con 2D y la lista.

### Hecho

- **Pantalla:**
  - vistas «En la calle» (armadas + pendientes de desarme en violeta con pulso) e «Histórico» (desarmadas por mes, con línea de tiempo semanal desde el 24/03 y play);
  - leyenda que filtra y contadores;
  - buscador por calle o dirección, que filtra lista y mapa y encuadra;
  - «Para decidir», máximo 6;
  - ficha con fotos de partes y de Telegram (visor a pantalla completa), qué está armado con su fuente, Street View, Google Maps y Odoo;
  - botones Día/Noche, 2D/3D, General y Modo TV.
- **Modo TV:**
  - pantalla completa y wake lock;
  - recorre «Para decidir» y las obras más viejas, 11 s cada una con titular grande, y cierra con la vista general;
  - se sale con Esc o tocando el mapa;
  - recarga los datos cada 30 min, para que no queden vencidos los días ni las URLs firmadas de Telegram.
- **Mapa 3D** (`src/components/mapa-obras/ciudad/`; geometría pura en `src/lib/mapa-obras/geometria.ts`):
  - MapLibre v5 (sigue fijada en v5 por el worker; ver `fd0badc`) con un estilo propio de noche y de día (`estilo-mapa.ts`) sobre los tiles de OpenFreeMap;
  - cada estructura es `fill-extrusion`, sin three.js: parantes, travesaños, plataformas, baranda, diagonales en escalera y malla, sobre la vereda y con su largo × ancho × alto;
  - desde lejos, una columna por obra (alto según los días);
  - etiquetas en chip;
  - **Orden de capas:** los edificios de OSM se dibujan DESPUÉS de las estructuras y se vuelven translúcidos de cerca. Si no, las tapan: los de z14 vienen simplificados y a veces invaden la vereda.
  - Si OSM no tiene edificio detrás, se dibuja uno aproximado.
- **Servidor** (`src/lib/odoo/mapa-obras.ts`, ruta `/api/operaciones/mapa-obras`):
  - trae los 3 estados (Armado, Pendiente de Desarme, Desarmado), con o sin coordenadas;
  - **medidas** leídas del texto (`medidas.ts`), porque `x_permiso_altura` está en 0 en todas; si no salen del texto, se estiman por tipo y la ficha lo dice;
  - «qué está armado» desde `x_estructura_actual`, o si no la OT de armado;
  - fechas en hora argentina;
  - `ubicacion`: ok / sin_ubicacion / lejos (más de 70 km del Obelisco, el mismo criterio que el geocodificador) / sin_altura;
  - curva semanal;
  - toda lectura de Odoo paginada.
- **Fachada** (`fachada.ts`):
  - para cada obra busca, en los tiles z14 de OpenFreeMap, la calle de su dirección y apoya la estructura sobre la línea municipal del lado de la obra;
  - en la prueba real coincidió la calle en 112 de 114;
  - se cachea con `unstable_cache` (30 días) más memoria; una falla de red no se cachea;
  - si tarda más de 25 s, la respuesta sale sin las que faltan.
- **Fotos de Telegram** (`fotos-telegram.ts`): ahora pagina. Antes se perdían 1392 de las 2392, porque Supabase corta en 1000 sin avisar.
- **Geocodificación** (`src/lib/odoo/geocodificar*.ts`, cron diario `/api/operaciones/geocodificar`):
  - además de lo planificado y las armadas, ahora geocodifica pendientes y desarmadas, con tope de 300 consultas por corrida;
  - vuelve a consultar los puntos guardados que no pasan la validación de hoy (caso «Bolívar 1887», ubicada en la ciudad de Bolívar);
  - lo que Google no resuelve con ninguna variante se marca con `x_obra_geo_dir = "SIN PUNTO: <dirección>"` y no se vuelve a pagar hasta que corrijan la dirección.
- **Tests:** `medidas`, `direccion`, `curva`, `fachada`, `geometria`, `categorias` y `geocodificar-reglas`. 717 en verde al mergear.
- Borrados: `src/components/mapa-obras/mapa-obras.tsx` y `src/lib/mapa-obras/antiguedad.ts`.

### Datos reales al 12/10

| | Cantidad |
|---|---|
| Armadas | 81 (todas con coordenadas; 2 sin altura, 1 lejos) |
| Pendientes de desarme | 11 (4 sin coordenadas) |
| Desarmadas | 371 (solo 29 con coordenadas; el cron completa el resto) |
| Fecha de armado = 24/03/2026 (importación) | 71; se muestran en rosa como «desde la importación» |
| Fotos | 560 de partes (desde 01/09) + 1612 de Telegram asignadas |

### Falta

1. **Probar con sesión real.** La prueba fue en local sin sesión, con el arnés `/prueba/` (las rutas temporales se borraron).
   - Las **fotos de partes** (`/api/operaciones/foto/[id]`) no se pudieron ver en esa prueba; hay que confirmar que se ven en la ficha (por ejemplo San José 190, S01742).
   - También, el **modo TV en la tele** de la oficina.
2. **Geocodificar el histórico:** lo hace solo el cron, de a 300 por día, desde el 13/10.
   - Costo: Places «Text Search Pro» (`places.location`) da 5.000 gratis por mes y después cobra US$32 cada 1.000. Lo normal es que entre en el gratis; el peor caso es de unas 2.000 consultas una sola vez.
   - Revisar a los 2–3 días cuántas quedaron «SIN PUNTO».
3. **Datos a corregir en Odoo** (aparecen en «Para decidir»):
   - **sin calle y número:** «INGENIERIO BUDGE PVCIA BS AS» (S02356) y el puente sobre el Riachuelo (S00128);
   - **mal ubicadas:** «Azara 856» cae sobre Hipólito Yrigoyen y «Av. Gral. Indalecio Chenaut 1749» cerca de Medrano. Están dentro del AMBA, así que el cron no las rehace: hay que borrar las coordenadas o corregir la dirección en la venta.
4. **Corregir la fachada a mano** (girar la estructura y guardarla). No está hecho. Hoy, si Google deja el punto sobre el eje de la calle, la estructura puede quedar del lado equivocado. Haría falta una tabla en Supabase (venta → normal manual) que pise el cálculo.
5. **Medidas como campos:** que el capataz cargue largo × ancho × alto al cerrar el parte, en vez de leerlas del texto.
6. **«Obras en vivo 3D» (F6 del Pizarrón):** la idea es que sea una vista más de este mapa (camiones y cuadrillas del día, con `hd_viajes`), no otra pantalla 3D. Ver `docs/equipos-del-dia/rediseno-plan.md`.
7. **Fotos de Telegram afuera:** 780 de 2392 quedan sin mostrarse porque son de ventas sin estado de obra o en «Pendiente de Armado».
8. **`npm test` con Node 22:** falla en todo el repo, no solo acá, porque Node 22.16 no lee `.ts` sin `--experimental-strip-types`. Correr `NODE_OPTIONS=--experimental-strip-types npm test`, o subir a Node ≥ 23.6.

### Deuda conocida (baja)

- La respuesta pesa ~1,3 MB, casi todo URLs firmadas de Telegram de las desarmadas. Se podría firmar solo al abrir la ficha.
- En el play del histórico cada paso rearma todo el GeoJSON. Una estructura de 60 × 60 m son ~3000 prismas.
- `FuenteTiles` guarda hasta 400 tiles decodificados por instancia.
- El TileJSON no está deduplicado en frío.
- Modo TV: si se sale antes de que resuelvan `requestFullscreen` o el wake lock, pueden quedar tomados.
- Si alguien carga lat/lng a mano y deja `x_obra_geo_dir` vacío, el cron lo pisa. Esto es anterior a este cambio.

### Cómo probarlo en local sin sesión

El proxy deja pasar `/prueba/*` solo en `next dev`. Se arma una página temporal en `src/app/prueba/mapa-obras/page.tsx` que renderice la página del dashboard dentro de `QueryProvider`, más una ruta `src/app/prueba/mapa-obras-datos/route.ts` que devuelva el `GET` real. En Playwright, `page.route('**/api/operaciones/mapa-obras')` responde con ese JSON. **No commitear esas rutas.**
