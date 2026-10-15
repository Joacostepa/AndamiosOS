"use client";

// Comandos del editor que se usan desde el teclado y desde la paleta (Ctrl+K), portados de la maqueta
// aprobada: duplicar alineado (Ctrl+D), abertura sobre la selección (O), volver a lo generado (Supr con
// celdas), medida rápida de largo y altura (L / H, tipear + Enter con los kg en vivo) y la paleta con
// textos tipo «torre 2,50×1,50 h 12».

import { useMemo, useRef, useState } from "react";
import { toast } from "./util/toast";
import { agregarEstructura, fmt as fmtN, presetsGaleria, setParam, tipologia, type Diseno, type Estructura } from "@/lib/tecnica/modelo";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor, estructuraSel } from "./estado/store";
import { borrarEstructura, convertir, pintar } from "./estado/acciones";
import { kg } from "./util/formato";

const st = () => useEditor.getState();
const r2 = (v: number) => Math.round(v * 100) / 100;
const dirDeRumbo = (rumbo: number): [number, number] => [Math.cos((rumbo * Math.PI) / 180), Math.sin((rumbo * Math.PI) / 180)];

/** Ctrl+D: copia la estructura elegida al lado, alineada con su rumbo (largo + 2,00). */
export function duplicarSeleccion(): boolean {
  const s = st();
  const est = estructuraSel(s);
  if (!est || s.soloLectura) return false;
  const res = s.res.estructuras.find((e) => e.id === est.id);
  const u = dirDeRumbo(est.rumbo);
  const proy = (res?.huella ?? []).map((p) => p[0] * u[0] + p[1] * u[1]);
  const largo = proy.length ? Math.max(...proy) - Math.min(...proy) : 5;
  const off = largo + 2;
  try {
    const { diseno, estructuraId } = agregarEstructura(s.diseno, est.preset ?? est.tipologia, {
      sistema: est.sistema, medida: est.medida, nombre: `${est.nombre} (copia)`,
      origen: [r2(est.origen[0] + u[0] * off), r2(est.origen[1] + u[1] * off)], rumbo: est.rumbo,
    }, s.catalogo);
    const d: Diseno = structuredClone(diseno);
    const nueva = d.estructuras.find((e) => e.id === estructuraId)!;
    const copia: Estructura = structuredClone(est);
    Object.assign(nueva, { params: copia.params, overrides: copia.overrides, esqueleto: copia.esqueleto, convertidaDe: copia.convertidaDe, apoyo: copia.apoyo.tipo === "sobre_estructura" ? { tipo: "suelo" } : copia.apoyo });
    if (!s.commit(d, `Duplicar ${est.nombre}`)) return false;
    st().seleccionar({ estructuraId, celdas: [] });
    return true;
  } catch (e) {
    toast.error("No se pudo duplicar", { description: e instanceof Error ? e.message : undefined });
    return false;
  }
}

/** O: abertura (paso sin horizontales intermedios ni diagonal) en las celdas elegidas. */
export function aberturaSeleccion(): boolean {
  const s = st();
  const est = estructuraSel(s);
  if (!est || s.soloLectura) return false;
  if (!s.sel.celdas.length) {
    toast("Elegí las celdas de la abertura en el alzado (clic o arrastrando) y apretá O.");
    return false;
  }
  return pintar(est.id, s.sel.celdas, "abertura");
}

/** Supr con celdas elegidas: vuelve esas celdas a lo generado (saca sus ajustes); nunca borra la estructura. */
export function limpiarCeldas(): boolean {
  const s = st();
  const est = estructuraSel(s);
  if (!est || s.soloLectura || !s.sel.celdas.length) return false;
  const conAjuste = est.tipologia === "libre" ? s.sel.celdas : s.sel.celdas.filter((c) => est.overrides?.[c]);
  if (!conAjuste.length) {
    toast("Las celdas elegidas no tienen ajustes para quitar.", { description: "Para borrar la estructura entera: Esc para soltar las celdas y después Supr dos veces." });
    return false;
  }
  return pintar(est.id, conAjuste, "borrar");
}

