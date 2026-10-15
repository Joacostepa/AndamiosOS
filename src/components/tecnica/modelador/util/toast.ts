"use client";

// Toasts del modelador abajo al centro, sobre el lienzo 3D: abajo a la derecha tapaban el panel de
// Propiedades (justo donde se trabaja). Misma API que sonner.

import { toast as base, type ExternalToast } from "sonner";

const P: ExternalToast = { position: "bottom-center" };
type Msg = Parameters<typeof base>[0];

export const toast = Object.assign((m: Msg, o?: ExternalToast) => base(m, { ...P, ...o }), {
  success: (m: Msg, o?: ExternalToast) => base.success(m, { ...P, ...o }),
  error: (m: Msg, o?: ExternalToast) => base.error(m, { ...P, ...o }),
  info: (m: Msg, o?: ExternalToast) => base.info(m, { ...P, ...o }),
  warning: (m: Msg, o?: ExternalToast) => base.warning(m, { ...P, ...o }),
  dismiss: base.dismiss,
});
