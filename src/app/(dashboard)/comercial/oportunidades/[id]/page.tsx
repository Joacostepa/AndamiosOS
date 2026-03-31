"use client";

import { use, useState } from "react";
import { useOportunidad, useUpdateOportunidad, useActividades, useCreateActividad } from "@/hooks/use-oportunidades";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatRelativeDate } from "@/lib/utils/formatters";
import { ArrowRight, ChevronDown, Send, Loader2, Phone, Mail, MessageSquare, Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const PIPELINE = ["lead", "contactado", "relevamiento", "cotizado", "negociacion", "ganado", "perdido"];
const PIPELINE_LABELS: Record<string, string> = { lead: "Lead", contactado: "Contactado", relevamiento: "Relevamiento", cotizado: "Cotizado", negociacion: "Negociacion", ganado: "Ganado", perdido: "Perdido" };
const TIPO_ACT_ICONS: Record<string, React.ReactNode> = { llamada: <Phone className="h-4 w-4" />, email: <Mail className="h-4 w-4" />, whatsapp: <MessageSquare className="h-4 w-4" />, reunion: <Calendar className="h-4 w-4" />, visita: <MapPin className="h-4 w-4" /> };

export default function OportunidadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: op, isLoading } = useOportunidad(id);
  const { data: actividades } = useActividades(id);
  const updateOp = useUpdateOportunidad();
  const createActividad = useCreateActividad();

  const [actTipo, setActTipo] = useState("nota");
  const [actTitulo, setActTitulo] = useState("");
  const [actDesc, setActDesc] = useState("");

  if (isLoading || !op) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const currentIdx = PIPELINE.indexOf(op.estado);
  const nextStates = op.estado === "ganado" || op.estado === "perdido" ? [] :
    PIPELINE.filter((_, i) => i > currentIdx && i < PIPELINE.length);

  return (
    <div className="space-y-6">
      <PageHeader title={op.titulo}>
        <span className="font-mono text-sm text-muted-foreground">{op.codigo}</span>
        <StatusBadge status={op.estado} />
        {nextStates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Avanzar<ChevronDown className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent>
              {nextStates.map((s) => (
                <DropdownMenuItem key={s} onClick={() => updateOp.mutate({ id, data: { estado: s } as any }, { onSuccess: () => toast.success(`Movido a ${PIPELINE_LABELS[s]}`) })}>
                  <ArrowRight className="mr-2 h-4 w-4" />{PIPELINE_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      {/* Pipeline progress */}
      <div className="flex gap-1">
        {PIPELINE.filter((s) => s !== "perdido").map((s, i) => {
          const active = PIPELINE.indexOf(op.estado) >= i;
          const lost = op.estado === "perdido";
          return (
            <div key={s} className={`h-2 flex-1 rounded-full ${lost ? "bg-red-500/30" : active ? "bg-primary" : "bg-muted"}`} />
          );
        })}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion</TabsTrigger>
          <TabsTrigger value="actividades">Actividades ({actividades?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Cliente" value={op.clientes?.razon_social || op.cliente_nombre} />
                <InfoRow label="Telefono" value={op.cliente_telefono} />
                <InfoRow label="Email" value={op.cliente_email} />
                <InfoRow label="Tipo" value={op.tipo_cliente?.replace(/_/g, " ")} />
                <InfoRow label="Tamano" value={op.tamano} />
                <InfoRow label="Relacion" value={op.relacion} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Oportunidad</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Perfil" value={op.perfil_decision?.replace(/_/g, " ")} />
                <InfoRow label="Situacion" value={op.situacion?.replace(/_/g, " ")} />
                <InfoRow label="Rango" value={op.rango_presupuesto} />
                <InfoRow label="Monto est." value={op.monto_estimado ? `$${Number(op.monto_estimado).toLocaleString()}` : null} />
                <InfoRow label="Probabilidad" value={`${op.probabilidad}%`} />
                <InfoRow label="Zona" value={op.zona} />
                <InfoRow label="Origen" value={op.origen} />
                <InfoRow label="Cierre est." value={formatDate(op.fecha_cierre_estimada)} />
              </CardContent>
            </Card>
            {op.descripcion && (
              <Card className="md:col-span-2">
                <CardHeader><CardTitle className="text-base">Descripcion</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{op.descripcion}</p></CardContent>
              </Card>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" render={<Link href={`/comercial/relevamientos/nuevo?oportunidad=${id}`} />}>Crear relevamiento</Button>
            <Button variant="outline" render={<Link href={`/comercial/cotizaciones/nueva?oportunidad=${id}`} />}>Crear cotizacion</Button>
          </div>
        </TabsContent>

        <TabsContent value="actividades" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex gap-2">
                <Select value={actTipo} onValueChange={(v) => v && setActTipo(v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nota">Nota</SelectItem><SelectItem value="llamada">Llamada</SelectItem>
                    <SelectItem value="email">Email</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="reunion">Reunion</SelectItem><SelectItem value="visita">Visita</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Titulo..." value={actTitulo} onChange={(e) => setActTitulo(e.target.value)} className="flex-1" />
              </div>
              <Textarea placeholder="Descripcion..." value={actDesc} onChange={(e) => setActDesc(e.target.value)} rows={2} />
              <div className="flex justify-end">
                <Button size="sm" disabled={!actTitulo || createActividad.isPending}
                  onClick={() => createActividad.mutate({ oportunidad_id: id, tipo: actTipo, titulo: actTitulo, descripcion: actDesc || undefined }, {
                    onSuccess: () => { setActTitulo(""); setActDesc(""); toast.success("Actividad registrada"); },
                  })}>
                  {createActividad.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Registrar
                </Button>
              </div>
            </CardContent>
          </Card>

          {actividades && actividades.length > 0 ? (
            <div className="space-y-2">
              {actividades.map((a) => (
                <Card key={a.id}>
                  <CardContent className="py-3 flex items-start gap-3">
                    <div className="mt-0.5 text-muted-foreground">{TIPO_ACT_ICONS[a.tipo] || <MessageSquare className="h-4 w-4" />}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{a.titulo}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{a.tipo}</Badge>
                      </div>
                      {a.descripcion && <p className="text-sm text-muted-foreground mt-1">{a.descripcion}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{formatRelativeDate(a.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-4">Sin actividades</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium capitalize">{value || "—"}</span></div>;
}
