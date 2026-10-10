"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Chip, Seccion } from "@/components/permisos-via-publica/ui";
import { deshacerVale, useCatalogoPanol, useInvalidarPanol, useParametrosPanol, useRegistrarVale } from "@/hooks/use-panol";
import {
  formatoPesos, useCodigoActivo, useGuardarUnidad, useNombreLugar, useNombreQuien, useNuevoCodigo,
  type CambiosUnidad, type MovimientoFila,
} from "@/hooks/use-panol-catalogo";
import {
  diasEntre, ESTADO_UNIDAD, faltantePuedePasarAPerdida, hoyBA, leerRechazo, noApta, prestamoVencido,
} from "@/lib/panol/estado";
import type { Articulo, MovGestion, Unidad } from "@/lib/panol/tipos";
import { DialogoMotivo } from "./dialogo-motivo";
import { ETIQUETAS_NUEVAS } from "./dialogo-alta-unidades";
import { SelectorUbicacion } from "./selector-ubicacion";
import { cuando, fecha, numero } from "./formato";

// Las piezas de la ficha de una herramienta con número (herramientas/[id]).
//
// EL ESTADO NO SE EDITA: lo escribe el historial. Lo que hace un encargado sobre la unidad
// (faltante, pérdida, baja, taller, revisión, apareció) es un vale "gestion" con motivo, que
// deja su fila y se puede deshacer unos segundos o anular después. La ficha (serie, marca,
// compra, ubicación habitual, próxima inspección) sí se edita: la base sólo deja esas
// columnas.

// ─── Gestiones ──────────────────────────────────────────────────────────────

export type Gestion =
  | { movTipo: "faltante" | "baja" | "taller_envio" }
  | { movTipo: "perdida" }
  | { movTipo: "taller_vuelta" }
  | { movTipo: "revision"; nuevoEstado?: "disponible" | "fuera_de_servicio" }
  | { movTipo: "recuperada" };

const TEXTO: Record<MovGestion, { titulo: string; boton: string; hecho: string; peligroso?: boolean; ayuda: string; placeholder: string }> = {
  faltante: { titulo: "¿Marcarla faltante?", boton: "Marcar faltante", hecho: "Quedó faltante.", ayuda: "Queda a cargo de quien la tenía. Si no aparece, a los días del parámetro se propone pasarla a pérdida.", placeholder: "Ej.: no apareció en el control de la cuadrilla" },
  perdida: { titulo: "¿Pasarla a pérdida?", boton: "Pasar a pérdida", hecho: "Pasó a pérdida.", peligroso: true, ayuda: "Sale del stock. Si después aparece, se registra «Apareció» y vuelve al pañol.", placeholder: "Qué pasó" },
  baja: { titulo: "¿Darla de baja?", boton: "Dar de baja", hecho: "Quedó de baja.", peligroso: true, ayuda: "Rota sin arreglo o con la vida útil cumplida. Sale del stock y no se presta más.", placeholder: "Ej.: motor quemado, no conviene arreglarla" },
  taller_envio: { titulo: "¿Mandarla al taller?", boton: "Mandar al taller", hecho: "Quedó en el taller.", ayuda: "Queda en mantenimiento hasta que vuelva.", placeholder: "Qué tiene / a qué taller va" },
  taller_vuelta: { titulo: "¿Volvió del taller?", boton: "Volvió del taller", hecho: "Volvió del taller.", ayuda: "Vuelve a su lugar en el pañol.", placeholder: "Qué se le hizo" },
  revision: { titulo: "Resolver la revisión", boton: "Guardar", hecho: "Revisión registrada.", ayuda: "Qué se encontró y cómo queda.", placeholder: "Ej.: la probé y anda bien" },
  recuperada: { titulo: "¿Apareció?", boton: "Apareció", hecho: "Volvió al pañol.", ayuda: "Vuelve a su lugar del pañol, disponible.", placeholder: "Dónde estaba" },
};

