"use client";

// Formulario GENÉRICO de parámetros: se arma con los `campos` que declara cada tipología, así que
// una tipología nueva registrada en el núcleo aparece con su panel sin tocar la pantalla.

import { useState } from "react";
import type { Campo, Catalogo, Estructura, EstructuraResuelta } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CampoNumero, EditorPoligono } from "../alzado/planta";
import { fmt } from "../util/formato";
import { Plus, X } from "lucide-react";

export function leerRuta(obj: unknown, ruta: string): unknown {
  let o: unknown = obj;
  for (const k of ruta.split(".")) {
    if (o == null || typeof o !== "object") return undefined;
    o = (o as Record<string, unknown>)[k];
  }
  return o;
}

export function visible(c: Campo, est: Estructura): boolean {
  if (!c.visibleSi) return true;
  const v = leerRuta(est, c.visibleSi.ruta.startsWith("params.") ? c.visibleSi.ruta : `params.${c.visibleSi.ruta}`);
  if ("igual" in c.visibleSi) return v === c.visibleSi.igual;
  if ("distinto" in c.visibleSi) return v !== c.visibleSi.distinto;
  return !!v;
}

export function Chips<T extends string | number>({
  opciones, valor, onElegir, deshabilitado, className,
}: {
  opciones: { valor: T; etiqueta: string; titulo?: string }[];
  valor: T | T[] | undefined;
  onElegir: (v: T) => void;
  deshabilitado?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)} role="group">
      {opciones.map((o) => {
        const on = Array.isArray(valor) ? valor.includes(o.valor) : valor === o.valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            title={o.titulo}
            disabled={deshabilitado}
            aria-pressed={on}
            onClick={() => !on && onElegir(o.valor)}
            className={cn(
              "rounded-md border border-border px-2 py-0.5 text-xs transition-colors disabled:opacity-50",
              on ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

const listaCatalogo = (cat: Catalogo, c: Campo["catalogo"]): number[] => {
  const m = cat.medidas.multi;
  switch (c) {
    case "vanos": return m.vanos;
    case "profundidades": return m.profundidades;
    case "mensulas": return m.mensulas;
    case "vigasCelosia": return m.vigasCelosia;
    default: return [];
  }
};

interface PropsCampo {
  campo: Campo;
  est: Estructura;
  r: EstructuraResuelta | null;
  catalogo: Catalogo;
  deshabilitado: boolean;
  onCambiar: (ruta: string, valor: unknown, nombre: string) => void;
}

export function CampoParam({ campo, est, r, catalogo, deshabilitado, onCambiar }: PropsCampo) {
  const ruta = campo.ruta.startsWith("params.") || campo.ruta.startsWith("apoyo") ? campo.ruta : `params.${campo.ruta}`;
  const valor = leerRuta(est, ruta);
  const set = (v: unknown, txt?: string) => onCambiar(ruta, v, txt ?? `${campo.etiqueta} → ${typeof v === "number" ? fmt(v) : String(v)}`);
  const etiqueta = (
    <span className="text-xs text-muted-foreground" title={campo.ayuda}>
      {campo.etiqueta}
    </span>
  );
  switch (campo.tipo) {
    case "medida":
    case "entero": {
      const cat = campo.catalogo ? listaCatalogo(catalogo, campo.catalogo) : [];
      return (
        <Fila etiqueta={etiqueta} ayuda={campo.ayuda}>
          <CampoNumero
            valor={typeof valor === "number" ? valor : null}
            min={campo.min ?? (campo.tipo === "entero" ? 0 : 0.01)}
            unidad={campo.unidad}
            deshabilitado={deshabilitado}
            ariaLabel={campo.etiqueta}
            onCambiar={(v) => set(campo.tipo === "entero" ? Math.round(v) : campo.max !== undefined ? Math.min(campo.max, v) : v)}
          />
          {cat.length > 0 && (
            <Chips
              className="mt-1"
              opciones={cat.map((x) => ({ valor: x, etiqueta: fmt(x) }))}
              valor={typeof valor === "number" ? valor : undefined}
              onElegir={(v) => set(v)}
              deshabilitado={deshabilitado}
            />
          )}
        </Fila>
      );
    }
    case "opcion":
      return (
        <Fila etiqueta={etiqueta} ayuda={campo.ayuda}>
          <Chips
            opciones={(campo.opciones ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
            valor={valor as string | number}
            onElegir={(v) => set(v, `${campo.etiqueta}: ${campo.opciones?.find((o) => o.valor === v)?.etiqueta ?? v}`)}
            deshabilitado={deshabilitado}
          />
        </Fila>
      );
    case "bool":
      return (
        <label className="flex items-center justify-between gap-2 py-1" title={campo.ayuda}>
          {etiqueta}
          <Switch size="sm" checked={!!valor} disabled={deshabilitado} onCheckedChange={(v) => set(v, `${campo.etiqueta}: ${v ? "sí" : "no"}`)} />
        </label>
      );
    case "frentes":
      return <CampoFrentes est={est} r={r} deshabilitado={deshabilitado} onCambiar={onCambiar} />;
    case "poligono":
      return (
        <div className="space-y-1 py-1">
          {etiqueta}
          <EditorPoligono valor={valor} deshabilitado={deshabilitado} onCambiar={(v, n) => onCambiar(ruta, v, `${campo.etiqueta}: ${n.toLowerCase()}`)} />
        </div>
      );
    case "lista_medidas":
      return (
        <Fila etiqueta={etiqueta} ayuda={campo.ayuda}>
          <CampoTexto
            valor={Array.isArray(valor) ? (valor as number[]).map((x) => fmt(x)).join(" ; ") : ""}
            deshabilitado={deshabilitado}
            placeholder="2,50 ; 2,50 ; 1,09"
            onCambiar={(t) => {
              const xs = t.split(/[;\s]+/).map((s) => Number(s.replace(",", "."))).filter((x) => Number.isFinite(x) && x > 0);
              set(xs, `${campo.etiqueta}: ${xs.map((x) => fmt(x)).join(" + ")}`);
            }}
          />
        </Fila>
      );
    default: {
      // texto: escalares como texto, estructuras como JSON (campos avanzados)
      const esObj = valor !== null && typeof valor === "object";
      return (
        <Fila etiqueta={etiqueta} ayuda={campo.ayuda}>
          <CampoTexto
            valor={esObj ? JSON.stringify(valor) : valor == null ? "" : String(valor)}
            deshabilitado={deshabilitado}
            mono={esObj}
            onCambiar={(t) => {
              let v: unknown = t;
              if (/^[[{]/.test(t.trim()) || t.trim() === "auto" || /^\d+$/.test(t.trim())) {
                try {
                  v = t.trim() === "auto" ? "auto" : JSON.parse(t);
                } catch {
                  return false;
                }
              }
              set(v, `${campo.etiqueta}`);
              return true;
            }}
          />
        </Fila>
      );
    }
  }
}

function Fila({ etiqueta, ayuda, children }: { etiqueta: React.ReactNode; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1" title={ayuda}>
      <div className="pt-1.5">{etiqueta}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CampoTexto({ valor, onCambiar, deshabilitado, placeholder, mono }: { valor: string; onCambiar: (t: string) => boolean | void; deshabilitado?: boolean; placeholder?: string; mono?: boolean }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const aplicar = () => {
    if (texto === null || texto === valor) {
      setTexto(null);
      return;
    }
    const ok = onCambiar(texto);
    if (ok === false) setError(true);
    else {
      setError(false);
      setTexto(null);
    }
  };
  return (
    <Input
      value={texto ?? valor}
      placeholder={placeholder}
      disabled={deshabilitado}
      aria-invalid={error || undefined}
      className={cn("h-7 px-2 text-xs", mono && "font-mono")}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === "Enter") aplicar();
        if (e.key === "Escape") setTexto(null);
      }}
    />
  );
}

interface FrenteParam {
  largo: number;
  angulo?: number;
  altura?: number;
  vanos?: number[];
}
interface FrenteInfo {
  texto?: string;
  relleno?: { desvio: number; elegido?: boolean; alternativas: { id: string; etiqueta: string; vanos: { medida: number }[]; texto: string; desvio: number }[] };
}

const LETRAS = "ABCDEFGHIJKLMNOP";

function CampoFrentes({ est, r, deshabilitado, onCambiar }: { est: Estructura; r: EstructuraResuelta | null; deshabilitado: boolean; onCambiar: PropsCampo["onCambiar"] }) {
  const frentes = (est.params.frentes as FrenteParam[] | undefined) ?? [];
  const info = (r?.info?.frentes as FrenteInfo[] | undefined) ?? [];
  const setFrentes = (fs: FrenteParam[], nombre: string) => onCambiar("params.frentes", fs, nombre);
  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Frentes</span>
        <Button
          size="xs"
          variant="outline"
          disabled={deshabilitado}
          onClick={() => setFrentes([...frentes, { largo: 5, angulo: 90 }], `Agregar Frente ${LETRAS[frentes.length]}`)}
        >
          <Plus /> Frente
        </Button>
      </div>
      {frentes.map((fr, f) => {
        const F = info[f];
        const d = F?.relleno?.desvio ?? 0;
        return (
          <div key={f} className="space-y-1 rounded-md border border-border p-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-4 font-mono text-xs font-medium">{LETRAS[f]}</span>
              <CampoNumero
                className="w-20"
                valor={fr.largo}
                min={0.5}
                unidad="m"
                deshabilitado={deshabilitado}
                ariaLabel={`Largo del frente ${LETRAS[f]}`}
                onCambiar={(v) => onCambiar(`params.frentes.${f}.largo`, v, `Largo Frente ${LETRAS[f]} ${fmt(fr.largo)} → ${fmt(v)} m`)}
              />
              {f > 0 ? (
                <>
                  <Chips
                    opciones={[{ valor: 90, etiqueta: "90°" }, { valor: -90, etiqueta: "−90°" }, { valor: 0, etiqueta: "0°" }]}
                    valor={fr.angulo ?? 90}
                    onElegir={(v) => onCambiar(`params.frentes.${f}.angulo`, v, `Ángulo Frente ${LETRAS[f]} → ${v}°`)}
                    deshabilitado={deshabilitado}
                  />
                  <CampoNumero
                    className="w-16"
                    valor={fr.angulo ?? 90}
                    min={-180}
                    unidad="°"
                    deshabilitado={deshabilitado}
                    ariaLabel={`Ángulo del frente ${LETRAS[f]}`}
                    onCambiar={(v) => onCambiar(`params.frentes.${f}.angulo`, Math.max(-179, Math.min(179, v)), `Ángulo Frente ${LETRAS[f]} → ${fmt(v, 0)}°`)}
                  />
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">arranque</span>
              )}
              <span className="flex-1" />
              {frentes.length > 1 && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Quitar frente ${LETRAS[f]}`}
                  disabled={deshabilitado}
                  onClick={() => setFrentes(frentes.filter((_, i) => i !== f), `Quitar Frente ${LETRAS[f]}`)}
                >
                  <X />
                </Button>
              )}
            </div>
            {F?.texto && (
              <div className="font-mono text-[11px] text-muted-foreground">
                {F.texto}{" "}
                {Math.abs(d) < 0.005 ? <span className="text-emerald-600">exacto</span> : <span className={Math.abs(d) > 0.1 ? "text-amber-600" : ""}>{d > 0 ? `sobran ${fmt(d)}` : `faltan ${fmt(-d)}`}</span>}
                {F.relleno?.elegido && (
                  <button type="button" className="ml-1 underline" disabled={deshabilitado} onClick={() => onCambiar(`params.frentes.${f}.vanos`, undefined, `Frente ${LETRAS[f]}: relleno automático`)}>
                    auto
                  </button>
                )}
              </div>
            )}
            {!!F?.relleno?.alternativas?.length && (
              <div className="flex flex-wrap gap-1">
                {F.relleno.alternativas.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={deshabilitado}
                    title={a.texto}
                    className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      a.id === "centrado"
                        ? onCambiar("params.ajuste", est.params.ajuste === "centrado" ? "final" : "centrado", `Frente ${LETRAS[f]}: ajuste centrado`)
                        : onCambiar(`params.frentes.${f}.vanos`, a.vanos.map((x) => x.medida), `Frente ${LETRAS[f]}: ${a.etiqueta.toLowerCase()}`)
                    }
                  >
                    {a.etiqueta}: <b className="font-mono font-medium">{a.texto}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
