"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, CalendarPlus, Check, ChevronLeft, ChevronRight, CircleCheck, CircleDashed,
  ClipboardCheck, Construction, ExternalLink, Fence, FileText, HardHat, LocateFixed, MapPin,
  Phone, Pin, PinOff, Plus, CalendarRange, Trash2, X,
} from "lucide-react";
import { useState } from "react";
import { useDetalleOt } from "@/hooks/use-detalle-ot";
import { useAgregarContactoObra, useBorrarContactoObra } from "@/hooks/use-contactos-obra";
import { Input } from "@/components/ui/input";
import { HistoriaOt } from "./historia-ot";
import { ComentariosOt } from "./comentarios-ot";
import { DetalleTecnico } from "./detalle-tecnico";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { ETAPA_LABEL, type HabEtapa } from "@/lib/habilitaciones/tipos";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ALERTA, NOTA, OK, PELIGRO, PELIGRO_SOLIDO, semaforo,
} from "@/lib/tablero/colores";
import { FRACCIONES, fraccionLabel, type FraccionStr } from "@/lib/tablero/fracciones";
import { accionDeCierre, jornadasCerradas, jornadasLiberables, type AccionCierre } from "@/lib/tablero/cierre";
import { lineaVentana, violaPiso, violaTecho } from "@/lib/tablero/ventana";
import { fechasDeJornadas } from "@/lib/tablero/bloques";
import { direccionDeObra } from "@/lib/tablero/titulo";
import { Button } from "@/components/ui/button";
import type { Bloque } from "@/lib/tablero/bloques";
import type { ContactoObra, DocumentoOt, OtTablero, TrabajoOt } from "@/lib/tablero/tipos";

// Panel lateral de la OT: todo lo que hace falta para coordinar la jornada sin salir
// del tablero. La carga de partes, el circuito de habilitación y los costos viven en
// Odoo — de acá se linkea, no se edita.
//
// EL ORDEN ES EL DE LA TAREA, no el de cuándo se fue agregando cada bloque (rediseño del
// 09/10/2026, sobre una auditoría de la ficha abierta desde la bandeja):
//
//   1. Encabezado fijo: QUÉ obra es (la dirección, que es como se la nombra en la grilla y
//      en la bandeja), EN QUÉ ESTADO está y QUÉ se puede hacer con ella.
//   2. Comentarios: lo que Operaciones habló con el cliente o Comercial le pasó cambia cómo
//      se hace el trabajo y es lo más nuevo de la obra (al pie no se leía).
//   3. Qué hay que ejecutar, con las observaciones de Comercial y los documentos pegados.
//   4. ¿Se puede ir?: habilitación, ventana, compromiso y duración, juntos. Son los datos
//      de una sola decisión —dónde la pongo— y antes estaban repartidos entre el noveno y
//      el decimocuarto bloque, la duración debajo del pliegue.
//   5. Contactos: en obra y en ABA (técnico y vendedor), para saber a quién recurrir.
//   6. Historia, plegada con el último evento a la vista.
//
// UNA SOLA FICHA PARA LA BANDEJA Y LA GRILLA. Cambian la línea de estado y las acciones,
// porque una obra sin jornadas no se confirma ni se fija y una con jornadas no se
// "planifica"; el resto es idéntico. Planificar desde acá convierte una en la otra sin
// cerrar el panel.

/**
 * Lo que esta jornada necesita ADEMÁS de la cuadrilla.
 *
 * Sale de la clasificación que Comercial carga en la venta y son las dos cosas que, si no
 * se ven acá, se descubren en la obra: que hay que llevar concertina y que tiene que
 * estar el técnico de Seguridad e Higiene del cliente.
 *
 * SE MUESTRA SÓLO CUANDO HAY ALGO. Una caja fija diciendo "sin requisitos" en las obras
 * normales entrenaría a saltearla, y entonces no se leería el día que sí dice algo.
 *
 * VA EN CAJA DESTACADA, como "Qué hay que ejecutar", porque no es contexto: es trabajo que
 * hay que preparar antes de salir. La barra ámbar la distingue de la coral del detalle
 * técnico y de las notas fijadas, que son ámbar enteras.
 *
 * NO VA EN LA TARJETA del tablero: la primera línea ya lleva tipo, parte, candado,
 * dirección, fracción y urgencia, y por debajo de 38px se queda sin el segundo renglón.
 * Meter dos íconos más ahí le come ancho a la dirección, que es lo último que este diseño
 * sacrifica. Tampoco va en el parte: el parte se completa DESPUÉS de la jornada, o sea
 * cuando ya no sirve para cargar el camión.
 */
function QueNecesita({ trabajo }: { trabajo: TrabajoOt | undefined }) {
  if (!trabajo) return null;
  const syh = trabajo.syhPresencial === true;
  if (!trabajo.alambre && !syh) return null;

  return (
    <div
      className="space-y-2 rounded-md border-l-4 bg-muted/40 px-3 py-2.5"
      style={{ borderLeftColor: ALERTA }}
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Construction className="h-3.5 w-3.5" />
        Qué necesita esta jornada
      </p>

      {trabajo.alambre && (
        <div className="flex gap-2 text-sm">
          <Fence className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ALERTA }} />
          <p className="leading-snug">
            <span className="font-medium">Lleva alambre de concertina.</span>
          </p>
        </div>
      )}

      {syh && (
        <div className="flex gap-2 text-sm">
          <HardHat className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ALERTA }} />
          <p className="leading-snug">
            <span className="font-medium">El cliente contrató técnico de SyH.</span>
          </p>
        </div>
      )}

      {trabajo.tipoLabel && (
        <p className="text-xs text-muted-foreground">{trabajo.tipoLabel}</p>
      )}
    </div>
  );
}