export function DialogoGestion({
  gestion,
  unidad,
  articulo,
  onOpenChange,
}: {
  gestion: Gestion | null;
  unidad: Unidad;
  articulo: Articulo;
  onOpenChange: (o: boolean) => void;
}) {
  const cat = useCatalogoPanol();
  const registrar = useRegistrarVale();
  const invalidar = useInvalidarPanol();
  const [robo, setRobo] = useState(false);
  const [denuncia, setDenuncia] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState<"disponible" | "fuera_de_servicio">("disponible");
  const [conFalla, setConFalla] = useState(false);
  const [ubicacion, setUbicacion] = useState<string | null>(unidad.ubicacion_id ?? articulo.ubicacion_id);
  const t = gestion ? TEXTO[gestion.movTipo] : null;
  const vuelveAlPanol = gestion?.movTipo === "taller_vuelta" || gestion?.movTipo === "recuperada";

  async function confirmar(motivo: string) {
    if (!gestion) return;
    const r = await registrar.mutateAsync({
      clientUuid: crypto.randomUUID(),
      tipo: "gestion",
      items: [{
        articuloId: articulo.id,
        unidadId: unidad.id,
        movTipo: gestion.movTipo,
        motivo: gestion.movTipo === "perdida" && robo ? `Robo. ${motivo}` : motivo,
        denuncia: gestion.movTipo === "perdida" && robo ? denuncia.trim() || undefined : undefined,
        nuevoEstado: gestion.movTipo === "revision" ? (gestion.nuevoEstado ?? nuevoEstado) : undefined,
        estadoVuelta: gestion.movTipo === "taller_vuelta" && conFalla ? "con_falla" : undefined,
        ubicacionId: vuelveAlPanol ? ubicacion ?? undefined : undefined,
      }],
    });
    toast.success(`#${unidad.numero}: ${t!.hecho}`, {
      action: {
        label: "Deshacer",
        onClick: () => {
          deshacerVale(r.valeId).then(
            () => { invalidar(); toast("Deshecho."); },
            (e: unknown) => toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto),
          );
        },
      },
    });
  }

  return (
    <DialogoMotivo
      open={!!gestion}
      onOpenChange={(o) => { if (!o) { setRobo(false); setDenuncia(""); setConFalla(false); } onOpenChange(o); }}
      titulo={t ? `#${unidad.numero} · ${t.titulo}` : ""}
      texto={t?.ayuda}
      confirmar={t?.boton ?? ""}
      peligroso={t?.peligroso}
      placeholder={t?.placeholder}
      listo={!(gestion?.movTipo === "perdida" && robo && !denuncia.trim())}
      onConfirmar={confirmar}
    >
      {gestion?.movTipo === "perdida" && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={robo} onChange={(e) => setRobo(e.target.checked)} className="size-4 accent-foreground" />
            Fue robo
          </label>
          {robo && (
            <label className="block space-y-1">
              <span className="text-[13px] font-medium">N° de denuncia</span>
              <Input value={denuncia} onChange={(e) => setDenuncia(e.target.value)} />
            </label>
          )}
        </div>
      )}
      {gestion?.movTipo === "revision" && !gestion.nuevoEstado && (
        <div role="radiogroup" aria-label="Cómo queda" className="grid gap-2 sm:grid-cols-2">
          {([["disponible", "Anda bien: queda disponible"], ["fuera_de_servicio", "No anda: fuera de servicio"]] as const).map(([v, txt]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px] has-[:checked]:border-foreground has-[:checked]:bg-muted">
              <input type="radio" name="nuevo-estado" checked={nuevoEstado === v} onChange={() => setNuevoEstado(v)} className="accent-foreground" />
              {txt}
            </label>
          ))}
        </div>
      )}
      {gestion?.movTipo === "taller_vuelta" && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={conFalla} onChange={(e) => setConFalla(e.target.checked)} className="size-4 accent-foreground" />
          Sigue con problemas: dejarla en revisión
        </label>
      )}
      {vuelveAlPanol && (
        <label className="block space-y-1">
          <span className="text-[13px] font-medium">Vuelve a</span>
          <SelectorUbicacion ubicaciones={cat.data?.ubicaciones ?? []} value={ubicacion} onChange={setUbicacion} vacio="Su lugar de siempre" />
        </label>
      )}
    </DialogoMotivo>
  );
}

