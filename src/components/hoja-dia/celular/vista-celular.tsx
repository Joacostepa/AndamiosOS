"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { esHoy, minutosDesde, diaSemana } from "@/lib/hoja-dia/estado";
import type { ArchivoPublico, CoordinadorPublico, VistaCapataz, VistaChofer, VistaPublica, ViajePublico } from "@/lib/hoja-dia/vista";
import { aplicarPendientes, horaDe, partirTexto } from "./aplicar";
import { Capa } from "./capa";
import { Llamar, LlamarCoordinador, Obra, Trozos, cx } from "./piezas";
import type { AccionesCelular, Conexion, Pendiente, ResultadoToque } from "./tipos";
import { Visor } from "./visor";
import s from "./celular.module.css";

// La hoja del día en el celular del capataz y del chofer (§12 de modulo.md), exactamente
// como la maqueta aprobada (capatazHTML, choferHTML, linkSituacion). Sirve para el link
// /h/[token] (con `acciones`) y para la vista previa del escritorio ("Ver como Ortega",
// con `preview`): llena el alto de su contenedor, así que va dentro de un marco o de una
// pantalla entera.

export type VistaCelularProps = {
  vista: VistaPublica;
  /** Vista previa del escritorio: no toca nada y el pie dice quién lo toca. */
  preview?: boolean;
  /** Lo que el link puede hacer (Recibido, Entendido, Hecho, No pude). Sin esto no se toca nada. */
  acciones?: AccionesCelular;
  /** Toques que todavía no confirmó el servidor (en camino o esperando señal). */
  pendientes?: Pendiente[];
  /** Si lo que se ve es lo guardado en el teléfono. */
  conexion?: Conexion;
  /** El reloj (ms) para saber si la hoja es de hoy o de mañana. Por defecto, la hora del teléfono. */
  ahora?: number;
  /** Para "Llamar a …" cuando el link no dice quién coordina (inválido): el último conocido. */
  coordinadorConocido?: CoordinadorPublico | null;
};

type Toast = { msg: string; deshacer?: () => void };
type Hoja = { t: "nopudo"; viajeId: string } | { t: "nopudoOk"; off: boolean };
type VisorAbierto = { archivos: ArchivoPublico[]; i: number; titulo: string };

