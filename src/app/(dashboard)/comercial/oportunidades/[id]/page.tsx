"use client";

import { use, useState } from "react";
import { useOportunidad, useUpdateOportunidad, useActividades, useCreateActividad } from "@/hooks/use-oportunidades";
import { useCotizaciones } from "@/hooks/use-cotizaciones";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatRelativeDate } from "@/lib/utils/formatters";
import {
  ArrowRight, Send, Loader2, Phone, Mail, MessageSquare, Calendar, MapPin,
  DollarSign, Percent, CalendarClock, FileText, Save, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const PIPELINE = ["lead", "contactado", "relevamiento", "cotizado", "negociacion", "ganado", "perdido"];
const PIPELINE_LABELS: Record<string, string> = { lead: "Lead", contactado: "Contactado", relevamiento: "Relevamiento", cotizado: "Cotizado", negociacion: "Negociacion", ganado: "Ganado", perdido: "Perdido" };
const PIPELINE_COLORS: Record<string, string> = { lead: "text-zinc-400", contactado: "text-blue-400", relevamiento: "text-purple-400", cotizado: "text-yellow-400", negociacion: "text-orange-400", ganado: "text-green-400", perdido: "text-red-400" };
const TIPO_ACT_ICONS: Record<string, React.ReactNode> = { llamada: <Phone className="h-4 w-4" />, email: <Mail className="h-4 w-4" />, whatsapp: <MessageSquare className="h-4 w-4" />, reunion: <Calendar className="h-4 w-4" />, visita: <MapPin className="h-4 w-4" />, seguimiento: <CalendarClock className="h-4 w-4" /> };

export default function OportunidadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: op, isLoading } = useOportunidad(id);
  const { data: actividades } = useActividades(id);
  const { data: allCotizaciones } = useCotizaciones();
  const updateOp = useUpdateOportunidad();
  const createActividad = useCreateActividad();

  const [actTipo, setActTipo] = useState("nota");
  const [actTitulo, setActTitulo] = useState("");
  const [actDesc, setActDesc] = useState("");
  const [actSeguimiento, setActSeguimiento] = useState("");

  // Inline edit
  const [editMonto, setEditMonto] = useState<number | null>(null);
  const [editProb, setEditProb] = useState<number | null>(null);
  const [editFechaCierre, setEditFechaCierre] = useState<string | null>(null);
  const [motivoPerdida, setMotivoPerdida] = useState("");

  if (isLoading || !op) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const currentIdx = PIPELINE.indexOf(op.estado);
  const cotizaciones = allCotizaciones?.filter((c) => c.oportunidad_id === id) || [];

  // Próximo seguimiento
  const proximoSeguimiento = actividades
    ?.filter((a) => a.fecha_seguimiento && new Date(a.fecha_seguimiento) >= new Date(new Date().toDateString()))
    ?.sort((a, b) => new Date(a.fecha_seguimiento!).getTime() - new Date(b.fecha_seguimiento!).getTime())[0];

  function handleChangeEstado(newEstado: string) {
    if (newEstado === "perdido" && !motivoPerdida) {
      toast.error("Ingresá el motivo de pérdida");
      return;
    }
    const data: any = { estado: newEstado };
    if (newEstado === "perdido" && motivoPerdida) {
      data.motivo_perdida = motivoPerdida;
    }
    updateOp.mutate({ id, data }, {
      onSuccess: () => toast.success(`Movido a ${PIPELINE_LABELS[newEstado]}`),
    });
  }

  function handleSaveInline() {
    const data: any = {};
    if (editMonto !== null) data.monto_estimado = editMonto;
    if (editProb !== null) data.probabilidad = editProb;
    if (editFechaCierre !== null) data.fecha_cierre_estimada = editFechaCierre || null;
    if (Object.keys(data).length === 0) return;
    updateOp.mutate({ id, data }, {
      onSuccess: () => {
        toast.success("Datos actualizados");
        setEditMonto(null);
        setEditProb(null);
        setEditFechaCierre(null);
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={op.titulo}>
        <span className="font-mono text-sm text-muted-foreground">{op.codigo}</span>
        <StatusBadge status={op.estado} />
      </PageHeader>

      {/* Pipeline progress — clickeable */}
      <div className="flex gap-1">
        {PIPELINE.filter((s) => s !== "perdido").map((s, i) => {
          const active = PIPELINE.indexOf(op.estado) >= i;
          const lost = op.estado === "perdido";
          return (
            <button
              key={s}
              onClick={() => handleChangeEstado(s)}
              className={`h-2 flex-1 rounded-full transition-colors ${lost ? "bg-red-500/30" : active ? "bg-primary" : "bg-muted hover:bg-muted-foreground/30"}`}
              title={PIPELINE_LABELS[s]}
            />
          );
        })}
      </div>

      {/* Estado buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {PIPELINE.map((s) => (
          <Button
            key={s}
            variant={op.estado === s ? "default" : "outline"}
            size="sm"
            className={`text-xs ${op.estado === s ? "" : PIPELINE_COLORS[s]}`}
            onClick={() => s !== "perdido" && handleChangeEstado(s)}
            disabled={op.estado === s}
          >
            {PIPELINE_LABELS[s]}
          </Button>
        ))}
        {op.estado !== "perdido" && (
          <div className="flex items-center gap-1 ml-2">
            <Input
              value={motivoPerdida}
              onChange={(e) => setMotivoPerdida(e.target.value)}
              placeholder="Motivo de pérdida..."
              className="h-7 text-xs w-48"
            />
            <Button
              variant="destructive"
              size="sm"
              className="text-xs h-7"
              onClick={() => handleChangeEstado("perdido")}
            >
              <XCircle className="mr-1 h-3 w-3" />Perdido
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="cotizaciones">Cotizaciones ({cotizaciones.length})</TabsTrigger>
          <TabsTrigger value="actividades">Actividades ({actividades?.length || 0})</TabsTrigger>
        </TabsList>

        {/* INFO TAB */}
        <TabsContent value="info" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Cliente" value={op.clientes?.razon_social || op.cliente_nombre} />
                <InfoRow label="Teléfono" value={op.cliente_telefono} />
                <InfoRow label="Email" value={op.cliente_email} />
                <InfoRow label="Tipo" value={op.tipo_cliente?.replace(/_/g, " ")} />
                <InfoRow label="Relación" value={op.relacion} />
                {op.unidad_negocio && <InfoRow label="Unidad" value={op.unidad_negocio.replace(/_/g, " ")} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Oportunidad</CardTitle>
                  {(editMonto !== null || editProb !== null || editFechaCierre !== null) && (
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleSaveInline} disabled={updateOp.isPending}>
                      <Save className="mr-1 h-3 w-3" />Guardar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Perfil" value={op.perfil_decision?.replace(/_/g, " ")} />
                <InfoRow label="Situación" value={op.situacion?.replace(/_/g, " ")} />
                <InfoRow label="Poder decisión" value={op.poder_decision?.replace(/_/g, " ")} />
                {/* Editable fields */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Monto est.</span>
                  <Input
                    type="number"
                    className="h-7 w-32 text-right text-sm"
                    value={editMonto ?? op.monto_estimado ?? ""}
                    onChange={(e) => setEditMonto(Number(e.target.value))}
                  />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><Percent className="h-3 w-3" />Probabilidad</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="h-7 w-20 text-right text-sm"
                    value={editProb ?? op.probabilidad ?? ""}
                    onChange={(e) => setEditProb(Number(e.target.value))}
                  />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" />Cierre est.</span>
                  <Input
                    type="date"
                    className="h-7 w-40 text-sm"
                    value={editFechaCierre ?? op.fecha_cierre_estimada ?? ""}
                    onChange={(e) => setEditFechaCierre(e.target.value)}
                  />
                </div>
                <InfoRow label="Zona" value={op.zona} />
                <InfoRow label="Origen" value={op.origen} />
                {op.competidores && <InfoRow label="Competidores" value={op.competidores} />}
                {op.motivo_perdida && <InfoRow label="Motivo pérdida" value={op.motivo_perdida} />}
              </CardContent>
            </Card>
            {op.descripcion && (
              <Card className="md:col-span-2">
                <CardHeader><CardTitle className="text-base">Descripción</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{op.descripcion}</p></CardContent>
              </Card>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" render={<Link href={`/comercial/relevamientos/nuevo?oportunidad=${id}`} />}>Crear relevamiento</Button>
            <Button variant="outline" render={<Link href={`/comercial/cotizaciones/nueva?oportunidad=${id}`} />}>Crear cotización</Button>
          </div>
        </TabsContent>

        {/* COTIZACIONES TAB */}
        <TabsContent value="cotizaciones" className="mt-4 space-y-3">
          {cotizaciones.length > 0 ? (
            cotizaciones.map((c) => (
              <Link key={c.id} href={`/comercial/cotizaciones/${c.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{c.codigo} — {c.titulo}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeDate(c.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-primary">${Number(c.total).toLocaleString()}</span>
                      <StatusBadge status={c.estado} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay cotizaciones vinculadas</p>
              <Button variant="outline" className="mt-2" render={<Link href={`/comercial/cotizaciones/nueva?oportunidad=${id}`} />}>
                Crear cotización
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ACTIVIDADES TAB */}
        <TabsContent value="actividades" className="mt-4 space-y-4">
          {/* Próximo seguimiento */}
          {proximoSeguimiento && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Próximo seguimiento: {formatDate(proximoSeguimiento.fecha_seguimiento)}</p>
                  <p className="text-xs text-muted-foreground">{proximoSeguimiento.titulo}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex gap-2">
                <Select value={actTipo} onValueChange={(v) => v && setActTipo(v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nota">Nota</SelectItem>
                    <SelectItem value="llamada">Llamada</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="reunion">Reunión</SelectItem>
                    <SelectItem value="visita">Visita</SelectItem>
                    <SelectItem value="seguimiento">Seguimiento</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Título..." value={actTitulo} onChange={(e) => setActTitulo(e.target.value)} className="flex-1" />
              </div>
              <Textarea placeholder="Descripción..." value={actDesc} onChange={(e) => setActDesc(e.target.value)} rows={2} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Próximo contacto:</Label>
                  <Input
                    type="date"
                    value={actSeguimiento}
                    onChange={(e) => setActSeguimiento(e.target.value)}
                    className="h-7 w-40 text-xs"
                  />
                </div>
                <Button size="sm" disabled={!actTitulo || createActividad.isPending}
                  onClick={() => createActividad.mutate({
                    oportunidad_id: id,
                    tipo: actTipo,
                    titulo: actTitulo,
                    descripcion: actDesc || undefined,
                    fecha_seguimiento: actSeguimiento || undefined,
                  } as any, {
                    onSuccess: () => { setActTitulo(""); setActDesc(""); setActSeguimiento(""); toast.success("Actividad registrada"); },
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
                        {a.fecha_seguimiento && (
                          <Badge variant="outline" className={`text-[10px] ${new Date(a.fecha_seguimiento) < new Date(new Date().toDateString()) ? "bg-red-500/10 text-red-400 border-red-400/30" : "bg-primary/10 text-primary border-primary/30"}`}>
                            <CalendarClock className="mr-1 h-2.5 w-2.5" />
                            {formatDate(a.fecha_seguimiento)}
                          </Badge>
                        )}
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
