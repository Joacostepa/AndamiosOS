"use client";

// Salida y vuelta de una cuadrilla (docs §6, flujos 5 y 6).
//
// SALIDA: quien se identificó elige la cuadrilla (se propone la suya y las que hoy tienen
// obra según Planificación), escanea todo lo que llevan una cosa atrás de la otra, hace el
// control de salida de las máquinas (Bien / Incompleta) y confirma. El vale queda a nombre
// de la cuadrilla y la base guarda quién era el capataz en ese momento. Las máquinas y el
// equipo se QUEDAN con la cuadrilla; "Vuelve hoy" (apagado por defecto) lo hace préstamo
// del día.
//
// VUELTA: se elige la cuadrilla, se ve lo que tiene afuera y se escanea lo que vuelve,
// cada máquina con su estado. "Cerrar por hoy" deja el resto a su nombre. Los insumos no
// vuelven acá: lo que sobra va por "Devolver sobrante".

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Escaner } from "@/components/panol/escaner";
import { deshacerVale } from "@/hooks/use-panol";
import {
  confirmarVale, descartarPendiente, resolverEscaneo, RechazoVale, subirFotoPanol, useEnLinea, useSalidasDe, type DatosKiosco,
} from "@/hooks/use-panol-kiosco";
import {
  actualizarLinea, afueraDeCuadrilla, armarVale, contar, decidirEscaneo, esErrorDeRed, esMaquina, motivoTexto, numero,
  quitarLinea, situacionUnidad, sumarLinea, type LineaVale,
} from "@/lib/panol/kiosco";
import { ESTADO_UNIDAD, hoyBA, leerRechazo, lugarDeCuadrilla } from "@/lib/panol/estado";
import type { Articulo, EstadoUnidad, EstadoVuelta, Identidad } from "@/lib/panol/tipos";
import { useKiosco } from "./sesion";
import { SelectorObra, type Propuesta } from "./obra";
import { MOTIVOS } from "./herramienta";
import { nombreConTalle, PasoCantidad, PasoLista } from "./pasos";
import { Aviso, BotonFoto, BotonPrimario, BotonSecundario, BotonVolver, Chips, Opcion, Pantalla, PantallaListo, Titulo, useAvisoEfimero } from "./ui";

type Modo = "salida" | "vuelta";

type Paso =
  | { p: "modo" }
  | { p: "cuadrilla"; modo: Modo }
  | { p: "escaneo" }
  | { p: "lista"; articuloIds: string[]; ubicacionId: string | null }
  | { p: "cantidad"; articuloId: string; ubicacionId: string | null }
  | { p: "control" }
  | { p: "listo"; titulo: string; texto: string; detalle?: string; valeId: string | null; clientUuid: string | null; volverA: Paso };

/** Lo que vuelve de una herramienta en la vuelta: estado, motivos y foto. */
type Vuelta = { estado: EstadoVuelta; chips: string[]; foto?: string };

