# Handoff — Pañol (fase 1)

El diseño está en `docs/modulo-panol.md`. Esto es lo que no se lee en el código.

## Estado (10/10/2026)

**En producción** desde el merge del PR #2.

Hecho:
- **Migración** `supabase/migrations/20261010000001_panol.sql`, aplicada a mano con `npx supabase db query --linked -f <archivo>`. **Nunca `db push`**: el historial remoto está vacío. Es idempotente: se puede volver a correr. Antes de aplicarla se probó dos veces seguidas y con un escenario completo dentro de `BEGIN … ROLLBACK`.
- **Ubicaciones raíz**: "Pañol" y "Depósito". Las estanterías, estantes y cajones se agregan en Pañol › Configuración.
- **Usuario del kiosco**: `kiosco.panol@andamiosbuenosaires.com.ar`, con **sólo** "Kiosco del pañol" en "editar" (perfil Campo, para que no le lleguen alertas de la campanita). No es encargado, no ve la oficina y sólo registra movimientos a nombre de quien se identifica. La contraseña la tiene Joaquín. Se loguea en la tablet o el celular fijo del pañol.
- **Encargados**: Ezequiel Jabois Lesser y Juan Agustin Mansilla, con "Pañol" en "editar". Hacen lo de encargado (conteos, anulaciones, ingresos, aprobar ajustes) con su propio usuario.
- **Slack**: no hay canal #pañol todavía. Los avisos van a **#logistica-operativa** (con `SLACK_WEBHOOK_LOGISTICA`). Si se crea el canal y se carga `SLACK_WEBHOOK_PANOL` en Vercel, pasan solos a #pañol (`webhookDe` en `src/lib/alertas/slack.ts`).

Falta:
1. **Cargar artículos y herramientas** (Stock › Nuevo artículo, y las unidades numeradas), generar credenciales y PIN, e imprimir las etiquetas.
2. **Legajos de los encargados**: ni Ezequiel ni Juan Agustin están en Legajos (`personal`). Para que en el kiosco compartido puedan entrar como encargados con PIN, hay que cargarlos en Legajos (pide DNI) y que un admin les vincule el legajo en Pañol › Configuración › Encargados.
3. **Probar con datos reales y con la cámara** en un equipo físico, Android y iPhone.
4. **Equipo fijo del pañol**: se recomienda una tablet Android de 10" con funda y soporte. Mientras no la haya, sirve un celular.

## Reglas que importan
- **El historial no se edita** (hay un trigger que lo frena, incluso con la service role). Los errores se corrigen con **anular**, que hace el movimiento inverso, enlazado al original. El stock (`pan_saldos`) y el lugar y estado de cada herramienta (`pan_unidades.lugar/estado`) los mantiene el trigger: no se escriben a mano.
- **El lugar dice dónde está y quién lo tiene** (`u:` ubicación, `p:` persona, `x:` externa, `c:` cuadrilla, `o:` obra). Ver el encabezado de la migración.
- **Encargado en el kiosco, sólo con PIN.** El código de la credencial va impreso debajo del QR, así que escanearlo identifica pero no da poderes. Por eso los códigos de las credenciales no los puede leer quien no es encargado.
- **Fechas en hora de Buenos Aires** en los dos lados: `pan_hoy()` en SQL y `hoyBA()` en `estado.ts`.
- **Las herramientas numeradas también suman en `pan_saldos`.** Lo que lista unidades tiene que leerlas de `pan_unidades` y no volver a sumarlas desde los saldos (ver `afuera.ts`).
- Los errores de `pan_registrar_vale` traen un código (`LA_TIENE:<lugar>`, `INSPECCION_VENCIDA:<n°>`…) que `leerRechazo()` convierte en lo que sigue para el operario. Si se agrega un código nuevo, hay que sumarlo ahí.

## Mantenimiento
- **Escáner**: `barcode-detector` usa el lector nativo donde existe (Android) y ZXing WASM en iPhone. El `.wasm` lo servimos nosotros desde `public/kiosco/zxing/<versión>/`. **Al actualizar `zxing-wasm` hay que copiar** `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` a la carpeta de la versión nueva. Si falta, un test falla.
- **Tests**: con Node < 22.18, `npm test` necesita `--experimental-strip-types` (`node --no-warnings --experimental-strip-types --test "src/lib/**/*.test.ts"`).

## Lo que queda para la fase 2 o más adelante
- Mantenimiento preventivo y correctivo con planes por tipo, checklist de inspección y fecha prevista de vuelta del taller. Hoy la próxima inspección se carga a mano en la ficha y el bloqueo de préstamo ya funciona.
- Constancia digital de entrega de EPP (Res. SRT 299/11).
- Camionetas como ubicación.
- Offline completo (Serwist + IndexedDB). Hoy, sin señal, el vale queda guardado en el equipo y se manda solo al volver la conexión.
- Pedido de compra automático: hoy es una lista de reposición que se copia.
- Costos desde Odoo: hoy se valoriza con el último costo cargado en el pañol.
- Los faltantes a granel pierden el titular en `pan_saldos`. La bandeja lo reconstruye desde los movimientos.
