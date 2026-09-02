"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useAlertas, useMarkAlertaRead, type Alerta } from "@/hooks/use-alertas";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { PRIORIDAD_PUNTO, IconoAlerta } from "@/components/alertas/presentacion";
import { cn } from "@/lib/utils";

// La campanita del header, con la lista adentro.
//
// POR QUÉ UN POPOVER Y NO UN ENLACE A /alertas: el aviso interrumpe. Si para ver qué
// decía hay que abandonar la pantalla en la que se estaba —el tablero a medio armar, un
// parte a medio cargar— la campanita cuesta más de lo que avisa, y la respuesta racional
// es no tocarla. Acá se lee de un vistazo y se sigue trabajando; el que quiera ir a la
// obra hace clic en el aviso, que es una decisión aparte.
//
// La página /alertas SIGUE EXISTIENDO y el pie lleva a ella: es donde están las leídas y
// el historial completo. El popover muestra las últimas y nada más.

/** Cuántas entran sin volver el popover una pantalla. El resto está en /alertas. */
const VISIBLES = 6;

export function Campanita() {
  const [abierto, setAbierto] = useState(false);
  const { data, isLoading } = useAlertas();
  const markRead = useMarkAlertaRead();
  const router = useRouter();

  const alertas = data?.alertas ?? [];
  const sinLeer = data?.sinLeer ?? 0;

  // Las sin leer primero: son la novedad. Debajo, las últimas leídas, para que abrir la
  // campanita después de haberlas leído no muestre un cartel de vacío que hace dudar de
  // si el aviso existió.
  const ordenadas = [...alertas].sort((a, b) => Number(a.leida) - Number(b.leida));
  const visibles = ordenadas.slice(0, VISIBLES);

  function abrir(alerta: Alerta) {
    if (!alerta.leida) markRead.mutate(alerta.id);
    setAbierto(false);
    if (alerta.enlace) router.push(alerta.enlace);
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Alertas" />
        }
      >
        <Bell className="h-4 w-4" />
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <p className="text-[12px] font-semibold">Alertas</p>
            <p className="text-[10px] text-muted-foreground">
              {sinLeer > 0
                ? `${sinLeer} sin leer`
                : alertas.length > 0
                  ? "Todo leído"
                  : "Nada por ahora"}
            </p>
          </div>
          {sinLeer > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() =>
                markRead.mutate(alertas.filter((a) => !a.leida).map((a) => a.id))
              }
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Marcar todas
            </Button>
          )}
        </header>

        <ul className="max-h-96 overflow-y-auto">
          {isLoading && (
            <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              Cargando…
            </li>
          )}

          {!isLoading && visibles.length === 0 && (
            <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              Sin alertas. Acá van a aparecer las OTs nuevas, las que se habilitan y las
              que alguien marque urgentes.
            </li>
          )}

          {visibles.map((a) => (
            <UnaAlerta key={a.id} alerta={a} onAbrir={() => abrir(a)} />
          ))}
        </ul>

        <div className="border-t px-3 py-2">
          <Link
            href="/alertas"
            onClick={() => setAbierto(false)}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            Ver todas las alertas
            {alertas.length > VISIBLES && ` (${alertas.length})`}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UnaAlerta({ alerta, onAbrir }: { alerta: Alerta; onAbrir: () => void }) {
  return (
    <li>
      {/* Un botón y no un enlace: navegar es sólo una de las dos cosas que pasan al hacer
          clic —la otra es marcarla leída— y hay avisos sin enlace, donde un <a> sin href
          no sería accionable. */}
      <button
        type="button"
        onClick={onAbrir}
        className={cn(
          "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
          !alerta.leida && "bg-primary/5",
        )}
      >
        <span className="relative mt-0.5 shrink-0 text-muted-foreground">
          <IconoAlerta tipo={alerta.tipo} className="h-4 w-4" />
          {!alerta.leida && (
            <span
              className={cn(
                "absolute -top-1 -left-1 h-1.5 w-1.5 rounded-full",
                PRIORIDAD_PUNTO[alerta.prioridad] ?? "bg-muted-foreground",
              )}
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[12px] leading-snug",
              alerta.leida ? "text-muted-foreground" : "font-medium",
            )}
          >
            {alerta.titulo}
          </span>
          {alerta.descripcion && (
            <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">
              {alerta.descripcion}
            </span>
          )}
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {formatRelativeDate(alerta.created_at)}
          </span>
        </span>
      </button>
    </li>
  );
}
