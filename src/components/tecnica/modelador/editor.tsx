"use client";

// Editor del modelador (/oficina-tecnica/modelador/[id]). Tres columnas: galería, estructuras y
// volúmenes · lienzo 3D con alzado/planta · propiedades, lista de piezas y avisos. Se carga con
// dynamic(ssr:false) desde la página: three solo corre en el navegador.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "./util/toast";
import { presetsGaleria, PREDIMENSIONADO, SIMPLIFICACIONES, VUELOS_MENSULA, CRITERIOS, type Catalogo, type Diseno, type Regla } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor, estructuraSel } from "./estado/store";
import { aplicar, pincelDisponible, PINCELES, pintar } from "./estado/acciones";
import { aberturaSeleccion, borrarConConfirmacion, duplicarSeleccion, limpiarCeldas, MedidaRapida, PaletaComandos, puedeMedir, type Medida } from "./comandos";
import { guardarAhora, useAutoguardado } from "./estado/autoguardado";
import { subirImagen } from "./datos/api";
import type { ModeloFila } from "./datos/tipos";
import { Lienzo } from "./vista3d/lienzo";
import type { Escena, ModoVista } from "./vista3d/escena";
import { LEYENDA, leerPaleta } from "./vista3d/paleta";
import { Alzado } from "./alzado/alzado";
import { Planta } from "./alzado/planta";
import { Galeria } from "./paneles/galeria";
import { Arbol } from "./paneles/arbol";
import { Volumenes } from "./paneles/volumenes";
import { Propiedades } from "./paneles/propiedades";
import { ListaPiezas } from "./paneles/lista";
import { Avisos } from "./paneles/avisos";
import { GenerarComputo } from "./paneles/generar-computo";
import { GuardarPlantilla } from "./paneles/guardar-plantilla";
import { fmt } from "./util/formato";
import {
  ArrowLeft, BookmarkPlus, Calculator, Check, CloudOff, Eye, EyeOff, Focus, ImageDown, Keyboard, Loader2,
  MousePointer2, Paintbrush, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, TriangleAlert, Undo2,
} from "lucide-react";

export interface PropsEditor {
  modelo: ModeloFila | null;
  /** Diseño a abrir cuando no hay modelo guardado (modo demostración). */
  disenoDemo?: Diseno;
  catalogo: Catalogo;
  errorCatalogo: string | null;
  soloLectura: boolean;
}

/** Pinceles agrupados para las acciones rápidas sobre celdas (todos visibles; «Limpiar» siempre). */
const GRUPOS_PINCEL: { nombre: string; ids: string[] }[] = [
  { nombre: "Estructura", ids: ["diagonal", "sin_diagonal", "horizontal", "abertura", "cano"] },
  { nombre: "Protección", ids: ["plataforma", "sin_plataforma", "baranda", "lona"] },
  { nombre: "Fijación", ids: ["mensula", "anclaje"] },
  { nombre: "Volver a lo generado", ids: ["borrar"] },
];

const TECLAS_PRESET = new Map(
  presetsGaleria().flatMap((g) => g.presets).filter((p) => p.tecla).map((p) => [p.tecla!.toLowerCase(), p] as const),
);

/** Clave de una regla sin números: "Agregué 12 anclajes" y "Agregué 14 anclajes" son la misma. */
const claveRegla = (r: Regla) => `${r.regla}|${r.texto.replace(/\d+(?:[.,]\d+)*/g, "#")}`;
const SILENCIOSAS = /^(fusion|union\.|diag\.|baranda|bastidor)/;