// ───────────── borrar con doble pulsación ─────────────
let armadoBorrar = 0;
/** Supr / ⌫ sobre una estructura: pide una segunda pulsación en 2,5 s (en Mac «delete» es ⌫). */
export function borrarConConfirmacion(): void {
  const s = st();
  const est = estructuraSel(s);
  if (!est || s.soloLectura) return;
  if (Date.now() - armadoBorrar < 2500) {
    armadoBorrar = 0;
    toast.dismiss("armado-borrar");
    borrarEstructura(est.id);
    return;
  }
  armadoBorrar = Date.now();
  toast(`Apretá ⌫ otra vez para borrar ${est.nombre}`, { id: "armado-borrar", duration: 2500 });
}

// ───────────── medida rápida (L / H) ─────────────
export type Medida = "largo" | "altura";

/** Ruta del parámetro que mueve la manija de largo o de altura en esta estructura (o null si no tiene). */
export function rutaMedida(est: Estructura, que: Medida, frente = 0): string | null {
  if (est.tipologia === "libre") return null;
  const campos = tipologia(est.tipologia)?.campos ?? [];
  const tiene = (r: string) => campos.some((c) => c.ruta === r);
  if (que === "largo") {
    if (Array.isArray(est.params.frentes)) return `params.frentes.${frente}.largo`;
    return tiene("params.largo") ? "params.largo" : null;
  }
  if (est.params.alturaHeredada === true) return null;
  for (const r of ["params.altura", "params.alturaPlataforma", "params.cota", "params.alturaColgada"]) if (tiene(r)) return r;
  return null;
}

const leer = (o: unknown, ruta: string): unknown => ruta.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);

/** ¿Se puede abrir la medida rápida? Si no, avisa por qué. */
export function puedeMedir(que: Medida): boolean {
  const e = estructuraSel(st());
  if (e && rutaMedida(e, que)) return true;
  toast(!e ? "Elegí una estructura primero." : que === "largo" ? "Esta estructura no tiene manija de largo." : "La altura de esta estructura viene heredada o no se edita así.");
  return false;
}

/** Se monta al abrir (L / H) con una key nueva: el estado inicial se toma del modelo en ese momento. */
export function MedidaRapida({ que, onCerrar }: { que: Medida; onCerrar: () => void }) {
  const est = useEditor(estructuraSel);
  const pesoActual = useEditor((s) => s.res.resumen.pesoKg);
  const ruta = est ? rutaMedida(est, que) : null;
  const [ini] = useState(() => {
    const s = st();
    const e = estructuraSel(s);
    const r = e ? rutaMedida(e, que) : null;
    return { diseno: s.diseno, peso: s.res.resumen.pesoKg, txt: e && r ? fmtN(Number(leer(e, r) ?? 0)) : "" };
  });
  const base = useRef<Diseno | null>(ini.diseno);
  const pesoBase = ini.peso;
  const [txt, setTxt] = useState(ini.txt);

  if (!est || !ruta) return null;
  const valor = Number(txt.replace(",", "."));
  const valido = Number.isFinite(valor) && valor > 0;
  const previsualizar = (t: string) => {
    setTxt(t);
    const v = Number(t.replace(",", "."));
    if (base.current && Number.isFinite(v) && v > 0) st().preview(setParam(base.current, est.id, ruta, v));
  };
  const cancelar = () => {
    if (base.current) st().preview(base.current);
    base.current = null;
    onCerrar();
  };
  const aplicarValor = () => {
    if (!base.current || !valido) return cancelar();
    const b = base.current;
    base.current = null;
    st().commit(setParam(b, est.id, ruta, valor), `${que === "largo" ? "Largo" : "Altura"} de ${est.nombre} → ${fmtN(valor)} m`, b);
    onCerrar();
  };
  const dKg = pesoActual - pesoBase;
  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg">
      <span className="text-muted-foreground">{que === "largo" ? "Largo" : "Altura"} de {est.nombre}</span>
      <Input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        value={txt}
        inputMode="decimal"
        aria-label={que === "largo" ? "Largo en metros" : "Altura en metros"}
        className="h-8 w-24 font-mono"
        onChange={(e) => previsualizar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") aplicarValor();
          if (e.key === "Escape") cancelar();
        }}
        onBlur={() => base.current && aplicarValor()}
      />
      <span className="text-muted-foreground">m</span>
      <span className="font-mono text-xs text-muted-foreground">{kg(pesoActual)} kg{dKg ? ` (${dKg > 0 ? "+" : "−"}${kg(Math.abs(dKg))})` : ""}</span>
      <Button size="xs" onClick={aplicarValor} disabled={!valido}>Enter</Button>
    </div>
  );
}

