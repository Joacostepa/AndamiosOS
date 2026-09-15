-- ========================================================================
-- Permisos vía pública — encomienda del CPAU con el robot
-- ========================================================================
--
-- QUÉ PROBLEMA RESUELVE: la encomienda profesional del CPAU (RETP) la carga Tamara a mano
-- en retp.cpau.org con la cuenta de Hougassian. El asistente ya está mapeado entero
-- (docs/modulo-gestoria-permisos.md § Asistente "Nuevo RETP"): el robot de la Mac lo puede
-- completar solo con los datos del trámite.
--
-- SUPERVISADO: el robot completa todo y frena en la pantalla Confirmar. La tarea queda en
-- `esperando_aprobacion` con el resumen y las capturas; una persona lo revisa en la ficha y
-- toca "Finalizar", que vuelve la tarea a `pendiente` con payload.finalizar = true. Recién
-- ahí el robot toca Finalizar en el CPAU. Un trámite de prueba nunca se finaliza.
--
-- UNA ENCOMIENDA ABIERTA POR TRÁMITE: el índice único de tareas abiertas era por tipo (diez
-- clics en "Revisar ahora" son una revisión). Con tramite_id pasa a ser por tipo y trámite:
-- dos obras distintas pueden tener su encomienda en curso a la vez, la misma obra no.
--
-- Aplicada a mano con `supabase db query` (NUNCA db push: el historial remoto está vacío).

DO $mig$ BEGIN
  ALTER TABLE pvp_tareas ADD COLUMN IF NOT EXISTS tramite_id UUID REFERENCES pvp_tramites(id) ON DELETE CASCADE;

  ALTER TABLE pvp_tareas DROP CONSTRAINT IF EXISTS pvp_tareas_tipo_check;
  ALTER TABLE pvp_tareas ADD CONSTRAINT pvp_tareas_tipo_check
    CHECK (tipo IN ('tad_revisar', 'odoo_sincronizar', 'cpau_encomienda'));

  ALTER TABLE pvp_tareas DROP CONSTRAINT IF EXISTS pvp_tareas_estado_check;
  ALTER TABLE pvp_tareas ADD CONSTRAINT pvp_tareas_estado_check
    CHECK (estado IN ('pendiente', 'tomada', 'esperando_aprobacion', 'ok', 'error'));

  DROP INDEX IF EXISTS idx_pvp_tareas_una_abierta;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_tareas_una_abierta
    ON pvp_tareas(tipo) WHERE estado IN ('pendiente', 'tomada') AND tramite_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_tareas_una_abierta_por_tramite
    ON pvp_tareas(tipo, tramite_id) WHERE estado IN ('pendiente', 'tomada', 'esperando_aprobacion') AND tramite_id IS NOT NULL;

  ALTER TABLE pvp_eventos DROP CONSTRAINT IF EXISTS pvp_eventos_tipo_check;
  ALTER TABLE pvp_eventos ADD CONSTRAINT pvp_eventos_tipo_check CHECK (tipo IN (
    'alta', 'cambio_estado', 'tarea_subsanacion', 'tarea_resuelta',
    'motivo', 'permiso_descargado', 'vinculado_odoo', 'error_robot', 'caratula_leida',
    'vinculo_confirmado', 'vinculo_descartado', 'odoo_escrito', 'odoo_conflicto',
    'tramite_abierto', 'documento_pedido', 'documento_subido', 'documento_revisado', 'aviso_productor',
    'link_cliente', 'titular_cargado', 'encomienda_cpau'
  ));

  PERFORM pg_notify('pgrst', 'reload schema');
END $mig$;
