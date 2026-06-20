# Documentación — AndamiosOS

Documentación funcional y de arquitectura del proyecto.
(Las instrucciones para agentes/Claude viven en `/AGENTS.md` y `/CLAUDE.md` en la raíz.)

## Contenido

- [AndamiosOS_Diseno_Producto_v1.md](./AndamiosOS_Diseno_Producto_v1.md) — Diseño de producto (MVP).
- [flujo-operativo-ABA.md](./flujo-operativo-ABA.md) — Circuito operativo de referencia (Obra → OT → Habilitación → Ejecución → Remitos → Desarme).

## Arquitectura: Odoo ↔ AndamiosOS (resumen)

**Odoo = fuente de verdad comercial/administrativa.** AndamiosOS = capa operativa, técnica y de campo.

| Odoo (fuente de verdad) | AndamiosOS (operativo) |
|---|---|
| Clientes (`res.partner`) | Relevamientos, oficina técnica (cómputos) |
| CRM / cotizaciones (`sale.order`) | Remitos, depósito, logística, control de insumos |
| Facturación (l10n_ar), cobranzas | Habilitaciones, fichadas, planificación |
| Flota (`fleet.vehicle`) | Obras, órdenes de trabajo |
| Materiales (`product.product`) | |

- **Espejos read-only** desde Odoo: **clientes** y **catálogo de materiales** (sync por API + webhook automático en `on_create_or_write`).
- Integración server-side vía JSON-RPC en `src/lib/odoo/`; endpoints en `src/app/api/odoo/`.
- Detalle técnico completo y decisiones: ver la memoria del proyecto (`project_odoo_integration`).
