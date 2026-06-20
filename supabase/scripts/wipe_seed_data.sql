-- ============================================================================
-- ⚠️  WIPE DE DATOS SEED — BORRADO IRREVERSIBLE EN PRODUCCIÓN
-- ============================================================================
-- Deja la base limpia para arrancar con data real desde Odoo.
-- CONSERVA solo: user_profiles (usuarios) y configuracion (config base).
-- Borra TODO lo demás (data de ejemplo): transaccional + personal + inventario
-- + flota + catalogo_piezas (los materiales pasarán a venir de Odoo).
--
-- NO está en supabase/migrations/ a propósito: NO debe correr en deploys automáticos.
-- Correr a mano en el SQL Editor de Supabase, una sola vez.
--
-- ANTES DE CORRER: asegurate de tener backup (PITR de Supabase o pg_dump).
-- ============================================================================

-- (Opcional) Ver cuántas filas hay antes de borrar:
-- SELECT 'clientes' t, count(*) FROM clientes
-- UNION ALL SELECT 'obras', count(*) FROM obras
-- UNION ALL SELECT 'catalogo_piezas', count(*) FROM catalogo_piezas
-- UNION ALL SELECT 'personal', count(*) FROM personal
-- UNION ALL SELECT 'stock', count(*) FROM stock;

BEGIN;

-- TRUNCATE en un solo statement: RESTART IDENTITY resetea las secuencias,
-- CASCADE resuelve las dependencias por FK entre estas tablas.
-- user_profiles y configuracion NO se listan (se conservan) y ninguna de las
-- de abajo es referenciada por ellas, así que CASCADE no las toca.
TRUNCATE TABLE
  actividades,
  alertas,
  audit_log,
  catalogo_piezas,
  clientes,
  computo_items,
  computos,
  comunicaciones,
  cotizacion_imagenes,
  cotizacion_items,
  cotizaciones,
  dispositivos_personal,
  documentos,
  fichadas,
  fletes_zona,
  gates_obra,
  imagenes_referencia,
  incidentes,
  inspecciones,
  insumos,
  lista_precios,
  mantenimientos,
  movimientos,
  obras,
  oportunidades,
  ordenes_trabajo,
  partes_obra,
  periodos_alquiler,
  permisos_municipales,
  personal,
  planificacion_tareas,
  proyecto_archivos,
  proyectos_tecnicos,
  qr_tokens,
  relevamientos,
  remito_items,
  remitos,
  solicitud_extra_items,
  solicitudes_extra,
  stock,
  stock_por_obra,
  vehiculos
RESTART IDENTITY CASCADE;

-- Revisá que user_profiles y configuracion sigan con datos antes de confirmar:
-- SELECT count(*) AS usuarios FROM user_profiles;
-- SELECT count(*) AS config FROM configuracion;

COMMIT;
-- Si algo no cuadra ANTES del COMMIT, ejecutá ROLLBACK; en lugar de COMMIT.