export default function Editor({ modelo, disenoDemo, catalogo, errorCatalogo, soloLectura }: PropsEditor) {
  const escenaRef = useRef<Escena | null>(null);
  const listo = useEditor((s) => s.listo);
  const [verVolumenes, setVerVolumenes] = useState(true);
  const [abajo, setAbajo] = useState<"alzado" | "planta">("alzado");
  const [alzadoGrande, setAlzadoGrande] = useState(false);
  const [vista, setVista] = useState<ModoVista>("iso");
  const [tab, setTab] = useState("props");
  const [dlg, setDlg] = useState<null | "computo" | "plantilla" | "atajos">(null);
  const [paleta, setPaleta] = useState(false);
  // columnas laterales plegables (en 1280 px el lienzo quedaba en ~680); se recuerda en este navegador
  const [plegadas, setPlegadas] = useState<{ izq: boolean; der: boolean }>(() => {
    try {
      const v = localStorage.getItem("modelador.columnas");
      return v ? JSON.parse(v) : { izq: false, der: false };
    } catch {
      return { izq: false, der: false };
    }
  });
  const plegar = (lado: "izq" | "der") => setPlegadas((p) => {
    const n = { ...p, [lado]: !p[lado] };
    try {
      localStorage.setItem("modelador.columnas", JSON.stringify(n));
    } catch {
      /* sin almacenamiento */
    }
    return n;
  });
  // con una fachada elegida el alzado es donde se edita fino: más alto
  const esFachada = useEditor((s) => estructuraSel(s)?.tipologia === "fachada");
  const [medida, setMedidaRaw] = useState<Medida | null>(null);
  const [medidaN, setMedidaN] = useState(0);
  const setMedida = useCallback((m: Medida | null) => {
    if (m && !puedeMedir(m)) return;
    setMedidaN((n) => n + 1);
    setMedidaRaw(m);
  }, []);
  const cerrarMedida = useCallback(() => setMedidaRaw(null), []);

  // ── arranque ──
  // Una sola vez por modelo: un refetch del mismo modelo (otra pestaña, generar cómputo) trae un objeto
  // nuevo y no tiene que reiniciar el editor (se perdían deshacer, la selección y lo no guardado).
  const iniciado = useRef<string | null>(null);
  useEffect(() => {
    const d = modelo?.diseno ?? disenoDemo;
    if (!d) return;
    const clave = modelo?.id ?? "demo";
    if (iniciado.current === clave) return;
    iniciado.current = clave;
    useEditor.getState().iniciar(d, catalogo, { soloLectura, modeloId: modelo?.id ?? null, revision: modelo?.revision ?? null });
  }, [modelo, disenoDemo, catalogo, soloLectura]);
  // el catálogo o el permiso pueden llegar/cambiar después sin reiniciar el modelo
  useEffect(() => {
    if (iniciado.current && useEditor.getState().catalogo !== catalogo) useEditor.getState().cambiarCatalogo(catalogo);
  }, [catalogo]);

  useAutoguardado();

  // ── toasts de reglas nuevas, errores nuevos y deshacer/rehacer ──
  useEffect(() => {
    return useEditor.subscribe((s, ant) => {
      const u = s.ultimo;
      if (!u || u === ant.ultimo || !u.prevRes) return;
      if (u.historial) {
        const otra = u.historial === "deshacer" ? "Rehacer" : "Deshacer";
        toast(`${u.historial === "deshacer" ? "Deshice" : "Rehice"}: ${u.nombre}`, {
          action: { label: otra, onClick: () => (otra === "Rehacer" ? useEditor.getState().rehacer() : useEditor.getState().deshacer()) },
          duration: 3500,
        });
        return;
      }
      const antes = new Set(u.prevRes.reglas.map(claveRegla));
      const nuevas = s.res.reglas.filter((r) => !antes.has(claveRegla(r)) && !SILENCIOSAS.test(r.regla));
      if (nuevas.length === 1) {
        const r = nuevas[0];
        const n = u.n;
        toast(r.texto, {
          id: "reglas-nuevas",
          description: "Regla automática (provisoria)",
          action: r.deshacer
            ? { label: "Deshacer", onClick: () => (useEditor.getState().pasado.length === n ? aplicar(r.deshacer!, `Deshacer regla: ${r.texto.slice(0, 48)}`) : useEditor.getState().deshacer()) }
            : undefined,
        });
      } else if (nuevas.length > 1) {
        // varias reglas juntas: un solo toast (no tapan el panel de propiedades)
        toast(`Apliqué ${nuevas.length} reglas automáticas (provisorias)`, {
          id: "reglas-nuevas",
          description: nuevas.slice(0, 2).map((r) => r.texto).join(" · ").slice(0, 160),
          action: { label: "Ver en Avisos", onClick: () => setTab("avisos") },
        });
      }
      const errAntes = new Set(u.prevRes.avisos.filter((a) => a.nivel === "error").map((a) => a.texto));
      const nuevoErr = s.res.avisos.find((a) => a.nivel === "error" && !errAntes.has(a.texto));
      if (nuevoErr) {
        const rp = nuevoErr.reparaciones[0];
        toast.error(nuevoErr.texto, { description: PREDIMENSIONADO, action: rp ? { label: rp.etiqueta, onClick: () => aplicar(rp.accion, rp.etiqueta) } : undefined, duration: 9000 });
      }
    });
  }, []);

  // ── atajos de teclado ──
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      // Ctrl+S funciona aunque el foco esté en un campo (si no, el navegador abre «Guardar página»)
      if (mod && k.toLowerCase() === "s") {
        e.preventDefault();
        void guardarAhora(true).then((ok) => ok && toast.success("Guardado"));
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || t.closest('[role="combobox"],[role="spinbutton"],[role="slider"]'))) return;
      // con un diálogo, un menú o una lista desplegada abiertos, las teclas son de ellos
      if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"],[role="alertdialog"]')) return;
      if (mod && k.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.rehacer();
        else s.deshacer();
        return;
      }
      if (mod && k.toLowerCase() === "y") {
        e.preventDefault();
        s.rehacer();
        return;
      }
      if (mod && k.toLowerCase() === "d") {
        e.preventDefault();
        if (!duplicarSeleccion()) toast("Elegí una estructura para duplicarla.");
        return;
      }
      if (mod || e.altKey) return;
      if (k === "Escape") {
        if (medida) cerrarMedida();
        else if (s.colocando) s.setColocando(null);
        else if (s.herramienta !== "seleccionar") s.setHerramienta("seleccionar");
        else if (s.sel.celdas.length || s.sel.volumen) s.seleccionar({ celdas: [], volumen: null });
        return;
      }
      if (k === "?") return setDlg("atajos");
      // con el pincel activo, los números eligen pincel (y dejan de cambiar la vista)
      if (s.herramienta === "pincel" && /^[0-9]$/.test(k)) {
        const p = PINCELES.find((x) => x.tecla === k);
        const tip = estructuraSel(s)?.tipologia ?? "";
        if (p && pincelDisponible(p.id, tip)) s.setPincel(p.id);
        else if (p) toast(`El pincel «${p.etiqueta}» es solo para la estructura libre.`);
        return;
      }
      switch (k) {
        case "Backspace":
          // En Mac la tecla «delete» es ⌫: segunda pulsación para no borrar sin querer.
          e.preventDefault();
          if (s.sel.celdas.length) {
            limpiarCeldas();
            return;
          }
          return borrarConConfirmacion();
        case "Delete":
          // Con celdas elegidas nunca borra la estructura: vuelve las celdas a lo generado.
          if (s.sel.celdas.length) {
            limpiarCeldas();
            return;
          }
          return borrarConConfirmacion();
      }
      switch (k.toLowerCase()) {
        case "v": return s.setHerramienta("seleccionar");
        case "b": return s.soloLectura ? undefined : s.setHerramienta("pincel");
        case "r": return escenaRef.current?.girarColocacion();
        case "z": return escenaRef.current?.encuadrar();
        case "a": return setAlzadoGrande((x) => !x);
        case "o": if (!s.soloLectura) aberturaSeleccion(); return;
        case "l":
        case "h":
          // preventDefault: si no, la letra cae en el campo que se abre con foco
          e.preventDefault();
          if (!s.soloLectura) setMedida(k.toLowerCase() === "l" ? "largo" : "altura");
          return;
        case "1": setVista("planta"); return escenaRef.current?.vista("planta");
        case "2": setVista("frente"); return escenaRef.current?.vista("frente");
        case "3": setVista("iso"); return escenaRef.current?.vista("iso");
      }
      const p = TECLAS_PRESET.get(k.toLowerCase()) ?? TECLAS_PRESET.get(k);
      if (p && !s.soloLectura) s.setColocando(s.colocando === p.id ? null : p.id);
    };
    // Ctrl+K: en el editor abre la paleta del modelador (no el buscador general), aunque el foco esté en un campo
    const paletaK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPaleta((x) => !x);
      }
    };
    window.addEventListener("keydown", paletaK, { capture: true });
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", paletaK, { capture: true });
      window.removeEventListener("keydown", tecla);
    };
  }, [medida, setMedida, cerrarMedida]);

  if (!listo) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Armando el modelo…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <BarraSuperior soloLectura={soloLectura} onDialogo={setDlg} escenaRef={escenaRef} />
      <div className="flex items-center gap-2 border-b border-[var(--tb-aviso-borde)] bg-[var(--tb-aviso-bg)] px-3 py-1 text-[11px] text-[var(--tb-aviso-text)]">
        <TriangleAlert className="size-3.5" />
        <b className="font-mono tracking-wide">{PREDIMENSIONADO}</b>
        <span className="truncate">· reglas provisorias sin firma · no reemplaza la memoria de cálculo</span>
        {(catalogo.fuente === "fixture" || errorCatalogo) && (
          <span className="ml-auto shrink-0 rounded bg-[var(--tb-aviso-borde)] px-1.5 font-medium" title={errorCatalogo ?? undefined}>
            Catálogo de prueba: códigos y pesos NO son los de Andamios OS
          </span>
        )}
        {soloLectura && <span className="ml-auto shrink-0 rounded bg-muted px-1.5 font-medium text-muted-foreground">Solo lectura</span>}
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `${plegadas.izq ? "0px" : "260px"} minmax(0,1fr) ${plegadas.der ? "0px" : "340px"}` }}
      >
        {/* izquierda */}
        <aside className={cn("min-h-0 space-y-3 overflow-y-auto border-r border-border p-2", plegadas.izq && "hidden")}>
          <Bloque titulo="Plantillas">
            <Galeria />
          </Bloque>
          <Bloque titulo="Estructuras">
            <Arbol />
          </Bloque>
          <Bloque titulo="Volúmenes de referencia">
            <Volumenes />
          </Bloque>
        </aside>

        {/* centro */}
        <main className="flex min-h-0 min-w-0 flex-col">
          <BarraHerramientas
            vista={vista}
            onVista={(v) => {
              setVista(v);
              escenaRef.current?.vista(v);
            }}
            onEncuadrar={() => escenaRef.current?.encuadrar()}
            verVolumenes={verVolumenes}
            onVerVolumenes={() => setVerVolumenes((x) => !x)}
            onAtajos={() => setDlg("atajos")}
            plegadas={plegadas}
            onPlegar={plegar}
          />
          <div className="relative min-h-0 flex-1">
            <Lienzo escenaRef={escenaRef} verVolumenes={verVolumenes} className="absolute inset-0" />
            <Leyenda />
            {medida && <MedidaRapida key={medida + medidaN} que={medida} onCerrar={cerrarMedida} />}
          </div>
          <div className={cn("flex min-h-0 flex-col border-t border-border", alzadoGrande ? "h-[55%]" : esFachada ? "h-[45%]" : "h-[30%]")}>
            <div className="flex items-center gap-1 px-2 pt-1">
              <Tabs value={abajo} onValueChange={(v) => setAbajo(v as "alzado" | "planta")}>
                <TabsList className="h-7">
                  <TabsTrigger value="alzado" className="px-2 text-xs">Alzado</TabsTrigger>
                  <TabsTrigger value="planta" className="px-2 text-xs">Planta</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setAlzadoGrande((x) => !x)} title="Agrandar (A)">
                {alzadoGrande ? "Achicar" : "Agrandar"}
              </Button>
            </div>
            {abajo === "alzado" ? <Alzado className="min-h-0 flex-1" grande={alzadoGrande} /> : <Planta className="min-h-0 flex-1" />}
          </div>
          <Pie />
        </main>

        {/* derecha */}
        <aside className={cn("flex min-h-0 flex-col border-l border-border", plegadas.der && "hidden")}>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="m-2 mb-0 grid grid-cols-3">
              <TabsTrigger value="props" className="text-xs">Propiedades</TabsTrigger>
              <TabsTrigger value="lista" className="text-xs">Lista</TabsTrigger>
              <TabsTrigger value="avisos" className="text-xs">
                Avisos <ContadorAvisos />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="props" className="min-h-0 flex-1 overflow-y-auto">
              <Propiedades />
            </TabsContent>
            <TabsContent value="lista" className="min-h-0 flex-1">
              <ListaPiezas />
            </TabsContent>
            <TabsContent value="avisos" className="min-h-0 flex-1">
              <Avisos />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <GenerarComputo abierto={dlg === "computo"} onCambiar={(v) => setDlg(v ? "computo" : null)} />
      <GuardarPlantilla abierto={dlg === "plantilla"} onCambiar={(v) => setDlg(v ? "plantilla" : null)} />
      <Atajos abierto={dlg === "atajos"} onCambiar={(v) => setDlg(v ? "atajos" : null)} />
      <PaletaComandos abierta={paleta} onCambiar={setPaleta} onMedida={setMedida} onDialogo={setDlg} />
      <Conflicto />
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function ContadorAvisos() {
  const errores = useEditor((s) => s.res.avisos.filter((a) => a.nivel === "error").length + s.avisosPantalla.filter((a) => a.nivel === "error").length);
  const avisos = useEditor((s) => s.res.avisos.filter((a) => a.nivel === "aviso").length + s.avisosPantalla.filter((a) => a.nivel === "aviso").length);
  return (
    <>
      {errores > 0 && <span className="ml-1 rounded-full bg-[var(--tb-peligro-solido)] px-1.5 font-mono text-[10px] text-white" title={`${errores} ${errores === 1 ? "error" : "errores"}`}>{errores}</span>}
      {avisos > 0 && <span className="ml-1 rounded-full border border-[var(--tb-aviso-borde)] bg-[var(--tb-aviso-bg)] px-1.5 font-mono text-[10px] text-[var(--tb-aviso-text)]" title={`${avisos} ${avisos === 1 ? "aviso" : "avisos"}`}>{avisos}</span>}
    </>
  );
}