/** Fecha de Buenos Aires (YYYY-MM-DD) de un instante: la misma cuenta que la bandeja. */
const fechaBA = (iso: string) => hoyBA(new Date(iso));

/** Desde qué fecha un faltante se puede pasar a pérdida (la misma regla que la bandeja). */
export function perdidaDesde(u: Unidad, diasParametro: number): string {
  const d = new Date(fechaBA(u.desde_at) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + diasParametro);
  return d.toISOString().slice(0, 10);
}

/**
 * Qué gestiones tienen sentido en cada estado (la base igual valida). A pérdida se pasa
 * SÓLO desde faltante: lo que está afuera primero se marca faltante, y espera el plazo del
 * parámetro (faltante_perdida_dias) para que alguien lo busque.
 */
export function gestionesPosibles(u: Unidad): MovGestion[] {
  const enPanol = u.lugar.startsWith("u:");
  const g: MovGestion[] = [];
  if (u.estado === "faltante" || u.estado === "perdida") g.push("recuperada");
  if (u.lugar === "taller") g.push("taller_vuelta");
  if (enPanol) g.push("revision", "taller_envio");
  if (!["faltante", "perdida", "baja"].includes(u.estado)) g.push("faltante");
  if (u.estado === "faltante") g.push("perdida");
  if (u.estado !== "baja") g.push("baja");
  return g;
}

// ─── Tarjeta de estado ──────────────────────────────────────────────────────

