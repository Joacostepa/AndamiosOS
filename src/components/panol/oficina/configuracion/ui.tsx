import { cn } from "@/lib/utils";

// Piezas de la pantalla de Configuración del pañol.

/** Una sección: título, una línea que explica para qué es y, a la derecha, su acción. */
export function Seccion({
  id, titulo, ayuda, accion, children, className,
}: {
  id: string;
  titulo: React.ReactNode;
  ayuda?: React.ReactNode;
  accion?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("scroll-mt-4 overflow-hidden rounded-md border bg-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 max-w-2xl">
          <h2 id={id} className="text-[15px] font-semibold">{titulo}</h2>
          {ayuda && <p className="mt-0.5 text-[13px] text-muted-foreground">{ayuda}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

export function Cuenta({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 align-middle font-mono text-[12px] font-medium text-muted-foreground">{n}</span>;
}

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

export const SELECT = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
