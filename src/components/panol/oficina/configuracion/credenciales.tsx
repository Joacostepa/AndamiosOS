"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { nombreCompleto, type PersonaPanol } from "@/hooks/use-panol";
import { useGenerarPin, useReimprimir, type EstadoCredencial } from "@/hooks/use-panol-config";
import type { CodigoMin } from "@/lib/panol/etiquetas";
import { Seccion, fechaHora } from "./ui";

// Credenciales para el "¿Quién sos?" del kiosco: el QR del llavero y el PIN de 4 números.
//
// REIMPRIMIR ANULA LA ANTERIOR (una credencial perdida no puede seguir sirviendo), así que
// pide confirmación. El PIN se muestra UNA vez: en la base queda sólo el hash, y no hay
// forma de volver a leerlo. Por eso el diálogo no se cierra tocando afuera, sólo con
// "Ya lo anoté".

const ETIQUETAS = "/deposito/panol/etiquetas";

type Pendiente =
  | { que: "reimprimir"; p: PersonaPanol; codigo: string }
  | { que: "pin"; p: PersonaPanol };

export function Credenciales({
  personas, codigos, estados, puedeEditar,
}: {
  personas: PersonaPanol[];
  codigos: CodigoMin[];
  estados: EstadoCredencial[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const reimprimir = useReimprimir();
  const generarPin = useGenerarPin();
  const [busqueda, setBusqueda] = useState("");
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [pin, setPin] = useState<{ nombre: string; pin: string } | null>(null);

  const codigoDe = new Map(codigos.filter((c) => c.activo && (c.tipo === "persona" || c.tipo === "externa")).map((c) => [`${c.tipo}:${c.entidad_id}`, c]));
  const pinDe = new Map(estados.map((e) => [`${e.persona_tipo}:${e.persona_id}`, e]));

  const q = busqueda.trim().toLowerCase();
  const activas = personas
    .filter((p) => p.activo)
    .filter((p) => !q || `${p.nombre} ${p.apellido} ${p.detalle ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.apellido.localeCompare(b.apellido, "es") || a.nombre.localeCompare(b.nombre, "es"));
  const imprimir = (p: PersonaPanol) => router.push(`${ETIQUETAS}?tipo=credenciales&sel=${p.tipo}:${p.id}`);

  function hacerPin(p: PersonaPanol) {
    generarPin.mutate(
      { tipo: p.tipo, id: p.id },
      {
        onSuccess: (nuevo) => setPin({ nombre: nombreCompleto(p), pin: nuevo }),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo generar el PIN"),
        onSettled: () => setPendiente(null),
      },
    );
  }

  function confirmar() {
    if (!pendiente) return;
    if (pendiente.que === "pin") return hacerPin(pendiente.p);
    const p = pendiente.p;
    reimprimir.mutate(
      { tipo: p.tipo, id: p.id },
      {
        onSuccess: (nuevo) =>
          toast.success(`Credencial nueva de ${nombreCompleto(p)}: ${nuevo}`, {
            description: `La anterior (${pendiente.codigo}) ya no sirve.`,
            action: { label: "Imprimir", onClick: () => imprimir(p) },
          }),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo reimprimir"),
        onSettled: () => setPendiente(null),
      },
    );
  }

  return (
    <Seccion
      id="h-credenciales"
      titulo="Credenciales"
      ayuda="Para el «¿Quién sos?» del kiosco: el QR en el llavero o un PIN de 4 números. Reimprimir anula la credencial anterior. El PIN es único; tres intentos fallidos bloquean el dispositivo unos minutos."
      accion={<Link href={`${ETIQUETAS}?tipo=credenciales&solo=nuevas`} className="text-[13px] underline-offset-2 hover:underline">Imprimir las nuevas</Link>}
    >
      <div className="border-b px-4 py-2">
        <div className="relative max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" className="pl-8" />
        </div>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-card text-left text-[12px] text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-4 py-2 font-medium">Persona</th>
              <th scope="col" className="px-2 py-2 font-medium">Credencial QR</th>
              <th scope="col" className="px-2 py-2 font-medium">PIN</th>
              <th scope="col" className="px-4 py-2 font-medium"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activas.map((p) => {
              const c = codigoDe.get(`${p.tipo}:${p.id}`);
              const e = pinDe.get(`${p.tipo}:${p.id}`);
              return (
                <tr key={`${p.tipo}:${p.id}`}>
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    {nombreCompleto(p)}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {p.tipo === "externa" ? `· externa${p.detalle ? `, ${p.detalle}` : ""}` : p.detalle ? `· ${p.detalle}` : ""}
                    </span>
                  </th>
                  <td className="px-2 py-2">
                    {c ? (
                      <>
                        <span className="font-mono">{c.codigo}</span>
                        {!c.impreso_at && <span className="ml-1 text-muted-foreground">· sin imprimir</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Sin credencial</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {e?.tiene_pin ? (
                      <span>Asignado{e.pin_at && <span className="text-muted-foreground"> · {fechaHora(e.pin_at).slice(0, 10)}</span>}</span>
                    ) : (
                      <span className="text-muted-foreground">Sin PIN</span>
                    )}
                  </td>
                  <td className="px-4 py-1.5">
                    {puedeEditar && (
                      <span className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => imprimir(p)}>Imprimir credencial</Button>
                        {c && (
                          <Button variant="ghost" size="sm" onClick={() => setPendiente({ que: "reimprimir", p, codigo: c.codigo })}>
                            Reimprimir (anula la anterior)
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={generarPin.isPending}
                          onClick={() => (e?.tiene_pin ? setPendiente({ que: "pin", p }) : hacerPin(p))}
                        >
                          {e?.tiene_pin ? "PIN nuevo" : "Generar PIN"}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {activas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 text-muted-foreground">{q ? "Nadie con ese nombre." : "No hay personas activas en Legajos ni externas."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pendiente}
        onOpenChange={(o) => { if (!o) setPendiente(null); }}
        title={pendiente?.que === "reimprimir" ? `¿Reimprimir la credencial de ${nombreCompleto(pendiente.p)}?` : `¿PIN nuevo para ${pendiente ? nombreCompleto(pendiente.p) : ""}?`}
        description={
          pendiente?.que === "reimprimir"
            ? `El código ${pendiente.codigo} deja de servir: si alguien lo escanea, el kiosco avisa que está anulado. No se puede volver atrás.`
            : "El PIN que tiene ahora deja de servir. El nuevo se muestra una sola vez."
        }
        confirmLabel={pendiente?.que === "reimprimir" ? "Reimprimir y anular la anterior" : "Generar PIN nuevo"}
        variant="destructive"
        loading={reimprimir.isPending || generarPin.isPending}
        onConfirm={confirmar}
      />

      {/* Sin cerrar tocando afuera: el PIN no se vuelve a mostrar. */}
      <Dialog open={!!pin} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>PIN de {pin?.nombre}</DialogTitle>
            <DialogDescription>Dáselo en mano. No se vuelve a mostrar: si se lo olvida, se genera otro.</DialogDescription>
          </DialogHeader>
          <p aria-live="polite" className="py-4 text-center font-mono text-7xl font-semibold tracking-[0.3em] tabular-nums">
            {pin?.pin}
          </p>
          <DialogFooter>
            <Button size="lg" className="h-12 w-full text-base" variant="secondary" onClick={() => setPin(null)}>Ya lo anoté</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Seccion>
  );
}
