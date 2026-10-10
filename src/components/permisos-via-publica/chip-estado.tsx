import { nombreEstado, tonoEstado, type Expediente } from "@/lib/permisos-via-publica/tipos";
import { Chip } from "./ui";

// El estado de un expediente con el nombre del glosario (rediseño 09/10): "Hay que corregir",
// "Presentado", "Permiso emitido", "Archivado sin permiso". El nombre de TAD va aparte, como dato.

export function ChipEstado({
  expediente,
  className,
}: {
  expediente: Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente" | "permiso_notificacion">;
  className?: string;
}) {
  return (
    <Chip tono={tonoEstado(expediente)} className={className}>
      {nombreEstado(expediente)}
    </Chip>
  );
}
