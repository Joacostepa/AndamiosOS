"use client";

// Generar el cómputo REAL (computos + computo_items) desde el modelo. El servidor recalcula
// desde el diseño guardado (no confía en la lista del navegador), muestra la diferencia con lo
// que ya hay y respeta lo editado a mano: por cada línea en conflicto se elige qué hacer. Si el
// cómputo está completado no se regenera.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "../util/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useObras } from "@/hooks/use-obras";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { cn } from "@/lib/utils";
import { useEditor } from "../estado/store";
import { guardarAhora } from "../estado/autoguardado";
import { ErrorOmitidas, ErrorRevision, usePreviaComputo, useGenerarComputo } from "../datos/api";
import type { DecisionDiff, DiffLinea, PreviaComputo, TipoDiff } from "../datos/tipos";
import { Loader2 } from "lucide-react";

const ETIQUETA: Record<TipoDiff, string> = {
  nuevo: "Nuevo", cambia: "Cambia", igual: "Igual", quita: "Sale", conflicto_manual: "Editado a mano",
  quita_editado: "Editado a mano, sale", manual: "Manual",
};
const COLOR: Record<TipoDiff, string> = {
  nuevo: "bg-[var(--tb-ok)]/15 text-[var(--tb-ok)]", cambia: "bg-primary/10 text-primary",
  igual: "bg-muted text-muted-foreground", quita: "bg-destructive/10 text-destructive", conflicto_manual: "bg-[var(--tb-aviso-bg)] text-[var(--tb-aviso-text)]",
  quita_editado: "bg-[var(--tb-aviso-bg)] text-[var(--tb-aviso-text)]", manual: "bg-muted text-muted-foreground",
};
const ETIQUETA_DECISION: Record<DecisionDiff, string> = { mantener: "Mantener lo manual", modelo: "Usar el modelo", sumar: "Sumar", borrar: "Borrar" };