// ───────────── paleta (Ctrl+K) ─────────────
interface Comando { t: string; g: string; k?: string; fn: () => void }

/** Interpreta «torre 2,50×1,50 h 12», «pórtico 10», «pórtico vehicular 6», «fachada 16 9 h 15», «altura 21». */
export function interpretar(q: string, s = st()): Comando | null {
  const txt = q.toLowerCase().replace(/,/g, ".");
  const nums = (txt.match(/\d+(\.\d+)?/g) || []).map(Number);
  const hh = /\bh\s*(\d+(\.\d+)?)/.exec(txt);
  const altura = hh ? +hh[1] : undefined;
  const sinH = hh ? nums.filter((n, i) => !(n === altura && i === nums.lastIndexOf(altura!))) : nums;
  const agregar = (preset: string, params: Record<string, unknown>, nombre: string) => () => {
    try {
      const { diseno, estructuraId } = agregarEstructura(s.diseno, preset, { params, origen: [0, 6] }, s.catalogo);
      if (st().commit(diseno, `Agregar ${nombre} (paleta)`)) st().seleccionar({ estructuraId, celdas: [] });
    } catch (e) {
      toast.error(`No se pudo agregar ${nombre}`, { description: e instanceof Error ? e.message : undefined });
    }
  };
  if (/^torre/.test(txt) && sinH.length) {
    const [l, a] = sinH;
    return { t: `Torre escalera ${fmtN(l)} × ${fmtN(a ?? 1.5)}${altura ? ` · h ${fmtN(altura)}` : ""}`, g: "Crear", fn: agregar("torre_escalera", { largo: l, ancho: a ?? 1.5, ...(altura ? { altura } : {}) }, "torre") };
  }
  if (/^p[oó]rtico/.test(txt) && sinH.length) {
    const veh = /veh/.test(txt);
    return { t: veh ? `Pórtico vehicular luz ${fmtN(sinH[0])}` : `Pórtico peatonal ${fmtN(sinH[0])} ml`, g: "Crear", fn: agregar(veh ? "portico_vehicular" : "portico_peatonal", veh ? { luz: sinH[0] } : { largo: sinH[0] }, "pórtico") };
  }
  if (/^(fachada|frentes)/.test(txt) && sinH.length) {
    const est = estructuraSel(s);
    if (est && Array.isArray(est.params.frentes)) {
      return { t: `Frentes ${sinH.map((n) => fmtN(n)).join(" + ")}${altura ? ` · h ${fmtN(altura)}` : ""}`, g: "Editar", fn: () => {
        const viejos = est.params.frentes as { largo: number; angulo?: number }[];
        let d = setParam(s.diseno, est.id, "params.frentes", sinH.map((l, i) => (i ? { largo: l, angulo: viejos[i]?.angulo ?? 90 } : { largo: l })));
        if (altura) d = setParam(d, est.id, "params.altura", altura);
        st().commit(d, "Frentes (paleta)");
      } };
    }
    return { t: `Fachada ${sinH.map((n) => fmtN(n)).join(" + ")}${altura ? ` · h ${fmtN(altura)}` : ""}`, g: "Crear", fn: agregar("estructura", { frentes: sinH.map((l, i) => (i ? { largo: l, angulo: 90 } : { largo: l })), ...(altura ? { altura } : {}) }, "fachada") };
  }
  if (/^altura/.test(txt) && nums.length) {
    const est = estructuraSel(s);
    const r = est ? rutaMedida(est, "altura") : null;
    if (est && r) return { t: `Altura de ${est.nombre} → ${fmtN(nums[0])} m`, g: "Editar", fn: () => st().commit(setParam(st().diseno, est.id, r, nums[0]), `Altura → ${fmtN(nums[0])}`) };
  }
  if (/^largo/.test(txt) && nums.length) {
    const est = estructuraSel(s);
    const r = est ? rutaMedida(est, "largo") : null;
    if (est && r) return { t: `Largo de ${est.nombre} → ${fmtN(nums[0])} m`, g: "Editar", fn: () => st().commit(setParam(st().diseno, est.id, r, nums[0]), `Largo → ${fmtN(nums[0])}`) };
  }
  return null;
}