export function VistaCelular({ vista: original, preview = false, acciones, pendientes = [], conexion, ahora, coordinadorConocido }: VistaCelularProps) {
  const [reloj, setReloj] = useState(() => ahora ?? Date.now());
  useEffect(() => {
    if (ahora != null) return;
    const id = setInterval(() => setReloj(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [ahora]);
  const ms = ahora ?? reloj;

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrar = (t: Toast | null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    if (t) toastTimer.current = setTimeout(() => setToast(null), t.deshacer ? 10_000 : 2_800);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [visor, setVisor] = useState<VisorAbierto | null>(null);
  const abrirVisor = (archivos: ArchivoPublico[], i: number, titulo: string) => setVisor({ archivos, i, titulo });

  const vista = aplicarPendientes(original, pendientes);
  const cola = pendientes.filter((p) => p.estado === "cola");
  const interactivo = !preview && !!acciones;

  const toastNode = (
    <div role="status" aria-live="polite">
      {toast && (
        <div className={s.ttoast}>
          <span>{toast.msg}</span>
          {toast.deshacer && <button type="button" onClick={() => { const f = toast.deshacer; mostrar(null); f?.(); }}>Deshacer</button>}
        </div>
      )}
    </div>
  );

  let cuerpo: ReactNode;
  if (vista.situacion !== "ok") {
    cuerpo = <Situacion vista={vista} conexion={conexion} coordinadorConocido={coordinadorConocido} />;
  } else if (vista.rol === "a_cargo") {
    cuerpo = (
      <Capataz
        v={vista} preview={preview} interactivo={interactivo} conexion={conexion} cola={cola} toast={toastNode} onVisor={abrirVisor}
        tocar={async (accion) => {
          if (!acciones) return;
          const r = await acciones.tocar({ accion, version: vista.version });
          if (r.k === "ok") mostrar({ msg: `${accion === "entendido" ? "Entendido" : "Listo"}. ${vista.coordinador.nombre} ya lo ve.` });
          else if (r.k === "error") mostrar({ msg: r.error });
        }}
      />
    );
  } else {
    cuerpo = (
      <Chofer
        v={vista} preview={preview} interactivo={interactivo} conexion={conexion} cola={cola} toast={toastNode} hoy={esHoy(minutosDesde(vista.fecha, ms))}
        acciones={acciones} mostrar={mostrar} onVisor={abrirVisor} pendientes={pendientes}
      />
    );
  }

  return (
    <div className={s.raiz} data-hoja-celular="">
      {cuerpo}
      {visor && <Visor archivos={visor.archivos} inicio={visor.i} titulo={visor.titulo} onCerrar={() => setVisor(null)} />}
    </div>
  );
}

// ═══════════════════════════ Franjas de arriba ════════════════════════════════

function Franjas({ conexion, preview, enviada }: { conexion?: Conexion; preview: boolean; enviada: boolean }) {
  return (
    <>
      {conexion?.sinConexion && (
        <div className={s.offbar} role="status">
          {conexion.sinActualizar ? "No se pudo actualizar" : "Sin conexión"}{conexion.desde ? ` · lo que ves es de las ${conexion.desde}` : ""}
        </div>
      )}
      {preview && !enviada && <div className={s.prevw}>Vista previa · todavía no se mandó</div>}
    </>
  );
}

// ═══════════════════════════ Situaciones del link ═════════════════════════════

function Situacion({ vista, conexion, coordinadorConocido }: { vista: Exclude<VistaPublica, { situacion: "ok" }>; conexion?: Conexion; coordinadorConocido?: CoordinadorPublico | null }) {
  let titulo: string;
  let bajada: string | null;
  let antes: string | null = null;
  let coord: CoordinadorPublico | null = coordinadorConocido ?? null;
  if (vista.situacion === "invalido") {
    titulo = "El link no es válido.";
    bajada = `Puede estar mal copiado o haberse anulado. Pedile la hoja a ${coord?.nombre ?? "la oficina"}.`;
  } else {
    ({ titulo, bajada } = partirTexto(vista.texto));
    coord = vista.coordinador ?? coord;
    if (vista.situacion === "suspendida") antes = `${vista.fechaTxt} · ${vista.cuadrilla}`;
  }
  return (
    <>
      {conexion?.sinConexion && <div className={s.offbar} role="status">Sin conexión{conexion.desde ? ` · lo que ves es de las ${conexion.desde}` : ""}</div>}
      <div className={s.tel}>
        <div className={s.tmsg}>
          {antes && <p className={s.fuerte}>{antes}</p>}
          <h2>{titulo}</h2>
          {bajada && <p>{bajada}</p>}
          {coord && <LlamarCoordinador coordinador={coord} />}
        </div>
      </div>
    </>
  );
}

/** "Sin conexión. Todavía no se descargó tu hoja." (maqueta sinDescargar). */
export function SinDescargar({ coordinador }: { coordinador: CoordinadorPublico | null }) {
  return (
    <div className={s.raiz} data-hoja-celular="">
      <div className={s.offbar} role="status">Sin conexión</div>
      <div className={s.tel}>
        <div className={s.tmsg}>
          <h2>Sin conexión. Todavía no se descargó tu hoja.</h2>
          <p>Abrí el link cuando tengas señal, o llamá a {coordinador?.nombre ?? "la oficina"}.</p>
          {coordinador && <LlamarCoordinador coordinador={coordinador} />}
        </div>
      </div>
    </div>
  );
}

/** Mientras carga la primera vez, o si el servidor no contestó y no hay nada guardado. */
export function MensajeCelular({ titulo, texto, onReintentar }: { titulo: string; texto?: string; onReintentar?: () => void }) {
  return (
    <div className={s.raiz} data-hoja-celular="">
      <div className={s.tel}>
        <div className={s.tmsg} aria-busy={!onReintentar}>
          <h2>{titulo}</h2>
          {texto && <p>{texto}</p>}
          {onReintentar && <button type="button" className={cx(s.tbtn, s.full)} onClick={onReintentar}>Probar de nuevo</button>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ El capataz ═══════════════════════════════════════

function Capataz({
  v, preview, interactivo, conexion, cola, toast, onVisor, tocar,
}: {
  v: VistaCapataz; preview: boolean; interactivo: boolean; conexion?: Conexion; cola: Pendiente[]; toast: ReactNode;
  onVisor: (a: ArchivoPublico[], i: number, t: string) => void; tocar: (a: "recibido" | "entendido") => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const recCola = cola.find((p) => p.toque.accion === "recibido" || p.toque.accion === "entendido");
  // Con contratistas, "Van 5" no es la cantidad de nombres: la gente de un contratista va
  // como "3 de Quintana" (sin nombres). Las vistas viejas guardadas no traen `van`.
  const nVan = v.van ?? v.gente.reduce((s, g) => s + (g.cantidad ?? 1), 0);
  const primera = v.obras[0];
  const choferLleva = v.chofer?.modo === "lleva_trae" && v.chofer.nombre ? v.chofer : null;
  const boton = async (a: "recibido" | "entendido") => {
    if (enviando) return;
    setEnviando(true);
    try { await tocar(a); } finally { setEnviando(false); }
  };

  let pie: ReactNode;
  if (preview) pie = <div className={cx(s.rec, s.gris)}>Vista previa: «Recibido» lo toca {v.persona}</div>;
  else if (!v.enviada) pie = <div className={cx(s.rec, s.gris)}>Todavía no se mandó</div>;
  else if (recCola) pie = <div className={cx(s.rec, s.pend)}>{recCola.toque.accion === "entendido" ? "Entendido" : "Recibido"} · se manda cuando vuelva la señal</div>;
  else if (v.cambio) pie = <button type="button" className={cx(s.tbtn, s.cor, s.full)} disabled={!interactivo || enviando} onClick={() => boton("entendido")}>Entendido</button>;
  else if (v.recibido) pie = <div className={cx(s.rec, s.ok)}>{v.recibido.entendido ? "Entendido" : "Recibido"} {v.recibido.hora}</div>;
  else pie = <button type="button" className={cx(s.tbtn, s.cor, s.full)} disabled={!interactivo || enviando} onClick={() => boton("recibido")}>Recibido</button>;

  return (
    <>
      <Franjas conexion={conexion} preview={preview} enviada={v.enviada} />
      <main className={s.tel}>
        <div className={s.telIn}>
          <header className={s.top}>
            <span className={s.d}>{v.fechaTxt} · {v.cuadrilla}</span>
            <h1 className={s.h}>A cargo: {v.vos ? `vos (${v.persona})` : `${v.aCargo ?? "nadie"} · la hoja te llega a vos`}</h1>
          </header>
          {v.cambio && (
            <div className={s.chg} role="alert">
              <span className={s.k}>{v.cambio.titulo}</span>
              <span className={s.v}>{v.cambio.txt}</span>
            </div>
          )}
          <div className={s.res}>
            <div className={s.r}><span className={s.tk}>Encuentro</span><span className={s.big}>{v.encuentro}</span></div>
            {v.chofer?.lineas.map((l, i) => <div key={i} className={s.v}><Trozos l={l} /></div>)}
            <hr />
            {primera && (
              <div className={s.r}>
                <span className={s.tk}>{v.obras.length > 1 ? `${v.obras.length} obras` : "Obra"}</span>
                <span className={s.v}><b>{primera.hora} · {primera.direccion}</b>{v.obras.length > 1 ? ` y ${v.obras.length - 1} más` : ""}</span>
              </div>
            )}
            <div className={s.r}>
              <span className={s.tk}>Van {nVan}</span>
              <span className={s.v}>
                {v.gente.map((g, i) => (
                  <span key={i}>
                    {i > 0 && (v.gente[i - 1].contratista ? " + " : ", ")}
                    {g.contratista ? (g.cantidad ? `${g.cantidad} de ${g.nombre}` : g.nombre) : g.nombre}
                    {g.chofer && " (chofer)"}
                    {g.nuevo && <> <span className={cx(s.tag, s.nuevo)}>nuevo</span></>}
                  </span>
                ))}
              </span>
            </div>
            {v.tuPedido && !conexion?.sinConexion && (
              <div className={s.r}>
                <span className={s.tk}>{v.tuPedido.k}</span>
                <span className={s.v}>{v.tuPedido.que}: <b className={v.tuPedido.tono === "ok" ? s.okTx : v.tuPedido.tono === "no" ? s.noTx : undefined}>{v.tuPedido.estado}</b></span>
              </div>
            )}
          </div>
          {v.nota && <div className={s.tnota}>{v.nota}</div>}
          {v.obras.map((o, i) => <Obra key={o.otId} o={o} abierta={i === 0} onVisor={onVisor} />)}
          <section className={s.tq} aria-labelledby="hd-quienes">
            <h3 id="hd-quienes">Quiénes van ({nVan})</h3>
            {v.gente.map((g, i) => (
              <div key={i} className={s.p}>
                <span className={s.t}>
                  <b>{g.contratista ? (g.cantidad ? `${g.cantidad} de ${g.nombre}` : `${g.nombre} (a confirmar cuántos)`) : g.nombre}</b>
                  {!g.contratista && g.pila && <> · {g.pila}</>}
                  {g.aCargo && <> <span className={cx(s.tag, s.cargo)}>a cargo</span></>}
                  {g.chofer && <> <span className={cx(s.tag, s.cargo)}>chofer</span></>}
                  {g.nuevo && <> <span className={cx(s.tag, s.nuevo)}>nuevo</span></>}
                  {g.nota && <small>{g.nota}</small>}
                </span>
                {g.nombre !== v.persona && g.telefono && <Llamar nombre={g.nombre} telefono={g.telefono} texto="Llamar" />}
              </div>
            ))}
            {choferLleva && (
              <div className={s.p}>
                <span className={s.t}><b>{choferLleva.nombre}</b> <span className={cx(s.tag, s.cargo)}>chofer</span><small>{choferLleva.rol}</small></span>
                {choferLleva.telefono && <Llamar nombre={choferLleva.nombre!} telefono={choferLleva.telefono} texto="Llamar" />}
              </div>
            )}
          </section>
          <div className={s.tfalta}>
            <p>¿Falta alguien, falta material o hay un problema?</p>
            <LlamarCoordinador coordinador={v.coordinador} />
          </div>
        </div>
      </main>
      <footer className={s.foot}>{!preview && toast}{pie}</footer>
    </>
  );
}

// ═══════════════════════════ El chofer ════════════════════════════════════════

const enColaDe = (cola: Pendiente[]) => new Map(cola.flatMap((p) => ("viajeId" in p.toque && p.toque.accion !== "deshacer" ? [[p.toque.viajeId, p] as const] : [])));

function Chofer({
  v, preview, interactivo, conexion, cola, pendientes, toast, hoy, acciones, mostrar, onVisor,
}: {
  v: VistaChofer; preview: boolean; interactivo: boolean; conexion?: Conexion; cola: Pendiente[]; pendientes: Pendiente[]; toast: ReactNode; hoy: boolean;
  acciones?: AccionesCelular; mostrar: (t: Toast | null) => void; onVisor: (a: ArchivoPublico[], i: number, t: string) => void;
}) {
  const [exp, setExp] = useState<string | null>(null);
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fotoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fotoTimer.current) clearTimeout(fotoTimer.current); }, []);

  const coord = v.coordinador;
  const enCola = enColaDe(cola);
  const recCola = cola.some((p) => p.toque.accion === "recibido" || p.toque.accion === "entendido");
  const vigentes = v.viajes.filter((x) => x.estado !== "anulado");
  const pend = vigentes.filter((x) => x.estado === "planeado" && !enCola.has(x.id));
  const hechos = vigentes.filter((x) => (x.estado === "hecho" || x.estado === "no_pudo") && !enCola.has(x.id));
  const ahora = hoy ? pend[0] ?? null : null;
  const despues = hoy ? pend.slice(1) : pend;
  const enviandoAlgo = pendientes.some((p) => p.estado === "enviando");

  const tocar = async (t: Parameters<AccionesCelular["tocar"]>[0]): Promise<ResultadoToque | null> => {
    if (!acciones || ocupado) return null;
    setOcupado(true);
    try { return await acciones.tocar(t); } finally { setOcupado(false); }
  };

  const hecho = async (x: ViajePublico) => {
    setExp(null);
    const hora = horaDe(v.fecha, Date.now());
    const r = await tocar({ accion: "hecho", viajeId: x.id });
    if (!r) return;
    if (r.k === "error") { mostrar({ msg: r.error }); return; }
    if (r.k === "cola") {
      mostrar({ msg: "Hecho · se manda cuando vuelva la señal", deshacer: () => quitarDeCola(x.id) });
      return;
    }
    if (x.remito) {
      setFoto(x.id);
      if (fotoTimer.current) clearTimeout(fotoTimer.current);
      fotoTimer.current = setTimeout(() => setFoto(null), 30_000);
    }
    mostrar({
      msg: `Hecho ${hora}`,
      deshacer: async () => {
        setFoto(null);
        const d = await tocar({ accion: "deshacer", viajeId: x.id });
        if (d?.k === "error") mostrar({ msg: d.error });
        else if (d?.k === "cola") quitarDeCola(x.id);
      },
    });
  };
  const quitarDeCola = (viajeId: string) => {
    const p = pendientes.find((q) => q.estado === "cola" && "viajeId" in q.toque && q.toque.viajeId === viajeId && q.toque.accion !== "deshacer");
    if (p) acciones?.quitarDeCola(p.id);
  };
  const noPude = async (viajeId: string, motivo: string) => {
    const r = await tocar({ accion: "no_pude", viajeId, motivo });
    if (!r) return;
    if (r.k === "error") { setHoja(null); mostrar({ msg: r.error }); return; }
    setHoja({ t: "nopudoOk", off: r.k === "cola" });
  };
  const recibir = async (accion: "recibido" | "entendido") => {
    const r = await tocar({ accion, version: v.version });
    if (r?.k === "ok") mostrar({ msg: `${accion === "entendido" ? "Entendido" : "Listo"}. ${coord.nombre} ya lo ve.` });
    else if (r?.k === "error") mostrar({ msg: r.error });
  };
  const subirFoto = async (viajeId: string, f: File | undefined) => {
    setFoto(null);
    if (!f) return;
    if (!acciones?.subirFoto) {
      mostrar({ msg: `En la vista previa no se guarda la foto. El chofer la saca desde su link (o se la manda a ${coord.nombre}).` });
      return;
    }
    const r = await acciones.subirFoto(viajeId, f);
    mostrar({ msg: r.k === "ok" ? "Foto del remito guardada en el viaje" : r.k === "cola" ? "La foto se manda cuando vuelva la señal" : r.error });
  };

  const fila = (x: ViajePublico) => {
    const abierto = exp === x.id;
    const puedeHecho = abierto && x.estado === "planeado" && hoy && interactivo;
    const cls = x.estado === "hecho" ? s.hecho : x.estado === "no_pudo" ? s.nopudo : undefined;
    return (
      <div key={x.id} className={s.viW}>
        <button type="button" className={cx(s.vi, cls)} aria-expanded={x.estado === "planeado" ? abierto : undefined} onClick={() => setExp(abierto ? null : x.id)}>
          <span className={s.n}>{x.i}</span>
          <span className={s.h}>{x.estado === "hecho" ? `✓ ${x.hechoHora ?? ""}` : x.estado === "no_pudo" ? `✗ ${x.hechoHora ?? ""}` : x.hora}</span>
          <span className={s.x}>
            <b>{x.texto}</b>{x.nuevo && <> <span className={cx(s.tag, s.nuevo)}>nuevo</span></>}
            <small>{x.estado === "no_pudo" ? (x.motivo ?? "").replace(/^./, (c) => c.toLowerCase()) : `${x.desde ?? "Depósito"} → ${x.hacia}`}{x.foto ? " · + foto" : ""}</small>
          </span>
        </button>
        {puedeHecho && (
          <div className={s.vx}>
            {x.mapsUrl ? <a className={cx(s.tbtn, s.sub)} href={x.mapsUrl} target="_blank" rel="noreferrer">Cómo llegar</a> : <span />}
            <button type="button" className={cx(s.tbtn, s.cor)} disabled={ocupado} onClick={() => hecho(x)}>Hecho este</button>
          </div>
        )}
      </div>
    );
  };

  const ahoraBloque = ahora && (
    <section className={s.ahora} aria-labelledby="hd-ahora">
      <div className={s.k} id="hd-ahora">Ahora · viaje {ahora.i}{ahora.nuevo && <span className={cx(s.tag, s.nuevo)}>nuevo</span>}</div>
      <div className={s.hr}>{ahora.hora}</div>
      <p className={s.q}>{ahora.texto}</p>
      <div className={s.ru}>{ahora.desde ?? "Depósito"} → <b>{ahora.hacia}</b>{ahora.vuelta ? " → depósito" : ""}</div>
      {ahora.carga && <div className={s.cg}>{ahora.carga}</div>}
      {ahora.pidio && <div className={s.ru}>Lo pidió {ahora.pidio}{ahora.antesDe ? `, antes de las ${ahora.antesDe}` : ""}</div>}
      <div className={s.tb2}>
        {ahora.mapsUrl && <a className={cx(s.tbtn, s.sub)} href={ahora.mapsUrl} target="_blank" rel="noreferrer">Cómo llegar</a>}
        {ahora.llamar && <Llamar nombre={ahora.llamar.nombre} telefono={ahora.llamar.telefono} />}
      </div>
    </section>
  );

  const sinMandar = cola.filter((p) => p.toque.accion === "hecho" || p.toque.accion === "no_pude");
  const listaSinMandar = sinMandar.length > 0 && (
    <div className={s.vlist}>
      <h3>Sin mandar todavía</h3>
      {sinMandar.map((p) => {
        const x = "viajeId" in p.toque ? v.viajes.find((y) => y.id === (p.toque as { viajeId: string }).viajeId) : null;
        return (
          <div key={p.id} className={s.vi}>
            <span className={s.n}>{x?.i ?? "·"}</span>
            <span className={s.h}>{horaDe(v.fecha, p.at)}</span>
            <span className={s.x}><b>{p.toque.accion === "hecho" ? "Hecho" : "No pude"}{x ? `: ${x.texto}` : ""}</b><small>se manda cuando vuelva la señal</small></span>
          </div>
        );
      })}
    </div>
  );

  const td = v.todo;
  const cab = td ? (
    <header className={s.top}>
      <span className={s.d}>{v.fechaTxt} · {v.persona}</span>
      <h1 className={s.h}>Todo el día con la {td.cuadrilla} ({td.aCargo ?? "sin nadie a cargo"}){v.vehiculo ? ` · ${v.vehiculo}` : ""}</h1>
    </header>
  ) : (
    <header className={s.top}>
      <span className={s.d}>{v.fechaTxt} · {v.persona}{v.vehiculo ? ` · ${v.vehiculo}` : ""}</span>
      <h1 className={s.h}>{hoy ? "Tus viajes de hoy" : `Tus viajes del ${diaSemana(v.fecha)}`}</h1>
    </header>
  );

  const banner = v.cambio && (
    <div className={cx(s.chg, v.cambio.gris && s.sac)} role="alert">
      <span className={s.k}>{v.cambio.titulo}</span>
      <span className={s.v}>{v.cambio.txt}</span>
      {!preview && !recCola && (
        <button type="button" className={cx(s.tbtn, s.cor, s.full, s.m52)} disabled={!interactivo || ocupado} onClick={() => recibir("entendido")}>Entendido</button>
      )}
    </div>
  );

  let cuerpo: ReactNode;
  if (td) {
    cuerpo = (
      <>
        <div className={s.res}>
          <div className={s.r}><span className={s.tk}>Encuentro</span><span className={s.big}>{td.encuentro}</span></div>
          {td.aCargo && (
            <div className={s.cont}>
              <span className={s.t}>A cargo: <b>{td.aCargo}</b></span>
              <Llamar nombre={td.aCargo} telefono={td.aCargoTel} />
            </div>
          )}
        </div>
        {td.nota && <div className={s.tnota}>{td.nota}</div>}
        {ahoraBloque}
        {td.obras.map((o, i) => <Obra key={o.otId} o={o} abierta={i === 0} onVisor={onVisor} />)}
        {listaSinMandar}
        {vigentes.length > 0 && <div className={s.vlist}><h3>Tus viajes propios</h3>{vigentes.filter((x) => !enCola.has(x.id)).map(fila)}</div>}
        <details className={s.tq}>
          <summary><h3>Quiénes van ({td.van})</h3> <span className={s.ver}>ver</span></summary>
          {td.gente.map((g, i) => (
            <div key={i} className={s.p}><span className={s.t}><b>{g.nombre}</b>{g.pila && <> · {g.pila}</>}{g.aCargo && <> <span className={cx(s.tag, s.cargo)}>a cargo</span></>}</span></div>
          ))}
        </details>
      </>
    );
  } else {
    cuerpo = (
      <>
        {ahoraBloque}
        {hoy && !pend.length && !sinMandar.length && (
          <div className={cx(s.tmsg, s.tmsgIn)}><h2>No tenés más viajes por ahora.</h2><p>Si te sale uno, te avisamos por acá.</p></div>
        )}
        {despues.length > 0 && <div className={s.vlist}><h3>{hoy ? "Después" : "Tus viajes"}</h3>{despues.map(fila)}</div>}
        {listaSinMandar}
        {hechos.length > 0 && <div className={s.vlist}><h3>Hechos</h3>{hechos.map(fila)}</div>}
      </>
    );
  }

  let pie: ReactNode;
  if (preview) pie = <div className={cx(s.rec, s.gris)}>Vista previa: lo toca {v.persona}</div>;
  else if (recCola) pie = <div className={cx(s.rec, s.pend)}>{v.cambio ? "Entendido" : "Recibido"} · se manda cuando vuelva la señal</div>;
  else if (foto) {
    pie = (
      <div className={s.two}>
        <button type="button" className={cx(s.tbtn, s.sub)} onClick={() => setFoto(null)}>Sin foto</button>
        <label className={cx(s.tbtn, s.cor, s.fotoBtn)}>
          Sacar foto del remito
          <input type="file" accept="image/*" capture="environment" aria-label="Sacar foto del remito" onChange={(e) => subirFoto(foto, e.currentTarget.files?.[0])} />
        </label>
      </div>
    );
  } else if (hoy && ahora && !v.cambio) {
    pie = (
      <div className={s.two}>
        <button type="button" className={cx(s.tbtn, s.sub)} disabled={!interactivo || ocupado} onClick={() => setHoja({ t: "nopudo", viajeId: ahora.id })}>No pude</button>
        <button type="button" className={cx(s.tbtn, s.cor)} disabled={!interactivo || ocupado} onClick={() => hecho(ahora)}>Hecho</button>
      </div>
    );
  } else if (hoy && ahora && v.cambio) pie = <div className={cx(s.rec, s.gris)}>Tocá «Entendido» arriba</div>;
  else if (!v.enviada) pie = <div className={cx(s.rec, s.gris)}>Todavía no se mandó</div>;
  else if (!hoy && !v.recibido) pie = <button type="button" className={cx(s.tbtn, s.cor, s.full)} disabled={!interactivo || ocupado} onClick={() => recibir(v.cambio ? "entendido" : "recibido")}>Recibido</button>;
  else if (!hoy && v.recibido) pie = <div className={cx(s.rec, s.ok)}>{v.recibido.entendido ? "Entendido" : "Recibido"} {v.recibido.hora}</div>;
  else pie = <div className={cx(s.rec, s.gris)}>{enviandoAlgo ? "Mandando…" : pend.length ? "" : "Sin viajes pendientes"}</div>;

  return (
    <>
      <Franjas conexion={conexion} preview={preview} enviada={v.enviada} />
      <main className={s.tel}>
        <div className={s.telIn}>
          {cab}
          {banner}
          {cuerpo}
          <div className={s.tfalta}>
            <p>¿Un problema con un viaje?</p>
            <LlamarCoordinador coordinador={coord} />
          </div>
        </div>
      </main>
      <footer className={s.foot}>{!preview && toast}{pie}</footer>
      {hoja && (
        <Capa className={s.tsheet} etiquetadaPor="hd-hoja-tit" onCerrar={() => setHoja(null)}>
          <div className={s.in} key={hoja.t}>
            {hoja.t === "nopudo" ? (
              <>
                <h2 id="hd-hoja-tit">¿Qué pasó?</h2>
                <p>Un toque. {coord.nombre} lo ve al instante.</p>
                <div className={s.motivos}>
                  {v.motivosNoPude.map((m) => (
                    <button key={m} type="button" className={cx(s.tbtn, s.full, s.sub)} disabled={ocupado} onClick={() => noPude(hoja.viajeId, m)}>{m}</button>
                  ))}
                </div>
                <button type="button" className={cx(s.tbtn, s.full, s.linea)} onClick={() => setHoja(null)}>Cancelar</button>
              </>
            ) : (
              <HojaListo off={hoja.off} coord={coord} onCerrar={() => setHoja(null)} />
            )}
          </div>
        </Capa>
      )}
    </>
  );
}

function HojaListo({ off, coord, onCerrar }: { off: boolean; coord: CoordinadorPublico; onCerrar: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <h2 id="hd-hoja-tit" ref={ref} tabIndex={-1}>{off ? "Guardado. Se manda cuando vuelva la señal." : `Listo, ${coord.nombre} ya lo ve.`}</h2>
      <p>Si es urgente, llamalo.</p>
      <LlamarCoordinador coordinador={coord} />
      <button type="button" className={cx(s.tbtn, s.full)} onClick={onCerrar}>Cerrar</button>
    </>
  );
}
