"use client";

// "Nuevo pedido" (§7 "Lo mínimo para cargarlo"), pensado para el teclado y menos de 20
// segundos: N → qué → Enter → dónde (obras del día primero, después los lugares, y si no
// está, la dirección escrita; con flechas) → Enter → para cuándo (flechas) → Enter "Guardar
// y poner en un camión". El tipo y quién pidió se deducen solos; "⋯ Más" tiene lo raro.

import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  addDia, aCargoDe, cNombre, cuadrillasActivas, cuadrillasConObras, diaSemana, hm, hoyManana, hojaDeCuadrilla, lugar,
  nombreDe, normalizar, obrasCon, pidioPorDefecto, recibeDe, tipoPorDestino, esHoy,
} from "@/lib/hoja-dia/estado";
import { cuadrillaDeDestino } from "@/lib/hoja-dia/camiones";
import { TIPOS_VIAJE, type Fecha, type Necesita, type Punto, type Urgencia } from "@/lib/hoja-dia/tipos";
import { InputHora, horaDe } from "./input-hora";
import { Kbd } from "./kbd";
import { useCamiones } from "./contexto";

export type PrefPedido = { que?: string; hacia?: Punto | null; cajonPendienteId?: string };

type Urg = "frena" | "hora" | "hoy" | "manana" | "cuando";
const URGS: [Urg, string][] = [["frena", "Frena la obra"], ["hora", "Antes de las…"], ["hoy", "Hoy"], ["manana", "Mañana"], ["cuando", "Cuando se pueda"]];
const NECESITA: [Necesita, string][] = [["cualquiera", "Cualquiera"], ["camion", "Camión (no entra en la S10)"], ["hidrogrua", "Hidrogrúa"]];
const GRUPO: Record<string, string> = { deposito: "depósito", proveedor: "proveedor", taller: "taller", vtv: "VTV", otro: "lugar" };

type Res = { key: string; punto: Punto; n: string; s: string; g: string };