export function PaletaComandos({ abierta, onCambiar, onMedida, onDialogo }: {
  abierta: boolean; onCambiar: (v: boolean) => void; onMedida: (m: Medida) => void; onDialogo: (d: "computo" | "plantilla" | "atajos") => void;
}) {
  const [q, setQ] = useState("");
  const est = useEditor(estructuraSel);
  const soloLectura = useEditor((s) => s.soloLectura);
  const celdas = useEditor((s) => s.sel.celdas.length);
  const interpretado = useMemo(() => (q.trim() ? interpretar(q.trim()) : null), [q]);
  const lista = useMemo(() => {
    const L: Comando[] = [];
    if (!soloLectura) {
      for (const g of presetsGaleria()) for (const p of g.presets) L.push({ t: `Ubicar ${p.nombre.toLowerCase()}`, g: "Crear", k: p.tecla, fn: () => st().setColocando(p.id) });
    }
    if (est && !soloLectura) {
      L.push({ t: `Duplicar ${est.nombre}`, g: "Estructura", k: "Ctrl D", fn: () => void duplicarSeleccion() });
      if (rutaMedida(est, "largo")) L.push({ t: `Largo de ${est.nombre}`, g: "Estructura", k: "L", fn: () => onMedida("largo") });
      if (rutaMedida(est, "altura")) L.push({ t: `Altura de ${est.nombre}`, g: "Estructura", k: "H", fn: () => onMedida("altura") });
      if (celdas) L.push({ t: "Abertura en las celdas elegidas", g: "Estructura", k: "O", fn: () => void aberturaSeleccion() });
      if (celdas) L.push({ t: "Volver a lo generado en las celdas elegidas", g: "Estructura", k: "Supr", fn: () => void limpiarCeldas() });
      if (est.tipologia !== "libre") L.push({ t: `Convertir ${est.nombre} a estructura libre`, g: "Estructura", fn: () => convertir(est.id) });
      L.push({ t: `Borrar ${est.nombre}`, g: "Estructura", k: "⌫ ⌫", fn: () => borrarEstructura(est.id) });
    }
    if (!soloLectura) {
      L.push({ t: "Generar cómputo", g: "Modelo", fn: () => onDialogo("computo") });
      L.push({ t: "Guardar como plantilla", g: "Modelo", fn: () => onDialogo("plantilla") });
    }
    L.push({ t: "Atajos de teclado", g: "Ayuda", k: "?", fn: () => onDialogo("atajos") });
    return L;
  }, [est, soloLectura, celdas, onMedida, onDialogo]);
  const ejecutar = (c: Comando) => {
    onCambiar(false);
    setQ("");
    setTimeout(c.fn, 0);
  };
  const grupos = [...new Set(lista.map((c) => c.g))];
  return (
    <CommandDialog open={abierta} onOpenChange={(v) => { onCambiar(v); if (!v) setQ(""); }} title="Paleta de comandos" description="Buscá un comando o escribí «torre 2,50×1,50 h 12»">
      <Command>
      <CommandInput value={q} onValueChange={setQ} placeholder="Comando o «torre 2,50×1,50 h 12», «pórtico 10», «fachada 16 9 h 15», «altura 21»" />
      <CommandList>
        <CommandEmpty>Sin resultados. Probá «torre 2,50×1,50 h 12» o «pórtico vehicular 6».</CommandEmpty>
        {interpretado && !soloLectura && (
          <CommandGroup heading={interpretado.g}>
            <CommandItem value={`__interpretado ${q}`} onSelect={() => ejecutar(interpretado)}>{interpretado.t}</CommandItem>
          </CommandGroup>
        )}
        {grupos.map((g) => (
          <CommandGroup key={g} heading={g}>
            {lista.filter((c) => c.g === g).map((c) => (
              <CommandItem key={c.t} value={`${c.t} ${c.g}`} onSelect={() => ejecutar(c)}>
                {c.t}
                {c.k && <CommandShortcut>{c.k}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

