import type { SupabaseClient } from "@supabase/supabase-js";
import { linkCliente } from "./portal";
import { PRODUCTOR_PRUEBA, linkProductor } from "./endosos";
import { borradorPendiente, estadoPresentacion } from "./presentacion";
import { leerSupervision, type Supervision } from "./supervision";
import { leerDescartes, leerGestores } from "./config";
import { conPersona, quienSoy, tipicoRapido, type AccionConPersona, type Persona, type Yo } from "./lista";
import { etapasDeExpediente, etapasDeTramite, resumir, type Contexto, type EstadoPermiso, type ExpParaEstado } from "./estado";
import { ventaDeOdoo } from "./venta";
import { nombreSospechoso, type Documento, type EncomiendaFicha, type EstadoRobot, type Evento, type Expediente, type PresentacionFicha, type Tramite, type VentaOdoo } from "./tipos";

// La ficha única de un permiso (rediseño 09/10): trámite y expediente juntos. Arriba, la tarjeta
// de estado (la misma cuenta que la fila de la lista); al centro los papeles; el robot con TODOS
// sus intentos (antes sólo se veía el último y los IF sueltos quedaban en el handoff); los datos
// del dueño, la venta en vivo y el expediente; y el historial de trámite y expediente unido (antes
// partido: S02711 tenía 81 eventos en uno y 5 en el otro).

const BUCKET = "permisos-via-publica";

export type Captura = { nombre: string; url: string | null };

export type IntentoTad = {
  id: number;
  estado: string;
  created_at: string;
  terminada_at: string | null;
  reintentar_desde: string | null;
  error: string | null;
  payload: { es_prueba?: boolean; continuar_borrador?: number | null } | null;
  resultado: {
    etapa?: string; expediente?: string; borrador?: number | null; borrador_descartado?: number; borrador_limpiado_at?: string;
    adjuntados?: number; confirmado?: boolean; tad_caido?: boolean; borrador_no_abre?: boolean; reintento?: number; reintentos_max?: number;
  } | null;
  capturas: Captura[];
};

export type BorradorParaLimpiar = { borrador: number; tareaId: number; documentos: number; fecha: string };

export type FichaPermiso = {
  tramite: Tramite;
  documentos: (Documento & { url: string | null })[];
  encomienda: EncomiendaFicha | null;
  presentacion: PresentacionFicha;
  /** Todas las presentaciones en TAD, la más nueva primero. */
  intentos: IntentoTad[];
  eventos: Evento[];
  linkCliente: string | null;
  linkProductorPrueba: string | null;
  estado: EstadoPermiso;
  acciones: AccionConPersona[];
  vendedora: Persona | null;
  gestor: Persona | null;
  expediente: Expediente | null;
  caratulaUrl: string | null;
  permisoUrl: string | null;
  venta: VentaOdoo | null;
  ventaError: string | null;
  robot: EstadoRobot | null;
  /** Borradores de TAD descartados que todavía hay que borrar a mano. */
  paraLimpiar: BorradorParaLimpiar[];
  /** La última vez que el cliente abrió el portal. */
  portalVistoAt: string | null;
  ultimoContactoCliente: string | null;
  /** Por qué el nombre del dueño no puede salir así a Segucom, o null. */
  nombreRaro: string | null;
  supervision: Supervision;
  yo: Yo;
};

const corto = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const persona = (nombre: string | null | undefined, email: string | null | undefined): Persona | null =>
  nombre?.trim() ? { nombre: nombre.trim(), corto: corto(nombre), email: email?.trim().toLowerCase() || null } : null;

async function firmar(db: SupabaseClient, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return (await db.storage.from(BUCKET).createSignedUrl(path, 600)).data?.signedUrl ?? null;
}

async function capturasDe(db: SupabaseClient, paths: string[] | undefined, limpiar: RegExp): Promise<Captura[]> {
  return Promise.all((paths ?? []).map(async (path) => ({
    nombre: path.split("/").pop()!.replace(limpiar, "").replace(/\.png$/, "").replace(/-/g, " "),
    url: await firmar(db, path),
  })));
}

