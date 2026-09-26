"use client";

import { useState } from "react";
import { Eye, History, Loader2, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/shared/markdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCriterio, useGuardarCriterio } from "@/hooks/use-parametros-cotizacion";

// El criterio escrito que lee el asistente. Editar = versión nueva; restaurar una vieja =
// guardar su texto como versión nueva. El historial nunca retrocede, así una propuesta vieja
// se puede explicar con el criterio que regía cuando se hizo.
//
// Los números NO van acá: van en Tarifas y se referencian como [Parámetro: …]. Si se
// escribe "$140.000" en el texto, al cambiar la tarifa quedan dos números vivos.

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Criterio({ puedeEditar }: { puedeEditar: boolean }) {
  const [version, setVersion] = useState<number | undefined>(undefined);
  const { data, isLoading, error } = useCriterio(version);
  const guardar = useGuardarCriterio();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [notas, setNotas] = useState("");
  const [vistaPrevia, setVistaPrevia] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo leer el criterio"}</p>;

  const vigente = data.versiones.find((v) => v.vigente);
  const mostrada = data.criterio;
  const esVigente = vigente?.version === mostrada.version;

  function empezar(desde: string, nota: string) {
    setTexto(desde);
    setNotas(nota);
    setVistaPrevia(false);
    setEditando(true);
  }

  function guardarVersion() {
    guardar.mutate(
      { contenido: texto, notas },
      {
        onSuccess: ({ version: v }) => {
          toast.success(`Criterio v${v} guardado: el asistente lo usa desde la próxima conversación`);
          setEditando(false);
          setVersion(undefined);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  if (editando) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={vistaPrevia ? "outline" : "secondary"} size="sm" onClick={() => setVistaPrevia(false)}>
            <Pencil /> Texto
          </Button>
          <Button variant={vistaPrevia ? "secondary" : "outline"} size="sm" onClick={() => setVistaPrevia(true)}>
            <Eye /> Vista previa
          </Button>
          <p className="text-[12px] text-muted-foreground">
            Markdown: <code># título</code>, <code>**negrita**</code>, <code>- viñeta</code>, tablas con <code>|</code>. Números vigentes como{" "}
            <code>[Parámetro: Bandeja 3 m]</code>.
          </p>
        </div>
        {vistaPrevia ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border p-4">
            <Markdown>{texto}</Markdown>
          </div>
        ) : (
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[60vh] font-mono text-[12px] leading-relaxed" />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-72 flex-1 space-y-1.5">
            <Label>Qué cambia en esta versión</Label>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: la gestoría fuera de CABA va siempre como opcional" />
          </div>
          <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          <Button onClick={guardarVersion} disabled={guardar.isPending || notas.trim().length < 3 || texto.trim().length < 200}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar versión nueva
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          items={Object.fromEntries(data.versiones.map((v) => [String(v.version), `Versión ${v.version}`]))}
          value={String(mostrada.version)}
          onValueChange={(v) => v && setVersion(Number(v) === vigente?.version ? undefined : Number(v))}
        >
          <SelectTrigger className="w-64"><History className="size-4" /><SelectValue /></SelectTrigger>
          <SelectContent>
            {data.versiones.map((v) => (
              <SelectItem key={v.version} value={String(v.version)}>
                Versión {v.version}{v.vigente ? " (vigente)" : ""} · {fechaHora(v.created_at)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {esVigente ? <Badge>Vigente</Badge> : <Badge variant="outline">Versión anterior</Badge>}
        {puedeEditar && (
          <div className="ml-auto flex gap-2">
            {esVigente ? (
              <Button size="sm" onClick={() => empezar(mostrada.contenido, "")}>
                <Pencil /> Editar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => empezar(mostrada.contenido, `Restaura la versión ${mostrada.version}`)}>
                <RotateCcw /> Restaurar esta versión
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {mostrada.notas ?? "Sin notas"} · {fechaHora(mostrada.created_at)}
        {(() => {
          const v = data.versiones.find((x) => x.version === mostrada.version);
          return v?.autor ? ` · ${v.autor}` : "";
        })()}
      </p>
      <div className="rounded-lg border border-border p-4 sm:p-6">
        <Markdown>{mostrada.contenido}</Markdown>
      </div>
    </div>
  );
}
