"use client";

// Los diálogos y hojas de edición viven una sola vez, en el layout: se abren desde el mapa, la
// ficha o «Para revisar» con `abrir(...)` del proveedor.

import { AsignarPersona } from "./asignar-persona";
import { DialogoCambios, DialogoDescartar, DialogoPublicar } from "./dialogo-publicar";
import { EditorPuesto } from "./editor-puesto";
import { EliminarPuesto } from "./eliminar-puesto";
import { MoverA } from "./mover-a";
import { useOrg } from "./proveedor";

export function DialogosOrganigrama() {
  const { dialogo, cerrar, cambios, estado, puedeEditar } = useOrg();
  if (!dialogo || !puedeEditar) return null;
  switch (dialogo.tipo) {
    case "asignar":
      return <AsignarPersona nodo={dialogo.nodo} persona={dialogo.persona} reemplaza={dialogo.reemplaza} onCerrar={cerrar} />;
    case "editar":
      return <EditorPuesto key={dialogo.clave} clave={dialogo.clave} onCerrar={cerrar} />;
    case "mover":
      return <MoverA clave={dialogo.clave} onCerrar={cerrar} />;
    case "eliminar":
      return <EliminarPuesto clave={dialogo.clave} onCerrar={cerrar} />;
    case "cambios":
      return <DialogoCambios titulo="Cambios del borrador" cambios={cambios} nodos={estado.borrador ?? estado.vigente} onCerrar={cerrar} />;
    case "publicar":
      return <DialogoPublicar onCerrar={cerrar} />;
    case "descartar":
      return <DialogoDescartar onCerrar={cerrar} />;
  }
}
