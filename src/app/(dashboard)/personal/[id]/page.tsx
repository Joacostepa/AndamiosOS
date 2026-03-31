"use client";

import { use, useState } from "react";
import {
  usePersonalById,
  useDocumentos,
  useCreateDocumento,
  type DocumentoFormData,
} from "@/hooks/use-personal";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const TIPO_DOC_LABELS: Record<string, string> = {
  dni: "DNI",
  alta_afip: "Alta AFIP",
  art: "ART",
  curso_altura: "Curso de altura",
  psicofisico: "Psicofisico",
  seguro_vida: "Seguro de vida",
  epp: "EPP entregado",
  induccion: "Induccion",
  otro: "Otro",
};

export default function PersonalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: persona, isLoading } = usePersonalById(id);
  const { data: documentos } = useDocumentos("personal", id);
  const createDocumento = useCreateDocumento();
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } =
    useForm<Omit<DocumentoFormData, "entidad_tipo" | "entidad_id">>({
      defaultValues: { tipo_documento: "otro" },
    });

  function onSubmitDoc(
    data: Omit<DocumentoFormData, "entidad_tipo" | "entidad_id">
  ) {
    createDocumento.mutate(
      { ...data, entidad_tipo: "personal", entidad_id: id },
      {
        onSuccess: () => {
          toast.success("Documento cargado");
          setDocDrawerOpen(false);
          reset();
        },
        onError: () => {
          toast.error("Error al cargar documento");
        },
      }
    );
  }

  if (isLoading || !persona) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const docsVencidos =
    documentos?.filter((d) => d.estado === "vencido").length || 0;
  const docsPorVencer =
    documentos?.filter((d) => d.estado === "por_vencer").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${persona.apellido}, ${persona.nombre}`}
      >
        <StatusBadge status={persona.estado_habilitacion} />
      </PageHeader>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Documentos vigentes</p>
          <p className="text-2xl font-bold text-green-400">
            {documentos?.filter((d) => d.estado === "vigente").length || 0}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Por vencer</p>
          <p
            className={`text-2xl font-bold ${docsPorVencer > 0 ? "text-yellow-400" : ""}`}
          >
            {docsPorVencer}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Vencidos</p>
          <p
            className={`text-2xl font-bold ${docsVencidos > 0 ? "text-red-400" : ""}`}
          >
            {docsVencidos}
          </p>
        </div>
      </div>

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="documentos">
            Documentos ({documentos?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos personales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="DNI" value={persona.dni} />
                <InfoRow label="CUIL" value={persona.cuil} />
                <InfoRow
                  label="Fecha nacimiento"
                  value={formatDate(persona.fecha_nacimiento)}
                />
                <InfoRow label="Domicilio" value={persona.domicilio} />
                <InfoRow label="Telefono" value={persona.telefono} />
                <InfoRow label="Email" value={persona.email} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Laboral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label="Puesto"
                  value={persona.puesto}
                />
                <InfoRow label="Categoria" value={persona.categoria} />
                <InfoRow
                  label="Fecha ingreso"
                  value={formatDate(persona.fecha_ingreso)}
                />
                <InfoRow label="ART" value={persona.art_empresa} />
                <InfoRow label="Obra social" value={persona.obra_social} />
              </CardContent>
            </Card>
            {(persona.contacto_emergencia_nombre ||
              persona.contacto_emergencia_telefono) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Contacto de emergencia
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow
                    label="Nombre"
                    value={persona.contacto_emergencia_nombre}
                  />
                  <InfoRow
                    label="Telefono"
                    value={persona.contacto_emergencia_telefono}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documentos" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setDocDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Cargar documento
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              {documentos && documentos.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>Emision</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          {TIPO_DOC_LABELS[doc.tipo_documento] ||
                            doc.tipo_documento}
                        </TableCell>
                        <TableCell>{doc.descripcion || "—"}</TableCell>
                        <TableCell>{formatDate(doc.fecha_emision)}</TableCell>
                        <TableCell>
                          {formatDate(doc.fecha_vencimiento)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={doc.estado} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  Sin documentos cargados
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={docDrawerOpen} onOpenChange={setDocDrawerOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Cargar documento</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={handleSubmit(onSubmitDoc)}
            className="mt-6 space-y-4"
          >
            <div className="space-y-2">
              <Label>Tipo de documento *</Label>
              <Select
                value={watch("tipo_documento")}
                onValueChange={(val) => val && setValue("tipo_documento", val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_DOC_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Input
                {...register("descripcion")}
                placeholder="Descripcion adicional"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha emision</Label>
                <Input type="date" {...register("fecha_emision")} />
              </div>
              <div className="space-y-2">
                <Label>Fecha vencimiento</Label>
                <Input type="date" {...register("fecha_vencimiento")} />
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createDocumento.isPending}>
                {createDocumento.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Cargar
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value || "—"}</span>
    </div>
  );
}
