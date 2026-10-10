"use client";

// Retiro con vale y devolución de sobrante (docs §6, flujos 1 y 2).
//
// RETIRO: se escanea un cajón o estante, se elige la cantidad, se suma al vale y se escanea
// lo siguiente; al final, la obra y "Confirmar retiro". Tiene que entrar en 10 segundos
// para el caso común (un cajón, una cantidad), así que todo lo que se pueda deducir se
// deduce: un cajón con un solo artículo va directo a la cantidad, y la obra viene
// propuesta. DEVOLVER SOBRANTE: lo mismo de a un artículo, y en vez de la obra a la que va
// pregunta de qué obra VUELVE, para no inflarle el consumo.

import { useMemo, useState } from "react";
import { PackageX, SearchX, X } from "lucide-react";
import { Escaner } from "@/components/panol/escaner";
import { deshacerVale } from "@/hooks/use-panol";
import {
  confirmarVale, descartarPendiente, guardarUltimaObra, resolverEscaneo, RechazoVale, ultimaObra, useEnLinea, useRetirosDe,
  type DatosKiosco,
} from "@/hooks/use-panol-kiosco";
import {
  armarVale, cambiarCantidad, contar, decidirEscaneo, esErrorDeRed, fechaCorta, numero, obrasDeRetiros, obrasPropuestas,
  quitarLinea, sumarLinea, type LineaVale,
} from "@/lib/panol/kiosco";
import { leerRechazo } from "@/lib/panol/estado";
import type { Articulo, Identidad } from "@/lib/panol/tipos";
import { useKiosco } from "./sesion";
import { ListaObras, SelectorObra, type Propuesta } from "./obra";
import { nombreConTalle, PasoCantidad, PasoLista, PasoSinAlta, type Elegido } from "./pasos";
import { Aviso, BotonPrimario, BotonSecundario, BotonVolver, Pantalla, PantallaListo, Titulo, useAvisoEfimero } from "./ui";

type Paso =
  | { p: "escaneo" }
  | { p: "lista"; titulo: string; sub: string; articuloIds: string[] | null; ubicacionId: string | null }
  | { p: "cantidad"; articuloId: string; ubicacionId: string | null }
  | { p: "sinAlta" }
  | { p: "vale" }
  | { p: "obraDev"; elegido: Elegido }
  | { p: "listo"; titulo: string; texto: string; lineas: string[]; valeId: string | null; clientUuid: string; volverA: Paso };

