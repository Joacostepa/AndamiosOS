"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Check, CircleDashed, Clock, Loader2, Paperclip, Plus, Trash2, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAdjuntos, useAgregarRequisito, useBorrarAdjunto, useBorrarRequisito,
  useCambiarRequisito, usePaquetes, useSubirAdjunto, urlFirmada,
} from "@/hooks/use-habilitaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { diasEntre, hoyISO } from "@/lib/habilitaciones/derivacion";
import type { EstadoRequisito, Requisito } from "@/lib/habilitaciones/tipos";

// Listado de requisitos. Es lo que hace usable una obra exigente.
//
// LA APROBACIÓN NO ES GLOBAL: en una obra exigente el cliente aprueba 7 documentos y
// observa 2. Con un solo tilde eso no se puede representar — y ese rebote es justamente
// lo que hace que una habilitación tarde semanas. Por eso cada requisito tiene estado
// propio, y `observado` lleva el motivo escrito al lado.

const ICONO: Record<EstadoRequisito, typeof Check> = {
  aprobado: Check,
  observado: TriangleAlert,
  enviado: Clock,
  pendiente: CircleDashed,
};

const COLOR: Record<EstadoRequisito, string> = {
  aprobado: "#27500A",
  observado: "#912018",
  enviado: "#B54708",
  pendiente: "var(--muted-foreground)",
};

const SIGUIENTE: Record<EstadoRequisito, string> = {
  pendiente: "Marcar enviado",
  enviado: "Aprobar",
  observado: "Corregir y reenviar",
  aprobado: "Volver a pendiente",
};

