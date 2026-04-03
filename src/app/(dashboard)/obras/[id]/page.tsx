"use client";

import { use, useState } from "react";
import { useObra, useUpdateObra } from "@/hooks/use-obras";
import { useComunicaciones, useCreateComunicacion } from "@/hooks/use-comunicaciones";
import { useOrdenesTrabajoByObra, useCreateOrdenTrabajo, useUpdateOrdenTrabajo, useGatesObra, useUpdateGate, usePeriodosAlquiler, useCreatePeriodo } from "@/hooks/use-ordenes-trabajo";
import { useRemitosByObra } from "@/hooks/use-remitos";
import { useMovimientosByObra } from "@/hooks/use-stock";
import { usePersonal } from "@/hooks/use-personal";
import { useVehiculos } from "@/hooks/use-vehiculos";
import { Chatter } from "@/components/shared/chatter";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatRelativeDate } from "@/lib/utils/formatters";
import { ESTADO_OBRA_TRANSITIONS, ESTADO_OBRA_LABELS } from "@/lib/validators/obra";
import { ArrowRight, ChevronDown, Send, Loader2, MessageSquare, Plus, CheckCircle, XCircle, Clock, Shield, FileText, Package } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const TIPO_OT_LABELS: Record<string, string> = {
  montaje: "Montaje", desarme: "Desarme", adicional: "Adicional",
  modificacion: "Modificacion", visita_tecnica: "Visita tecnica",
  inspeccion: "Inspeccion", retiro: "Retiro",
};

const GATE_LABELS: Record<string, string> = {
  pago_anticipo: "Pago anticipo", permiso_municipal: "Permiso municipal",
  habilitacion_personal: "Habilitacion personal", proyecto_tecnico: "Proyecto tecnico",
  computo_aprobado: "Computo aprobado",
};

const GATE_ICONS: Record<string, React.ReactNode> = {
  aprobado: <CheckCircle className="h-4 w-4 text-green-400" />,
  pendiente: <Clock className="h-4 w-4 text-yellow-400" />,
  bloqueado: <XCircle className="h-4 w-4 text-red-400" />,
};