export function FlujoRetiro({ modo, identidad, datos, onInicio, onTerminar, onUnidad }: {
  modo: "retiro" | "sobrante";
  identidad: Identidad;
  datos: DatosKiosco;
  onInicio: () => void;
  onTerminar: () => void;
  /** Escaneó una herramienta con número: se pasa al flujo de herramienta. */
  onUnidad: (unidadId: string) => void;
}) {
  const { dispositivo } = useKiosco();
  const enLinea = useEnLinea();
  const [paso, setPaso] = useState<Paso>({ p: "escaneo" });
  const [lineas, setLineas] = useState<LineaVale[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { aviso, mostrar } = useAvisoEfimero();
  const [idFotos] = useState(() => crypto.randomUUID());
  const nombre = identidad.nombre.split(" ")[0];

  // La obra propuesta: la de su cuadrilla hoy, o la última que usó en este equipo.
  const otHoy = datos.otHoyDeCuadrilla(identidad.cuadrillaId);
  const [ultima] = useState(() => ultimaObra(identidad.personaTipo, identidad.personaId));
  const propuestas: Propuesta[] = obrasPropuestas(otHoy, ultima || null).map((p) => ({
    otId: p.otId,
    sub: p.motivo === "hoy" ? "Hoy, según Planificación" : "La última que usaste",
  }));
  const [obra, setObra] = useState<number | null>(() => otHoy ?? (ultima ? ultima : null));

  const articulosDelModo = useMemo(
    () => datos.cat.articulos.filter((a) => a.activo && (modo === "retiro" ? a.tipo !== "herramienta" : a.tipo === "insumo")),
    [datos.cat.articulos, modo],
  );
  const porId = (id: string) => datos.cat.articulos.find((a) => a.id === id);

  async function procesar(texto: string) {
    setProcesando(true);
    try {
      const r = await resolverEscaneo(texto, datos);
      const d = decidirEscaneo(r, datos.cat, modo);
      switch (d.ir) {
        case "cantidad":
          setPaso({ p: "cantidad", articuloId: d.articuloId, ubicacionId: d.ubicacionId });
          break;
        case "lista": {
          const u = datos.cat.ubicaciones.find((x) => x.id === d.ubicacionId);
          setPaso({ p: "lista", titulo: u?.nombre ?? "Estante", sub: modo === "retiro" ? "Tocá lo que te llevás." : "Tocá lo que devolvés.", articuloIds: d.articuloIds, ubicacionId: d.ubicacionId });
          break;
        }
        case "unidad":
          if (lineas.length) mostrar("Es una herramienta con número. Confirmá este vale y después usá «Herramienta».", "aviso");
          else onUnidad(d.unidadId);
          break;
        case "persona":
          mostrar(`Esa es una credencial. Si no sos ${nombre}, tocá «No soy ${nombre}».`, "aviso");
          break;
        case "aviso":
          mostrar(d.texto, "aviso");
          break;
      }
    } catch (e) {
      mostrar(esErrorDeRed(e) ? "Sin señal no puedo leer ese código. Usá «No tiene código»." : leerRechazo(e instanceof Error ? e.message : String(e)).texto, "bloqueo");
    } finally {
      setProcesando(false);
    }
  }

  function agregar(e: Elegido) {
    const r = sumarLinea(lineas, {
      articuloId: e.articulo.id,
      varianteId: e.varianteId,
      unidadId: null,
      cantidad: e.cantidad,
      nombre: nombreConTalle(e.articulo, e.nombreTalle),
      unidad: e.articulo.unidad,
      ubicacionId: e.ubicacionId,
    });
    setLineas(r.lineas);
    mostrar(`Agregaste ${numero(e.cantidad)} ${e.articulo.unidad} · ${nombreConTalle(e.articulo, e.nombreTalle)}`);
    setPaso({ p: "escaneo" });
  }

  async function confirmar(tipo: "retiro" | "sobrante", ls: LineaVale[], ot: number | null, textoListo: { titulo: string; texto: string }, volverA: Paso) {
    setError(null);
    setProcesando(true);
    const clientUuid = crypto.randomUUID();
    const vale = armarVale({ tipo, clientUuid, token: identidad.token, dispositivo, lineas: ls, odooOtId: ot });
    try {
      if (tipo === "retiro") guardarUltimaObra(identidad.personaTipo, identidad.personaId, ot);
      const r = await confirmarVale(vale, { resumen: textoListo.texto, quien: identidad.nombre }, datos.nombreDeLugar);
      setPaso({
        p: "listo", ...textoListo, clientUuid, volverA,
        valeId: r.estado === "ok" ? r.valeId : null,
        lineas: ls.map((l) => `${numero(l.cantidad)} ${l.unidad} · ${l.nombre}${l.sinAlta ? " (sin alta)" : ""}`),
      });
    } catch (e) {
      setError(e instanceof RechazoVale ? e.rechazo.texto : String(e));
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
        lineas={modo === "retiro" ? listo.lineas : undefined}
        guardado={!listo.valeId}
        onTerminar={onTerminar}
        onDeshacer={async () => {
          try {
            if (listo.valeId) await deshacerVale(listo.valeId);
            else descartarPendiente(listo.clientUuid);
            setPaso(listo.volverA);
          } catch (e) {
            setError(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
            setPaso(listo.volverA);
          }
        }}
      />
    );
  }

  if (paso.p === "cantidad") {
    const a = porId(paso.articuloId);
    if (!a) return null;
    return (
      <PasoCantidad
        key={a.id}
        datos={datos}
        articulo={a}
        ubicacionId={paso.ubicacionId}
        pregunta={modo === "retiro" ? "¿Cuántos te llevás?" : "¿Cuánto devolvés?"}
        accion={modo === "retiro" ? "Agregar al vale" : "Devolver al stock"}
        avisarNegativo={modo === "retiro"}
        onVolver={() => setPaso({ p: "escaneo" })}
        onListo={(e) => (modo === "retiro" ? agregar(e) : setPaso({ p: "obraDev", elegido: e }))}
      />
    );
  }

  if (paso.p === "lista") {
    const arts = paso.articuloIds ? paso.articuloIds.map(porId).filter((a): a is Articulo => !!a) : articulosDelModo;
    return (
      <PasoLista
        datos={datos}
        titulo={paso.titulo}
        sub={paso.sub}
        articulos={arts}
        onVolver={() => setPaso({ p: "escaneo" })}
        onElegir={(a) => setPaso({ p: "cantidad", articuloId: a.id, ubicacionId: paso.ubicacionId })}
      />
    );
  }

  if (paso.p === "sinAlta") {
    return (
      <PasoSinAlta
        idVale={idFotos}
        obraTexto={datos.cortoOt(obra)}
        onVolver={() => setPaso({ p: "escaneo" })}
        onListo={(s) => {
          setLineas(sumarLinea(lineas, { varianteId: null, unidadId: null, cantidad: s.cantidad, nombre: s.descripcion, unidad: "u.", sinAlta: { descripcion: s.descripcion, fotoPath: s.fotoPath } }).lineas);
          mostrar("Lo sumamos al vale. Los encargados lo van a dar de alta.");
          setPaso({ p: "escaneo" });
        }}
      />
    );
  }

  if (paso.p === "obraDev") {
    return (
      <ObraDeSobrante
        identidad={identidad}
        datos={datos}
        elegido={paso.elegido}
        procesando={procesando}
        error={error}
        enLinea={enLinea}
        onVolver={() => setPaso({ p: "cantidad", articuloId: paso.elegido.articulo.id, ubicacionId: paso.elegido.ubicacionId })}
        onConfirmar={(ot) => {
          const e = paso.elegido;
          const nombreArt = nombreConTalle(e.articulo, e.nombreTalle);
          const linea: LineaVale = {
            clave: "x", articuloId: e.articulo.id, varianteId: e.varianteId, unidadId: null, cantidad: e.cantidad,
            nombre: nombreArt, unidad: e.articulo.unidad, ubicacionId: e.ubicacionId, odooOtId: ot,
          };
          void confirmar("sobrante", [linea], ot, {
            titulo: `Gracias, ${nombre}.`,
            texto: `${numero(e.cantidad)} ${e.articulo.unidad} de ${nombreArt} vuelven al stock, desde ${datos.cortoOt(ot)}.`,
          }, paso);
        }}
      />
    );
  }

  if (paso.p === "vale") {
    return (
      <Pantalla>
        <BotonVolver onClick={() => setPaso({ p: "escaneo" })}>Escanear otro artículo</BotonVolver>
        <Titulo sub={identidad.nombre}>Tu vale</Titulo>
        {lineas.length === 0 && <p className="text-lg text-muted-foreground">Todavía no agregaste nada.</p>}
        <ul className="flex flex-col gap-2">
          {lineas.map((l) => (
            <li key={l.clave} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-lg font-semibold leading-snug">
                  {l.nombre}
                  {l.sinAlta && <span className="block text-base font-normal text-muted-foreground">Sin alta todavía</span>}
                </p>
                <button type="button" aria-label={`Sacar ${l.nombre} del vale`} onClick={() => setLineas(quitarLinea(lineas, l.clave))} className="grid size-14 shrink-0 place-items-center rounded-lg border border-input">
                  <X className="size-6" aria-hidden />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <BotonSecundario onClick={() => setLineas(cambiarCantidad(lineas, l.clave, l.cantidad - 1))} className="w-16" >−</BotonSecundario>
                <span className="min-w-16 text-center font-mono text-3xl font-semibold tabular-nums">{numero(l.cantidad)}</span>
                <BotonSecundario onClick={() => setLineas(cambiarCantidad(lineas, l.clave, l.cantidad + 1))} className="w-16">+</BotonSecundario>
                <span className="text-base text-muted-foreground">{l.unidad}</span>
              </div>
            </li>
          ))}
        </ul>
        <SelectorObra valor={obra} onChange={setObra} propuestas={propuestas} datos={datos} />
        {error && <Aviso tono="bloqueo">{error}</Aviso>}
        <BotonPrimario
          disabled={lineas.length === 0 || procesando}
          onClick={() =>
            confirmar("retiro", lineas, obra, { titulo: `Listo, ${nombre}.`, texto: `${contar(lineas.length, "artículo", "artículos")} para ${datos.cortoOt(obra)}.` }, { p: "vale" })
          }
          className="mt-auto"
        >
          {procesando ? "Confirmando…" : enLinea ? "Confirmar retiro" : "Guardar · se confirma con señal"}
        </BotonPrimario>
      </Pantalla>
    );
  }

  // Escaneo
  return (
    <>
      <Pantalla className="pb-28">
        <BotonVolver onClick={onInicio}>Otra cosa</BotonVolver>
        <Titulo sub={modo === "retiro" ? "Escaneá el cajón o la estantería." : "Devolver sobrante: escaneá el cajón donde va lo que sobró."}>
          {modo === "retiro" ? "Retirar" : "Devolver sobrante"}
        </Titulo>
        {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
        <Escaner onCodigo={procesar} pausado={procesando} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <BotonSecundario onClick={() => setPaso({ p: "lista", titulo: "Buscar por nombre", sub: "Escribí cómo se llama.", articuloIds: null, ubicacionId: null })}>
            <SearchX className="size-5" aria-hidden />
            No tiene código
          </BotonSecundario>
          {modo === "retiro" && (
            <BotonSecundario onClick={() => setPaso({ p: "sinAlta" })}>
              <PackageX className="size-5" aria-hidden />
              Me llevo algo que no está
            </BotonSecundario>
          )}
        </div>
        <p className="text-base text-muted-foreground">Si no tocás nada en un minuto, vuelve a «¿Quién sos?».</p>
      </Pantalla>
      {modo === "retiro" && lineas.length > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tu vale</p>
              <p className="text-lg font-bold">{contar(lineas.length, "artículo", "artículos")}</p>
            </div>
            <BotonPrimario onClick={() => setPaso({ p: "vale" })} className="w-auto px-8">
              Ver vale
            </BotonPrimario>
          </div>
        </div>
      )}
    </>
  );
}

function ObraDeSobrante({ identidad, datos, elegido, procesando, error, enLinea, onVolver, onConfirmar }: {
  identidad: Identidad;
  datos: DatosKiosco;
  elegido: Elegido;
  procesando: boolean;
  error: string | null;
  enLinea: boolean;
  onVolver: () => void;
  onConfirmar: (ot: number | null) => void;
}) {
  const retiros = useRetirosDe(elegido.articulo.id, identidad.personaId);
  const movs = retiros.data ?? [];
  const ots = obrasDeRetiros(movs);
  const propuestas: Propuesta[] = ots.slice(0, 4).map((ot, i) => {
    const fecha = movs.find((m) => m.odoo_ot_id === ot)?.created_at;
    return { otId: ot, sub: i === 0 ? `Tu último retiro de este artículo (${fechaCorta(fecha)})` : `También retiraste para esta obra (${fechaCorta(fecha)})` };
  });
  // Hasta que no elija, vale la del último retiro (o "sin obra" si nunca retiró).
  const [elegida, setElegida] = useState<number | null | undefined>(undefined);
  const valor = elegida === undefined ? (ots[0] ?? null) : elegida;
  const nombreArt = nombreConTalle(elegido.articulo, elegido.nombreTalle);
  return (
    <Pantalla>
      <BotonVolver onClick={onVolver}>Cambiar la cantidad</BotonVolver>
      <Titulo sub={`Devolvés ${numero(elegido.cantidad)} ${elegido.articulo.unidad} de ${nombreArt}. Así no se le cuenta de más a esa obra.`}>
        ¿De qué obra vuelve?
      </Titulo>
      {retiros.isLoading ? (
        <p className="text-lg text-muted-foreground">Buscando tus últimos retiros…</p>
      ) : (
        <ListaObras valor={valor} onChange={setElegida} propuestas={propuestas} datos={datos} subSinObra="No sé de qué obra es" />
      )}
      {error && <Aviso tono="bloqueo">{error}</Aviso>}
      <BotonPrimario disabled={procesando} onClick={() => onConfirmar(valor)} className="mt-auto">
        {procesando ? "Confirmando…" : enLinea ? "Devolver al stock" : "Guardar · se confirma con señal"}
      </BotonPrimario>
    </Pantalla>
  );
}