/** El expediente del trámite: el vinculado o, si se presentó a mano, el más nuevo de la misma venta. */
export async function expedienteDeTramite(db: SupabaseClient, t: Pick<Tramite, "expediente_id" | "odoo_venta_id">): Promise<Expediente | null> {
  if (t.expediente_id) {
    const { data } = await db.from("pvp_expedientes").select("*").eq("id", t.expediente_id).maybeSingle();
    if (data) return data as Expediente;
  }
  if (!t.odoo_venta_id) return null;
  const { data } = await db.from("pvp_expedientes").select("*").eq("odoo_venta_id", t.odoo_venta_id).eq("historico", false)
    .order("creado_tad", { ascending: false }).limit(1);
  return (data?.[0] as Expediente | undefined) ?? null;
}

export async function armarFicha(sesion: SupabaseClient, admin: SupabaseClient, id: string, origen: string | null): Promise<FichaPermiso | null> {
  const { data: t, error } = await sesion.from("pvp_tramites").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!t) return null;
  const tramite = t as Tramite & { creado_por: string | null };

  const [docs, tareas, requisitos, pendiente, supervision, descartes, gestores, tipico, robot, e] = await Promise.all([
    sesion.from("pvp_documentos").select("*").eq("tramite_id", id).order("created_at"),
    sesion.from("pvp_tareas").select("id, tipo, estado, payload, resultado, error, reintentar_desde, created_at, terminada_at")
      .eq("tramite_id", id).in("tipo", ["cpau_encomienda", "tad_presentar"]).order("created_at"),
    estadoPresentacion(sesion, id),
    borradorPendiente(sesion, id),
    leerSupervision(sesion),
    leerDescartes(sesion),
    leerGestores(sesion),
    tipicoRapido(sesion),
    sesion.from("pvp_robot").select("*").eq("id", "tad").maybeSingle(),
    expedienteDeTramite(sesion, tramite),
  ]);

  const eventosQ = sesion.from("pvp_eventos").select("*").order("created_at", { ascending: false }).limit(500);
  const [eventos, gestorPerfil, yo, odoo, caratulaUrl, permisoUrl] = await Promise.all([
    e ? eventosQ.or(`tramite_id.eq.${id},expediente_id.eq.${e.id}`) : eventosQ.eq("tramite_id", id),
    tramite.creado_por ? admin.from("user_profiles").select("email, nombre, apellido").eq("id", tramite.creado_por).maybeSingle() : Promise.resolve({ data: null }),
    quienSoy(sesion, admin, gestores),
    tramite.odoo_venta_id ?? e?.odoo_venta_id ? ventaDeOdoo((tramite.odoo_venta_id ?? e?.odoo_venta_id)!) : Promise.resolve({ venta: null, ventaError: null }),
    firmar(sesion, e?.caratula_path),
    // Sólo una resolución RS- es el permiso: el 09/10 se guardó como permiso una nota nuestra.
    e && /^RS-/i.test(e.permiso_notificacion ?? "") ? firmar(sesion, e.permiso_path) : Promise.resolve(null),
  ]);

  const documentos = await Promise.all(((docs.data ?? []) as Documento[]).map(async (d) => ({ ...d, url: await firmar(sesion, d.archivo_path) })));
  const todas = (tareas.data ?? []) as (Omit<IntentoTad, "capturas"> & { tipo: string; resultado: (IntentoTad["resultado"] & { capturas?: string[] }) | null })[];
  const tareasEnc = todas.filter((x) => x.tipo === "cpau_encomienda");
  const tareasTad = todas.filter((x) => x.tipo === "tad_presentar");

  const ultimaEnc = tareasEnc.at(-1) as unknown as (Omit<EncomiendaFicha, "capturas"> & { resultado: { capturas?: string[] } | null }) | undefined;
  const encomienda: EncomiendaFicha | null = ultimaEnc ? { ...ultimaEnc, capturas: await capturasDe(sesion, ultimaEnc.resultado?.capturas, /^\d+-[cfk]\d+-/) } : null;

  const intentos: IntentoTad[] = await Promise.all([...tareasTad].reverse().map(async (x) => ({
    id: x.id, estado: x.estado, created_at: x.created_at, terminada_at: x.terminada_at, reintentar_desde: x.reintentar_desde, error: x.error,
    payload: x.payload, resultado: x.resultado, capturas: await capturasDe(sesion, x.resultado?.capturas, /^\d+-\d+-/),
  })));
  const ultimaTad = intentos[0];
  const presentacion: PresentacionFicha = {
    estado: requisitos,
    borradorPendiente: pendiente.borrador,
    confirmadoAntes: pendiente.confirmadoAntes,
    tarea: ultimaTad ? (ultimaTad as unknown as NonNullable<PresentacionFicha["tarea"]>) : null,
  };

  // Borradores descartados que siguen en TAD: el número, cuántos documentos oficiales dejaron y si ya se borraron.
  const paraLimpiar: BorradorParaLimpiar[] = [];
  for (const x of tareasTad) {
    const b = x.resultado?.borrador_descartado;
    if (!b || x.resultado?.borrador_limpiado_at || paraLimpiar.some((p) => p.borrador === b)) continue;
    const documentosDejados = Math.max(0, ...tareasTad.filter((y) => y.resultado?.borrador === b).map((y) => y.resultado?.adjuntados ?? 0));
    paraLimpiar.push({ borrador: b, tareaId: x.id, documentos: documentosDejados, fecha: x.terminada_at ?? x.created_at });
  }

  const evs = (eventos.data ?? []) as (Evento & { tramite_id?: string | null })[];
  const linkEvs = evs.filter((ev) => ev.tipo === "link_cliente");
  const portalVistoAt = linkEvs.find((ev) => (ev.datos as { visto?: boolean } | null)?.visto === true)?.created_at ?? null;
  const ultimoContactoCliente = linkEvs.find((ev) => (ev.datos as { visto?: boolean } | null)?.visto !== true && !/^No se/i.test(ev.detalle ?? ""))?.created_at ?? null;

  const gp = gestorPerfil.data as { email: string | null; nombre: string | null; apellido: string | null } | null;
  const gestor = gp ? persona(`${gp.nombre ?? ""} ${gp.apellido ?? ""}`.trim() || gp.email, gp.email) : null;
  const vendedora = persona(tramite.vendedor_nombre, tramite.vendedor_email);
  const ctx: Contexto = {
    ahora: Date.now(), supervision, tipico, ultimoContactoCliente,
    nombres: { vendedora: vendedora?.corto, gestor: gestor?.corto },
    descartado: !!(e && descartes.expedientes[e.id]),
  };
  const estado = resumir(etapasDeTramite(tramite, documentos, todas, e as ExpParaEstado | null ?? undefined, ctx), ctx, { esPrueba: tramite.es_prueba, abierto: tramite.created_at });

  return {
    tramite,
    documentos,
    encomienda,
    presentacion,
    intentos,
    eventos: evs,
    linkCliente: linkCliente(tramite.token_cliente, origen),
    // El token del productor sólo lo lee la service role: se arma acá y sólo para pruebas.
    linkProductorPrueba: tramite.es_prueba ? await linkProductor(admin, PRODUCTOR_PRUEBA, origen) : null,
    estado,
    acciones: conPersona(estado.acciones, gestor, vendedora),
    vendedora,
    gestor,
    expediente: e,
    caratulaUrl,
    permisoUrl,
    ...odoo,
    robot: (robot.data as EstadoRobot | null) ?? null,
    paraLimpiar,
    portalVistoAt,
    ultimoContactoCliente,
    nombreRaro: nombreSospechoso(tramite.titular_nombre),
    supervision,
    yo,
  };
}

