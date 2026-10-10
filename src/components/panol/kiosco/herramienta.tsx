"use client";

// Préstamo y devolución de una herramienta con número (docs §6, flujos 3 y 4).
//
// Se escanea la herramienta y la pantalla que sigue depende de DÓNDE FIGURA: en el pañol
// → préstamo; a nombre de quien escanea → devolución; a nombre de otro → "¿te la pasó o
// la devolvés por él?". Lo calcula situacionUnidad con el catálogo en memoria, pero si
// alguien se adelantó desde otro kiosco, la base rechaza con LA_TIENE y se sigue desde
// ahí: el rechazo siempre gana.

import { useState } from "react";
import { OctagonAlert, Wrench } from "lucide-react";
import { Escaner } from "@/components/panol/escaner";
import { deshacerVale, useInvalidarPanol } from "@/hooks/use-panol";
import {
  confirmarVale, deshacerGuardado, guardarUltimaObra, resolverEscaneo, RechazoVale, subirFotoPanol, ultimaObra, useEnLinea,
  type DatosKiosco,
} from "@/hooks/use-panol-kiosco";
import {
  alternativasAlDia, armarVale, articulosDeUbicacion, granelQueTiene, numero, ubicacionDeArticulo, esErrorDeRed, fechaCorta, fechaDeVuelta, motivoTexto, obrasPropuestas, rutaDeUbicacion,
  situacionUnidad, sumarDias, type LineaVale, type OpcionVuelta,
} from "@/lib/panol/kiosco";
import { ESTADO_UNIDAD, hoyBA, leerRechazo, lugarDeCuadrilla, lugarDePersona } from "@/lib/panol/estado";
import type { Articulo, EstadoUnidad, EstadoVuelta, Identidad, TipoVale, Unidad } from "@/lib/panol/tipos";
import { useKiosco } from "./sesion";
import { ListaObras, type Propuesta } from "./obra";
import { nombreConTalle, PasoCantidad } from "./pasos";
import { Aviso, BotonFoto, BotonPrimario, BotonVolver, Chips, Opcion, Pantalla, PantallaListo, Titulo, useAvisoEfimero } from "./ui";

export const MOTIVOS: Record<"con_falla" | "incompleta", string[]> = {
  con_falla: ["No arranca", "Anda mal", "Se corta sola", "Cable dañado", "Hace ruido raro", "Está rota"],
  incompleta: ["Falta la llave", "Falta la empuñadura", "Falta la protección", "Falta la batería", "Falta el cargador", "Falta el maletín"],
};

type Paso =
  | { p: "escaneo" }
  | { p: "prestamo"; unidadId: string }
  | { p: "laTiene"; unidadId: string; lugar: string }
  | { p: "devolucion"; unidadId: string; porOtro: string | null }
  | { p: "falla"; unidadId: string; tipo: "con_falla" | "incompleta"; porOtro: string | null }
  | { p: "bloqueada"; unidadId: string }
  | { p: "granel"; opciones: Granel[]; elegida: Granel | null }
  | { p: "listo"; titulo: string; texto: string; detalle?: string; valeId: string | null; clientUuid: string; volverA: Paso };

/** Lo a granel que tiene quien escanea (o su cuadrilla), listo para devolver. */
type Granel = { articuloId: string; varianteId: string | null; lugar: string; cantidad: number; ubicacionId: string | null };