/** Título de una sección de la ficha. Pocas y en mayúsculas: los campos de adentro, no. */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

/** Un dato de "¿Se puede ir?": etiqueta a la izquierda, valor a la derecha, un renglón. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[13px] text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </>
  );
}

const telefonoLimpio = (t: string) => t.replace(/[^\d+]/g, "");

/** Botón de llamar: en el celular es lo que se toca, y el número subrayado era un blanco chico. */
function Llamar({ telefono }: { telefono: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 shrink-0 md:h-8"
      render={<a href={`tel:${telefonoLimpio(telefono)}`} />}
      aria-label={`Llamar al ${telefono}`}
    >
      <Phone className="h-3.5 w-3.5" />
      Llamar
    </Button>
  );
}

/**
 * La gente de la obra. Se agrega desde acá y queda guardada en la ORDEN.
 *
 * POR QUÉ ACÁ Y NO EN ODOO: Operaciones descubre estos contactos hablando por teléfono
 * mientras coordina la jornada, con el tablero abierto. Mandarlos a la orden de venta a
 * anotarlo es pedirles que cambien de pantalla justo cuando tienen el dato en la mano —y
 * así es como el dato se pierde. En Odoo se pueden cargar igual, desde la solapa "Trabajo
 * a ejecutar" de la orden: es la misma lista.
 *
 * EL FORMULARIO ARRANCA CERRADO. Tres campos fijos ocupando el panel en las obras donde
 * nadie va a agregar a nadie es ruido permanente por algo que pasa de a ratos.
 */
