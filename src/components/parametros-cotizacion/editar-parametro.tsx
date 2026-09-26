"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActualizarParametro } from "@/hooks/use-parametros-cotizacion";
import { mostrarValor, type Parametro } from "@/lib/parametros-cotizacion/tipos";

// Cambiar un parámetro. EL MOTIVO ES OBLIGATORIO: de un número de precio siempre hay que
// poder contestar por qué cambió ("índice CAC de agosto", "Joaquín subió la bandeja a 3 m").
// Queda en el historial junto con el valor de antes.

/** "140.000" o "140000" o "7,5" → número; "" → null. */
function leerNumero(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  const normal = /,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

const aTexto = (n: number | null) => (n === null ? "" : n.toLocaleString("es-AR", { maximumFractionDigits: 4 }));

export function EditarParametro({ parametro: p, onCerrar }: { parametro: Parametro; onCerrar: () => void }) {
  // El estado arranca de las props al montar: quien lo usa le pone key={clave}, así abrir
  // otro parámetro es otro componente y no hace falta sincronizar nada en un efecto.
  const actualizar = useActualizarParametro();
  const [valor, setValor] = useState(() => aTexto(p.valor));
  const [min, setMin] = useState(() => aTexto(p.valor_min));
  const [max, setMax] = useState(() => aTexto(p.valor_max));
  const [texto, setTexto] = useState(p.texto ?? "");
  const [desde, setDesde] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }));
  const [motivo, setMotivo] = useState("");

  function guardar() {
    const cambio: Parameters<typeof actualizar.mutate>[0] = { clave: p.clave, vigente_desde: desde || null, motivo };
    if (p.tipo === "texto") {
      cambio.texto = texto.trim();
    } else if (p.tipo === "rango") {
      const a = leerNumero(min);
      const b = leerNumero(max);
      if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) return void toast.error("Completá el mínimo y el máximo con números");
      if (a > b) return void toast.error("El mínimo no puede ser mayor que el máximo");
      cambio.valor_min = a;
      cambio.valor_max = b;
    } else {
      const v = leerNumero(valor);
      if (v === null || Number.isNaN(v)) return void toast.error("El valor tiene que ser un número");
      cambio.valor = v;
    }
    if (motivo.trim().length < 3) return void toast.error("Contá por qué cambia: queda en el historial");
    actualizar.mutate(cambio, {
      onSuccess: ({ parametro: nuevo }) => {
        toast.success(`${p.etiqueta}: ${mostrarValor(p)} → ${mostrarValor(nuevo)}`);
        onCerrar();
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{p.etiqueta}</DialogTitle>
          <DialogDescription>
            Hoy: <span className="font-medium text-foreground">{mostrarValor(p)}</span>
            {p.vigente_desde ? ` · desde el ${p.vigente_desde.split("-").reverse().join("/")}` : ""}
          </DialogDescription>
        </DialogHeader>

        {p.descripcion && <p className="text-[13px] text-muted-foreground">{p.descripcion}</p>}

        <div className="space-y-3">
          {p.tipo === "texto" ? (
            <div className="space-y-1.5">
              <Label htmlFor="texto">Valor</Label>
              <Input id="texto" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
            </div>
          ) : p.tipo === "rango" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min">Mínimo {p.unidad ? `(${p.unidad})` : ""}</Label>
                <Input id="min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max">Máximo {p.unidad ? `(${p.unidad})` : ""}</Label>
                <Input id="max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor {p.unidad ? `(${p.unidad})` : ""}</Label>
              <Input id="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="desde">Vigente desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-44" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo">Por qué cambia</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: aumento por índice CAC de agosto"
              className="min-h-16 text-[13px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={actualizar.isPending}>
            {actualizar.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