export function FlujoHerramienta({ identidad, datos, unidadInicial, onInicio, onTerminar }: {
  identidad: Identidad;
  datos: DatosKiosco;
  unidadInicial?: string | null;
  onInicio: () => void;
  onTerminar: () => void;
}) {
  const { dispositivo } = useKiosco();
  const invalidar = useInvalidarPanol();
  const enLinea = useEnLinea();
  const hoy = hoyBA();
  const yo = lugarDePersona(identidad.personaTipo, identidad.personaId);
  const nombre = identidad.nombre.split(" ")[0];
  const { aviso, mostrar } = useAvisoEfimero();
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = (unidadId: string) => {
    const u = datos.cat.unidades.find((x) => x.id === unidadId);
    const a = u ? datos.cat.articulos.find((x) => x.id === u.articulo_id) : undefined;
    return u && a ? { u, a } : null;
  };

  // A dónde lleva una herramienta escaneada.
  const pasoDe = (unidadId: string): Paso | string => {
    const ua = buscar(unidadId);
    if (!ua) return "No encuentro esa herramienta en el catálogo. Probá de nuevo en un momento.";
    const s = situacionUnidad(ua.u, ua.a, yo, hoy);
    switch (s.caso) {
      case "prestar":
        return { p: "prestamo", unidadId };
      case "bloqueada":
        return { p: "bloqueada", unidadId };
      case "devolver":
        return { p: "devolucion", unidadId, porOtro: null };
      case "la_tiene":
        return { p: "laTiene", unidadId, lugar: s.lugar };
      case "no_disponible":
        return `#${ua.u.numero} está ${(ESTADO_UNIDAD[s.estado as EstadoUnidad] ?? s.estado).toLowerCase()}: no se mueve desde el kiosco. Avisá a un encargado.`;
    }
  };

  const [paso, setPaso] = useState<Paso>(() => {
    if (!unidadInicial) return { p: "escaneo" };
    const p = pasoDe(unidadInicial);
    return typeof p === "string" ? { p: "escaneo" } : p;
  });

  function ir(p: Paso | string) {
    setError(null);
    if (typeof p === "string") mostrar(p, "aviso");
    else setPaso(p);
  }

  async function procesar(texto: string) {
    setProcesando(true);
    try {
      const r = await resolverEscaneo(texto, datos);
      if (r.tipo === "unidad") ir(pasoDe(r.id));
      else if (r.tipo === "persona" || r.tipo === "externa") mostrar(`Esa es una credencial. Si no sos ${nombre}, tocá «No soy ${nombre}».`, "aviso");
      else if (r.tipo === "ubicacion" || r.tipo === "articulo") {
        // Un cajón o un artículo a granel (martillos, llaves): si lo tiene él o su cuadrilla,
        // es una devolución por cantidad; si no, es un retiro.
        const ids = r.tipo === "articulo" ? [r.id] : articulosDeUbicacion(datos.cat, r.id, ["granel"]).map((a) => a.id);
        const lugares = [yo, ...(identidad.cuadrillaId ? [lugarDeCuadrilla(identidad.cuadrillaId)] : [])];
        const opciones: Granel[] = granelQueTiene(datos.cat, lugares, ids).map((g) => ({
          ...g, ubicacionId: r.tipo === "ubicacion" ? ubicacionDeArticulo(datos.cat, g.articuloId, r.id) : null,
        }));
        if (opciones.length === 0) mostrar("Eso es un cajón o un insumo: para llevártelo usá «Retirar».", "aviso");
        else setPaso({ p: "granel", opciones, elegida: opciones.length === 1 ? opciones[0] : null });
      }
      else if (r.tipo === "anulado") mostrar("Esa etiqueta fue reemplazada por una nueva. Avisá a un encargado.", "aviso");
      else mostrar("No conozco ese código.", "aviso");
    } catch (e) {
      mostrar(esErrorDeRed(e) ? "Sin señal no puedo leer ese código." : leerRechazo(e instanceof Error ? e.message : String(e)).texto, "bloqueo");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmar(tipo: TipoVale, linea: Omit<LineaVale, "clave">, ot: number | null, listo: { titulo: string; texto: string; detalle?: string }, volverA: Paso) {
    setError(null);
    setProcesando(true);
    const clientUuid = crypto.randomUUID();
    const vale = armarVale({ tipo, clientUuid, token: identidad.token, dispositivo, lineas: [{ ...linea, clave: "x" }], odooOtId: ot });
    try {
      const r = await confirmarVale(vale, { resumen: listo.texto, quien: identidad.nombre }, datos.nombreDeLugar);
      if (r.estado === "ok") invalidar();
      setPaso({ p: "listo", ...listo, clientUuid, volverA, valeId: r.estado === "ok" ? r.valeId : null });
    } catch (e) {
      if (e instanceof RechazoVale && !linea.unidadId) setError(e.rechazo.texto);
      else if (e instanceof RechazoVale) {
        const unidadId = linea.unidadId!;
        // La base sabe algo que el catálogo en memoria no: se sigue desde lo que dijo.
        if (e.rechazo.codigo === "la_tiene") setPaso({ p: "laTiene", unidadId, lugar: e.rechazo.lugar });
        else if (e.rechazo.codigo === "inspeccion_vencida") setPaso({ p: "bloqueada", unidadId });
        else setError(e.rechazo.texto);
      } else setError(String(e));
    } finally {
      setProcesando(false);
    }
  }

  // ─── Pantallas ──────────────────────────────────────────────────────────

  if (paso.p === "listo") {
    const listo = paso;
    return (
      <PantallaListo
        titulo={listo.titulo}
        texto={listo.texto}
        detalle={listo.detalle}
        guardado={!listo.valeId}
        onTerminar={onTerminar}
        onDeshacer={async () => {
          try {
            if (listo.valeId) await deshacerVale(listo.valeId);
            else await deshacerGuardado(listo.clientUuid);
            invalidar();
          } catch (e) {
            setError(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
          }
          setPaso(listo.volverA);
        }}
      />
    );
  }

  if (paso.p === "granel") {
    const g = paso.elegida;
    const a = g ? datos.cat.articulos.find((x) => x.id === g.articuloId) : undefined;
    const de = (lugar: string) => (lugar === yo ? "lo tenés vos" : `lo tiene ${datos.nombreDeLugar(lugar)}`);
    if (!g || !a) {
      return (
        <Pantalla>
          <BotonVolver onClick={() => setPaso({ p: "escaneo" })}>Escanear otra</BotonVolver>
          <Titulo sub="Tocá lo que devolvés.">¿Qué devolvés?</Titulo>
          {paso.opciones.map((o) => {
            const ao = datos.cat.articulos.find((x) => x.id === o.articuloId);
            const talle = datos.cat.variantes.find((v) => v.id === o.varianteId)?.nombre ?? null;
            return (
              <Opcion
                key={`${o.articuloId}-${o.varianteId}-${o.lugar}`}
                titulo={ao ? nombreConTalle(ao, talle) : "Artículo"}
                sub={`${numero(o.cantidad)} ${ao?.unidad ?? ""} · ${de(o.lugar)}`}
                onClick={() => setPaso({ ...paso, elegida: o })}
              />
            );
          })}
        </Pantalla>
      );
    }
    const talle = datos.cat.variantes.find((v) => v.id === g.varianteId)?.nombre ?? null;
    return (
      <>
        <PasoCantidad
          key={`${g.articuloId}-${g.lugar}`}
          datos={datos}
          articulo={{ ...a, tiene_talles: false }}
          ubicacionId={g.ubicacionId}
          pregunta="¿Cuántos devolvés?"
          tieneTexto={g.lugar === yo ? "Tenés" : `Lo tiene ${datos.nombreDeLugar(g.lugar)}:`}
          accion={procesando ? "Confirmando…" : enLinea ? "Devolver al pañol" : "Guardar · se confirma con señal"}
          avisarNegativo={false}
          maximo={g.cantidad}
          volverTexto="Escanear otra"
          onVolver={() => setPaso({ p: "escaneo" })}
          onListo={(e) => {
            if (procesando) return;
            const nombreArt = nombreConTalle(a, talle);
            void confirmar("devolucion", {
              articuloId: a.id, varianteId: g.varianteId, unidadId: null, cantidad: e.cantidad, nombre: nombreArt, unidad: a.unidad,
              desde: g.lugar, ubicacionId: g.ubicacionId,
            }, null, {
              titulo: `Gracias, ${nombre}.`,
              texto: `${numero(e.cantidad)} ${a.unidad} de ${nombreArt} vuelven al pañol.`,
              detalle: e.cantidad < g.cantidad ? `${g.lugar === yo ? "Te quedan" : "Le quedan a la cuadrilla"} ${numero(g.cantidad - e.cantidad)}.` : undefined,
            }, paso);
          }}
        />
        {error && (
          <div className="mx-auto w-full max-w-xl px-4 pb-4">
            <Aviso tono="bloqueo">{error}</Aviso>
          </div>
        )}
      </>
    );
  }

  if (paso.p !== "escaneo") {
    const ua = buscar(paso.unidadId);
    if (!ua) return null;
    const { u, a } = ua;
    const volver = () => setPaso({ p: "escaneo" });

    if (paso.p === "prestamo") {
      return (
        <Prestamo
          key={u.id}
          u={u} a={a} identidad={identidad} datos={datos} hoy={hoy} procesando={procesando} error={error} enLinea={enLinea}
          onVolver={volver}
          onConfirmar={(ot, venceEl, cuando) => {
            guardarUltimaObra(identidad.personaTipo, identidad.personaId, ot);
            void confirmar("retiro", { articuloId: a.id, varianteId: null, unidadId: u.id, cantidad: 1, nombre: a.nombre, unidad: "u.", venceEl }, ot, {
              titulo: `Listo, ${nombre}.`,
              texto: `Te llevás ${a.nombre} #${u.numero} para ${datos.cortoOt(ot)}.`,
              detalle: cuando,
            }, paso);
          }}
        />
      );
    }

    if (paso.p === "laTiene") {
      const quien = datos.nombreDeLugar(paso.lugar);
      return (
        <Pantalla>
          <BotonVolver onClick={volver}>Escanear otra</BotonVolver>
          <TarjetaUnidad u={u} a={a} estado="Prestada" />
          <Titulo sub={`Desde el ${fechaCorta(u.desde_at)}${u.odoo_ot_id ? ` · ${datos.tituloOt(u.odoo_ot_id)}` : ""}. ¿Qué pasa con ella?`}>
            La tiene {quien}
          </Titulo>
          {error && <Aviso tono="bloqueo">{error}</Aviso>}
          <Opcion
            titulo="Me la pasó"
            sub="Queda a tu nombre, en la misma obra"
            onClick={() =>
              void confirmar("transferencia", { articuloId: a.id, varianteId: null, unidadId: u.id, cantidad: 1, nombre: a.nombre, unidad: "u.", venceEl: u.vence_el, odooOtId: u.odoo_ot_id }, u.odoo_ot_id, {
                titulo: "Ahora la tenés vos.",
                texto: `${a.nombre} #${u.numero} pasó de ${quien} a tu nombre.`,
                detalle: [u.odoo_ot_id ? `Sigue en ${datos.tituloOt(u.odoo_ot_id)}.` : "", u.vence_el ? `Vuelve cuando dijo ${quien}: ${fechaCorta(u.vence_el, true)}.` : ""].filter(Boolean).join(" ") || undefined,
              }, paso)
            }
          />
          <Opcion titulo="La devuelvo por él" sub="Queda registrado que la trajiste vos" onClick={() => setPaso({ p: "devolucion", unidadId: u.id, porOtro: paso.lugar })} />
        </Pantalla>
      );
    }

    if (paso.p === "devolucion") {
      const quien = paso.porOtro ? datos.nombreDeLugar(paso.porOtro) : null;
      const dondeVa = rutaDeUbicacion(datos.cat.ubicaciones, u.ubicacion_id ?? a.ubicacion_id);
      return (
        <Pantalla>
          <BotonVolver onClick={volver}>Escanear otra</BotonVolver>
          <TarjetaUnidad u={u} a={a} estado="Prestada" />
          <Titulo
            sub={quien ? `La tenía ${quien} desde el ${fechaCorta(u.desde_at)} · la traés vos` : `La tenés desde el ${fechaCorta(u.desde_at)}${u.odoo_ot_id ? ` · ${datos.cortoOt(u.odoo_ot_id)}` : ""}`}
          >
            ¿En qué estado vuelve?
          </Titulo>
          {error && <Aviso tono="bloqueo">{error}</Aviso>}
          <Opcion
            titulo="Bien"
            sub="Funciona y está completa"
            onClick={() =>
              void confirmar("devolucion", { articuloId: a.id, varianteId: null, unidadId: u.id, cantidad: 1, nombre: a.nombre, unidad: "u.", estadoVuelta: "bien" }, u.odoo_ot_id, {
                titulo: `Gracias, ${nombre}.`,
                texto: `${a.nombre} #${u.numero} vuelve al pañol.${quien ? ` Queda registrado que la trajiste por ${quien}.` : ""}`,
                detalle: dondeVa ? `Dejala en ${dondeVa}.` : undefined,
              }, paso)
            }
          />
          <Opcion titulo="Con falla" sub="No anda o anda mal" onClick={() => setPaso({ p: "falla", unidadId: u.id, tipo: "con_falla", porOtro: paso.porOtro })} />
          <Opcion titulo="Incompleta" sub="Le falta una pieza o el maletín" onClick={() => setPaso({ p: "falla", unidadId: u.id, tipo: "incompleta", porOtro: paso.porOtro })} />
        </Pantalla>
      );
    }

    if (paso.p === "falla") {
      return (
        <Falla
          key={`${u.id}-${paso.tipo}`}
          u={u} a={a} tipo={paso.tipo} procesando={procesando} error={error} enLinea={enLinea}
          onVolver={() => setPaso({ p: "devolucion", unidadId: u.id, porOtro: paso.porOtro })}
          onConfirmar={(motivo, fotoPath) =>
            void confirmar("devolucion", {
              articuloId: a.id, varianteId: null, unidadId: u.id, cantidad: 1, nombre: a.nombre, unidad: "u.",
              estadoVuelta: paso.tipo as EstadoVuelta, motivo: motivo || (paso.tipo === "con_falla" ? "Con falla" : "Incompleta"), fotoPath,
            }, u.odoo_ot_id, {
              titulo: "Queda en revisión.",
              texto: "Va a la bandeja de los encargados del pañol. No la cuelgues: dejala en el estante de revisión.",
              detalle: (motivo || (paso.tipo === "con_falla" ? "Con falla" : "Incompleta")) + (fotoPath ? " · con foto" : ""),
            }, paso)
          }
        />
      );
    }

    if (paso.p === "bloqueada") {
      const otras = alternativasAlDia(datos.cat.unidades, a, u.id, hoy);
      return (
        <Pantalla>
          <TarjetaUnidad u={u} a={a} estado="Seguridad crítica" />
          <div className="flex flex-col gap-2 rounded-xl border-2 border-red-500/50 bg-red-500/10 p-4 text-red-900 dark:text-red-100">
            <p className="flex items-center gap-2 text-2xl font-bold">
              <OctagonAlert className="size-7" aria-hidden />
              No se puede prestar
            </p>
            <p className="text-lg">
              La inspección de seguridad {u.proxima_inspeccion ? `venció el ${fechaCorta(u.proxima_inspeccion)}` : "está vencida"}. Dejala en el estante rojo y avisá a un encargado del pañol.
            </p>
          </div>
          {otras.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xl font-bold">Llevate otra: estas están al día</h2>
              <ul className="flex flex-col gap-1.5">
                {otras.slice(0, 6).map((o) => (
                  <li key={o.id} className="rounded-xl border border-border bg-card px-4 py-3 text-lg">
                    <span className="font-mono font-semibold">#{o.numero}</span>
                    {rutaDeUbicacion(datos.cat.ubicaciones, o.ubicacion_id ?? a.ubicacion_id) && (
                      <span className="text-muted-foreground"> · {rutaDeUbicacion(datos.cat.ubicaciones, o.ubicacion_id ?? a.ubicacion_id)}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-base text-muted-foreground">Escaneala y seguís con el préstamo.</p>
            </section>
          ) : (
            <Aviso>No hay otra al día en el pañol. Pedile a un encargado.</Aviso>
          )}
          <BotonPrimario onClick={volver} className="mt-auto">
            Escanear otra herramienta
          </BotonPrimario>
        </Pantalla>
      );
    }
  }

  // Escaneo
  return (
    <Pantalla>
      <BotonVolver onClick={onInicio}>Otra cosa</BotonVolver>
      <Titulo sub="Escaneá la herramienta que te llevás o que devolvés. Lo a granel que tenés (martillos, llaves) se devuelve escaneando su cajón.">Herramienta</Titulo>
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      <Escaner onCodigo={procesar} pausado={procesando} />
    </Pantalla>
  );
}

function TarjetaUnidad({ u, a, estado }: { u: Unidad; a: Articulo; estado: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted">
        <Wrench className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-tight">{a.nombre}</p>
        <p className="font-mono text-base text-muted-foreground">
          #{u.numero}
          {u.marca_modelo ? ` · ${u.marca_modelo}` : ""}
        </p>
      </div>
      <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">{estado}</span>
    </div>
  );
}

function Prestamo({ u, a, identidad, datos, hoy, procesando, error, enLinea, onVolver, onConfirmar }: {
  u: Unidad;
  a: Articulo;
  identidad: Identidad;
  datos: DatosKiosco;
  hoy: string;
  procesando: boolean;
  error: string | null;
  enLinea: boolean;
  onVolver: () => void;
  onConfirmar: (ot: number | null, venceEl: string | null, cuando: string) => void;
}) {
  const otHoy = datos.otHoyDeCuadrilla(identidad.cuadrillaId);
  const [ultima] = useState(() => ultimaObra(identidad.personaTipo, identidad.personaId));
  const propuestas: Propuesta[] = obrasPropuestas(otHoy, ultima || null).map((p) => ({
    otId: p.otId,
    sub: p.motivo === "hoy" ? "Hoy, según Planificación" : "La última que usaste",
  }));
  const [obra, setObra] = useState<number | null>(() => otHoy ?? (ultima ? ultima : null));
  const [vuelta, setVuelta] = useState<OpcionVuelta>("manana");
  const [fecha, setFecha] = useState(sumarDias(hoy, 7));
  const vence = fechaDeVuelta(vuelta, hoy, fecha);
  const OPCIONES: { id: OpcionVuelta; titulo: string; sub: string }[] = [
    { id: "hoy", titulo: "Hoy", sub: fechaCorta(hoy, true) },
    { id: "manana", titulo: "Mañana", sub: fechaCorta(sumarDias(hoy, 1), true) },
    { id: "fin", titulo: "Fin de obra", sub: "Sin fecha fija" },
    { id: "fecha", titulo: "Elegir fecha", sub: "Otro día" },
  ];
  const cuando = vuelta === "fin" ? "Vuelve al terminar la obra." : vence === hoy ? "Vuelve hoy." : vence ? `Vuelve el ${fechaCorta(vence, true)}.` : "";

  return (
    <Pantalla>
      <BotonVolver onClick={onVolver}>Escanear otra</BotonVolver>
      <TarjetaUnidad u={u} a={a} estado="Disponible" />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">¿Para qué obra?</h2>
        <ListaObras valor={obra} onChange={setObra} propuestas={propuestas} datos={datos} subSinObra="Para usar acá" />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">¿Cuándo vuelve?</h2>
        <div className="grid grid-cols-2 gap-2">
          {OPCIONES.map((o) => (
            <Opcion key={o.id} titulo={o.titulo} sub={o.sub} seleccionada={vuelta === o.id} onClick={() => setVuelta(o.id)} />
          ))}
        </div>
        {vuelta === "fecha" && (
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">Fecha de devolución</span>
            <input
              type="date"
              min={hoy}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-14 rounded-xl border-2 border-input bg-background px-4 text-lg outline-none focus-visible:border-ring"
            />
          </label>
        )}
      </section>
      {error && <Aviso tono="bloqueo">{error}</Aviso>}
      <BotonPrimario disabled={procesando || (vuelta === "fecha" && !vence)} onClick={() => onConfirmar(obra, vence, cuando)} className="mt-auto">
        {procesando ? "Confirmando…" : enLinea ? "Confirmar préstamo" : "Guardar · se confirma con señal"}
      </BotonPrimario>
    </Pantalla>
  );
}

function Falla({ u, a, tipo, procesando, error, enLinea, onVolver, onConfirmar }: {
  u: Unidad;
  a: Articulo;
  tipo: "con_falla" | "incompleta";
  procesando: boolean;
  error: string | null;
  enLinea: boolean;
  onVolver: () => void;
  onConfirmar: (motivo: string, fotoPath?: string) => void;
}) {
  const [chips, setChips] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<string | undefined>();
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [idFoto] = useState(() => crypto.randomUUID());
  return (
    <Pantalla>
      <BotonVolver onClick={onVolver}>Cambiar estado</BotonVolver>
      <Titulo sub={`${a.nombre} · #${u.numero}`}>{tipo === "con_falla" ? "¿Qué le pasa?" : "¿Qué le falta?"}</Titulo>
      <Chips opciones={MOTIVOS[tipo]} elegidas={chips} onToggle={(m) => setChips((c) => (c.includes(m) ? c.filter((x) => x !== m) : [...c, m]))} />
      <label className="flex flex-col gap-2">
        <span className="text-lg font-semibold">Contalo en pocas palabras (si querés)</span>
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="rounded-xl border-2 border-input bg-background p-4 text-lg outline-none focus-visible:border-ring" />
      </label>
      <BotonFoto
        lista={!!foto}
        subiendo={subiendo}
        onArchivo={async (f) => {
          setSubiendo(true);
          setErrorFoto(null);
          try {
            setFoto(await subirFotoPanol(f, "devolucion", idFoto));
          } catch {
            setErrorFoto("No se pudo subir la foto. Seguí sin foto.");
          } finally {
            setSubiendo(false);
          }
        }}
      />
      {errorFoto && <Aviso>{errorFoto}</Aviso>}
      {error && <Aviso tono="bloqueo">{error}</Aviso>}
      <BotonPrimario disabled={procesando || subiendo} onClick={() => onConfirmar(motivoTexto(chips, nota), foto)} className="mt-auto">
        {procesando ? "Registrando…" : enLinea ? "Registrar devolución" : "Guardar · se confirma con señal"}
      </BotonPrimario>
    </Pantalla>
  );
}
