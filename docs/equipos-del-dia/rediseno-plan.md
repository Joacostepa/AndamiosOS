# Rediseño de la Hoja del día — plan de implementación

Aprobado por el dueño el 12/10/2026 a partir de dos maquetas interactivas:

- `docs/equipos-del-dia/maqueta/pizarron.html` — **Pizarrón del día** (planificación). Es la especificación funcional: comportamiento, textos y gestos.
- `docs/equipos-del-dia/maqueta/en-vivo-3d.html` — **Obras en vivo** (3D, seguimiento de la jornada).
- Relevamientos: `maqueta/01-ux-actual.md`, `02-referentes.md`, `03-tecnico.md`, `propuesta.md`.

**La idea en una línea:** casi todo lo que muestra la maqueta ya está en el modelo. El pizarrón es otra forma de ver el mismo `DiaHoja` y de mandar las mismas acciones. Faltan cuatro cosas: el depósito como sector, una acción explícita por parada, coordenadas para direcciones libres y la marca "Salí".

## A. De la maqueta al modelo actual

| Maqueta | Hoy | Qué falta |
|---|---|---|
| Columna Cuadrilla N (gente, a cargo) | `hd_hojas` + `hd_integrantes` (una persona por día, un a cargo por hoja) | Nada |
| "4 de 5" | `ObraDia.personalPorJornada` | Nada |
| Camión en una columna con atajo todo el día / lleva·busca | `hd_hoja_vehiculos` + lleva/busca en `hd_viajes` | Nada |
| Chofer del camión | `hd_hoja_vehiculos.chofer_id`, `hd_camiones_dia`, `hd_viajes.chofer_id`, `choferDe` | Nada (el pizarrón traduce a `vehiculo_cambiar` / `chofer_del_camion`) |
| Sin asignar / No vienen | `estado.ts` / `hd_ausencias` (+ asistencia de Odoo) | Nada |
| Contratistas ± | `hd_hoja_contratistas` | Nada |
| Obras multi del día con hora y traslado | `ObraDia.ordenDia/fraccion`, `hd_instrucciones.hora_inicio`, viaje `mueve` | Nada (presentación) |
| Qué se ejecuta | `ObraDia.tipo/detalleTecnico/dia/totalDias` + `hd_instrucciones` | Nada |
| Pedido | `hd_pedidos` | `hacia_lat/lng` para "otra dirección" |
| Pedido con camión = parada | `hd_pedidos.viaje_id` → `hd_viajes` | Nada |
| "La cuadrilla en su camión" | `con_lleva` | Nada |
| Recorrido | `hd_viajes` del camión ordenados por `orden` | `accion`, `hora_aprox`, lat/lng |
| Mandar / confirmó | `hd_links` (snap, `recibida_at`), Telegram | "Ya confirmó (por teléfono)" |
| No vino (asistencia) | `ausenciasDeAsistencia` | Nada |
| Depósito como columna | No existe | **Hoja de sector** |
| Deshacer | `hd_historial` + `hd_aplicar` + `deshacer-regla.ts` | Sumar tablas nuevas a las listas blancas |
| 3D: posición del camión | `calcVeh` + `dondeAnda` + `hecho_at` | `salio_at` ("Salí") |

### El recorrido sobre `hd_viajes`
- Una parada es un viaje: `vehiculo_id` + `orden` (NUMERIC, insertar = punto medio), `hacia_*` (obra / lugar / texto + **`hacia_lat/lng` nuevas**), `hora`, `carga` = nota, `chofer_id` con la regla de siempre. Lleva y busca siguen sin guardar la obra (`haciaDe`).
- **`hd_viajes.accion`** nueva (nullable, CHECK): `lleva_gente`, `deja_material`, `carga`, `descarga`, `busca_gente`, `compra`, `espera`. Si es null se deriva del `tipo`. No se amplía el CHECK de `tipo`.
- Vuelta al depósito y salida: **paradas virtuales** (salen de `vuelta`/`vuelta_llega` y `carga_deposito`), sin backfill.
- Atajos = modo del renglón (`planVehiculos`). "Recorrido a mano" = el camión tiene viajes además de los del renglón.
- **`hora_aprox`** (BOOLEAN, default false): hora como pista, sin aviso de choque; candado = fija (decisión 1).