export default function ObraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: obra, isLoading } = useObra(id);
  const updateObra = useUpdateObra();
  const { data: comunicaciones } = useComunicaciones(id);
  const createComunicacion = useCreateComunicacion();
  const { data: ordenesTrabajo } = useOrdenesTrabajoByObra(id);
  const createOT = useCreateOrdenTrabajo();
  const updateOT = useUpdateOrdenTrabajo();
  const { data: gates } = useGatesObra(id);
  const updateGate = useUpdateGate();
  const { data: periodos } = usePeriodosAlquiler(id);
  const createPeriodo = useCreatePeriodo();
  const { data: remitos } = useRemitosByObra(id);
  const { data: movimientos } = useMovimientosByObra(id);
  const { data: personal } = usePersonal();
  const { data: vehiculos } = useVehiculos();

  const [nuevoAsunto, setNuevoAsunto] = useState("");
  const [nuevoContenido, setNuevoContenido] = useState("");
  const [otDrawer, setOtDrawer] = useState(false);
  const [periodoDrawer, setPeriodoDrawer] = useState(false);
  const [periodoForm, setPeriodoForm] = useState({ fecha_inicio: "", fecha_fin: "", monto: 0 });

  const otForm = useForm<{ tipo: string; descripcion?: string; fecha_programada?: string; vehiculo_id?: string; horas_estimadas?: number; observaciones?: string }>({ defaultValues: { tipo: "montaje" } });

  if (isLoading || !obra) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;

  const transitions = ESTADO_OBRA_TRANSITIONS[obra.estado] || [];
  const obraId = obra.id;
  const allGatesApproved = gates?.every((g) => g.estado === "aprobado") || false;

  return (
    <div className="space-y-6">
      <PageHeader title={obra.nombre}>
        <span className="font-mono text-sm text-muted-foreground">{obra.codigo}</span>
        {obra.unidad_negocio && <Badge variant="outline" className="capitalize">{obra.unidad_negocio?.replace(/_/g, " ")}</Badge>}
        <StatusBadge status={obra.estado} />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Cambiar estado<ChevronDown className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((state) => (
                <DropdownMenuItem key={state} onClick={() => updateObra.mutate({ id: obraId, data: { estado: state } }, { onSuccess: () => toast.success(`Estado: ${ESTADO_OBRA_LABELS[state]}`), onError: () => toast.error("Error") })}>
                  <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_OBRA_LABELS[state]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <ObraProgressBar estado={obra.estado} />

      {/* Gates panel */}
      {gates && gates.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Prerequisitos {allGatesApproved ? <Badge className="bg-green-500/15 text-green-400 border-green-500/25" variant="outline">Todo OK</Badge> : <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/25" variant="outline">Pendientes</Badge>}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {gates.map((g) => (
                <div key={g.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    if (g.estado !== "aprobado") {
                      updateGate.mutate({ id: g.id, data: { estado: "aprobado", fecha_aprobacion: new Date().toISOString().split("T")[0] } }, { onSuccess: () => toast.success(`${GATE_LABELS[g.tipo_gate]} aprobado`) });
                    }
                  }}>
                  {GATE_ICONS[g.estado]}
                  <span className="text-sm">{GATE_LABELS[g.tipo_gate] || g.tipo_gate}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="ordenes">OTs ({ordenesTrabajo?.length || 0})</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="remitos">Remitos</TabsTrigger>
          <TabsTrigger value="facturacion">Facturacion</TabsTrigger>
          <TabsTrigger value="comunicaciones">Notas</TabsTrigger>
        </TabsList>

        {/* TAB: General */}
        <TabsContent value="general" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Datos de obra</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Cliente" value={obra.clientes?.razon_social} />
                <InfoRow label="Direccion" value={obra.direccion} />
                <InfoRow label="Localidad" value={obra.localidad ? `${obra.localidad}, ${obra.provincia}` : obra.provincia} />
                <InfoRow label="Tipo de obra" value={obra.tipo_obra} capitalize />
                <InfoRow label="Tipo de andamio" value={obra.tipo_andamio} capitalize />
                {obra.unidad_negocio && <InfoRow label="Unidad de negocio" value={obra.unidad_negocio?.replace(/_/g, " ")} capitalize />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Fechas y vigencia</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Aprobacion" value={formatDate(obra.fecha_aprobacion)} />
                <InfoRow label="Inicio estimado" value={formatDate(obra.fecha_inicio_estimada)} />
                <InfoRow label="Inicio real" value={formatDate(obra.fecha_inicio_real)} />
                <InfoRow label="Fin estimado" value={formatDate(obra.fecha_fin_estimada)} />
                {obra.fecha_vigencia_inicio && <InfoRow label="Vigencia desde" value={formatDate(obra.fecha_vigencia_inicio)} />}
                {obra.fecha_vigencia_fin && <InfoRow label="Vigencia hasta" value={formatDate(obra.fecha_vigencia_fin)} />}
                {obra.estado_pago && <InfoRow label="Estado pago" value={obra.estado_pago?.replace(/_/g, " ")} capitalize />}
              </CardContent>
            </Card>
            {obra.condiciones_acceso && (
              <Card><CardHeader><CardTitle className="text-base">Acceso</CardTitle></CardHeader>
                <CardContent className="space-y-3"><p className="text-sm">{obra.condiciones_acceso}</p>{obra.horario_permitido && <InfoRow label="Horario" value={obra.horario_permitido} />}</CardContent></Card>
            )}
            {obra.observaciones && (
              <Card><CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{obra.observaciones}</p></CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* TAB: Ordenes de Trabajo */}
        <TabsContent value="ordenes" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setOtDrawer(true)}><Plus className="mr-2 h-4 w-4" />Nueva OT</Button>
          </div>
          {ordenesTrabajo && ordenesTrabajo.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Codigo</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead>Habilitacion</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {ordenesTrabajo.map((ot) => (
                  <TableRow key={ot.id}>
                    <TableCell className="font-mono text-sm">{ot.codigo}</TableCell>
                    <TableCell>{TIPO_OT_LABELS[ot.tipo] || ot.tipo}</TableCell>
                    <TableCell>{formatDate(ot.fecha_programada)}</TableCell>
                    <TableCell><StatusBadge status={ot.estado} /></TableCell>
                    <TableCell>{ot.habilitacion_aprobada ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Clock className="h-4 w-4 text-yellow-400" />}</TableCell>
                    <TableCell>
                      {ot.estado === "pendiente" && (
                        <Button size="sm" variant="outline" onClick={() => updateOT.mutate({ id: ot.id, data: { estado: allGatesApproved ? "habilitada" : "habilitacion_pendiente" } as any }, { onSuccess: () => toast.success("OT actualizada") })}>
                          {allGatesApproved ? "Habilitar" : "Verificar gates"}
                        </Button>
                      )}
                      {ot.estado === "habilitada" && (
                        <Button size="sm" variant="outline" onClick={() => updateOT.mutate({ id: ot.id, data: { estado: "programada" } as any }, { onSuccess: () => toast.success("OT programada") })}>Programar</Button>
                      )}
                      {ot.estado === "programada" && (
                        <Button size="sm" onClick={() => updateOT.mutate({ id: ot.id, data: { estado: "en_ejecucion" } as any }, { onSuccess: () => toast.success("OT en ejecucion") })}>Ejecutar</Button>
                      )}
                      {ot.estado === "en_ejecucion" && (
                        <Button size="sm" onClick={() => updateOT.mutate({ id: ot.id, data: { estado: "completada" } as any }, { onSuccess: () => toast.success("OT completada") })}>Completar</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Sin ordenes de trabajo. Crea una para iniciar.</CardContent></Card>
          )}
        </TabsContent>

        {/* TAB: Materiales */}
        <TabsContent value="materiales" className="mt-4 space-y-4">
          {movimientos && movimientos.length > 0 ? (() => {
            // Calculate stock summary by piece
            const stockMap = new Map<string, { codigo: string; descripcion: string; enviado: number; devuelto: number }>();
            movimientos.forEach((m: any) => {
              const pieza = m.catalogo_piezas;
              if (!pieza) return;
              if (!stockMap.has(pieza.codigo)) stockMap.set(pieza.codigo, { codigo: pieza.codigo, descripcion: pieza.descripcion, enviado: 0, devuelto: 0 });
              const entry = stockMap.get(pieza.codigo)!;
              if (m.tipo === "salida" && m.obra_destino_id === id) entry.enviado += Number(m.cantidad);
              if (m.tipo === "entrada" && m.obra_origen_id === id) entry.devuelto += Number(m.cantidad);
            });
            const stockList = Array.from(stockMap.values()).filter((s) => s.enviado > 0 || s.devuelto > 0);
            return (
              <Table>
                <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Pieza</TableHead><TableHead className="text-right">Enviado</TableHead><TableHead className="text-right">Devuelto</TableHead><TableHead className="text-right">En obra</TableHead></TableRow></TableHeader>
                <TableBody>
                  {stockList.map((s) => (
                    <TableRow key={s.codigo}>
                      <TableCell className="font-mono text-xs">{s.codigo}</TableCell>
                      <TableCell>{s.descripcion}</TableCell>
                      <TableCell className="text-right">{s.enviado}</TableCell>
                      <TableCell className="text-right">{s.devuelto}</TableCell>
                      <TableCell className="text-right font-semibold">{s.enviado - s.devuelto}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })() : (
            <Card><CardContent className="py-8 text-center text-muted-foreground"><Package className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin movimientos de material para esta obra</CardContent></Card>
          )}
        </TabsContent>

        {/* TAB: Remitos */}
        <TabsContent value="remitos" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" render={<Link href={`/logistica/remitos/nuevo?obra=${id}`} />}><Plus className="mr-2 h-4 w-4" />Nuevo remito</Button>
          </div>
          {remitos && remitos.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {remitos.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.numero}</TableCell>
                    <TableCell className="capitalize">{r.tipo}</TableCell>
                    <TableCell>{formatDate(r.fecha_emision)}</TableCell>
                    <TableCell><StatusBadge status={r.estado} /></TableCell>
                    <TableCell><Button variant="ghost" size="sm" render={<Link href={`/logistica/remitos/${r.id}`} />}><FileText className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin remitos para esta obra</CardContent></Card>
          )}
        </TabsContent>

        {/* TAB: Facturacion */}
        <TabsContent value="facturacion" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            {obra.monto_alquiler_mensual ? (
              <div className="rounded-lg border bg-card px-4 py-2">
                <p className="text-xs text-muted-foreground">Alquiler mensual</p>
                <p className="text-lg font-bold text-primary">${Number(obra.monto_alquiler_mensual).toLocaleString()}</p>
              </div>
            ) : <div />}
            <Button variant="outline" onClick={() => {
              setPeriodoForm({ fecha_inicio: "", fecha_fin: "", monto: Number(obra.monto_alquiler_mensual) || 0 });
              setPeriodoDrawer(true);
            }}><Plus className="mr-2 h-4 w-4" />Nuevo período</Button>
          </div>
          {periodos && periodos.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>Periodo</TableHead><TableHead>Desde</TableHead><TableHead>Hasta</TableHead><TableHead>Monto</TableHead><TableHead>Estado</TableHead><TableHead>Factura</TableHead></TableRow></TableHeader>
              <TableBody>
                {periodos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>#{p.numero_periodo}</TableCell>
                    <TableCell>{formatDate(p.fecha_inicio)}</TableCell>
                    <TableCell>{formatDate(p.fecha_fin)}</TableCell>
                    <TableCell className="font-semibold">${Number(p.monto).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={p.estado} /></TableCell>
                    <TableCell>{p.factura_referencia || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Sin periodos de alquiler registrados.</CardContent></Card>
          )}
        </TabsContent>

        {/* TAB: Comunicaciones */}
        <TabsContent value="comunicaciones" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Nueva nota</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Asunto..." value={nuevoAsunto} onChange={(e) => setNuevoAsunto(e.target.value)} />
              <Textarea placeholder="Contenido..." value={nuevoContenido} onChange={(e) => setNuevoContenido(e.target.value)} rows={3} />
              <div className="flex justify-end">
                <Button size="sm" disabled={!nuevoAsunto || !nuevoContenido || createComunicacion.isPending}
                  onClick={() => createComunicacion.mutate({ obra_id: id, asunto: nuevoAsunto, contenido: nuevoContenido }, { onSuccess: () => { setNuevoAsunto(""); setNuevoContenido(""); toast.success("Nota agregada"); }, onError: () => toast.error("Error") })}>
                  {createComunicacion.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Agregar
                </Button>
              </div>
            </CardContent>
          </Card>
          {comunicaciones && comunicaciones.length > 0 ? (
            <div className="space-y-3">
              {comunicaciones.map((c) => (
                <Card key={c.id}><CardContent className="py-4">
                  <div className="flex items-start justify-between"><div><p className="font-medium text-sm">{c.asunto}</p><p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{c.contenido}</p></div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">{formatRelativeDate(c.created_at)}</span></div>
                  {c.user_profiles && <p className="text-xs text-muted-foreground mt-2">— {c.user_profiles.nombre} {c.user_profiles.apellido}</p>}
                </CardContent></Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin comunicaciones</CardContent></Card>
          )}

          {/* Historial de cambios automáticos */}
          <Card>
            <CardHeader><CardTitle className="text-base">Historial de cambios</CardTitle></CardHeader>
            <CardContent>
              <Chatter entidadTipo="obras" entidadId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drawer nuevo período */}
      <Sheet open={periodoDrawer} onOpenChange={setPeriodoDrawer}>
        <SheetContent>
          <SheetHeader><SheetTitle>Nuevo período de alquiler</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2"><Label>Fecha desde *</Label><Input type="date" value={periodoForm.fecha_inicio} onChange={(e) => setPeriodoForm({ ...periodoForm, fecha_inicio: e.target.value })} /></div>
            <div className="space-y-2"><Label>Fecha hasta *</Label><Input type="date" value={periodoForm.fecha_fin} onChange={(e) => setPeriodoForm({ ...periodoForm, fecha_fin: e.target.value })} /></div>
            <div className="space-y-2"><Label>Monto ($)</Label><Input type="number" value={periodoForm.monto || ""} onChange={(e) => setPeriodoForm({ ...periodoForm, monto: Number(e.target.value) })} /></div>
            <div className="flex justify-end pt-4">
              <Button disabled={!periodoForm.fecha_inicio || !periodoForm.fecha_fin || createPeriodo.isPending}
                onClick={() => createPeriodo.mutate({
                  obra_id: id,
                  numero_periodo: (periodos?.length || 0) + 1,
                  fecha_inicio: periodoForm.fecha_inicio,
                  fecha_fin: periodoForm.fecha_fin,
                  monto: periodoForm.monto,
                }, { onSuccess: () => { toast.success("Período creado"); setPeriodoDrawer(false); }, onError: () => toast.error("Error") })}>
                {createPeriodo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear período
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Drawer nueva OT */}
      <Sheet open={otDrawer} onOpenChange={setOtDrawer}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Nueva orden de trabajo</SheetTitle></SheetHeader>
          <form onSubmit={otForm.handleSubmit((data) => createOT.mutate({ ...data, obra_id: id }, { onSuccess: (ot) => { toast.success(`OT ${ot.codigo} creada`); setOtDrawer(false); otForm.reset(); }, onError: () => toast.error("Error") }))} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={otForm.watch("tipo")} onValueChange={(v) => v && otForm.setValue("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPO_OT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Descripcion</Label><Textarea {...otForm.register("descripcion")} rows={2} placeholder="Que hay que hacer..." /></div>
            <div className="space-y-2"><Label>Fecha programada</Label><Input type="date" {...otForm.register("fecha_programada")} /></div>
            <div className="space-y-2">
              <Label>Vehiculo</Label>
              <Select value={otForm.watch("vehiculo_id") || ""} onValueChange={(v) => v && otForm.setValue("vehiculo_id", v)}>
                <SelectTrigger><SelectValue placeholder="Asignar vehiculo..." /></SelectTrigger>
                <SelectContent>{vehiculos?.map((v) => <SelectItem key={v.id} value={v.id}>{v.patente} — {v.marca} {v.modelo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Horas estimadas</Label><Input type="number" step="0.5" {...otForm.register("horas_estimadas", { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label>Observaciones</Label><Textarea {...otForm.register("observaciones")} rows={2} /></div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createOT.isPending}>{createOT.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear OT</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InfoRow({ label, value, capitalize = false }: { label: string; value: string | null | undefined; capitalize?: boolean }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className={`font-medium ${capitalize ? "capitalize" : ""}`}>{value || "—"}</span></div>;
}

const PROGRESS_STATES = ["presupuestada", "aprobada", "en_proyecto", "proyecto_aprobado", "lista_para_ejecutar", "en_montaje", "montada", "en_uso", "en_desarme", "desarmada", "en_devolucion", "cerrada_operativamente"];

function ObraProgressBar({ estado }: { estado: string }) {
  const idx = PROGRESS_STATES.indexOf(estado);
  if (idx === -1) return null;
  const progress = ((idx + 1) / PROGRESS_STATES.length) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground"><span>Presupuestada</span><span>Cerrada</span></div>
      <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}
