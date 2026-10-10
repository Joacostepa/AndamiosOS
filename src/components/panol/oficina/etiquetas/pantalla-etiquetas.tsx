"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { useCatalogoPanol, useInvalidarPanol, usePersonasPanol } from "@/hooks/use-panol";
import { codigoDe, marcarImpresos, useCodigosPanol } from "@/hooks/use-panol-config";
import {
  LARGO_NOMBRE, TIPOS_ETIQUETA, candidatos, esNueva, grilla, ladoQr, matrizQr, paginar, pathQr, recortar,
  resumenHojas, urlCodigo, type Candidato, type Correccion, type Tamano, type TipoEtiqueta,
} from "@/lib/panol/etiquetas";
import { cn } from "@/lib/utils";
import { VistaPrevia, type EtiquetaVista } from "./vista-previa";

// Etiquetas QR (docs/modulo-panol.md §4). Cuatro preguntas, en el orden en que se piensan:
// qué (estantes, cajones, herramientas, credenciales), cuáles (las nuevas, todas o a mano),
// de qué tamaño, y cómo entra en la hoja. A la derecha, la hoja tal como va a salir.
//
// LOS CÓDIGOS QUE FALTAN SE CREAN AL DESCARGAR, no al mirar: elegir "Todas" para ver cómo
// queda no puede llenar pan_codigos de códigos que nadie imprimió.

export type Inicial = { tipo: TipoEtiqueta; alcance: Alcance; seleccion: string[] };
type Alcance = "nuevas" | "todas" | "elegir";

// Armar un QR es barato pero no gratis, y la vista previa se vuelve a dibujar con cada
// tecla: se guarda por texto y corrección.
const cacheQr = new Map<string, { path: string; lado: number }>();
function qrDe(texto: string, correccion: Correccion) {
  const k = `${correccion}|${texto}`;
  let qr = cacheQr.get(k);
  if (!qr) {
    const m = matrizQr(texto, correccion);
    qr = { path: pathQr(m), lado: ladoQr(m) };
    cacheQr.set(k, qr);
  }
  return qr;
}

