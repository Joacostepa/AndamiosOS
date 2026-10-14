"use client";

// Versiones (docs/organigrama/propuesta.md § 3.12): el borrador arriba y las publicadas con
// fecha, autor, nota y «Ver cambios» contra la anterior. «Ver esta versión» queda para la fase 3.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { History } from "lucide-react";
import { Chip } from "@/components/permisos-via-publica/ui";
import { Button } from "@/components/ui/button";
import { diasEntre, fechaCorta, nombreCompleto } from "@/lib/organigrama/arbol";
import { hoyBA } from "@/lib/organigrama/datos";
import type { Version } from "@/lib/organigrama/tipos";
import { DialogoCambios } from "./dialogo-publicar";
import { useOrg } from "./proveedor";

function hace(fecha: string): string {
  const d = diasEntre(fecha, hoyBA());
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

function resumen(v: Version): string {
  const n = (t: Version["cambios"][number]["tipo"]) => v.cambios.filter((c) => c.tipo === t).length;
  const partes = [
    n("nuevo") && `${n("nuevo")} ${n("nuevo") === 1 ? "puesto nuevo" : "puestos nuevos"}`,
    n("movido") && `${n("movido")} ${n("movido") === 1 ? "movido" : "movidos"}`,
    n("eliminado") && `${n("eliminado")} ${n("eliminado") === 1 ? "eliminado" : "eliminados"}`,
    n("modificado") && `${n("modificado")} ${n("modificado") === 1 ? "ficha modificada" : "fichas modificadas"}`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Es la base";
}

export function ListaVersiones() {
  const { estado, cambios, dispatch, usuario } = useOrg();
  const router = useRouter();
  const [viendo, setViendo] = useState<Version | null>(null);
  const borrador = estado.borrador && estado.borradorMeta;

  return (
    <div className="space-y-3">
      <ul className="overflow-hidden rounded-md border bg-card">
        {borrador && (
          <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-dashed px-3 py-3 text-[13.5px]">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Borrador</span>
                <Chip tono="neutro" sinIcono>
                  {cambios.length} {cambios.length === 1 ? "cambio" : "cambios"}
                </Chip>
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {estado.borradorMeta!.autor} · {hace(estado.borradorMeta!.fecha)}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-9 max-sm:h-10"
              onClick={() => setViendo({ id: "borrador", numero: null, estado: "borrador", nota: "", fecha: estado.borradorMeta!.fecha, autor: estado.borradorMeta!.autor, cambios })}
            >
              Ver cambios
            </Button>
            <Button
              variant="outline"
              className="h-9 max-md:hidden"
              onClick={() => {
                dispatch({ tipo: "entrar", autor: usuario ? nombreCompleto(usuario) : "Editor" });
                router.push("/organigrama");
              }}
            >
              Abrir
            </Button>
          </li>
        )}
        {estado.versiones.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-3 text-[13.5px] last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">v{v.numero}</span>
                {v.estado === "publicada" && <Chip tono="listo">Vigente</Chip>}
                <span className="text-muted-foreground">
                  {fechaCorta(v.fecha, true)} · {v.autor}
                </span>
              </p>
              <p className="mt-0.5">«{v.nota}»</p>
              <p className="text-[12.5px] text-muted-foreground">{resumen(v)}</p>
            </div>
            {v.cambios.length > 0 && (
              <Button variant="outline" className="h-9 max-sm:h-10" onClick={() => setViendo(v)}>
                <History aria-hidden /> Ver cambios
              </Button>
            )}
          </li>
        ))}
      </ul>
      {estado.versiones.length <= 1 && !borrador && <p className="text-[13px] text-muted-foreground">Solo existe la versión inicial.</p>}
      {viendo && (
        <DialogoCambios
          titulo={viendo.numero ? `Cambios de la versión ${viendo.numero}` : "Cambios del borrador"}
          cambios={viendo.cambios}
          nodos={viendo.numero ? estado.vigente : (estado.borrador ?? estado.vigente)}
          onCerrar={() => setViendo(null)}
        />
      )}
    </div>
  );
}
