"use client";

import { use } from "react";
import { useCotizacion, useUpdateCotizacion } from "@/hooks/use-cotizaciones";
import { useConfiguracion } from "@/hooks/use-configuracion";
import type { EmpresaData } from "@/components/pdf/cotizacion-pdf";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { PDFDownloadButton } from "@/components/pdf/pdf-download-button";
import { CotizacionPDF } from "@/components/pdf/cotizacion-pdf";
import { PropuestaPDF } from "@/components/pdf/propuesta-pdf";
import { useCotizacionImagenes } from "@/hooks/use-imagenes-referencia";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { ITEM_TYPE_LABELS, UNIDAD_LABELS, SUB_VERTICAL_LABELS } from "@/types/cotizacion-form";
import { Chatter } from "@/components/shared/chatter";
import type { UnidadCotizacion, SubVertical } from "@/types/cotizacion-form";

const TIPO_LABELS: Record<string, string> = ITEM_TYPE_LABELS;

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  borrador: ["enviada"], enviada: ["en_revision", "aprobada", "rechazada"],
  en_revision: ["aprobada", "rechazada"], aprobada: [], rechazada: [], vencida: [],
};

const ESTADO_LABELS: Record<string, string> = {
  borrador: "Borrador", enviada: "Enviada", en_revision: "En revision",
  aprobada: "Aprobada", rechazada: "Rechazada", vencida: "Vencida",
};

export default function CotizacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: cotizacion, isLoading } = useCotizacion(id);
  const { data: configs } = useConfiguracion();
  const updateCotizacion = useUpdateCotizacion();
  const { data: cotImagenes } = useCotizacionImagenes(id);

  if (isLoading || !cotizacion) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const transitions = ESTADO_TRANSITIONS[cotizacion.estado] || [];
  const items = cotizacion.cotizacion_items || [];

  const empresa: EmpresaData = {
    nombre: configs?.find((c) => c.clave === "empresa_nombre")?.valor,
    cuit: configs?.find((c) => c.clave === "empresa_cuit")?.valor,
    direccion: configs?.find((c) => c.clave === "empresa_direccion")?.valor,
    telefono: configs?.find((c) => c.clave === "empresa_telefono")?.valor,
    email: configs?.find((c) => c.clave === "empresa_email")?.valor,
    web: configs?.find((c) => c.clave === "empresa_web")?.valor,
    logo_url: configs?.find((c) => c.clave === "empresa_logo_url")?.valor,
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`Cotizacion ${cotizacion.codigo}`}>
        <Badge variant="outline" className="capitalize">v{cotizacion.version}</Badge>
        <StatusBadge status={cotizacion.estado} />
        <PDFDownloadButton
          document={
            cotizacion.unidad_cotizacion === "armado_desarme" ? (
              <PropuestaPDF
                cotizacion={cotizacion}
                items={items}
                clienteNombre={cotizacion.clientes?.razon_social || cotizacion.oportunidades?.titulo}
                empresa={empresa}
                imageUrls={cotImagenes?.map((ci: any) => ci.imagenes_referencia?.url).filter(Boolean)}
              />
            ) : (
              <CotizacionPDF cotizacion={cotizacion} items={items} clienteNombre={cotizacion.clientes?.razon_social || cotizacion.oportunidades?.titulo} empresa={empresa} />
            )
          }
          fileName={`${cotizacion.codigo}.pdf`}
          label={cotizacion.unidad_cotizacion === "armado_desarme" ? "Descargar propuesta" : "Descargar PDF"}
        />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Estado<ChevronDown className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((s) => (
                <DropdownMenuItem key={s} onClick={() => updateCotizacion.mutate({ id, data: { estado: s } }, { onSuccess: () => toast.success(`Cambiado a ${ESTADO_LABELS[s]}`) })}>
                  <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Titulo" value={cotizacion.titulo} />
            <InfoRow label="Unidad" value={cotizacion.unidad_cotizacion ? UNIDAD_LABELS[cotizacion.unidad_cotizacion as UnidadCotizacion] : null} />
            {cotizacion.sub_vertical && <InfoRow label="Rubro" value={SUB_VERTICAL_LABELS[cotizacion.sub_vertical as SubVertical]} />}
            <InfoRow label="Cliente" value={cotizacion.clientes?.razon_social} />
            <InfoRow label="Oportunidad" value={cotizacion.oportunidades?.titulo} />
            <InfoRow label="Condicion pago" value={cotizacion.condicion_pago} />
            <InfoRow label="Plazo alquiler" value={cotizacion.plazo_alquiler_meses ? `${cotizacion.plazo_alquiler_meses} meses` : null} />
            {cotizacion.fraccion_dias && <InfoRow label="Fraccion" value={`${cotizacion.fraccion_dias} días`} />}
            {cotizacion.zona_entrega && <InfoRow label="Zona entrega" value={cotizacion.zona_entrega} />}
            {cotizacion.tonelaje_estimado && <InfoRow label="Tonelaje" value={`${cotizacion.tonelaje_estimado} tn`} />}
            {cotizacion.urgencia && <InfoRow label="Urgencia" value={cotizacion.urgencia} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Fechas y montos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Emision" value={formatDate(cotizacion.fecha_emision)} />
            <InfoRow label="Vencimiento" value={formatDate(cotizacion.fecha_vencimiento)} />
            <InfoRow label="Validez" value={`${cotizacion.validez_dias} dias`} />
            <InfoRow label="Subtotal" value={`$${Number(cotizacion.subtotal).toLocaleString()}`} />
            <InfoRow label={`IVA (${cotizacion.iva_porcentaje}%)`} value={`$${Number(cotizacion.iva_monto).toLocaleString()}`} />
            <div className="flex justify-between text-sm pt-2 border-t">
              <span className="font-bold text-primary">TOTAL</span>
              <span className="font-bold text-primary text-lg">${Number(cotizacion.total).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {cotizacion.descripcion_servicio && (
        <Card>
          <CardHeader><CardTitle className="text-base">Descripcion del servicio</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{cotizacion.descripcion_servicio}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Items ({items.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Cant.</TableHead><TableHead>P. Unit.</TableHead><TableHead>Subtotal</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{TIPO_LABELS[item.tipo]}</TableCell>
                  <TableCell>{item.concepto}</TableCell>
                  <TableCell>{item.cantidad} {item.unidad}</TableCell>
                  <TableCell>${Number(item.precio_unitario).toLocaleString()}</TableCell>
                  <TableCell className="font-semibold">${Number(item.subtotal).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {cotizacion.condiciones && (
        <Card>
          <CardHeader><CardTitle className="text-base">Condiciones</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{cotizacion.condiciones}</p></CardContent>
        </Card>
      )}

      {/* Chatter / Historial */}
      <Card>
        <CardHeader><CardTitle className="text-base">Historial de actividad</CardTitle></CardHeader>
        <CardContent>
          <Chatter entidadTipo="cotizaciones" entidadId={id} />
        </CardContent>
      </Card>

      {cotizacion.metadata && (cotizacion.metadata as any).conversacion && (
        <Card>
          <CardHeader><CardTitle className="text-base">Conversación con el cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {((cotizacion.metadata as any).conversacion as Array<{role: string; content: string}>).map((msg, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${msg.role === "user" ? "ml-auto bg-primary/10 text-foreground" : "bg-muted"}`}>
                <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{msg.role === "user" ? "Cliente" : "Asistente IA"}</p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value || "—"}</span></div>;
}