export function TarjetaUnidad({
  unidad: u,
  articulo,
  ultimo,
  encargado,
  onGestion,
  onInspeccion,
}: {
  unidad: Unidad;
  articulo: Articulo;
  /** El último movimiento válido: de ahí sale el "por qué" (motivo, quién la devolvió). */
  ultimo: MovimientoFila | null;
  encargado: boolean;
  onGestion: (g: Gestion) => void;
  /** Ir a cargar la próxima inspección (en los datos de abajo). */
  onInspeccion: () => void;
}) {
  const nombre = useNombreLugar();
  const quien = useNombreQuien();
  const parametros = useParametrosPanol();
  const hoy = hoyBA();
  const na = noApta(articulo.seguridad_critica, u.proxima_inspeccion, hoy);
  const dias = diasEntre(fechaBA(u.desde_at), hoy);
  const desde = dias <= 0 ? "desde hoy" : dias === 1 ? "desde ayer" : `desde hace ${dias} días`;
  const motivo = ultimo?.motivo;

  let chip: React.ReactNode = null;
  let titulo = ESTADO_UNIDAD[u.estado];
  let texto: React.ReactNode = null;
  let principal: { texto: string; accion: () => void } | null = null;

  switch (u.estado) {
    case "disponible":
      titulo = "Disponible";
      texto = `Está en el pañol, ${nombre(u.lugar)}.`;
      break;
    case "afuera": {
      const l = u.lugar;
      titulo = l.startsWith("c:") ? `Con ${nombre(l)}` : l.startsWith("o:") ? `En obra · OT ${l.slice(2)}` : `La tiene ${nombre(l)}`;
      texto = [desde, u.odoo_ot_id && !l.startsWith("o:") ? `OT ${u.odoo_ot_id}` : null, u.vence_el ? `vuelve el ${fecha(u.vence_el)}` : null].filter(Boolean).join(" · ");
      if (prestamoVencido(u.vence_el, hoy)) chip = <Chip tono="aviso">Préstamo vencido</Chip>;
      break;
    }
    case "en_revision":
      titulo = "En revisión";
      texto = (
        <>
          {ultimo?.estado_vuelta ? `Volvió ${ultimo.estado_vuelta === "con_falla" ? "con falla" : "incompleta"} ${cuando(ultimo.created_at)}${ultimo.odoo_ot_id ? ` de OT ${ultimo.odoo_ot_id}` : ""}. ` : ""}
          {ultimo?.quien_id ? `La devolvió ${quien(ultimo.quien_tipo, ultimo.quien_id)}${motivo ? `: «${motivo}»` : ""}. ` : motivo ? `«${motivo}». ` : ""}
          No se presta hasta que alguien la revise.
        </>
      );
      chip = <Chip tono="toca" sinIcono>Les toca a los encargados · {desde.replace("desde ", "")}</Chip>;
      principal = { texto: "Resolver revisión", accion: () => onGestion({ movTipo: "revision" }) };
      break;
    case "fuera_de_servicio":
      titulo = "Fuera de servicio";
      texto = motivo ? `«${motivo}» · ${desde}.` : `${desde[0].toUpperCase()}${desde.slice(1)}.`;
      principal = { texto: "Resolver revisión", accion: () => onGestion({ movTipo: "revision" }) };
      break;
    case "en_mantenimiento":
      titulo = "En el taller";
      texto = `${desde[0].toUpperCase()}${desde.slice(1)}${motivo ? ` · «${motivo}»` : ""}.`;
      principal = { texto: "Volvió del taller", accion: () => onGestion({ movTipo: "taller_vuelta" }) };
      break;
    case "faltante": {
      chip = <Chip tono="aviso">Faltante</Chip>;
      titulo = `Faltante ${desde}`;
      const puede = faltantePuedePasarAPerdida(fechaBA(u.desde_at), hoy, parametros.data?.faltante_perdida_dias ?? 15);
      texto = [
        u.faltante_de ? `La tenía ${nombre(u.faltante_de)}.` : null,
        puede ? "Ya pasó el plazo: si no aparece, pasala a pérdida." : null,
      ].filter(Boolean).join(" ");
      principal = { texto: "Apareció", accion: () => onGestion({ movTipo: "recuperada" }) };
      break;
    }
    case "perdida":
      chip = <Chip tono="bloqueo">Perdida</Chip>;
      titulo = "Perdida o robada";
      texto = [motivo ? `«${motivo}»` : null, ultimo?.denuncia ? `Denuncia ${ultimo.denuncia}` : null, desde].filter(Boolean).join(" · ");
      principal = { texto: "Apareció", accion: () => onGestion({ movTipo: "recuperada" }) };
      break;
    case "baja":
      chip = <Chip>De baja</Chip>;
      titulo = "Dada de baja";
      texto = motivo ? `Motivo: ${motivo} · ${cuando(ultimo!.created_at)}.` : null;
      break;
  }

  // Con la inspección vencida, eso manda: no sale del pañol (o hay que traerla).
  if (na && u.estado !== "baja" && u.estado !== "perdida") {
    chip = <Chip tono="bloqueo">{u.estado === "afuera" ? "No usar" : "No apta"}</Chip>;
    if (u.estado === "disponible") {
      titulo = `Inspección de seguridad vencida el ${fecha(u.proxima_inspeccion)}`;
      texto = `Está en el pañol, ${nombre(u.lugar)}. No sale hasta que se inspeccione y se cargue la próxima fecha.`;
      principal = { texto: "Cargar la nueva inspección", accion: onInspeccion };
    } else if (u.estado === "afuera") {
      texto = <>{texto} · La inspección venció el {fecha(u.proxima_inspeccion)}: hay que traerla.</>;
    }
  }

  return (
    <section aria-labelledby="estado-unidad" className="space-y-3 rounded-md border bg-card p-4">
      {chip && <div>{chip}</div>}
      <div className="space-y-1">
        <h2 id="estado-unidad" className="text-[19px] font-bold leading-snug">{titulo}</h2>
        {texto && <p className="text-[14px] text-foreground/80">{texto}</p>}
      </div>
      {encargado && principal && <Button onClick={principal.accion} className="max-sm:h-10">{principal.texto}</Button>}
    </section>
  );
}

// ─── Acciones secundarias ───────────────────────────────────────────────────