export function NuevoPedido({ abierto, pref, cerrar, alGuardar }: {
  abierto: boolean;
  pref: PrefPedido | null;
  cerrar: () => void;
  /** Ya guardado: `poner` = "Guardar y poner en un camión". */
  alGuardar: (pedidoId: string, fecha: Fecha, poner: boolean) => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-xl">
        {abierto && <Formulario pref={pref} cerrar={cerrar} alGuardar={alGuardar} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ pref, cerrar, alGuardar }: { pref: PrefPedido | null; cerrar: () => void; alGuardar: (pedidoId: string, fecha: Fecha, poner: boolean) => void }) {
  const { dia, fecha, ahora, pedido } = useCamiones();
  const [que, setQue] = useState(pref?.que ?? "");
  const [q, setQ] = useState("");
  const [hacia, setHacia] = useState<Punto | null>(pref?.hacia ?? null);
  const [sel, setSel] = useState(0);
  const [urg, setUrg] = useState<Urg>("hoy");
  const [hl, setHl] = useState("");
  const [fija, setFija] = useState("14:00");
  const [traer, setTraer] = useState(false);
  const [pidio, setPidio] = useState<string | null | undefined>(undefined);
  const [mas, setMas] = useState(false);
  const [necesita, setNecesita] = useState<Necesita>("cualquiera");
  const [cliente, setCliente] = useState(false);
  const [nota, setNota] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const refQue = useRef<HTMLInputElement>(null);
  const refDonde = useRef<HTMLInputElement>(null);
  const refUrg = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Del cajón ya viene el qué (y quizás el dónde): el foco va a lo que falta.
    const t = setTimeout(() => (pref?.que && !pref.hacia ? refDonde.current : refQue.current)?.focus(), 30);
    return () => clearTimeout(t);
  }, [pref]);

  // El campo "Dónde" desaparece al elegir (queda el destino): el foco pasa a "Para cuándo"
  // cuando ya se dibujó, y después de que el diálogo haga lo suyo con el foco perdido.
  const focoUrg = () => setTimeout(() => refUrg.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(), 40);

  const res: Res[] = useMemo(() => {
    if (hacia) return [];
    const n = normalizar(q.trim());
    const out: Res[] = [];
    for (const c of cuadrillasConObras(dia)) {
      const h = hojaDeCuadrilla(dia, c);
      const ac = h ? aCargoDe(h) : null;
      for (const x of obrasCon(dia, c)) {
        if (n && !normalizar(`${x.o.corto} ${x.o.direccion} ${x.o.titulo}`).includes(n)) continue;
        out.push({ key: `o:${x.o.otId}`, punto: { otId: x.o.otId, lugarId: null, texto: null }, n: x.o.corto, s: `${cNombre(dia, c)}${ac ? ` (${nombreDe(dia, ac)})` : ""} · ${esHoy(ahora) ? "hoy" : diaSemana(dia.fecha)} ${x.est ? "~" : ""}${x.hora}`, g: "obra" });
      }
    }
    for (const l of dia.lugares) {
      if (!l.activo) continue;
      if (n && !normalizar(`${l.nombre} ${l.corto ?? ""} ${l.direccion ?? ""}`).includes(n)) continue;
      out.push({ key: `l:${l.id}`, punto: { otId: null, lugarId: l.id, texto: null }, n: l.nombre, s: `${l.direccion ?? ""}${l.horario ? ` · ${l.horario}` : ""}`, g: GRUPO[l.tipo] ?? "lugar" });
    }
    if (n && !out.length) out.push({ key: "t", punto: { otId: null, lugarId: null, texto: q.trim() }, n: `Usar «${q.trim()}» como dirección`, s: "se escribe tal cual", g: "texto" });
    return out.slice(0, 7);
  }, [dia, q, hacia, ahora]);

  const destino = hacia ? lugar(dia, hacia) : null;
  const cd = hacia ? cuadrillaDeDestino(dia, hacia) : null;
  const obraH = hacia?.otId != null && cd ? obrasCon(dia, cd.c).find((x) => x.o.otId === hacia.otId) ?? null : null;
  const L = hacia?.lugarId ? dia.lugares.find((l) => l.id === hacia.lugarId) : null;
  const tipo = hacia ? tipoPorDestino(dia, hacia, traer) : null;
  const pidioEf = pidio !== undefined ? pidio : hacia ? pidioPorDefecto(dia, hacia) : null;
  const capataces = [...new Set(cuadrillasActivas(dia).map((c) => recibeDe(dia, c)).filter((x): x is string => !!x))];
  if (pidioEf && !capataces.includes(pidioEf)) capataces.push(pidioEf);

  const elegir = (r: Res) => {
    setHacia(r.key === "t" ? { otId: null, lugarId: null, texto: q.trim() } : r.punto);
    setErr(null);
    if (r.punto.otId != null && !hl) {
      const c = cuadrillaDeDestino(dia, r.punto)?.c;
      const o = c != null ? obrasCon(dia, c).find((x) => x.o.otId === r.punto.otId) : null;
      const ref = esHoy(ahora) ? ahora : 7 * 60;
      if (o && o.t > ref + 30) setHl(o.hora);
    }
    focoUrg();
  };

  const fechaPedido = (): Fecha => {
    if (urg !== "manana") return fecha;
    let f = addDia(fecha, 1);
    if (diaSemana(f) === "domingo") f = addDia(f, 1);
    return f;
  };

  const guardar = (poner: boolean) => {
    if (guardando) return;
    const qq = que.trim();
    if (!qq) { setErr("Falta qué hay que llevar o traer."); refQue.current?.focus(); return; }
    let h = hacia;
    if (!h && q.trim() && res[0]) h = res[sel]?.punto ?? res[0].punto;
    if (!h) { setErr("Falta dónde."); refDonde.current?.focus(); return; }
    let horaLimite: string | null = null;
    if (urg === "hora") {
      horaLimite = horaDe(hl);
      if (!horaLimite) { setErr("La hora límite no es válida."); return; }
    }
    const t = tipoPorDestino(dia, h, traer);
    const horaFija = t === "taller" ? horaDe(fija) ?? "14:00" : null;
    const urgencia: Urgencia = urg === "manana" ? (cliente ? "cliente" : "hoy") : urg === "cuando" ? "cuando_se_pueda" : urg === "hoy" && cliente ? "cliente" : urg;
    const f = fechaPedido();
    setGuardando(true);
    pedido(
      {
        accion: "crear", fecha: f, que: qq, hacia: h, esParaTraer: traer || undefined, urgencia, horaLimite, horaFija, necesita,
        ...(pidio !== undefined ? { pidioId: pidio } : {}),
        nota: nota.trim() || null, canal: pref?.cajonPendienteId ? "cajon" : "telefono", cajonPendienteId: pref?.cajonPendienteId ?? null,
      },
      (r) => {
        setGuardando(false);
        if (typeof r.pedidoId === "string") alGuardar(r.pedidoId, f, poner);
        else cerrar();
      },
    );
    // Si el servidor contesta con error, el toast lo dice y el formulario queda abierto.
    setTimeout(() => setGuardando(false), 8000);
  };

  const enterGuarda = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); guardar(true); }
  };

  return (
    <div
      className="grid gap-3.5"
      onKeyDown={(e) => {
        // Enter en un radio de "Para cuándo" guarda y pone (el resto de los botones, su clic).
        const t = e.target as HTMLElement;
        if (e.key === "Enter" && t.getAttribute("role") === "radio" && t.closest("[data-urg]")) { e.preventDefault(); guardar(true); }
      }}
    >
      <DialogTitle>Nuevo pedido</DialogTitle>

      <div className="grid gap-1">
        <Label htmlFor="np-que">Qué</Label>
        <Input
          id="np-que" ref={refQue} value={que} autoComplete="off" placeholder="6 tablones y 2 bases"
          onChange={(e) => { setQue(e.target.value); setErr(null); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (hacia) focoUrg();
            else refDonde.current?.focus();
          }}
        />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="np-donde">Dónde</Label>
        {destino ? (
          <div className="flex flex-wrap items-baseline gap-x-1.5 rounded-md bg-muted px-2.5 py-1.5 text-[13px]">
            <b className="font-semibold">{destino.n}</b>
            {cd ? <span className="text-muted-foreground">· {cd.txt}{obraH ? ` · ${esHoy(ahora) ? "hoy" : diaSemana(dia.fecha)} ${obraH.hora}` : ""}</span> : L?.horario ? <span className="text-muted-foreground">· {L.horario}</span> : null}
            <button
              type="button"
              className="ml-auto rounded text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => { setHacia(null); setPidio(undefined); setTraer(false); requestAnimationFrame(() => refDonde.current?.focus()); }}
            >
              cambiar
            </button>
          </div>
        ) : (
          <>
            <Input
              id="np-donde" ref={refDonde} value={q} autoComplete="off" placeholder="Obra, lugar o dirección: «cab», «sanz»…"
              role="combobox" aria-expanded={res.length > 0} aria-controls="np-res" aria-autocomplete="list"
              aria-activedescendant={res.length ? `np-r-${sel}` : undefined}
              onChange={(e) => { setQ(e.target.value); setSel(0); setErr(null); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const n = Math.max(1, res.length);
                  setSel((s) => (s + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const r = res[sel];
                  if (r) elegir(r);
                }
              }}
            />
            {res.length > 0 && (
              <ul id="np-res" role="listbox" aria-label="Resultados" className="grid max-h-60 gap-px overflow-auto rounded-md border p-1">
                {res.map((r, i) => (
                  <li
                    key={r.key} id={`np-r-${i}`} role="option" aria-selected={sel === i}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(r)}
                    className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1.5 text-[13px] max-md:py-2.5", sel === i ? "bg-accent" : "hover:bg-muted")}
                  >
                    <span className="min-w-0">
                      {r.n} <small className="text-xs text-muted-foreground">{r.s}</small>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{r.g}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="grid gap-1.5">
        <span id="np-u-l" className="text-sm font-medium">Para cuándo</span>
        <div ref={refUrg} role="radiogroup" aria-labelledby="np-u-l" data-urg className="flex flex-wrap gap-1.5">
          {URGS.map(([k, l]) => (
            <button
              key={k} type="button" role="radio" aria-checked={urg === k} tabIndex={urg === k ? 0 : -1}
              onClick={() => {
                setUrg(k);
                if (k === "hora" && !hl) setHl(hm(Math.round((Math.max(esHoy(ahora) ? ahora : 7 * 60, 7 * 60) + 120) / 5) * 5));
              }}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
                e.preventDefault();
                const i = URGS.findIndex((x) => x[0] === urg);
                const n = URGS[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + URGS.length) % URGS.length][0];
                setUrg(n);
                if (n === "hora" && !hl) setHl(hm(Math.round((Math.max(esHoy(ahora) ? ahora : 7 * 60, 7 * 60) + 120) / 5) * 5));
                requestAnimationFrame(() => refUrg.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
              }}
              className="min-h-8 rounded-full border border-input px-3 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-foreground aria-checked:bg-foreground aria-checked:text-background max-md:min-h-10"
            >
              {l}
            </button>
          ))}
        </div>
        {urg === "hora" && <InputHora etiqueta="Antes de las" value={hl} onChange={setHl} onKeyDown={enterGuarda} />}
        {tipo === "taller" && <InputHora etiqueta="Turno (hora fija)" value={fija} onChange={setFija} onKeyDown={enterGuarda} />}
      </div>

      {hacia && tipo && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
          Se deduce: <b className="font-semibold text-foreground">{TIPOS_VIAJE[tipo].nombre}</b>
          {hacia.otId != null && (
            <button type="button" onClick={() => setTraer(!traer)} className="rounded underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              {traer ? "Es para llevar" : "Es para traer"}
            </button>
          )}
          · pidió
          <select
            aria-label="Quién pidió"
            value={pidioEf ?? ""}
            onChange={(e) => setPidio(e.target.value || null)}
            className="h-7 rounded-md border border-input bg-transparent px-1.5 text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Oficina</option>
            {capataces.map((p) => <option key={p} value={p}>{nombreDe(dia, p)}</option>)}
          </select>
          · para {urg === "manana" ? "mañana" : hoyManana(fecha, ahora)}
        </div>
      )}

      <div>
        <button type="button" aria-expanded={mas} onClick={() => setMas(!mas)} className="rounded text-[13px] text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
          {mas ? "Menos" : "⋯ Más (necesita hidrogrúa, le prometimos al cliente, nota)"}
        </button>
      </div>
      {mas && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span id="np-nec" className="text-sm font-medium">Necesita</span>
            <div role="radiogroup" aria-labelledby="np-nec" className="flex flex-wrap gap-1.5">
              {NECESITA.map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={necesita === k} onClick={() => setNecesita(k)}
                  className="min-h-8 rounded-full border border-input px-3 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-foreground aria-checked:bg-foreground aria-checked:text-background">
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={cliente} onChange={(e) => setCliente(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Le prometimos al cliente
          </label>
          <div className="grid gap-1">
            <Label htmlFor="np-nota">Nota</Label>
            <Input id="np-nota" value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={enterGuarda} />
          </div>
        </div>
      )}

      {err && <p role="alert" className="text-sm font-medium text-hd-rojo">{err}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button variant="outline" disabled={guardando} onClick={() => guardar(false)}>Guardar</Button>
        <Button className={PRI} disabled={guardando} onClick={() => guardar(true)}>
          Guardar y poner en un camión <Kbd>Enter</Kbd>
        </Button>
      </DialogFooter>
    </div>
  );
}
