# Documentación — AndamiosOS

Documentación funcional y de arquitectura del proyecto.
(Las instrucciones para agentes/Claude viven en `/AGENTS.md` y `/CLAUDE.md` en la raíz.)

Cada módulo tiene su carpeta. Dentro, los nombres se repiten:

- **`modulo.md`** — el diseño: qué resuelve, reglas de negocio, pantallas, datos.
- **`handoff.md`** — el estado real y lo que falta. Es lo primero que se lee para retomar en una sesión nueva.
- Otros (`rediseno.md`, `errores.md`, …) — revisiones puntuales con fecha.

Ante una contradicción entre un diseño y el código, manda el código; el `handoff.md` suele decir qué cambió.

## Contenido

### Producto

- [producto/diseno-producto-v1.md](./producto/diseno-producto-v1.md) — Documento fundacional (marzo 2026): visión, módulos y modelo del MVP.
- [producto/flujo-operativo.md](./producto/flujo-operativo.md) — Circuito operativo de referencia (Obra → OT → Habilitación → Ejecución → Remitos → Desarme).

### Módulos

| Módulo | Documentos | Estado |
| --- | --- | --- |
| Asistente comercial y Parámetros de cotización | [modulo](./asistente-comercial/modulo.md) · [handoff](./asistente-comercial/handoff.md) | En producción |
| Permisos de andamio (gestoría vía pública) | [modulo](./permisos/modulo.md) · [handoff](./permisos/handoff.md) · [rediseño 09/10](./permisos/rediseno.md) | En producción |
| Habilitaciones | [modulo](./habilitaciones/modulo.md) · [handoff](./habilitaciones/handoff.md) · [rediseño 09/10](./habilitaciones/rediseno.md) · [inventario](./habilitaciones/inventario.md) · [errores](./habilitaciones/errores.md) · [recorrido](./habilitaciones/recorrido.md) | En producción |
| Pañol | [modulo](./panol/modulo.md) · [handoff](./panol/handoff.md) | Fase 1 en producción |
| Tablero de planificación | [spec](./tablero-planificacion/spec.md) · [handoff](./tablero-planificacion/handoff.md) | En producción |
| Informe de obra | [modulo](./informe-de-obra/modulo.md) | En producción |
| Cómputo de materiales | [modulo](./computo-materiales/modulo.md) | En producción (spec de junio) |
| Configuración de cuadrillas | [modulo](./cuadrillas/modulo.md) | En producción (spec de junio) |

### Archivo

Diseños de cosas que ya no existen. Se guardan como antecedente; no describen la app actual.

- [archivo/planificacion-v1.md](./archivo/planificacion-v1.md) y [archivo/planificacion-v1-mejoras.md](./archivo/planificacion-v1-mejoras.md) — el tablero semanal de junio, reemplazado por el Tablero de planificación.

## Arquitectura: Odoo ↔ AndamiosOS (resumen)

**Odoo = fuente de verdad comercial/administrativa.** AndamiosOS = capa operativa, técnica y de campo.

| Odoo (fuente de verdad) | AndamiosOS (operativo) |
|---|---|
| Clientes (`res.partner`) | Oficina técnica (cómputos) |
| CRM / cotizaciones (`sale.order`) | Remitos, depósito, pañol, logística |
| Facturación (l10n_ar), cobranzas | Habilitaciones, permisos, fichadas, planificación |
| Flota (`fleet.vehicle`) | Obras, órdenes de trabajo |
| Materiales (`product.product`) | |

- **Espejos read-only** desde Odoo: **clientes** y **catálogo de materiales** (sync por API + webhook automático en `on_create_or_write`).
- Integración server-side vía JSON-RPC en `src/lib/odoo/`; endpoints en `src/app/api/odoo/`.
