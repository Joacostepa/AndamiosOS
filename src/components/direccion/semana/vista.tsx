"use client";

// La semana (/direccion, diseno.md §4 y maqueta renderSemana): ¿cómo estamos y qué hay que
// decidir? Escritorio: arriba la narrativa (60 %) y "Para decidir" compacto (40 %); debajo
// las tarjetas; Calidad al final. Celular: narrativa colapsada, Para decidir (una línea por
// tema, abre hoja), tarjetas compactas y Calidad en una fila.
// Acciones propias: Compartir (texto sin nada de socios) y ▶ Reunión.
// Todo llega del servidor ya recortado (lo de socios sólo a quien tiene direccion-socios).

import { useState } from "react";
import { Play, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { textoCompartir } from "@/lib/direccion/calculo/narrativa";
import { NOMBRE_AREA, type DetalleSemana } from "@/lib/direccion/calculo/semana-armar";
import { hoyBA } from "@/lib/direccion/formato";
import type { ResultadoPantalla } from "@/lib/direccion/tipos";
import { useFormato } from "../contexto";
import { PanelCalidad } from "./calidad";
import { ListaDecisiones } from "./decisiones";
import { Narrativa } from "./narrativa";
import { PropiosProvider, type PropiosSemana } from "./propios";
import { ModoReunion } from "./reunion";
import { TarjetasSemana } from "./tarjetas-semana";

const ID_DECISIONES = "para-decidir";

function Acciones({ resultado, onReunion }: { resultado: ResultadoPantalla<DetalleSemana>; onReunion: () => void }) {
  const f = useFormato();
  async function compartir() {
    const url = `${window.location.origin}/direccion`;
    // Nunca lleva nada de socios, aunque quien comparte tenga el permiso (textoCompartir saca el pie).
    const texto = textoCompartir(resultado.oraciones ?? [], f.ctx, hoyBA(), url);
    if (typeof navigator.share === "function" && window.matchMedia("(max-width: 767px)").matches) {
      try {
        await navigator.share({ text: texto });
        return;
      } catch {
        /* cancelado: probamos copiar */
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      toast("Link y resumen copiados", { description: "Sin datos de Socios, aunque tengas el permiso." });
    } catch {
      toast("No se pudo copiar", { description: texto.slice(0, 120) });
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" onClick={compartir} className="max-md:size-11 max-md:p-0" aria-label="Compartir por WhatsApp o mail">
        <Share2 aria-hidden /> <span className="max-md:sr-only">Compartir</span>
      </Button>
      <Button size="sm" onClick={onReunion} className="max-md:hidden">
        <Play aria-hidden /> Reunión
      </Button>
    </div>
  );
}

export function VistaSemana({ resultado, propios }: { resultado: ResultadoPantalla<DetalleSemana>; propios: PropiosSemana }) {
  const [reunion, setReunion] = useState(false);
  const d = resultado.detalle;
  const decisiones = resultado.decisiones ?? [];
  const oraciones = resultado.oraciones ?? [];

  return (
    <PropiosProvider inicial={propios} autor="Vos">
      <Acciones resultado={resultado} onReunion={() => setReunion(true)} />

      {(d.faltan ?? []).filter((x) => x.pantalla !== "socios").length > 0 && (
        <div role="status" className="rounded-lg border border-(--tb-ambar-borde) bg-(--dir-aten-bg) px-3 py-2 text-[13px] text-(--dir-aten)">
          No pudimos leer {(d.faltan ?? []).filter((x) => x.pantalla !== "socios").map((x) => NOMBRE_AREA[x.pantalla]).join(", ")}: esas cifras dicen “Sin dato” con el motivo.
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3 min-[1100px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Narrativa oraciones={oraciones} decisiones={decisiones.length} idDecisiones={ID_DECISIONES} />
        <ListaDecisiones decisiones={decisiones} id={ID_DECISIONES} />
      </div>

      <TarjetasSemana cifras={resultado.cifras} detalle={d} metas={propios.metas} />

      <PanelCalidad avisos={resultado.avisos} tomadoAt={resultado.lectura.tomadoAt} />

      {reunion && <ModoReunion oraciones={oraciones} cifras={resultado.cifras} detalle={d} decisiones={decisiones} onSalir={() => setReunion(false)} />}
    </PropiosProvider>
  );
}
