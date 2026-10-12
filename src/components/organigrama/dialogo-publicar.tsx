"use client";

// Ver cambios, Publicar y Descartar el borrador. El organigrama es un documento oficial: cada
// versión queda con fecha, autor y una nota corta (obligatoria) que dice qué cambió y por qué.

import { useState } from "react";
import { toast } from "sonner";
import { Chip } from "@/components/permisos-via-publica/ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nodoDe, nombreCompleto } from "@/lib/organigrama/arbol";
import type { Cambio, Nodo } from "@/lib/organigrama/tipos";
import { useOrg } from "./proveedor";

const TITULO_TIPO: Record<Cambio["tipo"], string> = { nuevo: "Nuevo", movido: "Movido", eliminado: "Eliminado", modificado: "Modificado" };

export function ListaCambios({ cambios, nodos }: { cambios: Cambio[]; nodos: Nodo[] }) {
  if (!cambios.length) return <p className="text-[13.5px] text-muted-foreground">Sin cambios de estructura.</p>;
  return (
    <ul className="grid gap-2">
      {cambios.map((c, i) => (
        <li key={`${c.nodo}-${c.tipo}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13.5px]">
          <Chip tono="neutro" sinIcono>
            {TITULO_TIPO[c.tipo]}
          </Chip>
          <span className="min-w-0 flex-1">
            {c.tipo !== "nuevo" && c.tipo !== "eliminado" && <span className="font-medium">{nodoDe(nodos, c.nodo)?.titulo ?? c.nodo}: </span>}
            {c.detalle}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DialogoCambios({ titulo, cambios, nodos, onCerrar }: { titulo: string; cambios: Cambio[]; nodos: Nodo[]; onCerrar: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {cambios.length} {cambios.length === 1 ? "cambio" : "cambios"} de estructura. Las asignaciones de personas no cuentan: son inmediatas.
          </DialogDescription>
        </DialogHeader>
        <ListaCambios cambios={cambios} nodos={nodos} />
        <DialogFooter>
          <Button variant="outline" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MAX_NOTA = 140;

export function DialogoPublicar({ onCerrar }: { onCerrar: () => void }) {
  const { cambios, estado, dispatch, usuario, version } = useOrg();
  const [nota, setNota] = useState("");
  const [intento, setIntento] = useState(false);
  const numero = (version?.numero ?? 0) + 1;
  const vacia = !nota.trim();

  const publicar = () => {
    setIntento(true);
    if (vacia) return;
    dispatch({ tipo: "publicar", nota: nota.trim(), autor: usuario ? nombreCompleto(usuario) : "Editor" });
    toast(`Publicaste la versión ${numero}`);
    onCerrar();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publicar la versión {numero}</DialogTitle>
          <DialogDescription>Desde que la publiques, es la vigente para toda la empresa.</DialogDescription>
        </DialogHeader>
        <ListaCambios cambios={cambios} nodos={estado.borrador ?? estado.vigente} />
        <div className="grid gap-1.5">
          <Label htmlFor="nota-version">Nota de la versión</Label>
          <Textarea
            id="nota-version"
            value={nota}
            maxLength={MAX_NOTA}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: Se suma Coordinador Logístico debajo de Repartos"
            aria-invalid={intento && vacia}
            aria-describedby="nota-ayuda"
            rows={2}
          />
          <p id="nota-ayuda" className={intento && vacia ? "text-[12.5px] text-red-700 dark:text-red-300" : "text-[12.5px] text-muted-foreground"}>
            {intento && vacia ? "Escribí una nota corta: es lo que se lee en Versiones." : `Obligatoria y corta (${nota.length}/${MAX_NOTA}).`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="h-9 max-sm:h-10" onClick={publicar}>
            Publicar versión {numero}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoDescartar({ onCerrar }: { onCerrar: () => void }) {
  const { cambios, dispatch } = useOrg();
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onCerrar()}
      title="Descartar el borrador"
      description={`Se pierden ${cambios.length === 1 ? "el cambio" : `los ${cambios.length} cambios`} sin publicar. La versión vigente no cambia.`}
      variant="destructive"
      confirmLabel="Descartar borrador"
      onConfirm={() => {
        dispatch({ tipo: "descartar" });
        toast("Descartaste el borrador.");
        onCerrar();
      }}
    />
  );
}