function ContactosDeObra({
  otId,
  ventaId,
  contactos,
}: {
  otId: number;
  /** La orden de la que cuelgan. Sin ella no hay dónde guardar: el "+" no se ofrece. */
  ventaId: number | null;
  contactos: ContactoObra[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const agregar = useAgregarContactoObra(otId);
  const borrar = useBorrarContactoObra(otId);

  const limpiar = () => { setNombre(""); setRol(""); setTelefono(""); setEmail(""); setAbierto(false); };

  function guardar() {
    if (!ventaId || !nombre.trim()) return;
    agregar.mutate(
      { ventaId, nombre: nombre.trim(), rol: rol.trim(), telefono: telefono.trim(), email: email.trim() },
      { onSuccess: limpiar },
    );
  }

  return (
    <>
      {contactos.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-sm">
            <p>
              <span className="font-medium">{c.nombre}</span>
              {c.rol && <span className="text-muted-foreground"> · {c.rol}</span>}
            </p>
            {c.email && (
              <a href={`mailto:${c.email}`} className="block truncate text-xs text-muted-foreground underline">
                {c.email}
              </a>
            )}
          </div>
          {c.telefono && <Llamar telefono={c.telefono} />}
          <button
            type="button"
            onClick={() => borrar.mutate(c.id)}
            disabled={borrar.isPending}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-foreground/10"
            title={`Quitar a ${c.nombre} de la obra`}
            aria-label={`Quitar a ${c.nombre} de la obra`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {ventaId && !abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar contacto
        </button>
      )}

      {abierto && (
        <div className="space-y-1.5 rounded-md border p-2">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            aria-label="Nombre y apellido"
            className="h-8 text-sm"
            autoFocus
          />
          <Input value={rol} onChange={(e) => setRol(e.target.value)} placeholder="Rol — encargado, arquitecta…" aria-label="Rol" className="h-8 text-sm" />
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" aria-label="Teléfono" className="h-8 text-sm" inputMode="tel" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" aria-label="Email" className="h-8 text-sm" inputMode="email" />
          <p className="text-[11px] text-muted-foreground">
            Queda guardado en la obra: las próximas órdenes de trabajo ya lo traen.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={limpiar} disabled={agregar.isPending}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="ml-auto"
              /* El nombre es lo único que se exige: muchas veces se tiene el teléfono y el
                 rol pero no el mail, y pedirlo todo termina en que no se cargue nada. */
              disabled={!nombre.trim() || agregar.isPending}
              onClick={guardar}
            >
              {agregar.isPending ? "Guardando…" : "Agregar"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Lo que la cuadrilla dejó armado de verdad, sellado en obra al cerrar la última jornada.
 *
 * SÓLO SE MUESTRA CUANDO EXISTE. Una caja fija diciendo "todavía no se cerró" en todas
 * las OTs en curso —que son la mayoría de las que se abren en el tablero— entrenaría a
 * saltearla, y entonces no se leería el día que sí dice algo.
 *
 * EN VERDE y no en coral como "Qué hay que ejecutar": ese color marca lo que hay que
 * hacer, y éste es un hecho consumado y verificado por alguien que estuvo. Son dos cajas
 * parecidas a propósito —hablan de la misma estructura— y el color es lo que las separa
 * de un vistazo.
 */
function LoQueQuedoArmado({ texto, previsto }: { texto?: string | null; previsto?: string | null }) {
  if (!texto?.trim()) return null;
  // CUANDO SE ARMÓ LO PREVISTO no se repite el párrafo: la caja de arriba ya lo dice, y
  // verlo dos veces palabra por palabra hace dudar de si son dos cosas distintas. Lo que
  // aporta acá es OTRA cosa —que alguien fue, miró y confirmó— y eso se dice con una línea.
  const sinCambios = texto.trim() === (previsto ?? "").trim();
  return (
    <div className="space-y-1.5 rounded-md border-l-4 bg-muted/40 px-3 py-2.5" style={{ borderLeftColor: OK }}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <CircleCheck className="h-3.5 w-3.5" />
        Lo que quedó armado
      </p>
      {sinCambios ? (
        <p className="text-sm leading-snug">Se ejecutó lo previsto, sin diferencias.</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-snug">{texto}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Confirmado en obra al cerrar la jornada. Si esta obra deja estructura en pie, es lo
        que va a ir a bajar el desarme.
      </p>
    </div>
  );
}

function Documentos({ otId, cantidad }: { otId: number; cantidad: number }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tablero-documentos", otId],
    queryFn: async () => {
      const res = await fetch(`/api/planificacion/documentos?otId=${otId}`);
      if (!res.ok) throw new Error("No se pudieron leer los adjuntos");
      return (await res.json()) as { documentos: DocumentoOt[] };
    },
    enabled: cantidad > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (cantidad === 0) return <p className="text-[13px] text-muted-foreground">Sin documentación adjunta.</p>;
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (isError) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No se pudieron leer los {cantidad} documentos.{" "}
        <button type="button" className="underline hover:text-foreground" onClick={() => refetch()}>
          Reintentar
        </button>
      </p>
    );
  }

  const docs = data?.documentos ?? [];
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Documentos ({cantidad})</p>
      <div className="grid grid-cols-3 gap-1.5">
        {docs.map((d) => (
          <a
            key={d.id}
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group overflow-hidden rounded-md border transition-colors hover:border-foreground/30"
            title={d.nombre}
          >
            {d.mimetype.startsWith("image/") ? (
              // La vista previa sale de Odoo con la sesión del usuario en el browser; si
              // no hay sesión, queda el nombre del archivo como alternativa.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.url} alt={d.nombre} className="h-16 w-full bg-muted object-cover" />
            ) : (
              <div className="flex h-16 items-center justify-center bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <p className="truncate px-1.5 py-1 text-[11px] text-muted-foreground">
              {/* Distingue lo que alguien subió PARA la cuadrilla de los papeles de la
                  venta, que van en el mismo grid y son mayoría. */}
              {d.instruccion && <span className="font-semibold text-foreground">Instrucción · </span>}
              {d.nombre}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

/** "Abrir en Odoo", en el mismo lugar desde la bandeja y desde la grilla. */
function LinkOdoo({ url }: { url: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-10 text-muted-foreground md:h-8"
      render={<a href={url} target="_blank" rel="noopener noreferrer" />}
    >
      Odoo
      <ExternalLink className="h-3.5 w-3.5" />
    </Button>
  );
}

/**
 * Lo que se puede hacer con esta jornada: lo mismo que el menú ⋮ de la tarjeta.
 *
 * EXISTE POR EL CELULAR. El ⋮ aparece al pasar el mouse, y en una pantalla táctil no hay
 * mouse: tocar la tarjeta abre este panel, y hasta acá el panel sólo mostraba datos. O sea
 * que desde un teléfono no había forma de confirmar, fijar, cambiar la fracción ni cerrar la
 * jornada — y cerrar la jornada es justo lo que alguien hace desde la obra.
 *
 * SE VE TAMBIÉN EN LA COMPUTADORA, a propósito: una tablet es ancha y táctil, y esconderlo
 * por ancho de pantalla la dejaría afuera. En la computadora es un segundo camino al mismo
 * gesto, y no molesta.
 *
 * Los botones miden 40px de alto en pantalla chica, que es lo mínimo que se toca con el
 * dedo sin errarle. En la computadora vuelven al tamaño de siempre.
 *
 * CONFIRMAR VA LLENO mientras la jornada es tentativa: es el paso siguiente natural de una
 * obra recién puesta. Confirmada, pasa a ser uno más ("A tentativa").
 *
 * El motivo de una obra fija va escrito acá, entero: en la tarjeta vive en un tooltip, y en
 * un celular un tooltip no se puede leer.
 */
function AccionesJornada({
  bloque,
  hoy,
  urlOdoo,
  onEstado,
  onFijar,
  onSoltar,
  onFraccion,
  onEditarJornadas,
  onCerrarJornada,
  onQuitar,
}: {
  bloque: Bloque;
  hoy: string;
  urlOdoo: string;
  onEstado: (e: "tentativa" | "confirmada") => void;
  onFijar: () => void;
  onSoltar: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEditarJornadas: () => void;
  onCerrarJornada: (accion: NonNullable<AccionCierre>) => void;
  onQuitar: () => void;
}) {
  const accion = accionDeCierre(bloque, hoy);
  const liberables = jornadasLiberables(bloque).length;
  const cerradas = jornadasCerradas(bloque);
  // Recién soltada: todavía no tiene su número en Odoo y cualquier escritura rebotaría.
  const guardando = bloque.ids.some((id) => id < 0);
  const boton = "h-10 md:h-8";
  const confirmada = bloque.estado === "confirmada";

  return (
    <div className="space-y-2">
      {bloque.motivoFija && (
        <div className="flex gap-2 rounded-md border px-3 py-2 text-sm">
          <Pin className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-snug">
            <span className="font-medium">No se mueve de este día.</span> {bloque.motivoFija}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {accion && (
          <Button
            variant="outline"
            size="sm"
            className={boton}
            disabled={guardando}
            onClick={() => onCerrarJornada(accion)}
          >
            <ClipboardCheck className="h-4 w-4" />
            {accion.tipo === "cerrar" ? "Cerrar jornada" : "Ver parte"}
          </Button>
        )}
        <Button
          variant={confirmada ? "outline" : "default"}
          size="sm"
          className={boton}
          disabled={guardando}
          title={guardando ? "Guardando la jornada recién puesta…" : undefined}
          onClick={() => onEstado(confirmada ? "tentativa" : "confirmada")}
        >
          {confirmada ? <CircleDashed className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {confirmada ? "A tentativa" : "Confirmar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={boton}
          disabled={guardando}
          onClick={bloque.motivoFija ? onSoltar : onFijar}
        >
          {bloque.motivoFija ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {bloque.motivoFija ? "Soltar" : "Fijar"}
        </Button>
        <Button variant="outline" size="sm" className={boton} disabled={guardando} onClick={onEditarJornadas}>
          <CalendarRange className="h-4 w-4" />
          Jornadas
        </Button>
        {liberables > 0 && (
          <Button
            variant="outline"
            size="sm"
            className={boton}
            style={{ color: PELIGRO_SOLIDO }}
            disabled={guardando}
            onClick={onQuitar}
          >
            <Trash2 className="h-4 w-4" />
            {cerradas > 0 ? `Liberar ${liberables}` : "Quitar"}
          </Button>
        )}
        <LinkOdoo url={urlOdoo} />
      </div>

      {/* Sólo en una jornada suelta, igual que en el menú: en un bloque de varios días cada
          día tiene su fracción, y eso se edita desde "Jornadas". */}
      {!bloque.multiDia && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Fracción</span>
          {FRACCIONES.map((f) => {
            const actual = Number(f.value) === bloque.fraccion;
            return (
              <Button
                key={f.value}
                variant={actual ? "secondary" : "outline"}
                size="sm"
                className="h-10 min-w-10 px-2 md:h-7 md:min-w-0"
                disabled={guardando}
                aria-pressed={actual}
                title={f.detalle}
                onClick={() => onFraccion(f.value)}
              >
                {f.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DIA_CORTO = (f: string) => format(parseISO(f), "EEE d", { locale: es });
const MES = (f: string) => format(parseISO(f), "MMM", { locale: es });

/** "mar 13 – sáb 17 oct", "mié 8 oct", "lun 28 sep – mar 6 oct". */
export function rangoDeFechas(primero: string, ultimo: string): string {
  if (primero === ultimo) return `${DIA_CORTO(primero)} ${MES(primero)}`;
  if (primero.slice(0, 7) === ultimo.slice(0, 7)) return `${DIA_CORTO(primero)} – ${DIA_CORTO(ultimo)} ${MES(ultimo)}`;
  return `${DIA_CORTO(primero)} ${MES(primero)} – ${DIA_CORTO(ultimo)} ${MES(ultimo)}`;
}

/** El primer día hábil después de hoy, o el piso de la ventana si es posterior. */
function inicioSugerido(hoy: string, piso: string | null): string {
  const [manana] = fechasDeJornadas(format(new Date(parseISO(hoy).getTime() + 86_400_000), "yyyy-MM-dd"), 1);
  return piso && piso > manana ? fechasDeJornadas(piso, 1)[0] : manana;
}

/**
 * Planificar la obra sin arrastrarla: cuadrilla, día de inicio y listo.
 *
 * POR QUÉ: desde la bandeja la ficha servía para leer y no para hacer. Para poner la obra
 * había que cerrar el panel, ubicar la tarjeta en la bandeja y arrastrarla —y con el
 * teclado o en una tablet, ni eso—.
 *
 * PASA POR LA MISMA FUNCIÓN QUE EL ARRASTRE (asignarObra en el board), así que reparte
 * las mismas jornadas pendientes, saltea el domingo igual y avisa el piso de la ventana
 * igual. Acá además se ve ANTES qué días va a ocupar y si respeta la ventana.
 */
function FormPlanificar({
  ot,
  pendientes,
  cuadrillas,
  cuadrillaSugerida,
  hoy,
  onPlanificar,
  onCancelar,
}: {
  ot: OtTablero;
  pendientes: number;
  cuadrillas: { id: number; nombre: string }[];
  cuadrillaSugerida: number | null;
  hoy: string;
  onPlanificar: (cuadrillaId: number, fecha: string) => void;
  onCancelar: () => void;
}) {
  const [cuadrillaId, setCuadrillaId] = useState<number | null>(
    cuadrillaSugerida ?? cuadrillas[0]?.id ?? null,
  );
  const [fecha, setFecha] = useState(() => inicioSugerido(hoy, ot.fechaDesde));
  const dias = fecha ? fechasDeJornadas(fecha, Math.max(1, pendientes)) : [];
  const rompePiso = dias.length > 0 && violaPiso(ot, dias[0]);
  const rompeTecho = dias.length > 0 && violaTecho(ot, dias[dias.length - 1]);
  const conVentana = !!ot.fechaDesde || !!ot.fechaAntesDe;

  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (cuadrillaId != null && fecha) onPlanificar(cuadrillaId, fecha);
      }}
    >
      <p className="text-sm font-semibold">Planificar la obra</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Cuadrilla</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={cuadrillaId ?? ""}
            onChange={(e) => setCuadrillaId(Number(e.target.value))}
          >
            {cuadrillas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.id === cuadrillaSugerida ? " (prevista)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Desde</span>
          {/* El valor vacío se ignora: borrar el campo no puede dejar el formulario sin día. */}
          <Input type="date" className="h-9" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </label>
      </div>
      {dias.length > 0 && (
        <div className="space-y-0.5 text-[13px]">
          <p>
            {pendientes === 1 ? "Ocupa " : `${pendientes} jornadas: `}
            <span className="font-medium">{rangoDeFechas(dias[0], dias[dias.length - 1])}</span>
            {pendientes > 1 && <span className="text-muted-foreground"> (saltea el domingo)</span>}
          </p>
          {conVentana && (
            <p style={{ color: rompePiso || rompeTecho ? PELIGRO_SOLIDO : OK }}>
              {rompePiso
                ? "Arranca antes de la ventana del cliente."
                : rompeTecho
                  ? "Termina después de la ventana del cliente."
                  : "Respeta la ventana del cliente."}
            </p>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={cuadrillaId == null || !fecha}>
          Planificar
        </Button>
      </div>
    </form>
  );
}

/** Duración editable desde la ficha: la misma escala que el menú de la bandeja, más días enteros. */
function SelectorDuracion({ valor, onCambiar }: { valor: number; onCambiar: (jornadas: number) => void }) {
  const opciones: { value: string; label: string }[] = [
    ...FRACCIONES.filter((f) => Number(f.value) < 1).map((f) => ({ value: String(Number(f.value)), label: `${f.label} de jornada` })),
    ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} jornada${i === 0 ? "" : "s"}` })),
  ];
  const actual = String(valor);
  if (!opciones.some((o) => o.value === actual)) opciones.push({ value: actual, label: `${valor} jornadas` });
  return (
    <select
      aria-label="Duración de la obra"
      title="Cuánto dura la obra según Operaciones"
      className="h-10 rounded-lg border bg-background px-2 text-sm font-medium md:h-8"
      value={actual}
      onChange={(e) => onCambiar(Number(e.target.value))}
    >
      {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * La duración que sugiere Odoo a partir de obras parecidas.
 *
 * El campo trae un párrafo entero ("Sugerido: 1 jornada(s). El armado de esta obra se
 * EJECUTO en 1 visita(s). Medido sobre 415 obras…") que ocupaba más que toda la sección.
 * Lo que se usa es el número: va en un renglón, con el cálculo detrás de "ver cálculo" y,
 * desde la bandeja, un "usar" que la fija como duración de un clic.
 */
function SugerenciaDuracion({
  texto,
  actual,
  onUsar,
}: {
  texto: string;
  /** La duración vigente. Null si la obra está sin estimar. */
  actual: number | null;
  onUsar: ((jornadas: number) => void) | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const m = texto.match(/sugerid[oa]:?\s*([\d.,]+)\s*jornada/i);
  const sugerido = m ? Number(m[1].replace(",", ".")) : null;
  const valido = sugerido != null && Number.isFinite(sugerido) && sugerido > 0;

  return (
    <span className="block text-xs text-muted-foreground">
      {valido ? (
        <>
          Sugerido: {sugerido} jornada{sugerido === 1 ? "" : "s"}
          {onUsar && sugerido !== actual && (
            <>
              {" · "}
              <button type="button" className="underline hover:text-foreground" onClick={() => onUsar(sugerido)}>
                usar
              </button>
            </>
          )}
          {" · "}
        </>
      ) : null}
      <button
        type="button"
        className="underline hover:text-foreground"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? "ocultar cálculo" : valido ? "ver cálculo" : "ver sugerencia"}
      </button>
      {abierto && <span className="mt-1 block whitespace-pre-wrap">{texto}</span>}
    </span>
  );
}

type Estado = { etiqueta: string; detalle: string; tono: "vacio" | "tentativa" | "confirmada" | "neutro" };

export function PanelOt({
  ot,
  bloque,
  cuadrillaNombre,
  cuadrillaPrevista,
  cuadrillas,
  pendiente,
  plan,
  planObra,
  hoy,
  navegacion,
  onPlanificar,
  onDuracion,
  onVerEnTablero,
  onEstado,
  onFijar,
  onSoltar,
  onFraccion,
  onEditarJornadas,
  onCerrarJornada,
  onQuitar,
  onOpenChange,
}: {
  ot: OtTablero | null;
  bloque: Bloque | null;
  cuadrillaNombre: string | null;
  /** La cuadrilla que la OT trae sugerida de Odoo (x_cuadrilla_prevista_id), ya con nombre. */
  cuadrillaPrevista: string | null;
  /** Las filas del tablero, para elegir dónde planificar. */
  cuadrillas: { id: number; nombre: string }[];
  /** Lo que le falta planificar a la obra. Null si ya está entera en el tablero. */
  pendiente: { pendientes: number; totales: number } | null;
  /**
   * La duración que fijó Operaciones, cuando difiere del estimado de Comercial.
   *
   * Se muestran LAS DOS y no sólo la vigente: la ficha es donde alguien va a preguntarse
   * por qué el tablero dice siete si la venta decía ocho, y esconder una de las dos
   * convierte esa pregunta en un misterio. Mismo criterio que "Duración sugerida", que
   * también convive con el estimado sin reemplazarlo.
   */
  plan: { jornadas: number; motivo: string | null; autorNombre: string | null } | null;
  /**
   * En qué días cayó la obra ENTERA, sumando todos sus tramos.
   *
   * NO ES `plan`, aunque el nombre se parezca: aquél es cuántas jornadas dijo Operaciones
   * que lleva; éste es dónde quedaron. Sirve para medir la ventana del cliente contra el
   * plan de verdad y tiene que ser la obra entera y no el bloque abierto: el techo es
   * sobre el trabajo TERMINADO. Ver el encabezado de ventana.ts.
   */
  planObra: { primerDia: string | null; ultimoDia: string | null } | null;
  /** Hoy en yyyy-MM-dd: desde cuándo se puede cerrar una jornada. */
  hoy: string;
  /**
   * Obra anterior y siguiente de la bandeja, en el orden en que se ve. Es la recorrida
   * de la mañana: repasar la bandeja de a una sin cerrar y volver a abrir. Null desde la
   * grilla, donde no hay una lista que recorrer.
   */
  navegacion: { anterior: (() => void) | null; siguiente: (() => void) | null } | null;
  /** Planificar sin arrastrar. Pasa por el mismo camino que soltar en la grilla. */
  onPlanificar: (cuadrillaId: number, fecha: string) => void;
  /** Fijar cuánto dura la obra, igual que el menú de duración de la bandeja. */
  onDuracion: (jornadas: number) => void;
  /** Llevar el tablero hasta la obra, cuando tiene jornadas en las semanas cargadas. */
  onVerEnTablero: (() => void) | null;
  /** Las acciones del menú de la tarjeta, sobre el bloque abierto. Ver AccionesJornada. */
  onEstado: (e: "tentativa" | "confirmada") => void;
  onFijar: () => void;
  onSoltar: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEditarJornadas: () => void;
  onCerrarJornada: (accion: NonNullable<AccionCierre>) => void;
  onQuitar: () => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  const sem = semaforo(ot?.habSemaforo);
  const { data: detalle, isLoading: cargandoDetalle, isError: errorDetalle, refetch } = useDetalleOt(ot?.id ?? null);
  const [planificando, setPlanificando] = useState<number | null>(null);
  const etapa = detalle?.habEtapa ? ETAPA_LABEL[detalle.habEtapa as HabEtapa] : null;
  const fecha = (f: string) => format(parseISO(f), "d MMM yyyy", { locale: es });
  const conPlan = !!planObra?.primerDia;
  // Se mide contra el plan de la obra entera cuando lo hay: la línea no sólo informa la
  // ventana sino que dice si el lugar donde quedó la respeta. Es la misma función que usa
  // la bandeja para que las dos superficies no puedan discrepar (ver ventana.ts).
  const ventana = ot
    ? lineaVentana(ot, { primerDia: planObra?.primerDia ?? null, ultimoDia: planObra?.ultimoDia ?? null })
    : null;

  if (!ot) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const desdeLaGrilla = !!bloque && bloque.origen !== "tarea";
  const direccion = detalle?.direccionObra ?? direccionDeObra(ot);
  const cliente = detalle?.cliente ?? null;
  const duracion = plan?.jornadas ?? ot.jornadas;
  const formAbierto = planificando === ot.id && !desdeLaGrilla && !!pendiente;

  const estado: Estado = bloque
    ? {
        etiqueta: bloque.estado === "confirmada" ? "Confirmada" : "Tentativa",
        tono: bloque.estado === "confirmada" ? "confirmada" : "tentativa",
        detalle: [
          cuadrillaNombre ?? "Sin cuadrilla",
          rangoDeFechas(bloque.fechas[0], bloque.fechas[bloque.fechas.length - 1]),
          bloque.fechas.length > 1 ? `${bloque.fechas.length} jornadas` : `${fraccionLabel(bloque.fraccion)} de jornada`,
        ].join(" · "),
      }
    : pendiente
      ? {
          etiqueta: pendiente.pendientes < pendiente.totales ? "Planificada en parte" : "Sin planificar",
          tono: "vacio",
          detalle: `faltan ${pendiente.pendientes} de ${pendiente.totales} jornada${pendiente.totales === 1 ? "" : "s"}`,
        }
      : conPlan
        ? { etiqueta: "Planificada", tono: "neutro", detalle: rangoDeFechas(planObra!.primerDia!, planObra!.ultimoDia ?? planObra!.primerDia!) }
        : ot.fechaProgramada
          ? { etiqueta: "Programada", tono: "neutro", detalle: `${fecha(ot.fechaProgramada)} · fuera de las semanas cargadas` }
          : { etiqueta: "Sin planificar", tono: "vacio", detalle: "" };

  const habExtra = [
    etapa ? sem.label : null,
    ot.habAlerta && !/^ok$/i.test(ot.habAlerta.trim()) ? ot.habAlerta : null,
    detalle && detalle.habDias > 0 ? `${detalle.habDias} días en trámite` : null,
    ot.habVencimiento ? `vence el ${fecha(ot.habVencimiento)}` : null,
  ].filter(Boolean).join(" · ");

  const ventanaNota = !ventana || ventana.alerta
    ? null
    : conPlan
      ? "el plan la respeta"
      : ot.fechaDesde && ot.fechaDesde <= hoy && !ot.fechaAntesDe
        ? "ya se puede"
        : null;

  const tecnico = detalle?.tecnicoNombre ?? ot.tecnico;
  const telObra = ot.telObra ?? detalle?.telFichaCliente ?? null;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        onKeyDown={(e) => {
          // ← → recorren la bandeja, salvo cuando se está escribiendo.
          if (!navegacion) return;
          const t = e.target as HTMLElement;
          if (t.closest("input, textarea, select, [contenteditable]")) return;
          if (e.key === "ArrowLeft" && navegacion.anterior) navegacion.anterior();
          if (e.key === "ArrowRight" && navegacion.siguiente) navegacion.siguiente();
        }}
      >
        {/* ── Encabezado fijo: qué obra, en qué estado, qué se puede hacer ── */}
        <header className="sticky top-0 z-10 space-y-2.5 border-b bg-popover px-4 pt-4 pb-3">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              {/* LA DIRECCIÓN COMO TÍTULO: es como se nombra la obra en la grilla y en la
                  bandeja. El título crudo de Odoo repetía tipo, orden, cliente y dirección
                  en tres renglones, y todo eso volvía a aparecer más abajo. */}
              <SheetTitle className="text-[17px] leading-snug font-semibold">{direccion}</SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                <span>{[cliente, ot.ordenVenta].filter(Boolean).join(" · ") || ot.titulo}</span>
                <ChipTipoOt tipo={ot.tipo} />
                {ot.urgencia === "alta" && (
                  <Badge style={{ backgroundColor: PELIGRO_SOLIDO, color: "#fff" }}>Urgencia alta</Badge>
                )}
              </div>
            </div>
            {navegacion && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Obra anterior de la bandeja"
                  title="Obra anterior de la bandeja (←)"
                  disabled={!navegacion.anterior}
                  onClick={() => navegacion.anterior?.()}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Obra siguiente de la bandeja"
                  title="Obra siguiente de la bandeja (→)"
                  disabled={!navegacion.siguiente}
                  onClick={() => navegacion.siguiente?.()}
                >
                  <ChevronRight />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={() => onOpenChange(false)}>
              <X />
            </Button>
          </div>

          {/* LA LÍNEA DE ESTADO. Antes, desde la bandeja, nada decía "sin planificar": había
              que deducirlo de un "quitó del tablero" en el historial. */}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-semibold"
              style={
                estado.tono === "confirmada"
                  ? { backgroundColor: `color-mix(in oklch, ${OK} 14%, transparent)`, color: OK }
                  : { backgroundColor: "var(--muted)" }
              }
            >
              {estado.tono === "confirmada" ? (
                <CircleCheck className="h-3.5 w-3.5" />
              ) : estado.tono === "tentativa" ? (
                <CircleDashed className="h-3.5 w-3.5" />
              ) : (
                <span className="h-2 w-2 rounded-full border-[1.5px] border-current opacity-70" />
              )}
              {estado.etiqueta}
            </span>
            {estado.detalle && <span className="text-muted-foreground">{estado.detalle}</span>}
            {bloque?.motivoFija && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Pin className="h-3 w-3" /> Fija
              </span>
            )}
          </div>

          {desdeLaGrilla ? (
            <AccionesJornada
              bloque={bloque}
              hoy={hoy}
              urlOdoo={ot.url}
              onEstado={onEstado}
              onFijar={onFijar}
              onSoltar={onSoltar}
              onFraccion={onFraccion}
              onEditarJornadas={onEditarJornadas}
              onCerrarJornada={onCerrarJornada}
              onQuitar={onQuitar}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {pendiente && (
                <Button size="sm" className="h-10 md:h-8" onClick={() => setPlanificando(formAbierto ? null : ot.id)}>
                  <CalendarPlus className="h-4 w-4" />
                  Planificar…
                </Button>
              )}
              {pendiente && <SelectorDuracion valor={duracion} onCambiar={onDuracion} />}
              {onVerEnTablero && (
                <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={onVerEnTablero}>
                  <LocateFixed className="h-4 w-4" />
                  Ver en el tablero
                </Button>
              )}
              <LinkOdoo url={ot.url} />
            </div>
          )}

          {formAbierto && pendiente && (
            <FormPlanificar
              key={ot.id}
              ot={ot}
              pendientes={pendiente.pendientes}
              cuadrillas={cuadrillas}
              cuadrillaSugerida={ot.cuadrillaPrevistaId}
              hoy={hoy}
              onCancelar={() => setPlanificando(null)}
              onPlanificar={(cuadrillaId, dia) => {
                setPlanificando(null);
                onPlanificar(cuadrillaId, dia);
              }}
            />
          )}
        </header>

        <div className="space-y-6 px-4 pt-4 pb-8">
          {ot.urgencia === "alta" && ot.motivoUrgencia && (
            <div className="flex gap-2 rounded-md border p-2 text-sm" style={{ borderColor: PELIGRO }}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PELIGRO }} />
              <p className="whitespace-pre-wrap">{ot.motivoUrgencia}</p>
            </div>
          )}

          {/* EL HILO DE LA OBRA, lo primero del cuerpo. Lo que Operaciones habló con el
              cliente o lo que Comercial le pasó —"entramos 8am el martes", "si llueve corre al
              jueves"— cambia cómo se hace el trabajo y suele ser lo más nuevo que hay que
              saber de la obra. Al pie nadie lo leía (pedido de JS, 09/10). */}
          <ComentariosOt otId={ot.id} />

          {/* ── Qué hay que ejecutar, con lo que lo acompaña ── */}
          <div className="space-y-3">
            {/* El vacío SE MUESTRA: una OT sin detalle técnico es un problema para quien
                planifica. Las observaciones de Comercial van adentro: suelen cambiar cómo
                se hace el trabajo y se leen junto con él. */}
            <DetalleTecnico
              texto={detalle?.detalleTecnico}
              confirmadoEl={detalle?.estructuraConfirmadaEl}
              cargando={cargandoDetalle}
              error={errorDetalle}
              onReintentar={() => refetch()}
              observaciones={ot.observaciones}
            />
            <QueNecesita trabajo={detalle?.trabajo} />
            {/* Pegados a lo que hay que hacer: el croquis y el texto se leen juntos, y la
                cuadrilla en el celular los tiene arriba y no al final de todo. */}
            <Documentos otId={ot.id} cantidad={ot.cantDocs + ot.cantInstrucciones} />
            <LoQueQuedoArmado texto={detalle?.ejecutadoReal} previsto={detalle?.detalleTecnico} />
          </div>

          {/* ── ¿Se puede ir? Los insumos de una sola decisión: dónde la pongo ── */}
          <Seccion titulo="¿Se puede ir?">
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 leading-snug">
              <Dato etiqueta="Habilitación">
                {/* LA ETAPA PRIMERO: dice qué falta para poder ir, que es lo que decide. El
                    semáforo y el campo de alerta de Odoo quedan como detalle; pegados en un
                    renglón daban cosas como "próxima a vencer · ok". */}
                <span className="flex items-baseline gap-1.5">
                  <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ backgroundColor: sem.color }} />
                  <span>{etapa ?? sem.label}</span>
                </span>
                {habExtra && <span className="ml-3.5 block text-xs text-muted-foreground">{habExtra}</span>}
              </Dato>

              {/* LA VENTANA DEL CLIENTE — "no antes del 12", "terminada antes del 15". Sale en
                  rojo sólo cuando el plan la rompe: en este tablero el rojo es "algo está mal". */}
              {ventana && (
                <Dato etiqueta="Ventana">
                  <span style={ventana.alerta ? { color: PELIGRO_SOLIDO, fontWeight: 500 } : undefined}>
                    {ventana.texto}
                  </span>
                  {ventanaNota && <span style={{ color: OK }}> · {ventanaNota}</span>}
                </Dato>
              )}

              {/* La fecha que Comercial prometió. Es contra esto que se mide si la
                  planificación llega tarde. */}
              {ot.fechaComprometida && (
                <Dato etiqueta="Comprometida">
                  {fecha(ot.fechaComprometida)}
                  {detalle?.fechaFirmeza && (
                    <span className="text-muted-foreground">
                      {detalle.fechaFirmeza === "confirmada" ? " · firme" : " · puede moverse"}
                    </span>
                  )}
                </Dato>
              )}

              <Dato etiqueta="Duración">
                {ot.sinEstimar && !plan ? (
                  <span style={{ color: NOTA.texto }}>Sin estimar — nadie cargó la duración en Odoo</span>
                ) : (
                  <>
                    {duracion < 1 ? `${fraccionLabel(duracion)} de jornada` : `${duracion} jornada${duracion === 1 ? "" : "s"}`}
                    {ot.personalPorJornada > 0 ? ` · ${ot.personalPorJornada} personas` : ""}
                  </>
                )}
                {plan ? (
                  <span className="block text-xs" style={{ color: NOTA.texto }}>
                    La fijó Operaciones{plan.autorNombre ? ` (${plan.autorNombre})` : ""}
                    {plan.motivo ? ` — ${plan.motivo}` : ""}
                    {!ot.sinEstimar && plan.jornadas !== ot.jornadas ? ` · Comercial estimó ${ot.jornadas}` : ""}
                  </span>
                ) : (
                  !ot.sinEstimar && <span className="block text-xs text-muted-foreground">Estimado de Comercial</span>
                )}
                {/* Lo ejecutado sólo cuando hay algo: "0 días · 0 h" en una obra que no
                    empezó es ruido. CUÁNDO se ejecutó, no sólo cuánto: para planificar un
                    desarme, saber que el armado corrió de febrero a julio es la mitad. */}
                {ot.diasObra > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    Ejecutado: {ot.diasObra} día{ot.diasObra === 1 ? "" : "s"} · {ot.horasHombre} h hombre
                    {detalle?.desvio ? ` · ${detalle.desvio} vs estimado` : ""}
                  </span>
                )}
                {/* "Sin partes" es lo que Odoo pone cuando no hay período: no dice nada. */}
                {detalle?.periodo && !/^sin partes$/i.test(detalle.periodo.trim()) && (
                  <span className="block text-xs text-muted-foreground">{detalle.periodo}</span>
                )}
                {detalle?.duracionSugerida && (
                  <SugerenciaDuracion
                    texto={detalle.duracionSugerida}
                    actual={ot.sinEstimar && !plan ? null : duracion}
                    onUsar={pendiente && !desdeLaGrilla ? onDuracion : null}
                  />
                )}
              </Dato>

              {/* La cuadrilla que ya venía sugerida, sólo cuando aporta algo: si el bloque
                  ya está en esa misma cuadrilla, repetirlo es ruido. */}
              {cuadrillaPrevista && cuadrillaPrevista !== cuadrillaNombre && (
                <Dato etiqueta="Cuadrilla prevista">
                  {cuadrillaPrevista}
                  {bloque && (
                    <span className="block text-xs text-muted-foreground">
                      En el tablero está en {cuadrillaNombre ?? "otra cuadrilla"}.
                    </span>
                  )}
                </Dato>
              )}
            </dl>
          </Seccion>

          {/* ── A quién recurrir ── */}
          <Seccion titulo="Contactos">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">En obra</p>
              {/* El contacto de la OT manda. Cuando no está —el 88% de los casos— se cae al
                  teléfono de la ficha de obra del cliente, que es al que se llama igual, y
                  se aclara de dónde salió. */}
              {(ot.contactoObra || telObra) && (
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">
                      {ot.contactoObra ?? (ot.telObra ? "Teléfono de la obra" : "Según la ficha del cliente")}
                    </span>
                    {telObra && <span className="block text-xs text-muted-foreground">{telObra}</span>}
                  </p>
                  {telObra && <Llamar telefono={telObra} />}
                </div>
              )}
              {/* LA GENTE DE LA OBRA: el encargado, la arquitecta, el que abre el portón. Es
                  de la OBRA y no de esta OT: queda en la orden de venta y la próxima orden
                  de trabajo de la misma obra ya los trae. */}
              <ContactosDeObra
                otId={ot.id}
                ventaId={detalle?.ventaId ?? null}
                contactos={detalle?.contactosObra ?? []}
              />
              {direccion && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Abrir en Maps
                </a>
              )}
              {/* Cómo se reconoce el lugar desde la calle: lo que la cuadrilla busca al llegar. */}
              {detalle?.referenciaObra && <p className="text-[13px] font-medium">{detalle.referenciaObra}</p>}
            </div>

            {/* TÉCNICO Y VENDEDOR como contactos y no como datos de la venta: para
                Operaciones son a quién preguntarle cuando algo de la obra no cierra. */}
            {(tecnico || detalle?.vendedor) && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">En ABA</p>
                {tecnico && (
                  <p className="text-sm">
                    <span className="font-medium">{tecnico}</span>
                    <span className="text-muted-foreground"> · Técnico</span>
                  </p>
                )}
                {detalle?.vendedor && (
                  <p className="text-sm">
                    <span className="font-medium">{detalle.vendedor}</span>
                    <span className="text-muted-foreground"> · Ventas</span>
                  </p>
                )}
              </div>
            )}
          </Seccion>

          {/* Por qué está como está: movimientos y confirmaciones en una sola línea de tiempo. */}
          <HistoriaOt otId={ot.id} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
