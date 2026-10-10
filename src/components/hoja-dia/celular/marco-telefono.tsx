import type { ReactNode } from "react";
import s from "./celular.module.css";

// Un marco de teléfono (360 × 680) para la vista previa del escritorio: "Ver como Ortega".
//   <MarcoTelefono><VistaCelular vista={vista} preview /></MarcoTelefono>

export function MarcoTelefono({ children, className, etiqueta = "Vista previa en el celular" }: { children: ReactNode; className?: string; etiqueta?: string }) {
  return (
    <div className={[s.marco, className].filter(Boolean).join(" ")} role="region" aria-label={etiqueta}>
      <div className={s.marcoPantalla}>{children}</div>
    </div>
  );
}
