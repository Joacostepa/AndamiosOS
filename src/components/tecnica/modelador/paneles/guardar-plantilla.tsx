"use client";

// "Guardar como plantilla" (pedido 8d): la Oficina Técnica guarda el modelo (o la estructura
// compuesta) como plantilla propia y aparece en la galería en "Mis plantillas", sin programar.

import { useState } from "react";
import { toast } from "sonner";
import { tipologia } from "@/lib/tecnica/modelo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "../estado/store";
import { guardarAhora } from "../estado/autoguardado";
import { useGuardarComoPlantilla } from "../datos/api";
import { CATEGORIAS_PLANTILLA } from "../datos/tipos";
import { Chips } from "./campos";
import { Loader2 } from "lucide-react";

function categoriaSugerida(): string {
  const d = useEditor.getState().diseno;
  const t = tipologia(d.estructuras[0]?.tipologia ?? "")?.categoria;
  if (t === "portico") return "bandeja";
  if (t === "fachada" || t === "bandeja" || t === "torre") return t;
  return "especial";
}

export function GuardarPlantilla({ abierto, onCambiar }: { abierto: boolean; onCambiar: (v: boolean) => void }) {
  const modeloId = useEditor((s) => s.modeloId);
  const nombreDiseno = useEditor((s) => s.diseno.nombre);
  const [nombre, setNombre] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const guardar = useGuardarComoPlantilla();

  const confirmar = async () => {
    if (!modeloId) return;
    const n = (nombre ?? nombreDiseno).trim();
    if (!n) return;
    if (!(await guardarAhora())) {
      toast.error("Primero tiene que quedar guardado el modelo");
      return;
    }
    try {
      await guardar.mutateAsync({ id: modeloId, nombre: n, descripcion: descripcion.trim() || undefined, categoria: categoria ?? categoriaSugerida() });
      onCambiar(false);
      toast.success(`Guardé la plantilla «${n}»`, { description: "Aparece en la galería, en Mis plantillas." });
    } catch (e) {
      toast.error("No se guardó la plantilla", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar como plantilla</DialogTitle>
          <DialogDescription>Se guarda una copia sin obra. La vas a encontrar en la galería, en «Mis plantillas».</DialogDescription>
        </DialogHeader>
        {!modeloId ? (
          <p className="text-sm text-muted-foreground">El modo demostración no guarda en Andamios OS.</p>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Nombre</span>
              <Input value={nombre ?? nombreDiseno} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Para qué sirve (opcional)</span>
              <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Bandeja con pórtico de 2,50 de gálibo para vereda angosta…" />
            </label>
            <div className="space-y-1 text-sm">
              <span className="text-muted-foreground">Categoría de la galería</span>
              <Chips opciones={CATEGORIAS_PLANTILLA.map((c) => ({ valor: c.valor as string, etiqueta: c.etiqueta }))} valor={categoria ?? categoriaSugerida()} onElegir={setCategoria} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiar(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!modeloId || guardar.isPending || !(nombre ?? nombreDiseno).trim()}>
            {guardar.isPending && <Loader2 className="animate-spin" />} Guardar plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
