"use client";

import { use } from "react";
import { useComputo, useUpdateComputo } from "@/hooks/use-computos";
import { useStock } from "@/hooks/use-stock";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { ArrowRight, ChevronDown, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  borrador: ["verificado"], verificado: ["aprobado", "requiere_ajuste"],
  aprobado: ["en_preparacion"], en_preparacion: ["preparado"],
  requiere_ajuste: ["borrador"], preparado: [],
};
const ESTADO_LABELS: Record<string, string> = {
  borrador: "Borrador", verificado: "Verificado", aprobado: "Aprobado",
  en_preparacion: "En preparacion", preparado: "Preparado", requiere_ajuste: "Requiere ajuste",
};

export default function ComputoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: computo, isLoading } = useComputo(id);
  const { data: stock } = useStock();
  const updateComputo = useUpdateComputo();

  if (isLoading || !computo) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const transitions = ESTADO_TRANSITIONS[computo.estado] || [];
  const items = computo.computo_items || [];

  function getStockDisponible(piezaId: string) {
    return stock?.find((s) => s.pieza_id === piezaId)?.en_deposito || 0;
  }

  const totalPiezas = items.reduce((s, i) => s + i.cantidad_requerida, 0);
  const conFaltante = items.filter((i) => i.cantidad_requerida > getStockDisponible(i.pieza_id));

  return (
    <div className="space-y-6">
      <PageHeader title={`Computo — ${computo.proyectos_tecnicos?.codigo || ""}`}>
        <Badge variant="outline">v{computo.version}</Badge>
        <StatusBadge status={computo.estado} />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Estado<ChevronDown className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((s) => (
                <DropdownMenuItem key={s} onClick={() => updateComputo.mutate({ id, data: { estado: s } }, { onSuccess: () => toast.success(`Cambiado a ${ESTADO_LABELS[s]}`) })}>
                  <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Obra</p><p className="font-medium">{computo.proyectos_tecnicos?.obras?.nombre || "—"}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Piezas unicas</p><p className="text-2xl font-bold">{items.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total unidades</p><p className="text-2xl font-bold">{totalPiezas}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Con faltante</p><p className={`text-2xl font-bold ${conFaltante.length > 0 ? "text-red-400" : "text-green-400"}`}>{conFaltante.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Items del computo</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead><TableHead>Descripcion</TableHead><TableHead>Categoria</TableHead>
                <TableHead>Requerido</TableHead><TableHead>Disponible</TableHead><TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const disp = getStockDisponible(item.pieza_id);
                const falta = item.cantidad_requerida > disp;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.catalogo_piezas?.codigo}</TableCell>
                    <TableCell>{item.catalogo_piezas?.descripcion}</TableCell>
                    <TableCell className="capitalize">{item.catalogo_piezas?.categoria}</TableCell>
                    <TableCell className="font-semibold">{item.cantidad_requerida}</TableCell>
                    <TableCell className={falta ? "text-red-400" : ""}>{disp}</TableCell>
                    <TableCell>
                      {falta ? (
                        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/25">
                          <AlertTriangle className="mr-1 h-3 w-3" />Falta: {item.cantidad_requerida - disp}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                          <CheckCircle className="mr-1 h-3 w-3" />OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {computo.notas && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{computo.notas}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