function EstadoGuardado() {
  const g = useEditor((s) => s.guardado);
  const map = {
    guardado: { Ic: Check, txt: "Guardado", cls: "text-muted-foreground" },
    pendiente: { Ic: Loader2, txt: "Cambios sin guardar", cls: "text-muted-foreground" },
    guardando: { Ic: Loader2, txt: "Guardando…", cls: "text-muted-foreground" },
    error: { Ic: CloudOff, txt: "No se pudo guardar", cls: "text-destructive" },
    conflicto: { Ic: TriangleAlert, txt: "Alguien más lo cambió", cls: "text-[var(--tb-aviso-icono)]" },
    local: { Ic: CloudOff, txt: "Demostración: no se guarda", cls: "text-muted-foreground" },
  }[g];
  return (
    <span className={cn("flex items-center gap-1 text-xs", map.cls)}>
      <map.Ic className={cn("size-3.5", g === "guardando" && "animate-spin", g === "pendiente" && "opacity-50")} />
      {map.txt}
    </span>
  );
}

function BarraSuperior({ soloLectura, onDialogo, escenaRef }: { soloLectura: boolean; onDialogo: (d: "computo" | "plantilla") => void; escenaRef: React.RefObject<Escena | null> }) {
  const nombre = useEditor((s) => s.diseno.nombre);
  const obra = useEditor((s) => s.diseno.obra);
  const nPasado = useEditor((s) => s.pasado.length);
  const nFuturo = useEditor((s) => s.futuro.length);
  const ultimoPasado = useEditor((s) => s.pasado[s.pasado.length - 1]?.nombre);
  const ultimoFuturo = useEditor((s) => s.futuro[s.futuro.length - 1]?.nombre);
  const modeloId = useEditor((s) => s.modeloId);
  const [txt, setTxt] = useState<string | null>(null);

  const imagen = async () => {
    const e = escenaRef.current;
    if (!e) return;
    const s = useEditor.getState();
    const out = e.png({
      titulo: s.diseno.nombre || "Modelo",
      subtitulo: s.diseno.obra ? `${s.diseno.obra.codigo} · ${s.diseno.obra.nombre}` : `${s.diseno.estructuras.length} estructura${s.diseno.estructuras.length === 1 ? "" : "s"}`,
      pie: s.res.resumen.texto.replace(` · ${PREDIMENSIONADO}`, ""),
    });
    const a = document.createElement("a");
    a.href = out.url;
    a.download = `${(s.diseno.nombre || "modelo").replace(/[^\p{L}\p{N}]+/gu, "-")}.png`;
    a.click();
    let portada: boolean | null = null;
    if (s.modeloId && !s.soloLectura) {
      const blob = await out.blob();
      portada = blob ? await subirImagen(s.modeloId, blob).then(() => true, () => false) : false;
    }
    toast.success("Imagen descargada", {
      description: portada === true ? "También quedó como portada del modelo." : portada === false ? "No se pudo guardar como portada del modelo." : undefined,
    });
  };

  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Link href={obra ? `/oficina-tecnica/modelador?obra=${obra.id}` : "/oficina-tecnica/modelador"} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ArrowLeft /> Modelos
      </Link>
      <Input
        value={txt ?? nombre}
        disabled={soloLectura}
        aria-label="Nombre del modelo"
        className="h-8 max-w-xs border-transparent text-sm font-medium hover:border-border"
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          const v = (txt ?? "").trim();
          setTxt(null);
          if (v && v !== nombre) {
            const s = useEditor.getState();
            s.commit({ ...s.diseno, nombre: v }, `Renombrar modelo a ${v}`);
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {obra ? (
        <Link href={`/obras/${obra.id}`} className="truncate text-xs text-muted-foreground hover:underline">
          <span className="font-mono">{obra.codigo}</span> · {obra.nombre}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">Sin obra vinculada</span>
      )}
      <EstadoGuardado />
      <div className="ml-auto flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" disabled={!nPasado || soloLectura} title={ultimoPasado ? `Deshacer: ${ultimoPasado} (Ctrl+Z)` : "Nada para deshacer"} aria-label="Deshacer" onClick={() => useEditor.getState().deshacer()}>
          <Undo2 />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!nFuturo || soloLectura} title={ultimoFuturo ? `Rehacer: ${ultimoFuturo} (Ctrl+Shift+Z)` : "Nada para rehacer"} aria-label="Rehacer" onClick={() => useEditor.getState().rehacer()}>
          <Redo2 />
        </Button>
        <Button size="sm" variant="outline" onClick={imagen}>
          <ImageDown /> Imagen
        </Button>
        <Button size="sm" variant="outline" disabled={soloLectura || !modeloId} onClick={() => onDialogo("plantilla")}>
          <BookmarkPlus /> Guardar como plantilla
        </Button>
        <Button size="sm" disabled={soloLectura || !modeloId} onClick={() => onDialogo("computo")}>
          <Calculator /> Generar cómputo
        </Button>
      </div>
    </header>
  );
}

