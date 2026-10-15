# Handoff — Dirección

El tablero de los socios: siete pantallas que leen Odoo en solo lectura y contestan "cómo estamos y qué hay que decidir". La parte técnica (contrato del código, decisiones de las auditorías, desvíos) está en `docs/direccion/implementacion.md`. Esto es lo que no se lee en el código.

## Estado (15/10/2026)

**En producción** desde el merge de `feat/direccion` (`c57c526`).

Hecho:
- **Pantallas**: La semana, Caja, Ventas, Cobranzas, En la calle, Socios 🔒 y Datos y definiciones. Cada cifra abre su desglose y el desglose cierra contra la cifra ("Total = la cifra ✓"), en USD y en ARS.
- **Migración** `supabase/migrations/20261015000006_direccion.sql`, aplicada a mano el 15/10 con `npx supabase db query --linked -f <archivo>`. **Nunca `db push`**: el historial remoto está vacío. Es idempotente. Crea 9 tablas con RLS (`direccion_*` e `ipc_mensual`) y un trigger en `user_profiles` que registra quién recibe o pierde Socios.
- **Permisos**: módulos `direccion` (ver / editar) y `direccion-socios`. Socios exige permiso explícito: ni el admin lo trae solo, y sólo lo da o lo saca alguien que ya lo tiene. Cada cambio queda en `direccion_auditoria`.
- **Quiénes tienen acceso**: Joaquín, Jorge, Gabriel y Juan Pablo, los cuatro con Dirección = Editar y Socios = Ver. Se cargan en Configuración › Usuarios.
- **Cron** `/api/cron/direccion` a las 04:30 (07:30 UTC, en `vercel.json`): calcula todo y guarda el snapshot del día. Necesita `CRON_SECRET` en Vercel.

Falta:
1. **Confirmar que el primer cron corrió** (16/10 a las 04:30): en el log de Vercel tiene que aparecer `[cron direccion] …: ok` y `direccion_snapshots` tiene que tener filas de ese día.
2. **Revisión en el navegador con sesión**, en escritorio (1440 px) y celular (375 px), claro y oscuro. No se hizo antes de subir.
3. **Primer uso**: fijar el colchón mínimo de caja y asignar dueños en "Para decidir".

## Reglas que importan
- **Dirección no escribe en Odoo, nunca.** Todo pasa por `src/lib/direccion/odoo-lectura.ts`, que sólo deja `search_read`, `read`, `search_count`, `read_group`, `formatted_read_group` y `fields_get`. `guardia.test.ts` falla si alguien importa otra cosa de `src/lib/odoo`. Lo propio (notas, dueños, metas, colchón, política de retiros, avisos manuales) va a Supabase.
- **Regla de los montos**: lo que mide un período va sin IVA y en USD al dólar de cada comprobante; un saldo va con IVA y al dólar de hoy. Venta = facturado neto posteado, no órdenes confirmadas (las reconfirmaciones inflan las órdenes).
- **Nunca 0 por un dato que falta**: se muestra "Sin dato" con el motivo.
- **Lo reservado a socios se recorta en el servidor** (APIs, server components, snapshot y RLS), no se oculta en el navegador.
- **En la calle se deduplica por obra** (`x_obra_id`): una obra con órdenes reemplazadas cuenta una vez.
- **Avisos de calidad**: los automáticos se apagan solos cuando se corrige el dato en Odoo. Los manuales se cargan en Datos y definiciones.

## Pendientes

Para decidir con los socios:
- La política de retiros: proporción y tope. Se carga en la pantalla Socios.
- Metas de los indicadores, en Datos y definiciones.
- La vida útil de los andamios para amortizarlos (hoy se usan 10 años como referencia), con el contador.
- Si en algún momento entra alguien con Dirección pero sin Socios: qué ve en el modo reunión, si alcanza con ocultar el número de comprobante de los circuitos y si los sueldos no registrados del flujo de Caja son reservados (ver `implementacion.md` §14).

Para el contador y administración, en Odoo (los avisos de Calidad los marcan):
- Devengar los Ingresos Brutos de septiembre.
- Cerrar S00084 y S00086, reemplazadas por S00735 / S02163.
- Reimputar los retiros en dólares cargados como gasto a la cuenta particular de cada socio.
- Regularizar Borelli, el registro de cheques de terceros y el plazo de pago de los clientes.

Técnicos:
- Ventas tarda unos 49 s la primera vez que calcula sin caché. Con el snapshot de las 04:30 la primera lectura del día no va a Odoo.
- Guardar el escenario por defecto de Caja (la API ya lo acepta, falta en la pantalla).
- Recomendado: un usuario de Odoo de sólo lectura para Dirección, además de la lista permitida en el código.
- "ARS de hoy" aparece solo cuando se carguen índices en `ipc_mensual`.

## Archivos fuera de git (a propósito)
En `docs/direccion/` quedan, sólo en la máquina de Joaquín y listados en `.gitignore`, porque tienen datos reales de la empresa (caja, deudores, retiros):
- `maqueta.html`: la maqueta interactiva aprobada, con el snapshot del 15/10.
- `diseno.md`: el diseño completo de pantallas, interacciones y diccionario.
- `handoff-maqueta.md`: el traspaso de la maqueta, con las cifras corregidas y las decisiones de UX.

Los datos de origen y las definiciones de cada indicador en Odoo están en el proyecto `Odoo-Claude/direccion/datos/`.
