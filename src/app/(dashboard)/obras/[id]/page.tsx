"use client";

import { use, useState } from "react";
import { useObra, useUpdateObra } from "@/hooks/use-obras";
import { useComunicaciones, useCreateComunicacion } from "@/hooks/use-comunicaciones";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import {
  ESTADO_OBRA_TRANSITIONS,
  ESTADO_OBRA_LABELS,
} from "@/lib/validators/obra";
import { ArrowRight, ChevronDown, Send, Loader2, MessageSquare } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { toast } from "sonner";

export default function ObraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: obra, isLoading } = useObra(id);
  const updateObra = useUpdateObra();
  const { data: comunicaciones } = useComunicaciones(id);
  const createComunicacion = useCreateComunicacion();
  const [nuevoAsunto, setNuevoAsunto] = useState("");
  const [nuevoContenido, setNuevoContenido] = useState("");

  if (isLoading || !obra) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const transitions = ESTADO_OBRA_TRANSITIONS[obra.estado] || [];
  const obraId = obra.id;

  function handleChangeState(newState: string) {
    updateObra.mutate(
      { id: obraId, data: { estado: newState } },
      {
        onSuccess: () => {
          toast.success(
            `Estado cambiado a ${ESTADO_OBRA_LABELS[newState] || newState}`
          );
        },
        onError: () => {
          toast.error("Error al cambiar estado");
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={obra.nombre}>
        <span className="font-mono text-sm text-muted-foreground">
          {obra.codigo}
        </span>
        <StatusBadge status={obra.estado} />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Cambiar estado
              <ChevronDown className="ml-2 h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((state) => (
                <DropdownMenuItem
                  key={state}
                  onClick={() => handleChangeState(state)}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {ESTADO_OBRA_LABELS[state] || state}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      {/* Progress bar */}
      <ObraProgressBar estado={obra.estado} />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="remitos">Remitos</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="comunicaciones">Comunicaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos de obra</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Cliente" value={obra.clientes?.razon_social} />
                <InfoRow label="Direccion" value={obra.direccion} />
                <InfoRow
                  label="Localidad"
                  value={
                    obra.localidad
                      ? `${obra.localidad}, ${obra.provincia}`
                      : obra.provincia
                  }
                />
                <InfoRow
                  label="Tipo de obra"
                  value={obra.tipo_obra}
                  capitalize
                />
                <InfoRow
                  label="Tipo de andamio"
                  value={obra.tipo_andamio}
                  capitalize
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fechas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label="Aprobacion"
                  value={formatDate(obra.fecha_aprobacion)}
                />
                <InfoRow
                  label="Inicio estimado"
                  value={formatDate(obra.fecha_inicio_estimada)}
                />
                <InfoRow
                  label="Inicio real"
                  value={formatDate(obra.fecha_inicio_real)}
                />
                <InfoRow
                  label="Fin estimado"
                  value={formatDate(obra.fecha_fin_estimada)}
                />
                <InfoRow
                  label="Fin real"
                  value={formatDate(obra.fecha_fin_real)}
                />
              </CardContent>
            </Card>

            {obra.condiciones_acceso && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Acceso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{obra.condiciones_acceso}</p>
                  {obra.horario_permitido && (
                    <InfoRow
                      label="Horario"
                      value={obra.horario_permitido}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {obra.observaciones && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Observaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {obra.observaciones}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="materiales" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              El stock en obra se mostrara aqui cuando se implementen los
              remitos.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remitos" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Los remitos asociados a esta obra se mostraran aqui.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              El personal asignado se mostrara aqui.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comunicaciones" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Nueva nota</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Asunto..." value={nuevoAsunto} onChange={(e) => setNuevoAsunto(e.target.value)} />
              <Textarea placeholder="Contenido de la nota..." value={nuevoContenido} onChange={(e) => setNuevoContenido(e.target.value)} rows={3} />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!nuevoAsunto || !nuevoContenido || createComunicacion.isPending}
                  onClick={() => {
                    createComunicacion.mutate(
                      { obra_id: id, asunto: nuevoAsunto, contenido: nuevoContenido },
                      {
                        onSuccess: () => { setNuevoAsunto(""); setNuevoContenido(""); toast.success("Nota agregada"); },
                        onError: () => toast.error("Error al agregar nota"),
                      }
                    );
                  }}
                >
                  {createComunicacion.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Agregar
                </Button>
              </div>
            </CardContent>
          </Card>

          {comunicaciones && comunicaciones.length > 0 ? (
            <div className="space-y-3">
              {comunicaciones.map((c) => (
                <Card key={c.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{c.asunto}</p>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{c.contenido}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">{formatRelativeDate(c.created_at)}</span>
                    </div>
                    {c.user_profiles && (
                      <p className="text-xs text-muted-foreground mt-2">— {c.user_profiles.nombre} {c.user_profiles.apellido}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Sin comunicaciones registradas
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string | null | undefined;
  capitalize?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${capitalize ? "capitalize" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

const PROGRESS_STATES = [
  "presupuestada",
  "aprobada",
  "en_proyecto",
  "proyecto_aprobado",
  "lista_para_ejecutar",
  "en_montaje",
  "montada",
  "en_uso",
  "en_desarme",
  "desarmada",
  "en_devolucion",
  "cerrada_operativamente",
];

function ObraProgressBar({ estado }: { estado: string }) {
  const idx = PROGRESS_STATES.indexOf(estado);
  if (idx === -1) return null;

  const progress = ((idx + 1) / PROGRESS_STATES.length) * 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Presupuestada</span>
        <span>Cerrada</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
