"use client";

// Control del equipo de una cuadrilla (docs §6.8), en la tablet del depósito.
//
// Se elige la cuadrilla → se ve lo que tiene a su nombre (herramientas con número con lugar
// c:<id> y lo a granel en c:<id>) → se escanea lo que está y se va tildando → al terminar:
//   - lo que no apareció: "Marcar faltante" registra UN vale de gestión (movTipo faltante,
//     desde la cuadrilla) firmado con el token del encargado. La base guarda el capataz del
//     momento, así el faltante queda a su cargo aunque después cambie.
//   - lo que tiene la inspección de seguridad vencida queda "No usar" (no se registra nada:
//     noApta se calcula) y se le avisa al capataz por WhatsApp con el mensaje armado.
// A diferencia del conteo, acá SÍ se ve cuánto tienen: es una lista de control, no un
// conteo a ciegas.

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, MessageCircle, Minus, Plus, Users } from "lucide-react";
import { deshacerVale, idDispositivo, registrarVale, resolverCodigo, useInvalidarPanol } from "@/hooks/use-panol";
import { useAfueraPanol } from "@/hooks/use-panol-tablet";
import { nombreDeLugar, type GrupoAfuera, type ItemAfuera } from "@/lib/panol/afuera";
import { numero } from "@/lib/panol/conteo";
import { hoyBA, leerRechazo } from "@/lib/panol/estado";
import { fechaCorta, linkWhatsapp, mensajeFaltante, mensajeInspeccion } from "@/lib/panol/whatsapp";
import { cn } from "@/lib/utils";
import { useMantenerSesion } from "@/components/panol/kiosco/sesion";
import {
  BOTON_PRIMARIO, BOTON_SECUNDARIO, CabeceraTablet, ChipGrande, Lector, useCorteSeguridad, SinEncargado, useEncargadoKiosco,
} from "./comun";

type Fase = "lista" | "resumen" | "hecho";

