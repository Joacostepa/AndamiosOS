"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCatalogoPanol } from "@/hooks/use-panol";
import { useCrearArticulo } from "@/hooks/use-panol-catalogo";
import { TIPO_ARTICULO, type Articulo, type TipoArticulo } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";
import { SelectorUbicacion } from "./selector-ubicacion";
import { numero, UNIDADES_RETIRO } from "./formato";

// Alta de artículo (encargados; insert directo, la RLS lo permite sólo a ellos).
//
// Tres tipos y dos marcas, nada más (docs/modulo-panol.md §1):
//   - "Seguridad crítica" sólo para herramientas con número: lo crítico se sigue unidad por
//     unidad, porque la inspección es de cada arnés, no del artículo.
//   - "Tiene talles" sólo para insumos (EPP: guantes, botines, ropa). Cada talle es una
//     variante con su propio stock.
// Una herramienta con número sin unidades no sirve para nada: al crearla se sigue directo
// al alta de unidades (lo decide quien abre el diálogo, con `onCreado`).

const PLACEHOLDER: Record<TipoArticulo, string> = {
  insumo: "Ej.: Guantes moteados",
  herramienta: "Ej.: Cabo de vida doble",
  granel: "Ej.: Martillo de carpintero",
};

export function DialogoAltaArticulo({
  open,
  onOpenChange,
  nombreInicial = "",
  onCreado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** "?nuevo=<texto>": lo que alguien se llevó sin alta. */
  nombreInicial?: string;
  onCreado: (a: Articulo) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {open && <Form nombreInicial={nombreInicial} onCreado={onCreado} onCancelar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ nombreInicial, onCreado, onCancelar }: { nombreInicial: string; onCreado: (a: Articulo) => void; onCancelar: () => void }) {
  const cat = useCatalogoPanol();
  const crear = useCrearArticulo();
  const [tipo, setTipo] = useState<TipoArticulo>("insumo");
  const [nombre, setNombre] = useState(nombreInicial);
  const [unidad, setUnidad] = useState("u.");
  const [minimo, setMinimo] = useState("");
  const [reponer, setReponer] = useState("");
  const [ubicacion, setUbicacion] = useState<string | null>(null);
  const [critica, setCritica] = useState(false);
  const [conTalles, setConTalles] = useState(false);
  const [talles, setTalles] = useState<string[]>([]);
  const [talleNuevo, setTalleNuevo] = useState("");

  const nMin = numero(minimo);
  const nRep = numero(reponer);
  const rangoMal = nMin !== null && nRep !== null && nRep < nMin;
  const listo = nombre.trim().length > 1 && !rangoMal && (!conTalles || talles.length > 0) && !crear.isPending;

  function agregarTalle() {
    const t = talleNuevo.trim();
    if (!t || talles.includes(t)) return;
    setTalles([...talles, t]);
    setTalleNuevo("");
  }

  function guardar() {
    crear.mutate(
      {
        nombre: nombre.trim(),
        tipo,
        seguridad_critica: tipo === "herramienta" && critica,
        tiene_talles: tipo === "insumo" && conTalles,
        unidad: tipo === "herramienta" ? "u." : unidad,
        minimo: nMin,
        reponer_hasta: nRep,
        ubicacion_id: ubicacion,
        talles: tipo === "insumo" && conTalles ? talles : [],
      },
      {
        onSuccess: (a) => {
          toast.success(`${a.nombre}: dado de alta.`);
          onCreado(a);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[17px]">Nuevo artículo</DialogTitle>
        <DialogDescription className="text-[14px] text-foreground/80">¿Qué es?</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Tipo de artículo" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(TIPO_ARTICULO) as TipoArticulo[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={cn(
              "flex flex-col gap-0.5 rounded-md px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-ring",
              tipo === t ? "border-2 border-foreground bg-muted" : "border hover:bg-muted/60",
            )}
          >
            <span className="text-[13px] font-semibold">{TIPO_ARTICULO[t].titulo}</span>
            <span className="text-[12px] text-muted-foreground">{TIPO_ARTICULO[t].ayuda}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-[13px] font-medium">Nombre</span>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={PLACEHOLDER[tipo]} autoFocus />
        </label>
        {tipo !== "herramienta" && (
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Unidad de retiro</span>
            <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px]">
              {UNIDADES_RETIRO.map((u) => <option key={u.valor} value={u.valor}>{u.texto}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Ubicación</span>
          <SelectorUbicacion ubicaciones={cat.data?.ubicaciones ?? []} value={ubicacion} onChange={setUbicacion} vacio="Sin ubicación todavía" />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Stock mínimo</span>
          <Input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Avisa por debajo de esto" />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Reponer hasta</span>
          <Input inputMode="decimal" value={reponer} onChange={(e) => setReponer(e.target.value)} aria-invalid={rangoMal} />
          {rangoMal && <span className="block text-[12px] text-red-700 dark:text-red-300">Tiene que ser mayor que el mínimo.</span>}
        </label>
      </div>

      {tipo === "insumo" && (
        <div className="space-y-2 rounded-md border p-3">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-[13px] font-medium">Tiene talles</span>
              <span className="block text-[12px] text-muted-foreground">Para EPP como guantes, botines o ropa. Cada talle es una variante con su propio stock.</span>
            </span>
            <Switch checked={conTalles} onCheckedChange={setConTalles} />
          </label>
          {conTalles && (
            <div className="flex flex-wrap items-center gap-1.5">
              {talles.map((t) => (
                <span key={t} className="inline-flex h-7 items-center gap-1 rounded-md bg-muted pl-2.5 pr-1 text-[13px]">
                  {t}
                  <button type="button" aria-label={`Quitar talle ${t}`} onClick={() => setTalles(talles.filter((x) => x !== t))} className="rounded p-0.5 hover:bg-background">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <Input
                value={talleNuevo}
                onChange={(e) => setTalleNuevo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarTalle(); } }}
                placeholder="Ej.: 9"
                aria-label="Talle nuevo"
                className="h-7 w-24"
              />
              <Button size="sm" variant="outline" onClick={agregarTalle} disabled={!talleNuevo.trim()}>+ Agregar talle</Button>
            </div>
          )}
        </div>
      )}

      {tipo === "herramienta" && (
        <label className="flex items-start justify-between gap-3 rounded-md border p-3">
          <span>
            <span className="block text-[13px] font-medium">Seguridad crítica</span>
            <span className="block text-[12px] text-muted-foreground">
              Tiene inspección de seguridad. Con la inspección vencida, no sale del pañol. La fecha se carga en cada unidad.
            </span>
          </span>
          <Switch checked={critica} onCheckedChange={setCritica} />
        </label>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={crear.isPending}>Cancelar</Button>
        <Button onClick={guardar} disabled={!listo}>
          {crear.isPending && <Loader2 className="size-4 animate-spin" />}
          {tipo === "herramienta" ? "Crear y dar de alta unidades" : "Crear artículo"}
        </Button>
      </DialogFooter>
    </>
  );
}
