"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActualizarPermiso, useRegistrarGestion } from "@/hooks/use-habilitaciones";
import { AVISO } from "@/lib/tablero/colores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { diasEntre, hoyISO } from "@/lib/habilitaciones/derivacion";
import {
  MODALIDAD_LABEL, TRAMITE_LABEL,
  type ModalidadPermiso, type Permiso, type TramiteEstado,
} from "@/lib/habilitaciones/tipos";

// Columna derecha de la ficha: el permiso municipal.
//
// VA EN PARALELO A LA DOCUMENTACIÓN porque son dos trámites distintos que avanzan por
// separado y se reclaman a TRES INTERLOCUTORES: el cliente decide la modalidad, el
// técnico la transmite, y el gobierno emite. Sólo se cruzan para decidir una cosa: si la
// obra se puede armar.
//
// SE GUARDA EN LA VENTA, no en la OT: el permiso es municipal, por dirección, y el
// armado y el desarme de la misma obra lo comparten.

const MODALIDADES: ModalidadPermiso[] = ["sin_permiso", "con_expediente", "esperar_permiso"];
const TRAMITES: TramiteEstado[] = ["no_presentado", "presentado", "emitido"];

export function ColumnaPermiso({
  otId,
  permiso,
  urlVenta,
  pedidosPrevios,
}: {
  otId: number;
  permiso: Permiso;
  urlVenta: string | null;
  pedidosPrevios: number;
}) {
  const actualizar = useActualizarPermiso(otId);
  const gestion = useRegistrarGestion(otId);
  const [expediente, setExpediente] = useState(permiso.expedienteNro ?? "");

  const diasSinDefinir = permiso.modalidadDefinida
    ? null
    : permiso.modalidad
      ? null
      : diasEntre(permiso.modalidadDefinida ?? hoyISO(), hoyISO());

  function guardar(cambio: Parameters<typeof actualizar.mutate>[0]) {
    actualizar.mutate(cambio, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
    });
  }

  return (
    <section className="space-y-4 rounded-md border p-3">
      <header className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Permiso municipal</h3>
        {urlVenta && (
          <a
            href={urlVenta}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
            title="El permiso se guarda en la venta, que la gestiona Comercial en Odoo"
          >
            {permiso.ventaNombre ?? "Ver venta"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>

      {/* SI LLEVA GESTORÍA O NO. Es la primera de las dos preguntas y la contesta Comercial
          al cotizar, en la solapa "Trabajo a ejecutar" de la venta — acá se LEE, no se
          edita, porque es parte de lo que se vendió y se cobró.

          Se muestra siempre que esté contestada, incluso cuando es "no": saber que esta
          obra no tramita permiso es tan útil como saber que sí, y es lo que explica por
          qué abajo no hay modalidad que elegir. */}
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

      {/* LA DECISIÓN ES DEL CLIENTE. Nosotros no la elegimos: la transmite el técnico. */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Con qué se arma
        </Label>
        <div className="flex flex-col gap-1">
          {MODALIDADES.map((m) => (
            <button
              key={m}
              onClick={() => guardar({ modalidad: m })}
              disabled={actualizar.isPending}
              className="flex items-center gap-2 rounded border px-2 py-1.5 text-left text-[13px] hover:bg-muted/50"
              style={
                permiso.modalidad === m
                  ? { backgroundColor: "#EAF3DE", borderColor: "#27500A" }
                  : undefined
              }
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border"
                style={permiso.modalidad === m ? { backgroundColor: "#27500A" } : undefined}
              />
              {MODALIDAD_LABEL[m]}
            </button>
          ))}
        </div>

        {permiso.modalidad ? (
          permiso.modalidadDefinida && (
            <p className="text-[11px] text-muted-foreground">
              Definida el {format(parseISO(permiso.modalidadDefinida), "d MMM yyyy", { locale: es })}
            </p>
          )
        ) : (
          // La espera interna se ve igual que la externa. Los 399 días de mediana
          // existen porque este número no estaba en ningún lado.
          <div className="space-y-2 rounded border px-2 py-2" style={{ backgroundColor: "#FEF6E7" }}>
            <p className="text-[12px]">
              Sin definir{diasSinDefinir !== null ? ` hace ${diasSinDefinir} días` : ""} · esperando a{" "}
              <strong>{permiso.tecnicoNombre ?? "el técnico"}</strong>
              {pedidosPrevios > 0 && ` · ${pedidosPrevios} ${pedidosPrevios === 1 ? "pedido" : "pedidos"}`}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={gestion.isPending}
              onClick={() =>
                gestion.mutate(
                  {
                    tipo: "consulta",
                    detalle: `${pedidosPrevios + 1}º pedido de modalidad a ${permiso.tecnicoNombre ?? "el técnico"}`,
                  },
                  { onSuccess: () => toast.success("Pedido registrado") },
                )
              }
            >
              {gestion.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Registrar pedido a {permiso.tecnicoNombre?.split(" ")[0] ?? "el técnico"}
            </Button>
            {/* Los botones sólo registran: el mail lo manda Agustina por fuera. */}
            <p className="text-[10px] text-muted-foreground">
              No manda mail: registra la fecha del pedido.
            </p>
          </div>
        )}
      </div>

      {/* EL TRÁMITE ES GESTIÓN DE ABA y avanza solo, a diferencia de la modalidad. */}
      <div className="space-y-2 border-t pt-3">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Trámite de ABA
        </Label>
        <div className="flex gap-1">
          {TRAMITES.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={permiso.tramite === t ? "default" : "outline"}
              className="flex-1 text-[12px]"
              disabled={actualizar.isPending}
              onClick={() =>
                guardar({
                  tramite: t,
                  ...(t === "emitido" && !permiso.permisoFecha ? { permisoFecha: hoyISO() } : {}),
                  ...(t === "presentado" && !permiso.expedienteFecha
                    ? { expedienteFecha: hoyISO() }
                    : {}),
                })
              }
            >
              {TRAMITE_LABEL[t]}
            </Button>
          ))}
        </div>

        {/* 115 obras se armaron amparadas en un expediente cuyo número no está en la
            planilla ni en Odoo. Este campo es la razón por la que se creó primero. */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="expediente" className="text-[11px]">Expediente N°</Label>
            <Input
              id="expediente"
              value={expediente}
              onChange={(e) => setExpediente(e.target.value)}
              onBlur={() => {
                if (expediente.trim() !== (permiso.expedienteNro ?? "")) {
                  guardar({ expedienteNro: expediente.trim() || null });
                }
              }}
              placeholder="Sin cargar"
              className="h-8 text-[13px]"
            />
          </div>
        </div>

        <dl className="space-y-0.5 text-[11px] text-muted-foreground">
          {permiso.expedienteFecha && (
            <div className="flex justify-between">
              <dt>Presentado</dt>
              <dd>{format(parseISO(permiso.expedienteFecha), "d MMM yyyy", { locale: es })}</dd>
            </div>
          )}
          {permiso.permisoFecha && (
            <div className="flex justify-between">
              <dt>Emitido</dt>
              <dd>{format(parseISO(permiso.permisoFecha), "d MMM yyyy", { locale: es })}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
