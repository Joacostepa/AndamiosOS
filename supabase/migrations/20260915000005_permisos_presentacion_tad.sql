-- ========================================================================
-- Permisos vía pública — presentación automática en TAD
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: con el legajo del cliente, la póliza, la encomienda, el informe y
-- el croquis listos, alguien tiene que entrar a TAD, llenar el formulario "Datos del trámite",
-- adjuntar once documentos y confirmar. Lo hace el robot de la Mac (robot/tad-presentar.mjs).
--
-- AUTOMÁTICO, SIN APROBACIÓN (JS, 2026-09-15: "cuanto menos intervención humana mejor"). En
-- lugar del clic de una persona, el robot frena ante cualquier cosa que no coincide: dirección
-- que no da la sección/manzana/parcela del catastro, formulario que no guarda, adjunto que
-- falla (no reintenta: cada adjunto crea un IF oficial en GDE), pantalla desconocida.
--
-- La tarea es `tad_presentar`, una abierta por trámite (índice de la migración …0004). El
-- resultado deja el expediente creado y vinculado a la venta por número.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_tareas DROP CONSTRAINT IF EXISTS pvp_tareas_tipo_check;
  ALTER TABLE pvp_tareas ADD CONSTRAINT pvp_tareas_tipo_check
    CHECK (tipo IN ('tad_revisar', 'odoo_sincronizar', 'cpau_encomienda', 'tad_presentar'));

  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_tipo_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_tipo_check CHECK (tipo IN (
    'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
    'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot', 'caratula_leida',
    'vinculo_confirmado', 'vinculo_descartado', 'odoo_escrito', 'odoo_conflicto',
    'tramite_abierto', 'documento_pedido', 'documento_subido', 'documento_revisado', 'aviso_productor',
    'link_cliente', 'titular_cargado', 'encomienda_cpau', 'presentacion_tad'
  ));

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
