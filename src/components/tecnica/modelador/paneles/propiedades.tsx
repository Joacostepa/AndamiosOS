"use client";

// Panel de propiedades de la estructura seleccionada: nombre, sistema, toggle "Medida libre",
// apoyo (suelo, colgado o sobre otra estructura), los parámetros de la tipología (formulario
// genérico desde `campos`), "Convertir a estructura libre" y las herramientas de la libre.

import { useMemo, useState } from "react";
import { setParam, tipologia, type Apoyo, type Campo } from "@/lib/tecnica/modelo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useEditor, estructuraSel, resueltaSel } from "../estado/store";
import { aplicar, borrarEstructura, convertir } from "../estado/acciones";
import { CampoNumero } from "../alzado/planta";
import { CampoParam, Chips, visible } from "./campos";
import { PanelLibre } from "./libre";
import { fmt } from "../util/formato";
import { Grid3x3, Trash2 } from "lucide-react";

const ORDEN_GRUPOS: NonNullable<Campo["grupo"]>[] = ["Medidas", "Protección", "Apoyo", "Accesos", "Avanzado"];

const NOMBRE_APOYO: Record<Apoyo["tipo"], string> = { suelo: "En el suelo", colgado: "Colgado", sobre_estructura: "Sobre otra estructura" };