/** El origen del link del QR: el dominio público si está configurado, si no el de esta pestaña. */
function origenApp(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env;
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function PantallaEtiquetas({ inicial }: { inicial: Inicial }) {
  const catalogo = useCatalogoPanol();
  const personas = usePersonasPanol();
  const codigos = useCodigosPanol();
  const invalidar = useInvalidarPanol();
  const puedeCrear = usePuedeEditar("panol");

  const [tipo, setTipo] = useState<TipoEtiqueta>(inicial.tipo);
  const [alcance, setAlcance] = useState<Alcance>(inicial.alcance);
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(inicial.seleccion));
  const [tamano, setTamano] = useState<Tamano>(TIPOS_ETIQUETA[inicial.tipo].tamano);
  const [correccion, setCorreccion] = useState<Correccion>(TIPOS_ETIQUETA[inicial.tipo].correccion);
  const [margen, setMargen] = useState(10);
  const [separacion, setSeparacion] = useState(3);
  const [saltear, setSaltear] = useState(0);
  const [guias, setGuias] = useState(true);
  const [hoja, setHoja] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [generando, setGenerando] = useState(false);

  const cargando = catalogo.isLoading || personas.isLoading || codigos.isLoading;
  const error = catalogo.error ?? personas.error ?? codigos.error;

  const porTipo = useMemo(() => {
    const f = {
      ubicaciones: catalogo.data?.ubicaciones ?? [],
      articulos: catalogo.data?.articulos ?? [],
      unidades: catalogo.data?.unidades ?? [],
      personas: personas.data?.personas ?? [],
      codigos: codigos.data ?? [],
    };
    return Object.fromEntries(
      (Object.keys(TIPOS_ETIQUETA) as TipoEtiqueta[]).map((t) => [t, candidatos(t, f)]),
    ) as Record<TipoEtiqueta, Candidato[]>;
  }, [catalogo.data, personas.data, codigos.data]);

  const lista = porTipo[tipo];
  const nuevas = lista.filter(esNueva);
  const elegidasDeTipo = lista.filter((c) => elegidas.has(c.clave));
  const seleccion = alcance === "nuevas" ? nuevas : alcance === "todas" ? lista : elegidasDeTipo;
  // Quien sólo ve el pañol no puede crear códigos: se imprimen los que ya existen.
  const imprimibles = puedeCrear ? seleccion : seleccion.filter((c) => c.codigo);
  const sinCodigo = imprimibles.filter((c) => !c.codigo).length;

  const g = grilla({ tamano, margen, separacion });
  const hojas = paginar(imprimibles, g.porHoja, saltear);
  const hojaActual = Math.min(hoja, Math.max(0, hojas.length - 1));
  const origen = origenApp();

  const vista: (EtiquetaVista | null)[] = (hojas[hojaActual] ?? []).map((c) => {
    if (!c) return null;
    const qr = c.codigo && origen ? qrDe(urlCodigo(origen, c.codigo), correccion) : null;
    return { clave: c.clave, codigo: c.codigo, nombre: c.nombre, path: qr?.path ?? null, lado: qr?.lado ?? 0 };
  });

  function elegirTipo(t: TipoEtiqueta) {
    setTipo(t);
    setTamano(TIPOS_ETIQUETA[t].tamano);
    setCorreccion(TIPOS_ETIQUETA[t].correccion);
    setHoja(0);
    setBusqueda("");
  }

  function alternar(clave: string, si: boolean) {
    setElegidas((prev) => {
      const s = new Set(prev);
      if (si) s.add(clave); else s.delete(clave);
      return s;
    });
  }

  async function descargar() {
    if (!imprimibles.length || generando) return;
    setGenerando(true);
    try {
      // 1. Los que no tienen código: se crean ahora (de a pocos, para no saturar la base).
      const conCodigo: { c: Candidato; codigo: string }[] = [];
      for (let i = 0; i < imprimibles.length; i += 8) {
        const tanda = imprimibles.slice(i, i + 8);
        const hechos = await Promise.all(
          tanda.map(async (c) => ({ c, codigo: c.codigo ?? (await codigoDe(c.tipoCodigo, c.entidadId)) })),
        );
        conCodigo.push(...hechos);
      }
      // 2. El PDF.
      const etiquetas = conCodigo.map(({ c, codigo }) => ({
        codigo, nombre: recortar(c.nombre, LARGO_NOMBRE[tamano]), ...qrDe(urlCodigo(origen, codigo), correccion),
      }));
      const { generarPdf } = await import("./documento-pdf");
      const titulo = `Etiquetas ${TIPOS_ETIQUETA[tipo].titulo.toLowerCase()}`;
      const blob = await generarPdf(paginar(etiquetas, g.porHoja, saltear), { grilla: g, tamano, separacion, guias, titulo });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `panol-etiquetas-${tipo}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      // 3. Anotar que se imprimieron (si la base ya sabe hacerlo).
      const marcadas = await marcarImpresos(conCodigo.map((x) => x.codigo));
      toast.success(`${resumenHojas(etiquetas.length, g.porHoja, saltear)}: PDF descargado`, {
        description: marcadas ? "Ya no aparecen en «Sólo las nuevas»." : undefined,
      });
      if (alcance === "elegir") setElegidas(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo armar el PDF");
    } finally {
      invalidar();
      setGenerando(false);
    }
  }

  if (cargando) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]" aria-busy>
        <Skeleton className="h-96 w-full" />
        <Skeleton className="aspect-[210/297] w-full max-w-[560px]" />
      </div>
    );
  }
  if (error) {
    return (
      <Aviso tono="bloqueo" titulo="No se pudo leer lo que hay para etiquetar">
        {error instanceof Error ? error.message : String(error)}. Probá recargar la página.
      </Aviso>
    );
  }

  const filtrada = busqueda.trim()
    ? lista.filter((c) => `${c.nombre} ${c.codigo ?? ""}`.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : lista;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-5">
        <Grupo titulo="¿Qué vas a imprimir?">
          <div role="radiogroup" aria-label="¿Qué vas a imprimir?" className="grid gap-2">
            {(Object.keys(TIPOS_ETIQUETA) as TipoEtiqueta[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={t === tipo}
                onClick={() => elegirTipo(t)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  t === tipo ? "border-2 border-foreground bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{TIPOS_ETIQUETA[t].titulo}</span>
                  <span className="block text-[12px] text-muted-foreground">{TIPOS_ETIQUETA[t].ayuda}</span>
                </span>
                <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{porTipo[t].length}</span>
              </button>
            ))}
          </div>
        </Grupo>

        <Grupo titulo="¿Cuáles?">
          <div role="radiogroup" aria-label="¿Cuáles?" className="flex flex-wrap gap-2">
            <Opcion activa={alcance === "nuevas"} onClick={() => { setAlcance("nuevas"); setHoja(0); }}>
              Sólo las nuevas ({nuevas.length})
            </Opcion>
            <Opcion activa={alcance === "todas"} onClick={() => { setAlcance("todas"); setHoja(0); }}>
              Todas ({lista.length})
            </Opcion>
            <Opcion activa={alcance === "elegir"} onClick={() => { setAlcance("elegir"); setHoja(0); }}>
              Elegir ({elegidasDeTipo.length})
            </Opcion>
          </div>
          <p className="text-[12px] text-muted-foreground">Nuevas: sin código todavía, o con un código que nunca se imprimió.</p>
          {alcance === "elegir" && (
            <div className="space-y-2">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código" className="pl-8" aria-label="Buscar" />
              </div>
              <div className="flex gap-3 text-[12px]">
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setElegidas((p) => new Set([...p, ...filtrada.map((c) => c.clave)]))}>
                  Marcar {busqueda ? "las que se ven" : "todas"}
                </button>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setElegidas((p) => new Set([...p].filter((k) => !lista.some((c) => c.clave === k))))}>
                  Ninguna
                </button>
              </div>
              <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {filtrada.map((c) => (
                  <li key={c.clave}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                      <input type="checkbox" className="size-4" checked={elegidas.has(c.clave)} onChange={(e) => alternar(c.clave, e.target.checked)} />
                      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                      <span className="font-mono text-[12px] text-muted-foreground">{c.codigo ?? "nuevo"}</span>
                    </label>
                  </li>
                ))}
                {filtrada.length === 0 && <li className="px-3 py-2 text-[13px] text-muted-foreground">No hay nada con ese nombre.</li>}
              </ul>
            </div>
          )}
        </Grupo>

        <Grupo titulo="Tamaño y corrección">
          <div role="radiogroup" aria-label="Tamaño del QR" className="flex gap-2">
            <Opcion activa={tamano === 25} onClick={() => { setTamano(25); setHoja(0); }}>25 mm</Opcion>
            <Opcion activa={tamano === 50} onClick={() => { setTamano(50); setHoja(0); }}>50 mm</Opcion>
          </div>
          <p className="text-[12px] text-muted-foreground">25 mm para cajones, herramientas y credenciales. 50 mm para estantes: se lee de más lejos.</p>
          <div role="radiogroup" aria-label="Corrección de error" className="flex gap-2">
            <Opcion activa={correccion === "Q"} onClick={() => setCorreccion("Q")}>Q</Opcion>
            <Opcion activa={correccion === "H"} onClick={() => setCorreccion("H")}>H</Opcion>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {correccion === "H" ? "H: aguanta golpes y mugre. Para lo que se golpea." : "Q: alcanza para cajones, estantes y credenciales."}{" "}
            Material: poliéster o vinilo laminado; el papel no aguanta.
          </p>
        </Grupo>

        <Grupo titulo="La hoja">
          <div className="grid grid-cols-3 gap-2">
            <Numero etiqueta="Margen (mm)" valor={margen} min={0} max={30} onChange={(v) => { setMargen(v); setHoja(0); }} />
            <Numero etiqueta="Separación (mm)" valor={separacion} min={0} max={15} onChange={(v) => { setSeparacion(v); setHoja(0); }} />
            <Numero etiqueta="Empezar en la n.º" valor={saltear + 1} min={1} max={g.porHoja} onChange={(v) => { setSaltear(Math.max(0, v - 1)); setHoja(0); }} />
          </div>
          <p className="text-[12px] text-muted-foreground">
            {g.columnas} × {g.filas} = {g.porHoja} por hoja. «Empezar en» saltea las primeras posiciones para aprovechar una plancha usada.
          </p>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4" checked={guias} onChange={(e) => setGuias(e.target.checked)} /> Líneas de corte
          </label>
        </Grupo>

        {!puedeCrear && seleccion.length > imprimibles.length && (
          <Aviso tono="aviso" titulo={`${seleccion.length - imprimibles.length} todavía no tienen código`}>
            Los códigos nuevos los genera un encargado del pañol. Se imprimen sólo los que ya tienen.
          </Aviso>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={descargar} disabled={!imprimibles.length || generando} className="h-10 px-4">
            {generando ? <Loader2 className="animate-spin" /> : <Download />} Descargar PDF
          </Button>
          <span className="text-[13px] text-muted-foreground">
            {imprimibles.length ? resumenHojas(imprimibles.length, g.porHoja, saltear) : "No hay nada para imprimir"}
            {sinCodigo > 0 && ` · ${sinCodigo} con código nuevo`}
          </span>
        </div>
      </div>

      <section aria-labelledby="h-prev" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="h-prev" className="text-[14px] font-semibold">Vista previa · hoja A4</h2>
          {hojas.length > 0 && (
            <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <Button variant="ghost" size="icon-sm" aria-label="Hoja anterior" disabled={hojaActual === 0} onClick={() => setHoja(hojaActual - 1)}>
                <ChevronLeft />
              </Button>
              Hoja {hojaActual + 1} de {hojas.length}
              <Button variant="ghost" size="icon-sm" aria-label="Hoja siguiente" disabled={hojaActual >= hojas.length - 1} onClick={() => setHoja(hojaActual + 1)}>
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
        {hojas.length ? (
          <VistaPrevia etiquetas={vista} grilla={g} tamano={tamano} separacion={separacion} guias={guias} />
        ) : (
          <div className="grid aspect-[210/297] w-full max-w-[560px] place-items-center rounded-md border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {lista.length === 0
              ? `Todavía no hay ${TIPOS_ETIQUETA[tipo].titulo.toLowerCase()} cargados.`
              : alcance === "nuevas"
                ? "No hay etiquetas nuevas: todo lo de este tipo ya se imprimió."
                : "Elegí qué imprimir en la lista."}
          </div>
        )}
      </section>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[14px] font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={cn(
        "h-9 rounded-lg px-3 text-[13px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        activa ? "border-2 border-foreground bg-muted" : "border bg-card hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}

function Numero({ etiqueta, valor, min, max, onChange }: { etiqueta: string; valor: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="space-y-1 text-[12px] text-muted-foreground">
      <span className="block">{etiqueta}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="text-right font-mono"
      />
    </label>
  );
}
