"use client";

// Conteo cíclico en la tablet del depósito (docs §6.7).
//
// EL CIRCUITO: se elige o se escanea la estantería → pan_conteo_abrir → la lista de lo que
// figura ahí, SIN cantidades → se carga lo contado ítem por ítem (cada uno se guarda en el
// momento con pan_conteo_cargar, así `contado_at` es la hora real y la base puede descontar
// lo que se movió después) → "Terminar conteo" (pan_conteo_cerrar) → recién ahí se leen
// los esperados y se muestran las diferencias.
//
// SE PUEDE RETOMAR: el kiosco vuelve a "¿Quién sos?" tras un rato sin tocar nada, y una
// estantería grande lleva más que eso. Lo contado ya está en la base; acá sólo se recuerda
// qué conteo estaba abierto (sessionStorage) y, al volver, se relee.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCircle2, ClipboardList, Loader2, PackagePlus, RotateCcw, Search, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resolverCodigo, useCatalogoPanol, useInvalidarPanol, usePersonasPanol, type Catalogo } from "@/hooks/use-panol";
import { abrirConteo, cargarConteo, cerrarConteo, leerConteo, useConteosPanol, type ItemACargar } from "@/hooks/use-panol-tablet";
import { nombreDeLugar } from "@/lib/panol/afuera";
import {
  claveItem, listaEsperada, numero, paraContar, resumenConteo, rutaUbicacion, subarbol, textoDif,
  type Conteo, type ConteoItem, type FilaEsperada, type UnidadEsperada,
} from "@/lib/panol/conteo";
import { leerRechazo } from "@/lib/panol/estado";
import { cn } from "@/lib/utils";
import { useMantenerSesion } from "@/components/panol/kiosco/sesion";
import {
  BOTON_OSCURO, BOTON_PRIMARIO, BOTON_SECUNDARIO, CabeceraTablet, ChipGrande, Lector, SinEncargado,
  TecladoNumerico, leerNumero, useEncargadoKiosco,
} from "./comun";

const CLAVE_SESION = "panol:conteo-abierto";

type Carga = { valor: number; estado: "guardando" | "guardado" | "error" };

type Fase =
  | { f: "inicio" }
  | { f: "contando"; conteoId: string; ubicacionId: string }
  | { f: "resumen"; conteoId: string; ubicacionId: string; conteo: Conteo | null; items: ConteoItem[] };