const SECUNDARIAS: { g: MovGestion; texto: string }[] = [
  { g: "taller_envio", texto: "Al taller" },
  { g: "revision", texto: "Revisión" },
  { g: "faltante", texto: "Marcar faltante" },
  { g: "perdida", texto: "Pasar a pérdida" },
  { g: "baja", texto: "Dar de baja" },
];

export function AccionesUnidad({ unidad, onGestion, principal }: { unidad: Unidad; onGestion: (g: Gestion) => void; principal: MovGestion | null }) {
  const parametros = useParametrosPanol();
  const posibles = gestionesPosibles(unidad);
  const visibles = SECUNDARIAS.filter((s) => posibles.includes(s.g) && s.g !== principal);
  const plazo = parametros.data?.faltante_perdida_dias ?? 15;
  const perdidaOk = faltantePuedePasarAPerdida(fechaBA(unidad.desde_at), hoyBA(), plazo);
  if (visibles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">Si no aparece, no anda o no tiene arreglo:</span>
      {visibles.map((s) => {
        const bloqueada = s.g === "perdida" && !perdidaOk;
        return (
          <span key={s.g} className="inline-flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={bloqueada} onClick={() => onGestion({ movTipo: s.g } as Gestion)}>{s.texto}</Button>
            {bloqueada && <span className="text-[12px] text-muted-foreground">Se habilita el {fecha(perdidaDesde(unidad, plazo))}</span>}
          </span>
        );
      })}
    </div>
  );
}

// ─── Datos de la ficha ──────────────────────────────────────────────────────

type Borrador = { serie: string; marca_modelo: string; fecha_compra: string; costo: string; ubicacion_id: string | null; proxima_inspeccion: string; notas: string };

const deUnidad = (u: Unidad): Borrador => ({
  serie: u.serie ?? "",
  marca_modelo: u.marca_modelo ?? "",
  fecha_compra: u.fecha_compra ?? "",
  costo: u.costo !== null ? String(Number(u.costo)) : "",
  ubicacion_id: u.ubicacion_id,
  proxima_inspeccion: u.proxima_inspeccion ?? "",
  notas: u.notas ?? "",
});