function BarraHerramientas({ vista, onVista, onEncuadrar, verVolumenes, onVerVolumenes, onAtajos, plegadas, onPlegar }: {
  vista: ModoVista; onVista: (v: ModoVista) => void; onEncuadrar: () => void; verVolumenes: boolean; onVerVolumenes: () => void; onAtajos: () => void;
  plegadas: { izq: boolean; der: boolean }; onPlegar: (lado: "izq" | "der") => void;
}) {
  const herramienta = useEditor((s) => s.herramienta);
  const pincel = useEditor((s) => s.pincel);
  const vuelo = useEditor((s) => s.vueloMensula);
  const soloLectura = useEditor((s) => s.soloLectura);
  const est = useEditor(estructuraSel);
  const celdas = useEditor((s) => s.sel.celdas);
  const tip = est?.tipologia ?? "";
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
      <Button size="icon-xs" variant="ghost" onClick={() => onPlegar("izq")} title={plegadas.izq ? "Mostrar plantillas y estructuras" : "Ocultar plantillas y estructuras"} aria-label="Columna izquierda">
        {plegadas.izq ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
      <Button size="xs" variant={herramienta === "seleccionar" ? "secondary" : "ghost"} aria-pressed={herramienta === "seleccionar"} onClick={() => useEditor.getState().setHerramienta("seleccionar")} title="Seleccionar (V)">
        <MousePointer2 /> Seleccionar
      </Button>
      <Button size="xs" variant={herramienta === "pincel" ? "secondary" : "ghost"} aria-pressed={herramienta === "pincel"} disabled={soloLectura} onClick={() => useEditor.getState().setHerramienta("pincel")} title="Pincel por celda (B): arrastrá sobre el alzado o el 3D">
        <Paintbrush /> Pincel
      </Button>
      {herramienta === "pincel" && (
        <div className="flex flex-wrap items-center gap-0.5 border-l border-border pl-1">
          {PINCELES.filter((p) => pincelDisponible(p.id, tip)).map((p) => (
            <button
              key={p.id}
              type="button"
              title={`${p.ayuda}${p.tecla ? ` (${p.tecla})` : ""}`}
              aria-pressed={pincel === p.id}
              onClick={() => useEditor.getState().setPincel(p.id)}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted aria-pressed:bg-primary/15 aria-pressed:font-medium aria-pressed:text-foreground"
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      )}
      {herramienta === "pincel" && pincel === "mensula" && (
        <div className="flex flex-wrap items-center gap-0.5 border-l border-border pl-1" role="group" aria-label="Vuelo de la ménsula">
          <span className="text-[11px] text-muted-foreground" title="Hasta 0,45 sale la pieza ménsula. Más: horizontal del vuelo + diagonal 2,00 × vuelo que baja 2,00 al parante.">Vuelo</span>
          {VUELOS_MENSULA.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={Math.abs(vuelo - v) < 0.001}
              title={v <= CRITERIOS.mensulaPiezaMax + 0.001 ? `Ménsula de ${fmt(v)}` : `Horizontal de ${fmt(v)} + diagonal 2,00 × ${fmt(v)}`}
              onClick={() => useEditor.getState().setVueloMensula(v)}
              className="rounded px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground hover:bg-muted aria-pressed:bg-primary/15 aria-pressed:font-medium aria-pressed:text-foreground"
            >
              {fmt(v)}
            </button>
          ))}
        </div>
      )}
      {herramienta !== "pincel" && celdas.length > 0 && est && !soloLectura && (
        <div className="flex flex-wrap items-center gap-0.5 border-l border-border pl-1">
          <span className="text-[11px] text-muted-foreground">{celdas.length} celda{celdas.length === 1 ? "" : "s"}:</span>
          {GRUPOS_PINCEL.map((g) => {
            const ps = PINCELES.filter((p) => g.ids.includes(p.id) && pincelDisponible(p.id, tip));
            if (!ps.length) return null;
            return (
              <span key={g.nombre} className="flex items-center gap-0.5 border-l border-border/60 pl-1 first-of-type:border-0" title={g.nombre}>
                {ps.map((p) => (
                  <button key={p.id} type="button" title={p.ayuda} onClick={() => pintar(est.id, celdas, p.id)} className={cn("rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground", p.id === "borrar" && "font-medium text-foreground")}>
                    {p.etiqueta}
                  </button>
                ))}
              </span>
            );
          })}
        </div>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {(["planta", "frente", "iso"] as ModoVista[]).map((v, i) => (
          <Button key={v} size="xs" variant={vista === v ? "secondary" : "ghost"} onClick={() => onVista(v)} title={`Vista ${v} (${i + 1})`}>
            {v === "planta" ? "Planta" : v === "frente" ? "Frente" : "3D"}
          </Button>
        ))}
        <Button size="icon-xs" variant="ghost" onClick={onEncuadrar} title="Encuadrar (Z o doble clic)" aria-label="Encuadrar">
          <Focus />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={onVerVolumenes} title={verVolumenes ? "Ocultar volúmenes" : "Mostrar volúmenes"} aria-label="Volúmenes">
          {verVolumenes ? <Eye /> : <EyeOff />}
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={onAtajos} title="Atajos (?) · paleta Ctrl+K" aria-label="Atajos">
          <Keyboard />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={() => onPlegar("der")} title={plegadas.der ? "Mostrar propiedades" : "Ocultar propiedades"} aria-label="Columna derecha">
          {plegadas.der ? <PanelRightOpen /> : <PanelRightClose />}
        </Button>
      </div>
    </div>
  );
}

function Leyenda() {
  const pal = useMemo(() => (typeof document !== "undefined" ? leerPaleta() : null), []);
  if (!pal) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[70%] flex-wrap gap-x-2 gap-y-0.5 rounded-md bg-background/70 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
      {LEYENDA.map(([k, t]) => (
        <span key={k} className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ background: pal.fam[k] }} />
          {t}
        </span>
      ))}
    </div>
  );
}

