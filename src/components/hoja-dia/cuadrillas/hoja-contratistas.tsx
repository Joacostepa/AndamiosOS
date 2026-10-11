"use client";

// "Contratistas": la hoja lateral para administrarlos (alta, edición, baja, Telegram). Se
// abre desde el grupo "Contratistas" del panel Gente, sólo con Hoja del día en editar (el
// servidor lo exige igual: RLS + la ruta).
//
// Un contratista NO es un empleado: no va a Legajos ni a Odoo. De su gente sólo se carga
// cuántos van, en cada tarjeta. Su referente recibe la hoja cuando está a cargo, por
// Telegram (se vincula una vez, como cualquiera) o a mano por WhatsApp.

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Contratista, DiaHoja } from "@/lib/hoja-dia/tipos";
import { leerPesos, panelContratistas, pesos } from "@/lib/hoja-dia/contratistas";
import { useAccionContratista, useVincularTelegram } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Caja, HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { BotonVincularTelegram } from "@/components/hoja-dia/comunes/vincular-telegram";
import { PRI } from "@/components/hoja-dia/comunes/boton-coral";

type Borrador = { nombre: string; referente: string; celular: string; valor: string; nota: string };
const vacio: Borrador = { nombre: "", referente: "", celular: "", valor: "", nota: "" };
const deContratista = (k: Contratista): Borrador => ({
  nombre: k.nombre, referente: k.referente ?? "", celular: k.celular ?? "", valor: k.valorJornada != null ? String(k.valorJornada).replace(".", ",") : "", nota: k.nota ?? "",
});

function Campo({ id, label, ayuda, error, ...props }: React.ComponentProps<"input"> & { id: string; label: string; ayuda?: string; error?: string | null }) {
  return (
    <label htmlFor={id} className="grid gap-1 text-[13px]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? `${id}-ayuda` : undefined}
        className="h-9 rounded-[7px] border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-hd-rojo max-md:h-11 max-md:text-[15px]"
        {...props}
      />
      {(error || ayuda) && <span id={`${id}-ayuda`} className={cn("text-xs", error ? "text-hd-rojo" : "text-muted-foreground")}>{error ?? ayuda}</span>}
    </label>
  );
}

function Formulario({
  inicial, fecha, contratistaId, onListo,
}: { inicial: Borrador; fecha: string; contratistaId: string | null; onListo: () => void }) {
  const accion = useAccionContratista(fecha);
  const [b, setB] = useState(inicial);
  const [intento, setIntento] = useState(false);
  const valor = leerPesos(b.valor);
  const errNombre = intento && !b.nombre.trim() ? "Falta el nombre." : null;
  const errValor = valor != null && Number.isNaN(valor) ? "Escribí sólo el número, por ejemplo 25.000." : null;
  const id = contratistaId ?? "nuevo";
  const set = (k: keyof Borrador) => (e: React.ChangeEvent<HTMLInputElement>) => setB((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setIntento(true);
        if (!b.nombre.trim() || errValor) return;
        const datos = { nombre: b.nombre.trim(), referente: b.referente.trim() || null, celular: b.celular.trim() || null, valorJornada: valor, nota: b.nota.trim() || null };
        accion.mutate(contratistaId ? { accion: "editar", contratistaId, ...datos } : { accion: "crear", ...datos }, { onSuccess: onListo });
      }}
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Campo id={`k-nombre-${id}`} label="Nombre" ayuda="Como se lo nombra: «+3 de Quintana»." placeholder="Quintana" value={b.nombre} onChange={set("nombre")} error={errNombre} autoFocus maxLength={60} />
        <Campo id={`k-ref-${id}`} label="Referente" ayuda="Quien recibe la hoja cuando está a cargo." placeholder="Tomás Quintana" value={b.referente} onChange={set("referente")} maxLength={80} />
        <Campo id={`k-cel-${id}`} label="Celular del referente" inputMode="tel" placeholder="11 5555-5555" value={b.celular} onChange={set("celular")} maxLength={40} />
        <Campo id={`k-valor-${id}`} label="Valor por persona y jornada (opcional)" inputMode="decimal" placeholder="25.000" value={b.valor} onChange={set("valor")} error={errValor} ayuda="Para el total estimado del resumen del mes." />
      </div>
      <Campo id={`k-nota-${id}`} label="Nota (opcional)" placeholder="Trae su propio camión" value={b.nota} onChange={set("nota")} maxLength={300} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onListo}>Cancelar</Button>
        <Button type="submit" className={PRI} disabled={accion.isPending}>{contratistaId ? "Guardar" : "Dar de alta"}</Button>
      </div>
    </form>
  );
}