export function ListadoRequisitos({ otId, requisitos }: { otId: number; requisitos: Requisito[] }) {
  const cambiar = useCambiarRequisito(otId);
  const agregar = useAgregarRequisito(otId);
  const borrar = useBorrarRequisito(otId);
  const { data: paquetes } = usePaquetes();

  const [nuevo, setNuevo] = useState("");
  const [observando, setObservando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const aprobados = requisitos.filter((r) => r.estado === "aprobado").length;

  function avanzar(r: Requisito) {
    const destino: EstadoRequisito =
      r.estado === "pendiente" ? "enviado"
      : r.estado === "enviado" ? "aprobado"
      : r.estado === "observado" ? "enviado"
      : "pendiente";
    cambiar.mutate(
      { requisitoId: r.id, estado: destino },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar") },
    );
  }

  function observar(requisitoId: string) {
    if (!motivo.trim()) {
      toast.error("Escribí por qué lo rebotaron");
      return;
    }
    cambiar.mutate(
      { requisitoId, estado: "observado", motivo },
      {
        onSuccess: () => { setObservando(null); setMotivo(""); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
      },
    );
  }

  return (
    <div className="rounded-md border">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">
          {requisitos.length} {requisitos.length === 1 ? "requisito" : "requisitos"} ·{" "}
          {aprobados} {aprobados === 1 ? "aprobado" : "aprobados"}
        </h3>

        {/* El paquete es un punto de partida, no una jaula: una vez aplicado, los
            requisitos se agregan y se quitan uno por uno. Cambiar de paquete no borra
            los que ya se enviaron ni los agregados a mano. */}
        <div className="ml-auto w-52">
          <Select
            onValueChange={(paqueteId: string | null) => {
              if (!paqueteId) return;
              agregar.mutate(
                { paqueteId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo aplicar") },
              );
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Aplicar un paquete…" />
            </SelectTrigger>
            <SelectContent>
              {(paquetes ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre} · {p.requisitos.length}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <ul>
        {requisitos.map((r) => {
          const Icono = ICONO[r.estado];
          const sinRespuesta =
            r.estado === "enviado" && r.fecha_envio ? diasEntre(r.fecha_envio, hoyISO()) : null;

          return (
            <li
              key={r.id}
              className="border-b px-3 py-2 text-[13px] last:border-b-0"
              style={r.estado === "observado" ? { backgroundColor: "#FDECEA" } : undefined}
            >
              <div className="flex items-center gap-2">
                <Icono className="h-4 w-4 shrink-0" style={{ color: COLOR[r.estado] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.nombre}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {r.estado === "aprobado" && r.fecha_resolucion
                      ? `Aprobado el ${format(parseISO(r.fecha_resolucion), "d MMM", { locale: es })}`
                      : r.estado === "enviado" && r.fecha_envio
                        ? `Enviado el ${format(parseISO(r.fecha_envio), "d MMM", { locale: es })}${
                            sinRespuesta !== null ? ` · ${sinRespuesta} d sin respuesta` : ""
                          }`
                        : r.estado === "observado"
                          ? "Observado por el cliente"
                          : r.origen === "manual"
                            ? "Agregado a mano"
                            : "Por preparar"}
                  </span>
                </span>

                <Adjuntos otId={otId} requisitoId={r.id} />

                <Button size="sm" variant="outline" onClick={() => avanzar(r)} disabled={cambiar.isPending}>
                  {SIGUIENTE[r.estado]}
                </Button>

                {r.estado === "enviado" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setObservando(r.id); setMotivo(""); }}
                    title="El cliente lo rebotó"
                  >
                    Observar
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() =>
                    borrar.mutate(r.id, {
                      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo borrar"),
                    })
                  }
                  title="El cliente no lo pide"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* EL MOTIVO SE VE SIN ABRIR NADA: es lo que evita volver a leer el mail. */}
              {r.estado === "observado" && r.motivo_obs && (
                <p className="mt-1 pl-6 text-[12px]" style={{ color: "#912018" }}>
                  {r.motivo_obs}
                </p>
              )}

              {observando === r.id && (
                <div className="mt-2 flex items-start gap-2 pl-6">
                  <Textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Por qué lo rebotaron — ej: falta la foto carnet de dos operarios"
                    className="min-h-16 text-[13px]"
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => observar(r.id)} disabled={cambiar.isPending}>
                      {cambiar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setObservando(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 border-t px-3 py-2">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Agregar requisito — nombre libre"
          className="h-8 text-[13px]"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !nuevo.trim()) return;
            agregar.mutate({ nombre: nuevo.trim() }, { onSuccess: () => setNuevo("") });
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!nuevo.trim() || agregar.isPending}
          onClick={() => agregar.mutate({ nombre: nuevo.trim() }, { onSuccess: () => setNuevo("") })}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Agregar
        </Button>
      </div>
    </div>
  );
}

/**
 * LOS ARCHIVOS CUELGAN DEL REQUISITO, NO DE LA OBRA. Si el cliente observa las
 * capacitaciones, se sabe exactamente qué reemplazar; con todo colgado de la obra hay
 * que adivinar cuál de los nueve PDFs es.
 */
function Adjuntos({ otId, requisitoId }: { otId: number; requisitoId: string }) {
  const { data: adjuntos } = useAdjuntos(otId, requisitoId);
  const subir = useSubirAdjunto(otId, requisitoId);
  const borrar = useBorrarAdjunto(otId, requisitoId);
  const [abierto, setAbierto] = useState(false);

  const n = adjuntos?.length ?? 0;

  return (
    <div className="relative shrink-0">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[12px]"
        onClick={() => setAbierto((v) => !v)}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {n > 0 ? n : ""}
      </Button>

      {abierto && (
        <div className="absolute right-0 top-8 z-20 w-72 rounded-md border bg-popover p-2 shadow-md">
          <ul className="mb-2 space-y-1">
            {(adjuntos ?? []).map((a) => (
              <li key={a.path} className="flex items-center gap-1 text-[12px]">
                <button
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={async () => {
                    const url = await urlFirmada(a.path);
                    if (url) window.open(url, "_blank");
                    else toast.error("No se pudo abrir el archivo");
                  }}
                >
                  {a.nombre}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => borrar.mutate(a.path)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
            {n === 0 && <li className="text-[12px] text-muted-foreground">Sin archivos</li>}
          </ul>

          <Input
            type="file"
            className="h-8 text-[12px]"
            disabled={subir.isPending}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (!archivo) return;
              subir.mutate(archivo, {
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : "No se pudo subir"),
              });
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