export function GenerarComputo({ abierto, onCambiar }: { abierto: boolean; onCambiar: (v: boolean) => void }) {
  const modeloId = useEditor((s) => s.modeloId);
  const obraDiseno = useEditor((s) => s.diseno.obra);
  const puedeComputos = usePuedeEditar("computos");
  const router = useRouter();
  const obras = useObras();
  const [obraId, setObraId] = useState<string>("");
  const obraElegida = obraDiseno?.id ?? obraId;
  const previa = usePreviaComputo();
  const generar = useGenerarComputo();
  const [datos, setDatos] = useState<PreviaComputo | null>(null);
  const [decisiones, setDecisiones] = useState<Record<string, DecisionDiff>>({});
  const [aceptoOmitidas, setAcepto] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);

  const pedirPrevia = async () => {
    if (!modeloId || !obraElegida) return;
    const ok = await guardarAhora();
    const rev = useEditor.getState().revision;
    if (!ok || rev === null) {
      toast.error("Primero tiene que quedar guardado el modelo");
      return;
    }
    try {
      const p = await previa.mutateAsync({ id: modeloId, obra_id: obraElegida, revision: rev });
      setDatos(p);
      setDecisiones({});
      setAcepto(p.omitidas.length === 0);
      setReemplazar(false);
    } catch (e) {
      toast.error("No pude calcular la previa", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const confirmar = async () => {
    if (!modeloId || !obraElegida || !datos) return;
    const rev = useEditor.getState().revision ?? 1;
    try {
      const r = await generar.mutateAsync({
        id: modeloId, obra_id: obraElegida, revision: rev, decisiones,
        aceptoOmitidas, reemplazarOtroModelo: datos.computo.otroModelo ? reemplazar : undefined,
      });
      onCambiar(false);
      setDatos(null);
      // la RPC vincula a la obra un modelo que no tenía: el editor lo refleja sin recargar
      if (!obraDiseno) {
        const o = obras.data?.find((x) => x.id === obraElegida);
        if (o) useEditor.getState().setObraVinculada({ id: o.id, codigo: o.codigo, nombre: o.nombre });
      }
      toast.success("Cómputo generado desde el modelo", {
        description: `${r.insertadas} nuevas · ${r.actualizadas} actualizadas · ${r.conservadas} conservadas · ${r.borradas} borradas${r.omitidas.length ? ` · ${r.omitidas.length} sin código` : ""}`,
        action: { label: "Abrir cómputo", onClick: () => router.push(`/oficina-tecnica/computos/${obraElegida}`) },
      });
    } catch (e) {
      if (e instanceof ErrorRevision) {
        toast.error("El modelo cambió mientras mirabas la previa", { description: "Volvé a pedir «Ver qué cambia»." });
        setDatos(null);
        return;
      }
      if (e instanceof ErrorOmitidas) {
        toast.error("Hay piezas sin código que no entran al cómputo", { description: "Confirmá abajo que las cargás a mano." });
        return;
      }
      toast.error("No se generó el cómputo", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const visibles = useMemo(() => (datos?.diff ?? []).filter((l) => l.tipo !== "igual"), [datos]);

  return (
    <Dialog open={abierto} onOpenChange={(v) => { onCambiar(v); if (!v) setDatos(null); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generar cómputo desde el modelo</DialogTitle>
          <DialogDescription>
            Se recalcula en el servidor con el modelo guardado. Lo que se editó a mano en el cómputo no se pisa sin preguntar. PREDIMENSIONADO.
          </DialogDescription>
        </DialogHeader>

        {!modeloId && <p className="text-sm text-muted-foreground">Este modelo no está guardado en Andamios OS (modo demostración): no se puede generar un cómputo.</p>}
        {modeloId && !puedeComputos && <p className="text-sm text-destructive">Necesitás permiso para editar Cómputos.</p>}

        {modeloId && puedeComputos && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Obra:</span>
              {obraDiseno ? (
                <span className="font-medium">{obraDiseno.codigo} · {obraDiseno.nombre}</span>
              ) : (
                <select className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={obraId} onChange={(e) => { setObraId(e.target.value); setDatos(null); }}>
                  <option value="">Elegí la obra…</option>
                  {(obras.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
                </select>
              )}
            </div>

            {!datos && (
              <Button onClick={pedirPrevia} disabled={!obraElegida || previa.isPending}>
                {previa.isPending && <Loader2 className="animate-spin" />} Ver qué cambia
              </Button>
            )}

            {datos && (
              <>
                {datos.computo.bloqueado ? (
                  <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                    {datos.computo.motivoBloqueo ?? `El cómputo de esta obra está completado (${datos.computo.estado}): no se regenera. Pedí que lo reabran si hace falta.`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {datos.computo.id ? "Se actualiza el último cómputo de la obra." : "La obra no tiene cómputo: se crea uno nuevo."} {datos.diff.filter((l) => l.tipo === "igual").length} líneas quedan igual.
                  </p>
                )}
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr><th className="p-1.5 text-left font-medium">Pieza</th><th className="p-1.5 text-right font-medium">Hoy</th><th className="p-1.5 text-right font-medium">Modelo</th><th className="p-1.5 text-left font-medium">Qué hago</th></tr>
                    </thead>
                    <tbody>
                      {visibles.map((l) => <FilaDiff key={l.pieza_id} l={l} decision={decisiones[l.pieza_id]} onDecidir={(d) => setDecisiones({ ...decisiones, [l.pieza_id]: d })} />)}
                      {!visibles.length && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No cambia nada.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {datos.computo.otroModelo && !datos.computo.bloqueado && (
                  <label className="flex items-start gap-2 rounded-md bg-[var(--tb-aviso-bg)] p-2 text-xs">
                    <Checkbox checked={reemplazar} onCheckedChange={(v) => setReemplazar(!!v)} />
                    <span>El cómputo de esta obra se generó desde otro modelo. Entiendo que pasa a depender de este.</span>
                  </label>
                )}
                {datos.omitidas.length > 0 && (
                  <div className="rounded-md bg-[var(--tb-aviso-bg)] p-2 text-xs">
                    <p className="font-medium text-[var(--tb-aviso-text)]">
                      {datos.omitidas.length} pieza{datos.omitidas.length === 1 ? "" : "s"} sin código no entra{datos.omitidas.length === 1 ? "" : "n"} al cómputo:
                    </p>
                    <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-muted-foreground">
                      {datos.omitidas.map((o) => <li key={o.clave}>{o.descripcion} × {o.cantidad}</li>)}
                    </ul>
                    <label className="mt-1.5 flex items-center gap-2">
                      <Checkbox checked={aceptoOmitidas} onCheckedChange={(v) => setAcepto(!!v)} /> Entiendo: las cargo a mano o pido que Oficina Técnica las mapee.
                    </label>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiar(false)}>Cancelar</Button>
          {datos && !datos.computo.bloqueado && (
            <Button onClick={confirmar} disabled={generar.isPending || !aceptoOmitidas || (datos.computo.otroModelo && !reemplazar)}>
              {generar.isPending && <Loader2 className="animate-spin" />} Generar cómputo
            </Button>
          )}
          {obraElegida && (
            <Link href={`/oficina-tecnica/computos/${obraElegida}`} className="self-center text-xs text-muted-foreground underline">
              Ver el cómputo de la obra
            </Link>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaDiff({ l, decision, onDecidir }: { l: DiffLinea; decision?: DecisionDiff; onDecidir: (d: DecisionDiff) => void }) {
  // Las opciones las dice el servidor (solo en conflicto_manual y quita_editado).
  const conDecision = l.opciones.length > 0;
  return (
    <tr className="border-t border-border">
      <td className="p-1.5">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn("border-0 px-1.5 text-[10px]", COLOR[l.tipo])}>{ETIQUETA[l.tipo]}</Badge>
          <span className="font-mono">{l.codigo ?? "—"}</span>
        </div>
        <div className="truncate text-muted-foreground">{l.descripcion}</div>
      </td>
      <td className="p-1.5 text-right font-mono">{l.actual ?? "—"}</td>
      <td className="p-1.5 text-right font-mono">{l.modelo ?? "—"}</td>
      <td className="p-1.5">
        {conDecision ? (
          <select className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={decision ?? l.decisionPorDefecto ?? l.opciones[0]} onChange={(e) => onDecidir(e.target.value as DecisionDiff)}>
            {l.opciones.map((o) => <option key={o} value={o}>{ETIQUETA_DECISION[o]}</option>)}
          </select>
        ) : (
          <span className="text-muted-foreground">{l.tipo === "quita" ? "Se borra" : l.tipo === "nuevo" ? "Se agrega" : l.tipo === "manual" ? "No se toca" : "Se actualiza"}</span>
        )}
      </td>
    </tr>
  );
}
