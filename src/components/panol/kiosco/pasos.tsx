"use client";

// Pasos que se repiten entre flujos: elegir de una lista (estante o "No tiene código"),
// la cantidad (con talle si corresponde) y "Me llevo algo que no está".

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  botonCaja, normalizarNombre, numero, quedariaNegativo, rutaDeUbicacion, stockEnPanol,
} from "@/lib/panol/kiosco";
import type { Articulo } from "@/lib/panol/tipos";
import type { DatosKiosco } from "@/hooks/use-panol-kiosco";
import { subirFotoPanol } from "@/hooks/use-panol-kiosco";
import { Aviso, BotonFoto, BotonPrimario, BotonVolver, Buscador, Cantidad, Pantalla, Titulo } from "./ui";

export type Elegido = { articulo: Articulo; varianteId: string | null; nombreTalle: string | null; cantidad: number; ubicacionId: string | null };

/** "Precintos 300mm · talle 9". */
export const nombreConTalle = (a: Pick<Articulo, "nombre">, talle: string | null) => (talle ? `${a.nombre} · talle ${talle}` : a.nombre);

export function PasoCantidad({ datos, articulo, ubicacionId, pregunta, accion, onListo, onVolver, volverTexto = "Otro artículo", avisarNegativo = true, maximo }: {
  datos: DatosKiosco;
  articulo: Articulo;
  ubicacionId: string | null;
  pregunta: string;
  accion: string;
  onListo: (e: Elegido) => void;
  onVolver: () => void;
  volverTexto?: string;
  avisarNegativo?: boolean;
  /** Vuelta de cuadrilla: no se devuelve más de lo que tiene. */
  maximo?: number;
}) {
  const talles = articulo.tiene_talles ? datos.cat.variantes.filter((v) => v.articulo_id === articulo.id) : [];
  const [varianteId, setVarianteId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const faltaTalle = talles.length > 0 && !varianteId;
  const stock = stockEnPanol(datos.cat.saldos, articulo.id, talles.length ? varianteId : undefined);
  const lugar = rutaDeUbicacion(datos.cat.ubicaciones, ubicacionId ?? articulo.ubicacion_id);
  const talle = talles.find((t) => t.id === varianteId)?.nombre ?? null;

  return (
    <Pantalla>
      <BotonVolver onClick={onVolver}>{volverTexto}</BotonVolver>
      <div>
        <h1 className="text-3xl font-bold leading-tight">{nombreConTalle(articulo, talle)}</h1>
        {lugar && <p className="mt-1 text-lg text-muted-foreground">{lugar}</p>}
        {maximo === undefined && <p className="mt-1 text-lg font-semibold">Quedan {numero(stock)} {articulo.unidad}</p>}
        {maximo !== undefined && <p className="mt-1 text-lg font-semibold">La cuadrilla tiene {numero(maximo)} {articulo.unidad}</p>}
      </div>

      {talles.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">¿Qué talle?</h2>
          <div className="grid grid-cols-3 gap-2">
            {talles.map((t) => {
              const sel = t.id === varianteId;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => setVarianteId(t.id)}
                  className={cn("flex min-h-16 flex-col items-center justify-center rounded-xl", sel ? "border-[3px] border-foreground bg-muted" : "border-2 border-input bg-card")}
                >
                  <span className="text-2xl font-bold">{t.nombre}</span>
                  <span className="text-sm text-muted-foreground">quedan {numero(stockEnPanol(datos.cat.saldos, articulo.id, t.id))}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{pregunta}</h2>
        <Cantidad valor={cantidad} onChange={setCantidad} unidad={articulo.unidad} caja={botonCaja(articulo)} maximo={maximo} />
      </section>

      {avisarNegativo && !faltaTalle && quedariaNegativo(stock, cantidad) && (
        <Aviso>Es más de lo que figura. Podés llevarlo igual: lo revisan los encargados del pañol.</Aviso>
      )}

      <BotonPrimario
        disabled={faltaTalle}
        onClick={() => onListo({ articulo, varianteId, nombreTalle: talle, cantidad, ubicacionId })}
        className="mt-auto"
      >
        {faltaTalle ? "Elegí el talle" : accion}
      </BotonPrimario>
    </Pantalla>
  );
}

/** Lo que hay en un estante, o todo el catálogo ("No tiene código"), con buscador. */
export function PasoLista({ datos, titulo, sub, articulos, onElegir, onVolver, sinStock = false }: {
  datos: DatosKiosco;
  titulo: string;
  sub: string;
  articulos: Articulo[];
  onElegir: (a: Articulo) => void;
  onVolver: () => void;
  /** Vuelta de cuadrilla: no tiene sentido mostrar "quedan". */
  sinStock?: boolean;
}) {
  const [q, setQ] = useState("");
  const f = normalizarNombre(q);
  const lista = articulos.filter((a) => !f || normalizarNombre(a.nombre).includes(f)).slice(0, 60);
  return (
    <Pantalla>
      <BotonVolver onClick={onVolver}>Volver a escanear</BotonVolver>
      <Titulo sub={sub}>{titulo}</Titulo>
      <Buscador valor={q} onChange={setQ} etiqueta="Buscar por nombre" autoFocus={articulos.length > 8} />
      <ul className="flex flex-col gap-2">
        {lista.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onElegir(a)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-input bg-card px-4 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold leading-snug">{a.nombre}</span>
                {!sinStock && (
                  <span className="block text-base text-muted-foreground">
                    Quedan {numero(stockEnPanol(datos.cat.saldos, a.id))} {a.unidad}
                  </span>
                )}
              </span>
              <ArrowLeft className="size-5 rotate-180 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {lista.length === 0 && <p className="text-lg text-muted-foreground">{q ? `No hay nada con «${q}».` : "No hay nada para mostrar."}</p>}
    </Pantalla>
  );
}

/**
 * "Me llevo algo que no está": nunca hay que llevarse algo sin registrarlo (docs §4). Se
 * registra a nombre de quien se lo lleva y cae en la bandeja para darle de alta.
 */
export function PasoSinAlta({ idVale, obraTexto, onListo, onVolver }: {
  idVale: string;
  obraTexto: string;
  onListo: (l: { descripcion: string; cantidad: number; fotoPath?: string }) => void;
  onVolver: () => void;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [foto, setFoto] = useState<string | undefined>();
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  return (
    <Pantalla>
      <BotonVolver onClick={onVolver}>Volver a escanear</BotonVolver>
      <Titulo sub="Contanos qué es y cuánto. Nunca te lleves algo sin registrarlo.">Me llevo algo que no está</Titulo>
      <label className="flex flex-col gap-2">
        <span className="text-xl font-bold">¿Qué te llevás?</span>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Ej.: cinta doble faz, rollo azul"
          className="rounded-xl border-2 border-input bg-background p-4 text-lg outline-none focus-visible:border-ring"
        />
      </label>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">¿Cuántos?</h2>
        <Cantidad valor={cantidad} onChange={setCantidad} unidad="u." />
      </section>
      <BotonFoto
        lista={!!foto}
        subiendo={subiendo}
        onArchivo={async (f) => {
          setSubiendo(true);
          setErrorFoto(null);
          try {
            setFoto(await subirFotoPanol(f, "sin-alta", idVale));
          } catch {
            setErrorFoto("No se pudo subir la foto. Seguí sin foto.");
          } finally {
            setSubiendo(false);
          }
        }}
      />
      {errorFoto && <Aviso>{errorFoto}</Aviso>}
      <p className="text-base text-muted-foreground">Se registra igual, a tu nombre y para {obraTexto}. Los encargados lo van a dar de alta.</p>
      <BotonPrimario disabled={!descripcion.trim() || subiendo} onClick={() => onListo({ descripcion: descripcion.trim(), cantidad, fotoPath: foto })} className="mt-auto">
        Registrar y llevármelo
      </BotonPrimario>
    </Pantalla>
  );
}
