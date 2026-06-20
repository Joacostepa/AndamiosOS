"use client";

import { use, useState } from "react";
import { useRemito, useUpdateRemito, useRecibirRemito } from "@/hooks/use-remitos";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils/formatters";
import { ArrowRight, PackageCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";

// Recibido/con_diferencia se manejan por el flujo de recepción (con conteo), no acá.
const ESTADO_TRANSITIONS: Record<string, string[]> = {
  emitido: ["en_transito", "anulado"],
  recibido: ["cerrado"],
  con_diferencia: ["cerrado"],
};

const ESTADO_LABELS: Record<string, string> = {
  emitido: "Emitido", en_transito: "En transito", recibido: "Recibido",
  con_diferencia: "Con diferencia", cerrado: "Cerrado", anulado: "Anulado",
};

const TIPO_LABELS: Record<string, string> = {
  entrega: "Entrega / salida", devolucion: "Devolución", transferencia: "Transferencia",
  sobrante: "Sobrante", control_devolucion: "Control de devolución",
};

const MOTIVO_LABELS: Record<string, string> = {
  sobreestimacion_computo: "Sobreestimación del cómputo", cambio_de_proyecto: "Cambio de proyecto / alcance",
  material_no_usado: "Material no utilizado", otro: "Otro",
};

export default function RemitoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: remito, isLoading } = useRemito(id);
  const updateRemito = useUpdateRemito();
  const recibirRemito = useRecibirRemito();

  const [recepcion, setRecepcion] = useState(false);
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [receptor, setReceptor] = useState("");

  if (isLoading || !remito) {
    return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const transitions = ESTADO_TRANSITIONS[remito.estado] || [];
  const puedeRecibir = remito.estado === "emitido" || remito.estado === "en_transito";

  function handleChangeState(newState: string) {
    updateRemito.mutate(
      { id: remito!.id, data: { estado: newState } },
      { onSuccess: () => toast.success(`Estado: ${ESTADO_LABELS[newState]}`), onError: () => toast.error("Error al cambiar estado") },
    );
  }

  function iniciarRecepcion() {
    const init: Record<string, number> = {};
    remito!.remito_items?.forEach((it) => { init[it.id] = it.cantidad_recibida ?? it.cantidad_remitida; });
    setConteos(init);
    setRecepcion(true);
  }

  function confirmarRecepcion() {
    const items = remito!.remito_items ?? [];
    recibirRemito.mutate(
      {
        id: remito!.id,
        receptor_nombre: receptor || undefined,
        items: items.map((it) => ({ id: it.id, cantidad_recibida: conteos[it.id] ?? it.cantidad_remitida })),
        conteos: items.map((it) => ({ remitida: it.cantidad_remitida, recibida: conteos[it.id] ?? it.cantidad_remitida })),
      },
      {
        onSuccess: () => { toast.success("Recepción registrada"); setRecepcion(false); },
        onError: () => toast.error("Error al registrar la recepción"),
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Remito ${remito.numero}`}>
        <Badge variant="outline" className="capitalize">{TIPO_LABELS[remito.tipo] || remito.tipo}</Badge>
        <StatusBadge status={remito.estado} />
        {!recepcion && puedeRecibir && (
          <Button size="sm" onClick={iniciarRecepcion}><PackageCheck className="mr-2 h-4 w-4" />Registrar recepción</Button>
        )}
        {!recepcion && transitions.map((state) => (
          <Button key={state} variant="outline" size="sm" onClick={() => handleChangeState(state)} disabled={updateRemito.isPending}>
            <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_LABELS[state]}
          </Button>
        ))}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del remito</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Numero" value={remito.numero} />
            <InfoRow label="Tipo" value={TIPO_LABELS[remito.tipo] || remito.tipo} />
            <InfoRow label="Obra" value={remito.obras ? `${remito.obras.codigo} — ${remito.obras.nombre}` : "—"} />
            <InfoRow label="Chofer" value={remito.personal ? `${remito.personal.nombre} ${remito.personal.apellido}` : "—"} />
            <InfoRow label="Receptor" value={remito.receptor_nombre} />
            {remito.motivo && <InfoRow label="Motivo" value={MOTIVO_LABELS[remito.motivo] || remito.motivo} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Emision" value={formatDateTime(remito.fecha_emision)} />
            <InfoRow label="Recepcion" value={formatDateTime(remito.fecha_recepcion)} />
            {remito.tiene_diferencia && (
              <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">Este remito tiene diferencias registradas</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Items ({remito.remito_items?.length || 0})</span>
            {recepcion && (
              <div className="flex items-center gap-2">
                <Input className="h-8 w-44" placeholder="Receptor (opcional)" value={receptor} onChange={(e) => setReceptor(e.target.value)} />
                <Button size="sm" onClick={confirmarRecepcion} disabled={recibirRemito.isPending}>
                  {recibirRemito.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}Confirmar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRecepcion(false)}><X className="h-4 w-4" /></Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead><TableHead>Descripcion</TableHead>
                <TableHead>Remitido</TableHead><TableHead>{recepcion ? "Contar recibido" : "Recibido"}</TableHead><TableHead>Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remito.remito_items?.map((item) => {
                const recibida = recepcion ? (conteos[item.id] ?? item.cantidad_remitida) : item.cantidad_recibida;
                const diff = recibida !== null && recibida !== undefined ? item.cantidad_remitida - recibida : null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.catalogo_piezas?.codigo}</TableCell>
                    <TableCell>{item.catalogo_piezas?.descripcion}</TableCell>
                    <TableCell className="font-semibold">{item.cantidad_remitida}</TableCell>
                    <TableCell>
                      {recepcion ? (
                        <Input type="number" min={0} className="h-8 w-24"
                          value={conteos[item.id] ?? item.cantidad_remitida}
                          onChange={(e) => setConteos((c) => ({ ...c, [item.id]: Number(e.target.value) }))} />
                      ) : (item.cantidad_recibida ?? "—")}
                    </TableCell>
                    <TableCell>
                      {diff !== null && diff !== 0 ? (
                        <span className="text-red-400 font-semibold">{diff > 0 ? `-${diff}` : `+${Math.abs(diff)}`}</span>
                      ) : diff === 0 ? <span className="text-green-400">OK</span> : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {remito.observaciones && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{remito.observaciones}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
