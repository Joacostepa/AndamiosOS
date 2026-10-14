// El dibujo de cada vehículo de la flota, de costado y mirando a la derecha (pedido del dueño,
// 12/10: "que los íconos sean reales"). Trazo como los de lucide (currentColor, 1.7), pero
// más anchos que altos (32 × 20) para que se lea la forma: la caja abierta atrás, la cabina
// doble o simple adelante, la hidrogrúa plegada sobre la caja.

import type { FormaVehiculo } from "@/lib/hoja-dia/pizarron";
import { cn } from "@/lib/utils";

const DIBUJOS: Record<FormaVehiculo, React.ReactNode> = {
  // Iveco: doble cabina (dos ventanillas) y caja abierta.
  camion: (
    <>
      <path d="M1 8h14.5v5.5H1z" />
      <path d="M5.5 8v5.5M10 8v5.5" />
      <path d="M17 13.5V4.5h9l4 4.5v4.5" />
      <path d="M18.5 6h3v3h-3zM23 6h2.6l2.4 3H23z" />
      <path d="M1 13.5h29" />
      <circle cx="6" cy="16" r="2.3" />
      <circle cx="24.5" cy="16" r="2.3" />
    </>
  ),
  // Agrale: cabina simple, caja abierta y la hidrogrúa detrás de la cabina, plegada sobre la caja.
  hidrogrua: (
    <>
      <path d="M1 9h16v4.5H1z" />
      <path d="M6.5 9v4.5M12 9v4.5" />
      <path d="M18.5 13.5V3" />
      <path d="M18.5 3 4 1.5" />
      <path d="M4 1.5v4" />
      <path d="M21 13.5V5h5l4 4v4.5" />
      <path d="M22.5 6.5h3l2 2.5h-5z" />
      <path d="M1 13.5h29" />
      <circle cx="6" cy="16" r="2.3" />
      <circle cx="25" cy="16" r="2.3" />
    </>
  ),
  // S10: pickup doble cabina, más baja, con la caja chica atrás.
  pickup: (
    <>
      <path d="M1.5 13.5V9.5H12" />
      <path d="M12 13.5V9.5l2-4h8l3.5 4H30q1.2 0 1.2 1.5v2.5" />
      <path d="M15 7h3v2.5h-4.2zM19.5 7h2l2 2.5h-4z" />
      <path d="M1.5 13.5h29.7" />
      <circle cx="7" cy="15.5" r="2.3" />
      <circle cx="25" cy="15.5" r="2.3" />
    </>
  ),
  moto: (
    <>
      <circle cx="6" cy="14" r="3.5" />
      <circle cx="26" cy="14" r="3.5" />
      <path d="M6 14l5-6h9l6 6" />
      <path d="M10.5 6.5h7" />
      <path d="M20 8l2.5-4.5h3" />
    </>
  ),
  // Clark: mástil con las uñas adelante (a la derecha), la protección del conductor y el contrapeso.
  autoelevador: (
    <>
      <path d="M26 2.5V16M26 15.5h5" />
      <path d="M23 13.5V9l-3-5.5h-8V13.5" />
      <path d="M8 13.5V9h4" />
      <path d="M8 13.5h15" />
      <circle cx="11.5" cy="16" r="2.2" />
      <circle cx="21" cy="16" r="2.2" />
    </>
  ),
  otro: (
    <>
      <path d="M2 14V6h18v8M20 9h6l4 3v2" />
      <path d="M2 14h28" />
      <circle cx="8" cy="16" r="2.3" />
      <circle cx="24" cy="16" r="2.3" />
    </>
  ),
};

const NOMBRES: Record<FormaVehiculo, string> = {
  camion: "Camión doble cabina con caja", hidrogrua: "Camión con hidrogrúa", pickup: "Pickup doble cabina", moto: "Moto", autoelevador: "Autoelevador", otro: "Vehículo",
};

export function IconoVehiculo({ forma, className, style }: { forma: FormaVehiculo; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 32 19"
      role="img"
      aria-label={NOMBRES[forma]}
      className={cn("h-[18px] w-auto shrink-0 fill-none stroke-current", className)}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <title>{NOMBRES[forma]}</title>
      {DIBUJOS[forma]}
    </svg>
  );
}
