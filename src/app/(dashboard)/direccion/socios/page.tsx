// Socios 🔒 (/direccion/socios).
//
// Exige las DOS llaves (direccion + direccion-socios; el admin no la trae sola). Sin ellas
// vuelve a La semana con "No tenés acceso a esa sección." y no se calcula nada. Cada
// apertura queda en direccion_auditoria (§10.4). La política y el registro de aperturas se
// leen con la sesión del usuario (RLS: sólo socios), fuera de la caché de la pantalla.

import { MarcoPantalla } from "@/components/direccion";
import { VistaSocios, type PoliticaParaVista } from "@/components/direccion/socios/vista-socios";
import { createClient } from "@/lib/supabase/server";
import { exigirSociosPagina } from "@/lib/direccion/permisos-servidor";
import { ultimasAperturas } from "@/lib/direccion/propios";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { obtenerPantalla } from "@/lib/direccion/servidor";
import { leerPoliticaVigente } from "@/lib/direccion/socios-politica";
import { desvioContraPolitica } from "@/lib/direccion/calculo/socios-reglas";
import type { DetalleSocios } from "@/lib/direccion/calculo/socios";

export default async function PaginaSocios() {
  const s = await exigirSociosPagina();
  const db = await createClient();
  await registrarAuditoria(s.userId, "abrir_socios", { via: "pagina" });
  const [r, pol, aperturas] = await Promise.all([
    obtenerPantalla<DetalleSocios>("socios", { conSocios: true }),
    leerPoliticaVigente(db),
    ultimasAperturas(db, 10),
  ]);
  return (
    <MarcoPantalla respuesta={r}>
      {(r) => {
        const politica: PoliticaParaVista = {
          ...pol,
          desvios: pol.vigente ? desvioContraPolitica(r.detalle.socios.map((x) => ({ clave: x.clave, total: x.anio.total })), pol.vigente.contenido) : null,
        };
        return <VistaSocios resultado={r} politica={politica} aperturas={aperturas} />;
      }}
    </MarcoPantalla>
  );
}
