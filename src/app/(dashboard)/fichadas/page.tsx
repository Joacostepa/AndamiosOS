"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useFichadas, type Fichada } from "@/hooks/use-fichadas";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils/formatters";
import { QrCode, ScanLine, MapPin, CheckCircle, XCircle, Clock } from "lucide-react";
import Link from "next/link";

const ESTADO_ICONS: Record<string, React.ReactNode> = {
  valida: <CheckCircle className="h-4 w-4 text-green-400" />,
  fuera_de_zona: <MapPin className="h-4 w-4 text-yellow-400" />,
  dispositivo_no_autorizado: <XCircle className="h-4 w-4 text-red-400" />,
  pendiente_aprobacion: <Clock className="h-4 w-4 text-yellow-400" />,
};

const columns: ColumnDef<Fichada>[] = [
  { accessorKey: "fecha", header: "Fecha/Hora", cell: ({ row }) => <span className="text-sm">{formatDateTime(row.original.fecha)}</span> },
  { id: "persona", header: "Persona", cell: ({ row }) => row.original.personal ? `${row.original.personal.apellido}, ${row.original.personal.nombre}` : "—" },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => <Badge variant="outline" className={row.original.tipo === "entrada" ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-orange-500/15 text-orange-400 border-orange-500/25"}>{row.original.tipo}</Badge> },
  { id: "obra", header: "Ubicacion", cell: ({ row }) => row.original.obras ? row.original.obras.nombre : row.original.ubicacion },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <div className="flex items-center gap-1">{ESTADO_ICONS[row.original.estado]}<span className="text-sm capitalize">{row.original.estado?.replace(/_/g, " ")}</span></div> },
  { accessorKey: "distancia_obra", header: "Distancia", cell: ({ row }) => row.original.distancia_obra ? `${Math.round(row.original.distancia_obra)}m` : "—" },
];

export default function FichadasPage() {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const { data: fichadas, isLoading } = useFichadas(fecha);

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  const entradas = fichadas?.filter((f) => f.tipo === "entrada").length || 0;
  const salidas = fichadas?.filter((f) => f.tipo === "salida").length || 0;
  const fueraZona = fichadas?.filter((f) => f.estado === "fuera_de_zona").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Fichadas" description="Registro de asistencia">
        <Button variant="outline" render={<Link href="/fichadas/qr" />}>
          <QrCode className="mr-2 h-4 w-4" />Generar QR
        </Button>
        <Button render={<Link href="/fichadas/escanear" />}>
          <ScanLine className="mr-2 h-4 w-4" />Fichar
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Entradas hoy</p><p className="text-2xl font-bold text-green-400">{entradas}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Salidas hoy</p><p className="text-2xl font-bold text-orange-400">{salidas}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Fuera de zona</p><p className={`text-2xl font-bold ${fueraZona > 0 ? "text-red-400" : ""}`}>{fueraZona}</p></CardContent></Card>
        <div className="flex items-end">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>

      {fichadas && <DataTable columns={columns} data={fichadas} searchKey="tipo" searchPlaceholder="Filtrar..." />}
    </div>
  );
}
