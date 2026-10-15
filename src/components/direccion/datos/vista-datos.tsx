"use client";

// Datos y definiciones (§5.6, maqueta renderDatos). Dos pestañas:
//  · Diccionario: buscable; cada indicador se despliega con su definición completa, la
//    confianza de HOY (según los avisos abiertos), la meta (editable con "editar") y dónde se usa.
//  · Calidad de los datos: los avisos automáticos (calidad.ts) y los cargados a mano, con
//    qué hay que hacer, a quién le toca y a qué indicadores afecta.
// La pestaña y lo abierto viven en la URL (?tab=cal&aviso=… · ?def=…) para poder linkearlos.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DefinicionIndicador, EstadoVacio, TextoFrase, useDiccionario, useDireccion } from "@/components/direccion";
import { DEF, type DefIndicador } from "@/lib/direccion/diccionario";
import { flarga, marca, nf } from "@/lib/direccion/formato";
import type { DetalleDatos } from "@/lib/direccion/calculo/datos";
import type { Aviso, MarcaConfianza as TMarca, NivelAviso, ResultadoPantalla } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { DialogoAviso } from "./aviso-manual";

type Props = {
  /** null = Odoo no respondió y no hay snapshot: el diccionario se muestra igual. */
  resultado: ResultadoPantalla<DetalleDatos> | null;
  motivo?: string;
  metas: Record<string, number>;
  /** false = falta la migración: no se pueden guardar metas ni avisos. */
  guardable: boolean;
};

const SIMBOLO: Record<NivelAviso, { icono: string; etiqueta: string; clase: string }> = {
  ver: { icono: "⚠", etiqueta: "A verificar", clase: "text-(--dir-aten)" },
  inc: { icono: "◐", etiqueta: "Incompleto", clase: "text-muted-foreground" },
  inf: { icono: "●", etiqueta: "Informativo", clase: "text-muted-foreground" },
};

/** Lee y escribe ?tab, ?def y ?aviso sin pedir nada al servidor (como la moneda). */
function useEstadoUrl() {
  const q = useSearchParams();
  const [tab, setTab] = useState<"dicc" | "cal">(q.get("tab") === "cal" || q.get("aviso") ? "cal" : "dicc");
  const [abierto, setAbierto] = useState<string | null>(q.get("def") ?? q.get("aviso"));
  const escribir = useCallback((t: "dicc" | "cal", id: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("def");
    url.searchParams.delete("aviso");
    if (t === "cal") url.searchParams.set("tab", "cal");
    else url.searchParams.delete("tab");
    if (id) url.searchParams.set(t === "cal" ? "aviso" : "def", id);
    window.history.replaceState(null, "", url.toString());
  }, []);
  const ir = useCallback((t: "dicc" | "cal", id: string | null = null) => { setTab(t); setAbierto(id); escribir(t, id); }, [escribir]);
  return { tab, abierto, ir };
}