export function FlujoCuadrilla({ identidad, datos, onInicio, onTerminar }: {
  identidad: Identidad;
  datos: DatosKiosco;
  onInicio: () => void;
  onTerminar: () => void;
}) {
  const { dispositivo } = useKiosco();
  const enLinea = useEnLinea();
  const hoy = hoyBA();
  const nombre = identidad.nombre.split(" ")[0];
  const { aviso, mostrar } = useAvisoEfimero();
  const [paso, setPaso] = useState<Paso>({ p: "modo" });
  const [modo, setModo] = useState<Modo>("salida");
  const [cuadrillaId, setCuadrillaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaVale[]>([]);
  const [vueltas, setVueltas] = useState<Record<string, Vuelta>>({});
  const [obra, setObra] = useState<number | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idFotos] = useState(() => crypto.randomUUID());
  const [verOtras, setVerOtras] = useState(false);

  const cuadrilla = datos.cuadrillas.find((c) => c.id === cuadrillaId) ?? null;
  const capataz = cuadrilla ? datos.nombrePersona(cuadrilla.responsableId) : null;
  const otHoy = datos.otHoyDeCuadrilla(cuadrillaId);
  const afuera = useMemo(() => (cuadrillaId ? afueraDeCuadrilla(datos.cat, cuadrillaId) : { unidades: [], granel: [] }), [datos.cat, cuadrillaId]);
  const salidas = useSalidasDe(modo === "vuelta" ? afuera.unidades.map((u) => u.id) : [], cuadrillaId);
  const art = (id: string | undefined) => datos.cat.articulos.find((a) => a.id === id);

  function elegirCuadrilla(id: string) {
    setCuadrillaId(id);
    setLineas([]);
    setVueltas({});
    setObra(datos.otHoyDeCuadrilla(id));
    setPaso({ p: "escaneo" });
  }

  // ─── Escaneo ────────────────────────────────────────────────────────────

  async function procesar(texto: string) {
    if (!cuadrillaId) return;
    setProcesando(true);
    try {
      const r = await resolverEscaneo(texto, datos);
      const d = decidirEscaneo(r, datos.cat, modo);
      if (d.ir === "unidad") (modo === "salida" ? sumarUnidad : volvioUnidad)(d.unidadId);
      else if (d.ir === "cantidad") setPaso({ p: "cantidad", articuloId: d.articuloId, ubicacionId: d.ubicacionId });
      else if (d.ir === "lista") setPaso({ p: "lista", articuloIds: d.articuloIds, ubicacionId: d.ubicacionId });
      else if (d.ir === "persona") mostrar(`Esa es una credencial. Si no sos ${nombre}, tocá «No soy ${nombre}».`, "aviso");
      else mostrar(d.texto, "aviso");
    } catch (e) {
      mostrar(esErrorDeRed(e) ? "Sin señal no puedo leer ese código." : leerRechazo(e instanceof Error ? e.message : String(e)).texto, "bloqueo");
    } finally {
      setProcesando(false);
    }
  }

  function sumarUnidad(unidadId: string) {
    const u = datos.cat.unidades.find((x) => x.id === unidadId);
    const a = art(u?.articulo_id);
    if (!u || !a || !cuadrillaId) return mostrar("No encuentro esa herramienta en el catálogo.", "aviso");
    const s = situacionUnidad(u, a, lugarDeCuadrilla(cuadrillaId), hoy);
    if (s.caso === "bloqueada") return mostrar(`#${u.numero} tiene la inspección de seguridad vencida: no sale. Dejala en el estante rojo.`, "bloqueo");
    if (s.caso === "devolver") return mostrar(`#${u.numero} ya figura con ${cuadrilla?.nombre ?? "la cuadrilla"}.`, "aviso");
    if (s.caso === "la_tiene") return mostrar(`#${u.numero} la tiene ${datos.nombreDeLugar(s.lugar)}: que la devuelva o la pase primero.`, "aviso");
    if (s.caso === "no_disponible") return mostrar(`#${u.numero} está ${(ESTADO_UNIDAD[s.estado as EstadoUnidad] ?? s.estado).toLowerCase()}: no sale.`, "aviso");
    const r = sumarLinea(lineas, { articuloId: a.id, varianteId: null, unidadId: u.id, cantidad: 1, nombre: `${a.nombre} #${u.numero}`, unidad: "u." });
    if (r.repetida) return mostrar(`#${u.numero} ya está en el vale.`, "aviso");
    setLineas(r.lineas);
    mostrar(`Sumaste ${a.nombre} #${u.numero}`);
  }

  function volvioUnidad(unidadId: string) {
    const u = afuera.unidades.find((x) => x.id === unidadId);
    if (!u) {
      const otra = datos.cat.unidades.find((x) => x.id === unidadId);
      return mostrar(otra ? `#${otra.numero} no figura con ${cuadrilla?.nombre ?? "esta cuadrilla"}: devolvela desde «Herramienta».` : "No encuentro esa herramienta.", "aviso");
    }
    if (vueltas[u.id]) return mostrar(`#${u.numero} ya está entre lo que volvió.`, "aviso");
    setVueltas({ ...vueltas, [u.id]: { estado: "bien", chips: [] } });
    mostrar(`Volvió #${u.numero}`);
  }

  // ─── Confirmar ──────────────────────────────────────────────────────────

  async function confirmar(tipo: "retiro" | "devolucion", ls: LineaVale[], listo: { titulo: string; texto: string; detalle?: string }, volverA: Paso) {
    if (!cuadrillaId) return;
    setError(null);
    setProcesando(true);
    const clientUuid = crypto.randomUUID();
    const vale = armarVale({ tipo, clientUuid, token: identidad.token, dispositivo, lineas: ls, cuadrillaId, odooOtId: tipo === "retiro" ? obra : otHoy });
    try {
      const r = await confirmarVale(vale, { resumen: listo.texto, quien: identidad.nombre }, datos.nombreDeLugar);
      setPaso({ p: "listo", ...listo, clientUuid, volverA, valeId: r.estado === "ok" ? r.valeId : null });
    } catch (e) {
      setError(e instanceof RechazoVale ? e.rechazo.texto : String(e));
    } finally {
      setProcesando(false);
    }
  }

  function cerrarPorHoy() {
    const ls: LineaVale[] = [];
    for (const u of afuera.unidades) {
      const v = vueltas[u.id];
      if (!v) continue;
      const a = art(u.articulo_id);
      ls.push({
        clave: `u:${u.id}`, articuloId: u.articulo_id, varianteId: null, unidadId: u.id, cantidad: 1, nombre: `${a?.nombre ?? ""} #${u.numero}`, unidad: "u.",
        estadoVuelta: v.estado, motivo: v.estado === "bien" ? undefined : motivoTexto(v.chips, "") || (v.estado === "con_falla" ? "Con falla" : "Incompleta"), fotoPath: v.foto,
      });
    }
    ls.push(...lineas.map((l) => ({ ...l, estadoVuelta: "bien" as const })));
    const siguen = afuera.unidades.length - Object.keys(vueltas).length;
    const nombreC = cuadrilla?.nombre ?? "la cuadrilla";
    const listo = {
      titulo: "Cerrado por hoy.",
      texto: `Volvieron ${ls.length}. ${siguen > 0 ? `Siguen ${siguen} con ${nombreC}${capataz ? `, a cargo de ${capataz}` : ""}.` : "No queda nada afuera."}`,
      detalle: Object.values(vueltas).some((v) => v.estado !== "bien")
        ? "Lo que volvió con falla o incompleto queda en revisión, en la bandeja de los encargados del pañol."
        : undefined,
    };
    if (ls.length === 0) {
      setPaso({ p: "listo", ...listo, valeId: null, clientUuid: null, volverA: { p: "escaneo" } });
      return;
    }
    void confirmar("devolucion", ls, listo, { p: "escaneo" });
  }

  // ─── Pantallas ──────────────────────────────────────────────────────────

  if (paso.p === "listo") {
    const listo = paso;
    return (
      <PantallaListo
        titulo={listo.titulo}
        texto={listo.texto}
        detalle={listo.detalle}
        guardado={!listo.valeId && !!listo.clientUuid}
        onTerminar={onTerminar}
        onDeshacer={
          listo.clientUuid
            ? async () => {
                try {
                  if (listo.valeId) await deshacerVale(listo.valeId);
                  else descartarPendiente(listo.clientUuid!);
                } catch (e) {
                  setError(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
                }
                setPaso(listo.volverA);
              }
            : undefined
        }
      />
    );
  }

  if (paso.p === "modo") {
    return (
      <Pantalla>
        <BotonVolver onClick={onInicio}>Otra cosa</BotonVolver>
        <Titulo sub={`Hola, ${nombre}.`}>Cuadrilla</Titulo>
        <Opcion titulo="Salida" sub="Escaneá todo lo que lleva la cuadrilla" onClick={() => { setModo("salida"); setPaso({ p: "cuadrilla", modo: "salida" }); }} />
        <Opcion titulo="Vuelta" sub="Escaneá lo que vuelve; el resto sigue con ellos" onClick={() => { setModo("vuelta"); setPaso({ p: "cuadrilla", modo: "vuelta" }); }} />
      </Pantalla>
    );
  }

  if (paso.p === "cuadrilla") {
    // Primero la suya, después las que hoy tienen obra según Planificación.
    const propias = identidad.cuadrillaId ? [identidad.cuadrillaId] : [];
    const deHoy = datos.cuadrillasHoy.filter((c) => c.cuadrillaId && c.otId && !propias.includes(c.cuadrillaId)).map((c) => c.cuadrillaId!);
    const propuestas = [...propias, ...deHoy];
    const resto = datos.cuadrillas.filter((c) => c.activo && !propuestas.includes(c.id));
    const fila = (id: string, sub?: string) => {
      const c = datos.cuadrillas.find((x) => x.id === id);
      if (!c) return null;
      const cap = datos.nombrePersona(c.responsableId);
      const ot = datos.otHoyDeCuadrilla(id);
      return (
        <Opcion
          key={id}
          titulo={`${c.nombre}${cap ? ` · ${cap}` : ""}`}
          sub={[sub, ot ? `Hoy en ${datos.tituloOt(ot)}` : null].filter(Boolean).join(" · ") || undefined}
          onClick={() => elegirCuadrilla(id)}
        />
      );
    };
    return (
      <Pantalla>
        <BotonVolver onClick={() => setPaso({ p: "modo" })}>Volver</BotonVolver>
        <Titulo sub={paso.modo === "salida" ? `Hola, ${nombre}. El vale queda a nombre del capataz.` : `Hola, ${nombre}. Te mostramos lo que tienen afuera.`}>
          {paso.modo === "salida" ? "¿Para qué cuadrilla?" : "¿Qué cuadrilla vuelve?"}
        </Titulo>
        <div className="flex flex-col gap-2">
          {propias.map((id) => fila(id, "Tu cuadrilla"))}
          {deHoy.map((id) => fila(id, "Según Planificación de hoy"))}
          {(verOtras || propuestas.length === 0) ? resto.map((c) => fila(c.id)) : (
            resto.length > 0 && (
              <button type="button" onClick={() => setVerOtras(true)} className="h-14 rounded-xl text-lg font-semibold underline underline-offset-4">
                Otra cuadrilla…
              </button>
            )
          )}
          {datos.cuadrillas.length === 0 && <Aviso>No pude leer las cuadrillas. Revisá la señal o avisá a un encargado.</Aviso>}
        </div>
      </Pantalla>
    );
  }

  if (paso.p === "cantidad") {
    const a = art(paso.articuloId);
    if (!a) return null;
    const tiene = modo === "vuelta" ? afuera.granel.filter((g) => g.articuloId === a.id).reduce((s, g) => s + g.cantidad, 0) : undefined;
    if (modo === "vuelta" && !tiene) {
      return (
        <Pantalla>
          <BotonVolver onClick={() => setPaso({ p: "escaneo" })}>Volver a escanear</BotonVolver>
          <Aviso>{a.nombre}: no figura con {cuadrilla?.nombre ?? "la cuadrilla"}.</Aviso>
        </Pantalla>
      );
    }
    return (
      <PasoCantidad
        key={a.id}
        datos={datos}
        articulo={a}
        ubicacionId={paso.ubicacionId}
        pregunta={modo === "salida" ? "¿Cuántos llevan?" : "¿Cuántos vuelven?"}
        accion={modo === "salida" ? "Agregar al vale" : "Vuelve"}
        avisarNegativo={modo === "salida"}
        maximo={tiene}
        volverTexto="Volver a escanear"
        onVolver={() => setPaso({ p: "escaneo" })}
        onListo={(e) => {
          setLineas(sumarLinea(lineas, {
            articuloId: e.articulo.id, varianteId: e.varianteId, unidadId: null, cantidad: e.cantidad,
            nombre: nombreConTalle(e.articulo, e.nombreTalle), unidad: e.articulo.unidad, ubicacionId: e.ubicacionId,
          }).lineas);
          mostrar(`${numero(e.cantidad)} ${e.articulo.unidad} · ${nombreConTalle(e.articulo, e.nombreTalle)}`);
          setPaso({ p: "escaneo" });
        }}
      />
    );
  }

  if (paso.p === "lista") {
    return (
      <PasoLista
        datos={datos}
        titulo={datos.cat.ubicaciones.find((u) => u.id === paso.ubicacionId)?.nombre ?? "Estante"}
        sub={modo === "salida" ? "Tocá lo que llevan." : "Tocá lo que vuelve."}
        articulos={paso.articuloIds.map((id) => art(id)).filter((a): a is Articulo => !!a)}
        sinStock={modo === "vuelta"}
        onVolver={() => setPaso({ p: "escaneo" })}
        onElegir={(a) => setPaso({ p: "cantidad", articuloId: a.id, ubicacionId: paso.ubicacionId })}
      />
    );
  }

  if (paso.p === "control") {
    const maquinas = lineas.filter((l) => l.unidadId && esMaquina(art(l.articuloId) ?? { tipo: "insumo", seguridad_critica: false }));
    const faltan = maquinas.filter((m) => !m.estadoVuelta).length;
    const propuestas: Propuesta[] = otHoy ? [{ otId: otHoy, sub: "Hoy, según Planificación" }] : [];
    const n = lineas.length;
    const nHoy = lineas.filter((l) => l.vuelveHoy).length;
    return (
      <Pantalla>
        <BotonVolver onClick={() => setPaso({ p: "escaneo" })}>Seguir escaneando</BotonVolver>
        <Titulo sub="Sólo las máquinas. Lo comparamos cuando vuelvan.">Control de salida</Titulo>
        {maquinas.length === 0 && <p className="text-lg text-muted-foreground">No llevan máquinas: no hay nada que controlar.</p>}
        {maquinas.map((m) => (
          <section key={m.clave} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
            <p className="text-lg font-bold">{m.nombre}</p>
            <p className="text-base text-muted-foreground">¿Cómo sale?</p>
            <div className="grid grid-cols-2 gap-2">
              {(["bien", "incompleta"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={m.estadoVuelta === e}
                  onClick={() => setLineas(actualizarLinea(lineas, m.clave, { estadoVuelta: e, motivo: e === "bien" ? undefined : m.motivo }))}
                  className={cn("h-14 rounded-xl text-lg font-semibold", m.estadoVuelta === e ? "border-2 border-foreground bg-foreground text-background" : "border-2 border-input bg-card")}
                >
                  {e === "bien" ? "Bien" : "Incompleta"}
                </button>
              ))}
            </div>
            {m.estadoVuelta === "incompleta" && (
              <>
                <Chips
                  opciones={MOTIVOS.incompleta}
                  elegidas={(m.motivo ?? "").split(" · ").filter(Boolean)}
                  onToggle={(o) => {
                    const ch = (m.motivo ?? "").split(" · ").filter(Boolean);
                    setLineas(actualizarLinea(lineas, m.clave, { motivo: motivoTexto(ch.includes(o) ? ch.filter((x) => x !== o) : [...ch, o], "") }));
                  }}
                />
                <BotonFoto
                  lista={!!m.fotoPath}
                  onArchivo={async (f) => {
                    try {
                      const path = await subirFotoPanol(f, "salida", idFotos);
                      setLineas((ls) => actualizarLinea(ls, m.clave, { fotoPath: path }));
                    } catch {
                      mostrar("No se pudo subir la foto. Seguí sin foto.", "aviso");
                    }
                  }}
                />
              </>
            )}
          </section>
        ))}
        <SelectorObra titulo="Obra" valor={obra} onChange={setObra} propuestas={propuestas} datos={datos} />
        {error && <Aviso tono="bloqueo">{error}</Aviso>}
        <BotonPrimario
          disabled={procesando || faltan > 0 || n === 0}
          onClick={() =>
            confirmar("retiro", lineas, {
              titulo: `Listo, ${nombre}.`,
              texto: `Vale de ${contar(n, "cosa", "cosas")} a nombre de ${cuadrilla?.nombre ?? "la cuadrilla"}${capataz ? ` (${capataz}, capataz)` : ""}, para ${datos.cortoOt(obra)}.`,
              detalle: nHoy > 0 ? `${nHoy === 1 ? "1 vuelve hoy" : `${nHoy} vuelven hoy`}. El resto queda con la cuadrilla hasta que vuelva.` : "Queda con la cuadrilla hasta que vuelva.",
            }, { p: "control" })
          }
          className="mt-auto"
        >
          {procesando ? "Confirmando…" : faltan > 0 ? `Falta el control de ${contar(faltan, "máquina", "máquinas")}` : enLinea ? "Confirmar salida" : "Guardar · se confirma con señal"}
        </BotonPrimario>
        <p className="text-base text-muted-foreground">Lo firmás vos; queda a nombre de {capataz ? `${capataz}, capataz` : "la cuadrilla"}.</p>
      </Pantalla>
    );
  }

  // ─── Escaneo de salida o de vuelta ──────────────────────────────────────

  if (modo === "salida") {
    return (
      <>
        <Pantalla className="pb-28">
          <BotonVolver onClick={() => setPaso({ p: "cuadrilla", modo })}>Otra cuadrilla</BotonVolver>
          <Titulo sub={cuadrilla ? `${cuadrilla.nombre}${capataz ? ` · ${capataz}` : ""}` : undefined}>Escaneá todo lo que llevan</Titulo>
          {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
          <Escaner onCodigo={procesar} pausado={procesando} className="h-60" />
          {lineas.length === 0 && <p className="text-lg text-muted-foreground">La cámara queda abierta: escaneá una cosa atrás de la otra.</p>}
          <ul className="flex flex-col gap-2">
            {[...lineas].reverse().map((l) => {
              const a = art(l.articuloId);
              const vuelve = a && a.tipo !== "insumo";
              return (
                <li key={l.clave} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold leading-snug">{l.nombre}{!l.unidadId && ` · ${numero(l.cantidad)} ${l.unidad}`}</p>
                      <p className="text-base text-muted-foreground">
                        {a?.tipo === "insumo" ? "Insumo" : a && esMaquina(a) ? "Máquina" : a?.seguridad_critica ? "Equipo · seguridad crítica" : "Equipo"}
                      </p>
                    </div>
                    <button type="button" aria-label={`Sacar ${l.nombre} del vale`} onClick={() => setLineas(quitarLinea(lineas, l.clave))} className="grid size-14 shrink-0 place-items-center rounded-lg border border-input">
                      <X className="size-6" aria-hidden />
                    </button>
                  </div>
                  {vuelve && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-pressed={!!l.vuelveHoy}
                        onClick={() => setLineas(actualizarLinea(lineas, l.clave, { vuelveHoy: !l.vuelveHoy }))}
                        className={cn("h-14 shrink-0 rounded-full px-5 text-base font-semibold", l.vuelveHoy ? "border-2 border-foreground bg-foreground text-background" : "border-2 border-input bg-card")}
                      >
                        Vuelve hoy
                      </button>
                      <span className="text-base text-muted-foreground">
                        {l.vuelveHoy ? "Préstamo del día: tiene que volver hoy." : "Queda con la cuadrilla hasta que vuelva."}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Pantalla>
        {lineas.length > 0 && (
          <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-xl items-center gap-3">
              <p className="min-w-0 flex-1 text-lg font-bold">{contar(lineas.length, "cosa en el vale", "cosas en el vale")}</p>
              <BotonPrimario onClick={() => setPaso({ p: "control" })} className="w-auto px-6">
                Control de salida
              </BotonPrimario>
            </div>
          </div>
        )}
      </>
    );
  }

  // Vuelta
  const volvio = afuera.unidades.filter((u) => vueltas[u.id]);
  const sigue = afuera.unidades.filter((u) => !vueltas[u.id]);
  return (
    <Pantalla>
      <BotonVolver onClick={() => setPaso({ p: "cuadrilla", modo })}>Otra cuadrilla</BotonVolver>
      <Titulo sub={`${capataz ? `${capataz} · ` : ""}${otHoy ? `hoy en ${datos.cortoOt(otHoy)}. ` : ""}Escaneá lo que vuelve.`}>
        Vuelve {cuadrilla?.nombre ?? "la cuadrilla"}
      </Titulo>
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      <Escaner onCodigo={procesar} pausado={procesando} className="h-60" />

      {(volvio.length > 0 || lineas.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Volvió · {volvio.length + lineas.length}</h2>
          {volvio.map((u) => {
            const a = art(u.articulo_id);
            const v = vueltas[u.id];
            const salio = salidas.data?.get(u.id);
            const poner = (c: Partial<Vuelta>) => setVueltas((vs) => ({ ...vs, [u.id]: { ...vs[u.id], ...c } }));
            return (
              <div key={u.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-lg font-semibold">{a?.nombre} #{u.numero}</p>
                  <button type="button" aria-label={`Sacar #${u.numero} de lo que volvió`} onClick={() => setVueltas((vs) => { const c = { ...vs }; delete c[u.id]; return c; })} className="grid size-14 shrink-0 place-items-center rounded-lg border border-input">
                    <X className="size-6" aria-hidden />
                  </button>
                </div>
                {salio?.estado_vuelta && (
                  <p className="text-base text-muted-foreground">
                    Salió: {salio.estado_vuelta === "bien" ? "Bien" : "Incompleta"}{salio.motivo ? ` (${salio.motivo})` : ""}. ¿Cómo vuelve?
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {(["bien", "con_falla", "incompleta"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-pressed={v.estado === e}
                      onClick={() => poner({ estado: e, chips: [] })}
                      className={cn("h-14 rounded-xl px-1 text-base font-semibold", v.estado === e ? "border-2 border-foreground bg-foreground text-background" : "border-2 border-input bg-card")}
                    >
                      {e === "bien" ? "Bien" : e === "con_falla" ? "Con falla" : "Incompleta"}
                    </button>
                  ))}
                </div>
                {v.estado !== "bien" && (
                  <>
                    <Chips opciones={MOTIVOS[v.estado]} elegidas={v.chips} onToggle={(o) => poner({ chips: v.chips.includes(o) ? v.chips.filter((x) => x !== o) : [...v.chips, o] })} />
                    <BotonFoto
                      lista={!!v.foto}
                      onArchivo={async (f) => {
                        try {
                          poner({ foto: await subirFotoPanol(f, "vuelta", idFotos) });
                        } catch {
                          mostrar("No se pudo subir la foto. Seguí sin foto.", "aviso");
                        }
                      }}
                    />
                    <p className="text-base text-muted-foreground">Queda en revisión.</p>
                  </>
                )}
              </div>
            );
          })}
          {lineas.map((l) => (
            <div key={l.clave} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <p className="min-w-0 flex-1 text-lg font-semibold">{l.nombre} · {numero(l.cantidad)} {l.unidad}</p>
              <button type="button" aria-label={`Sacar ${l.nombre}`} onClick={() => setLineas(quitarLinea(lineas, l.clave))} className="grid size-14 shrink-0 place-items-center rounded-lg border border-input">
                <X className="size-6" aria-hidden />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Sigue afuera · {sigue.length + afuera.granel.length}</h2>
        {sigue.length + afuera.granel.length === 0 && <p className="text-lg text-muted-foreground">No tienen nada más a su nombre.</p>}
        <ul className="flex flex-col gap-1.5">
          {sigue.map((u) => {
            const a = art(u.articulo_id);
            return (
              <li key={u.id} className="rounded-xl border border-border px-4 py-2.5 text-lg">
                {a?.nombre} <span className="font-mono">#{u.numero}</span>
                <span className="block text-base text-muted-foreground">{a && esMaquina(a) ? "Máquina" : "Equipo"}</span>
              </li>
            );
          })}
          {afuera.granel.map((g) => {
            const a = art(g.articuloId);
            const talle = datos.cat.variantes.find((v) => v.id === g.varianteId)?.nombre ?? null;
            return (
              <li key={`${g.articuloId}-${g.varianteId}`} className="rounded-xl border border-border px-4 py-2.5 text-lg">
                {a ? nombreConTalle(a, talle) : "Artículo"} · {numero(g.cantidad)} {a?.unidad}
                <span className="block text-base text-muted-foreground">A granel</span>
              </li>
            );
          })}
        </ul>
      </section>

      {error && <Aviso tono="bloqueo">{error}</Aviso>}
      <BotonPrimario disabled={procesando} onClick={cerrarPorHoy} className="mt-auto">
        {procesando ? "Confirmando…" : enLinea ? "Cerrar por hoy" : "Guardar · se confirma con señal"}
      </BotonPrimario>
      <p className="text-base text-muted-foreground">El resto queda con {cuadrilla?.nombre ?? "la cuadrilla"}{capataz ? `, a cargo de ${capataz}` : ""}.</p>
      <BotonSecundario onClick={onInicio} className="w-full">Salir sin registrar</BotonSecundario>
    </Pantalla>
  );
}