function Pie() {
  const r = useEditor((s) => s.res.resumen);
  const ms = useEditor((s) => s.res.ms);
  return (
    <footer className="flex items-center gap-3 border-t border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">
      <span className="truncate">{r.texto}</span>
      <span className="ml-auto shrink-0">{fmt(ms, 1)} ms</span>
    </footer>
  );
}

function Atajos({ abierto, onCambiar }: { abierto: boolean; onCambiar: (v: boolean) => void }) {
  const filas: [string, string][] = [
    ["Ctrl+K", "Paleta de comandos («torre 2,50×1,50 h 12», «pórtico 10», «altura 21»)"],
    ["Ctrl+Z / Ctrl+Shift+Z", "Deshacer / rehacer (con nombre)"],
    ["Ctrl+S", "Guardar ya (también con el foco en un campo)"],
    ["Ctrl+D", "Duplicar la estructura elegida, alineada al lado"],
    ["V · B", "Seleccionar · pincel por celda"],
    ["0–9 (con pincel)", "Elegir el pincel (con el pincel activo los números no cambian la vista)"],
    ...[...TECLAS_PRESET.entries()].map(([k, p]) => [k.toUpperCase(), `Ubicar ${p.nombre.toLowerCase()}`] as [string, string]),
    ["L · H", "Largo · altura de la estructura elegida: tipeá y Enter (kg en vivo)"],
    ["O", "Abertura en las celdas elegidas"],
    ["R", "Girar lo que estás ubicando"],
    ["Alt (al ubicar)", "Soltar sin unir"],
    ["1 · 2 · 3", "Vista planta · frente · 3D (sin pincel)"],
    ["Z · doble clic", "Encuadrar"],
    ["A", "Agrandar el alzado"],
    ["Shift+clic · arrastrar", "Sumar celdas · elegir un rectángulo en el alzado"],
    ["N1… · V1…", "En el alzado: elegir un nivel o un vano entero"],
    ["Supr (con celdas)", "Volver las celdas a lo generado"],
    ["⌫ ⌫ · Supr Supr", "Borrar la estructura elegida (dos pulsaciones)"],
    ["Esc", "Cancelar / soltar la selección"],
  ];
  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos del modelador</DialogTitle>
          <DialogDescription>Todo cálculo es {PREDIMENSIONADO}.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {filas.map(([k, d]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded border border-border bg-muted px-1.5 font-mono text-xs">{k}</kbd></dt>
              <dd className="text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Simplificaciones del motor</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {SIMPLIFICACIONES.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      </DialogContent>
    </Dialog>
  );
}

function Conflicto() {
  const g = useEditor((s) => s.guardado);
  return (
    <Dialog open={g === "conflicto"} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Alguien más cambió este modelo</DialogTitle>
          <DialogDescription>
            Mientras lo editabas, se guardó otra versión. Podés recargar la de la otra persona (perdés tus cambios sin guardar) o sobrescribirla con la tuya.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.location.reload()}>Recargar</Button>
          <Button onClick={() => void guardarAhora(true)}>Sobrescribir con lo mío</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
