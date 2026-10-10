import Link from "next/link";
import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { CodigoResuelto } from "@/lib/panol/tipos";

// /p/<código>: lo que abre un QR del pañol escaneado con la cámara del celular
// (docs/panol/modulo.md §4). El QR no dice nada por sí mismo: pan_resolver_codigo lo traduce
// y de acá se salta a la pantalla que corresponde. Vive bajo el layout del dashboard, así
// que pide login como el resto; el proxy lo deja pasar sólo con el módulo Pañol (/p está en
// sus rutas, ver lib/auth/acceso.ts).
//
// Server component a propósito: resuelve y redirige antes de pintar nada, sin un salto
// intermedio en blanco. El escáner de la app NO pasa por acá: procesa el código en el lugar.

export const dynamic = "force-dynamic";

function destino(r: CodigoResuelto): string | null {
  switch (r.tipo) {
    case "ubicacion":
      return `/deposito/panol/stock?ubicacion=${r.id}`;
    case "unidad":
      return `/deposito/panol/herramientas/${r.id}`;
    case "persona":
      return `/deposito/panol/afuera?titular=${encodeURIComponent(`p:${r.id}`)}`;
    case "externa":
      return `/deposito/panol/afuera?titular=${encodeURIComponent(`x:${r.id}`)}`;
    case "articulo":
      return `/deposito/panol/stock/${r.id}`;
    default:
      return null;
  }
}

export default async function ResolverCodigoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const texto = decodeURIComponent(codigo).trim().toUpperCase();

  const db = await createClient();
  const { data, error } = await db.rpc("pan_resolver_codigo", { p_codigo: texto });
  const r = (data ?? null) as CodigoResuelto | null;
  const ir = r && !error ? destino(r) : null;
  // redirect() tira una excepción que Next ataja: va afuera de cualquier try.
  if (ir) redirect(ir);

  const anulado = r?.tipo === "anulado";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <QrCode aria-hidden className="size-12 text-muted-foreground/60" />
      <h1 className="text-xl font-bold">
        {error ? "No se pudo leer el código" : anulado ? "Esta etiqueta está anulada" : "No conozco este código"}
      </h1>
      <p className="text-[14px] text-foreground/80">
        {error
          ? `${error.message}. Probá de nuevo en un rato.`
          : anulado
            ? `El código ${texto} se reemplazó por uno nuevo cuando se reimprimió la etiqueta. Si la ves pegada en algo, avisale a un encargado del pañol para que la cambie.`
            : `${texto} no es un código del pañol. Fijate que la etiqueta no esté dañada, o buscá el artículo a mano.`}
      </p>
      <div className="flex flex-wrap justify-center gap-4 text-[14px]">
        <Link href="/deposito/panol/stock" className="underline underline-offset-2">Buscar en el stock</Link>
        <Link href="/deposito/panol/herramientas" className="underline underline-offset-2">Ver herramientas</Link>
      </div>
    </div>
  );
}