/** La ficha de un expediente sin trámite en la app: el mismo esqueleto, sin papeles ni robot. */
export type FichaSoloExpediente = {
  /** Si el expediente tiene trámite, la ficha es la del trámite: la página redirige. */
  tramiteId: string | null;
  expediente: Expediente;
  estado: EstadoPermiso;
  acciones: AccionConPersona[];
  eventos: Evento[];
  caratulaUrl: string | null;
  permisoUrl: string | null;
  venta: VentaOdoo | null;
  ventaError: string | null;
  /** La venta tiene un trámite abierto en la app sin este expediente atado (para "Atar"). */
  tramiteDeLaVenta: { id: string; direccion: string } | null;
  documentos: (Documento & { url: string | null })[];
  tramite: Tramite | null;
  yo: Yo;
};

export async function armarFichaExpediente(sesion: SupabaseClient, admin: SupabaseClient, id: string): Promise<FichaSoloExpediente | null> {
  const { data: exp, error } = await sesion.from("pvp_expedientes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!exp) return null;
  const e = exp as Expediente;

  const [atado, deLaVenta, eventos, supervision, descartes, gestores, tipico] = await Promise.all([
    sesion.from("pvp_tramites").select("*").eq("expediente_id", id).maybeSingle(),
    e.odoo_venta_id && !e.historico
      ? sesion.from("pvp_tramites").select("id, direccion, expediente_id").eq("odoo_venta_id", e.odoo_venta_id).eq("es_prueba", false).is("expediente_id", null).limit(1)
      : Promise.resolve({ data: [] as { id: string; direccion: string; expediente_id: string | null }[] }),
    sesion.from("pvp_eventos").select("*").eq("expediente_id", id).order("created_at", { ascending: false }).limit(500),
    leerSupervision(sesion),
    leerDescartes(sesion),
    leerGestores(sesion),
    tipicoRapido(sesion),
  ]);
  const tramite = (atado.data as Tramite | null) ?? null;
  const delaVenta = (deLaVenta.data ?? [])[0] ?? null;
  // Con trámite (atado, o el de la misma venta presentado a mano) la ficha es la del trámite.
  const tramiteId = tramite?.id ?? (delaVenta && estadoVinculoSeguro(e) ? delaVenta.id : null);

  const [yo, odoo, caratulaUrl, permisoUrl, docs] = await Promise.all([
    quienSoy(sesion, admin, gestores),
    e.odoo_venta_id ? ventaDeOdoo(e.odoo_venta_id) : Promise.resolve({ venta: null, ventaError: null }),
    firmar(sesion, e.caratula_path),
    /^RS-/i.test(e.permiso_notificacion ?? "") ? firmar(sesion, e.permiso_path) : Promise.resolve(null),
    tramite ? sesion.from("pvp_documentos").select("*").eq("tramite_id", tramite.id).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const ctx: Contexto = { ahora: Date.now(), supervision, tipico, descartado: !!descartes.expedientes[e.id] };
  const estado = resumir(etapasDeExpediente(e, ctx), ctx);
  return {
    tramiteId,
    expediente: e,
    estado,
    acciones: conPersona(estado.acciones, null, null),
    eventos: (eventos.data ?? []) as Evento[],
    caratulaUrl,
    permisoUrl,
    ...odoo,
    tramiteDeLaVenta: delaVenta ? { id: delaVenta.id, direccion: delaVenta.direccion } : null,
    documentos: await Promise.all(((docs.data ?? []) as Documento[]).map(async (d) => ({ ...d, url: await firmar(sesion, d.archivo_path) }))),
    tramite,
    yo,
  };
}

/** Vínculo confirmado (por número o por una persona): el trámite de esa venta es el de este expediente. */
function estadoVinculoSeguro(e: Pick<Expediente, "odoo_venta_id" | "odoo_vinculo_por" | "odoo_vinculo_confirmado_at">): boolean {
  return !!e.odoo_venta_id && (e.odoo_vinculo_por === "numero" || !!e.odoo_vinculo_confirmado_at);
}