export function DatosUnidad({ unidad, articulo, encargado, inspeccionRef }: {
  unidad: Unidad;
  articulo: Articulo;
  encargado: boolean;
  inspeccionRef: React.Ref<HTMLInputElement>;
}) {
  const cat = useCatalogoPanol();
  const guardar = useGuardarUnidad();
  const [b, setB] = useState<Borrador>(() => deUnidad(unidad));
  const original = deUnidad(unidad);
  const sucio = (Object.keys(b) as (keyof Borrador)[]).some((k) => b[k] !== original[k]);
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const ro = !encargado;

  function onGuardar() {
    const cambios: CambiosUnidad = {
      serie: b.serie.trim() || null,
      marca_modelo: b.marca_modelo.trim() || null,
      fecha_compra: b.fecha_compra || null,
      costo: numero(b.costo),
      ubicacion_id: b.ubicacion_id,
      proxima_inspeccion: b.proxima_inspeccion || null,
      notas: b.notas.trim() || null,
    };
    guardar.mutate({ id: unidad.id, cambios }, {
      onSuccess: () => toast.success("Cambios guardados."),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Seccion titulo="Datos">
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[13px] font-medium">Tipo</span>
          <p className="text-[13px] text-foreground/80">
            <Link href={`/deposito/panol/stock/${articulo.id}`} className="underline-offset-2 hover:underline">{articulo.nombre}</Link>
            {articulo.seguridad_critica ? " · seguridad crítica" : ""}
          </p>
        </div>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Número de serie</span>
          <Input value={b.serie} onChange={(e) => set("serie", e.target.value)} disabled={ro} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Marca y modelo</span>
          <Input value={b.marca_modelo} onChange={(e) => set("marca_modelo", e.target.value)} disabled={ro} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Comprada el</span>
          <Input type="date" value={b.fecha_compra} onChange={(e) => set("fecha_compra", e.target.value)} disabled={ro} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Costo de compra</span>
          <Input inputMode="decimal" value={b.costo} onChange={(e) => set("costo", e.target.value)} placeholder="$" disabled={ro} />
          {unidad.costo !== null && !sucio && <span className="block text-[12px] text-muted-foreground">{formatoPesos(Number(unidad.costo))}</span>}
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Lugar en el pañol</span>
          <SelectorUbicacion ubicaciones={cat.data?.ubicaciones ?? []} value={b.ubicacion_id} onChange={(id) => set("ubicacion_id", id)} vacio="El del artículo" disabled={ro} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium">Próxima inspección de seguridad</span>
          <Input ref={inspeccionRef} type="date" value={b.proxima_inspeccion} onChange={(e) => set("proxima_inspeccion", e.target.value)} disabled={ro} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-[13px] font-medium">Notas</span>
          <Input value={b.notas} onChange={(e) => set("notas", e.target.value)} disabled={ro} />
        </label>
      </div>
      {encargado && (
        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2.5">
          <Button variant="outline" onClick={onGuardar} disabled={!sucio || guardar.isPending}>
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar cambios
          </Button>
          {sucio && <Button variant="ghost" onClick={() => setB(deUnidad(unidad))}>Descartar</Button>}
        </div>
      )}
    </Seccion>
  );
}

// ─── QR ─────────────────────────────────────────────────────────────────────

/**
 * El código activo de la unidad. Reimprimir ANULA el viejo: si la etiqueta vieja anda
 * pegada en otra herramienta, escanearla avisa "código anulado" en vez de mover la que no es.
 */
export function CodigoUnidad({ unidad, encargado }: { unidad: Unidad; encargado: boolean }) {
  const codigo = useCodigoActivo("unidad", unidad.id);
  const nuevo = useNuevoCodigo();
  const [confirmar, setConfirmar] = useState(false);

  function generar(reimprimir: boolean) {
    nuevo.mutate({ tipo: "unidad", entidadId: unidad.id, reimprimir }, {
      onSuccess: (c) => {
        setConfirmar(false);
        toast.success(reimprimir ? `Código nuevo: ${c}. El viejo ya no sirve.` : `Código: ${c}.`, {
          action: { label: "Imprimir etiqueta", onClick: () => { window.location.href = ETIQUETAS_NUEVAS; } },
        });
      },
      onError: (e) => toast.error(leerRechazo(e.message).texto),
    });
  }

  return (
    <Seccion titulo="Código QR">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          {codigo.isLoading ? <span className="text-[13px] text-muted-foreground">Leyendo…</span>
            : codigo.data ? (
              <>
                <p className="font-mono text-[20px] font-semibold tracking-[0.2em]">{codigo.data.codigo}</p>
                <p className="text-[12px] text-muted-foreground">{codigo.data.impreso_at ? `Impreso ${cuando(codigo.data.impreso_at)}` : "Todavía no se imprimió"}</p>
              </>
            ) : <p className="text-[13px] text-muted-foreground">No tiene código.</p>}
        </div>
        {encargado && (
          <div className="flex flex-wrap gap-2">
            {codigo.data ? (
              <Button size="sm" variant="outline" onClick={() => setConfirmar(true)} disabled={nuevo.isPending}>Reimprimir etiqueta</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => generar(false)} disabled={nuevo.isPending || codigo.isLoading}>Generar código</Button>
            )}
            <Link href={ETIQUETAS_NUEVAS} className="inline-flex h-7 items-center px-2 text-[13px] underline-offset-2 hover:underline">Ir a etiquetas</Link>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title={`¿Reimprimir la etiqueta de #${unidad.numero}?`}
        description={`Se genera un código nuevo y ${codigo.data?.codigo ?? "el viejo"} deja de servir: si alguien lo escanea, la app avisa que está anulado.`}
        confirmLabel="Generar código nuevo"
        loading={nuevo.isPending}
        onConfirm={() => generar(true)}
      />
    </Seccion>
  );
}
