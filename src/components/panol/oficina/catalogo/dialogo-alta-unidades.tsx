"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCatalogoPanol } from "@/hooks/use-panol";
import { useAltaUnidades, type ResultadoAlta } from "@/hooks/use-panol-catalogo";
import { hoyBA, leerRechazo } from "@/lib/panol/estado";
import type { Articulo } from "@/lib/panol/tipos";
import { SelectorUbicacion } from "./selector-ubicacion";
import { numero } from "./formato";

// Alta de unidades de una herramienta con número (docs/panol/modulo.md §6.11). La base
// numera (H-054, H-055…, sin pisarse aunque dos den de alta a la vez), genera un QR por
// unidad y las deja en su estante. Los códigos nuevos esperan en "Etiquetas › Solo las
// nuevas": por eso el cierre de este diálogo es ese link, no un "Listo".

export const ETIQUETAS_NUEVAS = "/deposito/panol/etiquetas?solo=nuevas";

export function DialogoAltaUnidades({
  open,
  onOpenChange,
  articuloId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  articuloId?: string;
}) {
  const cat = useCatalogoPanol();
  const herramientas = (cat.data?.articulos ?? []).filter((a) => a.activo && a.tipo === "herramienta");
  const [elegido, setElegido] = useState(articuloId ?? "");
  const [resultado, setResultado] = useState<ResultadoAlta | null>(null);
  const art = herramientas.find((a) => a.id === (articuloId ?? elegido)) ?? null;

  function cerrar(o: boolean) {
    if (!o) setResultado(null);
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-lg">
        {resultado ? (
          <>
            <DialogHeader>
              <CheckCircle2 aria-hidden className="size-6 text-emerald-700 dark:text-emerald-400" />
              <DialogTitle className="text-[17px]">
                Se generaron {resultado.unidades.length} {resultado.unidades.length === 1 ? "código" : "códigos"}
              </DialogTitle>
              <DialogDescription className="text-[14px] text-foreground/80">
                {resultado.unidades.length === 1
                  ? `#${resultado.unidades[0].numero}`
                  : `De #${resultado.unidades[0]?.numero} a #${resultado.unidades.at(-1)?.numero}`}
                . Quedan en Etiquetas › Solo las nuevas para imprimir.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => cerrar(false)}>Después</Button>
              <Link href={ETIQUETAS_NUEVAS} className={buttonVariants()}>Imprimir etiquetas</Link>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-[17px]">Alta de unidades</DialogTitle>
              <DialogDescription className="text-[14px] text-foreground/80">
                Cada unidad sale con su número y su QR, en el pañol y disponible.
              </DialogDescription>
            </DialogHeader>
            {!articuloId && (
              <label className="block space-y-1">
                <span className="text-[13px] font-medium">Artículo</span>
                <select value={elegido} onChange={(e) => setElegido(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px]">
                  <option value="">Elegí la herramienta</option>
                  {herramientas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>
            )}
            {art ? <FormAlta key={art.id} art={art} onListo={setResultado} onCancelar={() => cerrar(false)} />
              : !articuloId && herramientas.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No hay herramientas con número cargadas: primero creá el artículo.</p>
              ) : null}
            {!art && (
              <DialogFooter>
                <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormAlta({ art, onListo, onCancelar }: { art: Articulo; onListo: (r: ResultadoAlta) => void; onCancelar: () => void }) {
  const cat = useCatalogoPanol();
  const alta = useAltaUnidades();
  const [cantidad, setCantidad] = useState("1");
  const [prefijo, setPrefijo] = useState("H");
  const [series, setSeries] = useState("");
  const [marca, setMarca] = useState("");
  const [compra, setCompra] = useState(hoyBA());
  const [costo, setCosto] = useState("");
  const [ubicacion, setUbicacion] = useState<string | null>(art.ubicacion_id);
  const [inspeccion, setInspeccion] = useState("");

  const n = Math.floor(numero(cantidad) ?? 0);
  const listaSeries = series.split("\n").map((s) => s.trim());
  const prefijoOk = /^[A-Za-z]{1,3}$/.test(prefijo.trim());
  const listo = n >= 1 && n <= 200 && prefijoOk && !alta.isPending && (!art.seguridad_critica || !!inspeccion);

  function guardar() {
    alta.mutate(
      {
        articuloId: art.id,
        cantidad: n,
        prefijo: prefijo.trim().toUpperCase(),
        // La base toma la serie i-ésima para la unidad i-ésima: los renglones vacíos cuentan.
        series: Array.from({ length: n }, (_, i) => listaSeries[i] || null),
        marcaModelo: marca.trim() || undefined,
        fechaCompra: compra || undefined,
        costo: numero(costo),
        ubicacionId: ubicacion,
        proximaInspeccion: inspeccion || undefined,
      },
      {
        onSuccess: onListo,
        onError: (e) => toast.error(leerRechazo(e.message).texto),
      },
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Cantidad de unidades</span>
          <Input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Prefijo del número</span>
          <Input value={prefijo} maxLength={3} onChange={(e) => setPrefijo(e.target.value)} aria-invalid={!prefijoOk} />
          <span className="block text-[12px] text-muted-foreground">1 a 3 letras: {prefijo.trim().toUpperCase() || "H"}-001, -002…</span>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-[13px] font-medium">Números de serie <span className="font-normal text-muted-foreground">(uno por renglón, si los tienen)</span></span>
          <Textarea value={series} onChange={(e) => setSeries(e.target.value)} rows={3} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-[13px] font-medium">Marca y modelo</span>
          <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej.: Makita DHP482" />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Fecha de compra</span>
          <Input type="date" value={compra} max={hoyBA()} onChange={(e) => setCompra(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Costo por unidad</span>
          <Input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$" />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Ubicación habitual</span>
          <SelectorUbicacion ubicaciones={cat.data?.ubicaciones ?? []} value={ubicacion} onChange={setUbicacion} vacio="Donde vive el artículo" />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Próxima inspección{art.seguridad_critica ? "" : " (opcional)"}</span>
          <Input type="date" value={inspeccion} min={hoyBA()} onChange={(e) => setInspeccion(e.target.value)} />
          {art.seguridad_critica && <span className="block text-[12px] text-muted-foreground">Es de seguridad crítica: sin fecha de inspección no conviene darla de alta.</span>}
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={alta.isPending}>Cancelar</Button>
        <Button onClick={guardar} disabled={!listo}>
          {alta.isPending && <Loader2 className="size-4 animate-spin" />}
          Dar de alta {n > 0 ? n : ""} {n === 1 ? "unidad" : "unidades"}
        </Button>
      </DialogFooter>
    </>
  );
}
