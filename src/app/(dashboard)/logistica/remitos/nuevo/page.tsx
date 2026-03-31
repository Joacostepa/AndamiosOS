"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useObras } from "@/hooks/use-obras";
import { useCatalogo } from "@/hooks/use-catalogo";
import { useCreateRemito, type CreateRemitoData } from "@/hooks/use-remitos";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ItemRow = {
  pieza_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
};

export default function NuevoRemitoPage() {
  const router = useRouter();
  const { data: obras } = useObras();
  const { data: catalogo } = useCatalogo();
  const createRemito = useCreateRemito();

  const [tipo, setTipo] = useState<CreateRemitoData["tipo"]>("entrega");
  const [obraId, setObraId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedPieza, setSelectedPieza] = useState("");
  const [cantidad, setCantidad] = useState(1);

  function addItem() {
    if (!selectedPieza || cantidad < 1) return;
    const pieza = catalogo?.find((p) => p.id === selectedPieza);
    if (!pieza) return;

    const existing = items.find((i) => i.pieza_id === selectedPieza);
    if (existing) {
      setItems(
        items.map((i) =>
          i.pieza_id === selectedPieza
            ? { ...i, cantidad: i.cantidad + cantidad }
            : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          pieza_id: pieza.id,
          codigo: pieza.codigo,
          descripcion: pieza.descripcion,
          cantidad,
        },
      ]);
    }
    setSelectedPieza("");
    setCantidad(1);
  }

  function removeItem(piezaId: string) {
    setItems(items.filter((i) => i.pieza_id !== piezaId));
  }

  function handleSubmit() {
    if (!obraId) {
      toast.error("Selecciona una obra");
      return;
    }
    if (items.length === 0) {
      toast.error("Agrega al menos una pieza");
      return;
    }

    createRemito.mutate(
      {
        tipo,
        obra_id: obraId,
        observaciones: observaciones || undefined,
        items: items.map((i) => ({
          pieza_id: i.pieza_id,
          cantidad: i.cantidad,
        })),
      },
      {
        onSuccess: (remito) => {
          toast.success(`Remito creado: ${remito.numero}`);
          router.push(`/logistica/remitos/${remito.id}`);
        },
        onError: () => {
          toast.error("Error al crear el remito");
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo Remito" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de remito *</Label>
              <Select
                value={tipo}
                onValueChange={(val) =>
                  val && setTipo(val as CreateRemitoData["tipo"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrega">Entrega (deposito → obra)</SelectItem>
                  <SelectItem value="devolucion">
                    Devolucion (obra → deposito)
                  </SelectItem>
                  <SelectItem value="transferencia">
                    Transferencia (obra → obra)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={obraId} onValueChange={(val) => val && setObraId(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar obra..." />
                </SelectTrigger>
                <SelectContent>
                  {obras?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.codigo} — {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agregar piezas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pieza</Label>
              <Select
                value={selectedPieza}
                onValueChange={(val) => val && setSelectedPieza(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar pieza..." />
                </SelectTrigger>
                <SelectContent>
                  {catalogo?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} — {p.descripcion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <div className="space-y-2 flex-1">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={addItem} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Items del remito ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.pieza_id}>
                    <TableCell className="font-mono text-sm">
                      {item.codigo}
                    </TableCell>
                    <TableCell>{item.descripcion}</TableCell>
                    <TableCell className="font-semibold">
                      {item.cantidad}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.pieza_id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              Agrega piezas al remito
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={createRemito.isPending}
          size="lg"
        >
          {createRemito.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Emitir remito
        </Button>
      </div>
    </div>
  );
}