function useScrollA(id: string | null, prefijo: string) {
  useEffect(() => {
    if (!id) return;
    const t = requestAnimationFrame(() => document.getElementById(`${prefijo}-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    return () => cancelAnimationFrame(t);
    // Sólo al montar o al cambiar lo abierto desde otro lado.
  }, [id, prefijo]);
}

export function VistaDatos({ resultado, motivo, metas: metasIniciales, guardable }: Props) {
  const { tab, abierto, ir } = useEstadoUrl();
  const avisos = resultado?.avisos ?? [];
  // Lo reservado ya viene filtrado y, para socios, completo (diccionario-socios.ts vía el layout).
  const dicc = useDiccionario().lista;
  const confianza = useMemo(
    () => ({ ...(resultado?.detalle.confianza ?? {}), ...(resultado?.detalle.reservado?.confianza ?? {}) }),
    [resultado],
  );

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Datos y definiciones" className="inline-flex rounded-md border p-0.5 text-[13px]">
        {([["dicc", `Diccionario (${dicc.length})`], ["cal", `Calidad de los datos (${resultado ? avisos.length : "Sin dato"})`]] as const).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => ir(id)}
            className={cn("min-h-8 rounded px-3 font-semibold max-md:min-h-11", tab === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {texto}
          </button>
        ))}
      </div>
      {tab === "dicc" ? (
        <Diccionario lista={dicc} abierto={abierto} onAbrir={(id) => ir("dicc", id)} confianza={confianza} metasIniciales={metasIniciales} guardable={guardable} />
      ) : (
        <Calidad resultado={resultado} motivo={motivo} abierto={abierto} onAbrir={(id) => ir("cal", id)} onDef={(id) => ir("dicc", id)} guardable={guardable} />
      )}
    </div>
  );
}

// ─── Diccionario ───────────────────────────────────────────────────────────────────────

function Diccionario({
  lista, abierto, onAbrir, confianza, metasIniciales, guardable,
}: {
  lista: readonly DefIndicador[];
  abierto: string | null;
  onAbrir: (id: string | null) => void;
  confianza: Record<string, TMarca>;
  metasIniciales: Record<string, number>;
  guardable: boolean;
}) {
  const [q, setQ] = useState("");
  const [metas, setMetas] = useState(metasIniciales);
  useScrollA(abierto, "dicc");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const filtradas = lista.filter((d) => !q.trim() || norm(`${d.nombre} ${d.pregunta} ${d.para} ${d.id}`).includes(norm(q.trim())));
  return (
    <>
      <div className="relative max-w-[360px]">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar indicador…" aria-label="Buscar indicador" className="pl-8 max-md:h-11" />
      </div>
      <section className="rounded-lg border bg-card">
        {filtradas.length === 0 && <EstadoVacio titulo="Ningún indicador con ese nombre." className="py-8" />}
        {filtradas.map((d) => {
          const esta = abierto === d.id;
          const conf = confianza[d.id];
          const m = marca(conf?.nivel ?? d.conf);
          return (
            <div key={d.id} id={`dicc-${d.id}`} className={cn("border-t first:border-t-0", esta && "bg-muted/40")}>
              <button type="button" aria-expanded={esta} onClick={() => onAbrir(esta ? null : d.id)} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <b className="text-[13.5px]">{d.nombre}{d.reservado ? " 🔒" : ""}</b>
                  <small className="block text-xs text-muted-foreground">{d.pregunta} · {d.regla} · {m.icono} {m.etiqueta}{metas[d.id] != null ? ` · meta ${nf(metas[d.id])}` : ""}</small>
                </span>
                {esta ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </button>
              {esta && (
                <div className="px-3 pb-3">
                  <DefinicionIndicador def={d} confianza={conf ?? { nivel: d.conf, motivo: d.motivo }} meta={metas[d.id]} completo />
                  <EditorMeta def={d} meta={metas[d.id]} guardable={guardable} onGuardada={(v) => setMetas((x) => { const n = { ...x }; if (v == null) delete n[d.id]; else n[d.id] = v; return n; })} />
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dónde se usa</div>
                  <p className="text-[13px]">{d.usos.join(" · ")}</p>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}

function EditorMeta({ def, meta, guardable, onGuardada }: { def: DefIndicador; meta: number | undefined; guardable: boolean; onGuardada: (v: number | null) => void }) {
  const { puedeEditar } = useDireccion();
  const [valor, setValor] = useState(meta != null ? String(meta) : "");
  const [guardando, setGuardando] = useState(false);
  const k = "mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  if (!puedeEditar) {
    return (
      <>
        <div className={k}>Meta</div>
        <p className="text-[13px]">{meta != null ? nf(meta) : "sin acordar"}</p>
      </>
    );
  }
  const n = valor.trim() === "" ? null : Number(valor.replace(",", "."));
  const valida = n === null || Number.isFinite(n);
  const cambio = (n ?? null) !== (meta ?? null);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valida || !cambio) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/direccion/metas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpiId: def.id, meta: n }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast(j.error ?? "No se pudo guardar. Probá de nuevo.");
        return;
      }
      onGuardada(n);
      toast(n == null ? `Sin meta para ${def.nombre}` : `Meta de ${def.nombre}: ${nf(n)}`, { description: "Queda registrado quién la cambió." });
    } finally {
      setGuardando(false);
    }
  }
  return (
    <form onSubmit={guardar}>
      <div className={k}>Meta</div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="sin acordar"
          aria-label={`Meta de ${def.nombre}`}
          aria-invalid={!valida}
          disabled={!guardable}
          className="w-[140px] max-md:h-11"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!guardable || !valida || !cambio || guardando} className="max-md:h-11">Guardar</Button>
        <span className="text-xs text-muted-foreground">
          {guardable ? `Con meta, la tarjeta muestra el punto verde/rojo (polaridad ${def.pol}).` : "Todavía no se pueden guardar metas: falta terminar la instalación."}
        </span>
      </div>
    </form>
  );
}

// ─── Calidad ───────────────────────────────────────────────────────────────────────────

function Calidad({
  resultado, motivo, abierto, onAbrir, onDef, guardable,
}: {
  resultado: ResultadoPantalla<DetalleDatos> | null;
  motivo?: string;
  abierto: string | null;
  onAbrir: (id: string | null) => void;
  onDef: (id: string) => void;
  guardable: boolean;
}) {
  const { puedeEditar } = useDireccion();
  const [dialogo, setDialogo] = useState(false);
  useScrollA(abierto, "cal");
  if (!resultado) {
    return <EstadoVacio titulo={motivo ?? "Todavía no hay datos. Odoo no respondió."} texto="El registro de calidad se arma leyendo Odoo. El diccionario se puede consultar igual." />;
  }
  const d = resultado.detalle;
  const avisos = resultado.avisos;
  const ver = avisos.filter((a) => a.nivel === "ver").length;
  const manualesOk = guardable && d.manualesDisponibles;
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
        <span className="flex-1 text-muted-foreground">{ver} a verificar · {avisos.length - ver} más</span>
        {puedeEditar && (
          <Button size="sm" variant="outline" onClick={() => setDialogo(true)} disabled={!manualesOk} className="max-md:h-11">Cargar un aviso</Button>
        )}
      </div>
      {avisos.length === 0 && <EstadoVacio positivo titulo="Todos los datos al día." className="border-t px-3 py-3" />}
      {avisos.map((a) => (
        <FilaAviso key={a.id} aviso={a} abierto={abierto === a.id} onAbrir={() => onAbrir(abierto === a.id ? null : a.id)} onDef={onDef} puedeCerrar={puedeEditar && a.origen === "manual" && manualesOk} />
      ))}
      <div className="space-y-1 border-t px-3 py-2.5 text-xs text-muted-foreground">
        <p>Un aviso se cierra solo cuando la condición deja de cumplirse. Los que no se detectan solos los carga un socio a mano.</p>
        {d.sinRevisar.length > 0 && <p className="text-(--dir-aten)">⚠ No se pudo revisar: {d.sinRevisar.join(", ")}. Odoo no respondió esa parte; probá Actualizar.</p>}
        {!d.manualesDisponibles && <p>Los avisos cargados a mano aparecen cuando termine la instalación.</p>}
      </div>
      {puedeEditar && manualesOk && <DialogoAviso abierto={dialogo} onCambio={setDialogo} />}
    </section>
  );
}

function FilaAviso({ aviso: a, abierto, onAbrir, onDef, puedeCerrar }: { aviso: Aviso; abierto: boolean; onAbrir: () => void; onDef: (id: string) => void; puedeCerrar: boolean }) {
  const s = SIMBOLO[a.nivel];
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);
  const [, empezar] = useTransition();
  async function cerrar() {
    setCerrando(true);
    try {
      const r = await fetch("/api/direccion/datos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cerrar: a.id }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { toast(j.error ?? "No se pudo cerrar el aviso."); return; }
      toast("Aviso cerrado", { description: "Queda registrado quién lo cerró." });
      empezar(() => router.refresh());
    } finally {
      setCerrando(false);
    }
  }
  return (
    <div id={`cal-${a.id}`} className={cn("border-t", abierto && "bg-muted/40")}>
      <button type="button" aria-expanded={abierto} onClick={onAbrir} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <b className="text-[13.5px]">
            <span className={s.clase} aria-hidden>{s.icono}</span> {a.reservado ? "🔒 " : ""}<TextoFrase frase={a.aviso} />
          </b>
          <small className="block text-xs text-muted-foreground">
            {s.etiqueta}{a.desde ? ` · desde ${flarga(a.desde)}` : ""} · le toca a {a.quien}{a.origen === "manual" ? " · cargado a mano" : ""}
          </small>
        </span>
        {abierto ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </button>
      {abierto && (
        <div className="flex flex-col gap-1 px-3 pb-3 text-[13px]">
          {a.detalle && a.detalle.length > 0 && <span><TextoFrase frase={a.detalle} /></span>}
          {a.que && <span><b>Qué hay que hacer:</b> {a.que} <span className="text-muted-foreground">(se corrige en Odoo)</span></span>}
          {a.afecta.length > 0 && (
            <span className="text-muted-foreground">
              Afecta a:{" "}
              {a.afecta.filter((k) => DEF[k]).map((k, i) => (
                <span key={k}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => onDef(k)} className="underline underline-offset-2 hover:text-foreground">{DEF[k].nombre}</button>
                </span>
              ))}
            </span>
          )}
          {puedeCerrar && (
            <div>
              <Button size="sm" variant="outline" onClick={cerrar} disabled={cerrando} className="mt-1 max-md:h-11">Cerrar aviso</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