export function PantallaControlCuadrilla() {
  // Contar lleva su tiempo: entre ítem e ítem no se vuelve a "¿Quién sos?".
  useMantenerSesion();
  useCorteSeguridad();
  const { identidad, puede, token } = useEncargadoKiosco();
  const afuera = useAfueraPanol();
  const [cuadrillaId, setCuadrillaId] = useState<string | null>(null);

  const cuadrillas = useMemo(() => {
    const activas = (afuera.personas?.cuadrillas ?? []).filter((c) => c.activo);
    return activas.map((c) => ({ c, grupo: afuera.grupos?.find((g) => g.lugar === `c:${c.id}`) ?? null }));
  }, [afuera.personas, afuera.grupos]);

  const elegida = cuadrillas.find((x) => x.c.id === cuadrillaId) ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <CabeceraTablet titulo="Control del equipo de cuadrilla" textoSalir="Terminar y salir" icono={<Users />} quien={identidad && puede ? `Controla: ${identidad.nombre}` : null} />
      {!puede ? (
        <SinEncargado identidad={identidad} />
      ) : (
        <div className="grid flex-1 grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-3 border-r bg-card p-5">
            <h2 className="text-[22px] font-bold">¿Qué cuadrilla?</h2>
            {cuadrillas.map(({ c, grupo }) => {
              const actual = c.id === cuadrillaId;
              const responsable = afuera.personas?.personas.find((p) => p.tipo === "persona" && p.id === c.responsableId);
              const capataz = grupo?.capataz?.nombre ?? (responsable ? `${responsable.nombre} ${responsable.apellido}` : "sin capataz");
              const nCosas = grupo ? grupo.maquinas.filter((i) => !i.faltante).length + grupo.granel.length : 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={actual}
                  onClick={() => setCuadrillaId(c.id)}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 rounded-lg px-4 py-3 text-left",
                    actual ? "border-2 border-foreground bg-muted" : "border bg-card active:bg-muted",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xl font-semibold">{c.nombre}</span>
                    {grupo && grupo.noUsar > 0 && <ChipGrande tono="bloqueo">{grupo.noUsar} no usar</ChipGrande>}
                    {grupo && grupo.noUsar === 0 && grupo.faltantes > 0 && <ChipGrande tono="aviso">{grupo.faltantes} {grupo.faltantes === 1 ? "faltante" : "faltantes"}</ChipGrande>}
                  </span>
                  <span className="text-[15px] text-muted-foreground">
                    Capataz: {capataz}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{nCosas === 0 ? "Nada a su nombre" : nCosas === 1 ? "1 cosa a su nombre" : `${nCosas} cosas a su nombre`}</span>
                </button>
              );
            })}
            <p className="mt-auto text-sm text-muted-foreground">Lo que falte queda como faltante a cargo del capataz.</p>
          </aside>
          <main className="flex min-w-0 flex-col">
            {!elegida ? (
              <div className="flex flex-1 items-center justify-center px-7 text-lg text-muted-foreground">
                Elegí una cuadrilla para ver su equipo.
              </div>
            ) : (
              <Control
                key={elegida.c.id}
                cuadrilla={elegida.c}
                grupo={elegida.grupo}
                token={token}
                perdidaDias={afuera.perdidaDias}
                nombreDe={(l) => (afuera.personas ? nombreDeLugar(l, afuera.personas.personas, afuera.personas.cuadrillas, afuera.catalogo?.ubicaciones) : l)}
                onListo={() => setCuadrillaId(null)}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function Control({ cuadrilla, grupo, token, perdidaDias, nombreDe, onListo }: {
  cuadrilla: { id: string; nombre: string };
  grupo: GrupoAfuera | null;
  token: string | null;
  perdidaDias: number;
  nombreDe: (lugar: string) => string;
  onListo: () => void;
}) {
  const invalidar = useInvalidarPanol();
  const [fase, setFase] = useState<Fase>("lista");
  const [vistos, setVistos] = useState<Set<string>>(() => new Set());
  const [granelVisto, setGranelVisto] = useState<Record<string, number>>({});
  const [registrando, setRegistrando] = useState(false);
  // Lo que se marcó al cerrar: la lista de abajo se recalcula al refrescar el catálogo.
  const [cerrado, setCerrado] = useState<{ faltantes: Faltante[]; noUsar: ItemAfuera[] } | null>(null);

  const lugar = `c:${cuadrilla.id}`;
  const capataz = grupo?.capataz ?? null;
  // Lo que ya es faltante no se escanea: ya figura como que no está.
  const maquinas = useMemo(() => (grupo?.maquinas ?? []).filter((i) => !i.faltante), [grupo]);
  const granel = useMemo(() => grupo?.granel ?? [], [grupo]);
  const yaFaltantes = (grupo?.maquinas ?? []).filter((i) => i.faltante).length;

  const onCodigo = useCallback(
    async (texto: string) => {
      try {
        const r = await resolverCodigo(texto);
        if (r.tipo === "unidad") {
          const it = maquinas.find((i) => i.unidadId === r.id);
          if (it) {
            setVistos((v) => new Set(v).add(it.clave));
            return;
          }
          const falt = grupo?.maquinas.find((i) => i.unidadId === r.id);
          if (falt) return toast.warning(`${falt.numero} figuraba como faltante: registrala como recuperada en el pañol.`);
          return toast.error("Eso no figura a nombre de esta cuadrilla.");
        }
        if (r.tipo === "articulo") {
          const g = granel.find((i) => i.articuloId === r.id);
          if (g) return setGranelVisto((v) => ({ ...v, [g.clave]: Math.min(g.cantidad, (v[g.clave] ?? 0) + 1) }));
          return toast.error("Eso no figura a nombre de esta cuadrilla.");
        }
        toast.error(r.tipo === "anulado" ? "Esa etiqueta fue reemplazada por una nueva." : "Escaneá una herramienta de la cuadrilla.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo leer el código");
      }
    },
    [maquinas, granel, grupo],
  );

  const total = maquinas.length + granel.length;
  const controlados = maquinas.filter((i) => vistos.has(i.clave)).length + granel.filter((g) => (granelVisto[g.clave] ?? 0) >= g.cantidad).length;

  const faltantes: Faltante[] = [
    ...maquinas.filter((i) => !vistos.has(i.clave)).map((i) => ({ item: i, cantidad: 1 })),
    ...granel.filter((g) => (granelVisto[g.clave] ?? 0) < g.cantidad).map((g) => ({ item: g, cantidad: g.cantidad - (granelVisto[g.clave] ?? 0) })),
  ];
  const noUsar = maquinas.filter((i) => i.noUsar && vistos.has(i.clave));
  const bien = controlados - noUsar.length;

  async function marcarFaltantes() {
    setRegistrando(true);
    try {
      const r = await registrarVale({
        clientUuid: crypto.randomUUID(),
        tipo: "gestion",
        token: token ?? undefined,
        dispositivo: idDispositivo(),
        nota: `Control de equipo de ${cuadrilla.nombre}`,
        items: faltantes.map(({ item, cantidad }) =>
          item.unidadId
            ? { articuloId: item.articuloId, unidadId: item.unidadId, movTipo: "faltante" as const, motivo: "No apareció en el control de cuadrilla" }
            : { articuloId: item.articuloId, varianteId: item.varianteId, cantidad, desde: lugar, movTipo: "faltante" as const, motivo: "No apareció en el control de cuadrilla" }),
      });
      invalidar();
      setCerrado({ faltantes, noUsar });
      setFase("hecho");
      toast.success(
        `${faltantes.length === 1 ? "1 faltante" : `${faltantes.length} faltantes`} a cargo de ${capataz?.nombre ?? cuadrilla.nombre}.`,
        {
          duration: 10_000,
          action: {
            label: "Deshacer",
            onClick: () => {
              deshacerVale(r.valeId)
                .then(() => {
                  invalidar();
                  setCerrado(null);
                  setFase("resumen");
                  toast.success("Se deshizo: no quedó ningún faltante.");
                })
                .catch((e) => toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto));
            },
          },
        },
      );
    } catch (e) {
      toast.error(leerRechazo(e instanceof Error ? e.message : String(e), nombreDe).texto);
    } finally {
      setRegistrando(false);
    }
  }

  function cerrarSinFaltantes() {
    setCerrado({ faltantes: [], noUsar });
    setFase("hecho");
  }

  const encabezado = (
    <div>
      <h1 className="text-3xl font-bold">{cuadrilla.nombre}{capataz ? ` · ${capataz.nombre}` : ""}</h1>
      {grupo && grupo.obras.length > 0 && (
        <p className="mt-1 text-[15px] text-muted-foreground">En {grupo.obras.map((o) => `OT ${o}`).join(", ")}</p>
      )}
    </div>
  );

  if (fase === "hecho" && cerrado) {
    return (
      <Hecho
        cuadrilla={cuadrilla.nombre}
        capataz={capataz}
        cerrado={cerrado}
        encabezado={encabezado}
        onListo={onListo}
      />
    );
  }

  if (fase === "resumen") {
    const titulo =
      faltantes.length + noUsar.length === 0
        ? "todo en orden"
        : [faltantes.length && `${faltantes.length} ${faltantes.length === 1 ? "faltante" : "faltantes"}`, noUsar.length && `${noUsar.length} para no usar`]
            .filter(Boolean).join(" y ");
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3 px-7 py-6">
          <h1 className="text-3xl font-bold">{cuadrilla.nombre}: {titulo}</h1>
          {faltantes.map(({ item, cantidad }) => (
            <div key={item.clave} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5 text-base">
              <ChipGrande tono="aviso">Faltante</ChipGrande>
              <span>
                <strong>{item.nombre}{item.numero ? ` ${item.numero}` : ` × ${numero(cantidad)} ${item.unidad}`}</strong> no apareció.
                {" "}Faltante a cargo de {capataz?.nombre ?? "la cuadrilla"} · pasa a pérdida en {perdidaDias} días si no aparece.
              </span>
            </div>
          ))}
          {noUsar.map((i) => (
            <div key={i.clave} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5 text-base">
              <ChipGrande tono="bloqueo">No usar</ChipGrande>
              <span>
                <strong>{i.nombre} {i.numero}</strong>: la inspección de seguridad {i.proximaInspeccion ? `venció el ${fechaCorta(i.proximaInspeccion)}` : "está vencida"}. Queda marcado «No usar» y tiene que volver al pañol para inspeccionarlo.
              </span>
            </div>
          ))}
          {bien > 0 && (
            <div className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">
              {bien === 1 ? "1 cosa está bien." : `${bien} cosas están bien.`}
            </div>
          )}
          <p className="text-sm text-muted-foreground">Al cerrar, le podés avisar a {capataz?.nombre ?? "el capataz"} por WhatsApp con el mensaje armado.</p>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-card px-7 py-3.5">
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setFase("lista")}>Seguir buscando</button>
          {faltantes.length > 0 ? (
            <button type="button" className={cn(BOTON_PRIMARIO, "h-[60px] px-7 text-lg")} disabled={registrando} onClick={marcarFaltantes}>
              {faltantes.length === 1 ? "Marcar faltante" : `Marcar ${faltantes.length} faltantes`}
            </button>
          ) : (
            <button type="button" className={cn(BOTON_PRIMARIO, "h-[60px] px-7 text-lg")} onClick={cerrarSinFaltantes}>Cerrar control</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 px-7 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            {encabezado}
            <p className="mt-1 text-[17px] text-muted-foreground">Escaneá cada cosa que tienen. Se va tildando sola.</p>
          </div>
          <span aria-live="polite" className="shrink-0 text-base font-semibold text-muted-foreground">{controlados} de {total} controlados</span>
        </div>
        <Lector onCodigo={onCodigo} pausado={registrando} ayuda="Escaneá cada herramienta de la cuadrilla" className="h-44" />
        {total === 0 && (
          <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">
            {cuadrilla.nombre} no tiene nada a su nombre{yaFaltantes ? ` (más ${yaFaltantes} que ya figuran como faltantes)` : ""}.
          </p>
        )}
        {maquinas.length > 0 && (
          <ul className="grid grid-cols-2 gap-2">
            {maquinas.map((i) => {
              const visto = vistos.has(i.clave);
              return (
                <li
                  key={i.clave}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-lg px-3.5 py-2",
                    visto ? "border bg-card" : "border border-dashed border-muted-foreground/50 bg-muted/40",
                  )}
                >
                  {visto
                    ? <CheckCircle2 aria-hidden className="size-6 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    : <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-muted-foreground/60" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{i.nombre} <span className="font-mono text-muted-foreground">{i.numero}</span></span>
                    <span className="block text-sm text-muted-foreground">{visto ? "Escaneada" : "Falta escanear"}</span>
                  </span>
                  {visto && i.noUsar && <ChipGrande tono="bloqueo">No usar</ChipGrande>}
                  {/* Etiqueta ilegible: se tilda a mano. */}
                  {!visto && (
                    <button type="button" className={BOTON_SECUNDARIO} onClick={() => setVistos((v) => new Set(v).add(i.clave))}>La veo</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {granel.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="mt-1 text-lg font-bold">A granel · contá cuántos hay</h2>
            {granel.map((g) => {
              const n = granelVisto[g.clave] ?? 0;
              const fijar = (x: number) => setGranelVisto((v) => ({ ...v, [g.clave]: Math.max(0, Math.min(g.cantidad, x)) }));
              return (
                <div key={g.clave} className="flex min-h-16 items-center gap-3 rounded-lg border bg-card px-3.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{g.nombre}</span>
                    <span className="block text-sm text-muted-foreground">Tienen {numero(g.cantidad)} {g.unidad}</span>
                  </span>
                  <button type="button" aria-label="Uno menos" className={cn(BOTON_SECUNDARIO, "w-14 px-0")} onClick={() => fijar(n - 1)}><Minus aria-hidden /></button>
                  <span className="w-16 text-center font-mono text-2xl font-semibold" aria-live="polite">{numero(n)}</span>
                  <button type="button" aria-label="Uno más" className={cn(BOTON_SECUNDARIO, "w-14 px-0")} onClick={() => fijar(n + 1)}><Plus aria-hidden /></button>
                  <button type="button" className={BOTON_SECUNDARIO} onClick={() => fijar(g.cantidad)}>Están todos</button>
                </div>
              );
            })}
          </section>
        )}
        {yaFaltantes > 0 && total > 0 && (
          <p className="text-sm text-muted-foreground">Además, {yaFaltantes === 1 ? "1 cosa ya figura" : `${yaFaltantes} cosas ya figuran`} como faltante de esta cuadrilla.</p>
        )}
      </div>
      <div className="sticky bottom-0 flex justify-end border-t bg-card px-7 py-3.5">
        <button type="button" className={cn(BOTON_PRIMARIO, "h-[60px] px-7 text-lg")} disabled={total === 0} onClick={() => setFase("resumen")}>
          Terminar control
        </button>
      </div>
    </div>
  );
}

type Faltante = { item: ItemAfuera; cantidad: number };

/** Después de cerrar: los avisos al capataz, armados para mandar por WhatsApp. */
function Hecho({ cuadrilla, capataz, cerrado, encabezado, onListo }: {
  cuadrilla: string;
  capataz: GrupoAfuera["capataz"];
  cerrado: { faltantes: Faltante[]; noUsar: ItemAfuera[] };
  encabezado: React.ReactNode;
  onListo: () => void;
}) {
  const nombre = capataz?.nombre ?? "";
  const mensajes: { clave: string; titulo: string; texto: string }[] = [];
  if (cerrado.faltantes.length > 0) {
    mensajes.push({
      clave: "faltantes",
      titulo: "Faltantes",
      texto: mensajeFaltante({
        nombre,
        cuadrilla,
        cosas: cerrado.faltantes.map(({ item, cantidad }) => (item.numero ? `${item.nombre} ${item.numero}` : `${numero(cantidad)} ${item.unidad} de ${item.nombre}`)),
      }),
    });
  }
  for (const i of cerrado.noUsar) {
    mensajes.push({
      clave: i.clave,
      titulo: `No usar: ${i.nombre} ${i.numero}`,
      texto: mensajeInspeccion({ nombre, herramienta: i.nombre, numero: i.numero ?? "", proxima: i.proximaInspeccion ?? hoyBA(), vencida: true }),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 px-7 py-6">
        {encabezado}
        <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3.5 text-base text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong>Control cerrado.</strong>{" "}
            {cerrado.faltantes.length === 0 ? "No faltó nada." : `${cerrado.faltantes.length === 1 ? "1 faltante quedó" : `${cerrado.faltantes.length} faltantes quedaron`} a cargo de ${nombre || "la cuadrilla"}.`}
          </span>
        </div>
        {mensajes.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Avisale a {nombre || "el capataz"}</h2>
            {mensajes.map((m) => (
              <AvisoWhatsapp key={m.clave} titulo={m.titulo} texto={m.texto} telefono={capataz?.telefono ?? null} />
            ))}
          </section>
        )}
      </div>
      <div className="sticky bottom-0 flex justify-end border-t bg-card px-7 py-3.5">
        <button type="button" className={cn(BOTON_PRIMARIO, "h-[60px] px-7 text-lg")} onClick={onListo}>Controlar otra cuadrilla</button>
      </div>
    </div>
  );
}

function AvisoWhatsapp({ titulo, texto, telefono }: { titulo: string; texto: string; telefono: string | null }) {
  const link = linkWhatsapp(telefono, texto);
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3.5">
      <div className="text-base font-semibold">{titulo}</div>
      <p className="whitespace-pre-line text-base text-muted-foreground">{texto}</p>
      <div className="flex flex-wrap gap-3">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={BOTON_SECUNDARIO}>
            <MessageCircle aria-hidden /> Mandar por WhatsApp
          </a>
        ) : (
          <span className="self-center text-sm text-muted-foreground">El capataz no tiene un celular cargado en Legajos: copiá el mensaje.</span>
        )}
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          onClick={() =>
            navigator.clipboard.writeText(texto).then(
              () => toast.success("Mensaje copiado"),
              () => toast.error("No se pudo copiar"),
            )
          }
        >
          <Copy aria-hidden /> Copiar mensaje
        </button>
      </div>
    </div>
  );
}
