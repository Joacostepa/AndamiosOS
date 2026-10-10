"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink } from "lucide-react";
import { AVISO } from "@/lib/tablero/colores";
import { MODALIDAD_LABEL, TRAMITE_LABEL, type Permiso } from "@/lib/habilitaciones/tipos";

// Columna derecha de la ficha: el permiso municipal.
//
// VA EN PARALELO A LA DOCUMENTACIÓN porque son dos trámites distintos que avanzan por
// separado. Sólo se cruzan para decidir una cosa: si la obra se puede armar.
//
// SE LEE, NO SE EDITA (decisión de JS, 09/10). Si lleva permiso y con qué se arma lo carga
// Comercial al cotizar; el trámite y el expediente los escribe la gestoría de permisos; y
// si algo está mal se corrige en la venta, en Odoo. Antes acá había botones que escribían
// en la venta, y pasar de "esperar el permiso" a "sin permiso" le sacaba el freno al
// tablero sin que quedara quién lo hizo.
//
// SE GUARDA EN LA VENTA, no en la OT: el permiso es municipal, por dirección, y el armado y
// el desarme de la misma obra lo comparten.

export function ColumnaPermiso({ permiso, urlVenta }: { permiso: Permiso; urlVenta: string | null }) {
  const fecha = (f: string) => format(parseISO(f), "d MMM yyyy", { locale: es });

  return (
    <section className="space-y-3 rounded-md border p-3">
      <header className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Permiso municipal</h3>
        {urlVenta && (
          <a
            href={urlVenta}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
            title="El permiso se guarda en la venta, en Odoo"
          >
            {permiso.ventaNombre ?? "Ver venta"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>

      {/* Se muestra siempre que esté contestada, incluso cuando es "no": saber que esta obra
          no tramita permiso es tan útil como saber que sí. */}
      {permiso.llevaPermiso !== null && (
        <div
          className="rounded-md border px-2.5 py-2 text-[12px]"
          style={
            permiso.llevaPermiso
              ? { backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }
              : undefined
          }
        >
          {permiso.llevaPermiso ? (
            <>
              <strong>Lleva permiso de implantación (GCBA).</strong> La gestoría es nuestra.
            </>
          ) : (
            <span className="text-muted-foreground">
              No lleva permiso de implantación: no hay trámite que gestionar.
            </span>
          )}
        </div>
      )}

      {permiso.llevaPermiso !== false && (
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Con qué se arma</dt>
            <dd className="text-right font-medium">
              {permiso.modalidad ? MODALIDAD_LABEL[permiso.modalidad] : "Sin definir"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Trámite</dt>
            <dd className="text-right font-medium">
              {permiso.tramite ? TRAMITE_LABEL[permiso.tramite] : "Sin datos"}
            </dd>
          </div>
          {permiso.expedienteNro && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Expediente</dt>
              <dd className="text-right font-mono text-[12px]">{permiso.expedienteNro}</dd>
            </div>
          )}
          {permiso.expedienteFecha && (
            <div className="flex justify-between gap-3 text-[12px]">
              <dt className="text-muted-foreground">Presentado</dt>
              <dd>{fecha(permiso.expedienteFecha)}</dd>
            </div>
          )}
          {permiso.permisoFecha && (
            <div className="flex justify-between gap-3 text-[12px]">
              <dt className="text-muted-foreground">Emitido</dt>
              <dd>{fecha(permiso.permisoFecha)}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="border-t pt-2 text-[11px] text-muted-foreground">
        Lo carga Comercial al cotizar y lo actualiza la gestoría de permisos. Si algo está mal,
        se corrige en la venta, en Odoo
        {urlVenta && (
          <>
            {" "}
            (
            <a href={urlVenta} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              abrir {permiso.ventaNombre ?? "la venta"}
            </a>
            )
          </>
        )}
        .
      </p>
    </section>
  );
}