export function Propiedades() {
  const est = useEditor(estructuraSel);
  const r = useEditor(resueltaSel);
  const catalogo = useEditor((s) => s.catalogo);
  const soloLectura = useEditor((s) => s.soloLectura);
  const diseno = useEditor((s) => s.diseno);
  const [confirmar, setConfirmar] = useState(false);
  const tip = est ? tipologia(est.tipologia) : undefined;
  const grupos = useMemo(() => {
    // la estructura libre solo usa sus medidas al crearse: después se edita el esqueleto
    if (!tip || !est || est.tipologia === "libre") return [];
    const campos = tip.campos.filter((c) => visible(c, est));
    return ORDEN_GRUPOS.map((g) => ({ g, campos: campos.filter((c) => (c.grupo ?? "Medidas") === g) })).filter((x) => x.campos.length);
  }, [tip, est]);

  if (!est || !tip) {
    return <p className="p-3 text-xs text-muted-foreground">Elegí una estructura en la lista o en el 3D. Para empezar, tocá una plantilla de la galería.</p>;
  }

  const cambiar = (ruta: string, valor: unknown, nombre: string) => {
    const s = useEditor.getState();
    s.commit(setParam(s.diseno, est.id, ruta, valor), nombre);
  };
  const apoyo = est.apoyo ?? { tipo: "suelo" };
  const volumenes = diseno.contexto.volumenes;
  const otras = diseno.estructuras.filter((e) => e.id !== est.id);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <Input
          key={est.id + est.nombre}
          defaultValue={est.nombre}
          aria-label="Nombre de la estructura"
          disabled={soloLectura}
          className="h-8 text-sm font-medium"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== est.nombre) cambiar("nombre", v, `Renombrar a ${v}`);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <Badge variant="outline" className="shrink-0">{tip.nombre}</Badge>
        <Button size="icon-sm" variant="ghost" aria-label="Borrar estructura" title="Borrar estructura (Supr)" disabled={soloLectura} onClick={() => borrarEstructura(est.id)}>
          <Trash2 />
        </Button>
      </div>
      {r && (
        <p className="font-mono text-[11px] text-muted-foreground">
          {fmt(r.ml, 1)} ml · {fmt(r.m2, 0)} m² · altura {fmt(r.alturaReal, 2)} m
        </p>
      )}

      <section className="space-y-1.5">
        {tip.sistemas.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Sistema</span>
            <Chips
              opciones={tip.sistemas.map((s) => ({ valor: s, etiqueta: s === "multi" ? "Multidireccional" : "Bastidor" }))}
              valor={est.sistema}
              deshabilitado={soloLectura}
              onElegir={(s) => aplicar({ tipo: "sistema", estructuraId: est.id, sistema: s }, `Sistema → ${s === "bastidor" ? "bastidor" : "multidireccional"}`)}
            />
          </div>
        )}
        {est.sistema === "bastidor" ? (
          <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
            Supuesto sin confirmar: bastidor 1,30 × 1,80. Cómputo por kit (toggle en la lista).
          </p>
        ) : (
          <label className="flex items-center justify-between gap-2" title="Medida libre: cualquier largo, alto o ancho. Lo que no es de catálogo se arma con caño y grampa y se muestra como ajuste.">
            <span className="text-xs">
              Medida libre <span className="text-muted-foreground">{est.medida === "libre" ? "· catálogo + caño y grampa" : "· solo catálogo"}</span>
            </span>
            <Switch
              size="sm"
              checked={est.medida === "libre"}
              disabled={soloLectura}
              onCheckedChange={(v) => aplicar({ tipo: "medida", estructuraId: est.id, modo: v ? "libre" : "catalogo" }, v ? "Medida libre" : "Solo medidas de catálogo")}
            />
          </label>
        )}
      </section>

      {tip.apoyos.length > 1 && (
        <section className="space-y-1.5 rounded-lg border border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Apoyo</span>
            <Chips
              opciones={tip.apoyos.map((a) => ({ valor: a, etiqueta: NOMBRE_APOYO[a] }))}
              valor={apoyo.tipo}
              deshabilitado={soloLectura}
              onElegir={(t) => {
                const nuevo: Apoyo =
                  t === "colgado"
                    ? { tipo: "colgado", modo: "suspendido", soporte: { volumenId: volumenes[0]?.id, cota: volumenes[0]?.yBase ?? 6 }, sujecion: "cano_grampa" }
                    : t === "sobre_estructura"
                      ? { tipo: "sobre_estructura", estructuraId: otras[0]?.id ?? "" }
                      : { tipo: "suelo" };
                cambiar("apoyo", nuevo, `Apoyo: ${NOMBRE_APOYO[t].toLowerCase()}`);
              }}
            />
          </div>
          {apoyo.tipo === "colgado" && (
            <div className="space-y-1.5">
              <Chips
                opciones={[{ valor: "suspendido", etiqueta: "Suspendido" }, { valor: "volado", etiqueta: "Volado" }]}
                valor={apoyo.modo}
                deshabilitado={soloLectura}
                onElegir={(m) => cambiar("apoyo", { ...apoyo, modo: m }, `Colgado ${m}`)}
              />
              <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">Cuelga de</span>
                <select
                  className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                  value={apoyo.soporte.volumenId ?? (apoyo.soporte.estructuraId ? `E:${apoyo.soporte.estructuraId}` : "")}
                  disabled={soloLectura}
                  onChange={(e) => {
                    const v = e.target.value;
                    const soporte = v.startsWith("E:") ? { estructuraId: v.slice(2), cota: apoyo.soporte.cota } : { volumenId: v || undefined, cota: volumenes.find((x) => x.id === v)?.yBase ?? apoyo.soporte.cota };
                    cambiar("apoyo", { ...apoyo, soporte }, "Soporte del colgado");
                  }}
                >
                  <option value="">Sin elegir (cota a mano)</option>
                  {volumenes.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre || v.id} (volumen)</option>
                  ))}
                  {otras.map((e) => (
                    <option key={e.id} value={`E:${e.id}`}>{e.nombre} (estructura)</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">Cota del soporte</span>
                <CampoNumero valor={apoyo.soporte.cota} min={0} unidad="m" deshabilitado={soloLectura} onCambiar={(c) => cambiar("apoyo", { ...apoyo, soporte: { ...apoyo.soporte, cota: c } }, `Cota del soporte ${fmt(c)} m`)} />
                <span className="text-xs text-muted-foreground">Sujeción</span>
                <Chips
                  opciones={[
                    { valor: "cano_grampa", etiqueta: "Caño y grampa" }, { valor: "viga_celosia", etiqueta: "Viga celosía" },
                    { valor: "mensula", etiqueta: "Ménsula" }, { valor: "anclaje_quimico", etiqueta: "Anclaje químico" },
                  ]}
                  valor={apoyo.sujecion}
                  deshabilitado={soloLectura}
                  onElegir={(v) => cambiar("apoyo", { ...apoyo, sujecion: v }, "Sujeción del colgado")}
                />
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">Sin bases en el suelo: verificá el soporte (PREDIMENSIONADO).</p>
            </div>
          )}
          {apoyo.tipo === "sobre_estructura" && (
            <select
              className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
              value={apoyo.estructuraId}
              disabled={soloLectura}
              onChange={(e) => cambiar("apoyo", { tipo: "sobre_estructura", estructuraId: e.target.value }, "Apoyada sobre otra estructura")}
            >
              {otras.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
        </section>
      )}

      {grupos.map(({ g, campos }) =>
        g === "Avanzado" ? (
          <details key={g} className="rounded-lg border border-border px-2 py-1">
            <summary className="cursor-pointer py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</summary>
            {campos.map((c) => <CampoParam key={c.ruta} campo={c} est={est} r={r} catalogo={catalogo} deshabilitado={soloLectura} onCambiar={cambiar} />)}
          </details>
        ) : (
          <section key={g}>
            <h4 className="pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
            {campos.map((c) => <CampoParam key={c.ruta} campo={c} est={est} r={r} catalogo={catalogo} deshabilitado={soloLectura} onCambiar={cambiar} />)}
          </section>
        ),
      )}

      {est.tipologia === "libre" && r ? (
        <>
          {est.convertidaDe && (
            <p className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              Convertida desde {tipologia(est.convertidaDe.tipologia)?.nombre ?? est.convertidaDe.tipologia}: ya no se regenera por parámetros.
            </p>
          )}
          <PanelLibre r={r} soloLectura={soloLectura} />
        </>
      ) : (
        <Button size="sm" variant="outline" className="w-full" disabled={soloLectura} onClick={() => setConfirmar(true)}>
          <Grid3x3 /> Convertir a estructura libre
        </Button>
      )}

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir a estructura libre</DialogTitle>
            <DialogDescription>
              Vas a poder editar {est.nombre} a mano (vanos, niveles, piezas por celda), pero ya <b>no se regenera</b> cuando cambies los parámetros. Se puede deshacer. ¿Seguimos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                setConfirmar(false);
                convertir(est.id);
              }}
            >
              Convertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