### Depósito como sector
- `hd_hojas.sector TEXT NOT NULL DEFAULT 'cuadrilla' CHECK (sector IN ('cuadrilla','deposito'))`, depósito con `cuadrilla_odoo_id = 0` reservado y `CHECK ((sector='deposito') = (cuadrilla_odoo_id=0))`. El UNIQUE `(fecha, cuadrilla_odoo_id)` da un depósito por día; `hd_integrantes` no cambia.
- `DiaHoja.cuadrillas` suma una cuadrilla sintética `{ odooId: 0, nombre: "Depósito", deposito: true }`.
- Cercar el 0 en: cierre / parte de Odoo, `alertasDelDia`, `fetchTableroDeFechas`, `problemas()` (siempre presente). `planCopiarComoHoy` sí lo copia.
- Refuerzos con hora (`hd_refuerzos`) quedan para una fase opcional (decisión 2).

### Confirmaciones de la mañana
- Capataz y chofer: `hd_links.recibida_at` = confirmó; enviada sin recibir = no confirmó.
- No vino: ausencia de asistencia o cargada esa mañana.
- "Ya confirmó" a mano: acción `confirmar_a_mano` + `hd_links.recibida_canal`.

## B. Arquitectura de la UI
- Rutas paralelas: `/planificacion/hoja/pizarron?dia=` y `/planificacion/hoja/en-vivo` (módulo `hoja-dia`). Cuadrillas y Camiones pasan a un grupo `(clasica)/` con el layout actual.
- `src/components/hoja-dia/pizarron/`: `pizarron.tsx`, `barra-dia.tsx`, `columna.tsx`, `ficha-persona.tsx`, `ficha-camion.tsx`, `ficha-contratista.tsx`, `bandeja.tsx`, `pedidos.tsx`, `nuevo-pedido.tsx`, `mini-mapa.tsx`, `quien-pasa-cerca.tsx`, `recorrido.tsx`, `mandar.tsx`, `repaso/*`, `use-flip.ts`.
- Lógica pura nueva con tests: `pizarron.ts`, `gestos-pizarron.ts`, `recorrido.ts` (`paradasDe`, `planRecorrido`, `mejorHueco`, `quienPasaCerca`), `repaso.ts`, `en-vivo.ts`.
- Se reusa: `estado.ts`, `vehiculos.ts`, `contratistas.ts`, `mensajes.ts`, `envios.ts`, `telegram.ts`, `publico.ts`, `tiempos.ts`, `rutas.ts`, `optimista.ts`, `use-hoja-dia.ts`, `comunes/`. El celular `/h/` queda.
- Se retira en F7: `components/hoja-dia/camiones/*`, `cuadrillas/{editor-chofer,vista-cuadrillas,tarjeta,panel-gente}.tsx`, `comunes/linea-bandeja.tsx`, `vista-cuadrillas.ts`, `camiones.ts` (lo vivo pasa a `pizarron.ts`), `posicionAuto`.
- Librerías: arrastre con **@dnd-kit** (ya está) + `use-flip` para la animación; **three** de npm cargado con `next/dynamic({ ssr:false })` desde un componente cliente (ojo color management r152+); mini-mapa con **MapLibre** como `mapa-obras.tsx`.

## C. Datos y APIs
Migraciones idempotentes, probadas en `BEGIN … ROLLBACK` dos veces antes de aplicar:
1. `20261013000001_hoja_dia_deposito.sql`: `hd_hojas.sector` + CHECK, `hd_links.recibida_canal`, parámetro `hd_parametros.pizarron` (`oculto|probar|principal`), `deposito.encuentro`.
2. `20261014000001_hoja_dia_recorridos.sql`: `hd_viajes.accion`, `hacia_lat/lng`, `desde_lat/lng`, `hora_aprox`, `salio_at`; `hd_pedidos.hacia_lat/lng`, `desde_lat/lng`.
3. (Opcional) `…_hoja_dia_refuerzos.sql`.

Columnas nuevas nullable: el código viejo sigue andando con la migración aplicada. Fotos de links viejos: los campos nuevos se comparan sólo si están en los dos lados.

Gestos nuevos (zod, `conGrabador`): `parada_crear`, `parada_editar`, `reordenar`, `recorrido_atajo`, `salio`; `poner_pedido` con orden por desvío (el servidor lo recalcula y valida: nunca antes de la parada en curso); pedido `crear` con lat/lng; `confirmar_a_mano`. `GET /api/hoja-dia/geocodificar?dir=` reusando `geocodificar-reglas.ts` (debounce, caché). "¿Quién pasa cerca?" puro en el cliente.