function recordar(v: { conteoId: string; ubicacionId: string } | null) {
  try {
    if (v) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(v));
    else sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* sin almacenamiento: se retoma desde la lista */
  }
}
function recordado(): { conteoId: string; ubicacionId: string } | null {
  try {
    const v = sessionStorage.getItem(CLAVE_SESION);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function PantallaConteo() {
  // Contar lleva su tiempo: entre ítem e ítem no se vuelve a "¿Quién sos?".
  useMantenerSesion();
  const { identidad, puede, token } = useEncargadoKiosco();
  const { data: catalogo } = useCatalogoPanol();
  const [fase, setFase] = useState<Fase>({ f: "inicio" });

  // Un conteo que quedó abierto en esta pestaña (el kiosco volvió a "¿Quién sos?").
  useEffect(() => {
    const r = recordado();
    if (r && fase.f === "inicio") setFase({ f: "contando", ...r });
    // Sólo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <CabeceraTablet titulo="Conteo cíclico" icono={<ClipboardList />} quien={identidad && puede ? `Contando: ${identidad.nombre}` : null} />
      {!puede ? (
        <SinEncargado identidad={identidad} />
      ) : !catalogo ? (
        <Cargando />
      ) : fase.f === "inicio" ? (
        <Inicio
          catalogo={catalogo}
          token={token}
          onAbierto={(conteoId, ubicacionId) => {
            recordar({ conteoId, ubicacionId });
            setFase({ f: "contando", conteoId, ubicacionId });
          }}
        />
      ) : fase.f === "contando" ? (
        <Contando
          key={fase.conteoId}
          catalogo={catalogo}
          token={token}
          conteoId={fase.conteoId}
          ubicacionId={fase.ubicacionId}
          onCerrado={(conteo, items) => {
            recordar(null);
            setFase({ f: "resumen", conteoId: fase.conteoId, ubicacionId: fase.ubicacionId, conteo, items });
          }}
          onPerdido={() => {
            recordar(null);
            setFase({ f: "inicio" });
          }}
        />
      ) : (
        <Resumen catalogo={catalogo} fase={fase} onOtra={() => setFase({ f: "inicio" })} />
      )}
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 text-lg text-muted-foreground">
      <Loader2 aria-hidden className="size-6 animate-spin" /> Cargando el pañol…
    </div>
  );
}

const fecha = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null);

// ─── Inicio: qué estantería ─────────────────────────────────────────────────

function Inicio({ catalogo, token, onAbierto }: {
  catalogo: Catalogo;
  token: string | null;
  onAbierto: (conteoId: string, ubicacionId: string) => void;
}) {
  const { data: conteos = [] } = useConteosPanol();
  const [elegida, setElegida] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const lista = useMemo(() => paraContar(catalogo.ubicaciones, conteos), [catalogo.ubicaciones, conteos]);

  // Esta semana: cuántas de las que se cuentan tuvieron un conteo aplicado en 7 días.
  const semana = useMemo(() => {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const hechas = new Set(conteos.filter((c) => c.estado === "aplicado" && c.iniciado_at >= desde).map((c) => c.ubicacion_id));
    return { hechas: lista.filter((p) => hechas.has(p.ubicacion.id)).length, total: lista.length };
  }, [conteos, lista]);

  const empezar = useCallback(
    async (ubicacionId: string) => {
      setAbriendo(true);
      try {
        const id = await abrirConteo(ubicacionId, token);
        onAbierto(id, ubicacionId);
      } catch (e) {
        toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
      } finally {
        setAbriendo(false);
      }
    },
    [token, onAbierto],
  );

  // Escanear el QR de la estantería es la intención entera: empieza sin otro toque.
  const onCodigo = useCallback(
    async (texto: string) => {
      try {
        const r = await resolverCodigo(texto);
        if (r.tipo !== "ubicacion") {
          toast.error(r.tipo === "anulado" ? "Esa etiqueta fue reemplazada por una nueva." : "Escaneá el QR de una estantería o de un estante.");
          return;
        }
        const pendiente = lista.find((p) => p.ubicacion.id === r.id)?.pendiente;
        if (pendiente?.estado === "abierto") onAbierto(pendiente.id, r.id);
        else void empezar(r.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo leer el código");
      }
    },
    [lista, empezar, onAbierto],
  );

  const sel = lista.find((p) => p.ubicacion.id === elegida) ?? null;
  const contenido = useMemo(() => (elegida ? listaEsperada(catalogo, elegida) : null), [catalogo, elegida]);

  return (
    <div className="grid flex-1 grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3 border-r bg-card p-5">
        <h2 className="text-[22px] font-bold">Hoy toca contar</h2>
        {lista.length === 0 && <p className="text-muted-foreground">No hay estanterías cargadas.</p>}
        <div className="flex flex-col gap-2 overflow-auto">
          {lista.map((p) => {
            const actual = p.ubicacion.id === elegida;
            return (
              <button
                key={p.ubicacion.id}
                type="button"
                aria-current={actual}
                onClick={() => setElegida(p.ubicacion.id)}
                className={cn(
                  "flex min-h-24 flex-col gap-1 rounded-lg px-4 py-3 text-left",
                  actual ? "border-2 border-foreground bg-muted" : "border bg-card active:bg-muted",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xl font-semibold">{p.ubicacion.nombre}</span>
                  {p.pendiente?.estado === "abierto" && <ChipGrande tono="marcha">Contando</ChipGrande>}
                  {p.pendiente?.estado === "por_aprobar" && <ChipGrande tono="aviso">Espera aprobación</ChipGrande>}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {p.ultimo ? `Último conteo: ${fecha(p.ultimo.iniciado_at)}` : "Nunca se contó"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-auto rounded-lg bg-muted p-3.5 text-sm leading-snug text-muted-foreground">
          <strong className="mb-1 block text-foreground">Por qué no ves el número del sistema</strong>
          Cargás lo que contás. Al terminar te mostramos las diferencias, así nadie copia el número.
        </div>
        {semana.total > 0 && (
          <div className="text-sm text-muted-foreground">
            Esta semana: <strong className="text-foreground">{semana.hechas} de {semana.total}</strong> contadas
            <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-foreground" style={{ width: `${(semana.hechas / semana.total) * 100}%` }} />
            </div>
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-col gap-5 px-7 py-6">
        {!sel || !contenido ? (
          <>
            <div>
              <h1 className="text-3xl font-bold">
                {lista[0] ? `Escaneá la estantería ${lista[0].ubicacion.nombre} para empezar` : "Escaneá la estantería para empezar"}
              </h1>
              <p className="mt-1.5 text-[17px] text-muted-foreground">El QR grande está en el parante. También la podés elegir de la lista.</p>
            </div>
            <Lector onCodigo={onCodigo} pausado={abriendo} ayuda="Escaneá el QR de la estantería" className="h-[440px]" />
          </>
        ) : (
          <>
            <div>
              <p className="text-[15px] text-muted-foreground">{rutaUbicacion(catalogo.ubicaciones, sel.ubicacion.id)}</p>
              <h1 className="text-3xl font-bold">{sel.ubicacion.nombre}</h1>
              <p className="mt-1.5 text-[17px] text-muted-foreground">
                {contenido.articulos.length} {contenido.articulos.length === 1 ? "artículo" : "artículos"} para contar
                {contenido.unidades.length > 0 && ` y ${contenido.unidades.length} ${contenido.unidades.length === 1 ? "herramienta" : "herramientas"} para escanear`}
                {sel.ultimo ? ` · último conteo ${fecha(sel.ultimo.iniciado_at)}` : " · nunca se contó"}
              </p>
            </div>
            {sel.pendiente?.estado === "por_aprobar" && (
              <Aviso>El último conteo de esta estantería espera que lo apruebe otro encargado. Si contás de nuevo, quedan los dos.</Aviso>
            )}
            <div className="flex flex-wrap gap-3">
              {sel.pendiente?.estado === "abierto" ? (
                <>
                  <button type="button" className={BOTON_PRIMARIO} onClick={() => onAbierto(sel.pendiente!.id, sel.ubicacion.id)}>
                    Retomar el conteo abierto
                  </button>
                  <button type="button" className={BOTON_SECUNDARIO} disabled={abriendo} onClick={() => empezar(sel.ubicacion.id)}>
                    Empezar de cero
                  </button>
                </>
              ) : (
                <button type="button" className={BOTON_PRIMARIO} disabled={abriendo} onClick={() => empezar(sel.ubicacion.id)}>
                  {abriendo && <Loader2 aria-hidden className="animate-spin" />} Empezar conteo
                </button>
              )}
              <button type="button" className={BOTON_SECUNDARIO} onClick={() => setElegida(null)}>Elegir otra</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 px-4 py-3.5 text-base leading-snug text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ─── Contando ───────────────────────────────────────────────────────────────

function Contando({ catalogo, token, conteoId, ubicacionId, onCerrado, onPerdido }: {
  catalogo: Catalogo;
  token: string | null;
  conteoId: string;
  ubicacionId: string;
  onCerrado: (conteo: Conteo | null, items: ConteoItem[]) => void;
  onPerdido: () => void;
}) {
  const invalidar = useInvalidarPanol();
  const { data: personas } = usePersonasPanol();
  // La lista se congela al abrir: si alguien retira algo mientras se cuenta, la fila no se
  // tiene que ir de abajo del dedo. Lo movido lo corrige la base al cerrar.
  const [lista] = useState(() => listaEsperada(catalogo, ubicacionId));
  const [extras, setExtras] = useState<FilaEsperada[]>([]);
  const [unidadesExtra, setUnidadesExtra] = useState<UnidadEsperada[]>([]);
  const [cargas, setCargas] = useState<Record<string, Carga>>({});
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [listo, setListo] = useState(false);

  const nombreUbic = catalogo.ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "Ubicación";
  const filas = useMemo(() => [...lista.articulos, ...extras], [lista.articulos, extras]);
  const unidades = useMemo(() => [...lista.unidades, ...unidadesExtra], [lista.unidades, unidadesExtra]);
  const enLista = useMemo(() => new Set([...lista.articulos, ...lista.unidades].map((f) => f.clave)), [lista]);

  // Retomar: lo ya cargado está en la base.
  useEffect(() => {
    let vivo = true;
    leerConteo(conteoId)
      .then(({ conteo, items }) => {
        if (!vivo) return;
        if (!conteo || conteo.estado !== "abierto") {
          toast.error("Ese conteo ya está cerrado.");
          onPerdido();
          return;
        }
        const art = new Map(catalogo.articulos.map((a) => [a.id, a]));
        const nuevasCargas: Record<string, Carga> = {};
        const nuevosExtras: FilaEsperada[] = [];
        const nuevasUnidades: UnidadEsperada[] = [];
        for (const it of items) {
          if (it.contado === null) continue;
          const clave = claveItem(it.articulo_id, it.variante_id, it.unidad_id);
          nuevasCargas[clave] = { valor: Number(it.contado), estado: "guardado" };
          if (enLista.has(clave)) continue;
          if (it.unidad_id) {
            const u = catalogo.unidades.find((x) => x.id === it.unidad_id);
            nuevasUnidades.push({ clave, articuloId: it.articulo_id, unidadId: it.unidad_id, numero: u?.numero ?? "?", nombre: art.get(it.articulo_id)?.nombre ?? "Herramienta", donde: "Encontrada acá" });
          } else {
            const t = it.variante_id ? catalogo.variantes.find((v) => v.id === it.variante_id)?.nombre : undefined;
            const a = art.get(it.articulo_id);
            nuevosExtras.push({ clave, articuloId: it.articulo_id, varianteId: it.variante_id, nombre: `${a?.nombre ?? "Artículo"}${t ? ` · talle ${t}` : ""}`, unidad: a?.unidad ?? "u.", donde: "No figuraba acá" });
          }
        }
        setCargas(nuevasCargas);
        setExtras(nuevosExtras);
        setUnidadesExtra(nuevasUnidades);
        setListo(true);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "No se pudo leer el conteo");
        setListo(true);
      });
    return () => {
      vivo = false;
    };
    // Una vez por conteo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteoId]);

  // El primer ítem sin cargar queda listo para el teclado.
  useEffect(() => {
    if (listo && seleccion === null) {
      const primera = filas.find((f) => !cargas[f.clave]);
      if (primera) setSeleccion(primera.clave);
    }
  }, [listo, seleccion, filas, cargas]);

  const guardar = useCallback(
    async (clave: string, item: ItemACargar) => {
      setCargas((c) => ({ ...c, [clave]: { valor: item.contado, estado: "guardando" } }));
      try {
        await cargarConteo(conteoId, [item], token);
        setCargas((c) => ({ ...c, [clave]: { valor: item.contado, estado: "guardado" } }));
      } catch (e) {
        setCargas((c) => ({ ...c, [clave]: { valor: item.contado, estado: "error" } }));
        toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
      }
    },
    [conteoId, token],
  );

  const itemDeFila = (f: FilaEsperada, contado: number): ItemACargar => ({
    articuloId: f.articuloId, varianteId: f.varianteId, contado, encontradoExtra: !enLista.has(f.clave),
  });
  const itemDeUnidad = (u: UnidadEsperada, contado: number): ItemACargar => ({
    articuloId: u.articuloId, unidadId: u.unidadId, contado, encontradoExtra: !enLista.has(u.clave),
  });

  function confirmarBorrador() {
    const f = filas.find((x) => x.clave === seleccion);
    const n = leerNumero(borrador);
    if (!f || n === null) return;
    void guardar(f.clave, itemDeFila(f, n));
    setBorrador("");
    const siguiente = filas.find((x) => x.clave !== f.clave && cargas[x.clave]?.estado !== "guardado");
    setSeleccion(siguiente?.clave ?? null);
  }

  function elegirFila(clave: string) {
    setSeleccion(clave);
    const c = cargas[clave];
    setBorrador(c ? String(c.valor).replace(".", ",") : "");
  }

  function sumarExtra(f: FilaEsperada) {
    if (!filas.some((x) => x.clave === f.clave)) setExtras((e) => [...e, f]);
    elegirFila(f.clave);
  }

  const onCodigo = useCallback(
    async (texto: string) => {
      try {
        const r = await resolverCodigo(texto);
        if (r.tipo === "unidad") {
          const u = unidades.find((x) => x.unidadId === r.id);
          if (u) {
            if (cargas[u.clave]?.valor === 1) return; // segundo escaneo: se ignora
            void guardar(u.clave, itemDeUnidad(u, 1));
            toast.success(`${u.numero} ${u.nombre}: está`);
            return;
          }
          const uni = catalogo.unidades.find((x) => x.id === r.id);
          if (!uni) return toast.error("No encuentro esa herramienta.");
          const nombre = catalogo.articulos.find((a) => a.id === uni.articulo_id)?.nombre ?? "Herramienta";
          const nueva: UnidadEsperada = { clave: claveItem(uni.articulo_id, null, uni.id), articuloId: uni.articulo_id, unidadId: uni.id, numero: uni.numero, nombre, donde: "Encontrada acá" };
          setUnidadesExtra((x) => [...x, nueva]);
          void guardar(nueva.clave, itemDeUnidad(nueva, 1));
          const donde = personas ? nombreDeLugar(uni.lugar, personas.personas, personas.cuadrillas, catalogo.ubicaciones) : "otro lado";
          toast.warning(`${uni.numero} figuraba en ${donde}: se suma como encontrada acá.`);
          return;
        }
        if (r.tipo === "articulo") {
          const f = filas.find((x) => x.articuloId === r.id && !x.varianteId) ?? filas.find((x) => x.articuloId === r.id);
          if (f) return elegirFila(f.clave);
          const a = catalogo.articulos.find((x) => x.id === r.id);
          if (a && a.tipo !== "herramienta" && !a.tiene_talles) {
            sumarExtra({ clave: claveItem(a.id), articuloId: a.id, varianteId: null, nombre: a.nombre, unidad: a.unidad, donde: "No figuraba acá" });
          } else {
            setBuscando(true);
          }
          return;
        }
        if (r.tipo === "ubicacion") {
          const dentro = subarbol(catalogo.ubicaciones, ubicacionId).has(r.id);
          toast.message(dentro ? `Estás contando ${nombreUbic}.` : `Terminá ${nombreUbic} antes de empezar otra.`);
          return;
        }
        toast.error(r.tipo === "anulado" ? "Esa etiqueta fue reemplazada por una nueva." : "No reconozco ese código.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo leer el código");
      }
    },
    // itemDeUnidad/elegirFila/sumarExtra dependen de lo mismo que está acá.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unidades, filas, cargas, catalogo, personas, guardar, ubicacionId, nombreUbic],
  );

  const faltanCargar = filas.filter((f) => cargas[f.clave]?.estado !== "guardado").length;
  const enVuelo = Object.values(cargas).some((c) => c.estado === "guardando");
  const conError = Object.values(cargas).some((c) => c.estado === "error");
  const sinEscanear = lista.unidades.filter((u) => cargas[u.clave]?.valor !== 1);
  const cargados = filas.length - faltanCargar + unidades.filter((u) => cargas[u.clave]?.valor === 1).length;
  const total = filas.length + unidades.length;
  const filaSel = filas.find((f) => f.clave === seleccion) ?? null;

  async function terminar() {
    setCerrando(true);
    try {
      await cerrarConteo(conteoId, token);
      const { conteo, items } = await leerConteo(conteoId);
      invalidar();
      onCerrado(conteo, items);
    } catch (e) {
      toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
    } finally {
      setCerrando(false);
      setConfirmando(false);
    }
  }

  if (!listo) return <Cargando />;

  return (
    <div className="flex flex-1 flex-col">
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4 px-7 py-5">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-bold">{nombreUbic}</h1>
              <p className="mt-1 text-[17px] text-muted-foreground">Contá lo que hay y cargá el número de cada artículo.</p>
            </div>
            <span aria-live="polite" className="shrink-0 text-base font-semibold text-muted-foreground">
              {cargados} de {total} cargados
            </span>
          </div>
          <Lector onCodigo={onCodigo} pausado={buscando || confirmando} ayuda="Escaneá cada herramienta, o el código de barras de un artículo" className="h-44" />

          {filas.length > 0 && (
            <ul className="flex flex-col gap-2">
              {filas.map((f) => {
                const c = cargas[f.clave];
                const actual = f.clave === seleccion;
                return (
                  <li key={f.clave}>
                    <button
                      type="button"
                      onClick={() => elegirFila(f.clave)}
                      aria-current={actual}
                      className={cn(
                        "flex min-h-[76px] w-full items-center gap-4 rounded-lg bg-card px-4 py-2 text-left",
                        actual ? "border-2 border-foreground" : "border",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold">{f.nombre}</span>
                        <span className="block text-sm text-muted-foreground">
                          {[f.donde, `en ${f.unidad}`].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <EstadoCarga carga={c} />
                      <span className={cn(
                        "grid h-[60px] w-[150px] place-items-center rounded-lg border-2 font-mono text-[26px] font-semibold",
                        c ? "border-border" : "border-dashed border-muted-foreground/50 text-muted-foreground",
                      )}>
                        {c ? numero(c.valor) : "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {unidades.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="mt-2 text-lg font-bold">Herramientas con número · escaneá cada una</h2>
              <ul className="flex flex-col gap-2">
                {unidades.map((u) => {
                  const esta = cargas[u.clave]?.valor === 1;
                  const extra = !enLista.has(u.clave);
                  return (
                    <li
                      key={u.clave}
                      className={cn(
                        "flex min-h-16 items-center gap-3 rounded-lg px-4 py-2",
                        esta ? "border bg-card" : "border border-dashed border-muted-foreground/50 bg-muted/40",
                      )}
                    >
                      {esta ? <CheckCircle2 aria-hidden className="size-6 shrink-0 text-emerald-700 dark:text-emerald-400" /> : <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-muted-foreground/60" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold">
                          {u.nombre} <span className="font-mono text-muted-foreground">{u.numero}</span>
                        </span>
                        <span className="block text-sm text-muted-foreground">{esta ? (extra ? "Encontrada acá" : "Escaneada") : `Falta escanear · ${u.donde}`}</span>
                      </span>
                      <EstadoCarga carga={cargas[u.clave]} soloProblemas />
                      {/* Sin QR legible: se tilda a mano. Desmarcar sólo lo que figuraba acá. */}
                      {!esta ? (
                        <button type="button" className={BOTON_SECUNDARIO} onClick={() => guardar(u.clave, itemDeUnidad(u, 1))}>
                          La veo
                        </button>
                      ) : !extra ? (
                        <button type="button" className={BOTON_SECUNDARIO} onClick={() => guardar(u.clave, itemDeUnidad(u, 0))}>
                          No está
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {filas.length === 0 && unidades.length === 0 && (
            <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">
              No figura nada en {nombreUbic}. Si encontrás algo, sumalo con «Encontré otra cosa».
            </p>
          )}
        </div>

        {/* Teclado: siempre a la derecha, para la fila marcada. */}
        <aside className="sticky top-[68px] flex h-[calc(100dvh-68px-92px)] flex-col gap-3 self-start border-l bg-card p-5">
          {filaSel ? (
            <>
              <div>
                <div className="text-sm text-muted-foreground">Cuántos contaste de</div>
                <div className="line-clamp-2 text-lg font-bold">{filaSel.nombre}</div>
              </div>
              <div className="flex h-20 items-center justify-end gap-2 rounded-lg border-2 border-foreground px-4">
                <span className="font-mono text-4xl font-semibold">{borrador || <span className="text-muted-foreground">0</span>}</span>
                <span className="text-base text-muted-foreground">{filaSel.unidad}</span>
              </div>
              <TecladoNumerico valor={borrador} onCambio={setBorrador} decimales={!/^(u\.?|unidad(es)?|pares?)$/i.test(filaSel.unidad)} />
              <button type="button" className={cn(BOTON_OSCURO, "h-16 text-lg")} disabled={leerNumero(borrador) === null} onClick={confirmarBorrador}>
                <Check aria-hidden /> Guardar {borrador ? borrador : ""}
              </button>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Check aria-hidden className="size-10" />
              <p className="text-base">Tocá una fila para cargar o corregir lo que contaste.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 flex min-h-[92px] items-center gap-3 border-t bg-card px-7 py-3.5">
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setBuscando(true)}>
          <PackagePlus aria-hidden /> Encontré otra cosa
        </button>
        <span className="flex-1" />
        {conError && <span className="text-[15px] text-red-700 dark:text-red-300">Hay filas sin guardar: tocá la fila y guardá de nuevo.</span>}
        {!conError && faltanCargar > 0 && (
          <span className="text-[15px] text-muted-foreground">{faltanCargar === 1 ? "Falta 1 por cargar" : `Faltan ${faltanCargar} por cargar`}</span>
        )}
        <button
          type="button"
          className={cn(BOTON_PRIMARIO, "h-[60px] px-7 text-lg")}
          disabled={faltanCargar > 0 || enVuelo || conError || cerrando}
          onClick={() => setConfirmando(true)}
        >
          Terminar conteo
        </button>
      </div>

      <BuscarArticulo
        abierto={buscando}
        onCerrar={() => setBuscando(false)}
        catalogo={catalogo}
        onElegir={(f) => {
          setBuscando(false);
          sumarExtra(f);
        }}
      />

      <Dialog open={confirmando} onOpenChange={(o) => !cerrando && setConfirmando(o)}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-xl">¿Terminar el conteo de {nombreUbic}?</DialogTitle>
            <DialogDescription className="text-base">
              Después no se puede cambiar lo cargado. Te mostramos las diferencias con el sistema.
            </DialogDescription>
          </DialogHeader>
          {sinEscanear.length > 0 && (
            <Aviso>
              {sinEscanear.length === 1
                ? `1 herramienta no la escaneaste (${sinEscanear[0].numero}): queda como faltante.`
                : `${sinEscanear.length} herramientas no las escaneaste: quedan como faltantes.`}
            </Aviso>
          )}
          <DialogFooter className="gap-3">
            <button type="button" className={BOTON_SECUNDARIO} disabled={cerrando} onClick={() => setConfirmando(false)}>Seguir contando</button>
            <button type="button" className={BOTON_PRIMARIO} disabled={cerrando} onClick={terminar}>
              {cerrando && <Loader2 aria-hidden className="animate-spin" />} Terminar conteo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstadoCarga({ carga, soloProblemas = false }: { carga: Carga | undefined; soloProblemas?: boolean }) {
  if (!carga) return null;
  if (carga.estado === "guardando") return <Loader2 aria-label="Guardando" className="size-6 shrink-0 animate-spin text-muted-foreground" />;
  if (carga.estado === "error") return <X aria-label="No se guardó" className="size-6 shrink-0 text-red-700 dark:text-red-300" />;
  if (soloProblemas) return null;
  return <Check aria-label="Guardado" className="size-6 shrink-0 text-emerald-700 dark:text-emerald-400" />;
}

// ─── "Encontré otra cosa" ───────────────────────────────────────────────────

function BuscarArticulo({ abierto, onCerrar, catalogo, onElegir }: {
  abierto: boolean;
  onCerrar: () => void;
  catalogo: Catalogo;
  onElegir: (f: FilaEsperada) => void;
}) {
  const [q, setQ] = useState("");
  const [conTalles, setConTalles] = useState<string | null>(null);
  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalogo.articulos
      .filter((a) => a.activo && a.tipo !== "herramienta" && (!t || a.nombre.toLowerCase().includes(t)))
      .slice(0, 30);
  }, [catalogo.articulos, q]);
  const art = conTalles ? catalogo.articulos.find((a) => a.id === conTalles) : null;
  const talles = art ? catalogo.variantes.filter((v) => v.articulo_id === art.id && v.activo) : [];

  return (
    <Dialog
      open={abierto}
      onOpenChange={(o) => {
        if (!o) {
          setQ("");
          setConTalles(null);
          onCerrar();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{art ? `¿Qué talle de ${art.nombre}?` : "Encontré otra cosa"}</DialogTitle>
          <DialogDescription className="text-base">
            {art ? "Cada talle se cuenta aparte." : "Buscá el artículo que no estaba en la lista. Las herramientas con número, escaneálas."}
          </DialogDescription>
        </DialogHeader>
        {art ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {talles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={BOTON_SECUNDARIO}
                  onClick={() => onElegir({ clave: claveItem(art.id, v.id), articuloId: art.id, varianteId: v.id, nombre: `${art.nombre} · talle ${v.nombre}`, unidad: art.unidad, donde: "No figuraba acá" })}
                >
                  {v.nombre}
                </button>
              ))}
            </div>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setConTalles(null)}>
              <RotateCcw aria-hidden /> Otro artículo
            </button>
          </>
        ) : (
          <>
            <label className="relative">
              <span className="sr-only">Buscar por nombre</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre"
                className="h-14 w-full rounded-lg border-2 border-input bg-card pr-4 pl-12 text-lg outline-none focus-visible:border-ring"
              />
            </label>
            <ul className="flex flex-col gap-2 overflow-auto">
              {resultados.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 text-left active:bg-muted"
                    onClick={() =>
                      a.tiene_talles
                        ? setConTalles(a.id)
                        : onElegir({ clave: claveItem(a.id), articuloId: a.id, varianteId: null, nombre: a.nombre, unidad: a.unidad, donde: "No figuraba acá" })
                    }
                  >
                    <span className="text-base font-semibold">{a.nombre}</span>
                    <span className="text-sm text-muted-foreground">en {a.unidad}</span>
                  </button>
                </li>
              ))}
              {resultados.length === 0 && <li className="px-1 py-3 text-muted-foreground">No hay artículos con ese nombre.</li>}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Resumen: recién ahora, lo que decía el sistema ─────────────────────────

function Resumen({ catalogo, fase, onOtra }: {
  catalogo: Catalogo;
  fase: Extract<Fase, { f: "resumen" }>;
  onOtra: () => void;
}) {
  const r = useMemo(() => resumenConteo(fase.items, fase.conteo?.umbral_pct ?? 10), [fase]);
  const porAprobar = fase.conteo?.estado === "por_aprobar";
  const nombreUbic = catalogo.ubicaciones.find((u) => u.id === fase.ubicacionId)?.nombre ?? "La ubicación";
  const art = new Map(catalogo.articulos.map((a) => [a.id, a]));
  const nombreItem = (it: ConteoItem) => {
    const a = art.get(it.articulo_id);
    const t = it.variante_id ? catalogo.variantes.find((v) => v.id === it.variante_id)?.nombre : undefined;
    const n = it.unidad_id ? catalogo.unidades.find((u) => u.id === it.unidad_id)?.numero : undefined;
    return [a?.nombre ?? "Artículo", t && `talle ${t}`, n].filter(Boolean).join(" · ");
  };
  const n = r.diferencias.length + r.noAparecieron.length + r.aparecieron.length;
  const titulo = n === 0 ? "todo coincide" : n === 1 ? "1 diferencia" : `${n} diferencias`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-7 py-6">
        <div>
          <h1 className="text-3xl font-bold">{nombreUbic} contada: {titulo}</h1>
          <p className="mt-1.5 text-[17px] text-muted-foreground">
            Las diferencias de más del {numero(fase.conteo?.umbral_pct ?? 10)} % y las herramientas que no aparecieron las aprueba otro encargado antes de tocar el stock.
          </p>
        </div>

        {porAprobar ? (
          <Aviso>
            <strong>Queda en Ajustes por aprobar — lo aprueba otro encargado</strong> (no puede ser quien contó). Les avisamos a los encargados del pañol. Hasta que lo apruebe, el stock no se toca.
          </Aviso>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3.5 text-base text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              <strong>Listo: </strong>
              {r.diferencias.length === 0 && r.aparecieron.length === 0 && r.noAparecieron.length === 0
                ? "no hubo nada para ajustar."
                : [
                    r.diferencias.length && `${r.diferencias.length} ${r.diferencias.length === 1 ? "artículo ajustado" : "artículos ajustados"}`,
                    r.noAparecieron.length && `${r.noAparecieron.length} ${r.noAparecieron.length === 1 ? "faltante generado" : "faltantes generados"}`,
                    r.aparecieron.length && `${r.aparecieron.length} ${r.aparecieron.length === 1 ? "herramienta volvió" : "herramientas volvieron"} al pañol`,
                  ].filter(Boolean).join(", ") + "."}
            </span>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {r.diferencias.map((d) => {
            const unidad = art.get(d.item.articulo_id)?.unidad ?? "";
            return (
              <li key={d.item.id} className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[19px] font-bold">{nombreItem(d.item)}</div>
                  <div className="mt-1 text-base text-muted-foreground">
                    Contaste <strong className="font-mono text-foreground">{numero(d.contado)}</strong>, el sistema decía{" "}
                    <strong className="font-mono text-foreground">{numero(d.esperado)}</strong> →{" "}
                    <strong className="font-mono text-foreground">{textoDif(d.dif)}</strong> {unidad}
                  </div>
                </div>
                {porAprobar
                  ? d.supera && <ChipGrande tono="aviso">Pide aprobación</ChipGrande>
                  : <ChipGrande tono="neutro" >{d.item.encontrado_extra ? "Se sumó al stock" : "Ajustado"}</ChipGrande>}
              </li>
            );
          })}
          {r.noAparecieron.map((it) => (
            <li key={it.id} className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-[19px] font-bold">{nombreItem(it)}</div>
                <div className="mt-1 text-base text-muted-foreground">
                  Figuraba acá y no apareció → {porAprobar ? "queda faltante si se aprueba" : "quedó como faltante"}.
                </div>
              </div>
              <ChipGrande tono="aviso">Faltante</ChipGrande>
            </li>
          ))}
          {r.aparecieron.map((it) => (
            <li key={it.id} className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-[19px] font-bold">{nombreItem(it)}</div>
                <div className="mt-1 text-base text-muted-foreground">
                  Apareció acá y figuraba en otro lado → {porAprobar ? "vuelve al pañol si se aprueba" : "volvió al pañol"}.
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">
          {[
            r.coinciden > 0 && (r.coinciden === 1 ? "1 artículo coincide con el sistema" : `${r.coinciden} artículos coinciden con el sistema`),
            r.unidadesOk > 0 && (r.unidadesOk === 1 ? "1 herramienta estaba donde figuraba" : `${r.unidadesOk} herramientas estaban donde figuraban`),
          ].filter(Boolean).join(" · ") || "Nada más para revisar."}
        </div>
        <p className="text-sm text-muted-foreground">
          Lo esperado se calcula al cerrar, descontando lo que se movió mientras contabas: si alguien retiró algo después de que lo contaste, no cuenta como diferencia.
        </p>
      </div>
      <div className="sticky bottom-0 flex justify-end border-t bg-card px-7 py-3.5">
        <button type="button" className={cn(BOTON_PRIMARIO, "h-[60px] px-7 text-lg")} onClick={onOtra}>
          Contar otra estantería
        </button>
      </div>
    </div>
  );
}
