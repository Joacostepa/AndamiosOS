"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCreateRelevamiento } from "@/hooks/use-relevamientos";
import { useOportunidades } from "@/hooks/use-oportunidades";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function NuevoRelevamientoPage() {
  return <Suspense><NuevoRelevamientoContent /></Suspense>;
}

function NuevoRelevamientoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oportunidadParam = searchParams.get("oportunidad");
  const { data: oportunidades } = useOportunidades();
  const createRelevamiento = useCreateRelevamiento();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    oportunidad_id: oportunidadParam || "",
    direccion: "", localidad: "", provincia: "Buenos Aires",
    contacto_nombre: "", contacto_telefono: "",
    fecha_programada: "",
    tipo_edificio: "", cantidad_pisos: 0, altura_estimada: 0,
    metros_lineales: 0, superficie_fachada: 0,
    sistema_recomendado: "multidireccional" as string,
    tipo_acceso: "", tipo_suelo: "", interferencias: "",
    requiere_permiso_municipal: false, requiere_proteccion_peatonal: false,
    requiere_red_seguridad: false, horario_restriccion: "",
    anclajes_especiales: false, tipo_montaje: "",
    observaciones_tecnicas: "", observaciones: "",
  });

  function update(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.direccion) { toast.error("La direccion es obligatoria"); return; }
    createRelevamiento.mutate(form as any, {
      onSuccess: () => { toast.success("Relevamiento creado"); router.push("/comercial/relevamientos"); },
      onError: () => toast.error("Error al crear"),
    });
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader title="Nuevo Relevamiento" />

      {/* Step indicator */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <button key={s} onClick={() => setStep(s)} className={`flex-1 h-2 rounded-full transition-colors ${step >= s ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Paso {step} de 4: {step === 1 ? "Donde" : step === 2 ? "Que" : step === 3 ? "Condiciones" : "Observaciones"}
      </p>

      {/* Step 1: Donde */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ubicacion y contacto</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Oportunidad</Label>
              <Select value={form.oportunidad_id} onValueChange={(v) => v && update("oportunidad_id", v)}>
                <SelectTrigger><SelectValue placeholder="Vincular a oportunidad (opcional)..." /></SelectTrigger>
                <SelectContent>{oportunidades?.map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.titulo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Direccion *</Label><Input value={form.direccion} onChange={(e) => update("direccion", e.target.value)} placeholder="Av. Corrientes 1234" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Localidad</Label><Input value={form.localidad} onChange={(e) => update("localidad", e.target.value)} placeholder="CABA" /></div>
              <div className="space-y-2"><Label>Provincia</Label><Input value={form.provincia} onChange={(e) => update("provincia", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Contacto en sitio</Label><Input value={form.contacto_nombre} onChange={(e) => update("contacto_nombre", e.target.value)} /></div>
              <div className="space-y-2"><Label>Telefono</Label><Input value={form.contacto_telefono} onChange={(e) => update("contacto_telefono", e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Fecha programada</Label><Input type="datetime-local" value={form.fecha_programada} onChange={(e) => update("fecha_programada", e.target.value)} /></div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Que */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del sitio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Tipo de edificio</Label><Input value={form.tipo_edificio} onChange={(e) => update("tipo_edificio", e.target.value)} placeholder="Edificio residencial, comercial, industrial..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Cantidad de pisos</Label><Input type="number" value={form.cantidad_pisos || ""} onChange={(e) => update("cantidad_pisos", Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Altura estimada (m)</Label><Input type="number" step="0.1" value={form.altura_estimada || ""} onChange={(e) => update("altura_estimada", Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Metros lineales</Label><Input type="number" step="0.1" value={form.metros_lineales || ""} onChange={(e) => update("metros_lineales", Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Superficie fachada (m2)</Label><Input type="number" step="0.1" value={form.superficie_fachada || ""} onChange={(e) => update("superficie_fachada", Number(e.target.value))} /></div>
            </div>
            <div className="space-y-2">
              <Label>Sistema recomendado</Label>
              <Select value={form.sistema_recomendado} onValueChange={(v) => v && update("sistema_recomendado", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="multidireccional">Multidireccional</SelectItem>
                  <SelectItem value="tubular">Tubular</SelectItem>
                  <SelectItem value="colgante">Colgante</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Tipo de montaje</Label><Input value={form.tipo_montaje} onChange={(e) => update("tipo_montaje", e.target.value)} placeholder="Fachada completa, parcial, interior..." /></div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Condiciones */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Condiciones del sitio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Tipo de acceso</Label><Input value={form.tipo_acceso} onChange={(e) => update("tipo_acceso", e.target.value)} placeholder="Calle angosta, medianera, vereda amplia..." /></div>
            <div className="space-y-2"><Label>Tipo de suelo</Label><Input value={form.tipo_suelo} onChange={(e) => update("tipo_suelo", e.target.value)} placeholder="Baldosa, tierra, asfalto, irregular..." /></div>
            <div className="space-y-2"><Label>Interferencias</Label><Input value={form.interferencias} onChange={(e) => update("interferencias", e.target.value)} placeholder="Cables, arboles, canerias, aires acondicionados..." /></div>
            <div className="space-y-2"><Label>Restriccion horaria</Label><Input value={form.horario_restriccion} onChange={(e) => update("horario_restriccion", e.target.value)} placeholder="Ej: Solo de 8 a 17hs" /></div>
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between"><Label>Requiere permiso municipal</Label><Switch checked={form.requiere_permiso_municipal} onCheckedChange={(v) => update("requiere_permiso_municipal", v)} /></div>
              <div className="flex items-center justify-between"><Label>Requiere proteccion peatonal</Label><Switch checked={form.requiere_proteccion_peatonal} onCheckedChange={(v) => update("requiere_proteccion_peatonal", v)} /></div>
              <div className="flex items-center justify-between"><Label>Requiere red de seguridad</Label><Switch checked={form.requiere_red_seguridad} onCheckedChange={(v) => update("requiere_red_seguridad", v)} /></div>
              <div className="flex items-center justify-between"><Label>Anclajes especiales</Label><Switch checked={form.anclajes_especiales} onCheckedChange={(v) => update("anclajes_especiales", v)} /></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Observaciones */}
      {step === 4 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones y notas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Observaciones tecnicas</Label><Textarea value={form.observaciones_tecnicas} onChange={(e) => update("observaciones_tecnicas", e.target.value)} rows={4} placeholder="Notas tecnicas, recomendaciones, riesgos..." /></div>
            <div className="space-y-2"><Label>Observaciones generales</Label><Textarea value={form.observaciones} onChange={(e) => update("observaciones", e.target.value)} rows={3} placeholder="Notas adicionales..." /></div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>Anterior</Button>
        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)}>Siguiente</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createRelevamiento.isPending}>
            {createRelevamiento.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear relevamiento
          </Button>
        )}
      </div>
    </div>
  );
}