Optimismo: `optimista.ts` suma `chofer_del_camion` y depósito; nuevo `optimista-viajes.ts` (paradas, reordenar, poner pedido con la misma `mejorHueco`, mover, hecho, volver a la cola) + `useGestoViaje`.

## D. Fases
Parámetro `pizarron`: `oculto` → nadie lo ve; `probar` → pestaña "Pizarrón (nuevo)" para editores; `principal` → `/planificacion/hoja` redirige al pizarrón y lo clásico sigue en `/cuadrillas` y `/camiones`. Las dos UIs escriben las mismas tablas con las mismas acciones.

| Fase | Tamaño | Alcance | Migración |
|---|---|---|---|
| F0 Andamiaje | S | Grupo `(clasica)`, ruta pizarrón vacía, parámetro, pestaña condicional, arnés Playwright permanente en `e2e/` | (parámetro) |
| F1 Pizarrón base | L | Columnas, fichas, bandeja, arrastre/tocar/teclas, camión en columna, chofer, contratistas, No vienen, avisos-insignia, días, Copiar, Mandar, Deshacer, qué se ejecuta, multi-obra | — |
| F2 Depósito | M | Sector depósito, encargado, cercos, mensaje y link. **Hecho el 12/10** (rama `feat/hoja-dia-deposito`) | 1 |
| F3 Recorrido | L | Editor de paradas, acciones, reordenar, optimista de viajes, celular y Telegram del chofer. **Hecho el 12/10** (rama `feat/hoja-dia-recorrido`; "Salí" queda para F6) | 2 |
| F4 Pedidos | M | Panel, otra dirección + geocodificar + pin, inserción por desvío, quién pasa cerca | (2) |
| F5 Repaso de la mañana | M | Overlay tarjeta por tarjeta, corregir en vivo, para revisar, mandar a afectados | (1) |
| F6 Obras en vivo 3D | L | "Salí", `en-vivo.ts`, escena Three portada | (2) |
| F7 Cambio y retiro | S | `principal`, dos semanas de convivencia, borrar lo viejo, docs. **Cuadrillas: hecho el 12/10** (pedido del dueño: sin convivencia; el pizarrón es fijo, sin parámetro). Camiones queda hasta F3/F4 | — |
| F8 Refuerzos con hora (opcional) | M | `hd_refuerzos` | 3 |

Cada fase: tests node de la lógica pura, Playwright con APIs interceptadas (1366 y 390 px, `prefers-reduced-motion`), `tsc`, `eslint`, `build`; migraciones en BEGIN/ROLLBACK antes de aplicar; aplicar antes del deploy.

## E. Decisiones del dueño
Ver la sección "Decisiones" al final (se completa a medida que el dueño responde).

## Riesgos
- Acoplamiento con `estado.ts`: tests por caso.
- El 0 del depósito filtrándose a Odoo: cercos y tests.
- Diferencias fantasma en links ya enviados.
- Optimista de viajes: misma `mejorHueco` en cliente y servidor.
- Dos UIs editando a la vez durante la convivencia: mismas acciones y mismos textos.
- Rendimiento del 3D y del pizarrón en PCs modestas.
- Costos de Google (geocodificar con debounce y caché).

## Decisiones (12/10/2026)
1. **Horas del recorrido: aproximadas.** `hora_aprox` por defecto en las paradas nuevas: no generan avisos de choque; el candado la vuelve fija (p. ej. turno de VTV) y ahí sí avisa.
2. **Refuerzos desde una hora: sí.** F8 deja de ser opcional: "Refuerza la 3 desde las 11" (a la mañana sigue en el depósito, después va a la obra), con `hd_refuerzos`.
3. **Cuadrilla sin obra ese día** (por defecto, el dueño puede cambiarlo): la columna aparece grisada con "sin obra en el tablero" y no acepta gente.
4. **Niveles en el 3D: sin niveles.** Sólo "armando" / "desarmando" / "mantenimiento", sin cantidad de niveles ni barrita.
5. **Confirmación** (por defecto): confirman el capataz y el chofer; el resto figura "avisado".
6. **Botón "Salí" del chofer: sí** (celular y Telegram), con `salio_at`.
