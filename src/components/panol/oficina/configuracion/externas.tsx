"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nombreCompleto, type CuadrillaPanol, type PersonaPanol } from "@/hooks/use-panol";
import { useGuardarExterna } from "@/hooks/use-panol-config";
import { Cuenta, SELECT, Seccion } from "./ui";

// Personas externas: la gente de cuadrillas tercerizadas, que no está en Legajos y retira
// igual (docs §5). Alta rápida —lo justo para identificarla y avisarle— y se desactiva, no
// se borra: tiene movimientos a su nombre.

const VACIO = { nombre: "", apellido: "", dni: "", empresa: "", cuadrillaId: "", telefono: "" };

export function Externas({
  personas, cuadrillas, puedeEditar,
}: {
  personas: PersonaPanol[];
  cuadrillas: CuadrillaPanol[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const guardar = useGuardarExterna();
  const [form, setForm] = useState(VACIO);
  const [verInactivas, setVerInactivas] = useState(false);

  const externas = personas.filter((p) => p.tipo === "externa");
  const activas = externas.filter((p) => p.activo);
  const inactivas = externas.filter((p) => !p.activo);
  const legajo = new Map(personas.filter((p) => p.tipo === "persona").map((p) => [p.id, p]));
  const nombreCuadrilla = (id: string | null) => {
    const c = cuadrillas.find((x) => x.id === id);
    if (!c) return null;
    const capataz = c.responsableId ? legajo.get(c.responsableId) : undefined;
    return capataz ? `${c.nombre} · ${nombreCompleto(capataz)}` : c.nombre;
  };
  const set = (k: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const listo = form.nombre.trim() && form.apellido.trim() && form.empresa.trim();

  function alta(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    const dni = form.dni.replace(/\D/g, "");
    guardar.mutate(
      {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni: dni || null,
        empresa: form.empresa.trim(),
        cuadrilla_id: form.cuadrillaId || null,
        telefono: form.telefono.trim() || null,
      },
      {
        onSuccess: (id) => {
          const nombre = `${form.nombre.trim()} ${form.apellido.trim()}`;
          toast.success(`${nombre} quedó como persona externa`, {
            description: "Hacele la credencial para que pueda retirar.",
            action: { label: "Hacer credencial", onClick: () => router.push(`/deposito/panol/etiquetas?tipo=credenciales&sel=externa:${id}`) },
          });
          // La empresa y la cuadrilla se repiten: suelen cargarse varios de la misma.
          setForm((f) => ({ ...VACIO, empresa: f.empresa, cuadrillaId: f.cuadrillaId }));
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo dar de alta"),
      },
    );
  }

  function cambiarActivo(p: PersonaPanol, activo: boolean) {
    guardar.mutate(
      { id: p.id, activo },
      {
        onSuccess: () =>
          toast.success(activo ? `${nombreCompleto(p)} está activa de nuevo` : `${nombreCompleto(p)} quedó desactivada: ya no puede identificarse en el kiosco`, {
            action: { label: "Deshacer", onClick: () => guardar.mutate({ id: p.id, activo: !activo }) },
          }),
        onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar"),
      },
    );
  }

  const fila = (p: PersonaPanol) => (
    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
      <span className={p.activo ? "min-w-0 flex-1 font-medium" : "min-w-0 flex-1 text-muted-foreground line-through"}>{nombreCompleto(p)}</span>
      <span className="text-muted-foreground">
        {[p.detalle, nombreCuadrilla(p.cuadrillaId), p.telefono].filter(Boolean).join(" · ")}
      </span>
      {puedeEditar && (
        <Button variant="ghost" size="sm" disabled={guardar.isPending} onClick={() => cambiarActivo(p, !p.activo)}>
          {p.activo ? "Desactivar" : "Reactivar"}
        </Button>
      )}
    </li>
  );

  return (
    <Seccion
      id="h-externas"
      titulo={<>Personas externas <Cuenta n={activas.length} /></>}
      ayuda="Gente de cuadrillas tercerizadas que no está en Legajos. Retiran igual, con su credencial o su PIN, y quedan marcadas como externas."
      accion={
        inactivas.length > 0 ? (
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input type="checkbox" className="size-4" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
            Ver desactivadas ({inactivas.length})
          </label>
        ) : undefined
      }
    >
      {activas.length + (verInactivas ? inactivas.length : 0) > 0 ? (
        <ul className="divide-y border-b">
          {activas.map(fila)}
          {verInactivas && inactivas.map(fila)}
        </ul>
      ) : (
        <p className="border-b px-4 py-3 text-[13px] text-muted-foreground">Todavía no hay personas externas.</p>
      )}

      {puedeEditar && (
        <form onSubmit={alta} className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta="Nombre"><Input value={form.nombre} onChange={set("nombre")} placeholder="Ej. Brian" maxLength={60} required /></Campo>
          <Campo etiqueta="Apellido"><Input value={form.apellido} onChange={set("apellido")} placeholder="Ej. Sosa" maxLength={60} required /></Campo>
          <Campo etiqueta="DNI"><Input value={form.dni} onChange={set("dni")} inputMode="numeric" placeholder="Ej. 40.221.903" maxLength={12} /></Campo>
          <Campo etiqueta="Empresa"><Input value={form.empresa} onChange={set("empresa")} placeholder="Ej. Montajes del Sur SRL" maxLength={80} required /></Campo>
          <Campo etiqueta="Cuadrilla">
            <select className={SELECT} value={form.cuadrillaId} onChange={set("cuadrillaId")}>
              <option value="">Sin cuadrilla</option>
              {cuadrillas.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{nombreCuadrilla(c.id)}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Teléfono"><Input value={form.telefono} onChange={set("telefono")} inputMode="tel" placeholder="Para avisarle por WhatsApp" maxLength={40} /></Campo>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="secondary" disabled={!listo || guardar.isPending}>
              {guardar.isPending && <Loader2 className="animate-spin" />} Dar de alta
            </Button>
          </div>
        </form>
      )}
    </Seccion>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-[13px]">
      {etiqueta}
      {children}
    </label>
  );
}
