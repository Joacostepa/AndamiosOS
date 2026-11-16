"use client";

import { useState } from "react";
import { Loader2, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCambiarEstado, useCambiarPareja, useEquipoBandeja, type Pareja } from "@/hooks/use-clientes-whatsapp";
import type { CharlaListada } from "@/lib/clientes/vista";

// «Asignar» en el encabezado de la charla (JS, 16/11: «Soltar» la dejaba sin tomar y, una vez
// confirmada la pareja, no se podía cambiar). Dos renglones:
//   · Pasar la charla a alguien con la bandeja en «editar» (le llega a la campanita).
//   · Asignar o cambiar la pareja (técnico y vendedora), con o sin avisarle al cliente.

const clave = (p: Pareja) => `${p.asistente ?? ""}|${p.tecnico ?? ""}`;
export const textoPareja = (p: Pareja) => (p.asistente && p.tecnico ? `${p.asistente} con ${p.tecnico}` : p.asistente ? `${p.asistente} (sin técnico)` : p.tecnico ?? "");

const SELECT = "h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[14px] sm:max-w-64";

export function AsignarCharla({ charla, yo, onListo }: { charla: CharlaListada; yo: string; onListo: () => void }) {
  const equipo = useEquipoBandeja(true);
  const cambiar = useCambiarEstado(charla.id);
  const pareja = useCambiarPareja(charla.id);
  const [para, setPara] = useState("");
  const [elegida, setElegida] = useState(charla.pareja ? clave(charla.pareja) : "");
  const [avisar, setAvisar] = useState(false);

  if (equipo.isLoading) return <div className="flex items-center gap-2 py-2 text-[13.5px] text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando…</div>;
  if (equipo.error || !equipo.data) return <p className="py-2 text-[13.5px] text-destructive">{equipo.error?.message ?? "No se pudo cargar el equipo."}</p>;

  const tiene = charla.estado === "humano" ? charla.asistente?.id ?? null : null;
  const personas = equipo.data.personas.filter((p) => p.id !== tiene);

  const pasar = (forzar = false) => {
    const destino = personas.find((p) => p.id === para);
    if (!destino) {
      toast.error("Esa persona ya tiene la charla, o no está en la lista: elegí de nuevo.");
      setPara("");
      return;
    }
    cambiar.mutate(
      { accion: "pasar", para: destino.id, forzar },
      {
        onSuccess: () => {
          toast.success(destino.id === yo ? "La charla es tuya" : `Se la pasaste a ${destino.nombre}`, { description: destino.id === yo ? undefined : "Le llega a la campanita." });
          onListo();
        },
        onError: (e) => {
          if (!forzar && e.status === 409 && e.message.startsWith("La tiene")) toast(e.message, { action: { label: "Pasarla igual", onClick: () => pasar(true) } });
          else toast.error(e.message);
        },
      },
    );
  };

  const guardarPareja = () => {
    const p = equipo.data.parejas.find((x) => clave(x) === elegida);
    if (!p) {
      toast.error("Elegí una pareja de la lista.");
      return;
    }
    pareja.mutate(
      { ...p, avisar },
      {
        onSuccess: (r) => {
          toast.success(`Pareja: ${textoPareja(p)}`, { description: r.avisos.join(" · ") || undefined });
          onListo();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-2 pt-1.5 pb-1 text-[13.5px]">
      {charla.estado !== "cerrada" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            pasar();
          }}
        >
          <span className="w-28 shrink-0 text-muted-foreground">Pasar la charla a</span>
          <select value={para} onChange={(e) => setPara(e.target.value)} aria-label="A quién pasarle la charla" className={SELECT}>
            <option value="">Elegí a alguien…</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.id === yo ? `${p.nombre} (vos)` : p.nombre}</option>
            ))}
          </select>
          <Button type="submit" className="h-10" disabled={!para || cambiar.isPending}>
            {cambiar.isPending ? <Loader2 className="animate-spin" /> : <Send />} Pasar
          </Button>
        </form>
      )}
      {charla.estado !== "cerrada" && personas.length <= 1 && (
        <p className="text-[12.5px] text-muted-foreground">Sólo aparece quien tiene «WhatsApp de clientes» en «editar» (se da en Usuarios).</p>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          guardarPareja();
        }}
      >
        <span className="w-28 shrink-0 text-muted-foreground">Pareja</span>
        <select value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label="Técnico y vendedora" className={SELECT}>
          {!equipo.data.parejas.some((p) => clave(p) === elegida) && (
            <option value={elegida}>{charla.pareja && elegida ? `${textoPareja(charla.pareja)} (fuera de la lista)` : "Elegí la pareja…"}</option>
          )}
          {equipo.data.parejas.map((p) => (
            <option key={clave(p)} value={clave(p)}>{textoPareja(p)}</option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2">
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="size-4" />
          Avisarle al cliente
        </label>
        <Button type="submit" variant="outline" className="h-10" disabled={!elegida || pareja.isPending}>
          {pareja.isPending ? <Loader2 className="animate-spin" /> : <Users />} Guardar
        </Button>
      </form>
      <Button type="button" variant="ghost" className="h-10" onClick={onListo}>Cancelar</Button>
    </div>
  );
}
