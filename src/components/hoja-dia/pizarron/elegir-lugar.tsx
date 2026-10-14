"use client";

// "¿Adónde va?" (maqueta: el ubicador de una parada y del pedido): el depósito, las obras del
// día, los lugares frecuentes y "otra dirección". La otra dirección se ubica en el mapa
// mientras se escribe (F4, /api/hoja-dia/geocodificar con pausa y caché): si Google la
// encuentra, el punto lleva sus coordenadas (pin en el mini-mapa, tiempos de Google y el
// desvío de "¿Quién pasa cerca?"); si no, se usa el texto tal cual, como antes.
// Lo usan el Recorrido (una parada) y el panel de pedidos (nuevo y corregir).

import { useMemo, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import type { DiaHoja, Punto } from "@/lib/hoja-dia/tipos";
import { lugaresParaElegir } from "@/lib/hoja-dia/recorrido";
import { useGeocodificar } from "@/hooks/use-hoja-dia";
import { ItemMenu, MenuFlotante } from "@/components/hoja-dia/comunes/menu-flotante";

/** El texto de una otra dirección según lo que contestó el mapa. */
export function detalleGeo(buscando: boolean, geo: ReturnType<typeof useGeocodificar>["geo"]): string {
  if (buscando) return "buscando en el mapa…";
  if (!geo) return "otra dirección";
  return geo.ok ? "ubicada en el mapa" : geo.estado === "fuera_del_amba" ? "queda lejos: va sin ubicar" : "no está en el mapa: va como texto";
}

export function ElegirLugar({ dia, anchor, onCerrar, onElegir, titulo = "¿Adónde va?", label = "Lugar" }: {
  dia: DiaHoja;
  anchor: HTMLElement;
  onCerrar: () => void;
  onElegir: (p: Punto) => void;
  titulo?: string;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const res = useMemo(() => lugaresParaElegir(dia, q), [dia, q]);
  const otra = res.find((x) => x.key === "t") ?? null;
  const { geo, buscando } = useGeocodificar(otra ? q : "");
  const conGeo = (p: Punto): Punto => (p.texto && !p.otId && !p.lugarId && geo?.ok ? { ...p, lat: geo.lat, lng: geo.lng } : p);
  return (
    <MenuFlotante anchor={anchor} onCerrar={onCerrar} label={label} ancho={320} encabezado={<b className="font-semibold">{titulo}</b>}>
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <Search className="size-4 text-muted-foreground" />
        <input
          autoFocus
          data-mi=""
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && res[0]) { e.preventDefault(); onElegir(conGeo(res[0].punto)); } }}
          placeholder="Obra, lugar o dirección"
          aria-label="Buscar el lugar"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px]"
        />
      </div>
      {res.map((x) => (
        <ItemMenu key={x.key} detalle={x.grupo === "texto" ? detalleGeo(buscando, geo) : x.grupo} onClick={() => onElegir(conGeo(x.punto))}>
          <span className="flex min-w-0 items-center gap-1.5">
            {x.tag ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded bg-muted px-1 font-mono text-[11px] font-bold">{x.tag}</span>
              : x.grupo === "texto" ? (buscando ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <MapPin className={geo?.ok ? "size-4 shrink-0 text-hd-verde" : "size-4 shrink-0"} />)
              : <span className="size-4 shrink-0" aria-hidden />}
            <span className="min-w-0 truncate">{x.n}{x.sub && x.grupo !== "texto" && <small className="block truncate text-xs text-muted-foreground">{x.sub}</small>}</span>
          </span>
        </ItemMenu>
      ))}
      {!res.length && <div className="px-2 py-2 text-xs text-muted-foreground">No hay nada con «{q}». Escribí al menos 3 letras para usarlo como dirección.</div>}
    </MenuFlotante>
  );
}