function Fila({ dia, k, abierto, onAbrir, onCerrar }: { dia: DiaHoja; k: Contratista; abierto: boolean; onAbrir: () => void; onCerrar: () => void }) {
  const accion = useAccionContratista(dia.fecha);
  const vincular = useVincularTelegram();
  const uso = panelContratistas(dia).find((x) => x.id === k.id);
  const datos = [k.referente ? `referente ${k.referente}` : "sin referente", k.celular ?? "sin celular", k.valorJornada != null ? `${pesos(k.valorJornada)} por jornada` : null].filter(Boolean).join(" · ");
  return (
    <Caja
      className={cn(!k.activo && "opacity-75")}
      titulo={
        <>
          <span>{k.nombre}</span>
          {!k.activo && <span className="rounded-full border px-2 text-[11.5px] font-medium text-muted-foreground">de baja</span>}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{uso?.enUso ? `hoy: ${uso.t}` : ""}</span>
        </>
      }
    >
      {abierto ? (
        <Formulario inicial={deContratista(k)} fecha={dia.fecha} contratistaId={k.id} onListo={onCerrar} />
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">{datos}</p>
          {k.nota && <p className="text-[13px]">{k.nota}</p>}
          <p className="text-[13px]">
            {k.telegram ? <span className="font-medium text-hd-verde">Telegram vinculado: la hoja le llega sola</span>
              : dia.telegram.configurado ? <span className="text-muted-foreground">Sin Telegram: la hoja se le manda a mano (WhatsApp)</span>
              : <span className="text-muted-foreground">La hoja se le manda a mano (WhatsApp)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={onAbrir}>Editar</Button>
            {k.activo && !k.telegram && dia.telegram.configurado && <BotonVincularTelegram personaId={k.id} nombre={k.nombre} variant="outline" />}
            {k.telegram && (
              <Button size="sm" variant="ghost" disabled={vincular.isPending} onClick={() => vincular.mutate({ accion: "desvincular", personaId: k.id }, { onSuccess: (r) => toast(r.texto) })}>
                Desvincular Telegram
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={cn("ml-auto", k.activo && "text-hd-rojo")}
              disabled={accion.isPending}
              onClick={() => accion.mutate({ accion: "editar", contratistaId: k.id, activo: !k.activo })}
            >
              {k.activo ? "Dar de baja" : "Reactivar"}
            </Button>
          </div>
        </>
      )}
    </Caja>
  );
}

export function HojaContratistas({ abierta, onCerrar, dia, foco }: { abierta: boolean; onCerrar: () => void; dia: DiaHoja; foco?: string | null }) {
  const [editando, setEditando] = useState<string | null>(foco ?? null);
  const [verBajas, setVerBajas] = useState(false);
  const activos = dia.contratistas.filter((k) => k.activo);
  const bajas = dia.contratistas.filter((k) => !k.activo);
  return (
    <HojaLateral
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Contratistas"
      sub="Mano de obra tercerizada: no van a Legajos ni a Odoo. De su gente sólo se carga cuántos van, en cada cuadrilla; en el parte cuentan como la nuestra."
    >
      {editando === "nuevo" ? (
        <Caja titulo="Contratista nuevo">
          <Formulario inicial={vacio} fecha={dia.fecha} contratistaId={null} onListo={() => setEditando(null)} />
        </Caja>
      ) : (
        <div>
          <Button variant="outline" onClick={() => setEditando("nuevo")}>
            <Plus data-icon="inline-start" />
            Nuevo contratista
          </Button>
        </div>
      )}
      {!activos.length && editando !== "nuevo" && <p className="text-[13px] text-muted-foreground">Todavía no hay contratistas activos.</p>}
      {activos.map((k) => (
        <Fila key={k.id} dia={dia} k={k} abierto={editando === k.id} onAbrir={() => setEditando(k.id)} onCerrar={() => setEditando(null)} />
      ))}
      {bajas.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={verBajas}
            onClick={() => setVerBajas((v) => !v)}
            className="justify-self-start text-[13px] text-muted-foreground underline underline-offset-[3px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {verBajas ? "Ocultar" : "Ver"} los dados de baja ({bajas.length})
          </button>
          {verBajas && bajas.map((k) => (
            <Fila key={k.id} dia={dia} k={k} abierto={editando === k.id} onAbrir={() => setEditando(k.id)} onCerrar={() => setEditando(null)} />
          ))}
        </>
      )}
    </HojaLateral>
  );
}
