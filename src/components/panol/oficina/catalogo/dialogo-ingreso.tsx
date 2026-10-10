"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deshacerVale, useCatalogoPanol, useInvalidarPanol, useRegistrarVale } from "@/hooks/use-panol";
import { formatoCantidad, formatoPesos } from "@/hooks/use-panol-catalogo";
import { aUnidadDeRetiro, hoyBA, leerRechazo } from "@/lib/panol/estado";
import type { Articulo } from "@/lib/panol/tipos";
import { SelectorUbicacion } from "./selector-ubicacion";
import { fecha, numero } from "./formato";

// Ingreso de compra (docs/modulo-panol.md §6.10). Se carga como llega: en la unidad de
// COMPRA ("5 bolsas de 100", "$ 3.200 por bolsa") y acá se convierte a la de retiro, que es
// en la que vive el stock. El costo viaja por unidad de retiro: es el que valoriza el
// consumo (el trigger lo deja como ultimo_costo del artículo).
//
// Las herramientas con número no entran por acá: cada una necesita su número y su QR, y eso
// es el alta de unidades.

export function DialogoIngreso({
  open,
  onOpenChange,
  articuloId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Fijo desde la ficha; sin esto se elige. */
  articuloId?: string;
}) {
  const cat = useCatalogoPanol();
  const articulos = (cat.data?.articulos ?? []).filter((a) => a.activo && a.tipo !== "herramienta");
  const [elegido, setElegido] = useState(articuloId ?? "");
  const art = articulos.find((a) => a.id === (articuloId ?? elegido)) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Ingreso de compra</DialogTitle>
          <DialogDescription className="text-[14px] text-foreground/80">
            Suma al stock y deja el costo para valorizar el consumo.
          </DialogDescription>
        </DialogHeader>
        {!articuloId && (
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">Artículo</span>
            <select value={elegido} onChange={(e) => setElegido(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px]">
              <option value="">Elegí el artículo</option>
              {articulos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
        )}
        {/* El formulario se rearma al cambiar de artículo: arranca con SUS valores. */}
        {art ? <FormIngreso key={art.id} art={art} onListo={() => onOpenChange(false)} onCancelar={() => onOpenChange(false)} />
          : (
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </DialogFooter>
          )}
      </DialogContent>
    </Dialog>
  );
}

function FormIngreso({ art, onListo, onCancelar }: { art: Articulo; onListo: () => void; onCancelar: () => void }) {
  const cat = useCatalogoPanol();
  const registrar = useRegistrarVale();
  const invalidar = useInvalidarPanol();
  const talles = (cat.data?.variantes ?? []).filter((v) => v.articulo_id === art.id);
  const factor = art.unidad_compra ? Number(art.factor_compra) || 1 : 1;
  const unidadCompra = art.unidad_compra ? `${art.unidad_compra} de ${formatoCantidad(factor)}` : art.unidad;

  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState(art.ultimo_costo !== null ? String(Math.round(Number(art.ultimo_costo) * factor * 100) / 100) : "");
  const [proveedor, setProveedor] = useState(art.proveedor ?? "");
  const [comprobante, setComprobante] = useState("");
  const [llego, setLlego] = useState(hoyBA());
  const [ubicacion, setUbicacion] = useState<string | null>(art.ubicacion_id);
  const [talle, setTalle] = useState("");

  const nCompra = numero(cantidad);
  const nRetiro = nCompra && nCompra > 0 ? aUnidadDeRetiro(nCompra, factor) : 0;
  const nCosto = numero(costo);
  const costoRetiro = nCosto !== null && nCosto >= 0 ? Math.round((nCosto / factor) * 10000) / 10000 : null;
  const faltaTalle = art.tiene_talles && !talle;
  const listo = nRetiro > 0 && !faltaTalle && !registrar.isPending;

  function guardar() {
    const notas = [llego !== hoyBA() ? `Llegó el ${fecha(llego)}` : null].filter(Boolean).join(" · ");
    registrar.mutate(
      {
        clientUuid: crypto.randomUUID(),
        tipo: "ingreso",
        proveedor: proveedor.trim() || undefined,
        comprobante: comprobante.trim() || undefined,
        nota: notas || undefined,
        items: [{
          articuloId: art.id,
          varianteId: art.tiene_talles ? talle : null,
          cantidad: nRetiro,
          costoUnitario: costoRetiro ?? undefined,
          ubicacionId: ubicacion ?? undefined,
        }],
      },
      {
        onSuccess: (r) => {
          onListo();
          toast.success(`Ingresaron ${formatoCantidad(nRetiro)} ${art.unidad} de ${art.nombre} al stock.`, {
            action: {
              label: "Deshacer",
              onClick: () => {
                deshacerVale(r.valeId).then(
                  () => { invalidar(); toast("Ingreso deshecho."); },
                  (e: unknown) => toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto),
                );
              },
            },
          });
        },
        onError: (e) => toast.error(leerRechazo(e.message).texto),
      },
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {art.tiene_talles && (
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[13px] font-medium">Talle</span>
            <select value={talle} onChange={(e) => setTalle(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px]">
              <option value="">Elegí el talle</option>
              {talles.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Cantidad, en {unidadCompra}</span>
          <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
          {factor !== 1 && <span className="block text-[12px] text-muted-foreground">= {formatoCantidad(nRetiro)} {art.unidad} al stock</span>}
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Costo unitario, por {art.unidad_compra ?? art.unidad}</span>
          <Input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$" />
          {factor !== 1 && costoRetiro !== null && (
            <span className="block text-[12px] text-muted-foreground">= {formatoPesos(costoRetiro)} por {art.unidad} · valoriza el consumo</span>
          )}
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Proveedor</span>
          <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Remito o factura N°</span>
          <Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Llegó el</span>
          <Input type="date" value={llego} max={hoyBA()} onChange={(e) => setLlego(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Va a</span>
          <SelectorUbicacion ubicaciones={cat.data?.ubicaciones ?? []} value={ubicacion} onChange={setUbicacion} vacio="Donde vive el artículo" />
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={registrar.isPending}>Cancelar</Button>
        <Button onClick={guardar} disabled={!listo}>
          {registrar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar ingreso
        </Button>
      </DialogFooter>
    </>
  );
}
