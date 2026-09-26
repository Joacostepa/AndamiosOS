"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Percent, Search, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useActivarLista,
  useAjustarLista,
  useImportarLista,
  useListaAlquiler,
  useVistaPreviaLista,
} from "@/hooks/use-parametros-cotizacion";
import type { ListaInterpretada } from "@/lib/parametros-cotizacion/lista-alquiler";

// La lista de precios de alquiler por pieza. El canon de "alquiler sin montaje" sale de acá
// más el recargo comercial de Parámetros. Una lista no se edita: se importa una nueva o se
// crea otra ajustando un %. Así una cotización vieja se sigue explicando con su lista.

const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "sin fecha");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ListaDeAlquiler({ puedeEditar, recargoPct }: { puedeEditar: boolean; recargoPct: number | null }) {
  const [elegida, setElegida] = useState<string | null>(null);
  const { data, isLoading, error } = useListaAlquiler(elegida);
  const [busqueda, setBusqueda] = useState("");
  const [importando, setImportando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [activando, setActivando] = useState(false);

  const piezas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return (data?.piezas ?? []).filter((p) => !q || sinTildes(`${p.codigo} ${p.descripcion}`).includes(q));
  }, [data, busqueda]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo leer la lista"}</p>;

  const actual = data.listas.find((l) => l.id === data.seleccionada) ?? null;
  const factor = recargoPct === null ? null : 1 + recargoPct / 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {data.listas.length > 0 && (
          <div className="space-y-1">
            <Label className="text-[12px] text-muted-foreground">Lista</Label>
            <Select
              items={Object.fromEntries(data.listas.map((l) => [l.id, `${l.id} · ${l.nombre}`]))}
              value={data.seleccionada}
              onValueChange={(v) => v && setElegida(v)}
            >
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {data.listas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.id} · {l.nombre}{l.vigente ? " (vigente)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar pieza o código" className="w-64 pl-8" />
        </div>
        {puedeEditar && (
          <div className="ml-auto flex flex-wrap gap-2">
            {actual && !actual.vigente && (
              <Button variant="outline" size="sm" onClick={() => setActivando(true)}>
                <CheckCircle2 /> Pasar a vigente
              </Button>
            )}
            {actual && (
              <Button variant="outline" size="sm" onClick={() => setAjustando(true)}>
                <Percent /> Ajustar por %
              </Button>
            )}
            <Button size="sm" onClick={() => setImportando(true)}>
              <Upload /> Importar planilla
            </Button>
          </div>
        )}
      </div>

      {actual ? (
        <p className="text-[12px] text-muted-foreground">
          {actual.vigente ? <Badge className="mr-1.5">Vigente</Badge> : <Badge variant="outline" className="mr-1.5">No vigente</Badge>}
          {actual.piezas} piezas · vigencia {fecha(actual.vigente_desde)}
          {actual.origen ? ` · ${actual.origen}` : ""}
          {recargoPct !== null && ` · el canon cotizado lleva +${recargoPct.toLocaleString("es-AR")} % sobre esta lista`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay listas cargadas.</p>
      )}

      {actual && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-left text-[12px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Pieza</th>
                <th className="px-3 py-2 text-right font-medium">Lista (30 días)</th>
                {factor && <th className="px-3 py-2 text-right font-medium">Cotizado (+{recargoPct} %)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {piezas.map((p) => (
                <tr key={p.codigo}>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-muted-foreground">{p.codigo}</td>
                  <td className="px-3 py-1.5">{p.descripcion}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{pesos(p.precio)}</td>
                  {factor && <td className="px-3 py-1.5 text-right font-mono tabular-nums">{pesos(Math.round(p.precio * factor * 100) / 100)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {piezas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Ninguna pieza coincide.</p>}
        </div>
      )}

      {importando && <ImportarLista onCerrar={() => setImportando(false)} onListo={(id) => setElegida(id)} />}
      {ajustando && actual && (
        <AjustarLista origen={actual.id} onCerrar={() => setAjustando(false)} onListo={(id) => setElegida(id)} piezasEjemplo={data.piezas.slice(0, 5)} />
      )}
      {activando && actual && <ActivarLista id={actual.id} onCerrar={() => setActivando(false)} />}
    </div>
  );
}

function ImportarLista({ onCerrar, onListo }: { onCerrar: () => void; onListo: (id: string) => void }) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<ListaInterpretada | null>(null);
  const [id, setId] = useState("");
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [activar, setActivar] = useState(true);
  const leer = useVistaPreviaLista();
  const importar = useImportarLista();

  function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f);
    setVista(null);
    leer.mutate(f, {
      onSuccess: ({ vista: v }) => {
        setVista(v);
        if (v.vigencia) setDesde(v.vigencia);
        // Sugerencia de nombre corto a partir de la vigencia: 2026-09-01 → SEP26.
        if (v.vigencia && !id) {
          const [a, m] = v.vigencia.split("-");
          const mes = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][Number(m) - 1];
          setId(`${mes}${a.slice(2)}`);
          setNombre(`Lista de alquiler ${new Date(`${v.vigencia}T12:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}`);
        }
      },
      onError: (e) => toast.error(e.message),
    });
  }

  function guardar() {
    if (!archivo || !vista) return;
    importar.mutate(
      { archivo, id: id.trim().toUpperCase(), nombre: nombre.trim(), vigente_desde: desde || null, activar },
      {
        onSuccess: (r) => {
          toast.success(`Lista ${r.id} importada: ${r.piezas} piezas${activar ? ", ya es la vigente" : ""}`);
          onListo(r.id);
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar lista de alquiler</DialogTitle>
          <DialogDescription>
            La planilla de Excel con las columnas CÓDIGO, DESCRIPCIÓN y PRECIO (como la de JUN26). Primero se lee y se
            muestra lo que se entendió; se guarda recién cuando confirmás.
          </DialogDescription>
        </DialogHeader>

        <input ref={archivoRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => archivoRef.current?.click()} disabled={leer.isPending}>
          {leer.isPending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {archivo ? archivo.name : "Elegir planilla .xlsx"}
        </Button>

        {vista && (
          <div className="space-y-3">
            <p className="text-[13px]">
              <span className="font-medium">{vista.piezas.length} piezas</span>
              {vista.vigencia ? ` · vigencia ${fecha(vista.vigencia)}` : " · la planilla no trae fecha de vigencia"}
            </p>
            {vista.descartadas.length > 0 && (
              <div className="flex gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-[12px]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-400" />
                <div>
                  <p className="font-medium">{vista.descartadas.length} filas no se van a importar:</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {vista.descartadas.slice(0, 6).map((d) => (
                      <li key={d.fila}>Fila {d.fila} ({d.motivo}): {d.contenido}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="max-h-48 overflow-y-auto rounded-md border border-border text-[12px]">
              {vista.piezas.slice(0, 50).map((p) => (
                <div key={p.codigo} className="flex justify-between gap-2 border-b border-border/50 px-2.5 py-1">
                  <span className="truncate">{p.codigo} · {p.descripcion}</span>
                  <span className="shrink-0 font-mono tabular-nums">{pesos(p.precio)}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Nombre corto</Label>
                <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="SEP26" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Lista de alquiler septiembre 2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Vigente desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-[13px] sm:col-span-2">
                <Switch checked={activar} onCheckedChange={setActivar} /> Pasarla a vigente al guardar
              </label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={!vista || !id.trim() || nombre.trim().length < 3 || importar.isPending}>
            {importar.isPending && <Loader2 className="animate-spin" />}
            Guardar lista
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AjustarLista({
  origen,
  piezasEjemplo,
  onCerrar,
  onListo,
}: {
  origen: string;
  piezasEjemplo: { codigo: string; descripcion: string; precio: number }[];
  onCerrar: () => void;
  onListo: (id: string) => void;
}) {
  const [pct, setPct] = useState("");
  const [id, setId] = useState("");
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }));
  const [activar, setActivar] = useState(true);
  const [motivo, setMotivo] = useState("");
  const ajustar = useAjustarLista();

  const n = Number(pct.replace(",", "."));
  const valido = pct.trim() !== "" && Number.isFinite(n);

  function guardar() {
    ajustar.mutate(
      { origen, id: id.trim().toUpperCase(), nombre: nombre.trim(), porcentaje: n, vigente_desde: desde || null, activar, motivo },
      {
        onSuccess: (r) => {
          toast.success(`Lista ${r.id} creada (${origen} ${n >= 0 ? "+" : ""}${n} %): ${r.piezas} piezas`);
          onListo(r.id);
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar {origen} por %</DialogTitle>
          <DialogDescription>Crea una lista nueva con todos los precios de {origen} ajustados. {origen} queda como estaba.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ajuste (%)</Label>
            <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ej: 4,5" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre corto</Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="OCT26" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Lista de alquiler octubre 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Vigente desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <Switch checked={activar} onCheckedChange={setActivar} /> Pasarla a vigente
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Por qué</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: índice CAC de septiembre" className="min-h-14 text-[13px]" />
          </div>
        </div>
        {valido && (
          <div className="rounded-md border border-border text-[12px]">
            {piezasEjemplo.map((p) => (
              <div key={p.codigo} className="flex justify-between gap-2 border-b border-border/50 px-2.5 py-1 last:border-0">
                <span className="truncate">{p.descripcion}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {pesos(p.precio)} → {pesos(Math.round(p.precio * (1 + n / 100) * 100) / 100)}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={!valido || !id.trim() || nombre.trim().length < 3 || motivo.trim().length < 3 || ajustar.isPending}>
            {ajustar.isPending && <Loader2 className="animate-spin" />}
            Crear lista
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivarLista({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const activar = useActivarLista();
  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pasar {id} a vigente</DialogTitle>
          <DialogDescription>Desde ahora el asistente cotiza el alquiler sin montaje con esta lista.</DialogDescription>
        </DialogHeader>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué cambia la lista vigente" className="min-h-14 text-[13px]" autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button
            disabled={motivo.trim().length < 3 || activar.isPending}
            onClick={() =>
              activar.mutate(
                { id, motivo },
                { onSuccess: () => { toast.success(`${id} es la lista vigente`); onCerrar(); }, onError: (e) => toast.error(e.message) },
              )
            }
          >
            {activar.isPending && <Loader2 className="animate-spin" />}
            Pasar a vigente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
