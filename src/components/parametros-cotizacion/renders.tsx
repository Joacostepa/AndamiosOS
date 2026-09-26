"use client";

import { useRef, useState } from "react";
import { ImageOff, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useBorrarRender, useRenderPorDefecto, useRenders, useSubirRender } from "@/hooks/use-parametros-cotizacion";
import { TIPOS_RENDER } from "@/lib/parametros-cotizacion/tipos";

// La biblioteca de renders genéricos. El criterio pide preguntar SIEMPRE qué render va:
// uno de acá (el de por defecto del tipo) o uno propio de la obra. La skill venía con esta
// carpeta vacía, así que arranca vacía y se llena desde acá.

export function Renders({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, error } = useRenders();
  const porDefecto = useRenderPorDefecto();
  const borrar = useBorrarRender();
  const [subiendo, setSubiendo] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudieron leer los renders"}</p>;

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="flex">
          <Button size="sm" className="ml-auto" onClick={() => setSubiendo(true)}>
            <ImagePlus /> Subir render
          </Button>
        </div>
      )}
      {data.length === 0 ? (
        <EmptyState icon={ImageOff} title="Todavía no hay renders" description="Subí uno por tipo de sistema (fachada, bandeja, torre…) para que el asistente pueda ofrecerlo en las propuestas." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => (
            <figure key={r.id} className="overflow-hidden rounded-lg border border-border">
              {r.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, vence en una hora
                <img src={r.url} alt={r.nombre} className="aspect-[4/3] w-full bg-muted object-contain" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-muted text-muted-foreground"><ImageOff /></div>
              )}
              <figcaption className="space-y-1.5 p-3">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[13px] font-medium">{r.nombre}</p>
                  {r.por_defecto && <Badge>Por defecto</Badge>}
                </div>
                <p className="text-[12px] text-muted-foreground">{TIPOS_RENDER[r.tipo as keyof typeof TIPOS_RENDER] ?? r.tipo}</p>
                {puedeEditar && (
                  <div className="flex gap-1">
                    {!r.por_defecto && (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={porDefecto.isPending}
                        onClick={() => porDefecto.mutate(r.id, { onError: (e) => toast.error(e.message) })}
                      >
                        <Star /> Usar por defecto
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="ml-auto text-destructive"
                      disabled={borrar.isPending}
                      onClick={() => {
                        if (confirm(`¿Borrar «${r.nombre}»?`)) borrar.mutate(r.id, { onError: (e) => toast.error(e.message) });
                      }}
                    >
                      <Trash2 /> Borrar
                    </Button>
                  </div>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {subiendo && <SubirRender onCerrar={() => setSubiendo(false)} />}
    </div>
  );
}

function SubirRender({ onCerrar }: { onCerrar: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<string>("fachada");
  const [nombre, setNombre] = useState("");
  const [defecto, setDefecto] = useState(true);
  const subir = useSubirRender();

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir render</DialogTitle>
          <DialogDescription>PNG o JPG. Va a la sección «Representación gráfica» de la propuesta.</DialogDescription>
        </DialogHeader>
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setArchivo(f);
            if (f && !nombre) setNombre(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
          }}
        />
        <Button variant="outline" onClick={() => ref.current?.click()}>
          <ImagePlus /> {archivo ? archivo.name : "Elegir imagen"}
        </Button>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de sistema</Label>
            <Select items={TIPOS_RENDER} value={tipo} onValueChange={(v) => v && setTipo(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS_RENDER).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Fachada multidireccional con bandeja" />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={defecto} onCheckedChange={setDefecto} /> Usarlo por defecto para este tipo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button
            disabled={!archivo || nombre.trim().length < 2 || subir.isPending}
            onClick={() =>
              archivo &&
              subir.mutate(
                { archivo, tipo, nombre: nombre.trim(), por_defecto: defecto },
                { onSuccess: () => { toast.success("Render cargado"); onCerrar(); }, onError: (e) => toast.error(e.message) },
              )
            }
          >
            {subir.isPending && <Loader2 className="animate-spin" />}
            Subir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
